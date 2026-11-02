import { supabase } from "@/integrations/supabase/client";
import {
  cleanGstin,
  saleReturnToNoteInput,
  type NoteInput,
  type NoteParty,
} from "../../supabase/functions/_shared/einvoiceNote";
import { einvoiceUnit } from "../../supabase/functions/_shared/uqc";

/**
 * Industrial mode, Phase 2 step 2b: IRN state of sale returns (GST credit notes).
 * Read in its own small query so the Sale Returns list itself is unchanged for every shop.
 */
export type SaleReturnIrnRow = {
  id: string;
  irn: string | null;
  ack_no: string | null;
  ack_date: string | null;
  einvoice_status: string | null;
  einvoice_error: string | null;
  einvoice_test_mode: boolean | null;
  buyerGstin: string;
};

const MISSING_SQL = /irn|einvoice|ack_(no|date)/i;

/** IRN columns of the given returns plus each buyer's GSTIN; missingSql when step 2b SQL has not run. */
export async function fetchSaleReturnIrnStates(
  organizationId: string,
  ids: string[],
): Promise<{ rows: Map<string, SaleReturnIrnRow>; missingSql: boolean }> {
  const rows = new Map<string, SaleReturnIrnRow>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return { rows, missingSql: false };
  const { data, error } = await supabase
    .from("sale_returns")
    .select("id, customer_id, irn, ack_no, ack_date, einvoice_status, einvoice_error, einvoice_test_mode")
    .eq("organization_id", organizationId)
    .in("id", unique);
  if (error) {
    if (MISSING_SQL.test(error.message || "")) return { rows, missingSql: true };
    throw error;
  }
  const list = (data ?? []) as Array<Omit<SaleReturnIrnRow, "buyerGstin"> & { customer_id: string | null }>;
  // sale_returns has no foreign key to customers: look the GSTINs up by id.
  const customerIds = Array.from(new Set(list.map((r) => r.customer_id).filter(Boolean))) as string[];
  const gstinByCustomer = new Map<string, string>();
  for (let i = 0; i < customerIds.length; i += 200) {
    const { data: cust, error: custError } = await supabase
      .from("customers")
      .select("id, gst_number")
      .eq("organization_id", organizationId)
      .in("id", customerIds.slice(i, i + 200));
    if (custError) throw custError;
    for (const c of cust ?? []) gstinByCustomer.set(String(c.id), cleanGstin(c.gst_number as string | null));
  }
  for (const r of list) {
    rows.set(String(r.id), {
      id: String(r.id),
      irn: r.irn ?? null,
      ack_no: r.ack_no ?? null,
      ack_date: r.ack_date ?? null,
      einvoice_status: r.einvoice_status ?? null,
      einvoice_error: r.einvoice_error ?? null,
      einvoice_test_mode: r.einvoice_test_mode ?? null,
      buyerGstin: r.customer_id ? gstinByCustomer.get(String(r.customer_id)) ?? "" : "",
    });
  }
  return { rows, missingSql: false };
}

export type SaleReturnNoteData = {
  input: NoteInput | null;
  buyer: NoteParty;
  returnNumber: string;
  notes: string | null;
  irn: string | null;
  ackNo: string | null;
  ackDate: string | null;
  testMode: boolean | null;
  qr: string | null;
};

/**
 * Everything one return needs for its IRN: the CRN lines (same conversion the e-invoice
 * service uses), the buyer, and with withQr the signed QR for printing.
 */
export async function loadSaleReturnNote(
  organizationId: string,
  returnId: string,
  sellerGstin: string,
  withQr = false,
): Promise<{ data: SaleReturnNoteData | null; error: string | null }> {
  const cols =
    "id, return_number, return_date, net_amount, gross_amount, gst_amount, customer_id, customer_name, original_sale_number, notes, irn, ack_no, ack_date, einvoice_test_mode" +
    (withQr ? ", einvoice_qr_code" : "");
  const { data: ret, error } = await supabase
    .from("sale_returns")
    .select(cols)
    .eq("id", returnId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    return {
      data: null,
      error: MISSING_SQL.test(error.message || "")
        ? "Run the Phase 2 step 2b SQL first: it adds the IRN columns to sale returns."
        : error.message,
    };
  }
  if (!ret) return { data: null, error: "This return was not found. It may have been deleted." };
  const r = ret as unknown as {
    return_number: string | null;
    return_date: string;
    net_amount: number | null;
    gross_amount: number | null;
    gst_amount: number | null;
    customer_id: string | null;
    customer_name: string;
    original_sale_number: string | null;
    notes: string | null;
    irn: string | null;
    ack_no: string | null;
    ack_date: string | null;
    einvoice_test_mode: boolean | null;
    einvoice_qr_code?: string | null;
  };

  const [custRes, itemsRes, origRes] = await Promise.all([
    r.customer_id
      ? supabase
          .from("customers")
          .select("customer_name, gst_number, address, phone, email")
          .eq("id", r.customer_id)
          .eq("organization_id", organizationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("sale_return_items")
      .select("product_id, product_name, hsn_code, quantity, line_total, gst_percent, is_dc_item, deleted_at")
      .eq("return_id", returnId),
    r.original_sale_number
      ? supabase
          .from("sales")
          .select("sale_date, b2b_details")
          .eq("organization_id", organizationId)
          .eq("sale_number", r.original_sale_number)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (itemsRes.error) return { data: null, error: itemsRes.error.message };
  const cust = (custRes.data ?? null) as {
    customer_name?: string | null;
    gst_number?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  const orig = (origRes.data ?? null) as { sale_date?: string | null; b2b_details?: unknown } | null;

  const buyer: NoteParty = {
    gstin: cleanGstin(cust?.gst_number),
    name: r.customer_name || cust?.customer_name || "",
    address: cust?.address || "",
    phone: cust?.phone,
    email: cust?.email,
  };
  const interState = cleanGstin(sellerGstin).slice(0, 2) !== buyer.gstin.slice(0, 2);
  // Same units as einvoice-note sends (product master unit → UQC), so the check and print match the IRN.
  const returnItems = itemsRes.data ?? [];
  const productIds = Array.from(new Set(returnItems.map((i) => String(i.product_id ?? "")).filter(Boolean)));
  const uomById = new Map<string, string>();
  for (let i = 0; i < productIds.length; i += 200) {
    const { data: products } = await supabase
      .from("products")
      .select("id, uom")
      .eq("organization_id", organizationId)
      .in("id", productIds.slice(i, i + 200));
    for (const p of products ?? []) uomById.set(String(p.id), String(p.uom ?? ""));
  }
  const itemsWithUnits = returnItems.map((i) => {
    const uom = i.product_id ? uomById.get(String(i.product_id)) : undefined;
    return uom === undefined ? i : { ...i, unit: einvoiceUnit(uom, i.hsn_code) };
  });
  const input = saleReturnToNoteInput(r, itemsWithUnits, {
    interState,
    originalSaleDate: orig?.sale_date ? String(orig.sale_date).slice(0, 10) : null,
    originalB2bDetails: orig?.b2b_details,
  });
  return {
    data: {
      input,
      buyer,
      returnNumber: String(r.return_number ?? ""),
      notes: r.notes,
      irn: r.irn,
      ackNo: r.ack_no,
      ackDate: r.ack_date,
      testMode: r.einvoice_test_mode,
      qr: r.einvoice_qr_code ?? null,
    },
    error: null,
  };
}
