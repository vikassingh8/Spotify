# Presentation / Video Notes — Spoty (≈ 15 min)

Speaking script mapped to the 8 required video sections. Timings are guides.
Keep one browser tab on the **running app** (`localhost:8080`) and one on **Grafana**
(`localhost:3000`) for live demo moments.

---

## 1. Introduction (1.5 min)
- "I built **Spoty**, a distributed cloud system for **real-time data processing**,
  themed as a Spotify-style music-streaming platform."
- **Problem it solves:** stream audio + process millions of interaction events in
  real time to power live trending and recommendations.
- **Scale:** designed for ~500k MAU, ~25k concurrent, ~50M events/day.
- **Key tech:** Node.js/Express microservices, **Apache Kafka**, **Apache Spark**,
  Redis/Postgres/Blob, containerized on **Docker/Kubernetes**, deployable to **Azure**.

## 2. Problem Understanding & Requirements (2 min)
- **Functional:** auth + RBAC, catalog/playback, event ingestion, real-time trending
  & recommendations.
- **Non-functional:** scalability, low latency, high availability, fault tolerance,
  security, privacy.
- **Why distributed:** a monolith can't absorb spiky, high-volume event traffic; we
  need independent scaling, an event buffer, and parallel processing.

## 3. High-Level Architecture (2.5 min) — *most important*
- Walk the diagram (`diagrams/architecture.md`).
- **Data flow:** `Client → NGINX gateway → Express services → Kafka → Spark →
  Redis/Postgres → services → Client`.
- Emphasize **decoupling**: playback returns instantly after publishing to Kafka;
  analytics happen asynchronously → short request path, independent scaling.

## 4. Real-Time Data Processing (2 min)
- **PySpark Structured Streaming** consumes the `play-events` topic every 5 s.
- It **anonymizes** the user id (HMAC), windows events per minute, aggregates plays
  per song/genre, and writes **leaderboards to Redis** + **rollups to Postgres**.
- **Streaming vs batch:** same Spark engine; we use micro-batch streaming for
  freshness. **Parallelism:** Kafka partitions × Spark executors. **Fault tolerance:**
  checkpointing resumes from the last offset.
- 🔴 **Live demo:** start traffic (`/api/ingestion/start`), watch **Trending now**
  update in seconds.

## 5. Scalability & Load Handling (2 min)
- **Stateless services** (JWT) scale horizontally; NGINX/K8s load-balances.
- **HPA** autoscales on CPU (60%); cluster autoscaler adds nodes; Kafka buffers spikes.
- 🔴 **Show results** from `02-performance-testing-report.md`: near-linear throughput
  with replicas; graceful degradation + self-recovery under stress.

## 6. Security, Privacy & Access Control (1.5 min)
- **In transit:** TLS at gateway. **At rest:** encrypted Blob/Postgres/Redis.
- **AuthN:** bcrypt + JWT. **AuthZ:** RBAC (free/premium/admin); demo a free user
  getting **403** on a premium track.
- **Privacy:** HMAC **pseudonymization in the pipeline** (raw id dropped before
  analytics), data minimization, **GDPR/CCPA** alignment (erasure, minimization).

## 7. Deployment, Monitoring & Cost (1.5 min)
- **Deploy:** one-command Docker Compose locally; Kubernetes manifests + HPA;
  1:1 Azure mapping (Event Hubs, Blob, AKS, Azure DB, Cache for Redis).
- **Monitor:** Prometheus + Grafana for latency, throughput, uptime, and errors.
- **Cost:** ~$5.2k/mo baseline; **egress dominates (~64%)**; CDN + reserved
  instances + spot + tiering → ~47% savings.

## 8. Challenges, Trade-offs & Improvements (2 min)
- **Challenges:** exactly-once vs at-least-once semantics; coordinating async
  pipeline with a responsive UI; Spark-Kafka jar provisioning (solved by warming the
  Ivy cache at build).
- **Trade-offs:**
  - *Consistency vs availability (CAP):* analytics are **eventually consistent** (a
    few seconds behind) to keep the write path fast and available.
  - *Cost vs performance:* reserved/spot capacity vs always-on headroom.
  - *Latency vs durability:* async event processing adds slight delay but guarantees
    no lost events.
- **Bottlenecks:** single Spark driver + single-replica datastores in the local demo.
- **Future work:** CDN for audio; a real ML recommender (collaborative filtering);
  multi-region active-active; richer caching; exactly-once with idempotent sinks;
  OIDC via Entra ID.

---

### Demo checklist
1. Log in as `premium@spoty.dev` → play tracks (audio plays).
2. Log in as `free@spoty.dev` → premium track → **403** (RBAC).
3. `POST /api/ingestion/start` → Trending updates live (real-time pipeline).
4. Grafana: show latency/throughput/uptime.
5. `docker compose kill stream-processor` then `up -d` → recovers from checkpoint.
