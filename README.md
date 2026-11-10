# Vivarisu AI (ವಿವರಿಸು AI)

Type a topic or speak your notes and get a **fully narrated, emotion-directed Kannada episode** (MP3 + SRT) and an **MP4 video** with your images, motion and burned-in Kannada subtitles. Edit any scene, learn a delivery style from a reference video, clone a narrator's voice, or just tell the built-in AI agent what to change.

## How it works

| Step | Engine |
| --- | --- |
| Voice notes become editable text | **Gnani Prisma v3.0** (chunked to fit the 30 s REST limit) |
| Script, scene split, emotion, pace, pauses and inline audio tags per scene | **Gemini** (structured JSON) |
| Delivery style learned from a reference video (pace, pauses, emphasis, emotion arc) | **Gemini** video understanding |
| Expressive narration | **Gnani Timbre v3.0** with inline tags (`<pauses> <whispers> <slow> <excited> <sigh>` …) and speed |
| Narrator voice from a reference | **Gnani voice clone embeddings + vachana-vc-v1** (consent required, deletable) |
| Episode assembly, scene pauses, loudness, subtitles | FFmpeg (bundled via `imageio-ffmpeg`) |
| MP4 export: images, Ken Burns motion, titles, burned-in subtitles | FFmpeg + libass (complex shaping for correct Kannada conjuncts) |
| Studio AI agent (edit scenes, voice, aspect ratio, subtitles, trigger render/export from chat) | **Gemini** structured actions |

Errors from Gnani or Gemini are shown in the UI. Nothing silently falls back to mock audio.

### Video Studio
- Upload images, auto-fill empty clips or drag onto the timeline; per-clip motion (zoom, pan, still), fade, and on-screen title.
- Landscape (16:9) or Portrait (9:16), subtitles on or off, live preview with timeline, then **Export MP4**.
- Optional Cloudinary upload when `CLOUDINARY_URL` is set; otherwise local FFmpeg only.

### AI agent
- Chat from the right rail: "make scene 1 more mysterious", "pan left on clip 2 and turn off subtitles", "export the video".
- Edits are undoable. Fast model with automatic fallback (`GEMINI_AGENT_MODEL`, `GEMINI_FALLBACK_MODELS`).

### Editing
- Edit text and titles, insert tags at the cursor, set emotion, intensity, pace and pauses before/after.
- Expression presets per scene or for the whole episode (Dramatic, Whisper horror, Big reveal …).
- AI rewrite per scene with a before/after proposal you accept or reject.
- "Re-direct all scenes": Gemini reassigns the emotional arc (optionally using the learned style) without changing the wording.
- Split, merge, reorder, add and delete scenes, with undo/redo.
- Flat vs expressive A/B for any scene.
- Changed scenes are marked; **Render changes** re-voices only those and re-assembles.

### Honest limits
- The cloned-voice endpoint has no speed or emotion parameters. By default `<pauses>` become real silences, other tags are dropped and pace is applied by time-stretching. Set `GNANI_VC_INLINE_TAGS=1` if testing shows tags work with `vachana-vc-v1` on your account. Each scene shows the mode it was actually rendered with.
- Style learning approximates delivery through Timbre controls. It is not waveform-level imitation.
- Output is audio only, so facial and body expression are not cloned.

## Run

```bash
pip install -r backend/requirements.txt
cp .env.example .env        # fill GNANI_API_KEY and GOOGLE_API_KEY
python -m uvicorn backend.app.main:app --port 8000   # from repo root

cd frontend && npm install && npm run dev            # http://localhost:3000
```

Tests: `python -m pytest backend/tests -q`

## Layout

```
backend/app/
  main.py, routes.py      FastAPI app, REST + SSE endpoints
  pipeline.py             generate / re-render flows streamed as events
  llm/gemini.py           script writing, rewrite, re-direction, style analysis
  gnani.py                Prisma, Timbre, voice-clone clients (retry on 429)
  render.py               expression -> Gnani audio, episode assembly
  media/audio.py          FFmpeg helpers;  media/subtitles.py  SRT + cues
  ingest.py               voice notes, reference uploads, voice cloning
  storage.py, voices.py   JSON project store with undo/redo; embedding store
backend/data/             projects, embeddings, media (git-ignored)
frontend/src/             Next.js UI: Home, Progress, Editor, SceneCard, Voice/Style panels
```
