const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { pool } = require("./lib/db");
const { signToken, authRequired } = require("./lib/auth");
const { metricsMiddleware, metricsHandler } = require("./lib/metrics");

const app = express();
app.set("trust proxy", 1); // behind the NGINX gateway
app.use(express.json());
app.use(metricsMiddleware);

const PORT = Number(process.env.PORT) || 4001;

// Throttle credential endpoints to blunt brute-force / enumeration.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too many attempts — try again shortly" },
});

app.get("/healthz", (_req, res) => res.json({ status: "ok", service: "auth" }));
app.get("/metrics", metricsHandler);

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// --- Register ---
app.post("/register", authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!EMAIL_RE.test(email || "") || !password || password.length < 8) {
    return res
      .status(400)
      .json({ error: "valid email and password (>=8 chars) required" });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'free')
       RETURNING id, email, role`,
      [email.toLowerCase(), hash]
    );
    const user = rows[0];
    return res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "email already registered" });
    }
    console.error("register error", err);
    return res.status(500).json({ error: "internal error" });
  }
});

// --- Login ---
app.post("/login", authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, email, role, password_hash FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );
    const user = rows[0];
    // constant-ish response to avoid user enumeration
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    return res.json({
      token: signToken(user),
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("login error", err);
    return res.status(500).json({ error: "internal error" });
  }
});

// --- Current user (token introspection) ---
app.get("/me", authRequired, (req, res) => {
  res.json({ id: req.user.sub, email: req.user.email, role: req.user.role });
});

// Seed demo accounts (idempotent) so the stack is usable out of the box.
async function bootstrapDemoUsers() {
  const demo = [
    ["admin@spoty.dev", "admin"],
    ["premium@spoty.dev", "premium"],
    ["free@spoty.dev", "free"],
  ];
  const hash = await bcrypt.hash("Passw0rd!", 10);
  for (const [email, role] of demo) {
    await pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING`,
      [email, hash, role]
    );
  }
  console.log("demo users ensured (password: Passw0rd!)");
}

async function start() {
  // retry DB bootstrap until Postgres is ready
  for (let i = 0; i < 10; i++) {
    try {
      await bootstrapDemoUsers();
      break;
    } catch (e) {
      console.log(`waiting for db... (${i})`, e.code || e.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  const server = app.listen(PORT, () =>
    console.log(`auth-service listening on :${PORT}`)
  );
  const shutdown = () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

start();
