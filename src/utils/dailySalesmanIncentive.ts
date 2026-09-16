/**
 * Daily salesman incentive — flat ₹ per unit from line-net brackets after a day qty gate.
 * Parallel to %-based salesman_commissions (do not mix).
 */

export type DailyIncentiveBracket = {
  min_net_amount: number;
  /** Exclusive upper bound when set; null = open-ended (≥ min). */
  max_net_amount: number | null;
  incentive_amount: number;
  sort_order?: number;
};

export type SaleForDailyIncentive = {
  id: string;
  salesman: string | null;
  net_amount: number | null;
  sale_date: string;
  deleted_at?: string | null;
  is_cancelled?: boolean | null;
};

export type SaleItemForDailyIncentive = {
  sale_id: string;
  quantity: number | null;
  line_total: number | null;
  net_after_discount?: number | null;
  /** Per-line override; falls back to sale.salesman when null/blank. */
  salesman?: string | null;
};

export type EmployeeNameRow = {
  id: string;
  employee_name: string;
};

export type DailyIncentiveComputedRow = {
  employee_id: string | null;
  employee_name: string;
  incentive_date: string;
  total_qty: number;
  total_net_amount: number;
  is_eligible: boolean;
  incentive_amount: number;
};

/**
 * Same matching used by POS createCommissionRecords:
 * employees.find((e) => e.employee_name === salesmanName)
 */
export function findEmployeeBySalesmanName<T extends { employee_name: string }>(
  employees: T[],
  salesmanName: string | null | undefined,
): T | undefined {
  if (!salesmanName) return undefined;
  return employees.find((e) => e.employee_name === salesmanName);
}

/** Line attribution: per-line override, else bill header (backward-compatible). */
export function resolveEffectiveLineSalesman(
  lineSalesman: string | null | undefined,
  headerSalesman: string | null | undefined,
): string {
  const line = (lineSalesman ?? "").trim();
  if (line) return line;
  return (headerSalesman ?? "").trim();
}

/** Line net after discount — prefer net_after_discount, else line_total. */
export function lineNetForDailyIncentive(
  item: Pick<SaleItemForDailyIncentive, "line_total" | "net_after_discount">,
): number {
  const nad = item.net_after_discount;
  if (nad != null && Number.isFinite(Number(nad))) {
    return Math.max(0, Number(nad));
  }
  return Math.max(0, Number(item.line_total) || 0);
}

/** Half-open brackets: min inclusive, max exclusive (null max = no upper bound). */
export function incentiveForNetAmount(
  netAmount: number,
  brackets: DailyIncentiveBracket[],
): number {
  const net = Number(netAmount);
  if (!Number.isFinite(net) || net < 0) return 0;
  const ordered = [...brackets].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.min_net_amount - b.min_net_amount,
  );
  for (const b of ordered) {
    const min = Number(b.min_net_amount);
    const max = b.max_net_amount == null ? null : Number(b.max_net_amount);
    if (net >= min && (max == null || net < max)) {
      return Number(b.incentive_amount) || 0;
    }
  }
  return 0;
}

/**
 * Per-line incentive: bracket(full line net) × line qty.
 * Bracket uses the FULL line net — never net/qty.
 */
export function incentiveForLineItem(
  lineNet: number,
  qty: number,
  brackets: DailyIncentiveBracket[],
): number {
  const q = Number(qty) || 0;
  if (q <= 0) return 0;
  return incentiveForNetAmount(lineNet, brackets) * q;
}

export function computeDailyIncentiveAmount(params: {
  totalQty: number;
  lineIncentiveTotal: number;
  qtyThreshold: number;
}): { isEligible: boolean; incentiveAmount: number } {
  const qty = Number(params.totalQty) || 0;
  const threshold = Number(params.qtyThreshold) || 0;
  const lineTotal = Math.max(0, Number(params.lineIncentiveTotal) || 0);
  if (qty < threshold) {
    return { isEligible: false, incentiveAmount: 0 };
  }
  return {
    isEligible: true,
    incentiveAmount: lineTotal,
  };
}

/**
 * Aggregate sale_items for one IST calendar day into per-salesman rows.
 * Blank salesman excluded. Bracket on each line's full net × qty; day qty gate on sum of qty.
 */
export function aggregateDailySalesmanIncentive(params: {
  incentiveDateYmd: string;
  sales: SaleForDailyIncentive[];
  items: SaleItemForDailyIncentive[];
  employees: EmployeeNameRow[];
  qtyThreshold: number;
  brackets: DailyIncentiveBracket[];
}): DailyIncentiveComputedRow[] {
  const saleById = new Map<string, SaleForDailyIncentive>();
  for (const sale of params.sales) {
    if (sale.deleted_at || sale.is_cancelled) continue;
    saleById.set(sale.id, sale);
  }

  type Acc = {
    employee_id: string | null;
    employee_name: string;
    qty: number;
    net: number;
    lineIncentive: number;
  };
  const byName = new Map<string, Acc>();

  for (const item of params.items) {
    const sale = saleById.get(item.sale_id);
    if (!sale) continue;
    const name = resolveEffectiveLineSalesman(item.salesman, sale.salesman);
    if (!name) continue;

    const qty = Number(item.quantity) || 0;
    if (qty <= 0) continue;
    const lineNet = lineNetForDailyIncentive(item);
    const lineIncentive = incentiveForLineItem(lineNet, qty, params.brackets);

    const emp = findEmployeeBySalesmanName(params.employees, name);
    const existing = byName.get(name) || {
      employee_id: emp?.id ?? null,
      employee_name: name,
      qty: 0,
      net: 0,
      lineIncentive: 0,
    };
    existing.qty += qty;
    existing.net += lineNet;
    existing.lineIncentive += lineIncentive;
    if (!existing.employee_id && emp) existing.employee_id = emp.id;
    byName.set(name, existing);
  }

  return [...byName.values()]
    .map((acc) => {
      const { isEligible, incentiveAmount } = computeDailyIncentiveAmount({
        totalQty: acc.qty,
        lineIncentiveTotal: acc.lineIncentive,
        qtyThreshold: params.qtyThreshold,
      });
      return {
        employee_id: acc.employee_id,
        employee_name: acc.employee_name,
        incentive_date: params.incentiveDateYmd,
        total_qty: acc.qty,
        total_net_amount: Math.round(acc.net * 100) / 100,
        is_eligible: isEligible,
        incentive_amount: Math.round(incentiveAmount * 100) / 100,
      };
    })
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}

/** ADEEBAAREEBA (slug adeebaareeba) — UI gate until config row is loaded. */
export const ADEEBAAREEBA_ORG_ID = "b230c582-4f0b-420f-b18b-bef26c2f5ce8";

export function isDailyIncentiveUiOrg(organizationId: string | null | undefined): boolean {
  return organizationId === ADEEBAAREEBA_ORG_ID;
}
