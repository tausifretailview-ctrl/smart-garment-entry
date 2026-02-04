import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Package, ScanBarcode } from "lucide-react";

interface QuickAddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (productId: string) => void;
  initialBarcode?: string;
}

const GST_OPTIONS = [
  { value: "0", label: "0%" },
  { value: "5", label: "5%" },
  { value: "12", label: "12%" },
  { value: "18", label: "18%" },
  { value: "28", label: "28%" },
];

export const QuickAddProductDialog = ({ 
  open, 
  onOpenChange, 
  onSuccess,
  initialBarcode = ""
}: QuickAddProductDialogProps) => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  
  const [isLoading, setIsLoading] = useState(false);
  const [productName, setProductName] = useState("");
  const [barcode, setBarcode] = useState(initialBarcode);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [gstPercent, setGstPercent] = useState("0");
  const [openingStock, setOpeningStock] = useState("");
  
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Update barcode when initialBarcode changes
  useEffect(() => {
    if (initialBarcode) {
      setBarcode(initialBarcode);
    }
  }, [initialBarcode]);

  // Auto-focus name field when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  const resetForm = () => {
    setProductName("");
    setBarcode("");
    setPurchasePrice("");
    setSalePrice("");
    setGstPercent("0");
    setOpeningStock("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!productName.trim()) {
      toast.error("Product name is required");
      return;
    }

    if (!currentOrganization?.id) {
      toast.error("Organization not found");
      return;
    }

    const parsedPurchasePrice = parseFloat(purchasePrice) || 0;
    const parsedSalePrice = parseFloat(salePrice) || 0;
    const parsedGst = parseFloat(gstPercent) || 0;
    const parsedStock = parseInt(openingStock) || 0;

    if (parsedSalePrice <= 0) {
      toast.error("Sale price is required");
      return;
    }

    setIsLoading(true);

    try {
      // Create product
      const { data: product, error: productError } = await supabase
        .from("products")
        .insert({
          product_name: productName.trim(),
          organization_id: currentOrganization.id,
          gst_percent: parsedGst,
          hsn_code: "",
        })
        .select()
        .single();

      if (productError) throw productError;

      // Create default variant (FREE size)
      const { data: variant, error: variantError } = await supabase
        .from("product_variants")
        .insert({
          product_id: product.id,
          size: "FREE",
          color: null,
          barcode: barcode.trim() || null,
          purchase_price: parsedPurchasePrice,
          mrp: parsedSalePrice,
          stock_quantity: parsedStock,
          organization_id: currentOrganization.id,
        })
        .select()
        .single();

      if (variantError) throw variantError;

      toast.success("Product added successfully");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-variants"] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
      
      resetForm();
      onOpenChange(false);
      
      if (onSuccess && product) {
        onSuccess(product.id);
      }
    } catch (error: any) {
      console.error("Error adding product:", error);
      toast.error(error.message || "Failed to add product");
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
            <Package className="h-5 w-5 text-teal-500" />
            Add Product
          </DialogTitle>
          <DialogDescription>
            Quick add a new product. Enter basic details to get started.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="product-name">Product Name *</Label>
            <Input
              id="product-name"
              ref={nameInputRef}
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, "product-barcode")}
              placeholder="Enter product name"
              className="h-12 text-base"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-barcode">Barcode (Optional)</Label>
            <div className="relative">
              <Input
                id="product-barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, "product-purchase-price")}
                placeholder="Scan or enter barcode"
                className="h-12 text-base pr-10"
                autoComplete="off"
              />
              <ScanBarcode className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="product-purchase-price">Purchase Price</Label>
              <Input
                id="product-purchase-price"
                type="number"
                step="0.01"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, "product-sale-price")}
                placeholder="₹ 0.00"
                className="h-12 text-base"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-sale-price">Sale Price *</Label>
              <Input
                id="product-sale-price"
                type="number"
                step="0.01"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, "product-stock")}
                placeholder="₹ 0.00"
                className="h-12 text-base"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="product-gst">GST %</Label>
              <Select value={gstPercent} onValueChange={setGstPercent}>
                <SelectTrigger id="product-gst" className="h-12 text-base">
                  <SelectValue placeholder="Select GST" />
                </SelectTrigger>
                <SelectContent>
                  {GST_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-stock">Opening Stock</Label>
              <Input
                id="product-stock"
                type="number"
                value={openingStock}
                onChange={(e) => setOpeningStock(e.target.value)}
                placeholder="0"
                className="h-12 text-base"
                autoComplete="off"
              />
            </div>
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
              className="flex-1 h-12 bg-teal-500 hover:bg-teal-600"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Product"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
