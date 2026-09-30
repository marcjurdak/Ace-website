// ACE — MCP server for Claude (ads + shop data).
// Lets Claude read your real ACE numbers and read/adjust your Meta ads.
// Protected by ACE_MCP_TOKEN. Never exposes Supabase or Meta keys to the browser.
const crypto = require("crypto");
const env = (k) => (process.env[k] || "").trim();
const GRAPH = "https://graph.facebook.com/v21.0";

function log(level, msg, extra) { console[level](`[mcp] ${msg}` + (extra ? " " + JSON.stringify(extra) : "")); }
function safeEqual(a, b) { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y); }
function sbHeaders() { const key = env("SUPABASE_SERVICE_ROLE_KEY"); const h = { apikey: key, "Content-Type": "application/json" }; if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`; return h; }
async function sb(path, opts = {}) {
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, { ...opts, headers: { ...sbHeaders(), ...(opts.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
async function meta(path, { method = "GET", params = {}, body = null } = {}) {
  const token = env("META_ACCESS_TOKEN");
  if (!token) throw new Error("Meta is not connected yet: add META_ACCESS_TOKEN in Vercel.");
  const u = new URL(`${GRAPH}/${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && u.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v)));
  u.searchParams.set("access_token", token);
  const r = await fetch(u, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Meta: ${(data.error && data.error.message) || r.status}`);
  return data;
}
const adAccount = () => { const a = env("META_AD_ACCOUNT_ID"); return a.startsWith("act_") ? a : "act_" + a; };
const money = (n) => "$" + (Math.round(Number(n || 0) * 100) / 100).toLocaleString("en-US");
const days = (n) => new Date(Date.now() - n * 86400000).toISOString();

/* ---------------- tools ---------------- */
const TOOLS = [
  { name: "ace_shop_overview",
    description: "ACE shop numbers for the last N days: visitors, add-to-cart, orders, delivered revenue, cancellations, top products, traffic sources. Use this before judging ad performance.",
    inputSchema: { type: "object", properties: { days: { type: "number", description: "How many days back (default 30)" } } },
    run: async ({ days: d = 30 }) => {
      const a = await sb(`rpc/analytics_summary`, { method: "POST", body: JSON.stringify({ p_days: Math.max(1, Math.min(365, d)) }) });
      return a;
    } },
  { name: "ace_orders_by_campaign",
    description: "ACE orders grouped by the campaign that brought them (utm_campaign), with submitted vs delivered revenue and cancellation counts. This is the real result of an ad, because cash-on-delivery orders can be cancelled.",
    inputSchema: { type: "object", properties: { days: { type: "number" } } },
    run: async ({ days: d = 30 }) => {
      const rows = await sb(`orders?select=utm_source,utm_campaign,utm_content,status,total,subtotal,delivered_revenue,created_at&created_at=gte.${days(Math.max(1, Math.min(365, d)))}&limit=5000`);
      const by = {};
      (rows || []).forEach((o) => {
        const k = o.utm_campaign || o.utm_source || "(no campaign)";
        const b = by[k] || (by[k] = { campaign: k, orders: 0, delivered: 0, cancelled: 0, submitted_revenue: 0, delivered_revenue: 0 });
        b.orders++;
        if (o.status === "delivered") b.delivered++;
        if (["cancelled", "returned", "refunded"].includes(o.status)) b.cancelled++;
        else b.submitted_revenue += Number(o.total ?? o.subtotal ?? 0);
        b.delivered_revenue += Number(o.delivered_revenue || 0);
      });
      return Object.values(by).sort((x, y) => y.delivered_revenue - x.delivered_revenue)
        .map((b) => ({ ...b, cancellation_rate: b.orders ? Math.round((b.cancelled / b.orders) * 100) + "%" : "0%" }));
    } },
  { name: "ace_stock_status",
    description: "Current ACE stock per product, colour and size, plus which sizes are sold out. Use before scaling an ad so you never push a product you cannot deliver.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const ps = await sb("products?select=name,active,price,sale_price,colors,sizes&order=position");
      return (ps || []).map((p) => ({ product: p.name, active: p.active, price: p.sale_price ?? p.price,
        stock: (p.colors || []).map((c) => ({ colour: c.name, sold_out: !!c.sold_out, per_size: c.stock || "not tracked" })) }));
    } },
  { name: "meta_list_campaigns",
    description: "List Meta (Facebook/Instagram) campaigns in the connected ad account with status and daily budget.",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    run: async ({ limit = 25 }) => {
      const d = await meta(`${adAccount()}/campaigns`, { params: { fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time", limit } });
      return (d.data || []).map((c) => ({ ...c, daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null, lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null }));
    } },
  { name: "meta_insights",
    description: "Meta ad results (spend, impressions, clicks, CPC, CTR, purchases reported by Meta) for a date range, broken down by campaign, ad set or ad.",
    inputSchema: { type: "object", properties: {
        level: { type: "string", description: "campaign | adset | ad (default campaign)" },
        days: { type: "number", description: "How many days back (default 7)" } } },
    run: async ({ level = "campaign", days: d = 7 }) => {
      const lv = ["campaign", "adset", "ad"].includes(level) ? level : "campaign";
      const since = new Date(Date.now() - Math.max(1, Math.min(90, d)) * 86400000).toISOString().slice(0, 10);
      const until = new Date().toISOString().slice(0, 10);
      const r = await meta(`${adAccount()}/insights`, { params: {
        level: lv, time_range: { since, until }, limit: 100,
        fields: "campaign_name,adset_name,ad_name,spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas" } });
      return (r.data || []).map((x) => {
        const act = (x.actions || []).find((a) => a.action_type === "purchase");
        return { campaign: x.campaign_name, adset: x.adset_name, ad: x.ad_name, spend: Number(x.spend || 0),
          impressions: Number(x.impressions || 0), clicks: Number(x.clicks || 0), ctr: x.ctr, cpc: x.cpc,
          meta_purchases: act ? Number(act.value) : 0,
          meta_roas: (x.purchase_roas && x.purchase_roas[0] && Number(x.purchase_roas[0].value)) || 0 };
      });
    } },
  { name: "meta_real_roas",
    description: "The most useful report: Meta spend per campaign next to ACE's own DELIVERED revenue for the same campaign, with true ROAS on delivered money and the cancellation rate. Cash-on-delivery safe.",
    inputSchema: { type: "object", properties: { days: { type: "number" } } },
    run: async ({ days: d = 14 }) => {
      const n = Math.max(1, Math.min(90, d));
      const [ins, orders] = await Promise.all([
        meta(`${adAccount()}/insights`, { params: { level: "campaign", time_range: { since: new Date(Date.now() - n * 86400000).toISOString().slice(0, 10), until: new Date().toISOString().slice(0, 10) }, fields: "campaign_name,spend", limit: 100 } }),
        sb(`orders?select=utm_campaign,status,total,subtotal,delivered_revenue&created_at=gte.${days(n)}&limit=5000`)
      ]);
      const shop = {};
      (orders || []).forEach((o) => {
        const k = (o.utm_campaign || "(no campaign)").toLowerCase();
        const b = shop[k] || (shop[k] = { orders: 0, cancelled: 0, delivered_revenue: 0, submitted_revenue: 0 });
        b.orders++;
        if (["cancelled", "returned", "refunded"].includes(o.status)) b.cancelled++; else b.submitted_revenue += Number(o.total ?? o.subtotal ?? 0);
        b.delivered_revenue += Number(o.delivered_revenue || 0);
      });
      return (ins.data || []).map((c) => {
        const key = String(c.campaign_name || "").toLowerCase();
        const s = shop[key] || Object.entries(shop).find(([k]) => key.includes(k) || k.includes(key))?.[1] || { orders: 0, cancelled: 0, delivered_revenue: 0, submitted_revenue: 0 };
        const spend = Number(c.spend || 0);
        return { campaign: c.campaign_name, spend, orders: s.orders, cancelled: s.cancelled,
          submitted_revenue: s.submitted_revenue, delivered_revenue: s.delivered_revenue,
          roas_on_delivered: spend > 0 ? Math.round((s.delivered_revenue / spend) * 100) / 100 : null,
          cost_per_order: s.orders ? Math.round((spend / s.orders) * 100) / 100 : null,
          note: "delivered_revenue counts only orders actually delivered and paid" };
      }).sort((a, b) => (b.delivered_revenue || 0) - (a.delivered_revenue || 0));
    } },
  { name: "meta_set_campaign_status",
    description: "Pause or resume a Meta campaign. Ask the owner before using it.",
    inputSchema: { type: "object", required: ["campaign_id", "status"], properties: {
      campaign_id: { type: "string" }, status: { type: "string", description: "PAUSED or ACTIVE" } } },
    run: async ({ campaign_id, status }) => {
      const st = String(status).toUpperCase();
      if (!["PAUSED", "ACTIVE"].includes(st)) throw new Error("status must be PAUSED or ACTIVE");
      if (env("ACE_MCP_READONLY") === "1") throw new Error("Changes are switched off (ACE_MCP_READONLY=1).");
      await meta(campaign_id, { method: "POST", params: { status: st } });
      log("log", "campaign status changed", { campaign_id, status: st });
      return { ok: true, campaign_id, status: st };
    } },
  { name: "meta_set_daily_budget",
    description: "Change the daily budget of a Meta campaign, in dollars. Ask the owner before using it.",
    inputSchema: { type: "object", required: ["campaign_id", "daily_budget"], properties: {
      campaign_id: { type: "string" }, daily_budget: { type: "number", description: "Dollars per day, e.g. 15" } } },
    run: async ({ campaign_id, daily_budget }) => {
      const v = Number(daily_budget);
      if (!(v > 0)) throw new Error("daily_budget must be above 0");
      const cap = Number(env("ACE_MCP_MAX_DAILY_BUDGET") || 100);
      if (v > cap) throw new Error(`That is above the safety limit of $${cap}/day. Raise ACE_MCP_MAX_DAILY_BUDGET in Vercel if you really want this.`);
      if (env("ACE_MCP_READONLY") === "1") throw new Error("Changes are switched off (ACE_MCP_READONLY=1).");
      await meta(campaign_id, { method: "POST", params: { daily_budget: Math.round(v * 100) } });
      log("log", "budget changed", { campaign_id, daily_budget: v });
      return { ok: true, campaign_id, daily_budget: money(v) };
    } }
];

/* ---------------- MCP protocol (JSON-RPC over HTTP) ---------------- */
async function handleRpc(msg) {
  const id = msg.id ?? null;
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
  switch (msg.method) {
    case "initialize": {
      const asked = (msg.params && msg.params.protocolVersion) || "2024-11-05";
      return ok({ protocolVersion: asked, capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "ace-ads", version: "1.0.0" } });
    }
    case "notifications/initialized": return null;
    case "ping": return ok({});
    case "tools/list":
      return ok({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const t = TOOLS.find((x) => x.name === (msg.params && msg.params.name));
      if (!t) return fail(-32602, `Unknown tool: ${msg.params && msg.params.name}`);
      try {
        const out = await t.run((msg.params && msg.params.arguments) || {});
        return ok({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        log("error", "tool failed", { tool: t.name, error: String(e.message || e).slice(0, 200) });
        return ok({ isError: true, content: [{ type: "text", text: String(e.message || e) }] });
      }
    }
    default: return fail(-32601, `Unknown method: ${msg.method}`);
  }
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const accept = String(req.headers.accept || "");
  const wantsSSE = accept.includes("text/event-stream");

  // CORS (harmless for server-to-server, needed for browser-based clients)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, mcp-session-id, mcp-protocol-version, accept");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const sendJson = (code, obj) => {
    res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store");
    res.end(obj === undefined ? "" : JSON.stringify(obj));
  };
  const sendRpc = (obj) => {
    if (obj === null || obj === undefined) { res.statusCode = 202; return res.end(); }
    if (wantsSSE) {  // some MCP clients require the streaming format
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Connection", "keep-alive");
      res.write(`event: message\ndata: ${JSON.stringify(obj)}\n\n`);
      return res.end();
    }
    return sendJson(200, obj);
  };

  // health check in a browser: /api/mcp?health=1
  if (req.method === "GET" && (url.searchParams.has("health") || url.searchParams.has("ping"))) {
    return sendJson(200, { name: "ace-ads", status: "ready", tools: TOOLS.map((t) => t.name) });
  }
  // the MCP spec expects plain GET to be refused when the server has no stream to give
  if (req.method === "GET") { res.setHeader("Allow", "POST"); return sendJson(405, { error: "Use POST (MCP). For a health check add ?health=1" }); }
  if (req.method === "DELETE") { res.statusCode = 204; return res.end(); }
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(405, { error: "Method not allowed" }); }

  if (!env("ACE_MCP_TOKEN")) { log("error", "ACE_MCP_TOKEN missing"); return sendJson(500, { error: "Server not configured" }); }
  // the key may arrive as a header OR in the address (?key=...), because some
  // MCP clients cannot add custom headers
  const headerToken = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const urlToken = (url.searchParams.get("key") || url.searchParams.get("token") || "").trim();
  if (!safeEqual(headerToken, env("ACE_MCP_TOKEN")) && !safeEqual(urlToken, env("ACE_MCP_TOKEN"))) {
    log("warn", "rejected a call with a wrong or missing key");
    res.setHeader("WWW-Authenticate", 'Bearer realm="ace-ads"');
    return sendJson(401, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } });
  }
  res.setHeader("Mcp-Session-Id", String(req.headers["mcp-session-id"] || "ace-" + crypto.randomBytes(8).toString("hex")));

  let body = req.body;
  if (!body || typeof body === "string") {
    body = await new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { r(JSON.parse(d || "{}")); } catch { r({}); } }); });
  }
  try {
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(handleRpc))).filter(Boolean);
      return out.length ? sendRpc(out) : sendRpc(null);
    }
    return sendRpc(await handleRpc(body));
  } catch (e) {
    log("error", "unexpected", { error: String(e.message || e).slice(0, 200) });
    return sendJson(500, { jsonrpc: "2.0", id: body && body.id, error: { code: -32603, message: "Server error" } });
  }
};
