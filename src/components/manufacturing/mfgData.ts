import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LotJobCard, MfgLotStatus, MfgWorkType } from "@/utils/manufacturing";

// New mfg_* tables are not in the generated Supabase types yet.
export const db = supabase as any;

export interface MfgStage {
  id: string;
  name: string;
  sequence: number;
  work_type: MfgWorkType;
  default_rate: number;
  allowed_days: number | null;
  allowed_wastage_percent: number | null;
  notes: string | null;
  active: boolean;
  is_cutting: boolean;
}

export interface MfgProduct {
  id: string;
  product_name: string;
  uom: string;
  default_pur_price: number | null;
}

export interface MfgDesignMaterial {
  material_product_id: string;
  material_type: "fabric" | "trim";
  qty_per_piece: number;
  wastage_percent: number;
}

export interface MfgDesign {
  id: string;
  design_no: string;
  design_name: string | null;
  finished_product_id: string | null;
  overhead_per_piece: number;
  notes: string | null;
  active: boolean;
  materials: MfgDesignMaterial[];
  stage_rates: { stage_id: string; rate: number }[];
}

export interface FabricStockRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  color: string | null;
  barcode: string | null;
  is_roll: boolean;
  roll_meters: number | null;
  rolls_in_stock: number | null;
  meters_purchased_in_stock: number;
  meters_used: number;
  meters_left: number;
  pur_price: number;
  stock_value: number;
}

export interface MfgWorker {
  key: string;
  type: "employee" | "supplier";
  id: string;
  name: string;
}

export interface MfgLot {
  id: string;
  lot_no: string;
  lot_date: string;
  design_id: string | null;
  finished_product_id: string;
  stage_ids: string[];
  status: MfgLotStatus;
  end_bits_action: "wastage" | "stock";
  cutting_worker_type: "employee" | "supplier" | null;
  cutting_employee_id: string | null;
  cutting_supplier_id: string | null;
  cutting_worker_name: string | null;
  cutting_rate: number;
  cut_at: string | null;
  finished_at: string | null;
  notes: string | null;
  created_at: string;
  product: { product_name: string } | null;
  design: { design_no: string; design_name: string | null } | null;
  sizes: MfgLotSize[];
}

export interface MfgLotSize {
  id: string;
  variant_id: string;
  planned_qty: number;
  cut_qty: number;
  finished_qty: number;
  sort_order: number;
  variant: { size: string | null; color: string | null; barcode: string | null } | null;
}

export interface MfgLotRoll {
  id: string;
  variant_id: string;
  issued_meters: number;
  leftover_meters: number;
  leftover_action: "wastage" | "stock" | null;
  pur_price: number;
  cancelled_at: string | null;
  created_at: string;
  variant: { size: string | null; color: string | null; barcode: string | null; product: { product_name: string } | null } | null;
}

export interface MfgJobReceipt {
  id: string;
  good_qty: number;
  rejected_qty: number;
  wasted_qty: number;
  reason: string | null;
  received_date: string;
}

export interface MfgJobCard extends LotJobCard {
  id: string;
  lot_id: string;
  worker_type: "employee" | "supplier";
  employee_id: string | null;
  supplier_id: string | null;
  worker_name: string;
  sent_date: string;
  due_date: string | null;
  notes: string | null;
  receipts: MfgJobReceipt[];
}

export const inr = (n: number) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const mtr = (n: number) => `${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })} m`;
export const pcs = (n: number) => `${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })}`;
export const isMtr = (p: MfgProduct | undefined) => (p?.uom || "").toUpperCase() === "MTR";
export const errMsg = (e: unknown) => (e as { message?: string })?.message || "Please try again";

// Look shared with Customer Balances / Insights: dark table header, zebra rows, compact cards.
export const MFG_CARD = "rounded-lg border border-slate-200 bg-white shadow-sm";
export const MFG_CARD_TITLE = "text-base font-bold text-slate-800 leading-tight flex items-center gap-2";
export const MFG_TABLE = "[&_td]:px-3 [&_td]:py-2.5 [&_td]:text-sm";
export const MFG_THEAD = "sticky top-0 z-10 [&_tr]:border-none";
export const MFG_HEAD_ROW = "bg-slate-800 hover:bg-slate-800 border-none";
export const MFG_TH =
  "h-10 text-xs font-bold uppercase tracking-wide text-white bg-slate-800 px-3 py-2.5 border-none shadow-none whitespace-nowrap";
export const MFG_ROW = "h-11 border-b border-slate-100 hover:bg-sky-50/70 even:bg-slate-50/80";

export const stagesKey = (orgId?: string) => ["mfg-stages", orgId];
export const designsKey = (orgId?: string) => ["mfg-designs", orgId];
export const fabricStockKey = (orgId?: string) => ["mfg-fabric-stock", orgId];
export const lotsKey = (orgId?: string) => ["mfg-lots", orgId];
export const lotDetailKey = (lotId?: string) => ["mfg-lot-detail", lotId];
export const openJobCardsKey = (orgId?: string) => ["mfg-open-job-cards", orgId];

export function useMfgStages(orgId?: string) {
  return useQuery({
    queryKey: stagesKey(orgId),
    enabled: !!orgId,
    queryFn: async (): Promise<MfgStage[]> => {
      const { data, error } = await db
        .from("mfg_stages")
        .select("id, name, sequence, work_type, default_rate, allowed_days, allowed_wastage_percent, notes, active, is_cutting")
        .eq("organization_id", orgId)
        .order("sequence", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as MfgStage[];
    },
  });
}

/** Products for the pickers (fabric = MTR products, trims and finished goods = the rest). */
export function useMfgProducts(orgId?: string, enabled = true) {
  return useQuery({
    queryKey: ["mfg-products", orgId],
    enabled: !!orgId && enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MfgProduct[]> => {
      const pageSize = 1000;
      const all: MfgProduct[] = [];
      for (let page = 0; page < 10; page++) {
        const { data, error } = await supabase
          .from("products")
          .select("id, product_name, uom, default_pur_price")
          .eq("organization_id", orgId as string)
          .is("deleted_at", null)
          .order("product_name", { ascending: true })
          .range(page * pageSize, page * pageSize + pageSize - 1);
        if (error) throw error;
        all.push(...((data || []) as MfgProduct[]));
        if (!data || data.length < pageSize) break;
      }
      return all;
    },
  });
}

export function useMfgDesigns(orgId?: string) {
  return useQuery({
    queryKey: designsKey(orgId),
    enabled: !!orgId,
    queryFn: async (): Promise<MfgDesign[]> => {
      const { data, error } = await db
        .from("mfg_designs")
        .select(
          "id, design_no, design_name, finished_product_id, overhead_per_piece, notes, active, " +
            "materials:mfg_design_materials(material_product_id, material_type, qty_per_piece, wastage_percent, sort_order), " +
            "stage_rates:mfg_design_stage_rates(stage_id, rate)",
        )
        .eq("organization_id", orgId)
        .order("design_no", { ascending: true });
      if (error) throw error;
      return ((data || []) as MfgDesign[]).map((d) => ({
        ...d,
        materials: [...(d.materials || [])].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
        stage_rates: d.stage_rates || [],
      }));
    },
  });
}

export function useFabricStock(orgId?: string) {
  return useQuery({
    queryKey: fabricStockKey(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<FabricStockRow[]> => {
      const { data, error } = await db.rpc("get_mfg_fabric_stock", { p_organization_id: orgId });
      if (error) throw error;
      return (data || []) as FabricStockRow[];
    },
  });
}

/** Staff from Employee Master and outside job workers from Supplier Master. */
export function useMfgWorkers(orgId?: string) {
  return useQuery({
    queryKey: ["mfg-workers", orgId],
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MfgWorker[]> => {
      const [emp, sup] = await Promise.all([
        supabase
          .from("employees")
          .select("id, employee_name, status")
          .eq("organization_id", orgId as string)
          .is("deleted_at", null)
          .order("employee_name", { ascending: true })
          .limit(1000),
        supabase
          .from("suppliers")
          .select("id, supplier_name")
          .eq("organization_id", orgId as string)
          .is("deleted_at", null)
          .order("supplier_name", { ascending: true })
          .limit(1000),
      ]);
      if (emp.error) throw emp.error;
      if (sup.error) throw sup.error;
      return [
        ...(emp.data || [])
          .filter((e) => (e.status || "active") === "active")
          .map((e) => ({ key: `employee:${e.id}`, type: "employee" as const, id: e.id, name: e.employee_name })),
        ...(sup.data || []).map((s) => ({ key: `supplier:${s.id}`, type: "supplier" as const, id: s.id, name: s.supplier_name })),
      ];
    },
  });
}

const LOT_SELECT =
  "id, lot_no, lot_date, design_id, finished_product_id, stage_ids, status, end_bits_action, " +
  "cutting_worker_type, cutting_employee_id, cutting_supplier_id, cutting_worker_name, cutting_rate, cut_at, finished_at, notes, created_at, " +
  "product:products(product_name), design:mfg_designs(design_no, design_name), " +
  "sizes:mfg_lot_sizes(id, variant_id, planned_qty, cut_qty, finished_qty, sort_order, variant:product_variants(size, color, barcode))";

const sortSizes = (lot: MfgLot): MfgLot => ({
  ...lot,
  stage_ids: lot.stage_ids || [],
  sizes: [...(lot.sizes || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
});

export function useMfgLots(orgId?: string) {
  return useQuery({
    queryKey: lotsKey(orgId),
    enabled: !!orgId,
    queryFn: async (): Promise<MfgLot[]> => {
      const { data, error } = await db
        .from("mfg_lots")
        .select(LOT_SELECT)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return ((data || []) as MfgLot[]).map(sortSizes);
    },
  });
}

export interface MfgLotDetail {
  lot: MfgLot;
  rolls: MfgLotRoll[];
  cards: MfgJobCard[];
}

export function useMfgLotDetail(lotId?: string) {
  return useQuery({
    queryKey: lotDetailKey(lotId),
    enabled: !!lotId,
    queryFn: async (): Promise<MfgLotDetail> => {
      const [lot, rolls, cards] = await Promise.all([
        db.from("mfg_lots").select(LOT_SELECT).eq("id", lotId).single(),
        db
          .from("mfg_lot_rolls")
          .select(
            "id, variant_id, issued_meters, leftover_meters, leftover_action, pur_price, cancelled_at, created_at, " +
              "variant:product_variants(size, color, barcode, product:products(product_name))",
          )
          .eq("lot_id", lotId)
          .order("created_at", { ascending: true }),
        db
          .from("mfg_job_cards")
          .select(
            "id, lot_id, stage_id, worker_type, employee_id, supplier_id, worker_name, sent_qty, rate, sent_date, due_date, status, closed_short_qty, notes, " +
              "receipts:mfg_job_receipts(id, good_qty, rejected_qty, wasted_qty, reason, received_date)",
          )
          .eq("lot_id", lotId)
          .order("created_at", { ascending: true }),
      ]);
      if (lot.error) throw lot.error;
      if (rolls.error) throw rolls.error;
      if (cards.error) throw cards.error;
      return {
        lot: sortSizes(lot.data as MfgLot),
        rolls: (rolls.data || []) as MfgLotRoll[],
        cards: ((cards.data || []) as MfgJobCard[]).map((c) => ({ ...c, receipts: c.receipts || [] })),
      };
    },
  });
}

export interface OpenJobCardRow extends MfgJobCard {
  lot: { lot_no: string; status: MfgLotStatus; product: { product_name: string } | null } | null;
}

export function useOpenJobCards(orgId?: string) {
  return useQuery({
    queryKey: openJobCardsKey(orgId),
    enabled: !!orgId,
    queryFn: async (): Promise<OpenJobCardRow[]> => {
      const { data, error } = await db
        .from("mfg_job_cards")
        .select(
          "id, lot_id, stage_id, worker_type, employee_id, supplier_id, worker_name, sent_qty, rate, sent_date, due_date, status, closed_short_qty, notes, " +
            "receipts:mfg_job_receipts(id, good_qty, rejected_qty, wasted_qty, reason, received_date), " +
            "lot:mfg_lots(lot_no, status, product:products(product_name))",
        )
        .eq("organization_id", orgId)
        .eq("status", "open")
        .order("sent_date", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return ((data || []) as OpenJobCardRow[]).map((c) => ({ ...c, receipts: c.receipts || [] }));
    },
  });
}
