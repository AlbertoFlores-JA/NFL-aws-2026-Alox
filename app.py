"""NFL Broadcast Co-Pilot. Ejecuta: streamlit run app.py"""
from __future__ import annotations

import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

import data_processor as dp

st.set_page_config(page_title="NFL Broadcast Co-Pilot", page_icon="🏈", layout="wide")

CSS = """
<style>
.score{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(90deg,#0b1d3a,#13294b);
  border:2px solid #2b4a7a;border-radius:10px;padding:10px 22px;margin-bottom:10px;color:#fff;font-family:Arial,sans-serif}
.score .team{font-size:2rem;font-weight:800;letter-spacing:2px}
.score .pts{font-size:2.2rem;font-weight:800;background:#000;padding:0 14px;border-radius:6px;margin:0 10px}
.score .mid{text-align:center}
.score .mid .big{font-size:1.4rem;font-weight:700;color:#ffd24d}
.score .mid .small{font-size:.9rem;color:#9db4d6}
.card{border-radius:8px;padding:10px 12px;margin-bottom:8px;font-size:.95rem;line-height:1.35;color:#fff}
.card.info{background:#12335a;border-left:5px solid #38bdf8}
.card.red{background:#5a1212;border-left:5px solid #ef4444}
.card.key{background:#16372a;border-left:5px solid #22c55e}
</style>
"""
st.markdown(CSS, unsafe_allow_html=True)


# ------------------------------------------------------------------ carga con caché
@st.cache_data(show_spinner="Cargando partido…")
def load_game():
    path = dp.find_tracking_file()
    gid = dp.game_id_from_file(path)
    return {
        "game_id": gid,
        "games": dp.load_games(),
        "plays": dp.load_plays(gid),
        "players": dp.load_players(),
        "pff": dp.load_pff(gid),
        "tracking": dp.load_tracking(path),
    }


@st.cache_data(show_spinner="Calculando métricas…")
def analyze(game_id: int, play_id: int):
    g = load_game()
    df = dp.prepare_play(g["tracking"], g["players"], g["pff"], game_id, play_id)
    return df, dp.pocket_pressure(df), dp.receiver_separation(df), dp.key_frames(df)


# ------------------------------------------------------------------ figuras
def field_shapes() -> list[dict]:
    s = [dict(type="rect", x0=0, x1=120, y0=0, y1=dp.FIELD_H, fillcolor="#14532d", line=dict(color="#fff", width=2), layer="below"),
         dict(type="rect", x0=0, x1=10, y0=0, y1=dp.FIELD_H, fillcolor="#1e3a8a", line=dict(width=0), layer="below"),
         dict(type="rect", x0=110, x1=120, y0=0, y1=dp.FIELD_H, fillcolor="#7c2d12", line=dict(width=0), layer="below")]
    for x in range(10, 111, 10):
        s.append(dict(type="line", x0=x, x1=x, y0=0, y1=dp.FIELD_H, line=dict(color="rgba(255,255,255,.55)", width=1), layer="below"))
    for x in range(15, 106, 10):
        s.append(dict(type="line", x0=x, x1=x, y0=0, y1=dp.FIELD_H, line=dict(color="rgba(255,255,255,.2)", width=1, dash="dot"), layer="below"))
    return s


def build_field(anim: "px.data", offense: str, defense: str, kf: dict):
    fig = px.scatter(
        anim, x="x", y="y", animation_frame="frameId", color="grupo", size="size", size_max=24, text="texto",
        hover_name="hover", hover_data={"velocidad": ":.1f", "x": False, "y": False, "grupo": False,
                                         "size": False, "texto": False},
        category_orders={"grupo": ["ABIERTO", "Defensiva", "Ofensiva", "Balón"]},
        color_discrete_map={"ABIERTO": "rgba(57,255,20,0.45)", "Defensiva": "#f97316",
                            "Ofensiva": "#3b82f6", "Balón": "#a16207"},
        labels={"velocidad": "Velocidad (yd/s)", "grupo": "Grupo"},
    )

    def style(tr):
        if tr.name == "ABIERTO":
            tr.update(marker=dict(line=dict(color="#39ff14", width=2)), hoverlabel=dict(bgcolor="#14532d"))
        elif tr.name == "Balón":
            tr.update(marker=dict(line=dict(color="#fff", width=1)))
        else:
            tr.update(marker=dict(line=dict(color="#fff", width=1)), textposition="middle center",
                      textfont=dict(color="#fff", size=9))
    for tr in fig.data:
        style(tr)
    for fr in fig.frames:
        for tr in fr.data:
            style(tr)
    fig.update_traces(selector=dict(name="ABIERTO"), showlegend=True)

    # decoración estática del campo (yardas) en el layout
    nums = [(x, str(x - 10 if x <= 60 else 110 - x)) for x in range(20, 101, 10)]
    ann = [dict(x=x, y=4, text=t, showarrow=False, font=dict(color="rgba(255,255,255,.45)", size=16)) for x, t in nums]
    ann += [dict(x=5, y=dp.FIELD_H / 2, text=offense, textangle=-90, showarrow=False, font=dict(color="rgba(255,255,255,.7)", size=20)),
            dict(x=115, y=dp.FIELD_H / 2, text=defense, textangle=90, showarrow=False, font=dict(color="rgba(255,255,255,.7)", size=20))]
    fig.update_layout(
        template="plotly_dark", shapes=field_shapes(), annotations=ann, height=560,
        margin=dict(l=0, r=0, t=0, b=0), paper_bgcolor="#0e1117", plot_bgcolor="#14532d",
        xaxis=dict(range=[-1, 121], visible=False, constrain="domain"),
        yaxis=dict(range=[-1, dp.FIELD_H + 1], visible=False, scaleanchor="x", scaleratio=1),
        legend=dict(orientation="h", y=1.02, x=0, title=None),
    )
    # velocidad de reproducción: 10 fps, sin interpolación
    if fig.layout.updatemenus:
        fig.layout.updatemenus[0].buttons[0].args[1]["frame"]["duration"] = 100
        fig.layout.updatemenus[0].buttons[0].args[1]["transition"]["duration"] = 0
    # el slider salta al snap de entrada no aplica: se deja en el primer frame
    return fig


def gauge(value: float) -> go.Figure:
    fig = go.Figure(go.Indicator(
        mode="gauge+number", value=value, number=dict(suffix="%", font=dict(size=40)),
        gauge=dict(axis=dict(range=[0, 100]), bar=dict(color="#ef4444" if value >= 66 else "#eab308" if value >= 33 else "#22c55e"),
                   steps=[dict(range=[0, 33], color="#14391f"), dict(range=[33, 66], color="#4a3d10"),
                          dict(range=[66, 100], color="#4a1414")])))
    fig.update_layout(height=210, margin=dict(l=30, r=40, t=30, b=0), paper_bgcolor="#0e1117", template="plotly_dark")
    return fig


def pressure_line(pressure, kf) -> go.Figure:
    p = pressure[pressure["frameId"] >= kf["snap"]].copy()
    p["seg"] = (p["frameId"] - kf["snap"]) / dp.FPS
    fig = px.area(p, x="seg", y="score", labels={"seg": "Segundos desde el snap", "score": "Presión %"})
    fig.update_traces(line_color="#ef4444", fillcolor="rgba(239,68,68,.3)")
    if kf["release"] is not None:
        fig.add_vline(x=(kf["release"] - kf["snap"]) / dp.FPS, line_dash="dash", line_color="#fff",
                      annotation_text="pase", annotation_position="top")
    fig.update_layout(height=170, margin=dict(l=0, r=0, t=15, b=0), yaxis=dict(range=[0, 100]),
                      template="plotly_dark", paper_bgcolor="#0e1117", plot_bgcolor="#0e1117")
    return fig


# ------------------------------------------------------------------ UI
try:
    g = load_game()
except FileNotFoundError as e:
    st.error(str(e))
    st.stop()

game_row = g["games"][g["games"]["gameId"] == g["game_id"]].iloc[0]
menu = dp.interesting_plays(g["plays"])

with st.sidebar:
    st.title("🏈 Co-Pilot")
    st.caption(f"Partido {g['game_id']} · Semana {game_row['week']} · {game_row['gameDate']}")
    ids = menu["playId"].astype(int).tolist()
    qp = st.query_params.get("playId")  # enlace directo: ?playId=2279
    start = ids.index(int(qp)) if qp and qp.isdigit() and int(qp) in ids else 0
    label = st.selectbox("Jugada destacada", menu["label"].tolist(), index=start)
    st.caption("Reproduce con ▶ debajo de la cancha o arrastra la barra de frames.")

row = menu[menu["label"] == label].iloc[0]
play_id = int(row["playId"])
df, pressure, sep, kf = analyze(g["game_id"], play_id)

# --- marcador TV
home, vis = game_row["homeTeamAbbr"], game_row["visitorTeamAbbr"]
st.markdown(
    f"""<div class="score">
      <div><span class="team">{vis}</span><span class="pts">{int(row['preSnapVisitorScore'])}</span></div>
      <div class="mid"><div class="big">Q{int(row['quarter'])} · {dp._ordinal(row['down'])} &amp; {int(row['yardsToGo'])}</div>
      <div class="small">{row['gameClock']} · Ataca {row['possessionTeam']} · Formación {str(row['offenseFormation']).title()}</div></div>
      <div><span class="pts">{int(row['preSnapHomeScore'])}</span><span class="team">{home}</span></div>
    </div>""", unsafe_allow_html=True)

anim = dp.animation_table(df, row["possessionTeam"], sep)
col_main, col_side = st.columns([3, 1.25], gap="medium")

with col_main:
    st.plotly_chart(build_field(anim, row["possessionTeam"], row["defensiveTeam"], kf), width="stretch")
    st.caption("🟦 Ofensiva · 🟧 Defensiva · 🟤 Balón · 🟢 Halo verde = receptor ABIERTO (≥ 3 yardas del defensor más cercano). "
               "Pasa el cursor para ver nombre, número y velocidad.")
    st.markdown("**Presión sobre el QB durante la jugada**")
    if pressure.empty:
        st.info("Esta jugada no tiene QB o pass rushers etiquetados por PFF.")
    else:
        st.plotly_chart(pressure_line(pressure, kf), width="stretch")

with col_side:
    st.subheader("🎙️ Panel del Comentarista")
    val, when = dp.pressure_at_pass(pressure, kf)
    st.markdown("**Índice de Presión en la Bolsa**")
    st.plotly_chart(gauge(val), width="stretch")
    st.caption(f"Valor {when}. 100% = defensor a ≤ 1.5 yd del QB; 0% = a ≥ 8 yd.")

    st.markdown(f"<div class='card info'>🛡️ <b>{row['pff_passCoverage'] if isinstance(row['pff_passCoverage'], str) else 'Sin cobertura'}</b>: "
                f"{dp.translate_coverage(row['pff_passCoverage'], row['pff_passCoverageType'])}</div>", unsafe_allow_html=True)

    for a in dp.duel_alerts(df):
        st.markdown(f"<div class='card red'>{a}</div>", unsafe_allow_html=True)

    st.markdown("**Puntos clave para narrar al público**")
    for k in dp.key_points(df, row, pressure, sep, kf):
        st.markdown(f"<div class='card key'>{k}</div>", unsafe_allow_html=True)

    with st.expander("Narración oficial"):
        st.write(row["playDescription"])
