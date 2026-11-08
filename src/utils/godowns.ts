import { supabase } from "@/integrations/supabase/client";

/**
 * Industrial mode, Phase 3: godowns (stock places) in one GSTIN.
 * The Main godown's stock is the shop stock minus what sits in the other godowns, so bills keep
 * working as before; only the godown functions in the Phase 3 SQL move stock between godowns.
 */

export type GodownType = "main" | "godown" | "job_work" | "damaged";

export type Godown = {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  godown_type: GodownType;
  address: string | null;
  pincode: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  supplier_id: string | null;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string | null;
};

export type GodownSummary = {
  godown_id: string;
  items: number;
  qty: number;
  stock_value: number;
  /** Main only: items whose Main stock is below zero (more sits in other godowns than the shop has). */
  short_items: number;
};

export type GodownStockRow = {
  variant_id: string;
  product_id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  barcode: string | null;
  uom: string | null;
  qty: number;
  rate: number;
  stock_value: number;
  /** The item's stock in the whole shop (all godowns). */
  shop_qty: number;
  total_count: number;
};

export const GODOWN_TYPES: { value: GodownType; label: string; hint: string; badge: string }[] = [
  { value: "main", label: "Main", hint: "Your shop. Holds all stock that is not in another godown.", badge: "bg-teal-50 text-teal-700 ring-teal-200" },
  { value: "godown", label: "Godown", hint: "Your own store room or warehouse on the same GSTIN.", badge: "bg-sky-50 text-sky-700 ring-sky-200" },
  { value: "job_work", label: "Job worker", hint: "Goods lying with a job worker for processing.", badge: "bg-violet-50 text-violet-700 ring-violet-200" },
  { value: "damaged", label: "Damaged", hint: "Rejected or damaged goods kept apart from saleable stock.", badge: "bg-rose-50 text-rose-700 ring-rose-200" },
];

export function godownTypeInfo(type: string | null | undefined) {
  return GODOWN_TYPES.find((t) => t.value === type) ?? GODOWN_TYPES[1];
}

/** Main first, then open godowns by their order, then closed ones. */
export function sortGodowns<T extends Pick<Godown, "godown_type" | "is_active" | "sort_order" | "name">>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const rank = (g: T) => (g.godown_type === "main" ? 0 : g.is_active ? 1 : 2);
    return rank(a) - rank(b) || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);
  });
}

/** Quantity without trailing zeros: 12, 12.5, 0.125. */
export function formatGodownQty(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

export function formatGodownValue(n: number | null | undefined): string {
  return `₹${Math.round(Number(n ?? 0)).toLocaleString("en-IN")}`;
}

/** Top stripe colour of a godown card on the Godowns page. */
export function godownCardStripe(type: string | null | undefined): string {
  switch (type) {
    case "main":
      return "bg-teal-500";
    case "job_work":
      return "bg-violet-500";
    case "damaged":
      return "bg-rose-500";
    default:
      return "bg-sky-500";
  }
}

export type GodownTotals = {
  all: { items: number; qty: number; value: number };
  main: { items: number; qty: number; value: number };
  others: { count: number; items: number; qty: number; value: number };
  /** Item lines whose Main stock is below zero. */
  shortItems: number;
};

/** The figures for the coloured cards at the top of the Godowns page. */
export function godownTotals(godowns: Pick<Godown, "id" | "godown_type" | "is_active">[], summary: Map<string, GodownSummary> | undefined): GodownTotals {
  const t: GodownTotals = {
    all: { items: 0, qty: 0, value: 0 },
    main: { items: 0, qty: 0, value: 0 },
    others: { count: 0, items: 0, qty: 0, value: 0 },
    shortItems: 0,
  };
  for (const g of godowns) {
    const s = summary?.get(g.id);
    if (g.godown_type !== "main" && g.is_active) t.others.count += 1;
    if (!s) continue;
    const bucket = g.godown_type === "main" ? t.main : t.others;
    bucket.items += s.items;
    bucket.qty += s.qty;
    bucket.value += s.stock_value;
    t.all.items += s.items;
    t.all.qty += s.qty;
    t.all.value += s.stock_value;
    t.shortItems += s.short_items || 0;
  }
  return t;
}

/** Item name with colour and size, as the stock list and messages show it. */
export function godownItemLabel(row: { product_name: string; color?: string | null; size?: string | null }): string {
  const color = String(row.color ?? "").trim();
  const size = String(row.size ?? "").trim();
  const showSize = size && !["FREE", "NONE", "NA", "-"].includes(size.toUpperCase());
  return [row.product_name, color].filter(Boolean).join(" ") + (showSize ? ` / ${size}` : "");
}

export type GodownForm = {
  id: string | null;
  name: string;
  code: string;
  godown_type: GodownType;
  address: string;
  pincode: string;
  contact_name: string;
  contact_phone: string;
  supplier_id: string | null;
  notes: string;
  is_active: boolean;
};

export function emptyGodownForm(): GodownForm {
  return {
    id: null,
    name: "",
    code: "",
    godown_type: "godown",
    address: "",
    pincode: "",
    contact_name: "",
    contact_phone: "",
    supplier_id: null,
    notes: "",
    is_active: true,
  };
}

export function godownFormOf(g: Godown): GodownForm {
  return {
    id: g.id,
    name: g.name,
    code: g.code ?? "",
    godown_type: g.godown_type,
    address: g.address ?? "",
    pincode: g.pincode ?? "",
    contact_name: g.contact_name ?? "",
    contact_phone: g.contact_phone ?? "",
    supplier_id: g.supplier_id,
    notes: g.notes ?? "",
    is_active: g.is_active,
  };
}

/** The same checks the database makes, so the form shows them before saving. */
export function godownFormProblem(
  form: GodownForm,
  others: Pick<Godown, "id" | "name">[],
): { field: keyof GodownForm; error: string } | null {
  const name = form.name.trim();
  if (!name) return { field: "name", error: "Give the godown a name" };
  if (name.length > 60) return { field: "name", error: "Keep the godown name to 60 letters" };
  if (others.some((g) => g.id !== form.id && g.name.trim().toLowerCase() === name.toLowerCase())) {
    return { field: "name", error: `A godown named ${name} already exists` };
  }
  const pin = form.pincode.replace(/\s/g, "");
  if (pin && !/^[1-9][0-9]{5}$/.test(pin)) return { field: "pincode", error: "PIN code must be 6 digits" };
  return null;
}

/** The Phase 3 SQL has not run: the godown tables or functions are missing. */
export function isMissingGodownSql(message: string | null | undefined): boolean {
  return /could not find the function|schema cache|relation "?(public\.)?godown[a-z_]*"? does not exist/i.test(String(message ?? ""));
}

/** A database message, without the Postgres prefix. */
export function godownErrorText(e: unknown): string {
  const raw = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e ?? "");
  return raw.replace(/^ERROR:\s*/i, "").trim() || "Something went wrong";
}

/* ------------------------------------------------------------------ */
/* Database                                                             */
/* ------------------------------------------------------------------ */

// The godown tables and functions (Phase 3 SQL) are not in the generated DB types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => supabase;

export const GODOWN_COLS =
  "id, organization_id, name, code, godown_type, address, pincode, contact_name, contact_phone, supplier_id, notes, is_active, sort_order, created_at";

/** All godowns of the shop, making the Main godown the first time. */
export async function fetchGodowns(organizationId: string): Promise<{ godowns: Godown[]; missingSql: boolean }> {
  const ensured = await db().rpc("godown_ensure_main", { p_organization_id: organizationId });
  if (ensured.error) {
    if (isMissingGodownSql(ensured.error.message)) return { godowns: [], missingSql: true };
    throw ensured.error;
  }
  const { data, error } = await db().from("godowns").select(GODOWN_COLS).eq("organization_id", organizationId);
  if (error) {
    if (isMissingGodownSql(error.message)) return { godowns: [], missingSql: true };
    throw error;
  }
  return { godowns: sortGodowns((data ?? []) as Godown[]), missingSql: false };
}

/**
 * The summary as a Map, whatever the query cache holds. A Map does not survive the saved
 * (IndexedDB) query cache: it comes back as a plain object after a reload, which crashed the page.
 */
export function toGodownSummaryMap(v: unknown): Map<string, GodownSummary> {
  if (v instanceof Map) return v as Map<string, GodownSummary>;
  const out = new Map<string, GodownSummary>();
  const list = Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v as Record<string, unknown>) : [];
  for (const r of list) {
    if (!r || typeof r !== "object" || !("godown_id" in r)) continue;
    const x = r as GodownSummary;
    out.set(String(x.godown_id), {
      godown_id: String(x.godown_id),
      items: Number(x.items) || 0,
      qty: Number(x.qty) || 0,
      stock_value: Number(x.stock_value) || 0,
      short_items: Number(x.short_items) || 0,
    });
  }
  return out;
}

export async function fetchGodownSummary(organizationId: string): Promise<Map<string, GodownSummary>> {
  const { data, error } = await db().rpc("get_godown_summary", { p_organization_id: organizationId });
  if (error) throw error;
  const out = new Map<string, GodownSummary>();
  for (const r of (data ?? []) as GodownSummary[]) {
    out.set(String(r.godown_id), {
      godown_id: String(r.godown_id),
      items: Number(r.items) || 0,
      qty: Number(r.qty) || 0,
      stock_value: Number(r.stock_value) || 0,
      short_items: Number(r.short_items) || 0,
    });
  }
  return out;
}

export const GODOWN_STOCK_PAGE = 100;

export async function fetchGodownStock(opts: {
  organizationId: string;
  godownId: string;
  search: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: GodownStockRow[]; total: number }> {
  const { data, error } = await db().rpc("get_godown_stock", {
    p_organization_id: opts.organizationId,
    p_godown_id: opts.godownId,
    p_search: opts.search.trim() || null,
    p_limit: opts.limit ?? GODOWN_STOCK_PAGE,
    p_offset: opts.offset ?? 0,
  });
  if (error) throw error;
  const rows = ((data ?? []) as GodownStockRow[]).map((r) => ({
    ...r,
    qty: Number(r.qty) || 0,
    rate: Number(r.rate) || 0,
    stock_value: Number(r.stock_value) || 0,
    shop_qty: Number(r.shop_qty) || 0,
    total_count: Number(r.total_count) || 0,
  }));
  return { rows, total: rows[0]?.total_count ?? 0 };
}

/** Every row of one godown, for the Excel file (pages of 2000). */
export async function fetchAllGodownStock(organizationId: string, godownId: string, search: string): Promise<GodownStockRow[]> {
  const all: GodownStockRow[] = [];
  for (let offset = 0; offset < 200_000; offset += 2000) {
    const { rows } = await fetchGodownStock({ organizationId, godownId, search, limit: 2000, offset });
    all.push(...rows);
    if (rows.length < 2000) break;
  }
  return all;
}

export async function saveGodown(organizationId: string, form: GodownForm): Promise<string> {
  const { data, error } = await db().rpc("godown_save", {
    p_organization_id: organizationId,
    p_id: form.id,
    p_name: form.name.trim(),
    p_code: form.code.trim() || null,
    p_type: form.godown_type,
    p_address: form.address.trim() || null,
    p_pincode: form.pincode.replace(/\s/g, "") || null,
    p_contact_name: form.contact_name.trim() || null,
    p_contact_phone: form.contact_phone.trim() || null,
    p_supplier_id: form.godown_type === "job_work" ? form.supplier_id : null,
    p_notes: form.notes.trim() || null,
    p_is_active: form.is_active,
  });
  if (error) throw new Error(godownErrorText(error));
  return String(data ?? "");
}

/** One row per item for the Excel file of a godown. */
export function godownStockExcelRows(godownName: string, rows: GodownStockRow[]): Record<string, string | number>[] {
  return rows.map((r) => ({
    Godown: godownName,
    Item: r.product_name,
    Brand: r.brand || "",
    Category: r.category || "",
    Colour: r.color || "",
    Size: r.size || "",
    Barcode: r.barcode || "",
    Unit: r.uom || "",
    Qty: Number(r.qty.toFixed(3)),
    Rate: Number(r.rate.toFixed(2)),
    Value: Math.round(r.stock_value),
    "Shop stock": Number(r.shop_qty.toFixed(3)),
  }));
}
