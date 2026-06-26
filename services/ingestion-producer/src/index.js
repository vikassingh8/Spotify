// Event simulator: models a population of concurrent listeners producing
// play/skip/like events into Kafka. Doubles as the load-generation engine.
const express = require("express");
const { metricsMiddleware, metricsHandler, client } = require("./lib/metrics");
const { connectProducer, emitBatch, isReady } = require("./lib/kafka");
const { authRequired, requireRole } = require("./lib/auth");

const app = express();
app.use(express.json());
app.use(metricsMiddleware);

const PORT = Number(process.env.PORT) || 4005;
const TOPIC = process.env.KAFKA_EVENTS_TOPIC || "play-events";
const CATALOG_URL = "http://catalog-service:4002/songs";

const eventsProduced = new client.Counter({
  name: "sim_events_produced_total",
  help: "Synthetic events produced by the simulator",
  labelNames: ["type", "service"],
});

let catalog = [];
let timer = null;
let state = {
  running: false,
  users: Number(process.env.SIM_USERS) || 200,
  eventsPerSec: Number(process.env.SIM_EVENTS_PER_SEC) || 50,
  totalProduced: 0,
};

const TYPES = ["play", "play", "play", "skip", "like"]; // play-weighted
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function loadCatalog() {
  for (let i = 0; i < 15; i++) {
    try {
      const r = await fetch(CATALOG_URL);
      const { songs } = await r.json();
      if (songs && songs.length) {
        catalog = songs;
        console.log(`loaded ${songs.length} songs from catalog`);
        return;
      }
    } catch (_e) {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.warn("could not load catalog; falling back to synthetic ids");
  catalog = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    genre: ["pop", "electronic", "lofi", "rock"][i % 4],
  }));
}

function buildBatch(n) {
  const messages = [];
  for (let i = 0; i < n; i++) {
    const song = pick(catalog);
    const type = pick(TYPES);
    // Zipf-ish user skew: smaller user ids are heavier listeners
    const userId =
      "sim-user-" + (1 + Math.floor(Math.abs(Math.random() - Math.random()) * state.users));
    const event = {
      type,
      userId,
      songId: song.id,
      genre: song.genre,
      role: "free",
      ts: new Date().toISOString(),
    };
    messages.push({ key: String(song.id), value: JSON.stringify(event) });
    eventsProduced.inc({ type, service: "ingestion-producer" });
  }
  return messages;
}

async function tick() {
  if (!isReady() || !catalog.length) return;
  const sent = await emitBatch(TOPIC, buildBatch(state.eventsPerSec));
  state.totalProduced += sent;
}

function startSim() {
  if (state.running) return;
  state.running = true;
  timer = setInterval(tick, 1000);
}
function stopSim() {
  state.running = false;
  if (timer) clearInterval(timer);
  timer = null;
}

app.get("/healthz", (_req, res) =>
  res.json({ status: "ok", service: "ingestion", kafka: isReady() })
);
app.get("/metrics", metricsHandler);
app.get("/status", (_req, res) => res.json({ ...state, catalogSize: catalog.length }));

app.post("/start", authRequired, requireRole("admin"), (req, res) => {
  if (req.body && req.body.eventsPerSec) state.eventsPerSec = Number(req.body.eventsPerSec);
  if (req.body && req.body.users) state.users = Number(req.body.users);
  startSim();
  res.json({ started: true, ...state });
});

app.post("/stop", authRequired, requireRole("admin"), (_req, res) => {
  stopSim();
  res.json({ stopped: true, ...state });
});

// Fire a one-off burst of N events (useful for demos / stress spikes)
app.post("/burst", authRequired, requireRole("admin"), async (req, res) => {
  const count = Math.min(Number(req.body && req.body.count) || 100, 20000);
  const sent = await emitBatch(TOPIC, buildBatch(count));
  state.totalProduced += sent;
  res.json({ burst: sent });
});

(async () => {
  await connectProducer();
  await loadCatalog();
  if (String(process.env.SIM_AUTOSTART).toLowerCase() === "true") startSim();
  const server = app.listen(PORT, () =>
    console.log(`ingestion-producer listening on :${PORT}`)
  );
  const shutdown = () => {
    stopSim();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
})();
