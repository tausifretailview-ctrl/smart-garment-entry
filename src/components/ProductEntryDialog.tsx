import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { IMEIScanDialog } from "@/components/IMEIScanDialog";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalculatorInput } from "@/components/ui/calculator-input";
import { Label } from "@/components/ui/label";
import { applyGarmentGstRule, isGarmentGstAutoBumped, getGarmentGstThreshold, type GarmentGstRuleSettings } from "@/utils/gstRules";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Package, Barcode, Plus, Edit, Trash2, ImagePlus, X, Search, Copy, ChevronUp, Check } from "lucide-react";
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
import { UOM_OPTIONS, DEFAULT_UOM } from "@/constants/uom";
import { useUserPermissions } from "@/hooks/useUserPermissions";

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
  purchase_qty?: number;
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
  purchase_gst_percent: number;
  sale_gst_percent: number;
  uom: string; // Unit of Measurement
  default_pur_price: number | undefined;
  default_sale_price: number | undefined;
  default_mrp: number | undefined;
  default_pur_discount: number | undefined;
  default_sale_discount: number | undefined;
  status: string;
}

interface MobileERPModeConfig {
  enabled: boolean;
  imei_scan_enforcement: boolean;
  locked_size_qty: boolean;
  imei_min_length: number;
  imei_max_length: number;
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
    purchase_gst_percent?: number;
    sale_gst_percent?: number;
    hsn_code: string | null;
    color: string | null;
    style?: string | null;
    uom?: string | null;
    purchase_discount_type?: string | null;
    purchase_discount_value?: number | null;
    variants: any[];
  }) => void;
  hideOpeningQty?: boolean;
  isDcPurchase?: boolean;
  isAutoBarcode?: boolean;
  mobileERPMode?: MobileERPModeConfig;
}

export const ProductEntryDialog = ({ open, onOpenChange, onProductCreated, hideOpeningQty, isDcPurchase, isAutoBarcode = true, mobileERPMode }: ProductEntryDialogProps) => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { isColumnVisible } = useUserPermissions();
  const [loading, setLoading] = useState(false);
  const [sizeGroups, setSizeGroups] = useState<SizeGroup[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [showVariants, setShowVariants] = useState(false);
  const [fieldSettings, setFieldSettings] = useState<any>(null);
  const [showMrp, setShowMrp] = useState(false);
  const [showDiscountFields, setShowDiscountFields] = useState(false);
  const [garmentGstSettings, setGarmentGstSettings] = useState<GarmentGstRuleSettings>({});
 const [cursorAfterStyle, setCursorAfterStyle] = useState<'pur_price' | 'hsn'>('pur_price');
  const purGstRef = useRef<HTMLButtonElement>(null);
  const saleGstRef = useRef<HTMLButtonElement>(null);
  const productNameInputRef = useRef<HTMLInputElement>(null);
  const variantsSectionRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [showCreateSizeGroup, setShowCreateSizeGroup] = useState(false);
  const [newSizeGroup, setNewSizeGroup] = useState({ group_name: "", sizes: "" });
  const [productImage, setProductImage] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [creatingSizeGroup, setCreatingSizeGroup] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [rollWiseMtrEnabled, setRollWiseMtrEnabled] = useState(false);
  const [colorRollLengths, setColorRollLengths] = useState<Record<string, string>>({});
  const [disabledSizes, setDisabledSizes] = useState<Set<string>>(new Set());
  const [customSizes, setCustomSizes] = useState<string[]>([]);
  const [customSizeInput, setCustomSizeInput] = useState("");
  const autoBarcodePending = useRef(false);
  
  // Mobile ERP: qty input & IMEI scan
  const [mobileERPQty, setMobileERPQty] = useState<number>(1);
  const [imeiScanOpen, setImeiScanOpen] = useState(false);
  const [imeiScanColor, setImeiScanColor] = useState<string>("");
  
  // Auto-generate barcodes when variants are created with empty barcodes (only in auto mode)
  // In purchase context (hideOpeningQty), defer barcode generation to save time — only for sizes with qty > 0
  useEffect(() => {
    if (!isAutoBarcode) return; // Skip auto-generation in scan/manual mode
    if (hideOpeningQty) return; // In purchase context, barcodes generated at save time
    if (autoBarcodePending.current && variants.length > 0 && variants.some(v => !v.barcode)) {
      autoBarcodePending.current = false;
      // Trigger auto barcode generation
      (async () => {
        try {
          const updated = [...variants];
          for (let i = 0; i < updated.length; i++) {
            if (!updated[i].barcode) {
              updated[i] = { ...updated[i], barcode: await generateSequentialBarcode() };
            }
          }
          setVariants(updated);
        } catch (e) {
          console.error('Auto barcode generation failed:', e);
        }
      })();
    }
  }, [variants, isAutoBarcode, hideOpeningQty]);

  // Copy from existing product
  const [copySearch, setCopySearch] = useState("");
  const [copyResults, setCopyResults] = useState<any[]>([]);
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copySelectedIndex, setCopySelectedIndex] = useState(-1);
  const copyInputRef = useRef<HTMLInputElement>(null);
  const copyDropdownRef = useRef<HTMLDivElement>(null);
  const [copyDropdownPos, setCopyDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  // Previous values for dropdowns
  const [categories, setCategories] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [hsnCodes, setHsnCodes] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [existingColors, setExistingColors] = useState<string[]>([]);
  
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
    purchase_gst_percent: 18,
    sale_gst_percent: 18,
    uom: DEFAULT_UOM,
    default_pur_price: undefined,
    default_sale_price: undefined,
    default_mrp: undefined,
    default_pur_discount: undefined,
    default_sale_discount: undefined,
    status: "active",
  });
  const [colorInput, setColorInput] = useState("");
  const [markupPercent, setMarkupPercent] = useState("");

  // Reset form when dialog opens - pre-fill from last saved product
  useEffect(() => {
    if (open) {
      resetForm();
      fetchSizeGroups();
      fetchFieldSettings();
      fetchDefaultSizeGroup();
      fetchPreviousValues();
      setCopySearch("");
      setCopyResults([]);
      setShowCopyDropdown(false);
      // Auto-focus product name field
      setTimeout(() => productNameInputRef.current?.focus(), 150);
    }
  }, [open]);

  // Mobile ERP mode: auto-generate variants without needing a size group
  useEffect(() => {
    if (mobileERPMode?.locked_size_qty && hideOpeningQty && !formData.size_group_id) {
      const colorsToUse = formData.colors.length > 0 ? formData.colors : [""];
      const newVariants: ProductVariant[] = colorsToUse.map(color => ({
        color,
        size: "None",
        pur_price: formData.default_pur_price ?? 0,
        sale_price: formData.default_sale_price ?? 0,
        mrp: formData.default_mrp ?? null,
        barcode: "",
        active: true,
        opening_qty: 0,
        purchase_qty: 1,
      }));
      if (isAutoBarcode) autoBarcodePending.current = true;
      setVariants(newVariants);
      setShowVariants(true);
    }
  }, [mobileERPMode?.locked_size_qty, hideOpeningQty, formData.colors, formData.size_group_id]);

  // Sync selectedSizes and auto-generate variants when size_group_id or colors change
  useEffect(() => {
    // Skip auto-generation for roll-wise MTR mode — variants are created via Generate button
    if (rollWiseMtrEnabled && formData.uom === 'MTR') return;
    if (formData.size_group_id && sizeGroups.length > 0) {
      const group = sizeGroups.find(g => g.id === formData.size_group_id);
      if (group) {
        if (selectedSizes.length === 0) {
          setSelectedSizes([...group.sizes]);
        }
        // In purchase context: auto-generate variants for qty entry
        if (hideOpeningQty) {
          const colorsToUse = formData.colors.length > 0 ? formData.colors : [""];
          
          // Mobile ERP / IMEI mode: single "None" size per color, qty=1
          if (mobileERPMode?.locked_size_qty) {
            const newVariants: ProductVariant[] = colorsToUse.map(color => ({
              color,
              size: "None",
              pur_price: formData.default_pur_price ?? 0,
              sale_price: formData.default_sale_price ?? 0,
              mrp: formData.default_mrp ?? null,
              barcode: "",
              active: true,
              opening_qty: 0,
              purchase_qty: 1,
            }));
            if (isAutoBarcode) autoBarcodePending.current = true;
            setVariants(newVariants);
            setShowVariants(true);
          } else {
            // Build a map of existing qty values to preserve them
            const existingQtyMap = new Map<string, number>();
            variants.forEach(v => {
              if ((v.purchase_qty || 0) > 0) {
                existingQtyMap.set(`${v.color}||${v.size}`, v.purchase_qty || 0);
              }
            });
            const newVariants: ProductVariant[] = [];
            const allSizesForGroup = [...group.sizes, ...customSizes];
            for (const color of colorsToUse) {
              for (const size of allSizesForGroup) {
                const key = `${color}||${size}`;
                newVariants.push({
                  color,
                  size,
                  pur_price: formData.default_pur_price ?? 0,
                  sale_price: formData.default_sale_price ?? 0,
                  mrp: formData.default_mrp ?? null,
                  barcode: "",
                  active: true,
                  opening_qty: 0,
                  purchase_qty: existingQtyMap.get(key) || 0,
                });
              }
            }
            if (isAutoBarcode) autoBarcodePending.current = true;
            setVariants(newVariants);
            setShowVariants(true);
          }
        }
      }
    }
  }, [formData.size_group_id, sizeGroups, formData.colors, customSizes]);

  // Sync default prices to existing variants when user edits price fields
  useEffect(() => {
    if (variants.length > 0 && showVariants) {
      setVariants(prev => prev.map(v => ({
        ...v,
        pur_price: formData.default_pur_price ?? v.pur_price,
        sale_price: formData.default_sale_price ?? v.sale_price,
        mrp: formData.default_mrp ?? v.mrp,
      })));
    }
  }, [formData.default_pur_price, formData.default_sale_price, formData.default_mrp]);

  // Recent products state
  const [recentProducts, setRecentProducts] = useState<any[]>([]);

  // Auto-generate Standard variant for service products
  useEffect(() => {
    if (formData.product_type === 'service' && variants.length === 0 && open) {
      setVariants([{
        color: "",
        size: "Standard",
        pur_price: formData.default_pur_price ?? 1,
        sale_price: formData.default_sale_price ?? 1,
        mrp: null,
        barcode: "",
        active: true,
        opening_qty: 0,
        purchase_qty: 1,
      }]);
      setShowVariants(true);
      if (isAutoBarcode) autoBarcodePending.current = true;
    }
  }, [formData.product_type]);

  // Fetch recent products when dialog opens
  useEffect(() => {
    if (open && currentOrganization?.id) {
      (async () => {
        const { data } = await supabase
          .from("products")
          .select("id, product_name, brand, category, default_sale_price, default_pur_price, size_group_id, size_groups(group_name)")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(10);
        setRecentProducts(data || []);
      })();
    }
  }, [open, currentOrganization?.id]);

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

    // Fetch unique colors from product_variants
    const { data: variantsData, error: variantsError } = await supabase
      .from("product_variants")
      .select("color")
      .eq("organization_id", currentOrganization.id);

    if (!variantsError && variantsData) {
      const uniqueColors = [...new Set(variantsData.map((v: any) => v.color).filter(Boolean) as string[])].sort();
      setExistingColors(uniqueColors);
    }
  };

  const LAST_PRODUCT_KEY = `last_product_details_${currentOrganization?.id || ''}`;

  // Get last product name for placeholder hint
  const lastProductNameHint = useMemo(() => {
    try {
      const stored = localStorage.getItem(LAST_PRODUCT_KEY);
      if (stored) {
        const p = JSON.parse(stored);
        if (p.product_name) return `Last: ${p.product_name}`;
      }
    } catch {}
    return "Enter product name";
  }, [LAST_PRODUCT_KEY, open]);

  const resetForm = () => {
    // Try to load last saved product details for pre-fill
    let lastProduct: Partial<ProductForm> = {};
    try {
      const stored = localStorage.getItem(LAST_PRODUCT_KEY);
      if (stored) lastProduct = JSON.parse(stored);
    } catch {}

    setFormData({
      product_type: "goods",
      product_name: lastProduct.product_name || "",
      category: lastProduct.category || "",
      brand: lastProduct.brand || "",
      style: lastProduct.style || "",
      colors: [],
      size_group_id: lastProduct.size_group_id || "",
      hsn_code: lastProduct.hsn_code || "",
      gst_per: lastProduct.gst_per ?? 18,
      purchase_gst_percent: lastProduct.purchase_gst_percent ?? lastProduct.gst_per ?? 18,
      sale_gst_percent: lastProduct.sale_gst_percent ?? lastProduct.gst_per ?? 18,
      uom: lastProduct.uom || DEFAULT_UOM,
      default_pur_price: lastProduct.default_pur_price,
      default_sale_price: lastProduct.default_sale_price,
      default_mrp: lastProduct.default_mrp,
      default_pur_discount: undefined,
      default_sale_discount: undefined,
      status: "active",
    });
    setColorInput("");
    setMarkupPercent("");
    setSelectedSizes([]);
    setDisabledSizes(new Set());
    setCustomSizes([]);
    setCustomSizeInput("");
    setVariants([]);
    setShowVariants(false);
    setProductImage(null);
  };

  // Save current product details to localStorage for next time
  const saveLastProductDetails = () => {
    try {
      const toStore: Partial<ProductForm> = {
        product_name: formData.product_name,
        category: formData.category,
        brand: formData.brand,
        style: formData.style,
        size_group_id: formData.size_group_id,
        hsn_code: formData.hsn_code,
        gst_per: formData.gst_per,
        purchase_gst_percent: formData.purchase_gst_percent,
        sale_gst_percent: formData.sale_gst_percent,
        uom: formData.uom,
        default_pur_price: formData.default_pur_price,
        default_sale_price: formData.default_sale_price,
        default_mrp: formData.default_mrp,
      };
      localStorage.setItem(LAST_PRODUCT_KEY, JSON.stringify(toStore));
    } catch {}
  };

  // Debounced copy-from-existing search
  const updateCopyDropdownPos = useCallback(() => {
    if (copyInputRef.current) {
      const rect = copyInputRef.current.getBoundingClientRect();
      setCopyDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, []);

  useEffect(() => {
    if (!copySearch.trim() || copySearch.length < 2 || !currentOrganization?.id) {
      setCopyResults([]);
      setShowCopyDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      setCopyLoading(true);
      try {
        const { data } = await supabase
          .from("products")
          .select("id, product_name, brand, category, default_sale_price, size_group_id, size_groups(group_name)")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .or(`product_name.ilike.%${copySearch}%,brand.ilike.%${copySearch}%,category.ilike.%${copySearch}%`)
          .limit(20);
        setCopyResults(data || []);
        setShowCopyDropdown((data || []).length > 0);
        setCopySelectedIndex(-1);
        updateCopyDropdownPos();
      } catch (e) {
        console.error("Copy search error:", e);
      } finally {
        setCopyLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [copySearch, currentOrganization?.id, updateCopyDropdownPos]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        copyDropdownRef.current?.contains(target) ||
        copyInputRef.current?.contains(target)
      ) return;
      setShowCopyDropdown(false);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, []);

  const handleCopyFromProduct = async (productId: string) => {
    setShowCopyDropdown(false);
    setCopySearch("");
    try {
      const { data: product, error } = await supabase
        .from("products")
        .select("*, product_variants(*)")
        .eq("id", productId)
        .single();
      if (error || !product) throw error;

      const copiedColors = [...new Set(
        (product.product_variants || [])
          .filter((v: any) => v.active !== false && !v.deleted_at && v.color)
          .map((v: any) => v.color)
      )] as string[];

      setFormData(prev => ({
        ...prev,
        product_name: product.product_name || "",
        category: product.category || "",
        brand: product.brand || "",
        style: product.style || "",
        hsn_code: product.hsn_code || "",
        gst_per: product.gst_per ?? 18,
        purchase_gst_percent: product.purchase_gst_percent ?? product.gst_per ?? 18,
        sale_gst_percent: product.sale_gst_percent ?? product.gst_per ?? 18,
        size_group_id: product.size_group_id || "",
        uom: product.uom || DEFAULT_UOM,
        default_pur_price: product.default_pur_price ?? undefined,
        default_sale_price: product.default_sale_price ?? undefined,
        default_mrp: undefined,
        colors: copiedColors,
      }));

      const copiedVariants = (product.product_variants || [])
        .filter((v: any) => v.active !== false && !v.deleted_at)
        .map((v: any) => ({
          color: v.color || "",
          size: v.size || "",
          pur_price: v.pur_price ?? 0,
          sale_price: v.sale_price ?? 0,
          mrp: v.mrp ?? null,
          barcode: "",
          active: true,
          opening_qty: 0,
        }));
      setVariants(copiedVariants);
      setShowVariants(copiedVariants.length > 0);

      toast({ title: "Copied", description: `Details copied from "${product.product_name}". Enter a new name and generate barcodes.` });
      setTimeout(() => productNameInputRef.current?.focus(), 100);
    } catch (e: any) {
      toast({ title: "Error", description: "Failed to copy product details", variant: "destructive" });
    }
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
      .maybeSingle();

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
      .maybeSingle();

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
          setFormData(prev => ({ ...prev, gst_per: purchaseSettings.default_tax_rate, purchase_gst_percent: purchaseSettings.default_tax_rate, sale_gst_percent: purchaseSettings.default_tax_rate }));
        }
        if (purchaseSettings.default_uom) {
          setFormData(prev => ({ ...prev, uom: purchaseSettings.default_uom }));
        }
        setShowMrp(purchaseSettings.show_mrp || false);
        setShowDiscountFields(purchaseSettings.product_entry_discount_enabled || false);
        setCursorAfterStyle(purchaseSettings.cursor_after_style || 'pur_price');
        setRollWiseMtrEnabled(purchaseSettings.roll_wise_mtr_entry || false);
      }
    }
  };

  // When DC Purchase mode is active, default purchase GST to 0% and sale GST to 5%
  useEffect(() => {
    if (isDcPurchase && open) {
      setFormData(prev => ({
        ...prev,
        gst_per: 0,
        purchase_gst_percent: 0,
        sale_gst_percent: 5,
      }));
    }
  }, [isDcPurchase, open]);

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
      const newVariant: ProductVariant = {
        color: "",
        size: "Standard",
        pur_price: formData.default_pur_price ?? 1,
        sale_price: formData.default_sale_price ?? 1,
        mrp: null,
        barcode: "",   // User can type 501, 502, or leave blank for auto
        active: true,
        opening_qty: 0,
        purchase_qty: 1,  // Service needs qty=1 to pass purchase_qty>0 filters
      };
      // Only auto-generate if in auto mode AND barcode is blank
      if (isAutoBarcode) autoBarcodePending.current = true;
      setVariants([newVariant]);
      setShowVariants(true);
      return;
    }

    // Roll-wise MTR: create color × roll-length variants
    const isRollWiseMtr = rollWiseMtrEnabled && formData.uom === 'MTR';
    if (isRollWiseMtr) {
      const colorsToUse = formData.colors.length > 0 ? formData.colors : [""];
      const newVariants: ProductVariant[] = [];
      for (const color of colorsToUse) {
        const lengthsStr = colorRollLengths[color] || "";
        const lengths = lengthsStr.split(",").map(s => s.trim()).filter(s => s && !isNaN(Number(s)));
        if (lengths.length === 0) {
          // Fallback: one "Roll" variant if no lengths specified
          const exists = variants.some(v => v.color === color && v.size === "Roll");
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
              purchase_qty: 1,
            });
          }
        } else {
          for (const len of lengths) {
            const sizeLabel = `${len} MTR`;
            const exists = variants.some(v => v.color === color && v.size === sizeLabel);
            if (!exists) {
              newVariants.push({
                color,
                size: sizeLabel,
                pur_price: formData.default_pur_price ?? 0,
                sale_price: formData.default_sale_price ?? 0,
                mrp: formData.default_mrp ?? null,
                barcode: "",
                active: true,
                opening_qty: 0,
                purchase_qty: 1,
              });
            }
          }
        }
      }
      if (newVariants.length === 0) {
        toast({ title: "No new variants", description: "All roll lengths already exist or no lengths specified", variant: "destructive" });
        return;
      }
      if (isAutoBarcode) autoBarcodePending.current = true;
      setVariants([...variants, ...newVariants]);
      setShowVariants(true);
      return;
    }

    const selectedGroup = sizeGroups.find((g) => g.id === formData.size_group_id);
    if (!selectedGroup && !mobileERPMode?.locked_size_qty) {
      toast({
        title: "Error",
        description: "Please select a size group first",
        variant: "destructive",
      });
      return;
    }

    const colorsToUse = formData.colors.length > 0 ? formData.colors : [""];
    const newVariants: ProductVariant[] = [];
    
    const sizesToUse = selectedSizes.length > 0
      ? selectedGroup.sizes.filter(s => selectedSizes.includes(s))
      : selectedGroup.sizes;

    if (sizesToUse.length === 0) {
      toast({
        title: "No sizes selected",
        description: "Please select at least one size from the checkboxes",
        variant: "destructive",
      });
      return;
    }

    for (const color of colorsToUse) {
      for (const size of sizesToUse) {
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

    if (isAutoBarcode) autoBarcodePending.current = true;
    setVariants([...variants, ...newVariants]);
    setShowVariants(true);
    setTimeout(() => {
      variantsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      
      // Generate barcodes only for variants that will actually be used (qty > 0 in purchase context)
      for (let i = 0; i < updatedVariants.length; i++) {
        const v = updatedVariants[i];
        const shouldSkip = hideOpeningQty && formData.product_type !== 'service' && (v.purchase_qty || 0) <= 0;
        if (!v.barcode && !shouldSkip) {
          updatedVariants[i] = {
            ...updatedVariants[i],
            barcode: await generateSequentialBarcode(),
          };
        }
      }
      setVariants(updatedVariants);
      setTimeout(() => {
        variantsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    // In purchase context, only validate variants with qty > 0
    const variantsToValidate = (hideOpeningQty && formData.product_type !== 'service')
      ? variants.filter((v) => (v.purchase_qty || 0) > 0)
      : variants;

    for (let i = 0; i < variantsToValidate.length; i++) {
      const variant = variantsToValidate[i];
      
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
      
      // Check purchase price > sale price
      if (formData.product_type !== 'service' && variant.pur_price > 0 && variant.sale_price > 0 && variant.pur_price > variant.sale_price) {
        toast({
          title: "Price Warning",
          description: `Purchase price (₹${variant.pur_price}) is greater than Sale price (₹${variant.sale_price}) for variant ${variant.size}${variant.color ? ` (${variant.color})` : ''}. Please correct the prices.`,
          variant: "destructive",
        });
        return false;
      }

      // Check barcode is present — skip in purchase context since barcodes are generated at save time
      if (!hideOpeningQty && (!variant.barcode || variant.barcode.trim() === '')) {
        toast({
          title: "Barcode Required",
          description: `Barcode is required for variant ${variant.size}${variant.color ? ` (${variant.color})` : ''}. Please generate barcode first.`,
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
        purchase_gst_percent: formData.purchase_gst_percent,
        sale_gst_percent: formData.sale_gst_percent,
        uom: formData.uom || DEFAULT_UOM,
        default_pur_price: formData.default_pur_price,
        default_sale_price: formData.default_sale_price,
        purchase_discount_type: formData.default_pur_discount ? 'percent' : null,
        purchase_discount_value: formData.default_pur_discount || null,
        sale_discount_type: formData.default_sale_discount ? 'percent' : null,
        sale_discount_value: formData.default_sale_discount || null,
        status: formData.status,
        organization_id: currentOrganization.id,
        // In roll-wise MTR mode, no size group is used — force null to avoid stale FK
        size_group_id: (rollWiseMtrEnabled && formData.uom === 'MTR')
          ? null
          : (formData.size_group_id && sizeGroups.some(g => g.id === formData.size_group_id) ? formData.size_group_id : null),
      };
      
      const { data: productData, error: productError } = await supabase
        .from("products")
        .insert([productPayload])
        .select()
        .single();

      if (productError) throw productError;

      // Insert variants — in purchase context, only create variants with purchase_qty > 0
      let insertedVariants: any[] = [];
      let variantsToCreate = (hideOpeningQty && formData.product_type !== 'service')
        ? variants.filter((v) => (v.purchase_qty || 0) > 0 && !disabledSizes.has(v.size) && (formData.colors.length === 0 || !v.color || formData.colors.includes(v.color))).map(v => ({ ...v }))
        : [...variants];
      if (variantsToCreate.length > 0) {
        // In purchase context, auto-generate barcodes only in auto mode
        if (hideOpeningQty && isAutoBarcode) {
          for (let i = 0; i < variantsToCreate.length; i++) {
            if (!variantsToCreate[i].barcode) {
              variantsToCreate[i] = { ...variantsToCreate[i], barcode: await generateSequentialBarcode() };
            }
          }
        }
        
        // Block save if any variant still has no barcode
        const missingBarcode = variantsToCreate.some(v => !v.barcode || !v.barcode.trim());
        if (missingBarcode) {
          toast({
            title: mobileERPMode?.enabled ? "IMEI Required" : "Barcode Required",
            description: isAutoBarcode
              ? "Failed to generate barcodes. Please try again."
              : mobileERPMode?.enabled
                ? "Please scan IMEI for all variants before adding to bill"
                : "Please scan or enter barcode for all variants before adding to bill",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        
        // IMEI format validation in Mobile ERP mode
        if (mobileERPMode?.enabled) {
          const invalidIMEI = variantsToCreate.find(v => {
            const cleaned = (v.barcode || '').replace(/\s/g, '');
            return !/^[a-zA-Z0-9\-_.\/]+$/.test(cleaned) || cleaned.length < (mobileERPMode.imei_min_length || 4) || cleaned.length > (mobileERPMode.imei_max_length || 25);
          });
          if (invalidIMEI) {
            toast({
              title: "Invalid IMEI",
              description: `IMEI must be ${mobileERPMode.imei_min_length}-${mobileERPMode.imei_max_length} characters. Check: ${invalidIMEI.barcode}`,
              variant: "destructive",
            });
            setLoading(false);
            return;
          }
        }
        const variantsToInsert = variantsToCreate.map((v) => ({
          product_id: productData.id,
          organization_id: currentOrganization.id,
          color: v.color || null,
          size: v.size,
          pur_price: v.pur_price,
          sale_price: v.sale_price,
          mrp: v.mrp,
          barcode: v.barcode,
          active: v.active,
          opening_qty: formData.product_type === 'service' ? 0 : v.opening_qty,
          // Service products have unlimited/virtual stock — no physical stock tracking
          stock_qty: formData.product_type === 'service' ? 999999 : v.opening_qty,
        }));

        const { data: variantsData, error: variantsError } = await supabase
          .from("product_variants")
          .insert(variantsToInsert)
          .select();

        if (variantsError) throw variantsError;
        insertedVariants = variantsData || [];

        // Create stock movements for opening quantities (skip for service products)
        if (insertedVariants.length > 0 && formData.product_type !== 'service') {
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

      // Save last product details for quick entry next time
      saveLastProductDetails();

      // Call the callback with product data — include purchase_qty from variants
      const variantsWithQty = insertedVariants.map((iv: any) => {
        const matchingVariant = variants.find(v => v.size === iv.size && (v.color || "") === (iv.color || ""));
        return {
          ...iv,
          purchase_qty: matchingVariant?.purchase_qty || 0,
        };
      });

      onProductCreated({
        id: productData.id,
        product_name: productData.product_name,
        brand: productData.brand,
        category: productData.category,
        gst_per: productData.gst_per || 0,
        purchase_gst_percent: productData.purchase_gst_percent ?? productData.gst_per ?? 0,
        sale_gst_percent: productData.sale_gst_percent ?? productData.gst_per ?? 0,
        hsn_code: productData.hsn_code,
        color: productData.color,
        style: productData.style,
        uom: productData.uom || 'NOS',
        purchase_discount_type: productData.purchase_discount_type,
        purchase_discount_value: productData.purchase_discount_value,
        variants: variantsWithQty,
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

  // Enter key moves to next field (like Tab), with configurable skip from style
  const handleEnterAsTab = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const currentEl = e.target as HTMLElement;
      const currentId = currentEl.id || currentEl.getAttribute("name") || "";

      // After style field, jump based on setting
      if (currentId === "style") {
        if (cursorAfterStyle === 'pur_price') {
          const purPriceEl = document.getElementById("default_pur_price");
          if (purPriceEl) { purPriceEl.focus(); return; }
        } else {
          // hsn → pur_gst → sale_gst → pur_price sequence
          const hsnEl = document.getElementById("hsn_code");
          if (hsnEl) { hsnEl.focus(); return; }
        }
      }
      // HSN → Pur GST
      if (currentId === "hsn_code" && cursorAfterStyle === 'hsn') {
        purGstRef.current?.focus();
        return;
      }
      // Pur GST → Sale GST
      if (currentId === "purchase_gst_percent" && cursorAfterStyle === 'hsn') {
        saleGstRef.current?.focus();
        return;
      }
      // Sale GST → Pur Price
      if (currentId === "sale_gst_percent" && cursorAfterStyle === 'hsn') {
        const purPriceEl = document.getElementById("default_pur_price");
        if (purPriceEl) { purPriceEl.focus(); return; }
      }

      const form = currentEl.closest('[data-product-form]');
      if (!form) return;
      const focusable = Array.from(form.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([type="file"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [role="combobox"]:not(:disabled)'
      )).filter(el => el.offsetParent !== null && !el.closest('.hidden'));
      const idx = focusable.indexOf(currentEl);
      if (idx >= 0 && idx < focusable.length - 1) {
        focusable[idx + 1].focus();
      }
    }
  }, [cursorAfterStyle, purGstRef, saleGstRef]);

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
        <DialogContent className="max-w-6xl max-h-[92vh] p-0 font-outfit flex flex-col overflow-hidden">
          {/* Purchase Context Header */}
          <div className="mx-6 mt-6 mb-2 rounded-xl border-[1.5px] border-success/30 bg-gradient-to-br from-success/5 to-success/10 p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-success/20 to-success/30 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">🧾</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-success">Purchase Bill — Add New Product</h3>
                <p className="text-[11px] text-muted-foreground">Fill product details to add directly to purchase bill</p>
              </div>
            </div>
          </div>
          <DialogHeader className="px-6 pb-2 sr-only">
            <DialogTitle>Add New Product</DialogTitle>
            <DialogDescription>Create a new product with size variants</DialogDescription>
          </DialogHeader>
          
          <div 
            className="flex-1 min-h-0 overflow-y-auto px-6 overscroll-contain"
            style={{ scrollBehavior: 'smooth' }}
            ref={(node) => {
              if (node && !node.dataset.scrollListenerAttached) {
                node.dataset.scrollListenerAttached = 'true';
                node.addEventListener('scroll', () => {
                  const btn = document.getElementById('product-dialog-back-to-top');
                  if (btn) {
                    btn.style.display = node.scrollTop > 200 ? 'flex' : 'none';
                  }
                });
                (window as any).__productDialogViewport = node;
              }
            }}
          >
            <div className="space-y-6 py-4 pb-8" data-product-form>
              {/* Product Type — Card Selector */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-2 flex-1">
                  {([
                    { value: 'goods' as ProductType, icon: '📦', label: 'Goods' },
                    { value: 'service' as ProductType, icon: '🔧', label: 'Service' },
                  ]).map(pt => (
                    <button
                      key={pt.value}
                      type="button"
                      onClick={() => {
                        const isService = pt.value === 'service';
                        setFormData({
                          ...formData,
                          product_type: pt.value as ProductType,
                          default_pur_price: isService ? 1 : formData.default_pur_price,
                          default_sale_price: isService ? 1 : formData.default_sale_price,
                          default_mrp: isService ? undefined : formData.default_mrp,
                        });
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-[1.5px] cursor-pointer transition-all duration-200 text-left ${
                        formData.product_type === pt.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-card hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm">{pt.icon}</span>
                      <span className={`text-xs font-bold ${formData.product_type === pt.value ? 'text-primary' : 'text-foreground'}`}>{pt.label}</span>
                    </button>
                  ))}
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
                        className="h-12 w-12 object-cover rounded-lg border shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/90 shadow-sm"
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
                      className="gap-1.5 font-semibold"
                    >
                      <ImagePlus className="h-4 w-4" />
                      Image
                    </Button>
                  )}
                </div>
              </div>

              {formData.product_type === 'service' && (
                <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
                  <span className="text-blue-500 text-sm mt-0.5">ℹ️</span>
                  <div className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                    <strong>Service Product:</strong> No size/stock tracking. Sale price defaults to ₹1 — actual price is entered at sale/POS time.
                    Barcode can be auto-generated or type a custom code (e.g. 501, 502, GARMENT1).
                  </div>
                </div>
              )}

              {/* ── 📋 Product Details ────────────────────────── */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-sm">📋</span>
                <span className="text-[13px] font-bold text-foreground font-outfit">Product Details</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="product_name">{getFieldLabel("product_name", "Product Name")} *</Label>
                    <Input
                      ref={productNameInputRef}
                      id="product_name"
                      value={formData.product_name}
                      onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                      onKeyDown={handleEnterAsTab}
                      placeholder={lastProductNameHint}
                    />
                </div>

                {isFieldEnabled("category") && (
                  <div className="space-y-2">
                    <Label htmlFor="category">{getFieldLabel("category", "Category")}</Label>
                    <div className="relative">
                      <Input
                        id="category"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        onKeyDown={handleEnterAsTab}
                        placeholder="Category"
                        list="category-list"
                        autoComplete="off"
                      />
                      <datalist id="category-list">
                        {categories.map((cat) => (
                          <option key={cat} value={cat} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                )}

                {isFieldEnabled("brand") && (
                  <div className="space-y-2">
                    <Label htmlFor="brand">{getFieldLabel("brand", "Brand")}</Label>
                    <div className="relative">
                      <Input
                        id="brand"
                        value={formData.brand}
                        onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                        onKeyDown={handleEnterAsTab}
                        placeholder="Brand"
                        list="brand-list"
                        autoComplete="off"
                      />
                      <datalist id="brand-list">
                        {brands.map((brand) => (
                          <option key={brand} value={brand} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                )}

                {isFieldEnabled("style") && (
                  <div className="space-y-2">
                    <Label htmlFor="style">{getFieldLabel("style", "Style")}</Label>
                    <div className="relative">
                      <Input
                        id="style"
                        value={formData.style}
                        onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                        onKeyDown={handleEnterAsTab}
                        placeholder="Style"
                        list="style-list"
                        autoComplete="off"
                      />
                      <datalist id="style-list">
                        {styles.map((style) => (
                          <option key={style} value={style} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                )}

                {isFieldEnabled("hsn_code") && (
                <div className="space-y-2">
                  <Label htmlFor="hsn_code">{getFieldLabel("hsn_code", "HSN Code")}</Label>
                  <div className="relative">
                      <Input
                        id="hsn_code"
                        value={formData.hsn_code}
                        onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                        onKeyDown={handleEnterAsTab}
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
                </div>
                )}

                {isColumnVisible('product_entry', 'pur_gst') && (
                <div className="space-y-2">
                  <Label htmlFor="purchase_gst" className="text-blue-600 dark:text-blue-400">Purchase GST %</Label>
                  <Select
                    value={formData.purchase_gst_percent.toString()}
                    onValueChange={(value) => {
                      const val = parseInt(value);
                      setFormData(prev => ({
                        ...prev,
                        purchase_gst_percent: val,
                        gst_per: val,
                      }));
                    }}
                  >
                    <SelectTrigger id="purchase_gst_percent" ref={purGstRef} className="border-blue-200 dark:border-blue-800"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && cursorAfterStyle === 'hsn') {
                          e.preventDefault();
                          saleGstRef.current?.focus();
                        }
                      }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 5, 12, 18, 28].map((rate) => (
                        <SelectItem key={rate} value={rate.toString()}>{rate}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                )}

                {isColumnVisible('product_entry', 'sale_gst') && (
                <div className="space-y-2">
                  <Label htmlFor="sale_gst" className="text-green-600 dark:text-green-400">Sale GST %</Label>
                  {formData.purchase_gst_percent !== formData.sale_gst_percent && (
                    <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      ≠ Purchase
                    </span>
                  )}
                  <Select
                    value={formData.sale_gst_percent.toString()}
                    onValueChange={(value) =>
                      setFormData(prev => ({ ...prev, sale_gst_percent: parseInt(value) }))
                    }
                  >
                    <SelectTrigger id="sale_gst_percent" ref={saleGstRef} className="border-green-200 dark:border-green-800"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && cursorAfterStyle === 'hsn') {
                          e.preventDefault();
                          document.getElementById("default_pur_price")?.focus();
                        }
                      }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 5, 12, 18, 28].map((rate) => (
                        <SelectItem key={rate} value={rate.toString()}>{rate}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="uom">Unit (UOM)</Label>
                  <Select
                    value={formData.uom}
                    onValueChange={(value) => setFormData({ ...formData, uom: value })}
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

                <div className="space-y-2">
                  <Label htmlFor="default_pur_price">Purchase Price <span className="text-destructive">*</span></Label>
                  <CalculatorInput
                    id="default_pur_price"
                    value={formData.default_pur_price ?? ""}
                    onChange={(val) => {
                      const purPrice = val || undefined;
                      const updates: Partial<typeof formData> = { default_pur_price: purPrice };
                      if (purPrice && purPrice > 0 && markupPercent !== "") {
                        const mk = parseFloat(markupPercent);
                        if (!isNaN(mk)) {
                          updates.default_sale_price = Math.round(purPrice * (1 + mk / 100));
                        }
                      }
                      setFormData({ ...formData, ...updates });
                    }}
                    onKeyDown={handleEnterAsTab}
                    placeholder="0"
                  />
                </div>

                {isColumnVisible('product_entry', 'markup') && (
                <div className="space-y-2">
                  <Label htmlFor="markup_percent" className="text-xs">Markup %</Label>
                  <Input
                    id="markup_percent"
                    type="number"
                    step="0.01"
                    value={markupPercent}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMarkupPercent(val);
                      const mk = parseFloat(val);
                      const purPrice = formData.default_pur_price;
                      if (!isNaN(mk) && purPrice && purPrice > 0) {
                        setFormData({ ...formData, default_sale_price: Math.round(purPrice * (1 + mk / 100)) });
                      }
                    }}
                    onKeyDown={handleEnterAsTab}
                    placeholder="%"
                    className="h-11"
                  />
                </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="default_sale_price">Sale Price <span className="text-destructive">*</span></Label>
                  <CalculatorInput
                    id="default_sale_price"
                    value={formData.default_sale_price ?? ""}
                    onChange={(val) => {
                      const salePrice = val || undefined;
                      setFormData({ ...formData, default_sale_price: salePrice });
                      const purPrice = formData.default_pur_price;
                      if (salePrice && salePrice > 0 && purPrice && purPrice > 0) {
                        setMarkupPercent((((salePrice - purPrice) / purPrice) * 100).toFixed(2));
                      } else {
                        setMarkupPercent("");
                      }
                    }}
                    onKeyDown={handleEnterAsTab}
                    placeholder="0"
                  />
                </div>

                {showMrp && (
                  <div className="space-y-2">
                    <Label htmlFor="default_mrp">MRP <span className="text-destructive">*</span></Label>
                    <CalculatorInput
                      id="default_mrp"
                      value={formData.default_mrp ?? ""}
                      onChange={(val) => setFormData({ ...formData, default_mrp: val || undefined })}
                      onKeyDown={handleEnterAsTab}
                      placeholder="MRP"
                    />
                  </div>
                )}

                {showDiscountFields && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Pur Disc %</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={formData.default_pur_discount ?? ""}
                      onChange={(e) => setFormData({
                        ...formData,
                        default_pur_discount: e.target.value ? Number(e.target.value) : undefined
                      })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const form = e.currentTarget.closest("form") || e.currentTarget.closest("[role='dialog']");
                          if (form) {
                            const inputs = Array.from(form.querySelectorAll("input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled])"));
                            const idx = inputs.indexOf(e.currentTarget);
                            if (idx >= 0 && idx < inputs.length - 1) {
                              (inputs[idx + 1] as HTMLElement).focus();
                            }
                          }
                        }
                      }}
                      className="h-9 text-sm"
                    />
                  </div>
                )}

                {showDiscountFields && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Sale Disc %</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={formData.default_sale_discount ?? ""}
                      onChange={(e) => setFormData({
                        ...formData,
                        default_sale_discount: e.target.value ? Number(e.target.value) : undefined
                      })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const form = e.currentTarget.closest("form") || e.currentTarget.closest("[role='dialog']");
                          if (form) {
                            const inputs = Array.from(form.querySelectorAll("input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled])"));
                            const idx = inputs.indexOf(e.currentTarget);
                            if (idx >= 0 && idx < inputs.length - 1) {
                              (inputs[idx + 1] as HTMLElement).focus();
                            }
                          }
                        }
                      }}
                      className="h-9 text-sm"
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
                      onChange={(e) => {
                        const val = e.target.value;
                        setColorInput(val);
                        // Auto-parse on comma/tab: extract finished colors
                        if (val.endsWith(',') || val.endsWith(', ')) {
                          const parts = val.split(',').map(c => c.trim()).filter(c => c);
                          const uniqueNew = parts.filter(c => !formData.colors.includes(c));
                          if (uniqueNew.length > 0) {
                            setFormData(prev => ({ ...prev, colors: [...prev.colors, ...uniqueNew] }));
                          }
                          setColorInput('');
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Tab") {
                          if (colorInput.trim()) {
                            e.preventDefault();
                            handleAddColor();
                          }
                        }
                        // Backspace on empty input removes last color
                        if (e.key === "Backspace" && !colorInput && formData.colors.length > 0) {
                          handleRemoveColor(formData.colors[formData.colors.length - 1]);
                        }
                      }}
                      placeholder={formData.colors.length > 0 ? "Add more colors..." : "e.g., Black, White, Red"}
                      className="flex-1"
                      list="color-list"
                      autoComplete="off"
                    />
                    <datalist id="color-list">
                      {existingColors.filter(c => !formData.colors.includes(c)).map((color) => (
                        <option key={color} value={color} />
                      ))}
                    </datalist>
                    <Button type="button" variant="secondary" onClick={handleAddColor}>
                      Add
                    </Button>
                  </div>
                  {formData.colors.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {formData.colors.map((color, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20 shrink-0">
                            {color}
                            <button
                              type="button"
                              onClick={() => handleRemoveColor(color)}
                              className="hover:text-destructive hover:bg-destructive/10 rounded-full p-0.5 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                          {rollWiseMtrEnabled && formData.uom === 'MTR' && (
                            <Input
                              value={colorRollLengths[color] || ""}
                              onChange={(e) => setColorRollLengths(prev => ({ ...prev, [color]: e.target.value }))}
                              placeholder="Roll lengths e.g. 75,80,85,90"
                              className="h-8 text-xs flex-1"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Mobile ERP: Quantity input - triggers IMEI scan when qty > 1 */}
              {mobileERPMode?.locked_size_qty && hideOpeningQty && (
                <div className="space-y-2">
                  <Label className="font-semibold">Quantity</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={1}
                      value={mobileERPQty}
                      onChange={(e) => {
                        const val = Math.max(1, parseInt(e.target.value) || 1);
                        setMobileERPQty(val);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const qty = mobileERPQty;
                          if (qty > 1) {
                            const color = formData.colors.length > 0 ? formData.colors[0] : "";
                            setImeiScanColor(color);
                            setImeiScanOpen(true);
                          }
                        }
                      }}
                      className="w-24 h-9 text-center font-bold text-lg"
                      placeholder="1"
                    />
                    {mobileERPQty > 1 && (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                        onClick={() => {
                          const color = formData.colors.length > 0 ? formData.colors[0] : "";
                          setImeiScanColor(color);
                          setImeiScanOpen(true);
                        }}
                      >
                        Scan {mobileERPQty} IMEI
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {mobileERPQty === 1 ? "Single unit — scan IMEI below" : `${mobileERPQty} units — click to scan IMEIs`}
                    </span>
                  </div>
                </div>
              )}

              {formData.product_type !== 'service' && !mobileERPMode?.locked_size_qty && !(rollWiseMtrEnabled && formData.uom === 'MTR') && (
                <div className="space-y-2">
                  <Label>Size Group</Label>
                  <div className="flex gap-2">
                    <Select
                      value={formData.size_group_id}
                      onValueChange={(value) => {
                        setFormData({ ...formData, size_group_id: value });
                        const group = sizeGroups.find(g => g.id === value);
                        setSelectedSizes(group ? [...group.sizes] : []);
                        // Clear variants so useEffect regenerates them for new group
                        if (hideOpeningQty) {
                          setVariants([]);
                          setShowVariants(false);
                        }
                      }}
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

                  {/* Size Selection Checkboxes / Qty Grid */}
                  {formData.size_group_id && (() => {
                    const group = sizeGroups.find(g => g.id === formData.size_group_id);
                    if (!group || group.sizes.length === 0) return null;
                    const allSelected = selectedSizes.length === group.sizes.length;

                    // Purchase context: show qty inputs per size (or color×size matrix)
                    if (hideOpeningQty) {
                      const allSizes = [...group.sizes, ...customSizes];
                      const enabledSizes = allSizes.filter(s => !disabledSizes.has(s));
                      const totalQty = variants.reduce((sum, v) => sum + (v.purchase_qty || 0), 0);
                      const activeSizeCount = variants.filter(v => (v.purchase_qty || 0) > 0).length;
                      const colorsToUse = formData.colors.length > 0 ? formData.colors : [""];
                      const isMultiColor = colorsToUse.length > 1;

                      // Helper to find next enabled size for keyboard nav
                      const getNextEnabledSize = (currentIdx: number) => {
                        for (let i = currentIdx + 1; i < allSizes.length; i++) {
                          if (!disabledSizes.has(allSizes[i])) return allSizes[i];
                        }
                        return null;
                      };

                      return (
                        <div className="space-y-2 mt-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">
                              Size-wise Quantity
                            </span>
                            <span className="text-sm text-muted-foreground">
                              Total: {totalQty} pcs · {activeSizeCount} sizes
                            </span>
                          </div>

                          {isMultiColor ? (
                            /* ── Color × Size Matrix ── */
                            <div className="overflow-x-auto p-2 bg-muted/30 rounded-lg border border-dashed border-muted-foreground/20">
                              <table className="w-full border-collapse">
                                <thead>
                                  <tr>
                                    <th className="text-xs font-bold text-foreground px-1.5 py-1 text-left sticky left-0 bg-muted/30 z-10 min-w-[70px]">Color</th>
                                    {allSizes.map(size => (
                                      <th key={size} className="px-0.5 py-1 text-center min-w-[52px]">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setDisabledSizes(prev => {
                                              const next = new Set(prev);
                                              if (next.has(size)) next.delete(size); else next.add(size);
                                              return next;
                                            });
                                          }}
                                          className={cn(
                                            "text-xs font-bold px-1.5 py-0.5 rounded transition-colors",
                                            disabledSizes.has(size)
                                              ? "text-muted-foreground/40 line-through bg-muted/50"
                                              : "text-muted-foreground hover:text-primary"
                                          )}
                                        >
                                          {disabledSizes.has(size) ? '✕' : '✓'} {size === 'Free' ? 'Qty' : size}
                                        </button>
                                      </th>
                                    ))}
                                    <th className="text-xs font-bold text-primary px-1.5 py-1 text-center min-w-[44px]">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {colorsToUse.map((color, cIdx) => {
                                    const colorTotal = variants
                                      .filter(v => v.color === color && !disabledSizes.has(v.size))
                                      .reduce((sum, v) => sum + (v.purchase_qty || 0), 0);
                                    return (
                                      <tr key={color} className={cIdx % 2 === 1 ? "bg-muted/40" : ""}>
                                        <td className="text-xs font-bold text-foreground px-1.5 py-1 sticky left-0 z-10" style={{ backgroundColor: cIdx % 2 === 1 ? 'hsl(var(--muted) / 0.4)' : 'hsl(var(--muted) / 0.3)' }}>
                                          {color}
                                        </td>
                                        {allSizes.map((size) => {
                                          const sIdx = allSizes.indexOf(size);
                                          const isDisabled = disabledSizes.has(size);
                                          const variant = variants.find(v => v.size === size && v.color === color);
                                          const qty = variant?.purchase_qty || 0;
                                          return (
                                            <td key={size} className="px-0.5 py-0.5 text-center">
                                              {isDisabled ? (
                                                <span className="text-muted-foreground/30 text-xs">—</span>
                                              ) : (
                                                <Input
                                                  type="number"
                                                  min="0"
                                                  value={qty === 0 ? '' : qty}
                                                  placeholder="0"
                                                  onChange={(e) => {
                                                    const val = parseInt(e.target.value) || 0;
                                                    setVariants(prev => prev.map(v =>
                                                      v.size === size && v.color === color
                                                        ? { ...v, purchase_qty: val }
                                                        : v
                                                    ));
                                                  }}
                                                  onFocus={(e) => e.target.select()}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                                                      e.preventDefault();
                                                      const nextSize = getNextEnabledSize(sIdx);
                                                      if (nextSize) {
                                                        document.getElementById(`size-qty-${color}-${nextSize}`)?.focus();
                                                      } else {
                                                        const nextColor = colorsToUse[cIdx + 1];
                                                        if (nextColor) {
                                                          const firstEnabled = allSizes.find(s => !disabledSizes.has(s));
                                                          if (firstEnabled) document.getElementById(`size-qty-${nextColor}-${firstEnabled}`)?.focus();
                                                        } else {
                                                          const firstPur = document.getElementById('variant-pur-price-0');
                                                          if (firstPur) {
                                                            firstPur.focus();
                                                          } else {
                                                            document.getElementById('btn-add-all-sizes')?.focus();
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }}
                                                  id={`size-qty-${color}-${size}`}
                                                  className={cn(
                                                    "h-7 w-14 text-center text-sm font-semibold p-0.5 no-uppercase",
                                                    qty > 0 && "border-emerald-400 text-emerald-800"
                                                  )}
                                                />
                                              )}
                                            </td>
                                          );
                                        })}
                                        <td className="text-xs font-bold text-primary px-1.5 py-1 text-center">
                                          {colorTotal > 0 ? colorTotal : ''}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                              {totalQty > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-muted-foreground/10">
                                  {colorsToUse.map(color => {
                                    const ct = variants.filter(v => v.color === color && !disabledSizes.has(v.size)).reduce((s, v) => s + (v.purchase_qty || 0), 0);
                                    if (ct === 0) return null;
                                    return (
                                      <span key={color} className="text-xs font-medium text-muted-foreground">
                                        {color}: <span className="font-bold text-foreground">{ct}</span>
                                      </span>
                                    );
                                  })}
                                  <span className="text-xs font-bold text-primary ml-auto">
                                    Grand Total: {totalQty}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            /* ── Single color / no color: single-row grid with toggle ── */
                            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2.5 p-4 bg-muted/30 rounded-lg border border-dashed border-muted-foreground/20">
                              {allSizes.map((size) => {
                                const sIdx = allSizes.indexOf(size);
                                const isDisabled = disabledSizes.has(size);
                                const isCustom = customSizes.includes(size);
                                const variant = variants.find(v => v.size === size && v.color === (formData.colors[0] || ""));
                                const qty = variant?.purchase_qty || 0;
                                return (
                                  <div
                                    key={size}
                                    className={cn(
                                      "flex flex-col items-center gap-2 p-3 rounded-lg border-[1.5px] transition-colors relative",
                                      isDisabled
                                        ? "bg-muted/50 border-border/50 opacity-50"
                                        : qty > 0
                                          ? "bg-emerald-50 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-700"
                                          : "bg-card border-border hover:border-violet-300"
                                    )}
                                  >
                                    {/* Toggle button on size label */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDisabledSizes(prev => {
                                          const next = new Set(prev);
                                          if (next.has(size)) next.delete(size); else next.add(size);
                                          return next;
                                        });
                                      }}
                                      className={cn(
                                        "text-sm font-bold flex items-center gap-1 cursor-pointer transition-colors tracking-wide",
                                        isDisabled
                                          ? "text-muted-foreground/40 line-through"
                                          : qty > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                                      )}
                                    >
                                      {isDisabled ? (
                                        <X className="h-3.5 w-3.5 text-muted-foreground/40" />
                                      ) : (
                                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                                      )}
                                      {size === 'Free' ? 'Qty' : size}
                                    </button>
                                    {/* Remove custom size */}
                                    {isCustom && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCustomSizes(prev => prev.filter(s => s !== size));
                                          setVariants(prev => prev.filter(v => v.size !== size));
                                          setDisabledSizes(prev => { const n = new Set(prev); n.delete(size); return n; });
                                        }}
                                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/80 shadow-sm"
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    )}
                                    {!isDisabled ? (
                                      <Input
                                        type="number"
                                        min="0"
                                        value={qty === 0 ? '' : qty}
                                        placeholder="0"
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value) || 0;
                                          setVariants(prev => {
                                            const exists = prev.some(v => v.size === size && v.color === (formData.colors[0] || ""));
                                            if (exists) {
                                              return prev.map(v =>
                                                v.size === size && v.color === (formData.colors[0] || "")
                                                  ? { ...v, purchase_qty: val }
                                                  : v
                                              );
                                            }
                                            // Add variant for custom size
                                            return [...prev, {
                                              color: formData.colors[0] || "",
                                              size,
                                              pur_price: formData.default_pur_price ?? 0,
                                              sale_price: formData.default_sale_price ?? 0,
                                              mrp: formData.default_mrp ?? null,
                                              barcode: "",
                                              active: true,
                                              opening_qty: 0,
                                              purchase_qty: val,
                                            }];
                                          });
                                        }}
                                        onFocus={(e) => e.target.select()}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                                            e.preventDefault();
                                            const nextSize = getNextEnabledSize(sIdx);
                                            if (nextSize) {
                                              document.getElementById(`size-qty-${nextSize}`)?.focus();
                                            } else {
                                              // Focus first variant's pur_price for review, otherwise Add button
                                              const firstPur = document.getElementById('variant-pur-price-0');
                                              if (firstPur) {
                                                firstPur.focus();
                                              } else {
                                                document.getElementById('btn-add-all-sizes')?.focus();
                                              }
                                            }
                                          }
                                        }}
                                        id={`size-qty-${size}`}
                                        className={cn(
                                          "h-9 w-16 text-center text-base font-bold p-1 no-uppercase",
                                          qty > 0 && "border-emerald-400 text-emerald-800"
                                        )}
                                      />
                                    ) : (
                                      <span className="h-9 w-16 flex items-center justify-center text-muted-foreground/30 text-sm">—</span>
                                    )}
                                    {!isDisabled && (
                                      <div className="flex flex-col items-center w-full">
                                        <span className="text-[9px] text-muted-foreground font-medium mb-0.5 tracking-wide uppercase">Sale ₹</span>
                                        <Input
                                          type="number"
                                          min="0"
                                          step="1"
                                          tabIndex={-1}
                                          value={(() => {
                                            const v = variants.find(vv => vv.size === size && vv.color === (formData.colors[0] || ""));
                                            const sp = v?.sale_price;
                                            return (sp !== undefined && sp !== null && sp > 0) ? sp : '';
                                          })()}
                                          placeholder={formData.default_sale_price ? String(formData.default_sale_price) : "0"}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 0;
                                            setVariants(prev => prev.map(v =>
                                              v.size === size && v.color === (formData.colors[0] || "")
                                                ? { ...v, sale_price: val }
                                                : v
                                            ));
                                          }}
                                          className={cn(
                                            "h-7 w-16 text-center text-xs font-semibold p-0.5 no-uppercase",
                                            (() => {
                                              const v = variants.find(vv => vv.size === size && vv.color === (formData.colors[0] || ""));
                                              return v?.sale_price && v.sale_price > 0 ? "border-blue-300 text-blue-800" : "";
                                            })()
                                          )}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* + Add Custom Size */}
                          <div className="flex items-center gap-2 mt-1">
                            <Input
                              value={customSizeInput}
                              onChange={(e) => setCustomSizeInput(e.target.value.toUpperCase())}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && customSizeInput.trim()) {
                                  e.preventDefault();
                                  const newSize = customSizeInput.trim();
                                  if (!allSizes.includes(newSize)) {
                                    setCustomSizes(prev => [...prev, newSize]);
                                    // Add variant for this custom size
                                    const colorsForVariant = formData.colors.length > 0 ? formData.colors : [""];
                                    setVariants(prev => [
                                      ...prev,
                                      ...colorsForVariant.map(color => ({
                                        color,
                                        size: newSize,
                                        pur_price: formData.default_pur_price ?? 0,
                                        sale_price: formData.default_sale_price ?? 0,
                                        mrp: formData.default_mrp ?? null,
                                        barcode: "",
                                        active: true,
                                        opening_qty: 0,
                                        purchase_qty: 0,
                                      }))
                                    ]);
                                  }
                                  setCustomSizeInput("");
                                }
                              }}
                              placeholder="Custom size (e.g. 3XL)"
                              className="h-7 w-36 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (!customSizeInput.trim()) return;
                                const newSize = customSizeInput.trim().toUpperCase();
                                if (!allSizes.includes(newSize)) {
                                  setCustomSizes(prev => [...prev, newSize]);
                                  const colorsForVariant = formData.colors.length > 0 ? formData.colors : [""];
                                  setVariants(prev => [
                                    ...prev,
                                    ...colorsForVariant.map(color => ({
                                      color,
                                      size: newSize,
                                      pur_price: formData.default_pur_price ?? 0,
                                      sale_price: formData.default_sale_price ?? 0,
                                      mrp: formData.default_mrp ?? null,
                                      barcode: "",
                                      active: true,
                                      opening_qty: 0,
                                      purchase_qty: 0,
                                    }))
                                  ]);
                                }
                                setCustomSizeInput("");
                              }}
                              className="text-xs font-medium text-primary hover:underline flex items-center gap-0.5"
                            >
                              <Plus className="h-3 w-3" /> Add Size
                            </button>
                          </div>

                          {/* Active sizes preview */}
                          {activeSizeCount > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {variants.filter(v => (v.purchase_qty || 0) > 0 && !disabledSizes.has(v.size)).map(v => (
                                <span
                                  key={`${v.color}-${v.size}`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-full"
                                >
                                  {v.color ? `${v.color}-` : ''}{v.size} × {v.purchase_qty}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Non-purchase context: show checkboxes as before
                    return (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedSizes(allSelected ? [] : [...group.sizes])}
                          className="text-xs font-medium text-primary hover:underline px-1"
                        >
                          {allSelected ? "None" : "All"}
                        </button>
                        {group.sizes.map(size => {
                          const isChecked = selectedSizes.includes(size);
                          return (
                            <button
                              key={size}
                              type="button"
                              onClick={() => setSelectedSizes(prev =>
                                isChecked ? prev.filter(s => s !== size) : [...prev, size]
                              )}
                              className={cn(
                                "px-2 py-0.5 rounded border text-xs font-medium transition-colors",
                                isChecked
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-muted text-muted-foreground border-border hover:border-primary/50"
                              )}
                            >
                              {isChecked ? "✓ " : ""}{size}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Roll-wise MTR info banner */}
              {rollWiseMtrEnabled && formData.uom === 'MTR' && (
                 <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-800 p-3">
                  <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                    📏 Roll-wise MTR mode: Enter comma-separated roll lengths (e.g. 75,80,85) next to each color above, then click "Generate Color Variants".
                  </p>
                </div>
              )}

              {/* ── 👟 Size Variants ────────────────────────── */}
              <div className="rounded-xl border-[1.5px] border-violet-200 bg-gradient-to-br from-violet-50/60 via-purple-50/30 to-fuchsia-50/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-sm">
                      <span className="text-white text-sm">👟</span>
                    </div>
                    <div>
                      <span className="text-[13px] font-bold text-violet-800 font-outfit">
                        {rollWiseMtrEnabled && formData.uom === 'MTR' ? 'Color Variants' : 'Size Variants'}
                      </span>
                      <p className="text-[10px] text-violet-500/80 font-outfit">
                        {rollWiseMtrEnabled && formData.uom === 'MTR' ? 'Generate color-wise roll entries' : 'Generate size-wise entries'}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={handleGenerateSizeVariants}
                    disabled={formData.product_type !== 'service' && !(rollWiseMtrEnabled && formData.uom === 'MTR') && !formData.size_group_id}
                    className="gap-1.5 font-outfit font-semibold bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
                    size="sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {rollWiseMtrEnabled && formData.uom === 'MTR' ? 'Generate Color Variants' : 'Generate Variants'}
                  </Button>
                </div>

                {showVariants && variants.length > 0 && (
                  <div ref={variantsSectionRef} className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold text-violet-700 font-outfit flex items-center gap-2">
                        {(() => {
                          const visibleCount = variants.filter(v => {
                            if (disabledSizes.has(v.size)) return false;
                            if (formData.colors.length > 0 && v.color && !formData.colors.includes(v.color)) return false;
                            if (hideOpeningQty && (v.purchase_qty || 0) <= 0) return false;
                            return true;
                          }).length;
                          return `${visibleCount} Variant${visibleCount !== 1 ? 's' : ''}`;
                        })()}
                        {isAutoBarcode ? (
                          <span className="text-xs font-medium px-2 py-0.5 bg-blue-100 text-blue-700 rounded">Auto Barcode</span>
                        ) : (
                          <span className="text-xs font-medium px-2 py-0.5 bg-orange-100 text-orange-700 rounded">Scan / Manual</span>
                        )}
                      </Label>
                      {isAutoBarcode && (
                        <Button type="button" variant="outline" size="sm" onClick={handleAutoGenerateBarcodes} className="gap-1.5 h-8 text-xs border-violet-300 text-violet-700 hover:bg-violet-100/60 font-outfit">
                          <Barcode className="h-3 w-3" /> 🔄 Regenerate Barcodes
                        </Button>
                      )}
                    </div>
                    <div className="border border-violet-200/60 rounded-lg overflow-x-auto bg-white shadow-sm max-h-[360px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-background">
                          <TableRow className="bg-gradient-to-r from-violet-100/80 to-purple-100/60 border-b border-violet-200/60">
                            {formData.colors.length > 0 && <TableHead className="text-[13px] py-3 font-bold text-violet-700 font-outfit">Color</TableHead>}
                            <TableHead className="text-[13px] py-3 font-bold text-violet-700 font-outfit">Size</TableHead>
                            <TableHead className="text-[13px] py-3 font-bold text-amber-700 font-outfit bg-amber-50/50">Pur Price<span className="text-destructive ml-0.5">*</span></TableHead>
                            <TableHead className="text-[13px] py-3 font-bold text-emerald-700 font-outfit bg-emerald-50/50">Sale Price<span className="text-destructive ml-0.5">*</span></TableHead>
                            {showMrp && <TableHead className="text-[13px] py-3 font-bold text-blue-700 font-outfit bg-blue-50/50">MRP<span className="text-destructive ml-0.5">*</span></TableHead>}
                            <TableHead className="text-[13px] py-3 font-bold text-violet-700 font-outfit">{mobileERPMode?.enabled ? 'IMEI Number' : 'Barcode'}<span className="text-destructive ml-0.5">*</span></TableHead>
                            {!hideOpeningQty && <TableHead className="text-[13px] py-3 font-bold text-violet-700 font-outfit">Qty</TableHead>}
                            <TableHead className="text-[13px] py-3 font-bold text-violet-700 font-outfit text-center">Active</TableHead>
                            <TableHead className="text-[13px] py-3 w-8"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {variants.map((variant, index) => {
                            // Hide variants for disabled sizes, removed colors, or qty=0 in purchase context
                            if (disabledSizes.has(variant.size)) return null;
                            if (formData.colors.length > 0 && variant.color && !formData.colors.includes(variant.color)) return null;
                            if (hideOpeningQty && formData.product_type !== 'service' && (variant.purchase_qty || 0) <= 0) return null;
                            return (
                            <TableRow key={index} className="hover:bg-violet-50/30 transition-colors">
                              {formData.colors.length > 0 && (
                                <TableCell className="font-medium text-xs py-2.5">{variant.color || "-"}</TableCell>
                              )}
                              <TableCell className="py-2.5">
                                <span className={cn(
                                  "inline-flex items-center justify-center min-w-[40px] px-3 py-1 rounded-md text-sm font-bold font-outfit tracking-wide",
                                  mobileERPMode?.locked_size_qty ? "bg-purple-200 text-purple-900" : "bg-violet-100 text-violet-800"
                                )}>
                                  {variant.size}
                                </span>
                              </TableCell>
                              <TableCell className="py-2.5 bg-amber-50/20">
                                <CalculatorInput
                                  id={`variant-pur-price-${index}`}
                                  value={variant.pur_price || ""}
                                  onChange={(val) => handleVariantChange(index, "pur_price", val)}
                                  className={cn("w-28 h-9 text-sm border-amber-200", variant.pur_price > 0 && variant.sale_price > 0 && variant.pur_price > variant.sale_price && "border-destructive bg-destructive/5")}
                                  placeholder="0"
                                />
                                {variant.pur_price > 0 && variant.sale_price > 0 && variant.pur_price > variant.sale_price && (
                                  <span className="text-[10px] text-destructive font-semibold mt-0.5 block">Pur &gt; Sale!</span>
                                )}
                              </TableCell>
                              <TableCell className="py-2.5 bg-emerald-50/20">
                                <CalculatorInput
                                  value={variant.sale_price || ""}
                                  onChange={(val) => handleVariantChange(index, "sale_price", val)}
                                  className={cn("w-28 h-9 text-sm border-emerald-200", variant.pur_price > 0 && variant.sale_price > 0 && variant.pur_price > variant.sale_price && "border-destructive bg-destructive/5")}
                                  placeholder="0"
                                />
                              </TableCell>
                              {showMrp && (
                                <TableCell className="py-2.5 bg-blue-50/20">
                                  <CalculatorInput
                                    value={variant.mrp ?? ""}
                                    onChange={(val) => handleVariantChange(index, "mrp", val || null)}
                                    className="w-28 h-9 text-sm border-blue-200"
                                  />
                                </TableCell>
                              )}
                              <TableCell className="py-2.5">
                                <Input
                                  value={variant.barcode}
                                  onChange={(e) => handleVariantChange(index, "barcode", e.target.value)}
                                  className={cn(
                                    "w-36 h-9 text-sm font-mono border-violet-200",
                                    mobileERPMode?.enabled && "tracking-wider"
                                  )}
                                  placeholder={mobileERPMode?.enabled ? "Scan IMEI..." : "Barcode"}
                                />
                                {mobileERPMode?.enabled && variant.barcode && (() => {
                                  const cleaned = variant.barcode.replace(/\s/g, '');
                                  const isValid = /^[a-zA-Z0-9\-_.\/]+$/.test(cleaned) && cleaned.length >= (mobileERPMode.imei_min_length || 4) && cleaned.length <= (mobileERPMode.imei_max_length || 25);
                                  if (!isValid && cleaned.length > 0) {
                                    return <span className="text-[10px] text-amber-600 font-semibold mt-0.5 block">Need {mobileERPMode.imei_min_length}-{mobileERPMode.imei_max_length} chars</span>;
                                  }
                                  return null;
                                })()}
                              </TableCell>
                              {!hideOpeningQty && (
                                <TableCell className="py-2.5">
                                  <Input
                                    type="number"
                                    value={variant.opening_qty || ""}
                                    onChange={(e) => handleVariantChange(index, "opening_qty", e.target.value === "" ? 0 : Number(e.target.value))}
                                    className="w-20 h-9 text-sm"
                                    placeholder="0"
                                  />
                                </TableCell>
                              )}
                              <TableCell className="text-center py-2.5">
                                <Switch
                                  checked={variant.active}
                                  onCheckedChange={(checked) => handleVariantChange(index, "active", checked)}
                                  className="h-4 w-7"
                                />
                              </TableCell>
                              <TableCell className="py-2.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                                  onClick={() => setVariants(variants.filter((_, i) => i !== index))}
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
            </div>
            </div>
            <button
              id="product-dialog-back-to-top"
              type="button"
              style={{ display: 'none' }}
              className="sticky bottom-2 left-full ml-auto flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium shadow-lg hover:bg-primary/90 transition-all z-20"
              onClick={() => {
                const vp = (window as any).__productDialogViewport as HTMLElement | null;
                vp?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <ChevronUp className="h-3 w-3" />
              Product Details
            </button>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex-shrink-0">
            {hideOpeningQty && (
              <span className="text-sm text-muted-foreground mr-auto">
                {(() => {
                  const activeVariants = variants.filter(v => 
                    !disabledSizes.has(v.size) && 
                    (formData.colors.length === 0 || !v.color || formData.colors.includes(v.color)) &&
                    (v.purchase_qty || 0) > 0
                  );
                  const totalQty = activeVariants.reduce((s, v) => s + (v.purchase_qty || 0), 0);
                  return totalQty > 0
                    ? `${activeVariants.length} sizes · ${totalQty} pcs`
                    : 'Enter qty per size above';
                })()}
              </span>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading} className="font-outfit font-semibold">
              Cancel
            </Button>
            <Button
              id="btn-add-all-sizes"
              onClick={handleSave}
              disabled={loading}
              className="gap-1.5 min-w-[140px] font-outfit font-semibold shadow-md hover:shadow-lg transition-all bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  ➕ {hideOpeningQty
                    ? `Add ${variants.filter(v => (v.purchase_qty || 0) > 0 && !disabledSizes.has(v.size) && (formData.colors.length === 0 || !v.color || formData.colors.includes(v.color))).length || ''} Sizes to Bill`
                    : 'Add to Bill'
                  }
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

      {/* Mobile ERP: IMEI Multi-Scan Dialog */}
      {mobileERPMode?.locked_size_qty && (
        <IMEIScanDialog
          open={imeiScanOpen}
          onClose={() => setImeiScanOpen(false)}
          quantity={mobileERPQty}
          productName={formData.product_name || "New Product"}
          minLength={mobileERPMode.imei_min_length || 15}
          maxLength={mobileERPMode.imei_max_length || 19}
          onConfirm={(imeiNumbers) => {
            // Create one variant per IMEI
            const newVariants: ProductVariant[] = imeiNumbers.map((imei, idx) => ({
              color: imeiScanColor,
              size: `IMEI-${idx + 1}`,
              pur_price: formData.default_pur_price ?? 0,
              sale_price: formData.default_sale_price ?? 0,
              mrp: formData.default_mrp ?? null,
              barcode: imei,
              active: true,
              opening_qty: 0,
              purchase_qty: 1,
            }));
            setVariants(newVariants);
            setShowVariants(true);
            setImeiScanOpen(false);
          }}
        />
      )}
    </>
  );
};
