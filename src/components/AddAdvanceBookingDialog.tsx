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
import { CalendarIcon, Check, ChevronsUpDown, Coins, Gift, MessageCircle, Printer, UserPlus } from "lucide-react";
import { AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCustomerAdvances } from "@/hooks/useCustomerAdvances";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useReactToPrint } from "@/hooks/useGuardedReactToPrint";
import {
  AdvanceBookingReceipt,
  AdvanceReceiptPaperSelect,
  advanceReceiptPageStyle,
  initialAdvanceReceiptPaper,
  type AdvanceReceiptPaper,
} from "@/components/AdvanceBookingReceipt";
import { QuickAddCustomerDialog } from "@/components/mobile/QuickAddCustomerDialog";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_GIFT_VOUCHER_MONTHS,
  GIFT_VOUCHER_VALIDITY_OPTIONS,
  generateGiftVoucherCode,
  giftVoucherDescription,
  giftVoucherExpiry,
  giftVoucherWhatsAppPhone,
  giftVoucherWhatsAppText,
} from "@/utils/giftVoucher";
import { whatsappShareUrl } from "@/lib/storefrontShare";
import { isGiftVoucherEnabled } from "@/utils/whatsappFeatureSwitches";

interface AddAdvanceBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  /** Open with "Sell as gift voucher" switched on. */
  giftVoucher?: boolean;
}

export function AddAdvanceBookingDialog({ 
  open, 
  onOpenChange, 
  organizationId,
  giftVoucher = false,
}: AddAdvanceBookingDialogProps) {
  const [isGift, setIsGift] = useState(giftVoucher);
  const [giver, setGiver] = useState("");
  const [validityMonths, setValidityMonths] = useState<number>(DEFAULT_GIFT_VOUCHER_MONTHS);
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
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false);

  // Print state
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [printPaperSize, setPrintPaperSize] = useState<AdvanceReceiptPaper>("A5");
  const [savedAdvanceData, setSavedAdvanceData] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { createAdvance } = useCustomerAdvances(organizationId);
  const { currentOrganization } = useOrganization();
  const { data: settings } = useSettings();
  const giftVouchersOn = isGiftVoucherEnabled((settings as { sale_settings?: unknown } | null)?.sale_settings);

  const printPageStyle = advanceReceiptPageStyle(printPaperSize);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    ...(printPageStyle ? { pageStyle: printPageStyle } : {}),
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
    setGiver("");
    setValidityMonths(DEFAULT_GIFT_VOUCHER_MONTHS);
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    } else {
      setIsGift(giftVoucher);
    }
  }, [open, giftVoucher]);

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
    const voucherCode = isGift ? generateGiftVoucherCode() : null;
    const voucherValidTill = giftVoucherExpiry(advanceDate, validityMonths);
    const savedDescription = voucherCode
      ? giftVoucherDescription(voucherCode, voucherValidTill, giver, description)
      : description || undefined;

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
        description: savedDescription,
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

      // Voucher code + expiry for POS lookup. If the gift voucher SQL is not run yet the
      // update fails quietly and the receipt number works as the code instead.
      let printedCode = voucherCode;
      if (voucherCode) {
        const { error: voucherErr } = await supabase
          .from("customer_advances")
          .update({
            is_gift_voucher: true,
            voucher_code: voucherCode,
            voucher_expires_on: format(voucherValidTill, "yyyy-MM-dd"),
            voucher_from: giver.trim() || null,
          } as never)
          .eq("id", verifyRow.id);
        if (voucherErr) printedCode = verifyRow.advance_number;
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
        description: printedCode ? undefined : description || undefined,
        giftVoucher: printedCode
          ? { code: printedCode, validTill: format(voucherValidTill, "dd MMM yyyy"), from: giver.trim() || undefined }
          : undefined,
      });
      setPrintPaperSize(initialAdvanceReceiptPaper(settings));
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

  const handleQuickAddCustomerSuccess = async (newCustomerId: string) => {
    const { data } = await supabase
      .from("customers")
      .select("id, customer_name, phone")
      .eq("id", newCustomerId)
      .maybeSingle();
    setCustomerId(newCustomerId);
    if (data) setSelectedCustomerData(data);
    setCustomerSearchOpen(false);
    setCustomerSearchTerm("");
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
              {savedAdvanceData.giftVoucher ? "Print Gift Voucher" : "Print Advance Receipt"}
            </DialogTitle>
            <DialogDescription>
              {savedAdvanceData.giftVoucher ? (
                <>
                  Gift voucher <strong>{savedAdvanceData.giftVoucher.code}</strong> saved. Print it or send it on WhatsApp.
                </>
              ) : (
                <>
                  Advance <strong>{savedAdvanceData.advanceNumber}</strong> saved successfully. Would you like to print the receipt?
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md p-3 text-center">
              <p className="text-sm text-muted-foreground">Amount Received</p>
              <p className="text-2xl font-bold text-green-600">₹{savedAdvanceData.amount.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground mt-1">{savedAdvanceData.customerName}</p>
              {savedAdvanceData.giftVoucher && (
                <p className="mt-2 font-mono text-xl font-bold tracking-widest text-pink-700">{savedAdvanceData.giftVoucher.code}</p>
              )}
            </div>
            {savedAdvanceData.giftVoucher && (
              <Button variant="outline" className="w-full border-green-300 text-green-700" asChild>
                <a
                  href={whatsappShareUrl(
                    giftVoucherWhatsAppText({
                      shopName: companyDetails.businessName,
                      receiverName: savedAdvanceData.customerName,
                      amount: savedAdvanceData.amount,
                      code: savedAdvanceData.giftVoucher.code,
                      validTill: savedAdvanceData.giftVoucher.validTill,
                      from: savedAdvanceData.giftVoucher.from,
                    }),
                    giftVoucherWhatsAppPhone(savedAdvanceData.customerPhone),
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="h-4 w-4 mr-1" /> Send voucher on WhatsApp
                </a>
              </Button>
            )}

            <div className="space-y-2">
              <Label>Paper Size</Label>
              <AdvanceReceiptPaperSelect value={printPaperSize} onChange={setPrintPaperSize} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleSkipPrint}>
              Skip
            </Button>
            <Button onClick={() => handlePrint()} className="bg-primary hover:bg-primary/90">
              <Printer className="h-4 w-4 mr-1" /> {savedAdvanceData.giftVoucher ? "Print Voucher" : "Print Receipt"}
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
            {isGift ? <Gift className="h-5 w-5 text-pink-600" /> : <Coins className="h-5 w-5 text-primary" />}
            {isGift ? "Sell Gift Voucher" : "Add Advance Booking"}
          </DialogTitle>
          <DialogDescription>
            {isGift
              ? "Book the voucher in the name of the person receiving it. They show the code at billing and it comes off their bill."
              : "Record an advance payment from a customer for future orders."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {giftVouchersOn && (
            <label className="flex items-center justify-between gap-3 rounded-md border border-pink-200 bg-pink-50/60 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 font-medium text-pink-800">
                <Gift className="h-4 w-4" /> Sell as gift voucher
              </span>
              <Switch checked={isGift} onCheckedChange={setIsGift} />
            </label>
          )}
          {isGift && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="gift-from">From (optional)</Label>
                <Input id="gift-from" placeholder="Who is giving it" value={giver} onChange={(e) => setGiver(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Valid for</Label>
                <Select value={String(validityMonths)} onValueChange={(v) => setValidityMonths(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GIFT_VOUCHER_VALIDITY_OPTIONS.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m} months
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
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
            <div className="flex items-center justify-between">
              <Label>{isGift ? "Voucher for (receiver) *" : "Customer *"}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-primary"
                onClick={() => setShowQuickAddCustomer(true)}
              >
                <UserPlus className="h-4 w-4 mr-1" /> New Customer
              </Button>
            </div>
            <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen} modal>
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
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] sm:w-[400px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search customer by name or phone..."
                    value={customerSearchTerm}
                    onValueChange={setCustomerSearchTerm}
                  />
                  <CommandList className="max-h-[min(280px,50vh)]">
                    <CommandEmpty>
                      <div className="space-y-2">
                        <p>No customer found.</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCustomerSearchOpen(false);
                            setShowQuickAddCustomer(true);
                          }}
                        >
                          <UserPlus className="h-4 w-4 mr-1" /> Create new customer
                        </Button>
                      </div>
                    </CommandEmpty>
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

    <QuickAddCustomerDialog
      open={showQuickAddCustomer}
      onOpenChange={setShowQuickAddCustomer}
      onSuccess={handleQuickAddCustomerSuccess}
    />

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
