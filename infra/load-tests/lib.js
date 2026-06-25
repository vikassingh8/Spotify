// Shared helpers for k6 scenarios.
import http from "k6/http";
import { check } from "k6";

export const BASE = __ENV.BASE_URL || "http://localhost:8080";

// Log in once and return a token (used in setup()).
export function loginPremium() {
  const res = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ email: "premium@spoty.dev", password: "Passw0rd!" }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(res, { "login 200": (r) => r.status === 200 });
  return res.json("token");
}

// A realistic user journey: browse catalog, view trending, play a track.
export function userJourney(token) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const songs = http.get(`${BASE}/api/catalog/songs`);
  check(songs, { "catalog 200": (r) => r.status === 200 });

  http.get(`${BASE}/api/recommendations/trending`);

  const list = songs.json("songs") || [];
  if (list.length) {
    const song = list[Math.floor(Math.random() * list.length)];
    const play = http.post(`${BASE}/api/playback/play/${song.id}`, null, auth);
    // 200 ok, or 403 for premium-only when picked — both are valid responses
    check(play, { "play handled": (r) => r.status === 200 || r.status === 403 });
  }
}
