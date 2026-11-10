"""Subtitle cue building and SRT output."""
import re
from typing import List, Sequence, Tuple

from backend.app.models import TimelineCue

_TAG_RE = re.compile(r"<[^<>]{1,20}>")
_SENT_RE = re.compile(r"(?<=[.!?।॥…])\s+")


def strip_tags(text: str) -> str:
    return re.sub(r"\s+", " ", _TAG_RE.sub(" ", text)).strip()


def chunk_text(text: str, max_chars: int = 84) -> List[str]:
    """Split narration into readable subtitle lines (sentence first, then by words)."""
    chunks: List[str] = []
    for sent in _SENT_RE.split(strip_tags(text)):
        sent = sent.strip()
        if not sent:
            continue
        line = ""
        for word in sent.split(" "):
            if line and len(line) + 1 + len(word) > max_chars:
                chunks.append(line)
                line = word
            else:
                line = f"{line} {word}".strip()
        if line:
            chunks.append(line)
    return chunks


def cues_for_span(text: str, start_ms: int, end_ms: int) -> List[TimelineCue]:
    """Distribute a scene's subtitle lines over its speech span proportionally to length."""
    lines = chunk_text(text)
    if not lines or end_ms <= start_ms:
        return []
    total = sum(len(l) for l in lines)
    cues, cursor = [], float(start_ms)
    span = end_ms - start_ms
    for i, line in enumerate(lines):
        dur = span * len(line) / total
        nxt = end_ms if i == len(lines) - 1 else cursor + dur
        cues.append(TimelineCue(start_ms=int(cursor), end_ms=int(nxt), text=line))
        cursor = nxt
    return cues


def _ts(ms: int) -> str:
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def to_srt(cues: List[TimelineCue]) -> str:
    out = []
    for i, c in enumerate(cues, start=1):
        out.append(f"{i}\n{_ts(c.start_ms)} --> {_ts(c.end_ms)}\n{c.text}\n")
    return "\n".join(out)


def _ass_ts(ms: int) -> str:
    h, rem = divmod(max(0, int(ms)), 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h}:{m:02d}:{s:02d}.{ms // 10:02d}"


def _ass_text(text: str) -> str:
    return text.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", "\\N").strip()


def to_ass(
    cues: List[TimelineCue],
    size: Tuple[int, int],
    font: str,
    overlays: Sequence[Tuple[int, int, str, str]] = (),
    show_subtitles: bool = True,
) -> str:
    """ASS script for burn-in. Rendered with libass complex shaping so Indic conjuncts come out right.

    overlays: (start_ms, end_ms, text, kind) with kind "caption" (top banner) or "title" (centred title card).
    """
    w, h = size
    portrait = h > w
    sub_size = 30 if portrait else 36
    cap_size = 34 if portrait else 38
    title_size = 52 if portrait else 58
    margin_v = 90 if portrait else 40
    header = (
        "[Script Info]\nScriptType: v4.00+\n"
        f"PlayResX: {w}\nPlayResY: {h}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Sub,{font},{sub_size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,0,0,0,0,100,100,0,0,3,3,0,2,50,50,{margin_v},1\n"
        f"Style: Caption,{font},{cap_size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,1,0,0,0,100,100,0,0,3,3,0,8,50,50,50,1\n"
        f"Style: Title,{font},{title_size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,3,2,5,80,80,40,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )
    lines = []
    for start, end, text, kind in overlays:
        if text.strip() and end > start:
            style = "Title" if kind == "title" else "Caption"
            lines.append(f"Dialogue: 1,{_ass_ts(start)},{_ass_ts(end)},{style},,0,0,0,,{_ass_text(text)}")
    if show_subtitles:
        for c in cues:
            if c.text.strip() and c.end_ms > c.start_ms:
                lines.append(f"Dialogue: 0,{_ass_ts(c.start_ms)},{_ass_ts(c.end_ms)},Sub,,0,0,0,,{_ass_text(c.text)}")
    return header + "\n".join(lines) + "\n"
