import pytest
import requests

from backend.app import gnani
from backend.app.llm import gemini
from backend.app.models import Scene


class FakeResp:
    def __init__(self, status, body=None, content=b""):
        self.status_code = status
        self._body = body
        self.content = content
        self.text = str(body)

    def json(self):
        if self._body is None:
            raise ValueError("no json")
        return self._body


@pytest.fixture(autouse=True)
def key(monkeypatch):
    monkeypatch.setenv("GNANI_API_KEY", "test-key")
    monkeypatch.setattr(gnani.time, "sleep", lambda *_: None)


def test_auth_error_is_raised_not_mocked(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda *a, **k: FakeResp(401, {"detail": {"error_code": "INVALID_API_KEY", "message": "Unauthorized"}}))
    with pytest.raises(gnani.GnaniError) as e:
        gnani.synthesize("ನಮಸ್ಕಾರ", "Lakshmi", "kn-IN", "timbre-v3.0")
    assert e.value.status == 401 and "INVALID_API_KEY" in str(e.value) and "GNANI_API_KEY" in str(e.value)


def test_rate_limit_is_retried(monkeypatch):
    calls = iter([FakeResp(429, {"detail": {"error_code": "RATE_LIMITED", "message": "busy"}}), FakeResp(200, content=b"RIFFok")])
    monkeypatch.setattr(requests, "post", lambda *a, **k: next(calls))
    assert gnani.synthesize("ನಮಸ್ಕಾರ", "Lakshmi", "kn-IN", "timbre-v3.0") == b"RIFFok"


def test_bad_request_message_surfaces(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda *a, **k: FakeResp(400, {"success": False, "message": "voice not supported"}))
    with pytest.raises(gnani.GnaniError, match="voice not supported"):
        gnani.synthesize("x", "Nalini", "kn-IN", "timbre-v3.0")


def test_missing_key(monkeypatch):
    monkeypatch.setenv("GNANI_API_KEY", "")
    with pytest.raises(gnani.GnaniError, match="GNANI_API_KEY"):
        gnani.synthesize("x", "Lakshmi", "kn-IN", "timbre-v3.0")


def test_speed_is_clamped(monkeypatch):
    seen = {}

    def fake_post(url, **kw):
        seen.update(kw["json"])
        return FakeResp(200, content=b"RIFF")
    monkeypatch.setattr(requests, "post", fake_post)
    gnani.synthesize("x", "Lakshmi", "kn-IN", "timbre-v3.0", speed=1.6)
    assert seen["speed"] == 1.15 and seen["audio_config"]["sample_rate"] == 44100


def test_clean_text_keeps_only_timbre_tags():
    assert gemini.clean_text("a <whispers> b <angry> c  <pauses>") == "a <whispers> b c <pauses>"


def test_write_episode_clamps_llm_output(monkeypatch):
    ep = gemini.LLMEpisode(title="T", scenes=[gemini.LLMScene(
        title="Hook", beat="Hook", text="ಕಥೆ <scream> ಆರಂಭ", emotion="mystery",
        intensity=3, pace=2.0, pause_before_ms=-5, pause_after_ms=99999,
    )])
    monkeypatch.setattr(gemini, "_generate", lambda *a, **k: ep)
    title, scenes = gemini.write_episode("topic", "kn-IN")
    s = scenes[0]
    assert title == "T" and s.text == "ಕಥೆ ಆರಂಭ"
    assert (s.intensity, s.pace, s.pause_before_ms, s.pause_after_ms) == (1.0, 1.15, 0, 5000)


def test_direct_scenes_keeps_unknown_ids(monkeypatch):
    a, b = Scene(text="one"), Scene(text="two")
    out = gemini.LLMDirection(scenes=[gemini.LLMDirected(
        id=a.id, text="one <pauses>", emotion="shock", intensity=0.9, pace=0.9, pause_before_ms=1200, pause_after_ms=500)])
    monkeypatch.setattr(gemini, "_generate", lambda *a, **k: out)
    res = gemini.direct_scenes([a, b], "kn-IN", None)
    assert res[0].emotion == "shock" and res[0].text == "one <pauses>"
    assert res[1].text == "two"


def test_gemini_requires_key(monkeypatch):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(gemini.LLMError, match="GOOGLE_API_KEY"):
        gemini.write_episode("x", "kn-IN")
