import type { Emotion } from "@/types";

export const EMOTION_COLORS: Record<Emotion, string> = {
  neutral: "#64748b",
  mystery: "#8b5cf6",
  suspense: "#6366f1",
  fear: "#0ea5e9",
  sadness: "#3b82f6",
  joy: "#22c55e",
  excitement: "#f59e0b",
  shock: "#ef4444",
  whisper: "#14b8a6",
  reflection: "#a855f7",
};

export const emotionColor = (e: string) => EMOTION_COLORS[e as Emotion] ?? "#64748b";

export const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
