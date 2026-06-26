const express = require("express");
const { pool } = require("./lib/db");
const { authRequired } = require("./lib/auth");
const { metricsMiddleware, metricsHandler, client } = require("./lib/metrics");
const { connectProducer, emit, isReady, producer } = require("./lib/kafka");
const { presignAudio } = require("./lib/storage");

const app = express();
app.use(express.json());
app.use(metricsMiddleware);

const PORT = Number(process.env.PORT) || 4003;
const TOPIC = process.env.KAFKA_EVENTS_TOPIC || "play-events";

// domain metric: events emitted to Kafka
const eventsEmitted = new client.Counter({
  name: "play_events_emitted_total",
  help: "Play/skip/like events published to Kafka",
  labelNames: ["type", "service"],
});
const eventsDropped = new client.Counter({
  name: "play_events_dropped_total",
  help: "Events dropped because Kafka was unavailable",
  labelNames: ["service"],
});

app.get("/healthz", (_req, res) =>
  res.json({ status: "ok", service: "playback", kafka: isReady() })
);
app.get("/metrics", metricsHandler);

function publish(type, user, song) {
  if (!isReady()) {
    eventsDropped.inc({ service: "playback-service" });
    console.warn(`dropped ${type} event — kafka not ready`);
    return Promise.resolve();
  }
  const event = {
    type, // play | skip | like
    userId: user.sub, // raw id internally; anonymized downstream in Spark
    songId: song.id,
    genre: song.genre,
    role: user.role,
    ts: new Date().toISOString(),
  };
  eventsEmitted.inc({ type, service: "playback-service" });
  return emit(TOPIC, song.id, event);
}

// --- Start playback: enforce premium gating, emit event, return stream URL ---
app.post("/play/:songId", authRequired, async (req, res) => {
  const songId = Number(req.params.songId);
  if (!Number.isInteger(songId) || songId <= 0) {
    return res.status(400).json({ error: "invalid song id" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, title, genre, audio_key, premium_only FROM songs WHERE id = $1`,
      [songId]
    );
    const song = rows[0];
    if (!song) return res.status(404).json({ error: "song not found" });

    // Access control: premium-only tracks need premium/admin
    if (song.premium_only && req.user.role === "free") {
      return res
        .status(403)
        .json({ error: "premium subscription required for this track" });
    }

    const url = await presignAudio(song.audio_key);
    await publish("play", req.user, song);
    res.json({ songId: song.id, title: song.title, streamUrl: url, expiresIn: 3600 });
  } catch (err) {
    console.error("play error", err);
    res.status(500).json({ error: "internal error" });
  }
});

// --- Generic interaction event (skip / like) ---
app.post("/event", authRequired, async (req, res) => {
  const { songId, type } = req.body || {};
  const id = Number(songId);
  if (!Number.isInteger(id) || id <= 0 || !["skip", "like"].includes(type)) {
    return res
      .status(400)
      .json({ error: "valid integer songId and type (skip|like) required" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, genre FROM songs WHERE id = $1`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: "song not found" });
    await publish(type, req.user, rows[0]);
    res.status(202).json({ accepted: true });
  } catch (err) {
    res.status(500).json({ error: "internal error" });
  }
});

connectProducer();
const server = app.listen(PORT, () =>
  console.log(`playback-service listening on :${PORT}`)
);
const shutdown = () => {
  server.close(() =>
    Promise.allSettled([producer.disconnect(), pool.end()]).finally(() =>
      process.exit(0)
    )
  );
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
