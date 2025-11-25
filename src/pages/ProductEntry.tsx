import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Loader2, Package, Barcode, Upload, X } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";

interface SizeGroup {
  id: string;
  group_name: string;
  sizes: string[];
}

interface ProductVariant {
  size: string;
  pur_price: number;
  sale_price: number;
  barcode: string;
  active: boolean;
  opening_qty: number;
}

interface ProductForm {
  product_name: string;
  category: string;
  brand: string;
  style: string;
  color: string;
  size_group_id: string;
  hsn_code: string;
  gst_per: number;
  default_pur_price: number | undefined;
  default_sale_price: number | undefined;
  status: string;
  image_url?: string;
}

const ProductEntry = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentOrganization } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sizeGroups, setSizeGroups] = useState<SizeGroup[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [showVariants, setShowVariants] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [fieldSettings, setFieldSettings] = useState<any>(null);
  const productNameInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<ProductForm>({
    product_name: "",
    category: "",
    brand: "",
    style: "",
    color: "",
    size_group_id: "",
    hsn_code: "",
    gst_per: 18,
    default_pur_price: undefined,
    default_sale_price: undefined,
    status: "active",
  });

  useEffect(() => {
    fetchSizeGroups();
    fetchFieldSettings();
    fetchDefaultSizeGroup();
    
    // Check if we're editing an existing product
    const searchParams = new URLSearchParams(location.search);
    const productId = searchParams.get('id');
    if (productId) {
      setEditingProductId(productId);
      fetchProductForEdit(productId);
    }
  }, [location.search]);

  const fetchFieldSettings = async () => {
    if (!currentOrganization) return;
    
    const { data, error } = await supabase
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
    
    const { data, error } = await supabase
      .from("settings")
      .select("product_settings, purchase_settings")
      .eq("organization_id", currentOrganization.id)
      .single();

    if (data) {
      // Apply default size group
      if (typeof data.product_settings === 'object' && data.product_settings !== null) {
        const productSettings = data.product_settings as any;
        if (productSettings.default_size_group && !editingProductId) {
          setFormData(prev => ({ ...prev, size_group_id: productSettings.default_size_group }));
        }
      }
      
      // Apply default GST tax rate
      if (typeof data.purchase_settings === 'object' && data.purchase_settings !== null) {
        const purchaseSettings = data.purchase_settings as any;
        if (purchaseSettings.default_tax_rate !== undefined && !editingProductId) {
          setFormData(prev => ({ ...prev, gst_per: purchaseSettings.default_tax_rate }));
        }
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

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load size groups",
        variant: "destructive",
      });
    } else {
      const typedData: SizeGroup[] = (data || []).map((item) => ({
        id: item.id,
        group_name: item.group_name,
        sizes: Array.isArray(item.sizes) 
          ? item.sizes.filter((s): s is string => typeof s === 'string')
          : [],
      }));
      setSizeGroups(typedData);
    }
  };

  const fetchProductForEdit = async (productId: string) => {
    setLoading(true);
    try {
      const { data: product, error } = await supabase
        .from("products")
        .select(`
          *,
          product_variants (*)
        `)
        .eq("id", productId)
        .single();

      if (error) throw error;

      if (product) {
        // Set form data
        setFormData({
          product_name: product.product_name || "",
          category: product.category || "",
          brand: product.brand || "",
          style: product.style || "",
          color: product.color || "",
          size_group_id: product.size_group_id || "",
          hsn_code: product.hsn_code || "",
          gst_per: product.gst_per || 18,
          default_pur_price: product.default_pur_price || 0,
          default_sale_price: product.default_sale_price || 0,
          status: product.status || "active",
          image_url: product.image_url,
        });

        // Set image preview if exists
        if (product.image_url) {
          setImagePreview(product.image_url);
        }

        // Set variants
        if (product.product_variants && product.product_variants.length > 0) {
          const loadedVariants: ProductVariant[] = product.product_variants.map((v: any) => ({
            size: v.size,
            pur_price: v.pur_price || 0,
            sale_price: v.sale_price || 0,
            barcode: v.barcode || "",
            active: v.active !== false,
            opening_qty: v.opening_qty || 0,
          }));
          setVariants(loadedVariants);
          setShowVariants(true);
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load product",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Error",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview("");
    setFormData({ ...formData, image_url: undefined });
  };

  const uploadProductImage = async (): Promise<string | null> => {
    if (!imageFile) return null;

    try {
      setUploadingImage(true);
      const fileExt = imageFile.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, imageFile, {
          contentType: imageFile.type,
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw new Error(`Image upload failed: ${uploadError.message}`);
      }

      const { data } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error: any) {
      console.error("Image upload error:", error);
      throw new Error(error.message || "Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  };

  const generateSequentialBarcode = async (): Promise<string> => {
    try {
      const { data, error } = await supabase.rpc('generate_next_barcode', {
        p_organization_id: currentOrganization?.id
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error generating barcode:", error);
      toast({
        title: "Error",
        description: "Failed to generate barcode from database. Please try again.",
        variant: "destructive",
      });
      throw error; // Don't fallback - ensure centralized generation only
    }
  };

  const handleGenerateSizeVariants = () => {
    const selectedGroup = sizeGroups.find((g) => g.id === formData.size_group_id);
    if (!selectedGroup) {
      toast({
        title: "Error",
        description: "Please select a size group first",
        variant: "destructive",
      });
      return;
    }

    const newVariants: ProductVariant[] = selectedGroup.sizes.map((size) => ({
      size,
      pur_price: formData.default_pur_price ?? 0,
      sale_price: formData.default_sale_price ?? 0,
      barcode: "",
      active: true,
      opening_qty: 0,
    }));

    setVariants(newVariants);
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
      toast({
        title: "Success",
        description: "Barcodes generated for all variants",
      });
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
    if (!formData.product_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Product name is required",
        variant: "destructive",
      });
      return false;
    }

    if (![0, 5, 12, 18, 28].includes(formData.gst_per)) {
      toast({
        title: "Validation Error",
        description: "GST % must be one of: 0, 5, 12, 18, 28",
        variant: "destructive",
      });
      return false;
    }

    if ((formData.default_pur_price !== undefined && formData.default_pur_price < 0) || 
        (formData.default_sale_price !== undefined && formData.default_sale_price < 0)) {
      toast({
        title: "Validation Error",
        description: "Prices cannot be negative",
        variant: "destructive",
      });
      return false;
    }

    // Check for duplicate barcodes within the current variants
    const barcodesInForm = variants
      .map(v => v.barcode)
      .filter(b => b && b.trim() !== "");
    
    const uniqueBarcodes = new Set(barcodesInForm);
    if (barcodesInForm.length !== uniqueBarcodes.size) {
      toast({
        title: "Validation Error",
        description: "Duplicate barcodes found in variants. Each variant must have a unique barcode.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const validateBarcodeUniqueness = async (): Promise<boolean> => {
    // Get all barcodes from variants that have values
    const barcodesToCheck = variants
      .map(v => v.barcode)
      .filter(b => b && b.trim() !== "");

    if (barcodesToCheck.length === 0) {
      return true; // No barcodes to validate
    }

    try {
      // Check if any of these barcodes already exist in the database
      const { data: existingVariants, error } = await supabase
        .from("product_variants")
        .select("barcode, product_id, products(product_name)")
        .in("barcode", barcodesToCheck);

      if (error) throw error;

      if (existingVariants && existingVariants.length > 0) {
        // Filter out barcodes that belong to the current product being edited
        const duplicates = existingVariants.filter(
          v => v.product_id !== editingProductId
        );

        if (duplicates.length > 0) {
          const duplicateBarcodes = duplicates.map(d => d.barcode).join(", ");
          const productNames = duplicates
            .map(d => (d.products as any)?.product_name)
            .filter(name => name)
            .join(", ");

          toast({
            title: "Duplicate Barcode Error",
            description: `Barcode(s) ${duplicateBarcodes} already exist${productNames ? ` in product(s): ${productNames}` : ""}. Please use unique barcodes.`,
            variant: "destructive",
          });
          return false;
        }
      }

      return true;
    } catch (error: any) {
      console.error("Barcode validation error:", error);
      toast({
        title: "Validation Error",
        description: "Failed to validate barcodes. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    // Validate barcode uniqueness across database
    const barcodesValid = await validateBarcodeUniqueness();
    if (!barcodesValid) return;

    setLoading(true);
    try {
      // Try to upload image if exists, but don't fail if it doesn't work
      let imageUrl = formData.image_url;
      if (imageFile) {
        try {
          imageUrl = await uploadProductImage();
        } catch (imageError: any) {
          console.error("Image upload failed:", imageError);
          toast({
            title: "Warning",
            description: "Product will be saved without image. Image upload failed.",
            variant: "default",
          });
          imageUrl = null;
        }
      }

      let productData: any;
      
      if (editingProductId) {
        // Update existing product
        const productPayload = {
          ...formData,
          image_url: imageUrl,
          size_group_id: formData.size_group_id || null,
        };
        const { data, error: productError } = await supabase
          .from("products")
          .update(productPayload)
          .eq("id", editingProductId)
          .select()
          .single();

        if (productError) throw productError;
        productData = data;

        // For updates, handle variants with upsert
        if (variants.length > 0) {
          for (const v of variants) {
            // Get existing variant to calculate stock adjustment
            const { data: existingVariant } = await supabase
              .from("product_variants")
              .select("id, opening_qty, stock_qty")
              .eq("product_id", editingProductId)
              .eq("size", v.size)
              .maybeSingle();

            let newStockQty = v.opening_qty;

            if (existingVariant) {
              // Calculate stock adjustment based on opening qty change
              const openingQtyDiff = v.opening_qty - (existingVariant.opening_qty || 0);
              newStockQty = (existingVariant.stock_qty || 0) + openingQtyDiff;
              
              // Ensure stock doesn't go negative
              if (newStockQty < 0) newStockQty = 0;
            }

            // Upsert the variant with updated stock_qty
            const { error: variantError } = await supabase
              .from("product_variants")
              .upsert({
                product_id: editingProductId,
                size: v.size,
                pur_price: v.pur_price,
                sale_price: v.sale_price,
                barcode: v.barcode,
                active: v.active,
                opening_qty: v.opening_qty,
                stock_qty: newStockQty,
              }, {
                onConflict: "product_id,size",
              });

            if (variantError) throw variantError;
          }
        }

        toast({
          title: "Success",
          description: `Product "${formData.product_name}" updated successfully`,
        });

        // Navigate back to product dashboard after edit
        navigate("/products");
        return;
      } else {
        // Insert new product
        if (!currentOrganization?.id) throw new Error("No organization selected");
        const productPayload = {
          ...formData,
          image_url: imageUrl,
          organization_id: currentOrganization.id,
          size_group_id: formData.size_group_id || null,
        };
        const { data, error: productError } = await supabase
          .from("products")
          .insert([productPayload])
          .select()
          .single();

        if (productError) throw productError;
        productData = data;

        // Upsert variants (insert or update based on product_id + size)
        if (variants.length > 0) {
          const variantsToUpsert = variants.map((v) => ({
            product_id: productData.id,
            size: v.size,
            pur_price: v.pur_price,
            sale_price: v.sale_price,
            barcode: v.barcode,
            active: v.active,
            opening_qty: v.opening_qty,
            stock_qty: v.opening_qty, // Set initial stock_qty to opening_qty
          }));

          const { data: insertedVariants, error: variantsError } = await supabase
            .from("product_variants")
            .upsert(variantsToUpsert, {
              onConflict: "product_id,size",
            })
            .select();

          if (variantsError) throw variantsError;

          // Create stock movements for opening quantities (only for new products)
          if (insertedVariants) {
            const stockMovements = insertedVariants
              .filter((v) => v.opening_qty > 0)
              .map((v) => ({
                variant_id: v.id,
                quantity: v.opening_qty,
                movement_type: "opening_stock",
                notes: `Opening stock for ${formData.product_name} - ${v.size}`,
              }));

            if (stockMovements.length > 0) {
              const { error: movementError } = await supabase
                .from("stock_movements")
                .insert(stockMovements);

              if (movementError) {
                console.error("Stock movement error:", movementError);
                // Don't throw error, just log it
              }
            }
          }
        }

        toast({
          title: "Success",
          description: `Product "${formData.product_name}" saved successfully`,
        });

        // Check if we need to navigate back to purchase entry
        const state = location.state as { returnToPurchase?: boolean };
        if (state?.returnToPurchase && productData) {
          // Fetch the full product data with variants for navigation
          const { data: fullProductData, error: fetchError } = await supabase
            .from("products")
            .select("*, product_variants(*)")
            .eq("id", productData.id)
            .single();

          if (!fetchError && fullProductData) {
            navigate("/purchase-entry", {
              state: {
                newProduct: {
                  id: fullProductData.id,
                  product_name: fullProductData.product_name,
                  brand: fullProductData.brand,
                  category: fullProductData.category,
                  gst_per: fullProductData.gst_per,
                  hsn_code: fullProductData.hsn_code,
                  variants: fullProductData.product_variants,
                },
              },
            });
            return; // Exit early, don't reset form
          }
        }

        // Reset form (only if not navigating back)
        setFormData({
          product_name: "",
          category: "",
          brand: "",
          style: "",
          color: "",
          size_group_id: "",
          hsn_code: "",
          gst_per: 18,
          default_pur_price: 0,
          default_sale_price: 0,
          status: "active",
        });
        setVariants([]);
        setShowVariants(false);
        setImageFile(null);
        setImagePreview("");
        
        // Focus on product name input for next entry
        setTimeout(() => {
          productNameInputRef.current?.focus();
        }, 0);
      }
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

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <BackToDashboard />
        <div className="mb-6 flex items-center gap-3">
          <Package className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Smart Inventory</h1>
        </div>

        <Card className="shadow-lg border-border">
          <CardHeader>
            <CardTitle className="text-2xl">
              {editingProductId ? "Edit Product" : "Product Entry"}
            </CardTitle>
            <CardDescription>
              {editingProductId ? "Update product information" : "Add new product to your inventory"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Product Image Upload */}
            <div className="space-y-2">
              <Label htmlFor="product_image">Product Image</Label>
              <div className="flex items-start gap-4">
                {imagePreview ? (
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Product preview"
                      className="w-32 h-32 object-cover rounded-lg border border-border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                      onClick={handleRemoveImage}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="w-32 h-32 border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-muted/50">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <Input
                    id="product_image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Max file size: 5MB. Supported formats: JPG, PNG, WEBP
                  </p>
                </div>
              </div>
            </div>

            {/* Product Details Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product_name">Product Name *</Label>
                <Input
                  id="product_name"
                  ref={productNameInputRef}
                  value={formData.product_name}
                  onChange={(e) =>
                    setFormData({ ...formData, product_name: e.target.value })
                  }
                  placeholder="Enter product name"
                />
              </div>

              {(fieldSettings?.category?.enabled ?? true) && (
                <div className="space-y-2">
                  <Label htmlFor="category">
                    {fieldSettings?.category?.label || 'Category'}
                  </Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    placeholder={`e.g., T-Shirt, Jeans`}
                  />
                </div>
              )}

              {(fieldSettings?.brand?.enabled ?? true) && (
                <div className="space-y-2">
                  <Label htmlFor="brand">
                    {fieldSettings?.brand?.label || 'Brand'}
                  </Label>
                  <Input
                    id="brand"
                    value={formData.brand}
                    onChange={(e) =>
                      setFormData({ ...formData, brand: e.target.value })
                    }
                    placeholder="Brand name"
                  />
                </div>
              )}

              {(fieldSettings?.style?.enabled ?? true) && (
                <div className="space-y-2">
                  <Label htmlFor="style">
                    {fieldSettings?.style?.label || 'Style'}
                  </Label>
                  <Input
                    id="style"
                    value={formData.style}
                    onChange={(e) =>
                      setFormData({ ...formData, style: e.target.value })
                    }
                    placeholder="Style description"
                  />
                </div>
              )}

              {(fieldSettings?.color?.enabled ?? true) && (
                <div className="space-y-2">
                  <Label htmlFor="color">
                    {fieldSettings?.color?.label || 'Color'}
                  </Label>
                  <Input
                    id="color"
                    value={formData.color}
                    onChange={(e) =>
                      setFormData({ ...formData, color: e.target.value })
                    }
                    placeholder="Color"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="size_group">Size Group</Label>
                <Select
                  value={formData.size_group_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, size_group_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select size group" />
                  </SelectTrigger>
                  <SelectContent>
                    {sizeGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.group_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(fieldSettings?.hsn_code?.enabled ?? true) && (
                <div className="space-y-2">
                  <Label htmlFor="hsn_code">
                    {fieldSettings?.hsn_code?.label || 'HSN Code'}
                  </Label>
                  <Input
                    id="hsn_code"
                    value={formData.hsn_code}
                    onChange={(e) =>
                      setFormData({ ...formData, hsn_code: e.target.value })
                    }
                    placeholder="HSN Code"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="gst_per">GST % *</Label>
                <Select
                  value={formData.gst_per.toString()}
                  onValueChange={(value) =>
                    setFormData({ ...formData, gst_per: parseInt(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 5, 12, 18, 28].map((rate) => (
                      <SelectItem key={rate} value={rate.toString()}>
                        {rate}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="default_pur_price">Default Purchase Price</Label>
                <Input
                  id="default_pur_price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.default_pur_price ?? ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      default_pur_price: e.target.value === "" ? undefined : parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="default_sale_price">Default Sale Price</Label>
                <Input
                  id="default_sale_price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.default_sale_price ?? ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      default_sale_price: e.target.value === "" ? undefined : parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Generate Variants Button */}
            <div className="flex justify-start">
              <Button
                onClick={handleGenerateSizeVariants}
                disabled={!formData.size_group_id}
                variant="secondary"
                className="gap-2"
              >
                <Package className="h-4 w-4" />
                Generate Size Variants
              </Button>
            </div>

            {/* Size Variants Table */}
            {showVariants && variants.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Size Variants</h3>
                  <Button
                    onClick={handleAutoGenerateBarcodes}
                    size="sm"
                    className="gap-2"
                  >
                    <Barcode className="h-4 w-4" />
                    Auto-Generate Barcodes
                  </Button>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Size</TableHead>
                        <TableHead>Purchase Price</TableHead>
                        <TableHead>Sale Price</TableHead>
                        <TableHead>Barcode</TableHead>
                        <TableHead>Opening Qty</TableHead>
                        <TableHead className="text-center">Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {variants.map((variant, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{variant.size}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={variant.pur_price}
                              onChange={(e) =>
                                handleVariantChange(
                                  index,
                                  "pur_price",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-32"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={variant.sale_price}
                              onChange={(e) =>
                                handleVariantChange(
                                  index,
                                  "sale_price",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-32"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.barcode}
                              onChange={(e) =>
                                handleVariantChange(
                                  index,
                                  "barcode",
                                  e.target.value
                                )
                              }
                              className="w-40"
                              placeholder="Scan or enter barcode"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={variant.opening_qty}
                              onChange={(e) =>
                                handleVariantChange(
                                  index,
                                  "opening_qty",
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="w-28"
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={variant.active}
                              onCheckedChange={(checked) =>
                                handleVariantChange(index, "active", checked)
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="flex justify-end pt-4">
              <Button
                onClick={handleSave}
                disabled={loading}
                size="lg"
                className="gap-2 min-w-[150px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {editingProductId ? "Updating..." : "Saving..."}
                  </>
                ) : (
                  editingProductId ? "Update Product" : "Save Product"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProductEntry;
