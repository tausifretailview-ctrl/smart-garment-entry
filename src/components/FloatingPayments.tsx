import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, Plus, Check, ChevronsUpDown, Printer, X, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { recordExpenseVoucherJournalEntry } from "@/utils/accounting/journalService";
import { insertLedgerCredit } from "@/lib/customerLedger";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAllCustomers, fetchAllSalesSummary } from "@/utils/fetchAllRows";
import { calculateCustomerInvoiceBalances } from "@/utils/customerBalanceUtils";
import { PaymentReceipt } from "@/components/PaymentReceipt";
import { useReactToPrint } from "react-to-print";

interface FloatingPaymentsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const FloatingPayments = ({ open, onOpenChange }: FloatingPaymentsProps) => {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  const [activeTab, setActiveTab] = useState("customer");

  // ─── Receipt Print ───────────────────────────────────────────
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const { data: settings } = useQuery({
    queryKey: ["settings", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("sale_settings, business_name, gst_number, bill_barcode_settings, address, mobile_number, email_id").eq("organization_id", orgId).maybeSingle();
      return data;
    },
    enabled: !!orgId,
  });

  const handlePrintReceipt = useReactToPrint({ contentRef: receiptRef, documentTitle: `Receipt_${receiptData?.voucherNumber}` });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-lg">Quick Payments</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid grid-cols-3 mx-4">
            <TabsTrigger value="customer" className="text-xs">Customer Receipt</TabsTrigger>
            <TabsTrigger value="supplier" className="text-xs">Supplier Payment</TabsTrigger>
            <TabsTrigger value="expenses" className="text-xs">Expenses</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[65vh] px-4 pb-4">
            <TabsContent value="customer" className="mt-3">
              {orgId && (
                <CustomerPaymentForm
                  organizationId={orgId}
                  onShowReceipt={(data) => { setReceiptData(data); setShowReceipt(true); }}
                />
              )}
            </TabsContent>
            <TabsContent value="supplier" className="mt-3">
              {orgId && <SupplierPaymentForm organizationId={orgId} />}
            </TabsContent>
            <TabsContent value="expenses" className="mt-3">
              {orgId && <ExpenseForm organizationId={orgId} />}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Receipt Print Dialog */}
        {showReceipt && receiptData && (
          <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>Payment Receipt</DialogTitle>
              </DialogHeader>
              <PaymentReceipt
                ref={receiptRef}
                receiptData={receiptData}
                companyDetails={{
                  businessName: settings?.business_name,
                  address: settings?.address,
                  mobileNumber: settings?.mobile_number,
                  emailId: settings?.email_id,
                  gstNumber: settings?.gst_number,
                  logoUrl: (settings as any)?.logo_url,
                  upiId: (settings as any)?.upi_id,
                }}
                receiptSettings={{
                  headerText: (settings as any)?.receipt_header,
                  footerText: (settings as any)?.receipt_footer,
                  showCompanyLogo: (settings as any)?.show_company_logo_receipt,
                  showQrCode: (settings as any)?.show_qr_receipt,
                  showSignature: (settings as any)?.show_signature_receipt,
                  signatureLabel: (settings as any)?.signature_label,
                }}
              />
              <div className="flex gap-2 justify-end mt-2">
                <Button size="sm" variant="outline" onClick={() => {
                  if (!receiptData?.customerPhone) { toast.error("No phone number"); return; }
                  const msg = `*PAYMENT RECEIPT*\nReceipt: ${receiptData.voucherNumber}\nDate: ${receiptData.voucherDate}\nCustomer: ${receiptData.customerName}\nPaid: ₹${Math.round(receiptData.paidAmount).toLocaleString('en-IN')}\nBalance: ₹${Math.round(receiptData.currentBalance).toLocaleString('en-IN')}\nMode: ${receiptData.paymentMethod?.toUpperCase()}`;
                  const phone = receiptData.customerPhone.replace(/\D/g, '');
                  window.open(`https://wa.me/${phone.startsWith('91') ? phone : '91' + phone}?text=${encodeURIComponent(msg)}`, '_blank');
                }}>
                  WhatsApp
                </Button>
                <Button size="sm" onClick={() => handlePrintReceipt()}>
                  <Printer className="h-4 w-4 mr-1" /> Print
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ═══════════════════════════════════════════════════════════════
// CUSTOMER PAYMENT FORM (Compact)
// ═══════════════════════════════════════════════════════════════
function CustomerPaymentForm({ organizationId, onShowReceipt }: { organizationId: string; onShowReceipt: (data: any) => void }) {
  const queryClient = useQueryClient();
  const [voucherDate, setVoucherDate] = useState<Date>(new Date());
  const [referenceId, setReferenceId] = useState("");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [chequeNumber, setChequeNumber] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [description, setDescription] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [showSaved, setShowSaved] = useState(false);

  // Customers with balance
  const { data: customersWithBalance } = useQuery({
    queryKey: ["customers-with-balance", organizationId],
    queryFn: async () => {
      const allCustomers = await fetchAllCustomers(organizationId);
      const allSales = await fetchAllSalesSummary(organizationId);
      const { data: allVouchers } = await supabase.from('voucher_entries').select('reference_id, reference_type, total_amount').eq('organization_id', organizationId).eq('voucher_type', 'receipt').is('deleted_at', null);
      const invoiceVoucherPayments = new Map<string, number>();
      const customerOpeningBalancePayments = new Map<string, number>();
      const saleIdSet = new Set(allSales.map((s: any) => s.id));
      allVouchers?.forEach((v: any) => {
        if (!v.reference_id) return;
        if (saleIdSet.has(v.reference_id)) invoiceVoucherPayments.set(v.reference_id, (invoiceVoucherPayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0));
        else if (v.reference_type === 'customer') customerOpeningBalancePayments.set(v.reference_id, (customerOpeningBalancePayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0));
      });
      const customerBalances = calculateCustomerInvoiceBalances(allSales, invoiceVoucherPayments);
      return allCustomers.filter((c: any) => {
        const ob = c.opening_balance || 0;
        const obp = customerOpeningBalancePayments.get(c.id) || 0;
        const ib = customerBalances.get(c.id) || 0;
        return Math.max(0, ob - obp) + ib > 0;
      }).map((c: any) => ({
        ...c,
        outstandingBalance: Math.max(0, (c.opening_balance || 0) - (customerOpeningBalancePayments.get(c.id) || 0)) + (customerBalances.get(c.id) || 0),
      }));
    },
    enabled: !!organizationId,
  });

  // Customer invoices
  const { data: customerInvoices } = useQuery({
    queryKey: ["customer-invoices", referenceId],
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("id, sale_number, sale_date, net_amount, paid_amount, payment_status, customer_name, customer_phone, customer_address").eq("customer_id", referenceId).in("payment_status", ["pending", "partial"]).is("deleted_at", null).order("sale_date", { ascending: false });
      return data || [];
    },
    enabled: !!referenceId,
  });

  // Customer balance
  const { data: customerBalance } = useQuery({
    queryKey: ["customer-balance", referenceId],
    queryFn: async () => {
      const { data: cust } = await supabase.from("customers").select("opening_balance").eq("id", referenceId).maybeSingle();
      const ob = cust?.opening_balance || 0;
      const { data: sales } = await supabase.from("sales").select("net_amount, paid_amount").eq("customer_id", referenceId).in("payment_status", ["pending", "partial"]).is("deleted_at", null);
      const invoiceOutstanding = sales?.reduce((sum, s) => sum + Math.max(0, (s.net_amount || 0) - (s.paid_amount || 0)), 0) || 0;
      const { data: obPayments } = await supabase.from("voucher_entries").select("total_amount, reference_id").eq("organization_id", organizationId).eq("voucher_type", "receipt").eq("reference_type", "customer").is("deleted_at", null);
      const obPaid = obPayments?.filter(p => p.reference_id === referenceId).reduce((sum, p) => sum + (p.total_amount || 0), 0) || 0;
      return ob + invoiceOutstanding - obPaid;
    },
    enabled: !!referenceId,
  });

  useEffect(() => {
    if (selectedInvoiceIds.length > 0 && customerInvoices) {
      const total = customerInvoices.filter(inv => selectedInvoiceIds.includes(inv.id)).reduce((sum, inv) => sum + (inv.net_amount - (inv.paid_amount || 0)), 0);
      setAmount(total.toFixed(2));
    }
  }, [selectedInvoiceIds, customerInvoices]);

  const resetForm = () => {
    setVoucherDate(new Date());
    setReferenceId("");
    setSelectedInvoiceIds([]);
    setAmount("");
    setPaymentMethod("cash");
    setChequeNumber("");
    setTransactionId("");
    setDescription("");
  };

  const createVoucher = useMutation({
    mutationFn: async () => {
      if (!referenceId) throw new Error("Please select a customer");
      if (!amount || parseFloat(amount) <= 0) throw new Error("Enter a valid amount");
      const paymentAmount = parseFloat(amount);
      let remainingAmount = paymentAmount;
      const processedInvoices: any[] = [];
      const isOpeningBalancePayment = selectedInvoiceIds.length === 0;

      if (selectedInvoiceIds.length > 0) {
        for (const invoiceId of selectedInvoiceIds) {
          if (remainingAmount <= 0) break;
          const invoice = customerInvoices?.find(inv => inv.id === invoiceId);
          if (!invoice) continue;
          const currentPaid = invoice.paid_amount || 0;
          const outstanding = invoice.net_amount - currentPaid;
          const amountToApply = Math.min(remainingAmount, outstanding);
          if (amountToApply <= 0) continue;
          const newPaidAmount = currentPaid + amountToApply;
          const newStatus = newPaidAmount >= invoice.net_amount ? 'completed' : 'partial';
          await supabase.from('sales').update({ paid_amount: newPaidAmount, payment_status: newStatus, payment_date: format(voucherDate, 'yyyy-MM-dd') }).eq('id', invoiceId);
          processedInvoices.push({ invoice, amountApplied: amountToApply, previousBalance: outstanding, currentBalance: outstanding - amountToApply });
          remainingAmount -= amountToApply;
        }
      }

      const { data: voucherNumber } = await supabase.rpc("generate_voucher_number", { p_type: "receipt", p_date: format(voucherDate, "yyyy-MM-dd") });

      let paymentDetails = '';
      if (paymentMethod === 'cheque' && chequeNumber) paymentDetails = ` | Cheque No: ${chequeNumber}`;
      else if ((paymentMethod === 'upi' || paymentMethod === 'bank_transfer') && transactionId) paymentDetails = ` | Transaction ID: ${transactionId}`;

      if (!isOpeningBalancePayment && processedInvoices.length > 0) {
        for (let i = 0; i < processedInvoices.length; i++) {
          const p = processedInvoices[i];
          const vNum = processedInvoices.length > 1 ? `${voucherNumber}-${i + 1}` : voucherNumber;
          await supabase.from("voucher_entries").insert({
            organization_id: organizationId,
            voucher_number: vNum,
            voucher_type: "receipt",
            voucher_date: format(voucherDate, "yyyy-MM-dd"),
            reference_type: 'sale',
            reference_id: p.invoice.id,
            description: `Payment for ${p.invoice.sale_number}${paymentDetails}`,
            total_amount: p.amountApplied,
          });
          if (referenceId) {
            insertLedgerCredit({
              organizationId,
              customerId: referenceId,
              voucherType: 'RECEIPT',
              voucherNo: vNum,
              particulars: `Receipt for ${p.invoice.sale_number}`,
              transactionDate: format(voucherDate, "yyyy-MM-dd"),
              amount: p.amountApplied,
            });
          }
        }
      } else {
        const customerName = customersWithBalance?.find(c => c.id === referenceId)?.customer_name || 'Customer';
        await supabase.from("voucher_entries").insert({
          organization_id: organizationId,
          voucher_number: voucherNumber,
          voucher_type: "receipt",
          voucher_date: format(voucherDate, "yyyy-MM-dd"),
          reference_type: isOpeningBalancePayment ? 'customer' : 'sale',
          reference_id: referenceId,
          description: description || `Opening Balance Payment from ${customerName}${paymentDetails}`,
          total_amount: paymentAmount,
        });
        if (referenceId) {
          insertLedgerCredit({
            organizationId,
            customerId: referenceId,
            voucherType: 'RECEIPT',
            voucherNo: voucherNumber,
            particulars: isOpeningBalancePayment ? 'Opening Balance Receipt' : 'Receipt',
            transactionDate: format(voucherDate, "yyyy-MM-dd"),
            amount: paymentAmount,
          });
        }
      }

      return { voucherNumber, processedInvoices, isOpeningBalancePayment, paymentMethod };
    },
    onSuccess: (data) => {
      toast.success("Payment recorded");
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["customer-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customers-with-balance"] });

      const totalPaid = parseFloat(amount);
      if (data.isOpeningBalancePayment) {
        const customer = customersWithBalance?.find(c => c.id === referenceId);
        onShowReceipt({
          voucherNumber: data.voucherNumber, voucherDate: format(voucherDate, 'yyyy-MM-dd'),
          customerName: customer?.customer_name || 'Customer', customerPhone: customer?.phone || '',
          customerAddress: customer?.address || '', invoiceNumber: 'Opening Balance',
          invoiceDate: format(voucherDate, 'yyyy-MM-dd'), invoiceAmount: customerBalance || 0,
          paidAmount: totalPaid, previousBalance: customerBalance || 0,
          currentBalance: (customerBalance || 0) - totalPaid, paymentMethod,
        });
      } else if (data.processedInvoices.length > 0) {
        const first = data.processedInvoices[0].invoice;
        onShowReceipt({
          voucherNumber: data.voucherNumber, voucherDate: format(voucherDate, 'yyyy-MM-dd'),
          customerName: first.customer_name, customerPhone: first.customer_phone,
          customerAddress: first.customer_address,
          invoiceNumber: data.processedInvoices.map((p: any) => p.invoice.sale_number).join(', '),
          invoiceDate: first.sale_date,
          invoiceAmount: data.processedInvoices.reduce((sum: number, p: any) => sum + p.invoice.net_amount, 0),
          paidAmount: totalPaid,
          previousBalance: data.processedInvoices.reduce((sum: number, p: any) => sum + p.previousBalance, 0),
          currentBalance: data.processedInvoices.reduce((sum: number, p: any) => sum + p.currentBalance, 0),
          paymentMethod,
        });
      }
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Date */}
        <div className="space-y-1">
          <Label className="text-xs">Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-start text-left text-xs h-9">
                <CalendarIcon className="mr-1 h-3 w-3" />
                {format(voucherDate, "dd/MM/yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={voucherDate} onSelect={(d) => d && setVoucherDate(d)} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>

        {/* Customer */}
        <div className="space-y-1">
          <Label className="text-xs">Customer</Label>
          <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between text-xs h-9">
                {referenceId ? (customersWithBalance?.find(c => c.id === referenceId)?.customer_name || "Select") : "Select customer..."}
                <ChevronsUpDown className="ml-1 h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[350px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput placeholder="Search by name or phone..." value={customerSearchTerm} onValueChange={setCustomerSearchTerm} />
                <CommandList>
                  <CommandEmpty>No customer found</CommandEmpty>
                  <CommandGroup>
                    {customersWithBalance?.filter(c => {
                      if (!customerSearchTerm) return true;
                      const t = customerSearchTerm.toLowerCase();
                      return c.customer_name.toLowerCase().includes(t) || c.phone?.toLowerCase().includes(t);
                    }).slice(0, 30).map(c => (
                      <CommandItem key={c.id} value={c.id} onSelect={() => {
                        setReferenceId(c.id);
                        setSelectedInvoiceIds([]);
                        setAmount("");
                        setCustomerSearchOpen(false);
                        setCustomerSearchTerm("");
                      }}>
                        <div className="flex-1">
                          <span className="text-sm">{c.customer_name}</span>
                          {c.phone && <span className="text-xs text-muted-foreground ml-2">{c.phone}</span>}
                        </div>
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">₹{Math.round(c.outstandingBalance).toLocaleString('en-IN')}</Badge>
                        {referenceId === c.id && <Check className="ml-1 h-3 w-3 text-primary" />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Outstanding */}
      {referenceId && customerBalance !== undefined && customerBalance > 0 && (
        <div className="p-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded text-xs">
          Outstanding: <span className="font-bold text-amber-800 dark:text-amber-200">₹{Math.round(customerBalance).toLocaleString('en-IN')}</span>
        </div>
      )}

      {/* Invoice selection */}
      {referenceId && customerInvoices && customerInvoices.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Select Invoices</Label>
            {selectedInvoiceIds.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedInvoiceIds([]); setAmount(""); }} className="h-6 text-xs px-2">
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>
          <div className="border rounded max-h-32 overflow-y-auto">
            {customerInvoices.map(inv => {
              const balance = (inv.net_amount || 0) - (inv.paid_amount || 0);
              const isSelected = selectedInvoiceIds.includes(inv.id);
              return (
                <div key={inv.id} className={cn("flex items-center gap-2 p-1.5 text-xs cursor-pointer border-b last:border-b-0", isSelected && "bg-primary/5")}
                  onClick={() => setSelectedInvoiceIds(prev => prev.includes(inv.id) ? prev.filter(id => id !== inv.id) : [...prev, inv.id])}>
                  <Checkbox checked={isSelected} className="h-3.5 w-3.5" />
                  <span className="flex-1 font-medium">{inv.sale_number}</span>
                  <span className="text-muted-foreground">{inv.sale_date ? format(new Date(inv.sale_date), "dd/MM") : "-"}</span>
                  <Badge variant="destructive" className="text-[10px] h-5">₹{Math.round(balance).toLocaleString('en-IN')}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Payment Method */}
        <div className="space-y-1">
          <Label className="text-xs">Payment Method</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Amount */}
        <div className="space-y-1">
          <Label className="text-xs">Amount</Label>
          <Input type="number" step="0.01" placeholder="₹ Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 text-xs" />
        </div>
      </div>

      {paymentMethod === 'cheque' && (
        <div className="space-y-1">
          <Label className="text-xs">Cheque Number</Label>
          <Input placeholder="Cheque no." value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className="h-9 text-xs" />
        </div>
      )}
      {(paymentMethod === 'upi' || paymentMethod === 'bank_transfer') && (
        <div className="space-y-1">
          <Label className="text-xs">Transaction ID</Label>
          <Input placeholder="UTR / Ref ID" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} className="h-9 text-xs" />
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Description (optional)</Label>
        <Textarea placeholder="Payment note" value={description} onChange={(e) => setDescription(e.target.value)} className="text-xs min-h-[40px] resize-none" />
      </div>

      <Button
        onClick={() => createVoucher.mutate()}
        disabled={createVoucher.isPending || !referenceId || !amount}
        className={cn("w-full h-9 text-xs gap-1", showSaved ? "bg-emerald-600 hover:bg-emerald-700" : "")}
      >
        {showSaved ? <><CheckCircle2 className="h-3 w-3" /> Saved</> : <><Plus className="h-3 w-3" /> {createVoucher.isPending ? "Saving..." : "Record Payment"}</>}
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPPLIER PAYMENT FORM (Compact)
// ═══════════════════════════════════════════════════════════════
function SupplierPaymentForm({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const [voucherDate, setVoucherDate] = useState<Date>(new Date());
  const [referenceId, setReferenceId] = useState("");
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [chequeNumber, setChequeNumber] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [description, setDescription] = useState("");
  const [supplierSearchOpen, setSupplierSearchOpen] = useState(false);
  const [supplierSearchTerm, setSupplierSearchTerm] = useState("");
  const [showSaved, setShowSaved] = useState(false);

  const { data: suppliersWithBalance } = useQuery({
    queryKey: ["suppliers-with-balance", organizationId],
    queryFn: async () => {
      const { data: allSuppliers } = await supabase.from("suppliers").select("id, supplier_name, opening_balance, phone").eq("organization_id", organizationId).is("deleted_at", null).order("supplier_name");
      const { data: allBills } = await supabase.from("purchase_bills").select("supplier_id, net_amount, paid_amount").eq("organization_id", organizationId).is("deleted_at", null);
      const balances = new Map<string, number>();
      allBills?.forEach((b: any) => {
        if (b.supplier_id) balances.set(b.supplier_id, (balances.get(b.supplier_id) || 0) + Math.max(0, (b.net_amount || 0) - (b.paid_amount || 0)));
      });
      return allSuppliers?.filter((s: any) => ((s.opening_balance || 0) + (balances.get(s.id) || 0)) > 0)
        .map((s: any) => ({ ...s, outstandingBalance: (s.opening_balance || 0) + (balances.get(s.id) || 0) })) || [];
    },
    enabled: !!organizationId,
  });

  const { data: supplierBills } = useQuery({
    queryKey: ["supplier-bills", referenceId],
    queryFn: async () => {
      const { data } = await supabase.from("purchase_bills").select("id, software_bill_no, supplier_invoice_no, bill_date, net_amount, paid_amount, payment_status").eq("supplier_id", referenceId).is("deleted_at", null).order("bill_date", { ascending: false });
      return data?.filter(b => (b.net_amount || 0) - (b.paid_amount || 0) > 0) || [];
    },
    enabled: !!referenceId,
  });

  useEffect(() => {
    if (selectedBillIds.length > 0 && supplierBills) {
      const total = supplierBills.filter(b => selectedBillIds.includes(b.id)).reduce((sum, b) => sum + ((b.net_amount || 0) - (b.paid_amount || 0)), 0);
      setAmount(total.toFixed(2));
    }
  }, [selectedBillIds, supplierBills]);

  const resetForm = () => {
    setVoucherDate(new Date());
    setReferenceId("");
    setSelectedBillIds([]);
    setAmount("");
    setPaymentMethod("cash");
    setChequeNumber("");
    setTransactionId("");
    setDescription("");
  };

  const createVoucher = useMutation({
    mutationFn: async () => {
      if (!referenceId) throw new Error("Please select a supplier");
      if (!amount || parseFloat(amount) <= 0) throw new Error("Enter valid amount");
      const paymentAmount = parseFloat(amount);
      let remainingAmount = paymentAmount;
      const processedBills: any[] = [];

      if (selectedBillIds.length > 0) {
        for (const billId of selectedBillIds) {
          if (remainingAmount <= 0) break;
          const bill = supplierBills?.find(b => b.id === billId);
          if (!bill) continue;
          const outstanding = (bill.net_amount || 0) - (bill.paid_amount || 0);
          const amountToApply = Math.min(remainingAmount, outstanding);
          if (amountToApply <= 0) continue;
          const newPaid = (bill.paid_amount || 0) + amountToApply;
          const newStatus = newPaid >= (bill.net_amount || 0) ? 'completed' : 'partial';
          await supabase.from('purchase_bills').update({ paid_amount: newPaid, payment_status: newStatus }).eq('id', billId);
          processedBills.push({ bill, amountApplied: amountToApply });
          remainingAmount -= amountToApply;
        }
      }

      const { data: voucherNumber } = await supabase.rpc("generate_voucher_number", { p_type: "payment", p_date: format(voucherDate, "yyyy-MM-dd") });

      let paymentDetails = '';
      if (paymentMethod === 'cheque' && chequeNumber) paymentDetails = ` | Cheque No: ${chequeNumber}`;
      else if ((paymentMethod === 'upi' || paymentMethod === 'bank_transfer') && transactionId) paymentDetails = ` | Transaction ID: ${transactionId}`;

      const supplierName = suppliersWithBalance?.find(s => s.id === referenceId)?.supplier_name || 'Supplier';
      const isOBPayment = selectedBillIds.length === 0;
      const billNumbers = processedBills.map(p => p.bill.software_bill_no || p.bill.supplier_invoice_no || p.bill.id.slice(0, 8)).join(', ');
      const finalDesc = description || (isOBPayment ? `Opening Balance Payment to ${supplierName}${paymentDetails}` : `Payment for Bills: ${billNumbers}${paymentDetails}`);

      await supabase.from("voucher_entries").insert({
        organization_id: organizationId,
        voucher_number: voucherNumber,
        voucher_type: "payment",
        voucher_date: format(voucherDate, "yyyy-MM-dd"),
        reference_type: "supplier",
        reference_id: referenceId,
        description: finalDesc,
        total_amount: paymentAmount,
      });
    },
    onSuccess: () => {
      toast.success("Supplier payment recorded");
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-bills"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-balance"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-with-balance"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-bills"] });
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-start text-left text-xs h-9">
                <CalendarIcon className="mr-1 h-3 w-3" />
                {format(voucherDate, "dd/MM/yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={voucherDate} onSelect={(d) => d && setVoucherDate(d)} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Supplier</Label>
          <Popover open={supplierSearchOpen} onOpenChange={setSupplierSearchOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between text-xs h-9">
                {referenceId ? (suppliersWithBalance?.find(s => s.id === referenceId)?.supplier_name || "Select") : "Select supplier..."}
                <ChevronsUpDown className="ml-1 h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[350px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput placeholder="Search supplier..." value={supplierSearchTerm} onValueChange={setSupplierSearchTerm} />
                <CommandList>
                  <CommandEmpty>No supplier found</CommandEmpty>
                  <CommandGroup>
                    {suppliersWithBalance?.filter(s => !supplierSearchTerm || s.supplier_name.toLowerCase().includes(supplierSearchTerm.toLowerCase())).slice(0, 30).map(s => (
                      <CommandItem key={s.id} value={s.id} onSelect={() => {
                        setReferenceId(s.id);
                        setSelectedBillIds([]);
                        setAmount("");
                        setSupplierSearchOpen(false);
                        setSupplierSearchTerm("");
                      }}>
                        <span className="flex-1 text-sm">{s.supplier_name}</span>
                        <Badge variant="destructive" className="text-xs">₹{Math.round(s.outstandingBalance).toLocaleString('en-IN')}</Badge>
                        {referenceId === s.id && <Check className="ml-1 h-3 w-3" />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Bill selection */}
      {referenceId && supplierBills && supplierBills.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Select Bills (Optional)</Label>
            {selectedBillIds.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedBillIds([]); setAmount(""); }} className="h-6 text-xs px-2">
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>
          <div className="border rounded max-h-32 overflow-y-auto">
            {supplierBills.map(bill => {
              const outstanding = (bill.net_amount || 0) - (bill.paid_amount || 0);
              const isSelected = selectedBillIds.includes(bill.id);
              return (
                <div key={bill.id} className={cn("flex items-center gap-2 p-1.5 text-xs cursor-pointer border-b last:border-b-0", isSelected && "bg-primary/5")}
                  onClick={() => setSelectedBillIds(prev => prev.includes(bill.id) ? prev.filter(id => id !== bill.id) : [...prev, bill.id])}>
                  <Checkbox checked={isSelected} className="h-3.5 w-3.5" />
                  <span className="flex-1 font-medium">{bill.software_bill_no || bill.supplier_invoice_no || bill.id.slice(0, 8)}</span>
                  <span className="text-muted-foreground">{bill.bill_date ? format(new Date(bill.bill_date), "dd/MM") : "-"}</span>
                  <Badge variant="destructive" className="text-[10px] h-5">₹{Math.round(outstanding).toLocaleString('en-IN')}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Payment Method</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Amount</Label>
          <Input type="number" step="0.01" placeholder="₹ Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 text-xs" />
        </div>
      </div>

      {paymentMethod === 'cheque' && (
        <div className="space-y-1">
          <Label className="text-xs">Cheque Number</Label>
          <Input placeholder="Cheque no." value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className="h-9 text-xs" />
        </div>
      )}
      {(paymentMethod === 'upi' || paymentMethod === 'bank_transfer') && (
        <div className="space-y-1">
          <Label className="text-xs">Transaction ID</Label>
          <Input placeholder="UTR / Ref ID" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} className="h-9 text-xs" />
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Description (optional)</Label>
        <Textarea placeholder="Payment note" value={description} onChange={(e) => setDescription(e.target.value)} className="text-xs min-h-[40px] resize-none" />
      </div>

      <Button
        onClick={() => createVoucher.mutate()}
        disabled={createVoucher.isPending || !referenceId || !amount}
        className={cn("w-full h-9 text-xs gap-1", showSaved ? "bg-emerald-600 hover:bg-emerald-700" : "")}
      >
        {showSaved ? <><CheckCircle2 className="h-3 w-3" /> Saved</> : <><Plus className="h-3 w-3" /> {createVoucher.isPending ? "Saving..." : "Record Payment"}</>}
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EXPENSE FORM (Compact)
// ═══════════════════════════════════════════════════════════════
function ExpenseForm({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const [voucherDate, setVoucherDate] = useState<Date>(new Date());
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [showSaved, setShowSaved] = useState(false);

  const { data: recentExpenses } = useQuery({
    queryKey: ["recent-expenses", organizationId],
    queryFn: async () => {
      const { data } = await supabase.from("voucher_entries").select("id, voucher_number, voucher_date, voucher_type, total_amount, description, category").eq("organization_id", organizationId).eq("reference_type", "expense").is("deleted_at", null).order("created_at", { ascending: false }).limit(5);
      return data || [];
    },
    enabled: !!organizationId,
  });

  const createExpense = useMutation({
    mutationFn: async () => {
      if (!category) throw new Error("Enter expense category");
      if (!amount || parseFloat(amount) <= 0) throw new Error("Enter valid amount");
      const { data: voucherNumber, error: numErr } = await supabase.rpc("generate_voucher_number", {
        p_type: "expense",
        p_date: format(voucherDate, "yyyy-MM-dd"),
      });
      if (numErr) throw numErr;
      const { data: inserted, error: insErr } = await supabase
        .from("voucher_entries")
        .insert({
          organization_id: organizationId,
          voucher_number: voucherNumber,
          voucher_type: "expense",
          voucher_date: format(voucherDate, "yyyy-MM-dd"),
          reference_type: "expense",
          description: category,
          total_amount: parseFloat(amount),
          payment_method: "cash",
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      const { data: acctSettings } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();
      const postLedger = Boolean(
        (acctSettings as { accounting_engine_enabled?: boolean } | null)?.accounting_engine_enabled
      );
      if (postLedger && inserted?.id) {
        try {
          await recordExpenseVoucherJournalEntry(
            inserted.id,
            organizationId,
            parseFloat(amount),
            "cash",
            format(voucherDate, "yyyy-MM-dd"),
            category,
            supabase
          );
        } catch (jErr) {
          await supabase.from("voucher_entries").delete().eq("id", inserted.id);
          throw jErr;
        }
      }
    },
    onSuccess: () => {
      toast.success("Expense recorded");
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["recent-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
      setVoucherDate(new Date());
      setCategory("");
      setAmount("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-start text-left text-xs h-9">
                <CalendarIcon className="mr-1 h-3 w-3" />
                {format(voucherDate, "dd/MM/yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={voucherDate} onSelect={(d) => d && setVoucherDate(d)} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Category</Label>
          <Input placeholder="e.g., Rent, Travel" value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 text-xs" />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Amount</Label>
        <Input type="number" step="0.01" placeholder="₹ Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 text-xs" />
      </div>

      <Button
        onClick={() => createExpense.mutate()}
        disabled={createExpense.isPending || !category || !amount}
        className={cn("w-full h-9 text-xs gap-1", showSaved ? "bg-emerald-600 hover:bg-emerald-700" : "")}
      >
        {showSaved ? <><CheckCircle2 className="h-3 w-3" /> Saved</> : <><Plus className="h-3 w-3" /> {createExpense.isPending ? "Saving..." : "Record Expense"}</>}
      </Button>

      {/* Recent Expenses */}
      {recentExpenses && recentExpenses.length > 0 && (
        <div className="mt-3">
          <Label className="text-xs text-muted-foreground mb-1 block">Recent Expenses</Label>
          <div className="border rounded text-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs h-7 px-2">Date</TableHead>
                  <TableHead className="text-xs h-7 px-2">Category</TableHead>
                  <TableHead className="text-xs h-7 px-2 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentExpenses.map(exp => (
                  <TableRow key={exp.id}>
                    <TableCell className="text-xs py-1 px-2">{format(new Date(exp.voucher_date), "dd/MM")}</TableCell>
                    <TableCell className="text-xs py-1 px-2 truncate max-w-[150px]">{exp.description}</TableCell>
                    <TableCell className="text-xs py-1 px-2 text-right">₹{Number(exp.total_amount).toLocaleString('en-IN')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
