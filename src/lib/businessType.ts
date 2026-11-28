/**
 * Business type (Settings → Product). Supermarket go-live, Nov 2026.
 *
 * EzzyERP grew up on garment / footwear shops: sizes, colours, styles, own barcodes. A
 * supermarket needs the opposite: no sizes or colours, the company barcode (EAN) scanned at
 * purchase, MRP on every item, loose items by KG. "Supermarket setup" switches the existing
 * settings that do this in one go; the shop can still change each of them afterwards.
 */
export type BusinessType = "garment" | "supermarket" | "general";

export const BUSINESS_TYPE_OPTIONS: ReadonlyArray<{ value: BusinessType; label: string }> = [
  { value: "garment", label: "Garment / footwear" },
  { value: "supermarket", label: "Supermarket / grocery" },
  { value: "general", label: "General retail" },
];

type FieldConfig = { label?: string; enabled?: boolean };
/** The parts of the settings row the preset touches (the rest is passed through as is). */
export type BusinessTypeSettings = {
  product_settings?: {
    business_type?: BusinessType;
    default_size_group?: string;
    fields?: { color?: FieldConfig; style?: FieldConfig };
  } | null;
  purchase_settings?: {
    barcode_mode?: "auto" | "scan";
    show_mrp?: boolean;
    track_batch_expiry?: boolean;
  } | null;
};

export function readBusinessType(settings: BusinessTypeSettings | null | undefined): BusinessType {
  const v = settings?.product_settings?.business_type;
  return v === "supermarket" || v === "general" ? v : "garment";
}

export function isSupermarket(settings: BusinessTypeSettings | null | undefined): boolean {
  return readBusinessType(settings) === "supermarket";
}

/** What "Supermarket setup" changes, in words, for the confirmation list. */
export const SUPERMARKET_SETUP_ITEMS = [
  "Add Product starts with no sizes",
  "Colour and Style fields switched off (Category, Brand and HSN stay)",
  "Purchase: scan the company barcode (EAN) instead of printing our own",
  "Purchase: MRP column on",
  "Purchase: batch no and expiry date on each line (expired stock warns at billing)",
  "Item import: supermarket sample sheet (EAN, MRP, KG items)",
] as const;

/**
 * The settings with the supermarket setup applied. Pure: returns a new object, the input is
 * not changed. Field labels the shop renamed are kept.
 */
export function applySupermarketSetup<T extends BusinessTypeSettings>(settings: T): T {
  const product = settings.product_settings ?? {};
  const fields = product.fields ?? {};
  const purchase = settings.purchase_settings ?? {};
  return {
    ...settings,
    product_settings: {
      ...product,
      business_type: "supermarket",
      default_size_group: "none",
      fields: {
        ...fields,
        color: { ...(fields.color ?? {}), enabled: false },
        style: { ...(fields.style ?? {}), enabled: false },
      },
    },
    purchase_settings: {
      ...purchase,
      barcode_mode: "scan",
      show_mrp: true,
      track_batch_expiry: true,
    },
  };
}
