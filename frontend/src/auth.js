// Turnstile -> backend session-token flow.
// Frontend solves a Turnstile challenge, exchanges it for a short-lived
// session token, and attaches that token to every backend request.

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

let sessionToken = null;
let sessionExp = 0; // ms epoch; refresh a bit early
let inflight = null;

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-turnstile]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.defer = true;
    s.dataset.turnstile = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("failed to load Turnstile"));
    document.head.appendChild(s);
  });
}

function getTurnstileToken() {
  return new Promise((resolve, reject) => {
    loadTurnstileScript()
      .then(() => {
        const container = document.createElement("div");
        container.style.position = "fixed";
        container.style.bottom = "12px";
        container.style.left = "12px";
        container.style.zIndex = "9999";
        document.body.appendChild(container);

        const id = window.turnstile.render(container, {
          sitekey: SITE_KEY,
          callback: (token) => {
            window.turnstile.remove(id);
            container.remove();
            resolve(token);
          },
          "error-callback": () => {
            window.turnstile.remove(id);
            container.remove();
            reject(new Error("Turnstile error"));
          },
        });
      })
      .catch(reject);
  });
}

async function refreshSession() {
  const token = await getTurnstileToken();
  const res = await fetch(`${API_URL}/auth/turnstile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(`auth failed: HTTP ${res.status}`);
  const data = await res.json();
  sessionToken = data.session;
  // backend TTL is 1h; refresh 5 min early
  sessionExp = Date.now() + 55 * 60 * 1000;
  return sessionToken;
}

// Returns a valid session token, running the Turnstile flow if needed.
export async function getSession() {
  if (sessionToken && Date.now() < sessionExp) return sessionToken;
  if (!inflight) {
    inflight = refreshSession().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

// Clears the cached session so the next call re-runs Turnstile (e.g. after 401).
export function clearSession() {
  sessionToken = null;
  sessionExp = 0;
}
