from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app import gnani, render, storage, voices
from backend.app.main import app
from backend.app.models import Project, Scene

client = TestClient(app)


@pytest.fixture
def fake_gnani(monkeypatch, wav_bytes):
    calls = {"tts": [], "vc": []}

    def tts(text, voice, language, model, speed=1.0):
        calls["tts"].append((text, voice, speed))
        return wav_bytes(1.0)

    def vc(text, emb):
        calls["vc"].append(text)
        return wav_bytes(0.5)
    monkeypatch.setattr(gnani, "synthesize", tts)
    monkeypatch.setattr(gnani, "synthesize_cloned", vc)
    return calls


@pytest.fixture
def project():
    p = Project(title="Test", scenes=[
        Scene(title="Hook", text="ಮೊದಲ ದೃಶ್ಯ. <pauses> ಯಾರೋ ಇದ್ದರು.", emotion="mystery", intensity=0.7, pause_before_ms=500),
        Scene(title="Twist", text="ಎರಡನೇ ದೃಶ್ಯ.", emotion="whisper", intensity=0.8),
        Scene(title="End", text="ಮೂರನೇ ದೃಶ್ಯ.", emotion="reflection", intensity=0.3),
    ])
    return storage.save(p)


def test_lead_tag_only_when_untagged_and_intense():
    assert render.tts_text_v3(Scene(text="ಒಳಗೆ", emotion="whisper", intensity=0.8)) == "<whispers> ಒಳಗೆ"
    assert render.tts_text_v3(Scene(text="ಒಳಗೆ", emotion="whisper", intensity=0.3)) == "ಒಳಗೆ"
    assert render.tts_text_v3(Scene(text="<slow> ಒಳಗೆ", emotion="whisper", intensity=0.9)) == "<slow> ಒಳಗೆ"


def test_voice_assemble_and_stale_detection(project, fake_gnani):
    for s in project.scenes:
        render.voice_scene(project, s)
    render.assemble(project)
    storage.save(project)
    assert fake_gnani["tts"][1][0].startswith("<whispers>")
    assert len(project.timeline) == 3 and project.timeline[0].start_ms == 800  # 300 lead + 500 pause
    assert project.episode_audio_url.startswith("/media/") and project.srt_url
    assert all(s.audio_status == "ready" for s in render.refresh_status(project).scenes)

    r = client.patch(f"/api/projects/{project.id}/scenes/{project.scenes[0].id}", json={"pace": 0.9})
    assert r.status_code == 200
    statuses = [s["audio_status"] for s in r.json()["scenes"]]
    assert statuses == ["stale", "ready", "ready"]


def test_cloned_mode_emulates_pauses(project, fake_gnani, monkeypatch):
    ident = voices.save("Me", {"embedding": "x", "shape": [1, 768], "dtype": "torch.bfloat16"}, True, "ref.mp4")
    project.voice_identity, project.use_cloned_voice = ident, True
    scene = render.voice_scene(project, project.scenes[0])
    assert fake_gnani["vc"] == ["ಮೊದಲ ದೃಶ್ಯ.", "ಯಾರೋ ಇದ್ದರು."]  # split on <pauses>, no tags sent
    assert "emulated" in scene.audio_mode
    assert scene.audio_duration_ms >= 1000 + 400  # two 0.5 s clips + inner pause


def test_consent_gate():
    with pytest.raises(PermissionError):
        voices.save("x", {}, False, "a.wav")
    p = storage.save(Project())
    r = client.post(f"/api/projects/{p.id}/reference", data={"clone_voice": "true", "consent": "false", "learn_style": "false"},
                    files={"file": ("a.wav", b"RIFF", "audio/wav")})
    assert r.status_code == 403


def test_structure_edits_and_undo_redo(project):
    pid, ids = project.id, [s.id for s in project.scenes]
    r = client.post(f"/api/projects/{pid}/scenes/{ids[0]}/split", json={"at": len("ಮೊದಲ ದೃಶ್ಯ.")})
    assert [s["text"] for s in r.json()["scenes"][:2]] == ["ಮೊದಲ ದೃಶ್ಯ.", "<pauses> ಯಾರೋ ಇದ್ದರು."]
    r = client.post(f"/api/projects/{pid}/scenes/{ids[0]}/merge-next")
    assert len(r.json()["scenes"]) == 3
    r = client.post(f"/api/projects/{pid}/scenes/reorder", json={"ids": list(reversed(ids))})
    assert [s["id"] for s in r.json()["scenes"]] == list(reversed(ids))
    r = client.post(f"/api/projects/{pid}/preset", json={"preset": "whisper_horror"})
    assert {s["emotion"] for s in r.json()["scenes"]} == {"whisper"}
    r = client.post(f"/api/projects/{pid}/scenes", json={"after_id": ids[1], "title": "New", "text": "x <bogus>"})
    assert r.json()["scenes"][2]["text"] == "x"  # inserted after ids[1], which is now 2nd

    r = client.post(f"/api/projects/{pid}/undo")
    assert len(r.json()["scenes"]) == 3 and r.json()["history"]["redo"] == 1
    r = client.post(f"/api/projects/{pid}/redo")
    assert len(r.json()["scenes"]) == 4


def test_invalid_values_rejected(project):
    sid = project.scenes[0].id
    assert client.patch(f"/api/projects/{project.id}/scenes/{sid}", json={"pace": 3}).status_code in (400, 422)
    assert client.patch(f"/api/projects/{project.id}/scenes/{sid}", json={"emotion": "angry"}).status_code == 400
    assert client.get("/api/projects/ep-missing").status_code == 404


def test_tts_model_switch_fixes_voice(project):
    r = client.patch(f"/api/projects/{project.id}", json={"tts_model": "timbre-v2.5"})
    assert r.json()["voice"] == "Kavin"


def test_catalog_and_health():
    c = client.get("/api/catalog").json()
    assert "<pauses>" in c["tags"] and "Lakshmi" in [v["name"] for v in c["voices"]["timbre-v3.0"]]
    assert set(client.get("/api/health").json()) >= {"gnani_key", "gemini_key", "cloudinary"}


def test_video_studio_upload_and_render(project, fake_gnani, monkeypatch):
    import io
    from PIL import Image

    for s in project.scenes:
        render.voice_scene(project, s)
    render.assemble(project)
    storage.save(project)

    buf = io.BytesIO()
    Image.new("RGB", (640, 480), (40, 120, 200)).save(buf, format="PNG")
    img_bytes = buf.getvalue()

    sid0 = project.scenes[0].id
    r = client.post(
        f"/api/projects/{project.id}/scenes/{sid0}/image",
        files={"file": ("scene1.png", img_bytes, "image/png")},
    )
    assert r.status_code == 200
    assert r.json()["scenes"][0]["image_url"].startswith("/media/")

    r = client.patch(
        f"/api/projects/{project.id}/scenes/{sid0}",
        json={"image_effect": "pan_right", "image_fade": True, "caption_overlay": "Chapter 1"},
    )
    assert r.status_code == 200
    assert r.json()["scenes"][0]["image_effect"] == "pan_right"
    assert r.json()["scenes"][0]["caption_overlay"] == "Chapter 1"

    r = client.patch(f"/api/projects/{project.id}", json={"video_aspect": "16:9", "burn_subtitles": True})
    assert r.status_code == 200 and r.json()["video_aspect"] == "16:9"

    monkeypatch.delenv("CLOUDINARY_URL", raising=False)
    r = client.post(f"/api/projects/{project.id}/video/sync")
    assert r.status_code == 200
    body = r.json()
    assert body["video_url"].startswith("/media/")
    assert body["video_provider"] == "ffmpeg"
    mp4_path = render.project_dir(project.id) / "episode.mp4"
    assert mp4_path.exists() and mp4_path.stat().st_size > 5000

    r = client.delete(f"/api/projects/{project.id}/scenes/{sid0}/image")
    assert r.status_code == 200 and r.json()["scenes"][0]["image_url"] is None

    kit = client.get(f"/api/projects/{project.id}/publish-kit")
    assert kit.status_code == 200
    kbody = kit.json()
    assert kbody["chapters"][0]["time"] == "0:00"
    assert "#GreatIndianAIInternshipChallenge" in kbody["social_post"]
    assert kbody["has_mp4"] is True

    z = client.get(f"/api/projects/{project.id}/export-zip")
    assert z.status_code == 200 and z.headers["content-type"] == "application/zip" and len(z.content) > 5000


