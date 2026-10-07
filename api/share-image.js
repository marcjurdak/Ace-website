/* ACE — share link photo.
   This is the picture WhatsApp, Instagram, Facebook, Messenger, iMessage and
   Telegram show when someone pastes a link to the site.

   The address of this endpoint never changes, so it can sit in a plain <meta>
   tag in index.html (crawlers do not run JavaScript, so the tag has to be
   static). What it SERVES is whatever photo is set in the admin screen under
   Online store > Logos > "Share link photo", so the picture can be changed any
   time without redeploying the site.

   Order: admin "Share link photo" -> opening photo (hero) -> /share-default.jpg
*/

const TIMEOUT = 6000;
const MAX_BYTES = 5 * 1024 * 1024;
const env = (k) => (process.env[k] || "").trim();

let cache = { at: 0, url: "" };          // remembers the chosen photo for 5 min
const CONTENT_TTL = 5 * 60 * 1000;

async function withTimeout(url, opts = {}, ms = TIMEOUT) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

/* Read the published site content and pull out the chosen photo. */
async function chosenImage() {
  if (cache.url && Date.now() - cache.at < CONTENT_TTL) return cache.url;
  const base = env("SUPABASE_URL").replace(/\/+$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_ANON_KEY");
  if (!base || !key) return "";
  try {
    const r = await withTimeout(`${base}/rest/v1/rpc/get_site`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!r.ok) return cache.url || "";
    const site = await r.json();
    const c = site && typeof site === "object" ? site : {};
    const url =
      (c.brand && c.brand.share_image) ||
      (c.hero && (c.hero.image || c.hero.image_mobile)) ||
      "";
    cache = { at: Date.now(), url: String(url || "") };
    return cache.url;
  } catch (e) {
    return cache.url || "";
  }
}

function siteOrigin(req) {
  const fromEnv = env("SITE_URL").replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return host ? `https://${host}` : "";
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }

  const origin = siteOrigin(req);
  const fallback = origin ? `${origin}/share-default.jpg` : "";

  let target = "";
  try { target = await chosenImage(); } catch (e) { target = ""; }

  // Only ever fetch http(s). Anything odd falls back to the shipped picture.
  if (!/^https?:\/\//i.test(target)) target = "";

  const tryUrls = [target, fallback].filter(Boolean);

  for (const u of tryUrls) {
    try {
      const r = await withTimeout(u, { headers: { "User-Agent": "ACE-share-image" } });
      if (!r.ok) continue;
      const type = (r.headers.get("content-type") || "").toLowerCase();
      if (!type.startsWith("image/")) continue;
      const len = Number(r.headers.get("content-length") || 0);
      if (len && len > MAX_BYTES) continue;

      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_BYTES) continue;

      res.setHeader("Content-Type", type.split(";")[0]);
      res.setHeader("Content-Length", String(buf.length));
      // Short CDN cache: a new photo in the admin shows up within ~10 minutes,
      // and the endpoint is not hit on every single share.
      res.setHeader("Cache-Control", "public, max-age=600, s-maxage=600, stale-while-revalidate=86400");
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(200).send(buf);
    } catch (e) { /* try the next one */ }
  }

  // Everything failed (image host down). Send the crawler somewhere valid.
  if (fallback) { res.setHeader("Cache-Control", "public, max-age=60"); return res.redirect(302, fallback); }
  return res.status(404).end();
}
