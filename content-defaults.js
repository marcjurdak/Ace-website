/* ACE site content defaults. The admin "Online store" editor saves changes on top of these. */
window.ACE_FONTS = {
  display: {
    "Michroma": "Michroma",
    "Unbounded": "Unbounded:wght@400;600;800",
    "Orbitron": "Orbitron:wght@400;600;800",
    "Syncopate": "Syncopate:wght@400;700",
    "Anton": "Anton",
    "Bebas Neue": "Bebas+Neue",
    "Oswald": "Oswald:wght@400;600",
    "Archivo Black": "Archivo+Black",
    "Space Grotesk": "Space+Grotesk:wght@400;600;700",
    "Montserrat": "Montserrat:wght@500;700;800"
  },
  body: {
    "Archivo": "Archivo:wdth,wght@100..125,300..700",
    "Inter": "Inter:wght@400;500;600;700",
    "Manrope": "Manrope:wght@400;500;600;700",
    "DM Sans": "DM+Sans:wght@400;500;600;700",
    "Work Sans": "Work+Sans:wght@400;500;600;700",
    "IBM Plex Sans": "IBM+Plex+Sans:wght@400;500;600;700",
    "Space Grotesk": "Space+Grotesk:wght@400;500;600;700",
    "Figtree": "Figtree:wght@400;500;600;700",
    "Karla": "Karla:wght@400;500;600;700"
  }
};
window.ACE_DEFAULT_CONTENT = {
  theme: {
    mode: "auto",
    font_display: "Michroma",
    font_body: "Archivo",
    uppercase_titles: true,
    light_bg: "#EDEDEC", light_text: "#000000",
    dark_bg: "#0A0A0A", dark_text: "#F2F2F2",
    photo_bg: "#C6C6C4",
    button_radius: 2,
    watermark: true, watermark_opacity: 4.5,
    animations: true
  },
  brand: {
    logo_word_light: "/logo-word-black.png", logo_word_dark: "/logo-word-white.png",
    logo_full_light: "/logo-full-black.png", logo_full_dark: "/logo-full-white.png",
    favicon: "/icon.png"
  },
  announcement: { show: false, text: "Free delivery in Beirut this week" },
  hero: {
    show: true,
    image: "/hero.jpg",
    image_mobile: "",
    text: "Training and match-day wear for footballers. Tees, shorts, hoodies, socks and winter gloves in black and white.",
    button: "Shop the collection"
  },
  collection: {
    title: "The collection",
    all_label: "All", tops_label: "Tops", bottoms_label: "Bottoms", accessories_label: "Socks & gloves",
    empty_text: "New pieces are coming soon."
  },
  details: {
    show: true,
    title: "Performance in every detail",
    lead: "Same mindset, different environment. Every piece carries the ACE mark, from the collar of the tee to the palm of the gloves.",
    tiles: [
      { image: "/tile-tee.jpg", image2: "", title: "The collar", text: "Built for athletes, printed inside the neck.", wide: false },
      { image: "/tile-gloves.jpg", image2: "", title: "Grip palms", text: "A grip pattern across the palm and fingers.", wide: false },
      { image: "/tile-shorts.jpg", image2: "", title: "The shorts", text: "Drawstring waist, side pockets, mark on the leg.", wide: true },
      { image: "/tile-socks-w.jpg", image2: "/tile-socks-b.jpg", title: "The socks", text: "Mid-calf, made to sit under your shin pads.", wide: true }
    ]
  },
  store: {
    show: true,
    title: "The ACE store",
    text: "Our first store is opening soon. Try every piece on, pick your size and take it straight to the pitch.",
    image: "",
    caption: "Store photos coming soon",
    button: "Ask us on WhatsApp"
  },
  footer: { copyright: "© 2026 ACE. All rights reserved." },
  checkout: {
    button: "Complete order on WhatsApp",
    done_title: "Order received",
    done_text: "WhatsApp should have opened with your order. Press send there so we can confirm your delivery and payment."
  },
  seo: {
    title: "ACE — Built for athletes",
    description: "ACE sportswear for footballers. Tees, shorts, hoodies, socks and winter gloves in black and white."
  }
};
window.aceMerge = function merge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === "object") {
    const out = {};
    for (const k of Object.keys(base)) out[k] = merge(base[k], over ? over[k] : undefined);
    if (over && typeof over === "object") for (const k of Object.keys(over)) if (!(k in base)) out[k] = over[k];
    return out;
  }
  return over === undefined || over === null ? base : over;
};
