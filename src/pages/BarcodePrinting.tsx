import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import JsBarcode from "jsbarcode";
import { Check, Save, Trash2, GripVertical, Eye, Download } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { encodePurchasePrice } from "@/utils/purchaseCodeEncoder";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";

interface LabelItem {
  sku_id: string;
  product_name: string;
  brand: string;
  category: string;
  color: string;
  style: string;
  size: string;
  sale_price: number;
  pur_price?: number;
  purchase_code?: string;
  barcode: string;
  bill_number: string;
  qty: number;
  supplier_code?: string;
}

interface SearchResult {
  id: string;
  product_name: string;
  brand: string;
  category: string;
  color: string;
  style: string;
  size: string;
  sale_price: number;
  barcode: string;
  stock_qty: number;
}

interface RecentBill {
  id: string;
  software_bill_no: string;
  supplier_name: string;
  bill_date: string;
}

interface CustomPreset {
  name: string;
  width: number;
  height: number;
  cols: number;
  rows: number;
  gap: number;
}

interface LabelFieldConfig {
  show: boolean;
  fontSize: number;
  bold: boolean;
}

interface LabelDesignConfig {
  brand: LabelFieldConfig;
  productName: LabelFieldConfig;
  color: LabelFieldConfig;
  style: LabelFieldConfig;
  size: LabelFieldConfig;
  price: LabelFieldConfig;
  barcode: LabelFieldConfig;
  barcodeText: LabelFieldConfig;
  billNumber: LabelFieldConfig;
  supplierCode: LabelFieldConfig;
  purchaseCode: LabelFieldConfig;
  fieldOrder: Array<keyof Omit<LabelDesignConfig, 'fieldOrder'>>;
}

interface DesignFormatPreset {
  name: string;
  format: DesignFormat;
  topOffset: number;
  leftOffset: number;
  bottomOffset: number;
  rightOffset: number;
  labelConfig: LabelDesignConfig;
}

interface LabelTemplate {
  name: string;
  config: LabelDesignConfig;
}

type SheetType = "novajet48" | "novajet40" | "novajet65" | "a4_12x4" | "custom";
type DesignFormat = "BT1" | "BT2" | "BT3" | "BT4";
type QuantityMode = "manual" | "lastPurchase" | "byBill";

const sheetPresets = {
  novajet48: { cols: 8, width: "33mm", height: "19mm", gap: "1mm" },
  novajet40: { cols: 5, width: "39mm", height: "35mm", gap: "1.5mm" },
  novajet65: { cols: 5, width: "38mm", height: "21mm", gap: "1mm" },
  a4_12x4: { cols: 4, width: "50mm", height: "24mm", gap: "1mm" },
  custom: { cols: 4, width: "50mm", height: "25mm", gap: "2mm" }, // default values
};

interface SortableFieldItemProps {
  fieldKey: keyof Omit<LabelDesignConfig, 'fieldOrder'>;
  labelConfig: LabelDesignConfig;
  setLabelConfig: React.Dispatch<React.SetStateAction<LabelDesignConfig>>;
}

function SortableFieldItem({ fieldKey, labelConfig, setLabelConfig }: SortableFieldItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fieldKey });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const fieldLabels: Record<keyof Omit<LabelDesignConfig, 'fieldOrder'>, string> = {
    brand: 'Brand Name',
    productName: 'Product Name',
    color: 'Color',
    style: 'Style',
    size: 'Size',
    price: 'Price (MRP)',
    barcode: 'Barcode Image',
    barcodeText: 'Barcode Number',
    billNumber: 'Bill Number',
    supplierCode: 'Supplier Code',
    purchaseCode: 'Purchase Code',
  };

  const field = labelConfig[fieldKey];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-3 border rounded bg-background"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      
      <div className="flex items-center gap-2 flex-1">
        <input
          type="checkbox"
          id={`show-${fieldKey}`}
          checked={field.show}
          onChange={(e) => {
            setLabelConfig(prev => ({
              ...prev,
              [fieldKey]: { ...prev[fieldKey], show: e.target.checked }
            }));
          }}
          className="h-4 w-4"
        />
        <Label htmlFor={`show-${fieldKey}`} className="cursor-pointer font-medium">
          {fieldLabels[fieldKey]}
        </Label>
      </div>
      
      {field.show && fieldKey !== 'barcode' && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="6"
            max="20"
            value={field.fontSize}
            onChange={(e) => {
              setLabelConfig(prev => ({
                ...prev,
                [fieldKey]: { ...prev[fieldKey], fontSize: parseInt(e.target.value) || 9 }
              }));
            }}
            className="w-16 h-8 text-xs"
            title="Font size"
          />
          <span className="text-xs text-muted-foreground">px</span>
          
          <Button
            size="sm"
            variant={field.bold ? "default" : "outline"}
            onClick={() => {
              setLabelConfig(prev => ({
                ...prev,
                [fieldKey]: { ...prev[fieldKey], bold: !prev[fieldKey].bold }
              }));
            }}
            className="h-8 px-2 text-xs font-bold"
            title="Toggle bold"
          >
            B
          </Button>
        </div>
      )}
    </div>
  );
}

export default function BarcodePrinting() {
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [labelItems, setLabelItems] = useState<LabelItem[]>([]);
  const [quantityMode, setQuantityMode] = useState<QuantityMode>("manual");
  const [billNumber, setBillNumber] = useState("");
  const [recentBills, setRecentBills] = useState<RecentBill[]>([]);
  const [sheetType, setSheetType] = useState<SheetType>("novajet48");
  const [designFormat, setDesignFormat] = useState<DesignFormat>("BT1");
  const [topOffset, setTopOffset] = useState(0);
  const [leftOffset, setLeftOffset] = useState(0);
  const [bottomOffset, setBottomOffset] = useState(0);
  const [rightOffset, setRightOffset] = useState(0);
  const [businessName, setBusinessName] = useState("SMART INVENTORY");
  
  // Auto-load default offsets when novajet40 is selected
  useEffect(() => {
    const sheetPresets: Record<string, { defaultTop?: number; defaultLeft?: number }> = {
      novajet40: { defaultTop: 2, defaultLeft: 1 },
    };
    
    const preset = sheetPresets[sheetType];
    if (preset && preset.defaultTop !== undefined && preset.defaultLeft !== undefined) {
      setTopOffset(preset.defaultTop);
      setLeftOffset(preset.defaultLeft);
    }
  }, [sheetType]);
  
  // Custom dimensions state
  const [customWidth, setCustomWidth] = useState(50);
  const [customHeight, setCustomHeight] = useState(25);
  const [customCols, setCustomCols] = useState(4);
  const [customRows, setCustomRows] = useState(12);
  const [customGap, setCustomGap] = useState(2);
  
  // Preset management state
  const [savedPresets, setSavedPresets] = useState<CustomPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [isEditingPreset, setIsEditingPreset] = useState(false);
  
  // Design format preset state
  const [savedDesignPresets, setSavedDesignPresets] = useState<DesignFormatPreset[]>([]);
  const [selectedDesignPreset, setSelectedDesignPreset] = useState<string>("");
  const [isDesignSaveDialogOpen, setIsDesignSaveDialogOpen] = useState(false);
  const [newDesignPresetName, setNewDesignPresetName] = useState("");
  const [isEditingDesignPreset, setIsEditingDesignPreset] = useState(false);
  
  // Label design customization state
  const [labelConfig, setLabelConfig] = useState<LabelDesignConfig>({
    brand: { show: true, fontSize: 8, bold: true },
    productName: { show: true, fontSize: 8, bold: true },
    color: { show: false, fontSize: 7, bold: false },
    style: { show: false, fontSize: 7, bold: false },
    size: { show: true, fontSize: 8, bold: false },
    price: { show: true, fontSize: 8, bold: true },
    barcode: { show: true, fontSize: 8, bold: false },
    barcodeText: { show: true, fontSize: 7, bold: false },
    billNumber: { show: false, fontSize: 6, bold: false },
    supplierCode: { show: true, fontSize: 7, bold: false },
    purchaseCode: { show: false, fontSize: 7, bold: false },
    fieldOrder: ['brand', 'productName', 'size', 'price', 'barcode', 'barcodeText', 'supplierCode', 'purchaseCode', 'billNumber', 'color', 'style'],
  });

  // Label template state
  const [savedLabelTemplates, setSavedLabelTemplates] = useState<LabelTemplate[]>([]);
  const [selectedLabelTemplate, setSelectedLabelTemplate] = useState<string>("");
  const [isLabelTemplateSaveDialogOpen, setIsLabelTemplateSaveDialogOpen] = useState(false);
  const [newLabelTemplateName, setNewLabelTemplateName] = useState("");
  const [isEditingLabelTemplate, setIsEditingLabelTemplate] = useState(false);
  const [showCustomizeFields, setShowCustomizeFields] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [purchaseCodeAlphabet, setPurchaseCodeAlphabet] = useState("ABCDEFGHIK");
  const [showPurchaseCode, setShowPurchaseCode] = useState(false);

  // Helper function to check if a template is the current default
  const getDefaultTemplateName = (): string | null => {
    try {
      const storedDefaultFormat = localStorage.getItem("barcode_default_format");
      if (storedDefaultFormat) {
        const defaultFormat = JSON.parse(storedDefaultFormat);
        return defaultFormat.defaultTemplate || null;
      }
    } catch (error) {
      console.error("Failed to read default template:", error);
    }
    return null;
  };

  const isTemplateDefault = (templateName: string): boolean => {
    return getDefaultTemplateName() === templateName;
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load saved presets from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("barcode_custom_presets");
    if (stored) {
      try {
        setSavedPresets(JSON.parse(stored));
      } catch (error) {
        console.error("Failed to load presets:", error);
      }
    }
    
    const storedDesignPresets = localStorage.getItem("barcode_design_presets");
    if (storedDesignPresets) {
      try {
        setSavedDesignPresets(JSON.parse(storedDesignPresets));
      } catch (error) {
        console.error("Failed to load design presets:", error);
      }
    }

    const storedLabelTemplates = localStorage.getItem("barcode_label_templates");
    if (storedLabelTemplates) {
      try {
        setSavedLabelTemplates(JSON.parse(storedLabelTemplates));
      } catch (error) {
        console.error("Failed to load label templates:", error);
      }
    }

    // Load default format if available
    const storedDefaultFormat = localStorage.getItem("barcode_default_format");
    if (storedDefaultFormat) {
      try {
        const defaultFormat = JSON.parse(storedDefaultFormat);
        
        // Check if default references a template
        if (defaultFormat.defaultTemplate) {
          const storedTemplates = localStorage.getItem("barcode_label_templates");
          if (storedTemplates) {
            const templates = JSON.parse(storedTemplates);
            const template = templates.find((t: LabelTemplate) => t.name === defaultFormat.defaultTemplate);
            
            if (template) {
              // Load template config
              const configWithBarcode = {
                ...template.config,
                barcode: { ...template.config.barcode, show: true },
                barcodeText: { ...template.config.barcodeText, show: true },
              };
              setLabelConfig(configWithBarcode);
              setSelectedLabelTemplate(template.name);
            } else {
              // Template was deleted, fall back to inline config if available
              if (defaultFormat.labelConfig) {
                const configWithBarcode = {
                  ...defaultFormat.labelConfig,
                  barcode: { ...defaultFormat.labelConfig.barcode, show: true },
                  barcodeText: { ...defaultFormat.labelConfig.barcodeText, show: true },
                };
                setLabelConfig(configWithBarcode);
              }
            }
          }
        } else if (defaultFormat.labelConfig) {
          // No template reference, load inline config
          const configWithBarcode = {
            ...defaultFormat.labelConfig,
            barcode: { ...defaultFormat.labelConfig.barcode, show: true },
            barcodeText: { ...defaultFormat.labelConfig.barcodeText, show: true },
          };
          setLabelConfig(configWithBarcode);
        }
        
        // Always load sheet settings
        if (defaultFormat.sheetType) {
          setSheetType(defaultFormat.sheetType);
        }
        if (defaultFormat.topOffset !== undefined) {
          setTopOffset(defaultFormat.topOffset);
        }
        if (defaultFormat.leftOffset !== undefined) {
          setLeftOffset(defaultFormat.leftOffset);
        }
        if (defaultFormat.bottomOffset !== undefined) {
          setBottomOffset(defaultFormat.bottomOffset);
        }
        if (defaultFormat.rightOffset !== undefined) {
          setRightOffset(defaultFormat.rightOffset);
        }
        if (defaultFormat.customDimensions && defaultFormat.sheetType === "custom") {
          setCustomWidth(defaultFormat.customDimensions.width);
          setCustomHeight(defaultFormat.customDimensions.height);
          setCustomCols(defaultFormat.customDimensions.cols);
          setCustomGap(defaultFormat.customDimensions.gap);
        }
      } catch (error) {
        console.error("Failed to load default format:", error);
      }
    }
  }, []);

  // Fetch business name from settings
  useEffect(() => {
    const fetchBusinessName = async () => {
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("business_name, purchase_settings")
          .maybeSingle();

        if (error) throw error;
        
        if (data?.business_name) {
          setBusinessName(data.business_name);
        }
        
        // Fetch purchase code settings
        if (data?.purchase_settings) {
          const purchaseSettings = data.purchase_settings as any;
          if (purchaseSettings.purchase_code_alphabet) {
            setPurchaseCodeAlphabet(purchaseSettings.purchase_code_alphabet);
          }
          if (purchaseSettings.show_purchase_code !== undefined) {
            setShowPurchaseCode(purchaseSettings.show_purchase_code);
            // Update labelConfig to show purchase code if enabled
            if (purchaseSettings.show_purchase_code) {
              setLabelConfig(prev => ({
                ...prev,
                purchaseCode: { ...prev.purchaseCode, show: true }
              }));
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch business name:", error);
      }
    };

    fetchBusinessName();
  }, []);

  // Fetch recent bills
  useEffect(() => {
    const fetchRecentBills = async () => {
      try {
        const { data, error } = await supabase
          .from("purchase_bills")
          .select("id, software_bill_no, supplier_name, bill_date")
          .order("bill_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(20);

        if (error) throw error;
        
        if (data) {
          setRecentBills(data);
        }
      } catch (error) {
        console.error("Failed to fetch recent bills:", error);
      }
    };

    fetchRecentBills();
  }, []);

  // Pre-fill items from purchase entry if passed via navigation state
  useEffect(() => {
    if (location.state?.purchaseItems) {
      const purchaseItems = location.state.purchaseItems;
      const items: LabelItem[] = purchaseItems.map((item: any) => {
        const purPrice = item.pur_price || 0;
        const purchaseCode = showPurchaseCode && purPrice > 0 
          ? encodePurchasePrice(purPrice, purchaseCodeAlphabet) 
          : undefined;
        
        return {
          sku_id: item.sku_id,
          product_name: item.product_name,
          brand: item.brand || "",
          category: item.category || "",
          color: item.color || "",
          style: item.style || "",
          size: item.size,
          sale_price: item.sale_price,
          pur_price: purPrice,
          purchase_code: purchaseCode,
          barcode: item.barcode,
          qty: item.qty,
          bill_number: item.bill_number || "",
          supplier_code: item.supplier_code || "",
        };
      });
      setLabelItems(items);
      toast.success(`Loaded ${items.length} items from purchase bill`);
    }
  }, [location.state, showPurchaseCode, purchaseCodeAlphabet]);

  const genEAN8 = () => {
    const seven = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10));
    const sum = seven[0] * 3 + seven[1] + seven[2] * 3 + seven[3] + seven[4] * 3 + seven[5] + seven[6] * 3;
    const chk = (10 - (sum % 10)) % 10;
    return seven.join("") + String(chk);
  };

  // Search for products as user types
  useEffect(() => {
    const searchProducts = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      try {
        const { data: matchingProducts } = await supabase
          .from("products")
          .select("id")
          .or(`product_name.ilike.%${searchQuery}%,brand.ilike.%${searchQuery}%,color.ilike.%${searchQuery}%,style.ilike.%${searchQuery}%`);

        const productIds = matchingProducts?.map((p) => p.id) || [];

        let variantsQuery = supabase
          .from("product_variants")
          .select(
            `
            id,
            size,
            sale_price,
            barcode,
            stock_qty,
            product_id,
            products (
              product_name,
              brand,
              color,
              style
            )
          `
          )
          .eq("active", true);

        if (productIds.length > 0) {
          variantsQuery = variantsQuery.or(
            `barcode.ilike.%${searchQuery}%,size.ilike.%${searchQuery}%,product_id.in.(${productIds.join(",")})`
          );
        } else {
          variantsQuery = variantsQuery.or(`barcode.ilike.%${searchQuery}%,size.ilike.%${searchQuery}%`);
        }

        const { data, error } = await variantsQuery.limit(50);

        if (error) throw error;

        const results: SearchResult[] = (data || []).map((v: any) => ({
          id: v.id,
          product_name: v.products?.product_name || "",
          brand: v.products?.brand || "",
          category: v.products?.category || "",
          color: v.products?.color || "",
          style: v.products?.style || "",
          size: v.size,
          sale_price: v.sale_price || 0,
          barcode: v.barcode || "",
          stock_qty: v.stock_qty || 0,
        }));

        setSearchResults(results);
      } catch (error: any) {
        console.error(error);
      }
    };

    const debounce = setTimeout(searchProducts, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  // Auto-fill quantities when switching to lastPurchase mode or when items change
  useEffect(() => {
    if (quantityMode === "lastPurchase" && labelItems.length > 0) {
      fillLastPurchaseQuantities(labelItems);
    }
  }, [quantityMode, labelItems.length]);

  const handleSelectProduct = async (result: SearchResult) => {
    // Check if already added
    if (labelItems.some(item => item.sku_id === result.id)) {
      toast.error("Product already added");
      setIsSearchOpen(false);
      return;
    }

    const newItem: LabelItem = {
      sku_id: result.id,
      product_name: result.product_name,
      brand: result.brand,
      category: result.category,
      color: result.color,
      style: result.style,
      size: result.size,
      sale_price: result.sale_price,
      barcode: result.barcode,
      bill_number: '',
      qty: 1,
    };

    setLabelItems([...labelItems, newItem]);
    setIsSearchOpen(false);
    setSearchQuery("");

    // Auto-fill quantity based on mode
    if (quantityMode === "lastPurchase") {
      await fillLastPurchaseQuantities([newItem]);
    } else if (quantityMode === "byBill" && billNumber.trim()) {
      await loadQuantitiesForItem(newItem);
    }

    toast.success("Product added");
  };

  const fillLastPurchaseQuantities = async (items: LabelItem[]) => {
    try {
      // Get the latest purchase bill
      const { data: latestBill, error: billError } = await supabase
        .from("purchase_bills")
        .select("id, bill_date")
        .order("bill_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (billError) {
        console.error("Error fetching latest bill:", billError);
        return;
      }

      if (!latestBill) {
        toast.info("No purchase bills found");
        return;
      }

      // Get items from the latest bill
      const { data: purchaseData } = await supabase
        .from("purchase_items")
        .select("barcode, qty, sku_id")
        .eq("bill_id", latestBill.id);

      if (purchaseData) {
        const quantityMap = new Map<string, number>();
        const skuQuantityMap = new Map<string, number>();
        
        purchaseData.forEach((item: any) => {
          if (item.barcode) {
            quantityMap.set(item.barcode, item.qty);
          }
          if (item.sku_id) {
            skuQuantityMap.set(item.sku_id, item.qty);
          }
        });

        setLabelItems((prev) =>
          prev.map((item) => {
            // Try to match by sku_id first, then by barcode
            const qty = skuQuantityMap.get(item.sku_id) || quantityMap.get(item.barcode) || 0;
            return { ...item, qty };
          })
        );
      }
    } catch (error) {
      console.error("Failed to fill last purchase quantities:", error);
      toast.error("Could not load quantities from last purchase");
    }
  };

  const loadQuantitiesForItem = async (item: LabelItem) => {
    if (!billNumber.trim()) return;

    try {
      // Search by software_bill_no or supplier_invoice_no
      const { data: billData, error: billError } = await supabase
        .from("purchase_bills")
        .select("id")
        .or(`supplier_invoice_no.ilike.%${billNumber}%,software_bill_no.ilike.%${billNumber}%`)
        .limit(1)
        .maybeSingle();

      if (billError || !billData) {
        console.error("Bill not found:", billError);
        return;
      }

      const { data: itemData, error: itemError } = await supabase
        .from("purchase_items")
        .select("qty, sku_id, barcode")
        .eq("bill_id", billData.id)
        .or(`sku_id.eq.${item.sku_id},barcode.eq.${item.barcode}`)
        .limit(1)
        .maybeSingle();

      if (itemError) {
        console.error("Failed to load item data:", itemError);
        return;
      }

      if (itemData) {
        setLabelItems(prev =>
          prev.map(i => i.sku_id === item.sku_id ? { ...i, qty: itemData.qty } : i)
        );
      }
    } catch (error) {
      console.error("Failed to load quantity for item:", error);
    }
  };

  const handleLoadByBill = async () => {
    if (!billNumber.trim()) {
      toast.error("Please enter a bill number or ID");
      return;
    }

    try {
      // First try to find by software_bill_no or supplier_invoice_no
      const { data: billData, error: billError } = await supabase
        .from("purchase_bills")
        .select("id, supplier_invoice_no, software_bill_no, bill_date")
        .or(`supplier_invoice_no.ilike.%${billNumber}%,software_bill_no.ilike.%${billNumber}%`)
        .limit(1)
        .maybeSingle();

      if (billError) {
        console.error("Error searching bill:", billError);
        toast.error("Error searching for bill");
        return;
      }

      if (!billData) {
        toast.error("Bill not found");
        return;
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from("purchase_items")
        .select(`
          qty,
          sku_id,
          barcode,
          sale_price,
          size
        `)
        .eq("bill_id", billData.id);

      if (itemsError) throw itemsError;

      if (!itemsData || itemsData.length === 0) {
        toast.error("No items found in this bill");
        return;
      }

      // Get unique SKU IDs to fetch product details
      const skuIds = itemsData.map(item => item.sku_id).filter(Boolean);
      
      if (skuIds.length === 0) {
        toast.error("No valid products found in this bill");
        return;
      }

      // Fetch product details including variants
      const { data: variantsData, error: variantsError } = await supabase
        .from("product_variants")
        .select(`
          id,
          size,
          barcode,
          sale_price,
          product_id,
          products (
            product_name,
            brand,
            color,
            style
          )
        `)
        .in("id", skuIds);

      if (variantsError) throw variantsError;

      // Create a map of variant details
      const variantMap = new Map();
      (variantsData || []).forEach((variant: any) => {
        variantMap.set(variant.id, {
          product_name: variant.products?.product_name || "",
          brand: variant.products?.brand || "",
          category: variant.products?.category || "",
          color: variant.products?.color || "",
          style: variant.products?.style || "",
          size: variant.size,
          barcode: variant.barcode,
          sale_price: variant.sale_price
        });
      });

      // Build label items from purchase items
      const loadedItems: LabelItem[] = itemsData
        .filter(item => item.sku_id && variantMap.has(item.sku_id))
        .map(item => {
          const variantInfo = variantMap.get(item.sku_id);
          return {
            sku_id: item.sku_id,
            product_name: variantInfo.product_name,
            brand: variantInfo.brand,
            category: variantInfo.category,
            color: variantInfo.color,
            style: variantInfo.style,
            size: item.size || variantInfo.size,
            sale_price: item.sale_price || variantInfo.sale_price,
            barcode: item.barcode || variantInfo.barcode,
            bill_number: billData.software_bill_no || '',
            qty: item.qty
          };
        });

      if (loadedItems.length === 0) {
        toast.error("Could not load product details for items in this bill");
        return;
      }

      setLabelItems(loadedItems);
      toast.success(`Loaded ${loadedItems.length} items from bill ${billData.supplier_invoice_no || billData.id}`);
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to load bill data");
    }
  };

  const handleQtyChange = (skuId: string, newQty: number) => {
    setLabelItems((prev) =>
      prev.map((item) => (item.sku_id === skuId ? { ...item, qty: Math.max(0, newQty) } : item))
    );
  };

  const handleClearAll = () => {
    setLabelItems([]);
    setSearchQuery("");
    toast.success("Cleared all labels");
  };

  // Preset management functions
  const handleSavePreset = () => {
    const trimmedName = newPresetName.trim();
    
    if (!trimmedName) {
      toast.error("Please enter a preset name");
      return;
    }

    if (trimmedName.length > 50) {
      toast.error("Preset name must be less than 50 characters");
      return;
    }

    // Check for duplicate names only if not editing or name changed
    if (!isEditingPreset && savedPresets.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      toast.error("A preset with this name already exists");
      return;
    }

    if (isEditingPreset && trimmedName !== selectedPreset && 
        savedPresets.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      toast.error("A preset with this name already exists");
      return;
    }

    const newPreset: CustomPreset = {
      name: trimmedName,
      width: customWidth,
      height: customHeight,
      cols: customCols,
      rows: customRows,
      gap: customGap,
    };

    let updatedPresets;
    if (isEditingPreset) {
      // Update existing preset
      updatedPresets = savedPresets.map(p => 
        p.name === selectedPreset ? newPreset : p
      );
      toast.success(`Preset "${trimmedName}" updated successfully`);
    } else {
      // Add new preset
      updatedPresets = [...savedPresets, newPreset];
      toast.success(`Preset "${trimmedName}" saved successfully`);
    }

    setSavedPresets(updatedPresets);
    localStorage.setItem("barcode_custom_presets", JSON.stringify(updatedPresets));
    
    setNewPresetName("");
    setIsSaveDialogOpen(false);
    setIsEditingPreset(false);
    setSelectedPreset(trimmedName);
  };

  const handleEditPreset = () => {
    if (!selectedPreset) {
      toast.error("Please select a preset to edit");
      return;
    }

    const preset = savedPresets.find(p => p.name === selectedPreset);
    if (preset) {
      setCustomWidth(preset.width);
      setCustomHeight(preset.height);
      setCustomCols(preset.cols);
      setCustomRows(preset.rows);
      setCustomGap(preset.gap);
      setNewPresetName(preset.name);
      setIsEditingPreset(true);
      setIsSaveDialogOpen(true);
    }
  };

  const handleLoadPreset = (presetName: string) => {
    const preset = savedPresets.find(p => p.name === presetName);
    if (preset) {
      setCustomWidth(preset.width);
      setCustomHeight(preset.height);
      setCustomCols(preset.cols);
      setCustomRows(preset.rows);
      setCustomGap(preset.gap);
      setSelectedPreset(presetName);
      toast.success(`Loaded preset "${presetName}"`);
    }
  };

  const handleDeletePreset = () => {
    if (!selectedPreset) {
      toast.error("Please select a preset to delete");
      return;
    }

    const updatedPresets = savedPresets.filter(p => p.name !== selectedPreset);
    setSavedPresets(updatedPresets);
    localStorage.setItem("barcode_custom_presets", JSON.stringify(updatedPresets));
    setSelectedPreset("");
    toast.success(`Preset "${selectedPreset}" deleted`);
  };

  const handleCopyPresetToCustom = () => {
    if (sheetType === "custom") {
      toast.info("Already in custom mode");
      return;
    }

    const preset = sheetPresets[sheetType];
    // Extract numeric values from preset
    const width = parseFloat(preset.width);
    const height = parseFloat(preset.height);
    const gap = parseFloat(preset.gap);
    
    setCustomWidth(width);
    setCustomHeight(height);
    setCustomCols(preset.cols);
    setCustomGap(gap);
    
    // Calculate rows based on preset type
    const rowsMap: Record<string, number> = {
      novajet48: 6,
      novajet40: 8,
      novajet65: 13,
      a4_12x4: 12,
    };
    setCustomRows(rowsMap[sheetType] || 12);
    
    setSheetType("custom");
    toast.success("Preset copied to custom. You can now edit and save it.");
  };

  // Design format preset management functions
  const handleSaveDesignPreset = () => {
    const trimmedName = newDesignPresetName.trim();
    
    if (!trimmedName) {
      toast.error("Please enter a preset name");
      return;
    }

    if (trimmedName.length > 50) {
      toast.error("Preset name must be less than 50 characters");
      return;
    }

    const existingIndex = savedDesignPresets.findIndex(p => p.name === trimmedName);
    
    if (!isEditingDesignPreset && existingIndex !== -1) {
      toast.error("A preset with this name already exists");
      return;
    }

    const newPreset: DesignFormatPreset = {
      name: trimmedName,
      format: designFormat,
      topOffset,
      leftOffset,
      bottomOffset,
      rightOffset,
      labelConfig: { ...labelConfig },
    };

    let updatedPresets: DesignFormatPreset[];
    if (isEditingDesignPreset && existingIndex !== -1) {
      updatedPresets = [...savedDesignPresets];
      updatedPresets[existingIndex] = newPreset;
      toast.success(`Design preset "${trimmedName}" updated`);
    } else {
      updatedPresets = [...savedDesignPresets, newPreset];
      toast.success(`Design preset "${trimmedName}" saved`);
    }

    setSavedDesignPresets(updatedPresets);
    localStorage.setItem("barcode_design_presets", JSON.stringify(updatedPresets));
    setSelectedDesignPreset(trimmedName);
    setIsDesignSaveDialogOpen(false);
    setIsEditingDesignPreset(false);
    setNewDesignPresetName("");
  };

  const handleEditDesignPreset = () => {
    if (!selectedDesignPreset) {
      toast.error("Please select a design preset to edit");
      return;
    }

    const preset = savedDesignPresets.find(p => p.name === selectedDesignPreset);
    if (preset) {
      setDesignFormat(preset.format);
      setTopOffset(preset.topOffset);
      setLeftOffset(preset.leftOffset);
      setBottomOffset(preset.bottomOffset || 0);
      setRightOffset(preset.rightOffset || 0);
      setNewDesignPresetName(preset.name);
      setIsEditingDesignPreset(true);
      setIsDesignSaveDialogOpen(true);
    }
  };

  const handleLoadDesignPreset = (presetName: string) => {
    const preset = savedDesignPresets.find(p => p.name === presetName);
    if (preset) {
      setDesignFormat(preset.format);
      setTopOffset(preset.topOffset);
      setLeftOffset(preset.leftOffset);
      setBottomOffset(preset.bottomOffset || 0);
      setRightOffset(preset.rightOffset || 0);
      if (preset.labelConfig) {
        // Ensure the loaded config has all required properties with defaults
        const mergedConfig: LabelDesignConfig = {
          brand: preset.labelConfig.brand || { show: true, fontSize: 9, bold: true },
          productName: preset.labelConfig.productName || { show: true, fontSize: 9, bold: true },
          color: preset.labelConfig.color || { show: false, fontSize: 8, bold: false },
          style: preset.labelConfig.style || { show: false, fontSize: 8, bold: false },
          size: preset.labelConfig.size || { show: true, fontSize: 9, bold: false },
          price: preset.labelConfig.price || { show: true, fontSize: 9, bold: true },
          barcode: preset.labelConfig.barcode || { show: true, fontSize: 9, bold: false },
          barcodeText: preset.labelConfig.barcodeText || { show: true, fontSize: 7, bold: false },
          billNumber: preset.labelConfig.billNumber || { show: true, fontSize: 7, bold: false },
          supplierCode: preset.labelConfig.supplierCode || { show: true, fontSize: 7, bold: false },
          purchaseCode: preset.labelConfig.purchaseCode || { show: false, fontSize: 7, bold: false },
          fieldOrder: preset.labelConfig.fieldOrder || ['brand', 'productName', 'color', 'style', 'size', 'price', 'barcode', 'billNumber', 'barcodeText', 'supplierCode', 'purchaseCode'],
        };
        setLabelConfig(mergedConfig);
      }
      setSelectedDesignPreset(presetName);
      toast.success(`Loaded design preset "${presetName}"`);
    }
  };

  const handleDeleteDesignPreset = () => {
    if (!selectedDesignPreset) {
      toast.error("Please select a design preset to delete");
      return;
    }

    const updatedPresets = savedDesignPresets.filter(p => p.name !== selectedDesignPreset);
    setSavedDesignPresets(updatedPresets);
    localStorage.setItem("barcode_design_presets", JSON.stringify(updatedPresets));
    setSelectedDesignPreset("");
    toast.success(`Design preset "${selectedDesignPreset}" deleted`);
  };

  // Label template management functions
  const handleSaveLabelTemplate = () => {
    const trimmedName = newLabelTemplateName.trim();
    
    if (!trimmedName) {
      toast.error("Please enter a template name");
      return;
    }

    if (trimmedName.length > 50) {
      toast.error("Template name must be less than 50 characters");
      return;
    }

    if (!isEditingLabelTemplate && savedLabelTemplates.some(t => t.name.toLowerCase() === trimmedName.toLowerCase())) {
      toast.error("A template with this name already exists");
      return;
    }

    if (isEditingLabelTemplate && trimmedName !== selectedLabelTemplate && 
        savedLabelTemplates.some(t => t.name.toLowerCase() === trimmedName.toLowerCase())) {
      toast.error("A template with this name already exists");
      return;
    }

    const newTemplate: LabelTemplate = {
      name: trimmedName,
      config: { ...labelConfig }
    };

    let updatedTemplates;
    if (isEditingLabelTemplate) {
      updatedTemplates = savedLabelTemplates.map(t => 
        t.name === selectedLabelTemplate ? newTemplate : t
      );
      toast.success(`Template "${trimmedName}" updated successfully`);
    } else {
      updatedTemplates = [...savedLabelTemplates, newTemplate];
      toast.success(`Template "${trimmedName}" saved successfully`);
    }

    setSavedLabelTemplates(updatedTemplates);
    localStorage.setItem("barcode_label_templates", JSON.stringify(updatedTemplates));
    
    setNewLabelTemplateName("");
    setIsLabelTemplateSaveDialogOpen(false);
    setIsEditingLabelTemplate(false);
    setSelectedLabelTemplate(trimmedName);
  };

  const handleEditLabelTemplate = () => {
    if (!selectedLabelTemplate) {
      toast.error("Please select a template to edit");
      return;
    }

    const template = savedLabelTemplates.find(t => t.name === selectedLabelTemplate);
    if (template) {
      // Ensure the loaded config has all required properties with defaults
      const mergedConfig: LabelDesignConfig = {
        brand: template.config.brand || { show: true, fontSize: 9, bold: true },
        productName: template.config.productName || { show: true, fontSize: 9, bold: true },
        color: template.config.color || { show: false, fontSize: 8, bold: false },
        style: template.config.style || { show: false, fontSize: 8, bold: false },
        size: template.config.size || { show: true, fontSize: 9, bold: false },
        price: template.config.price || { show: true, fontSize: 9, bold: true },
        barcode: template.config.barcode || { show: true, fontSize: 9, bold: false },
        barcodeText: template.config.barcodeText || { show: true, fontSize: 7, bold: false },
        billNumber: template.config.billNumber || { show: true, fontSize: 7, bold: false },
        supplierCode: template.config.supplierCode || { show: true, fontSize: 7, bold: false },
        purchaseCode: template.config.purchaseCode || { show: false, fontSize: 7, bold: false },
        fieldOrder: template.config.fieldOrder || ['brand', 'productName', 'color', 'style', 'size', 'price', 'barcode', 'billNumber', 'barcodeText', 'supplierCode', 'purchaseCode'],
      };
      setLabelConfig(mergedConfig);
      setNewLabelTemplateName(template.name);
      setIsEditingLabelTemplate(true);
      setShowCustomizeFields(true);
      setIsLabelTemplateSaveDialogOpen(true);
    }
  };

  const handleLoadLabelTemplate = (templateName: string) => {
    const template = savedLabelTemplates.find(t => t.name === templateName);
    if (template) {
      // Ensure the loaded config has all required properties with defaults
      const mergedConfig: LabelDesignConfig = {
        brand: template.config.brand || { show: true, fontSize: 9, bold: true },
        productName: template.config.productName || { show: true, fontSize: 9, bold: true },
        color: template.config.color || { show: false, fontSize: 8, bold: false },
        style: template.config.style || { show: false, fontSize: 8, bold: false },
        size: template.config.size || { show: true, fontSize: 9, bold: false },
        price: template.config.price || { show: true, fontSize: 9, bold: true },
        barcode: template.config.barcode || { show: true, fontSize: 9, bold: false },
        barcodeText: template.config.barcodeText || { show: true, fontSize: 7, bold: false },
        billNumber: template.config.billNumber || { show: true, fontSize: 7, bold: false },
        supplierCode: template.config.supplierCode || { show: true, fontSize: 7, bold: false },
        purchaseCode: template.config.purchaseCode || { show: false, fontSize: 7, bold: false },
        fieldOrder: template.config.fieldOrder || ['brand', 'productName', 'color', 'style', 'size', 'price', 'barcode', 'billNumber', 'barcodeText', 'supplierCode', 'purchaseCode'],
      };
      setLabelConfig(mergedConfig);
      setSelectedLabelTemplate(templateName);
      toast.success(`Loaded template "${templateName}"`);
    }
  };

  const handleDeleteLabelTemplate = () => {
    if (!selectedLabelTemplate) {
      toast.error("Please select a template to delete");
      return;
    }

    const updatedTemplates = savedLabelTemplates.filter(t => t.name !== selectedLabelTemplate);
    setSavedLabelTemplates(updatedTemplates);
    localStorage.setItem("barcode_label_templates", JSON.stringify(updatedTemplates));
    setSelectedLabelTemplate("");
    toast.success(`Template "${selectedLabelTemplate}" deleted`);
  };

  const handleSaveAsDefault = () => {
    // Ensure barcode and barcode text are always enabled
    const configToSave = {
      ...labelConfig,
      barcode: { ...labelConfig.barcode, show: true },
      barcodeText: { ...labelConfig.barcodeText, show: true },
    };
    
    const defaultFormat = {
      defaultTemplate: selectedLabelTemplate || null,
      sheetType,
      // Only save inline config if no template is selected
      labelConfig: selectedLabelTemplate ? undefined : configToSave,
      topOffset,
      leftOffset,
      bottomOffset,
      rightOffset,
      customDimensions: sheetType === "custom" ? {
        width: customWidth,
        height: customHeight,
        cols: customCols,
        gap: customGap,
      } : undefined,
    };

    localStorage.setItem("barcode_default_format", JSON.stringify(defaultFormat));
    
    if (selectedLabelTemplate) {
      toast.success(`Template "${selectedLabelTemplate}" set as default format`);
    } else {
      toast.success("Current layout saved as default format");
    }
  };

  const getLabelHTML = (item: LabelItem, format: DesignFormat) => {
    const barcode = item.barcode || genEAN8();
    const config = labelConfig;

    // Helper to build style string
    const getStyle = (field: LabelFieldConfig) => {
      return `font-size: ${field.fontSize}px; font-weight: ${field.bold ? 'bold' : 'normal'};`;
    };

    // Build label HTML based on field order
    let html = '';
    
    // Use fieldOrder to determine the sequence
    config.fieldOrder.forEach((fieldKey) => {
      const field = config[fieldKey];
      
      if (!field.show) return;
      
      switch (fieldKey) {
        case 'brand':
          html += `<div class="brand" style="${getStyle(field)}">${businessName}</div>`;
          break;
        case 'productName':
          const prodText = item.product_name + 
            (config.size.show ? ` (${item.size})` : '');
          html += `<div class="prod" style="${getStyle(field)}">${prodText}</div>`;
          break;
        case 'color':
          html += `<div class="color" style="${getStyle(field)}">Color: ${item.color}</div>`;
          break;
        case 'style':
          html += `<div class="style" style="${getStyle(field)}">Style: ${item.style}</div>`;
          break;
        case 'size':
          // Size is already included in productName if shown
          break;
        case 'price':
          html += `<div class="mrp" style="${getStyle(field)}">MRP: ₹${item.sale_price}</div>`;
          break;
        case 'barcode':
          html += `<svg class="barcode" data-code="${barcode}"></svg>`;
          break;
        case 'barcodeText':
          html += `<div class="meta barcode-text" style="${getStyle(field)}">${barcode}</div>`;
          break;
        case 'billNumber':
          if (item.bill_number) {
            html += `<div class="bill-num" style="${getStyle(field)}">Bill: ${item.bill_number}</div>`;
          }
          break;
        case 'supplierCode':
          if (item.supplier_code) {
            html += `<div class="supplier-code" style="${getStyle(field)}">Sup: ${item.supplier_code}</div>`;
          }
          break;
        case 'purchaseCode':
          if (item.purchase_code) {
            html += `<div class="purchase-code" style="${getStyle(field)}">Code: ${item.purchase_code}</div>`;
          }
          break;
      }
    });

    return html;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLabelConfig((prev) => {
        const oldIndex = prev.fieldOrder.indexOf(active.id as keyof Omit<LabelDesignConfig, 'fieldOrder'>);
        const newIndex = prev.fieldOrder.indexOf(over.id as keyof Omit<LabelDesignConfig, 'fieldOrder'>);

        return {
          ...prev,
          fieldOrder: arrayMove(prev.fieldOrder, oldIndex, newIndex),
        };
      });
      toast.success('Field order updated');
    }
  };

  const handlePreview = () => {
    const hasLabels = labelItems.some((item) => item.qty > 0);
    if (!hasLabels) {
      toast.error("Please add at least one label with quantity > 0");
      return;
    }

    // Validate custom dimensions if custom sheet type is selected
    if (sheetType === "custom") {
      if (customWidth <= 0 || customWidth > 300) {
        toast.error("Width must be between 1mm and 300mm");
        return;
      }
      if (customHeight <= 0 || customHeight > 300) {
        toast.error("Height must be between 1mm and 300mm");
        return;
      }
      if (customCols <= 0 || customCols > 20) {
        toast.error("Columns must be between 1 and 20");
        return;
      }
      if (customRows <= 0 || customRows > 50) {
        toast.error("Rows must be between 1 and 50");
        return;
      }
      if (customGap < 0 || customGap > 50) {
        toast.error("Gap must be between 0mm and 50mm");
        return;
      }
    }

    setIsPreviewDialogOpen(true);
  };

  const generatePreview = (targetElementId: string) => {
    const printArea = document.getElementById(targetElementId);
    if (!printArea) return;

    const isPreviewMode = targetElementId === "previewArea";

    // Use custom dimensions if custom sheet type, otherwise use preset
    const dimensions = sheetType === "custom"
      ? { 
          cols: customCols, 
          width: customWidth, 
          height: customHeight, 
          gap: customGap 
        }
      : {
          cols: sheetPresets[sheetType].cols,
          width: parseInt(sheetPresets[sheetType].width),
          height: parseInt(sheetPresets[sheetType].height),
          gap: parseInt(sheetPresets[sheetType].gap)
        };
    
    printArea.innerHTML = "";

    // Calculate total labels (only for preview mode)
    const totalLabels = labelItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    
    // Calculate labels per page (only for preview mode)
    let numPages = 0;
    if (isPreviewMode) {
      const availableHeight = 297 - topOffset - bottomOffset - 10;
      const rowsPerPage = Math.floor(availableHeight / (dimensions.height + dimensions.gap));
      const labelsPerPage = dimensions.cols * Math.max(1, rowsPerPage);
      numPages = totalLabels > 0 ? Math.ceil(totalLabels / labelsPerPage) : 0;
    }

    // Generate all labels as an array
    const allLabels: { html: string; item: LabelItem }[] = [];
    labelItems.forEach((item) => {
      const qty = Number(item.qty) || 0;
      for (let i = 0; i < qty; i++) {
        allLabels.push({ html: getLabelHTML(item, designFormat), item });
      }
    });

    if (isPreviewMode && numPages > 0) {
      // Preview mode: Show pages with separators
      const availableHeight = 297 - topOffset - bottomOffset - 10;
      const rowsPerPage = Math.floor(availableHeight / (dimensions.height + dimensions.gap));
      const labelsPerPage = dimensions.cols * Math.max(1, rowsPerPage);

      // Add total count at the top
      const totalCounter = document.createElement("div");
      totalCounter.className = "total-page-counter";
      totalCounter.style.cssText = `
        margin-bottom: 15px;
        padding: 12px;
        background: hsl(var(--primary) / 0.1);
        border: 1px solid hsl(var(--primary) / 0.2);
        border-radius: 8px;
        text-align: center;
        font-weight: 700;
        font-size: 16px;
        color: hsl(var(--primary));
      `;
      totalCounter.textContent = `Total: ${totalLabels} labels across ${numPages} page${numPages > 1 ? 's' : ''}`;
      printArea.appendChild(totalCounter);

      // Create pages with page numbers
      for (let page = 0; page < numPages; page++) {
        // Add page counter before each page
        const pageSeparator = document.createElement("div");
        pageSeparator.className = "page-separator";
        pageSeparator.style.cssText = `
          margin: ${page > 0 ? '20px' : '0'} 0 10px 0;
          padding: 10px;
          background: hsl(var(--muted));
          border-radius: 6px;
          text-align: center;
          font-weight: 600;
          font-size: 14px;
          color: hsl(var(--muted-foreground));
        `;
        pageSeparator.textContent = `Page ${page + 1} of ${numPages}`;
        printArea.appendChild(pageSeparator);

        // Create grid for this page
        const gridDiv = document.createElement("div");
        gridDiv.className = "label-grid";
        gridDiv.style.cssText = `
          display: grid;
          grid-template-columns: repeat(${dimensions.cols}, ${dimensions.width}mm);
          grid-auto-rows: ${dimensions.height}mm;
          gap: ${dimensions.gap}mm;
          padding-top: ${topOffset}mm;
          padding-left: ${leftOffset}mm;
          padding-bottom: ${bottomOffset}mm;
          padding-right: ${rightOffset}mm;
          margin-bottom: ${page < numPages - 1 ? '20px' : '0'};
        `;

        // Add labels for this page
        const startIdx = page * labelsPerPage;
        const endIdx = Math.min(startIdx + labelsPerPage, allLabels.length);
        
        for (let i = startIdx; i < endIdx; i++) {
          const cell = document.createElement("div");
          cell.className = "label-cell";
          cell.style.width = `${dimensions.width}mm`;
          cell.style.height = `${dimensions.height}mm`;
          cell.innerHTML = allLabels[i].html;
          gridDiv.appendChild(cell);
        }

        printArea.appendChild(gridDiv);
      }
    } else {
      // Print mode: Simple grid without page separators
      const gridDiv = document.createElement("div");
      gridDiv.className = "label-grid";
      gridDiv.style.cssText = `
        display: grid;
        grid-template-columns: repeat(${dimensions.cols}, ${dimensions.width}mm);
        grid-auto-rows: ${dimensions.height}mm;
        gap: ${dimensions.gap}mm;
        padding-top: ${topOffset}mm;
        padding-left: ${leftOffset}mm;
        padding-bottom: ${bottomOffset}mm;
        padding-right: ${rightOffset}mm;
      `;

      allLabels.forEach((label) => {
        const cell = document.createElement("div");
        cell.className = "label-cell";
        cell.style.width = `${dimensions.width}mm`;
        cell.style.height = `${dimensions.height}mm`;
        cell.innerHTML = label.html;
        gridDiv.appendChild(cell);
      });

      printArea.appendChild(gridDiv);
    }

    // Render barcodes
    setTimeout(() => {
      const barcodes = printArea.querySelectorAll("svg.barcode");
      barcodes.forEach((svg) => {
        const code = (svg as HTMLElement).dataset.code;
        if (code) {
          try {
            JsBarcode(svg, code, {
              format: "CODE128",
              fontSize: 8,
              height: 20,
              width: 1.2,
              textMargin: 0,
              margin: 0,
              displayValue: false,
            });
          } catch (error) {
            console.error("Barcode generation failed for code:", code, error);
            const textEl = document.createElement("div");
            textEl.textContent = code;
            textEl.style.cssText = "font-size: 10px; font-weight: bold;";
            svg.parentElement?.replaceChild(textEl, svg);
          }
        }
      });
    }, 100);
  };

  const handlePrint = () => {
    // Generate labels in the print area
    generatePreview("printArea");
    
    // Wait for barcodes to render then print
    setTimeout(() => {
      window.print();
    }, 200);
  };

  const handleExportPDF = async () => {
    const hasLabels = labelItems.some((item) => item.qty > 0);
    if (!hasLabels) {
      toast.error("Please add at least one label with quantity > 0");
      return;
    }

    // Validate custom dimensions if custom sheet type is selected
    if (sheetType === "custom") {
      if (customWidth <= 0 || customWidth > 300) {
        toast.error("Width must be between 0 and 300mm");
        return;
      }
      if (customHeight <= 0 || customHeight > 300) {
        toast.error("Height must be between 0 and 300mm");
        return;
      }
      if (customCols <= 0 || customCols > 20) {
        toast.error("Columns must be between 1 and 20");
        return;
      }
      if (customRows <= 0 || customRows > 50) {
        toast.error("Rows must be between 1 and 50");
        return;
      }
      if (customGap < 0 || customGap > 50) {
        toast.error("Gap must be between 0 and 50mm");
        return;
      }
    }

    toast.info("Generating PDF...");

    try {
      // Calculate total labels needed
      const totalLabels = labelItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      
      // Get dimensions based on sheet type
      const dimensions = sheetType === "custom"
        ? { cols: customCols, rows: customRows, width: customWidth, height: customHeight, gap: customGap }
        : {
            cols: sheetPresets[sheetType].cols,
            rows: Math.ceil(totalLabels / sheetPresets[sheetType].cols),
            width: parseInt(sheetPresets[sheetType].width),
            height: parseInt(sheetPresets[sheetType].height),
            gap: parseInt(sheetPresets[sheetType].gap)
          };
      
      // Calculate how many rows fit on one page
      const availableHeight = 297 - topOffset - bottomOffset - 10; // A4 height with margins
      const rowsPerPage = Math.floor(availableHeight / (dimensions.height + dimensions.gap));
      const labelsPerPage = dimensions.cols * Math.max(1, rowsPerPage);
      
      // Calculate number of pages needed (only create pages with actual labels)
      const numPages = totalLabels > 0 ? Math.ceil(totalLabels / labelsPerPage) : 0;
      
      // Don't create PDF if no labels
      if (numPages === 0) {
        toast.error("No labels to print");
        return;
      }
      
      // Create PDF
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      // Create temporary container for rendering each page
      const tempContainer = document.createElement("div");
      tempContainer.id = "pdfExportArea";
      tempContainer.style.position = "absolute";
      tempContainer.style.left = "-9999px";
      tempContainer.style.top = "0";
      tempContainer.style.width = "210mm";
      document.body.appendChild(tempContainer);

      // Generate all labels as an array
      const allLabels: { html: string; item: LabelItem }[] = [];
      labelItems.forEach((item) => {
        const qty = Number(item.qty) || 0;
        for (let i = 0; i < qty; i++) {
          allLabels.push({ html: getLabelHTML(item, designFormat), item });
        }
      });

      // Process each page
      for (let page = 0; page < numPages; page++) {
        if (page > 0) {
          pdf.addPage();
        }

        // Clear temp container
        tempContainer.innerHTML = "";

        // Create grid for this page
        const gridDiv = document.createElement("div");
        gridDiv.className = "label-grid";
        gridDiv.style.cssText = `
          display: grid;
          grid-template-columns: repeat(${dimensions.cols}, ${dimensions.width}mm);
          grid-auto-rows: ${dimensions.height}mm;
          gap: ${dimensions.gap}mm;
          padding-top: ${topOffset}mm;
          padding-left: ${leftOffset}mm;
          padding-bottom: ${bottomOffset}mm;
          padding-right: ${rightOffset}mm;
          width: 210mm;
        `;

        // Add labels for this page
        const startIdx = page * labelsPerPage;
        const endIdx = Math.min(startIdx + labelsPerPage, allLabels.length);
        
        for (let i = startIdx; i < endIdx; i++) {
          const cell = document.createElement("div");
          cell.className = "label-cell";
          cell.innerHTML = allLabels[i].html;
          gridDiv.appendChild(cell);
        }

        tempContainer.appendChild(gridDiv);

        // Render barcodes for this page
        const barcodes = tempContainer.querySelectorAll("svg.barcode");
        barcodes.forEach((svg) => {
          const code = (svg as HTMLElement).dataset.code;
          if (code) {
            try {
              JsBarcode(svg, code, {
                format: "CODE128",
                fontSize: 8,
                height: 20,
                width: 1.2,
                textMargin: 0,
                margin: 0,
                displayValue: false,
              });
            } catch (error) {
              console.error("Barcode generation failed for code:", code, error);
            }
          }
        });

        // Wait a bit for barcodes to render
        await new Promise(resolve => setTimeout(resolve, 200));

        // Capture this page
        const canvas = await html2canvas(tempContainer, {
          scale: 2,
          backgroundColor: "#ffffff",
          logging: false,
          width: 210 * 3.78, // Convert mm to pixels (1mm = ~3.78px)
          height: 297 * 3.78,
        });

        const imgData = canvas.toDataURL("image/png");
        pdf.addImage(imgData, "PNG", 0, 0, 210, 297);
      }

      // Clean up
      document.body.removeChild(tempContainer);

      // Save PDF
      const timestamp = new Date().toISOString().split("T")[0];
      pdf.save(`barcode-labels-${timestamp}.pdf`);

      toast.success(`PDF generated with ${numPages} page${numPages > 1 ? 's' : ''}`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to export PDF");
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {location.state?.purchaseItems ? (
        <BackToDashboard label="Back to Purchase Bill Dashboard" to="/purchase-bills" />
      ) : (
        <BackToDashboard />
      )}
      <h1 className="text-3xl font-bold">Barcode Printing</h1>

      {/* Search Bar with Dropdown */}
      <div className="flex gap-2">
        <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={isSearchOpen}
              className="flex-1 justify-between"
            >
              {searchQuery || "Search product, brand, size, or barcode..."}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[600px] p-0">
            <Command>
              <CommandInput
                placeholder="Type to search..."
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList>
                <CommandEmpty>No products found.</CommandEmpty>
                <CommandGroup>
                  {searchResults.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={`${result.product_name}-${result.brand}-${result.size}-${result.id}`}
                      onSelect={() => handleSelectProduct(result)}
                      className="flex items-center gap-2 cursor-pointer py-3"
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          labelItems.some(item => item.sku_id === result.id)
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      <div className="flex-1 grid grid-cols-5 gap-2 text-sm">
                        <div className="font-semibold truncate">{result.product_name}</div>
                        <div className="text-muted-foreground truncate">{result.brand || "-"}</div>
                        <div className="text-muted-foreground truncate">{result.color || "-"} / {result.style || "-"}</div>
                        <div className="font-medium">Size: {result.size}</div>
                        <div className="text-right">
                          <span className="font-semibold">₹{result.sale_price}</span>
                          <span className="text-xs text-muted-foreground ml-2">Stock: {result.stock_qty}</span>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Label Source Panel */}
      <div className="border rounded-lg p-4 space-y-4">
        <h2 className="text-xl font-semibold">Label Source</h2>

        <div className="space-y-2">
          <Label>Quantity Mode</Label>
          <RadioGroup value={quantityMode} onValueChange={(v) => setQuantityMode(v as QuantityMode)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="manual" id="manual" />
              <Label htmlFor="manual">Manual</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="lastPurchase" id="lastPurchase" />
              <Label htmlFor="lastPurchase">Auto: Last Purchase (by latest bill date)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="byBill" id="byBill" />
              <Label htmlFor="byBill">Auto: By Bill No</Label>
            </div>
          </RadioGroup>
        </div>

        {quantityMode === "byBill" && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <Select
                  value={billNumber}
                  onValueChange={(value) => {
                    setBillNumber(value);
                    // Auto-load when bill is selected from dropdown
                    if (value) {
                      setTimeout(() => handleLoadByBill(), 100);
                    }
                  }}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select recent bill..." />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {recentBills.length > 0 ? (
                      recentBills.map((bill) => (
                        <SelectItem key={bill.id} value={bill.software_bill_no || bill.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{bill.software_bill_no}</span>
                            <span className="text-xs text-muted-foreground">
                              {bill.supplier_name} - {new Date(bill.bill_date).toLocaleDateString()}
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-bills" disabled>
                        No recent bills found
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Or enter bill number manually"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleLoadByBill}>Load</Button>
            </div>
          </div>
        )}

        <Button variant="outline" onClick={handleClearAll}>
          Clear All
        </Button>
      </div>

      {/* Results Table */}
      {labelItems.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product Name</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Color/Style</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>MRP</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Supplier Code</TableHead>
                <TableHead>Label Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {labelItems.map((item) => (
                <TableRow key={item.sku_id}>
                  <TableCell className="font-medium">{item.product_name}</TableCell>
                  <TableCell>{item.brand || "-"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.color || "-"} / {item.style || "-"}
                  </TableCell>
                  <TableCell>{item.size}</TableCell>
                  <TableCell>₹{item.sale_price}</TableCell>
                  <TableCell className="font-mono text-xs">{item.barcode || "(auto-gen)"}</TableCell>
                  <TableCell>{item.supplier_code || "-"}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      value={item.qty}
                      onChange={(e) => handleQtyChange(item.sku_id, parseInt(e.target.value) || 0)}
                      className="w-20"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Layout & Style Panel */}
      <div className="border rounded-lg p-4 space-y-4">
        <h2 className="text-xl font-semibold">Layout & Style</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Sheet Type</Label>
            <div className="flex gap-2">
              <Select 
                value={sheetType === "custom" && selectedPreset ? `preset_${selectedPreset}` : sheetType} 
                onValueChange={(v) => {
                  if (v.startsWith("preset_")) {
                    const presetName = v.replace("preset_", "");
                    handleLoadPreset(presetName);
                    setSheetType("custom");
                  } else {
                    setSheetType(v as SheetType);
                    setSelectedPreset("");
                  }
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="novajet48">Novajet 48 (33mm × 19mm, 8 cols - A4 Vertical)</SelectItem>
                  <SelectItem value="novajet40">Novajet 40 (39mm × 35mm, 5 cols × 8 rows - A4 Vertical)</SelectItem>
                  <SelectItem value="novajet65">Novajet 65 (38mm × 21mm, 5 cols - A4 Vertical)</SelectItem>
                  <SelectItem value="a4_12x4">A4 48-Sheet (50mm × 24mm, 4×12)</SelectItem>
                  <SelectItem value="custom">Custom Dimensions</SelectItem>
                  {savedPresets.length > 0 && (
                    <>
                      <SelectItem value="divider" disabled className="font-semibold text-xs uppercase opacity-50 cursor-default">
                        — My Saved Presets —
                      </SelectItem>
                      {savedPresets.map((preset) => (
                        <SelectItem key={preset.name} value={`preset_${preset.name}`}>
                          {preset.name} ({preset.width}×{preset.height}mm, {preset.cols}×{preset.rows})
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              {sheetType !== "custom" && (
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleCopyPresetToCustom}
                  title="Edit & Save As - Copy this preset to custom for editing"
                >
                  <Save className="h-4 w-4" />
                </Button>
              )}
            </div>
            {sheetType === "novajet40" && (
              <p className="text-xs text-muted-foreground mt-2 p-2 bg-muted/30 rounded border">
                <strong>Recommended Print Settings:</strong> Scale 100%, Margins: None, Headers/Footers: Off<br />
                <strong>Starting Offsets:</strong> Top 2mm, Left 1mm (auto-loaded, adjust as needed)
              </p>
            )}
          </div>

          {sheetType === "custom" && (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">
                  {selectedPreset ? `Editing: ${selectedPreset}` : 'Custom Label Dimensions'}
                </h3>
                <div className="text-xs text-muted-foreground">
                  Sheet Size: {customCols} × {customRows} = {customCols * customRows} labels
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customWidth">Width (mm)</Label>
                  <Input
                    id="customWidth"
                    type="number"
                    min="1"
                    max="300"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(Math.max(1, Math.min(300, parseFloat(e.target.value) || 1)))}
                    placeholder="e.g., 50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customHeight">Height (mm)</Label>
                  <Input
                    id="customHeight"
                    type="number"
                    min="1"
                    max="300"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(Math.max(1, Math.min(300, parseFloat(e.target.value) || 1)))}
                    placeholder="e.g., 25"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customCols">Columns</Label>
                  <Input
                    id="customCols"
                    type="number"
                    min="1"
                    max="20"
                    value={customCols}
                    onChange={(e) => setCustomCols(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                    placeholder="e.g., 4"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customRows">Rows</Label>
                  <Input
                    id="customRows"
                    type="number"
                    min="1"
                    max="50"
                    value={customRows}
                    onChange={(e) => setCustomRows(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                    placeholder="e.g., 12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customGap">Gap (mm)</Label>
                  <Input
                    id="customGap"
                    type="number"
                    min="0"
                    max="50"
                    value={customGap}
                    onChange={(e) => setCustomGap(Math.max(0, Math.min(50, parseFloat(e.target.value) || 0)))}
                    placeholder="e.g., 2"
                  />
                </div>
              </div>
              
              {/* Preset Management */}
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Manage Presets</h4>
                  <div className="flex gap-2">
                    <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-2">
                          <Save className="h-4 w-4" />
                          Save Current
                        </Button>
                      </DialogTrigger>
                     <DialogContent>
                       <DialogHeader>
                         <DialogTitle>{isEditingPreset ? "Edit" : "Save"} Custom Preset</DialogTitle>
                         <DialogDescription>
                           {isEditingPreset 
                             ? "Update your preset with the current dimensions." 
                             : "Save your current dimensions as a preset for quick reuse later."}
                         </DialogDescription>
                       </DialogHeader>
                       <div className="space-y-4 py-4">
                         <div className="space-y-2">
                           <Label htmlFor="presetName">Preset Name</Label>
                           <Input
                             id="presetName"
                             value={newPresetName}
                             onChange={(e) => setNewPresetName(e.target.value.slice(0, 50))}
                             placeholder="e.g., My Custom 40mm Labels"
                             maxLength={50}
                           />
                         </div>
                         <div className="text-sm text-muted-foreground space-y-1">
                           <p>Current dimensions:</p>
                           <ul className="list-disc list-inside ml-2">
                             <li>Width: {customWidth}mm</li>
                             <li>Height: {customHeight}mm</li>
                             <li>Columns: {customCols}</li>
                             <li>Rows: {customRows}</li>
                             <li>Gap: {customGap}mm</li>
                             <li>Total labels per sheet: {customCols * customRows}</li>
                           </ul>
                         </div>
                       </div>
                       <DialogFooter>
                         <Button variant="outline" onClick={() => {
                           setIsSaveDialogOpen(false);
                           setIsEditingPreset(false);
                           setNewPresetName("");
                         }}>
                           Cancel
                         </Button>
                         <Button onClick={handleSavePreset}>
                           {isEditingPreset ? "Update" : "Save"} Preset
                         </Button>
                       </DialogFooter>
                     </DialogContent>
                  </Dialog>
                  {selectedPreset && (
                    <>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleEditPreset}
                        title="Edit this preset"
                        className="gap-2"
                      >
                        <Save className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleDeletePreset}
                        title="Delete this preset"
                        className="gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              {savedPresets.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Your saved presets appear in the Sheet Type dropdown above. {selectedPreset && `Currently using: ${selectedPreset}`}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No saved presets yet. Configure dimensions above and click "Save Current" to create one.
                </p>
              )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Design Format</Label>
            <div className="flex gap-2">
              <Select 
                value={selectedDesignPreset ? `preset_${selectedDesignPreset}` : designFormat} 
                onValueChange={(v) => {
                  if (v.startsWith("preset_")) {
                    const presetName = v.replace("preset_", "");
                    handleLoadDesignPreset(presetName);
                  } else {
                    setDesignFormat(v as DesignFormat);
                    setSelectedDesignPreset("");
                  }
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="BT1">BT1 Branded Tag (Full Details)</SelectItem>
                  <SelectItem value="BT2">BT2 Minimal (No MRP)</SelectItem>
                  <SelectItem value="BT3">BT3 Bold MRP</SelectItem>
                  <SelectItem value="BT4">BT4 Compact</SelectItem>
                  {savedDesignPresets.length > 0 && (
                    <>
                      <SelectItem value="divider" disabled className="font-semibold text-xs uppercase opacity-50 cursor-default">
                        — My Saved Formats —
                      </SelectItem>
                      {savedDesignPresets.map((preset) => (
                        <SelectItem key={preset.name} value={`preset_${preset.name}`}>
                          {preset.name} ({preset.format}, T:{preset.topOffset} L:{preset.leftOffset} B:{preset.bottomOffset || 0} R:{preset.rightOffset || 0}mm)
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              <Dialog open={isDesignSaveDialogOpen} onOpenChange={setIsDesignSaveDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon"
                    title="Save current design format"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{isEditingDesignPreset ? "Edit" : "Save"} Design Format Preset</DialogTitle>
                    <DialogDescription>
                      {isEditingDesignPreset 
                        ? "Update your design preset with the current format and offsets." 
                        : "Save your current design format and offsets as a preset for quick reuse later."}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="designPresetName">Preset Name</Label>
                      <Input
                        id="designPresetName"
                        value={newDesignPresetName}
                        onChange={(e) => setNewDesignPresetName(e.target.value.slice(0, 50))}
                        placeholder="e.g., My Brand Style"
                        maxLength={50}
                      />
                    </div>
                     <div className="text-sm text-muted-foreground space-y-1">
                      <p>Current settings:</p>
                      <ul className="list-disc list-inside ml-2">
                        <li>Format: {designFormat}</li>
                        <li>Top Margin: {topOffset}mm</li>
                        <li>Left Margin: {leftOffset}mm</li>
                        <li>Bottom Margin: {bottomOffset}mm</li>
                        <li>Right Margin: {rightOffset}mm</li>
                      </ul>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => {
                      setIsDesignSaveDialogOpen(false);
                      setIsEditingDesignPreset(false);
                      setNewDesignPresetName("");
                    }}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveDesignPreset}>
                      {isEditingDesignPreset ? "Update" : "Save"} Preset
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              {selectedDesignPreset && (
                <>
                  <Button 
                    size="icon" 
                    variant="outline" 
                    onClick={handleEditDesignPreset}
                    title="Edit this design preset"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="outline" 
                    onClick={handleDeleteDesignPreset}
                    title="Delete this design preset"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Label Template Selection */}
          <div className="col-span-full border rounded-lg p-4 space-y-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Label Templates</h3>
                <p className="text-sm text-muted-foreground">
                  Load saved templates or customize field configurations
                  {getDefaultTemplateName() && (
                    <span className="ml-2 text-primary font-medium">
                      · Default: {getDefaultTemplateName()}
                    </span>
                  )}
                </p>
              </div>
              
              <div className="flex gap-2 items-center">
                <Select 
                  value={selectedLabelTemplate || "none"} 
                  onValueChange={(v) => {
                    if (v === "none") {
                      setSelectedLabelTemplate("");
                    } else {
                      handleLoadLabelTemplate(v);
                    }
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select template..." />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="none">No Template</SelectItem>
                    {savedLabelTemplates.length > 0 && (
                      <>
                        <SelectItem value="divider" disabled className="font-semibold text-xs uppercase opacity-50">
                          — Saved Templates —
                        </SelectItem>
                        {savedLabelTemplates.map((template) => (
                          <SelectItem key={template.name} value={template.name}>
                            <div className="flex items-center gap-2">
                              {template.name}
                              {isTemplateDefault(template.name) && (
                                <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                                  Default
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>

                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setShowCustomizeFields(!showCustomizeFields)}
                >
                  {showCustomizeFields ? "Hide" : "Edit"} Fields
                </Button>

                <Dialog open={isLabelTemplateSaveDialogOpen} onOpenChange={setIsLabelTemplateSaveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        setNewLabelTemplateName("");
                        setIsEditingLabelTemplate(false);
                        setShowCustomizeFields(true);
                      }}
                    >
                      <Save className="h-4 w-4 mr-1" />
                      Save Template
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{isEditingLabelTemplate ? "Update" : "Save"} Label Template</DialogTitle>
                      <DialogDescription>
                        {isEditingLabelTemplate ? "Update the current label template" : "Save your current field configuration as a template"}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Template Name</Label>
                        <Input
                          placeholder="e.g., Minimal, Detailed, Price Focus"
                          value={newLabelTemplateName}
                          onChange={(e) => setNewLabelTemplateName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveLabelTemplate()}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => {
                        setIsLabelTemplateSaveDialogOpen(false);
                        setIsEditingLabelTemplate(false);
                        setNewLabelTemplateName("");
                      }}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveLabelTemplate}>
                        {isEditingLabelTemplate ? "Update" : "Save"} Template
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {selectedLabelTemplate && (
                  <>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleEditLabelTemplate}
                      title="Edit this template"
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleDeleteLabelTemplate}
                      title="Delete this template"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            
            {showCustomizeFields && (
              <div className="pt-4 border-t">
                <div className="mb-3">
                  <h4 className="font-medium text-sm mb-1">Customize Label Fields</h4>
                  <p className="text-xs text-muted-foreground">Control which fields appear on your labels, their styling, and drag to reorder</p>
                </div>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={labelConfig.fieldOrder}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {labelConfig.fieldOrder.map((fieldKey) => (
                        <SortableFieldItem
                          key={fieldKey}
                          fieldKey={fieldKey}
                          labelConfig={labelConfig}
                          setLabelConfig={setLabelConfig}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Top Margin (mm)</Label>
            <Input
              type="number"
              min="0"
              value={topOffset}
              onChange={(e) => setTopOffset(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label>Left Margin (mm)</Label>
            <Input
              type="number"
              min="0"
              value={leftOffset}
              onChange={(e) => setLeftOffset(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label>Bottom Margin (mm)</Label>
            <Input
              type="number"
              min="0"
              value={bottomOffset}
              onChange={(e) => setBottomOffset(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label>Right Margin (mm)</Label>
            <Input
              type="number"
              min="0"
              value={rightOffset}
              onChange={(e) => setRightOffset(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button onClick={handlePreview}>
          <Eye className="h-4 w-4 mr-2" />
          Preview Labels
        </Button>
        <Button onClick={handlePrint} variant="outline">
          Print
        </Button>
        <Button onClick={handleExportPDF} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export PDF
        </Button>
        <Button 
          onClick={handleSaveAsDefault} 
          variant={selectedLabelTemplate && isTemplateDefault(selectedLabelTemplate) ? "default" : "secondary"}
        >
          <Save className="h-4 w-4 mr-2" />
          {selectedLabelTemplate && isTemplateDefault(selectedLabelTemplate) ? (
            <>
              <Check className="h-4 w-4 mr-1" />
              Current Default
            </>
          ) : (
            "Save as Default Format"
          )}
        </Button>
      </div>

      {/* Preview Dialog */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Label Preview</DialogTitle>
            <DialogDescription>
              Review your labels before printing. This is how they will appear on the sheet.
            </DialogDescription>
          </DialogHeader>
          <div 
            id="previewArea" 
            className="mt-4 border rounded-md p-4 bg-white"
            ref={(el) => {
              if (el && isPreviewDialogOpen) {
                generatePreview("previewArea");
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewDialogOpen(false)}>
              Close
            </Button>
            <Button variant="outline" onClick={() => {
              setIsPreviewDialogOpen(false);
              setTimeout(handleExportPDF, 300);
            }}>
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
            <Button onClick={() => {
              setIsPreviewDialogOpen(false);
              setTimeout(handlePrint, 300);
            }}>
              Print Labels
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Area (hidden, used for printing) */}
      <div id="printArea" className="hidden"></div>

      <style>{`
        #printArea {
          width: 210mm;
          min-height: 297mm;
          padding: 0;
          margin: 0;
        }

        .label-grid {
          display: grid;
          grid-template-columns: repeat(8, 33mm);
          grid-auto-rows: 19mm;
          gap: 1mm;
        }

        .label-cell {
          padding: 0.5mm 1.5mm;
          text-align: center;
          font-size: 9px;
          line-height: 1.05;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          box-sizing: border-box;
          page-break-inside: avoid;
        }

        .brand { 
          font-weight: 800; 
          text-transform: uppercase;
          width: 100%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.1;
          margin-bottom: 0.5mm;
        }
        
        .prod { 
          font-weight: 600; 
          font-size: 8.5px; 
          width: 100%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 0.5mm;
        }
        
        .mrp { 
          font-weight: 700; 
          font-size: 9px;
          margin: 0.5mm 0;
        }
        
        .meta { 
          font-size: 8px;
          font-family: monospace;
          line-height: 1;
          margin: 0.5mm 0;
        }
        
        .barcode-text {
          margin-top: -0.5mm !important;
          margin-bottom: 0.5mm;
        }

        svg.barcode {
          width: 100%;
          height: 24px;
          flex-grow: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          max-width: 100%;
          margin: 1mm 0 0.5mm 0;
        }

        .supplier-code {
          font-family: monospace;
          line-height: 1;
          margin-top: 0.5mm;
          color: #666;
        }

        .bill-num {
          font-family: monospace;
          font-size: 6px;
          line-height: 1;
          color: #888;
        }

        @page { 
          size: A4; 
          margin: 3mm 0 0 0;
        }
        
        @media print {
          body * { visibility: hidden; }
          #printArea, #printArea * { visibility: visible; }
          #printArea { 
            position: absolute; 
            left: 0; 
            top: 0;
            display: block !important;
          }
          
          .label-grid {
            page-break-after: auto;
          }
          
          .label-cell {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          /* Ensure business name and all fields print on every page */
          .brand, .prod, .mrp, .meta, .barcode, .supplier-code, .bill-num {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
