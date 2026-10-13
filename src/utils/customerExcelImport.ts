import { normalizePhoneNumber, parseLocalizedNumber } from "./excelImportUtils";

/**
 * Customer Master Excel import: turns mapped sheet rows into customer inserts.
 *
 * Party lists exported from other software often have no mobile for many parties,
 * "Unregistered" typed into the GSTIN column and a separate State column. Rows are
 * kept when they have a name or a mobile (same rule as the Add customer form).
 */

export interface PreparedCustomerRow {
  customer_name: string;
  phone: string | null;
  email: string;
  address: string;
  gst_number: string;
  opening_balance: number;
}

export interface PreparedCustomerImport {
  rows: PreparedCustomerRow[];
  /** Rows with neither a name nor a mobile. */
  blankRows: number;
  /** Mobile cells that were not a 10-digit number; the party is imported without a mobile. */
  invalidPhones: number;
  /** GSTIN cells that were text like "Unregistered" / "NA"; saved blank. */
  clearedGstins: number;
}

const GSTIN_PATTERN = /^\d{2}[A-Z0-9]{13}$/;

/** Placeholder cells other software exports for "no value" (e.g. pivot "(blank)"). */
const EMPTY_PLACEHOLDERS = new Set(["(blank)", "blank", "-", "--", "na", "n/a", "nil", "null", "none"]);

const HTML_ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };

/** Cell text, trimmed; literal HTML entities ("SWEET &amp; SNACKS") decoded; placeholders → "". */
const text = (v: unknown): string => {
  if (v === undefined || v === null) return "";
  let value = String(v).trim();
  // Decode repeatedly: some exports double-escape ("&amp;amp;").
  for (let i = 0; i < 3 && /&(amp|lt|gt|quot|apos|#39);/i.test(value); i++) {
    value = value.replace(/&(amp|lt|gt|quot|apos|#39);/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? m);
  }
  return EMPTY_PLACEHOLDERS.has(value.toLowerCase()) ? "" : value;
};

export const cleanImportGstin = (raw: unknown): string => {
  const value = text(raw).toUpperCase().replace(/\s+/g, "");
  return GSTIN_PATTERN.test(value) ? value : "";
};

/** Appends the State cell to the address unless the address already names it. */
export const mergeImportAddress = (address: string, state: string): string => {
  if (!state) return address;
  if (!address) return state;
  if (address.toLowerCase().includes(state.toLowerCase())) return address;
  return `${address.replace(/[\s,]+$/, "")}, ${state}`;
};

export const prepareCustomerImportRows = (
  mappedData: Record<string, unknown>[],
): PreparedCustomerImport => {
  const rows: PreparedCustomerRow[] = [];
  let blankRows = 0;
  let invalidPhones = 0;
  let clearedGstins = 0;

  for (const row of mappedData) {
    const rawPhone = text(row.phone);
    let phone: string | null = normalizePhoneNumber(rawPhone) || null;
    if (phone && phone.length !== 10) {
      invalidPhones++;
      phone = null;
    }
    const name = text(row.customer_name).replace(/\s+/g, " ").toUpperCase();
    if (!name && !phone) {
      blankRows++;
      continue;
    }

    const rawGst = text(row.gst_number);
    const gst_number = cleanImportGstin(rawGst);
    if (rawGst && !gst_number) clearedGstins++;

    const balanceCell = text(row.opening_balance);
    rows.push({
      customer_name: name || (phone as string),
      phone,
      email: text(row.email),
      address: mergeImportAddress(text(row.address), text(row.state)),
      gst_number,
      opening_balance: balanceCell ? parseLocalizedNumber(balanceCell) || 0 : 0,
    });
  }

  return { rows, blankRows, invalidPhones, clearedGstins };
};

/**
 * Drops parties that already exist (in the org or earlier in the same file).
 * A row with a mobile is a duplicate when that mobile exists; a row without one
 * is a duplicate when a customer with the same name exists.
 */
export const splitNewCustomers = (
  rows: PreparedCustomerRow[],
  existing: { customer_name?: string | null; phone?: string | null }[],
): { fresh: PreparedCustomerRow[]; duplicates: number } => {
  const phones = new Set<string>();
  const names = new Set<string>();
  const nameKey = (v: unknown) => text(v).replace(/\s+/g, " ").toUpperCase();
  for (const c of existing) {
    const phone = normalizePhoneNumber(c.phone ?? "");
    if (phone) phones.add(phone);
    const name = nameKey(c.customer_name);
    if (name) names.add(name);
  }

  const fresh: PreparedCustomerRow[] = [];
  let duplicates = 0;
  for (const row of rows) {
    const name = nameKey(row.customer_name);
    const isDuplicate = row.phone ? phones.has(row.phone) : names.has(name);
    if (isDuplicate) {
      duplicates++;
      continue;
    }
    if (row.phone) phones.add(row.phone);
    names.add(name);
    fresh.push(row);
  }
  return { fresh, duplicates };
};
