/**
 * Read-only: fetch 20 recent POS sales and replay cart through computePosBillTotals.
 * Reports mismatches — does not write.
 *
 * Usage: node scripts/replay-pos-billing.mjs
 * Needs VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (or SUPABASE_*) in .env
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing Supabase URL/key in .env — cannot replay.");
  process.exit(1);
}

const supabase = createClient(url, key);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function resolveBillFlatForPosEdit(sale, saleItems) {
  const savedFlatPercent = Number(sale.flat_discount_percent) || 0;
  const savedFlatAmount = Number(sale.flat_discount_amount) || 0;
  const percentLooksClean =
    savedFlatPercent > 0 &&
    Math.abs(savedFlatPercent * 100 - Math.round(savedFlatPercent * 100)) < 0.0001;
  if (percentLooksClean) return { value: savedFlatPercent, mode: "percent" };
  if (savedFlatAmount > 0.005) return { value: savedFlatAmount, mode: "amount" };
  let fromLines = 0;
  for (const row of saleItems || []) {
    const lt = Number(row.line_total) || 0;
    const pq = Number(row.per_qty_net_amount) || 0;
    const q = Number(row.quantity) || 0;
    if (pq > 0.005 && q > 0) fromLines += Math.max(0, lt - pq * q);
  }
  fromLines = Math.round(fromLines * 100) / 100;
  if (fromLines > 0.02) return { value: fromLines, mode: "amount" };
  return { value: 0, mode: "percent" };
}

function computePosFlatDiscount({ mrpTotal, saleReturnAdjust, flatDiscountValue, flatDiscountMode }) {
  const flatDiscountBase = Math.max(0, Math.round((mrpTotal - saleReturnAdjust) * 100) / 100);
  const flatDiscountAmount =
    flatDiscountMode === "percent"
      ? Math.round(((flatDiscountBase * flatDiscountValue) / 100) * 100) / 100
      : Math.min(Math.max(0, flatDiscountValue), flatDiscountBase);
  return { flatDiscountAmount };
}

function posLineGstFromTaxable(taxable, gstPer) {
  if (!gstPer || !taxable) return 0;
  return Math.round(((taxable * gstPer) / 100) * 100) / 100;
}

function computePosBillGst(items, taxType, flatDiscountAmount) {
  const taxableSubtotal = items.reduce((s, i) => s + (i.netAmount || 0), 0);
  if (taxType !== "exclusive" || taxableSubtotal <= 0.005) {
    return { taxableSubtotal, totalGst: 0 };
  }
  const totalGst = items.reduce((sum, item) => {
    const share = taxableSubtotal > 0 ? (item.netAmount / taxableSubtotal) * flatDiscountAmount : 0;
    const adjusted = Math.round((item.netAmount - share) * 100) / 100;
    return sum + posLineGstFromTaxable(adjusted, item.gstPer);
  }, 0);
  return { taxableSubtotal, totalGst: Math.round(totalGst * 100) / 100 };
}

function replaySale(sale, saleItems) {
  const items = (saleItems || []).map((item) => ({
    mrp: Number(item.mrp) || 0,
    quantity: Number(item.quantity) || 0,
    unitCost: Number(item.unit_price) || 0,
    discountPercent: Number(item.discount_percent) || 0,
    discountAmount: 0,
    netAmount: Number(item.line_total) || 0,
    gstPer: Number(item.gst_percent) || 0,
  }));

  const mrp = items.reduce((s, i) => s + i.mrp * i.quantity, 0);
  const discount = items.reduce((sum, item) => {
    const baseAmount = item.mrp * item.quantity;
    const percentDiscount = (baseAmount * item.discountPercent) / 100;
    const implicitRateDiscount = Math.max(0, (item.mrp - item.unitCost) * item.quantity);
    return sum + percentDiscount + item.discountAmount + implicitRateDiscount;
  }, 0);
  const subtotal = items.reduce((s, i) => s + i.netAmount, 0);

  const flatRes = resolveBillFlatForPosEdit(sale, saleItems);
  const saleReturnAdjust = Number(sale.sale_return_adjust) || 0;
  const creditApplied = Number(sale.credit_applied) || 0;
  const taxType = String(sale.tax_type || "inclusive");
  const pointsRedeemed = Number(sale.points_redeemed_amount) || 0;
  const storedRound = Number(sale.round_off) || 0;

  const rawFlat = computePosFlatDiscount({
    mrpTotal: mrp,
    saleReturnAdjust,
    flatDiscountValue: flatRes.value,
    flatDiscountMode: flatRes.mode,
  });
  const maxFlat = Math.max(0, Math.round((Math.max(0, round2(mrp)) - discount) * 100) / 100);
  const flatDiscountAmount = Math.min(rawFlat.flatDiscountAmount, maxFlat);
  const posGst = computePosBillGst(items, taxType, flatDiscountAmount);
  const amountBeforeRoundOff =
    taxType === "exclusive"
      ? posGst.taxableSubtotal - flatDiscountAmount - saleReturnAdjust - creditApplied + posGst.totalGst
      : subtotal - flatDiscountAmount - saleReturnAdjust - creditApplied;
  // Use stored round_off (manual or auto at save time) — do not re-auto.
  const finalAmount = amountBeforeRoundOff + storedRound - pointsRedeemed;

  return {
    gross_amount: round2(mrp),
    discount_amount: round2(discount),
    flat_discount_amount: round2(flatDiscountAmount),
    round_off: round2(storedRound),
    net_amount: round2(finalAmount),
    points_redeemed_amount: round2(pointsRedeemed),
    total_gst: round2(posGst.totalGst),
  };
}

function near(a, b, eps = 0.02) {
  return Math.abs(round2(a) - round2(b)) <= eps;
}

const { data: sales, error } = await supabase
  .from("sales")
  .select(
    "id, sale_number, organization_id, sale_type, gross_amount, discount_amount, flat_discount_amount, flat_discount_percent, sale_return_adjust, credit_applied, round_off, net_amount, points_redeemed_amount, tax_type, payment_status, created_at",
  )
  .eq("sale_type", "pos")
  .is("deleted_at", null)
  .neq("payment_status", "hold")
  .order("created_at", { ascending: false })
  .limit(20);

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

if (!sales?.length) {
  console.log("No POS sales returned (RLS may hide rows without auth).");
  process.exit(0);
}

const mismatches = [];
let ok = 0;

for (const sale of sales) {
  const { data: items, error: itemsErr } = await supabase
    .from("sale_items")
    .select(
      "id, mrp, quantity, unit_price, discount_percent, line_total, gst_percent, per_qty_net_amount",
    )
    .eq("sale_id", sale.id);

  if (itemsErr) {
    mismatches.push({ saleId: sale.id, sale_number: sale.sale_number, error: itemsErr.message });
    continue;
  }

  const computed = replaySale(sale, items || []);
  const diffs = [];
  for (const col of [
    "gross_amount",
    "discount_amount",
    "flat_discount_amount",
    "round_off",
    "net_amount",
    "points_redeemed_amount",
  ]) {
    const stored = Number(sale[col]) || 0;
    const replayed = computed[col];
    if (!near(stored, replayed)) {
      diffs.push({ col, stored, replayed });
    }
  }
  if (diffs.length) {
    mismatches.push({
      saleId: sale.id,
      sale_number: sale.sale_number,
      tax_type: sale.tax_type,
      diffs,
    });
  } else {
    ok += 1;
  }
}

console.log(`Replayed ${sales.length} POS bills: ${ok} matched, ${mismatches.length} mismatched.`);
if (mismatches.length) {
  console.log(JSON.stringify(mismatches, null, 2));
  process.exit(2);
}
process.exit(0);
