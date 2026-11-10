import time
import uuid
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

Emotion = Literal[
    "neutral", "mystery", "suspense", "fear", "sadness",
    "joy", "excitement", "shock", "whisper", "reflection",
]
EMOTIONS: List[str] = list(Emotion.__args__)  # type: ignore[attr-defined]

# Timbre v3.0 inline tags (docs.gnani.ai/api/TTS/tts-audio-tags).
TIMBRE_TAGS = [
    "<pauses>", "<whispers>", "<slow>", "<excited>", "<shouting>", "<sigh>",
    "<exhales>", "<laugh>", "<giggle>", "<sniffles>", "<coughs>", "<yawns>",
    "<clears throat>",
]

SceneAudioStatus = Literal["missing", "ready", "stale"]
ImageEffect = Literal["none", "zoom_in", "zoom_out", "pan_left", "pan_right"]
IMAGE_EFFECTS: List[str] = list(ImageEffect.__args__)  # type: ignore[attr-defined]
VideoAspect = Literal["16:9", "9:16"]


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def now_ms() -> int:
    return int(time.time() * 1000)


class Expression(BaseModel):
    emotion: Emotion = "neutral"
    intensity: float = Field(0.5, ge=0.0, le=1.0)
    pace: float = Field(1.0, ge=0.85, le=1.15)
    pause_before_ms: int = Field(200, ge=0, le=5000)
    pause_after_ms: int = Field(300, ge=0, le=5000)


class Scene(Expression):
    id: str = Field(default_factory=lambda: new_id("scene"))
    title: str = ""
    beat: str = ""
    text: str = ""
    audio_url: Optional[str] = None
    audio_duration_ms: int = 0
    audio_status: SceneAudioStatus = "missing"
    audio_mode: Optional[str] = None  # how expression was actually rendered
    rendered_hash: Optional[str] = None
    image_url: Optional[str] = None
    image_effect: ImageEffect = "zoom_in"
    image_fade: bool = True
    caption_overlay: str = ""


class EmotionPoint(BaseModel):
    t_sec: float
    emotion: str
    note: str = ""


class StyleProfile(BaseModel):
    summary: str = ""
    tone_words: List[str] = []
    energy: Literal["low", "medium", "high"] = "medium"
    pace: float = 1.0
    typical_pause_ms: int = 300
    pause_before_reveal_ms: int = 800
    pause_habits: str = ""
    emphasis_style: str = ""
    favoured_tags: List[str] = []
    emotion_timeline: List[EmotionPoint] = []
    transcript_excerpt: str = ""
    language: str = ""
    source_file: str = ""


class VoiceIdentity(BaseModel):
    id: str
    name: str
    consent_confirmed: bool
    created_at: int
    source_file: str = ""


class TimelineCue(BaseModel):
    start_ms: int
    end_ms: int
    text: str


class TimelineEntry(BaseModel):
    scene_id: str
    start_ms: int
    end_ms: int
    cues: List[TimelineCue] = []


class Project(BaseModel):
    id: str = Field(default_factory=lambda: new_id("ep"))
    title: str = "Untitled episode"
    topic: str = ""
    notes_transcript: str = ""
    language: str = "kn-IN"
    tts_model: str = "timbre-v3.0"
    voice: str = "Lakshmi"
    use_cloned_voice: bool = False
    voice_identity: Optional[VoiceIdentity] = None
    style_profile: Optional[StyleProfile] = None
    scenes: List[Scene] = []
    episode_audio_url: Optional[str] = None
    srt_url: Optional[str] = None
    episode_duration_ms: int = 0
    timeline: List[TimelineEntry] = []
    video_url: Optional[str] = None
    video_provider: Optional[str] = None
    video_aspect: VideoAspect = "16:9"
    burn_subtitles: bool = True
    status: Literal["draft", "generating", "ready", "error"] = "draft"
    created_at: int = Field(default_factory=now_ms)
    updated_at: int = Field(default_factory=now_ms)
