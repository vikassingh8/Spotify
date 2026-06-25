// Thin API client. All calls go through the NGINX gateway under /api/*.
const TOKEN_KEY = "spoty_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function req(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status, data });
  return data;
}

export const api = {
  login: (email, password) =>
    req("/auth/login", { method: "POST", body: { email, password }, auth: false }),
  register: (email, password) =>
    req("/auth/register", { method: "POST", body: { email, password }, auth: false }),
  me: () => req("/auth/me"),
  songs: (q) => req(`/catalog/songs${q ? `?q=${encodeURIComponent(q)}` : ""}`, { auth: false }),
  play: (songId) => req(`/playback/play/${songId}`, { method: "POST" }),
  event: (songId, type) => req("/playback/event", { method: "POST", body: { songId, type } }),
  trending: (genre) =>
    req(`/recommendations/trending${genre ? `?genre=${genre}` : ""}`, { auth: false }),
  forYou: () => req("/recommendations/for-you"),
  ingestionStatus: () => req("/ingestion/status", { auth: false }),
};
