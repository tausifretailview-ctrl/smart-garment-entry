/**
 * Product photos for reports, PDFs and the Field Sales app.
 *
 * products.image_url is the main photo (set when the first photo is uploaded); product_images
 * holds the gallery. Reports show a photo only for products that have one — when no product on
 * the screen has a photo the image column is left out and the layout is unchanged.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchInIdBatches } from "@/lib/data/fetchInIdBatches";

/** True for a real http(s) / data image URL (never javascript: etc.). */
export function isUsableImageUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const u = url.trim();
  return /^https?:\/\//i.test(u) || /^data:image\//i.test(u) || /^blob:/i.test(u);
}

/** Main photo per product: products.image_url, else the first gallery photo. */
export async function fetchProductImageMap(orgId: string, productIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  const out = new Map<string, string>();
  if (!orgId || ids.length === 0) return out;
  const main = await fetchInIdBatches<{ id: string; image_url: string | null }>(ids, (batch) =>
    supabase
      .from("products")
      .select("id, image_url")
      .eq("organization_id", orgId)
      .in("id", batch)
      .order("id") as never,
  );
  for (const p of main) if (isUsableImageUrl(p.image_url)) out.set(p.id, p.image_url.trim());
  const missing = ids.filter((id) => !out.has(id));
  if (missing.length > 0) {
    try {
      const gallery = await fetchInIdBatches<{ id: string; product_id: string; image_url: string; display_order: number | null }>(
        missing,
        (batch) =>
          supabase
            .from("product_images")
            .select("id, product_id, image_url, display_order")
            .eq("organization_id", orgId)
            .in("product_id", batch)
            .order("id") as never,
      );
      const best = new Map<string, { url: string; order: number }>();
      for (const g of gallery) {
        if (!isUsableImageUrl(g.image_url)) continue;
        const order = g.display_order ?? 0;
        const cur = best.get(g.product_id);
        if (!cur || order < cur.order) best.set(g.product_id, { url: g.image_url.trim(), order });
      }
      best.forEach((v, k) => out.set(k, v.url));
    } catch {
      /* gallery is optional */
    }
  }
  return out;
}

export type PdfImage = { dataUrl: string; width: number; height: number };

const pdfImageCache = new Map<string, Promise<PdfImage | null>>();

/**
 * A photo as a small JPEG data URL for jsPDF (longest side `maxPx`), or null when it cannot be
 * loaded (missing file, blocked by the network). A report never fails because of a photo.
 */
export function loadImageForPdf(url: string, maxPx = 240): Promise<PdfImage | null> {
  if (!isUsableImageUrl(url) || typeof document === "undefined") return Promise.resolve(null);
  const key = `${maxPx}|${url}`;
  const cached = pdfImageCache.get(key);
  if (cached) return cached;
  const job = (async (): Promise<PdfImage | null> => {
    try {
      const res = await fetch(url, { mode: "cors", cache: "force-cache" });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) return null;
      const objectUrl = URL.createObjectURL(blob);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error("image decode failed"));
          el.src = objectUrl;
        });
        const scale = Math.min(1, maxPx / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        return { dataUrl: canvas.toDataURL("image/jpeg", 0.82), width: w, height: h };
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      return null;
    }
  })();
  pdfImageCache.set(key, job);
  return job;
}

/** Load many photos, a few at a time; result keyed by URL (missing = could not load). */
export async function loadImagesForPdf(urls: string[], maxPx = 240, concurrency = 6): Promise<Map<string, PdfImage>> {
  const unique = [...new Set(urls.filter(isUsableImageUrl))];
  const out = new Map<string, PdfImage>();
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const url = unique[next++];
      const img = await loadImageForPdf(url, maxPx);
      if (img) out.set(url, img);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return out;
}

/** Fit an image into a w × h box (mm), centred; returns jsPDF addImage arguments. */
export function fitImageInBox(img: PdfImage, x: number, y: number, w: number, h: number) {
  const ratio = Math.min(w / img.width, h / img.height);
  const dw = img.width * ratio;
  const dh = img.height * ratio;
  return { x: x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh };
}
