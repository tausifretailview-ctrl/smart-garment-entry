import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CalendarIcon, Check, ChevronsUpDown, Coins } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCustomerAdvances } from "@/hooks/useCustomerAdvances";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

  const { createAdvance } = useCustomerAdvances(organizationId);

  // Server-side search for customers with advance balances
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

      // Fetch advance balances for these customers
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

  const selectedCustomer = customers?.find(c => c.id === customerId);

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

    try {
      await createAdvance.mutateAsync({
        customerId,
        amount: parseFloat(amount),
        paymentMethod,
        description: description || undefined,
        chequeNumber: paymentMethod === "cheque" ? chequeNumber : undefined,
        transactionId: (paymentMethod === "upi" || paymentMethod === "bank_transfer") ? transactionId : undefined,
        advanceDate,
      });

      onOpenChange(false);
    } catch (error) {
      // Error already handled by mutation
    }
  };

  return (
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
  );
}
