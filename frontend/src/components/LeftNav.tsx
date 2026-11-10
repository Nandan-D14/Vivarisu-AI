"use client";

import { AudioLines, Clapperboard, Film, Folder, House, PanelLeftClose, PanelLeftOpen, Sparkles, Video, WandSparkles } from "lucide-react";
import { cx, fmtTime } from "@/lib/ui";
import type { Health, ProjectSummary } from "@/types";

export type NavSection = "home" | "studio" | "video" | "voice" | "style" | "projects";

interface Props {
  active: NavSection;
  canOpenStudio: boolean;
  recent: ProjectSummary[];
  health: Health | null;
  collapsed: boolean;
  onCollapse: (v: boolean) => void;
  onSelect: (s: NavSection) => void;
  onOpenProject: (id: string) => void;
  onNewEpisode: () => void;
}

const RAIL: { id: NavSection; label: string; Icon: typeof House }[] = [
  { id: "home", label: "Home", Icon: House },
  { id: "studio", label: "Studio", Icon: Film },
  { id: "video", label: "Video", Icon: Clapperboard },
  { id: "voice", label: "Voices", Icon: AudioLines },
];

const CREATE: { id: NavSection | "agent"; label: string; Icon: typeof House }[] = [
  { id: "home", label: "Home", Icon: House },
  { id: "agent", label: "Episode agent", Icon: WandSparkles },
  { id: "studio", label: "Scene by scene", Icon: Film },
  { id: "video", label: "Video studio", Icon: Clapperboard },
  { id: "voice", label: "Voice clone", Icon: AudioLines },
  { id: "style", label: "Reference style", Icon: Video },
];

function RailItem({ label, Icon, on, onClick }: { label: string; Icon: typeof House; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx("group flex w-full flex-col items-center gap-1 text-[10.5px] font-medium", on ? "text-cyan-700" : "text-slate-500 hover:text-slate-900")}>
      <span className={cx("flex h-9 w-9 items-center justify-center rounded-xl transition", on ? "bg-cyan-50 ring-1 ring-cyan-200" : "group-hover:bg-slate-100")}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      {label}
    </button>
  );
}

export function LeftNav({ active, canOpenStudio, recent, health, collapsed, onCollapse, onSelect, onOpenProject, onNewEpisode }: Props) {
  const allOk = !!health?.gnani_key && !!health?.gemini_key;
  return (
    <aside className="flex h-full shrink-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
      {/* Icon rail */}
      <div className="flex w-[72px] flex-col items-center py-4">
        <button onClick={() => onSelect("home")} className="flex flex-col items-center gap-1 text-[10.5px] font-semibold text-cyan-700" title="Vivarisu AI">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-violet-500 text-white shadow-[0_4px_12px_-2px_rgba(14,165,233,0.45)]">
            <Sparkles className="h-5 w-5" />
          </span>
        </button>
        <nav className="mt-6 flex w-full flex-col items-center gap-4 px-1">
          {RAIL.map(({ id, label, Icon }) => (
            <RailItem key={id} label={label} Icon={Icon} on={active === id || (id === "voice" && active === "style")} onClick={() => onSelect(id)} />
          ))}
          <span className="h-px w-8 bg-slate-200" />
          <RailItem label="Projects" Icon={Folder} on={active === "projects"} onClick={() => onSelect("projects")} />
        </nav>
        <div className="mt-auto flex flex-col items-center gap-3">
          {collapsed && (
            <button onClick={() => onCollapse(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Expand menu">
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
          <span
            className="relative flex h-8 w-8 items-center justify-center rounded-full bg-cyan-50 text-[12px] font-semibold text-cyan-700 ring-1 ring-cyan-200"
            title={allOk ? "Gnani + Gemini connected" : "An API key is missing"}
          >
            V
            <span className={cx("absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-white", allOk ? "bg-emerald-500" : "bg-amber-400")} />
          </span>
        </div>
      </div>

      {/* Create column */}
      {!collapsed && (
        <div className="flex w-52 flex-col border-l border-slate-100 px-2.5 py-4">
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="text-[12px] font-medium text-slate-400">Create</span>
            <button onClick={() => onCollapse(true)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Collapse">
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          <nav className="space-y-0.5">
            {CREATE.map(({ id, label, Icon }) => {
              const on = id !== "agent" && active === id;
              const disabled = (id === "studio" || id === "video") && !canOpenStudio;
              return (
                <button
                  key={label}
                  disabled={disabled}
                  onClick={() => (id === "agent" ? onNewEpisode() : onSelect(id))}
                  className={cx(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] transition",
                    on ? "bg-cyan-50 font-semibold text-cyan-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                    disabled && "pointer-events-none opacity-40",
                  )}
                >
                  <Icon className={cx("h-4 w-4 shrink-0", on ? "text-cyan-700" : "text-slate-400")} />
                  {label}
                </button>
              );
            })}
          </nav>

          {recent.length > 0 && (
            <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
              <div className="mb-1 px-2 text-[12px] font-medium text-slate-400">Recent</div>
              {recent.slice(0, 8).map((p) => (
                <button key={p.id} onClick={() => onOpenProject(p.id)} className="block w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-50">
                  <span className="block truncate text-[13px] text-slate-700">{p.title}</span>
                  <span className="text-[11px] text-slate-400">{p.duration_ms ? fmtTime(p.duration_ms) : p.status} · {p.scenes} scenes</span>
                </button>
              ))}
            </div>
          )}

          {health && (
            <div className="mt-auto space-y-1 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] text-slate-500">
              {[
                [health.gnani_key, "Gnani Prisma · Timbre"],
                [health.gemini_key, health.gemini_key ? "Gemini" : "Gemini key missing"],
              ].map(([ok, label]) => (
                <span key={String(label)} className="flex items-center gap-1.5">
                  <span className={cx("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-amber-400")} />
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
