/**
 * Web fonts for the Ella'Noor store, added as <link> tags.
 *
 * They used to be `@import url(...)` lines at the top of ella-storefront.css
 * and ella-home.css. Vite joins both files into one stylesheet for the store
 * chunk, which puts the second @import after other rules; browsers drop an
 * @import that is not first, so Cormorant Garamond and Jost never loaded and
 * the store fell back to Georgia / Arial.
 */
const ELLA_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Jost:wght@300;400;500;600&family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap";

function addLink(id: string, attrs: Record<string, string>): void {
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  Object.entries(attrs).forEach(([k, v]) => link.setAttribute(k, v));
  document.head.appendChild(link);
}

export function ensureEllaFonts(): void {
  if (typeof document === "undefined") return;
  addLink("ella-fonts-preconnect", { rel: "preconnect", href: "https://fonts.googleapis.com" });
  addLink("ella-fonts-preconnect-static", {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossorigin: "anonymous",
  });
  addLink("ella-fonts", { rel: "stylesheet", href: ELLA_FONTS_HREF });
}
