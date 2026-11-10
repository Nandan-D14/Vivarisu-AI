export type Emotion =
  | "neutral" | "mystery" | "suspense" | "fear" | "sadness"
  | "joy" | "excitement" | "shock" | "whisper" | "reflection";

export type ImageEffect = "none" | "zoom_in" | "zoom_out" | "pan_left" | "pan_right";
export type VideoAspect = "16:9" | "9:16";

export interface Scene {
  id: string;
  title: string;
  beat: string;
  text: string;
  emotion: Emotion;
  intensity: number;
  pace: number;
  pause_before_ms: number;
  pause_after_ms: number;
  audio_url: string | null;
  audio_duration_ms: number;
  audio_status: "missing" | "ready" | "stale";
  audio_mode: string | null;
  image_url?: string | null;
  image_effect?: ImageEffect;
  image_fade?: boolean;
  caption_overlay?: string;
}

export interface EmotionPoint { t_sec: number; emotion: string; note: string }

export interface StyleProfile {
  summary: string;
  tone_words: string[];
  energy: "low" | "medium" | "high";
  pace: number;
  typical_pause_ms: number;
  pause_before_reveal_ms: number;
  pause_habits: string;
  emphasis_style: string;
  favoured_tags: string[];
  emotion_timeline: EmotionPoint[];
  transcript_excerpt: string;
  language: string;
  source_file: string;
}

export interface VoiceIdentity { id: string; name: string; consent_confirmed: boolean; created_at: number; source_file: string }

export interface TimelineCue { start_ms: number; end_ms: number; text: string }
export interface TimelineEntry { scene_id: string; start_ms: number; end_ms: number; cues: TimelineCue[] }

export interface Project {
  id: string;
  title: string;
  topic: string;
  notes_transcript: string;
  language: string;
  tts_model: "timbre-v3.0" | "timbre-v2.5";
  voice: string;
  use_cloned_voice: boolean;
  voice_identity: VoiceIdentity | null;
  style_profile: StyleProfile | null;
  scenes: Scene[];
  episode_audio_url: string | null;
  srt_url: string | null;
  episode_duration_ms: number;
  timeline: TimelineEntry[];
  video_url?: string | null;
  video_provider?: string | null;
  video_aspect?: VideoAspect;
  burn_subtitles?: boolean;
  status: "draft" | "generating" | "ready" | "error";
  history?: { undo: number; redo: number };
}

export interface ProjectSummary {
  id: string; title: string; topic: string; status: string; scenes: number; duration_ms: number; updated_at: number; language: string;
}

export interface VoiceOption { name: string; gender: string; persona: string }

export interface Catalog {
  languages: Record<string, string>;
  voices: Record<string, VoiceOption[]>;
  emotions: Emotion[];
  tags: string[];
  presets: Record<string, string>;
}

export interface Health {
  gnani_key: boolean; gemini_key: boolean; cloudinary?: boolean; tts_model: string; stt_model: string; gemini_model: string; vc_inline_tags: boolean;
}

export type StageName = "notes" | "style" | "clone" | "script" | "voice" | "assemble";
export type StageStatus = "pending" | "running" | "done" | "skipped" | "error";

export type ProgressEvent =
  | { type: "stage"; stage: StageName; status: StageStatus; message: string; total?: number; done?: number; transcript?: string }
  | { type: "scene"; scene: Scene; index: number; total: number }
  | { type: "project"; project: Project }
  | { type: "done"; project: Project }
  | { type: "error"; message: string; project?: Project };

export interface PublishKit {
  youtube_title: string;
  youtube_description: string;
  tags: string[];
  chapters: { time: string; title: string }[];
  social_post: string;
  has_mp4: boolean;
  has_mp3: boolean;
  has_srt: boolean;
  video_url?: string | null;
  audio_url?: string | null;
  srt_url?: string | null;
}

