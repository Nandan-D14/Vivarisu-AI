"""Gemini-backed story intelligence: episode writing, scene rewrites, expression direction,
and delivery-style learning from a reference video/audio or YouTube URL."""
import json
import logging
import mimetypes
import re
import time
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel

from backend.app import config
from backend.app.models import EMOTIONS, IMAGE_EFFECTS, TIMBRE_TAGS, Emotion, EmotionPoint, Project, Scene, StyleProfile

logger = logging.getLogger(__name__)


class LLMError(RuntimeError):
    pass


# ---------- structured output schemas (kept constraint-free for Gemini) ----------

class LLMScene(BaseModel):
    title: str
    beat: str
    text: str
    emotion: Emotion
    intensity: float
    pace: float
    pause_before_ms: int
    pause_after_ms: int


class LLMEpisode(BaseModel):
    title: str
    scenes: List[LLMScene]


class LLMDirected(BaseModel):
    id: str
    text: str
    emotion: Emotion
    intensity: float
    pace: float
    pause_before_ms: int
    pause_after_ms: int


class LLMDirection(BaseModel):
    scenes: List[LLMDirected]


class LLMStyle(BaseModel):
    summary: str
    tone_words: List[str]
    energy: str
    pace: float
    typical_pause_ms: int
    pause_before_reveal_ms: int
    pause_habits: str
    emphasis_style: str
    favoured_tags: List[str]
    emotion_timeline: List[EmotionPoint]
    transcript_excerpt: str
    language: str


# ---------- prompts ----------

_TAG_LIST = " ".join(TIMBRE_TAGS)

_DIRECTOR_RULES = f"""
Expression rules (these drive Gnani Timbre v3.0 speech synthesis):
- emotion: one of {", ".join(EMOTIONS)}.
- intensity: 0.0-1.0 (how strongly the emotion is performed).
- pace: speaking speed 0.85 (slow, drawn-out) to 1.15 (fast, urgent). Mystery Explainer Kannada baseline is brisk (1.03-1.10); use 1.10-1.15 for chases/panic and 0.92-0.98 for eerie reveals.
- pause_before_ms / pause_after_ms: silence around the scene, 0-3000 ms. Keep inter-scene pauses tight (200-450 ms) for flow, and use 700-1200 ms before major twists.
- Inline audio tags go INSIDE text at the exact point the delivery should change. Allowed tags only: {_TAG_LIST}.
  A tag applies from its position until the next tag. <pauses> is a short silence (0.3s) and is never spoken — place <pauses> right before revealing a character name, monster, or twist (e.g. "ಅಂದಂಗೆ ಇವನ ಹೆಸರು <pauses> ಬ್ರಿಯಾನ್ ಅಂತ.").
  Use 1-3 tags per scene, never stack tags back to back, never put a tag as the only content.
""".strip()

_MEK_KANNADA_STYLE = """
MANDATORY KANNADA NARRATION STYLE — "Mystery Explainer Kannada" (ಮಿಸ್ಟರಿ ಎಕ್ಸ್‌ಪ್ಲೈನರ್ ಕನ್ನಡ) blueprint:

1. NEVER write bookish/literary Kannada (ಗ್ರಾಂಥಿಕ ಭಾಷೆ). Write 100% fast-paced Bengaluru/South-Karnataka spoken colloquial Kannada (ಆಡುಮಾತು) with natural vowel elision and verb contractions:
   - Write "ಯಾಕೆ ಅಂತಂದ್ರೆ" (NEVER "ಏಕೆಂದರೆ" or "ಏಕೆ ಅಂದರೆ")
   - Write "ಹೋಗ್ತಿರ್ಬೇಕಾದ್ರೆ / ಮಾಡ್ತಿರ್ಬೇಕಾದ್ರೆ / ನೋಡ್ತಿರ್ಬೇಕಾದ್ರೆ" (NEVER "ಹೋಗುತ್ತಿರುವಾಗ / ಮಾಡುತ್ತಿರುವಾಗ")
   - Write "ಓಡ್ತಾನೇ ಇದಾನೆ / ಮಾಡ್ತಿದ್ದಾನೆ / ಬರ್ತಿರ್ತಾನೆ / ಕಾಯ್ತಿರ್ತಾನೆ" (NEVER "ಓಡುತ್ತಿದ್ದಾನೆ / ಮಾಡುತ್ತಿದ್ದಾನೆ")
   - Write "ಸಿಗಾಕೋಬಿಟ್ಟಿದ್ದಾನೆ / ಕೂತ್ಕೋಬಿಟ್ಟಿದ್ದಾನೆ / ಹಿಡ್ಕೊಬಿಡ್ತಾನೆ / ಬೀಳಿಸಿಬಿಡುತ್ತೆ / ತಪ್ಹೋಗುತ್ತೆ" (reflexive + ಬಿಡು fused)
   - Write "ಆಗಿರುವಂತ / ಇರುವಂತ / ಬರುವಂತ" (drop final -ಹ, NEVER "ಆಗಿರುವಂತಹ")
   - Write "ನನ್ಗೆ / ನಿಮ್ಗೆ / ನನ್ ಜೊತೆ / ಇವನ್ಗೆ" (NEVER "ನನಗೆ / ನಿಮಗೆ / ನನ್ನ ಜೊತೆ")
   - Write "ಮಾಡ್ಸೋದಕ್ಕೆ ಅಂತ / ತಿಳ್ಕೊಬೇಕು ಅಂತಂದ್ರೆ / ನೋಡ್ಬೇಕು / ಹೋಗ್ಬೋದಾಗಿತ್ತು / ಮಾಡ್ತಿರೋದಿಲ್ಲ"

2. Blend everyday English nouns/verbs naturally in Kannada script with Kannada suffixes (code-mixing just like Mystery Explainer Kannada):
   - Examples: "ಮೂವಿ (movie), ಸೀನ್‌ನಲ್ಲಿ (in the scene), ಆಕ್ಚುಲಿ (actually), ಅಟ್ಯಾಕ್ ಮಾಡ್ತಿದಾವೆ, ಬಿಲ್ಡಿಂಗ್ ಒಳಗಡೆ, ಡೆಲಿವರಿ ಮಾಡೋವನು, ಆಪರೇಷನ್ ಮಾಡ್ಸೋದಕ್ಕೆ, ಸೈನ್ ಮಾಡ್ಸ್ಕೊಳ್ಳೋದಕ್ಕೆ, ಕನ್ವರ್ಟ್ ಆಗಿದ್ದಾನೆ, ಚೇಸ್ ಮಾಡ್ಕೊಂಡು, ಕಂಪ್ಲೀಟ್ ಆಗಿ, ವಾರ್ನಿಂಗ್ ಕೊಡ್ತಾರೆ".

3. Use the exact signature connectors and hooks across the episode beats:
   - Scene 1 (Cold Hook + Title Tag): Start straight in the middle of a tense action moment ("ಒಬ್ಬ ಹುಡುಗ ಓಡ್ತಾನೇ ಇದಾನೆ. ಯಾಕೆ ಅಂತಂದ್ರೆ..."). End Scene 1 with the signature hook & title reveal:
     "ಯಾಕೆ ಹಿಂಗಾಯ್ತು ಅಂತ ನೀವು ತಿಳ್ಕೊಬೇಕು ಅಂತಂದ್ರೆ ಈ ಮೂವಿನ ನನ್ ಜೊತೆ ಕೊನೆವರೆಗೂ ನೋಡ್ಬೇಕು. <pauses> ಅಂದಂಗೆ ಈ ಮೂವಿ ಹೆಸರು '[Title]' ಅಂತ."
   - Scene 2 (Setup & Character Intro): Open with "ಮೂವಿಯ ಮೊದಲ ಸೀನ್‌ನಲ್ಲಿ ... ತೋರಿಸ್ತಾರೆ. ಆಕ್ಚುಲಿ ಇವನು..." and introduce the lead with "ಅಂದಂಗೆ ಇವನ ಹೆಸರು <pauses> [Name] ಅಂತ."
   - Middle Scenes (Escalation / Survival / Clues / Twist): Chain actions rapidly using bridge phrases:
     "ಹೀಗೆ ಇವನು ... ಹೋಗ್ತಿರ್ಬೇಕಾದ್ರೆ...", "ಆಗ ನೋಡಿದ್ರೆ...", "ಬಂದು ನೋಡಿದ್ರೆ...", "ಆದ್ರೆ ಇಲ್ಲಿ ಒಂದು ದೊಡ್ಡ ಟ್ವಿಸ್ಟ್ ಇದೆ, ಯಾಕೆ ಅಂತಂದ್ರೆ..."
   - Final Scene (Climax Resolution + Signature Outro): Wrap the climax with "...ಇಲ್ಲಿಗೆ ಈ ಮೂವಿ ಎಂಡ್ ಆಗುತ್ತೆ." Then ask two comment questions and close with the channel sign-off:
     "ಈ ಕಥೆ ಬಗ್ಗೆ ನಿಮ್ಗೇನ್ ಅನ್ನಿಸ್ತು ಅಂತ ನನ್ಗೆ ಕಮೆಂಟ್ ಮಾಡಿ ತಿಳಿಸಿ. ವೀಡಿಯೋ ಇಷ್ಟ ಆಗಿತ್ತು ಅಂತಂದ್ರೆ ಲೈಕ್ ಮಾಡಿ. ಸರಿ ಸಿಗೋಣ ಮತ್ತೊಂದು ಅಮೇಜಿಂಗ್ ಆಗಿರುವಂತ ವೀಡಿಯೋದಲ್ಲಿ. ಅಂಟಿಲ್ ದೆನ್ ಸ್ಟೇ ಟ್ಯೂನ್ಡ್, ವಿವರಿಸು AI ಕನ್ನಡ."
""".strip()

_WRITER_SYSTEM = f"""
You are the head scriptwriter and voice director of "Vivarisu AI" (ವಿವರಿಸು AI), writing in the exact spoken style of the hit YouTube channel "Mystery Explainer Kannada".

{_MEK_KANNADA_STYLE}

Episode rules:
- Structure across scenes: Cold Hook & Title Tag -> Opening Scene & Character Intro -> Inciting Incident -> Escalating Danger / Clues -> Companion / Hidden Truth -> Climax Twist -> Tragic/Shock Resolution & Signature Outro.
- Each scene: 3-5 punchy spoken sentences, roughly 45-85 words. Write numbers as spoken words.
- Keep sentences flowing into each other like a real YouTuber narrating fast over movie clips — never sound like a textbook or formal essay.
- beat: short English label of the beat (e.g. "Cold Hook", "Setup", "Escalation", "Clue", "Twist", "Climax", "Outro").
- title: short catchy Kannada scene title.

{_DIRECTOR_RULES}
""".strip()


def _style_brief(style: Optional[StyleProfile]) -> str:
    if not style:
        return (
            "Default reference style: Mystery Explainer Kannada (https://youtu.be/4Bfikb5TVTk) — "
            "brisk pace (1.04-1.10), tight transitions (250-400 ms), micro-pauses (<pauses>) right before character names and reveals, "
            "and 100% colloquial spoken Kannada with English code-mixing."
        )
    return (
        "Also blend in this narrator's learned delivery style while keeping the colloquial Mystery Explainer Kannada grammar:\n"
        + json.dumps(style.model_dump(exclude={"source_file", "transcript_excerpt"}), ensure_ascii=False)
        + "\nApply their pace as the baseline pace, their pause habits to pause_before_ms/pause_after_ms and <pauses> placement, "
        "their favoured tags, and their emotional shifts to the scene emotions."
    )


# ---------- client ----------

def _client():
    key = config.gemini_api_key()
    if not key:
        raise LLMError("GOOGLE_API_KEY (or GEMINI_API_KEY) is not set in .env. Gemini is required to write and direct scripts.")
    from google import genai
    return genai.Client(api_key=key)


def _generate(contents, schema, system: str, temperature: float = 0.75, model: Optional[str] = None, timeout_s: int = 150):
    """Call Gemini; on overload/timeouts fall through to the fallback models instead of hanging."""
    from google.genai import types
    client = _client()
    primary = model or config.GEMINI_MODEL
    chain = [primary] + [m for m in config.GEMINI_FALLBACK_MODELS if m != primary]
    last_err: Optional[Exception] = None
    for name in chain:
        try:
            cfg_kwargs = dict(
                system_instruction=system,
                temperature=temperature,
                response_mime_type="application/json",
                response_schema=schema,
                http_options=types.HttpOptions(timeout=timeout_s * 1000),
            )
            if "gemini-3" in name or "gemini-4" in name:
                cfg_kwargs["thinking_config"] = types.ThinkingConfig(thinking_level="low")
            resp = client.models.generate_content(model=name, contents=contents, config=types.GenerateContentConfig(**cfg_kwargs))
            parsed = resp.parsed
            if parsed is None:
                parsed = schema.model_validate_json(resp.text or "")
            return parsed
        except Exception as e:  # network / quota / overload / malformed JSON
            last_err = e
            logger.warning("Gemini call failed on %s: %s", name, e)
            if getattr(e, "code", None) in (401, 402, 403):
                break
    raise LLMError(f"Gemini request failed: {last_err}")


# ---------- sanitising ----------

_TAG_RE = re.compile(r"<[^<>]{1,20}>")


def clean_text(text: str) -> str:
    """Drop any tag Timbre would not understand and tidy whitespace."""
    allowed = set(TIMBRE_TAGS)
    text = _TAG_RE.sub(lambda m: m.group(0) if m.group(0) in allowed else "", text)
    return re.sub(r"\s+", " ", text).strip()


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, float(v)))


def _apply_expression(scene: Scene, src) -> Scene:
    scene.text = clean_text(src.text)
    scene.emotion = src.emotion if src.emotion in EMOTIONS else "neutral"
    scene.intensity = round(_clamp(src.intensity, 0.0, 1.0), 2)
    scene.pace = round(_clamp(src.pace, 0.85, 1.15), 2)
    scene.pause_before_ms = int(_clamp(src.pause_before_ms, 0, 5000))
    scene.pause_after_ms = int(_clamp(src.pause_after_ms, 0, 5000))
    return scene


# ---------- public API ----------

def write_episode(
    topic: str,
    language: str,
    notes: str = "",
    style: Optional[StyleProfile] = None,
    num_scenes: int = 8,
) -> tuple[str, List[Scene]]:
    prompt = (
        f"Episode topic / movie or mystery to explain:\n{topic.strip() or '(see notes)'}\n\n"
        f"Creator's spoken notes (transcribed, may be rough):\n{notes.strip() or '(none)'}\n\n"
        f"Language: {language}\nNumber of scenes: {num_scenes}\n\n{_style_brief(style)}"
    )
    ep: LLMEpisode = _generate(prompt, LLMEpisode, _WRITER_SYSTEM)
    if not ep.scenes:
        raise LLMError("Gemini returned no scenes.")
    scenes = []
    for s in ep.scenes:
        scene = _apply_expression(Scene(title=s.title.strip(), beat=s.beat.strip()), s)
        if scene.text:
            scenes.append(scene)
    return ep.title.strip() or topic[:60], scenes


def rewrite_scene(
    scene: Scene,
    instruction: str,
    language: str,
    neighbours: str = "",
    style: Optional[StyleProfile] = None,
) -> Scene:
    prompt = (
        f"Rewrite ONE scene of the episode according to the creator's instruction, keeping the Mystery Explainer Kannada spoken colloquial style.\n"
        f"Instruction: {instruction}\n\nLanguage: {language}\n"
        f"Surrounding scenes for continuity:\n{neighbours or '(none)'}\n\n"
        f"Current scene JSON:\n{scene.model_dump_json(include={'title', 'beat', 'text', 'emotion', 'intensity', 'pace', 'pause_before_ms', 'pause_after_ms'})}\n\n"
        f"{_style_brief(style)}\nKeep the same beat unless the instruction says otherwise. Return the full revised scene."
    )
    out: LLMScene = _generate(prompt, LLMScene, _WRITER_SYSTEM, temperature=0.7)
    proposal = scene.model_copy(deep=True)
    proposal.title = out.title.strip() or scene.title
    proposal.beat = out.beat.strip() or scene.beat
    return _apply_expression(proposal, out)


def direct_scenes(scenes: List[Scene], language: str, style: Optional[StyleProfile], instruction: str = "") -> List[Scene]:
    """Re-assign expression (emotion/pace/pauses/inline tags) for every scene without changing the story."""
    payload = [s.model_dump(include={"id", "beat", "text", "emotion", "intensity", "pace", "pause_before_ms", "pause_after_ms"}) for s in scenes]
    prompt = (
        "Re-direct the performance of this episode. Keep every sentence's wording; you may only move, add or remove inline audio tags "
        "and change emotion, intensity, pace and pauses so the whole episode has a deliberate emotional arc.\n"
        f"Extra direction from the creator: {instruction or '(none)'}\nLanguage: {language}\n\n{_style_brief(style)}\n\n"
        f"Scenes:\n{json.dumps(payload, ensure_ascii=False)}\nReturn every scene with its original id."
    )
    out: LLMDirection = _generate(prompt, LLMDirection, _WRITER_SYSTEM, temperature=0.5)
    by_id = {d.id: d for d in out.scenes}
    result = []
    for s in scenes:
        d = by_id.get(s.id)
        result.append(_apply_expression(s.model_copy(deep=True), d) if d else s)
    return result


_STYLE_SYSTEM = f"""
You are a voice-performance and script-style analyst. Study HOW the main speaker in this media delivers and phrases their narration — not just what the story is.
Listen for: speaking speed, energy, colloquial phrasing/connectors, where and how long they pause, how they build suspense, how they emphasise words,
when they whisper / get excited / slow down, and how their emotion shifts over time.
Return:
- summary: 2-3 sentences describing both the vocal delivery and signature spoken phrases/connectors so another writer/narrator can imitate it.
- tone_words: 3-6 adjectives.
- energy: low | medium | high.
- pace: their speaking speed mapped to 0.85 (very slow) .. 1.15 (very fast).
- typical_pause_ms and pause_before_reveal_ms: estimated silence lengths.
- pause_habits, emphasis_style: short descriptions (include signature transition phrases if heard).
- favoured_tags: which of these Timbre tags best reproduce their delivery: {_TAG_LIST}.
- emotion_timeline: 4-12 points (t_sec, emotion from {", ".join(EMOTIONS)}, short note).
- transcript_excerpt: first ~2 sentences they say, verbatim.
- language: BCP-47 code of the spoken language (e.g. kn-IN).
""".strip()


def _normalize_style(out: LLMStyle, source_label: str) -> StyleProfile:
    data = out.model_dump()
    data["energy"] = data["energy"] if data["energy"] in ("low", "medium", "high") else "medium"
    data["pace"] = round(_clamp(data["pace"], 0.85, 1.15), 2)
    data["typical_pause_ms"] = int(_clamp(data["typical_pause_ms"], 0, 3000))
    data["pause_before_reveal_ms"] = int(_clamp(data["pause_before_reveal_ms"], 0, 4000))
    data["favoured_tags"] = [t for t in data["favoured_tags"] if t in TIMBRE_TAGS]
    data["source_file"] = source_label
    return StyleProfile.model_validate(data)


def analyze_reference(media_path: Path) -> StyleProfile:
    from google.genai import types
    client = _client()
    mime = mimetypes.guess_type(media_path.name)[0] or "video/mp4"
    size = media_path.stat().st_size
    if size < 18 * 1024 * 1024:
        part = types.Part.from_bytes(data=media_path.read_bytes(), mime_type=mime)
    else:
        uploaded = client.files.upload(file=str(media_path), config={"mime_type": mime})
        deadline = time.time() + 300
        while getattr(uploaded.state, "name", str(uploaded.state)) == "PROCESSING":
            if time.time() > deadline:
                raise LLMError("Gemini took too long to process the reference video.")
            time.sleep(3)
            uploaded = client.files.get(name=uploaded.name)
        if getattr(uploaded.state, "name", str(uploaded.state)) == "FAILED":
            raise LLMError("Gemini could not process the reference video.")
        part = uploaded
    out: LLMStyle = _generate([part, "Analyse the narrator's delivery and phrasing style."], LLMStyle, _STYLE_SYSTEM, temperature=0.2)
    return _normalize_style(out, media_path.name)


def analyze_youtube_url(url: str) -> StyleProfile:
    """Learn delivery and phrasing style directly from a public YouTube URL via Gemini."""
    from google.genai import types
    u = url.strip()
    if not re.match(r"^https?://(www\.)?(youtube\.com|youtu\.be)/", u):
        raise ValueError("Provide a valid YouTube URL (youtube.com or youtu.be).")
    part = types.Part.from_uri(file_uri=u, mime_type="video/*")
    out: LLMStyle = _generate([part, "Analyse the narrator's delivery, colloquial phrasing, and pacing style."], LLMStyle, _STYLE_SYSTEM, temperature=0.2)
    return _normalize_style(out, u)


# ---------- studio AI agent ----------

class LLMAgentSceneUpdate(BaseModel):
    id: str
    title: str
    beat: str
    text: str
    emotion: Emotion
    intensity: float
    pace: float
    pause_before_ms: int
    pause_after_ms: int
    image_effect: str
    caption_overlay: str


class LLMAgentPlan(BaseModel):
    reply: str
    updated_scenes: List[LLMAgentSceneUpdate]
    added_scenes: List[LLMScene]
    deleted_scene_ids: List[str]
    set_voice: str
    set_video_aspect: str
    set_burn_subtitles: str
    ui_action: str


class LLMHomeAgentPlan(BaseModel):
    reply: str
    suggested_topic: str
    ui_action: str


_AGENT_PROJECT_SYSTEM = f"""
You are the built-in AI Studio Agent for "Vivarisu AI" (ವಿವರಿಸು AI), a Kannada/Indian-language episode & video studio powered by Gemini and Gnani Timbre v3.0.
You can answer questions AND directly edit the open project:
- Modify specific scenes in `updated_scenes` (ONLY include scenes that actually need changes; leave `updated_scenes` empty `[]` if no scene changes are needed).
  Keep `text` and `pace` unchanged on a scene unless the user's request asks to rewrite wording, add/move inline tags, or change speed.
  `image_effect` must be one of: {", ".join(IMAGE_EFFECTS)}.
- Append new scenes in `added_scenes` (written in colloquial Mystery Explainer Kannada style if language is kn-IN).
- Remove scenes by ID in `deleted_scene_ids`.
- Change voice (`set_voice`: one of Lakshmi, Vasudha, Yashraj, Shubham, Avinash, Prakash, Devansh, Harshad, Shivani, Kalpana, Chetana, Riyaa, Tarika, Kavin, Saanvi, or "" to keep current).
- Change video aspect ratio (`set_video_aspect`: "16:9", "9:16", or "" to keep current).
- Toggle burned-in subtitles (`set_burn_subtitles`: "true", "false", or "" to keep current).
- Trigger a studio action in `ui_action`:
  - "render_audio" if the user asks to render/voice narration changes
  - "export_video" if the user asks to export/render the MP4 video
  - "open_video" if the user asks to open Video Studio
  - "open_scenes" if the user asks to open Scenes tab
  - "open_voice" if the user asks to open Voice tab
  - "open_style" if the user asks to open Style tab
  - "none" otherwise.
- Keep `reply` concise (1-2 sentences) telling the user what you did or answering their question. Write `reply` in the same language the user wrote in (English by default); only scene `text` is in the project language.

{_MEK_KANNADA_STYLE}

{_DIRECTOR_RULES}
""".strip()


_AGENT_HOME_SYSTEM = """
You are the built-in AI Studio Agent for "Vivarisu AI" (ವಿವರಿಸು AI), a Kannada & Indian-language narrated episode and video studio powered by Gemini + Gnani Timbre v3.0 + FFmpeg/Cloudinary Video Studio.
Reply in the same language the user wrote in (English by default).
When the user chats from the Home screen:
- If they ask a question (e.g. "hi", "what can you do?", "how do I make a video?", "what voices exist?"), answer concisely in `reply` (1-3 sentences), set `suggested_topic` to "", and `ui_action` to "none".
- If they ask to create/write/explain a movie, mystery, story, or topic (e.g. "Explain Kantara ending", "Tumbbad story"), put a clean topic prompt in `suggested_topic`, set `ui_action` to "start_topic", and confirm in `reply`.
- If they ask to clone a voice, set `ui_action` to "open_voice".
- If they ask to learn a narrator's style from a video/YouTube link, set `ui_action` to "open_style".
""".strip()


def agent_project(project: Project, message: str) -> LLMAgentPlan:
    scenes_payload = [
        {
            "index": i + 1,
            "id": s.id,
            "title": s.title,
            "beat": s.beat,
            "text": s.text,
            "emotion": s.emotion,
            "intensity": s.intensity,
            "pace": s.pace,
            "pause_before_ms": s.pause_before_ms,
            "pause_after_ms": s.pause_after_ms,
            "image_effect": s.image_effect,
            "caption_overlay": s.caption_overlay,
            "has_image": bool(s.image_url),
            "audio_status": s.audio_status,
        }
        for i, s in enumerate(project.scenes)
    ]
    prompt = (
        f"Project title: {project.title}\n"
        f"Topic: {project.topic}\n"
        f"Language: {project.language} | Voice: {project.voice} ({project.tts_model}) | "
        f"Video aspect: {project.video_aspect} | Subtitles: {project.burn_subtitles}\n"
        f"{_style_brief(project.style_profile)}\n\n"
        f"Current scenes ({len(project.scenes)}):\n{json.dumps(scenes_payload, ensure_ascii=False)}\n\n"
        f"User request: {message.strip()}"
    )
    return _generate(prompt, LLMAgentPlan, _AGENT_PROJECT_SYSTEM, temperature=0.4, model=config.GEMINI_AGENT_MODEL, timeout_s=60)


def agent_home(message: str) -> LLMHomeAgentPlan:
    return _generate(f"User message: {message.strip()}", LLMHomeAgentPlan, _AGENT_HOME_SYSTEM, temperature=0.4, model=config.GEMINI_AGENT_MODEL, timeout_s=45)
