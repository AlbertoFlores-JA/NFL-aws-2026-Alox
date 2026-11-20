"""API de NFL Broadcast Co-Pilot. Ejecuta: .venv/bin/uvicorn backend.main:app --reload

Reutiliza data_processor.py (misma lógica que app.py de Streamlit).
"""
import math
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

import data_processor as dp  # noqa: E402

app = FastAPI(title="NFL Broadcast Co-Pilot")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


# ------------------------------------------------------------------ datos en memoria
@lru_cache(maxsize=1)
def _game() -> dict:
    path = dp.find_tracking_file()
    gid = dp.game_id_from_file(path)
    games = dp.load_games()
    return {
        "gid": gid,
        "row": games[games["gameId"] == gid].iloc[0],
        "plays": dp.load_plays(gid),
        "players": dp.load_players(),
        "pff": dp.load_pff(gid),
        "tracking": dp.load_tracking(path),
    }


@lru_cache(maxsize=1)
def _menu() -> pd.DataFrame:
    return dp.interesting_plays(_game()["plays"])


def _num(v):
    """float/int/NaN/NA -> número JSON o None."""
    if v is None or v is pd.NA:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else (int(f) if f.is_integer() and not isinstance(v, float) else f)


def _txt(v):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) or v is pd.NA else str(v)


def _header(row: pd.Series) -> dict:
    g = _game()["row"]
    return {
        "home": g["homeTeamAbbr"], "visitor": g["visitorTeamAbbr"],
        "homeScore": int(row["preSnapHomeScore"]), "visitorScore": int(row["preSnapVisitorScore"]),
        "quarter": int(row["quarter"]), "down": _num(row["down"]), "downLabel": dp._ordinal(row["down"]),
        "yardsToGo": int(row["yardsToGo"]), "clock": _txt(row["gameClock"]),
        "offense": row["possessionTeam"], "defense": row["defensiveTeam"],
        "formation": _txt(row["offenseFormation"]),
    }


# ------------------------------------------------------------------ API
@app.get("/api/game")
def game() -> dict:
    g = _game()
    r = g["row"]
    return {"gameId": int(g["gid"]), "week": int(r["week"]), "date": r["gameDate"],
            "home": r["homeTeamAbbr"], "visitor": r["visitorTeamAbbr"]}


@app.get("/api/plays")
def plays() -> list[dict]:
    return [{"playId": int(r.playId), "label": r.label} for r in _menu().itertuples()]


@app.get("/api/plays/{play_id}")
def play(play_id: int) -> dict:
    g = _game()
    m = g["plays"][g["plays"]["playId"] == play_id]
    if m.empty:
        raise HTTPException(404, "Jugada no encontrada")
    row = m.iloc[0]
    try:
        df = dp.prepare_play(g["tracking"], g["players"], g["pff"], g["gid"], play_id)
    except LookupError:
        raise HTTPException(404, "Sin tracking para esta jugada")
    pressure = dp.pocket_pressure(df)
    sep = dp.receiver_separation(df)
    kf = dp.key_frames(df)
    gauge_value, gauge_when = dp.pressure_at_pass(pressure, kf)

    # --- jugadores (estático) y posiciones por frame
    one = df[~df["is_ball"]].drop_duplicates("nflId")
    players = [
        {"id": int(r.nflId), "name": r.displayName, "pos": r.pos, "jersey": int(r.jerseyNumber) if pd.notna(r.jerseyNumber) else None,
         "side": "off" if r.team == row["possessionTeam"] else "def", "role": _txt(r.pff_role)}
        for r in one.itertuples()
    ]
    pidx = {p["id"]: i for i, p in enumerate(players)}
    sep_by_frame: dict[int, dict[int, float]] = {}
    for r in sep.itertuples():
        sep_by_frame.setdefault(int(r.frameId), {})[int(r.nflId)] = float(r.sep)
    press_by_frame = {int(r.frameId): float(r.score) for r in pressure.itertuples()}

    frames = []
    for fid, g_df in df.groupby("frameId", sort=True):
        fid = int(fid)
        pos = [None] * len(players)
        speed = [None] * len(players)
        ball = None
        for r in g_df.itertuples():
            if r.is_ball:
                ball = [round(float(r.x), 2), round(float(r.y), 2)]
            elif r.nflId is not pd.NA and int(r.nflId) in pidx:
                i = pidx[int(r.nflId)]
                pos[i] = [round(float(r.x), 2), round(float(r.y), 2)]
                speed[i] = _num(round(float(r.s), 1)) if pd.notna(r.s) else None
        seps = sep_by_frame.get(fid, {})
        frames.append({
            "f": fid,
            "ball": ball,
            "p": pos,
            "s": speed,
            "sep": {str(k): round(v, 2) for k, v in seps.items()},   # separación de cada receptor
            "open": [k for k, v in seps.items() if v >= dp.OPEN_SEP],  # receptores ABIERTOS (halo)
            "pressure": None if fid not in press_by_frame else round(press_by_frame[fid], 1),
            "events": sorted(g_df["event"].dropna().unique().tolist()),
        })

    return {
        "playId": play_id,
        "header": _header(row),
        "snapFrame": kf["snap"], "releaseFrame": kf["release"], "lastFrame": kf["last"], "fps": dp.FPS,
        "thresholds": {"open": dp.OPEN_SEP, "pressureFull": dp.PRESSURE_FULL, "pressureZero": dp.PRESSURE_ZERO},
        "players": players,
        "frames": frames,
        "gauge": {"value": round(gauge_value, 1), "when": gauge_when},
        "coverage": {
            "name": _txt(row["pff_passCoverage"]), "type": _txt(row["pff_passCoverageType"]),
            "text": dp.translate_coverage(row["pff_passCoverage"], row["pff_passCoverageType"]),
        },
        "alerts": dp.duel_alerts(df),
        "keyPoints": dp.key_points(df, row, pressure, sep, kf),
        "narration": dp.suggested_narration(df, row, pressure, sep, kf),
        "replay": dp.replay_analysis(df, row, pressure, sep, kf),
        "description": _txt(row["playDescription"]),
    }


# El servidor sirve el build del dashboard en el mismo puerto (solo si existe).
_dist = ROOT / "dashboard" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="dashboard")
