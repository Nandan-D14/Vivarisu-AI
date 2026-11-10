"""JSON-file project store with project-level undo/redo snapshots of the scene list."""
import json
import threading
from typing import Dict, List, Optional

from backend.app.config import PROJECTS_DIR
from backend.app.models import Project, Scene, now_ms

_MAX_HISTORY = 50
_lock = threading.RLock()


def _path(project_id: str):
    if not project_id.replace("-", "").isalnum():
        raise ValueError("Invalid project id")
    return PROJECTS_DIR / f"{project_id}.json"


def _history_path(project_id: str):
    return PROJECTS_DIR / f"{project_id}.history.json"


def _load_history(project_id: str) -> Dict[str, List[list]]:
    p = _history_path(project_id)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {"undo": [], "redo": []}


def _save_history(project_id: str, hist: Dict[str, List[list]]) -> None:
    _history_path(project_id).write_text(json.dumps(hist, ensure_ascii=False), encoding="utf-8")


def get(project_id: str) -> Optional[Project]:
    with _lock:
        p = _path(project_id)
        if not p.exists():
            return None
        return Project.model_validate_json(p.read_text(encoding="utf-8"))


def require(project_id: str) -> Project:
    project = get(project_id)
    if project is None:
        raise KeyError(f"Project '{project_id}' not found")
    return project


def save(project: Project) -> Project:
    with _lock:
        project.updated_at = now_ms()
        _path(project.id).write_text(project.model_dump_json(indent=2), encoding="utf-8")
        return project


def list_all() -> List[Project]:
    with _lock:
        items = []
        for p in PROJECTS_DIR.glob("*.json"):
            if p.name.endswith(".history.json"):
                continue
            try:
                items.append(Project.model_validate_json(p.read_text(encoding="utf-8")))
            except ValueError:
                continue
        return sorted(items, key=lambda x: x.updated_at, reverse=True)


def delete(project_id: str) -> None:
    with _lock:
        for p in (_path(project_id), _history_path(project_id)):
            if p.exists():
                p.unlink()


def snapshot(project: Project) -> None:
    """Record the current scene list so the next change can be undone."""
    with _lock:
        hist = _load_history(project.id)
        hist["undo"].append([s.model_dump() for s in project.scenes])
        hist["undo"] = hist["undo"][-_MAX_HISTORY:]
        hist["redo"] = []
        _save_history(project.id, hist)


def _step(project_id: str, src: str, dst: str) -> Project:
    with _lock:
        project = require(project_id)
        hist = _load_history(project_id)
        if not hist[src]:
            raise ValueError(f"Nothing to {src}")
        hist[dst].append([s.model_dump() for s in project.scenes])
        project.scenes = [Scene.model_validate(s) for s in hist[src].pop()]
        _save_history(project_id, hist)
        return save(project)


def undo(project_id: str) -> Project:
    return _step(project_id, "undo", "redo")


def redo(project_id: str) -> Project:
    return _step(project_id, "redo", "undo")


def history_depth(project_id: str) -> Dict[str, int]:
    hist = _load_history(project_id)
    return {"undo": len(hist["undo"]), "redo": len(hist["redo"])}
