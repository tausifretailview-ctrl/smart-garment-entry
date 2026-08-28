export type VariantSizeColor = {
  size?: string | null;
  color?: string | null;
};

export function summarizeVariantSizeColor(variants: VariantSizeColor[]) {
  const sizes = [
    ...new Set(variants.map((v) => (v.size ?? "").trim()).filter(Boolean)),
  ] as string[];
  const colors = [
    ...new Set(variants.map((v) => (v.color ?? "").trim()).filter(Boolean)),
  ] as string[];
  return {
    sizes,
    colors,
    sizesLabel: sizes.length > 0 ? sizes.join(", ") : "—",
    colorsLabel: colors.length > 0 ? colors.join(", ") : "—",
  };
}

export function aggregateVariantRows(
  rows: { product_id: string; size?: string | null; color?: string | null }[],
): Record<string, { sizesLabel: string; colorsLabel: string }> {
  const byProduct = new Map<string, VariantSizeColor[]>();
  for (const row of rows) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push({ size: row.size, color: row.color });
    byProduct.set(row.product_id, list);
  }
  return Object.fromEntries(
    [...byProduct.entries()].map(([productId, variants]) => {
      const summary = summarizeVariantSizeColor(variants);
      return [productId, { sizesLabel: summary.sizesLabel, colorsLabel: summary.colorsLabel }];
    }),
  );
}
