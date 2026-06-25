// STRESS TEST — push beyond capacity to find the breaking point and observe
// recovery once load subsides. Run: k6 run infra/load-tests/stress-test.js
import { sleep } from "k6";
import { loginPremium, userJourney } from "./lib.js";

export const options = {
  stages: [
    { duration: "30s", target: 100 },
    { duration: "30s", target: 300 },
    { duration: "30s", target: 600 }, // overload
    { duration: "1m", target: 600 },
    { duration: "30s", target: 0 }, // recovery window
  ],
  thresholds: {
    // informational only — we WANT to see where it degrades
    http_req_failed: ["rate<0.25"],
  },
};

export function setup() {
  return { token: loginPremium() };
}

export default function (data) {
  userJourney(data.token);
  sleep(Math.random());
}
