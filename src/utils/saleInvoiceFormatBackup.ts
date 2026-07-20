/**
 * Sale invoice format backup / restore (JSON), mirroring printer preset label export.
 * Only format/look keys from sale_settings — not numbering, e-invoice, or POS ops flags.
 */

export const SALE_INVOICE_FORMAT_EXPORT_VERSION = 1 as const;

/** Keys that define how invoices look when printed. */
export const SALE_INVOICE_FORMAT_KEYS = [
  "invoice_paper_format",
  "sales_bill_format",
  "pos_bill_format",
  "thermal_receipt_style",
  "invoice_template",
  "invoice_color_scheme",
  "font_family",
  "logo_placement",
  "invoice_document_title",
  "invoice_header_text",
  "invoice_footer_text",
  "declaration_text",
  "terms_list",
  "show_invoice_preview",
  "show_hsn_code",
  "show_barcode",
  "show_gst_breakdown",
  "show_bank_details",
  "show_mrp_column",
  "show_discount_on_rate",
  "show_total_quantity",
  "amount_with_decimal",
  "show_received_amount",
  "show_balance_amount",
  "show_party_balance",
  "show_tax_details",
  "show_you_saved",
  "amount_with_grouping",
  "bank_details",
  "size_display_format",
  "min_item_rows",
  "show_product_color",
  "show_product_brand",
  "show_product_style",
  "show_item_brand",
  "show_item_color",
  "show_item_style",
  "show_item_barcode",
  "show_item_hsn",
  "show_item_mrp",
] as const;

export type SaleInvoiceFormatKey = (typeof SALE_INVOICE_FORMAT_KEYS)[number];

export type SaleInvoiceFormatSlice = Partial<Record<SaleInvoiceFormatKey, unknown>>;

export type SaleInvoiceFormatExportFile = {
  version: typeof SALE_INVOICE_FORMAT_EXPORT_VERSION;
  exportedAt: string;
  organizationId: string;
  organizationName: string;
  saleInvoiceFormat: SaleInvoiceFormatSlice;
};

export type SaleInvoiceFormatLocalBackup = {
  id: string;
  createdAt: string;
  note: string;
  organizationId: string;
  organizationName: string;
  saleInvoiceFormat: SaleInvoiceFormatSlice;
};

const LOCAL_BACKUP_PREFIX = "ezzy_sale_invoice_format_backups_";
const MAX_LOCAL_BACKUPS = 20;

export function pickSaleInvoiceFormatSlice(
  saleSettings: Record<string, unknown> | null | undefined,
): SaleInvoiceFormatSlice {
  const src = saleSettings ?? {};
  const out: SaleInvoiceFormatSlice = {};
  for (const key of SALE_INVOICE_FORMAT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(src, key) && src[key] !== undefined) {
      out[key] = src[key];
    }
  }
  return out;
}

export function mergeSaleInvoiceFormatSlice(
  currentSaleSettings: Record<string, unknown> | null | undefined,
  formatSlice: SaleInvoiceFormatSlice,
): Record<string, unknown> {
  const next = { ...(currentSaleSettings ?? {}) };
  for (const key of SALE_INVOICE_FORMAT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(formatSlice, key)) {
      next[key] = formatSlice[key];
    }
  }
  return next;
}

export function buildSaleInvoiceFormatExportFile(
  organizationId: string,
  organizationName: string,
  saleSettings: Record<string, unknown> | null | undefined,
): SaleInvoiceFormatExportFile {
  return {
    version: SALE_INVOICE_FORMAT_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    organizationId,
    organizationName,
    saleInvoiceFormat: pickSaleInvoiceFormatSlice(saleSettings),
  };
}

export function validateSaleInvoiceFormatImportFile(
  raw: unknown,
): { ok: true; data: SaleInvoiceFormatExportFile } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Invalid file: expected a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== SALE_INVOICE_FORMAT_EXPORT_VERSION) {
    return { ok: false, error: "Unsupported export version — expected version 1" };
  }
  if (!obj.saleInvoiceFormat || typeof obj.saleInvoiceFormat !== "object" || Array.isArray(obj.saleInvoiceFormat)) {
    return { ok: false, error: "Invalid file: missing saleInvoiceFormat object" };
  }
  const slice = obj.saleInvoiceFormat as Record<string, unknown>;
  const known = new Set<string>(SALE_INVOICE_FORMAT_KEYS);
  const picked: SaleInvoiceFormatSlice = {};
  let knownCount = 0;
  for (const [k, v] of Object.entries(slice)) {
    if (known.has(k)) {
      picked[k as SaleInvoiceFormatKey] = v;
      knownCount += 1;
    }
  }
  if (knownCount === 0) {
    return { ok: false, error: "Import file has no recognized invoice format fields" };
  }
  return {
    ok: true,
    data: {
      version: SALE_INVOICE_FORMAT_EXPORT_VERSION,
      exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : new Date().toISOString(),
      organizationId: typeof obj.organizationId === "string" ? obj.organizationId : "",
      organizationName: typeof obj.organizationName === "string" ? obj.organizationName : "",
      saleInvoiceFormat: picked,
    },
  };
}

export function downloadSaleInvoiceFormatExport(
  organizationName: string,
  file: SaleInvoiceFormatExportFile,
): void {
  const safeName = organizationName.replace(/[^\w\-]+/g, "-").replace(/-+/g, "-") || "org";
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}-invoice-format-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function localBackupStorageKey(organizationId: string): string {
  return `${LOCAL_BACKUP_PREFIX}${organizationId}`;
}

export function listSaleInvoiceFormatLocalBackups(organizationId: string): SaleInvoiceFormatLocalBackup[] {
  try {
    const raw = localStorage.getItem(localBackupStorageKey(organizationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is SaleInvoiceFormatLocalBackup =>
        !!b &&
        typeof b === "object" &&
        typeof (b as SaleInvoiceFormatLocalBackup).id === "string" &&
        typeof (b as SaleInvoiceFormatLocalBackup).createdAt === "string" &&
        !!(b as SaleInvoiceFormatLocalBackup).saleInvoiceFormat,
    );
  } catch {
    return [];
  }
}

function persistLocalBackups(organizationId: string, backups: SaleInvoiceFormatLocalBackup[]): void {
  try {
    localStorage.setItem(localBackupStorageKey(organizationId), JSON.stringify(backups.slice(0, MAX_LOCAL_BACKUPS)));
  } catch {
    /* quota / private mode */
  }
}

export function createSaleInvoiceFormatLocalBackup(
  organizationId: string,
  organizationName: string,
  saleSettings: Record<string, unknown> | null | undefined,
  note: string,
): SaleInvoiceFormatLocalBackup {
  const entry: SaleInvoiceFormatLocalBackup = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    note,
    organizationId,
    organizationName,
    saleInvoiceFormat: pickSaleInvoiceFormatSlice(saleSettings),
  };
  const next = [entry, ...listSaleInvoiceFormatLocalBackups(organizationId)];
  persistLocalBackups(organizationId, next);
  return entry;
}

export function formatSaleInvoiceBackupDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
