from pathlib import Path

from backend.app.config import SAMPLE_RATE
from backend.app.media import audio
from backend.app.media.subtitles import chunk_text, cues_for_span, strip_tags, to_srt


def test_to_wav_normalises_and_time_stretches(tmp_path, wav_bytes):
    out = audio.to_wav(wav_bytes(2.0), tmp_path / "a.wav")
    assert abs(audio.duration_ms(out) - 2000) < 30
    fast = audio.to_wav(wav_bytes(2.0), tmp_path / "b.wav", tempo=1.15)
    assert abs(audio.duration_ms(fast) - 2000 / 1.15) < 40


def test_concat_inserts_exact_silences(tmp_path, wav_bytes):
    a = audio.to_wav(wav_bytes(1.0), tmp_path / "a.wav")
    b = audio.to_wav(wav_bytes(0.5), tmp_path / "b.wav")
    spans = audio.concat([(a, 300), (b, 800), (None, 600)], tmp_path / "ep.wav")
    assert spans[0] == (300, 1300)
    assert abs(spans[1][0] - 2100) <= 1 and abs(spans[1][1] - 2600) <= 1
    assert abs(audio.duration_ms(tmp_path / "ep.wav") - 3200) <= 2


def test_mp3_export(tmp_path, wav_bytes):
    a = audio.to_wav(wav_bytes(1.0), tmp_path / "a.wav")
    mp3 = audio.to_mp3(a, tmp_path / "a.mp3")
    assert mp3.stat().st_size > 1000


def test_split_for_stt_respects_limit(tmp_path, wav_bytes):
    long = audio.to_wav(wav_bytes(65.0, freq=330), tmp_path / "long.wav")
    chunks = audio.split_for_stt(long, chunk_seconds=28)
    assert len(chunks) == 3
    assert all(len(c) <= 28 * SAMPLE_RATE * 2 + 100 for c in chunks)


def test_subtitles_strip_tags_and_distribute():
    text = "ಅವನು ಬಾಗಿಲು ತೆರೆದನು. <pauses> <whispers> ಒಳಗೆ ಯಾರೂ ಇರಲಿಲ್ಲ."
    assert "<" not in strip_tags(text)
    lines = chunk_text(text)
    assert lines == ["ಅವನು ಬಾಗಿಲು ತೆರೆದನು.", "ಒಳಗೆ ಯಾರೂ ಇರಲಿಲ್ಲ."]
    cues = cues_for_span(text, 1000, 3000)
    assert cues[0].start_ms == 1000 and cues[-1].end_ms == 3000
    assert all(c.end_ms > c.start_ms for c in cues)
    srt = to_srt(cues)
    assert srt.startswith("1\n00:00:01,000 --> ")


def test_long_sentence_wraps():
    lines = chunk_text(" ".join(["word"] * 60), max_chars=40)
    assert all(len(l) <= 40 for l in lines) and len(lines) > 1
