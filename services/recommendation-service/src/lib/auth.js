// Used by the recommendation service to verify JWTs and check roles.
// No token signing here, only verification.
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

module.exports = { authRequired };
