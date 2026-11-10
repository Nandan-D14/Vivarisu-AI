"""Manual end-to-end check against the real Gnani APIs through the running server (no Gemini needed).

Run from repo root with the backend on :8000:  python backend/scripts/e2e_gnani.py
"""
import json
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.app import gnani, storage  # noqa: E402
from backend.app.config import MEDIA_DIR  # noqa: E402
from backend.app.models import Project, Scene  # noqa: E402

API = "http://127.0.0.1:8000/api"


def sse(url):
    last = None
    with requests.post(url, stream=True, timeout=900) as r:
        r.raise_for_status()
        for line in r.iter_lines(decode_unicode=True):
            if line and line.startswith("data: "):
                ev = json.loads(line[6:])
                if ev["type"] == "stage":
                    print(f"  [{ev['stage']}] {ev['status']}: {ev['message']}")
                if ev["type"] == "error":
                    raise SystemExit(f"ERROR: {ev['message']}")
                last = ev
    return last


def main():
    p = storage.save(Project(title="E2E: Agumbe mystery", language="kn-IN", voice="Lakshmi", scenes=[
        Scene(title="ಆರಂಭ", beat="Hook", emotion="mystery", intensity=0.7, pace=0.92, pause_after_ms=600,
              text="ಆಗುಂಬೆ ಘಾಟಿಯ ಆ ಹಳೆಯ ಮನೆಯಲ್ಲಿ ರಾತ್ರಿ ಹನ್ನೆರಡಕ್ಕೆ ದೀಪ ಉರಿಯುತ್ತಿತ್ತು. <pauses> ಆದರೆ ಆ ಮನೆಯಲ್ಲಿ ಯಾರೂ ವಾಸವಿರಲಿಲ್ಲ."),
        Scene(title="ಸುಳಿವು", beat="Clue", emotion="whisper", intensity=0.8, pace=0.9, pause_before_ms=800,
              text="ಬಾಗಿಲಿನ ಹತ್ತಿರ ಒಂದು ಹಳೆಯ ಪತ್ರ ಸಿಕ್ಕಿತು. ಅದರ ಮೇಲೆ ನಮ್ಮ ಹೆಸರೇ ಬರೆದಿತ್ತು."),
        Scene(title="ತಿರುವು", beat="Twist", emotion="shock", intensity=0.9, pace=1.05, pause_before_ms=1200,
              text="<excited> ಆ ಪತ್ರ ಬರೆದದ್ದು ಐವತ್ತು ವರ್ಷಗಳ ಹಿಂದೆ! <pauses> ಹಾಗಾದರೆ ನಮ್ಮ ಬಗ್ಗೆ ಅವರಿಗೆ ಹೇಗೆ ಗೊತ್ತಿತ್ತು?"),
    ]))
    print("project", p.id)

    t = time.time()
    print("1) render (Timbre v3 per scene + FFmpeg assembly)")
    done = sse(f"{API}/projects/{p.id}/render")["project"]
    print(f"   -> {done['episode_duration_ms']} ms episode in {time.time() - t:.1f}s; modes:", {s["audio_mode"] for s in done["scenes"]})
    mp3 = MEDIA_DIR / p.id / "episode.mp3"
    srt = (MEDIA_DIR / p.id / "episode.srt").read_text(encoding="utf-8")
    assert mp3.stat().st_size > 10_000 and "-->" in srt
    print("   srt head:", srt.splitlines()[:3])

    print("2) edit scene 2 -> stale -> re-voice single scene")
    sid = done["scenes"][1]["id"]
    r = requests.patch(f"{API}/projects/{p.id}/scenes/{sid}", json={"pace": 0.86, "emotion": "fear"}).json()
    assert r["scenes"][1]["audio_status"] == "stale"
    r = requests.post(f"{API}/projects/{p.id}/scenes/{sid}/voice").json()
    assert r["scenes"][1]["audio_status"] == "ready"
    print("   ok, new duration", r["episode_duration_ms"])

    print("3) flat vs expressive")
    flat = requests.post(f"{API}/projects/{p.id}/scenes/{sid}/flat").json()
    print("  ", flat["audio_mode"])

    print("4) Prisma round-trip on the episode audio")
    with open(mp3, "rb") as f:
        tr = requests.post(f"{API}/transcribe", files={"audio_file": ("episode.mp3", f, "audio/mpeg")}).json()
    print("   transcript:", tr.get("transcript", tr)[:200])

    print("5) voice clone from the episode (consent given: synthetic Gnani voice)")
    with open(mp3, "rb") as f:
        r = requests.post(f"{API}/projects/{p.id}/reference", data={
            "learn_style": "false", "clone_voice": "true", "consent": "true", "start_s": "0", "seconds": "15",
            "voice_name": "Lakshmi clone"}, files={"file": ("episode.mp3", f, "audio/mpeg")})
    if r.status_code != 200:
        print("   clone failed:", r.status_code, r.text[:300])
        return
    print("   identity:", r.json()["voice_identity"]["id"])

    print("6) do inline tags work with vachana-vc-v1? (transcribe cloned output)")
    from backend.app import voices
    emb = voices.load_embedding(r.json()["voice_identity"]["id"])
    tagged = gnani.synthesize_cloned("ಬಾಗಿಲು ತೆರೆಯಿತು. <whispers> ಒಳಗೆ ಯಾರೂ ಇರಲಿಲ್ಲ.", emb)
    from backend.app.media import audio
    w = audio.to_wav(tagged, MEDIA_DIR / p.id / "vc_tag_probe.wav")
    print("   probe duration", audio.duration_ms(w), "ms; transcript:", gnani.transcribe(w.read_bytes())["transcript"])

    print("7) render whole episode in cloned voice")
    requests.patch(f"{API}/projects/{p.id}", json={"use_cloned_voice": True}).raise_for_status()
    done = sse(f"{API}/projects/{p.id}/render")["project"]
    print("   modes:", {s["audio_mode"] for s in done["scenes"]}, "duration", done["episode_duration_ms"])
    print("DONE", p.id)


if __name__ == "__main__":
    main()
