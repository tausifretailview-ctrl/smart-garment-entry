import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Printer, MessageCircle, Calendar, FileText, IndianRupee, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReactToPrint } from "react-to-print";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";

interface FloatingSupplierLedgerProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId: string;
  supplierName: string;
  supplierPhone?: string | null;
  organizationId: string;
}

interface Transaction {
  id: string;
  date: string;
  type: "bill" | "payment" | "credit_note";
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export const FloatingSupplierLedger = ({
  isOpen,
  onClose,
  supplierId,
  supplierName,
  supplierPhone,
  organizationId,
}: FloatingSupplierLedgerProps) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { sendWhatsApp } = useWhatsAppSend();

  // Fetch supplier details
  const { data: supplier } = useQuery({
    queryKey: ["floating-supplier-detail", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", supplierId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!supplierId,
  });

  // Fetch all data needed for ledger
  const { data: ledgerData, isLoading } = useQuery({
    queryKey: ["floating-supplier-ledger", supplierId, organizationId],
    queryFn: async () => {
      // Purchase bills
      const { data: bills, error: billsError } = await supabase
        .from("purchase_bills")
        .select("*")
        .eq("supplier_id", supplierId)
        .is("deleted_at", null)
        .order("bill_date", { ascending: true });
      if (billsError) throw billsError;

      const billIds = bills?.map((b) => b.id) || [];

      // Voucher payments (bill-linked)
      let vouchersData: any[] = [];
      if (billIds.length > 0) {
        const { data, error } = await supabase
          .from("voucher_entries")
          .select("*")
          .eq("reference_type", "supplier")
          .eq("voucher_type", "payment")
          .is("deleted_at", null)
          .in("reference_id", billIds)
          .order("voucher_date", { ascending: true });
        if (error) throw error;
        vouchersData = data || [];
      }

      // Opening balance payments (reference_id = supplier_id)
      const { data: openingPayments, error: openingError } = await supabase
        .from("voucher_entries")
        .select("*")
        .eq("reference_type", "supplier")
        .eq("reference_id", supplierId)
        .eq("voucher_type", "payment")
        .is("deleted_at", null)
        .order("voucher_date", { ascending: true });
      if (openingError) throw openingError;

      // Credit notes
      const { data: creditNotes, error: cnError } = await supabase
        .from("voucher_entries")
        .select("*")
        .eq("reference_type", "supplier")
        .eq("reference_id", supplierId)
        .eq("voucher_type", "credit_note")
        .is("deleted_at", null)
        .order("voucher_date", { ascending: true });
      if (cnError) throw cnError;

      return { bills: bills || [], vouchersData, openingPayments: openingPayments || [], creditNotes: creditNotes || [], billIds };
    },
    enabled: isOpen && !!supplierId,
  });

  // Build transactions (same logic as SupplierLedger)
  const transactions = useMemo<Transaction[]>(() => {
    if (!ledgerData || !supplier) return [];

    const { bills, vouchersData, openingPayments, creditNotes, billIds } = ledgerData;
    const openingBalance = supplier.opening_balance || 0;

    // voucher payments by bill
    const voucherPaymentsByBillId: Record<string, number> = {};
    vouchersData.forEach((v: any) => {
      if (v.reference_id) {
        voucherPaymentsByBillId[v.reference_id] = (voucherPaymentsByBillId[v.reference_id] || 0) + (v.total_amount || 0);
      }
    });

    const allVouchers = [...vouchersData, ...openingPayments];
    const allTransactions: Transaction[] = [];
    let runningBalance = openingBalance;

    if (openingBalance !== 0) {
      allTransactions.push({
        id: "opening-balance",
        date: "1900-01-01",
        type: "bill",
        reference: "Opening",
        description: "Opening Balance (Carried Forward)",
        debit: 0,
        credit: openingBalance > 0 ? openingBalance : 0,
        balance: runningBalance,
      });
    }

    const combined = [
      ...bills.map((bill: any) => ({ date: bill.bill_date, type: "bill" as const, data: bill })),
      ...allVouchers.map((v: any) => ({ date: v.voucher_date, type: "payment" as const, data: v })),
      ...(creditNotes || []).map((cn: any) => ({ date: cn.voucher_date, type: "credit_note" as const, data: cn })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    combined.forEach((item) => {
      if (item.type === "bill") {
        const bill = item.data as any;
        runningBalance += bill.net_amount;
        allTransactions.push({
          id: bill.id,
          date: bill.bill_date,
          type: "bill",
          reference: bill.supplier_invoice_no || bill.software_bill_no || "N/A",
          description: `Purchase Bill - ${bill.payment_status || "pending"}`,
          debit: 0,
          credit: bill.net_amount,
          balance: runningBalance,
        });

        const totalPaidOnBill = bill.paid_amount || 0;
        const voucherPmts = voucherPaymentsByBillId[bill.id] || 0;
        const paidAtPurchase = Math.max(0, totalPaidOnBill - voucherPmts);
        if (paidAtPurchase > 0) {
          runningBalance -= paidAtPurchase;
          allTransactions.push({
            id: `${bill.id}-payment-at-purchase`,
            date: bill.bill_date,
            type: "payment",
            reference: bill.supplier_invoice_no || bill.software_bill_no || "N/A",
            description: "Payment at purchase",
            debit: paidAtPurchase,
            credit: 0,
            balance: runningBalance,
          });
        }
      } else if (item.type === "credit_note") {
        const cn = item.data as any;
        runningBalance -= cn.total_amount;
        allTransactions.push({
          id: cn.id,
          date: cn.voucher_date,
          type: "credit_note",
          reference: cn.voucher_number,
          description: cn.description || "Supplier Credit Note (Purchase Return)",
          debit: cn.total_amount,
          credit: 0,
          balance: runningBalance,
        });
      } else {
        const voucher = item.data as any;
        runningBalance -= voucher.total_amount;
        const isOpeningBalancePayment = !billIds.includes(voucher.reference_id);
        allTransactions.push({
          id: voucher.id,
          date: voucher.voucher_date,
          type: "payment",
          reference: voucher.voucher_number,
          description: isOpeningBalancePayment
            ? voucher.description || "Opening balance payment"
            : voucher.description || "Payment made",
          debit: voucher.total_amount,
          credit: 0,
          balance: runningBalance,
        });
      }
    });

    return allTransactions;
  }, [ledgerData, supplier]);

  // Summary calculations
  const summary = useMemo(() => {
    const totalDebit = transactions.reduce((sum, t) => sum + t.debit, 0);
    const totalCredit = transactions.reduce((sum, t) => sum + t.credit, 0);
    const totalCreditNoteAdjust = transactions.filter((t) => t.type === "credit_note").reduce((sum, t) => sum + t.debit, 0);
    const finalBalance = transactions[transactions.length - 1]?.balance || 0;
    return { totalDebit, totalCredit, totalCreditNoteAdjust, finalBalance };
  }, [transactions]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `${supplierName}_Ledger_${format(new Date(), "dd-MM-yyyy")}`,
  });

  const handleWhatsApp = () => {
    if (!supplierPhone) return;
    const balance = summary.finalBalance;
    const message = `Dear ${supplierName},\n\nYour current ledger balance is ₹${Math.abs(balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })} ${balance > 0 ? "(Payable)" : balance < 0 ? "(Advance)" : "(Settled)"}.\n\nTotal Purchases: ₹${summary.totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}\nTotal Paid: ₹${summary.totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}\n\nThank you.`;
    const cleanPhone = supplierPhone.replace(/\D/g, "");
    const phone = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">{supplierName}</DialogTitle>
              <DialogDescription className="flex items-center gap-2">
                Supplier Ledger
                {supplierPhone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {supplierPhone}
                  </span>
                )}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 mr-6">
              <Button variant="outline" size="sm" onClick={() => handlePrint()}>
                <Printer className="h-4 w-4 mr-1" /> Print
              </Button>
              {supplierPhone && (
                <Button variant="outline" size="sm" onClick={handleWhatsApp} className="text-green-600 border-green-300 hover:bg-green-50">
                  <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-3 mb-2">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-3">
              <span className="text-xs text-muted-foreground">Total Purchases</span>
              <p className="text-lg font-bold">₹{summary.totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3">
              <span className="text-xs text-muted-foreground">Total Paid</span>
              <p className="text-lg font-bold text-green-600">₹{summary.totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-3">
              <span className="text-xs text-muted-foreground">Payment Rate</span>
              <p className="text-lg font-bold">
                {summary.totalCredit > 0 ? ((summary.totalDebit / summary.totalCredit) * 100).toFixed(1) : "0.0"}%
              </p>
            </CardContent>
          </Card>
          <Card className={`border-l-4 ${summary.finalBalance > 0 ? "border-l-red-500" : "border-l-green-500"}`}>
            <CardContent className="p-3">
              <span className="text-xs text-muted-foreground">Balance</span>
              <p className={cn("text-lg font-bold", summary.finalBalance > 0 ? "text-red-600" : "text-green-600")}>
                ₹{Math.abs(summary.finalBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                {summary.finalBalance > 0 ? " Payable" : summary.finalBalance < 0 ? " Advance" : ""}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Ledger Table */}
        <ScrollArea className="flex-1">
          <div ref={printRef}>
            {/* Print Header (hidden on screen) */}
            <div className="hidden print:block mb-4">
              <h2 className="text-xl font-bold">{supplierName} - Supplier Ledger</h2>
              <p className="text-sm text-muted-foreground">Generated on {format(new Date(), "dd MMM yyyy")}</p>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit (Paid)</TableHead>
                    <TableHead className="text-right">Credit (Bill)</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No transactions found
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((t) => (
                      <TableRow key={t.id} className={t.id === "opening-balance" ? "bg-muted/50" : ""}>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {t.id === "opening-balance" ? (
                              <span className="font-semibold">Opening</span>
                            ) : (
                              format(new Date(t.date), "dd MMM yy")
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {t.id === "opening-balance" ? (
                            <Badge variant="outline" className="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 text-xs">B/F</Badge>
                          ) : t.type === "credit_note" ? (
                            <Badge variant="outline" className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-xs">
                              <FileText className="h-3 w-3 mr-1" /> Credit Note
                            </Badge>
                          ) : (
                            <Badge variant={t.type === "bill" ? "default" : "secondary"} className="text-xs">
                              {t.type === "bill" ? (
                                <><FileText className="h-3 w-3 mr-1" /> Bill</>
                              ) : (
                                <><IndianRupee className="h-3 w-3 mr-1" /> Payment</>
                              )}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{t.reference}</TableCell>
                        <TableCell className="text-muted-foreground text-xs max-w-[200px] truncate">{t.description}</TableCell>
                        <TableCell className="text-right">
                          {t.debit > 0 && (
                            <span className="text-green-600 dark:text-green-400 font-medium">
                              ₹{t.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {t.credit > 0 && (
                            <span className="text-red-600 dark:text-red-400 font-medium">
                              ₹{t.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-bold",
                          t.balance > 0 ? "text-red-600 dark:text-red-400" :
                          t.balance < 0 ? "text-green-600 dark:text-green-400" :
                          "text-foreground"
                        )}>
                          ₹{Math.abs(t.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  {/* Grand Total */}
                  {transactions.length > 0 && (
                    <TableRow className="bg-muted/70 border-t-2 border-primary/20 font-bold">
                      <TableCell colSpan={4} className="text-right text-sm font-bold">Grand Total</TableCell>
                      <TableCell className="text-right text-sm">
                        <span className="text-green-600 dark:text-green-400">
                          ₹{summary.totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                        {summary.totalCreditNoteAdjust > 0 && (
                          <div className="text-xs text-purple-600 dark:text-purple-400 font-normal">
                            (CN Adj: ₹{summary.totalCreditNoteAdjust.toLocaleString("en-IN", { minimumFractionDigits: 2 })})
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <span className="text-red-600 dark:text-red-400">
                          ₹{summary.totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </TableCell>
                      <TableCell className={cn(
                        "text-right text-sm font-bold",
                        summary.finalBalance > 0 ? "text-red-600 dark:text-red-400" :
                        summary.finalBalance < 0 ? "text-green-600 dark:text-green-400" :
                        "text-foreground"
                      )}>
                        ₹{Math.abs(summary.finalBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
