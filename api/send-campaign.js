// ACE — sends emails to customers: campaigns, a test to yourself, and
// "it's available now" alerts to the waiting list. Admin only.
// Secrets stay here; the browser never sees them.
const crypto = require("crypto");
const env = (k) => (process.env[k] || "").trim();
const RESEND = (env("RESEND_API_BASE") || "https://api.resend.com") + "/emails";
const safeEqual = (a, b) => { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y); };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const log = (lvl, msg, extra) => console[lvl](`[send-campaign] ${msg}` + (extra ? " " + JSON.stringify(extra) : ""));

function sbHeaders() { const k = env("SUPABASE_SERVICE_ROLE_KEY"); const h = { apikey: k, "Content-Type": "application/json" }; if (k.startsWith("eyJ")) h.Authorization = `Bearer ${k}`; return h; }
async function sb(path, opts = {}) {
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, { ...opts, headers: { ...sbHeaders(), ...(opts.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
function unsubLink(email) {
  const secret = env("ORDER_WEBHOOK_SECRET");
  const sig = crypto.createHmac("sha256", secret).update(email.toLowerCase()).digest("hex").slice(0, 32);
  return `${env("SITE_URL").replace(/\/+$/, "")}/api/send-campaign?unsubscribe=${encodeURIComponent(email)}&t=${sig}`;
}
function inline(text) {  // **bold**, *italic*, [label](https://link)
  return esc(text)
    .replace(/\[([^\]]{1,80})\]\((https?:\/\/[^\s)]{1,300})\)/g, '<a href="$2" style="color:#111;text-decoration:underline">$1</a>')
    .replace(/\*\*([^*]{1,200})\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\s)\*([^*]{1,200})\*/g, "$1<em>$2</em>")
    .replace(/\n/g, "<br>");
}
function wrap({ title, headline, preheader, bodyHtml, buttonLabel, buttonUrl, imageUrl, imageUrl2, footerNote, email }) {
  const site = env("SITE_URL").replace(/\/+$/, "");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#EDEDEC;font-family:Arial,Helvetica,sans-serif">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDEDEC"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:10px;overflow:hidden">
  <tr><td align="center" style="background:#000;padding:22px 24px">${site ? `<img src="${site}/logo-word-white.png" height="22" alt="ACE" style="height:22px;display:block;margin:0 auto;border:0">` : `<span style="color:#fff;font-size:20px;letter-spacing:4px">ACE</span>`}</td></tr>
  ${imageUrl ? `<tr><td>${buttonUrl ? `<a href="${esc(buttonUrl)}">` : ""}<img src="${esc(imageUrl)}" alt="" style="width:100%;display:block;border:0">${buttonUrl ? "</a>" : ""}</td></tr>` : ""}
  <tr><td style="padding:28px 24px">
    <h1 style="margin:0 0 16px;font-size:24px;color:#111;line-height:1.22">${esc(headline || title)}</h1>
    ${bodyHtml}
    ${buttonLabel && buttonUrl ? `<p style="margin:26px 0 0"><a href="${esc(buttonUrl)}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:.06em;padding:15px 26px;border-radius:4px">${esc(buttonLabel)}</a></p>` : ""}
  </td></tr>
  ${imageUrl2 ? `<tr><td style="padding:0 24px 24px">${buttonUrl ? `<a href="${esc(buttonUrl)}">` : ""}<img src="${esc(imageUrl2)}" alt="" style="width:100%;display:block;border:0">${buttonUrl ? "</a>" : ""}</td></tr>` : ""}
  ${footerNote ? `<tr><td style="padding:0 24px 24px;color:#666;font-size:13px;line-height:1.6">${inline(footerNote)}</td></tr>` : ""}
  <tr><td style="padding:16px 24px;background:#fafafa;color:#888;font-size:12px;line-height:1.6">
    ACE — Built for athletes${site ? ` · <a href="${site}" style="color:#666">${site.replace(/^https?:\/\//, "")}</a>` : ""}<br>
    Don't want these emails? <a href="${esc(unsubLink(email))}" style="color:#666">Unsubscribe</a>. You'll still get your order updates.
  </td></tr>
</table></td></tr></table></body></html>`;
}
const paragraphs = (text) => String(text || "").split(/\n{2,}/).filter((p) => p.trim())
  .map((p) => `<p style="margin:0 0 14px;font-size:15.5px;line-height:1.65;color:#333">${inline(p.trim())}</p>`).join("");

async function sendOne({ to, subject, html, text, key }) {
  const r = await fetch(RESEND, { method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ from: env("ORDER_EMAIL_FROM"), to: [to], subject, html, text,
      reply_to: env("ORDER_NOTIFICATION_EMAIL").split(",")[0].trim() || undefined }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(data && (data.message || data.name)) || "unknown error"}`);
  return data.id || "";
}
async function isAdmin(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i); if (!m) return null;
  const r = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, { headers: { apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: `Bearer ${m[1]}` } });
  if (!r.ok) return null; const u = await r.json().catch(() => null); if (!u || !u.email) return null;
  const rows = await sb(`admins?select=email&email=ilike.${encodeURIComponent(u.email.replace(/[%_*]/g, ""))}`);
  return rows && rows.length ? u.email : null;
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const send = (code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); };

  // one-click unsubscribe from the footer of any email
  if (req.method === "GET" && url.searchParams.has("unsubscribe")) {
    const email = url.searchParams.get("unsubscribe") || "", t = url.searchParams.get("t") || "";
    const good = crypto.createHmac("sha256", env("ORDER_WEBHOOK_SECRET")).update(email.toLowerCase()).digest("hex").slice(0, 32);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (t !== good) { res.statusCode = 400; return res.end("<p style='font-family:Arial;padding:40px'>This unsubscribe link isn't valid any more.</p>"); }
    try { await sb("rpc/unsubscribe_email", { method: "POST", body: JSON.stringify({ p_email: email }) }); } catch (e) { log("error", "unsubscribe failed", { error: String(e.message || e).slice(0, 150) }); }
    res.statusCode = 200;
    return res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:Arial;max-width:420px;margin:12vh auto;padding:0 20px;text-align:center"><h2 style="font-weight:600">You're unsubscribed</h2><p style="color:#666;line-height:1.6">You won't get marketing emails from ACE any more. You'll still receive updates about orders you place.</p><p><a href="${esc(env("SITE_URL") || "/")}" style="color:#111">Back to ACE</a></p></div>`);
  }

  if (req.method !== "POST") return send(405, { error: "Method not allowed" });
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "ORDER_EMAIL_FROM", "ORDER_WEBHOOK_SECRET"].filter((k) => !env(k));
  if (missing.length) { log("error", "missing environment variables", { missing }); return send(500, { error: "Server not set up: missing " + missing.join(", ") }); }

  let body = req.body;
  if (!body || typeof body === "string") body = await new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { r(JSON.parse(d || "{}")); } catch { r({}); } }); });

  // either an admin in the browser, or the database itself announcing a restock
  const fromDatabase = !!(body && body.secret && safeEqual(body.secret, env("ORDER_WEBHOOK_SECRET")));
  const admin = fromDatabase ? "automatic" : await isAdmin(req);
  if (!admin) return send(401, { error: "Unauthorized" });
  if (fromDatabase && !body.restock_product_id) return send(400, { error: "Nothing to send" });

  try {
    // ---- "it's available now" to everyone waiting for a product ----
    if (body.restock_product_id) {
      const pid = String(body.restock_product_id);
      const prod = (await sb(`products?select=id,name,slug&id=eq.${pid}`))[0];
      if (!prod) return send(404, { error: "Product not found" });
      const waiting = await sb(`restock_requests?select=id,email&product_id=eq.${pid}&notified_at=is.null&limit=500`);
      const site = env("SITE_URL").replace(/\/+$/, "");
      const link = `${site}/p/${prod.slug}?utm_source=email&utm_medium=restock&utm_campaign=restock-${prod.slug}`;
      let sent = 0, failed = 0;
      for (const w of waiting || []) {
        try {
          const html = wrap({ title: `${prod.name} is available`, preheader: `${prod.name} just landed at ACE.`, email: w.email,
            bodyHtml: paragraphs(`You asked us to tell you when ${prod.name} was ready. It's in the shop now.\n\nSizes go quickly, so have a look while your size is still there.`),
            buttonLabel: "See it now", buttonUrl: link });
          await sendOne({ to: w.email, subject: `${prod.name} is available now`, html,
            text: `${prod.name} is available now at ACE.\n\n${link}\n\nUnsubscribe: ${unsubLink(w.email)}`, key: `restock-${pid}-${w.id}` });
          await sb(`restock_requests?id=eq.${w.id}`, { method: "PATCH", body: JSON.stringify({ notified_at: new Date().toISOString() }) });
          sent++;
        } catch (e) { failed++; log("error", "restock email failed", { product: prod.name, error: String(e.message || e).slice(0, 150) }); }
      }
      log("log", "restock alerts finished", { product: prod.name, sent, failed });
      return send(200, { ok: true, sent, failed });
    }

    // ---- campaign ----
    const id = String(body.campaign_id || "");
    if (!id) return send(400, { error: "Nothing to send" });
    const c = (await sb(`campaigns?select=*&id=eq.${id}`))[0];
    if (!c) return send(404, { error: "Email not found" });

    const build = (email) => {
      const html = wrap({ title: c.subject, headline: c.headline, preheader: c.preheader, bodyHtml: paragraphs(c.body),
        buttonLabel: c.button_label, buttonUrl: c.button_url, imageUrl: c.image_url, imageUrl2: c.image_url2,
        footerNote: c.footer_note, email });
      const text = `${c.subject}\n\n${c.body}\n\n${c.button_url ? c.button_url + "\n\n" : ""}Unsubscribe: ${unsubLink(email)}`;
      return { html, text };
    };

    if (body.test) {
      const to = admin;
      const { html, text } = build(to);
      await sendOne({ to, subject: `[Test] ${c.subject}`, html, text, key: `test-${id}-${Date.now()}` });
      log("log", "test email sent");
      return send(200, { ok: true, to });
    }

    if (c.status === "sent") return send(400, { error: "This email was already sent." });
    await sb(`campaigns?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "sending" }) });

    const audience = await sb("rpc/campaign_audience", { method: "POST", body: JSON.stringify({ p_audience: c.audience }) });
    const already = await sb(`campaign_sends?select=email&campaign_id=eq.${id}&limit=5000`);
    const done = new Set((already || []).map((x) => String(x.email).toLowerCase()));
    const list = (audience || []).filter((a) => a.email && !done.has(String(a.email).toLowerCase()));

    let sent = 0, failed = 0, lastError = null;
    for (const person of list) {
      const to = person.email;
      try {
        const { html, text } = build(to);
        await sendOne({ to, subject: c.subject, html, text, key: `camp-${id}-${to.toLowerCase()}` });
        await sb("campaign_sends", { method: "POST", body: JSON.stringify({ campaign_id: id, email: to, status: "sent" }) }).catch(() => {});
        sent++;
      } catch (e) {
        failed++; lastError = String(e.message || e).slice(0, 200);
        await sb("campaign_sends", { method: "POST", body: JSON.stringify({ campaign_id: id, email: to, status: "failed", error: lastError }) }).catch(() => {});
        log("error", "campaign email failed", { error: lastError });
      }
      await new Promise((r) => setTimeout(r, 60)); // stay inside Resend's rate limit
    }
    await sb(`campaigns?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({
      status: failed && !sent ? "failed" : "sent", recipients: list.length + done.size, sent_count: sent + done.size,
      failed_count: failed, last_error: lastError, sent_at: new Date().toISOString() }) });
    log("log", "campaign finished", { sent, failed });
    return send(200, { ok: true, sent, failed });
  } catch (e) {
    log("error", "unexpected", { error: String(e.message || e).slice(0, 200) });
    return send(500, { error: String(e.message || e).slice(0, 200) });
  }
};
