import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { createOrGetCustomer } from "@/utils/customerUtils";

interface QuickAddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (customerId: string) => void;
}

export const QuickAddCustomerDialog = ({ 
  open, 
  onOpenChange, 
  onSuccess 
}: QuickAddCustomerDialogProps) => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  
  const [isLoading, setIsLoading] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [address, setAddress] = useState("");
  
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus name field when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  const resetForm = () => {
    setCustomerName("");
    setPhone("");
    setGstNumber("");
    setAddress("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    
    if (!phone.trim()) {
      toast.error("Phone number is required");
      return;
    }

    if (!currentOrganization?.id) {
      toast.error("Organization not found");
      return;
    }

    setIsLoading(true);

    try {
      const result = await createOrGetCustomer({
        customer_name: customerName.trim(),
        phone: phone.trim(),
        gst_number: gstNumber.trim() || undefined,
        address: address.trim() || undefined,
        organization_id: currentOrganization.id,
        opening_balance: 0,
      });

      if (result.isExisting) {
        toast.success(`Customer "${result.customer.customer_name}" already exists and was selected`);
      } else {
        toast.success("Customer added successfully");
      }
      
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customers-with-balance"] });
      
      resetForm();
      onOpenChange(false);
      
      if (onSuccess) {
        onSuccess(result.customer.id);
      }
    } catch (error: any) {
      console.error("Error adding customer:", error);
      toast.error(error.message || "Failed to add customer");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Enter key to move to next field
  const handleKeyDown = (e: React.KeyboardEvent, nextFieldId: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const nextField = document.getElementById(nextFieldId);
      nextField?.focus();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Add Customer
          </DialogTitle>
          <DialogDescription>
            Quick add a new customer. Only name and phone are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="customer-name">Customer Name *</Label>
            <Input
              id="customer-name"
              ref={nameInputRef}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, "customer-phone")}
              placeholder="Enter customer name"
              className="h-12 text-base"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer-phone">Mobile Number *</Label>
            <Input
              id="customer-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, "customer-gst")}
              placeholder="Enter mobile number"
              className="h-12 text-base"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer-gst">GST Number (Optional)</Label>
            <Input
              id="customer-gst"
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
              onKeyDown={(e) => handleKeyDown(e, "customer-address")}
              placeholder="e.g., 29ABCDE1234F1Z5"
              className="h-12 text-base"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer-address">Address (Optional)</Label>
            <Textarea
              id="customer-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter address"
              className="min-h-[80px] text-base resize-none"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-12"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 h-12"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Customer"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
