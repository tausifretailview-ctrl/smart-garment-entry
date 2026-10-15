import { supabase } from "@/integrations/supabase/client";
import {
  SUPPLIER_DUE_AFTER_DAYS,
  aggregateTodaySalesItems,
  aggregateTodaySold,
  summarizeTodayPayments,
  type TodayPaymentMix,
  type TodaySaleItemLine,
  type TodaySoldLine,
} from "@/lib/alertPopups";

export const ALERT_POPUP_SUPPLIER_DUES_KEY = "alert-popup-supplier-dues";
export const ALERT_POPUP_TODAY_SOLD_KEY = "alert-popup-today-sold";
export const ALERT_POPUP_TODAY_DETAIL_KEY = "alert-popup-today-detail";

/** Rows read per check; enough for a popup summary without a full-table scan. */
const SUPPLIER_BILL_SCAN_LIMIT = 300;
const TODAY_SALES_SCAN_LIMIT = 300;
const TODAY_SOLD_LINES = 5;

export interface SupplierDueSummary {
  billCount: number;
  supplierCount: number;
  dueAmount: number;
}

/** Purchase bills older than SUPPLIER_DUE_AFTER_DAYS that still carry a balance. */
export async function fetchSupplierDueSummary(organizationId: string): Promise<SupplierDueSummary> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SUPPLIER_DUE_AFTER_DAYS);
  const cutoffDate = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(
    cutoff.getDate(),
  ).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("purchase_bills")
    .select("supplier_id, supplier_name, net_amount, paid_amount")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .eq("is_cancelled", false)
    .or("payment_status.is.null,payment_status.neq.completed")
    .lte("bill_date", cutoffDate)
    .order("bill_date", { ascending: true })
    .limit(SUPPLIER_BILL_SCAN_LIMIT);
  if (error) throw error;

  let billCount = 0;
  let dueAmount = 0;
  const suppliers = new Set<string>();
  for (const row of data ?? []) {
    const due = Number(row.net_amount || 0) - Number(row.paid_amount || 0);
    if (due <= 0.5) continue;
    billCount += 1;
    dueAmount += due;
    suppliers.add(row.supplier_id ?? row.supplier_name ?? "");
  }
  return { billCount, supplierCount: suppliers.size, dueAmount };
}

export interface TodaySoldSummary {
  billCount: number;
  totalQty: number;
  lines: TodaySoldLine[];
}

/** Today's top-selling items with their current stock. */
export async function fetchTodaySoldWithStock(organizationId: string): Promise<TodaySoldSummary> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("sales")
    .select("id, sale_items(variant_id, product_name, size, color, quantity, deleted_at)")
    .eq("organization_id", organizationId)
    .in("sale_type", ["pos", "invoice"])
    .is("deleted_at", null)
    .eq("is_cancelled", false)
    .gte("sale_date", start.toISOString())
    .order("sale_date", { ascending: false })
    .limit(TODAY_SALES_SCAN_LIMIT);
  if (error) throw error;

  const rows = (data ?? []).flatMap((sale) =>
    ((sale.sale_items ?? []) as {
      variant_id: string | null;
      product_name: string | null;
      size: string | null;
      color: string | null;
      quantity: number | null;
      deleted_at: string | null;
    }[]).filter((item) => !item.deleted_at),
  );
  const totalQty = rows.reduce((sum, r) => sum + Math.max(0, Number(r.quantity || 0)), 0);
  const lines = aggregateTodaySold(rows, TODAY_SOLD_LINES);

  if (lines.length > 0) {
    const { data: stockRows, error: stockError } = await supabase
      .from("product_variants")
      .select("id, stock_qty")
      .eq("organization_id", organizationId)
      .in(
        "id",
        lines.map((l) => l.variantId),
      );
    if (!stockError) {
      const stockById = new Map((stockRows ?? []).map((r) => [r.id, Number(r.stock_qty ?? 0)]));
      for (const line of lines) line.stock = stockById.get(line.variantId) ?? null;
    }
  }

  return { billCount: data?.length ?? 0, totalQty, lines };
}

/** Bills read for the "Today's sales" window. */
const TODAY_DETAIL_SALES_LIMIT = 1000;
const STOCK_LOOKUP_CHUNK = 200;

export interface TodaySaleBill {
  id: string;
  saleNumber: string;
  saleDate: string;
  customerName: string;
  saleType: string;
  paymentMethod: string;
  netAmount: number;
  itemQty: number;
}

export interface TodaySalesDetail {
  bills: TodaySaleBill[];
  items: TodaySaleItemLine[];
  totalQty: number;
  totalAmount: number;
  payments: TodayPaymentMix;
  /** True when the day has more bills than were read. */
  truncated: boolean;
}

/** Full picture of today's sales for the details window: bills, every item sold, stock left. */
export async function fetchTodaySalesDetail(organizationId: string): Promise<TodaySalesDetail> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("sales")
    .select(
      "id, sale_number, sale_date, customer_name, sale_type, payment_method, net_amount, cash_amount, upi_amount, card_amount, sale_items(variant_id, product_name, size, color, quantity, line_total, barcode, deleted_at)",
    )
    .eq("organization_id", organizationId)
    .in("sale_type", ["pos", "invoice"])
    .is("deleted_at", null)
    .eq("is_cancelled", false)
    .gte("sale_date", start.toISOString())
    .order("sale_date", { ascending: false })
    .limit(TODAY_DETAIL_SALES_LIMIT);
  if (error) throw error;

  type ItemRow = {
    variant_id: string | null;
    product_name: string | null;
    size: string | null;
    color: string | null;
    quantity: number | null;
    line_total: number | null;
    barcode: string | null;
    deleted_at: string | null;
  };

  const sales = data ?? [];
  const allItems: ItemRow[] = [];
  const bills: TodaySaleBill[] = sales.map((sale) => {
    const items = ((sale.sale_items ?? []) as ItemRow[]).filter((i) => !i.deleted_at);
    allItems.push(...items);
    return {
      id: sale.id,
      saleNumber: sale.sale_number ?? "",
      saleDate: sale.sale_date,
      customerName: (sale.customer_name ?? "").trim() || "Walk-in",
      saleType: sale.sale_type ?? "",
      paymentMethod: sale.payment_method ?? "",
      netAmount: Number(sale.net_amount || 0),
      itemQty: items.reduce((sum, i) => sum + Math.max(0, Number(i.quantity || 0)), 0),
    };
  });

  const items = aggregateTodaySalesItems(allItems);
  const ids = items.map((l) => l.variantId);
  const stockById = new Map<string, number>();
  for (let i = 0; i < ids.length; i += STOCK_LOOKUP_CHUNK) {
    const { data: stockRows, error: stockError } = await supabase
      .from("product_variants")
      .select("id, stock_qty")
      .eq("organization_id", organizationId)
      .in("id", ids.slice(i, i + STOCK_LOOKUP_CHUNK));
    if (stockError) break;
    for (const r of stockRows ?? []) stockById.set(r.id, Number(r.stock_qty ?? 0));
  }
  for (const line of items) line.stock = stockById.has(line.variantId) ? stockById.get(line.variantId)! : null;

  return {
    bills,
    items,
    totalQty: bills.reduce((sum, b) => sum + b.itemQty, 0),
    totalAmount: bills.reduce((sum, b) => sum + b.netAmount, 0),
    payments: summarizeTodayPayments(sales),
    truncated: sales.length >= TODAY_DETAIL_SALES_LIMIT,
  };
}
