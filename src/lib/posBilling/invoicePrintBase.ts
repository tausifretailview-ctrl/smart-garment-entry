/**
 * Fields of the saved-bill print snapshot that are the same for every POS save path (F1–F5 and
 * Mix). Each path adds its own payment fields (amount paid, method, refund, mix breakdown…) on
 * top. Plan Phase 4: the two paths built these 25 fields by hand.
 */
import { resolvePosCustomerName } from "./buildSaleData";
import { posPrintSaleReturnAdjust, posPrintTotals } from "./printFigures";

export type PosInvoicePrintBaseInput<
  TItem,
  TTotals extends { mrp: number; subtotal: number; billAmount: number },
  TFirm,
  TFinancer,
  TTax,
  TCrm extends object,
> = {
  saleNumber: string;
  saleId: string;
  printFirm: TFirm | null | undefined;
  items: TItem[];
  totals: TTotals;
  flatDiscountAmount: number;
  saleReturnAdjust: number;
  creditApplied: number;
  customerName: string;
  customerPhone: string;
  customerId: string;
  /** The bill's customer row, when there is one. */
  customer?: { address?: string | null; gst_number?: string | null; transport_details?: string | null } | null;
  roundOff: number;
  notes: string | null | undefined;
  /** Account facets for the print (balance before this bill, unused advance). */
  previousBalance: number;
  unusedAdvance: number;
  pointsRedemptionValue: number;
  /** CRM points lines, already resolved for print. */
  crmPoints: TCrm;
  cashAmount: number | null | undefined;
  upiAmount: number | null | undefined;
  cardAmount: number | null | undefined;
  salesman: string | null | undefined;
  taxType: TTax;
  financerDetails: TFinancer | null | undefined;
};

export function buildPosInvoicePrintBase<
  TItem,
  TTotals extends { mrp: number; subtotal: number; billAmount: number },
  TFirm,
  TFinancer,
  TTax,
  TCrm extends object,
>(i: PosInvoicePrintBaseInput<TItem, TTotals, TFirm, TFinancer, TTax, TCrm>) {
  return {
    invoiceNumber: i.saleNumber,
    saleId: i.saleId,
    printFirm: i.printFirm ?? null,
    items: i.items,
    totals: posPrintTotals(i.totals),
    flatDiscountAmount: i.flatDiscountAmount,
    saleReturnAdjust: posPrintSaleReturnAdjust(i.saleReturnAdjust, i.creditApplied),
    billNetAmount: i.totals.billAmount,
    customerName: resolvePosCustomerName(i.customerName),
    customerPhone: i.customerPhone,
    customerId: i.customerId,
    customerAddress: i.customer?.address || "",
    customerGstNumber: i.customer?.gst_number || "",
    customerTransportDetails: i.customer?.transport_details || "",
    roundOff: i.roundOff,
    creditApplied: i.creditApplied,
    notes: i.notes || null,
    previousBalance: i.previousBalance,
    unusedAdvance: i.unusedAdvance,
    pointsRedemptionValue: i.pointsRedemptionValue,
    ...i.crmPoints,
    cashAmount: i.cashAmount || 0,
    upiAmount: i.upiAmount || 0,
    cardAmount: i.cardAmount || 0,
    salesman: i.salesman || null,
    taxType: i.taxType,
    financerDetails: i.financerDetails || null,
  };
}
