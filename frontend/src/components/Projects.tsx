"use client";

import { Clock, Film, Plus, Trash2 } from "lucide-react";
import { cx, fmtTime } from "@/lib/ui";
import type { ProjectSummary } from "@/types";

interface Props {
  projects: ProjectSummary[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

const STATUS: Record<string, string> = {
  ready: "bg-emerald-50 text-emerald-700",
  generating: "bg-sky-50 text-sky-700",
  error: "bg-rose-50 text-rose-700",
  draft: "bg-slate-100 text-slate-600",
};

export function Projects({ projects, onOpen, onDelete, onNew }: Props) {
  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Projects</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">{projects.length} episode{projects.length === 1 ? "" : "s"}</p>
        </div>
        <button onClick={onNew} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-slate-800">
          <Plus className="h-4 w-4" /> New episode
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-slate-300 py-16 text-center text-[13px] text-slate-500">
          No episodes yet. Create one from Home.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div key={p.id} onClick={() => onOpen(p.id)} className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-md">
              <div className="flex h-28 items-center justify-center bg-gradient-to-br from-slate-100 to-slate-50">
                <Film className="h-8 w-8 text-slate-300" />
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-[14px] font-semibold text-slate-900">{p.title}</h3>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Delete “${p.title}”?`)) onDelete(p.id); }}
                    className="rounded-md p-1 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
                  <span className={cx("rounded-full px-2 py-0.5 font-medium capitalize", STATUS[p.status] ?? STATUS.draft)}>{p.status}</span>
                  <span>{p.scenes} scenes</span>
                  {p.duration_ms > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtTime(p.duration_ms)}</span>}
                  <span className="ml-auto">{new Date(p.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
