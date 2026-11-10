"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { api } from "@/lib/api";
import { AssistantRail } from "@/components/AssistantRail";
import { Editor, EditorTab } from "@/components/Editor";
import { FocusTarget, GenerateRequest, Home } from "@/components/Home";
import { LeftNav, NavSection } from "@/components/LeftNav";
import { Progress, StageState } from "@/components/Progress";
import { Projects } from "@/components/Projects";
import type { Catalog, Health, Project, ProjectSummary, Scene, StageName } from "@/types";

type View = "home" | "progress" | "editor" | "projects";

export default function Page() {
  const [view, setView] = useState<View>("home");
  const [editorTab, setEditorTab] = useState<EditorTab>("scenes");
  const [focus, setFocus] = useState<{ target: FocusTarget; key: number }>({ target: null, key: 0 });
  const [presetTopic, setPresetTopic] = useState("");
  const [renderTrigger, setRenderTrigger] = useState(0);
  const [videoExportTrigger, setVideoExportTrigger] = useState(0);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(true);

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [recent, setRecent] = useState<ProjectSummary[]>([]);
  const [backendDown, setBackendDown] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<Partial<Record<StageName, StageState>>>({});
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const mainRef = useRef<HTMLElement>(null);

  const scrollTop = () => mainRef.current?.scrollTo(0, 0);
  const loadRecent = () => api.projects().then(setRecent).catch(() => setRecent([]));
  const goHome = (target: FocusTarget = null) => {
    setView("home");
    setFocus((f) => ({ target, key: f.key + 1 }));
    scrollTop();
  };

  useEffect(() => {
    Promise.all([api.catalog(), api.health(), api.projects()])
      .then(([c, h, r]) => { setCatalog(c); setHealth(h); setRecent(r); })
      .catch(() => setBackendDown(true));
    // Keep the centre studio roomy on smaller screens, like HeyGen's collapsible Create menu.
    const fit = () => {
      setNavCollapsed(window.innerWidth < 1360);
      setAssistantOpen(window.innerWidth >= 900);
    };
    const id = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(id);
  }, []);

  const generate = async (req: GenerateRequest) => {
    scrollTop();
    setView("progress");
    setTitle(req.topic.slice(0, 80));
    setStages({});
    setScenes([]);
    setError("");
    setProject(null);
    const fd = new FormData();
    fd.append("topic", req.topic);
    fd.append("language", req.language);
    fd.append("voice", req.voice);
    fd.append("num_scenes", String(req.numScenes));
    fd.append("consent", String(req.consent));
    if (req.reference) fd.append("reference", req.reference);
    if (req.referenceUrl?.trim()) fd.append("reference_url", req.referenceUrl.trim());
    if (req.voiceSample) fd.append("voice_sample", req.voiceSample);
    try {
      await api.generate(fd, (ev) => {
        if (ev.type === "stage") {
          setStages((s) => ({ ...s, [ev.stage]: { status: ev.status, message: ev.message, done: ev.done, total: ev.total } }));
        } else if (ev.type === "project") {
          setProject(ev.project);
          setTitle(ev.project.title);
          setScenes(ev.project.scenes);
        } else if (ev.type === "scene") {
          setScenes((list) => list.map((s) => (s.id === ev.scene.id ? ev.scene : s)));
        } else if (ev.type === "done") {
          setProject(ev.project);
          loadRecent();
          setEditorTab("scenes");
          setView("editor");
          scrollTop();
        } else if (ev.type === "error") {
          setError(ev.message);
          if (ev.project) setProject(ev.project);
        }
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const open = async (id: string, tab: EditorTab = "scenes") => {
    try {
      setProject(await api.project(id));
      setEditorTab(tab);
      setView("editor");
      scrollTop();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const navTo = (section: NavSection) => {
    if (section === "home") return goHome();
    if (section === "projects") { loadRecent(); setView("projects"); return scrollTop(); }
    const tab: EditorTab = section === "studio" ? "scenes" : section;
    if (project) { setEditorTab(tab); setView("editor"); return scrollTop(); }
    if ((section === "studio" || section === "video") && recent[0]) return open(recent[0].id, tab);
    goHome(section === "studio" || section === "video" ? "prompt" : section);
  };

  const active: NavSection =
    view === "projects" ? "projects" : view === "editor" || view === "progress" ? (editorTab === "scenes" ? "studio" : editorTab) : "home";

  if (backendDown) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-[13px] text-slate-600">
        <div>
          The backend isn&apos;t reachable at 127.0.0.1:8000. Start it from the repo root:
          <code className="mt-3 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900">python -m uvicorn backend.app.main:app --port 8000</code>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen gap-2 overflow-hidden bg-white p-2 text-slate-900">
      <LeftNav
        active={active}
        canOpenStudio={!!project || recent.length > 0}
        recent={recent}
        health={health}
        collapsed={navCollapsed}
        onCollapse={setNavCollapsed}
        onSelect={navTo}
        onOpenProject={(id) => open(id)}
        onNewEpisode={() => goHome("prompt")}
      />

      <main ref={mainRef} className="relative min-w-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white">
        {view === "home" && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(40%_60%_at_50%_0%,rgba(34,211,238,0.16),transparent_70%),radial-gradient(30%_50%_at_30%_10%,rgba(167,139,250,0.14),transparent_70%),radial-gradient(30%_50%_at_72%_12%,rgba(244,114,182,0.10),transparent_70%)]" />
        )}
        {view === "editor" && project && catalog ? (
          <Editor
            project={project}
            catalog={catalog}
            health={health}
            tab={editorTab}
            onTab={setEditorTab}
            renderTrigger={renderTrigger}
            videoExportTrigger={videoExportTrigger}
            onProject={(p) => { setProject(p); loadRecent(); }}
            onBack={() => goHome()}
          />
        ) : view === "progress" ? (
          <Progress
            title={title}
            stages={stages}
            scenes={scenes}
            error={error}
            onOpenEditor={error && project && project.scenes.length ? () => open(project.id) : null}
            onBack={() => goHome()}
          />
        ) : view === "projects" ? (
          <Projects
            projects={recent}
            onOpen={(id) => open(id)}
            onDelete={async (id) => { await api.deleteProject(id); if (project?.id === id) setProject(null); loadRecent(); }}
            onNew={() => goHome("prompt")}
          />
        ) : (
          <Home
            catalog={catalog}
            health={health}
            recent={recent}
            presetTopic={presetTopic}
            focus={focus.target}
            focusKey={focus.key}
            onGenerate={generate}
            onOpen={(id) => open(id)}
            onSeeAll={() => navTo("projects")}
          />
        )}
      </main>

      {assistantOpen ? (
        <AssistantRail
          project={view === "editor" ? project : null}
          onClose={() => setAssistantOpen(false)}
          onStartTopic={(t) => { setPresetTopic(t); goHome("prompt"); }}
          onOpenVoiceClone={() => navTo("voice")}
          onOpenStyleLearn={() => navTo("style")}
          onOpenTab={(t) => { setEditorTab(t); if (project) setView("editor"); }}
          onProject={setProject}
          onRenderChanges={() => setRenderTrigger((n) => n + 1)}
          onExportVideo={() => { setEditorTab("video"); setTimeout(() => setVideoExportTrigger((n) => n + 1), 60); }}
        />
      ) : (
        <button
          onClick={() => setAssistantOpen(true)}
          className="fixed right-5 bottom-5 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg hover:bg-slate-800"
          title="Open assistant"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
