import { isSaleReturnAdjustBakedIntoNet, type PosDashboardSaleLike } from "@/utils/posDashboardSettlement";

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export type SaleBillRow = PosDashboardSaleLike & {
  items_gross?: number | null;
};

/**
 * One reading of a sale for screens and exports.
 * Old POS rows baked sale-return into net_amount. Rule B rows keep the full bill
 * in net and store the return as sale_return_adjust. Payable is what the customer owes
 * before tender in both cases.
 */
export function saleBillFigures(sale: SaleBillRow): {
  baked: boolean;
  billAmount: number;
  payable: number;
  saleReturnAdjust: number;
} {
  const net = round2(Number(sale.net_amount) || 0);
  const saleReturnAdjust = round2(Math.max(0, Number(sale.sale_return_adjust) || 0));
  const baked = saleReturnAdjust > 0.01 && isSaleReturnAdjustBakedIntoNet(sale);
  if (baked) {
    return {
      baked: true,
      billAmount: round2(net + saleReturnAdjust),
      payable: net,
      saleReturnAdjust,
    };
  }
  return {
    baked: false,
    billAmount: net,
    payable: round2(net - saleReturnAdjust),
    saleReturnAdjust,
  };
}

/** Customer still owes this after tender. */
export function saleReceivableAfterTender(sale: SaleBillRow): number {
  const paid = round2(Math.max(0, Number(sale.paid_amount) || 0));
  return round2(Math.max(0, saleBillFigures(sale).payable - paid));
}

/**
 * Print merchandise base. Callers that pass `billNetAmount` already split
 * bill and payable, so sale-return is not added onto grand total again.
 */
export function printBillNetAmount(params: {
  grandTotal: number;
  saleReturnAdjust?: number | null;
  billNetAmount?: number | null;
}): number {
  if (params.billNetAmount != null && Number.isFinite(Number(params.billNetAmount))) {
    return round2(Number(params.billNetAmount));
  }
  return round2(Number(params.grandTotal || 0) + Number(params.saleReturnAdjust || 0));
}
