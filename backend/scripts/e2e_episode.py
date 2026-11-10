"""Full prompt -> episode check through the running server (real Gemini + Gnani).

Run from repo root with the backend on :8000:  python backend/scripts/e2e_episode.py "topic"
"""
import json
import sys
import time

import requests

API = "http://127.0.0.1:8000/api"


def main(topic: str):
    t0 = time.time()
    last = None
    with requests.post(f"{API}/episodes/generate", data={"topic": topic, "language": "kn-IN", "voice": "Lakshmi", "num_scenes": "5"}, stream=True, timeout=900) as r:
        r.raise_for_status()
        for line in r.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            ev = json.loads(line[6:])
            if ev["type"] == "stage":
                print(f"[{time.time() - t0:5.1f}s] {ev['stage']:9} {ev['status']:8} {ev['message'][:90]}")
            elif ev["type"] == "error":
                raise SystemExit(f"ERROR: {ev['message']}")
            last = ev
    p = last["project"]
    print(f"\nTITLE: {p['title'].encode('ascii', 'replace').decode()}")
    print(f"{len(p['scenes'])} scenes, {p['episode_duration_ms'] / 1000:.1f}s, mp3={p['episode_audio_url']}, srt={p['srt_url']}")
    for s in p["scenes"]:
        print(f"  {s['beat']:<12} {s['emotion']:<10} int={s['intensity']} pace={s['pace']} pause={s['pause_before_ms']}/{s['pause_after_ms']} mode={s['audio_mode']} tags={[t for t in ['<pauses>','<whispers>','<slow>','<excited>','<sigh>','<shouting>'] if t in s['text']]}")
    assert p["status"] == "ready" and p["episode_audio_url"] and all(s["audio_status"] == "ready" for s in p["scenes"])
    print("\nOK project", p["id"])


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "Tumbbad ending explained - Hastar, greed and the grandmother's curse")
