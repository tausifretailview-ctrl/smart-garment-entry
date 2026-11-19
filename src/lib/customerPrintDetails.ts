/**
 * Customer Master → "Print on bill": a name and address printed on bills when they differ from
 * the name used to find the customer. Blank print name → the customer name; all print address
 * fields blank → the customer's address. Database: 20270508120000_customer_print_details.sql.
 */
export const CUSTOMER_PRINT_COLUMNS =
  "print_name, print_address, print_place, print_pincode, print_state, print_country" as const;

export type CustomerPrintDetails = {
  print_name: string;
  print_address: string;
  print_place: string;
  print_pincode: string;
  print_state: string;
  print_country: string;
};

export const EMPTY_PRINT_DETAILS: CustomerPrintDetails = {
  print_name: "",
  print_address: "",
  print_place: "",
  print_pincode: "",
  print_state: "",
  print_country: "",
};

const LIMITS: Record<keyof CustomerPrintDetails, number> = {
  print_name: 160,
  print_address: 400,
  print_place: 80,
  print_pincode: 12,
  print_state: 60,
  print_country: 60,
};

const KEYS = Object.keys(EMPTY_PRINT_DETAILS) as Array<keyof CustomerPrintDetails>;

function tidy(value: unknown, max: number, multiline = false): string {
  if (typeof value !== "string") return "";
  const text = multiline
    ? value.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n")
    : value.replace(/\s+/g, " ").trim();
  return text.slice(0, max);
}

/** A customer row (any shape) → print details, trimmed; missing columns read as blank. */
export function readCustomerPrintDetails(row: unknown): CustomerPrintDetails {
  const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
  const out = { ...EMPTY_PRINT_DETAILS };
  for (const key of KEYS) out[key] = tidy(r[key], LIMITS[key], key === "print_address");
  return out;
}

export function hasPrintAddress(d: CustomerPrintDetails): boolean {
  return Boolean(d.print_address || d.print_place || d.print_pincode || d.print_state || d.print_country);
}

/**
 * The address block printed on the bill from the print fields:
 *   SHAIKH ROZA ROAD, DATTA NAGAR, SHAHABAZAR,
 *   GULBARGA - 585101, Karnataka, INDIA
 * Empty when no print address field is filled (the bill then uses the customer's address).
 */
export function composePrintAddress(d: CustomerPrintDetails): string {
  if (!hasPrintAddress(d)) return "";
  const placeLine = [d.print_place && d.print_pincode ? `${d.print_place} - ${d.print_pincode}` : d.print_place || d.print_pincode, d.print_state, d.print_country]
    .filter(Boolean)
    .join(", ");
  return [d.print_address, placeLine].filter(Boolean).join("\n");
}

/** Name and address to print, falling back to what the bill already carries. */
export function resolveBillParty(
  bill: { customerName: string; customerAddress?: string | null },
  details: CustomerPrintDetails | null | undefined,
): { customerName: string; customerAddress: string } {
  const name = details?.print_name || bill.customerName;
  const printed = details ? composePrintAddress(details) : "";
  return { customerName: name, customerAddress: printed || String(bill.customerAddress ?? "") };
}

/**
 * Columns to save from the form: only the ones that changed since the customer was opened, so
 * saving a customer keeps working before the print-details SQL is run (nothing sent until used).
 */
export function customerPrintDetailsPatch(
  next: CustomerPrintDetails,
  previous?: CustomerPrintDetails | null,
): Partial<Record<keyof CustomerPrintDetails, string | null>> {
  const prev = previous ?? EMPTY_PRINT_DETAILS;
  const cleanNext = readCustomerPrintDetails(next);
  const patch: Partial<Record<keyof CustomerPrintDetails, string | null>> = {};
  for (const key of KEYS) {
    if (cleanNext[key] !== readCustomerPrintDetails(prev)[key]) patch[key] = cleanNext[key] || null;
  }
  return patch;
}

/** True when the print_* columns have not been added yet (migration not run). */
export function isMissingPrintDetailsColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`;
  return /print_(name|address|place|pincode|state|country)/i.test(text) && /(42703|PGRST204|does not exist|schema cache|Could not find)/i.test(text);
}
