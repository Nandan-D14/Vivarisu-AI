"""Gnani Speech APIs (Prisma STT, Timbre TTS, voice clone embeddings + vachana-vc-v1).

No silent mock fallback: every failure raises GnaniError with the API's own message.
The account may allow only one active request at a time, so calls are serialised and
429/503 responses are retried with backoff.
"""
import json
import threading
import time

import requests

from backend.app import config

BASE = "https://api.vachana.ai"
STT_URL = f"{BASE}/stt/v3"
TTS_URL = f"{BASE}/api/v1/tts/inference"
EMBED_URL = f"{BASE}/api/v1/tts/voice-clone/embeddings"

_call_lock = threading.Lock()


class GnaniError(RuntimeError):
    def __init__(self, message: str, status: int = 0, code: str = ""):
        super().__init__(message)
        self.status = status
        self.code = code


def _error_from_response(resp: requests.Response, service: str) -> GnaniError:
    code, msg = "", resp.text[:300]
    try:
        body = resp.json()
        if isinstance(body.get("detail"), dict):
            code = body["detail"].get("error_code", "")
            msg = body["detail"].get("message", msg)
        elif isinstance(body.get("detail"), list):
            msg = "; ".join(str(d.get("msg", d)) for d in body["detail"])
        elif isinstance(body.get("error"), dict):
            code = body["error"].get("type", "")
            msg = body["error"].get("message", msg)
        elif body.get("message"):
            msg = body["message"]
    except ValueError:
        pass
    hints = {
        401: "check GNANI_API_KEY",
        402: "insufficient Gnani credits",
        403: f"API key lacks the {service} scope or credits",
    }
    hint = hints.get(resp.status_code)
    return GnaniError(
        f"Gnani {service} error {resp.status_code}{' (' + code + ')' if code else ''}: {msg}" + (f" — {hint}" if hint else ""),
        status=resp.status_code,
        code=code,
    )


def _headers(json_body: bool = False) -> dict:
    key = config.gnani_api_key()
    if not key:
        raise GnaniError("GNANI_API_KEY is not set in .env.")
    h = {"X-API-Key-ID": key}
    if json_body:
        h["Content-Type"] = "application/json"
    return h


def _post(url: str, service: str, timeout: int, **kwargs) -> requests.Response:
    delay = 1.5
    for attempt in range(6):
        with _call_lock:
            try:
                resp = requests.post(url, timeout=timeout, **kwargs)
            except requests.RequestException as e:
                if attempt == 5:
                    raise GnaniError(f"Gnani {service} network error: {e}") from e
                resp = None
        if resp is not None and resp.status_code == 200:
            return resp
        if resp is not None and resp.status_code not in (429, 500, 502, 503):
            raise _error_from_response(resp, service)
        if attempt == 5:
            raise _error_from_response(resp, service) if resp is not None else GnaniError(f"Gnani {service} failed")
        time.sleep(delay)
        delay = min(delay * 2, 12)
    raise GnaniError(f"Gnani {service} failed")


def transcribe(
    wav_bytes: bytes,
    language_code: str = "indic-auto",
    fmt: str = "verbatim",
    topic: str = "",
    previous_text: str = "",
) -> dict:
    """Prisma REST (<=30 s clip). Returns {'transcript', 'language'}."""
    if not wav_bytes:
        raise GnaniError("Empty audio sent to Prisma.")
    data = {"model": config.GNANI_STT_MODEL, "language_code": language_code, "format": fmt}
    if config.GNANI_STT_MODEL == "prisma-v3.0":
        if topic:
            data["topic"] = topic[:1600]
        if previous_text:
            data["previous_text"] = previous_text[-600:]
    resp = _post(
        STT_URL, "Prisma STT", 60,
        headers=_headers(), files={"audio_file": ("clip.wav", wav_bytes, "audio/wav")}, data=data,
    )
    body = resp.json()
    if body.get("success") is False:
        raise GnaniError(f"Gnani Prisma STT error: {body}")
    return {"transcript": body.get("transcript", ""), "language": body.get("detected_language_code", language_code)}


def synthesize(text: str, voice: str, language: str, model: str, speed: float = 1.0) -> bytes:
    """Timbre REST. Returns WAV bytes (44.1 kHz mono 16-bit)."""
    if not text.strip():
        raise GnaniError("Cannot synthesise empty text.")
    payload = {
        "text": text,
        "voice": voice,
        "model": model,
        "language": language,
        "speed": round(max(0.85, min(1.15, speed)), 2),
        "audio_config": {
            "sample_rate": config.SAMPLE_RATE, "num_channels": 1, "sample_width": 2,
            "encoding": "linear_pcm", "container": "wav",
        },
    }
    return _post(TTS_URL, "Timbre TTS", 120, headers=_headers(True), json=payload).content


def create_embedding(wav_bytes: bytes) -> dict:
    """Voice clone embedding from 5-30 s of clean reference audio."""
    resp = _post(
        EMBED_URL, "Voice Clone Embeddings", 120,
        headers=_headers(), files={"audio_file": ("reference.wav", wav_bytes, "audio/wav")},
    )
    body = resp.json()
    emb = (body.get("data") or {}).get("voice_clone_embedding")
    if not emb or "embedding" not in emb:
        raise GnaniError(f"Gnani voice clone embeddings returned no embedding: {json.dumps(body)[:300]}")
    return emb


def synthesize_cloned(text: str, speaker_embedding: dict) -> bytes:
    """vachana-vc-v1 cloned-voice TTS. The endpoint takes no voice/speed/language parameters."""
    if not text.strip():
        raise GnaniError("Cannot synthesise empty text.")
    payload = {
        "text": text,
        "model": "vachana-vc-v1",
        "speaker_embedding": speaker_embedding,
        "audio_config": {
            "sample_rate": config.SAMPLE_RATE, "num_channels": 1, "sample_width": 2,
            "encoding": "linear_pcm", "container": "wav",
        },
    }
    return _post(TTS_URL, "Voice Cloned TTS", 180, headers=_headers(True), json=payload).content
