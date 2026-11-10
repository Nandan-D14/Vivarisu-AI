import io
import math
import os
import sys
import tempfile
import wave
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="vivarisu-test-")
os.environ["VIVARISU_DATA_DIR"] = _TMP
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


def make_wav(seconds: float, rate: int = 48000, freq: float = 220.0) -> bytes:
    """Synthetic tone WAV, deliberately not at the app sample rate to exercise normalisation."""
    n = int(seconds * rate)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(
            int(8000 * math.sin(2 * math.pi * freq * i / rate)).to_bytes(2, "little", signed=True) for i in range(n)
        ))
    return buf.getvalue()


@pytest.fixture
def wav_bytes():
    return make_wav
