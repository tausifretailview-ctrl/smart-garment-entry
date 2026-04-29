import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Printer, Check, ChevronsUpDown, X, AlertCircle, Pencil, Trash2, ChevronLeft, ChevronRight, Link2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChequePrintDialog } from "@/components/ChequePrintDialog";
import { useUserRoles } from "@/hooks/useUserRoles";

interface SupplierPaymentTabProps {
  organizationId: string;
  vouchers: any[] | undefined;
  suppliers: any[] | undefined;
  onEditPayment?: (voucher: any) => void;
}

export function SupplierPaymentTab({ organizationId, vouchers, suppliers, onEditPayment }: SupplierPaymentTabProps) {
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRoles();

  // Form states
  const [voucherDate, setVoucherDate] = useState<Date>(new Date());
  const [referenceId, setReferenceId] = useState("");
  const [selectedSupplierBillIds, setSelectedSupplierBillIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState<Date | undefined>(undefined);
  const [transactionId, setTransactionId] = useState("");
  const savingRef = useRef(false);

  // Search
  const [supplierSearchOpen, setSupplierSearchOpen] = useState(false);
  const [supplierSearchTerm, setSupplierSearchTerm] = useState("");

  // Cheque print
  const [showChequePrintDialog, setShowChequePrintDialog] = useState(false);

  // Pagination & selection for recent payments
  const PAYMENTS_PER_PAGE = 10;
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [paymentSearchTerm, setPaymentSearchTerm] = useState("");

  // Suppliers with balance
  const { data: suppliersWithBalance } = useQuery({
    queryKey: ["suppliers-with-balance", organizationId],
    queryFn: async () => {
      const { data: allSuppliers, error: suppError } = await supabase.from("suppliers").select("*").eq("organization_id", organizationId).is("deleted_at", null).order("supplier_name");
      if (suppError) throw suppError;
      const { data: allBills, error: billsError } = await supabase.from("purchase_bills").select("supplier_id, net_amount, paid_amount").eq("organization_id", organizationId).is("deleted_at", null);
      if (billsError) throw billsError;

      // Fetch credit note vouchers for suppliers to subtract from outstanding
      const { data: creditNoteVouchers, error: cnError } = await supabase.from("voucher_entries")
        .select("reference_id, total_amount")
        .eq("organization_id", organizationId)
        .eq("reference_type", "supplier")
        .eq("voucher_type", "credit_note")
        .is("deleted_at", null);
      if (cnError) throw cnError;

      const supplierBalances = new Map<string, number>();
      allBills?.forEach((bill: any) => {
        if (bill.supplier_id) {
          const outstanding = Math.max(0, (bill.net_amount || 0) - (bill.paid_amount || 0));
          supplierBalances.set(bill.supplier_id, (supplierBalances.get(bill.supplier_id) || 0) + outstanding);
        }
      });

      // Subtract credit note amounts from supplier balances
      const creditNoteAmounts = new Map<string, number>();
      creditNoteVouchers?.forEach((v: any) => {
        if (v.reference_id) {
          creditNoteAmounts.set(v.reference_id, (creditNoteAmounts.get(v.reference_id) || 0) + (v.total_amount || 0));
        }
      });

      return allSuppliers?.filter((s: any) => {
        const ob = s.opening_balance || 0;
        const bb = supplierBalances.get(s.id) || 0;
        const cn = creditNoteAmounts.get(s.id) || 0;
        return (ob + bb - cn) > 0;
      }).map((s: any) => ({
        ...s,
        outstandingBalance: (s.opening_balance || 0) + (supplierBalances.get(s.id) || 0) - (creditNoteAmounts.get(s.id) || 0),
      })) || [];
    },
    enabled: !!organizationId,
  });

  // Supplier balance
  const { data: supplierBalance } = useQuery({
    queryKey: ["supplier-balance", referenceId],
    queryFn: async () => {
      const { data: bills } = await supabase.from("purchase_bills").select("id, net_amount, paid_amount").eq("supplier_id", referenceId).is("deleted_at", null);
      const totalBills = bills?.reduce((sum, bill) => sum + (bill.net_amount || 0), 0) || 0;
      const totalPaidOnBills = bills?.reduce((sum, bill) => sum + (bill.paid_amount || 0), 0) || 0;

      // Fetch voucher payments for this supplier
      const { data: voucherPmts } = await supabase.from("voucher_entries")
        .select("total_amount")
        .eq("reference_type", "supplier")
        .eq("reference_id", referenceId)
        .or("voucher_type.eq.payment,voucher_type.eq.PAYMENT")
        .is("deleted_at", null);
      const totalVoucherPaid = voucherPmts?.reduce((s, v) => s + (Number(v.total_amount) || 0), 0) || 0;

      // Also fetch bill-linked voucher payments
      const billIds = bills?.map(b => b.id) || [];
      let billLinkedVoucherPaid = 0;
      if (billIds.length > 0) {
        const { data: billVouchers } = await supabase.from("voucher_entries")
          .select("total_amount")
          .eq("reference_type", "supplier")
          .in("reference_id", billIds)
          .or("voucher_type.eq.payment,voucher_type.eq.PAYMENT")
          .is("deleted_at", null);
        billLinkedVoucherPaid = billVouchers?.reduce((s, v) => s + (Number(v.total_amount) || 0), 0) || 0;
      }
      const totalVoucherAll = totalVoucherPaid + billLinkedVoucherPaid;
      const totalPaid = Math.max(totalPaidOnBills, totalVoucherAll);

      // Subtract credit note vouchers for this supplier
      const { data: cnVouchers } = await supabase.from("voucher_entries")
        .select("total_amount")
        .eq("reference_type", "supplier")
        .eq("reference_id", referenceId)
        .eq("voucher_type", "credit_note")
        .is("deleted_at", null);
      const totalCN = cnVouchers?.reduce((sum, v) => sum + (v.total_amount || 0), 0) || 0;

      return totalBills - totalPaid - totalCN;
    },
    enabled: !!referenceId,
  });

  // Supplier bills
  const { data: supplierBills } = useQuery({
    queryKey: ["supplier-bills", referenceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_bills").select("*").eq("supplier_id", referenceId).is("deleted_at", null).order("bill_date", { ascending: false });
      if (error) throw error;
      const bills = data || [];
      const billIds = bills.map((b: any) => b.id).filter(Boolean);
      const voucherPaidByBill = new Map<string, number>();

      if (billIds.length > 0) {
        const { data: paymentRows, error: paymentError } = await supabase
          .from("voucher_entries")
          .select("reference_id, total_amount")
          .eq("organization_id", organizationId)
          .eq("reference_type", "supplier")
          .eq("voucher_type", "payment")
          .is("deleted_at", null)
          .in("reference_id", billIds);
        if (paymentError) throw paymentError;

        (paymentRows || []).forEach((row: any) => {
          if (!row.reference_id) return;
          voucherPaidByBill.set(
            row.reference_id,
            (voucherPaidByBill.get(row.reference_id) || 0) + Number(row.total_amount || 0)
          );
        });
      }

      // Supplier payment reconciliation - Apr 2026:
      // keep bill paid_amount/payment_status synced with actual bill-linked payment vouchers.
      const updates = bills
        .map((bill: any) => {
          const net = Number(bill.net_amount || 0);
          const voucherPaid = Number(voucherPaidByBill.get(bill.id) || 0);
          const effectivePaid = Math.min(net, Math.max(Number(bill.paid_amount || 0), voucherPaid));
          const status = effectivePaid >= net - 0.01 ? "paid" : effectivePaid > 0 ? "partial" : "unpaid";
          return { bill, effectivePaid, status };
        })
        .filter(({ bill, effectivePaid, status }) =>
          Math.abs(Number(bill.paid_amount || 0) - effectivePaid) > 0.009 ||
          (bill.payment_status || "unpaid") !== status
        );

      if (updates.length > 0) {
        await Promise.all(
          updates.map(({ bill, effectivePaid, status }) =>
            supabase
              .from("purchase_bills")
              .update({ paid_amount: effectivePaid, payment_status: status })
              .eq("id", bill.id)
          )
        );
      }

      return bills.filter((bill: any) => {
        const net = Number(bill.net_amount || 0);
        const paid = Math.max(Number(bill.paid_amount || 0), Number(voucherPaidByBill.get(bill.id) || 0));
        return Math.max(0, net - paid) > 0.009;
      });
    },
    enabled: !!referenceId,
  });

  const { data: adjustedOutstandingCreditTotal = 0 } = useQuery({
    queryKey: ["supplier-adjusted-outstanding-credit", organizationId, referenceId],
    queryFn: async () => {
      if (!organizationId || !referenceId) return 0;
      const { data, error } = await supabase
        .from("purchase_returns" as any)
        .select("net_amount")
        .eq("organization_id", organizationId)
        .eq("supplier_id", referenceId)
        .eq("credit_status", "adjusted_outstanding")
        .is("deleted_at", null);
      if (error) throw error;
      return (data || []).reduce((sum: number, row: any) => sum + Number(row.net_amount || 0), 0);
    },
    enabled: !!organizationId && !!referenceId,
  });

  const getSelectedPayableTotal = () => {
    const selectedSubtotal = (supplierBills ?? [])
      .filter((bill) => selectedSupplierBillIds.includes(bill.id))
      .reduce(
        (sum, bill) => sum + Math.max(0, Number(bill.net_amount || 0) - Number(bill.paid_amount || 0)),
        0
      );
    const appliedCreditNotes = Math.min(Number(adjustedOutstandingCreditTotal || 0), selectedSubtotal);
    return Math.max(0, selectedSubtotal - appliedCreditNotes);
  };

  // Auto-fill amount
  useEffect(() => {
    if (selectedSupplierBillIds.length > 0 && supplierBills) {
      setAmount(getSelectedPayableTotal().toFixed(2));
    }
  }, [selectedSupplierBillIds, supplierBills, adjustedOutstandingCreditTotal]);

  const resetForm = () => {
    setVoucherDate(new Date());
    setReferenceId("");
    setSelectedSupplierBillIds([]);
    setDescription("");
    setAmount("");
    setPaymentMethod("cash");
    setChequeNumber("");
    setChequeDate(undefined);
    setTransactionId("");
  };

  const createVoucher = useMutation({
    mutationFn: async () => {
      if (savingRef.current) {
        throw new Error("Save already in progress");
      }
      savingRef.current = true;
      try {
      if (!referenceId) throw new Error("Please select a supplier to record payment");
      if (!amount || parseFloat(amount) <= 0) throw new Error("Please enter a valid amount");
      if (selectedSupplierBillIds.length > 0) {
        const selectedPayable = getSelectedPayableTotal();
        if ((parseFloat(amount) || 0) > selectedPayable + 0.01) {
          throw new Error(`Amount cannot exceed selected pending total of ₹${selectedPayable.toFixed(2)}`);
        }
      }
      const paymentAmount = parseFloat(amount);
      let remainingAmount = paymentAmount;
      const processedBills: any[] = [];

      if (selectedSupplierBillIds.length > 0) {
        for (const billId of selectedSupplierBillIds) {
          if (remainingAmount <= 0) break;
          const bill = supplierBills?.find(b => b.id === billId);
          if (!bill) continue;
          const currentPaid = bill.paid_amount || 0;
          const outstanding = (bill.net_amount || 0) - currentPaid;
          const amountToApply = Math.min(remainingAmount, outstanding);
          if (amountToApply <= 0) continue;
          const newPaidAmount = Math.min(Number(bill.net_amount || 0), currentPaid + amountToApply);
          const newStatus = newPaidAmount >= (bill.net_amount || 0) ? 'paid' : newPaidAmount > 0 ? 'partial' : 'unpaid';
          const { error: updateError } = await supabase.from('purchase_bills').update({ paid_amount: newPaidAmount, payment_status: newStatus }).eq('id', billId);
          if (updateError) throw updateError;
          processedBills.push({ bill, amountApplied: amountToApply });
          remainingAmount -= amountToApply;
        }
      }

      const { data: voucherNumber, error: numberError } = await supabase.rpc("generate_voucher_number", { p_type: "payment", p_date: format(voucherDate, "yyyy-MM-dd") });
      if (numberError) throw numberError;

      const billNumbers = processedBills.map(p => p.bill.supplier_invoice_no || p.bill.software_bill_no || p.bill.id.slice(0, 8)).join(', ');
      let paymentDetails = '';
      if (paymentMethod === 'cheque' && chequeNumber) {
        paymentDetails = ` | Cheque No: ${chequeNumber}`;
        if (chequeDate) paymentDetails += `, Date: ${format(chequeDate, 'dd/MM/yyyy')}`;
      } else if ((paymentMethod === 'other' || paymentMethod === 'bank_transfer' || paymentMethod === 'upi') && transactionId) {
        paymentDetails = ` | Transaction ID: ${transactionId}`;
      }

      const isOpeningBalancePayment = selectedSupplierBillIds.length === 0;
      let finalDescription: string;
      if (isOpeningBalancePayment) {
        const supplierName = suppliersWithBalance?.find(s => s.id === referenceId)?.supplier_name || 'Supplier';
        finalDescription = description ? `${description}${paymentDetails}` : `Opening Balance Payment to ${supplierName}${paymentDetails}`;
      } else {
        finalDescription = description ? `${description}${paymentDetails}` : `Payment for Bills: ${billNumbers}${paymentDetails}`;
      }

      if (processedBills.length > 0) {
        for (let i = 0; i < processedBills.length; i++) {
          const processed = processedBills[i];
          const vNum = processedBills.length > 1 ? `${voucherNumber}-${i + 1}` : voucherNumber;
          const billRef = processed.bill.software_bill_no || processed.bill.supplier_invoice_no || processed.bill.id.slice(0, 8);
          const { error: voucherError } = await supabase.from("voucher_entries").insert({
            organization_id: organizationId,
            voucher_number: vNum,
            voucher_type: "payment",
            voucher_date: format(voucherDate, "yyyy-MM-dd"),
            reference_type: "supplier",
            reference_id: processed.bill.id,
            description: `Payment for Bill: ${billRef} | Supplier: ${processed.bill.supplier_name || suppliersWithBalance?.find((s: any) => s.id === referenceId)?.supplier_name || ""}${paymentDetails}`,
            total_amount: processed.amountApplied,
            payment_method: paymentMethod,
          });
          if (voucherError) throw voucherError;
        }
      } else {
        const { error } = await supabase.from("voucher_entries").insert({
          organization_id: organizationId,
          voucher_number: voucherNumber,
          voucher_type: "payment",
          voucher_date: format(voucherDate, "yyyy-MM-dd"),
          reference_type: "supplier",
          reference_id: referenceId,
          description: finalDescription,
          total_amount: paymentAmount,
          payment_method: paymentMethod,
        });
        if (error) throw error;
      }
      } finally {
        savingRef.current = false;
      }
    },
    onSuccess: () => {
      toast.success("Payment recorded successfully");
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-bills"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-balance"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-with-balance"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-bills"] });
      resetForm();
    },
    onError: (error: any) => {
      toast.error(`Failed to record payment: ${error.message}`);
    },
  });

  // Delete supplier payment
  const deletePayment = useMutation({
    mutationFn: async (voucher: any) => {
      const voucherAmount = Number(voucher.total_amount) || 0;

      // Reverse bill paid_amount if this voucher is linked to specific bills
      if (voucher.reference_type === "supplier" && voucher.reference_id) {
        // Check if reference_id is a bill ID (not a supplier ID)
        const { data: linkedBill } = await supabase
          .from("purchase_bills")
          .select("id, paid_amount, net_amount")
          .eq("id", voucher.reference_id)
          .is("deleted_at", null)
          .maybeSingle();

        if (linkedBill) {
          // Direct bill-linked payment — reverse on that single bill
          const newPaid = Math.max(0, (linkedBill.paid_amount || 0) - voucherAmount);
          const newStatus = newPaid >= (linkedBill.net_amount || 0) ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
          await supabase.from("purchase_bills").update({ paid_amount: newPaid, payment_status: newStatus }).eq("id", linkedBill.id);
        } else {
          // Supplier-level payment — try to find bills from description
          const desc = voucher.description || "";
          const billMatch = desc.match(/Bills?:\s*(.+?)(?:\s*\||$)/i);
          if (billMatch) {
            const billRefs = billMatch[1].split(",").map((s: string) => s.trim()).filter(Boolean);
            if (billRefs.length > 0) {
              // Find matching bills by invoice number
              const { data: matchedBills } = await supabase
                .from("purchase_bills")
                .select("id, paid_amount, net_amount, supplier_invoice_no, software_bill_no")
                .eq("supplier_id", voucher.reference_id)
                .is("deleted_at", null);

              let remaining = voucherAmount;
              for (const bill of (matchedBills || [])) {
                if (remaining <= 0) break;
                const billRef = bill.supplier_invoice_no || bill.software_bill_no || bill.id.slice(0, 8);
                if (billRefs.includes(billRef)) {
                  const amountToReverse = Math.min(remaining, bill.paid_amount || 0);
                  const newPaid = Math.max(0, (bill.paid_amount || 0) - amountToReverse);
                  const newStatus = newPaid >= (bill.net_amount || 0) ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
                  await supabase.from("purchase_bills").update({ paid_amount: newPaid, payment_status: newStatus }).eq("id", bill.id);
                  remaining -= amountToReverse;
                }
              }
            }
          }
        }
      }

      // Soft-delete the voucher
      const { error } = await supabase.from("voucher_entries").update({ deleted_at: new Date().toISOString() }).eq("id", voucher.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment deleted");
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-bills"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-with-balance"] });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createVoucher.mutate();
  };

  // Computed supplier payments for the table
  const allSupplierPayments = vouchers?.filter((v) => v.reference_type === "supplier" && (v.voucher_type === "payment" || v.voucher_type === "PAYMENT")) || [];
  const supplierPayments = paymentSearchTerm
    ? allSupplierPayments.filter((v) => {
        const supplierName = suppliers?.find((s) => s.id === v.reference_id)?.supplier_name || "";
        return supplierName.toLowerCase().includes(paymentSearchTerm.toLowerCase()) ||
          (v.voucher_number || "").toLowerCase().includes(paymentSearchTerm.toLowerCase()) ||
          (v.description || "").toLowerCase().includes(paymentSearchTerm.toLowerCase());
      })
    : allSupplierPayments;
  const totalPaymentPages = Math.ceil(supplierPayments.length / PAYMENTS_PER_PAGE);
  const startIdx = (paymentsPage - 1) * PAYMENTS_PER_PAGE;
  const endIdx = startIdx + PAYMENTS_PER_PAGE;
  const paginatedPayments = supplierPayments.slice(startIdx, endIdx);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Supplier Payment (PAY)</CardTitle>
          <CardDescription>Record payment made to suppliers - select bills or pay against opening balance</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Date */}
              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !voucherDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {voucherDate ? format(voucherDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={voucherDate} onSelect={(date) => date && setVoucherDate(date)} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Supplier Search */}
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Popover open={supplierSearchOpen} onOpenChange={setSupplierSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={supplierSearchOpen} className="w-full justify-between">
                      {referenceId ? (() => {
                        const supplier = suppliersWithBalance?.find(s => s.id === referenceId) || suppliers?.find(s => s.id === referenceId);
                        return supplier ? (
                          <span className="flex items-center gap-2">
                            {supplier.supplier_name}
                            {supplier.outstandingBalance !== undefined && (
                              <Badge variant="destructive" className="ml-2">₹{(supplier.outstandingBalance || 0).toFixed(2)}</Badge>
                            )}
                          </span>
                        ) : "Select supplier";
                      })() : "Select supplier..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput placeholder="Search suppliers..." value={supplierSearchTerm} onValueChange={setSupplierSearchTerm} />
                      <CommandList>
                        <CommandEmpty>No supplier found.</CommandEmpty>
                        <CommandGroup heading="Suppliers with Balance">
                          {suppliersWithBalance?.filter(s => s.supplier_name.toLowerCase().includes(supplierSearchTerm.toLowerCase())).map((supplier) => (
                            <CommandItem key={supplier.id} value={supplier.supplier_name} onSelect={() => {
                              setReferenceId(supplier.id);
                              setSelectedSupplierBillIds([]);
                              setAmount("");
                              setSupplierSearchOpen(false);
                              setSupplierSearchTerm("");
                            }}>
                              <Check className={cn("mr-2 h-4 w-4", referenceId === supplier.id ? "opacity-100" : "opacity-0")} />
                              <span className="flex-1">{supplier.supplier_name}</span>
                              <Badge variant="destructive" className="ml-2">₹{(supplier.outstandingBalance || 0).toFixed(2)}</Badge>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        <CommandGroup heading="All Suppliers">
                          {suppliers?.filter(s => s.supplier_name.toLowerCase().includes(supplierSearchTerm.toLowerCase()) && !suppliersWithBalance?.find(sw => sw.id === s.id)).map((supplier) => (
                            <CommandItem key={supplier.id} value={supplier.supplier_name} onSelect={() => {
                              setReferenceId(supplier.id);
                              setSelectedSupplierBillIds([]);
                              setAmount("");
                              setSupplierSearchOpen(false);
                              setSupplierSearchTerm("");
                            }}>
                              <Check className={cn("mr-2 h-4 w-4", referenceId === supplier.id ? "opacity-100" : "opacity-0")} />
                              <span className="flex-1">{supplier.supplier_name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {referenceId && supplierBalance !== undefined && (
                  <div className="mt-2 p-3 bg-gradient-to-r from-rose-50 to-rose-100 dark:from-rose-950 dark:to-rose-900 border border-rose-200 dark:border-rose-800 rounded-md">
                    <p className="text-sm font-medium text-rose-900 dark:text-rose-100">Total Outstanding: <span className="text-lg font-bold">₹{Math.round(supplierBalance).toLocaleString('en-IN')}</span></p>
                    {adjustedOutstandingCreditTotal > 0 && (
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                        Includes less credit adjusted to outstanding: ₹{Number(adjustedOutstandingCreditTotal).toFixed(2)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bill Selection */}
            {referenceId && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Select Bills (Optional)</Label>
                  {selectedSupplierBillIds.length > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedSupplierBillIds([]); setAmount(""); }}>
                      <X className="h-4 w-4 mr-1" /> Clear Selection
                    </Button>
                  )}
                </div>
                {supplierBills && supplierBills.length > 0 ? (
                  <div className="border rounded-lg max-h-[250px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-[50px]">Select</TableHead>
                          <TableHead>Bill No</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Bill Amt</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplierBills.map((bill) => {
                          const netAmount = Number(bill.net_amount || 0);
                          const paidAmount = Number(bill.paid_amount || 0);
                          const outstanding = netAmount - paidAmount;
                          const isSelected = selectedSupplierBillIds.includes(bill.id);
                          const billDate = bill.bill_date ? new Date(bill.bill_date) : null;
                          const billDateText = billDate && !Number.isNaN(billDate.getTime()) ? format(billDate, "dd/MM/yyyy") : "-";
                          return (
                            <TableRow key={bill.id} className={cn("cursor-pointer transition-colors", isSelected && "bg-primary/5")}
                              onClick={() => {
                                if (isSelected) setSelectedSupplierBillIds(prev => prev.filter(id => id !== bill.id));
                                else setSelectedSupplierBillIds(prev => [...prev, bill.id]);
                              }}>
                              <TableCell>
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Checkbox checked={isSelected} onCheckedChange={(checked) => {
                                    if (checked === true) setSelectedSupplierBillIds(prev => [...prev, bill.id]);
                                    else setSelectedSupplierBillIds(prev => prev.filter(id => id !== bill.id));
                                  }} />
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">{bill.supplier_invoice_no || bill.software_bill_no || bill.id.slice(0, 8)}</TableCell>
                              <TableCell>{billDateText}</TableCell>
                              <TableCell className="text-right">₹{netAmount.toFixed(2)}</TableCell>
                              <TableCell className="text-right text-muted-foreground">₹{paidAmount.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-semibold text-rose-600 dark:text-rose-400">₹{outstanding.toFixed(2)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="border rounded-lg p-4 text-center text-muted-foreground bg-muted/30">No outstanding bills found for this supplier</div>
                )}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm">
                    {selectedSupplierBillIds.length > 0 ? (
                      <div className="space-y-0.5">
                        <div className="font-medium">
                          {selectedSupplierBillIds.length} bill(s) selected • Subtotal: <span className="text-primary font-bold">
                            ₹{(supplierBills ?? []).filter(b => selectedSupplierBillIds.includes(b.id)).reduce((sum, b) => sum + (Number(b.net_amount || 0) - Number(b.paid_amount || 0)), 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="text-emerald-700 dark:text-emerald-400">
                          Less: Applied Credit Notes: -₹{Math.min(Number(adjustedOutstandingCreditTotal || 0), (supplierBills ?? []).filter(b => selectedSupplierBillIds.includes(b.id)).reduce((sum, b) => sum + (Number(b.net_amount || 0) - Number(b.paid_amount || 0)), 0)).toFixed(2)}
                        </div>
                        <div className="font-semibold text-foreground">
                          Grand Total: ₹{getSelectedPayableTotal().toFixed(2)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground flex items-center gap-1"><AlertCircle className="h-4 w-4" /> No bills selected = Opening Balance / Advance payment</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount {selectedSupplierBillIds.length > 0 && <span className="text-xs text-muted-foreground">(Auto-filled)</span>}</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Enter amount"
                  value={amount}
                  max={selectedSupplierBillIds.length > 0 ? getSelectedPayableTotal() : undefined}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setAmount("");
                      return;
                    }
                    const entered = Number(raw);
                    const maxAllowed = selectedSupplierBillIds.length > 0 ? getSelectedPayableTotal() : Infinity;
                    setAmount(Math.min(Number.isFinite(entered) ? entered : 0, maxAllowed).toFixed(2));
                  }}
                  required
                />
              </div>

              {paymentMethod === "cheque" && (
                <>
                  <div className="space-y-2">
                    <Label>Cheque Number</Label>
                    <Input placeholder="Enter cheque number" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cheque Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !chequeDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {chequeDate ? format(chequeDate, "PPP") : <span>Pick date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={chequeDate} onSelect={setChequeDate} initialFocus />
                      </PopoverContent>
                    </Popover>
                  </div>
                </>
              )}

              {(paymentMethod === "bank_transfer" || paymentMethod === "upi") && (
                <div className="space-y-2">
                  <Label>Transaction Number</Label>
                  <Input placeholder="Enter UTR / Reference ID" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} />
                </div>
              )}

              <div className="space-y-2 md:col-span-2">
                <Label>Description</Label>
                <Textarea placeholder="Payment description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="w-full md:w-auto" disabled={createVoucher.isPending || savingRef.current}>
                <Plus className="mr-2 h-4 w-4" />
                {createVoucher.isPending ? "Recording..." : "Record Payment"}
              </Button>
              {paymentMethod === "cheque" && parseFloat(amount) > 0 && referenceId && (
                <Button type="button" variant="outline" onClick={() => setShowChequePrintDialog(true)}>
                  <Printer className="mr-2 h-4 w-4" /> Print Cheque
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Recent Supplier Payments - Enhanced */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Supplier Payments</CardTitle>
          <div className="flex items-center gap-2">
            {isAdmin && selectedPaymentIds.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Selected ({selectedPaymentIds.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Selected Payments?</AlertDialogTitle>
                    <AlertDialogDescription>This will delete {selectedPaymentIds.length} payment(s).</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => {
                      const selected = supplierPayments.filter((v) => selectedPaymentIds.includes(v.id));
                      selected.forEach((v) => deletePayment.mutate(v));
                      setSelectedPaymentIds([]);
                    }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Search by supplier name, voucher no, or description..."
              value={paymentSearchTerm}
              onChange={(e) => { setPaymentSearchTerm(e.target.value); setPaymentsPage(1); }}
              className="max-w-sm"
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && <TableHead className="w-10"></TableHead>}
                <TableHead>Voucher No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Description</TableHead>
                {isAdmin && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedPayments.map((voucher) => {
                const supplierName =
                  suppliers?.find((s) => s.id === voucher.reference_id)?.supplier_name ||
                  voucher.description?.match(/Supplier:\s*([^|]+)/i)?.[1]?.trim() ||
                  "-";
                const isSelected = selectedPaymentIds.includes(voucher.id);
                return (
                  <TableRow key={voucher.id} className={isSelected ? "bg-muted/50" : ""}>
                    {isAdmin && (
                      <TableCell>
                        <Checkbox checked={isSelected} onCheckedChange={(checked) => {
                          if (checked) setSelectedPaymentIds([...selectedPaymentIds, voucher.id]);
                          else setSelectedPaymentIds(selectedPaymentIds.filter((id) => id !== voucher.id));
                        }} />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                    <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{supplierName}</TableCell>
                    <TableCell className="tabular-nums">₹{Number(voucher.total_amount || 0).toFixed(2)}</TableCell>
                    <TableCell className="uppercase text-xs">{voucher.payment_method || "-"}</TableCell>
                    <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {voucher.description?.includes("Bill") && (
                            <Button variant="ghost" size="icon" title="Linked to Bill" className="text-primary">
                              <Link2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" title="Edit Payment" onClick={() => onEditPayment?.(voucher)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Print" onClick={() => window.print()}>
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {totalPaymentPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">Showing {startIdx + 1}-{Math.min(endIdx, supplierPayments.length)} of {supplierPayments.length} payments</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPaymentsPage(p => Math.max(1, p - 1))} disabled={paymentsPage === 1}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <span className="text-sm font-medium px-2">Page {paymentsPage} of {totalPaymentPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPaymentsPage(p => Math.min(totalPaymentPages, p + 1))} disabled={paymentsPage === totalPaymentPages}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ChequePrintDialog
        open={showChequePrintDialog}
        onOpenChange={setShowChequePrintDialog}
        payeeName={suppliers?.find(s => s.id === referenceId)?.supplier_name || ""}
        amount={parseFloat(amount) || 0}
        chequeDate={chequeDate || new Date()}
        chequeNumber={chequeNumber}
      />
    </div>
  );
}
