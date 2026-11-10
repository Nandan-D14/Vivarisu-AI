"""Local storage for cloned voice embeddings, kept out of project JSON so they can be deleted on request."""
import json

from backend.app.config import VOICES_DIR
from backend.app.models import VoiceIdentity, new_id, now_ms


def _path(voice_id: str):
    if not voice_id.replace("-", "").isalnum():
        raise ValueError("Invalid voice id")
    return VOICES_DIR / f"{voice_id}.json"


def save(name: str, embedding: dict, consent_confirmed: bool, source_file: str) -> VoiceIdentity:
    if not consent_confirmed:
        raise PermissionError("Voice cloning requires confirmed consent from the voice owner.")
    ident = VoiceIdentity(id=new_id("voice"), name=name, consent_confirmed=True, created_at=now_ms(), source_file=source_file)
    _path(ident.id).write_text(json.dumps({"identity": ident.model_dump(), "embedding": embedding}), encoding="utf-8")
    return ident


def load_embedding(voice_id: str) -> dict:
    p = _path(voice_id)
    if not p.exists():
        raise KeyError("Voice identity was deleted or never created.")
    return json.loads(p.read_text(encoding="utf-8"))["embedding"]


def delete(voice_id: str) -> None:
    p = _path(voice_id)
    if p.exists():
        p.unlink()
