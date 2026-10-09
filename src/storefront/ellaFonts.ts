/**
 * Web fonts for the public store, added as <link> tags.
 *
 * They used to be `@import url(...)` lines at the top of ella-storefront.css
 * and ella-home.css. Vite joins both files into one stylesheet for the store
 * chunk, which puts the second @import after other rules; browsers drop an
 * @import that is not first, so the fonts never loaded and the store fell
 * back to Georgia / Arial.
 *
 * Pairing: Playfair Display (headings) + Mulish (text, prices, labels).
 * Playfair's high-contrast serif is the look most ethnic and occasion-wear
 * stores use for headings, and unlike Cormorant Garamond its strokes stay
 * readable at card and phone sizes. Mulish is a clean, open sans that reads
 * well at 11–13px for labels and keeps numbers (prices, sizes) clear.
 */
const STORE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Mulish:wght@400;500;600;700&display=swap";

function addLink(id: string, attrs: Record<string, string>): void {
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  Object.entries(attrs).forEach(([k, v]) => link.setAttribute(k, v));
  document.head.appendChild(link);
}

export function ensureStoreFonts(): void {
  if (typeof document === "undefined") return;
  addLink("ella-fonts-preconnect", { rel: "preconnect", href: "https://fonts.googleapis.com" });
  addLink("ella-fonts-preconnect-static", {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossorigin: "anonymous",
  });
  addLink("store-fonts", { rel: "stylesheet", href: STORE_FONTS_HREF });
}

/** Ella'Noor uses the same pairing; kept as its own entry point for StorefrontApp. */
export function ensureEllaFonts(): void {
  ensureStoreFonts();
}
