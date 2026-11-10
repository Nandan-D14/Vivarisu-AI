"""HTTP API for the Vivarisu studio."""
import json
import tempfile
from pathlib import Path
from typing import Dict, Iterator, List, Optional

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from backend.app import config, ingest, pipeline, render, storage
from backend.app.llm import gemini
from backend.app.media import video
from backend.app.models import EMOTIONS, IMAGE_EFFECTS, TIMBRE_TAGS, Project, Scene, StyleProfile

router = APIRouter(prefix="/api")

LANGUAGES = {
    "kn-IN": "Kannada", "en-IN": "English", "hi-IN": "Hindi", "ta-IN": "Tamil", "te-IN": "Telugu",
    "ml-IN": "Malayalam", "mr-IN": "Marathi", "bn-IN": "Bengali", "gu-IN": "Gujarati", "pa-IN": "Punjabi",
}

# docs.gnani.ai/api/TTS/available-voices
VOICES_V3 = [
    {"name": "Lakshmi", "gender": "Female", "persona": "Expressive, warm storytelling"},
    {"name": "Vasudha", "gender": "Female", "persona": "Expressive, composed narration"},
    {"name": "Yashraj", "gender": "Male", "persona": "Warm narrative voice"},
    {"name": "Shubham", "gender": "Male", "persona": "Energetic, confident"},
    {"name": "Avinash", "gender": "Male", "persona": "Firm, deliberate pacing"},
    {"name": "Prakash", "gender": "Male", "persona": "Steady, deliberate"},
    {"name": "Devansh", "gender": "Male", "persona": "Young, conversational"},
    {"name": "Harshad", "gender": "Male", "persona": "Professional, firm"},
    {"name": "Shivani", "gender": "Female", "persona": "Warm, patient"},
    {"name": "Kalpana", "gender": "Female", "persona": "Empathetic, composed"},
    {"name": "Chetana", "gender": "Female", "persona": "Gentle, empathetic"},
    {"name": "Riyaa", "gender": "Female", "persona": "Confident, lively"},
    {"name": "Tarika", "gender": "Female", "persona": "Warm, reassuring"},
]
VOICES_V25_KANNADA = [
    {"name": "Kavin", "gender": "Male", "persona": "Firm, articulate (Kannada)"},
    {"name": "Saanvi", "gender": "Female", "persona": "Lively, energetic (Kannada)"},
]

PRESETS: Dict[str, Dict] = {
    "dramatic": {"label": "Dramatic", "emotion": "suspense", "intensity": 0.85, "pace": 0.92, "pause_before_ms": 600, "pause_after_ms": 700},
    "calm_explainer": {"label": "Calm explainer", "emotion": "neutral", "intensity": 0.4, "pace": 1.0, "pause_before_ms": 200, "pause_after_ms": 300},
    "whisper_horror": {"label": "Whisper horror", "emotion": "whisper", "intensity": 0.8, "pace": 0.88, "pause_before_ms": 700, "pause_after_ms": 900},
    "high_energy": {"label": "High energy", "emotion": "excitement", "intensity": 0.8, "pace": 1.1, "pause_before_ms": 100, "pause_after_ms": 200},
    "emotional": {"label": "Emotional", "emotion": "sadness", "intensity": 0.7, "pace": 0.9, "pause_before_ms": 500, "pause_after_ms": 800},
    "big_reveal": {"label": "Big reveal", "emotion": "shock", "intensity": 0.9, "pace": 0.95, "pause_before_ms": 1500, "pause_after_ms": 1000},
}


def _sse(events: Iterator[Dict]) -> StreamingResponse:
    def gen():
        for ev in events:
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _out(project: Project) -> Dict:
    render.refresh_status(project)
    return {**project.model_dump(), "history": storage.history_depth(project.id)}


def _scene(project: Project, scene_id: str) -> Scene:
    for s in project.scenes:
        if s.id == scene_id:
            return s
    raise KeyError(f"Scene '{scene_id}' not found")


def _index(project: Project, scene_id: str) -> int:
    return project.scenes.index(_scene(project, scene_id))


# ---------- meta ----------

@router.get("/health")
def health():
    return {
        "gnani_key": bool(config.gnani_api_key()),
        "gemini_key": bool(config.gemini_api_key()),
        "cloudinary": bool(config.cloudinary_creds()),
        "tts_model": config.GNANI_TTS_MODEL,
        "stt_model": config.GNANI_STT_MODEL,
        "gemini_model": config.GEMINI_MODEL,
        "vc_inline_tags": render.vc_inline_tags(),
    }


@router.get("/catalog")
def catalog():
    return {
        "languages": LANGUAGES,
        "voices": {"timbre-v3.0": VOICES_V3, "timbre-v2.5": VOICES_V25_KANNADA},
        "emotions": EMOTIONS,
        "tags": TIMBRE_TAGS,
        "presets": {k: v["label"] for k, v in PRESETS.items()},
    }


@router.post("/transcribe")
async def transcribe(audio_file: UploadFile = File(...), topic: str = Form("")):
    data = await audio_file.read()
    with tempfile.TemporaryDirectory() as tmp:
        suffix = Path(audio_file.filename or "note.webm").suffix or ".webm"
        p = Path(tmp) / f"note{suffix}"
        p.write_bytes(data)
        return {"transcript": ingest.transcribe_notes(p, topic=topic)}


# ---------- projects ----------

@router.get("/projects")
def list_projects():
    return [
        {"id": p.id, "title": p.title, "topic": p.topic, "status": p.status, "scenes": len(p.scenes),
         "duration_ms": p.episode_duration_ms, "updated_at": p.updated_at, "language": p.language}
        for p in storage.list_all()
    ]


@router.get("/projects/{project_id}")
def get_project(project_id: str):
    return _out(storage.require(project_id))


class ProjectPatch(BaseModel):
    title: Optional[str] = None
    language: Optional[str] = None
    voice: Optional[str] = None
    tts_model: Optional[str] = None
    use_cloned_voice: Optional[bool] = None
    style_profile: Optional[Dict] = None
    video_aspect: Optional[str] = None
    burn_subtitles: Optional[bool] = None


@router.patch("/projects/{project_id}")
def patch_project(project_id: str, body: ProjectPatch):
    project = storage.require(project_id)
    data = body.model_dump(exclude_none=True)
    if "language" in data and data["language"] not in LANGUAGES:
        raise ValueError("Unsupported language")
    if "tts_model" in data and data["tts_model"] not in ("timbre-v3.0", "timbre-v2.5"):
        raise ValueError("Unsupported TTS model")
    if "video_aspect" in data and data["video_aspect"] not in ("16:9", "9:16"):
        raise ValueError("Unsupported video aspect ratio")
    if data.get("use_cloned_voice") and not project.voice_identity:
        raise ValueError("Create a cloned voice identity first.")
    if "style_profile" in data:
        base = project.style_profile.model_dump() if project.style_profile else {}
        project.style_profile = StyleProfile.model_validate({**base, **data.pop("style_profile")})
    for k, v in data.items():
        setattr(project, k, v)
    names = {v["name"] for v in (VOICES_V3 if project.tts_model == "timbre-v3.0" else VOICES_V25_KANNADA)}
    if project.voice not in names:
        project.voice = "Lakshmi" if project.tts_model == "timbre-v3.0" else "Kavin"
    return _out(storage.save(project))


@router.delete("/projects/{project_id}")
def delete_project(project_id: str):
    project = storage.require(project_id)
    ingest.delete_voice(project)
    storage.delete(project_id)
    return {"deleted": project_id}


@router.post("/episodes/generate")
async def generate_episode(
    topic: str = Form(""),
    language: str = Form("kn-IN"),
    voice: str = Form("Lakshmi"),
    tts_model: str = Form(config.GNANI_TTS_MODEL),
    num_scenes: int = Form(8),
    clone_from_reference: bool = Form(False),
    consent: bool = Form(False),
    voice_note: Optional[UploadFile] = File(None),
    reference: Optional[UploadFile] = File(None),
    voice_sample: Optional[UploadFile] = File(None),
    reference_url: str = Form(""),
):
    if not topic.strip() and not voice_note:
        raise ValueError("Give a topic or a voice note.")
    if language not in LANGUAGES:
        raise ValueError("Unsupported language")
    if (clone_from_reference or voice_sample) and not consent:
        raise PermissionError("Confirm consent before cloning a voice.")
    project = storage.save(Project(
        title=(topic.strip()[:60] or "Voice-note episode"), topic=topic.strip(), language=language,
        voice=voice, tts_model=tts_model if tts_model in ("timbre-v3.0", "timbre-v2.5") else "timbre-v3.0",
    ))
    try:
        notes_path = ingest.save_upload(project.id, "notes", voice_note.filename, await voice_note.read()) if voice_note else None
        ref_path = ingest.save_upload(project.id, "reference", reference.filename, await reference.read()) if reference else None
        sample_path = ingest.save_upload(project.id, "voice_sample", voice_sample.filename, await voice_sample.read()) if voice_sample else None
    except ValueError:
        storage.delete(project.id)
        raise
    return _sse(pipeline.generate(
        project.id, notes_path, ref_path, clone_from_reference, consent, max(4, min(12, num_scenes)), sample_path, reference_url
    ))


@router.post("/projects/{project_id}/render")
def render_project(project_id: str):
    storage.require(project_id)
    return _sse(pipeline.rerender(project_id))


@router.post("/projects/{project_id}/assemble")
def assemble_project(project_id: str):
    project = storage.require(project_id)
    return _out(storage.save(render.assemble(project)))


@router.post("/projects/{project_id}/undo")
def undo(project_id: str):
    return _out(storage.undo(project_id))


@router.post("/projects/{project_id}/redo")
def redo(project_id: str):
    return _out(storage.redo(project_id))


class InstructionBody(BaseModel):
    instruction: str = ""


@router.post("/projects/{project_id}/direct")
def direct_all(project_id: str, body: InstructionBody):
    """Gemini re-directs expression for every scene (wording unchanged), e.g. after learning a new style."""
    project = storage.require(project_id)
    storage.snapshot(project)
    project.scenes = gemini.direct_scenes(project.scenes, project.language, project.style_profile, body.instruction)
    return _out(storage.save(project))


@router.post("/agent")
def chat_home_agent(body: InstructionBody):
    if not body.instruction.strip():
        raise ValueError("Type a message for the assistant.")
    plan = gemini.agent_home(body.instruction)
    return {
        "reply": plan.reply,
        "suggested_topic": plan.suggested_topic.strip(),
        "ui_action": plan.ui_action,
    }


@router.post("/projects/{project_id}/agent")
def chat_project_agent(project_id: str, body: InstructionBody):
    if not body.instruction.strip():
        raise ValueError("Type a message for the assistant.")
    project = storage.require(project_id)
    plan = gemini.agent_project(project, body.instruction)

    has_scene_changes = bool(plan.updated_scenes or plan.added_scenes or plan.deleted_scene_ids)
    has_meta_changes = bool(plan.set_voice.strip() or plan.set_video_aspect.strip() or plan.set_burn_subtitles.strip())

    if has_scene_changes or has_meta_changes:
        storage.snapshot(project)
        by_id = {u.id: u for u in plan.updated_scenes}
        for s in project.scenes:
            u = by_id.get(s.id)
            if u:
                s.title = u.title.strip() or s.title
                s.beat = u.beat.strip() or s.beat
                gemini._apply_expression(s, u)
                if u.image_effect in IMAGE_EFFECTS:
                    s.image_effect = u.image_effect
                s.caption_overlay = u.caption_overlay.strip()[:80]

        if plan.deleted_scene_ids and len(project.scenes) > 1:
            drop = set(plan.deleted_scene_ids)
            kept = [s for s in project.scenes if s.id not in drop]
            if kept:
                project.scenes = kept

        for ns in plan.added_scenes:
            scene = gemini._apply_expression(Scene(title=ns.title.strip() or "New scene", beat=ns.beat.strip() or "Custom"), ns)
            if scene.text:
                project.scenes.append(scene)

        all_voices = {v["name"] for v in VOICES_V3 + VOICES_V25_KANNADA}
        if plan.set_voice.strip() in all_voices:
            vname = plan.set_voice.strip()
            project.voice = vname
            if vname in {v["name"] for v in VOICES_V25_KANNADA}:
                project.tts_model = "timbre-v2.5"
            else:
                project.tts_model = "timbre-v3.0"

        if plan.set_video_aspect.strip() in ("16:9", "9:16"):
            project.video_aspect = plan.set_video_aspect.strip()
        if plan.set_burn_subtitles.strip().lower() in ("true", "false"):
            project.burn_subtitles = plan.set_burn_subtitles.strip().lower() == "true"

        storage.save(project)

    return {
        "reply": plan.reply,
        "ui_action": plan.ui_action,
        "project": _out(project),
    }


class PresetBody(BaseModel):
    preset: str


def _apply_preset(scene: Scene, preset: str) -> None:
    if preset not in PRESETS:
        raise ValueError(f"Unknown preset '{preset}'")
    for k, v in PRESETS[preset].items():
        if k != "label":
            setattr(scene, k, v)


@router.post("/projects/{project_id}/preset")
def preset_all(project_id: str, body: PresetBody):
    project = storage.require(project_id)
    storage.snapshot(project)
    for s in project.scenes:
        _apply_preset(s, body.preset)
    return _out(storage.save(project))


# ---------- reference: style learning + voice cloning ----------

@router.post("/projects/{project_id}/reference")
async def upload_reference(
    project_id: str,
    file: UploadFile = File(...),
    learn_style: bool = Form(True),
    clone_voice: bool = Form(False),
    consent: bool = Form(False),
    start_s: float = Form(0.0),
    seconds: float = Form(20.0),
    voice_name: str = Form("Reference narrator"),
):
    project = storage.require(project_id)
    if clone_voice and not consent:
        raise PermissionError("Confirm consent before cloning this voice.")
    path = ingest.save_upload(project.id, "reference", file.filename, await file.read())
    if learn_style:
        project.style_profile = ingest.learn_style(path)
    if clone_voice:
        project.voice_identity = ingest.clone_voice(project, path, consent, voice_name[:60], start_s, seconds)
        project.use_cloned_voice = True
    return _out(storage.save(project))


class ReferenceUrlBody(BaseModel):
    url: str


@router.post("/projects/{project_id}/reference-url")
def learn_reference_url(project_id: str, body: ReferenceUrlBody):
    project = storage.require(project_id)
    project.style_profile = gemini.analyze_youtube_url(body.url)
    return _out(storage.save(project))


@router.delete("/projects/{project_id}/voice-identity")
def delete_voice_identity(project_id: str):
    project = storage.require(project_id)
    return _out(storage.save(ingest.delete_voice(project)))


# ---------- scenes ----------

class ScenePatch(BaseModel):
    title: Optional[str] = None
    beat: Optional[str] = None
    text: Optional[str] = None
    emotion: Optional[str] = None
    intensity: Optional[float] = None
    pace: Optional[float] = None
    pause_before_ms: Optional[int] = None
    pause_after_ms: Optional[int] = None
    image_effect: Optional[str] = None
    image_fade: Optional[bool] = None
    caption_overlay: Optional[str] = None


@router.patch("/projects/{project_id}/scenes/{scene_id}")
def patch_scene(project_id: str, scene_id: str, body: ScenePatch):
    project = storage.require(project_id)
    scene = _scene(project, scene_id)
    data = body.model_dump(exclude_none=True)
    if "text" in data:
        data["text"] = gemini.clean_text(data["text"])
    if "emotion" in data and data["emotion"] not in EMOTIONS:
        raise ValueError("Unknown emotion")
    if "image_effect" in data and data["image_effect"] not in IMAGE_EFFECTS:
        raise ValueError("Unknown image effect")
    merged = Scene.model_validate({**scene.model_dump(), **data})  # validates ranges
    storage.snapshot(project)
    project.scenes[_index(project, scene_id)] = merged
    return _out(storage.save(project))


class NewScene(BaseModel):
    after_id: Optional[str] = None
    title: str = "New scene"
    text: str = ""


@router.post("/projects/{project_id}/scenes")
def add_scene(project_id: str, body: NewScene):
    project = storage.require(project_id)
    storage.snapshot(project)
    scene = Scene(title=body.title, text=gemini.clean_text(body.text), beat="Custom")
    pos = _index(project, body.after_id) + 1 if body.after_id else len(project.scenes)
    project.scenes.insert(pos, scene)
    return _out(storage.save(project))


@router.delete("/projects/{project_id}/scenes/{scene_id}")
def delete_scene(project_id: str, scene_id: str):
    project = storage.require(project_id)
    idx = _index(project, scene_id)
    storage.snapshot(project)
    project.scenes.pop(idx)
    return _out(storage.save(project))


class ReorderBody(BaseModel):
    ids: List[str]


@router.post("/projects/{project_id}/scenes/reorder")
def reorder_scenes(project_id: str, body: ReorderBody):
    project = storage.require(project_id)
    if sorted(body.ids) != sorted(s.id for s in project.scenes):
        raise ValueError("Reorder must include every scene exactly once.")
    storage.snapshot(project)
    by_id = {s.id: s for s in project.scenes}
    project.scenes = [by_id[i] for i in body.ids]
    return _out(storage.save(project))


class SplitBody(BaseModel):
    at: int


@router.post("/projects/{project_id}/scenes/{scene_id}/split")
def split_scene(project_id: str, scene_id: str, body: SplitBody):
    project = storage.require(project_id)
    idx = _index(project, scene_id)
    scene = project.scenes[idx]
    left, right = scene.text[: body.at].strip(), scene.text[body.at:].strip()
    if not left or not right:
        raise ValueError("Place the cursor inside the text to split.")
    storage.snapshot(project)
    first = scene.model_copy(update={"text": left, "audio_url": None, "rendered_hash": None})
    second = Scene.model_validate({**scene.model_dump(exclude={"id", "audio_url", "rendered_hash"}),
                                   "text": right, "title": f"{scene.title} (2)"})
    project.scenes[idx: idx + 1] = [first, second]
    return _out(storage.save(project))


@router.post("/projects/{project_id}/scenes/{scene_id}/merge-next")
def merge_next(project_id: str, scene_id: str):
    project = storage.require(project_id)
    idx = _index(project, scene_id)
    if idx >= len(project.scenes) - 1:
        raise ValueError("No next scene to merge with.")
    storage.snapshot(project)
    a, b = project.scenes[idx], project.scenes[idx + 1]
    merged = a.model_copy(update={"text": f"{a.text} {b.text}".strip(), "pause_after_ms": b.pause_after_ms,
                                  "audio_url": None, "rendered_hash": None})
    project.scenes[idx: idx + 2] = [merged]
    return _out(storage.save(project))


@router.post("/projects/{project_id}/scenes/{scene_id}/preset")
def preset_scene(project_id: str, scene_id: str, body: PresetBody):
    project = storage.require(project_id)
    scene = _scene(project, scene_id)
    storage.snapshot(project)
    _apply_preset(scene, body.preset)
    return _out(storage.save(project))


@router.post("/projects/{project_id}/scenes/{scene_id}/rewrite")
def rewrite_scene(project_id: str, scene_id: str, body: InstructionBody):
    """Returns a proposal only; the UI shows before/after and applies it via PATCH if accepted."""
    project = storage.require(project_id)
    idx = _index(project, scene_id)
    if not body.instruction.strip():
        raise ValueError("Tell the AI what to change.")
    neighbours = "\n".join(
        f"[{s.beat}] {s.text}" for s in project.scenes[max(0, idx - 1): idx + 2] if s.id != scene_id
    )
    proposal = gemini.rewrite_scene(project.scenes[idx], body.instruction, project.language, neighbours, project.style_profile)
    return {"proposal": proposal.model_dump()}


@router.post("/projects/{project_id}/scenes/{scene_id}/voice")
def voice_scene(project_id: str, scene_id: str):
    project = storage.require(project_id)
    render.voice_scene(project, _scene(project, scene_id))
    render.assemble(project)
    return _out(storage.save(project))


@router.post("/projects/{project_id}/scenes/{scene_id}/flat")
def flat_version(project_id: str, scene_id: str):
    project = storage.require(project_id)
    flat = render.voice_scene(project, _scene(project, scene_id), flat=True)
    return {"audio_url": flat.audio_url, "audio_mode": flat.audio_mode}


# ---------- video studio ----------

@router.post("/projects/{project_id}/scenes/{scene_id}/image")
async def upload_scene_image(project_id: str, scene_id: str, file: UploadFile = File(...)):
    project = storage.require(project_id)
    scene = _scene(project, scene_id)
    storage.snapshot(project)
    path = video.save_scene_image(project.id, scene.id, file.filename or "image.png", await file.read())
    scene.image_url = render.media_url(path)
    return _out(storage.save(project))


@router.delete("/projects/{project_id}/scenes/{scene_id}/image")
def remove_scene_image(project_id: str, scene_id: str):
    project = storage.require(project_id)
    scene = _scene(project, scene_id)
    storage.snapshot(project)
    video.delete_scene_image(project.id, scene.id)
    scene.image_url = None
    return _out(storage.save(project))


@router.post("/projects/{project_id}/video")
def render_project_video(project_id: str):
    storage.require(project_id)
    return _sse(video.render_video_stream(project_id))


@router.post("/projects/{project_id}/video/sync")
def render_project_video_sync(project_id: str):
    project = storage.require(project_id)
    return _out(video.render_video_sync(project))


# ---------- publish & external export ----------

@router.get("/projects/{project_id}/publish-kit")
def get_publish_kit(project_id: str):
    project = storage.require(project_id)
    return video.build_publish_kit(project)


@router.get("/projects/{project_id}/export-zip")
def export_project_zip(project_id: str):
    project = storage.require(project_id)
    data = video.build_export_zip(project)
    fname = f"vivarisu-{project.id}.zip"
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


class CloudExportBody(BaseModel):
    access_token: str = ""
    privacy: str = "unlisted"


@router.post("/projects/{project_id}/export/youtube")
def export_to_youtube(project_id: str, body: CloudExportBody):
    project = storage.require(project_id)
    return video.upload_to_youtube(project, body.access_token, body.privacy)


@router.post("/projects/{project_id}/export/drive")
def export_to_drive(project_id: str, body: CloudExportBody):
    project = storage.require(project_id)
    return video.upload_to_drive(project, body.access_token)


