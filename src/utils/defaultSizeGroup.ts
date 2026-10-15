/**
 * Settings > Product "Default Size Group" → what Add Product pre-selects.
 *
 * Settings has always shown "None" when the shop never saved this field, so an
 * unset value means "None" here too (the screen and Add Product agree).
 * "last" keeps the old behaviour: start from the last saved product's group.
 * Mobile ERP shops with locked sizes have no size group box, so an unset value
 * leaves them alone.
 */
export const NO_SIZE_GROUP_ID = "none";
export const LAST_USED_SIZE_GROUP = "last";

/** Size group id to pre-select, or null to keep the last product's group. */
export function resolveDefaultSizeGroupId(productSettings: unknown): string | null {
  const settings =
    productSettings && typeof productSettings === "object"
      ? (productSettings as {
          default_size_group?: unknown;
          mobile_erp?: { enabled?: unknown; locked_size_qty?: unknown } | null;
        })
      : undefined;
  const raw = settings?.default_size_group;
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === LAST_USED_SIZE_GROUP) return null;
  if (value) return value;
  const mobileErp = settings?.mobile_erp;
  if (mobileErp?.enabled === true && mobileErp.locked_size_qty !== false) return null;
  return NO_SIZE_GROUP_ID;
}

/** products.size_group_id to store: the "none" choice has no size group row. */
export function sizeGroupIdForSave(sizeGroupId: string | null | undefined): string | null {
  return sizeGroupId && sizeGroupId !== NO_SIZE_GROUP_ID ? sizeGroupId : null;
}
