import React, { useEffect, useRef, useState } from "react";
import { api, getToken, setToken, clearToken } from "./api.js";

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Login({ onLogin }) {
  const [email, setEmail] = useState("premium@spoty.dev");
  const [password, setPassword] = useState("Passw0rd!");
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    try {
      const { token } = await api.login(email, password);
      setToken(token);
      onLogin();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="login">
      <p className="eyebrow">Real-time streaming console</p>
      <h1 className="wordmark">SPOTY</h1>
      <p className="tag muted">Distributed music streaming · live signal</p>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input
            id="pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary">
          Log in
        </button>
      </form>
      {err && <p className="error">{err}</p>}
      <div className="demo">
        <span className="eyebrow">Demo accounts · pw Passw0rd!</span>
        <div className="demo-chips">
          {["free@spoty.dev", "premium@spoty.dev", "admin@spoty.dev"].map((e) => (
            <button key={e} className="chip" onClick={() => setEmail(e)}>
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LivePill() {
  const [st, setSt] = useState({ running: false, eventsPerSec: 0 });
  useEffect(() => {
    let alive = true;
    const tick = () =>
      api.ingestionStatus().then((s) => alive && setSt(s)).catch(() => {});
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return (
    <span className={`live-pill ${st.running ? "on" : ""}`}>
      <span className="dot" />
      {st.running ? `LIVE · ${st.eventsPerSec} ev/s` : "IDLE"}
    </span>
  );
}

function Signal({ trending, forYou }) {
  const max = Math.max(1, ...trending.map((t) => t.plays || 0));
  return (
    <aside className="signal">
      <div className="panel-head">
        <span className="eyebrow">Signal · live</span>
        <span className="eyebrow">plays</span>
      </div>

      {trending.length === 0 && (
        <p className="signal-empty">awaiting stream…</p>
      )}
      {trending.map((t) => (
        <div className="meter" key={t.id}>
          <div className="meter-top">
            <span className="meter-name">{t.title}</span>
            <span className="meter-val">{t.plays}</span>
          </div>
          <div className="meter-bar">
            <div
              className="meter-fill"
              style={{ width: `${((t.plays || 0) / max) * 100}%` }}
            />
          </div>
        </div>
      ))}

      {forYou.length > 0 && (
        <div className="foryou">
          <span className="eyebrow">For you</span>
          <ol>
            {forYou.map((s) => (
              <li key={s.id}>
                <b>{s.title}</b> · {s.artist}
              </li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  );
}

function Player({ me, onLogout }) {
  const [songs, setSongs] = useState([]);
  const [trending, setTrending] = useState([]);
  const [forYou, setForYou] = useState([]);
  const [now, setNow] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [prog, setProg] = useState({ cur: 0, dur: 0 });
  const [msg, setMsg] = useState("");
  const audioRef = useRef(null);
  const songsRef = useRef([]);

  useEffect(() => {
    api.songs().then((d) => {
      setSongs(d.songs);
      songsRef.current = d.songs;
    }).catch(() => {});
    api.forYou().then((d) => setForYou(d.recommendations || [])).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      api.trending().then((d) => alive && setTrending(d.trending)).catch(() => {});
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Load a track's presigned URL and start playback.
  async function loadAndPlay(song) {
    setMsg("");
    try {
      const { streamUrl, title } = await api.play(song.id);
      setNow({ ...song, title });
      const a = audioRef.current;
      if (a) {
        a.src = streamUrl;
        await a.play().catch(() => {});
      }
    } catch (e) {
      setMsg(e.status === 403 ? "Premium track — upgrade to play." : e.message);
    }
  }

  // Row button: toggle if it's the current track, otherwise start it.
  function onRowPlay(song) {
    if (now && now.id === song.id) togglePlay();
    else loadAndPlay(song);
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a || !a.src) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }

  // Auto-advance to the next catalog track (also used by the skip button).
  function playNext() {
    const list = songsRef.current;
    if (!now || !list.length) return;
    const i = list.findIndex((s) => s.id === now.id);
    loadAndPlay(list[(i + 1) % list.length]);
  }

  function seek(e) {
    const a = audioRef.current;
    if (a && prog.dur) a.currentTime = Number(e.target.value);
  }

  const isCurrent = (s) => now && now.id === s.id;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="wordmark">SPOTY</span>
          <span className="role">{me.role}</span>
        </div>
        <div className="topbar-right">
          <LivePill />
          <button className="logout" onClick={onLogout}>
            log out
          </button>
        </div>
      </header>

      <div className="grid">
        <section>
          <div className="panel-head">
            <span className="eyebrow">Catalog · {songs.length} tracks</span>
          </div>
          {msg && <p className="error">{msg}</p>}
          <ul className="tracklist">
            {songs.map((s, i) => (
              <li className={`track ${isCurrent(s) ? "active" : ""}`} key={s.id}>
                <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className="title">
                    {s.title}
                    {s.premium_only && <span className="star">★</span>}
                  </span>
                  <span className="sub">{s.artist}</span>
                </span>
                <span className="genre">{s.genre}</span>
                <span className="dur">{fmt(s.duration_sec)}</span>
                <span className="row-actions">
                  <button
                    className="icon-btn play"
                    aria-label={isCurrent(s) && playing ? "Pause" : `Play ${s.title}`}
                    onClick={() => onRowPlay(s)}
                  >
                    {isCurrent(s) && playing ? "⏸" : "▶"}
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="Like"
                    onClick={() => api.event(s.id, "like").catch(() => {})}
                  >
                    ♥
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="Skip"
                    onClick={() => api.event(s.id, "skip").catch(() => {})}
                  >
                    ⏭
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <Signal trending={trending} forYou={forYou} />
      </div>

      <footer className="nowbar">
        <div className="now-meta">
          <span className={`eq ${playing ? "playing" : ""}`}>
            <span /><span /><span /><span />
          </span>
          {now ? (
            <span className="now-title">
              {now.title}
              <span className="now-sub"> · {now.artist}</span>
            </span>
          ) : (
            <span className="now-empty">No track loaded — pick something below.</span>
          )}
        </div>

        <div className="transport">
          <button
            className="t-btn play-toggle"
            onClick={togglePlay}
            disabled={!now}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button
            className="t-btn"
            onClick={playNext}
            disabled={!now}
            aria-label="Next track"
          >
            ⏭
          </button>
        </div>

        <div className="seek">
          <span className="mono time">{fmt(Math.floor(prog.cur))}</span>
          <input
            type="range"
            className="seekbar"
            min="0"
            max={prog.dur || 0}
            step="0.1"
            value={prog.cur}
            onChange={seek}
            aria-label="Seek"
          />
          <span className="mono time">{fmt(Math.floor(prog.dur || 0))}</span>
        </div>

        <audio
          ref={audioRef}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={playNext}
          onTimeUpdate={() => {
            const a = audioRef.current;
            if (a) setProg({ cur: a.currentTime, dur: a.duration || 0 });
          }}
        />
      </footer>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);

  async function refresh() {
    if (!getToken()) {
      setMe(null);
      setReady(true);
      return;
    }
    try {
      setMe(await api.me());
    } catch {
      clearToken();
      setMe(null);
    }
    setReady(true);
  }

  useEffect(() => {
    refresh();
  }, []);

  if (!ready) return null;
  if (!me) return <Login onLogin={refresh} />;
  return <Player me={me} onLogout={() => { clearToken(); setMe(null); }} />;
}
