import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.app.config import MEDIA_DIR
from backend.app.gnani import GnaniError
from backend.app.llm.gemini import LLMError
from backend.app.media.audio import AudioError
from backend.app.routes import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Vivarisu AI", description="Prompt to narrated Kannada episode, powered by Gnani + Gemini.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _err(status: int):
    async def handler(_: Request, exc: Exception):
        return JSONResponse(status_code=status, content={"detail": str(exc).strip("'\"")})
    return handler


app.add_exception_handler(KeyError, _err(404))
app.add_exception_handler(ValueError, _err(400))
app.add_exception_handler(PermissionError, _err(403))
app.add_exception_handler(GnaniError, _err(502))
app.add_exception_handler(LLMError, _err(502))
app.add_exception_handler(AudioError, _err(500))

app.include_router(router)
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
