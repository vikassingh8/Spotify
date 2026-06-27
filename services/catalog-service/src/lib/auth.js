// Token checks for the catalog service: verify the JWT, then enforce roles.
// This service only verifies tokens; auth-service is the one that signs them.
const jwt = require("jsonwebtoken");

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

module.exports = { authRequired, requireRole, RANK };
