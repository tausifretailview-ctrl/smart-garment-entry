export const VASTRAKALA_DEFAULT_TAGLINE = "Sarees & Ladies Wear";

/** First word = receipt title; remainder = tagline (sentence case). Avoids a long ERP name wrapping beside the logo. */
export function splitVastrakalaShopHeader(businessNameRaw: string): { title: string; tagline: string } {
  const normalized = (businessNameRaw || "STORE NAME").trim().replace(/\s+/g, " ");
  const parts = normalized.split(" ").filter(Boolean);
  const title = (parts[0] || "STORE").toUpperCase();
  const rest = parts.slice(1).join(" ").trim();
  if (!rest) {
    return { title, tagline: VASTRAKALA_DEFAULT_TAGLINE };
  }
  const tagline = rest
    .split(/\s+/)
    .map((w) => {
      if (w === "&") return "&";
      const lower = w.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
  return { title, tagline };
}

const PX_PER_MM = 96 / 25.4;

/**
 * Largest font size (px) at which `text` fits on one line in `availableMm`, clamped to
 * [minPx, maxPx]. `emPerChar` is the average glyph width in em (Arial bold caps ≈ 0.72,
 * plus a little for letter-spacing). Keeps a short name like "PAYAL" big while a long
 * one still fits beside the logo instead of wrapping.
 */
export function fitThermalHeaderFontPx(
  text: string,
  availableMm: number,
  { maxPx, minPx, emPerChar }: { maxPx: number; minPx: number; emPerChar: number },
): number {
  const chars = Math.max(1, (text || "").trim().length);
  const fit = Math.floor((availableMm * PX_PER_MM) / (chars * emPerChar));
  return Math.max(minPx, Math.min(maxPx, fit));
}
