"""Inputs: creator voice notes (Prisma) and reference media (style learning + voice cloning)."""
import re
import tempfile
from pathlib import Path

from backend.app import gnani, voices
from backend.app.llm import gemini
from backend.app.media import audio
from backend.app.models import Project, StyleProfile, VoiceIdentity
from backend.app.render import project_dir

_ALLOWED_EXT = {".mp4", ".mov", ".webm", ".mkv", ".m4a", ".mp3", ".wav", ".ogg", ".aac", ".flac", ".avi"}
MAX_UPLOAD_BYTES = 200 * 1024 * 1024


def save_upload(project_id: str, stem: str, filename: str, data: bytes) -> Path:
    if not data:
        raise ValueError("Uploaded file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError("Uploaded file is larger than 200 MB.")
    ext = Path(filename or "").suffix.lower()
    if ext not in _ALLOWED_EXT:
        raise ValueError(f"Unsupported file type '{ext or '?'}'. Use a common audio or video format.")
    safe_stem = re.sub(r"[^a-z0-9_-]", "", stem.lower()) or "upload"
    path = project_dir(project_id) / f"{safe_stem}{ext}"
    path.write_bytes(data)
    return path


def transcribe_notes(path: Path, topic: str = "", language_code: str = "indic-auto") -> str:
    """Transcribe a creator voice note of any length by chunking it for Prisma REST."""
    with tempfile.TemporaryDirectory() as tmp:
        wav = audio.to_wav(path, Path(tmp) / "notes.wav", max_seconds=600)
        chunks = audio.split_for_stt(wav)
    if not chunks:
        raise ValueError("The voice note has no usable audio (needs at least ~1 second).")
    text = ""
    for chunk in chunks:
        res = gnani.transcribe(chunk, language_code=language_code, topic=topic, previous_text=text)
        text = f"{text} {res['transcript']}".strip()
    return text


def learn_style(path: Path) -> StyleProfile:
    return gemini.analyze_reference(path)


def clone_voice(
    project: Project,
    path: Path,
    consent_confirmed: bool,
    name: str = "Reference narrator",
    start_s: float = 0.0,
    seconds: float = 20.0,
) -> VoiceIdentity:
    """Extract a clean 5-30 s clip from the reference and create a Gnani voice embedding."""
    if not consent_confirmed:
        raise PermissionError("Confirm you own this voice or have the speaker's permission before cloning.")
    seconds = max(5.0, min(30.0, seconds))
    clip = project_dir(project.id) / "voice_reference.wav"
    audio.to_wav(path, clip, start_s=max(0.0, start_s), max_seconds=seconds,
                 filters=("highpass=f=80", "loudnorm=I=-18"))
    if audio.duration_ms(clip) < 5000:
        raise ValueError("Reference audio must contain at least 5 seconds of speech from the chosen start time.")
    embedding = gnani.create_embedding(clip.read_bytes())
    if project.voice_identity:
        voices.delete(project.voice_identity.id)
    return voices.save(name, embedding, consent_confirmed, path.name)


def delete_voice(project: Project) -> Project:
    if project.voice_identity:
        voices.delete(project.voice_identity.id)
    clip = project_dir(project.id) / "voice_reference.wav"
    clip.unlink(missing_ok=True)
    project.voice_identity = None
    project.use_cloned_voice = False
    return project
