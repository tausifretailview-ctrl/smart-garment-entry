import { useState, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Save, RotateCcw, ZoomIn, ZoomOut, Move } from "lucide-react";
import { LabelDesignConfig, LabelFieldConfig, FieldKey } from "@/types/labelTypes";
import { DraggableLabelCanvas } from "./DraggableLabelCanvas";

interface PrecisionLabelDesignerProps {
  labelWidth: number;
  labelHeight: number;
  config: LabelDesignConfig;
  onConfigChange: (config: LabelDesignConfig) => void;
  onSave?: () => void;
}

const FIELD_LABELS: Record<FieldKey, string> = {
  businessName: "Business Name",
  brand: "Brand",
  productName: "Product Name",
  category: "Category",
  color: "Color",
  style: "Style",
  size: "Size",
  price: "Sale Price",
  mrp: "MRP",
  customText: "Custom Text",
  barcode: "Barcode",
  barcodeText: "Barcode Text",
  billNumber: "Bill Number",
  supplierCode: "Supplier Code",
  purchaseCode: "Purchase Code",
};

const DEFAULT_PRECISION_CONFIG: LabelDesignConfig = {
  brand: { show: true, fontSize: 8, bold: true, x: 1, y: 0.5, width: 48, textAlign: "center" },
  businessName: { show: false, fontSize: 7, bold: true, x: 1, y: 0, width: 48, textAlign: "center" },
  productName: { show: true, fontSize: 9, bold: true, x: 1, y: 3.5, width: 48, textAlign: "center" },
  category: { show: false, fontSize: 7, bold: false, x: 1, y: 6, width: 20 },
  color: { show: false, fontSize: 7, bold: false, x: 1, y: 6, width: 20 },
  style: { show: false, fontSize: 7, bold: false, x: 25, y: 6, width: 20 },
  size: { show: true, fontSize: 8, bold: true, x: 1, y: 7, width: 15 },
  price: { show: true, fontSize: 9, bold: true, x: 30, y: 7, width: 18, textAlign: "right" },
  mrp: { show: false, fontSize: 7, bold: false, x: 30, y: 9, width: 18, textAlign: "right" },
  customText: { show: false, fontSize: 7, bold: false, x: 1, y: 22, width: 48, textAlign: "center" },
  barcode: { show: true, fontSize: 9, bold: false, x: 3, y: 10, width: 44, height: 8 },
  barcodeText: { show: true, fontSize: 7, bold: false, x: 1, y: 19, width: 48, textAlign: "center" },
  billNumber: { show: false, fontSize: 6, bold: false, x: 1, y: 22, width: 20 },
  supplierCode: { show: false, fontSize: 6, bold: false, x: 25, y: 22, width: 24 },
  purchaseCode: { show: false, fontSize: 6, bold: false, x: 1, y: 23, width: 20 },
  fieldOrder: ["businessName", "brand", "productName", "category", "color", "style", "size", "price", "mrp", "barcode", "barcodeText", "customText", "billNumber", "supplierCode", "purchaseCode"],
  barcodeHeight: 30,
  barcodeWidth: 1.5,
  customTextValue: "",
};

const SAMPLE_ITEM = {
  product_name: "Cotton T-Shirt Premium",
  brand: "StyleMax",
  category: "Clothing",
  color: "Blue",
  style: "Casual",
  size: "L",
  sale_price: 599,
  mrp: 799,
  barcode: "8901234567890",
  bill_number: "PB-2024-001",
  supplier_code: "SUP-101",
  purchase_code: "ABC",
};

export function PrecisionLabelDesigner({
  labelWidth,
  labelHeight,
  config,
  onConfigChange,
  onSave,
}: PrecisionLabelDesignerProps) {
  const [activeField, setActiveField] = useState<FieldKey | null>(null);
  const [zoom, setZoom] = useState(3);

  const updateField = useCallback(
    (key: FieldKey, updates: Partial<LabelFieldConfig>) => {
      onConfigChange({
        ...config,
        [key]: { ...config[key], ...updates },
      });
    },
    [config, onConfigChange]
  );

  const handleFieldDrag = useCallback(
    (key: FieldKey, x: number, y: number) => {
      updateField(key, { x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 });
    },
    [updateField]
  );

  const resetToDefault = () => {
    onConfigChange({
      ...DEFAULT_PRECISION_CONFIG,
      brand: { ...DEFAULT_PRECISION_CONFIG.brand, width: labelWidth - 2 },
      productName: { ...DEFAULT_PRECISION_CONFIG.productName, width: labelWidth - 2 },
      barcodeText: { ...DEFAULT_PRECISION_CONFIG.barcodeText, width: labelWidth - 2 },
      customText: { ...DEFAULT_PRECISION_CONFIG.customText, width: labelWidth - 2 },
      barcode: { ...DEFAULT_PRECISION_CONFIG.barcode, width: labelWidth - 6, x: 3 },
      price: { ...DEFAULT_PRECISION_CONFIG.price, x: labelWidth - 20 },
    });
  };

  const allFieldKeys: FieldKey[] = config.fieldOrder || Object.keys(FIELD_LABELS).filter(k => k !== "fieldOrder") as FieldKey[];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Field Controls */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Field Layout</h3>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={resetToDefault} className="h-7 text-xs">
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
            {onSave && (
              <Button size="sm" onClick={onSave} className="h-7 text-xs">
                <Save className="h-3 w-3 mr-1" />
                Save
              </Button>
            )}
          </div>
        </div>

        {/* Custom Text Value */}
        <div className="space-y-1">
          <Label className="text-xs">Custom Text Value</Label>
          <Input
            value={config.customTextValue || ""}
            onChange={(e) => onConfigChange({ ...config, customTextValue: e.target.value })}
            placeholder="e.g. Non-Returnable"
            className="h-8 text-xs"
          />
        </div>

        {/* Barcode settings */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Barcode Height (px)</Label>
            <Input
              type="number"
              min={10}
              max={100}
              value={config.barcodeHeight ?? 30}
              onChange={(e) => onConfigChange({ ...config, barcodeHeight: parseInt(e.target.value) || 30 })}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Barcode Line Width</Label>
            <Input
              type="number"
              min={0.5}
              max={4}
              step={0.1}
              value={config.barcodeWidth ?? 1.5}
              onChange={(e) => onConfigChange({ ...config, barcodeWidth: parseFloat(e.target.value) || 1.5 })}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <ScrollArea className="h-[400px] pr-2">
          <div className="space-y-2">
            {allFieldKeys.map((key) => {
              const field = config[key] as LabelFieldConfig;
              if (!field) return null;
              const isActive = activeField === key;

              return (
                <Card
                  key={key}
                  className={`cursor-pointer transition-colors ${isActive ? "border-primary" : "border-border"}`}
                  onClick={() => setActiveField(isActive ? null : key)}
                >
                  <CardContent className="p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={field.show}
                          onCheckedChange={(v) => updateField(key, { show: v })}
                          className="scale-75"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-xs font-medium">{FIELD_LABELS[key]}</span>
                      </div>
                      {field.show && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Move className="h-2.5 w-2.5" />
                          ({field.x ?? 0}, {field.y ?? 0}) mm
                        </span>
                      )}
                    </div>

                    {isActive && field.show && (
                      <div className="grid grid-cols-4 gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-0.5">
                          <Label className="text-[10px]">X (mm)</Label>
                          <Input
                            type="number"
                            step={0.5}
                            value={field.x ?? 0}
                            onChange={(e) => updateField(key, { x: parseFloat(e.target.value) || 0 })}
                            className="h-7 text-xs px-1.5"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px]">Y (mm)</Label>
                          <Input
                            type="number"
                            step={0.5}
                            value={field.y ?? 0}
                            onChange={(e) => updateField(key, { y: parseFloat(e.target.value) || 0 })}
                            className="h-7 text-xs px-1.5"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px]">Size (pt)</Label>
                          <Input
                            type="number"
                            min={4}
                            max={24}
                            value={field.fontSize}
                            onChange={(e) => updateField(key, { fontSize: parseInt(e.target.value) || 8 })}
                            className="h-7 text-xs px-1.5"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px]">W (mm)</Label>
                          <Input
                            type="number"
                            step={1}
                            value={field.width ?? labelWidth - 2}
                            onChange={(e) => updateField(key, { width: parseFloat(e.target.value) || 20 })}
                            className="h-7 text-xs px-1.5"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 col-span-2">
                          <Switch
                            checked={field.bold}
                            onCheckedChange={(v) => updateField(key, { bold: v })}
                            className="scale-75"
                          />
                          <Label className="text-[10px]">Bold</Label>
                        </div>
                        <div className="col-span-2">
                          <Select
                            value={field.textAlign || "left"}
                            onValueChange={(v) => updateField(key, { textAlign: v as 'left' | 'center' | 'right' })}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">Left</SelectItem>
                              <SelectItem value="center">Center</SelectItem>
                              <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {key === "barcode" && (
                          <div className="space-y-0.5 col-span-2">
                            <Label className="text-[10px]">H (mm)</Label>
                            <Input
                              type="number"
                              step={1}
                              min={3}
                              max={30}
                              value={field.height ?? 8}
                              onChange={(e) => updateField(key, { height: parseFloat(e.target.value) || 8 })}
                              className="h-7 text-xs px-1.5"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Live Preview with Drag */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Live Preview (drag fields to reposition)</h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(1, z - 0.5))}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground w-8 text-center">{zoom}×</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(6, z + 0.5))}>
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <DraggableLabelCanvas
          item={SAMPLE_ITEM}
          width={labelWidth}
          height={labelHeight}
          config={config}
          zoom={zoom}
          activeField={activeField}
          onFieldSelect={setActiveField}
          onFieldDrag={handleFieldDrag}
        />

        <div className="text-xs text-muted-foreground text-center">
          Actual size: {labelWidth}mm × {labelHeight}mm • Click a field to select, drag to move
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_PRECISION_CONFIG };
