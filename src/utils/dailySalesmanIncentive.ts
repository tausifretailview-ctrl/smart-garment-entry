/**
 * Daily salesman incentive — flat ₹ per unit from per-piece net brackets after a day qty gate.
 * Parallel to %-based salesman_commissions (do not mix).
 */

export type DailyIncentiveBracket = {
  min_net_amount: number;
  /** Exclusive upper bound when set; null = open-ended (≥ min). */
  max_net_amount: number | null;
  incentive_amount: number;
  sort_order?: number;
};

/** Extra ₹ once per bill. The highest min the bill reaches wins. */
export type DailyIncentiveBillSlab = {
  min_bill_amount: number;
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
 * Per-line incentive: bracket(per-piece net = line net / qty) × line qty.
 * A line of 2 × ₹900 is two ₹900 pieces (₹5 slab each), not one ₹1,800 sale.
 */
export function incentiveForLineItem(
  lineNet: number,
  qty: number,
  brackets: DailyIncentiveBracket[],
): number {
  const q = Number(qty) || 0;
  if (q <= 0) return 0;
  const perPieceNet = (Number(lineNet) || 0) / q;
  return incentiveForNetAmount(perPieceNet, brackets) * q;
}

/** Highest bill slab the net reaches. Empty slabs pay nothing. */
export function billSlabIncentive(
  billNet: number,
  slabs: DailyIncentiveBillSlab[],
): number {
  const net = Number(billNet);
  if (!Number.isFinite(net) || net < 0 || slabs.length === 0) return 0;
  const ordered = [...slabs].sort(
    (a, b) =>
      Number(b.min_bill_amount) - Number(a.min_bill_amount) ||
      (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  for (const slab of ordered) {
    if (net >= Number(slab.min_bill_amount)) return Number(slab.incentive_amount) || 0;
  }
  return 0;
}

/**
 * One salesman owns the bill bonus when every line resolves to the same person
 * (blank line salesman uses the bill header). Mixed salesmen get no bill bonus.
 */
export function billIncentiveOwner(
  headerSalesman: string | null | undefined,
  lineSalesmen: Array<string | null | undefined>,
): string {
  const names = new Set<string>();
  for (const line of lineSalesmen) {
    const name = resolveEffectiveLineSalesman(line, headerSalesman);
    if (name) names.add(name);
  }
  if (names.size === 1) return [...names][0];
  return "";
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
 * Blank salesman excluded. Bracket on each line's per-piece net × qty; day qty gate on sum of qty.
 */
export function aggregateDailySalesmanIncentive(params: {
  incentiveDateYmd: string;
  sales: SaleForDailyIncentive[];
  items: SaleItemForDailyIncentive[];
  employees: EmployeeNameRow[];
  qtyThreshold: number;
  brackets: DailyIncentiveBracket[];
  /** Omitted or empty: piece incentive only (ADEEBAAREEBA). */
  billSlabs?: DailyIncentiveBillSlab[];
}): DailyIncentiveComputedRow[] {
  const saleById = new Map<string, SaleForDailyIncentive>();
  for (const sale of params.sales) {
    if (sale.deleted_at || sale.is_cancelled) continue;
    saleById.set(sale.id, sale);
  }

  const billSlabs = params.billSlabs ?? [];
  type Acc = {
    employee_id: string | null;
    employee_name: string;
    qty: number;
    net: number;
    lineIncentive: number;
    billIncentive: number;
  };
  const byName = new Map<string, Acc>();
  const itemsBySale = new Map<string, SaleItemForDailyIncentive[]>();

  for (const item of params.items) {
    const sale = saleById.get(item.sale_id);
    if (!sale) continue;
    const qty = Number(item.quantity) || 0;
    if (qty <= 0) continue;
    const name = resolveEffectiveLineSalesman(item.salesman, sale.salesman);
    if (!name) continue;

    const saleItems = itemsBySale.get(item.sale_id) || [];
    saleItems.push(item);
    itemsBySale.set(item.sale_id, saleItems);
    const lineNet = lineNetForDailyIncentive(item);
    const lineIncentive = incentiveForLineItem(lineNet, qty, params.brackets);

    const emp = findEmployeeBySalesmanName(params.employees, name);
    const existing = byName.get(name) || {
      employee_id: emp?.id ?? null,
      employee_name: name,
      qty: 0,
      net: 0,
      lineIncentive: 0,
      billIncentive: 0,
    };
    existing.qty += qty;
    existing.net += lineNet;
    existing.lineIncentive += lineIncentive;
    if (!existing.employee_id && emp) existing.employee_id = emp.id;
    byName.set(name, existing);
  }

  if (billSlabs.length > 0) {
    for (const sale of saleById.values()) {
      const lines = itemsBySale.get(sale.id) || [];
      const owner = billIncentiveOwner(
        sale.salesman,
        lines.map((line) => line.salesman),
      );
      if (!owner) continue;
      const bonus = billSlabIncentive(Number(sale.net_amount) || 0, billSlabs);
      if (bonus <= 0) continue;
      const emp = findEmployeeBySalesmanName(params.employees, owner);
      const existing = byName.get(owner) || {
        employee_id: emp?.id ?? null,
        employee_name: owner,
        qty: 0,
        net: 0,
        lineIncentive: 0,
        billIncentive: 0,
      };
      existing.billIncentive += bonus;
      if (!existing.employee_id && emp) existing.employee_id = emp.id;
      byName.set(owner, existing);
    }
  }

  return [...byName.values()]
    .map((acc) => {
      const { isEligible, incentiveAmount } = computeDailyIncentiveAmount({
        totalQty: acc.qty,
        lineIncentiveTotal: acc.lineIncentive + acc.billIncentive,
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
/** ADEEBA AREEBA STUDIO (slug adeeba-areeba-studio) — same incentive rules. */
export const ADEEBAAREEBA_STUDIO_ORG_ID = "0dac440f-e962-4f27-a38d-71c81f9c52b7";

export const DAILY_INCENTIVE_UI_ORG_IDS = [
  ADEEBAAREEBA_ORG_ID,
  ADEEBAAREEBA_STUDIO_ORG_ID,
] as const;

/** REHMANI NX (slug rahmani-nx). Seed target only — settings stay editable. */
export const REHMANI_NX_ORG_ID = "e2e13e68-784e-42d1-a461-df2fd5beb963";

/** ADEEBAAREEBA piece brackets stay fixed. Other orgs edit their own rows. */
export function isAdeebaDailyIncentiveOrg(organizationId: string | null | undefined): boolean {
  return (DAILY_INCENTIVE_UI_ORG_IDS as readonly string[]).includes(organizationId ?? "");
}

export function incentiveSettingsAreEditable(organizationId: string | null | undefined): boolean {
  return Boolean(organizationId) && !isAdeebaDailyIncentiveOrg(organizationId);
}

/** Daily incentive tab is available in every organization. */
export function isDailyIncentiveUiOrg(organizationId: string | null | undefined): boolean {
  return Boolean(organizationId);
}

/** Flat ₹/piece when the org has a single open bracket from ₹0. */
export function flatPerPieceAmount(brackets: DailyIncentiveBracket[]): number | null {
  if (brackets.length !== 1) return null;
  const bracket = brackets[0];
  if (Number(bracket.min_net_amount) !== 0) return null;
  if (bracket.max_net_amount != null) return null;
  return Number(bracket.incentive_amount) || 0;
}

export function describeDailyIncentiveRules(config: {
  qtyThreshold: number;
  brackets: DailyIncentiveBracket[];
  billSlabs?: DailyIncentiveBillSlab[];
}): string {
  const qty = Number(config.qtyThreshold) || 0;
  const gate = `Day qty ≥ ${qty} required (sum across all lines that day).`;
  const orderedBrackets = [...config.brackets].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.min_net_amount - b.min_net_amount,
  );
  const bracketText = orderedBrackets
    .map((b) => {
      const min = Number(b.min_net_amount);
      const max = b.max_net_amount == null ? null : Number(b.max_net_amount);
      const range =
        max == null
          ? `≥₹${min.toLocaleString("en-IN")}`
          : `₹${min.toLocaleString("en-IN")}–${(max - 0.01).toLocaleString("en-IN")}`;
      return `${range}→₹${Number(b.incentive_amount)}/unit`;
    })
    .join(" · ");
  const slabs = [...(config.billSlabs ?? [])].sort(
    (a, b) => Number(a.min_bill_amount) - Number(b.min_bill_amount),
  );
  if (slabs.length === 0) {
    return `${gate} Per line: bracket on price per piece (line net after discount ÷ qty), flat ₹ × line qty; day incentive = Σ lines. Brackets: ${bracketText}.`;
  }
  const flat = flatPerPieceAmount(config.brackets);
  const piece =
    flat == null
      ? `Piece rates: ${bracketText}.`
      : `₹${flat.toLocaleString("en-IN")} per piece.`;
  const slabText = slabs
    .map(
      (slab) =>
        `≥₹${Number(slab.min_bill_amount).toLocaleString("en-IN")} → ₹${Number(slab.incentive_amount).toLocaleString("en-IN")}`,
    )
    .join(", ");
  return `${gate} ${piece} Extra once per bill (one salesman on the bill): ${slabText}. The highest matching bill slab is used. The day quantity gate applies to the total.`;
}
