"use client";

import { useState } from "react";
import { LoaderCircle, Upload, WandSparkles } from "lucide-react";
import { api } from "@/lib/api";
import { emotionColor } from "@/lib/ui";
import type { Project, StyleProfile } from "@/types";

interface Props { project: Project; onProject: (p: Project) => void; onError: (m: string) => void }

export function StylePanel({ project, onProject, onError }: Props) {
  const [style, setStyle] = useState<StyleProfile | null>(project.style_profile);
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [cloneToo, setCloneToo] = useState(false);
  const [consent, setConsent] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState("");

  const [synced, setSynced] = useState(project.style_profile);
  if (synced !== project.style_profile) {
    setSynced(project.style_profile);
    setStyle(project.style_profile);
  }

  const run = async (label: string, fn: () => Promise<Project>) => {
    setBusy(label);
    try { onProject(await fn()); } catch (e) { onError((e as Error).message); } finally { setBusy(""); }
  };

  const learn = () => {
    if (!file && !youtubeUrl.trim()) return;
    if (!file && youtubeUrl.trim()) {
      return run("learn", () => api.learnYoutubeUrl(project.id, youtubeUrl.trim()));
    }
    if (!file) return;
    if (cloneToo && !consent) return onError("Tick the consent box to clone the voice.");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("learn_style", "true");
    fd.append("clone_voice", String(cloneToo));
    fd.append("consent", String(consent));
    run("learn", () => api.uploadReference(project.id, fd));
  };

  const input = "w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900";

  return (
    <div className="grid items-start gap-4 text-xs text-slate-600 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="font-bold text-slate-900">Learn from a YouTube video or file</div>
        <p className="mt-1 text-[11px] text-slate-500">Paste a YouTube link or upload a clip — Gemini extracts pace, pauses, colloquial phrasing and emotion shifts.</p>
        <input
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="https://youtu.be/4Bfikb5TVTk"
          className={`mt-2 ${input}`}
        />
        <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-slate-700 hover:bg-slate-100">
          <Upload className="h-3.5 w-3.5" /> {file ? file.name.slice(0, 32) : "Or upload video / audio file"}
          <input type="file" accept="video/*,audio/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {file && (
          <>
            <label className="mt-2 flex items-center gap-2 font-medium text-slate-700"><input type="checkbox" checked={cloneToo} onChange={(e) => setCloneToo(e.target.checked)} /> Also clone the voice</label>
            {cloneToo && (
              <label className="mt-1 flex items-center gap-2 text-amber-800"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I own this voice or have permission</label>
            )}
          </>
        )}
        <button disabled={(!file && !youtubeUrl.trim()) || !!busy} onClick={learn} className="mt-2 flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
          {busy === "learn" && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />} Analyse reference
        </button>
      </div>

      {style ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 lg:row-span-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900">Learned style</span>
            <span className="text-[10px] text-slate-400">{style.source_file}</span>
          </div>
          <textarea value={style.summary} rows={3} onChange={(e) => setStyle({ ...style, summary: e.target.value })} className={input} />
          <div className="flex flex-wrap gap-1">
            {style.tone_words.map((w) => <span key={w} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">{w}</span>)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label>Energy
              <select value={style.energy} onChange={(e) => setStyle({ ...style, energy: e.target.value as StyleProfile["energy"] })} className={input}>
                {["low", "medium", "high"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label>Pace {style.pace.toFixed(2)}×
              <input type="range" min={0.85} max={1.15} step={0.01} value={style.pace} onChange={(e) => setStyle({ ...style, pace: Number(e.target.value) })} className="mt-2 w-full accent-slate-900" />
            </label>
            <label>Typical pause (ms)
              <input type="number" value={style.typical_pause_ms} onChange={(e) => setStyle({ ...style, typical_pause_ms: Number(e.target.value) })} className={input} />
            </label>
            <label>Before reveal (ms)
              <input type="number" value={style.pause_before_reveal_ms} onChange={(e) => setStyle({ ...style, pause_before_reveal_ms: Number(e.target.value) })} className={input} />
            </label>
          </div>
          <label className="block">Pause habits<input value={style.pause_habits} onChange={(e) => setStyle({ ...style, pause_habits: e.target.value })} className={input} /></label>
          <label className="block">Emphasis<input value={style.emphasis_style} onChange={(e) => setStyle({ ...style, emphasis_style: e.target.value })} className={input} /></label>
          <div className="text-[10px] text-slate-500">Favoured tags: <span className="font-mono text-slate-700">{style.favoured_tags.join(" ") || "—"}</span></div>
          {style.emotion_timeline.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] text-slate-400">Emotion arc in reference</div>
              <div className="space-y-0.5">
                {style.emotion_timeline.map((pt, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="w-10 text-right text-slate-400">{Math.round(pt.t_sec)}s</span>
                    <span className="h-2 w-2 rounded-full" style={{ background: emotionColor(pt.emotion) }} />
                    <span className="font-medium text-slate-700">{pt.emotion}</span>
                    <span className="truncate text-slate-500">{pt.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {style.transcript_excerpt && <p className="text-[11px] italic text-slate-500">“{style.transcript_excerpt}”</p>}
          <button disabled={!!busy} onClick={() => run("save", () => api.patchProject(project.id, { style_profile: style }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-100">
            Save style edits
          </button>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-[12px] text-slate-500">Active preset: <b>Mystery Explainer Kannada</b> colloquial style (ಯಾಕೆ ಅಂತಂದ್ರೆ, ಹೋಗ್ತಿರ್ಬೇಕಾದ್ರೆ, ಬಂದು ನೋಡಿದ್ರೆ, fast 1.05× pacing). Paste another YouTube link or upload a video to override.</p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="font-bold text-slate-900">Re-direct the whole episode</div>
        <p className="mt-1 text-[11px] text-slate-500">Gemini re-assigns emotion, pace, pauses and tags for every scene{style ? " using the learned style" : ""}. Wording stays the same.</p>
        <input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="optional: e.g. calmer start, explosive twist" className={`mt-2 ${input}`} />
        <button disabled={!!busy} onClick={() => run("direct", () => api.directAll(project.id, instruction))} className="mt-2 flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
          {busy === "direct" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />} Re-direct all scenes
        </button>
      </div>
    </div>
  );
}
