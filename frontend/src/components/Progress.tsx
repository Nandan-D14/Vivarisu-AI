"use client";

import { Check, CircleAlert, LoaderCircle, Minus } from "lucide-react";
import { mediaUrl } from "@/lib/api";
import { cx, emotionColor } from "@/lib/ui";
import type { Scene, StageName, StageStatus } from "@/types";

export interface StageState { status: StageStatus; message: string; done?: number; total?: number }

const STAGES: { id: StageName; label: string; engine: string }[] = [
  { id: "style", label: "Learn delivery style", engine: "Gemini video analysis" },
  { id: "clone", label: "Clone narrator voice", engine: "Gnani voice embeddings" },
  { id: "script", label: "Write & direct scenes", engine: "Gemini" },
  { id: "voice", label: "Perform narration", engine: "Gnani Timbre" },
  { id: "assemble", label: "Assemble episode + subtitles", engine: "FFmpeg" },
];

interface Props {
  title: string;
  stages: Partial<Record<StageName, StageState>>;
  scenes: Scene[];
  error: string;
  onOpenEditor: (() => void) | null;
  onBack: () => void;
}

export function Progress({ title, stages, scenes, error, onOpenEditor, onBack }: Props) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <button onClick={onBack} className="text-xs font-medium text-slate-500 hover:text-slate-900">← Back to Studio</button>
      <h2 className="mt-2 text-2xl font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">Producing your episode…</p>

      <ol className="mt-6 space-y-2.5">
        {STAGES.map((st) => {
          const s = stages[st.id];
          const status = s?.status ?? "pending";
          return (
            <li key={st.id} className={cx("flex items-start gap-3 rounded-xl border bg-white p-4", status === "running" ? "border-cyan-500 ring-3 ring-cyan-500/10" : "border-slate-200")}>
              <span
                className={cx(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  status === "done" && "bg-emerald-100 text-emerald-700",
                  status === "running" && "bg-cyan-50 text-cyan-600",
                  status === "error" && "bg-rose-100 text-rose-600",
                  (status === "pending" || status === "skipped") && "bg-slate-100 text-slate-400",
                )}
              >
                {status === "done" && <Check className="h-3.5 w-3.5" />}
                {status === "running" && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                {status === "error" && <CircleAlert className="h-3.5 w-3.5" />}
                {(status === "pending" || status === "skipped") && <Minus className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={cx("text-sm font-semibold", status === "skipped" ? "text-slate-400" : "text-slate-900")}>{st.label}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{st.engine}</span>
                </div>
                {s?.message && <p className={cx("mt-1 text-xs", status === "error" ? "text-rose-600" : "text-slate-500")}>{s.message}</p>}
                {st.id === "voice" && s?.total ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-slate-900 transition-all" style={{ width: `${((s.done ?? 0) / s.total) * 100}%` }} />
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <b>Stopped:</b> {error}
        </div>
      )}
      {onOpenEditor && (
        <button onClick={onOpenEditor} className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
          Open editor with what was produced
        </button>
      )}

      {scenes.length > 0 && (
        <div className="mt-6 space-y-2">
          {scenes.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <span className="h-8 w-1 rounded-full" style={{ background: emotionColor(s.emotion) }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-slate-900">{i + 1}. {s.title}</div>
                <div className="truncate text-[11px] text-slate-500">{s.emotion} · {s.text}</div>
              </div>
              {s.audio_url && <audio src={mediaUrl(s.audio_url)} controls className="h-8 w-48" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
