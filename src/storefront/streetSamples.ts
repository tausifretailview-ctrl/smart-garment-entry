/**
 * Sample content for the Street theme, so a store never looks empty while it is
 * being set up: drawn garment pictures for products that have no photo yet, and
 * a sample catalogue when the shop has not published any product.
 *
 * Every picture is drawn here as a small SVG (no stock photos, nothing fetched)
 * and carries a "Sample image" caption, so nobody mistakes it for the real item.
 * Real photos and products replace all of it as soon as the shop adds them.
 */
import type { PublicStorefrontProduct } from "@/lib/websiteTypes";

export type StreetSampleKind = "tshirt" | "shirt" | "jacket" | "jeans" | "trousers" | "kurta" | "shoes";

const BACKDROPS = ["#ece7df", "#e3e8ee", "#e6ebe3", "#efe5e2", "#e7e4ee", "#ebebeb"];
const FABRICS = ["#22262e", "#7a2e1d", "#234a8a", "#1f5c3d", "#b5651d", "#5b3a86", "#8c1c2c", "#4b5563"];
const DENIMS = ["#3f6ea5", "#27496d", "#6f9bc4", "#1f2f46"];
const SHADE = "rgba(0,0,0,.22)";
const LIGHT = "rgba(255,255,255,.3)";

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** Which garment to draw, from the product's name and category. */
export function streetSampleKind(name: string | null | undefined, category?: string | null): StreetSampleKind {
  const text = `${name || ""} ${category || ""}`.toLowerCase();
  if (/jean|denim pant/.test(text)) return "jeans";
  if (/\bt[\s-]?shirts?\b|\btees?\b|polo/.test(text)) return "tshirt";
  if (/jacket|hoodie|blazer|coat|sweat|sweater/.test(text)) return "jacket";
  if (/shirt/.test(text)) return "shirt";
  if (/trouser|pant|chino|cargo|jogger|short|legging|pyjama|bottom/.test(text)) return "trousers";
  if (/kurta|kurti|dress|gown|frock|suit|saree|lehenga|top\b|set\b/.test(text)) return "kurta";
  if (/shoe|sneaker|sandal|slipper|chappal|footwear|boot|loafer/.test(text)) return "shoes";
  return "tshirt";
}

function garment(kind: StreetSampleKind, c: string): string {
  switch (kind) {
    case "shirt":
      return (
        `<path d="M215 200 265 178 300 215 335 178 385 200 455 270 478 560 432 566 398 330 394 640H206L202 330 168 566 122 560 145 270Z" fill="${c}"/>` +
        `<path d="M265 178 300 215 282 236ZM335 178 300 215 318 236Z" fill="${LIGHT}"/>` +
        `<path d="M300 215V640" stroke="${SHADE}" stroke-width="3"/>` +
        [270, 340, 410, 480, 550].map((y) => `<circle cx="300" cy="${y}" r="5" fill="${LIGHT}"/>`).join("") +
        `<rect x="326" y="292" width="46" height="52" fill="none" stroke="${SHADE}" stroke-width="3"/>`
      );
    case "jacket":
      return (
        `<path d="M205 190 262 165 300 190 338 165 395 190 468 265 488 590 436 596 406 340 404 650H196L194 340 164 596 112 590 132 265Z" fill="${c}"/>` +
        `<path d="M262 165 300 190 338 165 352 206 300 230 248 206Z" fill="${LIGHT}"/>` +
        `<path d="M300 230V650" stroke="${LIGHT}" stroke-width="5"/>` +
        `<path d="M196 628H404V650H196Z" fill="${SHADE}"/>` +
        `<path d="M226 470 262 512M374 470 338 512" stroke="${SHADE}" stroke-width="4"/>`
      );
    case "jeans":
      return (
        `<path d="M205 150H395L425 690H330L300 330 270 690H175Z" fill="${c}"/>` +
        `<path d="M205 150H395V184H205Z" fill="${SHADE}"/>` +
        `<path d="M216 184Q236 242 264 184M336 184Q364 242 384 184M300 184V300" fill="none" stroke="${LIGHT}" stroke-width="3"/>` +
        `<path d="M178 672H272M328 672H422" stroke="${LIGHT}" stroke-width="3"/>`
      );
    case "trousers":
      return (
        `<path d="M212 150H388L408 690H322L300 320 278 690H192Z" fill="${c}"/>` +
        `<path d="M212 150H388V180H212Z" fill="${SHADE}"/>` +
        `<path d="M246 190 233 690M354 190 367 690" stroke="${LIGHT}" stroke-width="3"/>` +
        `<path d="M222 190 244 232M378 190 356 232" stroke="${SHADE}" stroke-width="3"/>`
      );
    case "kurta":
      return (
        `<path d="M235 160 268 150Q300 185 332 150L365 160 430 300 395 322 372 285 420 680H180L228 285 205 322 170 300Z" fill="${c}"/>` +
        `<path d="M300 172V310" stroke="${LIGHT}" stroke-width="4"/>` +
        [200, 235, 270].map((y) => `<circle cx="300" cy="${y}" r="4" fill="${LIGHT}"/>`).join("") +
        `<path d="M184 660H416" stroke="${LIGHT}" stroke-width="4"/>`
      );
    case "shoes":
      return (
        `<path d="M118 470V398Q140 352 204 366L300 396Q384 420 470 438 504 446 504 482V470Z" fill="${c}"/>` +
        `<path d="M118 470H504V500Q504 524 476 524H118Z" fill="#f7f7f7" stroke="${SHADE}" stroke-width="3"/>` +
        `<path d="M222 372 246 410M258 384 282 420M294 394 318 430" stroke="${LIGHT}" stroke-width="5"/>` +
        `<path d="M118 436H180" stroke="${LIGHT}" stroke-width="5"/>`
      );
    default:
      return (
        `<path d="M205 215 262 185Q300 222 338 185L395 215 470 285 425 335 392 308V610Q300 625 208 610V308L175 335 130 285Z" fill="${c}"/>` +
        `<path d="M262 185Q300 222 338 185" fill="none" stroke="${LIGHT}" stroke-width="6"/>`
      );
  }
}

/** A drawn garment on a soft backdrop, as a data: URI usable anywhere a photo URL is. */
export function streetSampleImage(kind: StreetSampleKind, seed: string): string {
  const h = hash(seed);
  const backdrop = BACKDROPS[h % BACKDROPS.length];
  const palette = kind === "jeans" ? DENIMS : FABRICS;
  // Mix the bits first: ids that differ only in their last character must not share a colour.
  const colour = palette[(Math.imul(h, 2654435761) >>> 24) % palette.length];
  const floorY = kind === "shoes" ? 540 : 706;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">` +
    `<rect width="600" height="800" fill="${backdrop}"/>` +
    `<ellipse cx="300" cy="${floorY}" rx="170" ry="16" fill="rgba(0,0,0,.08)"/>` +
    garment(kind, colour) +
    `<text x="300" y="770" fill="rgba(0,0,0,.42)" font-family="Arial,sans-serif" font-size="19" letter-spacing="3" text-anchor="middle">SAMPLE IMAGE</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function isStreetSampleImage(src: string | null | undefined): boolean {
  return typeof src === "string" && src.startsWith("data:image/svg+xml") && src.includes("SAMPLE%20IMAGE");
}

const SAMPLE_PREFIX = "street-sample-";

export function isStreetSampleProductId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(SAMPLE_PREFIX);
}

const SAMPLE_ROWS: Array<{ name: string; category: string; price: number; sizes?: string[] }> = [
  { name: "Oxford Cotton Shirt", category: "Shirts", price: 1299 },
  { name: "Classic Crew Tee", category: "T-Shirts", price: 599 },
  { name: "Slim Fit Jeans", category: "Jeans", price: 1799, sizes: ["30", "32", "34", "36"] },
  { name: "Bomber Jacket", category: "Jackets", price: 2999 },
  { name: "Relaxed Linen Shirt", category: "Shirts", price: 1499 },
  { name: "Oversized Graphic Tee", category: "T-Shirts", price: 799 },
  { name: "Straight Fit Jeans", category: "Jeans", price: 1999, sizes: ["30", "32", "34", "36"] },
  { name: "Tapered Chinos", category: "Trousers", price: 1499, sizes: ["30", "32", "34", "36"] },
  { name: "Denim Jacket", category: "Jackets", price: 2499 },
  { name: "Pleated Trousers", category: "Trousers", price: 1699, sizes: ["30", "32", "34", "36"] },
  { name: "Everyday Kurta", category: "Kurtas", price: 1199 },
  { name: "Canvas Sneakers", category: "Footwear", price: 1899, sizes: ["7", "8", "9", "10"] },
];

/**
 * Catalogue shown only while the shop has published no product at all, so the theme can be
 * seen working. The ids are not real products: the store never lets these be ordered.
 */
export function streetSampleCatalogue(): PublicStorefrontProduct[] {
  return SAMPLE_ROWS.map((row, i) => {
    const id = `${SAMPLE_PREFIX}${i + 1}`;
    const fresh = i < 4;
    return {
      id,
      product_id: id,
      name: row.name,
      description: "Sample product, shown until the shop adds its own.",
      brand: null,
      category: row.category,
      display_order: i,
      display_price: row.price,
      photo_urls: [],
      stock_status: "in_stock",
      stock_left: null,
      section_slug: fresh ? "new-arrival" : null,
      section_label: fresh ? "New Arrival" : null,
      variants: (row.sizes || ["S", "M", "L", "XL"]).map((size, k) => ({
        id: `${id}-${k}`,
        size,
        color: null,
        display_price: row.price,
        stock_status: "in_stock" as const,
        stock_left: null,
      })),
    };
  });
}
