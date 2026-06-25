// Isolated horizontal-scaling probe: hammer ONLY the catalog read endpoint
// (closed-loop) and measure achievable throughput. Run with Spark/ingestion
// paused so spare host CPU cores exist, then compare 1 vs N catalog replicas.
//   k6 run -e VUS=60 catalog-throughput.js
import http from "k6/http";
import { check } from "k6";

const BASE = __ENV.BASE_URL || "http://gateway:80";

export const options = {
  vus: Number(__ENV.VUS || 60),
  duration: __ENV.DURATION || "45s",
};

export default function () {
  const res = http.get(`${BASE}/api/catalog/songs`);
  check(res, { "200": (r) => r.status === 200 });
}
