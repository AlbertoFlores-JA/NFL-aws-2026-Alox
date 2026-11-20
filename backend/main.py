"""API del visor de grafos dinámicos. Ejecuta: .venv/bin/uvicorn backend.main:app --reload"""
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from . import nfl

app = FastAPI(title="Hackathon NFL UNAM")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/games")
def games() -> list[dict]:
    return nfl.list_games()


@app.get("/api/games/{game_id}/plays")
def plays(game_id: int) -> list[dict]:
    result = nfl.list_plays(game_id)
    if not result:
        raise HTTPException(404, "Partido no encontrado")
    return result


@app.get("/api/games/{game_id}/plays/{play_id}")
def play(game_id: int, play_id: int) -> dict:
    try:
        return nfl.build_play(game_id, play_id)
    except (FileNotFoundError, LookupError):
        raise HTTPException(404, "Jugada o tracking no encontrado")


# El servidor sirve el build del dashboard en el mismo puerto (solo si existe).
_dist = Path(__file__).resolve().parent.parent / "dashboard" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="dashboard")
