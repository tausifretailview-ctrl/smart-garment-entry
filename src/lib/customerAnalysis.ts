/**
 * Customer purchase analysis (Sale Bill → customer → Analysis). Pure: takes the customer's
 * bills, bill lines, products and returns, and works out what they buy, at what price, how
 * they pay and how often they come. Money totals come from the saved bills; the account
 * balance is not computed here (the screen shows the ledger figure it already has).
 */

export interface AnalysisSale {
  id: string;
  sale_number?: string | null;
  sale_date: string;
  sale_type?: string | null;
  net_amount: number | null;
  paid_amount?: number | null;
  payment_method?: string | null;
  payment_status?: string | null;
  cash_amount?: number | null;
  upi_amount?: number | null;
  card_amount?: number | null;
  finance_amount?: number | null;
}

export interface AnalysisItem {
  sale_id: string;
  product_id?: string | null;
  product_name?: string | null;
  size?: string | null;
  color?: string | null;
  quantity: number | null;
  unit_price?: number | null;
  mrp?: number | null;
  discount_percent?: number | null;
  line_total: number | null;
}

export interface AnalysisProduct {
  id: string;
  brand?: string | null;
  category?: string | null;
}

export interface AnalysisReturn {
  id: string;
  return_date: string;
  net_amount: number | null;
}

export type AnalysisPeriod = "all" | "365" | "180" | "90" | "30";

export const ANALYSIS_PERIODS: { value: AnalysisPeriod; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "365", label: "Last 12 months" },
  { value: "180", label: "Last 6 months" },
  { value: "90", label: "Last 3 months" },
  { value: "30", label: "Last 30 days" },
];

export interface ShareRow {
  name: string;
  qty: number;
  amount: number;
  /** Share of quantity, 0–100. */
  sharePct: number;
}

export interface TopProductRow {
  key: string;
  productId: string | null;
  name: string;
  bills: number;
  qty: number;
  amount: number;
  /** Price paid per piece after discount (amount ÷ qty). */
  avgPrice: number;
  lastPrice: number;
  lastDate: string;
  mrp: number;
  avgDiscountPct: number;
  sizes: string[];
}

export interface PriceBandRow {
  label: string;
  min: number;
  max: number | null;
  qty: number;
  sharePct: number;
}

export interface PaymentMethodRow {
  key: string;
  label: string;
  bills: number;
  amount: number;
  sharePct: number;
}

export interface MonthRow {
  month: string;
  label: string;
  amount: number;
  bills: number;
}

export interface CustomerAnalysis {
  summary: {
    bills: number;
    totalSpent: number;
    avgBill: number;
    biggestBill: number;
    itemsQty: number;
    avgItemPrice: number;
    firstDate: string | null;
    lastDate: string | null;
    daysSinceLast: number | null;
    /** Average days between visits (null with fewer than 2 visit days). */
    avgGapDays: number | null;
    returnsCount: number;
    returnsAmount: number;
    returnRatePct: number;
  };
  topProducts: TopProductRow[];
  brands: ShareRow[];
  categories: ShareRow[];
  sizes: ShareRow[];
  colors: ShareRow[];
  priceBands: PriceBandRow[];
  pricing: {
    /** Overall discount off MRP on lines that have an MRP, 0–100. */
    avgDiscountPct: number;
    /** Share of pieces bought below MRP, 0–100. */
    discountedQtyPct: number;
    maxItemPrice: number;
    p25: number;
    median: number;
    p75: number;
  };
  payments: {
    methods: PaymentMethodRow[];
    paid: number;
    partial: number;
    pending: number;
  };
  monthly: MonthRow[];
  weekdays: { day: string; bills: number }[];
  insights: string[];
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100 || 0;
const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const PRICE_BANDS: { label: string; min: number; max: number | null }[] = [
  { label: "Under ₹300", min: 0, max: 300 },
  { label: "₹300–499", min: 300, max: 500 },
  { label: "₹500–999", min: 500, max: 1000 },
  { label: "₹1,000–1,999", min: 1000, max: 2000 },
  { label: "₹2,000–4,999", min: 2000, max: 5000 },
  { label: "₹5,000+", min: 5000, max: null },
];

/** Sale types that are real sales to the customer (not challans, debit notes or holds). */
export function isCountedSale(s: Pick<AnalysisSale, "sale_type">): boolean {
  const t = (s.sale_type || "invoice").toLowerCase();
  return t === "invoice" || t === "pos";
}

/** Calendar day (YYYY-MM-DD) of a stored date or timestamp. */
const dayOf = (d: string) => String(d || "").slice(0, 10);
const parseDay = (d: string) => {
  const [y, m, day] = dayOf(d).split("-").map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
};

export function periodStart(period: AnalysisPeriod, now: Date): Date | null {
  if (period === "all") return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - Number(period) + 1);
  return start;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function paymentMethodLabel(method: string | null | undefined): { key: string; label: string } {
  const m = String(method || "").trim().toLowerCase();
  switch (m) {
    case "cash":
      return { key: "cash", label: "Cash" };
    case "upi":
      return { key: "upi", label: "UPI" };
    case "card":
      return { key: "card", label: "Card" };
    case "bank":
    case "bank_transfer":
    case "neft":
      return { key: "bank", label: "Bank" };
    case "multiple":
    case "mix":
    case "mixed":
      return { key: "multiple", label: "Mixed" };
    case "pay_later":
    case "credit":
    case "":
      return { key: "credit", label: "Credit (pay later)" };
    case "finance":
      return { key: "finance", label: "Finance / EMI" };
    case "advance_adjustment":
    case "credit_note_adjustment":
      return { key: "adjustment", label: "Advance / CN adjusted" };
    default:
      return { key: m, label: m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) };
  }
}

function shareRows(map: Map<string, { qty: number; amount: number }>, totalQty: number, limit: number): ShareRow[] {
  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      qty: round2(v.qty),
      amount: round2(v.amount),
      sharePct: totalQty > 0 ? Math.round((v.qty / totalQty) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.qty - a.qty || b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, limit);
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function analyzeCustomer(input: {
  sales: AnalysisSale[];
  items: AnalysisItem[];
  products?: AnalysisProduct[];
  returns?: AnalysisReturn[];
  now: Date;
  period?: AnalysisPeriod;
  topLimit?: number;
}): CustomerAnalysis {
  const { now } = input;
  const start = periodStart(input.period ?? "all", now);
  const inPeriod = (d: string) => !start || parseDay(d) >= start;

  const sales = input.sales.filter((s) => isCountedSale(s) && inPeriod(s.sale_date));
  const saleById = new Map(sales.map((s) => [s.id, s]));
  const items = input.items.filter((i) => saleById.has(i.sale_id) && num(i.quantity) > 0);
  const productById = new Map((input.products ?? []).map((p) => [p.id, p]));
  const returns = (input.returns ?? []).filter((r) => inPeriod(r.return_date));

  // ── Summary ──
  const totalSpent = sales.reduce((s, x) => s + num(x.net_amount), 0);
  const days = [...new Set(sales.map((s) => dayOf(s.sale_date)))].sort();
  const firstDate = days[0] ?? null;
  const lastDate = days[days.length - 1] ?? null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceLast = lastDate ? Math.max(0, Math.round((today.getTime() - parseDay(lastDate).getTime()) / DAY_MS)) : null;
  const avgGapDays =
    days.length >= 2
      ? Math.round((parseDay(days[days.length - 1]).getTime() - parseDay(days[0]).getTime()) / DAY_MS / (days.length - 1))
      : null;
  const itemsQty = items.reduce((s, i) => s + num(i.quantity), 0);
  const itemsAmount = items.reduce((s, i) => s + num(i.line_total), 0);
  const returnsAmount = returns.reduce((s, r) => s + num(r.net_amount), 0);

  // ── Products ──
  type Agg = {
    productId: string | null;
    name: string;
    bills: Set<string>;
    qty: number;
    amount: number;
    mrpValue: number;
    mrpQty: number;
    lastDate: string;
    lastPrice: number;
    mrp: number;
    sizes: Map<string, number>;
  };
  const byProduct = new Map<string, Agg>();
  const brands = new Map<string, { qty: number; amount: number }>();
  const categories = new Map<string, { qty: number; amount: number }>();
  const sizes = new Map<string, { qty: number; amount: number }>();
  const colors = new Map<string, { qty: number; amount: number }>();
  const unitPrices: number[] = [];
  const bandQty = PRICE_BANDS.map(() => 0);
  let mrpValue = 0;
  let mrpPaid = 0;
  let discountedQty = 0;
  let mrpQty = 0;

  const add = (m: Map<string, { qty: number; amount: number }>, key: string | null | undefined, qty: number, amount: number) => {
    const k = String(key || "").trim();
    if (!k) return;
    const v = m.get(k) ?? { qty: 0, amount: 0 };
    v.qty += qty;
    v.amount += amount;
    m.set(k, v);
  };

  for (const it of items) {
    const qty = num(it.quantity);
    const amount = num(it.line_total);
    const unit = qty > 0 ? amount / qty : 0;
    const sale = saleById.get(it.sale_id)!;
    const key = it.product_id || `name:${(it.product_name || "").trim().toUpperCase()}`;
    const agg =
      byProduct.get(key) ??
      ({
        productId: it.product_id ?? null,
        name: (it.product_name || "Item").trim(),
        bills: new Set<string>(),
        qty: 0,
        amount: 0,
        mrpValue: 0,
        mrpQty: 0,
        lastDate: "",
        lastPrice: 0,
        mrp: 0,
        sizes: new Map(),
      } as Agg);
    agg.bills.add(it.sale_id);
    agg.qty += qty;
    agg.amount += amount;
    const d = dayOf(sale.sale_date);
    if (d >= agg.lastDate) {
      agg.lastDate = d;
      agg.lastPrice = unit;
      if (num(it.mrp) > 0) agg.mrp = num(it.mrp);
    }
    if (num(it.mrp) > 0) {
      agg.mrpValue += num(it.mrp) * qty;
      agg.mrpQty += qty;
    }
    if (it.size) agg.sizes.set(it.size, (agg.sizes.get(it.size) ?? 0) + qty);
    byProduct.set(key, agg);

    const product = it.product_id ? productById.get(it.product_id) : undefined;
    add(brands, product?.brand, qty, amount);
    add(categories, product?.category, qty, amount);
    add(sizes, it.size, qty, amount);
    add(colors, it.color, qty, amount);

    for (let q = 0; q < Math.min(qty, 500); q++) unitPrices.push(unit);
    const band = PRICE_BANDS.findIndex((b) => unit >= b.min && (b.max === null || unit < b.max));
    if (band >= 0) bandQty[band] += qty;

    if (num(it.mrp) > 0) {
      mrpValue += num(it.mrp) * qty;
      mrpPaid += amount;
      mrpQty += qty;
      if (unit < num(it.mrp) - 0.5) discountedQty += qty;
    }
  }

  const topProducts: TopProductRow[] = [...byProduct.entries()]
    .map(([key, a]) => ({
      key,
      productId: a.productId,
      name: a.name,
      bills: a.bills.size,
      qty: round2(a.qty),
      amount: round2(a.amount),
      avgPrice: round2(a.qty > 0 ? a.amount / a.qty : 0),
      lastPrice: round2(a.lastPrice),
      lastDate: a.lastDate,
      mrp: round2(a.mrp),
      avgDiscountPct:
        a.mrpValue > 0 ? Math.max(0, Math.round((1 - a.amount / a.mrpValue) * 1000) / 10) : 0,
      sizes: [...a.sizes.entries()].sort((x, y) => y[1] - x[1]).map(([s]) => s).slice(0, 4),
    }))
    .sort((a, b) => b.amount - a.amount || b.qty - a.qty)
    .slice(0, input.topLimit ?? 15);

  unitPrices.sort((a, b) => a - b);
  const priceBands: PriceBandRow[] = PRICE_BANDS.map((b, i) => ({
    ...b,
    qty: round2(bandQty[i]),
    sharePct: itemsQty > 0 ? Math.round((bandQty[i] / itemsQty) * 1000) / 10 : 0,
  }));

  // ── Payments ──
  const methods = new Map<string, PaymentMethodRow>();
  let paid = 0;
  let partial = 0;
  let pending = 0;
  for (const s of sales) {
    const { key, label } = paymentMethodLabel(s.payment_method);
    const row = methods.get(key) ?? { key, label, bills: 0, amount: 0, sharePct: 0 };
    row.bills += 1;
    row.amount += num(s.net_amount);
    methods.set(key, row);
    const status = String(s.payment_status || "").toLowerCase();
    if (status === "completed" || status === "paid") paid += 1;
    else if (status === "partial") partial += 1;
    else pending += 1;
  }
  const methodRows = [...methods.values()]
    .map((r) => ({ ...r, amount: round2(r.amount), sharePct: totalSpent > 0 ? Math.round((r.amount / totalSpent) * 1000) / 10 : 0 }))
    .sort((a, b) => b.amount - a.amount);

  // ── Monthly (12 months ending this month, or fewer for a short period) ──
  const monthsBack = start ? Math.min(12, Math.max(1, Math.ceil((today.getTime() - start.getTime()) / (30.44 * DAY_MS)))) : 12;
  const monthly: MonthRow[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthly.push({ month, label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, amount: 0, bills: 0 });
  }
  const monthIdx = new Map(monthly.map((m, i) => [m.month, i]));
  const weekdayBills = WEEKDAYS.map(() => 0);
  for (const s of sales) {
    const idx = monthIdx.get(dayOf(s.sale_date).slice(0, 7));
    if (idx !== undefined) {
      monthly[idx].amount += num(s.net_amount);
      monthly[idx].bills += 1;
    }
    weekdayBills[parseDay(s.sale_date).getDay()] += 1;
  }
  monthly.forEach((m) => (m.amount = round2(m.amount)));

  const summary = {
    bills: sales.length,
    totalSpent: round2(totalSpent),
    avgBill: round2(sales.length ? totalSpent / sales.length : 0),
    biggestBill: round2(sales.reduce((m, s) => Math.max(m, num(s.net_amount)), 0)),
    itemsQty: round2(itemsQty),
    avgItemPrice: round2(itemsQty > 0 ? itemsAmount / itemsQty : 0),
    firstDate,
    lastDate,
    daysSinceLast,
    avgGapDays,
    returnsCount: returns.length,
    returnsAmount: round2(returnsAmount),
    returnRatePct: totalSpent > 0 ? Math.round((returnsAmount / totalSpent) * 1000) / 10 : 0,
  };

  const result: CustomerAnalysis = {
    summary,
    topProducts,
    brands: shareRows(brands, itemsQty, 8),
    categories: shareRows(categories, itemsQty, 8),
    sizes: shareRows(sizes, itemsQty, 10),
    colors: shareRows(colors, itemsQty, 10),
    priceBands,
    pricing: {
      avgDiscountPct: mrpValue > 0 ? Math.max(0, Math.round((1 - mrpPaid / mrpValue) * 1000) / 10) : 0,
      discountedQtyPct: mrpQty > 0 ? Math.round((discountedQty / mrpQty) * 1000) / 10 : 0,
      maxItemPrice: round2(unitPrices[unitPrices.length - 1] ?? 0),
      p25: round2(quantile(unitPrices, 0.25)),
      median: round2(quantile(unitPrices, 0.5)),
      p75: round2(quantile(unitPrices, 0.75)),
    },
    payments: { methods: methodRows, paid, partial, pending },
    monthly,
    weekdays: WEEKDAYS.map((day, i) => ({ day, bills: weekdayBills[i] })),
    insights: [],
  };
  result.insights = buildInsights(result);
  return result;
}

/** Short plain-language observations for the top of the analysis. */
export function buildInsights(a: Omit<CustomerAnalysis, "insights">): string[] {
  const out: string[] = [];
  const s = a.summary;
  if (s.bills === 0) return out;
  const topCat = a.categories[0];
  const topSize = a.sizes[0];
  if (topCat && topCat.sharePct >= 25) {
    out.push(
      `Buys mostly ${topCat.name} (${topCat.sharePct}% of pieces)${topSize && topSize.sharePct >= 30 ? `, usually size ${topSize.name}` : ""}.`,
    );
  } else if (topSize && topSize.sharePct >= 30) {
    out.push(`Usually buys size ${topSize.name} (${topSize.sharePct}% of pieces).`);
  }
  const topBrand = a.brands[0];
  if (topBrand && topBrand.sharePct >= 30) out.push(`Favourite brand: ${topBrand.name} (${topBrand.sharePct}% of pieces).`);
  if (a.pricing.median > 0) {
    out.push(
      `Spends about ${inr(s.avgBill)} per bill; most pieces cost ${inr(a.pricing.p25)}–${inr(a.pricing.p75)}.`,
    );
  }
  if (a.pricing.discountedQtyPct >= 60) out.push(`Discount-driven: ${a.pricing.discountedQtyPct}% of pieces bought below MRP.`);
  else if (a.pricing.discountedQtyPct > 0 && a.pricing.discountedQtyPct <= 20) out.push(`Pays near full price: only ${a.pricing.discountedQtyPct}% of pieces below MRP.`);
  const topMethod = a.payments.methods[0];
  if (topMethod && topMethod.sharePct >= 50) out.push(`Mostly pays by ${topMethod.label}: ${topMethod.sharePct}% of spend.`);
  if (s.avgGapDays && s.daysSinceLast !== null) {
    if (s.daysSinceLast > s.avgGapDays * 1.5 && s.daysSinceLast >= 14) {
      out.push(`Last visit ${s.daysSinceLast} days ago, longer than usual (about every ${s.avgGapDays} days): due for a follow-up.`);
    } else {
      out.push(`Visits about every ${s.avgGapDays} days.`);
    }
  }
  if (s.returnRatePct >= 15) out.push(`High returns: ${s.returnRatePct}% of spend came back.`);
  return out.slice(0, 6);
}
