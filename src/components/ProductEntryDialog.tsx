import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Package, Barcode, Plus, Edit, Trash2, ImagePlus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { validateProduct } from "@/lib/validations";

type ProductType = 'goods' | 'service' | 'combo';

interface SizeGroup {
  id: string;
  group_name: string;
  sizes: string[];
}

interface ProductVariant {
  id?: string;
  color: string;
  size: string;
  pur_price: number;
  sale_price: number;
  mrp: number | null;
  barcode: string;
  active: boolean;
  opening_qty: number;
}

interface ProductForm {
  product_type: ProductType;
  product_name: string;
  category: string;
  brand: string;
  style: string;
  colors: string[];
  size_group_id: string;
  hsn_code: string;
  gst_per: number;
  default_pur_price: number | undefined;
  default_sale_price: number | undefined;
  default_mrp: number | undefined;
  status: string;
}

interface ProductEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProductCreated: (product: {
    id: string;
    product_name: string;
    brand: string | null;
    category: string | null;
    gst_per: number;
    hsn_code: string | null;
    color: string | null;
    variants: any[];
  }) => void;
}

export const ProductEntryDialog = ({ open, onOpenChange, onProductCreated }: ProductEntryDialogProps) => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [sizeGroups, setSizeGroups] = useState<SizeGroup[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [showVariants, setShowVariants] = useState(false);
  const [fieldSettings, setFieldSettings] = useState<any>(null);
  const [showMrp, setShowMrp] = useState(false);
  const productNameInputRef = useRef<HTMLInputElement>(null);
  const [showCreateSizeGroup, setShowCreateSizeGroup] = useState(false);
  const [newSizeGroup, setNewSizeGroup] = useState({ group_name: "", sizes: "" });
  const [productImage, setProductImage] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [creatingSizeGroup, setCreatingSizeGroup] = useState(false);
  
  const [formData, setFormData] = useState<ProductForm>({
    product_type: "goods",
    product_name: "",
    category: "",
    brand: "",
    style: "",
    colors: [],
    size_group_id: "",
    hsn_code: "",
    gst_per: 18,
    default_pur_price: undefined,
    default_sale_price: undefined,
    default_mrp: undefined,
    status: "active",
  });
  const [colorInput, setColorInput] = useState("");

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      resetForm();
      fetchSizeGroups();
      fetchFieldSettings();
      fetchDefaultSizeGroup();
      setTimeout(() => productNameInputRef.current?.focus(), 100);
    }
  }, [open]);

  const resetForm = () => {
    setFormData({
      product_type: "goods",
      product_name: "",
      category: "",
      brand: "",
      style: "",
      colors: [],
      size_group_id: "",
      hsn_code: "",
      gst_per: 18,
      default_pur_price: undefined,
      default_sale_price: undefined,
      default_mrp: undefined,
      status: "active",
    });
    setColorInput("");
    setVariants([]);
    setShowVariants(false);
    setProductImage(null);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProductImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setProductImage(null);
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  const fetchFieldSettings = async () => {
    if (!currentOrganization) return;
    
    const { data } = await supabase
      .from("settings")
      .select("product_settings")
      .eq("organization_id", currentOrganization.id)
      .single();

    if (data && typeof data.product_settings === 'object' && data.product_settings !== null) {
      const settings = data.product_settings as any;
      if (settings.fields) {
        setFieldSettings(settings.fields);
      }
    }
  };

  const fetchDefaultSizeGroup = async () => {
    if (!currentOrganization) return;
    
    const { data } = await supabase
      .from("settings")
      .select("product_settings, purchase_settings")
      .eq("organization_id", currentOrganization.id)
      .single();

    if (data) {
      if (typeof data.product_settings === 'object' && data.product_settings !== null) {
        const productSettings = data.product_settings as any;
        if (productSettings.default_size_group) {
          setFormData(prev => ({ ...prev, size_group_id: productSettings.default_size_group }));
        }
      }
      
      if (typeof data.purchase_settings === 'object' && data.purchase_settings !== null) {
        const purchaseSettings = data.purchase_settings as any;
        if (purchaseSettings.default_tax_rate !== undefined) {
          setFormData(prev => ({ ...prev, gst_per: purchaseSettings.default_tax_rate }));
        }
        setShowMrp(purchaseSettings.show_mrp || false);
      }
    }
  };

  const fetchSizeGroups = async () => {
    if (!currentOrganization) return;
    
    const { data, error } = await supabase
      .from("size_groups")
      .select("*")
      .eq("organization_id", currentOrganization.id)
      .order("group_name");

    if (!error && data) {
      const typedData: SizeGroup[] = data.map((item) => ({
        id: item.id,
        group_name: item.group_name,
        sizes: Array.isArray(item.sizes) 
          ? item.sizes.filter((s): s is string => typeof s === 'string')
          : [],
      }));
      setSizeGroups(typedData);
    }
  };

  const handleCreateSizeGroup = async () => {
    if (!newSizeGroup.group_name || !newSizeGroup.sizes) {
      toast({
        title: "Validation Error",
        description: "Please enter group name and sizes",
        variant: "destructive",
      });
      return;
    }

    if (!currentOrganization?.id) return;

    setCreatingSizeGroup(true);
    try {
      const sizesArray = newSizeGroup.sizes.split(",").map(s => s.trim()).filter(s => s);
      
      const { data, error } = await supabase
        .from("size_groups")
        .insert({
          group_name: newSizeGroup.group_name,
          sizes: sizesArray,
          organization_id: currentOrganization.id,
        })
        .select()
        .single();

      if (error) throw error;

      const newGroup: SizeGroup = {
        id: data.id,
        group_name: data.group_name,
        sizes: sizesArray,
      };
      setSizeGroups(prev => [...prev, newGroup]);
      setFormData(prev => ({ ...prev, size_group_id: data.id }));
      
      setNewSizeGroup({ group_name: "", sizes: "" });
      setShowCreateSizeGroup(false);
      
      toast({ title: "Success", description: "Size group created" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to create size group",
        variant: "destructive",
      });
    } finally {
      setCreatingSizeGroup(false);
    }
  };

  const generateSequentialBarcode = async (): Promise<string> => {
    const { data, error } = await supabase.rpc('generate_next_barcode', {
      p_organization_id: currentOrganization?.id
    });
    if (error) throw error;
    return data;
  };

  const handleGenerateSizeVariants = () => {
    if (formData.product_type === 'service') {
      const newVariants: ProductVariant[] = [{
        color: "",
        size: "Standard",
        pur_price: formData.default_pur_price ?? 0,
        sale_price: formData.default_sale_price ?? 0,
        mrp: formData.default_mrp ?? null,
        barcode: "",
        active: true,
        opening_qty: 0,
      }];
      setVariants(newVariants);
      setShowVariants(true);
      return;
    }

    const selectedGroup = sizeGroups.find((g) => g.id === formData.size_group_id);
    if (!selectedGroup) {
      toast({
        title: "Error",
        description: "Please select a size group first",
        variant: "destructive",
      });
      return;
    }

    const colorsToUse = formData.colors.length > 0 ? formData.colors : [""];
    const newVariants: ProductVariant[] = [];
    
    for (const color of colorsToUse) {
      for (const size of selectedGroup.sizes) {
        const exists = variants.some(v => v.color === color && v.size === size);
        if (!exists) {
          newVariants.push({
            color,
            size,
            pur_price: formData.default_pur_price ?? 0,
            sale_price: formData.default_sale_price ?? 0,
            mrp: formData.default_mrp ?? null,
            barcode: "",
            active: true,
            opening_qty: 0,
          });
        }
      }
    }

    setVariants([...variants, ...newVariants]);
    setShowVariants(true);
  };

  const handleAutoGenerateBarcodes = async () => {
    try {
      const updatedVariants = await Promise.all(
        variants.map(async (v) => ({
          ...v,
          barcode: v.barcode || await generateSequentialBarcode(),
        }))
      );
      setVariants(updatedVariants);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate barcodes",
        variant: "destructive",
      });
    }
  };

  const handleVariantChange = (index: number, field: keyof ProductVariant, value: any) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    setVariants(updated);
  };

  const validateForm = (): boolean => {
    const validation = validateProduct({
      product_type: formData.product_type,
      product_name: formData.product_name,
      category: formData.category || undefined,
      brand: formData.brand || undefined,
      style: formData.style || undefined,
      color: formData.colors.join(", ") || undefined,
      size_group_id: formData.size_group_id || undefined,
      hsn_code: formData.hsn_code || undefined,
      gst_per: formData.gst_per,
      default_pur_price: formData.default_pur_price,
      default_sale_price: formData.default_sale_price,
      status: formData.status as "active" | "inactive",
    });

    if (!validation.success) {
      toast({
        title: "Validation Error",
        description: validation.error,
        variant: "destructive",
      });
      return false;
    }

    // Validate variants: purchase price and sale price are required
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      
      // Check purchase price
      if (variant.pur_price === undefined || variant.pur_price === null || variant.pur_price <= 0) {
        toast({
          title: "Validation Error",
          description: `Purchase price is required for variant ${variant.size}${variant.color ? ` (${variant.color})` : ''}. Please enter a valid purchase price.`,
          variant: "destructive",
        });
        return false;
      }
      
      // Check sale price
      if (variant.sale_price === undefined || variant.sale_price === null || variant.sale_price <= 0) {
        toast({
          title: "Validation Error",
          description: `Sale price is required for variant ${variant.size}${variant.color ? ` (${variant.color})` : ''}. Please enter a valid sale price.`,
          variant: "destructive",
        });
        return false;
      }
      
      // Check MRP if enabled from settings
      if (showMrp && (variant.mrp === undefined || variant.mrp === null || variant.mrp <= 0)) {
        toast({
          title: "Validation Error",
          description: `MRP is required for variant ${variant.size}${variant.color ? ` (${variant.color})` : ''}. Please enter a valid MRP.`,
          variant: "destructive",
        });
        return false;
      }
    }

    const barcodesInForm = variants
      .map(v => v.barcode)
      .filter(b => b && b.trim() !== "");
    
    const uniqueBarcodes = new Set(barcodesInForm);
    if (barcodesInForm.length !== uniqueBarcodes.size) {
      toast({
        title: "Validation Error",
        description: "Duplicate barcodes found in variants",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    if (!currentOrganization?.id) return;

    setLoading(true);
    try {
      const productColor = formData.colors.length > 0 ? formData.colors[0] : null;
      
      const productPayload = {
        product_type: formData.product_type,
        product_name: formData.product_name,
        category: formData.category || null,
        brand: formData.brand || null,
        style: formData.style || null,
        color: productColor,
        hsn_code: formData.hsn_code || null,
        gst_per: formData.gst_per,
        default_pur_price: formData.default_pur_price,
        default_sale_price: formData.default_sale_price,
        status: formData.status,
        organization_id: currentOrganization.id,
        size_group_id: formData.size_group_id || null,
      };
      
      const { data: productData, error: productError } = await supabase
        .from("products")
        .insert([productPayload])
        .select()
        .single();

      if (productError) throw productError;

      // Insert variants
      let insertedVariants: any[] = [];
      if (variants.length > 0) {
        const variantsToInsert = variants.map((v) => ({
          product_id: productData.id,
          organization_id: currentOrganization.id,
          color: v.color || null,
          size: v.size,
          pur_price: v.pur_price,
          sale_price: v.sale_price,
          mrp: v.mrp,
          barcode: v.barcode,
          active: v.active,
          opening_qty: v.opening_qty,
          stock_qty: v.opening_qty,
        }));

        const { data: variantsData, error: variantsError } = await supabase
          .from("product_variants")
          .insert(variantsToInsert)
          .select();

        if (variantsError) throw variantsError;
        insertedVariants = variantsData || [];

        // Create stock movements for opening quantities
        if (insertedVariants.length > 0) {
          const stockMovements = insertedVariants
            .filter((v) => v.opening_qty > 0)
              .map((v) => ({
                variant_id: v.id,
                quantity: v.opening_qty,
                movement_type: "reconciliation",
                notes: `Opening stock for ${formData.product_name} - ${v.color ? v.color + ' / ' : ''}${v.size}`,
                organization_id: currentOrganization.id,
              }));

          if (stockMovements.length > 0) {
            await supabase.from("stock_movements").insert(stockMovements);
          }
        }
      }

      toast({
        title: "Success",
        description: `Product "${formData.product_name}" created`,
      });

      // Call the callback with product data
      onProductCreated({
        id: productData.id,
        product_name: productData.product_name,
        brand: productData.brand,
        category: productData.category,
        gst_per: productData.gst_per || 0,
        hsn_code: productData.hsn_code,
        color: productData.color,
        variants: insertedVariants,
      });

      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save product",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddColor = () => {
    if (colorInput.trim()) {
      const colorsToAdd = colorInput.split(",").map(c => c.trim()).filter(c => c);
      const uniqueNewColors = colorsToAdd.filter(c => !formData.colors.includes(c));
      if (uniqueNewColors.length > 0) {
        setFormData({ ...formData, colors: [...formData.colors, ...uniqueNewColors] });
      }
      setColorInput("");
    }
  };

  const handleRemoveColor = (colorToRemove: string) => {
    setFormData({
      ...formData,
      colors: formData.colors.filter(c => c !== colorToRemove),
    });
  };

  const isFieldEnabled = (fieldName: string) => {
    if (!fieldSettings) return true;
    return fieldSettings[fieldName]?.enabled !== false;
  };

  const getFieldLabel = (fieldName: string, defaultLabel: string) => {
    if (!fieldSettings) return defaultLabel;
    return fieldSettings[fieldName]?.label || defaultLabel;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Add New Product
            </DialogTitle>
            <DialogDescription>
              Create a new product with size variants
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[calc(90vh-140px)] px-6">
            <div className="space-y-6 py-4">
              {/* Product Type */}
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Label>Product Type</Label>
                  <RadioGroup
                    value={formData.product_type}
                    onValueChange={(value: ProductType) => setFormData({ ...formData, product_type: value })}
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="goods" id="goods" />
                      <Label htmlFor="goods">Goods</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="service" id="service" />
                      <Label htmlFor="service">Service</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Image Import */}
                <div className="flex items-center gap-2">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  {productImage ? (
                    <div className="relative">
                      <img
                        src={productImage}
                        alt="Product"
                        className="h-12 w-12 object-cover rounded border"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/90"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => imageInputRef.current?.click()}
                      className="gap-1"
                    >
                      <ImagePlus className="h-4 w-4" />
                      Image
                    </Button>
                  )}
                </div>
              </div>

              {/* Basic Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="product_name">{getFieldLabel("product_name", "Product Name")} *</Label>
                  <Input
                    ref={productNameInputRef}
                    id="product_name"
                    value={formData.product_name}
                    onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                    placeholder="Enter product name"
                  />
                </div>

                {isFieldEnabled("category") && (
                  <div className="space-y-2">
                    <Label htmlFor="category">{getFieldLabel("category", "Category")}</Label>
                    <Input
                      id="category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder="Category"
                    />
                  </div>
                )}

                {isFieldEnabled("brand") && (
                  <div className="space-y-2">
                    <Label htmlFor="brand">{getFieldLabel("brand", "Brand")}</Label>
                    <Input
                      id="brand"
                      value={formData.brand}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                      placeholder="Brand"
                    />
                  </div>
                )}

                {isFieldEnabled("style") && (
                  <div className="space-y-2">
                    <Label htmlFor="style">{getFieldLabel("style", "Style")}</Label>
                    <Input
                      id="style"
                      value={formData.style}
                      onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                      placeholder="Style"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="hsn_code">HSN Code</Label>
                  <Input
                    id="hsn_code"
                    value={formData.hsn_code}
                    onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                    placeholder="HSN Code"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gst_per">GST %</Label>
                  <Select
                    value={formData.gst_per.toString()}
                    onValueChange={(value) => setFormData({ ...formData, gst_per: Number(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="5">5%</SelectItem>
                      <SelectItem value="12">12%</SelectItem>
                      <SelectItem value="18">18%</SelectItem>
                      <SelectItem value="28">28%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default_pur_price">Purchase Price</Label>
                  <Input
                    id="default_pur_price"
                    type="number"
                    value={formData.default_pur_price ?? ""}
                    onChange={(e) => setFormData({ ...formData, default_pur_price: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default_sale_price">Sale Price</Label>
                  <Input
                    id="default_sale_price"
                    type="number"
                    value={formData.default_sale_price ?? ""}
                    onChange={(e) => setFormData({ ...formData, default_sale_price: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="0"
                  />
                </div>

                {showMrp && (
                  <div className="space-y-2">
                    <Label htmlFor="default_mrp">MRP</Label>
                    <Input
                      id="default_mrp"
                      type="number"
                      value={formData.default_mrp ?? ""}
                      onChange={(e) => setFormData({ ...formData, default_mrp: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="MRP"
                    />
                  </div>
                )}
              </div>

              {/* Colors Section */}
              {isFieldEnabled("color") && formData.product_type !== 'service' && (
                <div className="space-y-2">
                  <Label>{getFieldLabel("color", "Colors")} (comma-separated)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={colorInput}
                      onChange={(e) => setColorInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddColor())}
                      placeholder="e.g., Black, White, Red"
                      className="flex-1"
                    />
                    <Button type="button" variant="secondary" onClick={handleAddColor}>
                      Add
                    </Button>
                  </div>
                  {formData.colors.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {formData.colors.map((color, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-secondary text-secondary-foreground text-sm">
                          {color}
                          <button type="button" onClick={() => handleRemoveColor(color)} className="hover:text-destructive">
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Size Group Selection */}
              {formData.product_type !== 'service' && (
                <div className="space-y-2">
                  <Label>Size Group</Label>
                  <div className="flex gap-2">
                    <Select
                      value={formData.size_group_id}
                      onValueChange={(value) => setFormData({ ...formData, size_group_id: value })}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select size group" />
                      </SelectTrigger>
                      <SelectContent>
                        {sizeGroups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.group_name} ({group.sizes.join(", ")})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" onClick={() => setShowCreateSizeGroup(true)}>
                      <Plus className="h-4 w-4 mr-1" /> New
                    </Button>
                  </div>
                </div>
              )}

              {/* Generate Variants Button */}
              <Button
                type="button"
                variant="default"
                onClick={handleGenerateSizeVariants}
                disabled={formData.product_type !== 'service' && !formData.size_group_id}
                className="bg-primary hover:bg-primary/90 !text-white font-semibold border-2 border-primary shadow-md hover:shadow-lg transition-all"
              >
                <Plus className="h-4 w-4 mr-1" />
                Generate Size Variants
              </Button>

              {/* Variants Table */}
              {showVariants && variants.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Variants ({variants.length})</Label>
                    <Button type="button" variant="outline" size="sm" onClick={handleAutoGenerateBarcodes}>
                      <Barcode className="h-4 w-4 mr-1" /> Auto Generate Barcodes
                    </Button>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {formData.colors.length > 0 && <TableHead>Color</TableHead>}
                          <TableHead>Size</TableHead>
                          <TableHead>Purchase Price<span className="text-destructive">*</span></TableHead>
                          <TableHead>Sale Price<span className="text-destructive">*</span></TableHead>
                          {showMrp && <TableHead>MRP<span className="text-destructive">*</span></TableHead>}
                          <TableHead>Barcode</TableHead>
                          <TableHead>Opening Qty</TableHead>
                          <TableHead>Active</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {variants.map((variant, index) => (
                          <TableRow key={index}>
                            {formData.colors.length > 0 && (
                              <TableCell className="font-medium">{variant.color || "-"}</TableCell>
                            )}
                            <TableCell>{variant.size}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={variant.pur_price}
                                onChange={(e) => handleVariantChange(index, "pur_price", Number(e.target.value))}
                                className="w-24"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={variant.sale_price}
                                onChange={(e) => handleVariantChange(index, "sale_price", Number(e.target.value))}
                                className="w-24"
                              />
                            </TableCell>
                            {showMrp && (
                              <TableCell>
                                <Input
                                  type="number"
                                  value={variant.mrp ?? ""}
                                  onChange={(e) => handleVariantChange(index, "mrp", e.target.value ? Number(e.target.value) : null)}
                                  className="w-24"
                                />
                              </TableCell>
                            )}
                            <TableCell>
                              <Input
                                value={variant.barcode}
                                onChange={(e) => handleVariantChange(index, "barcode", e.target.value)}
                                className="w-32"
                                placeholder="Barcode"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={variant.opening_qty}
                                onChange={(e) => handleVariantChange(index, "opening_qty", Number(e.target.value))}
                                className="w-20"
                              />
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={variant.active}
                                onCheckedChange={(checked) => handleVariantChange(index, "active", checked)}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="px-6 py-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Package className="h-4 w-4 mr-2" />
                  Save Product
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Size Group Dialog */}
      <AlertDialog open={showCreateSizeGroup} onOpenChange={setShowCreateSizeGroup}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create Size Group</AlertDialogTitle>
            <AlertDialogDescription>
              Create a new size group with comma-separated sizes
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="group_name">Group Name</Label>
              <Input
                id="group_name"
                value={newSizeGroup.group_name}
                onChange={(e) => setNewSizeGroup({ ...newSizeGroup, group_name: e.target.value })}
                placeholder="e.g., Shirt Sizes"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sizes">Sizes (comma-separated)</Label>
              <Input
                id="sizes"
                value={newSizeGroup.sizes}
                onChange={(e) => setNewSizeGroup({ ...newSizeGroup, sizes: e.target.value })}
                placeholder="e.g., S, M, L, XL, XXL"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creatingSizeGroup}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateSizeGroup} disabled={creatingSizeGroup}>
              {creatingSizeGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
