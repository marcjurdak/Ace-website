/* ACE — sends link-preview robots (WhatsApp, Facebook, Instagram, X, Telegram…)
   to /api/preview, so the title and sentence you wrote in the admin screen are
   the ones they show.

   Real visitors never touch this: anything that is not a known robot passes
   straight through, and every error passes straight through too. If anything
   ever looks wrong, delete this one file and the site goes back to normal.
*/

export const config = {
  // skip the admin, the api, and anything with a file extension (photos, css, js)
  matcher: ["/((?!api/|admin|.*\\.[a-zA-Z0-9]+$).*)"],
};

const ROBOTS = /facebookexternalhit|facebookcatalog|WhatsApp\/|Twitterbot|LinkedInBot|TelegramBot|Slackbot|Discordbot|SkypeUriPreview|redditbot|Applebot|Googlebot|bingbot|Pinterest|vkShare|Embedly|Iframely|quora link preview|Viber|Line\/|SnapchatAds|Yahoo Link Preview|Google-InspectionTool|DuckDuckBot|YandexBot|Mastodon|Bluesky/i;

export default async function middleware(req) {
  try {
    const ua = req.headers.get("user-agent") || "";
    if (!ROBOTS.test(ua)) return;                 // a person — carry on as normal

    const u = new URL(req.url);
    u.pathname = "/api/preview";
    u.search = "";
    const r = await fetch(u.toString(), { headers: { "user-agent": "ACE-preview" } });
    if (!r.ok) return;                            // anything odd — carry on as normal

    return new Response(await r.text(), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, s-maxage=300, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    return;                                       // never let this break the site
  }
}
