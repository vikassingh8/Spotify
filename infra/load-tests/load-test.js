// LOAD TEST — system behaviour under expected peak traffic.
// Run: k6 run infra/load-tests/load-test.js
import { sleep } from "k6";
import { loginPremium, userJourney } from "./lib.js";

export const options = {
  stages: [
    { duration: "30s", target: 50 }, // ramp up
    { duration: "1m", target: 50 }, // sustained peak
    { duration: "30s", target: 100 }, // higher peak
    { duration: "1m", target: 100 },
    { duration: "30s", target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"], // 95% under 500ms
    http_req_failed: ["rate<0.01"], // <1% errors
  },
};

export function setup() {
  return { token: loginPremium() };
}

export default function (data) {
  userJourney(data.token);
  sleep(Math.random() * 2);
}
