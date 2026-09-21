// ACE — automatic order email for the store owner.
// Called by the Supabase database right after an order is saved,
// and by the admin (with a signed-in admin session) to resend or test.
// All secrets come from Vercel environment variables. Nothing here runs in the browser.
const crypto = require("crypto");

const env = (k) => (process.env[k] || "").trim();
const RESEND_BASE = env("RESEND_API_BASE") || "https://api.resend.com";
const STATUS = { new: "New", confirmed: "Confirmed", out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled" };
const PAY = { unpaid: "Unpaid", paid: "Paid", refunded: "Refunded" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function log(level, msg, extra) {
  // Only order numbers / ids and error text are logged — never customer details.
  console[level](`[order-notify] ${msg}` + (extra ? " " + JSON.stringify(extra) : ""));
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}
function sbHeaders(extra) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const h = { apikey: key, "Content-Type": "application/json", ...extra };
  if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`; // legacy JWT service_role key
  return h;
}
async function sb(path, opts = {}) {
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, { ...opts, headers: sbHeaders(opts.headers) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const money = (n) => { const v = Math.round(Number(n || 0) * 100) / 100; return "$" + (v % 1 ? v.toFixed(2) : v); };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function siteUrl() { return env("SITE_URL").replace(/\/+$/, ""); }
function absUrl(u) { if (!u) return ""; if (/^https?:\/\//i.test(u)) return u; return siteUrl() ? siteUrl() + (u.startsWith("/") ? u : "/" + u) : ""; }

function buildEmail(o, paymentMethod) {
  const items = Array.isArray(o.items) ? o.items : [];
  const when = new Date(o.created_at).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: env("STORE_TIMEZONE") || "Asia/Beirut" });
  const name = `${o.first_name || ""} ${o.last_name || ""}`.trim();
  const address = [o.address1, o.address2, o.city, o.postal_code, o.country].filter(Boolean);
  const adminLink = siteUrl() ? `${siteUrl()}/admin#/orders/${o.order_number}` : "";
  const disc = Number(o.discount_amount || 0);
  const total = o.total != null ? o.total : Number(o.subtotal || 0) + Number(o.delivery_fee || 0) - disc;
  const subject = `New ACE Order — #${o.order_number}`;

  const row = (k, v) => v ? `<tr><td style="padding:6px 0;color:#666;font-size:14px;width:130px;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-size:14px;color:#111">${v}</td></tr>` : "";
  const itemRows = items.map((i) => {
    const img = absUrl(i.image);
    const was = i.regular_price != null && Number(i.regular_price) > Number(i.price) ? ` <s style="color:#999">${money(i.regular_price)}</s>` : "";
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #eee;width:64px;vertical-align:top">${img ? `<img src="${esc(img)}" width="56" height="70" alt="" style="display:block;width:56px;height:70px;object-fit:cover;border-radius:4px;background:#ddd">` : ""}</td>
      <td style="padding:10px 10px;border-bottom:1px solid #eee;vertical-align:top;font-size:14px;color:#111"><b>${esc(i.name)}</b><br><span style="color:#666">${esc(i.color)} / ${esc(i.size)}</span><br><span style="color:#666">${money(i.price)}${was} × ${Number(i.qty)}</span></td>
      <td style="padding:10px 0;border-bottom:1px solid #eee;vertical-align:top;text-align:right;font-size:14px;color:#111;white-space:nowrap"><b>${money(Number(i.price) * Number(i.qty))}</b></td></tr>`;
  }).join("");
  const sum = (k, v, bold) => `<tr><td style="padding:4px 0;font-size:${bold ? 16 : 14}px;color:${bold ? "#111" : "#444"};${bold ? "font-weight:700;border-top:1px solid #ddd;padding-top:10px" : ""}">${esc(k)}</td><td style="padding:4px 0;text-align:right;font-size:${bold ? 16 : 14}px;color:#111;${bold ? "font-weight:700;border-top:1px solid #ddd;padding-top:10px" : ""}">${v}</td></tr>`;

  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f1f0;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f1f0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden">
  <tr><td style="background:#000;padding:18px 24px;color:#fff;font-size:20px;font-weight:700;letter-spacing:3px">ACE</td></tr>
  <tr><td style="padding:24px">
    <p style="margin:0 0 6px;font-size:13px;color:#666">A new order has been received successfully.</p>
    <h1 style="margin:0 0 4px;font-size:24px;color:#111">Order #${esc(o.order_number)}</h1>
    <p style="margin:0 0 18px;font-size:14px;color:#666">${esc(when)}</p>
    ${adminLink ? `<a href="${esc(adminLink)}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 18px;border-radius:6px">Open in admin</a>` : ""}
    <h2 style="margin:26px 0 8px;font-size:15px;color:#111;text-transform:uppercase;letter-spacing:1px">Customer</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row("Name", esc(name))}${row("Company", esc(o.company))}
      ${row("Phone", `<a href="tel:${esc(String(o.phone || "").replace(/[^\d+]/g, ""))}" style="color:#111">${esc(o.phone)}</a>`)}
      ${row("Email", o.email ? `<a href="mailto:${esc(o.email)}" style="color:#111">${esc(o.email)}</a>${o.news_opt_in ? " (wants news)" : ""}` : "Not given")}
      ${row("Address", address.map(esc).join("<br>"))}
      ${row("Map pin", o.map_link ? `<a href="${esc(o.map_link)}" style="color:#111">Open location</a>` : "")}
      ${row("Instructions", esc(o.notes))}
    </table>
    <h2 style="margin:26px 0 4px;font-size:15px;color:#111;text-transform:uppercase;letter-spacing:1px">Items</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRows}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">
      ${sum("Subtotal", money(o.subtotal))}
      ${disc > 0 ? sum(`Discount${o.discount_code ? " (" + o.discount_code + ")" : ""}`, "−" + money(disc)) : ""}
      ${sum("Delivery fee", money(o.delivery_fee))}
      ${sum("Total", money(total), true)}
    </table>
    <h2 style="margin:26px 0 8px;font-size:15px;color:#111;text-transform:uppercase;letter-spacing:1px">Status</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row("Payment method", esc(paymentMethod))}${row("Payment status", esc(PAY[o.payment_status] || o.payment_status || "Unpaid"))}${row("Order status", esc(STATUS[o.status] || o.status))}
    </table>
  </td></tr>
  <tr><td style="padding:14px 24px;background:#fafafa;color:#888;font-size:12px">Sent automatically by your ACE website. The customer may also message you on WhatsApp, but this email doesn't depend on it.</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    "A new order has been received successfully.", "",
    `Order #${o.order_number}`, when, adminLink ? `Open in admin: ${adminLink}` : null, "",
    "CUSTOMER", `Name: ${name}`, o.company ? `Company: ${o.company}` : null, `Phone: ${o.phone}`, `Email: ${o.email || "Not given"}${o.news_opt_in ? " (wants news)" : ""}`,
    `Address: ${address.join(", ")}`, o.map_link ? `Map pin: ${o.map_link}` : null, o.notes ? `Instructions: ${o.notes}` : null, "",
    "ITEMS", ...items.map((i) => `- ${i.qty} x ${i.name} (${i.color} / ${i.size}) @ ${money(i.price)} = ${money(Number(i.price) * Number(i.qty))}`), "",
    `Subtotal: ${money(o.subtotal)}`, disc > 0 ? `Discount${o.discount_code ? " (" + o.discount_code + ")" : ""}: -${money(disc)}` : null,
    `Delivery fee: ${money(o.delivery_fee)}`, `Total: ${money(total)}`, "",
    `Payment method: ${paymentMethod}`, `Payment status: ${PAY[o.payment_status] || o.payment_status || "Unpaid"}`, `Order status: ${STATUS[o.status] || o.status}`,
  ].filter((l) => l !== null).join("\n");
  return { subject, html, text };
}

async function paymentMethod() {
  return "Agreed with the customer (cash or transfer, confirmed on WhatsApp)";
}

async function sendEmail({ subject, html, text }, idempotencyKey, replyTo) {
  const body = { from: env("ORDER_EMAIL_FROM"), to: env("ORDER_NOTIFICATION_EMAIL").split(",").map((s) => s.trim()).filter(Boolean), subject, html, text };
  if (replyTo && /^\S+@\S+\.\S+$/.test(replyTo)) body.reply_to = replyTo;
  const r = await fetch(`${RESEND_BASE}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(data && (data.message || data.name)) || "unknown error"}`);
  return data.id || "";
}

// Atomically claim an order so two calls can never send two emails.
async function claim(id) {
  const rows = await sb("rpc/claim_order_notification", { method: "POST", body: JSON.stringify({ p_id: id }) });
  return Array.isArray(rows) ? rows[0] : null;
}

async function deliver(order, { manual = false } = {}) {
  const attempts = Number(order.notification_email_attempts || 0) + 1;
  try {
    const email = buildEmail(order, await paymentMethod());
    const key = manual ? `ace-order-${order.id}-manual-${Date.now()}` : `ace-order-${order.id}`;
    const emailId = await sendEmail(email, key, order.email);
    await sb(`orders?id=eq.${order.id}`, { method: "PATCH", body: JSON.stringify({
      notification_email_status: "sent", notification_email_sent_at: new Date().toISOString(),
      notification_email_error: null, notification_email_attempts: attempts, notification_email_id: emailId }) });
    log("log", "email sent", { order: order.order_number, manual });
    return { ok: true, status: "sent" };
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 500);
    log("error", "email failed", { order: order.order_number, attempt: attempts, error: msg });
    try {
      await sb(`orders?id=eq.${order.id}`, { method: "PATCH", body: JSON.stringify({
        notification_email_status: "failed", notification_email_error: msg, notification_email_attempts: attempts }) });
    } catch (e2) { log("error", "could not record failure", { order: order.order_number, error: String(e2.message || e2).slice(0, 200) }); }
    return { ok: false, status: "failed", error: msg };
  }
}

// Safety net: pick up orders whose first notification never arrived or failed.
async function sweep(exceptId) {
  const before = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const rows = await sb(`orders?select=id&notification_email_sent_at=is.null&notification_email_attempts=lt.4` +
    `&or=(notification_email_status.eq.pending,notification_email_status.eq.failed)&created_at=lt.${encodeURIComponent(before)}&order=created_at.asc&limit=3`);
  for (const r of rows || []) {
    if (r.id === exceptId) continue;
    const o = await claim(r.id);
    if (o) await deliver(o);
  }
}

async function adminEmail(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const r = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, { headers: { apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: `Bearer ${m[1]}` } });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  const email = user && user.email;
  if (!email) return null;
  const rows = await sb(`admins?select=email&email=ilike.${encodeURIComponent(email.replace(/[%_*]/g, ""))}`);
  return rows && rows.length ? email : null;
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") { try { return Promise.resolve(JSON.parse(req.body)); } catch { return Promise.resolve({}); } }
  return new Promise((res) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { res(JSON.parse(d || "{}")); } catch { res({}); } }); });
}

module.exports = async function handler(req, res) {
  const send = (code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); };
  if (req.method !== "POST") return send(405, { error: "Method not allowed" });
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "ORDER_NOTIFICATION_EMAIL", "ORDER_EMAIL_FROM", "ORDER_WEBHOOK_SECRET"].filter((k) => !env(k));
  if (missing.length) { log("error", "missing environment variables", { missing }); return send(500, { error: "Server not configured: missing " + missing.join(", ") }); }
  const body = await readBody(req);

  try {
    // 1) Called by the database right after an order is saved
    if (req.headers["x-ace-webhook-secret"] !== undefined) {
      if (!safeEqual(req.headers["x-ace-webhook-secret"], env("ORDER_WEBHOOK_SECRET"))) { log("warn", "rejected webhook with wrong secret"); return send(401, { error: "Unauthorized" }); }
      const id = String(body.order_id || "");
      if (!UUID.test(id)) return send(400, { error: "Invalid order id" });
      const exists = await sb(`orders?select=id,notification_email_status&id=eq.${id}`);
      if (!exists || !exists.length) { log("warn", "webhook for unknown order", { id }); return send(404, { error: "Order not found" }); }
      const order = await claim(id);
      const result = order ? await deliver(order) : { ok: true, status: "already-handled" };
      try { await sweep(id); } catch (e) { log("error", "sweep failed", { error: String(e.message || e).slice(0, 200) }); }
      return send(200, result); // 200 even on email failure: the order itself is safe
    }

    // 2) Called from the admin by a signed-in admin
    const admin = await adminEmail(req);
    if (!admin) return send(401, { error: "Unauthorized" });
    if (body.action === "test") {
      const sample = { id: "test", order_number: "TEST", created_at: new Date().toISOString(), first_name: "Test", last_name: "Customer", phone: "+961 70 000 000", email: "",
        address1: "Test street, building 1", city: "Beirut", country: "Lebanon", notes: "This is a test email. No order was created.",
        items: [{ name: "T-shirt", color: "Black", size: "M", qty: 1, price: 25, image: "/tee-black-front.jpg" }],
        subtotal: 25, delivery_fee: 0, discount_amount: 0, total: 25, status: "new", payment_status: "unpaid" };
      const e = buildEmail(sample, await paymentMethod());
      e.subject = "Test — " + e.subject;
      await sendEmail(e, `ace-test-${Date.now()}`);
      log("log", "test email sent");
      return send(200, { ok: true, status: "test-sent" });
    }
    if (body.action === "resend") {
      const id = String(body.order_id || "");
      if (!UUID.test(id)) return send(400, { error: "Invalid order id" });
      const rows = await sb(`orders?select=*&id=eq.${id}`);
      if (!rows || !rows.length) return send(404, { error: "Order not found" });
      const r = await deliver(rows[0], { manual: true });
      return send(r.ok ? 200 : 502, r);
    }
    return send(400, { error: "Unknown action" });
  } catch (e) {
    log("error", "unexpected error", { error: String(e && e.message || e).slice(0, 300) });
    return send(500, { error: "Notification error" });
  }
};
