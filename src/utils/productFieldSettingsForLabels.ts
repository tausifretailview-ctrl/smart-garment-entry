import type { FieldKey } from "@/types/labelTypes";
import type { ProductFieldKey } from "@/hooks/useSettings";

export type ProductFieldsConfig = Partial<
  Record<ProductFieldKey, { label?: string; enabled?: boolean }>
>;

/** Label designer fields controlled by Settings → Product Entry Form Fields */
export const LABEL_FIELD_TO_PRODUCT_SETTING: Partial<Record<FieldKey, ProductFieldKey>> = {
  category: "category",
  brand: "brand",
  style: "style",
  color: "color",
};

export function isProductFieldEnabled(
  productKey: ProductFieldKey,
  fields: ProductFieldsConfig | null | undefined,
): boolean {
  if (!fields) return true;
  return fields[productKey]?.enabled !== false;
}

export function getProductFieldLabel(
  productKey: ProductFieldKey,
  defaultLabel: string,
  fields: ProductFieldsConfig | null | undefined,
): string {
  const custom = fields?.[productKey]?.label;
  return custom && typeof custom === "string" && custom.trim() ? custom.trim() : defaultLabel;
}

/** Whether a label-designer field should appear (list + preview + print). */
export function isLabelFieldAllowedByProductSettings(
  fieldKey: FieldKey,
  fields: ProductFieldsConfig | null | undefined,
): boolean {
  const productKey = LABEL_FIELD_TO_PRODUCT_SETTING[fieldKey];
  if (!productKey) return true;
  return isProductFieldEnabled(productKey, fields);
}

export function getLabelFieldDisplayLabel(
  fieldKey: FieldKey,
  defaultLabel: string,
  fields: ProductFieldsConfig | null | undefined,
): string {
  const productKey = LABEL_FIELD_TO_PRODUCT_SETTING[fieldKey];
  if (!productKey) return defaultLabel;
  return getProductFieldLabel(productKey, defaultLabel, fields);
}

export function filterLabelFieldKeys(
  fieldKeys: FieldKey[],
  fields: ProductFieldsConfig | null | undefined,
): FieldKey[] {
  return fieldKeys.filter((key) => isLabelFieldAllowedByProductSettings(key, fields));
}

export function buildLabelDesignerFieldLabels<T extends Record<FieldKey, string>>(
  defaultLabels: T,
  fields: ProductFieldsConfig | null | undefined,
): T {
  const out = { ...defaultLabels };
  (Object.keys(LABEL_FIELD_TO_PRODUCT_SETTING) as FieldKey[]).forEach((fieldKey) => {
    const productKey = LABEL_FIELD_TO_PRODUCT_SETTING[fieldKey];
    if (productKey) {
      out[fieldKey] = getProductFieldLabel(productKey, defaultLabels[fieldKey], fields) as T[FieldKey];
    }
  });
  return out;
}
