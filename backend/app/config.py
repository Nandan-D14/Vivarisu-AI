import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"

load_dotenv(ROOT_DIR / ".env")

DATA_DIR = Path(os.getenv("VIVARISU_DATA_DIR", BACKEND_DIR / "data"))
PROJECTS_DIR = DATA_DIR / "projects"
VOICES_DIR = DATA_DIR / "voices"
MEDIA_DIR = DATA_DIR / "media"

for _d in (PROJECTS_DIR, VOICES_DIR, MEDIA_DIR):
    _d.mkdir(parents=True, exist_ok=True)


def gnani_api_key() -> str:
    return os.getenv("GNANI_API_KEY", "").strip()


def gemini_api_key() -> str:
    return (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or "").strip()


def cloudinary_creds() -> tuple[str, str, str] | None:
    """Return (cloud_name, api_key, api_secret) if Cloudinary is configured, else None."""
    url = os.getenv("CLOUDINARY_URL", "").strip()
    if url.startswith("cloudinary://") and "@" in url:
        rest = url[len("cloudinary://"):]
        auth, cloud = rest.rsplit("@", 1)
        if ":" in auth:
            key, secret = auth.split(":", 1)
            if cloud and key and secret:
                return cloud.strip(), key.strip(), secret.strip()
    cloud = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
    key = os.getenv("CLOUDINARY_API_KEY", "").strip()
    secret = os.getenv("CLOUDINARY_API_SECRET", "").strip()
    if cloud and key and secret:
        return cloud, key, secret
    return None


GNANI_STT_MODEL = os.getenv("GNANI_STT_MODEL", "prisma-v3.0")
GNANI_TTS_MODEL = os.getenv("GNANI_TTS_MODEL", "timbre-v3.0")
GNANI_TTS_VOICE = os.getenv("GNANI_TTS_VOICE", "Lakshmi")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
GEMINI_AGENT_MODEL = os.getenv("GEMINI_AGENT_MODEL", "gemini-3-flash-preview")
GEMINI_FALLBACK_MODELS = [m.strip() for m in os.getenv("GEMINI_FALLBACK_MODELS", "gemini-3.8-flash,gemini-3.1-flash-lite").split(",") if m.strip()]

# All scene clips are normalised to this format before assembly.
SAMPLE_RATE = 44100
