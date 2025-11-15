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
import { Check, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";

interface LabelItem {
  sku_id: string;
  product_name: string;
  brand: string;
  color: string;
  style: string;
  size: string;
  sale_price: number;
  barcode: string;
  qty: number;
}

interface SearchResult {
  id: string;
  product_name: string;
  brand: string;
  color: string;
  style: string;
  size: string;
  sale_price: number;
  barcode: string;
  stock_qty: number;
}

interface CustomPreset {
  name: string;
  width: number;
  height: number;
  cols: number;
  rows: number;
  gap: number;
}

type SheetType = "novajet48" | "novajet40" | "novajet65" | "a4_12x4" | "custom";
type DesignFormat = "BT1" | "BT2" | "BT3" | "BT4";
type QuantityMode = "manual" | "lastPurchase" | "byBill";

const sheetPresets = {
  novajet48: { cols: 8, width: "33mm", height: "19mm", gap: "1mm" },
  novajet40: { cols: 8, width: "35mm", height: "25mm", gap: "1mm" },
  novajet65: { cols: 5, width: "38mm", height: "21mm", gap: "1mm" },
  a4_12x4: { cols: 4, width: "50mm", height: "24mm", gap: "1mm" },
  custom: { cols: 4, width: "50mm", height: "25mm", gap: "2mm" }, // default values
};

export default function BarcodePrinting() {
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [labelItems, setLabelItems] = useState<LabelItem[]>([]);
  const [quantityMode, setQuantityMode] = useState<QuantityMode>("manual");
  const [billNumber, setBillNumber] = useState("");
  const [sheetType, setSheetType] = useState<SheetType>("novajet48");
  const [designFormat, setDesignFormat] = useState<DesignFormat>("BT1");
  const [topOffset, setTopOffset] = useState(0);
  const [leftOffset, setLeftOffset] = useState(0);
  
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
  }, []);

  // Pre-fill items from purchase entry if passed via navigation state
  useEffect(() => {
    if (location.state?.purchaseItems) {
      const purchaseItems = location.state.purchaseItems;
      const items: LabelItem[] = purchaseItems.map((item: any) => ({
        sku_id: item.sku_id,
        product_name: item.product_name,
        brand: item.brand || "",
        color: item.color || "",
        style: item.style || "",
        size: item.size,
        sale_price: item.sale_price,
        barcode: item.barcode,
        qty: item.qty,
      }));
      setLabelItems(items);
      toast.success(`Loaded ${items.length} items from purchase bill`);
    }
  }, [location.state]);

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
      color: result.color,
      style: result.style,
      size: result.size,
      sale_price: result.sale_price,
      barcode: result.barcode,
      qty: 0,
    };

    setLabelItems(prev => [...prev, newItem]);
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
      const { data: latestBill } = await supabase
        .from("purchase_bills")
        .select("id, bill_date")
        .order("bill_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!latestBill) return;

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
      const { data: billData } = await supabase
        .from("purchase_bills")
        .select("id")
        .or(`id.eq.${billNumber},supplier_invoice_no.ilike.%${billNumber}%`)
        .limit(1)
        .single();

      if (!billData) return;

      const { data: itemData } = await supabase
        .from("purchase_items")
        .select("qty, sku_id, barcode")
        .eq("bill_id", billData.id)
        .or(`sku_id.eq.${item.sku_id},barcode.eq.${item.barcode}`)
        .limit(1)
        .single();

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

    if (labelItems.length === 0) {
      toast.error("Please add products first");
      return;
    }

    try {
      const { data: billData, error: billError } = await supabase
        .from("purchase_bills")
        .select("id, supplier_invoice_no, bill_date")
        .or(`id.eq.${billNumber},supplier_invoice_no.ilike.%${billNumber}%`)
        .limit(1)
        .single();

      if (billError || !billData) {
        toast.error("Bill not found");
        return;
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from("purchase_items")
        .select("barcode, sku_id, qty")
        .eq("bill_id", billData.id);

      if (itemsError) throw itemsError;

      const quantityMapByBarcode = new Map<string, number>();
      const quantityMapBySku = new Map<string, number>();
      
      (itemsData || []).forEach((item) => {
        if (item.barcode) {
          quantityMapByBarcode.set(item.barcode, item.qty);
        }
        if (item.sku_id) {
          quantityMapBySku.set(item.sku_id, item.qty);
        }
      });

      setLabelItems((prev) =>
        prev.map((item) => {
          const qty = quantityMapBySku.get(item.sku_id) || quantityMapByBarcode.get(item.barcode) || 0;
          return { ...item, qty };
        })
      );

      toast.success(`Loaded quantities from bill ${billData.supplier_invoice_no || billData.id}`);
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
      novajet40: 5,
      novajet65: 13,
      a4_12x4: 12,
    };
    setCustomRows(rowsMap[sheetType] || 12);
    
    setSheetType("custom");
    toast.success("Preset copied to custom. You can now edit and save it.");
  };

  const getLabelHTML = (item: LabelItem, format: DesignFormat) => {
    const barcode = item.barcode || genEAN8();

    switch (format) {
      case "BT1":
        return `
          <div class="brand">SMART INVENTORY</div>
          <div class="prod">${item.product_name} (${item.size})</div>
          <div class="mrp">MRP: ₹${item.sale_price}</div>
          <svg class="barcode" data-code="${barcode}"></svg>
          <div class="meta">${barcode}</div>
        `;
      case "BT2":
        return `
          <div class="brand">SMART INVENTORY</div>
          <div class="prod" style="font-size: 9.5px">${item.product_name} (${item.size})</div>
          <svg class="barcode" data-code="${barcode}"></svg>
          <div class="meta">${barcode}</div>
        `;
      case "BT3":
        return `
          <div class="brand">SMART INVENTORY</div>
          <div class="mrp" style="font-size: 11px">MRP: ₹${item.sale_price}</div>
          <svg class="barcode" data-code="${barcode}"></svg>
          <div class="meta">${barcode}</div>
        `;
      case "BT4":
        return `
          <div class="brand" style="font-size: 8px">SMART INVENTORY</div>
          <div class="prod" style="font-size: 7.5px">${item.product_name} (${item.size})</div>
          <div class="mrp" style="font-size: 8px">MRP: ₹${item.sale_price}</div>
          <svg class="barcode" data-code="${barcode}" style="height: 20px"></svg>
          <div class="meta" style="font-size: 7px">${barcode}</div>
        `;
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

    const printArea = document.getElementById("printArea");
    if (!printArea) return;

    // Use custom dimensions if custom sheet type, otherwise use preset
    const dimensions = sheetType === "custom"
      ? { cols: customCols, width: `${customWidth}mm`, height: `${customHeight}mm`, gap: `${customGap}mm` }
      : sheetPresets[sheetType];
    
    printArea.innerHTML = "";

    const gridDiv = document.createElement("div");
    gridDiv.className = "label-grid";
    gridDiv.style.cssText = `
      display: grid;
      grid-template-columns: repeat(${dimensions.cols}, ${dimensions.width});
      grid-auto-rows: ${dimensions.height};
      gap: ${dimensions.gap};
      padding-top: ${topOffset}mm;
      padding-left: ${leftOffset}mm;
    `;

    labelItems.forEach((item) => {
      const qty = Number(item.qty) || 0;
      for (let i = 0; i < qty; i++) {
        const cell = document.createElement("div");
        cell.className = "label-cell";
        cell.innerHTML = getLabelHTML(item, designFormat);
        gridDiv.appendChild(cell);
      }
    });

    printArea.appendChild(gridDiv);

    // Render barcodes
    setTimeout(() => {
      const barcodes = printArea.querySelectorAll("svg.barcode");
      barcodes.forEach((svg) => {
        const code = (svg as HTMLElement).dataset.code;
        if (code) {
          try {
            // Use CODE128 format which is more flexible and doesn't require specific checksums
            JsBarcode(svg, code, {
              format: "CODE128",
              fontSize: 9,
              height: 24,
              width: 1.5,
              textMargin: 0,
              margin: 0,
              displayValue: false,
            });
          } catch (error) {
            console.error("Barcode generation failed for code:", code, error);
            // Fallback: display the code as text if barcode generation fails
            const textEl = document.createElement("div");
            textEl.textContent = code;
            textEl.style.cssText = "font-size: 10px; font-weight: bold;";
            svg.parentElement?.replaceChild(textEl, svg);
          }
        }
      });
    }, 100);

    toast.success("Preview generated! Scroll down to see labels.");
  };

  const handlePrint = () => {
    const printArea = document.getElementById("printArea");
    if (!printArea || !printArea.innerHTML.trim()) {
      toast.error("Please generate a preview first");
      return;
    }

    window.print();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BackToDashboard />
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
          <div className="flex gap-2">
            <Input
              placeholder="Enter bill number or ID"
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
            />
            <Button onClick={handleLoadByBill}>Load</Button>
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
              <Select value={sheetType} onValueChange={(v) => setSheetType(v as SheetType)}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="novajet48">Novajet 48 (33mm × 19mm, 8 cols - A4 Vertical)</SelectItem>
                  <SelectItem value="novajet40">Novajet 40 (35mm × 25mm, 8 cols - A4 Vertical)</SelectItem>
                  <SelectItem value="novajet65">Novajet 65 (38mm × 21mm, 5 cols - A4 Vertical)</SelectItem>
                  <SelectItem value="a4_12x4">A4 48-Sheet (50mm × 24mm, 4×12)</SelectItem>
                  <SelectItem value="custom">Custom Dimensions</SelectItem>
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
          </div>

          {sheetType === "custom" && (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Custom Label Dimensions</h3>
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
                  <h4 className="font-semibold text-sm">Saved Presets</h4>
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
                </div>
                
                {savedPresets.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Select value={selectedPreset} onValueChange={handleLoadPreset}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Load a saved preset..." />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          {savedPresets.map((preset) => (
                            <SelectItem key={preset.name} value={preset.name}>
                              {preset.name} ({preset.width}×{preset.height}mm, {preset.cols}×{preset.rows})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedPreset && (
                        <>
                          <Button 
                            size="icon" 
                            variant="outline" 
                            onClick={handleEditPreset}
                            title="Edit selected preset"
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="destructive" 
                            onClick={handleDeletePreset}
                            title="Delete selected preset"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No saved presets yet. Configure your dimensions and save them for quick reuse.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Design Format</Label>
            <Select value={designFormat} onValueChange={(v) => setDesignFormat(v as DesignFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BT1">BT1 Branded Tag (Full Details)</SelectItem>
                <SelectItem value="BT2">BT2 Minimal (No MRP)</SelectItem>
                <SelectItem value="BT3">BT3 Bold MRP</SelectItem>
                <SelectItem value="BT4">BT4 Compact</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Top Offset (mm)</Label>
            <Input
              type="number"
              min="0"
              value={topOffset}
              onChange={(e) => setTopOffset(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label>Left Offset (mm)</Label>
            <Input
              type="number"
              min="0"
              value={leftOffset}
              onChange={(e) => setLeftOffset(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button onClick={handlePreview}>Preview Labels</Button>
        <Button onClick={handlePrint} variant="outline">
          Print
        </Button>
      </div>

      {/* Print Area */}
      <div id="printArea" className="mt-8"></div>

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
          padding: 1mm;
          text-align: center;
          font-size: 9px;
          line-height: 1.05;
          overflow: hidden;
        }

        .brand { font-weight: 800; }
        .prod { font-weight: 600; font-size: 8.5px; }
        .mrp { font-weight: 700; font-size: 9px; }
        .meta { font-size: 8px; }

        svg.barcode {
          width: 100%;
          height: 24px;
        }

        @page { size: A4; margin: 0; }
        @media print {
          body * { visibility: hidden; }
          #printArea, #printArea * { visibility: visible; }
          #printArea { position: absolute; left: 0; top: 0; }
        }
      `}</style>
    </div>
  );
}
