import type { MobilePurchaseBillFields, MobilePurchaseLine } from "@/utils/mobilePurchaseSave";

export const MOBILE_PURCHASE_DRAFT_KEY_PREFIX = "ezzy_mobile_purchase_draft_v1";

export type MobilePurchaseDraft = MobilePurchaseBillFields & {
  items: MobilePurchaseLine[];
  savedAt: number;
};

export function mobilePurchaseDraftStorageKey(organizationId: string, userId: string): string {
  return `${MOBILE_PURCHASE_DRAFT_KEY_PREFIX}:${organizationId}:${userId}`;
}

export function serializeMobilePurchaseDraft(draft: MobilePurchaseDraft): string {
  return JSON.stringify(draft);
}

export function parseMobilePurchaseDraft(raw: string | null): MobilePurchaseDraft | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as MobilePurchaseDraft;
    if (!data || !Array.isArray(data.items)) return null;
    return data;
  } catch {
    return null;
  }
}

export function readMobilePurchaseDraft(
  storage: Pick<Storage, "getItem">,
  organizationId: string,
  userId: string,
): MobilePurchaseDraft | null {
  if (!organizationId || !userId) return null;
  return parseMobilePurchaseDraft(storage.getItem(mobilePurchaseDraftStorageKey(organizationId, userId)));
}

export function writeMobilePurchaseDraft(
  storage: Pick<Storage, "setItem">,
  organizationId: string,
  userId: string,
  draft: MobilePurchaseDraft,
): void {
  storage.setItem(mobilePurchaseDraftStorageKey(organizationId, userId), serializeMobilePurchaseDraft(draft));
}

export function clearMobilePurchaseDraft(
  storage: Pick<Storage, "removeItem">,
  organizationId: string,
  userId: string,
): void {
  storage.removeItem(mobilePurchaseDraftStorageKey(organizationId, userId));
}

export function draftHasWork(draft: Pick<MobilePurchaseDraft, "items" | "supplierName" | "supplierId">): boolean {
  return draft.items.length > 0 || Boolean(draft.supplierId) || Boolean(draft.supplierName.trim());
}
