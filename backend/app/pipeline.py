"""Long-running production flows streamed to the UI as progress events."""
import logging
from pathlib import Path
from typing import Dict, Iterator, Optional

from backend.app import ingest, render, storage
from backend.app.llm import gemini
from backend.app.models import Project

logger = logging.getLogger(__name__)


def _stage(stage: str, status: str, message: str, **extra) -> Dict:
    return {"type": "stage", "stage": stage, "status": status, "message": message, **extra}


def _project(p: Project) -> Dict:
    return {"type": "project", "project": p.model_dump()}


def _voice_and_assemble(project: Project, only_outdated: bool) -> Iterator[Dict]:
    render.refresh_status(project)
    todo = [s for s in project.scenes if not only_outdated or s.audio_status != "ready"]
    total = len(todo)
    yield _stage("voice", "running", f"Voicing {total} scene(s) with Gnani…", total=total, done=0)
    for i, scene in enumerate(todo, start=1):
        render.voice_scene(project, scene)
        storage.save(project)
        yield {"type": "scene", "scene": scene.model_dump(), "index": i, "total": total}
        yield _stage("voice", "running", f"Voiced {i}/{total}: {scene.title}", total=total, done=i)
    yield _stage("voice", "done", f"{total} scene(s) voiced" if total else "All scenes already up to date")

    yield _stage("assemble", "running", "Assembling episode audio and subtitles…")
    render.assemble(project)
    project.status = "ready"
    storage.save(project)
    yield _stage("assemble", "done", f"Episode ready ({project.episode_duration_ms // 1000}s)")


def generate(
    project_id: str,
    notes_path: Optional[Path] = None,
    reference_path: Optional[Path] = None,
    clone_from_reference: bool = False,
    consent: bool = False,
    num_scenes: int = 8,
    voice_sample_path: Optional[Path] = None,
    reference_url: str = "",
) -> Iterator[Dict]:
    project = storage.require(project_id)
    project.status = "generating"
    storage.save(project)
    yield _project(project)
    try:
        # 1. creator voice notes -> text (Prisma)
        if notes_path:
            yield _stage("notes", "running", "Transcribing your voice note with Gnani Prisma…")
            project.notes_transcript = ingest.transcribe_notes(notes_path, topic=project.topic)
            storage.save(project)
            yield _stage("notes", "done", "Voice note transcribed", transcript=project.notes_transcript)
        else:
            yield _stage("notes", "skipped", "No voice note")

        # 2. reference media or YouTube URL -> delivery style (Gemini)
        if reference_path or reference_url.strip():
            yield _stage("style", "running", "Learning delivery style from the reference…")
            try:
                project.style_profile = (
                    ingest.learn_style(reference_path)
                    if reference_path
                    else gemini.analyze_youtube_url(reference_url)
                )
                storage.save(project)
                yield _stage("style", "done", project.style_profile.summary or "Style learned")
            except Exception as e:  # non-fatal: continue with default direction
                logger.exception("style learning failed")
                yield _stage("style", "error", f"Style learning failed, using default direction: {e}")
        else:
            yield _stage("style", "skipped", "Default style: Mystery Explainer Kannada")

        # 3. voice identity (Gnani) from a dedicated sample, or from the reference
        clone_src = voice_sample_path or (reference_path if clone_from_reference else None)
        if clone_src:
            yield _stage("clone", "running", "Cloning the narrator voice with Gnani…")
            try:
                project.voice_identity = ingest.clone_voice(project, clone_src, consent)
                project.use_cloned_voice = True
                storage.save(project)
                yield _stage("clone", "done", "Voice identity created")
            except Exception as e:  # non-fatal: fall back to the selected Timbre voice
                logger.exception("voice clone failed")
                yield _stage("clone", "error", f"Voice cloning failed, using {project.voice}: {e}")
        else:
            yield _stage("clone", "skipped", f"Using Timbre voice {project.voice}")

        # 3. script + per-scene expression (Gemini)
        yield _stage("script", "running", "Writing and directing the episode…")
        title, scenes = gemini.write_episode(
            project.topic, project.language, project.notes_transcript, project.style_profile, num_scenes
        )
        project.title = title
        project.scenes = scenes
        storage.save(project)
        yield _project(project)
        yield _stage("script", "done", f"{len(scenes)} scenes written")

        # 4-5. voice + assemble
        yield from _voice_and_assemble(project, only_outdated=False)
        yield {"type": "done", "project": project.model_dump()}
    except Exception as e:
        logger.exception("generation failed")
        project.status = "error"
        storage.save(project)
        yield {"type": "error", "message": str(e), "project": project.model_dump()}


def rerender(project_id: str) -> Iterator[Dict]:
    """Re-voice missing/stale scenes, then re-assemble."""
    project = storage.require(project_id)
    try:
        yield from _voice_and_assemble(project, only_outdated=True)
        yield {"type": "done", "project": project.model_dump()}
    except Exception as e:
        logger.exception("render failed")
        storage.save(project)
        yield {"type": "error", "message": str(e), "project": render.refresh_status(project).model_dump()}
