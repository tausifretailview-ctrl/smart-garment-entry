import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Printer, Check, ChevronsUpDown, X, AlertCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChequePrintDialog } from "@/components/ChequePrintDialog";

interface SupplierPaymentTabProps {
  organizationId: string;
  vouchers: any[] | undefined;
  suppliers: any[] | undefined;
}

export function SupplierPaymentTab({ organizationId, vouchers, suppliers }: SupplierPaymentTabProps) {
  const queryClient = useQueryClient();

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

  // Search
  const [supplierSearchOpen, setSupplierSearchOpen] = useState(false);
  const [supplierSearchTerm, setSupplierSearchTerm] = useState("");

  // Cheque print
  const [showChequePrintDialog, setShowChequePrintDialog] = useState(false);

  // Suppliers with balance
  const { data: suppliersWithBalance } = useQuery({
    queryKey: ["suppliers-with-balance", organizationId],
    queryFn: async () => {
      const { data: allSuppliers, error: suppError } = await supabase.from("suppliers").select("*").eq("organization_id", organizationId).is("deleted_at", null).order("supplier_name");
      if (suppError) throw suppError;
      const { data: allBills, error: billsError } = await supabase.from("purchase_bills").select("supplier_id, net_amount, paid_amount").eq("organization_id", organizationId).is("deleted_at", null);
      if (billsError) throw billsError;
      const supplierBalances = new Map<string, number>();
      allBills?.forEach((bill: any) => {
        if (bill.supplier_id) {
          const outstanding = Math.max(0, (bill.net_amount || 0) - (bill.paid_amount || 0));
          supplierBalances.set(bill.supplier_id, (supplierBalances.get(bill.supplier_id) || 0) + outstanding);
        }
      });
      return allSuppliers?.filter((s: any) => {
        const ob = s.opening_balance || 0;
        const bb = supplierBalances.get(s.id) || 0;
        return (ob + bb) > 0;
      }).map((s: any) => ({ ...s, outstandingBalance: (s.opening_balance || 0) + (supplierBalances.get(s.id) || 0) })) || [];
    },
    enabled: !!organizationId,
  });

  // Supplier balance
  const { data: supplierBalance } = useQuery({
    queryKey: ["supplier-balance", referenceId],
    queryFn: async () => {
      const { data: bills } = await supabase.from("purchase_bills").select("id, net_amount").eq("supplier_id", referenceId).is("deleted_at", null);
      const billIds = bills?.map(b => b.id) || [];
      if (billIds.length === 0) return 0;
      const { data: payments } = await supabase.from("voucher_entries").select("total_amount, reference_id").eq("reference_type", "supplier").in("reference_id", billIds).is("deleted_at", null);
      const totalBills = bills?.reduce((sum, bill) => sum + (bill.net_amount || 0), 0) || 0;
      const totalPaid = payments?.reduce((sum, payment) => sum + (payment.total_amount || 0), 0) || 0;
      return totalBills - totalPaid;
    },
    enabled: !!referenceId,
  });

  // Supplier bills
  const { data: supplierBills } = useQuery({
    queryKey: ["supplier-bills", referenceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_bills").select("*").eq("supplier_id", referenceId).is("deleted_at", null).order("bill_date", { ascending: false });
      if (error) throw error;
      return data?.filter(bill => (bill.net_amount || 0) - (bill.paid_amount || 0) > 0) || [];
    },
    enabled: !!referenceId,
  });

  // Auto-fill amount
  useEffect(() => {
    if (selectedSupplierBillIds.length > 0 && supplierBills) {
      const total = supplierBills.filter(bill => selectedSupplierBillIds.includes(bill.id)).reduce((sum, bill) => sum + ((bill.net_amount || 0) - (bill.paid_amount || 0)), 0);
      setAmount(total.toFixed(2));
    }
  }, [selectedSupplierBillIds, supplierBills]);

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
      if (!referenceId) throw new Error("Please select a supplier to record payment");
      if (!amount || parseFloat(amount) <= 0) throw new Error("Please enter a valid amount");
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
          const newPaidAmount = currentPaid + amountToApply;
          const newStatus = newPaidAmount >= (bill.net_amount || 0) ? 'completed' : newPaidAmount > 0 ? 'partial' : 'unpaid';
          const { error: updateError } = await supabase.from('purchase_bills').update({ paid_amount: newPaidAmount, payment_status: newStatus }).eq('id', billId);
          if (updateError) throw updateError;
          processedBills.push({ bill, amountApplied: amountToApply });
          remainingAmount -= amountToApply;
        }
      }

      const { data: voucherNumber, error: numberError } = await supabase.rpc("generate_voucher_number", { p_type: "payment", p_date: format(voucherDate, "yyyy-MM-dd") });
      if (numberError) throw numberError;

      const billNumbers = processedBills.map(p => p.bill.software_bill_no || p.bill.supplier_invoice_no || p.bill.id.slice(0, 8)).join(', ');
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createVoucher.mutate();
  };

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
                    <p className="text-sm font-medium text-rose-900 dark:text-rose-100">Total Outstanding: <span className="text-lg font-bold">₹{supplierBalance.toFixed(2)}</span></p>
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
                                <Checkbox checked={isSelected} onCheckedChange={(checked) => {
                                  if (checked === true) setSelectedSupplierBillIds(prev => [...prev, bill.id]);
                                  else setSelectedSupplierBillIds(prev => prev.filter(id => id !== bill.id));
                                }} />
                              </TableCell>
                              <TableCell className="font-medium">{bill.software_bill_no || bill.supplier_invoice_no || bill.id.slice(0, 8)}</TableCell>
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
                      <span className="font-medium">
                        {selectedSupplierBillIds.length} bill(s) selected • Total: <span className="text-primary font-bold">
                          ₹{(supplierBills ?? []).filter(b => selectedSupplierBillIds.includes(b.id)).reduce((sum, b) => sum + (Number(b.net_amount || 0) - Number(b.paid_amount || 0)), 0).toFixed(2)}
                        </span>
                      </span>
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
                <Input type="number" step="0.01" placeholder="Enter amount" value={amount} onChange={(e) => setAmount(e.target.value)} required />
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
              <Button type="submit" className="w-full md:w-auto" disabled={createVoucher.isPending}>
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

      {/* Recent Supplier Payments */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Supplier Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Voucher No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers?.filter((v) => v.reference_type === "supplier" && v.voucher_type === "payment").slice(0, 10).map((voucher) => (
                <TableRow key={voucher.id}>
                  <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                  <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                  <TableCell>{suppliers?.find((s) => s.id === voucher.reference_id)?.supplier_name || "-"}</TableCell>
                  <TableCell>₹{voucher.total_amount.toFixed(2)}</TableCell>
                  <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
