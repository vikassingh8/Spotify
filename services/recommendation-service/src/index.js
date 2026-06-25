const express = require("express");
const crypto = require("crypto");
const Redis = require("ioredis");
const { pool } = require("./lib/db");
const { authRequired } = require("./lib/auth");
const { metricsMiddleware, metricsHandler } = require("./lib/metrics");

const app = express();
app.use(express.json());
app.use(metricsMiddleware);

const PORT = Number(process.env.PORT) || 4004;
const SALT = process.env.ANONYMIZATION_SALT || "spoty-salt";
// "Trending now" = union of the most recent per-minute buckets written by Spark.
const WINDOW_MIN = Number(process.env.TRENDING_WINDOW_MIN) || 10;

const redis = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: Number(process.env.REDIS_PORT) || 6379,
  lazyConnect: false,
});

// MUST match the PySpark job's pseudonymization (HMAC-SHA256 over the raw id).
function pseudonym(userId) {
  return crypto.createHmac("sha256", SALT).update(String(userId)).digest("hex");
}

// Union the last WINDOW_MIN minute-buckets into a temp key and read the top N.
// Returns [{ id, plays }]. genre=null => global leaderboard.
async function topTrending(genre, limit) {
  const nowMin = Math.floor(Date.now() / 60000);
  const keys = [];
  for (let i = 0; i < WINDOW_MIN; i++) {
    const m = nowMin - i;
    keys.push(genre ? `plays:g:${genre}:m:${m}` : `plays:m:${m}`);
  }
  const tmp = `tmp:trend:${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  try {
    await redis.zunionstore(tmp, keys.length, ...keys);
    await redis.expire(tmp, 10);
    const pairs = await redis.zrevrange(tmp, 0, limit - 1, "WITHSCORES");
    const out = [];
    for (let i = 0; i < pairs.length; i += 2) {
      out.push({ id: pairs[i], plays: Math.round(Number(pairs[i + 1])) });
    }
    return out;
  } finally {
    redis.del(tmp).catch(() => {});
  }
}

async function enrich(songIds) {
  if (!songIds.length) return [];
  const { rows } = await pool.query(
    `SELECT s.id, s.title, s.genre, s.cover_url, a.name AS artist
     FROM songs s JOIN artists a ON a.id = s.artist_id
     WHERE s.id = ANY($1::bigint[])`,
    [songIds.map(Number)]
  );
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  return songIds.map((id) => byId.get(String(id))).filter(Boolean);
}

app.get("/healthz", (_req, res) =>
  res.json({ status: "ok", service: "recommendation" })
);
app.get("/metrics", metricsHandler);

// --- Trending now: union of recent minute-buckets from the Spark pipeline ---
app.get("/trending", async (req, res) => {
  try {
    const genre = req.query.genre || null;
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const top = await topTrending(genre, limit);
    const scores = Object.fromEntries(top.map((t) => [String(t.id), t.plays]));
    const songs = (await enrich(top.map((t) => t.id))).map((s) => ({
      ...s,
      plays: scores[String(s.id)],
    }));
    res.json({
      windowMinutes: WINDOW_MIN,
      genre: genre || "all",
      trending: songs,
    });
  } catch (err) {
    console.error("trending error", err);
    res.status(500).json({ error: "internal error" });
  }
});

// --- Personalized: derive top genre from pseudonymous affinity, return its trending ---
app.get("/for-you", authRequired, async (req, res) => {
  try {
    const uhash = pseudonym(req.user.sub);
    const { rows } = await pool.query(
      `SELECT genre FROM user_genre_affinity
       WHERE user_hash = $1 ORDER BY play_count DESC LIMIT 1`,
      [uhash]
    );
    const genre = rows[0] && rows[0].genre;
    const top = await topTrending(genre, 10);
    const songs = await enrich(top.map((t) => t.id));
    res.json({ basedOn: genre || "global-trending", recommendations: songs });
  } catch (err) {
    console.error("for-you error", err);
    res.status(500).json({ error: "internal error" });
  }
});

const server = app.listen(PORT, () =>
  console.log(`recommendation-service listening on :${PORT}`)
);
const shutdown = () => {
  server.close(() =>
    Promise.allSettled([pool.end(), redis.quit()]).finally(() => process.exit(0))
  );
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
