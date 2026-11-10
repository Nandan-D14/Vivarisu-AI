import type { Catalog, Health, Project, ProjectSummary, ProgressEvent, PublishKit, Scene } from "@/types";

export const BACKEND = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const API = `${BACKEND}/api`;

export const mediaUrl = (path: string | null | undefined) => (path ? `${BACKEND}${path}` : "");

async function errorText(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return body.detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join("; ");
    return JSON.stringify(body);
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`${API}${path}`, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json() as Promise<T>;
}

async function stream(path: string, init: RequestInit, onEvent: (e: ProgressEvent) => void): Promise<void> {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok || !res.body) throw new Error(await errorText(res));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) onEvent(JSON.parse(line.slice(6)) as ProgressEvent);
      }
    }
  }
}

const post = <T,>(path: string, json: unknown = {}) => call<T>(path, { method: "POST", json });
const scenePath = (pid: string, sid: string) => `/projects/${pid}/scenes/${sid}`;

export const api = {
  health: () => call<Health>("/health"),
  catalog: () => call<Catalog>("/catalog"),
  projects: () => call<ProjectSummary[]>("/projects"),
  project: (id: string) => call<Project>(`/projects/${id}`),
  patchProject: (id: string, json: Partial<Project> | Record<string, unknown>) => call<Project>(`/projects/${id}`, { method: "PATCH", json }),
  deleteProject: (id: string) => call<{ deleted: string }>(`/projects/${id}`, { method: "DELETE" }),

  transcribe: (file: Blob, filename: string, topic = "") => {
    const fd = new FormData();
    fd.append("audio_file", file, filename);
    fd.append("topic", topic);
    return call<{ transcript: string }>("/transcribe", { method: "POST", body: fd });
  },

  generate: (form: FormData, onEvent: (e: ProgressEvent) => void) =>
    stream("/episodes/generate", { method: "POST", body: form }, onEvent),
  render: (id: string, onEvent: (e: ProgressEvent) => void) => stream(`/projects/${id}/render`, { method: "POST" }, onEvent),

  undo: (id: string) => post<Project>(`/projects/${id}/undo`),
  redo: (id: string) => post<Project>(`/projects/${id}/redo`),
  presetAll: (id: string, preset: string) => post<Project>(`/projects/${id}/preset`, { preset }),
  directAll: (id: string, instruction: string) => post<Project>(`/projects/${id}/direct`, { instruction }),
  chatHomeAgent: (instruction: string) =>
    post<{ reply: string; suggested_topic: string; ui_action: string }>("/agent", { instruction }),
  chatProjectAgent: (id: string, instruction: string) =>
    post<{ reply: string; ui_action: string; project: Project }>(`/projects/${id}/agent`, { instruction }),

  uploadReference: (id: string, form: FormData) => call<Project>(`/projects/${id}/reference`, { method: "POST", body: form }),
  learnYoutubeUrl: (id: string, url: string) => post<Project>(`/projects/${id}/reference-url`, { url }),
  deleteVoice: (id: string) => call<Project>(`/projects/${id}/voice-identity`, { method: "DELETE" }),

  patchScene: (pid: string, sid: string, json: Partial<Scene>) => call<Project>(scenePath(pid, sid), { method: "PATCH", json }),
  addScene: (pid: string, after_id: string | null) => post<Project>(`/projects/${pid}/scenes`, { after_id, title: "New scene", text: "" }),
  deleteScene: (pid: string, sid: string) => call<Project>(scenePath(pid, sid), { method: "DELETE" }),
  reorder: (pid: string, ids: string[]) => post<Project>(`/projects/${pid}/scenes/reorder`, { ids }),
  split: (pid: string, sid: string, at: number) => post<Project>(`${scenePath(pid, sid)}/split`, { at }),
  mergeNext: (pid: string, sid: string) => post<Project>(`${scenePath(pid, sid)}/merge-next`),
  presetScene: (pid: string, sid: string, preset: string) => post<Project>(`${scenePath(pid, sid)}/preset`, { preset }),
  rewrite: (pid: string, sid: string, instruction: string) => post<{ proposal: Scene }>(`${scenePath(pid, sid)}/rewrite`, { instruction }),
  voiceScene: (pid: string, sid: string) => post<Project>(`${scenePath(pid, sid)}/voice`),
  flat: (pid: string, sid: string) => post<{ audio_url: string; audio_mode: string }>(`${scenePath(pid, sid)}/flat`),

  uploadSceneImage: (pid: string, sid: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return call<Project>(`${scenePath(pid, sid)}/image`, { method: "POST", body: fd });
  },
  deleteSceneImage: (pid: string, sid: string) => call<Project>(`${scenePath(pid, sid)}/image`, { method: "DELETE" }),
  renderVideo: (id: string, onEvent: (e: ProgressEvent) => void) => stream(`/projects/${id}/video`, { method: "POST" }, onEvent),
  publishKit: (id: string) => call<PublishKit>(`/projects/${id}/publish-kit`),
  exportZipUrl: (id: string) => `${API}/projects/${id}/export-zip`,
  exportYoutube: (id: string, access_token: string, privacy = "unlisted") =>
    post<{ provider: string; video_id: string; url: string; studio_url: string }>(`/projects/${id}/export/youtube`, { access_token, privacy }),
  exportDrive: (id: string, access_token: string) =>
    post<{ provider: string; file_id: string; url: string }>(`/projects/${id}/export/drive`, { access_token }),
};
