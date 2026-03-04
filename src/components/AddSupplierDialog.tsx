import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AddSupplierDialogProps {
  open: boolean;
  onClose: () => void;
  onSupplierCreated: (supplier: { id: string; supplier_name: string }) => void;
}

export const AddSupplierDialog = ({
  open,
  onClose,
  onSupplierCreated,
}: AddSupplierDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();

  const [formData, setFormData] = useState({
    supplier_name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    gst_number: "",
    supplier_code: "",
    opening_balance: "",
  });

  const resetForm = () => {
    setFormData({
      supplier_name: "",
      contact_person: "",
      phone: "",
      email: "",
      address: "",
      gst_number: "",
      supplier_code: "",
      opening_balance: "",
    });
  };

  const createSupplier = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      
      // Check for duplicate supplier name
      const { data: existing } = await supabase
        .from("suppliers")
        .select("id")
        .eq("organization_id", currentOrganization.id)
        .ilike("supplier_name", data.supplier_name.trim())
        .is("deleted_at", null)
        .limit(1);
      
      if (existing && existing.length > 0) {
        throw new Error("Supplier Already Created");
      }
      
      const { data: newSupplier, error } = await supabase
        .from("suppliers")
        .insert([
          {
            supplier_name: data.supplier_name,
            contact_person: data.contact_person || null,
            phone: data.phone || null,
            email: data.email || null,
            address: data.address || null,
            gst_number: data.gst_number || null,
            supplier_code: data.supplier_code || null,
            opening_balance: data.opening_balance
              ? parseFloat(data.opening_balance)
              : 0,
            organization_id: currentOrganization.id,
          },
        ])
        .select()
        .single();
      if (error) throw error;
      return newSupplier;
    },
    onSuccess: (newSupplier) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ title: "Supplier created successfully" });
      onSupplierCreated({
        id: newSupplier.id,
        supplier_name: newSupplier.supplier_name,
      });
      resetForm();
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Error creating supplier",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.supplier_name.trim()) {
      toast({
        title: "Supplier name is required",
        variant: "destructive",
      });
      return;
    }
    createSupplier.mutate(formData);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Supplier</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="supplier_name">Supplier Name *</Label>
            <Input
              id="supplier_name"
              value={formData.supplier_name}
              onChange={(e) =>
                setFormData({ ...formData, supplier_name: e.target.value })
              }
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="contact_person">Contact Person</Label>
              <Input
                id="contact_person"
                value={formData.contact_person}
                onChange={(e) =>
                  setFormData({ ...formData, contact_person: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
            />
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="gst_number">GST Number</Label>
              <Input
                id="gst_number"
                value={formData.gst_number}
                onChange={(e) =>
                  setFormData({ ...formData, gst_number: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="supplier_code">Supplier Code</Label>
              <Input
                id="supplier_code"
                value={formData.supplier_code}
                onChange={(e) =>
                  setFormData({ ...formData, supplier_code: e.target.value })
                }
                placeholder="For barcode labels"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="opening_balance">Opening Balance (₹)</Label>
            <Input
              id="opening_balance"
              type="number"
              step="0.01"
              value={formData.opening_balance}
              onChange={(e) =>
                setFormData({ ...formData, opening_balance: e.target.value })
              }
              placeholder="Payable to supplier"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Positive = Payable to supplier
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createSupplier.isPending}>
              {createSupplier.isPending ? "Creating..." : "Create Supplier"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
