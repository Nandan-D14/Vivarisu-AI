"""Turn scene expression settings into real Gnani audio and assemble the episode."""
import hashlib
import os
import re
import tempfile
from pathlib import Path
from typing import List, Optional

from backend.app import gnani, voices
from backend.app.config import MEDIA_DIR
from backend.app.media import audio
from backend.app.media.subtitles import cues_for_span, strip_tags, to_srt
from backend.app.models import Project, Scene, TimelineEntry

# Emotion -> opening Timbre tag, used only when the writer/creator placed no tag and intensity is high.
EMOTION_LEAD_TAG = {
    "whisper": "<whispers>",
    "fear": "<whispers>",
    "excitement": "<excited>",
    "shock": "<excited>",
    "sadness": "<sigh>",
    "reflection": "<slow>",
}
_TAG_RE = re.compile(r"<[^<>]{1,20}>")
_PAUSE_SPLIT = re.compile(r"\s*<pauses>\s*")


def vc_inline_tags() -> bool:
    """Set GNANI_VC_INLINE_TAGS=1 once tags are confirmed to work with vachana-vc-v1 on the account."""
    return os.getenv("GNANI_VC_INLINE_TAGS", "0").lower() in ("1", "true", "yes")


def tts_text_v3(scene: Scene) -> str:
    text = scene.text.strip()
    lead = EMOTION_LEAD_TAG.get(scene.emotion)
    if lead and scene.intensity >= 0.6 and not _TAG_RE.search(text):
        text = f"{lead} {text}"
    return text


def plain_segments(scene: Scene) -> List[str]:
    """Split on <pauses> and drop other tags, for engines that do not perform tags."""
    segs = [strip_tags(s) for s in _PAUSE_SPLIT.split(scene.text)]
    return [s for s in segs if s]


def inner_pause_ms(project: Project) -> int:
    sp = project.style_profile
    return max(350, sp.typical_pause_ms) if sp else 450


def render_hash(project: Project, scene: Scene) -> str:
    spoken = tts_text_v3(scene) if project.tts_model == "timbre-v3.0" else "|".join(plain_segments(scene))
    key = "|".join(str(x) for x in (
        spoken, round(float(scene.pace), 2),
        project.tts_model, project.voice, project.language,
        project.use_cloned_voice and project.voice_identity and project.voice_identity.id,
        vc_inline_tags(),
    ))
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]


def project_dir(project_id: str) -> Path:
    d = MEDIA_DIR / project_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def media_url(path: Path) -> str:
    rel = path.relative_to(MEDIA_DIR).as_posix()
    return f"/media/{rel}?v={int(path.stat().st_mtime * 1000)}"


def refresh_status(project: Project) -> Project:
    """Mark scenes whose audio no longer matches their text/expression as stale."""
    for s in project.scenes:
        if not s.audio_url:
            s.audio_status = "missing"
        elif s.rendered_hash != render_hash(project, s):
            s.audio_status = "stale"
        else:
            s.audio_status = "ready"
    return project


def _write_segments(raw_clips: List[bytes], gap_ms: int, dst: Path, tempo: float) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        norm = []
        for i, raw in enumerate(raw_clips):
            p = Path(tmp) / f"seg{i}.wav"
            audio.to_wav(raw, p, tempo=tempo)
            norm.append(p)
        audio.concat([(p, gap_ms if i else 0) for i, p in enumerate(norm)], dst)


def voice_scene(project: Project, scene: Scene, flat: bool = False) -> Scene:
    """Synthesise one scene. flat=True renders a neutral reference version for A/B comparison."""
    out = project_dir(project.id) / f"{scene.id}{'.flat' if flat else ''}.wav"
    gap = inner_pause_ms(project)
    cloned = project.use_cloned_voice and project.voice_identity is not None

    if cloned:
        emb = voices.load_embedding(project.voice_identity.id)
        if flat:
            _write_segments([gnani.synthesize_cloned(strip_tags(scene.text), emb)], 0, out, 1.0)
            mode = "cloned voice · flat"
        elif vc_inline_tags():
            _write_segments([gnani.synthesize_cloned(tts_text_v3(scene), emb)], 0, out, scene.pace)
            mode = "cloned voice · inline tags + pace"
        else:
            clips = [gnani.synthesize_cloned(seg, emb) for seg in plain_segments(scene)]
            _write_segments(clips, gap, out, scene.pace)
            mode = "cloned voice · pauses + pace emulated"
    elif project.tts_model == "timbre-v3.0":
        if flat:
            raw = gnani.synthesize(strip_tags(scene.text), project.voice, project.language, project.tts_model, 1.0)
            mode = "timbre-v3.0 · flat"
        else:
            raw = gnani.synthesize(tts_text_v3(scene), project.voice, project.language, project.tts_model, scene.pace)
            mode = "timbre-v3.0 · inline tags + pace"
        audio.to_wav(raw, out)
    else:
        segs = [strip_tags(scene.text)] if flat else plain_segments(scene)
        speed = 1.0 if flat else scene.pace
        clips = [gnani.synthesize(s, project.voice, project.language, project.tts_model, speed) for s in segs]
        _write_segments(clips, 0 if flat else gap, out, 1.0)
        mode = f"{project.tts_model} · {'flat' if flat else 'pauses emulated + pace'}"

    if flat:
        scene_copy = scene.model_copy()
        scene_copy.audio_url = media_url(out)
        scene_copy.audio_mode = mode
        scene_copy.audio_duration_ms = audio.duration_ms(out)
        return scene_copy

    scene.audio_url = media_url(out)
    scene.audio_duration_ms = audio.duration_ms(out)
    scene.audio_mode = mode
    scene.rendered_hash = render_hash(project, scene)
    scene.audio_status = "ready"
    return scene


def scene_wav(project_id: str, scene_id: str) -> Optional[Path]:
    p = MEDIA_DIR / project_id / f"{scene_id}.wav"
    return p if p.exists() else None


def assemble(project: Project) -> Project:
    """Join voiced scenes with their pauses into episode.mp3 + episode.srt and build the timeline."""
    d = project_dir(project.id)
    parts, used = [], []
    prev_after = 0
    for s in project.scenes:
        clip = scene_wav(project.id, s.id) if s.audio_url else None
        if clip is None:
            continue
        lead = 300 if not used else 0
        parts.append((clip, lead + prev_after + s.pause_before_ms))
        used.append(s)
        prev_after = s.pause_after_ms
    if not used:
        raise ValueError("No voiced scenes to assemble yet.")
    parts.append((None, prev_after + 600))

    wav = d / "episode.wav"
    spans = audio.concat(parts, wav)
    timeline, all_cues = [], []
    for s, (start, end) in zip(used, spans):
        cues = cues_for_span(s.text, start, end)
        all_cues.extend(cues)
        timeline.append(TimelineEntry(scene_id=s.id, start_ms=start, end_ms=end, cues=cues))

    mp3 = audio.to_mp3(wav, d / "episode.mp3")
    srt = d / "episode.srt"
    srt.write_text(to_srt(all_cues), encoding="utf-8")
    project.episode_duration_ms = audio.duration_ms(wav)
    wav.unlink(missing_ok=True)

    project.timeline = timeline
    project.episode_audio_url = media_url(mp3)
    project.srt_url = media_url(srt)
    return project
