import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CalendarIcon, Check, ChevronsUpDown, Coins, Printer } from "lucide-react";
import { AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCustomerAdvances } from "@/hooks/useCustomerAdvances";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useReactToPrint } from "react-to-print";
import { AdvanceBookingReceipt } from "@/components/AdvanceBookingReceipt";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";

interface AddAdvanceBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}

export function AddAdvanceBookingDialog({ 
  open, 
  onOpenChange, 
  organizationId 
}: AddAdvanceBookingDialogProps) {
  const [customerId, setCustomerId] = useState("");
  const [selectedCustomerData, setSelectedCustomerData] = useState<{ id: string; customer_name: string; phone: string | null } | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [description, setDescription] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [advanceDate, setAdvanceDate] = useState<Date>(new Date());
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");

  // Print state
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [printPaperSize, setPrintPaperSize] = useState<"A4" | "A5">("A5");
  const [savedAdvanceData, setSavedAdvanceData] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { createAdvance } = useCustomerAdvances(organizationId);
  const { currentOrganization } = useOrganization();
  const { data: settings } = useSettings();

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Advance-${savedAdvanceData?.advanceNumber || "Receipt"}`,
    onAfterPrint: () => {
      setShowPrintPrompt(false);
      setSavedAdvanceData(null);
      onOpenChange(false);
    },
  });

  // Server-side search for customers
  const { data: customers } = useQuery({
    queryKey: ["customers-for-advance", organizationId, customerSearchTerm],
    queryFn: async () => {
      let query = supabase
        .from("customers")
        .select("id, customer_name, phone")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("customer_name")
        .limit(50);

      if (customerSearchTerm.trim()) {
        const term = `%${customerSearchTerm.trim()}%`;
        query = query.or(`customer_name.ilike.${term},phone.ilike.${term}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        const customerIds = data.map(c => c.id);
        const { data: advances } = await supabase
          .from("customer_advances")
          .select("customer_id, amount, used_amount")
          .in("customer_id", customerIds)
          .eq("organization_id", organizationId)
          .in("status", ["active", "partially_used"]);

        const balanceMap: Record<string, number> = {};
        advances?.forEach(adv => {
          const available = (adv.amount || 0) - (adv.used_amount || 0);
          if (available > 0) {
            balanceMap[adv.customer_id] = (balanceMap[adv.customer_id] || 0) + available;
          }
        });

        return data.map(c => ({ ...c, advanceBalance: balanceMap[c.id] || 0 }));
      }

      return data?.map(c => ({ ...c, advanceBalance: 0 })) || [];
    },
    enabled: !!organizationId,
  });

  const resetForm = () => {
    setCustomerId("");
    setSelectedCustomerData(null);
    setAmount("");
    setPaymentMethod("cash");
    setDescription("");
    setChequeNumber("");
    setTransactionId("");
    setAdvanceDate(new Date());
    setCustomerSearchTerm("");
    setShowPrintPrompt(false);
    setSavedAdvanceData(null);
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!customerId) {
      toast.error("Please select a customer");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    // Get current user for audit log
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? null;
    const numericAmount = parseFloat(amount);

    // Audit: record the attempt up-front so we have a record even if
    // the network call dies, the tab closes, or the GL post rolls back.
    let attemptId: string | null = null;
    try {
      const { data: attemptRow } = await supabase
        .from("advance_booking_attempts" as any)
        .insert({
          organization_id: organizationId,
          user_id: userId,
          customer_id: customerId,
          customer_name: selectedCustomerData?.customer_name ?? null,
          amount: numericAmount,
          payment_method: paymentMethod,
          status: "attempted",
        } as any)
        .select("id")
        .single();
      attemptId = (attemptRow as any)?.id ?? null;
    } catch {
      // non-blocking
    }

    try {
      const result = await createAdvance.mutateAsync({
        customerId,
        amount: numericAmount,
        paymentMethod,
        description: description || undefined,
        chequeNumber: paymentMethod === "cheque" ? chequeNumber : undefined,
        transactionId: (paymentMethod === "upi" || paymentMethod === "bank_transfer") ? transactionId : undefined,
        advanceDate,
      });

      // Post-save verification: re-read the row to confirm it actually persisted
      // (the create flow rolls back the advance row if GL posting fails).
      const { data: verifyRow } = await supabase
        .from("customer_advances")
        .select("id, advance_number")
        .eq("id", (result as any).id)
        .maybeSingle();

      if (!verifyRow) {
        const msg = "Advance was rolled back by the accounting engine. Please check chart of accounts (Customer Advances 2150 and the cash/bank/UPI ledgers) and try again.";
        if (attemptId) {
          await supabase
            .from("advance_booking_attempts" as any)
            .update({ status: "failed", error_message: msg } as any)
            .eq("id", attemptId);
        }
        setSaveError(msg);
        return;
      }

      if (attemptId) {
        await supabase
          .from("advance_booking_attempts" as any)
          .update({ status: "succeeded", advance_id: (result as any).id } as any)
          .eq("id", attemptId);
      }

      // Store data for printing
      setSavedAdvanceData({
        advanceNumber: result.advance_number,
        advanceDate: result.advance_date,
        customerName: selectedCustomerData?.customer_name || "",
        customerPhone: selectedCustomerData?.phone || undefined,
        amount: numericAmount,
        paymentMethod,
        chequeNumber: paymentMethod === "cheque" ? chequeNumber : undefined,
        transactionId: (paymentMethod === "upi" || paymentMethod === "bank_transfer") ? transactionId : undefined,
        description: description || undefined,
      });
      setShowPrintPrompt(true);
    } catch (error: any) {
      const msg = error?.message || "Unknown error while saving advance.";
      if (attemptId) {
        await supabase
          .from("advance_booking_attempts" as any)
          .update({ status: "failed", error_message: msg } as any)
          .eq("id", attemptId);
      }
      setSaveError(msg);
    }
  };

  const companyDetails = {
    businessName: (settings as any)?.business_name || currentOrganization?.name || "Business",
    address: (settings as any)?.address || "",
    phone: (settings as any)?.mobile_number || "",
    email: (settings as any)?.email_id || "",
    gstNumber: (settings as any)?.gst_number || "",
  };

  const handleSkipPrint = () => {
    setShowPrintPrompt(false);
    setSavedAdvanceData(null);
    onOpenChange(false);
  };

  // Print prompt view
  if (showPrintPrompt && savedAdvanceData) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) handleSkipPrint(); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              Print Advance Receipt
            </DialogTitle>
            <DialogDescription>
              Advance <strong>{savedAdvanceData.advanceNumber}</strong> saved successfully. Would you like to print the receipt?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md p-3 text-center">
              <p className="text-sm text-muted-foreground">Amount Received</p>
              <p className="text-2xl font-bold text-green-600">₹{savedAdvanceData.amount.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground mt-1">{savedAdvanceData.customerName}</p>
            </div>

            <div className="space-y-2">
              <Label>Paper Size</Label>
              <Select value={printPaperSize} onValueChange={(v) => setPrintPaperSize(v as "A4" | "A5")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A5">A5 (Half Page)</SelectItem>
                  <SelectItem value="A4">A4 (Full Page)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleSkipPrint}>
              Skip
            </Button>
            <Button onClick={() => handlePrint()} className="bg-primary hover:bg-primary/90">
              <Printer className="h-4 w-4 mr-1" /> Print Receipt
            </Button>
          </DialogFooter>

          {/* Hidden print component */}
          <AdvanceBookingReceipt
            ref={printRef}
            data={savedAdvanceData}
            company={companyDetails}
            paperSize={printPaperSize}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            Add Advance Booking
          </DialogTitle>
          <DialogDescription>
            Record an advance payment from a customer for future orders.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date */}
          <div className="space-y-2">
            <Label>Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !advanceDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {advanceDate ? format(advanceDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={advanceDate}
                  onSelect={(date) => date && setAdvanceDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Customer Selection */}
          <div className="space-y-2">
            <Label>Customer *</Label>
            <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={customerSearchOpen}
                  className="w-full justify-between"
                >
                  {selectedCustomerData
                    ? selectedCustomerData.customer_name
                    : "Select customer..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search customer by name or phone..."
                    value={customerSearchTerm}
                    onValueChange={setCustomerSearchTerm}
                  />
                  <CommandList>
                    <CommandEmpty>No customer found.</CommandEmpty>
                    <CommandGroup>
                      {customers
                        ?.map((customer) => (
                          <CommandItem
                            key={customer.id}
                            value={customer.customer_name + customer.phone}
                            onSelect={() => {
                              setCustomerId(customer.id);
                              setSelectedCustomerData(customer);
                              setCustomerSearchOpen(false);
                              setCustomerSearchTerm("");
                            }}
                          >
                            <div className="flex flex-col flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{customer.customer_name}</span>
                                {customer.advanceBalance > 0 && (
                                  <span className="text-xs font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                    ₹{customer.advanceBalance.toLocaleString("en-IN")} adv
                                  </span>
                                )}
                              </div>
                              {customer.phone && (
                                <span className="text-xs text-muted-foreground">{customer.phone}</span>
                              )}
                            </div>
                            {customerId === customer.id && (
                              <Check className="ml-auto h-4 w-4 text-primary" />
                            )}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label>Amount *</Label>
            <Input
              type="number"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Cheque Number - conditional */}
          {paymentMethod === "cheque" && (
            <div className="space-y-2">
              <Label>Cheque Number</Label>
              <Input
                placeholder="Enter cheque number"
                value={chequeNumber}
                onChange={(e) => setChequeNumber(e.target.value)}
              />
            </div>
          )}

          {/* Transaction ID - conditional */}
          {(paymentMethod === "upi" || paymentMethod === "bank_transfer") && (
            <div className="space-y-2">
              <Label>Transaction ID</Label>
              <Input
                placeholder="Enter transaction ID"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
              />
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label>Description (Optional)</Label>
            <Textarea
              placeholder="e.g., Advance for wedding order"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={createAdvance.isPending}
            className="bg-primary hover:bg-primary/90"
          >
            {createAdvance.isPending ? "Saving..." : "Save Advance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Blocking error dialog — user MUST acknowledge */}
    <Dialog open={!!saveError} onOpenChange={(o) => { if (!o) setSaveError(null); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Advance NOT Saved
          </DialogTitle>
          <DialogDescription>
            The advance booking was <strong>not</strong> recorded. Nothing was saved to the database.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm font-mono text-destructive">
          {saveError}
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={() => setSaveError(null)}>
            OK, I understand
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
