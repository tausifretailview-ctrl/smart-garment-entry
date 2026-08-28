const STORAGE_PREFIX = "product_entry_unsaved_draft_v1_";
export const PRODUCT_ENTRY_UNSAVED_DRAFT_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export type ProductEntryUnsavedDraft = {
  v: 1;
  savedAt: number;
  formData: Record<string, unknown>;
  colorInput: string;
  markupPercent: string;
  selectedSizes: string[];
  disabledSizes: string[];
  customSizes: string[];
  customSizeInput: string;
  variants: unknown[];
  showVariants: boolean;
  mobileERPQty: number;
  colorRollLengths: Record<string, string>;
  rollWiseMtrEnabled: boolean;
};

export function productEntryUnsavedDraftStorageKey(orgId: string): string {
  return `${STORAGE_PREFIX}${orgId}`;
}

export function productEntryDraftIsMeaningful(draft: {
  formData?: Record<string, unknown> | null;
  variants?: unknown[];
  selectedSizes?: string[];
  customSizes?: string[];
  colorInput?: string;
}): boolean {
  const form = draft.formData || {};
  const textFields = ["product_name", "category", "brand", "style", "hsn_code"];
  if (textFields.some((key) => String(form[key] || "").trim().length > 0)) return true;
  if (Array.isArray(form.colors) && form.colors.some((c) => String(c || "").trim())) return true;
  if ((draft.selectedSizes || []).length > 0) return true;
  if ((draft.customSizes || []).length > 0) return true;
  if (String(draft.colorInput || "").trim()) return true;
  const prices = [
    form.default_pur_price,
    form.default_sale_price,
    form.default_mrp,
  ];
  if (prices.some((n) => Number(n) > 0)) return true;
  return (draft.variants || []).some((row) => {
    if (!row || typeof row !== "object") return false;
    const v = row as Record<string, unknown>;
    return (
      String(v.barcode || "").trim().length > 0 ||
      Number(v.purchase_qty) > 0 ||
      Number(v.opening_qty) > 0 ||
      Number(v.pur_price) > 0 ||
      Number(v.sale_price) > 0
    );
  });
}

export function parseProductEntryUnsavedDraft(
  raw: string | null,
  nowMs: number = Date.now(),
): ProductEntryUnsavedDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProductEntryUnsavedDraft;
    if (!parsed || parsed.v !== 1 || typeof parsed.savedAt !== "number") return null;
    if (nowMs - parsed.savedAt > PRODUCT_ENTRY_UNSAVED_DRAFT_MAX_AGE_MS) return null;
    if (!parsed.formData || typeof parsed.formData !== "object") return null;
    if (!productEntryDraftIsMeaningful(parsed)) return null;
    return {
      v: 1,
      savedAt: parsed.savedAt,
      formData: parsed.formData,
      colorInput: String(parsed.colorInput || ""),
      markupPercent: String(parsed.markupPercent || ""),
      selectedSizes: Array.isArray(parsed.selectedSizes) ? parsed.selectedSizes.map(String) : [],
      disabledSizes: Array.isArray(parsed.disabledSizes) ? parsed.disabledSizes.map(String) : [],
      customSizes: Array.isArray(parsed.customSizes) ? parsed.customSizes.map(String) : [],
      customSizeInput: String(parsed.customSizeInput || ""),
      variants: Array.isArray(parsed.variants) ? parsed.variants : [],
      showVariants: parsed.showVariants === true,
      mobileERPQty: Number(parsed.mobileERPQty) > 0 ? Number(parsed.mobileERPQty) : 1,
      colorRollLengths:
        parsed.colorRollLengths && typeof parsed.colorRollLengths === "object"
          ? parsed.colorRollLengths
          : {},
      rollWiseMtrEnabled: parsed.rollWiseMtrEnabled === true,
    };
  } catch {
    return null;
  }
}

export function readProductEntryUnsavedDraft(
  orgId: string | null | undefined,
  nowMs: number = Date.now(),
): ProductEntryUnsavedDraft | null {
  if (!orgId) return null;
  try {
    return parseProductEntryUnsavedDraft(
      localStorage.getItem(productEntryUnsavedDraftStorageKey(orgId)),
      nowMs,
    );
  } catch {
    return null;
  }
}

export function writeProductEntryUnsavedDraft(
  orgId: string,
  draft: ProductEntryUnsavedDraft,
): void {
  if (!productEntryDraftIsMeaningful(draft)) return;
  try {
    localStorage.setItem(
      productEntryUnsavedDraftStorageKey(orgId),
      JSON.stringify({ ...draft, v: 1 as const, savedAt: draft.savedAt }),
    );
  } catch {
    // quota / private mode
  }
}

export function clearProductEntryUnsavedDraft(orgId: string | null | undefined): void {
  if (!orgId) return;
  try {
    localStorage.removeItem(productEntryUnsavedDraftStorageKey(orgId));
  } catch {
    // ignore
  }
}

export function restoredProductVariantLockMatches(
  lock: {
    sizeGroupId: string;
    colorsKey: string;
    customSizesKey: string;
    mobileERPQty: number;
  } | null,
  current: {
    sizeGroupId: string;
    colors: unknown[];
    customSizes: unknown[];
    mobileERPQty: number;
  },
): boolean {
  if (!lock) return false;
  return (
    lock.sizeGroupId === current.sizeGroupId &&
    lock.colorsKey === JSON.stringify(current.colors || []) &&
    lock.customSizesKey === JSON.stringify(current.customSizes || []) &&
    lock.mobileERPQty === current.mobileERPQty
  );
}
