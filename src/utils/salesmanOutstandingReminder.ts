import {
  reconcileSaleInvoiceWithSplit,
  type SaleReceiptVoucherSplit,
} from "@/utils/customerBalanceUtils";

/** WhatsApp lists whole rupees; hide anything under ₹1. */
export const REMINDER_PENDING_MIN_RUPEE = 1;

export type OutstandingReminderSale = {
  id: string;
  sale_number: string;
  sale_date: string;
  net_amount?: number | null;
  paid_amount?: number | null;
  payment_status?: string | null;
  sale_return_adjust?: number | null;
  cash_amount?: number | null;
  card_amount?: number | null;
  upi_amount?: number | null;
  discount_amount?: number | null;
  flat_discount_amount?: number | null;
};

export type OutstandingReminderInvoice = {
  id: string;
  sale_number: string;
  sale_date: string;
  net_amount: number;
  paid_amount: number;
  balance: number;
  days_overdue: number;
  discount_amount: number;
};

const emptySplit = (): SaleReceiptVoucherSplit => ({
  cash: 0,
  cn: 0,
  adv: 0,
  discount: 0,
});

export function isExcludedFromOutstandingReminder(status?: string | null): boolean {
  const s = String(status || "").toLowerCase();
  return s === "cancelled" || s === "hold" || s === "completed";
}

export function outstandingReminderBalance(params: {
  sale: OutstandingReminderSale;
  split?: SaleReceiptVoucherSplit | null;
  itemsGross?: number | null;
}): { balance: number; paid_amount: number } {
  const { sale, split, itemsGross } = params;
  if (isExcludedFromOutstandingReminder(sale.payment_status)) {
    return { balance: 0, paid_amount: Number(sale.paid_amount || 0) };
  }

  const rec = reconcileSaleInvoiceWithSplit(
    {
      net_amount: sale.net_amount,
      sale_return_adjust: sale.sale_return_adjust,
      paid_amount: sale.paid_amount,
      cash_amount: sale.cash_amount,
      card_amount: sale.card_amount,
      upi_amount: sale.upi_amount,
      items_gross: itemsGross ?? null,
    },
    split ?? emptySplit(),
  );

  return {
    balance: Math.max(0, Math.round(rec.outstanding)),
    paid_amount: rec.paid_amount,
  };
}

export function buildOutstandingReminderInvoices(params: {
  sales: OutstandingReminderSale[];
  splitBySale?: Map<string, SaleReceiptVoucherSplit>;
  itemsGrossBySale?: Map<string, number>;
  nowMs?: number;
}): OutstandingReminderInvoice[] {
  const now = params.nowMs ?? Date.now();
  const splitBySale = params.splitBySale ?? new Map();
  const itemsGrossBySale = params.itemsGrossBySale ?? new Map();

  return params.sales
    .map((sale) => {
      const rec = outstandingReminderBalance({
        sale,
        split: splitBySale.get(sale.id) ?? emptySplit(),
        itemsGross: itemsGrossBySale.get(sale.id) ?? null,
      });
      const saleDate = new Date(sale.sale_date);
      const daysOverdue = Number.isFinite(saleDate.getTime())
        ? Math.floor((now - saleDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      return {
        id: sale.id,
        sale_number: sale.sale_number,
        sale_date: sale.sale_date,
        net_amount: Number(sale.net_amount || 0),
        paid_amount: rec.paid_amount,
        balance: rec.balance,
        days_overdue: daysOverdue,
        discount_amount:
          (Number(sale.discount_amount) || 0) + (Number(sale.flat_discount_amount) || 0),
      };
    })
    .filter((inv) => inv.balance >= REMINDER_PENDING_MIN_RUPEE)
    .sort((a, b) => a.days_overdue - b.days_overdue);
}
