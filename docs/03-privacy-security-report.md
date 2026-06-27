# Privacy & Security Report — Spoty

This report details the security and privacy controls implemented in Spoty, the
threats they mitigate, and compliance with GDPR/CCPA. Controls are organized by the
classic pillars: **authentication, authorization, confidentiality, integrity,
availability, and privacy**.

---

## 1. Authentication

- **Mechanism:** JSON Web Tokens (JWT, HS256). `auth-service` issues a signed token
  on login (`services/auth-service/src/index.js`); all services validate it via the
  shared `authRequired` middleware (`src/lib/auth.js`).
- **Password storage:** **bcrypt** with cost factor 10 (`bcrypt.hash`). Plaintext
  passwords are never stored or logged.
- **Token contents:** `sub` (user id), `email`, `role`, with expiry (`JWT_EXPIRES_IN`,
  default 1 h). Tokens are stateless → no server-side session store needed.
- **User-enumeration resistance:** login returns a generic `invalid credentials`
  for both unknown email and wrong password.

**Production hardening (Azure):** replace homegrown JWT with **Microsoft Entra ID /
OAuth2 OIDC**, short-lived access tokens + refresh tokens, and rotate signing keys
from **Azure Key Vault**.

## 2. Authorization (Access Control)

- **RBAC** with a role hierarchy `admin > premium > free` enforced by the
  `requireRole(...)` middleware.
- **Resource-level checks:** playlist mutations verify ownership
  (`playlist.user_id = req.user.sub`); premium-only tracks are gated in
  `playback-service` (free users receive **403**).
- **Principle of least privilege:** each service connects to data stores with only
  the access it needs; the gateway exposes only intended routes.

| Action | free | premium | admin |
|--------|:----:|:-------:|:-----:|
| Browse / search | ✅ | ✅ | ✅ |
| Play standard track | ✅ | ✅ | ✅ |
| Play premium track | ❌ 403 | ✅ | ✅ |
| Manage own playlists | ✅ | ✅ | ✅ |
| Admin operations | ❌ | ❌ | ✅ |

## 3. Secure Communication (Encryption in Transit)

- **External:** TLS terminated at the NGINX gateway (HTTPS). The compose stack ships
  HTTP for convenience; enable TLS by mounting certs and a `listen 443 ssl` server
  block (documented in `04-deployment-documentation.md`). On Azure, **Application
  Gateway** enforces TLS 1.2+ and can add a **WAF**.
- **Internal:** in production, service-to-service traffic is encrypted via a service
  mesh (mTLS) or AKS network policies; managed datastores enforce TLS connections.

## 4. Encryption at Rest

| Store | Local prototype | Azure production |
|-------|-----------------|------------------|
| Audio objects | MinIO (SSE available) | **Blob Storage** SSE (AES-256, Microsoft- or customer-managed keys) |
| Relational | Postgres volume | **Azure DB for PostgreSQL** (encryption at rest by default) |
| Cache | Redis | **Azure Cache for Redis** (encryption at rest and in transit) |
| Secrets | `.env` (dev only) | **Azure Key Vault** + AKS CSI secrets driver |

## 5. Privacy — Anonymization, Masking & Minimization

Privacy is enforced **in the data pipeline**, not just at storage:

- **Pseudonymization before analytics:** the PySpark job
  (`stream-processor/job.py`) replaces the raw `userId` with an
  **HMAC-SHA256(salt, userId)** hash *and drops the raw id* before any aggregation
  or write. Analytics tables (`user_genre_affinity`, rollups) **never** contain a
  raw identifier. The recommendation-service computes the same HMAC to look up a
  user's pseudonymous profile, so personalization works without de-anonymizing.
- **Data minimization:** only fields needed for analytics (type, songId, genre,
  pseudonym, timestamp) are processed; no PII (name, location, device) is collected.
- **Aggregation:** trending/recommendation outputs are aggregates (counts), reducing
  individual-level exposure.
- **Masking:** the salt is a secret (Key Vault in prod); without it the pseudonyms
  cannot be reversed or linked across datasets.

## 6. GDPR / CCPA Compliance Mapping

| Requirement | How Spoty addresses it |
|-------------|------------------------|
| **Lawful basis / consent** | Consent captured at signup (extension point); only necessary data processed |
| **Data minimization** (GDPR Art. 5) | Pipeline collects/keeps the minimum fields; pseudonymization by default |
| **Right to access** (Art. 15) | User data retrievable by id from Postgres |
| **Right to erasure** (Art. 17 / CCPA delete) | `DELETE FROM users` cascades to playlists; pseudonymous analytics rows are not personal data and decay over time |
| **Right to portability** (Art. 20) | Catalog/playlist data exportable as JSON |
| **Security of processing** (Art. 32) | Encryption, RBAC, pseudonymization, monitoring |
| **CCPA "do not sell"** | No third-party data sharing in scope |

> Because analytics store only salted HMACs (pseudonyms) and the salt is held
> separately, the analytics dataset is effectively de-identified. This limits breach
> impact and simplifies compliance.

## 7. Threats Addressed & Mitigations (OWASP-aligned)

| Vulnerability | Mitigation |
|---------------|------------|
| Broken authentication | bcrypt hashing, signed expiring JWTs, generic auth errors |
| Broken access control | RBAC middleware + ownership checks; deny-by-default routes |
| Injection (SQLi) | **Parameterized queries** everywhere (`pg` placeholders), no string concatenation |
| Sensitive data exposure | Encryption in transit/at rest; pseudonymized analytics; secrets out of code |
| Security misconfiguration | Minimal images, least-privilege, env-based secrets, no default creds in prod |
| Insecure direct object refs | Presigned URLs are **time-limited** (1 h) and signed |
| Excessive data / privacy | Data minimization + pseudonymization in the stream processor |
| DoS / abuse | Gateway as choke point (add rate limiting); Kafka buffering; HPA autoscaling |
| Secrets in VCS | `.env` git-ignored; Key Vault in production |

## 8. Known Limitations (prototype) & Roadmap

- Demo uses HTTP and `.env` secrets for convenience → enable TLS + Key Vault in prod.
- JWT secret is symmetric (HS256) → move to OIDC/asymmetric keys with rotation.
- Add gateway **rate limiting**, audit logging, and automated dependency scanning
  (e.g. `npm audit`, Trivy image scans) in CI.
