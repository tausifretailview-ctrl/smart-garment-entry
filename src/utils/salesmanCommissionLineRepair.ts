/**
 * ADEEBAAREEBA books one salesman_commissions row per sale line, but the row
 * was stored under the bill header. Qty on the commission screen is that
 * line's quantity, so another salesman's pieces showed on the header.
 *
 * Repair moves the row onto the line salesman. Amount and payment status stay.
 * Tag: [commission_line_salesman_repair_20261004]
 */
import { resolveEffectiveLineSalesman } from "@/utils/dailySalesmanIncentive";

export const COMMISSION_LINE_SALESMAN_REPAIR_TAG = "[commission_line_salesman_repair_20261004]";

/** ADEEBAAREEBA (slug adeebaareeba). Studio is a separate org and is not rewritten. */
export const ADEEBAAREEBA_COMMISSION_REPAIR_ORG_ID = "b230c582-4f0b-420f-b18b-bef26c2f5ce8";

const AMOUNT_EPS = 0.05;

export type CommissionLineMoney = {
  line_total?: number | null;
  discount_share?: number | null;
  net_after_discount?: number | null;
};

/** Same net the POS commission insert stores on sale_amount. */
export function commissionLineNet(item: CommissionLineMoney): number {
  const netAfter = Number(item.net_after_discount);
  if (Number.isFinite(netAfter) && netAfter > 0) {
    return Math.round(netAfter * 100) / 100;
  }
  const gross = Number(item.line_total) || 0;
  const discount = Number(item.discount_share) || 0;
  return Math.round(Math.max(0, gross - discount) * 100) / 100;
}

export type CommissionRepairSource = {
  id: string;
  sale_id?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  sale_amount?: number | null;
  employee_name?: string | null;
  employee_id?: string | null;
  notes?: string | null;
  payment_status?: string | null;
  commission_amount?: number | null;
};

export type CommissionRepairLine = CommissionLineMoney & {
  id: string;
  sale_id: string;
  product_id?: string | null;
  product_name?: string | null;
  quantity?: number | null;
  salesman?: string | null;
  /** sales.salesman — used when the line salesman is blank. */
  headerSalesman?: string | null;
};

export type CommissionRepairChange = {
  id: string;
  saleId: string;
  fromEmployeeName: string;
  toEmployeeName: string;
  toEmployeeId: string | null;
  saleAmount: number;
  commissionAmount: number | null;
  paymentStatus: string | null;
  quantity: number;
  notes: string;
};

function trim(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function namesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return trim(a) === trim(b);
}

function productCompatible(
  commission: Pick<CommissionRepairSource, "product_id" | "product_name">,
  line: Pick<CommissionRepairLine, "product_id" | "product_name">,
): boolean {
  const commissionProduct = trim(commission.product_id);
  const lineProduct = trim(line.product_id);
  if (commissionProduct && lineProduct && commissionProduct === lineProduct) return true;
  const commissionName = trim(commission.product_name).toLowerCase();
  const lineName = trim(line.product_name).toLowerCase();
  return Boolean(commissionName) && commissionName === lineName;
}

function amountClose(commission: CommissionRepairSource, line: CommissionRepairLine): boolean {
  return Math.abs(commissionLineNet(line) - (Number(commission.sale_amount) || 0)) <= AMOUNT_EPS;
}

/**
 * Pair one commission row to one unused sale line on the same bill.
 * Prefer the line already attributed to this employee, then the line whose
 * net matches sale_amount, so two sizes of one product do not swap qty.
 */
export function takeUnusedSaleLine<T extends CommissionRepairLine>(
  commission: CommissionRepairSource,
  lines: T[],
  used: WeakSet<object>,
): T | null {
  const saleId = commission.sale_id || "";
  const pool = lines.filter(
    (line) => line.sale_id === saleId && productCompatible(commission, line) && !used.has(line),
  );
  if (pool.length === 0) return null;
  const employee = trim(commission.employee_name);
  const byPerson = employee
    ? pool.filter((line) => {
        const name = resolveEffectiveLineSalesman(line.salesman, line.headerSalesman);
        return name !== "" && namesEqual(name, employee);
      })
    : [];
  const chosen =
    byPerson.find((line) => amountClose(commission, line)) ||
    byPerson[0] ||
    pool.find((line) => amountClose(commission, line)) ||
    pool[0];
  used.add(chosen);
  return chosen;
}

function withRepairTag(notes: string | null | undefined): string {
  const current = trim(notes);
  if (current.includes(COMMISSION_LINE_SALESMAN_REPAIR_TAG)) return current;
  return current
    ? `${current} ${COMMISSION_LINE_SALESMAN_REPAIR_TAG}`
    : COMMISSION_LINE_SALESMAN_REPAIR_TAG;
}

/**
 * Rows whose stored salesman is the bill header, while the piece belongs to
 * the line salesman. Commission rupees and paid/pending are not recalculated.
 */
export function planCommissionLineSalesmanRepair(
  commissions: CommissionRepairSource[],
  lines: CommissionRepairLine[],
  employees: Array<{ id: string; employee_name: string }>,
): CommissionRepairChange[] {
  const used = new WeakSet<object>();
  const changes: CommissionRepairChange[] = [];
  const ordered = [...commissions].sort((a, b) => a.id.localeCompare(b.id));
  for (const commission of ordered) {
    const line = takeUnusedSaleLine(commission, lines, used);
    if (!line) continue;
    const toName = resolveEffectiveLineSalesman(line.salesman, line.headerSalesman);
    const fromName = trim(commission.employee_name);
    if (!toName || namesEqual(toName, fromName)) continue;
    const employee = employees.find((row) => namesEqual(row.employee_name, toName));
    changes.push({
      id: commission.id,
      saleId: line.sale_id,
      fromEmployeeName: fromName,
      toEmployeeName: toName,
      toEmployeeId: employee?.id ?? null,
      saleAmount: Number(commission.sale_amount) || 0,
      commissionAmount:
        commission.commission_amount == null ? null : Number(commission.commission_amount),
      paymentStatus: commission.payment_status ?? null,
      quantity: Number(line.quantity) || 0,
      notes: withRepairTag(commission.notes),
    });
  }
  return changes;
}

type CommissionProductInfo = {
  brand?: string | null;
  category?: string | null;
  style?: string | null;
};

type CommissionRule = {
  employee_id: string;
  rule_type: string;
  rule_value?: string | null;
  commission_percent: number;
};

type CommissionEmployee = {
  id: string;
  employee_name: string;
  commission_percent?: number | null;
};

export type CommissionInsertLine = CommissionLineMoney & {
  product_id?: string | null;
  product_name?: string | null;
  salesman?: string | null;
};

export type SalesmanCommissionInsert = {
  organization_id: string;
  employee_id: string;
  employee_name: string;
  sale_id: string;
  sale_number: string;
  sale_date: string;
  customer_name: string;
  product_id?: string | null;
  product_name?: string | null;
  brand: string | null;
  category: string | null;
  style: string | null;
  sale_amount: number;
  commission_percent: number;
  commission_amount: number;
  rule_type: string;
  payment_status: "pending";
};

function rateForEmployee(
  item: CommissionInsertLine,
  employee: CommissionEmployee,
  rules: CommissionRule[],
  product: CommissionProductInfo | undefined,
): { rate: number; ruleType: string } {
  const employeeRules = rules.filter((rule) => rule.employee_id === employee.id);
  const productRule = employeeRules.find(
    (rule) => rule.rule_type === "product" && rule.rule_value === item.product_id,
  );
  if (productRule) return { rate: productRule.commission_percent, ruleType: "product" };
  const styleRule = employeeRules.find(
    (rule) =>
      rule.rule_type === "style" &&
      trim(rule.rule_value).toLowerCase() === trim(product?.style).toLowerCase() &&
      trim(product?.style) !== "",
  );
  if (styleRule) return { rate: styleRule.commission_percent, ruleType: "style" };
  const brandRule = employeeRules.find(
    (rule) =>
      rule.rule_type === "brand" &&
      trim(rule.rule_value).toLowerCase() === trim(product?.brand).toLowerCase() &&
      trim(product?.brand) !== "",
  );
  if (brandRule) return { rate: brandRule.commission_percent, ruleType: "brand" };
  const categoryRule = employeeRules.find(
    (rule) =>
      rule.rule_type === "category" &&
      trim(rule.rule_value).toLowerCase() === trim(product?.category).toLowerCase() &&
      trim(product?.category) !== "",
  );
  if (categoryRule) return { rate: categoryRule.commission_percent, ruleType: "category" };
  const defaultRule = employeeRules.find((rule) => rule.rule_type === "default");
  return {
    rate: defaultRule?.commission_percent ?? employee.commission_percent ?? 1,
    ruleType: "default",
  };
}

/**
 * One commission row per sale line, under that line's salesman (else the header).
 * A line sold by someone else is not booked to the bill header.
 */
export function buildSalesmanCommissionRecords(input: {
  organizationId: string;
  saleId: string;
  saleNumber: string;
  saleDate: string;
  customerName: string;
  headerSalesman: string;
  totalNetAmount: number;
  items: CommissionInsertLine[];
  productsById: Record<string, CommissionProductInfo>;
  employees: CommissionEmployee[];
  rules: CommissionRule[];
}): SalesmanCommissionInsert[] {
  const customerName = trim(input.customerName) || "Walk-in Customer";
  const base = {
    organization_id: input.organizationId,
    sale_id: input.saleId,
    sale_number: input.saleNumber,
    sale_date: input.saleDate,
    customer_name: customerName,
    payment_status: "pending" as const,
  };

  if (input.items.length === 0) {
    const header = trim(input.headerSalesman);
    const employee = input.employees.find((row) => namesEqual(row.employee_name, header));
    if (!employee) return [];
    const { rate, ruleType } = rateForEmployee({}, employee, input.rules, undefined);
    const net = Math.round((Number(input.totalNetAmount) || 0) * 100) / 100;
    return [
      {
        ...base,
        employee_id: employee.id,
        employee_name: header,
        brand: null,
        category: null,
        style: null,
        sale_amount: net,
        commission_percent: rate,
        commission_amount: Math.round(((net * rate) / 100) * 100) / 100,
        rule_type: ruleType,
      },
    ];
  }

  const records: SalesmanCommissionInsert[] = [];
  for (const item of input.items) {
    const name = resolveEffectiveLineSalesman(item.salesman, input.headerSalesman);
    const employee = input.employees.find((row) => namesEqual(row.employee_name, name));
    if (!employee || !name) continue;
    const product = item.product_id ? input.productsById[item.product_id] : undefined;
    const { rate, ruleType } = rateForEmployee(item, employee, input.rules, product);
    const net = commissionLineNet(item);
    records.push({
      ...base,
      employee_id: employee.id,
      employee_name: name,
      product_id: item.product_id ?? null,
      product_name: item.product_name ?? null,
      brand: product?.brand || null,
      category: product?.category || null,
      style: product?.style || null,
      sale_amount: net,
      commission_percent: rate,
      commission_amount: Math.round(((net * rate) / 100) * 100) / 100,
      rule_type: ruleType,
    });
  }
  return records;
}
