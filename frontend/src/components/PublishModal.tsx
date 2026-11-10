"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, ExternalLink, FolderArchive, HardDrive, LoaderCircle, Palette, Share2, Upload, Video, X } from "lucide-react";
import { api, mediaUrl } from "@/lib/api";
import { cx } from "@/lib/ui";
import type { Project, PublishKit } from "@/types";

interface Props {
  project: Project;
  onClose: () => void;
  onProject: (p: Project) => void;
}

type Dest = "youtube" | "drive" | "canva" | "pack";

export function PublishModal({ project, onClose, onProject }: Props) {
  const [tab, setTab] = useState<Dest>("youtube");
  const [kit, setKit] = useState<PublishKit | null>(null);
  const [copied, setCopied] = useState("");
  const [token, setToken] = useState("");
  const [privacy, setPrivacy] = useState<"unlisted" | "private" | "public">("unlisted");
  const [busy, setBusy] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api.publishKit(project.id).then(setKit).catch((e) => setErr((e as Error).message));
  }, [project.id]);

  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? "" : c)), 1800);
  };

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const ensureMp4 = async (): Promise<string> => {
    if (project.video_url) return mediaUrl(project.video_url);
    setBusy("Rendering MP4 video…");
    let latest = project;
    await api.renderVideo(project.id, (ev) => {
      if (ev.type === "stage") setBusy(ev.message);
      if (ev.type === "done") { latest = ev.project; onProject(ev.project); }
      if (ev.type === "error") throw new Error(ev.message);
    });
    const fresh = await api.publishKit(project.id);
    setKit(fresh);
    return mediaUrl(latest.video_url);
  };

  const quickYouTube = async () => {
    if (!kit) return;
    setErr("");
    try {
      const mp4 = await ensureMp4();
      copy("yt-all", `${kit.youtube_title}\n\n${kit.youtube_description}`);
      if (mp4) triggerDownload(mp4, `${project.title || "episode"}.mp4`);
      window.open("https://studio.youtube.com", "_blank", "noopener,noreferrer");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(""); }
  };

  const directYouTube = async () => {
    setErr(""); setResultUrl(""); setBusy("Uploading MP4 to YouTube…");
    try {
      const res = await api.exportYoutube(project.id, token, privacy);
      setResultUrl(res.url);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(""); }
  };

  const quickDrive = async () => {
    setErr("");
    try {
      const mp4 = await ensureMp4();
      if (mp4) triggerDownload(mp4, `${project.title || "episode"}.mp4`);
      window.open("https://drive.google.com/drive/my-drive", "_blank", "noopener,noreferrer");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(""); }
  };

  const directDrive = async () => {
    setErr(""); setResultUrl(""); setBusy("Uploading MP4 to Google Drive…");
    try {
      const res = await api.exportDrive(project.id, token);
      setResultUrl(res.url);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(""); }
  };

  const openCanva = async () => {
    setErr("");
    try {
      const mp4 = await ensureMp4();
      if (mp4) triggerDownload(mp4, `${project.title || "episode"}.mp4`);
      window.open("https://www.canva.com/video-editor/", "_blank", "noopener,noreferrer");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(""); }
  };

  const btn = "flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50";
  const ghost = "flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <h3 className="text-[15px] font-bold text-slate-900">Publish &amp; Export</h3>
            <p className="text-[12px] text-slate-500">Export directly to YouTube, Google Drive, Canva, or download the submission bundle.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex gap-1 border-b border-slate-100 px-5 pt-2.5 text-[12.5px]">
          {([
            ["youtube", "YouTube", Video],
            ["drive", "Google Drive", HardDrive],
            ["canva", "Canva", Palette],
            ["pack", "Challenge Pack (.zip)", FolderArchive],
          ] as [Dest, string, typeof Video][]).map(([id, label, Icon]) => (
            <button key={id} onClick={() => { setTab(id); setResultUrl(""); setErr(""); }}
              className={cx("-mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2.5 font-medium transition",
                tab === id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800")}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-[13px]">
          {err && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-[12.5px] text-rose-800">{err}</div>}
          {busy && (
            <div className="flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3.5 py-2 text-[12.5px] text-cyan-900">
              <LoaderCircle className="h-4 w-4 animate-spin" /> {busy}
            </div>
          )}
          {resultUrl && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-[12.5px] text-emerald-900">
              <span>Uploaded! Your video is live.</span>
              <a href={resultUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold underline">Open link <ExternalLink className="h-3.5 w-3.5" /></a>
            </div>
          )}

          {!kit ? (
            <div className="flex items-center gap-2 py-8 text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading publish kit…</div>
          ) : tab === "youtube" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3">
                <div>
                  <div className="font-semibold text-slate-900">1-Click YouTube Studio</div>
                  <div className="text-[12px] text-slate-500">Downloads MP4, copies Title + Kannada description + auto scene chapters, and opens YouTube Studio.</div>
                </div>
                <button onClick={quickYouTube} disabled={!!busy} className={btn}><ExternalLink className="h-3.5 w-3.5" /> Copy &amp; Open YouTube Studio</button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Title</span>
                  <button onClick={() => copy("title", kit.youtube_title)} className="flex items-center gap-1 text-[11.5px] text-cyan-700 hover:underline">
                    {copied === "title" ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                  </button>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 font-medium text-slate-900">{kit.youtube_title}</div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Description &amp; Auto Chapters ({kit.chapters.length})</span>
                  <button onClick={() => copy("desc", kit.youtube_description)} className="flex items-center gap-1 text-[11.5px] text-cyan-700 hover:underline">
                    {copied === "desc" ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                  </button>
                </div>
                <pre className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/60 p-3 font-sans text-[12px] leading-relaxed whitespace-pre-wrap text-slate-700">{kit.youtube_description}</pre>
              </div>

              <details className="rounded-xl border border-slate-200 p-3">
                <summary className="cursor-pointer text-[12.5px] font-semibold text-slate-700">Direct API upload (Google OAuth access token)</summary>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="ya29.a0... (youtube.upload scope)"
                    className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-cyan-500" />
                  <select value={privacy} onChange={(e) => setPrivacy(e.target.value as typeof privacy)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px]">
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                  <button onClick={directYouTube} disabled={!!busy || !token.trim()} className={btn}><Upload className="h-3.5 w-3.5" /> Upload now</button>
                </div>
              </details>
            </>
          ) : tab === "drive" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3">
                <div>
                  <div className="font-semibold text-slate-900">Save to Google Drive</div>
                  <div className="text-[12px] text-slate-500">Downloads the MP4 video and opens your Google Drive folder to drop it in.</div>
                </div>
                <button onClick={quickDrive} disabled={!!busy} className={btn}><ExternalLink className="h-3.5 w-3.5" /> Download &amp; Open Drive</button>
              </div>
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <div className="text-[12.5px] font-semibold text-slate-700">Direct Google Drive API v3 upload</div>
                <div className="flex flex-wrap items-center gap-2">
                  <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="ya29.a0... (drive.file scope)"
                    className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-cyan-500" />
                  <button onClick={directDrive} disabled={!!busy || !token.trim()} className={btn}><Upload className="h-3.5 w-3.5" /> Upload to Drive</button>
                </div>
              </div>
            </>
          ) : tab === "canva" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3">
                <div>
                  <div className="font-semibold text-slate-900">Edit in Canva Video Studio</div>
                  <div className="text-[12px] text-slate-500">Exports &amp; downloads your MP4 with Kannada subtitles, then opens Canva Video Editor so you can drag it into your design.</div>
                </div>
                <button onClick={openCanva} disabled={!!busy} className={btn}><ExternalLink className="h-3.5 w-3.5" /> Export MP4 &amp; Open Canva</button>
              </div>
              <a href={ api.exportZipUrl(project.id) } download className={cx(ghost, "w-fit")}><Download className="h-3.5 w-3.5" /> Download all scene images + MP4 + SRT (.zip)</a>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3">
                <div>
                  <div className="font-semibold text-slate-900">Complete Episode Bundle (.zip)</div>
                  <div className="text-[12px] text-slate-500">Includes episode.mp4, episode.mp3, episode.srt, scene images, and YouTube + LinkedIn/X text.</div>
                </div>
                <a href={api.exportZipUrl(project.id)} download className={btn}><Download className="h-3.5 w-3.5" /> Download .zip Pack</a>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">LinkedIn / X Challenge Post (#GreatIndianAIInternshipChallenge #GnaniAI)</span>
                  <button onClick={() => copy("social", kit.social_post)} className="flex items-center gap-1 text-[11.5px] text-cyan-700 hover:underline">
                    {copied === "social" ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy post</>}
                  </button>
                </div>
                <pre className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 font-sans text-[12px] leading-relaxed whitespace-pre-wrap text-slate-700">{kit.social_post}</pre>
                <div className="flex gap-2">
                  <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(kit.social_post)}`} target="_blank" rel="noreferrer" className={ghost}>
                    <Share2 className="h-3.5 w-3.5" /> Post on X
                  </a>
                  <button onClick={() => { copy("social", kit.social_post); window.open("https://www.linkedin.com/feed/", "_blank", "noopener,noreferrer"); }} className={ghost}>
                    <Share2 className="h-3.5 w-3.5" /> Copy &amp; Open LinkedIn
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
