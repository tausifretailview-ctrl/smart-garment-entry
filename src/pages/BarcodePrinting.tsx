import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import JsBarcode from "jsbarcode";

interface LabelItem {
  skuId: string;
  productId: string;
  productName: string;
  brand: string;
  size: string;
  mrp: number;
  barcode: string;
  qty: number;
}

type SheetType = "novajet48" | "novajet40" | "label65";
type DesignFormat = "BT1" | "BT2" | "BT3" | "BT4";
type QuantityMode = "manual" | "lastPurchase" | "byBill";

const sheetPresets = {
  novajet48: { cols: 8, width: "33mm", height: "19mm", gap: "1mm" },
  novajet40: { cols: 8, width: "35mm", height: "25mm", gap: "1mm" },
  label65: { cols: 5, width: "38mm", height: "21mm", gap: "1mm" },
};

export default function BarcodePrinting() {
  const [searchQuery, setSearchQuery] = useState("");
  const [labelItems, setLabelItems] = useState<LabelItem[]>([]);
  const [quantityMode, setQuantityMode] = useState<QuantityMode>("manual");
  const [billNumber, setBillNumber] = useState("");
  const [sheetType, setSheetType] = useState<SheetType>("novajet48");
  const [designFormat, setDesignFormat] = useState<DesignFormat>("BT1");
  const [topOffset, setTopOffset] = useState(0);
  const [leftOffset, setLeftOffset] = useState(0);

  const genEAN8 = () => {
    const seven = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10));
    const sum = seven[0] * 3 + seven[1] + seven[2] * 3 + seven[3] + seven[4] * 3 + seven[5] + seven[6] * 3;
    const chk = (10 - (sum % 10)) % 10;
    return seven.join("") + String(chk);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query");
      return;
    }

    try {
      const { data: matchingProducts } = await supabase
        .from("products")
        .select("id")
        .or(`product_name.ilike.%${searchQuery}%,brand.ilike.%${searchQuery}%`);

      const productIds = matchingProducts?.map((p) => p.id) || [];

      let variantsQuery = supabase
        .from("product_variants")
        .select(
          `
          id,
          size,
          sale_price,
          barcode,
          product_id,
          products (
            id,
            product_name,
            brand
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

      const { data, error } = await variantsQuery;

      if (error) throw error;

      const items: LabelItem[] = (data || []).map((v: any) => ({
        skuId: v.id,
        productId: v.products?.id || "",
        productName: v.products?.product_name || "",
        brand: v.products?.brand || "",
        size: v.size,
        mrp: v.sale_price || 0,
        barcode: v.barcode || "",
        qty: 0,
      }));

      setLabelItems(items);

      if (quantityMode === "lastPurchase") {
        await fillLastPurchaseQuantities(items);
      }

      toast.success(`Found ${items.length} product variant(s)`);
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to search products");
    }
  };

  const fillLastPurchaseQuantities = async (items: LabelItem[]) => {
    try {
      const { data, error } = await supabase.rpc("get_latest_purchase_quantities" as any);

      if (error) {
        // Fallback to manual query if function doesn't exist
        const { data: purchaseData } = await supabase
          .from("purchase_items")
          .select(
            `
            barcode,
            qty,
            size,
            product_id,
            purchase_bills!inner (
              bill_date,
              created_at
            )
          `
          )
          .order("purchase_bills.bill_date", { ascending: false })
          .order("purchase_bills.created_at", { ascending: false });

        if (purchaseData) {
          const latestByBarcode = new Map<string, number>();
          purchaseData.forEach((item: any) => {
            if (item.barcode && !latestByBarcode.has(item.barcode)) {
              latestByBarcode.set(item.barcode, item.qty);
            }
          });

          setLabelItems((prev) =>
            prev.map((item) => ({
              ...item,
              qty: latestByBarcode.get(item.barcode) || 0,
            }))
          );
        }
        return;
      }

      const quantityMap = new Map<string, number>();
      (data || []).forEach((row: any) => {
        quantityMap.set(row.barcode, row.qty);
      });

      setLabelItems((prev) =>
        prev.map((item) => ({
          ...item,
          qty: quantityMap.get(item.barcode) || 0,
        }))
      );
    } catch (error) {
      console.error("Failed to fill last purchase quantities:", error);
    }
  };

  const handleLoadByBill = async () => {
    if (!billNumber.trim()) {
      toast.error("Please enter a bill number or ID");
      return;
    }

    try {
      const { data: billData, error: billError } = await supabase
        .from("purchase_bills")
        .select("id")
        .or(`id.eq.${billNumber},supplier_invoice_no.ilike.%${billNumber}%`)
        .limit(1)
        .maybeSingle();

      if (billError) throw billError;

      if (!billData) {
        toast.error("Bill not found");
        return;
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from("purchase_items")
        .select("barcode, size, product_id, qty")
        .eq("bill_id", billData.id);

      if (itemsError) throw itemsError;

      const quantityMap = new Map<string, number>();
      (itemsData || []).forEach((item) => {
        const key = item.barcode || `${item.product_id}-${item.size}`;
        quantityMap.set(key, item.qty);
      });

      setLabelItems((prev) =>
        prev.map((item) => {
          const key = item.barcode || `${item.productId}-${item.size}`;
          return {
            ...item,
            qty: quantityMap.get(key) || 0,
          };
        })
      );

      toast.success(`Loaded quantities from bill`);
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to load bill data");
    }
  };

  const handleQtyChange = (skuId: string, newQty: number) => {
    setLabelItems((prev) =>
      prev.map((item) => (item.skuId === skuId ? { ...item, qty: Math.max(0, newQty) } : item))
    );
  };

  const handleClearAll = () => {
    setLabelItems([]);
    setSearchQuery("");
    toast.success("Cleared all labels");
  };

  const renderLabelCell = (item: LabelItem, format: DesignFormat) => {
    const barcode = item.barcode || genEAN8();

    switch (format) {
      case "BT1":
        return (
          <div className="label-cell" key={`${item.skuId}-${Math.random()}`}>
            <div className="brand">SMART INVENTORY</div>
            <div className="prod">
              {item.productName} ({item.size})
            </div>
            <div className="mrp">MRP: ₹{item.mrp}</div>
            <svg className="barcode" data-code={barcode}></svg>
            <div className="meta">{barcode}</div>
          </div>
        );
      case "BT2":
        return (
          <div className="label-cell" key={`${item.skuId}-${Math.random()}`}>
            <div className="brand">SMART INVENTORY</div>
            <div className="prod" style={{ fontSize: "9.5px" }}>
              {item.productName} ({item.size})
            </div>
            <svg className="barcode" data-code={barcode}></svg>
            <div className="meta">{barcode}</div>
          </div>
        );
      case "BT3":
        return (
          <div className="label-cell" key={`${item.skuId}-${Math.random()}`}>
            <div className="brand">SMART INVENTORY</div>
            <div className="mrp" style={{ fontSize: "11px" }}>
              MRP: ₹{item.mrp}
            </div>
            <svg className="barcode" data-code={barcode}></svg>
            <div className="meta">{barcode}</div>
          </div>
        );
      case "BT4":
        return (
          <div className="label-cell" key={`${item.skuId}-${Math.random()}`} style={{ fontSize: "7.5px" }}>
            <div className="brand" style={{ fontSize: "8px" }}>
              SMART INVENTORY
            </div>
            <div className="prod" style={{ fontSize: "7.5px" }}>
              {item.productName} ({item.size})
            </div>
            <div className="mrp" style={{ fontSize: "8px" }}>
              MRP: ₹{item.mrp}
            </div>
            <svg className="barcode" data-code={barcode} style={{ height: "20px" }}></svg>
            <div className="meta" style={{ fontSize: "7px" }}>
              {barcode}
            </div>
          </div>
        );
    }
  };

  const handlePreview = () => {
    const hasLabels = labelItems.some((item) => item.qty > 0);
    if (!hasLabels) {
      toast.error("Please add at least one label with quantity > 0");
      return;
    }

    // Validate barcodes
    for (const item of labelItems) {
      if (item.qty > 0 && item.barcode && item.barcode.length !== 8) {
        toast.error(`Invalid barcode length for ${item.productName} - ${item.size}`);
        return;
      }
    }

    const printArea = document.getElementById("printArea");
    if (!printArea) return;

    const preset = sheetPresets[sheetType];
    printArea.innerHTML = "";

    const gridDiv = document.createElement("div");
    gridDiv.className = "label-grid";
    gridDiv.style.cssText = `
      display: grid;
      grid-template-columns: repeat(${preset.cols}, ${preset.width});
      grid-auto-rows: ${preset.height};
      gap: ${preset.gap};
      padding-top: ${topOffset}mm;
      padding-left: ${leftOffset}mm;
    `;

    labelItems.forEach((item) => {
      for (let i = 0; i < item.qty; i++) {
        const cell = document.createElement("div");
        cell.innerHTML = renderLabelCell(item, designFormat)?.props.children || "";
        gridDiv.appendChild(cell.firstChild as Node);
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
            JsBarcode(svg, code, {
              format: "EAN8",
              fontSize: 9,
              height: 24,
              textMargin: 0,
              margin: 0,
              displayValue: false,
            });
          } catch (error) {
            console.error("Barcode generation failed:", error);
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
      <h1 className="text-3xl font-bold">Barcode Printing</h1>

      {/* Search Bar */}
      <div className="flex gap-2">
        <Input
          placeholder="Search product, brand, size, or barcode"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button onClick={handleSearch}>Search</Button>
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
                <TableHead>Size</TableHead>
                <TableHead>MRP</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Label Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {labelItems.map((item) => (
                <TableRow key={item.skuId}>
                  <TableCell>{item.productName}</TableCell>
                  <TableCell>{item.size}</TableCell>
                  <TableCell>₹{item.mrp}</TableCell>
                  <TableCell>{item.barcode || "(auto-generate)"}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      value={item.qty}
                      onChange={(e) => handleQtyChange(item.skuId, parseInt(e.target.value) || 0)}
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
            <Select value={sheetType} onValueChange={(v) => setSheetType(v as SheetType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="novajet48">Novajet48 (33mm × 19mm, 8×6)</SelectItem>
                <SelectItem value="novajet40">Novajet40 (35mm × 25mm, 8×5)</SelectItem>
                <SelectItem value="label65">Label65 (38mm × 21mm, 5×13)</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
        .label-cell {
          padding: 1mm;
          text-align: center;
          line-height: 1.05;
          font-size: 9px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          border: 1px solid #e0e0e0;
        }
        .brand {
          font-weight: 800;
          font-size: 9px;
          letter-spacing: 0.2px;
        }
        .prod {
          font-weight: 600;
          font-size: 8.5px;
        }
        .meta {
          font-size: 8px;
        }
        .mrp {
          font-weight: 700;
          font-size: 9px;
        }
        svg.barcode {
          width: 100%;
          height: 24px;
        }

        @page {
          size: A4;
          margin: 0;
        }
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body * {
            visibility: hidden;
          }
          #printArea,
          #printArea * {
            visibility: visible;
          }
          #printArea {
            position: absolute;
            left: 0;
            top: 0;
            width: 210mm;
            height: 297mm;
          }
          .label-cell {
            border: none;
          }
        }
      `}</style>
    </div>
  );
}
