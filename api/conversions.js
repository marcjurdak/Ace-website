// ACE — sends queued server-side conversion events (GA4 now, Meta in Phase 3).
// Woken up by the database right after an event is queued, and every 5 minutes.
// Idempotent: every event has a unique id and is claimed atomically before sending.
const crypto = require("crypto");
const env = (k) => (process.env[k] || "").trim();
const GA_BASE = env("GA4_MP_BASE") || "https://www.google-analytics.com";

function log(level, msg, extra) { console[level](`[conversions] ${msg}` + (extra ? " " + JSON.stringify(extra) : "")); }
function safeEqual(a, b) { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y); }
function sbHeaders(extra) { const key = env("SUPABASE_SERVICE_ROLE_KEY"); const h = { apikey: key, "Content-Type": "application/json", ...extra }; if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`; return h; }
async function sb(path, opts = {}) {
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, { ...opts, headers: sbHeaders(opts.headers) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function settings() {
  const rows = await sb("settings?select=key,value&key=in.(ga4_measurement_id)");
  return Object.fromEntries((rows || []).map((r) => [r.key, r.value || ""]));
}
async function update(id, patch) { await sb(`conversion_events?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) }); }

async function sendGA4(ev, cfg) {
  const mid = cfg.ga4_measurement_id, secret = env("GA4_API_SECRET");
  if (!/^G-[A-Z0-9]{4,}$/i.test(mid || "") || !secret) return { skip: "GA4 not configured: add the Measurement ID in Admin > Settings and GA4_API_SECRET in Vercel" };
  const p = ev.payload || {};
  const body = { client_id: p.client_id, events: [{ name: ev.event_name, params: {
    transaction_id: p.transaction_id, value: Number(p.value || 0), currency: p.currency || "USD", engagement_time_msec: 1 } }] };
  const r = await fetch(`${GA_BASE}/mp/collect?measurement_id=${encodeURIComponent(mid)}&api_secret=${encodeURIComponent(secret)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = (await r.text()).slice(0, 300);
  return { ok: r.ok, status: r.status, response: `HTTP ${r.status}${text ? " " + text : ""}`, temporary: r.status >= 500 || r.status === 429 };
}

async function processDue() {
  // release events stuck in "sending" (e.g. the function was interrupted)
  const stuck = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await sb(`conversion_events?status=eq.sending&created_at=lt.${encodeURIComponent(stuck)}&sent_at=is.null`, { method: "PATCH",
    body: JSON.stringify({ status: "failed", last_response: "Interrupted, will retry" }) }).catch(() => {});
  const now = new Date().toISOString();
  const due = await sb(`conversion_events?select=id&destination=eq.ga4&status=in.(pending,failed)&attempts=lt.6&next_attempt_at=lte.${encodeURIComponent(now)}&order=id.asc&limit=25`);
  if (!due || !due.length) return { processed: 0 };
  const cfg = await settings();
  const out = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  for (const d of due) {
    const rows = await sb("rpc/claim_conversion_event", { method: "POST", body: JSON.stringify({ p_id: d.id }) });
    const ev = Array.isArray(rows) ? rows[0] : null;
    if (!ev) continue; // someone else is handling it
    out.processed++;
    try {
      const r = await sendGA4(ev, cfg);
      if (r.skip) { await update(ev.id, { status: "skipped", last_response: r.skip }); out.skipped++; log("warn", "skipped", { event: ev.event_id, why: "not configured" }); continue; }
      if (r.ok) { await update(ev.id, { status: "sent", sent_at: new Date().toISOString(), last_response: r.response }); out.sent++; log("log", "sent", { event: ev.event_id }); continue; }
      const wait = Math.min(360, 2 ** ev.attempts) * 60 * 1000;
      await update(ev.id, { status: "failed", last_response: r.response, next_attempt_at: new Date(Date.now() + wait).toISOString(), ...(r.temporary ? {} : { attempts: 6 }) });
      out.failed++; log("error", "failed", { event: ev.event_id, status: r.status, retry: r.temporary });
    } catch (e) {
      const wait = Math.min(360, 2 ** ev.attempts) * 60 * 1000;
      await update(ev.id, { status: "failed", last_response: String(e.message || e).slice(0, 300), next_attempt_at: new Date(Date.now() + wait).toISOString() }).catch(() => {});
      out.failed++; log("error", "network error, will retry", { event: ev.event_id });
    }
  }
  return out;
}

async function isAdmin(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i); if (!m) return false;
  const r = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, { headers: { apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: `Bearer ${m[1]}` } });
  if (!r.ok) return false; const u = await r.json().catch(() => null); if (!u || !u.email) return false;
  const rows = await sb(`admins?select=email&email=ilike.${encodeURIComponent(u.email.replace(/[%_*]/g, ""))}`);
  return !!(rows && rows.length);
}

module.exports = async function handler(req, res) {
  const send = (code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); };
  if (req.method !== "POST") return send(405, { error: "Method not allowed" });
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ORDER_WEBHOOK_SECRET"].filter((k) => !env(k));
  if (missing.length) { log("error", "missing environment variables", { missing }); return send(500, { error: "Server not configured" }); }
  try {
    const bySecret = req.headers["x-ace-webhook-secret"] !== undefined;
    if (bySecret ? !safeEqual(req.headers["x-ace-webhook-secret"], env("ORDER_WEBHOOK_SECRET")) : !(await isAdmin(req))) return send(401, { error: "Unauthorized" });
    return send(200, await processDue());
  } catch (e) { log("error", "unexpected error", { error: String(e.message || e).slice(0, 300) }); return send(500, { error: "Processing error" }); }
};
