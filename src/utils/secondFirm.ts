import { supabase } from "@/integrations/supabase/client";

/**
 * "2nd firm" bill header (Settings > Reports > 2nd billing details).
 *
 * Same organization, same stock, accounts and bill numbers — only the printed
 * header (name / address / phone, optional GSTIN) changes when the cashier ticks
 * "2nd firm" on a POS bill. The choice is saved on `sales.print_firm = 'second'`
 * so a reprint shows the same firm.
 */
export type PrintFirm = "second" | null;

export type SecondFirmSettings = {
  enabled?: boolean;
  name?: string;
  address?: string;
  phone?: string;
  gstin?: string;
};

export type SecondFirmProfile = {
  name: string;
  address: string;
  phone: string;
  gstin: string;
};

type SettingsLike = Record<string, any> | null | undefined;

/** Enabled 2nd firm with a name, else null (checkbox stays hidden). */
export function resolveSecondFirm(settings: SettingsLike): SecondFirmProfile | null {
  const raw = (settings?.report_settings as { second_firm?: SecondFirmSettings } | undefined)?.second_firm;
  if (!raw?.enabled) return null;
  const name = String(raw.name || "").trim();
  if (!name) return null;
  return {
    name,
    address: String(raw.address || "").trim(),
    phone: String(raw.phone || "").trim(),
    gstin: String(raw.gstin || "").trim().toUpperCase(),
  };
}

export function normalizePrintFirm(value: unknown): PrintFirm {
  return value === "second" ? "second" : null;
}

/**
 * Settings row as the invoice should see it. For the 2nd firm, swaps the header
 * fields and drops main-firm branding (logo, stamp, email, header line).
 */
export function applyPrintFirmToSettings<T extends SettingsLike>(settings: T, printFirm: PrintFirm | undefined): T {
  if (printFirm !== "second" || !settings) return settings;
  const firm = resolveSecondFirm(settings);
  if (!firm) return settings;
  return {
    ...settings,
    business_name: firm.name,
    address: firm.address,
    mobile_number: firm.phone,
    email_id: "",
    gst_number: firm.gstin,
    sale_settings: {
      ...(settings.sale_settings || {}),
      invoice_header_text: "",
    },
    bill_barcode_settings: {
      ...(settings.bill_barcode_settings || {}),
      logo_url: "",
      stamp_image_base64: "",
    },
  } as T;
}

/**
 * Column patch for sales insert/update. `undefined` (feature off) writes nothing,
 * so shops without the 2nd firm never touch `print_firm`.
 */
export function salePrintFirmPatch(printFirm: PrintFirm | undefined): { print_firm?: PrintFirm } {
  return printFirm === undefined ? {} : { print_firm: printFirm };
}

/** Saved firm for a bill; null on any error (e.g. column not added yet). */
export async function fetchSalePrintFirm(saleId: string | null | undefined): Promise<PrintFirm> {
  if (!saleId) return null;
  try {
    const { data, error } = await supabase
      .from("sales")
      .select("print_firm" as any)
      .eq("id", saleId)
      .maybeSingle();
    if (error) return null;
    return normalizePrintFirm((data as { print_firm?: unknown } | null)?.print_firm);
  } catch {
    return null;
  }
}
