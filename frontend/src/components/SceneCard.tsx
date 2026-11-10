"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, Check, GitCompare, LoaderCircle, Merge, Plus, RefreshCw, Scissors, Trash2, WandSparkles, X,
} from "lucide-react";
import { api, mediaUrl } from "@/lib/api";
import { cx, emotionColor, fmtTime } from "@/lib/ui";
import type { Catalog, Project, Scene } from "@/types";

interface Props {
  project: Project;
  scene: Scene;
  index: number;
  catalog: Catalog;
  active: boolean;
  onProject: (p: Project) => void;
  onError: (msg: string) => void;
}

type Draft = Pick<Scene, "title" | "text" | "emotion" | "intensity" | "pace" | "pause_before_ms" | "pause_after_ms">;

const pick = (s: Scene): Draft => ({
  title: s.title, text: s.text, emotion: s.emotion, intensity: s.intensity, pace: s.pace,
  pause_before_ms: s.pause_before_ms, pause_after_ms: s.pause_after_ms,
});

const STATUS = {
  ready: { label: "Voiced", cls: "bg-emerald-50 text-emerald-700" },
  stale: { label: "Needs re-voice", cls: "bg-amber-50 text-amber-700" },
  missing: { label: "No audio", cls: "bg-slate-100 text-slate-500" },
} as const;

const QUICK = ["More suspense", "Shorter and punchier", "Pause before the reveal", "Whisper the scary part", "More emotional"];
const field = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 outline-none focus:border-slate-400";

export function SceneCard({ project, scene, index, catalog, active, onProject, onError }: Props) {
  const [draft, setDraft] = useState<Draft>(pick(scene));
  const [busy, setBusy] = useState<string>("");
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<Scene | null>(null);
  const [flat, setFlat] = useState<{ audio_url: string; audio_mode: string } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const pid = project.id;

  const [synced, setSynced] = useState(scene);
  if (synced !== scene) {
    setSynced(scene);
    setDraft(pick(scene));
  }
  useEffect(() => {
    if (active) cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const run = async (label: string, fn: () => Promise<Project | void>) => {
    setBusy(label);
    try {
      const p = await fn();
      if (p) onProject(p);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const save = (patch: Partial<Draft>) => {
    const changed = Object.entries(patch).some(([k, v]) => scene[k as keyof Scene] !== v);
    if (changed) run("save", () => api.patchScene(pid, scene.id, patch));
  };

  const insertTag = (tag: string) => {
    const pos = textRef.current?.selectionStart ?? draft.text.length;
    const text = `${draft.text.slice(0, pos).trimEnd()} ${tag} ${draft.text.slice(pos).trimStart()}`.trim();
    setDraft({ ...draft, text });
    save({ text });
  };

  const move = (dir: -1 | 1) => {
    const ids = project.scenes.map((s) => s.id);
    [ids[index + dir], ids[index]] = [ids[index], ids[index + dir]];
    run("move", () => api.reorder(pid, ids));
  };

  const propose = () => instruction.trim() && run("rewrite", async () => setProposal((await api.rewrite(pid, scene.id, instruction)).proposal));

  const isLast = index === project.scenes.length - 1;
  const status = STATUS[scene.audio_status];
  const icon = "rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent";
  const action = "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40";

  return (
    <div ref={cardRef} className={cx("rounded-xl border bg-white p-5 transition", active ? "border-cyan-500 ring-3 ring-cyan-500/10" : "border-slate-200")}>
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: emotionColor(draft.emotion) }} />
        <span className="text-[12px] font-medium text-slate-400">Scene {index + 1}</span>
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onBlur={() => save({ title: draft.title })}
          className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-slate-900 outline-none"
        />
        {busy && <LoaderCircle className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        {scene.beat && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{scene.beat}</span>}
        <span className={cx("rounded-md px-2 py-0.5 text-[11px] font-medium", status.cls)}>{status.label}</span>
        <div className="ml-1 flex items-center">
          <button className={icon} title="Move up" disabled={!!busy || index === 0} onClick={() => move(-1)}><ArrowUp className="h-3.5 w-3.5" /></button>
          <button className={icon} title="Move down" disabled={!!busy || isLast} onClick={() => move(1)}><ArrowDown className="h-3.5 w-3.5" /></button>
          <button className={icon} title="Split at cursor" disabled={!!busy}
            onClick={() => run("split", () => api.split(pid, scene.id, textRef.current?.selectionStart ?? 0))}><Scissors className="h-3.5 w-3.5" /></button>
          <button className={icon} title="Merge with next" disabled={!!busy || isLast} onClick={() => run("merge", () => api.mergeNext(pid, scene.id))}><Merge className="h-3.5 w-3.5" /></button>
          <button className={icon} title="Add scene after" disabled={!!busy} onClick={() => run("add", () => api.addScene(pid, scene.id))}><Plus className="h-3.5 w-3.5" /></button>
          <button className={cx(icon, "hover:text-rose-600")} title="Delete scene" disabled={!!busy}
            onClick={() => confirm("Delete this scene?") && run("delete", () => api.deleteScene(pid, scene.id))}><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {/* Narration */}
      <textarea
        ref={textRef}
        value={draft.text}
        onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        onBlur={() => save({ text: draft.text })}
        rows={Math.min(8, Math.max(3, Math.ceil(draft.text.length / 80)))}
        className="mt-3 w-full resize-y rounded-lg border border-transparent bg-slate-50 px-3.5 py-3 text-[15px] leading-relaxed text-slate-900 outline-none focus:border-slate-300 focus:bg-white"
      />
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[11px] text-slate-400">Insert:</span>
        {catalog.tags.slice(0, 8).map((t) => (
          <button key={t} onMouseDown={(e) => e.preventDefault()} onClick={() => insertTag(t)}
            className="rounded-md border border-slate-200 px-1.5 py-0.5 font-mono text-[10.5px] text-slate-600 hover:border-cyan-400 hover:text-cyan-700">
            {t.replace(/[<>]/g, "")}
          </button>
        ))}
      </div>

      {/* Expression */}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[11px] text-slate-500 sm:grid-cols-5">
        <label className="col-span-2 sm:col-span-1">
          <span className="mb-1 block">Emotion</span>
          <select value={draft.emotion} className={cx(field, "capitalize")}
            onChange={(e) => { const emotion = e.target.value as Scene["emotion"]; setDraft({ ...draft, emotion }); save({ emotion }); }}>
            {catalog.emotions.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 flex justify-between"><span>Intensity</span><span className="text-slate-700">{Math.round(draft.intensity * 100)}%</span></span>
          <input type="range" min={0} max={1} step={0.05} value={draft.intensity}
            onChange={(e) => setDraft({ ...draft, intensity: Number(e.target.value) })}
            onPointerUp={() => save({ intensity: draft.intensity })} onKeyUp={() => save({ intensity: draft.intensity })}
            className="mt-1.5 w-full accent-slate-900" />
        </label>
        <label>
          <span className="mb-1 flex justify-between"><span>Pace</span><span className="text-slate-700">{draft.pace.toFixed(2)}×</span></span>
          <input type="range" min={0.85} max={1.15} step={0.01} value={draft.pace}
            onChange={(e) => setDraft({ ...draft, pace: Number(e.target.value) })}
            onPointerUp={() => save({ pace: draft.pace })} onKeyUp={() => save({ pace: draft.pace })}
            className="mt-1.5 w-full accent-slate-900" />
        </label>
        <label>
          <span className="mb-1 block">Pause before</span>
          <div className="relative">
            <input type="number" min={0} max={5000} step={100} value={draft.pause_before_ms} className={cx(field, "pr-8")}
              onChange={(e) => setDraft({ ...draft, pause_before_ms: Number(e.target.value) })}
              onBlur={() => save({ pause_before_ms: draft.pause_before_ms })} />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[10px] text-slate-400">ms</span>
          </div>
        </label>
        <label>
          <span className="mb-1 block">Pause after</span>
          <div className="relative">
            <input type="number" min={0} max={5000} step={100} value={draft.pause_after_ms} className={cx(field, "pr-8")}
              onChange={(e) => setDraft({ ...draft, pause_after_ms: Number(e.target.value) })}
              onBlur={() => save({ pause_after_ms: draft.pause_after_ms })} />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[10px] text-slate-400">ms</span>
          </div>
        </label>
      </div>

      {/* Footer */}
      <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-3">
        {scene.audio_url && <audio src={mediaUrl(scene.audio_url)} controls className="mr-1 h-8 w-56" />}
        <button className={action} disabled={!!busy} onClick={() => run("voice", () => api.voiceScene(pid, scene.id))}>
          <RefreshCw className="h-3.5 w-3.5" /> {scene.audio_url ? "Re-voice" : "Voice"}
        </button>
        <button className={action} disabled={!!busy} onClick={() => run("flat", async () => setFlat(await api.flat(pid, scene.id)))}>
          <GitCompare className="h-3.5 w-3.5" /> Compare
        </button>
        <button className={cx(action, rewriteOpen && "bg-slate-100 text-slate-900")} onClick={() => setRewriteOpen(!rewriteOpen)}>
          <WandSparkles className="h-3.5 w-3.5" /> AI rewrite
        </button>
        <select value="" onChange={(e) => e.target.value && run("preset", () => api.presetScene(pid, scene.id, e.target.value))}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-600">
          <option value="">Preset…</option>
          {Object.entries(catalog.presets).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        {scene.audio_mode && (
          <span className="ml-auto text-[11px] text-slate-400" title="How the expression was actually rendered">
            {scene.audio_mode} · {fmtTime(scene.audio_duration_ms)}
          </span>
        )}
      </div>

      {flat && (
        <div className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-3 text-[12px] text-slate-600 sm:grid-cols-2">
          <div><div className="mb-1 font-medium text-slate-700">Flat</div><audio src={mediaUrl(flat.audio_url)} controls className="h-8 w-full" /></div>
          <div><div className="mb-1 font-medium text-slate-700">Directed</div>{scene.audio_url ? <audio src={mediaUrl(scene.audio_url)} controls className="h-8 w-full" /> : "Not voiced yet"}</div>
        </div>
      )}

      {rewriteOpen && (
        <div className="mt-3 rounded-lg border border-slate-200 p-3">
          <div className="flex gap-2">
            <input value={instruction} onChange={(e) => setInstruction(e.target.value)} onKeyDown={(e) => e.key === "Enter" && propose()}
              placeholder="Tell the AI what to change in this scene…" className={cx(field, "flex-1 py-2 text-[13px]")} />
            <button disabled={!instruction.trim() || !!busy} onClick={propose}
              className="rounded-lg bg-slate-900 px-3.5 text-[12px] font-medium text-white disabled:bg-slate-200 disabled:text-slate-400">
              {busy === "rewrite" ? "Thinking…" : "Propose"}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button key={q} onClick={() => setInstruction(q)} className="rounded-full border border-slate-200 px-2.5 py-0.5 text-[11px] text-slate-600 hover:border-slate-400">{q}</button>
            ))}
          </div>
          {proposal && (
            <div className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="mb-1 text-[11px] font-medium text-slate-400">Current · {scene.emotion} · {scene.pace}×</div>
                <p className="text-slate-600">{scene.text}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200">
                <div className="mb-1 text-[11px] font-medium text-emerald-700">Proposed · {proposal.emotion} · {proposal.pace}× · {proposal.pause_before_ms}/{proposal.pause_after_ms} ms</div>
                <p className="text-slate-900">{proposal.text}</p>
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <button onClick={() => { const p = proposal; setProposal(null); setRewriteOpen(false); run("save", () => api.patchScene(pid, scene.id, pick(p))); }}
                  className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white">
                  <Check className="h-3.5 w-3.5" /> Accept
                </button>
                <button onClick={() => setProposal(null)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700">
                  <X className="h-3.5 w-3.5" /> Discard
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
