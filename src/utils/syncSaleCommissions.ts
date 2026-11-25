/**
 * Salesman commission rows rebuilt from the bills themselves.
 *
 * Commission rows were written only by POS, only for a new bill with a salesman in the header
 * box at the moment of saving. Sale Bills, edited bills, held bills finished later and bills
 * whose salesman was set per line never got rows, so the Salesman Commission page showed a
 * fraction of what Net Profit (salesman-wise, read from the bills) showed (FASHION STUDIO,
 * November 2026: 8 of 143 bills).
 *
 * syncSaleCommissions(org, saleIds) makes each bill's rows match the bill: one row per line under
 * the line's salesman (else the header), for active staff. Rows already marked Paid are never
 * touched: a bill with any paid row is left as it is. Cancelled / deleted bills, delivery
 * challans and debit notes keep no pending rows. New rows are inserted before the old pending
 * ones are removed, so a failure never leaves a bill without its commission.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows, fetchInIdBatches } from "@/lib/data/fetchInIdBatches";
import { buildSalesmanCommissionRecords, type SalesmanCommissionInsert } from "@/utils/salesmanCommissionLineRepair";
import { resolveEffectiveLineSalesman } from "@/utils/dailySalesmanIncentive";
import { isHeldOrCancelledSale } from "@/utils/posHoldBill";

/** Sale types that never earn commission. */
const NO_COMMISSION_SALE_TYPES = new Set(["delivery_challan", "debit_note", "quotation"]);
const WRITE_CHUNK = 200;

type SaleHeader = {
  id: string;
  sale_number: string | null;
  sale_date: string | null;
  customer_name: string | null;
  salesman: string | null;
  net_amount: number | null;
  sale_type: string | null;
  deleted_at: string | null;
  is_cancelled: boolean | null;
  payment_status: string | null;
  payment_method: string | null;
};

type SaleLine = {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string | null;
  quantity: number | null;
  line_total: number | null;
  discount_share: number | null;
  net_after_discount: number | null;
  salesman: string | null;
};

type ExistingRow = { id: string; sale_id: string; payment_status: string | null };

export type SyncSaleCommissionsResult = {
  /** Bills whose rows now match the bill. */
  bills: number;
  /** Commission rows written. */
  rows: number;
  /** Bills left as they were because a row is already paid. */
  paidKept: number;
  /** Bills (and their net) with no salesman on any line or the header. */
  noSalesmanBills: number;
  noSalesmanAmount: number;
};

/** Calendar day of the bill in India (commission rows are filtered by day). */
export function istDay(value: string | null | undefined): string {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return String(value ?? "").slice(0, 10);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export async function syncSaleCommissions(
  organizationId: string,
  saleIds: string[],
  opts: { employees?: unknown[]; rules?: unknown[] } = {},
): Promise<SyncSaleCommissionsResult> {
  const result: SyncSaleCommissionsResult = { bills: 0, rows: 0, paidKept: 0, noSalesmanBills: 0, noSalesmanAmount: 0 };
  const ids = [...new Set(saleIds.filter(Boolean))];
  if (!organizationId || ids.length === 0) return result;

  const [sales, lines, existing, employees, rules] = await Promise.all([
    fetchInIdBatches<SaleHeader>(ids, (batch) =>
      supabase
        .from("sales")
        .select("id, sale_number, sale_date, customer_name, salesman, net_amount, sale_type, deleted_at, is_cancelled, payment_status, payment_method")
        .eq("organization_id", organizationId)
        .in("id", batch)
        .order("id") as never,
    ),
    fetchInIdBatches<SaleLine>(ids, (batch) =>
      supabase
        .from("sale_items")
        .select("id, sale_id, product_id, product_name, quantity, line_total, discount_share, net_after_discount, salesman")
        .eq("organization_id", organizationId)
        .in("sale_id", batch)
        .is("deleted_at", null)
        .order("id") as never,
    ),
    fetchInIdBatches<ExistingRow>(ids, (batch) =>
      (supabase.from("salesman_commissions" as never) as any)
        .select("id, sale_id, payment_status")
        .eq("organization_id", organizationId)
        .in("sale_id", batch)
        .order("id"),
    ),
    opts.employees
      ? Promise.resolve(opts.employees)
      : supabase
          .from("employees")
          .select("id, employee_name, designation, commission_percent")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .eq("status", "active")
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),
    opts.rules
      ? Promise.resolve(opts.rules)
      : (supabase.from("commission_rules" as never) as any)
          .select("id, employee_id, employee_name, rule_type, rule_value, commission_percent")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .then(({ data, error }: { data: unknown[] | null; error: unknown }) => (error ? [] : data ?? [])),
  ]);

  const productIds = [...new Set(lines.map((l) => l.product_id).filter(Boolean))] as string[];
  const products = await fetchInIdBatches<{ id: string; brand: string | null; category: string | null; style: string | null }>(
    productIds,
    (batch) =>
      supabase
        .from("products")
        .select("id, brand, category, style")
        .eq("organization_id", organizationId)
        .in("id", batch)
        .order("id") as never,
  );
  const productsById = Object.fromEntries(products.map((p) => [p.id, p]));

  const linesBySale = new Map<string, SaleLine[]>();
  for (const line of lines) {
    const list = linesBySale.get(line.sale_id) ?? [];
    list.push(line);
    linesBySale.set(line.sale_id, list);
  }
  const existingBySale = new Map<string, ExistingRow[]>();
  for (const row of existing) {
    const list = existingBySale.get(row.sale_id) ?? [];
    list.push(row);
    existingBySale.set(row.sale_id, list);
  }

  const toInsert: SalesmanCommissionInsert[] = [];
  const toRemove: string[] = [];
  for (const sale of sales) {
    const old = existingBySale.get(sale.id) ?? [];
    if (old.some((row) => row.payment_status === "paid")) {
      result.paidKept += 1;
      continue;
    }
    toRemove.push(...old.map((row) => row.id));
    const live =
      !sale.deleted_at &&
      sale.is_cancelled !== true &&
      // A held cart (F7 Hold) is not a sale yet: it earns commission when it is completed.
      !isHeldOrCancelledSale(sale) &&
      !NO_COMMISSION_SALE_TYPES.has(String(sale.sale_type || "").toLowerCase());
    if (!live) continue;
    const items = linesBySale.get(sale.id) ?? [];
    const anySalesman =
      items.some((item) => resolveEffectiveLineSalesman(item.salesman, sale.salesman)) ||
      (items.length === 0 && Boolean((sale.salesman ?? "").trim()));
    if (!anySalesman) {
      result.noSalesmanBills += 1;
      result.noSalesmanAmount += Number(sale.net_amount) || 0;
    }
    const records = buildSalesmanCommissionRecords({
      organizationId,
      saleId: sale.id,
      saleNumber: sale.sale_number || "",
      saleDate: istDay(sale.sale_date),
      customerName: sale.customer_name || "",
      headerSalesman: sale.salesman || "",
      totalNetAmount: Number(sale.net_amount) || 0,
      items,
      productsById,
      employees: employees as never[],
      rules: rules as never[],
    });
    toInsert.push(...records);
    result.bills += 1;
  }

  for (let i = 0; i < toInsert.length; i += WRITE_CHUNK) {
    const chunk = toInsert.slice(i, i + WRITE_CHUNK);
    const { error } = await (supabase.from("salesman_commissions" as never) as any).insert(chunk);
    if (error) throw error;
  }
  for (let i = 0; i < toRemove.length; i += WRITE_CHUNK) {
    const chunk = toRemove.slice(i, i + WRITE_CHUNK);
    const { error } = await (supabase.from("salesman_commissions" as never) as any)
      .delete()
      .eq("organization_id", organizationId)
      .neq("payment_status", "paid")
      .in("id", chunk);
    if (error) throw error;
  }
  result.rows = toInsert.length;
  return result;
}

/** Every bill of a period (India calendar days), for "Rebuild commission". */
export async function fetchSaleIdsForPeriod(organizationId: string, startYmd: string, endYmd: string): Promise<string[]> {
  const from = new Date(`${startYmd}T00:00:00+05:30`).toISOString();
  const to = new Date(new Date(`${endYmd}T00:00:00+05:30`).getTime() + 86_400_000).toISOString();
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("sales")
      .select("id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .gte("sale_date", from)
      .lt("sale_date", to)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    ids.push(...(data ?? []).map((r) => r.id));
    if (!data || data.length < 1000) break;
  }
  return ids;
}

/**
 * Bills of a period (India calendar days) that have a salesman — on the bill or on a line — but
 * no commission row at all. The POS books commission in the background right after a save, at
 * the same moment as printing; when that is cut short (print dialog, window closed or reloaded,
 * an old app version on the counter) the bill is saved without commission and nothing says so
 * (Nov 2026: 65 bills in 14 shops, all with active staff). The Salesman Commission page fills
 * these in when it opens.
 */
type SaleHeaderLite = {
  id: string;
  sale_number: string | null;
  sale_type: string | null;
  is_cancelled: boolean | null;
  payment_status: string | null;
  payment_method: string | null;
};

export async function findSaleIdsMissingCommission(
  organizationId: string,
  startYmd: string,
  endYmd: string,
): Promise<string[]> {
  if (!organizationId) return [];
  const from = new Date(`${startYmd}T00:00:00+05:30`).toISOString();
  const to = new Date(new Date(`${endYmd}T00:00:00+05:30`).getTime() + 86_400_000).toISOString();

  const [headerRows, lineRows] = await Promise.all([
    fetchAllRows<SaleHeaderLite>(
      () =>
        supabase
          .from("sales")
          .select("id, sale_number, sale_type, is_cancelled, payment_status, payment_method")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .gte("sale_date", from)
          .lt("sale_date", to)
          .not("salesman", "is", null)
          .neq("salesman", "")
          .order("id") as never,
    ),
    fetchAllRows<{ id: string; sale_id: string }>(
      () =>
        supabase
          .from("sale_items")
          .select("id, sale_id, sales!inner(sale_date, deleted_at)")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .not("salesman", "is", null)
          .neq("salesman", "")
          .is("sales.deleted_at", null)
          .gte("sales.sale_date", from)
          .lt("sales.sale_date", to)
          .order("id") as never,
    ),
  ]);

  const candidates = new Set<string>();
  for (const row of headerRows) {
    if (isHeldOrCancelledSale(row)) continue;
    if (NO_COMMISSION_SALE_TYPES.has(String(row.sale_type || "").toLowerCase())) continue;
    candidates.add(row.id);
  }
  for (const row of lineRows) if (row.sale_id) candidates.add(row.sale_id);
  if (candidates.size === 0) return [];

  const ids = [...candidates];
  const booked = await fetchInIdBatches<{ id: string; sale_id: string }>(ids, (batch) =>
    (supabase.from("salesman_commissions" as never) as any)
      .select("id, sale_id")
      .eq("organization_id", organizationId)
      .in("sale_id", batch)
      .order("id"),
  );
  const withRows = new Set(booked.map((row) => row.sale_id));
  return ids.filter((id) => !withRows.has(id));
}
