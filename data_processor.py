"""Procesamiento de datos y métricas para NFL Broadcast Co-Pilot.

Funciones puras de pandas/numpy (sin Streamlit) para poder probarlas aparte.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

DATA = Path(__file__).resolve().parent / "data"
FPS = 10  # el tracking de la NFL va a 10 frames por segundo

# Métricas
PRESSURE_FULL = 1.5   # <= 1.5 yd: 100 % de peligro
PRESSURE_ZERO = 8.0   # >= 8 yd: 0 %
OPEN_SEP = 3.0        # >= 3 yd: receptor ABIERTO

FIELD_W, FIELD_H = 120.0, 160.0 / 3.0

ROLE_QB = "pass"
ROLE_ROUTE = "pass route"
ROLE_BLOCK = "pass block"
ROLE_RUSH = "pass rush"
ROLE_COV = "coverage"


# ------------------------------------------------------------------ carga
def find_tracking_file() -> Path:
    """Primer tracking_*.csv disponible (en /data o /data/tracking)."""
    files = sorted(list(DATA.glob("tracking_*.csv")) + list(DATA.glob("tracking/tracking_*.csv")))
    if not files:
        raise FileNotFoundError("No hay archivos tracking_*.csv en /data")
    return files[0]


def game_id_from_file(path: Path) -> int:
    return int(path.stem.split("_")[1])


def load_games() -> pd.DataFrame:
    return pd.read_csv(DATA / "games.csv")


def load_plays(game_id: int) -> pd.DataFrame:
    p = pd.read_csv(DATA / "plays.csv")
    return p[p["gameId"] == game_id].reset_index(drop=True)


def load_players() -> pd.DataFrame:
    return pd.read_csv(DATA / "players.csv")


def load_pff(game_id: int) -> pd.DataFrame:
    p = pd.read_csv(DATA / "pffScoutingData.csv")
    p = p[p["gameId"] == game_id].copy()
    p["role_key"] = p["pff_role"].astype("string").str.strip().str.lower()
    return p.reset_index(drop=True)


def load_tracking(path: Path) -> pd.DataFrame:
    """Lee el tracking del partido. nflId = NaN identifica al balón."""
    df = pd.read_csv(
        path,
        usecols=["gameId", "playId", "nflId", "frameId", "team", "playDirection",
                 "jerseyNumber", "x", "y", "s", "dir", "o", "event"],
    )
    df["event"] = df["event"].where(df["event"].notna() & (df["event"] != "None"))
    return df


# ------------------------------------------------------------------ menú de jugadas
RESULT_LABEL = {
    "C": "Pase completo",
    "I": "Pase incompleto",
    "S": "Sack",
    "IN": "Intercepción",
    "R": "QB corre (scramble)",
}


def _ordinal(n) -> str:
    if pd.isna(n):
        return "?"
    n = int(n)
    return {1: "1st", 2: "2nd", 3: "3rd", 4: "4th"}.get(n, f"{n}th")


def interesting_plays(plays: pd.DataFrame, limit: int = 40) -> pd.DataFrame:
    """Ordena por interés: intercepciones y sacks, luego pases largos completos."""
    p = plays.copy()
    gain = pd.to_numeric(p["playResult"], errors="coerce").fillna(0)
    score = np.zeros(len(p))
    score += np.where(p["passResult"] == "IN", 100, 0)
    score += np.where(p["passResult"] == "S", 80, 0)
    long_c = (p["passResult"] == "C") & (gain >= 20)
    score += np.where(long_c, 50 + gain, 0)
    score += np.where(p["passResult"] == "R", 20, 0)
    p["interest"] = score
    p = p[p["interest"] > 0].sort_values(["interest", "playId"], ascending=[False, True]).head(limit)
    if p.empty:  # partido sin jugadas destacadas: muestra las primeras
        p = plays.head(limit).copy()
        p["interest"] = 0
    p["label"] = p.apply(_play_label, axis=1)
    return p.reset_index(drop=True)


def _play_label(r) -> str:
    res = RESULT_LABEL.get(r["passResult"], "Jugada")
    gain = pd.to_numeric(r.get("playResult"), errors="coerce")
    extra = f" ({int(gain)} yd)" if pd.notna(gain) and r["passResult"] in ("C", "S") else ""
    return (f"Q{int(r['quarter'])} - {_ordinal(r['down'])} & {int(r['yardsToGo'])} | "
            f"{r['possessionTeam']} vs {r['defensiveTeam']} - {res}{extra}")


# ------------------------------------------------------------------ jugada
def prepare_play(tracking: pd.DataFrame, players: pd.DataFrame, pff: pd.DataFrame,
                 game_id: int, play_id: int) -> pd.DataFrame:
    """Cruza tracking + players + pff para una jugada. El ataque se orienta hacia la derecha."""
    t = tracking[(tracking["playId"] == play_id)].copy()
    if t.empty:
        raise LookupError(f"Sin tracking para playId={play_id}")
    if (t["playDirection"] == "left").any():
        t["x"] = FIELD_W - t["x"]
        t["y"] = FIELD_H - t["y"]
    t["is_ball"] = t["nflId"].isna()
    t["nflId"] = t["nflId"].astype("Int64")

    pl = players[["nflId", "displayName", "officialPosition"]].copy()
    pl["nflId"] = pl["nflId"].astype("Int64")
    p = pff[pff["playId"] == play_id][["nflId", "pff_role", "role_key", "pff_positionLinedUp",
                                        "pff_hit", "pff_hurry", "pff_sack", "pff_beatenByDefender",
                                        "pff_nflIdBlockedPlayer"]].copy()
    p["nflId"] = p["nflId"].astype("Int64")

    df = t.merge(pl, on="nflId", how="left").merge(p, on="nflId", how="left")
    df["displayName"] = np.where(df["is_ball"], "Balón", df["displayName"].fillna("Jugador " + df["nflId"].astype(str)))
    df["role_key"] = df["role_key"].fillna("")
    df.loc[df["is_ball"], "role_key"] = "ball"
    df["pos"] = df["pff_positionLinedUp"].fillna(df["officialPosition"]).fillna("")
    return df.sort_values(["frameId", "is_ball", "nflId"]).reset_index(drop=True)


def key_frames(df: pd.DataFrame) -> dict:
    """Frames de snap, pase y fin de la ventana del QB."""
    ev = df[df["event"].notna()].drop_duplicates(["frameId", "event"])
    first = {}
    for r in ev.sort_values("frameId").itertuples():
        first.setdefault(r.event, int(r.frameId))
    snap = min([first[e] for e in ("ball_snap", "autoevent_ballsnap") if e in first], default=int(df["frameId"].min()))
    rel = next((first[e] for e in ("pass_forward", "autoevent_passforward") if e in first), None)
    return {"snap": snap, "release": rel, "events": first, "last": int(df["frameId"].max())}


# ------------------------------------------------------------------ métricas
def _xy(df: pd.DataFrame, mask) -> pd.DataFrame:
    return df[mask][["frameId", "nflId", "x", "y"]]


def pocket_pressure(df: pd.DataFrame) -> pd.DataFrame:
    """Pocket Collapse Score por frame (0-100 %) y rusher más cercano."""
    qb = _xy(df, df["role_key"] == ROLE_QB).drop_duplicates("frameId")
    rush = _xy(df, df["role_key"] == ROLE_RUSH)
    cols = ["frameId", "min_dist", "score", "rusher_id"]
    if qb.empty or rush.empty:
        return pd.DataFrame(columns=cols)
    m = rush.merge(qb, on="frameId", suffixes=("_r", "_q"))
    m["d"] = np.hypot(m["x_r"] - m["x_q"], m["y_r"] - m["y_q"])
    idx = m.groupby("frameId")["d"].idxmin()
    best = m.loc[idx, ["frameId", "d", "nflId_r"]].rename(columns={"d": "min_dist", "nflId_r": "rusher_id"})
    best["score"] = ((PRESSURE_ZERO - best["min_dist"]) / (PRESSURE_ZERO - PRESSURE_FULL)).clip(0, 1) * 100
    return best[cols].reset_index(drop=True)


def receiver_separation(df: pd.DataFrame) -> pd.DataFrame:
    """Separación mínima de cada 'Pass Route' respecto a los defensores 'Coverage'."""
    rec = _xy(df, df["role_key"] == ROLE_ROUTE)
    cov = _xy(df, df["role_key"] == ROLE_COV)
    cols = ["frameId", "nflId", "sep", "defender_id", "abierto"]
    if rec.empty or cov.empty:
        return pd.DataFrame(columns=cols)
    m = rec.merge(cov, on="frameId", suffixes=("_r", "_d"))
    m["d"] = np.hypot(m["x_r"] - m["x_d"], m["y_r"] - m["y_d"])
    idx = m.groupby(["frameId", "nflId_r"])["d"].idxmin()
    best = m.loc[idx, ["frameId", "nflId_r", "d", "nflId_d"]].rename(
        columns={"nflId_r": "nflId", "d": "sep", "nflId_d": "defender_id"})
    best["abierto"] = best["sep"] >= OPEN_SEP
    return best[cols].reset_index(drop=True)


# ------------------------------------------------------------------ narrativa
COVERAGE_PLAIN = {
    "Cover-0": "Defensa agresiva hombre a hombre sin red de seguridad atrás (Blitz).",
    "Cover-1": "Cada defensor sigue a un receptor y uno solo vigila el fondo como último recurso.",
    "Cover-2": "Dos defensores profundos cuidando pases largos.",
    "Cover-3": "Tres defensores se reparten el fondo del campo; los demás cuidan zonas cortas.",
    "Cover-6": "Mezcla: un lado del campo defiende en cuatro zonas y el otro con dos defensores profundos.",
    "Quarters": "Cuatro defensores profundos, cada uno cuida un cuarto del campo.",
    "2-Man": "Dos defensores profundos de apoyo y el resto sigue a un receptor.",
    "Bracket": "Dos defensores se juntan para frenar a la gran estrella rival.",
    "Prevent": "Defensa muy retrasada para impedir jugadas largas, regala yardas cortas.",
    "Red Zone": "Defensa cerca de la zona de anotación, con muy poco espacio para el ataque.",
    "Goal Line": "Defensa pegada a la línea de gol para evitar el touchdown.",
    "Miscellaneous": "Cobertura poco común, mezcla de ideas.",
}
TYPE_PLAIN = {"Man": "Marcaje: cada defensor persigue a un rival.",
              "Zone": "Marcaje: cada defensor cuida un área del campo.",
              "Other": "Marcaje mixto."}


def translate_coverage(cov, cov_type) -> str:
    if cov is None or pd.isna(cov):
        return "Cobertura no clasificada."
    txt = COVERAGE_PLAIN.get(str(cov), f"Cobertura {cov}.")
    t = TYPE_PLAIN.get(str(cov_type)) if cov_type is not None and not pd.isna(cov_type) else None
    return f"{txt} {t}" if t else txt


def _name(df: pd.DataFrame, nfl_id) -> str:
    r = df[df["nflId"] == nfl_id]["displayName"]
    return str(r.iloc[0]) if len(r) else f"Jugador {nfl_id}"


def duel_alerts(df: pd.DataFrame) -> list[str]:
    """Alertas rojas: bloqueador vencido, sack o presión (hurry) de un defensor."""
    one = df[~df["is_ball"]].drop_duplicates("nflId")
    flags: dict[int, set[str]] = {}
    beaten = one[one["pff_beatenByDefender"] == 1]
    for r in beaten.itertuples():
        if pd.notna(r.pff_nflIdBlockedPlayer):
            flags.setdefault(int(r.pff_nflIdBlockedPlayer), set()).add("beaten")
    for r in one[one["pff_sack"] == 1].itertuples():
        flags.setdefault(int(r.nflId), set()).add("sack")
    for r in one[one["pff_hurry"] == 1].itertuples():
        flags.setdefault(int(r.nflId), set()).add("hurry")
    cards = []
    for nid, f in flags.items():
        who = _name(df, nid)
        extra = ""
        if "sack" in f:
            extra = " y terminó derribando al QB (sack)"
        elif "hurry" in f:
            extra = " y apuró al QB"
        cards.append(f"⚠️ Duelo perdido en la línea: {who} superó la protección{extra}")
    # bloqueadores vencidos sin defensor identificado
    if not any("beaten" in f for f in flags.values()):
        for r in beaten.itertuples():
            cards.append(f"⚠️ Duelo perdido en la línea: {r.displayName} fue superado por su rival")
    return cards


def key_points(df: pd.DataFrame, plays_row: pd.Series, pressure: pd.DataFrame,
               sep: pd.DataFrame, kf: dict) -> list[str]:
    pts = []
    qb = df[df["role_key"] == ROLE_QB]["displayName"]
    qb_name = qb.iloc[0] if len(qb) else "El mariscal"
    snap, rel = kf["snap"], kf["release"]
    if rel is not None:
        pts.append(f"⏱️ {qb_name} soltó el balón {(rel - snap) / FPS:.1f} segundos después del snap "
                   "(el snap es cuando el centro le entrega el balón).")
    if not pressure.empty:
        w = pressure[(pressure["frameId"] >= snap) & (pressure["frameId"] <= (rel or kf["last"]))]
        if not w.empty:
            top = w.loc[w["score"].idxmax()]
            pts.append(f"🔥 Máxima presión sobre el QB: {top['score']:.0f}% a los "
                       f"{(top['frameId'] - snap) / FPS:.1f} s, con {_name(df, top['rusher_id'])} encima.")
    if rel is not None and not sep.empty:
        at = sep[sep["frameId"] == rel].sort_values("sep", ascending=False)
        if not at.empty:
            b = at.iloc[0]
            estado = "ABIERTO" if b["abierto"] else "bien cubierto"
            pts.append(f"🎯 En el momento del pase, el receptor con más espacio era {_name(df, b['nflId'])}: "
                       f"{b['sep']:.1f} yardas de su defensor ({estado}).")
            n_open = int(at["abierto"].sum())
            pts.append(f"👀 Receptores abiertos al lanzar (3 yardas o más de ventaja): {n_open} de {len(at)}.")
    res = plays_row.get("passResult")
    if res in RESULT_LABEL:
        gain = pd.to_numeric(plays_row.get("playResult"), errors="coerce")
        g = f" Ganancia neta: {int(gain)} yardas." if pd.notna(gain) else ""
        pts.append(f"📋 Resultado: {RESULT_LABEL[res]}.{g}")
    return pts


COVERAGE_SHORT = {
    "Cover-0": "todos van pegados a un rival y nadie cuida el fondo",
    "Cover-1": "cada quien sigue a un rival y uno vigila el fondo",
    "Cover-2": "dos defensores cuidan el fondo",
    "Cover-3": "tres defensores cuidan el fondo",
    "Cover-6": "se combinan varias zonas",
    "Quarters": "cuatro defensores cuidan el fondo",
    "2-Man": "dos vigilan el fondo y los demás van pegados a un rival",
    "Prevent": "todos se quedan muy atrás para evitar el pase largo",
    "Red Zone": "hay poco espacio cerca de la zona de anotación",
    "Goal Line": "todos se pegan a la línea de gol",
    "Bracket": "dos defensores cubren a un mismo rival",
    "Miscellaneous": "el plan es poco común",
}


def _coverage_short(cov) -> str:
    return COVERAGE_SHORT.get(str(cov), "el plan es mixto") if isinstance(cov, str) else "el plan es mixto"


def _qb_name(df: pd.DataFrame) -> str:
    qb = df[df["role_key"] == ROLE_QB]["displayName"]
    return qb.iloc[0] if len(qb) else "El mariscal"


def _pressure_moment(df, pressure, kf):
    """(porcentaje, nombre del rusher) en el pase, o en el punto máximo si no hubo pase."""
    if pressure.empty:
        return None, None
    rel, snap = kf["release"], kf["snap"]
    if rel is not None and (pressure["frameId"] == rel).any():
        r = pressure[pressure["frameId"] == rel].iloc[0]
    else:
        w = pressure[(pressure["frameId"] >= snap) & (pressure["frameId"] <= (rel or kf["last"]))]
        if w.empty:
            return None, None
        r = w.loc[w["score"].idxmax()]
    return float(r["score"]), _name(df, r["rusher_id"])


def _gain(plays_row):
    g = pd.to_numeric(plays_row.get("playResult"), errors="coerce")
    return int(g) if pd.notna(g) else None


def suggested_narration(df: pd.DataFrame, plays_row: pd.Series, pressure: pd.DataFrame,
                        sep: pd.DataFrame, kf: dict) -> str:
    """Máximo 2 oraciones cortas, listas para leerse en voz alta."""
    qb = _qb_name(df)
    short = _coverage_short(plays_row.get("pff_passCoverage"))
    pct, rusher = _pressure_moment(df, pressure, kf)
    res, gain, rel = plays_row.get("passResult"), _gain(plays_row), kf["release"]

    if rel is None:
        if res == "S":
            s1 = f"Contra una defensa donde {short}, {rusher or 'la defensa'} le gana a la protección."
            s2 = f"¡Sack, y {qb} pierde {abs(gain)} yardas!" if gain is not None else f"¡Sack a {qb}!"
        else:
            s1 = f"Contra una defensa donde {short}, {qb} decide no lanzar."
            s2 = "Termina la jugada sin pase."
        return f"{s1} {s2}"

    s1 = f"Contra una defensa donde {short}, {qb} lanza"
    s1 += f" con {pct:.0f}% de presión encima" if pct is not None else ""
    best = None
    if not sep.empty:
        at = sep[sep["frameId"] == rel].sort_values("sep", ascending=False)
        best = at.iloc[0] if not at.empty else None
    if best is not None and best["abierto"]:
        s1 += f" y con {_name(df, best['nflId'])} libre a {best['sep']:.1f} yardas del defensor"
    s1 += "."
    s2 = {
        "C": f"¡Pase completo{f' de {gain} yardas' if gain is not None else ''}!",
        "IN": "¡La defensa lo intercepta!",
        "I": "El pase cae incompleto.",
    }.get(res, "Así termina la jugada.")
    return f"{s1} {s2}"


def replay_analysis(df: pd.DataFrame, plays_row: pd.Series, pressure: pd.DataFrame,
                    sep: pd.DataFrame, kf: dict) -> list[str]:
    """Tres viñetas simples: cómo defendieron, tiempo del mariscal y cómo terminó."""
    qb = _qb_name(df)
    rel, snap = kf["release"], kf["snap"]
    cov_type = plays_row.get("pff_passCoverageType")
    tipo = {"Man": " Cada defensor siguió a un rival.", "Zone": " Cada defensor cuidó una zona."}.get(
        cov_type if isinstance(cov_type, str) else "", "")
    b1 = f"🛡️ Cómo defendieron: {plays_row['defensiveTeam']} defendió así: {_coverage_short(plays_row.get('pff_passCoverage'))}.{tipo}"

    w = pressure[(pressure["frameId"] >= snap) & (pressure["frameId"] <= (rel or kf["last"]))] if not pressure.empty else pressure
    peak = float(w["score"].max()) if len(w) else None
    veredicto = ("lo apretaron mucho" if peak is not None and peak >= 66
                 else "sintió algo de presión" if peak is not None and peak >= 33
                 else "tuvo tiempo de sobra")
    if rel is not None:
        b2 = f"⏱️ Tiempo del mariscal: {qb} tuvo {(rel - snap) / FPS:.1f} segundos para lanzar y {veredicto}."
    else:
        b2 = f"⏱️ Tiempo del mariscal: {qb} no alcanzó a lanzar; {veredicto}."

    res, gain = plays_row.get("passResult"), _gain(plays_row)
    fin = {
        "C": "pase completo", "I": "pase incompleto", "IN": "la defensa interceptó el pase",
        "S": "sack: derribaron al mariscal antes de lanzar", "R": "el mariscal salió corriendo",
    }.get(res, "terminó la jugada")
    g = "" if gain is None or res in ("I", "IN") else f" ({gain:+d} yardas)"
    b3 = f"🏁 Cómo terminó: {fin}{g}."
    return [b1, b2, b3]


def pressure_at_pass(pressure: pd.DataFrame, kf: dict) -> tuple[float, str]:
    """Valor del medidor: presión en pass_forward, o el máximo de la jugada si no hubo pase."""
    if pressure.empty:
        return 0.0, "sin datos de presión"
    rel = kf["release"]
    if rel is not None and (pressure["frameId"] == rel).any():
        return float(pressure.loc[pressure["frameId"] == rel, "score"].iloc[0]), "al momento del pase"
    w = pressure[pressure["frameId"] >= kf["snap"]]
    return float((w if not w.empty else pressure)["score"].max()), "máximo de la jugada (no hubo pase)"


def animation_table(df: pd.DataFrame, offense: str, sep: pd.DataFrame) -> pd.DataFrame:
    """Tabla larga para px.scatter(animation_frame='frameId')."""
    d = df.copy()
    d["grupo"] = np.where(d["is_ball"], "Balón",
                          np.where(d["team"] == offense, "Ofensiva", "Defensiva"))
    d["jersey"] = d["jerseyNumber"].astype("Int64").astype(str).replace("<NA>", "")
    d["velocidad"] = d["s"].round(1)
    d["hover"] = np.where(d["is_ball"], "Balón",
                          d["displayName"] + " #" + d["jersey"] + " (" + d["pos"].astype(str) + ")")
    d["size"] = np.where(d["is_ball"], 5, 10)
    d["texto"] = np.where(d["is_ball"], "", d["jersey"])
    base = d[["frameId", "x", "y", "grupo", "hover", "velocidad", "size", "texto"]]

    halo = pd.DataFrame(columns=base.columns)
    if not sep.empty:
        op = sep[sep["abierto"]][["frameId", "nflId", "sep"]]
        h = op.merge(d[["frameId", "nflId", "x", "y", "displayName", "jersey"]], on=["frameId", "nflId"])
        if not h.empty:
            halo = pd.DataFrame({
                "frameId": h["frameId"], "x": h["x"], "y": h["y"], "grupo": "ABIERTO",
                "hover": h["displayName"] + " #" + h["jersey"] + " · ABIERTO",
                "velocidad": np.nan, "size": 24, "texto": ""})
            halo["hover"] = halo["hover"] + h["sep"].map(lambda v: f" ({v:.1f} yd)")
    out = pd.concat([halo, base], ignore_index=True)
    return out.sort_values("frameId").reset_index(drop=True)
