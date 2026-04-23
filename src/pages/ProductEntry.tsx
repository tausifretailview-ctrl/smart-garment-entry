import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { useProductProtection } from "@/hooks/useProductProtection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalculatorInput } from "@/components/ui/calculator-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Package, Barcode, Upload, X, FileSpreadsheet, Plus, Edit, Trash2, Lock, Search, Copy } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";
import { ExcelImportDialog, ImportProgress } from "@/components/ExcelImportDialog";
import { productEntryFields, productEntrySampleData, parseLocalizedNumber } from "@/utils/excelImportUtils";
import { validateProduct } from "@/lib/validations";
import { UOM_OPTIONS, DEFAULT_UOM } from "@/constants/uom";
import { applyGarmentGstRule, isGarmentGstAutoBumped, getGarmentGstThreshold, type GarmentGstRuleSettings } from "@/utils/gstRules";
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
  purchase_gst_percent: number;
  sale_gst_percent: number;
  uom: string; // Unit of Measurement
  default_pur_price: number | undefined;
  default_sale_price: number | undefined;
  default_mrp: number | undefined;
  status: string;
  image_url?: string;
  purchase_discount_type: 'percent' | 'flat' | null;
  purchase_discount_value: number;
  sale_discount_type: 'percent' | 'flat' | null;
  sale_discount_value: number;
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
  const [garmentGstSettings, setGarmentGstSettings] = useState<GarmentGstRuleSettings>({});
  const productNameInputRef = useRef<HTMLInputElement>(null);
  const variantsSectionRef = useRef<HTMLDivElement>(null);
  const autoGenerateBtnRef = useRef<HTMLButtonElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
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
  
  const [showDiscountFields, setShowDiscountFields] = useState(false);
  const [rollWiseMtrEnabled, setRollWiseMtrEnabled] = useState(false);
  const [showQuickSettings, setShowQuickSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
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
    purchase_gst_percent: 18,
    sale_gst_percent: 18,
    uom: "NOS", // Default Unit of Measurement
    default_pur_price: undefined,
    default_sale_price: undefined,
    default_mrp: undefined,
    status: "active",
    purchase_discount_type: null,
    purchase_discount_value: 0,
    sale_discount_type: null,
    sale_discount_value: 0,
  });
  const [colorInput, setColorInput] = useState("");
  const [markupPercent, setMarkupPercent] = useState<string>("");

  // Copy from existing product
  const [copySearch, setCopySearch] = useState("");
  const [copyResults, setCopyResults] = useState<Array<{ id: string; product_name: string; brand: string; category: string }>>([]);
  const [copyLoading, setCopyLoading] = useState(false);
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);
  const [copySelectedIndex, setCopySelectedIndex] = useState(-1);
  const copyDropdownRef = useRef<HTMLDivElement>(null);

  // Recent products history
  const [recentProducts, setRecentProducts] = useState<Array<{ id: string; product_name: string; brand: string; category: string; created_at: string }>>([]);
  const [lastProductName, setLastProductName] = useState("");

  const fetchRecentProducts = useCallback(async () => {
    if (!currentOrganization?.id) return;
    const { data } = await supabase
      .from("products")
      .select("id, product_name, brand, category, created_at")
      .eq("organization_id", currentOrganization.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5);
    if (data && data.length > 0) {
      setRecentProducts(data);
      setLastProductName(data[0].product_name || "");
    }
  }, [currentOrganization?.id]);

  useEffect(() => {
    fetchSizeGroups();
    fetchFieldSettings();
    fetchDefaultSizeGroup();
    fetchPreviousValues();
    fetchRecentProducts();
    
    // Check if we're editing an existing product
    const searchParams = new URLSearchParams(location.search);
    const productId = searchParams.get('id');
    if (productId) {
      setEditingProductId(productId);
      fetchProductForEdit(productId);
    }
  }, [location.search]);

  // Copy from existing product - debounced search
  useEffect(() => {
    if (!copySearch.trim() || copySearch.length < 2 || !currentOrganization?.id || editingProductId) {
      setCopyResults([]);
      setShowCopyDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setCopyLoading(true);
      try {
        const { data, error } = await supabase
          .from("products")
          .select("id, product_name, brand, category")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .or(`product_name.ilike.%${copySearch}%,brand.ilike.%${copySearch}%,category.ilike.%${copySearch}%`)
          .limit(20);

        if (error) throw error;
        const results = (data || []).map((p: any) => ({
          id: p.id,
          product_name: p.product_name || "",
          brand: p.brand || "",
          category: p.category || "",
        }));
        setCopyResults(results);
        setShowCopyDropdown(results.length > 0);
        setCopySelectedIndex(-1);
      } catch (err) {
        console.error("Copy search error:", err);
      } finally {
        setCopyLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [copySearch, currentOrganization?.id, editingProductId]);

  // Close copy dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (copyDropdownRef.current && !copyDropdownRef.current.contains(e.target as Node)) {
        setShowCopyDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleCopyFromProduct = useCallback(async (productId: string) => {
    setShowCopyDropdown(false);
    setCopySearch("");
    try {
      const { data: product, error } = await supabase
        .from("products")
        .select("*, product_variants(*)")
        .eq("id", productId)
        .single();

      if (error || !product) throw error || new Error("Product not found");

      // Extract colors from variants
      const variantColors = product.product_variants
        ? [...new Set(product.product_variants.map((v: any) => v.color).filter(Boolean))]
        : [];

      // Set form data from source product (leave product_name empty)
      setFormData(prev => ({
        ...prev,
        product_name: "",
        category: product.category || "",
        brand: product.brand || "",
        style: product.style || "",
        colors: variantColors.length > 0 ? variantColors : [],
        size_group_id: product.size_group_id || "",
        hsn_code: product.hsn_code || "",
        gst_per: product.gst_per ?? 18,
        purchase_gst_percent: product.purchase_gst_percent ?? product.gst_per ?? 18,
        sale_gst_percent: product.sale_gst_percent ?? product.gst_per ?? 18,
        uom: product.uom || "NOS",
        default_pur_price: product.default_pur_price || 0,
        default_sale_price: product.default_sale_price || 0,
        default_mrp: undefined,
      }));

      // Recalculate markup
      const purPrice = product.default_pur_price || 0;
      const salePrice = product.default_sale_price || 0;
      if (purPrice > 0 && salePrice > 0) {
        const calc = ((salePrice - purPrice) / purPrice) * 100;
        setMarkupPercent(Math.round(calc * 100) / 100 + "");
      }

      // Set color input
      setColorInput(variantColors.join(", "));

      // Copy variants with empty barcodes and zero opening stock
      if (product.product_variants && product.product_variants.length > 0) {
        const copiedVariants: ProductVariant[] = product.product_variants
          .filter((v: any) => v.active !== false && !v.deleted_at)
          .map((v: any) => ({
            color: v.color || "",
            size: v.size || "",
            pur_price: v.pur_price || 0,
            sale_price: v.sale_price || 0,
            mrp: v.mrp || null,
            barcode: "", // New barcodes needed
            active: true,
            opening_qty: 0,
          }));
        setVariants(copiedVariants);
        setShowVariants(true);
      }

      toast({
        title: "Product Copied",
        description: `Details copied from "${product.product_name}". Enter a new name and generate barcodes.`,
      });

      // Focus product name field
      setTimeout(() => productNameInputRef.current?.focus(), 100);
    } catch (err: any) {
      console.error("Copy product error:", err);
      toast({
        title: "Error",
        description: "Failed to copy product details",
        variant: "destructive",
      });
    }
  }, [currentOrganization, toast]);


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
          setFormData(prev => ({ ...prev, gst_per: purchaseSettings.default_tax_rate, purchase_gst_percent: purchaseSettings.default_tax_rate, sale_gst_percent: purchaseSettings.default_tax_rate }));
        }
        if (purchaseSettings.default_uom && !editingProductId) {
          setFormData(prev => ({ ...prev, uom: purchaseSettings.default_uom }));
        }
        // Default markup % — wired to existing markupPercent input, which auto-computes
        // sale_price from pur_price on every change. Only prefill for NEW products and
        // only when the user hasn't typed a markup yet, so we never overwrite intent.
        if (
          purchaseSettings.default_margin !== undefined &&
          purchaseSettings.default_margin !== null &&
          purchaseSettings.default_margin !== '' &&
          !editingProductId
        ) {
          const marginNum = Number(purchaseSettings.default_margin);
          if (!isNaN(marginNum) && marginNum >= 0) {
            setMarkupPercent(prev => (prev && prev.trim() !== '' ? prev : String(marginNum)));
          }
        }
        // Set show_mrp from purchase settings
        setShowMrp(purchaseSettings.show_mrp || false);
        // Set discount fields visibility
        setShowDiscountFields(purchaseSettings.product_entry_discount_enabled || false);
        // Set roll-wise MTR entry
        setRollWiseMtrEnabled(purchaseSettings.roll_wise_mtr_entry || false);
        // Garment GST auto-bump rule
        setGarmentGstSettings({
          garment_gst_rule_enabled: purchaseSettings.garment_gst_rule_enabled === true,
          garment_gst_threshold: purchaseSettings.garment_gst_threshold,
        });
      }
    }
  };

  const handleToggleDiscountSetting = async (enabled: boolean) => {
    if (!currentOrganization) return;
    setSavingSettings(true);
    try {
      const { data: existing } = await supabase
        .from("settings")
        .select("purchase_settings")
        .eq("organization_id", currentOrganization.id)
        .single();
      
      const currentPurchaseSettings = (typeof existing?.purchase_settings === 'object' && existing.purchase_settings !== null)
        ? existing.purchase_settings as any
        : {};
      
      const updatedPurchaseSettings = {
        ...currentPurchaseSettings,
        product_entry_discount_enabled: enabled,
      };

      await supabase
        .from("settings")
        .upsert({
          organization_id: currentOrganization.id,
          purchase_settings: updatedPurchaseSettings,
        }, { onConflict: "organization_id" });

      setShowDiscountFields(enabled);
      toast({ title: enabled ? "Discounts Enabled" : "Discounts Disabled", description: enabled ? "Purchase & Sale discount fields are now visible" : "Discount fields have been hidden" });
    } catch (err) {
      console.error("Failed to update settings:", err);
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    } finally {
      setSavingSettings(false);
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
          purchase_gst_percent: product.purchase_gst_percent ?? product.gst_per ?? 18,
          sale_gst_percent: product.sale_gst_percent ?? product.gst_per ?? 18,
          uom: product.uom || DEFAULT_UOM,
          default_pur_price: product.default_pur_price || 0,
          default_sale_price: product.default_sale_price || 0,
          default_mrp: undefined,
          status: product.status || "active",
          image_url: product.image_url,
          purchase_discount_type: (product as any).purchase_discount_type || null,
          purchase_discount_value: (product as any).purchase_discount_value || 0,
          sale_discount_type: (product as any).sale_discount_type || null,
          sale_discount_value: (product as any).sale_discount_value || 0,
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

  const isRollWiseMtr = rollWiseMtrEnabled && formData.uom === 'MTR';

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
    setTimeout(() => {
      variantsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        autoGenerateBtnRef.current?.focus();
      }, 400);
    }, 100);
    return;
  }

    // Roll-wise MTR mode: one variant per color, no size grid needed
    if (isRollWiseMtr) {
      const colorsToUse = formData.colors.length > 0 ? formData.colors : [""];
      const newVariants: ProductVariant[] = [];
      for (const color of colorsToUse) {
        const exists = variants.some(v => v.color === color && v.size === 'Roll');
        if (!exists) {
          newVariants.push({
            color,
            size: "Roll",
            pur_price: formData.default_pur_price ?? 0,
            sale_price: formData.default_sale_price ?? 0,
            mrp: formData.default_mrp ?? null,
            barcode: "",
            active: true,
            opening_qty: 0,
          });
        }
      }
      setVariants([...variants, ...newVariants]);
      setShowVariants(true);
      setTimeout(() => {
        variantsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => { autoGenerateBtnRef.current?.focus(); }, 400);
      }, 100);
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
    setTimeout(() => {
      variantsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        autoGenerateBtnRef.current?.focus();
      }, 400);
    }, 100);
  };

  const handleAutoGenerateBarcodes = async () => {
    try {
      const updatedVariants = [...variants];
      
      // Detect duplicate barcodes and clear them so they get regenerated
      const barcodeCounts = new Map<string, number>();
      for (const v of updatedVariants) {
        if (v.barcode) {
          barcodeCounts.set(v.barcode, (barcodeCounts.get(v.barcode) || 0) + 1);
        }
      }
      for (let i = 0; i < updatedVariants.length; i++) {
        if (updatedVariants[i].barcode && barcodeCounts.get(updatedVariants[i].barcode)! > 1) {
          updatedVariants[i] = { ...updatedVariants[i], barcode: "" };
        }
      }
      
      // Generate barcodes sequentially for empty/cleared slots
      for (let i = 0; i < updatedVariants.length; i++) {
        if (!updatedVariants[i].barcode) {
          updatedVariants[i] = {
            ...updatedVariants[i],
            barcode: await generateSequentialBarcode(),
          };
        }
      }
      setVariants(updatedVariants);
      // After barcodes generated, focus Save button for keyboard flow
      setTimeout(() => {
        saveBtnRef.current?.focus();
      }, 100);
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

    // Validate default prices: purchase should not exceed sale
    if ((formData.default_pur_price ?? 0) > 0 && (formData.default_sale_price ?? 0) > 0 && (formData.default_pur_price ?? 0) > (formData.default_sale_price ?? 0)) {
      toast({
        title: "Check Sale Price",
        description: "Purchase price is greater than sale price. Please check the prices.",
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
      
      // Check purchase price > sale price
      if (variant.pur_price > 0 && variant.sale_price > 0 && variant.pur_price > variant.sale_price) {
        toast({
          title: "Check Sale Price",
          description: `Purchase price (₹${variant.pur_price}) is greater than sale price (₹${variant.sale_price}) for variant ${variant.size}${variant.color ? ` (${variant.color})` : ''}.`,
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
      
      // Check barcode is present
      if (!variant.barcode || variant.barcode.trim() === '') {
        toast({
          title: "Barcode Required",
          description: `Barcode is required for variant ${variant.size}${variant.color ? ` (${variant.color})` : ''}. Please generate barcode first.`,
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

    // Step 1: Check for duplicate barcodes within the same product's variants
    const barcodeSet = new Set<string>();
    const internalDuplicates: string[] = [];
    for (const barcode of barcodesToCheck) {
      if (barcodeSet.has(barcode)) {
        internalDuplicates.push(barcode);
      } else {
        barcodeSet.add(barcode);
      }
    }

    if (internalDuplicates.length > 0) {
      const uniqueDuplicates = [...new Set(internalDuplicates)];
      toast({
        title: "Duplicate Barcode Error",
        description: `The same barcode "${uniqueDuplicates.join(", ")}" is used for multiple variants. Each variant must have a unique barcode.`,
        variant: "destructive",
      });
      return false;
    }

    try {
      // Step 2: Check if any of these barcodes already exist in the database
      const { data: existingVariants, error } = await supabase
        .from("product_variants")
        .select("barcode, product_id, products(product_name)")
        .in("barcode", barcodesToCheck)
        .is("deleted_at", null);

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
          purchase_gst_percent: formData.purchase_gst_percent,
          sale_gst_percent: formData.sale_gst_percent,
          uom: formData.uom || DEFAULT_UOM,
          default_pur_price: formData.default_pur_price,
          default_sale_price: formData.default_sale_price,
          status: formData.status,
          image_url: imageUrl,
          size_group_id: formData.size_group_id || null,
          purchase_discount_type: formData.purchase_discount_value > 0 ? (formData.purchase_discount_type || 'percent') : null,
          purchase_discount_value: formData.purchase_discount_value || 0,
          sale_discount_type: formData.sale_discount_value > 0 ? (formData.sale_discount_type || 'percent') : null,
          sale_discount_value: formData.sale_discount_value || 0,
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
          // Using manual check-then-insert pattern since we use expression-based unique index
          for (const v of newVariants) {
            // Check if variant already exists (handles NULL color comparison)
            const { data: existingVariant } = await supabase
              .from("product_variants")
              .select("id")
              .eq("product_id", editingProductId)
              .eq("size", v.size)
              .is("deleted_at", null)
              .or(v.color ? `color.eq.${v.color}` : "color.is.null")
              .maybeSingle();

            if (existingVariant) {
              // Update existing variant
              const { error: updateError } = await supabase
                .from("product_variants")
                .update({
                  pur_price: v.pur_price,
                  sale_price: v.sale_price,
                  mrp: v.mrp,
                  barcode: v.barcode,
                  active: v.active,
                  opening_qty: v.opening_qty,
                })
                .eq("id", existingVariant.id);

              if (updateError) throw updateError;
            } else {
              // Insert new variant
              const { error: insertError } = await supabase
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

              if (insertError) throw insertError;
            }
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
          purchase_gst_percent: formData.purchase_gst_percent,
          sale_gst_percent: formData.sale_gst_percent,
          uom: formData.uom || DEFAULT_UOM,
          default_pur_price: formData.default_pur_price,
          default_sale_price: formData.default_sale_price,
          status: formData.status,
          image_url: imageUrl,
          organization_id: currentOrganization.id,
          size_group_id: formData.size_group_id || null,
          purchase_discount_type: formData.purchase_discount_value > 0 ? (formData.purchase_discount_type || 'percent') : null,
          purchase_discount_value: formData.purchase_discount_value || 0,
          sale_discount_type: formData.sale_discount_value > 0 ? (formData.sale_discount_type || 'percent') : null,
          sale_discount_value: formData.sale_discount_value || 0,
        };
        const { data, error: productError } = await supabase
          .from("products")
          .insert([productPayload])
          .select()
          .single();

        if (productError) throw productError;
        productData = data;

        // Insert variants using manual check-then-insert pattern
        // This handles NULL color comparison properly with expression-based unique index
        if (variants.length > 0) {
          const insertedVariants: any[] = [];
          
          for (const v of variants) {
            // Check if variant already exists (handles NULL color comparison)
            const { data: existingVariant } = await supabase
              .from("product_variants")
              .select("id")
              .eq("product_id", productData.id)
              .eq("size", v.size)
              .is("deleted_at", null)
              .or(v.color ? `color.eq.${v.color}` : "color.is.null")
              .maybeSingle();

            if (existingVariant) {
              // Update existing variant (shouldn't happen for new products, but safety check)
              const { data: updated, error: updateError } = await supabase
                .from("product_variants")
                .update({
                  pur_price: v.pur_price,
                  sale_price: v.sale_price,
                  mrp: v.mrp,
                  barcode: v.barcode,
                  active: v.active,
                  opening_qty: v.opening_qty,
                })
                .eq("id", existingVariant.id)
                .select()
                .single();

              if (updateError) throw updateError;
              if (updated) insertedVariants.push(updated);
            } else {
              // Insert new variant
              const { data: inserted, error: insertError } = await supabase
                .from("product_variants")
                .insert({
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
                })
                .select()
                .single();

              if (insertError) throw insertError;
              if (inserted) insertedVariants.push(inserted);
            }
          }

          // Create stock movements for opening quantities (only for new products)
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

        // Silent operation - no toast for product save

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
                gst_per: parseLocalizedNumber(firstRow.gst_per) || 18,
                purchase_gst_percent: parseLocalizedNumber(firstRow.purchase_gst_percent || firstRow.gst_per) || 18,
                sale_gst_percent: parseLocalizedNumber(firstRow.sale_gst_percent || firstRow.gst_per) || 18,
                default_pur_price: parseLocalizedNumber(firstRow.default_pur_price) || 0,
                default_sale_price: parseLocalizedNumber(firstRow.default_sale_price) || 0,
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

            const openingQty = parseLocalizedNumber(row.opening_qty) || 0;

            variantsToInsert.push({
              organization_id: currentOrganization.id,
              product_id: productId,
              size: size,
              barcode: barcode,
              pur_price: parseLocalizedNumber(row.default_pur_price) || 0,
              sale_price: parseLocalizedNumber(row.default_sale_price) || 0,
              mrp: row.mrp ? parseLocalizedNumber(row.mrp) : null,
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
    <div className="h-[calc(100vh-6rem)] bg-background p-4 overflow-auto font-outfit">
      <div className="w-full">
        <BackToDashboard label="Back to Products" to="/products" />
        <div className="mb-3 flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Smart Inventory</h1>
            <p className="text-xs text-muted-foreground">Manage your product catalogue</p>
          </div>
        </div>

        <Card className="shadow-sm border-border overflow-hidden">
          <CardHeader className="p-5 pb-3 border-b border-border bg-card">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold font-outfit">
                  {editingProductId ? "✏️ Edit Product" : "📦 Product Entry"}
                </CardTitle>
                <CardDescription className="font-outfit">
                  {editingProductId ? "Update product information" : "Add new product to your inventory"}
                </CardDescription>
              </div>
              {!editingProductId && (
                <Button
                  onClick={() => setShowExcelImport(true)}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 font-outfit font-semibold"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Import Excel
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-5 font-outfit">
            {/* Copy from Existing Product - only shown for new products */}
            {!editingProductId && (
              <div className="space-y-2" ref={copyDropdownRef}>
                <Label className="flex items-center gap-1">
                  <Copy className="h-3.5 w-3.5" />
                  Copy from Existing Product
                </Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={copySearch}
                    onChange={(e) => setCopySearch(e.target.value)}
                    onFocus={() => {
                      if (copyResults.length > 0) setShowCopyDropdown(true);
                    }}
                    onKeyDown={(e) => {
                      if (!showCopyDropdown || copyResults.length === 0) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setCopySelectedIndex(prev => Math.min(prev + 1, copyResults.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setCopySelectedIndex(prev => Math.max(prev - 1, 0));
                      } else if (e.key === "Enter" && copySelectedIndex >= 0) {
                        e.preventDefault();
                        handleCopyFromProduct(copyResults[copySelectedIndex].id);
                      } else if (e.key === "Escape") {
                        setShowCopyDropdown(false);
                      }
                    }}
                    placeholder="Search product name, brand, or category to copy..."
                    className="pl-7 pr-7 border-dashed"
                  />
                  {copyLoading && (
                    <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                  {showCopyDropdown && copyResults.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {copyResults.map((product, index) => (
                        <div
                          key={product.id}
                          className={`px-3 py-2 cursor-pointer text-sm border-b border-border last:border-b-0 hover:bg-accent ${
                            copySelectedIndex === index ? "bg-primary text-primary-foreground" : ""
                          }`}
                          onClick={() => handleCopyFromProduct(product.id)}
                          onMouseEnter={() => setCopySelectedIndex(index)}
                        >
                          <div className="font-medium truncate">{product.product_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {[product.brand, product.category].filter(Boolean).join(" • ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Search & select a product to auto-fill all details. Then change name & generate barcodes.
                </p>
              </div>
            )}

            {/* Recent Products History */}
            {!editingProductId && recentProducts.length > 0 && (
              <div className="flex items-center gap-3 bg-card rounded-xl px-4 py-2.5 border border-border shadow-sm">
                <span className="text-[10.5px] text-muted-foreground uppercase font-bold tracking-[0.06em] font-outfit whitespace-nowrap select-none">Recent</span>
                <div className="w-px h-5 bg-border" />
                <div className="flex flex-wrap gap-1.5 overflow-hidden">
                  {recentProducts.map((p) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/40 text-[11.5px] text-muted-foreground border border-border/80 hover:border-primary/40 hover:bg-primary/5 hover:text-foreground cursor-pointer transition-all duration-200 font-medium font-outfit"
                    >
                      <span className="text-primary/60">⊕</span>
                      {p.product_name}
                      {p.brand && <span className="text-muted-foreground/40">• {p.brand}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── 📸 Product Image ────────────────────────── */}
            <div className="flex items-center gap-2 pt-2">
              <span className="text-sm">📸</span>
              <span className="text-[13.5px] font-bold text-foreground font-outfit">Product Image</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-4">
                {imagePreview ? (
                  <div className="relative group">
                    <img
                      src={imagePreview}
                      alt="Product preview"
                      className="w-20 h-20 object-cover rounded-xl border-2 border-primary/20 shadow-sm"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      onClick={handleRemoveImage}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <label
                    htmlFor="product_image"
                    className="w-20 h-20 border-2 border-dashed border-border rounded-xl flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5 hover:border-primary/40 hover:from-primary/10 hover:to-accent/10 cursor-pointer transition-all duration-200"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-[8px] text-muted-foreground font-outfit font-medium">Upload</span>
                    </div>
                  </label>
                )}
                <label
                  htmlFor="product_image"
                  className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-border bg-muted/20 hover:border-primary/30 hover:bg-primary/5 cursor-pointer transition-all duration-200"
                >
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/10 via-accent/10 to-primary/5 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <Upload className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground font-outfit">Click to upload or drag & drop</p>
                    <p className="text-[10px] text-muted-foreground font-outfit mt-0.5">Max 5MB — JPG, PNG, WEBP</p>
                  </div>
                  <span className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground font-outfit pointer-events-none shadow-sm">
                    Browse
                  </span>
                </label>
                <Input
                  id="product_image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* ── 📦 Product Type ──────────────────────────── */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-sm">📦</span>
              <span className="text-[13.5px] font-bold text-foreground font-outfit">Product Type</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([
                  { value: 'goods' as ProductType, icon: '📦', label: 'Goods', desc: 'Physical items' },
                  { value: 'service' as ProductType, icon: '🔧', label: 'Service', desc: 'Service based' },
                  { value: 'combo' as ProductType, icon: '🎁', label: 'Combo', desc: 'Bundle pack' },
                ]).map(pt => (
                  <button
                    key={pt.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, product_type: pt.value, size_group_id: pt.value === 'service' ? '' : formData.size_group_id })}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg border-[1.5px] cursor-pointer transition-all duration-200 text-left ${
                      formData.product_type === pt.value
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border bg-card hover:border-primary/30 hover:bg-muted/30'
                    }`}
                  >
                    <span className="text-base">{pt.icon}</span>
                    <div className="min-w-0">
                      <p className={`text-[13px] font-bold leading-tight ${formData.product_type === pt.value ? 'text-primary' : 'text-foreground'}`}>{pt.label}</p>
                      <p className="text-[10.5px] text-muted-foreground leading-tight">{pt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── 📋 Product Details ────────────────────────── */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-sm">📋</span>
              <span className="text-[13.5px] font-bold text-foreground font-outfit">Product Details</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              <div className="space-y-2">
                <Label htmlFor="product_name">Product Name *</Label>
                <Input
                  id="product_name"
                  ref={productNameInputRef}
                  value={formData.product_name}
                  onChange={(e) =>
                    setFormData({ ...formData, product_name: e.target.value })
                  }
                  placeholder={lastProductName ? `Last: ${lastProductName}` : "Enter product name"}
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
                <div className="space-y-2">
                  <Label htmlFor="color">
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
                    />
                  </div>
                  {formData.colors.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {formData.colors.map((color, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs"
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

              {/* Size Group - Hidden for service type and roll-wise MTR */}
              {formData.product_type !== 'service' && !isRollWiseMtr && (
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
                        <span className="flex items-center gap-1">
                          <Plus className="h-3 w-3" />
                          New Size Group
                        </span>
                      </SelectItem>
                      {sizeGroups.map((group) => (
                        <div key={group.id} className="relative flex items-center">
                          <SelectItem value={group.id} className="flex-1 pr-12">
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

              <div className="space-y-2">
                <Label htmlFor="purchase_gst" className="text-blue-600 dark:text-blue-400">Purchase GST %</Label>
                <Select
                  value={formData.purchase_gst_percent.toString()}
                  onValueChange={(value) => {
                    const val = parseInt(value);
                    setFormData(prev => ({
                      ...prev,
                      purchase_gst_percent: val,
                      gst_per: val, // keep gst_per in sync with purchase
                    }));
                  }}
                >
                  <SelectTrigger className="border-blue-200 dark:border-blue-800">
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
                <Label htmlFor="sale_gst" className="text-green-600 dark:text-green-400">Sale GST %</Label>
                {formData.purchase_gst_percent !== formData.sale_gst_percent && (
                  <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    ≠ Purchase
                  </span>
                )}
                {isGarmentGstAutoBumped(formData.default_sale_price, garmentGstSettings) && (
                  <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    Auto 18% (&gt;₹{getGarmentGstThreshold(garmentGstSettings)})
                  </span>
                )}
                <Select
                  value={formData.sale_gst_percent.toString()}
                  onValueChange={(value) =>
                    setFormData(prev => ({ ...prev, sale_gst_percent: parseInt(value) }))
                  }
                >
                  <SelectTrigger className="border-green-200 dark:border-green-800">
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
                <Label htmlFor="uom">Unit (UOM)</Label>
                <Select
                  value={formData.uom}
                  onValueChange={(value) =>
                    setFormData({ ...formData, uom: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UOM_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* ── 💰 Pricing & Tax ─────────────────────────── */}
              <div className="col-span-full flex items-center gap-2 pt-1">
                <span className="text-sm">💰</span>
                <span className="text-[13.5px] font-bold text-foreground font-outfit">Pricing & Tax</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="default_pur_price">Purchase Price <span className="text-destructive">*</span></Label>
                <CalculatorInput
                  id="default_pur_price"
                  value={formData.default_pur_price ?? ""}
                  onChange={(val) => {
                    const purPrice = val || 0;
                    const markup = parseFloat(markupPercent);
                    const newSalePrice = (!isNaN(markup) && purPrice > 0)
                      ? Math.round(purPrice * (1 + markup / 100))
                      : formData.default_sale_price;
                    const updates: any = { default_pur_price: purPrice };
                    if (!isNaN(markup) && purPrice > 0) {
                      updates.default_sale_price = newSalePrice;
                      updates.sale_gst_percent = applyGarmentGstRule(newSalePrice, formData.sale_gst_percent, garmentGstSettings);
                    }
                    setFormData({ ...formData, ...updates });
                  }}
                  className={`${(formData.default_pur_price ?? 0) > 0 && (formData.default_sale_price ?? 0) > 0 && (formData.default_pur_price ?? 0) > (formData.default_sale_price ?? 0) ? 'border-destructive' : ''}`}
                  placeholder="₹ 0.00"
                />
                {(formData.default_pur_price ?? 0) > 0 && (formData.default_sale_price ?? 0) > 0 && (formData.default_pur_price ?? 0) > (formData.default_sale_price ?? 0) && (
                  <p className="text-destructive text-xs font-semibold">⚠ Pur &gt; Sale!</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="markup_percent">Markup %</Label>
                <Input
                  id="markup_percent"
                  type="number"
                  min="0"
                  step="0.01"
                  value={markupPercent}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMarkupPercent(val);
                    const markup = parseFloat(val);
                    if (!isNaN(markup) && (formData.default_pur_price ?? 0) > 0) {
                      const newSalePrice = Math.round((formData.default_pur_price ?? 0) * (1 + markup / 100));
                      setFormData(prev => ({
                        ...prev,
                        default_sale_price: newSalePrice,
                        sale_gst_percent: applyGarmentGstRule(newSalePrice, prev.sale_gst_percent, garmentGstSettings),
                      }));
                    }
                  }}
                  placeholder="e.g. 100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="default_sale_price">Sale Price <span className="text-destructive">*</span></Label>
                <CalculatorInput
                  id="default_sale_price"
                  value={formData.default_sale_price ?? ""}
                  onChange={(val) => {
                    const salePrice = val || 0;
                    const newGst = applyGarmentGstRule(salePrice, formData.sale_gst_percent, garmentGstSettings);
                    setFormData({
                      ...formData,
                      default_sale_price: salePrice,
                      sale_gst_percent: newGst,
                    });
                    if ((formData.default_pur_price ?? 0) > 0 && salePrice > 0) {
                      const calc = ((salePrice - (formData.default_pur_price ?? 0)) / (formData.default_pur_price ?? 1)) * 100;
                      setMarkupPercent(Math.round(calc * 100) / 100 + "");
                    } else {
                      setMarkupPercent("");
                    }
                  }}
                  className={`${(formData.default_pur_price ?? 0) > 0 && (formData.default_sale_price ?? 0) > 0 && (formData.default_pur_price ?? 0) > (formData.default_sale_price ?? 0) ? 'border-destructive' : ''}`}
                  placeholder="₹ 0.00"
                />
                {(formData.default_pur_price ?? 0) > 0 && (formData.default_sale_price ?? 0) > 0 && (formData.default_pur_price ?? 0) > (formData.default_sale_price ?? 0) && (
                  <p className="text-destructive text-xs font-semibold">⚠ Check sale price</p>
                )}
              </div>

              {showMrp && (
                <div className="space-y-2">
                  <Label htmlFor="default_mrp">MRP <span className="text-destructive">*</span></Label>
                  <CalculatorInput
                    id="default_mrp"
                    value={formData.default_mrp ?? ""}
                    onChange={(val) =>
                      setFormData({
                        ...formData,
                        default_mrp: val || 0,
                      })
                    }
                    placeholder="MRP"
                  />
                </div>
              )}

              {/* Purchase Discount Section */}
              {showDiscountFields && (
                <div className="col-span-full">
                  <div className="rounded-xl border-[1.5px] border-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50/80 to-orange-50/40 p-5 space-y-4 relative overflow-hidden shadow-sm">
                    {/* Hanging badge */}
                    <div className="absolute -top-[1px] right-5">
                      <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-3 py-1.5 rounded-b-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white tracking-[0.06em] uppercase shadow-md">
                        🏷️ Supplier Discount
                      </span>
                    </div>

                    {/* Section header */}
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center shadow-sm">
                        <span className="text-white text-xs font-bold">%</span>
                      </div>
                      <Label className="font-bold text-sm text-amber-700 font-outfit">Purchase Discount</Label>
                    </div>

                    {/* Controls row */}
                    <div className="flex items-center gap-4 flex-wrap">
                      {/* Toggle % / ₹ */}
                      <div className="inline-flex rounded-lg border-[1.5px] border-amber-200 overflow-hidden h-[38px] shadow-sm bg-white">
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, purchase_discount_type: 'percent' }))}
                          className={`w-[44px] text-[13px] font-bold transition-all duration-200 ${(formData.purchase_discount_type || 'percent') === 'percent' ? 'bg-amber-500 text-white shadow-inner' : 'bg-white text-amber-400 hover:bg-amber-50'}`}
                        >%</button>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, purchase_discount_type: 'flat' }))}
                          className={`w-[44px] text-[13px] font-bold transition-all duration-200 ${formData.purchase_discount_type === 'flat' ? 'bg-amber-500 text-white shadow-inner' : 'bg-white text-amber-400 hover:bg-amber-50'}`}
                        >₹</button>
                      </div>

                      {/* Discount value input */}
                      <Input
                        type="number"
                        min="0"
                        max={formData.purchase_discount_type === 'flat' ? (formData.default_pur_price ?? 999999) : 100}
                        step="0.01"
                        value={formData.purchase_discount_value || ""}
                        onChange={(e) => setFormData(prev => ({ ...prev, purchase_discount_value: parseFloat(e.target.value) || 0 }))}
                        placeholder="Enter discount"
                        className="w-28 h-[38px] font-outfit font-semibold text-amber-800 border-amber-200 bg-white focus:border-amber-400 focus:ring-amber-200/50"
                      />

                      {/* Computed net price */}
                      <div className="flex-1 text-right min-w-[120px] bg-white/70 rounded-lg border border-amber-200/60 px-4 py-2">
                        <p className="text-[10px] text-amber-600/70 font-medium uppercase tracking-wide">Net Purchase Price</p>
                        <p className="font-extrabold text-base text-emerald-600 font-outfit tabular-nums">
                          ₹{(() => {
                            const pp = formData.default_pur_price ?? 0;
                            const dv = formData.purchase_discount_value || 0;
                            if (dv <= 0 || pp <= 0) return pp.toLocaleString('en-IN');
                            const net = (formData.purchase_discount_type || 'percent') === 'percent'
                              ? pp - (pp * dv / 100)
                              : pp - dv;
                            return Math.max(0, net).toLocaleString('en-IN', { maximumFractionDigits: 2 });
                          })()}
                        </p>
                      </div>
                    </div>

                    {/* Helper note */}
                    <div className="bg-white/60 border border-amber-200/50 rounded-lg px-3.5 py-2">
                      <p className="text-[11px] text-amber-700/70 font-medium font-outfit">💡 This discount will auto-populate the Discount column on Purchase Bills when this product is added</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Sale Discount Section */}
              {showDiscountFields && (
                <div className="col-span-full">
                  <div className="rounded-xl border-[1.5px] border-blue-200 bg-gradient-to-br from-blue-50 via-sky-50/80 to-indigo-50/40 p-5 space-y-4 relative overflow-hidden shadow-sm">
                    {/* Hanging badge */}
                    <div className="absolute -top-[1px] right-5">
                      <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-3 py-1.5 rounded-b-lg bg-gradient-to-r from-blue-500 to-violet-500 text-white tracking-[0.06em] uppercase shadow-md">
                        🛒 Sale Discount
                      </span>
                    </div>

                    {/* Section header */}
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm">
                        <span className="text-white text-xs font-bold">₹</span>
                      </div>
                      <Label className="font-bold text-sm text-blue-700 font-outfit">Sale Discount</Label>
                    </div>

                    {/* Controls row */}
                    <div className="flex items-center gap-4 flex-wrap">
                      {/* Toggle % / ₹ */}
                      <div className="inline-flex rounded-lg border-[1.5px] border-blue-200 overflow-hidden h-[38px] shadow-sm bg-white">
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, sale_discount_type: 'percent' }))}
                          className={`w-[44px] text-[13px] font-bold transition-all duration-200 ${(formData.sale_discount_type || 'percent') === 'percent' ? 'bg-blue-500 text-white shadow-inner' : 'bg-white text-blue-400 hover:bg-blue-50'}`}
                        >%</button>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, sale_discount_type: 'flat' }))}
                          className={`w-[44px] text-[13px] font-bold transition-all duration-200 ${formData.sale_discount_type === 'flat' ? 'bg-blue-500 text-white shadow-inner' : 'bg-white text-blue-400 hover:bg-blue-50'}`}
                        >₹</button>
                      </div>

                      {/* Discount value input */}
                      <Input
                        type="number"
                        min="0"
                        max={formData.sale_discount_type === 'flat' ? (formData.default_sale_price ?? 999999) : 100}
                        step="0.01"
                        value={formData.sale_discount_value || ""}
                        onChange={(e) => setFormData(prev => ({ ...prev, sale_discount_value: parseFloat(e.target.value) || 0 }))}
                        placeholder="Enter discount"
                        className="w-28 h-[38px] font-outfit font-semibold text-blue-800 border-blue-200 bg-white focus:border-blue-400 focus:ring-blue-200/50"
                      />

                      {/* Computed net price */}
                      <div className="flex-1 text-right min-w-[120px] bg-white/70 rounded-lg border border-blue-200/60 px-4 py-2">
                        <p className="text-[10px] text-blue-600/70 font-medium uppercase tracking-wide">Net Sale Price</p>
                        <p className="font-extrabold text-base text-emerald-600 font-outfit tabular-nums">
                          ₹{(() => {
                            const sp = formData.default_sale_price ?? 0;
                            const dv = formData.sale_discount_value || 0;
                            if (dv <= 0 || sp <= 0) return sp.toLocaleString('en-IN');
                            const net = (formData.sale_discount_type || 'percent') === 'percent'
                              ? sp - (sp * dv / 100)
                              : sp - dv;
                            return Math.max(0, net).toLocaleString('en-IN', { maximumFractionDigits: 2 });
                          })()}
                        </p>
                      </div>
                    </div>

                    {/* Helper note */}
                    <div className="bg-white/60 border border-blue-200/50 rounded-lg px-3.5 py-2">
                      <p className="text-[11px] text-blue-700/70 font-medium font-outfit">🛒 This discount auto-applies on Sale & POS window when product is scanned or added</p>
                    </div>
                  </div>
                </div>
              )}

              {!showDiscountFields && (
                <div className="col-span-full">
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/40 border border-border/60">
                    <span className="text-sm">💡</span>
                    <p className="text-xs text-muted-foreground font-outfit">Enable Purchase & Sale Discounts from <span className="font-semibold text-primary cursor-pointer hover:underline">⚙️ Settings → Purchase Settings</span></p>
                  </div>
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

            {/* Roll-wise MTR info banner */}
            {isRollWiseMtr && (
              <div className="col-span-full">
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200">
                  <span className="text-sm">🧵</span>
                  <p className="text-xs text-amber-800 font-outfit">
                    <span className="font-semibold">Roll-wise MTR mode:</span> Individual roll variants with meter lengths & unique barcodes will be created during Purchase Entry. Add colors here, then generate color variants below.
                  </p>
                </div>
              </div>
            )}

            {/* ── 👟 Size Variants ────────────────────────── */}
            <div className="rounded-xl border-[1.5px] border-violet-200 bg-gradient-to-br from-violet-50/60 via-purple-50/30 to-fuchsia-50/20 p-4 space-y-3">
              {/* Section header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-sm">
                    <span className="text-white text-sm">👟</span>
                  </div>
                  <div>
                    <span className="text-[13.5px] font-bold text-violet-800 font-outfit">Size Variants</span>
                    <p className="text-[10px] text-violet-500/80 font-outfit">Generate size-wise entries automatically</p>
                  </div>
                </div>
                <Button
                  onClick={handleGenerateSizeVariants}
                  disabled={formData.product_type !== 'service' && !isRollWiseMtr && !formData.size_group_id}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 font-outfit font-semibold text-violet-700 border-violet-300 hover:bg-violet-100/60 hover:border-violet-400 transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {formData.product_type === 'service' ? 'Generate Service Variant' : isRollWiseMtr ? 'Generate Color Variants' : 'Generate Variants'}
                </Button>
              </div>

              {/* Size Variants Table */}
              {showVariants && variants.length > 0 && (
                <div ref={variantsSectionRef} className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold font-outfit text-violet-700">
                      {formData.product_type === 'service' ? 'Service Details' : `${variants.length} Variant${variants.length !== 1 ? 's' : ''}`}
                    </h3>
                    <Button
                      ref={autoGenerateBtnRef}
                      onClick={handleAutoGenerateBarcodes}
                      size="sm"
                      className="gap-1 h-6 text-[11px] bg-violet-600 hover:bg-violet-700 text-white font-outfit shadow-sm"
                    >
                      <Barcode className="h-3 w-3" />
                      Auto-Generate Barcodes
                    </Button>
                  </div>

                  <div className="border border-violet-200/60 rounded-lg overflow-hidden overflow-x-auto bg-white shadow-sm">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gradient-to-r from-violet-100/80 to-purple-100/60 border-b border-violet-200/60">
                          {formData.product_type !== 'service' && (
                            <TableHead className="text-[11px] py-2 font-bold text-violet-700 font-outfit">Color</TableHead>
                          )}
                          <TableHead className="text-[11px] py-2 font-bold text-violet-700 font-outfit">
                            {formData.product_type === 'service' ? 'Item' : 'Size'}
                          </TableHead>
                          <TableHead className="text-[11px] py-2 font-bold text-amber-700 font-outfit bg-amber-50/50">
                            Pur Price<span className="text-destructive ml-0.5">*</span>
                          </TableHead>
                          <TableHead className="text-[11px] py-2 font-bold text-emerald-700 font-outfit bg-emerald-50/50">
                            Sale Price<span className="text-destructive ml-0.5">*</span>
                          </TableHead>
                          {showMrp && (
                            <TableHead className="text-[11px] py-2 font-bold text-blue-700 font-outfit bg-blue-50/50">
                              MRP<span className="text-destructive ml-0.5">*</span>
                            </TableHead>
                          )}
                          {showMrp && (
                            <TableHead className="text-[11px] py-2 font-bold text-emerald-700 font-outfit">Disc</TableHead>
                          )}
                          <TableHead className="text-[11px] py-2 font-bold text-violet-700 font-outfit">
                            Barcode<span className="text-destructive ml-0.5">*</span>
                          </TableHead>
                          <TableHead className="text-[11px] py-2 font-bold text-violet-700 font-outfit text-center">Active</TableHead>
                          <TableHead className="text-[11px] py-2 w-8"></TableHead>
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
                            <TableRow key={index} className="text-xs hover:bg-violet-50/30 transition-colors">
                              {formData.product_type !== 'service' && (
                                <TableCell className="py-1.5 px-1.5">
                                  <Input
                                    list="color-suggestions"
                                    value={variant.color || ''}
                                    placeholder="-"
                                    className="h-7 w-20 text-xs font-medium text-primary px-2 py-0 uppercase border-violet-200 focus:border-violet-400"
                                    onChange={(e) => {
                                      const val = e.target.value.toUpperCase();
                                      handleVariantChange(index, "color", val);
                                    }}
                                    onBlur={(e) => {
                                      const val = e.target.value.trim().toUpperCase();
                                      handleVariantChange(index, "color", val);
                                      if (val && !formData.colors.includes(val)) {
                                        setFormData(prev => ({ ...prev, colors: [...prev.colors, val] }));
                                      }
                                    }}
                                  />
                                </TableCell>
                              )}
                              <TableCell className="py-1.5">
                                <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-md bg-violet-100 text-violet-800 text-xs font-bold font-outfit">
                                  {variant.size}
                                </span>
                              </TableCell>
                              <TableCell className="py-1.5 bg-amber-50/20">
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={variant.pur_price}
                                  onChange={(e) =>
                                    handleVariantChange(index, "pur_price", parseFloat(e.target.value) || 0)
                                  }
                                  className={`w-20 h-7 text-xs font-semibold border-amber-200 focus:border-amber-400 ${variant.pur_price > 0 && variant.sale_price > 0 && variant.pur_price > variant.sale_price ? 'border-destructive bg-destructive/5' : ''}`}
                                />
                                {variant.pur_price > 0 && variant.sale_price > 0 && variant.pur_price > variant.sale_price && (
                                  <p className="text-destructive text-[9px] font-semibold mt-0.5">Pur &gt; Sale!</p>
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 bg-emerald-50/20">
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={variant.sale_price}
                                  onChange={(e) =>
                                    handleVariantChange(index, "sale_price", parseFloat(e.target.value) || 0)
                                  }
                                  className={`w-20 h-7 text-xs font-semibold border-emerald-200 focus:border-emerald-400 ${variant.pur_price > 0 && variant.sale_price > 0 && variant.pur_price > variant.sale_price ? 'border-destructive bg-destructive/5' : ''}`}
                                />
                                {variant.pur_price > 0 && variant.sale_price > 0 && variant.pur_price > variant.sale_price && (
                                  <p className="text-destructive text-[9px] font-semibold mt-0.5">Check price</p>
                                )}
                              </TableCell>
                              {showMrp && (
                                <TableCell className="py-1.5 bg-blue-50/20">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={variant.mrp || ""}
                                    onChange={(e) =>
                                      handleVariantChange(index, "mrp", e.target.value ? parseFloat(e.target.value) : null)
                                    }
                                    className="w-18 h-7 text-xs font-semibold border-blue-200 focus:border-blue-400"
                                    placeholder="MRP"
                                  />
                                </TableCell>
                              )}
                              {showMrp && (
                                <TableCell className="py-1.5">
                                  {discount > 0 ? (
                                    <span className="inline-flex items-center gap-0.5 text-emerald-600 font-bold text-[11px] bg-emerald-50 px-1.5 py-0.5 rounded font-outfit">
                                      ₹{discount.toFixed(0)} <span className="text-emerald-500 font-medium">({discountPercent}%)</span>
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  )}
                                </TableCell>
                              )}
                              <TableCell className="py-1.5">
                                {variant.id && protectedVariants.has(variant.id) ? (
                                  <div className="flex items-center gap-1 w-28">
                                    <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                    <span className="text-xs text-muted-foreground truncate font-mono" title={variant.barcode}>
                                      {variant.barcode || '-'}
                                    </span>
                                  </div>
                                ) : (
                                  <Input
                                    value={variant.barcode}
                                    onChange={(e) =>
                                      handleVariantChange(index, "barcode", e.target.value)
                                    }
                                    className="w-36 h-7 text-xs font-mono border-violet-200 focus:border-violet-400"
                                    placeholder="Barcode"
                                  />
                                )}
                              </TableCell>
                              <TableCell className="text-center py-1.5">
                                <Switch
                                  checked={variant.active}
                                  onCheckedChange={(checked) =>
                                    handleVariantChange(index, "active", checked)
                                  }
                                  className="h-4 w-7"
                                />
                              </TableCell>
                              <TableCell className="py-1.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
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
                    <datalist id="color-suggestions">
                      {formData.colors.map(c => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                </div>
              )}
            </div>
            {/* Save Button Footer */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-4 border-t border-border bg-muted/20 -mx-6 px-6 -mb-6 pb-5 rounded-b-xl">
              <div className="flex items-center gap-3 flex-wrap">
                {showDiscountFields ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg font-outfit">
                    ✅ Discounts Enabled
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-outfit">
                    💡 Discounts disabled
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowQuickSettings(true)}
                  className="font-outfit font-semibold text-muted-foreground hover:text-foreground gap-1.5"
                >
                  ⚙️ Settings
                </Button>
              </div>
              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => orgNavigate('/products')}
                  className="font-outfit font-semibold hidden sm:inline-flex"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.reload()}
                  className="font-outfit font-semibold gap-1 hidden sm:inline-flex"
                >
                  🔄 Reset
                </Button>
                <Button
                  ref={saveBtnRef}
                  onClick={handleSave}
                  disabled={loading}
                  size="default"
                  className="gap-1.5 min-w-[140px] w-full sm:w-auto font-outfit font-semibold shadow-md hover:shadow-lg transition-all"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {editingProductId ? "Updating..." : "Saving..."}
                    </>
                  ) : (
                    <>
                      💾 {editingProductId ? "Update Product" : "Save Product"}
                    </>
                  )}
                </Button>
              </div>
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

        {/* Quick Settings Modal */}
        <Dialog open={showQuickSettings} onOpenChange={setShowQuickSettings}>
          <DialogContent className="sm:max-w-[420px] p-0 rounded-2xl overflow-hidden border-0 shadow-[0_25px_70px_rgba(0,0,0,0.2)]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                  <span className="text-lg">⚙️</span>
                </div>
                <div>
                  <DialogTitle className="text-[15px] font-bold font-outfit">Product Entry Settings</DialogTitle>
                  <DialogDescription className="text-[11px] text-muted-foreground font-outfit">Configure discount fields visibility</DialogDescription>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5 space-y-5">
              {/* Discount Toggle */}
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground font-outfit">Product Entry Discounts</p>
                  <p className="text-[11px] text-muted-foreground font-outfit leading-relaxed">
                    Show Purchase & Sale discount fields on the product form
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleDiscountSetting(!showDiscountFields)}
                  disabled={savingSettings}
                  className={`relative w-[50px] h-[28px] rounded-full transition-colors duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] flex-shrink-0 ${
                    showDiscountFields ? 'bg-emerald-500' : 'bg-gray-300'
                  } ${savingSettings ? 'opacity-50' : ''}`}
                >
                  <span
                    className={`absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow-md transition-[left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                      showDiscountFields ? 'left-[25px]' : 'left-[3px]'
                    }`}
                  />
                </button>
              </div>

              {/* Info panel when enabled */}
              {showDiscountFields && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2.5 animate-fade-in">
                  <p className="text-xs font-semibold text-primary font-outfit">How discounts work:</p>
                  <ul className="space-y-1.5">
                    <li className="flex items-start gap-2 text-[11px] text-muted-foreground font-outfit">
                      <span className="text-amber-500 mt-0.5">🏷️</span>
                      <span><strong className="text-foreground">Purchase Discount</strong> — auto-populates discount column on purchase bills</span>
                    </li>
                    <li className="flex items-start gap-2 text-[11px] text-muted-foreground font-outfit">
                      <span className="text-blue-500 mt-0.5">🛒</span>
                      <span><strong className="text-foreground">Sale Discount</strong> — auto-applies when product is scanned in POS or added to sale invoice</span>
                    </li>
                    <li className="flex items-start gap-2 text-[11px] text-muted-foreground font-outfit">
                      <span className="text-emerald-500 mt-0.5">✏️</span>
                      <span>Users can always manually override discounts on individual bills</span>
                    </li>
                  </ul>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-border bg-muted/20">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowQuickSettings(false)}
                className="font-outfit font-semibold"
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ProductEntry;
