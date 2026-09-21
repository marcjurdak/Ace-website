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

function buildCustomerEmail(o, info) {
  const items = Array.isArray(o.items) ? o.items : [];
  const disc = Number(o.discount_amount || 0);
  const total = o.total != null ? o.total : Number(o.subtotal || 0) + Number(o.delivery_fee || 0) - disc;
  const when = new Date(o.created_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: env("STORE_TIMEZONE") || "Asia/Beirut" });
  const address = [o.address1, o.address2, o.city, o.postal_code, o.country].filter(Boolean);
  const link = siteUrl() ? `${siteUrl()}/order?id=${o.id}` : "";
  const wa = info.whatsapp ? `https://wa.me/${info.whatsapp}` : "";
  const subject = `Your ACE order #${o.order_number} is confirmed`;
  const logo = siteUrl() ? `${siteUrl()}/logo-word-white.png` : "";
  const itemRows = items.map((i) => {
    const img = absUrl(i.image);
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #eee;width:64px;vertical-align:top">${img ? `<img src="${esc(img)}" width="56" height="70" alt="" style="display:block;width:56px;height:70px;object-fit:cover;border-radius:4px;background:#ddd">` : ""}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;vertical-align:top;font-size:14px;color:#111"><b>${esc(i.name)}</b><br><span style="color:#666">${esc(i.color)} / ${esc(i.size)} · Qty ${Number(i.qty)}</span></td>
      <td style="padding:10px 0;border-bottom:1px solid #eee;vertical-align:top;text-align:right;font-size:14px;color:#111;white-space:nowrap">${money(Number(i.price) * Number(i.qty))}</td></tr>`;
  }).join("");
  const sum = (k, v, bold) => `<tr><td style="padding:4px 0;font-size:${bold ? 16 : 14}px;color:${bold ? "#111" : "#555"};${bold ? "font-weight:700;border-top:1px solid #ddd;padding-top:10px" : ""}">${esc(k)}</td><td style="padding:4px 0;text-align:right;font-size:${bold ? 16 : 14}px;color:#111;${bold ? "font-weight:700;border-top:1px solid #ddd;padding-top:10px" : ""}">${v}</td></tr>`;
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#EDEDEC;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDEDEC"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden">
  <tr><td align="center" style="background:#000;padding:22px 24px">${logo ? `<img src="${esc(logo)}" height="24" alt="ACE" style="height:24px;display:block;margin:0 auto;border:0">` : `<span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:4px">ACE</span>`}</td></tr>
  <tr><td align="center" style="padding:30px 24px 6px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" width="56" height="56" style="width:56px;height:56px;border-radius:28px;background:#000;color:#fff;font-size:28px;line-height:56px;text-align:center">&#10003;</td></tr></table>
    <h1 style="margin:18px 0 6px;font-size:22px;color:#111">Your order is confirmed</h1>
    <p style="margin:0;font-size:15px;color:#555">Thank you, ${esc(o.first_name)}. We've received your order and we're preparing it.</p>
    <p style="margin:14px 0 0;font-size:14px;color:#111"><b>Order #${esc(o.order_number)}</b> · ${esc(when)}</p>
  </td></tr>
  <tr><td style="padding:18px 24px 6px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRows}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">
      ${sum("Subtotal", money(o.subtotal))}
      ${disc > 0 ? sum(`Discount${o.discount_code ? " (" + o.discount_code + ")" : ""}`, "−" + money(disc)) : ""}
      ${sum("Delivery", Number(o.delivery_fee) > 0 ? money(o.delivery_fee) : "Free")}
      ${sum("Total", money(total), true)}
    </table>
  </td></tr>
  <tr><td style="padding:18px 24px">
    <p style="margin:0 0 4px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1px">Delivering to</p>
    <p style="margin:0;font-size:14px;color:#111;line-height:1.5">${esc(o.first_name)} ${esc(o.last_name)}<br>${address.map(esc).join("<br>")}<br>${esc(o.phone)}</p>
    ${info.payment ? `<p style="margin:16px 0 4px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1px">Payment</p><p style="margin:0;font-size:14px;color:#111">${esc(info.payment)}</p>` : ""}
    ${link ? `<p style="margin:22px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:6px">View your order</a></p>` : ""}
  </td></tr>
  <tr><td style="padding:16px 24px;background:#fafafa;color:#777;font-size:13px;line-height:1.5">Questions about your order? Just reply to this email${wa ? ` or <a href="${esc(wa)}" style="color:#111">message us on WhatsApp</a>` : ""}.<br>ACE — Built for athletes</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `Your order is confirmed`, "", `Thank you, ${o.first_name}. We've received your order and we're preparing it.`, "",
    `Order #${o.order_number} · ${when}`, "",
    ...items.map((i) => `- ${i.qty} x ${i.name} (${i.color} / ${i.size}): ${money(Number(i.price) * Number(i.qty))}`), "",
    `Subtotal: ${money(o.subtotal)}`, disc > 0 ? `Discount${o.discount_code ? " (" + o.discount_code + ")" : ""}: -${money(disc)}` : null,
    `Delivery: ${Number(o.delivery_fee) > 0 ? money(o.delivery_fee) : "Free"}`, `Total: ${money(total)}`, "",
    `Delivering to: ${o.first_name} ${o.last_name}, ${address.join(", ")}, ${o.phone}`,
    info.payment ? `Payment: ${info.payment}` : null, link ? `View your order: ${link}` : null, "",
    `Questions? Reply to this email${wa ? " or message us on WhatsApp: " + wa : ""}.`, "ACE — Built for athletes",
  ].filter((l) => l !== null).join("\n");
  return { subject, html, text };
}

async function storeInfo() {
  try {
    const rows = await sb("settings?select=key,value&key=in.(whatsapp_number,payment_text)");
    const m = Object.fromEntries((rows || []).map((r) => [r.key, r.value || ""]));
    return { whatsapp: String(m.whatsapp_number || "").replace(/\D/g, ""), payment: m.payment_text || "" };
  } catch { return { whatsapp: "", payment: "" }; }
}

async function paymentMethod() {
  const info = await storeInfo();
  return info.payment || "Not set (add a payment note in Admin > Settings)";
}

async function sendEmail({ subject, html, text }, idempotencyKey, replyTo, to) {
  const body = { from: env("ORDER_EMAIL_FROM"), to: to || env("ORDER_NOTIFICATION_EMAIL").split(",").map((s) => s.trim()).filter(Boolean), subject, html, text };
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
async function claim(id, kind = "owner") {
  const rows = await sb("rpc/claim_order_notification", { method: "POST", body: JSON.stringify({ p_id: id, p_kind: kind }) });
  return Array.isArray(rows) ? rows[0] : null;
}
const COLS = {
  owner: { status: "notification_email_status", sent: "notification_email_sent_at", err: "notification_email_error", att: "notification_email_attempts", id: "notification_email_id" },
  customer: { status: "customer_email_status", sent: "customer_email_sent_at", err: "customer_email_error", att: "customer_email_attempts", id: "customer_email_id" },
};
const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || "").trim());

async function deliver(order, { manual = false, kind = "owner" } = {}) {
  const c = COLS[kind];
  const attempts = Number(order[c.att] || 0) + 1;
  try {
    let emailId;
    if (kind === "customer") {
      if (!validEmail(order.email)) {
        await sb(`orders?id=eq.${order.id}`, { method: "PATCH", body: JSON.stringify({ [c.status]: "skipped", [c.err]: "No valid customer email" }) });
        return { ok: false, status: "skipped", error: "This order has no valid customer email" };
      }
      const email = buildCustomerEmail(order, await storeInfo());
      const ownerReply = env("ORDER_NOTIFICATION_EMAIL").split(",")[0].trim();
      emailId = await sendEmail(email, manual ? `ace-cust-${order.id}-manual-${Date.now()}` : `ace-cust-${order.id}`, ownerReply, [String(order.email).trim()]);
    } else {
      const email = buildEmail(order, await paymentMethod());
      emailId = await sendEmail(email, manual ? `ace-order-${order.id}-manual-${Date.now()}` : `ace-order-${order.id}`, order.email);
    }
    await sb(`orders?id=eq.${order.id}`, { method: "PATCH", body: JSON.stringify({
      [c.status]: "sent", [c.sent]: new Date().toISOString(), [c.err]: null, [c.att]: attempts, [c.id]: emailId }) });
    log("log", "email sent", { order: order.order_number, kind, manual });
    return { ok: true, status: "sent" };
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 500);
    log("error", "email failed", { order: order.order_number, kind, attempt: attempts, error: msg });
    try {
      await sb(`orders?id=eq.${order.id}`, { method: "PATCH", body: JSON.stringify({ [c.status]: "failed", [c.err]: msg, [c.att]: attempts }) });
    } catch (e2) { log("error", "could not record failure", { order: order.order_number, error: String(e2.message || e2).slice(0, 200) }); }
    return { ok: false, status: "failed", error: msg };
  }
}

// Safety net: pick up emails that never went out or failed.
async function sweep(exceptId) {
  const before = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  for (const kind of ["owner", "customer"]) {
    const c = COLS[kind];
    const rows = await sb(`orders?select=id&${c.sent}=is.null&${c.att}=lt.4` +
      `&or=(${c.status}.eq.pending,${c.status}.eq.failed)&created_at=lt.${encodeURIComponent(before)}&order=created_at.asc&limit=3`);
    for (const r of rows || []) {
      if (r.id === exceptId) continue;
      const o = await claim(r.id, kind);
      if (o) await deliver(o, { kind });
    }
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
      const owner = await claim(id, "owner");
      const r1 = owner ? await deliver(owner, { kind: "owner" }) : { ok: true, status: "already-handled" };
      const cust = await claim(id, "customer");
      const r2 = cust ? await deliver(cust, { kind: "customer" }) : { ok: true, status: "already-handled" };
      const result = { ok: r1.ok && r2.ok !== false, owner: r1.status, customer: r2.status };
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
      const r = await deliver(rows[0], { manual: true, kind: body.kind === "customer" ? "customer" : "owner" });
      return send(r.ok ? 200 : 502, r);
    }
    return send(400, { error: "Unknown action" });
  } catch (e) {
    log("error", "unexpected error", { error: String(e && e.message || e).slice(0, 300) });
    return send(500, { error: "Notification error" });
  }
};
