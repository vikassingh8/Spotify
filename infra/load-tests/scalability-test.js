// SCALABILITY TEST — fixed arrival rate (constant throughput) so you can
// compare latency BEFORE and AFTER scaling out replicas.
//
//   1) Run with N replicas (e.g. docker compose up --scale playback-service=1)
//   2) k6 run infra/load-tests/scalability-test.js   -> record p95
//   3) Scale out (--scale playback-service=4) and re-run -> p95 should drop
import { loginPremium, userJourney } from "./lib.js";

export const options = {
  scenarios: {
    constant_load: {
      executor: "constant-arrival-rate",
      rate: Number(__ENV.RATE || 200), // iterations per second
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 200,
      maxVUs: 1000,
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<800", "p(99)<1500"],
  },
};

export function setup() {
  return { token: loginPremium() };
}

export default function (data) {
  userJourney(data.token);
}
