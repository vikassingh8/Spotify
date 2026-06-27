# Spoty — Scalable & Secure Distributed System for Real-Time Data Processing

A Spotify-style music-streaming platform built as a **distributed, containerized,
real-time data-processing system**. It ingests user interaction events, processes
them in real time with **Apache Spark Structured Streaming**, and serves live
recommendations. The project demonstrates scalability, fault tolerance, security,
and privacy across the stack.

> Academic capstone prototype. Runs locally on Docker Compose; designed to map
> 1:1 onto **Microsoft Azure** managed services (see `docs/04-deployment-documentation.md`).

---

## Architecture at a glance

![Spoty high-level architecture](docs/diagrams/architecture.svg)

```
Browser (React) → NGINX gateway → Express microservices → Kafka → Spark → Redis/Postgres → services → Browser
```

| Layer | Technology | Azure equivalent |
|-------|-----------|------------------|
| Frontend | React 19 + Vite | Static Web Apps / CDN |
| API gateway / LB | NGINX | Application Gateway |
| Services | Node.js 24 + **Express 5** | AKS |
| Event streaming | Apache Kafka 4.2 (KRaft) | Event Hubs (Kafka API) |
| Real-time processing | **PySpark 4.1** Structured Streaming | HDInsight / Synapse / Databricks |
| Object storage | MinIO | Blob Storage |
| Relational DB | PostgreSQL 18 | Azure DB for PostgreSQL |
| Cache / leaderboards | Redis 8 | Azure Cache for Redis |
| Monitoring | Prometheus + Grafana | Azure Monitor + Managed Grafana |
| Load testing | k6 | — |

Full diagrams (SVG): [`docs/diagrams/`](docs/diagrams/).

---

## Services

| Service | Port | Responsibility |
|---------|------|----------------|
| `auth-service` | 4001 | Register/login, JWT issuance, bcrypt, RBAC (free/premium/admin) |
| `catalog-service` | 4002 | Songs, artists, playlists, search |
| `playback-service` | 4003 | Presigned audio URLs (MinIO) + emits play/skip/like to Kafka |
| `recommendation-service` | 4004 | Live "trending" + personalized recs from Spark output |
| `ingestion-producer` | 4005 | Simulates concurrent listeners (also the load engine) |
| `stream-processor` | — | PySpark job: Kafka → anonymize → aggregate → Redis/Postgres |

---

## Quick start

Prerequisites: **Docker + Docker Compose**.

```bash
cp .env.example .env          # already done if you cloned with one
docker compose up --build     # first run downloads images + Spark jars
```

Then open:

| URL | What |
|-----|------|
| http://localhost:8080 | Spoty web player (through the gateway) |
| http://localhost:3000 | Grafana dashboards (anonymous viewer) |
| http://localhost:9090 | Prometheus |
| http://localhost:9001 | MinIO console (`spotyadmin` / `spotyadmin_pw`) |

**Demo accounts** (password `Passw0rd!`): `free@spoty.dev`, `premium@spoty.dev`, `admin@spoty.dev`.

### See real-time processing in action
1. Log in and play a few songs (or generate traffic). Ingestion control
   requires an **admin** token:
   ```bash
   TOKEN=$(curl -s localhost:8080/api/auth/login -H 'content-type: application/json' \
     -d '{"email":"admin@spoty.dev","password":"Passw0rd!"}' | jq -r .token)
   curl -X POST localhost:8080/api/ingestion/start -H "Authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d '{"eventsPerSec":100}'
   ```
2. Watch the **Trending now** panel update within seconds. The events have flowed
   Browser → Kafka → Spark → Redis → recommendation-service → UI.

---

## Load / stress / scalability testing

```bash
k6 run infra/load-tests/load-test.js          # peak traffic
k6 run infra/load-tests/stress-test.js        # break + recover
docker compose up -d --scale playback-service=4
k6 run infra/load-tests/scalability-test.js   # compare p95 before/after
```

## Kubernetes (k3d — verified)

Autoscaling is verified live on k3s (via k3d). Full steps + the RAM-safe footprint are
in [`docs/04`](docs/04-deployment-documentation.md) §3.

```bash
k3d cluster create spoty --servers 1 --agents 0 --k3s-arg "--disable=traefik@server:0"
docker compose build catalog-service
k3d image import -c spoty spoty-catalog-service:latest
kubectl apply -f infra/k8s/00-namespace-config.yaml
kubectl -n spoty create configmap spoty-seed \
  --from-file=data/seed/01_schema.sql --from-file=data/seed/02_seed.sql
kubectl apply -f infra/k8s/10-infra.yaml -f infra/k8s/20-services.yaml -f infra/k8s/30-hpa.yaml
kubectl -n spoty get hpa -w        # catalog-service autoscaled 2 -> 8 under load
```

Result evidence: [`docs/perf/k8s-hpa-scaleout.txt`](docs/perf/k8s-hpa-scaleout.txt).

---

## Documentation

| Doc | Contents |
|-----|----------|
| [`docs/01-system-proposal.md`](docs/01-system-proposal.md) | Problem, requirements, architecture, tech justification |
| [`docs/02-performance-testing-report.md`](docs/02-performance-testing-report.md) | Load / stress / scalability results |
| [`docs/03-privacy-security-report.md`](docs/03-privacy-security-report.md) | Encryption, auth, anonymization, GDPR/CCPA |
| [`docs/04-deployment-documentation.md`](docs/04-deployment-documentation.md) | Local + Azure deployment, troubleshooting |
| [`docs/05-cost-analysis-report.md`](docs/05-cost-analysis-report.md) | Azure cost breakdown + savings |
| [`docs/06-presentation-notes.md`](docs/06-presentation-notes.md) | Video/presentation script |

## Repository layout

```
services/         Express 5 microservices (Node 24)
stream-processor/ PySpark Structured Streaming job
frontend/         React 19 + Vite web player
infra/            gateway (NGINX), k8s manifests, monitoring, load-tests
data/seed/        DB schema, seed catalog, demo-audio generator
docs/             6 reports + SVG diagrams
docker-compose.yml
```
