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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Package, Barcode, Upload, X, FileSpreadsheet, Plus, Edit, Trash2 } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";
import { ExcelImportDialog, ImportProgress } from "@/components/ExcelImportDialog";
import { productEntryFields, productEntrySampleData } from "@/utils/excelImportUtils";
import { validateProduct } from "@/lib/validations";
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

type ProductType = 'goods' | 'service' | 'combo';

interface SizeGroup {
  id: string;
  group_name: string;
  sizes: string[];
}

interface ProductVariant {
  id?: string; // Database ID for existing variants
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
  colors: string[]; // Changed to array for multi-color support
  size_group_id: string;
  hsn_code: string;
  gst_per: number;
  default_pur_price: number | undefined;
  default_sale_price: number | undefined;
  default_mrp: number | undefined;
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
  const [showMrp, setShowMrp] = useState(false);
  const productNameInputRef = useRef<HTMLInputElement>(null);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [showCreateSizeGroup, setShowCreateSizeGroup] = useState(false);
  const [newSizeGroup, setNewSizeGroup] = useState({ group_name: "", sizes: "" });
  const [creatingSizeGroup, setCreatingSizeGroup] = useState(false);
  const [showEditSizeGroup, setShowEditSizeGroup] = useState(false);
  const [editingSizeGroup, setEditingSizeGroup] = useState<SizeGroup | null>(null);
  const [editSizeGroupData, setEditSizeGroupData] = useState({ group_name: "", sizes: "" });
  const [updatingSizeGroup, setUpdatingSizeGroup] = useState(false);
  const [showDeleteSizeGroup, setShowDeleteSizeGroup] = useState(false);
  const [deletingSizeGroup, setDeletingSizeGroup] = useState<SizeGroup | null>(null);
  const [deletingSizeGroupLoading, setDeletingSizeGroupLoading] = useState(false);
  
  const [formData, setFormData] = useState<ProductForm>({
    product_type: "goods",
    product_name: "",
    category: "",
    brand: "",
    style: "",
    colors: [], // Multi-color array
    size_group_id: "",
    hsn_code: "",
    gst_per: 18,
    default_pur_price: undefined,
    default_sale_price: undefined,
    default_mrp: undefined,
    status: "active",
  });
  const [colorInput, setColorInput] = useState("");

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
      
      // Apply default GST tax rate and show_mrp setting
      if (typeof data.purchase_settings === 'object' && data.purchase_settings !== null) {
        const purchaseSettings = data.purchase_settings as any;
        if (purchaseSettings.default_tax_rate !== undefined && !editingProductId) {
          setFormData(prev => ({ ...prev, gst_per: purchaseSettings.default_tax_rate }));
        }
        // Set show_mrp from purchase settings
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

  const handleCreateSizeGroup = async () => {
    if (!newSizeGroup.group_name || !newSizeGroup.sizes) {
      toast({
        title: "Validation Error",
        description: "Please enter group name and sizes",
        variant: "destructive",
      });
      return;
    }

    if (!currentOrganization?.id) {
      toast({
        title: "Error",
        description: "No organization selected",
        variant: "destructive",
      });
      return;
    }

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

      toast({
        title: "Success",
        description: "Size group created successfully",
      });

      // Add new group to the list and select it
      const newGroup: SizeGroup = {
        id: data.id,
        group_name: data.group_name,
        sizes: sizesArray,
      };
      setSizeGroups(prev => [...prev, newGroup]);
      setFormData(prev => ({ ...prev, size_group_id: data.id }));
      
      setNewSizeGroup({ group_name: "", sizes: "" });
      setShowCreateSizeGroup(false);
    } catch (error: any) {
      console.error("Error creating size group:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to create size group",
        variant: "destructive",
      });
    } finally {
      setCreatingSizeGroup(false);
    }
  };

  const handleEditSizeGroup = (group: SizeGroup, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingSizeGroup(group);
    setEditSizeGroupData({
      group_name: group.group_name,
      sizes: group.sizes.join(", "),
    });
    setShowEditSizeGroup(true);
  };

  const handleUpdateSizeGroup = async () => {
    if (!editingSizeGroup || !editSizeGroupData.group_name || !editSizeGroupData.sizes) {
      toast({
        title: "Validation Error",
        description: "Please enter group name and sizes",
        variant: "destructive",
      });
      return;
    }

    setUpdatingSizeGroup(true);
    try {
      const sizesArray = editSizeGroupData.sizes.split(",").map(s => s.trim()).filter(s => s);
      
      const { error } = await supabase
        .from("size_groups")
        .update({
          group_name: editSizeGroupData.group_name,
          sizes: sizesArray,
        })
        .eq("id", editingSizeGroup.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Size group updated successfully",
      });

      // Update local state
      setSizeGroups(prev => prev.map(g => 
        g.id === editingSizeGroup.id 
          ? { ...g, group_name: editSizeGroupData.group_name, sizes: sizesArray }
          : g
      ));
      
      setShowEditSizeGroup(false);
      setEditingSizeGroup(null);
    } catch (error: any) {
      console.error("Error updating size group:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to update size group",
        variant: "destructive",
      });
    } finally {
      setUpdatingSizeGroup(false);
    }
  };

  const handleDeleteSizeGroupClick = (group: SizeGroup, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeletingSizeGroup(group);
    setShowDeleteSizeGroup(true);
  };

  const handleDeleteSizeGroup = async () => {
    if (!deletingSizeGroup) return;

    setDeletingSizeGroupLoading(true);
    try {
      const { error } = await supabase
        .from("size_groups")
        .delete()
        .eq("id", deletingSizeGroup.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Size group deleted successfully",
      });

      // Update local state
      setSizeGroups(prev => prev.filter(g => g.id !== deletingSizeGroup.id));
      
      // Clear selection if deleted group was selected
      if (formData.size_group_id === deletingSizeGroup.id) {
        setFormData(prev => ({ ...prev, size_group_id: "" }));
      }
      
      setShowDeleteSizeGroup(false);
      setDeletingSizeGroup(null);
    } catch (error: any) {
      console.error("Error deleting size group:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to delete size group",
        variant: "destructive",
      });
    } finally {
      setDeletingSizeGroupLoading(false);
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
        // Extract colors from variants if editing
        const variantColors = product.product_variants 
          ? [...new Set(product.product_variants.map((v: any) => v.color).filter(Boolean))]
          : [];
        
        // Set form data
        setFormData({
          product_type: (product.product_type as ProductType) || "goods",
          product_name: product.product_name || "",
          category: product.category || "",
          brand: product.brand || "",
          style: product.style || "",
          colors: variantColors.length > 0 ? variantColors : (product.color ? [product.color] : []),
          size_group_id: product.size_group_id || "",
          hsn_code: product.hsn_code || "",
          gst_per: product.gst_per || 18,
          default_pur_price: product.default_pur_price || 0,
          default_sale_price: product.default_sale_price || 0,
          default_mrp: undefined,
          status: product.status || "active",
          image_url: product.image_url,
        });

        // Set image preview if exists
        if (product.image_url) {
          setImagePreview(product.image_url);
        }

        // Set variants with their IDs for proper updates
        if (product.product_variants && product.product_variants.length > 0) {
          const loadedVariants: ProductVariant[] = product.product_variants.map((v: any) => ({
            id: v.id, // Store the database ID
            color: v.color || "",
            size: v.size,
            pur_price: v.pur_price || 0,
            sale_price: v.sale_price || 0,
            mrp: v.mrp || null,
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
    // For service type, auto-generate a single "Standard" variant
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

    // Get colors to generate variants for
    const colorsToUse = formData.colors.length > 0 ? formData.colors : [""];

    // Generate color × size combinations
    const newVariants: ProductVariant[] = [];
    for (const color of colorsToUse) {
      for (const size of selectedGroup.sizes) {
        // Check if this color-size combination already exists
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

    // Merge with existing variants
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
    // Use Zod schema validation
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
      
      // Prepare product payload (color field stores first color for backward compatibility)
      const productColor = formData.colors.length > 0 ? formData.colors[0] : null;
      
      if (editingProductId) {
        // Update existing product
        const productPayload = {
          ...formData,
          color: productColor, // Store first color in products table for backward compatibility
          image_url: imageUrl,
          size_group_id: formData.size_group_id || null,
        };
        delete (productPayload as any).colors; // Remove colors array from payload
        
        const { data, error: productError } = await supabase
          .from("products")
          .update(productPayload)
          .eq("id", editingProductId)
          .select()
          .single();

        if (productError) throw productError;
        productData = data;

        // For updates, handle variants by their ID
        if (variants.length > 0) {
          for (const v of variants) {
            if (v.id) {
              // Update existing variant by ID
              const { data: existingVariant } = await supabase
                .from("product_variants")
                .select("id, opening_qty, stock_qty")
                .eq("id", v.id)
                .single();

              let newStockQty = v.opening_qty;

              if (existingVariant) {
                // Calculate stock adjustment based on opening qty change
                const openingQtyDiff = v.opening_qty - (existingVariant.opening_qty || 0);
                newStockQty = (existingVariant.stock_qty || 0) + openingQtyDiff;
                
                // Ensure stock doesn't go negative
                if (newStockQty < 0) newStockQty = 0;
              }

              // Update the variant by ID
              const { error: variantError } = await supabase
                .from("product_variants")
                .update({
                  color: v.color || null,
                  size: v.size,
                  pur_price: v.pur_price,
                  sale_price: v.sale_price,
                  mrp: v.mrp,
                  barcode: v.barcode,
                  active: v.active,
                  opening_qty: v.opening_qty,
                  stock_qty: newStockQty,
                })
                .eq("id", v.id);

              if (variantError) throw variantError;
            } else {
              // Insert new variant
              const { error: variantError } = await supabase
                .from("product_variants")
                .insert({
                  product_id: editingProductId,
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
                });

              if (variantError) throw variantError;
            }
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
          product_type: formData.product_type,
          product_name: formData.product_name,
          category: formData.category || null,
          brand: formData.brand || null,
          style: formData.style || null,
          color: productColor, // Store first color for backward compatibility
          hsn_code: formData.hsn_code || null,
          gst_per: formData.gst_per,
          default_pur_price: formData.default_pur_price,
          default_sale_price: formData.default_sale_price,
          status: formData.status,
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

        // Upsert variants (insert or update based on product_id + color + size)
        if (variants.length > 0) {
          const variantsToUpsert = variants.map((v) => ({
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
            stock_qty: v.opening_qty, // Set initial stock_qty to opening_qty
          }));

          const { data: insertedVariants, error: variantsError } = await supabase
            .from("product_variants")
            .upsert(variantsToUpsert, {
              onConflict: "product_id,color,size",
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
                notes: `Opening stock for ${formData.product_name} - ${v.color ? v.color + ' / ' : ''}${v.size}`,
                organization_id: currentOrganization.id,
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
          product_type: "goods",
          product_name: "",
          category: "",
          brand: "",
          style: "",
          colors: [],
          size_group_id: "",
          hsn_code: "",
          gst_per: 18,
          default_pur_price: 0,
          default_sale_price: 0,
          default_mrp: undefined,
          status: "active",
        });
        setColorInput("");
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

  // Handle Excel import for products with batch processing
  const handleExcelImport = async (
    mappedData: Record<string, any>[],
    onProgress?: (progress: ImportProgress) => void
  ) => {
    if (!currentOrganization) return;
    
    // Filter valid rows (must have product_name and size)
    const validRows = mappedData.filter(row => 
      row.product_name?.toString().trim() && row.size?.toString().trim()
    );

    // Group rows by product attributes
    const productGroups = new Map<string, Record<string, any>[]>();
    
    for (const row of validRows) {
      const key = [
        row.product_name?.toString().trim() || '',
        row.category?.toString().trim() || '',
        row.brand?.toString().trim() || '',
        row.style?.toString().trim() || '',
        row.color?.toString().trim() || '',
      ].join('|');
      
      if (!productGroups.has(key)) {
        productGroups.set(key, []);
      }
      productGroups.get(key)!.push(row);
    }
    
    const totalGroups = productGroups.size;
    let processedGroups = 0;
    let productsCreated = 0;
    let productsSkipped = 0;
    let variantsCreated = 0;
    let variantsSkipped = 0;
    let errorCount = 0;

    // Get existing products to check for duplicates
    const { data: existingProducts } = await supabase
      .from('products')
      .select('id, product_name, brand, category, color, style')
      .eq('organization_id', currentOrganization.id);

    const existingProductMap = new Map<string, string>();
    (existingProducts || []).forEach(p => {
      const key = [
        p.product_name || '',
        p.category || '',
        p.brand || '',
        p.style || '',
        p.color || '',
      ].join('|');
      existingProductMap.set(key, p.id);
    });

    // Process product groups in batches
    const BATCH_SIZE = 10; // Products per batch
    const groupEntries = Array.from(productGroups.entries());

    for (let i = 0; i < groupEntries.length; i += BATCH_SIZE) {
      const batch = groupEntries.slice(i, i + BATCH_SIZE);

      for (const [key, rows] of batch) {
        try {
          const firstRow = rows[0];
          let productId = existingProductMap.get(key);
          
          if (!productId) {
            // Create new product
            const { data: newProduct, error: productError } = await supabase
              .from('products')
              .insert({
                organization_id: currentOrganization.id,
                product_name: firstRow.product_name?.toString().trim(),
                category: firstRow.category?.toString().trim() || null,
                brand: firstRow.brand?.toString().trim() || null,
                style: firstRow.style?.toString().trim() || null,
                color: firstRow.color?.toString().trim() || null,
                hsn_code: firstRow.hsn_code?.toString().trim() || null,
                gst_per: Number(firstRow.gst_per) || 18,
                default_pur_price: Number(firstRow.default_pur_price) || 0,
                default_sale_price: Number(firstRow.default_sale_price) || 0,
                status: 'active',
              })
              .select('id')
              .single();
            
            if (productError) {
              errorCount++;
              continue;
            }
            productId = newProduct.id;
            existingProductMap.set(key, productId);
            productsCreated++;
          } else {
            productsSkipped++;
          }

          // Get existing variants for this product
          const { data: existingVariants } = await supabase
            .from('product_variants')
            .select('size')
            .eq('product_id', productId);

          const existingSizes = new Set(
            (existingVariants || []).map(v => v.size?.toLowerCase())
          );

          // Prepare variants to insert
          const variantsToInsert: any[] = [];
          
          for (const row of rows) {
            const size = row.size?.toString().trim();
            if (!size || existingSizes.has(size.toLowerCase())) {
              if (existingSizes.has(size?.toLowerCase())) variantsSkipped++;
              continue;
            }

            // Generate barcode if not provided
            let barcode = row.barcode?.toString().trim() || '';
            if (!barcode) {
              const { data: barcodeData } = await supabase.rpc(
                'generate_next_barcode',
                { p_organization_id: currentOrganization.id }
              );
              barcode = barcodeData || '';
            }

            const openingQty = Number(row.opening_qty) || 0;

            variantsToInsert.push({
              organization_id: currentOrganization.id,
              product_id: productId,
              size: size,
              barcode: barcode,
              pur_price: Number(row.default_pur_price) || 0,
              sale_price: Number(row.default_sale_price) || 0,
              mrp: row.mrp ? Number(row.mrp) : null,
              stock_qty: openingQty,
              opening_qty: openingQty,
              active: true,
            });

            existingSizes.add(size.toLowerCase());
          }

          // Batch insert variants
          if (variantsToInsert.length > 0) {
            const { data: insertedVariants, error: variantError } = await supabase
              .from('product_variants')
              .insert(variantsToInsert)
              .select('id, opening_qty, size');

            if (variantError) {
              errorCount += variantsToInsert.length;
            } else {
              variantsCreated += insertedVariants?.length || 0;

              // Create stock movements for opening quantities
              const stockMovements = (insertedVariants || [])
                .filter(v => v.opening_qty > 0)
                .map(v => ({
                  organization_id: currentOrganization.id,
                  variant_id: v.id,
                  movement_type: 'opening',
                  quantity: v.opening_qty,
                  notes: `Opening stock from Excel import - ${v.size}`,
                }));

              if (stockMovements.length > 0) {
                await supabase.from('stock_movements').insert(stockMovements);
              }
            }
          }
        } catch (err) {
          console.error('Error processing product group:', err);
          errorCount++;
        }

        processedGroups++;
      }

      // Report progress
      if (onProgress) {
        onProgress({
          current: processedGroups,
          total: totalGroups,
          successCount: productsCreated + variantsCreated,
          errorCount,
          skippedCount: productsSkipped + variantsSkipped,
          isImporting: true,
        });
      }
    }

    const skippedEmptyRows = mappedData.length - validRows.length;
    let description = `${productsCreated} products, ${variantsCreated} variants created`;
    if (productsSkipped > 0 || variantsSkipped > 0) {
      description += `, ${productsSkipped + variantsSkipped} duplicates skipped`;
    }
    if (skippedEmptyRows > 0) {
      description += `, ${skippedEmptyRows} empty rows skipped`;
    }
    if (errorCount > 0) {
      description += `, ${errorCount} errors`;
    }

    toast({
      title: "Import Completed",
      description,
    });
    
    // Navigate to product dashboard to see imported products
    navigate('/products');
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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">
                  {editingProductId ? "Edit Product" : "Product Entry"}
                </CardTitle>
                <CardDescription>
                  {editingProductId ? "Update product information" : "Add new product to your inventory"}
                </CardDescription>
              </div>
              {!editingProductId && (
                <Button
                  onClick={() => setShowExcelImport(true)}
                  variant="outline"
                  className="gap-2"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Import Excel
                </Button>
              )}
            </div>
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

            {/* Product Type Selection */}
            <div className="space-y-2">
              <Label>Product Type *</Label>
              <RadioGroup
                value={formData.product_type}
                onValueChange={(value: ProductType) =>
                  setFormData({ ...formData, product_type: value, size_group_id: value === 'service' ? '' : formData.size_group_id })
                }
                className="flex gap-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="goods" id="type-goods" />
                  <Label htmlFor="type-goods" className="font-normal cursor-pointer">Goods</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="service" id="type-service" />
                  <Label htmlFor="type-service" className="font-normal cursor-pointer">Service</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="combo" id="type-combo" />
                  <Label htmlFor="type-combo" className="font-normal cursor-pointer">Combo</Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                {formData.product_type === 'goods' && "Goods - Physical items with stock tracking"}
                {formData.product_type === 'service' && "Service - No stock tracking, for invoicing only"}
                {formData.product_type === 'combo' && "Combo - Bundle of multiple products"}
              </p>
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
                    {fieldSettings?.color?.label || 'Colors'} (comma separated for multiple)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="color"
                      value={colorInput}
                      onChange={(e) => setColorInput(e.target.value)}
                      onBlur={() => {
                        // Parse colors on blur
                        if (colorInput.trim()) {
                          const newColors = colorInput
                            .split(',')
                            .map(c => c.trim())
                            .filter(c => c && !formData.colors.includes(c));
                          if (newColors.length > 0) {
                            setFormData({ ...formData, colors: [...formData.colors, ...newColors] });
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (colorInput.trim()) {
                            const newColors = colorInput
                              .split(',')
                              .map(c => c.trim())
                              .filter(c => c && !formData.colors.includes(c));
                            if (newColors.length > 0) {
                              setFormData({ ...formData, colors: [...formData.colors, ...newColors] });
                              setColorInput("");
                            }
                          }
                        }
                      }}
                      placeholder="e.g., Black, Brown, White"
                    />
                  </div>
                  {formData.colors.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {formData.colors.map((color, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-sm"
                        >
                          {color}
                          <button
                            type="button"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                colors: formData.colors.filter((_, i) => i !== idx)
                              });
                            }}
                            className="hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Size Group - Hidden for service type */}
              {formData.product_type !== 'service' && (
                <div className="space-y-2">
                  <Label htmlFor="size_group">Size Group</Label>
                  <Select
                    value={formData.size_group_id}
                    onValueChange={(value) => {
                      if (value === "__create_new__") {
                        setShowCreateSizeGroup(true);
                      } else if (!value.startsWith("__")) {
                        setFormData({ ...formData, size_group_id: value });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select size group" />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="__create_new__" className="text-primary font-medium">
                        <span className="flex items-center gap-2">
                          <Plus className="h-4 w-4" />
                          Create New Size Group
                        </span>
                      </SelectItem>
                      {sizeGroups.map((group) => (
                        <div key={group.id} className="relative flex items-center">
                          <SelectItem value={group.id} className="flex-1 pr-16">
                            {group.group_name}
                          </SelectItem>
                          <div className="absolute right-2 flex items-center gap-1 z-10">
                            <button
                              type="button"
                              onClick={(e) => handleEditSizeGroup(group, e)}
                              className="p-1 hover:bg-muted rounded"
                              title="Edit"
                            >
                              <Edit className="h-3 w-3 text-muted-foreground hover:text-primary" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSizeGroupClick(group, e)}
                              className="p-1 hover:bg-muted rounded"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

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

              {showMrp && (
                <div className="space-y-2">
                  <Label htmlFor="default_mrp">Default MRP</Label>
                  <Input
                    id="default_mrp"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.default_mrp ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        default_mrp: e.target.value === "" ? undefined : parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="MRP"
                  />
                </div>
              )}

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
                disabled={formData.product_type !== 'service' && !formData.size_group_id}
                variant="secondary"
                className="gap-2"
              >
                <Package className="h-4 w-4" />
                {formData.product_type === 'service' ? 'Generate Service Variant' : 'Generate Size Variants'}
              </Button>
            </div>

            {/* Size Variants Table */}
            {showVariants && variants.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">
                    {formData.product_type === 'service' ? 'Service Details' : `Color-Size Variants (${variants.length})`}
                  </h3>
                  <Button
                    onClick={handleAutoGenerateBarcodes}
                    size="sm"
                    className="gap-2"
                  >
                    <Barcode className="h-4 w-4" />
                    Auto-Generate Barcodes
                  </Button>
                </div>

                <div className="border rounded-lg overflow-hidden overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {formData.product_type !== 'service' && <TableHead>Color</TableHead>}
                        <TableHead>{formData.product_type === 'service' ? 'Item' : 'Size'}</TableHead>
                        <TableHead>Purchase Price</TableHead>
                        <TableHead>Sale Price</TableHead>
                        {showMrp && <TableHead>MRP</TableHead>}
                        {showMrp && <TableHead>Discount</TableHead>}
                        <TableHead>Barcode</TableHead>
                        {formData.product_type !== 'service' && <TableHead>Opening Qty</TableHead>}
                        <TableHead className="text-center">Active</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {variants.map((variant, index) => {
                        const discount = variant.mrp && variant.mrp > variant.sale_price 
                          ? variant.mrp - variant.sale_price 
                          : 0;
                        const discountPercent = variant.mrp && variant.mrp > 0 
                          ? ((discount / variant.mrp) * 100).toFixed(0) 
                          : 0;
                        
                        return (
                          <TableRow key={index}>
                            {formData.product_type !== 'service' && (
                              <TableCell className="font-medium text-primary">{variant.color || '-'}</TableCell>
                            )}
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
                            {showMrp && (
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={variant.mrp || ""}
                                  onChange={(e) =>
                                    handleVariantChange(
                                      index,
                                      "mrp",
                                      e.target.value ? parseFloat(e.target.value) : null
                                    )
                                  }
                                  className="w-28"
                                  placeholder="MRP"
                                />
                              </TableCell>
                            )}
                            {showMrp && (
                              <TableCell>
                                {discount > 0 ? (
                                  <span className="text-green-600 font-medium">
                                    ₹{discount.toFixed(0)} ({discountPercent}%)
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            )}
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
                            {formData.product_type !== 'service' && (
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
                            )}
                            <TableCell className="text-center">
                              <Switch
                                checked={variant.active}
                                onCheckedChange={(checked) =>
                                  handleVariantChange(index, "active", checked)
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  setVariants(variants.filter((_, i) => i !== index));
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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

        {/* Create Size Group Dialog */}
        <Dialog open={showCreateSizeGroup} onOpenChange={setShowCreateSizeGroup}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Size Group</DialogTitle>
              <DialogDescription>
                Enter the group name and sizes separated by commas.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new_group_name">Group Name *</Label>
                <Input
                  id="new_group_name"
                  value={newSizeGroup.group_name}
                  onChange={(e) => setNewSizeGroup(prev => ({ ...prev, group_name: e.target.value }))}
                  placeholder="e.g., Shirt Sizes, Shoe Sizes"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new_sizes">Sizes (comma separated) *</Label>
                <Input
                  id="new_sizes"
                  value={newSizeGroup.sizes}
                  onChange={(e) => setNewSizeGroup(prev => ({ ...prev, sizes: e.target.value }))}
                  placeholder="e.g., S, M, L, XL, XXL"
                />
                <p className="text-xs text-muted-foreground">
                  Enter sizes separated by commas. Example: 38, 40, 42, 44 or S, M, L, XL
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateSizeGroup(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateSizeGroup} disabled={creatingSizeGroup}>
                {creatingSizeGroup ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Size Group"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Size Group Dialog */}
        <Dialog open={showEditSizeGroup} onOpenChange={setShowEditSizeGroup}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Size Group</DialogTitle>
              <DialogDescription>
                Update the group name and sizes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit_group_name">Group Name *</Label>
                <Input
                  id="edit_group_name"
                  value={editSizeGroupData.group_name}
                  onChange={(e) => setEditSizeGroupData(prev => ({ ...prev, group_name: e.target.value }))}
                  placeholder="e.g., Shirt Sizes, Shoe Sizes"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_sizes">Sizes (comma separated) *</Label>
                <Input
                  id="edit_sizes"
                  value={editSizeGroupData.sizes}
                  onChange={(e) => setEditSizeGroupData(prev => ({ ...prev, sizes: e.target.value }))}
                  placeholder="e.g., S, M, L, XL, XXL"
                />
                <p className="text-xs text-muted-foreground">
                  Enter sizes separated by commas. Example: 38, 40, 42, 44 or S, M, L, XL
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditSizeGroup(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateSizeGroup} disabled={updatingSizeGroup}>
                {updatingSizeGroup ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Size Group"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Size Group Confirmation */}
        <AlertDialog open={showDeleteSizeGroup} onOpenChange={setShowDeleteSizeGroup}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Size Group</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingSizeGroup?.group_name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeleteSizeGroup}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deletingSizeGroupLoading}
              >
                {deletingSizeGroupLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Excel Import Dialog */}
        <ExcelImportDialog
          open={showExcelImport}
          onClose={() => setShowExcelImport(false)}
          targetFields={productEntryFields}
          onImport={handleExcelImport}
          title="Import Products from Excel"
          sampleData={productEntrySampleData}
          sampleFileName="Product_Entry_Sample.xlsx"
        />
      </div>
    </div>
  );
};

export default ProductEntry;
