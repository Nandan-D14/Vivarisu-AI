"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import {
  Captions,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clapperboard,
  Download,
  ImagePlus,
  LoaderCircle,
  MoveLeft,
  MoveRight,
  Pause,
  Play,
  RectangleHorizontal,
  RectangleVertical,
  Share2,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Upload,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { api, mediaUrl } from "@/lib/api";
import { cx, emotionColor, fmtTime } from "@/lib/ui";
import type { Health, ImageEffect, Project, Scene, VideoAspect } from "@/types";

interface Props {
  project: Project;
  health: Health | null;
  exportTrigger?: number;
  onOpenPublish?: () => void;
  onProject: (p: Project) => void;
  onError: (msg: string) => void;
}

type Cue = { start_ms: number; end_ms: number; text: string };
type Span = { scene: Scene; start_ms: number; end_ms: number; cues: Cue[] };
type BinItem = { id: string; file: File; url: string };

const EFFECTS: { id: ImageEffect; label: string; Icon: typeof ZoomIn }[] = [
  { id: "zoom_in", label: "Zoom in", Icon: ZoomIn },
  { id: "zoom_out", label: "Zoom out", Icon: ZoomOut },
  { id: "pan_left", label: "Pan left", Icon: MoveLeft },
  { id: "pan_right", label: "Pan right", Icon: MoveRight },
  { id: "none", label: "Still", Icon: Square },
];

const BIN_MIME = "application/x-vivarisu-bin";
const isImage = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name);

function buildSpans(project: Project): Span[] {
  if (project.timeline.length > 0 && project.episode_duration_ms > 0) {
    const map = new Map(project.scenes.map((s) => [s.id, s]));
    const entries = project.timeline.filter((t) => map.has(t.scene_id));
    return entries.map((t, i) => {
      const start_ms = i === 0 ? 0 : t.start_ms;
      const end_ms = entries[i + 1]?.start_ms ?? Math.max(t.end_ms, project.episode_duration_ms);
      return { scene: map.get(t.scene_id)!, start_ms, end_ms: Math.max(start_ms + 400, end_ms), cues: t.cues };
    });
  }
  let cursor = 0;
  return project.scenes.map((scene) => {
    const dur = scene.audio_duration_ms > 0 ? scene.audio_duration_ms : 3500;
    const span = { scene, start_ms: cursor, end_ms: cursor + dur, cues: [] };
    cursor += dur;
    return span;
  });
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx("relative h-5 w-9 shrink-0 rounded-full transition", on ? "bg-cyan-600" : "bg-slate-300")}
    >
      <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all", on ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

const panel = "rounded-2xl border border-slate-200 bg-white";
const label = "text-[11px] font-semibold tracking-wide text-slate-500 uppercase";

export function VideoStudio({ project, health, exportTrigger = 0, onOpenPublish, onProject, onError }: Props) {
  const [selectedId, setSelectedId] = useState(project.scenes[0]?.id ?? "");
  const [playing, setPlaying] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [bin, setBin] = useState<BinItem[]>([]);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [overId, setOverId] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState("");
  const [exportPct, setExportPct] = useState(0);
  const [ready, setReady] = useState(false);
  const [showFinal, setShowFinal] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const binUrls = useRef<string[]>([]);

  const spans = useMemo(() => buildSpans(project), [project]);
  const totalMs = spans.length ? spans[spans.length - 1].end_ms : 1000;
  const hasAudio = !!project.episode_audio_url;
  const aspect: VideoAspect = project.video_aspect ?? "16:9";
  const subs = project.burn_subtitles ?? true;
  const exporting = !!exportMsg;
  const filled = project.scenes.filter((s) => s.image_url).length;
  const staleCount = project.scenes.filter((s) => s.audio_status !== "ready").length;
  // Largest frame of the chosen aspect that fits the stage (container query units).
  const frameStyle: CSSProperties =
    aspect === "9:16"
      ? { height: "min(100cqh, calc(100cqw * 16 / 9))", aspectRatio: "9 / 16" }
      : { width: "min(100cqw, calc(100cqh * 16 / 9))", aspectRatio: "16 / 9" };

  const activeSpan = useMemo(() => spans.find((s) => timeMs >= s.start_ms && timeMs < s.end_ms) ?? spans[0], [spans, timeMs]);
  // While playing, the clip under the playhead is the selected one.
  const focusId = playing && activeSpan ? activeSpan.scene.id : selectedId;
  const selected = project.scenes.find((s) => s.id === focusId) ?? project.scenes[0];
  const selIdx = selected ? project.scenes.findIndex((s) => s.id === selected.id) : 0;
  const selSpan = spans.find((s) => s.scene.id === selected?.id);
  const view = playing ? activeSpan : selSpan ?? activeSpan;
  const viewScene = view?.scene;
  const cue = view?.cues.find((c) => timeMs >= c.start_ms && timeMs < c.end_ms);
  const subtitle = (cue?.text ?? viewScene?.text.replace(/<[^<>]+>/g, "") ?? "").trim();
  const clipT = view ? Math.min(1, Math.max(0, (timeMs - view.start_ms) / Math.max(1, view.end_ms - view.start_ms))) : 0;

  useEffect(() => () => binUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Silent clock when there's no narration yet.
  useEffect(() => {
    if (!playing || hasAudio) return;
    const id = setInterval(() => setTimeMs((t) => (t + 80 >= totalMs ? (setPlaying(false), 0) : t + 80)), 80);
    return () => clearInterval(id);
  }, [playing, hasAudio, totalMs]);

  const seek = useCallback(
    (ms: number, sceneId?: string) => {
      const t = Math.max(0, Math.min(totalMs - 1, ms));
      setTimeMs(t);
      if (sceneId) setSelectedId(sceneId);
      if (audioRef.current && hasAudio) audioRef.current.currentTime = t / 1000;
    },
    [totalMs, hasAudio],
  );

  const toggle = useCallback(() => {
    setShowFinal(false);
    if (playing && activeSpan) setSelectedId(activeSpan.scene.id);
    if (hasAudio && audioRef.current) {
      if (playing) audioRef.current.pause();
      else audioRef.current.play().catch(() => setPlaying(false));
    } else setPlaying((p) => !p);
  }, [hasAudio, playing, activeSpan]);

  const step = useCallback(
    (d: number) => {
      const i = Math.max(0, Math.min(spans.length - 1, selIdx + d));
      if (spans[i]) seek(spans[i].start_ms, spans[i].scene.id);
    },
    [spans, selIdx, seek],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (e.code === "Space") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, step]);

  const setBusyFor = (ids: string[], on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const assign = async (sceneId: string, file: File, latest: Project = project): Promise<Project> => {
    setBusyFor([sceneId], true);
    try {
      const p = await api.uploadSceneImage(latest.id, sceneId, file);
      onProject(p);
      setShowFinal(false);
      return p;
    } finally {
      setBusyFor([sceneId], false);
    }
  };

  const fillEmpty = async (items: BinItem[], from: Project = project) => {
    const empty = from.scenes.filter((s) => !s.image_url);
    const pairs = empty.slice(0, items.length).map((s, i) => [s.id, items[i].file] as const);
    if (!pairs.length) return;
    setBusyFor(pairs.map(([id]) => id), true);
    let latest = from;
    try {
      for (const [id, file] of pairs) latest = await assign(id, file, latest);
      setSelectedId(pairs[0][0]);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusyFor(pairs.map(([id]) => id), false);
    }
  };

  const addToBin = (files: FileList | File[]) => {
    const imgs = Array.from(files).filter(isImage);
    if (!imgs.length) return onError("Those files aren't images. Use JPG, PNG, WebP or GIF.");
    onError("");
    const items = imgs.map((file) => {
      const url = URL.createObjectURL(file);
      binUrls.current.push(url);
      return { id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`, file, url };
    });
    setBin((b) => [...b, ...items]);
    fillEmpty(items);
  };

  const dropOnClip = async (e: DragEvent, sceneId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setOverId(null);
    const binId = e.dataTransfer.getData(BIN_MIME);
    const file = binId ? bin.find((b) => b.id === binId)?.file : Array.from(e.dataTransfer.files).find(isImage);
    if (!file) return;
    setSelectedId(sceneId);
    try { await assign(sceneId, file); } catch (err) { onError((err as Error).message); }
  };

  const patchScene = (sceneId: string, patch: Partial<Scene>) =>
    api.patchScene(project.id, sceneId, patch).then(onProject).catch((e) => onError((e as Error).message));

  const patchProject = (patch: Record<string, unknown>) =>
    api.patchProject(project.id, patch).then(onProject).catch((e) => onError((e as Error).message));

  const removeImage = async (sceneId: string) => {
    setBusyFor([sceneId], true);
    try { onProject(await api.deleteSceneImage(project.id, sceneId)); } catch (e) { onError((e as Error).message); }
    finally { setBusyFor([sceneId], false); }
  };

  const motionForAll = async (effect: ImageEffect) => {
    setBusyFor(["all"], true);
    try {
      let latest = project;
      for (const s of project.scenes) if ((s.image_effect ?? "zoom_in") !== effect) latest = await api.patchScene(project.id, s.id, { image_effect: effect });
      onProject(latest);
    } catch (e) { onError((e as Error).message); }
    finally { setBusyFor(["all"], false); }
  };

  const exportVideo = async () => {
    audioRef.current?.pause();
    setReady(false);
    setExportMsg("Getting ready…");
    setExportPct(3);
    onError("");
    try {
      await api.renderVideo(project.id, (ev) => {
        if (ev.type === "stage") {
          setExportMsg(ev.message);
          if (typeof ev.done === "number" && typeof ev.total === "number") setExportPct(Math.max(3, Math.round((ev.done / Math.max(1, ev.total)) * 95)));
        } else if (ev.type === "done") {
          onProject(ev.project);
          setReady(true);
          setShowFinal(true);
        } else if (ev.type === "error") onError(ev.message);
      });
    } catch (e) { onError((e as Error).message); }
    finally { setExportMsg(""); setExportPct(0); }
  };

  const seenExportRef = useRef(exportTrigger);
  useEffect(() => {
    if (seenExportRef.current !== exportTrigger) {
      seenExportRef.current = exportTrigger;
      exportVideo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportTrigger]);

  const kenburns = (): CSSProperties => {
    const t = playing ? clipT : 0.25;
    switch (viewScene?.image_effect ?? "zoom_in") {
      case "zoom_in": return { transform: `scale(${1 + t * 0.12})` };
      case "zoom_out": return { transform: `scale(${1.12 - t * 0.12})` };
      case "pan_left": return { transform: `scale(1.1) translateX(${(0.5 - t) * 6}%)` };
      case "pan_right": return { transform: `scale(1.1) translateX(${(t - 0.5) * 6}%)` };
      default: return {};
    }
  };

  if (!project.scenes.length) {
    return <div className={cx(panel, "px-6 py-16 text-center text-[13px] text-slate-500")}>Add a scene first. Each scene becomes one clip.</div>;
  }

  return (
    <div className="@container space-y-3">
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) addToBin(e.target.files); e.target.value = ""; }} />

      {/* Top bar */}
      <div className={cx(panel, "flex flex-wrap items-center gap-3 px-4 py-2.5")}>
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
          {([["16:9", "Landscape", RectangleHorizontal], ["9:16", "Portrait", RectangleVertical]] as [VideoAspect, string, typeof RectangleHorizontal][]).map(([val, text, Icon]) => (
            <button
              key={val}
              onClick={() => aspect !== val && patchProject({ video_aspect: val })}
              className={cx("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium", aspect === val ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}
            >
              <Icon className="h-3.5 w-3.5" /> {text}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12.5px] font-medium text-slate-700">
          <Captions className="h-4 w-4 text-slate-500" /> Subtitles
          <Toggle on={subs} onChange={(v) => patchProject({ burn_subtitles: v })} label="Subtitles" />
        </label>
        <span className="text-[12px] text-slate-500">
          {filled}/{project.scenes.length} clips have images · {fmtTime(totalMs)}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {onOpenPublish && (
            <button onClick={onOpenPublish} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50">
              <Share2 className="h-3.5 w-3.5" /> Publish / Share
            </button>
          )}
          {project.video_url && !exporting && (
            <a href={mediaUrl(project.video_url)} download={`${project.title || "video"}.mp4`} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50">
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          )}
          <button onClick={exportVideo} disabled={exporting} className="flex min-w-[124px] items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
            {exporting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Clapperboard className="h-3.5 w-3.5" />}
            {exporting ? `Exporting ${exportPct}%` : project.video_url ? "Export again" : "Export MP4"}
          </button>
        </div>
      </div>

      {exporting && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5">
          <div className="flex justify-between text-[12px] text-slate-600"><span>{exportMsg}</span><span className="tabular-nums">{exportPct}%</span></div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600 transition-all duration-500" style={{ width: `${exportPct}%` }} /></div>
        </div>
      )}

      {ready && !exporting && project.video_url && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <CircleCheck className="h-5 w-5 text-emerald-600" />
          <span className="mr-auto text-[13px] font-medium text-emerald-900">
            Your video is ready{health?.cloudinary && project.video_provider === "cloudinary" ? " and backed up to Cloudinary" : ""}.
          </span>
          <a href={mediaUrl(project.video_url)} download={`${project.title || "video"}.mp4`} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-700">
            <Download className="h-3.5 w-3.5" /> Download MP4
          </a>
          <button onClick={() => setReady(false)} className="rounded p-1 text-emerald-700 hover:bg-emerald-100" aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}

      {!hasAudio ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[12.5px] text-amber-900">
          No narration yet. Click <b>Render changes</b> at the top to add voice-over and timed subtitles.
        </div>
      ) : staleCount > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[12.5px] text-amber-900">
          Narration for {staleCount} clip{staleCount > 1 ? "s is" : " is"} out of date. Click <b>Render changes</b> at the top before exporting so the voice-over matches your script.
        </div>
      ) : null}

      {/* Media · Preview · Clip */}
      <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-[220px_minmax(0,1fr)_260px]">
        {/* Media bin */}
        <aside
          className={cx(panel, "order-2 flex h-[380px] flex-col p-3 @4xl:order-none @4xl:h-[460px]")}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOverId("bin"); } }}
          onDragLeave={() => setOverId(null)}
          onDrop={(e) => { e.preventDefault(); setOverId(null); if (e.dataTransfer.files.length) addToBin(e.dataTransfer.files); }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className={label}>Media</span>
            {bin.length > 0 && filled < project.scenes.length && (
              <button onClick={() => fillEmpty(bin)} className="flex items-center gap-1 text-[11.5px] font-medium text-cyan-700 hover:underline">
                <Wand2 className="h-3 w-3" /> Fill empty
              </button>
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className={cx(
              "flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed py-4 text-[12px] transition",
              overId === "bin" ? "border-cyan-500 bg-cyan-50 text-cyan-800" : "border-slate-200 text-slate-500 hover:border-cyan-400 hover:text-cyan-800",
            )}
          >
            <Upload className="h-4 w-4" />
            <span className="font-medium">Upload images</span>
            <span className="text-[10.5px] text-slate-400">or drop them here</span>
          </button>

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            {bin.length === 0 ? (
              <p className="px-1 text-[11.5px] leading-relaxed text-slate-400">
                New images fill empty clips automatically. Then click an image here to put it on the selected clip, or drag it onto any clip in the timeline.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {bin.map((b) => (
                  <button
                    key={b.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData(BIN_MIME, b.id); e.dataTransfer.effectAllowed = "copy"; }}
                    onClick={() => selected && assign(selected.id, b.file).catch((e) => onError((e as Error).message))}
                    title={`Use on clip ${selIdx + 1}`}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 hover:border-cyan-500"
                  >
                    <img src={b.url} alt={b.file.name} className="h-full w-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">Use on clip {selIdx + 1}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Preview */}
        <section className={cx(panel, "order-1 col-span-2 flex h-[400px] flex-col overflow-hidden @4xl:order-none @4xl:col-span-1 @4xl:h-[460px]")}>
          <div className="relative min-h-0 flex-1 bg-slate-50">
            <div className="absolute inset-0 flex items-center justify-center p-4" style={{ containerType: "size" }}>
            {showFinal && project.video_url ? (
              <video key={project.video_url} src={mediaUrl(project.video_url)} controls playsInline className="rounded-lg bg-black shadow-md" style={frameStyle} />
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => viewScene && dropOnClip(e, viewScene.id)}
                className="relative overflow-hidden rounded-lg bg-slate-900 shadow-md"
                style={frameStyle}
              >
                {viewScene?.image_url ? (
                  <>
                    <img src={mediaUrl(viewScene.image_url)} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-2xl" />
                    <img src={mediaUrl(viewScene.image_url)} alt={viewScene.title} style={kenburns()} className="relative h-full w-full object-contain transition-transform duration-100 ease-linear" />
                  </>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center"
                    style={{ background: `radial-gradient(ellipse at 50% 35%, ${emotionColor(viewScene?.emotion ?? "neutral")}40, #0f172a 72%)` }}
                  >
                    <span className="text-[17px] font-semibold text-white">{viewScene?.title || "Untitled clip"}</span>
                    <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-slate-900"><ImagePlus className="h-3.5 w-3.5" /> Add an image</span>
                  </button>
                )}
                {viewScene?.caption_overlay?.trim() && (
                  <span className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-md bg-black/60 px-3 py-1 text-[12px] font-semibold text-white">{viewScene.caption_overlay}</span>
                )}
                {subs && subtitle && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto line-clamp-2 w-fit max-w-[88%] rounded-md bg-black/70 px-3 py-1 text-center text-[13px] leading-snug text-white">{subtitle}</span>
                )}
              </div>
            )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-3 py-2">
            <button onClick={() => step(-1)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Previous clip (←)"><SkipBack className="h-4 w-4" /></button>
            <button onClick={toggle} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800" title="Play / pause (Space)">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>
            <button onClick={() => step(1)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Next clip (→)"><SkipForward className="h-4 w-4" /></button>
            <span className="ml-1 font-mono text-[12px] text-slate-600 tabular-nums">{fmtTime(timeMs)} <span className="text-slate-400">/ {fmtTime(totalMs)}</span></span>
            {project.video_url && (
              <div className="ml-auto flex rounded-lg bg-slate-100 p-0.5 text-[12px]">
                <button onClick={() => setShowFinal(false)} className={cx("rounded-md px-2.5 py-0.5 font-medium", !showFinal ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>Edit</button>
                <button onClick={() => { audioRef.current?.pause(); setShowFinal(true); }} className={cx("rounded-md px-2.5 py-0.5 font-medium", showFinal ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>Final video</button>
              </div>
            )}
          </div>
        </section>

        {/* Clip settings */}
        {selected && (
          <aside className={cx(panel, "order-3 flex h-[380px] flex-col overflow-hidden @4xl:order-none @4xl:h-[460px]")}>
            <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: emotionColor(selected.emotion) }} />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-slate-500">
                  Clip {selIdx + 1} of {project.scenes.length}
                  {selSpan && ` · ${((selSpan.end_ms - selSpan.start_ms) / 1000).toFixed(1)}s`}
                </div>
                <div className="truncate text-[13.5px] font-semibold text-slate-900">{selected.title || "Untitled clip"}</div>
              </div>
              <button onClick={() => step(-1)} disabled={selIdx === 0} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Previous clip"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={() => step(1)} disabled={selIdx === project.scenes.length - 1} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Next clip"><ChevronRight className="h-4 w-4" /></button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div>
                <div className={cx(label, "mb-2")}>Image</div>
                {selected.image_url ? (
                  <div className="flex items-center gap-2.5">
                    <img src={mediaUrl(selected.image_url)} alt="" className="h-12 w-16 rounded-md object-cover ring-1 ring-slate-200" />
                    <div className="flex flex-col items-start gap-0.5 text-[12px]">
                      <button onClick={() => fileRef.current?.click()} className="font-medium text-cyan-700 hover:underline">Upload another</button>
                      <button onClick={() => removeImage(selected.id)} className="flex items-center gap-1 text-rose-600 hover:underline"><Trash2 className="h-3 w-3" /> Remove</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] text-slate-500">
                    {busy.has(selected.id) ? "Uploading…" : "No image yet. Pick one from Media or drop it on the clip."}
                  </p>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className={label}>Motion</span>
                  <button onClick={() => motionForAll((selected.image_effect ?? "zoom_in") as ImageEffect)} disabled={busy.has("all")} className="text-[11.5px] font-medium text-cyan-700 hover:underline disabled:opacity-40">
                    {busy.has("all") ? "Applying…" : "Apply to all"}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {EFFECTS.map(({ id, label: text, Icon }) => {
                    const on = (selected.image_effect ?? "zoom_in") === id;
                    return (
                      <button
                        key={id}
                        onClick={() => !on && patchScene(selected.id, { image_effect: id })}
                        className={cx("flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] font-medium transition", on ? "border-cyan-500 bg-cyan-50 text-cyan-800" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
                      >
                        <Icon className="h-4 w-4" /> {text}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className={cx(label, "mb-2")}>Title on screen</div>
                <input
                  key={`${selected.id}-${selected.caption_overlay ?? ""}`}
                  defaultValue={selected.caption_overlay ?? ""}
                  maxLength={80}
                  placeholder="Optional, e.g. Chapter 1"
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (selected.caption_overlay ?? "")) patchScene(selected.id, { caption_overlay: v }); }}
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </div>

              <label className="flex items-center justify-between text-[12.5px] font-medium text-slate-700">
                Fade in &amp; out
                <Toggle on={selected.image_fade ?? true} onChange={(v) => patchScene(selected.id, { image_fade: v })} label="Fade in and out" />
              </label>
            </div>
          </aside>
        )}
      </div>

      {/* Timeline */}
      <section className={cx(panel, "p-3")}>
        <div className="mb-2 flex items-center justify-between px-1">
          <span className={label}>Timeline</span>
          <span className="text-[11.5px] text-slate-400">Space play · ← → clips · drag images onto clips</span>
        </div>
        <div className="relative">
          <div
            className="relative h-5 cursor-pointer"
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * totalMs); }}
          >
            {Array.from({ length: 9 }, (_, i) => (i * totalMs) / 8).map((t, i) => (
              <span key={i} className={cx("absolute top-0 font-mono text-[10px] text-slate-400", i === 8 && "-translate-x-full")} style={{ left: `${(t / totalMs) * 100}%` }}>{fmtTime(t)}</span>
            ))}
          </div>
          <div className="relative h-16">
            {spans.map((sp, i) => {
              const on = selected?.id === sp.scene.id;
              return (
                <button
                  key={sp.scene.id}
                  onClick={() => { seek(sp.start_ms, sp.scene.id); setShowFinal(false); }}
                  onDragOver={(e) => { e.preventDefault(); setOverId(sp.scene.id); }}
                  onDragLeave={() => setOverId(null)}
                  onDrop={(e) => dropOnClip(e, sp.scene.id)}
                  title={`${i + 1}. ${sp.scene.title}`}
                  className="absolute inset-y-0 px-0.5"
                  style={{ left: `${(sp.start_ms / totalMs) * 100}%`, width: `${((sp.end_ms - sp.start_ms) / totalMs) * 100}%` }}
                >
                  <span
                    className={cx(
                      "relative block h-full w-full overflow-hidden rounded-lg border-2 transition",
                      overId === sp.scene.id ? "border-cyan-500 ring-4 ring-cyan-100" : on ? "border-cyan-600" : "border-slate-200 hover:border-slate-300",
                    )}
                    style={{ background: `${emotionColor(sp.scene.emotion)}1a` }}
                  >
                    {sp.scene.image_url ? (
                      <img src={mediaUrl(sp.scene.image_url)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <ImagePlus className="absolute top-1/2 left-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-slate-400" />
                    )}
                    <span className="absolute top-1 left-1 rounded bg-white/90 px-1.5 text-[10px] font-semibold text-slate-800">{i + 1}</span>
                    {busy.has(sp.scene.id) && <span className="absolute inset-0 flex items-center justify-center bg-white/70"><LoaderCircle className="h-4 w-4 animate-spin text-cyan-600" /></span>}
                  </span>
                </button>
              );
            })}
            <span className="pointer-events-none absolute -top-5 bottom-0 z-10 w-0.5 -translate-x-1/2 bg-rose-500" style={{ left: `${(timeMs / totalMs) * 100}%` }}>
              <span className="absolute top-0 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-rose-500" />
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-emerald-400/70" style={{ width: hasAudio ? `${(timeMs / totalMs) * 100}%` : 0 }} />
          </div>
        </div>
      </section>

      {hasAudio && (
        <audio
          ref={audioRef}
          src={mediaUrl(project.episode_audio_url)}
          onTimeUpdate={(e) => setTimeMs(e.currentTarget.currentTime * 1000)}
          onPlay={() => setPlaying(true)}
          onPause={() => { if (activeSpan) setSelectedId(activeSpan.scene.id); setPlaying(false); }}
          onEnded={() => { setPlaying(false); setTimeMs(0); }}
          className="hidden"
        />
      )}
    </div>
  );
}
