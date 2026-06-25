const express = require("express");
const { pool } = require("./lib/db");
const { authRequired } = require("./lib/auth");
const { metricsMiddleware, metricsHandler } = require("./lib/metrics");

const app = express();
app.use(express.json());
app.use(metricsMiddleware);

const PORT = Number(process.env.PORT) || 4002;

app.get("/healthz", (_req, res) => res.json({ status: "ok", service: "catalog" }));
app.get("/metrics", metricsHandler);

const SONG_SELECT = `
  SELECT s.id, s.title, s.genre, s.duration_sec, s.audio_key, s.cover_url,
         s.premium_only, a.name AS artist
  FROM songs s JOIN artists a ON a.id = s.artist_id`;

// --- List / search songs ---
app.get("/songs", async (req, res) => {
  const { genre, q, limit } = req.query;
  const clauses = [];
  const params = [];
  if (genre) {
    params.push(genre);
    clauses.push(`s.genre = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    clauses.push(`(s.title ILIKE $${params.length} OR a.name ILIKE $${params.length})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(Math.min(Number(limit) || 100, 200));
  try {
    const { rows } = await pool.query(
      `${SONG_SELECT} ${where} ORDER BY s.id LIMIT $${params.length}`,
      params
    );
    res.json({ songs: rows });
  } catch (err) {
    console.error("songs error", err);
    res.status(500).json({ error: "internal error" });
  }
});

app.get("/songs/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`${SONG_SELECT} WHERE s.id = $1`, [
      req.params.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "song not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "internal error" });
  }
});

app.get("/artists", async (_req, res) => {
  const { rows } = await pool.query(`SELECT id, name, genre FROM artists ORDER BY name`);
  res.json({ artists: rows });
});

app.get("/genres", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT genre, COUNT(*)::int AS count FROM songs GROUP BY genre ORDER BY genre`
  );
  res.json({ genres: rows });
});

// --- Playlists (auth required) ---
app.get("/playlists", authRequired, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.name,
            COALESCE(json_agg(ps.song_id ORDER BY ps.position)
                     FILTER (WHERE ps.song_id IS NOT NULL), '[]') AS song_ids
     FROM playlists p
     LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id
     WHERE p.user_id = $1
     GROUP BY p.id ORDER BY p.created_at DESC`,
    [req.user.sub]
  );
  res.json({ playlists: rows });
});

app.post("/playlists", authRequired, async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });
  const { rows } = await pool.query(
    `INSERT INTO playlists (user_id, name) VALUES ($1, $2) RETURNING id, name`,
    [req.user.sub, name]
  );
  res.status(201).json(rows[0]);
});

app.post("/playlists/:id/songs", authRequired, async (req, res) => {
  const { songId } = req.body || {};
  if (!songId) return res.status(400).json({ error: "songId required" });
  // ownership check
  const owns = await pool.query(
    `SELECT 1 FROM playlists WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.sub]
  );
  if (!owns.rowCount) return res.status(404).json({ error: "playlist not found" });
  await pool.query(
    `INSERT INTO playlist_songs (playlist_id, song_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [req.params.id, songId]
  );
  res.status(204).end();
});

const server = app.listen(PORT, () =>
  console.log(`catalog-service listening on :${PORT}`)
);
const shutdown = () => {
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
