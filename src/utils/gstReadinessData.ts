/**
 * Loads what the GST Readiness page checks: shop settings, products (HSN, unit),
 * customer and supplier GSTINs, and last month's bill numbers. Every list is paged
 * past PostgREST's 1000-row cap.
 */
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllCustomers, fetchAllSuppliers } from "@/utils/fetchAllRows";
import { isParkedHoldNumberSale } from "@/utils/posHoldBill";
import { resolveGstFilingPrefs, type GstReadinessInput } from "@/utils/gstReadiness";

const db = supabase as any;
const PAGE = 1000;

async function allPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

export type GstReadinessData = GstReadinessInput & {
  businessName: string;
  /** Raw report_settings, so a save can merge into it. */
  reportSettings: unknown;
};

export async function loadGstReadiness(orgId: string, today = new Date()): Promise<GstReadinessData> {
  const lastMonthStart = startOfMonth(subMonths(today, 1));
  const lastMonthEnd = endOfMonth(lastMonthStart);
  lastMonthEnd.setHours(23, 59, 59, 999);

  const [settingsRes, products, customers, suppliers, lastMonthSales] = await Promise.all([
    db.from("settings").select("business_name, gst_number, report_settings").eq("organization_id", orgId).maybeSingle(),
    allPages<any>((from, to) =>
      db
        .from("products")
        .select("id, product_name, hsn_code, uom")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("id")
        .range(from, to),
    ),
    fetchAllCustomers(orgId),
    fetchAllSuppliers(orgId),
    allPages<any>((from, to) =>
      db
        .from("sales")
        .select("sale_number, is_cancelled, payment_status, payment_method")
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .gte("sale_date", lastMonthStart.toISOString())
        .lte("sale_date", lastMonthEnd.toISOString())
        .order("id")
        .range(from, to),
    ),
  ]);
  if (settingsRes.error) throw settingsRes.error;
  const settings = settingsRes.data as { business_name?: string | null; gst_number?: string | null; report_settings?: unknown } | null;

  const held = (s: any) => String(s.payment_status || "").toLowerCase() === "hold" || isParkedHoldNumberSale(s);
  const heldCarts = lastMonthSales.filter(held).length;

  return {
    businessName: String(settings?.business_name || ""),
    reportSettings: settings?.report_settings ?? null,
    shopGstin: settings?.gst_number || "",
    prefs: resolveGstFilingPrefs(settings),
    products: products.map((p: any) => ({ id: String(p.id), name: String(p.product_name || ""), hsn: p.hsn_code, unit: p.uom })),
    customers: customers.map((c: any) => ({ id: String(c.id), name: String(c.customer_name || ""), gstin: c.gst_number })),
    suppliers: suppliers.map((s: any) => ({ id: String(s.id), name: String(s.supplier_name || ""), gstin: s.gst_number })),
    lastMonth: {
      label: format(lastMonthStart, "MMM yyyy"),
      documents: lastMonthSales
        .filter((s: any) => !held(s))
        .map((s: any) => ({
          number: String(s.sale_number || ""),
          cancelled: s.is_cancelled === true || String(s.payment_status || "").toLowerCase() === "cancelled",
        })),
      heldCarts,
    },
  };
}
