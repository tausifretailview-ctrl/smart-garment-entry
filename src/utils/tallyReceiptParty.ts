import { supabase } from "@/integrations/supabase/client";
import { isCustomerReceiptVoucher, type PaymentVoucherRow } from "@/utils/paymentVoucherFilters";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SALE_NUMBER_RE = /\b(?:INV|POS)\/\d{2}-\d{2}\/\d+\b/gi;
const CUSTOMER_REF_TYPES = new Set(["customer", "customer_payment", "customerreceipt"]);
const IN_CHUNK = 80;

export type ReceiptPartySale = {
  id: string;
  customer_name?: string | null;
  customer_id?: string | null;
  sale_number?: string | null;
};

export type ReceiptPartyCustomer = {
  id: string;
  customer_name?: string | null;
};

type ReceiptVoucherRow = {
  voucher_type?: string | null;
  voucher_number?: string | null;
  description?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  customer_name?: string | null;
};

/** Party Ledger for a receipt row. Customer receipts never use the payment narration. */
export function receiptPartyLedger(voucher: ReceiptVoucherRow): string {
  const name = String(voucher.customer_name || "").trim();
  if (name) return name;
  if (!isCustomerReceiptVoucher(voucher as unknown as PaymentVoucherRow)) {
    return String(voucher.description || "").trim() || "Cash";
  }
  return "Cash";
}

function nameFromSale(
  sale: ReceiptPartySale | undefined,
  customersById: Map<string, ReceiptPartyCustomer>,
): string {
  const direct = String(sale?.customer_name || "").trim();
  if (direct) return direct;
  const customerId = sale?.customer_id;
  if (!customerId) return "";
  return String(customersById.get(customerId)?.customer_name || "").trim();
}

/** Stamp customer_name onto customer receipt rows from linked sales / customers. */
export function applyReceiptPartyNames<T extends ReceiptVoucherRow>(
  vouchers: T[],
  sales: ReceiptPartySale[],
  customers: ReceiptPartyCustomer[],
): T[] {
  const salesById = new Map(sales.map((s) => [s.id, s]));
  const salesByNumber = new Map(
    sales
      .filter((s) => s.sale_number)
      .map((s) => [String(s.sale_number).toUpperCase(), s]),
  );
  const customersById = new Map(customers.map((c) => [c.id, c]));

  return vouchers.map((voucher) => {
    if (String(voucher.voucher_type || "").toLowerCase() !== "receipt") return voucher;
    if (!isCustomerReceiptVoucher(voucher as unknown as PaymentVoucherRow)) return voucher;

    const refType = String(voucher.reference_type || "").toLowerCase();
    const refId = String(voucher.reference_id || "");
    let name = "";
    if (CUSTOMER_REF_TYPES.has(refType)) {
      name = String(customersById.get(refId)?.customer_name || "").trim();
    } else if (refId) {
      name = nameFromSale(salesById.get(refId), customersById);
    }
    if (!name) {
      const match = String(voucher.description || "").match(
        /\b(?:INV|POS)\/\d{2}-\d{2}\/\d+\b/i,
      );
      if (match) {
        name = nameFromSale(salesByNumber.get(match[0].toUpperCase()), customersById);
      }
    }
    return { ...voucher, customer_name: name };
  });
}

async function fetchSalesBy(
  organizationId: string,
  column: "id" | "sale_number",
  values: string[],
): Promise<ReceiptPartySale[]> {
  const rows: ReceiptPartySale[] = [];
  for (let i = 0; i < values.length; i += IN_CHUNK) {
    const chunk = values.slice(i, i + IN_CHUNK);
    const { data, error } = await supabase
      .from("sales")
      .select("id, customer_name, customer_id, sale_number")
      .eq("organization_id", organizationId)
      .in(column, chunk);
    if (error) throw error;
    if (data?.length) rows.push(...data);
  }
  return rows;
}

async function fetchCustomersById(
  organizationId: string,
  ids: string[],
): Promise<ReceiptPartyCustomer[]> {
  const rows: ReceiptPartyCustomer[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await supabase
      .from("customers")
      .select("id, customer_name")
      .eq("organization_id", organizationId)
      .in("id", chunk);
    if (error) throw error;
    if (data?.length) rows.push(...data);
  }
  return rows;
}

/** Load party names for customer receipts, scoped to the organization. */
export async function attachReceiptCustomerNames<T extends ReceiptVoucherRow>(
  organizationId: string,
  vouchers: T[],
): Promise<T[]> {
  const receipts = vouchers.filter(
    (v) =>
      String(v.voucher_type || "").toLowerCase() === "receipt" &&
      isCustomerReceiptVoucher(v as unknown as PaymentVoucherRow),
  );
  if (receipts.length === 0) return vouchers;

  const saleIds = new Set<string>();
  const customerIds = new Set<string>();
  const saleNumbers = new Set<string>();

  for (const voucher of receipts) {
    const refType = String(voucher.reference_type || "").toLowerCase();
    const refId = String(voucher.reference_id || "");
    if (refId && UUID_RE.test(refId)) {
      if (CUSTOMER_REF_TYPES.has(refType)) customerIds.add(refId);
      else saleIds.add(refId);
    }
    const desc = String(voucher.description || "");
    for (const match of desc.matchAll(SALE_NUMBER_RE)) {
      saleNumbers.add(match[0]);
    }
  }

  const [salesById, salesByNumber] = await Promise.all([
    saleIds.size
      ? fetchSalesBy(organizationId, "id", [...saleIds])
      : Promise.resolve([]),
    saleNumbers.size
      ? fetchSalesBy(organizationId, "sale_number", [...saleNumbers])
      : Promise.resolve([]),
  ]);

  const salesByKey = new Map<string, ReceiptPartySale>();
  for (const sale of [...salesById, ...salesByNumber]) {
    salesByKey.set(sale.id, sale);
    if (!String(sale.customer_name || "").trim() && sale.customer_id && UUID_RE.test(sale.customer_id)) {
      customerIds.add(sale.customer_id);
    }
  }

  const customers = customerIds.size
    ? await fetchCustomersById(organizationId, [...customerIds])
    : [];

  return applyReceiptPartyNames(vouchers, [...salesByKey.values()], customers);
}
