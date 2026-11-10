"""Audio helpers built on the FFmpeg binary bundled with imageio-ffmpeg."""
import io
import subprocess
import wave
from pathlib import Path
from typing import List, Optional, Sequence, Tuple, Union

from backend.app.config import SAMPLE_RATE

Source = Union[Path, bytes]


class AudioError(RuntimeError):
    pass


def ffmpeg_exe() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def _run(args: List[str], stdin: Optional[bytes] = None) -> bytes:
    proc = subprocess.run(
        [ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y", *args],
        input=stdin, capture_output=True,
    )
    if proc.returncode != 0:
        raise AudioError(f"ffmpeg failed: {proc.stderr.decode(errors='ignore')[-500:]}")
    return proc.stdout


def _tempo_filter(tempo: float) -> Optional[str]:
    tempo = round(tempo, 3)
    if abs(tempo - 1.0) < 0.01:
        return None
    return f"atempo={max(0.5, min(2.0, tempo))}"


def to_wav(
    src: Source,
    dst: Path,
    tempo: float = 1.0,
    start_s: float = 0.0,
    max_seconds: Optional[float] = None,
    filters: Sequence[str] = (),
) -> Path:
    """Decode any audio/video into mono 16-bit WAV at SAMPLE_RATE, optionally trimmed / time-stretched."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    args: List[str] = []
    if start_s > 0:
        args += ["-ss", f"{start_s:.2f}"]
    args += ["-i", "pipe:0" if isinstance(src, bytes) else str(src)]
    if max_seconds:
        args += ["-t", f"{max_seconds:.2f}"]
    af = [f for f in (*filters, _tempo_filter(tempo)) if f]
    if af:
        args += ["-af", ",".join(af)]
    args += ["-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-sample_fmt", "s16", str(dst)]
    _run(args, stdin=src if isinstance(src, bytes) else None)
    return dst


def duration_ms(path: Path) -> int:
    with wave.open(str(path), "rb") as w:
        return int(w.getnframes() * 1000 / w.getframerate())


def split_for_stt(path: Path, chunk_seconds: int = 28) -> List[bytes]:
    """Split a normalised WAV into <=chunk_seconds WAV byte blobs (Prisma REST limit is 30 s)."""
    chunks = []
    with wave.open(str(path), "rb") as w:
        rate, width, ch = w.getframerate(), w.getsampwidth(), w.getnchannels()
        per = rate * chunk_seconds
        while True:
            frames = w.readframes(per)
            if not frames:
                break
            buf = io.BytesIO()
            with wave.open(buf, "wb") as o:
                o.setnchannels(ch)
                o.setsampwidth(width)
                o.setframerate(rate)
                o.writeframes(frames)
            if len(frames) >= rate * width:  # skip tails shorter than ~1 s
                chunks.append(buf.getvalue())
    return chunks


def concat(parts: Sequence[Tuple[Optional[Path], int]], dst: Path) -> List[Tuple[int, int]]:
    """Write parts to one WAV. Each part is (clip_path or None, silence_ms_before_clip).

    Returns (start_ms, end_ms) of every clip in the output.
    """
    spans: List[Tuple[int, int]] = []
    bytes_per_ms = SAMPLE_RATE * 2 / 1000
    dst.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(dst), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        cursor_frames = 0
        for clip, silence_ms in parts:
            if silence_ms > 0:
                n = int(silence_ms * bytes_per_ms) // 2
                out.writeframes(b"\x00\x00" * n)
                cursor_frames += n
            if clip is None:
                continue
            with wave.open(str(clip), "rb") as w:
                if (w.getframerate(), w.getnchannels(), w.getsampwidth()) != (SAMPLE_RATE, 1, 2):
                    raise AudioError(f"{clip.name} is not normalised audio")
                frames = w.readframes(w.getnframes())
            start = cursor_frames
            out.writeframes(frames)
            cursor_frames += len(frames) // 2
            spans.append((int(start * 1000 / SAMPLE_RATE), int(cursor_frames * 1000 / SAMPLE_RATE)))
    return spans


def to_mp3(src: Path, dst: Path) -> Path:
    _run(["-i", str(src), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", str(SAMPLE_RATE),
          "-codec:a", "libmp3lame", "-b:a", "160k", str(dst)])
    return dst
