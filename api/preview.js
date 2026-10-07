/* ACE — link preview page.
   Serves the normal homepage with the share title, sentence and photo taken from
   the admin screen, so WhatsApp / Facebook / Instagram show what you wrote there.

   Only link-preview robots are sent here (see middleware.js). Anyone else gets
   the ordinary site, untouched. Even if a person did land here they would get the
   real page: this returns the whole of index.html, with four tags swapped.
*/

const env = (k) => (process.env[k] || "").trim();
const TTL = 5 * 60 * 1000;
let pageCache = { at: 0, html: "" };
let textCache = { at: 0, v: null };

const esc = (s) => String(s || "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function timed(url, opts = {}, ms = 5000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

function origin(req) {
  const fromEnv = env("SITE_URL").replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return host ? `https://${host}` : "";
}

/* The words chosen in the admin screen. */
async function shareText() {
  if (textCache.v && Date.now() - textCache.at < TTL) return textCache.v;
  const base = env("SUPABASE_URL").replace(/\/+$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_ANON_KEY");
  const fallback = { title: "", text: "" };
  if (!base || !key) return textCache.v || fallback;
  try {
    const r = await timed(`${base}/rest/v1/rpc/get_site`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!r.ok) return textCache.v || fallback;
    const c = (await r.json()) || {};
    const b = c.brand || {}, seo = c.seo || {};
    const v = {
      title: b.share_title || seo.title || "",
      text: b.share_text || seo.description || "",
    };
    textCache = { at: Date.now(), v };
    return v;
  } catch (e) { return textCache.v || fallback; }
}

/* The real homepage, as it sits on the server. */
async function pageHtml(base) {
  if (pageCache.html && Date.now() - pageCache.at < TTL) return pageCache.html;
  const r = await timed(`${base}/index.html`, { headers: { "User-Agent": "ACE-preview" } });
  if (!r.ok) throw new Error("page " + r.status);
  const html = await r.text();
  if (!/og:title/.test(html)) throw new Error("unexpected page");
  pageCache = { at: Date.now(), html };
  return html;
}

function swap(html, { title, text }) {
  const meta = (attr, name, value) =>
    new RegExp(`(<meta\\s+${attr}=["']${name}["']\\s+content=["'])[^"']*(["'])`, "i");
  // NOTE: always replace with a function, never a string. A "$100" in the text
  // would otherwise be read as a capture-group reference and mangle the page.
  const put = (out, re, value) => out.replace(re, (m, a, b) => a + esc(value) + b);
  let out = html;
  if (title) {
    out = put(out, meta("property", "og:title"), title);
    out = put(out, meta("name", "twitter:title"), title);
    out = out.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${esc(title)}</title>`);
  }
  if (text) {
    out = put(out, meta("property", "og:description"), text);
    out = put(out, meta("name", "twitter:description"), text);
    out = put(out, /(<meta\s+name=["']description["'][^>]*content=["'])[^"']*(["'])/i, text);
  }
  return out;
}

export default async function handler(req, res) {
  const base = origin(req);
  try {
    const [html, words] = await Promise.all([pageHtml(base), shareText()]);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=86400");
    return res.status(200).send(swap(html, words));
  } catch (e) {
    // Never leave a crawler with nothing: send it to the ordinary page.
    if (base) return res.redirect(302, base + "/");
    return res.status(204).end();
  }
}
