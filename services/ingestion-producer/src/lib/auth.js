// Verifies JWTs and checks roles so the ingestion controls (/start, /stop,
// /burst) can be limited to admins. Tokens are issued by auth-service.
const jwt = require("jsonwebtoken");

function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "3600s" }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing bearer token" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (_e) {
    return res.status(401).json({ error: "invalid or expired token" });
  }
}

// Role hierarchy: admin > premium > free
const RANK = { free: 1, premium: 2, admin: 3 };

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "unauthenticated" });
    const ok = allowed.some((r) => RANK[req.user.role] >= RANK[r]);
    if (!ok) {
      return res
        .status(403)
        .json({ error: "forbidden", requires: allowed, role: req.user.role });
    }
    next();
  };
}

module.exports = { signToken, authRequired, requireRole, RANK };
