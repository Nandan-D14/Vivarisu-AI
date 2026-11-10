"use client";

import { useRef, useState } from "react";
import { ArrowRight, ArrowUp, LoaderCircle, Mic, Plus, Square, X } from "lucide-react";
import { api } from "@/lib/api";
import { cx } from "@/lib/ui";
import type { Project } from "@/types";

interface Props {
  project: Project | null;
  onClose: () => void;
  onStartTopic: (topic: string) => void;
  onOpenVoiceClone: () => void;
  onOpenStyleLearn: () => void;
  onOpenTab?: (tab: "scenes" | "video" | "voice" | "style") => void;
  onProject: (p: Project) => void;
  onRenderChanges: () => void;
  onExportVideo?: () => void;
}

interface Msg { role: "assistant" | "user"; text: string }

const CAPABILITIES =
  "I turn a topic or a Kannada voice note into a narrated episode and MP4 video: Gemini writes and directs the scenes, Gnani Timbre performs them with emotion tags, and Video Studio exports MP4 with motion & subtitles. I can also rewrite scenes, change voices, switch aspect ratios, and learn style from a reference video.";

export function AssistantRail({ project, onClose, onStartTopic, onOpenVoiceClone, onOpenStyleLearn, onOpenTab, onProject, onRenderChanges, onExportVideo }: Props) {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);

  const push = (role: Msg["role"], text: string) => setMsgs((m) => [...m, { role, text }]);

  const toggleMic = async () => {
    if (recording) return recorder.current?.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setBusy(true);
        try {
          const { transcript } = await api.transcribe(new Blob(chunks, { type: rec.mimeType }), "note.webm", project?.topic ?? "");
          setInput((v) => (v ? `${v} ${transcript}` : transcript));
        } catch (e) {
          push("assistant", `Transcription failed: ${(e as Error).message}`);
        } finally {
          setBusy(false);
        }
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      push("assistant", "Microphone access was blocked.");
    }
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput("");
    push("user", text);
    setBusy(true);
    try {
      if (!project) {
        const res = await api.chatHomeAgent(text);
        push("assistant", res.reply);
        if (res.ui_action === "start_topic" && (res.suggested_topic || text)) {
          onStartTopic(res.suggested_topic || text);
        } else if (res.ui_action === "open_voice") {
          onOpenVoiceClone();
        } else if (res.ui_action === "open_style") {
          onOpenStyleLearn();
        }
        return;
      }
      const res = await api.chatProjectAgent(project.id, text);
      onProject(res.project);
      push("assistant", res.reply);
      if (res.ui_action === "render_audio") {
        onRenderChanges();
      } else if (res.ui_action === "export_video") {
        onOpenTab?.("video");
        onExportVideo?.();
      } else if (res.ui_action === "open_video") {
        onOpenTab?.("video");
      } else if (res.ui_action === "open_scenes") {
        onOpenTab?.("scenes");
      } else if (res.ui_action === "open_voice") {
        onOpenTab?.("voice");
      } else if (res.ui_action === "open_style") {
        onOpenTab?.("style");
      }
    } catch (e) {
      push("assistant", `Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const suggestions = project
    ? [
        { label: "Make opening more mysterious", run: () => send("Make Scene 1 more mysterious with <pauses>") },
        { label: "Zoom out motion on all clips", run: () => send("Set zoom_out motion effect on all clips") },
        { label: "Export MP4 video", run: () => { onOpenTab?.("video"); onExportVideo?.(); push("assistant", "Exporting your MP4 video in Video Studio…"); } },
        { label: "Render audio changes", run: () => { onRenderChanges(); push("assistant", "Rendering narration changes with Gnani…"); } },
      ]
    : [
        { label: "What can Vivarisu do?", run: () => { push("user", "What can Vivarisu do?"); push("assistant", CAPABILITIES); } },
        { label: "Create my first episode", run: () => onStartTopic("Tumbbad ending explained — Hastar, greed and the grandmother's curse") },
        { label: "Clone my voice", run: onOpenVoiceClone },
        { label: "Learn a narrator's style", run: onOpenStyleLearn },
      ];

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
      <div className="flex items-center justify-between px-3 py-3">
        <button onClick={() => setMsgs([])} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="New chat">
          <Plus className="h-4 w-4" />
        </button>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11.5px] font-semibold text-slate-600">{project ? "Directing" : "Assistant"}</span>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4">
        {msgs.length === 0 ? (
          <div className="m-auto flex flex-col items-center text-center">
            <div className="relative flex h-14 w-14 rotate-[-6deg] items-center justify-center rounded-[18px] bg-gradient-to-br from-cyan-400 via-sky-500 to-violet-500 shadow-[0_8px_20px_-6px_rgba(14,165,233,0.55)]">
              <div className="flex gap-2"><span className="h-3 w-2 rounded-full bg-white" /><span className="h-3 w-2 rounded-full bg-white" /></div>
              <span className="absolute -right-1 -bottom-1 h-4 w-4 rounded-full border-[3px] border-white bg-emerald-500" />
            </div>
            <p className="mt-5 text-[19px] leading-tight font-extrabold tracking-[-0.01em] text-slate-900">Hi there,<br />how can I help?</p>
            {project && <p className="mt-2 max-w-[220px] truncate text-xs text-slate-400">Editing “{project.title}”</p>}
          </div>
        ) : (
          <div className="space-y-2 py-2 text-[13px]">
            {msgs.map((m, i) => (
              <div key={i} className={cx("rounded-2xl px-3 py-2 leading-relaxed", m.role === "user" ? "ml-8 bg-slate-900 text-white" : "mr-4 bg-slate-100 text-slate-700")}>
                {m.text}
              </div>
            ))}
            {busy && <div className="flex items-center gap-1.5 text-xs text-slate-400"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Working…</div>}
          </div>
        )}
      </div>

      <div className="px-3 pb-3">
        <div className="mb-2 space-y-0.5">
          {suggestions.map((s) => (
            <button key={s.label} onClick={s.run} className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-left text-[13px] font-medium text-slate-700 hover:bg-slate-50">
              <ArrowRight className="h-3.5 w-3.5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center border-t border-slate-100 pt-3">
          <div className="flex flex-1 items-center gap-1 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/80 focus-within:bg-white focus-within:ring-slate-300">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={project ? "Direct your scenes…" : "What are you looking for?"}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-900 placeholder-slate-400 outline-none"
          />
          <button onClick={toggleMic} className={cx("rounded-full p-1.5", recording ? "bg-rose-50 text-rose-600" : "text-slate-400 hover:text-slate-700")} title={recording ? "Stop" : "Speak"}>
            {recording ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4" />}
          </button>
          <button onClick={() => send()} disabled={!input.trim() || busy} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white disabled:bg-slate-200" title="Send">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
