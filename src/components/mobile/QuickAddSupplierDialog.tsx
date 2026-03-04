import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Building2 } from "lucide-react";

interface QuickAddSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (supplierId: string) => void;
}

export const QuickAddSupplierDialog = ({ 
  open, 
  onOpenChange, 
  onSuccess 
}: QuickAddSupplierDialogProps) => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  
  const [isLoading, setIsLoading] = useState(false);
  const [supplierName, setSupplierName] = useState("");
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
    setSupplierName("");
    setPhone("");
    setGstNumber("");
    setAddress("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!supplierName.trim()) {
      toast.error("Supplier name is required");
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
      // Check for duplicate supplier name
      const { data: existing } = await supabase
        .from("suppliers")
        .select("id")
        .eq("organization_id", currentOrganization.id)
        .ilike("supplier_name", supplierName.trim())
        .is("deleted_at", null)
        .limit(1);
      
      if (existing && existing.length > 0) {
        toast.error("Supplier Already Created");
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("suppliers")
        .insert({
          supplier_name: supplierName.trim(),
          phone: phone.trim(),
          gst_number: gstNumber.trim() || null,
          address: address.trim() || null,
          organization_id: currentOrganization.id,
          opening_balance: 0,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Supplier added successfully");
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-with-balance"] });
      
      resetForm();
      onOpenChange(false);
      
      if (onSuccess && data) {
        onSuccess(data.id);
      }
    } catch (error: any) {
      console.error("Error adding supplier:", error);
      toast.error(error.message || "Failed to add supplier");
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
            <Building2 className="h-5 w-5 text-orange-500" />
            Add Supplier
          </DialogTitle>
          <DialogDescription>
            Quick add a new supplier. Only name and phone are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="supplier-name">Supplier Name *</Label>
            <Input
              id="supplier-name"
              ref={nameInputRef}
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, "supplier-phone")}
              placeholder="Enter supplier name"
              className="h-12 text-base"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-phone">Mobile Number *</Label>
            <Input
              id="supplier-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, "supplier-gst")}
              placeholder="Enter mobile number"
              className="h-12 text-base"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-gst">GST Number (Optional)</Label>
            <Input
              id="supplier-gst"
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
              onKeyDown={(e) => handleKeyDown(e, "supplier-address")}
              placeholder="e.g., 29ABCDE1234F1Z5"
              className="h-12 text-base"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-address">Address (Optional)</Label>
            <Textarea
              id="supplier-address"
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
              className="flex-1 h-12 bg-orange-500 hover:bg-orange-600"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Supplier"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
