import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Pencil, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BrandDiscount {
  id: string;
  brand: string;
  discount_percent: number;
}

interface BrandDiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: { id: string; name: string } | null;
}

export function BrandDiscountDialog({
  open,
  onOpenChange,
  customer,
}: BrandDiscountDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  
  const [newBrand, setNewBrand] = useState<string>("");
  const [newDiscount, setNewDiscount] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDiscount, setEditDiscount] = useState<string>("");

  // Fetch unique brands from products
  const { data: brands = [] } = useQuery({
    queryKey: ["unique-brands", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const { data, error } = await supabase
        .from("products")
        .select("brand")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .not("brand", "is", null)
        .not("brand", "eq", "");
      
      if (error) throw error;
      
      // Get unique brands
      const uniqueBrands = [...new Set(data?.map((p) => p.brand).filter(Boolean) || [])];
      return uniqueBrands.sort();
    },
    enabled: !!currentOrganization?.id && open,
  });

  // Fetch existing brand discounts for this customer
  const { data: brandDiscounts = [], isLoading } = useQuery({
    queryKey: ["customer-brand-discounts", customer?.id],
    queryFn: async () => {
      if (!customer?.id || !currentOrganization?.id) return [];
      
      const { data, error } = await supabase
        .from("customer_brand_discounts")
        .select("*")
        .eq("customer_id", customer.id)
        .eq("organization_id", currentOrganization.id)
        .order("brand");
      
      if (error) throw error;
      return (data || []) as BrandDiscount[];
    },
    enabled: !!customer?.id && !!currentOrganization?.id && open,
  });

  // Add brand discount mutation
  const addBrandDiscount = useMutation({
    mutationFn: async (data: { brand: string; discount_percent: number }) => {
      if (!customer?.id || !currentOrganization?.id) throw new Error("Missing data");
      
      const { error } = await supabase
        .from("customer_brand_discounts")
        .insert({
          customer_id: customer.id,
          organization_id: currentOrganization.id,
          brand: data.brand,
          discount_percent: data.discount_percent,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-brand-discounts", customer?.id] });
      toast({ title: "Brand discount added" });
      setNewBrand("");
      setNewDiscount("");
    },
    onError: (error: any) => {
      if (error.message?.includes("duplicate")) {
        toast({ 
          title: "Brand already exists", 
          description: "This brand already has a discount for this customer",
          variant: "destructive" 
        });
      } else {
        toast({ title: "Error adding brand discount", description: error.message, variant: "destructive" });
      }
    },
  });

  // Update brand discount mutation
  const updateBrandDiscount = useMutation({
    mutationFn: async (data: { id: string; discount_percent: number }) => {
      const { error } = await supabase
        .from("customer_brand_discounts")
        .update({ discount_percent: data.discount_percent, updated_at: new Date().toISOString() })
        .eq("id", data.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-brand-discounts", customer?.id] });
      toast({ title: "Discount updated" });
      setEditingId(null);
      setEditDiscount("");
    },
    onError: (error) => {
      toast({ title: "Error updating discount", description: error.message, variant: "destructive" });
    },
  });

  // Delete brand discount mutation
  const deleteBrandDiscount = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("customer_brand_discounts")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-brand-discounts", customer?.id] });
      toast({ title: "Brand discount removed" });
    },
    onError: (error) => {
      toast({ title: "Error removing discount", description: error.message, variant: "destructive" });
    },
  });

  const handleAdd = () => {
    if (!newBrand || !newDiscount) {
      toast({ title: "Please select brand and enter discount", variant: "destructive" });
      return;
    }
    
    const discount = parseFloat(newDiscount);
    if (isNaN(discount) || discount < 0 || discount > 100) {
      toast({ title: "Discount must be between 0 and 100", variant: "destructive" });
      return;
    }
    
    addBrandDiscount.mutate({ brand: newBrand, discount_percent: discount });
  };

  const handleEdit = (item: BrandDiscount) => {
    setEditingId(item.id);
    setEditDiscount(item.discount_percent.toString());
  };

  const handleSaveEdit = (id: string) => {
    const discount = parseFloat(editDiscount);
    if (isNaN(discount) || discount < 0 || discount > 100) {
      toast({ title: "Discount must be between 0 and 100", variant: "destructive" });
      return;
    }
    updateBrandDiscount.mutate({ id, discount_percent: discount });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditDiscount("");
  };

  // Get brands not already assigned
  const availableBrands = brands.filter(
    (brand) => !brandDiscounts.some((bd) => bd.brand === brand)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Brand-wise Discount - {customer?.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Add new brand discount */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label htmlFor="brand">Brand</Label>
              <Select value={newBrand} onValueChange={setNewBrand}>
                <SelectTrigger>
                  <SelectValue placeholder="Select brand" />
                </SelectTrigger>
                <SelectContent>
                  {availableBrands.map((brand) => (
                    <SelectItem key={brand} value={brand}>
                      {brand}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24">
              <Label htmlFor="discount">Discount %</Label>
              <Input
                id="discount"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={newDiscount}
                onChange={(e) => setNewDiscount(e.target.value)}
                placeholder="0"
              />
            </div>
            <Button 
              onClick={handleAdd} 
              disabled={addBrandDiscount.isPending || !newBrand || !newDiscount}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>

          {/* Existing brand discounts */}
          <div className="border rounded-lg max-h-64 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Discount %</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center">Loading...</TableCell>
                  </TableRow>
                ) : brandDiscounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No brand discounts configured
                    </TableCell>
                  </TableRow>
                ) : (
                  brandDiscounts.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.brand}</TableCell>
                      <TableCell className="text-right">
                        {editingId === item.id ? (
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={editDiscount}
                            onChange={(e) => setEditDiscount(e.target.value)}
                            className="w-20 text-right ml-auto"
                            autoFocus
                          />
                        ) : (
                          `${item.discount_percent}%`
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {editingId === item.id ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSaveEdit(item.id)}
                              disabled={updateBrandDiscount.isPending}
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleCancelEdit}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(item)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteBrandDiscount.mutate(item.id)}
                              disabled={deleteBrandDiscount.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            Brand discounts will be auto-applied when scanning products in Sales & POS
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
