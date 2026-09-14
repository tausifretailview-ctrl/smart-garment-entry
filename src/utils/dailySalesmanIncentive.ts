/**
 * Daily salesman incentive — flat ₹ brackets after a qty gate.
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

export type SaleItemQtyRow = {
  sale_id: string;
  quantity: number | null;
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

export function computeDailyIncentiveAmount(params: {
  totalQty: number;
  totalNetAmount: number;
  qtyThreshold: number;
  brackets: DailyIncentiveBracket[];
}): { isEligible: boolean; incentiveAmount: number } {
  const qty = Number(params.totalQty) || 0;
  const net = Number(params.totalNetAmount) || 0;
  const threshold = Number(params.qtyThreshold) || 0;
  if (qty < threshold) {
    return { isEligible: false, incentiveAmount: 0 };
  }
  return {
    isEligible: true,
    incentiveAmount: incentiveForNetAmount(net, params.brackets),
  };
}

/**
 * Aggregate sales for one IST calendar day into per-salesman rows.
 * Blank salesman excluded. Qty from sale_items; value from sales.net_amount.
 */
export function aggregateDailySalesmanIncentive(params: {
  incentiveDateYmd: string;
  sales: SaleForDailyIncentive[];
  items: SaleItemQtyRow[];
  employees: EmployeeNameRow[];
  qtyThreshold: number;
  brackets: DailyIncentiveBracket[];
}): DailyIncentiveComputedRow[] {
  const qtyBySale = new Map<string, number>();
  for (const item of params.items) {
    const q = Number(item.quantity) || 0;
    qtyBySale.set(item.sale_id, (qtyBySale.get(item.sale_id) || 0) + q);
  }

  type Acc = { employee_id: string | null; employee_name: string; qty: number; net: number };
  const byName = new Map<string, Acc>();

  for (const sale of params.sales) {
    if (sale.deleted_at) continue;
    if (sale.is_cancelled) continue;
    const name = (sale.salesman || "").trim();
    if (!name) continue;

    const emp = findEmployeeBySalesmanName(params.employees, name);
    const existing = byName.get(name) || {
      employee_id: emp?.id ?? null,
      employee_name: name,
      qty: 0,
      net: 0,
    };
    existing.qty += qtyBySale.get(sale.id) || 0;
    existing.net += Number(sale.net_amount) || 0;
    if (!existing.employee_id && emp) existing.employee_id = emp.id;
    byName.set(name, existing);
  }

  return [...byName.values()]
    .map((acc) => {
      const { isEligible, incentiveAmount } = computeDailyIncentiveAmount({
        totalQty: acc.qty,
        totalNetAmount: acc.net,
        qtyThreshold: params.qtyThreshold,
        brackets: params.brackets,
      });
      return {
        employee_id: acc.employee_id,
        employee_name: acc.employee_name,
        incentive_date: params.incentiveDateYmd,
        total_qty: acc.qty,
        total_net_amount: Math.round(acc.net * 100) / 100,
        is_eligible: isEligible,
        incentive_amount: incentiveAmount,
      };
    })
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}

/** ADEEBAAREEBA (slug adeebaareeba) — UI gate until config row is loaded. */
export const ADEEBAAREEBA_ORG_ID = "b230c582-4f0b-420f-b18b-bef26c2f5ce8";

export function isDailyIncentiveUiOrg(organizationId: string | null | undefined): boolean {
  return organizationId === ADEEBAAREEBA_ORG_ID;
}
