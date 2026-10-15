/**
 * Supplier-ledger transaction list — moved VERBATIM from the `SupplierLedger.tsx`
 * `supplier-transactions` queryFn so the Payment Flow page shows the same rows
 * and running balance. Do not "simplify": the supplier ledger output is the spec.
 */
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { voucherSettlementCredit } from "@/utils/paymentSettlementBreakdown";
import {
  supplierCreditNoteLedgerDebit,
  supplierCreditNoteLedgerDescriptionFromCn,
} from "@/utils/purchaseSupplierLedgerCn";
import { buildAppliedReturnAdjustByBillIdMap } from "@/utils/purchaseBillReturnAdjust";
import { linkedBillDisplayNo } from "@/utils/purchaseReturnCnDisplay";

export type SupplierLedgerTab = 'all' | 'payments' | 'cn-adjusted' | 'cn-pending';

export interface SupplierLedgerTransaction {
  id: string;
  date: string;
  type: 'bill' | 'payment' | 'credit_note' | 'purchase_return';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  /** Which detail tab this row belongs to (besides "all"). */
  category?: Exclude<SupplierLedgerTab, 'all'>;
}

type Transaction = SupplierLedgerTransaction;

export async function fetchSupplierLedgerTransactions(
  organizationId: string,
  selectedSupplier: { id: string; opening_balance?: number | null },
  startDate?: Date,
  endDate?: Date,
): Promise<SupplierLedgerTransaction[]> {
  // Build date filter for displayed bills
  let billsQuery = supabase
    .from("purchase_bills")
    .select("*")
    .eq("supplier_id", selectedSupplier.id)
    .is("deleted_at", null)
    .or("is_cancelled.is.null,is_cancelled.eq.false");

  if (startDate) {
    billsQuery = billsQuery.gte("bill_date", format(startDate, 'yyyy-MM-dd'));
  }
  if (endDate) {
    billsQuery = billsQuery.lte("bill_date", format(endDate, 'yyyy-MM-dd'));
  }

  const { data: billsData, error: billsError } = await billsQuery.order("bill_date", { ascending: true });

  if (billsError) throw billsError;

  // Fetch voucher payments for this supplier
  let vouchersQuery = supabase
    .from("voucher_entries")
    .select("*")
    .eq("reference_type", "supplier")
    .eq("voucher_type", "payment")
    .is("deleted_at", null);

  // Get all bill IDs for this supplier to find related payments
  const { data: allBills } = await supabase
    .from("purchase_bills")
    .select("id")
    .eq("supplier_id", selectedSupplier.id)
    .is("deleted_at", null)
    .or("is_cancelled.is.null,is_cancelled.eq.false");

  const billIds = allBills?.map(b => b.id) || [];
  const billById = new Map(
    (billsData || []).map((b: any) => [
      b.id,
      { software_bill_no: b.software_bill_no, supplier_invoice_no: b.supplier_invoice_no },
    ])
  );

  if (billIds.length > 0) {
    vouchersQuery = vouchersQuery.in("reference_id", billIds);
  } else {
    vouchersQuery = vouchersQuery.eq("reference_id", "00000000-0000-0000-0000-000000000000");
  }

  if (startDate) {
    vouchersQuery = vouchersQuery.gte("voucher_date", format(startDate, 'yyyy-MM-dd'));
  }
  if (endDate) {
    vouchersQuery = vouchersQuery.lte("voucher_date", format(endDate, 'yyyy-MM-dd'));
  }

  const { data: vouchersData, error: vouchersError } = await vouchersQuery.order("voucher_date", { ascending: true });

  if (vouchersError) throw vouchersError;

  // Also fetch opening balance payments (reference_id = supplier_id)
  let openingBalanceQuery = supabase
    .from("voucher_entries")
    .select("*")
    .eq("reference_type", "supplier")
    .eq("reference_id", selectedSupplier.id)
    .eq("voucher_type", "payment")
    .is("deleted_at", null);

  if (startDate) {
    openingBalanceQuery = openingBalanceQuery.gte("voucher_date", format(startDate, 'yyyy-MM-dd'));
  }
  if (endDate) {
    openingBalanceQuery = openingBalanceQuery.lte("voucher_date", format(endDate, 'yyyy-MM-dd'));
  }

  const { data: openingBalancePayments, error: openingError } = await openingBalanceQuery.order("voucher_date", { ascending: true });

  if (openingError) throw openingError;

  // Fetch credit notes for this supplier
  let creditNotesQuery = supabase
    .from("voucher_entries")
    .select("id, voucher_number, voucher_date, description, total_amount")
    .eq("reference_type", "supplier")
    .eq("reference_id", selectedSupplier.id)
    .eq("voucher_type", "credit_note")
    .is("deleted_at", null);

  if (startDate) {
    creditNotesQuery = creditNotesQuery.gte("voucher_date", format(startDate, 'yyyy-MM-dd'));
  }
  if (endDate) {
    creditNotesQuery = creditNotesQuery.lte("voucher_date", format(endDate, 'yyyy-MM-dd'));
  }

  const { data: creditNotesData, error: creditNotesError } = await creditNotesQuery.order("voucher_date", { ascending: true });

  if (creditNotesError) throw creditNotesError;

  // Fetch purchase returns (direct, as fallback/supplement to credit_note vouchers).
  // Tiered SELECT: older org schemas may lack credit_available_balance/created_at.
  // A single hard select used to error silently here -> purchaseReturnsData = null ->
  // CN/return rows vanished from the ledger while the account balance (snapshot, which
  // has its own fallback) stayed correct. Hence "outstanding OK, but CN not showing".
  const prSelectTiers = [
    "id, return_number, return_date, net_amount, credit_status, credit_note_id, linked_bill_id, credit_available_balance, created_at",
    "id, return_number, return_date, net_amount, credit_status, credit_note_id, linked_bill_id, credit_available_balance",
    "id, return_number, return_date, net_amount, credit_status, credit_note_id, linked_bill_id",
    "id, return_number, return_date, net_amount, credit_status, credit_note_id",
  ];
  let purchaseReturnsData: any[] | null = null;
  for (const sel of prSelectTiers) {
    const res = await supabase
      .from("purchase_returns" as any)
      .select(sel)
      .eq("supplier_id", selectedSupplier.id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("return_date", { ascending: true });
    if (!res.error) {
      purchaseReturnsData = (res.data as any[]) || [];
      break;
    }
    console.warn("Supplier ledger: purchase_returns select failed, retrying simpler", res.error?.message);
  }
  purchaseReturnsData = purchaseReturnsData || [];

  // Only include purchase returns that have NO linked credit_note voucher
  const creditNoteVoucherIds = new Set((creditNotesData || []).map((cn: any) => cn.id));
  // Returns whose adjustment affects balance (already chosen by user)
  const unreflectedReturns = (purchaseReturnsData || []).filter((pr: any) =>
    (!pr.credit_note_id || !creditNoteVoucherIds.has(pr.credit_note_id)) &&
    ['adjusted', 'adjusted_outstanding', 'refunded'].includes(pr.credit_status)
  );
  // Pending returns: show informationally but do not affect running balance
  const pendingReturns = (purchaseReturnsData || []).filter((pr: any) =>
    (!pr.credit_note_id || !creditNoteVoucherIds.has(pr.credit_note_id)) &&
    (pr.credit_status === 'pending' || !pr.credit_status)
  );

  // Fetch refunds received from supplier (when CN is marked 'refunded')
  const { data: supplierRefunds } = await supabase
    .from('voucher_entries').select('*')
    .eq('reference_type', 'supplier').eq('reference_id', selectedSupplier.id)
    .eq('voucher_type', 'receipt').is('deleted_at', null)
    .order('voucher_date', { ascending: true });

  // Merge bill payments and opening balance payments
  // Skip legacy supplier-referenced vouchers whose description already names a specific bill
  // (those are now rendered via the bill row's "Payment at purchase" calc)
  const billRefs = (billsData || [])
    .map((b: any) => b.software_bill_no || b.supplier_invoice_no)
    .filter(Boolean);
  const trueOpeningPayments = (openingBalancePayments || []).filter((v: any) =>
    !billRefs.some((r: string) => (v.description || "").includes(r))
  );
  const allVouchers = [...(vouchersData || []), ...trueOpeningPayments];

  // Calculate total voucher payments per bill
  const voucherPaymentsByBillId: Record<string, number> = {};
  (vouchersData || []).forEach((voucher) => {
    if (voucher.reference_id) {
      voucherPaymentsByBillId[voucher.reference_id] =
        (voucherPaymentsByBillId[voucher.reference_id] || 0) + voucherSettlementCredit(voucher);
    }
  });

  // Return credit already written into bill.paid_amount but shown as its own
  // CN / purchase-return row below — must not be counted as cash paid.
  const returnAdjustByBillId = buildAppliedReturnAdjustByBillIdMap(purchaseReturnsData || []);

  // Combine and sort transactions
  const allTransactions: Transaction[] = [];
  
  // Start with opening balance
  const openingBalance = selectedSupplier.opening_balance || 0;
  let runningBalance = openingBalance;

  // Add opening balance as first entry if it exists
  if (openingBalance !== 0) {
    allTransactions.push({
      id: 'opening-balance',
      date: '1900-01-01',
      type: 'bill',
      reference: 'Opening',
      description: 'Opening Balance (Carried Forward)',
      debit: 0,
      credit: openingBalance,  // Supplier opening balance is a liability (credit)
      balance: runningBalance,
    });
  }

  // Merge bills, payments, and credit notes chronologically
  const combined = [
    ...(billsData || []).map((bill) => ({
      date: bill.bill_date,
      type: 'bill' as const,
      data: bill,
    })),
    ...allVouchers.map((voucher) => ({
      date: voucher.voucher_date,
      type: 'payment' as const,
      data: voucher,
    })),
    ...(creditNotesData || []).map((cn) => ({
      date: cn.voucher_date,
      type: 'credit_note' as const,
      data: cn,
    })),
    ...(supplierRefunds || []).map((r) => ({
      date: r.voucher_date,
      type: 'refund_received' as const,
      data: r,
    })),
    ...(unreflectedReturns || []).map((pr: any) => ({
      date: pr.return_date,
      type: 'purchase_return' as const,
      data: pr,
    })),
    ...(pendingReturns || []).map((pr: any) => ({
      date: pr.return_date,
      type: 'purchase_return_pending' as const,
      data: pr,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  combined.forEach((item) => {
    if (item.type === 'bill') {
      const bill = item.data as any;
      runningBalance += bill.net_amount;
      
      allTransactions.push({
        id: bill.id,
        date: bill.bill_date,
        type: 'bill',
        reference: bill.supplier_invoice_no || bill.software_bill_no || 'N/A',
        description: `Purchase Bill - ${bill.payment_status || 'pending'}`,
        debit: 0,
        credit: bill.net_amount,
        balance: runningBalance,
      });

      // Calculate payment at purchase (exclude amounts paid via vouchers)
      const totalPaidOnBill = bill.paid_amount || 0;
      const voucherPayments = voucherPaymentsByBillId[bill.id] || 0;
      const billRef = bill.software_bill_no || bill.supplier_invoice_no || '';
      const legacyVoucherPayments = billRef
        ? (openingBalancePayments || [])
            .filter((v: any) => (v.description || "").includes(billRef))
            .reduce((s: number, v: any) => s + voucherSettlementCredit(v), 0)
        : 0;
      const paidAtPurchase = Math.max(0, totalPaidOnBill - voucherPayments - legacyVoucherPayments);
      const returnAdjustOnBill = returnAdjustByBillId.get(bill.id) || 0;
      const cashAtPurchase = Math.max(0, paidAtPurchase - returnAdjustOnBill);
      
      if (cashAtPurchase > 0) {
        runningBalance -= cashAtPurchase;
        
        allTransactions.push({
          id: `${bill.id}-payment-at-purchase`,
          date: bill.bill_date,
          type: 'payment',
          reference: bill.supplier_invoice_no || bill.software_bill_no || 'N/A',
          description: 'Payment at purchase',
          debit: cashAtPurchase,
          credit: 0,
          balance: runningBalance,
          category: 'payments',
        });
      }
    } else if (item.type === 'credit_note') {
      const creditNote = item.data as any;
      const prLinked = (purchaseReturnsData || []).filter(
        (pr: any) => pr.credit_note_id === creditNote.id
      );
      const cnEffect = supplierCreditNoteLedgerDebit(
        Number(creditNote.total_amount) || 0,
        prLinked
      );
      runningBalance -= cnEffect;

      allTransactions.push({
        id: creditNote.id,
        date: creditNote.voucher_date,
        type: 'credit_note',
        reference: creditNote.voucher_number,
        description: supplierCreditNoteLedgerDescriptionFromCn(
          creditNote,
          prLinked,
          billById
        ),
        debit: cnEffect,
        credit: 0,
        balance: runningBalance,
        category: 'cn-adjusted',
      });
    } else if (item.type === 'refund_received') {
      // Money back from the supplier raises the payable again (the CN already lowered it).
      const r = item.data as any;
      const refundAmt = Number(r.total_amount) || 0;
      runningBalance += refundAmt;
      allTransactions.push({
        id: r.id,
        date: r.voucher_date,
        type: 'payment',
        reference: r.voucher_number,
        description: r.description || 'Refund Received from Supplier',
        debit: 0,
        credit: refundAmt,
        balance: runningBalance,
        category: 'payments',
      });
    } else if (item.type === 'purchase_return') {
      const pr = item.data as any;
      const amount = Number(pr.net_amount) || 0;
      runningBalance -= amount;

      let description = `Purchase Return - ${pr.return_number}`;
      const linkedBill = pr.linked_bill_id ? billById.get(pr.linked_bill_id) : null;
      const linkedLabel = linkedBillDisplayNo(linkedBill);
      if (pr.credit_status === 'adjusted_outstanding') description += ` (Adj. Outstanding)`;
      else if (pr.credit_status === 'adjusted' && linkedLabel) {
        description += ` (Adj. Against Bill ${linkedLabel})`;
      } else if (pr.credit_status === 'adjusted') description += ` (Adj. Against Bill)`;
      else if (pr.credit_status === 'refunded') description += ` (Refunded)`;
      else description += ` (Pending)`;

      allTransactions.push({
        id: `pr-${pr.id}`,
        date: pr.return_date,
        type: 'credit_note',
        reference: pr.return_number,
        description,
        debit: amount,
        credit: 0,
        balance: runningBalance,
        category: 'cn-adjusted',
      });
    } else if (item.type === 'purchase_return_pending') {
      // Display-only row for pending purchase returns — does NOT mutate balance
      const pr = item.data as any;
      allTransactions.push({
        id: `pr-pending-${pr.id}`,
        date: pr.return_date,
        type: 'purchase_return',
        reference: pr.return_number,
        description: `Purchase Return - ${pr.return_number} (Pending — not adjusted)`,
        debit: 0,
        credit: 0,
        balance: runningBalance,
        category: 'cn-pending',
      });
    } else {
      const voucher = item.data as any;
      const cashPaid = Number(voucher.total_amount || 0);
      const disc = Number(voucher.discount_amount || 0);
      const settlement = voucherSettlementCredit(voucher);
      runningBalance -= settlement;

      const isOpeningBalancePayment = !billIds.includes(voucher.reference_id);
      const relatedBill = !isOpeningBalancePayment ? billsData?.find((b) => b.id === voucher.reference_id) : null;
      const billRef = relatedBill ? ` - for ${relatedBill.supplier_invoice_no || relatedBill.software_bill_no}` : "";
      const discNote = disc > 0 ? ` (cash ₹${cashPaid.toFixed(2)} + discount ₹${disc.toFixed(2)})` : "";

      allTransactions.push({
        id: voucher.id,
        date: voucher.voucher_date,
        type: "payment",
        reference: voucher.voucher_number,
        description:
          (isOpeningBalancePayment
            ? voucher.description || "Opening balance payment"
            : (voucher.description || "Payment made") + billRef) + discNote,
        debit: settlement,
        credit: 0,
        balance: runningBalance,
        category: 'payments',
      });
    }
  });

  return allTransactions;
}
