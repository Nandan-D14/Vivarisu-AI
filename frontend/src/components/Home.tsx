"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, AudioLines, Check, ChevronRight, CircleAlert, Clapperboard, Film, Ghost, Languages, LoaderCircle, Mic, Rocket, Search,
  Sparkles, Square, Trees, Upload, UserRound, Video, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { cx, fmtTime } from "@/lib/ui";
import type { Catalog, Health, ProjectSummary } from "@/types";

const TEMPLATES = [
  { title: "Movie Climax Breakdown", prompt: "Tumbbad ending explained — Hastar, greed and the grandmother's curse", from: "#f97316", to: "#be123c", glow: "#fde68a", Icon: Clapperboard },
  { title: "Folklore Mystery", prompt: "Kantara climax: what really happened to Shiva in the forest?", from: "#059669", to: "#134e4a", glow: "#a7f3d0", Icon: Trees },
  { title: "Thriller Clues Explained", prompt: "Drishyam hidden clues — how Georgekutty built the perfect alibi", from: "#6366f1", to: "#3b0764", glow: "#c7d2fe", Icon: Search },
  { title: "True Karnataka Mystery", prompt: "A true Karnataka mystery: the abandoned house on the Agumbe ghat", from: "#0284c7", to: "#1e3a8a", glow: "#bae6fd", Icon: Film },
  { title: "Midnight Horror Story", prompt: "Original horror story: the bus conductor who heard his name at midnight", from: "#334155", to: "#020617", glow: "#94a3b8", Icon: Ghost },
  { title: "Sci-Fi Explainer", prompt: "Interstellar's fifth-dimension library scene explained in simple Kannada", from: "#c026d3", to: "#4c1d95", glow: "#f5d0fe", Icon: Rocket },
];

export interface GenerateRequest {
  topic: string;
  language: string;
  voice: string;
  numScenes: number;
  reference: File | null;
  referenceUrl: string;
  voiceSample: File | null;
  consent: boolean;
}

export type FocusTarget = "voice" | "style" | "prompt" | null;

interface Props {
  catalog: Catalog | null;
  health: Health | null;
  recent: ProjectSummary[];
  presetTopic: string;
  focus: FocusTarget;
  focusKey: number;
  onGenerate: (req: GenerateRequest) => void;
  onOpen: (id: string) => void;
  onSeeAll: () => void;
}

function StepCard({ n, title, Icon, desc, done, active, footer, onClick, children }: {
  n: number; title: string; Icon: typeof Film; desc: string; done: boolean; active: boolean; footer: string;
  onClick: () => void; children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className={cx(
        "flex min-h-[188px] cursor-pointer flex-col rounded-xl bg-white p-3.5 transition",
        active ? "shadow-[0_0_0_1.5px_#06b6d4,0_6px_20px_-8px_rgba(6,182,212,0.35)]" : "shadow-[0_0_0_1px_rgba(15,23,42,0.07)] hover:shadow-[0_0_0_1px_rgba(15,23,42,0.14)]",
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cx("flex h-4 w-4 items-center justify-center rounded-full border-[1.5px]", done ? "border-cyan-600 bg-cyan-600 text-white" : active ? "border-cyan-500" : "border-slate-300")}>
          {done && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
        </span>
        <span className="text-[10px] font-bold tracking-[0.08em] text-slate-400">STEP {n}</span>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-900">
        <Icon className="h-4 w-4 shrink-0 text-slate-500" /> <span className="truncate">{title}</span>
      </div>
      <p className="mt-1 line-clamp-3 text-[11.5px] leading-[1.45] text-slate-500">{desc}</p>
      <div className="mt-auto pt-3" onClick={(e) => e.stopPropagation()}>{children}</div>
      <div className="mt-2 truncate text-[10.5px] text-slate-400">{footer}</div>
    </div>
  );
}

const field = "w-full rounded-lg border border-slate-200 bg-white px-2 py-[5px] text-[12px] text-slate-800 outline-none focus:border-slate-400";
const darkBtn = "w-full rounded-lg bg-slate-900 py-[7px] text-[12px] font-medium text-white transition hover:bg-slate-800";
const lightBtn = "w-full rounded-lg bg-slate-100 py-[7px] text-[12px] font-medium text-slate-800 transition hover:bg-slate-200";

export function Home({ catalog, health, recent, presetTopic, focus, focusKey, onGenerate, onOpen, onSeeAll }: Props) {
  const [topic, setTopic] = useState(presetTopic);
  const [language, setLanguage] = useState("kn-IN");
  const [voice, setVoice] = useState("Lakshmi");
  const [numScenes, setNumScenes] = useState(8);
  const [reference, setReference] = useState<File | null>(null);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [sample, setSample] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState({ voice: false, settings: false });
  const [step, setStep] = useState(1);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState("");

  const recorder = useRef<MediaRecorder | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const refInput = useRef<HTMLInputElement>(null);
  const sampleInput = useRef<HTMLInputElement>(null);
  const noteInput = useRef<HTMLInputElement>(null);

  const [seen, setSeen] = useState({ presetTopic, focusKey });
  if (seen.presetTopic !== presetTopic || seen.focusKey !== focusKey) {
    setSeen({ presetTopic, focusKey });
    if (presetTopic) { setTopic(presetTopic); setStep(4); }
    if (focus === "voice") setStep(1);
    if (focus === "style") setStep(2);
    if (focus === "prompt") setStep(4);
  }

  useEffect(() => {
    if (focus === "prompt" || presetTopic) promptRef.current?.focus();
  }, [focusKey, focus, presetTopic]);

  const transcribe = async (blob: Blob, name: string) => {
    setTranscribing(true);
    setError("");
    try {
      const { transcript } = await api.transcribe(blob, name, topic);
      setTopic((t) => (t ? `${t}\n${transcript}` : transcript));
      setStep(4);
    } catch (e) {
      setError(`Transcription failed: ${(e as Error).message}`);
    } finally {
      setTranscribing(false);
    }
  };

  const toggleRecord = async () => {
    if (recording) return recorder.current?.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        transcribe(new Blob(chunks, { type: rec.mimeType }), "note.webm");
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Microphone access was blocked.");
    }
  };

  const blocked = !health?.gemini_key || !health?.gnani_key;
  const submit = (override?: string) => {
    const t = (override ?? topic).trim();
    if (!t) return promptRef.current?.focus();
    if (blocked) return setError("Add the missing API key in .env and restart the backend first.");
    if (sample && !consent) {
      setStep(1);
      return setError("Confirm you have permission to clone this voice (Step 1).");
    }
    onGenerate({ topic: t, language, voice, numScenes, reference, referenceUrl, voiceSample: sample, consent });
  };

  const voices = catalog?.voices["timbre-v3.0"] ?? [];
  const langName = catalog?.languages[language] ?? "Kannada";
  const done = [touched.voice || (!!sample && consent), true, touched.settings, !!topic.trim()];

  return (
    <div className="@container relative mx-auto max-w-[1000px] px-8 pt-9 pb-12">
      {/* Header */}
      <header className="relative">
        <h1 className="text-center text-[30px] font-extrabold tracking-[-0.02em] text-slate-900">Welcome to Vivarisu</h1>
        <p className="mt-1 text-center text-[13.5px] text-slate-500">Turn a story idea into a narrated, emotion-directed Kannada episode.</p>
        <span className={cx(
          "absolute top-0 right-0 hidden items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_2px_6px_-2px_rgba(15,23,42,0.08)] @3xl:flex",
          blocked ? "bg-white text-amber-700" : "bg-white text-slate-800",
        )}>
          <Sparkles className={cx("h-3.5 w-3.5", blocked ? "text-amber-500" : "text-cyan-500")} />
          {blocked ? "Setup needed" : "All systems ready"}
        </span>
      </header>

      {health && blocked && (
        <div className="mt-4 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3.5 py-1.5 text-[12px] text-amber-800 ring-1 ring-amber-200">
            <CircleAlert className="h-3.5 w-3.5" />
            {!health.gemini_key ? "Add GOOGLE_API_KEY to .env to enable script writing" : "Add GNANI_API_KEY to .env"}
          </div>
        </div>
      )}

      {/* Setup tray */}
      <section className="mt-8">
        <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-slate-800">
          <UserRound className="h-4 w-4 text-slate-500" />
          Set up your episode <span className="font-medium text-slate-400">– {done.filter(Boolean).length}/4</span>
        </div>

        <div className="rounded-2xl bg-slate-100/70 p-2.5 ring-1 ring-slate-200/70">
          <div className="grid gap-2.5 @xl:grid-cols-2 @3xl:grid-cols-4">
            <StepCard n={1} title="Narrator voice" Icon={AudioLines} active={step === 1} done={done[0]} onClick={() => setStep(1)}
              desc="Pick a Gnani Timbre voice, or clone your own from a clean 5–30 second sample."
              footer={sample ? `Cloning from ${sample.name}` : `Using ${voice}`}>
              {sample ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-[11.5px] text-slate-700 ring-1 ring-slate-200">
                    <span className="truncate">{sample.name}</span>
                    <button onClick={() => { setSample(null); setConsent(false); }} aria-label="Remove sample"><X className="h-3.5 w-3.5 text-slate-400" /></button>
                  </div>
                  <label className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-600">
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-cyan-600" />
                    I own this voice or have permission
                  </label>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <select value={voice} onChange={(e) => { setVoice(e.target.value); setTouched((t) => ({ ...t, voice: true })); }} className={field}>
                    {voices.map((v) => <option key={v.name} value={v.name}>{v.name} · {v.gender}</option>)}
                  </select>
                  <button onClick={() => sampleInput.current?.click()} className={darkBtn}>Clone my voice</button>
                </div>
              )}
            </StepCard>

            <StepCard n={2} title="Script & voice style" Icon={Video} active={step === 2} done={done[1]} onClick={() => setStep(2)}
              desc="Default: Mystery Explainer Kannada colloquial style. Or paste a YouTube URL / upload a video."
              footer={reference ? reference.name : referenceUrl.trim() ? referenceUrl.trim() : "Preset: Mystery Explainer Kannada"}>
              {reference ? (
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-[11.5px] text-slate-700 ring-1 ring-slate-200">
                  <span className="truncate">{reference.name}</span>
                  <button onClick={() => setReference(null)} aria-label="Remove reference"><X className="h-3.5 w-3.5 text-slate-400" /></button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <input
                    value={referenceUrl}
                    onChange={(e) => setReferenceUrl(e.target.value)}
                    placeholder="https://youtu.be/... (optional)"
                    className={field}
                  />
                  <button onClick={() => refInput.current?.click()} className={lightBtn}>Or upload video</button>
                </div>
              )}
            </StepCard>

            <StepCard n={3} title="Language & length" Icon={Languages} active={step === 3} done={done[2]} onClick={() => setStep(3)}
              desc="Choose the narration language and how many scenes the episode should have."
              footer={`${langName} · ${numScenes} scenes`}>
              <div className="grid grid-cols-2 gap-1.5">
                <select value={language} onChange={(e) => { setLanguage(e.target.value); setTouched((t) => ({ ...t, settings: true })); }} className={field}>
                  {Object.entries(catalog?.languages ?? { "kn-IN": "Kannada" }).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                </select>
                <select value={numScenes} onChange={(e) => { setNumScenes(Number(e.target.value)); setTouched((t) => ({ ...t, settings: true })); }} className={field}>
                  {[5, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} scenes</option>)}
                </select>
              </div>
            </StepCard>

            <StepCard n={4} title="Make your episode" Icon={Film} active={step === 4} done={done[3]} onClick={() => { setStep(4); promptRef.current?.focus(); }}
              desc="Describe the story or speak a voice note. We write, direct and voice every scene."
              footer={topic.trim() ? "Ready to generate" : "Write a prompt below"}>
              <button onClick={() => (topic.trim() ? submit() : promptRef.current?.focus())}
                className={topic.trim() ? "w-full rounded-lg bg-cyan-600 py-[7px] text-[12px] font-medium text-white hover:bg-cyan-500" : lightBtn}>
                {topic.trim() ? "Generate episode" : "Write a prompt"}
              </button>
            </StepCard>
          </div>

          {/* Composer */}
          <div className={cx("mt-2.5 rounded-xl bg-white transition", step === 4 ? "shadow-[0_0_0_1.5px_#06b6d4]" : "shadow-[0_0_0_1px_rgba(15,23,42,0.07)]")}>
            <textarea
              ref={promptRef}
              value={topic}
              onFocus={() => setStep(4)}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              rows={2}
              placeholder="What story should we explain? e.g. “Explain the Tumbbad ending with suspense and a big reveal”"
              className="block w-full resize-none rounded-t-xl bg-transparent px-4 pt-3.5 pb-1 text-[14px] leading-relaxed text-slate-900 placeholder-slate-400 outline-none"
            />
            <div className="flex items-center gap-1 px-2.5 pb-2.5">
              <button onClick={toggleRecord} disabled={transcribing} title="Speak in Kannada or English (Gnani Prisma)"
                className={cx("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium", recording ? "bg-rose-50 text-rose-700" : "text-slate-600 hover:bg-slate-100")}>
                {recording ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />} {recording ? "Stop" : "Speak"}
              </button>
              <button onClick={() => noteInput.current?.click()} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-100">
                <Upload className="h-3.5 w-3.5" /> Voice note
              </button>
              {transcribing && <span className="flex items-center gap-1 text-[12px] text-slate-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Transcribing…</span>}
              <button onClick={() => submit()} disabled={!topic.trim()} aria-label="Generate episode"
                className="ml-auto flex h-8 items-center gap-1.5 rounded-full bg-slate-900 pr-3 pl-3.5 text-[12.5px] font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400">
                Generate <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
        {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
      </section>

      <input ref={refInput} type="file" accept="video/*,audio/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { setReference(f); setStep(2); } e.target.value = ""; }} />
      <input ref={sampleInput} type="file" accept="audio/*,video/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSample(f); setStep(1); } e.target.value = ""; }} />
      <input ref={noteInput} type="file" accept="audio/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) transcribe(f, f.name); e.target.value = ""; }} />

      {/* Episode prompts */}
      <section className="mt-9">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
            <Clapperboard className="h-4 w-4 text-slate-500" /> Episode prompts
          </div>
          {recent.length > 0 && (
            <button onClick={onSeeAll} className="text-[12px] font-semibold text-slate-600 underline underline-offset-4 hover:text-slate-900">My projects</button>
          )}
        </div>
        <div className="grid gap-3 @md:grid-cols-2 @2xl:grid-cols-3">
          {TEMPLATES.map(({ title, prompt, from, to, glow, Icon }) => (
            <div key={title} title={prompt} onClick={() => { setTopic(prompt); setStep(4); promptRef.current?.focus(); }}
              className="group relative aspect-[16/9] cursor-pointer overflow-hidden rounded-xl text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px_rgba(15,23,42,0.45)]"
              style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
              {/* artwork */}
              <span className="absolute -top-10 -right-6 h-40 w-40 rounded-full opacity-50 blur-2xl transition duration-500 group-hover:opacity-70" style={{ background: glow }} />
              <span className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-black/25 blur-2xl" />
              <span className="absolute inset-0 opacity-[0.08] [background-image:repeating-linear-gradient(115deg,#fff_0_1px,transparent_1px_14px)]" />
              <Icon className="absolute right-3 bottom-2 h-[58%] w-auto text-white/25 drop-shadow-[0_8px_16px_rgba(0,0,0,0.25)] transition duration-500 group-hover:scale-105 group-hover:text-white/35" strokeWidth={1.1} />
              <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/30 to-transparent" />

              <h3 className="relative max-w-[78%] p-4 text-[19px] leading-[1.15] font-extrabold tracking-[-0.01em] [text-shadow:0_2px_10px_rgba(0,0,0,0.25)]">{title}</h3>
              <button onClick={(e) => { e.stopPropagation(); setTopic(prompt); submit(prompt); }}
                className="absolute bottom-3.5 left-4 flex items-center gap-0.5 rounded-full bg-white/20 px-3 py-[5px] text-[12px] font-medium ring-1 ring-white/30 backdrop-blur-md transition hover:bg-white hover:text-slate-900">
                Create now <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="mt-9">
          <div className="mb-2.5 text-[13px] font-semibold text-slate-800">Continue editing</div>
          <div className="grid gap-2.5 @lg:grid-cols-2 @2xl:grid-cols-3">
            {recent.slice(0, 3).map((p) => (
              <button key={p.id} onClick={() => onOpen(p.id)}
                className="flex items-center gap-3 rounded-xl bg-white p-2.5 text-left shadow-[0_0_0_1px_rgba(15,23,42,0.08)] transition hover:shadow-[0_0_0_1px_rgba(15,23,42,0.16),0_4px_12px_-6px_rgba(15,23,42,0.2)]">
                <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-200"><Film className="h-4 w-4 text-slate-400" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-slate-900">{p.title}</span>
                  <span className="text-[11px] text-slate-400">{p.scenes} scenes · {p.duration_ms ? fmtTime(p.duration_ms) : p.status}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
