"use client";

import { useState } from "react";
import { LoaderCircle, Trash2, Upload, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { cx } from "@/lib/ui";
import type { Catalog, Health, Project } from "@/types";

interface Props { project: Project; catalog: Catalog; health: Health | null; onProject: (p: Project) => void; onError: (m: string) => void }

export function VoicePanel({ project, catalog, health, onProject, onError }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("My narrator");
  const [start, setStart] = useState(0);
  const [seconds, setSeconds] = useState(20);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState("");

  const run = async (label: string, fn: () => Promise<Project>) => {
    setBusy(label);
    try { onProject(await fn()); } catch (e) { onError((e as Error).message); } finally { setBusy(""); }
  };

  const clone = () => {
    if (!file) return;
    if (!consent) return onError("Confirm consent before cloning.");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("learn_style", "false");
    fd.append("clone_voice", "true");
    fd.append("consent", "true");
    fd.append("start_s", String(start));
    fd.append("seconds", String(seconds));
    fd.append("voice_name", name);
    run("clone", () => api.uploadReference(project.id, fd));
  };

  const voices = catalog.voices[project.tts_model] ?? [];
  const ident = project.voice_identity;
  const input = "w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900";

  return (
    <div className="grid items-start gap-4 text-xs text-slate-600 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-slate-900">Gnani Timbre voice</span>
          <select
            value={project.tts_model}
            onChange={(e) => run("model", () => api.patchProject(project.id, { tts_model: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-800"
          >
            <option value="timbre-v3.0">Timbre v3.0 (audio tags)</option>
            <option value="timbre-v2.5">Timbre v2.5 (Kannada voices)</option>
          </select>
        </div>
        <div className="mt-3 grid max-h-80 gap-1 overflow-y-auto pr-1">
          {voices.map((v) => (
            <button
              key={v.name}
              disabled={!!busy}
              onClick={() => run("voice", () => api.patchProject(project.id, { voice: v.name, use_cloned_voice: false }))}
              className={cx(
                "flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition",
                project.voice === v.name && !project.use_cloned_voice ? "bg-slate-100 text-slate-900 ring-1 ring-slate-300" : "hover:bg-slate-100",
              )}
            >
              <UserRound className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-semibold text-slate-900">{v.name}</span>
              <span className="truncate text-[10px] text-slate-500">{v.gender} · {v.persona}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-[13px] font-semibold text-slate-900">Cloned narrator voice</div>
        {ident ? (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-slate-100 px-2.5 py-1.5">
              <span><b className="text-slate-900">{ident.name}</b> <span className="text-[10px] text-slate-500">from {ident.source_file}</span></span>
              <button onClick={() => confirm("Delete this voice identity and its embedding?") && run("delete", () => api.deleteVoice(project.id))} className="text-slate-400 hover:text-rose-600" aria-label="Delete voice">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <label className="flex items-center gap-2 font-medium text-slate-700">
              <input type="checkbox" checked={project.use_cloned_voice} onChange={(e) => run("toggle", () => api.patchProject(project.id, { use_cloned_voice: e.target.checked }))} />
              Narrate with the cloned voice
            </label>
            <p className="text-[10px] leading-relaxed text-slate-500">
              Gnani&apos;s cloned TTS (vachana-vc-v1) has no speed or emotion parameters.
              {health?.vc_inline_tags
                ? " Inline tags are sent as-is; pace is applied by time-stretching."
                : " Expression is emulated: <pauses> become real silences, other tags are dropped, and pace is applied by time-stretching."}
            </p>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-slate-700 hover:bg-slate-100">
              <Upload className="h-3.5 w-3.5" /> {file ? file.name.slice(0, 32) : "Voice sample (audio or video)"}
              <input type="file" accept="audio/*,video/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-3">Name<input value={name} onChange={(e) => setName(e.target.value)} className={input} /></label>
              <label>Start (s)<input type="number" min={0} value={start} onChange={(e) => setStart(Number(e.target.value))} className={input} /></label>
              <label className="col-span-2">Length {seconds}s (5–30)
                <input type="range" min={5} max={30} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className="mt-2 w-full accent-slate-900" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-amber-800"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I own this voice or have the speaker&apos;s permission</label>
            <button disabled={!file || !!busy} onClick={clone} className="flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
              {busy === "clone" && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />} Create voice identity
            </button>
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-400 lg:col-span-2">Changing the voice marks scenes as needing re-voice. Use “Render” in the header to update them.</p>
    </div>
  );
}
