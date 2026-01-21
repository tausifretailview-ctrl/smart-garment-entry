import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { useProductProtection } from "@/hooks/useProductProtection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Package, Barcode, Upload, X, FileSpreadsheet, Plus, Edit, Trash2, Lock } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";
import { ExcelImportDialog, ImportProgress } from "@/components/ExcelImportDialog";
import { productEntryFields, productEntrySampleData } from "@/utils/excelImportUtils";
import { validateProduct } from "@/lib/validations";
import { UOM_OPTIONS, DEFAULT_UOM } from "@/constants/uom";
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
  uom: string; // Unit of Measurement
  default_pur_price: number | undefined;
  default_sale_price: number | undefined;
  default_mrp: number | undefined;
  status: string;
  image_url?: string;
}

const ProductEntry = () => {
  const { toast } = useToast();
  const { orgNavigate } = useOrgNavigation();
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
  
  // Protection for variants with transactions
  const { checkVariantHasTransactions } = useProductProtection();
  const [originalBarcodes, setOriginalBarcodes] = useState<Map<string, string>>(new Map());
  const [protectedVariants, setProtectedVariants] = useState<Set<string>>(new Set());
  
  // Previous values for dropdowns
  const [categories, setCategories] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [hsnCodes, setHsnCodes] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  
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
    uom: "NOS", // Default Unit of Measurement
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
    fetchPreviousValues();
    
    // Check if we're editing an existing product
    const searchParams = new URLSearchParams(location.search);
    const productId = searchParams.get('id');
    if (productId) {
      setEditingProductId(productId);
      fetchProductForEdit(productId);
    }
  }, [location.search]);

  // Fetch unique categories, brands, HSN codes, and styles from existing products
  const fetchPreviousValues = async () => {
    if (!currentOrganization) return;
    
    const { data, error } = await supabase
      .from("products")
      .select("category, brand, hsn_code, style")
      .eq("organization_id", currentOrganization.id)
      .is("deleted_at", null);

    if (!error && data) {
      const uniqueCategories = [...new Set(data.map(p => p.category).filter(Boolean) as string[])].sort();
      const uniqueBrands = [...new Set(data.map(p => p.brand).filter(Boolean) as string[])].sort();
      const uniqueHsnCodes = [...new Set(data.map(p => p.hsn_code).filter(Boolean) as string[])].sort();
      const uniqueStyles = [...new Set(data.map(p => p.style).filter(Boolean) as string[])].sort();
      
      setCategories(uniqueCategories);
      setBrands(uniqueBrands);
      setHsnCodes(uniqueHsnCodes);
      setStyles(uniqueStyles);
    }
  };

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
          gst_per: product.gst_per ?? 18,
          uom: product.uom || DEFAULT_UOM,
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
          
          // Store original barcodes for protection check
          const barcodeMap = new Map<string, string>();
          for (const v of product.product_variants) {
            if (v.id && v.barcode) {
              barcodeMap.set(v.id, v.barcode);
            }
          }
          setOriginalBarcodes(barcodeMap);
          
          // Check which variants have transactions (protect them)
          const protectedIds = new Set<string>();
          for (const v of product.product_variants) {
            if (v.id) {
              const { hasTransactions } = await checkVariantHasTransactions(v.id);
              if (hasTransactions) {
                protectedIds.add(v.id);
              }
            }
          }
          setProtectedVariants(protectedIds);
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

    // Validate MRP if enabled from settings
    if (showMrp && (formData.default_mrp === undefined || formData.default_mrp === null || formData.default_mrp <= 0)) {
      toast({
        title: "Validation Error",
        description: "MRP is required. Please enter a valid MRP.",
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
        // Update existing product - explicitly define columns to avoid sending invalid fields like default_mrp
        const productPayload = {
          product_type: formData.product_type,
          product_name: formData.product_name,
          category: formData.category || null,
          brand: formData.brand || null,
          style: formData.style || null,
          color: productColor,
          hsn_code: formData.hsn_code || null,
          gst_per: formData.gst_per,
          uom: formData.uom || DEFAULT_UOM,
          default_pur_price: formData.default_pur_price,
          default_sale_price: formData.default_sale_price,
          status: formData.status,
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

        // For updates, separate existing variants (with ID) from new variants
        if (variants.length > 0) {
          const existingVariants = variants.filter(v => v.id);
          const newVariants = variants.filter(v => !v.id);

          // Check for barcode changes on protected variants
          for (const v of existingVariants) {
            if (v.id && protectedVariants.has(v.id)) {
              const originalBarcode = originalBarcodes.get(v.id);
              if (originalBarcode && originalBarcode !== v.barcode) {
                toast({
                  title: "Cannot Change Barcode",
                  description: `Barcode "${originalBarcode}" is used in transactions and cannot be modified.`,
                  variant: "destructive",
                });
                setLoading(false);
                return;
              }
            }
          }

          // Update existing variants by ID (don't overwrite stock_qty with opening_qty)
          for (const v of existingVariants) {
            const { error: updateError } = await supabase
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
                // Only update stock_qty if opening_qty was explicitly changed
                // The actual stock is managed by purchase/sale transactions
              })
              .eq("id", v.id);

            if (updateError) throw updateError;
          }

          // Insert new variants (for newly generated ones without IDs)
          if (newVariants.length > 0) {
            const variantsToInsert = newVariants.map((v) => ({
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
            }));

            const { error: insertError } = await supabase
              .from("product_variants")
              .upsert(variantsToInsert, {
                onConflict: "product_id,color,size",
              });

            if (insertError) throw insertError;
          }
        }

        toast({
          title: "Success",
          description: `Product "${formData.product_name}" updated successfully`,
        });

        // Navigate back to product dashboard after edit
        orgNavigate("/products");
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
          uom: formData.uom || DEFAULT_UOM,
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
                movement_type: "reconciliation",
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
            orgNavigate("/purchase-entry", {
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

        // Navigate to product dashboard after saving new product
        orgNavigate("/products");
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
    orgNavigate('/products');
  };

  return (
    <div className="h-[calc(100vh-6rem)] bg-background p-2 overflow-auto">
      <div className="max-w-7xl mx-auto">
        <BackToDashboard label="Back to Products" to="/products" />
        <div className="mb-2 flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Smart Inventory</h1>
        </div>

        <Card className="shadow-sm border-border">
          <CardHeader className="p-3 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">
                  {editingProductId ? "Edit Product" : "Product Entry"}
                </CardTitle>
                <CardDescription className="text-xs">
                  {editingProductId ? "Update product information" : "Add new product to your inventory"}
                </CardDescription>
              </div>
              {!editingProductId && (
                <Button
                  onClick={() => setShowExcelImport(true)}
                  variant="outline"
                  size="sm"
                  className="gap-1 h-7 text-xs"
                >
                  <FileSpreadsheet className="h-3 w-3" />
                  Import Excel
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-3 space-y-3">
            {/* Product Image Upload */}
            <div className="space-y-1">
              <Label htmlFor="product_image" className="text-xs">Product Image</Label>
              <div className="flex items-start gap-3">
                {imagePreview ? (
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Product preview"
                      className="w-16 h-16 object-cover rounded border border-border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-1 -right-1 h-4 w-4 rounded-full"
                      onClick={handleRemoveImage}
                    >
                      <X className="h-2 w-2" />
                    </Button>
                  </div>
                ) : (
                  <div className="w-16 h-16 border-2 border-dashed border-border rounded flex items-center justify-center bg-muted/50">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <Input
                    id="product_image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="cursor-pointer h-7 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Max 5MB. JPG, PNG, WEBP
                  </p>
                </div>
              </div>
            </div>

            {/* Product Type Selection */}
            <div className="space-y-1">
              <Label className="text-xs">Product Type *</Label>
              <RadioGroup
                value={formData.product_type}
                onValueChange={(value: ProductType) =>
                  setFormData({ ...formData, product_type: value, size_group_id: value === 'service' ? '' : formData.size_group_id })
                }
                className="flex gap-4"
              >
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="goods" id="type-goods" className="h-3 w-3" />
                  <Label htmlFor="type-goods" className="font-normal cursor-pointer text-xs">Goods</Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="service" id="type-service" className="h-3 w-3" />
                  <Label htmlFor="type-service" className="font-normal cursor-pointer text-xs">Service</Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="combo" id="type-combo" className="h-3 w-3" />
                  <Label htmlFor="type-combo" className="font-normal cursor-pointer text-xs">Combo</Label>
                </div>
              </RadioGroup>
              <p className="text-[10px] text-muted-foreground">
                {formData.product_type === 'goods' && "Goods - Physical items with stock tracking"}
                {formData.product_type === 'service' && "Service - No stock tracking"}
                {formData.product_type === 'combo' && "Combo - Bundle of products"}
              </p>
            </div>

            {/* Product Details Form */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label htmlFor="product_name" className="text-xs">Product Name *</Label>
                <Input
                  id="product_name"
                  ref={productNameInputRef}
                  value={formData.product_name}
                  onChange={(e) =>
                    setFormData({ ...formData, product_name: e.target.value })
                  }
                  placeholder="Enter product name"
                  className="h-7 text-xs"
                />
              </div>

              {(fieldSettings?.category?.enabled ?? true) && (
                <div className="space-y-1">
                  <Label htmlFor="category" className="text-xs">
                    {fieldSettings?.category?.label || 'Category'}
                  </Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    placeholder={`e.g., T-Shirt, Jeans`}
                    className="h-7 text-xs"
                    list="category-list"
                    autoComplete="off"
                  />
                  <datalist id="category-list">
                    {categories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
              )}

              {(fieldSettings?.brand?.enabled ?? true) && (
                <div className="space-y-1">
                  <Label htmlFor="brand" className="text-xs">
                    {fieldSettings?.brand?.label || 'Brand'}
                  </Label>
                  <Input
                    id="brand"
                    value={formData.brand}
                    onChange={(e) =>
                      setFormData({ ...formData, brand: e.target.value })
                    }
                    placeholder="Brand name"
                    className="h-7 text-xs"
                    list="brand-list"
                    autoComplete="off"
                  />
                  <datalist id="brand-list">
                    {brands.map((brand) => (
                      <option key={brand} value={brand} />
                    ))}
                  </datalist>
                </div>
              )}

              {(fieldSettings?.style?.enabled ?? true) && (
                <div className="space-y-1">
                  <Label htmlFor="style" className="text-xs">
                    {fieldSettings?.style?.label || 'Style'}
                  </Label>
                  <Input
                    id="style"
                    value={formData.style}
                    onChange={(e) =>
                      setFormData({ ...formData, style: e.target.value })
                    }
                    placeholder="Style description"
                    className="h-7 text-xs"
                    list="style-list"
                    autoComplete="off"
                  />
                  <datalist id="style-list">
                    {styles.map((style) => (
                      <option key={style} value={style} />
                    ))}
                  </datalist>
                </div>
              )}

              {(fieldSettings?.color?.enabled ?? true) && (
                <div className="space-y-1">
                  <Label htmlFor="color" className="text-xs">
                    {fieldSettings?.color?.label || 'Colors'} (comma separated)
                  </Label>
                  <div className="flex gap-1">
                    <Input
                      id="color"
                      value={colorInput}
                      onChange={(e) => setColorInput(e.target.value)}
                      onBlur={() => {
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
                      placeholder="e.g., Black, White"
                      className="h-7 text-xs"
                    />
                  </div>
                  {formData.colors.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {formData.colors.map((color, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px]"
                        >
                          {color}
                          <button
                            type="button"
                            onClick={async () => {
                              // In edit mode, check if this color has variants with transactions
                              if (editingProductId) {
                                const variantsWithColor = variants.filter(v => v.color === color);
                                const protectedVariantsForColor = variantsWithColor.filter(v => v.id && protectedVariants.has(v.id));
                                
                                if (protectedVariantsForColor.length > 0) {
                                  toast({
                                    title: "Cannot Remove Colour",
                                    description: `Colour "${color}" has variants with transactions and cannot be removed.`,
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                
                                // Remove variants of this color from the variants list
                                setVariants(prev => prev.filter(v => v.color !== color));
                              }
                              
                              setFormData({
                                ...formData,
                                colors: formData.colors.filter((_, i) => i !== idx)
                              });
                            }}
                            className="hover:text-destructive"
                            title={editingProductId ? "Remove colour and its variants" : "Remove colour"}
                          >
                            <X className="h-2 w-2" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Size Group - Hidden for service type */}
              {formData.product_type !== 'service' && (
                <div className="space-y-1">
                  <Label htmlFor="size_group" className="text-xs">Size Group</Label>
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
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select size group" />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="__create_new__" className="text-primary font-medium text-xs">
                        <span className="flex items-center gap-1">
                          <Plus className="h-3 w-3" />
                          New Size Group
                        </span>
                      </SelectItem>
                      {sizeGroups.map((group) => (
                        <div key={group.id} className="relative flex items-center">
                          <SelectItem value={group.id} className="flex-1 pr-12 text-xs">
                            {group.group_name}
                          </SelectItem>
                          <div className="absolute right-2 flex items-center gap-0.5 z-10">
                            <button
                              type="button"
                              onClick={(e) => handleEditSizeGroup(group, e)}
                              className="p-0.5 hover:bg-muted rounded"
                              title="Edit"
                            >
                              <Edit className="h-2.5 w-2.5 text-muted-foreground hover:text-primary" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSizeGroupClick(group, e)}
                              className="p-0.5 hover:bg-muted rounded"
                              title="Delete"
                            >
                              <Trash2 className="h-2.5 w-2.5 text-muted-foreground hover:text-destructive" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(fieldSettings?.hsn_code?.enabled ?? true) && (
                <div className="space-y-1">
                  <Label htmlFor="hsn_code" className="text-xs">
                    {fieldSettings?.hsn_code?.label || 'HSN Code'}
                  </Label>
                  <Input
                    id="hsn_code"
                    value={formData.hsn_code}
                    onChange={(e) =>
                      setFormData({ ...formData, hsn_code: e.target.value })
                    }
                    placeholder="HSN Code"
                    className="h-7 text-xs"
                    list="hsn-list"
                    autoComplete="off"
                  />
                  <datalist id="hsn-list">
                    {hsnCodes.map((hsn) => (
                      <option key={hsn} value={hsn} />
                    ))}
                  </datalist>
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="gst_per" className="text-xs">GST % *</Label>
                <Select
                  value={formData.gst_per.toString()}
                  onValueChange={(value) =>
                    setFormData({ ...formData, gst_per: parseInt(value) })
                  }
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 5, 12, 18, 28].map((rate) => (
                      <SelectItem key={rate} value={rate.toString()} className="text-xs">
                        {rate}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="uom" className="text-xs">Unit (UOM)</Label>
                <Select
                  value={formData.uom}
                  onValueChange={(value) =>
                    setFormData({ ...formData, uom: value })
                  }
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UOM_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="default_pur_price" className="text-xs">Purchase Price <span className="text-destructive">*</span></Label>
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
                  className="h-7 text-xs"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="default_sale_price" className="text-xs">Sale Price <span className="text-destructive">*</span></Label>
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
                  className="h-7 text-xs"
                  required
                />
              </div>

              {showMrp && (
                <div className="space-y-1">
                  <Label htmlFor="default_mrp" className="text-xs">MRP <span className="text-destructive">*</span></Label>
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
                    className="h-7 text-xs"
                    required
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="status" className="text-xs">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active" className="text-xs">Active</SelectItem>
                    <SelectItem value="inactive" className="text-xs">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Generate Variants Button */}
            <div className="flex justify-start">
              <Button
                onClick={handleGenerateSizeVariants}
                disabled={formData.product_type !== 'service' && !formData.size_group_id}
                variant="default"
                size="sm"
                className="gap-1 h-7 text-xs bg-primary hover:bg-primary/90 !text-white font-semibold shadow-md"
              >
                <Plus className="h-3 w-3" />
                {formData.product_type === 'service' ? 'Generate Service Variant' : 'Generate Size Variants'}
              </Button>
            </div>

            {/* Size Variants Table */}
            {showVariants && variants.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {formData.product_type === 'service' ? 'Service Details' : `Variants (${variants.length})`}
                  </h3>
                  <Button
                    onClick={handleAutoGenerateBarcodes}
                    size="sm"
                    className="gap-1 h-6 text-xs"
                  >
                    <Barcode className="h-3 w-3" />
                    Auto-Generate Barcodes
                  </Button>
                </div>

                <div className="border rounded overflow-hidden overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {formData.product_type !== 'service' && <TableHead className="text-xs py-1">Color</TableHead>}
                        <TableHead className="text-xs py-1">{formData.product_type === 'service' ? 'Item' : 'Size'}</TableHead>
                        <TableHead className="text-xs py-1">Pur Price<span className="text-destructive">*</span></TableHead>
                        <TableHead className="text-xs py-1">Sale Price<span className="text-destructive">*</span></TableHead>
                        {showMrp && <TableHead className="text-xs py-1">MRP<span className="text-destructive">*</span></TableHead>}
                        {showMrp && <TableHead className="text-xs py-1">Disc</TableHead>}
                        <TableHead className="text-xs py-1">Barcode</TableHead>
                        {formData.product_type !== 'service' && <TableHead className="text-xs py-1">Open Qty</TableHead>}
                        <TableHead className="text-xs py-1 text-center">Active</TableHead>
                        <TableHead className="text-xs py-1"></TableHead>
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
                          <TableRow key={index} className="text-xs">
                            {formData.product_type !== 'service' && (
                              <TableCell className="font-medium text-primary py-1 text-xs">{variant.color || '-'}</TableCell>
                            )}
                            <TableCell className="font-medium py-1 text-xs">{variant.size}</TableCell>
                            <TableCell className="py-1">
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
                                className="w-20 h-6 text-xs"
                              />
                            </TableCell>
                            <TableCell className="py-1">
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
                                className="w-20 h-6 text-xs"
                              />
                            </TableCell>
                            {showMrp && (
                              <TableCell className="py-1">
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
                                  className="w-18 h-6 text-xs"
                                  placeholder="MRP"
                                />
                              </TableCell>
                            )}
                            {showMrp && (
                              <TableCell className="py-1">
                                {discount > 0 ? (
                                  <span className="text-green-600 font-medium text-xs">
                                    ₹{discount.toFixed(0)} ({discountPercent}%)
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">-</span>
                                )}
                              </TableCell>
                            )}
                            <TableCell className="py-1">
                              {variant.id && protectedVariants.has(variant.id) ? (
                                <div className="flex items-center gap-1 w-28">
                                  <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <span className="text-xs text-muted-foreground truncate" title={variant.barcode}>
                                    {variant.barcode || '-'}
                                  </span>
                                </div>
                              ) : (
                                <Input
                                  value={variant.barcode}
                                  onChange={(e) =>
                                    handleVariantChange(
                                      index,
                                      "barcode",
                                      e.target.value
                                    )
                                  }
                                  className="w-28 h-6 text-xs"
                                  placeholder="Barcode"
                                />
                              )}
                            </TableCell>
                            {formData.product_type !== 'service' && (
                              <TableCell className="py-1">
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
                                  className="w-16 h-6 text-xs"
                                  placeholder="0"
                                />
                              </TableCell>
                            )}
                            <TableCell className="text-center py-1">
                              <Switch
                                checked={variant.active}
                                onCheckedChange={(checked) =>
                                  handleVariantChange(index, "active", checked)
                                }
                                className="h-4 w-7"
                              />
                            </TableCell>
                            <TableCell className="py-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  setVariants(variants.filter((_, i) => i !== index));
                                }}
                              >
                                <X className="h-3 w-3" />
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
            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSave}
                disabled={loading}
                size="sm"
                className="gap-1 h-8 text-xs min-w-[120px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
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
