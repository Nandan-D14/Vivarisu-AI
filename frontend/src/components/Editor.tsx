"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Captions, CircleAlert, Download, LoaderCircle, Plus, Redo2, RefreshCw, Share2, Undo2, X } from "lucide-react";
import { api, mediaUrl } from "@/lib/api";
import { cx, emotionColor, fmtTime } from "@/lib/ui";
import type { Catalog, Health, Project } from "@/types";
import { PublishModal } from "./PublishModal";
import { SceneCard } from "./SceneCard";
import { StylePanel } from "./StylePanel";
import { VideoStudio } from "./VideoStudio";
import { VoicePanel } from "./VoicePanel";

export type EditorTab = "scenes" | "video" | "voice" | "style";

interface Props {
  project: Project;
  catalog: Catalog;
  health: Health | null;
  tab: EditorTab;
  onTab: (t: EditorTab) => void;
  renderTrigger?: number;
  videoExportTrigger?: number;
  onProject: (p: Project) => void;
  onBack: () => void;
}

export function Editor({ project, catalog, health, tab, onTab, renderTrigger = 0, videoExportTrigger = 0, onProject, onBack }: Props) {
  const [time, setTime] = useState(0);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState("");
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const timeMs = time * 1000;
  const current = useMemo(() => project.timeline.find((t) => timeMs >= t.start_ms && timeMs < t.end_ms + 400), [project.timeline, timeMs]);
  const cue = current?.cues.find((c) => timeMs >= c.start_ms && timeMs < c.end_ms);
  const outdated = project.scenes.filter((s) => s.audio_status !== "ready").length;
  const total = project.episode_duration_ms || 1;
  const voiceLabel = project.use_cloned_voice && project.voice_identity ? `${project.voice_identity.name} (cloned)` : project.voice;

  const run = async (fn: () => Promise<Project>) => {
    setBusy(true);
    try { onProject(await fn()); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const renderChanges = async () => {
    setRendering("Starting…");
    setError("");
    try {
      await api.render(project.id, (ev) => {
        if (ev.type === "stage") setRendering(ev.message);
        if (ev.type === "done") onProject(ev.project);
        if (ev.type === "error") {
          setError(ev.message);
          if (ev.project) onProject(ev.project);
        }
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRendering("");
    }
  };

  const seenRenderRef = useRef(renderTrigger);
  useEffect(() => {
    if (seenRenderRef.current !== renderTrigger) {
      seenRenderRef.current = renderTrigger;
      renderChanges();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderTrigger]);

  const seek = (ms: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = ms / 1000;
    audioRef.current.play();
  };

  const iconBtn = "rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent";
  const outline = "flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50";

  const videoMode = tab === "video";

  return (
    <div className={cx(videoMode ? "mx-auto max-w-[1280px] px-6 py-4" : "mx-auto max-w-[960px] px-8 py-6")}>
      <div className="flex items-center gap-2">
        <button onClick={onBack} className={iconBtn} aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <input
            defaultValue={project.title}
            key={project.title}
            onBlur={(e) => e.target.value !== project.title && run(() => api.patchProject(project.id, { title: e.target.value }))}
            className="w-full truncate bg-transparent text-[18px] font-bold text-slate-900 outline-none"
          />
          <div className="text-[12px] text-slate-500">
            {project.scenes.length} scenes · {fmtTime(project.episode_duration_ms)} · {voiceLabel}
            {project.style_profile && " · style learned"}
          </div>
        </div>
        <button disabled={busy || !project.history?.undo} onClick={() => run(() => api.undo(project.id))} className={iconBtn} title="Undo"><Undo2 className="h-4 w-4" /></button>
        <button disabled={busy || !project.history?.redo} onClick={() => run(() => api.redo(project.id))} className={iconBtn} title="Redo"><Redo2 className="h-4 w-4" /></button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        {project.episode_audio_url && (
          <a href={mediaUrl(project.episode_audio_url)} download={`${project.title}.mp3`} className={outline}><Download className="h-3.5 w-3.5" /> MP3</a>
        )}
        {project.video_url && (
          <a href={mediaUrl(project.video_url)} download={`${project.title}.mp4`} className={outline}><Download className="h-3.5 w-3.5" /> MP4</a>
        )}
        {project.srt_url && (
          <a href={mediaUrl(project.srt_url)} download={`${project.title}.srt`} className={outline}><Captions className="h-3.5 w-3.5" /> SRT</a>
        )}
        <button onClick={() => setPublishOpen(true)} className={outline}><Share2 className="h-3.5 w-3.5" /> Publish</button>
        <button
          disabled={!!rendering}
          onClick={renderChanges}
          className={cx(
            "flex max-w-[220px] items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-medium",
            outdated ? "bg-slate-900 text-white hover:bg-slate-800" : "border border-slate-200 text-slate-700 hover:bg-slate-50",
          )}
        >
          {rendering ? <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{rendering || (outdated ? `Render ${outdated} change${outdated > 1 ? "s" : ""}` : "Re-assemble")}</span>
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-800">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}

      {!videoMode && (
        <section className="mt-5 rounded-2xl border border-slate-200 p-4">
          <div className="flex min-h-[88px] items-center justify-center rounded-xl bg-slate-50 px-6 py-5 text-center">
            <p className="text-[19px] leading-snug font-medium text-slate-900">
              {cue?.text ?? <span className="text-slate-400">{project.episode_audio_url ? "Press play to preview with subtitles" : "Render the episode to listen"}</span>}
            </p>
          </div>
          {project.timeline.length > 0 && (
            <div className="relative mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
              {project.timeline.map((t, i) => {
                const s = project.scenes.find((x) => x.id === t.scene_id);
                const start = i === 0 ? 0 : t.start_ms;
                const end = project.timeline[i + 1]?.start_ms ?? total;
                return (
                  <button
                    key={t.scene_id}
                    onClick={() => seek(t.start_ms)}
                    title={`${i + 1}. ${s?.title} · ${s?.emotion}`}
                    className={cx("h-full border-r-2 border-white transition", current?.scene_id === t.scene_id ? "opacity-100" : "opacity-45 hover:opacity-80")}
                    style={{ width: `${((end - start) / total) * 100}%`, background: emotionColor(s?.emotion ?? "neutral") }}
                  />
                );
              })}
              <span className="pointer-events-none absolute top-0 h-full w-0.5 bg-slate-900" style={{ left: `${(timeMs / total) * 100}%` }} />
            </div>
          )}
          {project.episode_audio_url && (
            <audio ref={audioRef} src={mediaUrl(project.episode_audio_url)} controls onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} className="mt-3 h-10 w-full" />
          )}
        </section>
      )}

      <div className={cx("flex items-center gap-6 border-b border-slate-200 text-[13px]", videoMode ? "mt-4" : "mt-6")}>
        {([
          ["scenes", `Scenes (${project.scenes.length})`],
          ["video", "Video Studio"],
          ["voice", "Voice"],
          ["style", "Style & expression"],
        ] as [EditorTab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => onTab(id)}
            className={cx("-mb-px border-b-2 pb-2.5 font-medium transition", tab === id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800")}>
            {label}
          </button>
        ))}
        {tab === "scenes" && (
          <select
            value=""
            onChange={(e) => e.target.value && confirm("Apply this expression preset to every scene?") && run(() => api.presetAll(project.id, e.target.value))}
            className="mb-2 ml-auto rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-600"
          >
            <option value="">Preset for all scenes…</option>
            {Object.entries(catalog.presets).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        )}
      </div>

      <div className={videoMode ? "mt-4" : "mt-5"}>
        {tab === "scenes" && (
          <div className="space-y-3">
            {project.scenes.map((s, i) => (
              <SceneCard key={s.id} project={project} scene={s} index={i} catalog={catalog}
                active={current?.scene_id === s.id} onProject={onProject} onError={setError} />
            ))}
            <button onClick={() => run(() => api.addScene(project.id, null))}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-3 text-[13px] font-medium text-slate-500 hover:border-slate-400 hover:text-slate-900">
              <Plus className="h-4 w-4" /> Add scene
            </button>
          </div>
        )}
        {tab === "video" && <VideoStudio project={project} health={health} exportTrigger={videoExportTrigger} onOpenPublish={() => setPublishOpen(true)} onProject={onProject} onError={setError} />}
        {tab === "voice" && <VoicePanel project={project} catalog={catalog} health={health} onProject={onProject} onError={setError} />}
        {tab === "style" && <StylePanel project={project} onProject={onProject} onError={setError} />}
      </div>
      {publishOpen && <PublishModal project={project} onClose={() => setPublishOpen(false)} onProject={onProject} />}
    </div>
  );
}
