/* ACE site content defaults. The admin "Online store" editor saves changes on top of these. */
window.ACE_FONTS = {
  display: {
    "Inter Tight": "Inter+Tight:wght@500;600;700;800",
    "Anton": "Anton",
    "Archivo Black": "Archivo+Black",
    "Archivo Expanded": "Archivo:wdth,wght@110..125,600..800",
    "Barlow Condensed": "Barlow+Condensed:wght@500;600;700",
    "Bebas Neue": "Bebas+Neue",
    "Oswald": "Oswald:wght@400;500;600;700",
    "Saira Condensed": "Saira+Condensed:wght@500;600;700",
    "Teko": "Teko:wght@500;600;700",
    "Chakra Petch": "Chakra+Petch:wght@500;600;700",
    "Rajdhani": "Rajdhani:wght@500;600;700",
    "Space Grotesk": "Space+Grotesk:wght@500;600;700",
    "Sora": "Sora:wght@500;600;700;800",
    "Unbounded": "Unbounded:wght@400;600;800",
    "Michroma": "Michroma",
    "Orbitron": "Orbitron:wght@500;700;900",
    "Syncopate": "Syncopate:wght@400;700",
    "Montserrat": "Montserrat:wght@600;700;800",
    "Plus Jakarta Sans": "Plus+Jakarta+Sans:wght@600;700;800",
    "Schibsted Grotesk": "Schibsted+Grotesk:wght@500;600;700;800",
    "Instrument Sans": "Instrument+Sans:wght@500;600;700",
    "Manrope": "Manrope:wght@600;700;800",
    "Playfair Display": "Playfair+Display:wght@500;600;700"
  },
  body: {
    "Inter": "Inter:wght@300;400;500;600;700",
    "Inter Tight": "Inter+Tight:wght@300;400;500;600;700",
    "Archivo": "Archivo:wdth,wght@100..125,300..700",
    "Manrope": "Manrope:wght@300;400;500;600;700",
    "DM Sans": "DM+Sans:wght@300;400;500;600;700",
    "Work Sans": "Work+Sans:wght@300;400;500;600;700",
    "IBM Plex Sans": "IBM+Plex+Sans:wght@300;400;500;600;700",
    "Space Grotesk": "Space+Grotesk:wght@300;400;500;600;700",
    "Figtree": "Figtree:wght@300;400;500;600;700",
    "Karla": "Karla:wght@300;400;500;600;700",
    "Hanken Grotesk": "Hanken+Grotesk:wght@300;400;500;600;700",
    "Public Sans": "Public+Sans:wght@300;400;500;600;700",
    "Onest": "Onest:wght@300;400;500;600;700",
    "Schibsted Grotesk": "Schibsted+Grotesk:wght@300;400;500;600;700",
    "Instrument Sans": "Instrument+Sans:wght@400;500;600;700",
    "Plus Jakarta Sans": "Plus+Jakarta+Sans:wght@300;400;500;600;700",
    "Sora": "Sora:wght@300;400;500;600",
    "Barlow": "Barlow:wght@300;400;500;600;700",
    "Roboto Condensed": "Roboto+Condensed:wght@300;400;500;600;700",
    "Outfit": "Outfit:wght@300;400;500;600;700"
  }
};
window.ACE_DEFAULT_CONTENT = {
  theme: {
    mode: "light",
    font_display: "Inter Tight",
    font_body: "Inter",
    uppercase_titles: true,
    light_bg: "#F4F3F1", light_text: "#000000",
    dark_bg: "#0B0B0B", dark_text: "#F2F2F2",
    photo_bg: "#E7E5E2",
    button_radius: 0,
    watermark: true, watermark_opacity: 2,
    animations: true
  },
  brand: {
    logo_word_light: "/logo-word-black.png", logo_word_dark: "/logo-word-white.png",
    logo_full_light: "/logo-full-black.png", logo_full_dark: "/logo-full-white.png",
    favicon: "/icon.png"
  },
  announcement: { show: false, text: "", items: [], interval: 5 },
  hero: {
    show: true,
    image: "/hero.jpg",
    image_mobile: "",
    text: "Training and match-day wear for footballers. Tees, shorts, hoodies, socks and winter gloves in black and white.",
    button: "Shop the collection"
  },
  collection: {
    title: "The collection",
    all_label: "All", sale_label: "Discounts",
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
  product: {
    show_reviews: true,
    reviews_title: "Reviews",
    related_title: "Complete the look",
    confirm_text: "Order confirmation sent to your email",
    size_guide: "Not sure about your size?\n\nIf you're between two sizes, pick the bigger one for a relaxed fit or the smaller one for a closer fit.\n\nStill unsure? Reply to your order confirmation email or message us, tell us your height and weight, and we'll recommend a size.",
    returns_text: "We deliver across Lebanon. Your order confirmation and delivery details are sent to your email.\n\nFor an exchange or a return, reply to your confirmation email and we'll help you."
  },
  coming_soon: {
    on: false,
    title: "ACE",
    tagline: "Built for athletes",
    headline: "Coming soon.",
    text: "Our first collection lands soon. Join the list for early access and first pick of sizes.",
    button: "Get early access",
    success_title: "You're on the list",
    success_text: "We'll message you the moment we launch, before anyone else.",
    note: "We only use this to tell you when we launch.",
    logo_size: 62,
    logo_opacity: 8,
    background: "",
    overlay: 45,
    dark: true,
    ask_size: true,
    ask_sport: true,
    ask_notes: false,
    sizes: "S, M, L, XL, XXL",
    sports: "Football, Padel, Gym, Other",
    show_socials: true
  },
  story: {
    show: true,
    kicker: "Our story",
    title: "Built for athletes, by athletes",
    text: "ACE started on a floodlit pitch in Lebanon, with a simple idea: kit that holds up to real training, without the noise. Every piece is tested on the pitch before it reaches the store.",
    button: "Read our story",
    image: "",
    layout: "image_left",
    image_width: 50,
    image_ratio: "4/5",
    full_text: "ACE started on a floodlit pitch in Lebanon.\n\nWe were playing five or six nights a week, and the kit we could buy locally was either overpriced or fell apart after a season. So we started making our own: a tee that keeps its shape, shorts that move with you, socks that sit right under the shin pads, and gloves for those cold January games.\n\nEvery piece is tested on the pitch before it reaches the store. If it doesn't survive a full season with us, it doesn't get made.\n\nSame mindset, different environment."
  },
  bundles: { title: "Sets & bundles", text: "Buy the set and save." },
  footer: { copyright: "© 2026 ACE. All rights reserved." },
  checkout: {
    button: "Complete order",
    review_title: "Review your order",
    review_text: "Please check everything before you confirm.",
    confirm_button: "Confirm order",
    done_title: "Your order has been completed",
    done_text: "Thank you for shopping with ACE. We've emailed you a copy of this confirmation."
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
