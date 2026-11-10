"""CapCut-style video renderer: scene images + Ken Burns effects + subtitles + audio -> MP4.

Supports Cloudinary free tier when CLOUDINARY_URL is configured, with automatic
fallback to the bundled FFmpeg binary from imageio-ffmpeg.

All on-video text (subtitles, titles, overlays) is burned in through libass with complex
shaping so Kannada and other Indic conjuncts render correctly.
"""
import hashlib
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Callable, Dict, Iterator, List, Optional, Tuple

import requests
from PIL import Image, ImageDraw, ImageFilter, ImageOps

from backend.app import config, storage
from backend.app.media.audio import AudioError, ffmpeg_exe
from backend.app.media.subtitles import cues_for_span, strip_tags, to_ass
from backend.app.models import Project, Scene, TimelineCue
from backend.app.render import media_url, project_dir

ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
MAX_IMAGE_BYTES = 25 * 1024 * 1024
FPS = 25
SUB_FONT = os.getenv("VIDEO_SUB_FONT") or ("Nirmala UI" if os.name == "nt" else "Noto Sans Kannada")

EMOTION_RGB: Dict[str, Tuple[int, int, int]] = {
    "neutral": (100, 116, 139),
    "mystery": (124, 58, 237),
    "suspense": (217, 119, 6),
    "fear": (225, 29, 72),
    "sadness": (37, 99, 235),
    "joy": (22, 163, 74),
    "excitement": (234, 88, 12),
    "shock": (220, 38, 38),
    "whisper": (79, 70, 229),
    "reflection": (13, 148, 136),
}

Span = Tuple[Scene, int, int, List[TimelineCue]]


def _safe_id(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "", value) or "scene"


def save_scene_image(project_id: str, scene_id: str, filename: str, data: bytes) -> Path:
    if not data:
        raise ValueError("Uploaded image is empty.")
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError("Image is larger than 25 MB.")
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_IMAGE_EXT:
        raise ValueError(f"Unsupported image format '{ext or '?'}'. Use JPG, PNG, WebP, or GIF.")
    delete_scene_image(project_id, scene_id)
    dst = project_dir(project_id) / f"{_safe_id(scene_id)}_img{ext}"
    dst.write_bytes(data)
    return dst


def delete_scene_image(project_id: str, scene_id: str) -> None:
    d = project_dir(project_id)
    prefix = f"{_safe_id(scene_id)}_img"
    for p in d.glob(f"{prefix}.*"):
        p.unlink(missing_ok=True)


def scene_image_path(project_id: str, scene: Scene) -> Optional[Path]:
    d = project_dir(project_id)
    prefix = f"{_safe_id(scene.id)}_img"
    for ext in ALLOWED_IMAGE_EXT:
        p = d / f"{prefix}{ext}"
        if p.exists():
            return p
    return None


def aspect_dimensions(aspect: str) -> Tuple[int, int]:
    return (720, 1280) if aspect == "9:16" else (1280, 720)


def scene_spans(project: Project) -> List[Span]:
    """Return (scene, start_ms, end_ms, cues) covering the full episode timeline."""
    if not project.scenes:
        raise ValueError("Add at least one scene before exporting video.")
    by_scene = {t.scene_id: t for t in project.timeline}
    spans: List[Span] = []

    if project.timeline and project.episode_duration_ms > 0:
        entries = [t for t in project.timeline if any(s.id == t.scene_id for s in project.scenes)]
        scene_map = {s.id: s for s in project.scenes}
        for i, t in enumerate(entries):
            s = scene_map[t.scene_id]
            start_ms = 0 if i == 0 else t.start_ms
            end_ms = entries[i + 1].start_ms if i + 1 < len(entries) else max(t.end_ms, project.episode_duration_ms)
            if end_ms <= start_ms:
                end_ms = start_ms + 1000
            spans.append((s, start_ms, end_ms, t.cues))
        return spans

    cursor = 0
    for s in project.scenes:
        dur = s.audio_duration_ms if s.audio_duration_ms > 0 else 3500
        start_ms = cursor
        end_ms = cursor + max(1000, dur)
        t = by_scene.get(s.id)
        cues = t.cues if t else cues_for_span(s.text, start_ms, end_ms)
        spans.append((s, start_ms, end_ms, cues))
        cursor = end_ms
    return spans


def prepare_frame(scene: Scene, src: Optional[Path], dst: Path, size: Tuple[int, int]) -> Path:
    """Create a normalized WxH RGB PNG for a scene: image over a blurred backdrop, or an emotion-tinted card."""
    w, h = size
    accent = EMOTION_RGB.get(scene.emotion, (14, 165, 233))

    if src and src.exists():
        with Image.open(src) as raw:
            im = ImageOps.exif_transpose(raw).convert("RGB")
        bg = ImageOps.fit(im, (w, h), method=Image.Resampling.BILINEAR)
        bg = bg.filter(ImageFilter.GaussianBlur(radius=24))
        dark = Image.new("RGB", (w, h), (10, 15, 28))
        canvas = Image.blend(bg, dark, alpha=0.45)

        fg = im.copy()
        fg.thumbnail((w, h), Image.Resampling.LANCZOS)
        canvas.paste(fg, ((w - fg.width) // 2, (h - fg.height) // 2))
    else:
        canvas = Image.new("RGB", (w, h), (15, 23, 42))
        draw = ImageDraw.Draw(canvas)
        for y in range(h):
            t = y / max(1, h - 1)
            r = int(15 * (1 - t) + (accent[0] // 3) * t)
            g = int(23 * (1 - t) + (accent[1] // 3) * t)
            b = int(42 * (1 - t) + (accent[2] // 3) * t)
            draw.line([(0, y), (w, y)], fill=(r, g, b))

    dst.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dst, format="PNG")
    return dst


def _effect_vf(effect: str, frames: int, duration_s: float, width: int, height: int, fade: bool) -> str:
    d = max(12, frames)
    if effect == "zoom_out":
        zp = f"zoompan=z='if(eq(on,1),1.18,max(1.0,zoom-0.0016))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={d}:s={width}x{height}:fps={FPS}"
    elif effect == "pan_left":
        zp = f"zoompan=z='1.14':x='(iw-iw/zoom)*(1-on/{d})':y='(ih-ih/zoom)/2':d={d}:s={width}x{height}:fps={FPS}"
    elif effect == "pan_right":
        zp = f"zoompan=z='1.14':x='(iw-iw/zoom)*(on/{d})':y='(ih-ih/zoom)/2':d={d}:s={width}x{height}:fps={FPS}"
    elif effect == "none":
        zp = f"zoompan=z='1.0':x='0':y='0':d={d}:s={width}x{height}:fps={FPS}"
    else:  # zoom_in (default)
        zp = f"zoompan=z='min(zoom+0.0016,1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={d}:s={width}x{height}:fps={FPS}"

    chain = [zp]
    if fade and duration_s >= 0.8:
        fade_d = min(0.35, duration_s / 4.0)
        out_st = max(0.1, duration_s - fade_d)
        chain.append(f"fade=t=in:st=0:d={fade_d:.2f},fade=t=out:st={out_st:.2f}:d={fade_d:.2f}")
    chain.append("format=yuv420p")
    return ",".join(chain)


def _run_ffmpeg(args: List[str], cwd: Optional[Path] = None) -> None:
    proc = subprocess.run(
        [ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y", *args],
        cwd=str(cwd) if cwd else None,
        capture_output=True,
    )
    if proc.returncode != 0:
        raise AudioError(f"ffmpeg video render failed: {proc.stderr.decode(errors='ignore')[-500:]}")


def _upload_cloudinary(mp4_path: Path, project_id: str, creds: Tuple[str, str, str]) -> Optional[str]:
    """Upload rendered MP4 to Cloudinary free tier if credentials are set."""
    cloud_name, api_key, api_secret = creds
    timestamp = str(int(time.time()))
    public_id = f"vivarisu_{_safe_id(project_id)}"
    to_sign = f"overwrite=true&public_id={public_id}&timestamp={timestamp}{api_secret}"
    signature = hashlib.sha1(to_sign.encode("utf-8")).hexdigest()
    url = f"https://api.cloudinary.com/v1_1/{cloud_name}/video/upload"
    with mp4_path.open("rb") as fh:
        resp = requests.post(
            url,
            data={
                "api_key": api_key,
                "timestamp": timestamp,
                "public_id": public_id,
                "overwrite": "true",
                "signature": signature,
            },
            files={"file": (mp4_path.name, fh, "video/mp4")},
            timeout=120,
        )
    if resp.status_code == 200:
        return resp.json().get("secure_url")
    return None


def _overlays(spans: List[Span]) -> List[Tuple[int, int, str, str]]:
    """Burned-in titles: the chosen on-screen title, plus the scene title on image-less cards."""
    items: List[Tuple[int, int, str, str]] = []
    for scene, start_ms, end_ms, _ in spans:
        if scene.caption_overlay.strip():
            items.append((start_ms, end_ms, scene.caption_overlay.strip()[:80], "caption"))
    return items


def _render(project: Project, report: Callable[[str, int, int], None]) -> Project:
    """Render the project's scenes, images, subtitles, and audio into episode.mp4."""
    spans = scene_spans(project)
    size = aspect_dimensions(project.video_aspect)
    width, height = size
    pdir = project_dir(project.id)
    total = len(spans)
    report("Preparing scenes for video…", 0, total)

    with tempfile.TemporaryDirectory() as tmp_str:
        tmp = Path(tmp_str)
        clip_names: List[str] = []
        all_cues: List[TimelineCue] = []
        overlays = _overlays(spans)

        for i, (scene, start_ms, end_ms, cues) in enumerate(spans):
            report(f"Rendering scene {i + 1}/{total}: {scene.title or f'Scene {i + 1}'}", i, total)
            img = scene_image_path(project.id, scene)
            if img is None:
                overlays.append((start_ms, end_ms, scene.title or strip_tags(scene.text)[:48], "title"))
            dur_s = max(0.5, (end_ms - start_ms) / 1000.0)
            frames = max(12, round(dur_s * FPS))
            frame_png = prepare_frame(scene, img, tmp / f"frame_{i}.png", size)
            clip_name = f"clip_{i}.mp4"
            vf = _effect_vf(scene.image_effect, frames, dur_s, width, height, scene.image_fade)
            _run_ffmpeg(
                ["-i", frame_png.name, "-vf", vf, "-t", f"{dur_s:.3f}", "-r", str(FPS),
                 "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", clip_name],
                cwd=tmp,
            )
            clip_names.append(clip_name)
            all_cues.extend(cues)

        report("Adding narration audio and subtitles…", total, total)
        (tmp / "concat.txt").write_text("\n".join(f"file '{c}'" for c in clip_names), encoding="utf-8")
        _run_ffmpeg(["-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "joined.mp4"], cwd=tmp)

        ep_mp3 = pdir / "episode.mp3"
        burn_subs = project.burn_subtitles and len(all_cues) > 0
        mux_args: List[str] = ["-i", "joined.mp4"]
        if ep_mp3.exists():
            shutil.copy2(ep_mp3, tmp / "episode.mp3")
            mux_args += ["-i", "episode.mp3"]

        if burn_subs or overlays:
            (tmp / "text.ass").write_text(to_ass(all_cues, size, SUB_FONT, overlays, burn_subs), encoding="utf-8")
            mux_args += ["-vf", "ass=text.ass:shaping=complex", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"]
        else:
            mux_args += ["-c:v", "copy"]

        if ep_mp3.exists():
            mux_args += ["-c:a", "aac", "-b:a", "160k", "-shortest"]

        mux_args += ["-movflags", "+faststart", "episode.mp4"]
        _run_ffmpeg(mux_args, cwd=tmp)

        out_mp4 = pdir / "episode.mp4"
        shutil.copy2(tmp / "episode.mp4", out_mp4)

    provider = "ffmpeg"
    creds = config.cloudinary_creds()
    if creds:
        report("Uploading to Cloudinary…", total, total)
        try:
            if _upload_cloudinary(out_mp4, project.id, creds):
                provider = "cloudinary"
        except Exception:
            provider = "ffmpeg"

    project.video_url = media_url(out_mp4)
    project.video_provider = provider
    storage.save(project)
    return project


def render_video_sync(project: Project, on_step: Optional[Callable[[str, int, int], None]] = None) -> Project:
    return _render(project, on_step or (lambda *_: None))


def render_video_stream(project_id: str) -> Iterator[Dict]:
    """SSE generator for video rendering progress. Rendering runs in a worker thread so events stream live."""
    import queue
    import threading

    project = storage.require(project_id)
    events: "queue.Queue[Dict]" = queue.Queue()

    def report(message: str, done: int, total: int) -> None:
        events.put({"type": "stage", "stage": "assemble", "status": "running", "message": message, "done": done, "total": total})

    def work() -> None:
        try:
            events.put({"type": "done", "project": {**_render(project, report).model_dump(), "history": storage.history_depth(project.id)}})
        except Exception as e:
            events.put({"type": "error", "message": str(e)})

    threading.Thread(target=work, daemon=True).start()
    while True:
        ev = events.get()
        yield ev
        if ev["type"] in ("done", "error"):
            return


def _fmt_chapter_ts(ms: int) -> str:
    total_s = max(0, int(ms) // 1000)
    h, rem = divmod(total_s, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def build_publish_kit(project: Project) -> Dict:
    """Build YouTube title, description with chapters, tags, and LinkedIn/X challenge post."""
    spans = scene_spans(project) if project.scenes else []
    chapters = []
    for i, (scene, start_ms, _end_ms, _cues) in enumerate(spans):
        ts = "0:00" if i == 0 else _fmt_chapter_ts(start_ms)
        title = (scene.title or scene.beat or f"Scene {i + 1}").strip()
        chapters.append({"time": ts, "title": title})

    hook = strip_tags(project.scenes[0].text)[:240] if project.scenes else project.topic
    chapter_lines = "\n".join(f"{c['time']} {c['title']}" for c in chapters)
    voice_label = f"{project.voice_identity.name} (Cloned Voice)" if (project.use_cloned_voice and project.voice_identity) else project.voice

    yt_description = (
        f"{project.title}\n\n"
        f"{hook}\n\n"
        f"Chapters:\n{chapter_lines}\n\n"
        f"Narrated in {project.language} with {voice_label} using Vivarisu AI (ವಿವರಿಸು AI) — "
        f"powered by Gnani AI (Prisma v3.0 STT, Timbre v3.0 emotion-directed TTS, Voice Cloning) & Gemini.\n\n"
        f"#VivarisuAI #Kannada #GnaniAI #GreatIndianAIInternshipChallenge #MysteryExplainerKannada"
    ).strip()

    tags = [
        "Vivarisu AI",
        "Gnani AI",
        "GreatIndianAIInternshipChallenge",
        "Kannada",
        "Kannada Story Explainer",
        "Mystery Explainer Kannada",
        project.voice,
    ]

    social_post = (
        f"Built Vivarisu AI (ವಿವರಿಸು AI) — an AI story & video studio that turns a prompt or Kannada voice note into "
        f"an emotion-directed Kannada episode & MP4 video!\n\n"
        f"Episode: \"{project.title}\" ({len(project.scenes)} scenes)\n"
        f"• Gnani Prisma v3.0 for Kannada/code-mixed voice notes\n"
        f"• Gnani Timbre v3.0 with inline emotion tags (<whispers>, <pauses>, <excited>, <slow>)\n"
        f"• Gnani Voice Cloning (vachana-vc-v1) + Gemini scene direction & libass Kannada subtitle rendering\n\n"
        f"#GreatIndianAIInternshipChallenge #GnaniAI"
    )

    pdir = project_dir(project.id)
    return {
        "youtube_title": project.title,
        "youtube_description": yt_description,
        "tags": tags,
        "chapters": chapters,
        "social_post": social_post,
        "has_mp4": (pdir / "episode.mp4").exists(),
        "has_mp3": (pdir / "episode.mp3").exists(),
        "has_srt": (pdir / "episode.srt").exists(),
        "video_url": project.video_url,
        "audio_url": project.episode_audio_url,
        "srt_url": project.srt_url,
    }


def build_export_zip(project: Project) -> bytes:
    """Bundle MP4, MP3, SRT, scene images, and YouTube/social metadata into a single ZIP."""
    import io
    import zipfile

    kit = build_publish_kit(project)
    pdir = project_dir(project.id)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        meta_txt = (
            f"=== YOUTUBE TITLE ===\n{kit['youtube_title']}\n\n"
            f"=== YOUTUBE DESCRIPTION ===\n{kit['youtube_description']}\n\n"
            f"=== YOUTUBE TAGS ===\n{', '.join(kit['tags'])}\n\n"
            f"=== LINKEDIN / X POST ===\n{kit['social_post']}\n"
        )
        zf.writestr("youtube_and_social_metadata.txt", meta_txt.encode("utf-8"))
        for fname in ("episode.mp4", "episode.mp3", "episode.srt"):
            fpath = pdir / fname
            if fpath.exists():
                zf.write(fpath, arcname=fname)
        for i, s in enumerate(project.scenes, start=1):
            img = scene_image_path(project.id, s)
            if img and img.exists():
                zf.write(img, arcname=f"scenes/scene_{i:02d}{img.suffix.lower()}")
    return buf.getvalue()


def upload_to_youtube(project: Project, access_token: str, privacy: str = "unlisted") -> Dict:
    """Direct upload of episode.mp4 to YouTube Data API v3 using a Google OAuth2 access token."""
    import json as _json

    token = (access_token or os.getenv("GOOGLE_OAUTH_ACCESS_TOKEN", "")).strip()
    if not token:
        raise ValueError("Provide a Google OAuth access token (with youtube.upload scope) or use 1-Click YouTube Studio.")
    mp4 = project_dir(project.id) / "episode.mp4"
    if not mp4.exists():
        render_video_sync(project)
    kit = build_publish_kit(project)
    meta = {
        "snippet": {
            "title": kit["youtube_title"][:100],
            "description": kit["youtube_description"][:4900],
            "tags": kit["tags"],
            "categoryId": "24",  # Entertainment
            "defaultLanguage": project.language,
            "defaultAudioLanguage": project.language,
        },
        "status": {
            "privacyStatus": privacy if privacy in ("public", "unlisted", "private") else "unlisted",
            "selfDeclaredMadeForKids": False,
        },
    }
    data = mp4.read_bytes()
    init = requests.post(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Length": str(len(data)),
            "X-Upload-Content-Type": "video/mp4",
        },
        data=_json.dumps(meta).encode("utf-8"),
        timeout=30,
    )
    if init.status_code not in (200, 201) or "Location" not in init.headers:
        raise ValueError(f"YouTube init failed ({init.status_code}): {init.text[:240]}")
    put = requests.put(
        init.headers["Location"],
        headers={"Authorization": f"Bearer {token}", "Content-Type": "video/mp4"},
        data=data,
        timeout=300,
    )
    if put.status_code not in (200, 201):
        raise ValueError(f"YouTube upload failed ({put.status_code}): {put.text[:240]}")
    vid = put.json().get("id", "")
    return {"provider": "youtube", "video_id": vid, "url": f"https://youtu.be/{vid}", "studio_url": f"https://studio.youtube.com/video/{vid}/edit"}


def upload_to_drive(project: Project, access_token: str) -> Dict:
    """Direct upload of episode.mp4 to Google Drive API v3 using a Google OAuth2 access token."""
    import json as _json

    token = (access_token or os.getenv("GOOGLE_OAUTH_ACCESS_TOKEN", "")).strip()
    if not token:
        raise ValueError("Provide a Google OAuth access token (with drive.file scope) or download the pack and drag to Drive.")
    mp4 = project_dir(project.id) / "episode.mp4"
    if not mp4.exists():
        render_video_sync(project)
    boundary = "vivarisu_drive_boundary"
    meta = _json.dumps({"name": f"{project.title or project.id}.mp4", "mimeType": "video/mp4"}).encode("utf-8")
    body = (
        f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".encode("utf-8")
        + meta
        + f"\r\n--{boundary}\r\nContent-Type: video/mp4\r\n\r\n".encode("utf-8")
        + mp4.read_bytes()
        + f"\r\n--{boundary}--\r\n".encode("utf-8")
    )
    resp = requests.post(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/related; boundary={boundary}",
        },
        data=body,
        timeout=300,
    )
    if resp.status_code not in (200, 201):
        raise ValueError(f"Google Drive upload failed ({resp.status_code}): {resp.text[:240]}")
    out = resp.json()
    fid = out.get("id", "")
    return {"provider": "drive", "file_id": fid, "url": out.get("webViewLink") or f"https://drive.google.com/file/d/{fid}/view"}

