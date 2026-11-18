/**
 * 360° product spin for the public store (Street theme product page).
 *
 * The shop uploads photos taken around a product (turn it a little between each shot); the
 * product page shows them as one picture the shopper drags to rotate. Frames are saved in order
 * on website_products.spin_urls (20270503120000) and read by the store with the same public
 * policy as the listing's other details.
 */
import type { PublicStorefrontProduct } from "@/lib/websiteTypes";

/** Fewer photos than this does not read as a turn, so no spin is shown. */
export const SPIN_MIN_FRAMES = 6;
export const SPIN_MAX_FRAMES = 36;
/** Longest side of an uploaded frame: sharp enough on a phone, light enough to load 36 of them. */
export const SPIN_FRAME_MAX_PX = 1000;

/** Saved frames → clean https list, capped. Anything else is dropped. */
export function cleanSpinUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const urls: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const url = item.trim();
    if (/^https:\/\/[^\s"'<>]+$/i.test(url) && url.length <= 600) urls.push(url);
    if (urls.length >= SPIN_MAX_FRAMES) break;
  }
  return urls;
}

/** True when a product has enough frames to show the spin. */
export function hasProductSpin(frames: string[] | null | undefined): boolean {
  return (frames?.length ?? 0) >= SPIN_MIN_FRAMES;
}

/**
 * The frame to show while dragging: dragging across the whole picture is one full turn.
 * Dragging left turns the product the way the photos were taken; it wraps around both ways.
 */
export function spinFrameIndex(startIndex: number, dragPx: number, widthPx: number, count: number): number {
  if (count <= 0) return 0;
  const width = Math.max(1, widthPx);
  const steps = Math.round((-dragPx / width) * count);
  return (((startIndex + steps) % count) + count) % count;
}

/** One step with the arrow keys or buttons. */
export function spinStep(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + delta) % count) + count) % count;
}

/**
 * Picked files in shooting order: by the number in the file name when every name has one
 * (IMG_0012.jpg before IMG_0101.jpg), otherwise by name. Non-images are left out.
 */
export function sortSpinFiles<T extends { name: string; type: string }>(files: T[]): T[] {
  const images = files.filter((f) => f.type.startsWith("image/"));
  const lastNumber = (name: string) => {
    const all = name.replace(/\.[^.]+$/, "").match(/\d+/g);
    return all ? Number(all[all.length - 1]) : NaN;
  };
  const numbered = images.every((f) => Number.isFinite(lastNumber(f.name)));
  return [...images]
    .sort((a, b) =>
      numbered && lastNumber(a.name) !== lastNumber(b.name)
        ? lastNumber(a.name) - lastNumber(b.name)
        : a.name.localeCompare(b.name, undefined, { numeric: true }),
    )
    .slice(0, SPIN_MAX_FRAMES);
}

/** Why the picked photos cannot be used as a spin, or null when they can. */
export function spinFilesProblem(count: number): string | null {
  if (count < SPIN_MIN_FRAMES) {
    return `Choose at least ${SPIN_MIN_FRAMES} photos taken around the product (12 to 24 turns smoothly).`;
  }
  return null;
}

/** Add each listing's spin frames to the public payload's products (keyed by website_products.id). */
export function applyProductSpins(
  products: PublicStorefrontProduct[],
  rows: Array<{ id: string; spin_urls?: unknown }>,
): PublicStorefrontProduct[] {
  if (rows.length === 0) return products;
  const byId = new Map(rows.map((row) => [row.id, cleanSpinUrls(row.spin_urls)]));
  return products.map((product) => {
    const frames = byId.get(product.id);
    return frames && hasProductSpin(frames) ? { ...product, spin_urls: frames } : product;
  });
}

/** True when the spin_urls column has not been added yet. */
export function isMissingSpinColumn(message: string | null | undefined): boolean {
  const text = String(message || "");
  return /spin_urls/i.test(text) && /(column|schema cache|PGRST204|42703)/i.test(text);
}
