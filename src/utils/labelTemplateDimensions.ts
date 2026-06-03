/** Parse "50*38", "50x38", "50×38" from a template or preset name. */
export function parseLabelSizeFromTemplateName(
  name: string,
): { width?: number; height?: number } {
  const m = name.match(/(\d{2,3})\s*[x×*]\s*(\d{2,3})/i);
  if (!m) return {};
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return {};
  }
  return { width, height };
}

export function resolveTemplateLabelDimensions(
  template: { name: string; labelWidth?: number; labelHeight?: number },
): { width: number; height: number } | null {
  if (template.labelWidth && template.labelHeight) {
    return { width: template.labelWidth, height: template.labelHeight };
  }
  const parsed = parseLabelSizeFromTemplateName(template.name);
  if (parsed.width && parsed.height) {
    return { width: parsed.width, height: parsed.height };
  }
  return null;
}
