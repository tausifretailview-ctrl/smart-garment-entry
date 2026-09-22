export const VASTRAKALA_DEFAULT_TAGLINE = "Sarees & ladies wear";

/** First word = receipt title; remainder = tagline (sentence case). Avoids a long ERP name wrapping beside the logo. */
export function splitVastrakalaShopHeader(businessNameRaw: string): { title: string; tagline: string } {
  const normalized = (businessNameRaw || "STORE NAME").trim().replace(/\s+/g, " ");
  const parts = normalized.split(" ").filter(Boolean);
  const title = (parts[0] || "STORE").toUpperCase();
  const rest = parts.slice(1).join(" ").trim();
  if (!rest) {
    return { title, tagline: VASTRAKALA_DEFAULT_TAGLINE };
  }
  const lower = rest.toLowerCase();
  const tagline = lower.charAt(0).toUpperCase() + lower.slice(1);
  return { title, tagline };
}
