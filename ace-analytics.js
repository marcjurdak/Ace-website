/* ACE analytics layer — GA4 ecommerce + PostHog.
   Nothing third-party loads until the visitor accepts analytics cookies
   AND the IDs are set in Admin > Settings. Events are queued until then. */
if (!window.aceConsent) (function () {
  var c = null; try { c = JSON.parse(localStorage.getItem("ace-consent") || "null"); } catch (e) {}
  window.aceConsent = { get: function () { return c; }, has: function (k) { return !!(c && c[k]); }, set: function () {}, onChange: function (f) { if (c) try { f(c); } catch (e) {} } };
})();
(function () {
  var DEBUG = /(^|[?&])ace_debug=1/.test(location.search) || sessionStorage.getItem("ace-debug") === "1" || /^(localhost|127\.)/.test(location.hostname);
  if (/(^|[?&])ace_debug=1/.test(location.search)) try { sessionStorage.setItem("ace-debug", "1"); } catch (e) {}
  var cfg = null, queue = [], started = false, ready = false, gaReady = false, phReady = false;
  var CURRENCY = "USD";
  function log() { if (DEBUG) try { console.log.apply(console, ["%c[ACE analytics]", "color:#888"].concat([].slice.call(arguments))); } catch (e) {} }
  function consented() { return !!(window.aceConsent && window.aceConsent.has("analytics")); }
  function idle(fn) { (window.requestIdleCallback || function (f) { return setTimeout(f, 300); })(fn, { timeout: 2500 }); }
  function script(src) { var s = document.createElement("script"); s.async = true; s.src = src; document.head.appendChild(s); return s; }

  function startGA(id) {
    if (!/^G-[A-Z0-9]{4,}$/i.test(id || "")) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", id, { send_page_view: true, debug_mode: DEBUG || undefined, anonymize_ip: true });
    script("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id));
    gaReady = true; log("GA4 loaded", id);
  }
  function startPH(key, host) {
    if (!/^phc_[A-Za-z0-9]{10,}$/.test(key || "")) return;
    host = host === "us" ? "https://us.i.posthog.com" : "https://eu.i.posthog.com";
    // official PostHog loader (async, queues calls until loaded)
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags onFeatureFlags identify setPersonProperties reset get_distinct_id opt_in_capturing opt_out_capturing".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    window.posthog.init(key, {
      api_host: host, person_profiles: "identified_only", capture_pageview: true, capture_pageleave: true,
      autocapture: true, persistence: "localStorage+cookie",
      session_recording: { maskAllInputs: true, maskTextSelector: ".ph-mask, .ph-mask *" },
      mask_all_text: false, debug: DEBUG
    });
    phReady = true; log("PostHog loaded", host);
  }
  function start() {
    if (started || !cfg || !consented()) return;
    started = true;
    idle(function () {
      startGA(cfg.ga4);
      startPH(cfg.posthogKey, cfg.posthogHost);
      ready = true;
      var q = queue; queue = []; q.forEach(function (e) { send(e[0], e[1]); });
    });
  }
  function send(name, params) {
    log(name, params);
    if (gaReady && window.gtag) window.gtag("event", name, params);
    if (phReady && window.posthog) {
      var p = {}; for (var k in params) if (k !== "items") p[k] = params[k];
      if (params.items) { p.items = params.items.map(function (i) { return { id: i.item_id, name: i.item_name, variant: i.item_variant, price: i.price, quantity: i.quantity }; }); p.item_count = params.items.reduce(function (a, i) { return a + (i.quantity || 1); }, 0); }
      window.posthog.capture(name, p);
    }
  }
  window.aceAnalytics = {
    configure: function (c) { cfg = c || {}; log("configured", { ga4: !!cfg.ga4, posthog: !!cfg.posthogKey }); start(); },
    track: function (name, params) {
      params = params || {}; if (params.value != null && !params.currency) params.currency = CURRENCY;
      if (ready) send(name, params); else if (consented() || !window.aceConsent.get()) { queue.push([name, params]); if (queue.length > 60) queue.shift(); log("(queued)", name); }
    },
    gaClientId: function () { var m = document.cookie.match(/(?:^|; )_ga=GA\d\.\d\.(\d+\.\d+)/); return m ? m[1] : ""; },
    posthogId: function () { try { return window.posthog && window.posthog.get_distinct_id ? String(window.posthog.get_distinct_id() || "") : ""; } catch (e) { return ""; } },
    debug: DEBUG
  };
  if (window.aceConsent) window.aceConsent.onChange(function (c) { if (c.analytics) start(); else queue = []; });
})();
