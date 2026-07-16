import { useState, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Save, RotateCcw, ZoomIn, ZoomOut, Move, Plus, Trash2, Minus, ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from "lucide-react";
import { LabelDesignConfig, LabelFieldConfig, LabelLineConfig, FieldKey, LabelItem, CustomTextSlot } from "@/types/labelTypes";
import { DraggableLabelCanvas } from "./DraggableLabelCanvas";
import { getUOMLabel, getUOMFullLabel } from "@/constants/uom";
import {
  createCustomTextSlot,
  getCustomTextFields,
  migrateCustomTextFields,
  usesCustomTextFields,
} from "@/utils/labelCustomText";
import type { ProductFieldsConfig } from "@/utils/productFieldSettingsForLabels";
import {
  buildLabelDesignerFieldLabels,
  filterLabelFieldKeys,
} from "@/utils/productFieldSettingsForLabels";
import {
  applyLabelDesignerShift,
  captureLabelDesignerPositions,
  nudgeLabelDesignerConfig,
  type LabelDesignerPositionSnapshot,
} from "@/utils/labelDesignerGroupMove";

interface PrecisionLabelDesignerProps {
  labelWidth: number;
  labelHeight: number;
  config: LabelDesignConfig;
  onConfigChange: (config: LabelDesignConfig) => void;
  onSave?: () => void;
  sampleItem?: LabelItem;
  defaultUom?: string;
  /** Settings → Product Entry Form Fields (labels + enabled flags) */
  productFieldSettings?: ProductFieldsConfig | null;
  /** When 2, show side-by-side designer canvases matching thermal 2-up print */
  thermalCols?: number;
  horizontalGap?: number;
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
  qty: "Qty (UOM)",
  customText: "Custom Text",
  barcode: "Barcode",
  barcodeText: "Barcode Text",
  billNumber: "Bill Number",
  supplierCode: "Supplier Code",
  purchaseCode: "Purchase Code",
  supplierInvoiceNo: "Supplier Invoice No",
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
  qty: { show: false, fontSize: 7, bold: false, x: 1, y: 9, width: 20 },
  customText: { show: false, fontSize: 7, bold: false, x: 1, y: 22, width: 48, textAlign: "center" },
  barcode: { show: true, fontSize: 9, bold: false, x: 3, y: 10, width: 44, height: 8 },
  barcodeText: { show: true, fontSize: 7, bold: false, x: 1, y: 19, width: 48, textAlign: "center" },
  billNumber: { show: false, fontSize: 6, bold: false, x: 1, y: 22, width: 20 },
  supplierCode: { show: false, fontSize: 6, bold: false, x: 25, y: 22, width: 24 },
  purchaseCode: { show: false, fontSize: 6, bold: false, x: 1, y: 23, width: 20 },
  supplierInvoiceNo: { show: false, fontSize: 6, bold: false, x: 25, y: 23, width: 24 },
  fieldOrder: ["businessName", "brand", "productName", "category", "color", "style", "size", "price", "mrp", "qty", "barcode", "barcodeText", "customText", "billNumber", "supplierCode", "purchaseCode", "supplierInvoiceNo"],
  barcodeHeight: 30,
  barcodeWidth: 1.5,
  customTextValue: "",
  customTextFields: [],
  lines: [],
};

const SAMPLE_ITEM = {
  product_name: "Cotton T-Shirt Premium",
  brand: "StyleMax",
  businessName: "My Store",
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
  supplier_invoice_no: "INV-2024-001",
  qty: 10,
  uom: "NOS",
};

export function PrecisionLabelDesigner({
  labelWidth,
  labelHeight,
  config,
  onConfigChange,
  onSave,
  sampleItem,
  defaultUom = "NOS",
  productFieldSettings = null,
  thermalCols = 1,
  horizontalGap = 0,
}: PrecisionLabelDesignerProps) {
  const [activeField, setActiveField] = useState<FieldKey | null>(null);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const [activeCustomTextIndex, setActiveCustomTextIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(3);
  const [selectAllActive, setSelectAllActive] = useState(false);
  const groupDragSnapshotRef = useRef<LabelDesignerPositionSnapshot | null>(null);

  const customTextFields = getCustomTextFields(config);
  const hideLegacyCustomTextField = usesCustomTextFields(config);

  const setCustomTextFields = useCallback(
    (slots: CustomTextSlot[]) => {
      onConfigChange({
        ...config,
        customTextFields: slots,
        customText: { ...config.customText, show: false },
      });
    },
    [config, onConfigChange],
  );

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

  const handleLineDrag = useCallback(
    (index: number, x: number, y: number) => {
      const lines = [...(config.lines || [])];
      lines[index] = { ...lines[index], x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 };
      onConfigChange({ ...config, lines });
    },
    [config, onConfigChange]
  );

  const handleLineDelete = useCallback(
    (index: number) => {
      const lines = (config.lines || []).filter((_, i) => i !== index);
      onConfigChange({ ...config, lines });
      setActiveLineIndex(null);
    },
    [config, onConfigChange]
  );

  const handleGroupDragStart = useCallback(() => {
    groupDragSnapshotRef.current = captureLabelDesignerPositions(config);
    setActiveField(null);
    setActiveLineIndex(null);
    setActiveCustomTextIndex(null);
  }, [config]);

  const handleGroupDrag = useCallback(
    (dx: number, dy: number) => {
      const snapshot = groupDragSnapshotRef.current;
      if (!snapshot) return;
      onConfigChange(
        applyLabelDesignerShift(config, snapshot, dx, dy, {
          width: labelWidth,
          height: labelHeight,
        }),
      );
    },
    [config, onConfigChange, labelWidth, labelHeight],
  );

  const handleGroupDragEnd = useCallback(() => {
    groupDragSnapshotRef.current = null;
  }, []);

  const handleNudge = useCallback(
    (direction: "left" | "right" | "up" | "down") => {
      onConfigChange(
        nudgeLabelDesignerConfig(config, direction, {
          width: labelWidth,
          height: labelHeight,
        }),
      );
    },
    [config, onConfigChange, labelWidth, labelHeight],
  );

  const toggleSelectAll = useCallback(() => {
    setSelectAllActive((prev) => {
      const next = !prev;
      if (next) {
        setActiveField(null);
        setActiveLineIndex(null);
        setActiveCustomTextIndex(null);
      }
      return next;
    });
  }, []);

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

  const fieldLabels = buildLabelDesignerFieldLabels(FIELD_LABELS, productFieldSettings);

  const allFieldKeys: FieldKey[] = filterLabelFieldKeys(
    (config.fieldOrder || Object.keys(FIELD_LABELS).filter((k) => k !== "fieldOrder") as FieldKey[]).filter(
      (key) => !(key === "customText" && hideLegacyCustomTextField),
    ),
    productFieldSettings,
  );

  const previewItem = sampleItem || { ...SAMPLE_ITEM, uom: defaultUom };
  const multiUpCols = Math.max(1, thermalCols);
  const isMultiUp = multiUpCols >= 2;
  const gapPx = horizontalGap * 3.7795 * zoom;

  const canvasProps = {
    item: previewItem,
    width: labelWidth,
    height: labelHeight,
    config,
    zoom,
    productFieldSettings,
    fieldLabels,
    defaultUom,
    activeField,
    activeLineIndex,
    activeCustomTextIndex,
    onFieldSelect: setActiveField,
    onFieldDrag: handleFieldDrag,
    onLineSelect: setActiveLineIndex,
    onLineDrag: handleLineDrag,
    onLineDelete: handleLineDelete,
    onCustomTextSelect: setActiveCustomTextIndex,
    onCustomTextDrag: (index: number, x: number, y: number) => {
      const slots = [...customTextFields];
      slots[index] = { ...slots[index], x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 };
      setCustomTextFields(slots);
    },
    onCustomTextDelete: (index: number) => {
      const slots = customTextFields.filter((_, i) => i !== index);
      setCustomTextFields(slots);
      setActiveCustomTextIndex(null);
    },
    selectAllActive,
    onGroupDragStart: handleGroupDragStart,
    onGroupDrag: handleGroupDrag,
    onGroupDragEnd: handleGroupDragEnd,
  };

  return (
    <div className="barcode-label-designer grid grid-cols-1 xl:grid-cols-[minmax(300px,380px)_1fr] gap-3 flex-1 min-h-0 h-full">
      {/* Field Controls — scrollable left column */}
      <div className="flex flex-col min-h-0 h-full min-w-0 border rounded-md bg-card overflow-hidden">
        <div className="flex items-center justify-between px-2.5 py-1.5 border-b shrink-0 bg-muted/30">
          <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">Field Layout</h3>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={resetToDefault} className="h-7 text-[11px] px-2 border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
            {onSave && (
              <Button size="sm" onClick={onSave} className="h-7 text-[11px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Save className="h-3 w-3 mr-1" />
                Save
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 h-0" showScrollbar>
          <div className="p-2 pb-4 space-y-2">
        <div className="space-y-1.5 rounded-md border border-border/60 p-2 bg-muted/20">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-semibold">Custom Text Fields</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                const slots =
                  config.customTextFields !== undefined
                    ? [...customTextFields]
                    : migrateCustomTextFields(config);
                slots.push(createCustomTextSlot(slots, labelWidth, labelHeight));
                setCustomTextFields(slots);
              }}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Custom Text
            </Button>
          </div>
          {customTextFields.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">
              Add lines like &quot;Non-Returnable&quot;, &quot;Kids Zone&quot;, warranty notes — each with its own position.
            </p>
          ) : (
            customTextFields.map((slot, idx) => (
              <Card
                key={slot.id}
                className={`transition-colors ${activeCustomTextIndex === idx ? "border-primary" : "border-border"}`}
                onClick={() => {
                  setActiveCustomTextIndex(activeCustomTextIndex === idx ? null : idx);
                  setActiveField(null);
                  setActiveLineIndex(null);
                }}
              >
                <CardContent className="p-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Switch
                        checked={slot.show}
                        onCheckedChange={(v) => {
                          const slots = [...customTextFields];
                          slots[idx] = { ...slots[idx], show: v };
                          setCustomTextFields(slots);
                        }}
                        className="scale-75"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="text-xs font-medium truncate">Custom Text {idx + 1}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        const slots = customTextFields.filter((_, i) => i !== idx);
                        setCustomTextFields(slots);
                        setActiveCustomTextIndex(null);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <Input
                    value={slot.value}
                    onChange={(e) => {
                      const slots = [...customTextFields];
                      slots[idx] = { ...slots[idx], value: e.target.value, show: true };
                      setCustomTextFields(slots);
                    }}
                    placeholder="e.g. Non-Returnable"
                    className="h-8 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  />
                  {activeCustomTextIndex === idx && slot.show && (
                    <div className="grid grid-cols-4 gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                      <div className="space-y-0.5">
                        <Label className="text-[10px]">X (mm)</Label>
                        <Input
                          type="number"
                          step={0.5}
                          value={slot.x}
                          onChange={(e) => {
                            const slots = [...customTextFields];
                            slots[idx] = { ...slots[idx], x: parseFloat(e.target.value) || 0 };
                            setCustomTextFields(slots);
                          }}
                          className="h-7 text-xs px-1.5"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px]">Y (mm)</Label>
                        <Input
                          type="number"
                          step={0.5}
                          value={slot.y}
                          onChange={(e) => {
                            const slots = [...customTextFields];
                            slots[idx] = { ...slots[idx], y: parseFloat(e.target.value) || 0 };
                            setCustomTextFields(slots);
                          }}
                          className="h-7 text-xs px-1.5"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px]">Size (pt)</Label>
                        <Input
                          type="number"
                          min={4}
                          max={24}
                          value={slot.fontSize}
                          onChange={(e) => {
                            const slots = [...customTextFields];
                            slots[idx] = { ...slots[idx], fontSize: parseInt(e.target.value, 10) || 7 };
                            setCustomTextFields(slots);
                          }}
                          className="h-7 text-xs px-1.5"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px]">W (mm)</Label>
                        <Input
                          type="number"
                          step={1}
                          value={slot.width}
                          onChange={(e) => {
                            const slots = [...customTextFields];
                            slots[idx] = { ...slots[idx], width: parseFloat(e.target.value) || 20 };
                            setCustomTextFields(slots);
                          }}
                          className="h-7 text-xs px-1.5"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Switch
                          checked={slot.bold}
                          onCheckedChange={(v) => {
                            const slots = [...customTextFields];
                            slots[idx] = { ...slots[idx], bold: v };
                            setCustomTextFields(slots);
                          }}
                          className="scale-75"
                        />
                        <Label className="text-[10px]">Bold</Label>
                      </div>
                      <div className="col-span-2">
                        <Select
                          value={slot.textAlign || "center"}
                          onValueChange={(v) => {
                            const slots = [...customTextFields];
                            slots[idx] = { ...slots[idx], textAlign: v as "left" | "center" | "right" };
                            setCustomTextFields(slots);
                          }}
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
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Barcode settings */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Barcode Height (% of label)</Label>
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

          <div className="space-y-1.5">
            {allFieldKeys.map((key) => {
              const field = config[key] as LabelFieldConfig;
              if (!field) return null;
              const isActive = activeField === key;

              return (
                <Card
                  key={key}
                  className={`cursor-pointer transition-colors ${isActive ? "border-primary" : "border-border"}`}
                  onClick={() => {
                    setActiveField(isActive ? null : key);
                    setActiveLineIndex(null);
                    setActiveCustomTextIndex(null);
                  }}
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
                        <span className="text-xs font-medium">{key === 'qty' ? `Qty (${getUOMLabel(defaultUom)})` : fieldLabels[key]}</span>
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
                        <div className="flex items-center gap-1.5">
                          <Switch
                            checked={field.bold}
                            onCheckedChange={(v) => updateField(key, { bold: v })}
                            className="scale-75"
                          />
                          <Label className="text-[10px]">Bold</Label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Switch
                            checked={field.strikethrough || false}
                            onCheckedChange={(v) => updateField(key, { strikethrough: v })}
                            className="scale-75"
                          />
                          <Label className="text-[10px]">Strikethrough</Label>
                        </div>
                        {field.strikethrough && (
                          <>
                            <div>
                              <Label className="text-[10px]">Line Width %</Label>
                              <Input
                                type="number"
                                min={10}
                                max={200}
                                value={field.strikethroughWidth ?? 100}
                                onChange={(e) => updateField(key, { strikethroughWidth: Number(e.target.value) })}
                                className="h-7 text-xs"
                              />
                            </div>
                            <div>
                              <Label className="text-[10px]">Line Thickness</Label>
                              <Input
                                type="number"
                                min={0.5}
                                max={10}
                                step={0.5}
                                value={field.strikethroughThickness ?? 1}
                                onChange={(e) => updateField(key, { strikethroughThickness: Number(e.target.value) })}
                                className="h-7 text-xs"
                              />
                            </div>
                            <div>
                              <Label className="text-[10px]">Y Offset %</Label>
                              <Input
                                type="number"
                                min={-50}
                                max={50}
                                step={1}
                                value={field.strikethroughOffsetY ?? 0}
                                onChange={(e) => updateField(key, { strikethroughOffsetY: Number(e.target.value) })}
                                className="h-7 text-xs"
                              />
                            </div>
                          </>
                        )}
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

            {/* Lines Section */}
            <div className="space-y-2 pt-2 border-t mt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold flex items-center gap-1">
              <Minus className="h-3 w-3" /> Lines / Separators
            </h4>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => {
                const lines = [...(config.lines || [])];
                lines.push({ show: true, x: 1, y: 12, length: labelWidth - 2, thickness: 0.3, orientation: 'horizontal' });
                onConfigChange({ ...config, lines });
              }}
            >
              <Plus className="h-3 w-3 mr-0.5" /> Add Line
            </Button>
          </div>
          {(config.lines || []).map((line, idx) => (
            <Card key={idx} className={`transition-colors ${activeLineIndex === idx ? "border-primary" : "border-border"}`}>
              <CardContent className="p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={line.show}
                      onCheckedChange={(v) => {
                        const lines = [...(config.lines || [])];
                        lines[idx] = { ...lines[idx], show: v };
                        onConfigChange({ ...config, lines });
                      }}
                      className="scale-75"
                    />
                    <span className="text-[10px] font-medium">Line {idx + 1}</span>
                    <Select
                      value={line.orientation}
                      onValueChange={(v) => {
                        const lines = [...(config.lines || [])];
                        lines[idx] = { ...lines[idx], orientation: v as 'horizontal' | 'vertical' };
                        onConfigChange({ ...config, lines });
                      }}
                    >
                      <SelectTrigger className="h-6 text-[10px] w-[90px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="horizontal">Horizontal</SelectItem>
                        <SelectItem value="vertical">Vertical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-destructive hover:text-destructive"
                    onClick={() => {
                      const lines = (config.lines || []).filter((_, i) => i !== idx);
                      onConfigChange({ ...config, lines });
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                {line.show && (
                  <div className="grid grid-cols-4 gap-1.5">
                    <div className="space-y-0.5">
                      <Label className="text-[10px]">X (mm)</Label>
                      <Input
                        type="number" step={0.5} value={line.x}
                        onChange={(e) => {
                          const lines = [...(config.lines || [])];
                          lines[idx] = { ...lines[idx], x: parseFloat(e.target.value) || 0 };
                          onConfigChange({ ...config, lines });
                        }}
                        className="h-7 text-xs px-1.5"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px]">Y (mm)</Label>
                      <Input
                        type="number" step={0.5} value={line.y}
                        onChange={(e) => {
                          const lines = [...(config.lines || [])];
                          lines[idx] = { ...lines[idx], y: parseFloat(e.target.value) || 0 };
                          onConfigChange({ ...config, lines });
                        }}
                        className="h-7 text-xs px-1.5"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px]">Length</Label>
                      <Input
                        type="number" step={0.5} min={1} value={line.length}
                        onChange={(e) => {
                          const lines = [...(config.lines || [])];
                          lines[idx] = { ...lines[idx], length: parseFloat(e.target.value) || 10 };
                          onConfigChange({ ...config, lines });
                        }}
                        className="h-7 text-xs px-1.5"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px]">Thick</Label>
                      <Input
                        type="number" step={0.1} min={0.1} max={3} value={line.thickness}
                        onChange={(e) => {
                          const lines = [...(config.lines || [])];
                          lines[idx] = { ...lines[idx], thickness: parseFloat(e.target.value) || 0.3 };
                          onConfigChange({ ...config, lines });
                        }}
                        className="h-7 text-xs px-1.5"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          </div>
          </div>
          </div>
        </ScrollArea>
      </div>

      {/* Live Preview — scrollable right column */}
      <div className="flex flex-col min-h-0 h-full min-w-0 border rounded-md bg-card overflow-hidden">
        <div className="flex items-center justify-between px-2.5 py-1.5 border-b shrink-0 bg-muted/30">
          <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">Live Preview</h3>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            <Button
              variant={selectAllActive ? "default" : "outline"}
              size="sm"
              className="h-7 text-[10px] px-2"
              onClick={toggleSelectAll}
              title="Select all fields and drag together"
            >
              <Move className="h-3 w-3 mr-1" />
              Select All
            </Button>
            {selectAllActive && (
              <div className="flex items-center gap-0.5 border rounded-md p-0.5 bg-background">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleNudge("left")} title="Move all left 0.5mm">
                  <ArrowLeft className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleNudge("up")} title="Move all up 0.5mm">
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleNudge("down")} title="Move all down 0.5mm">
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleNudge("right")} title="Move all right 0.5mm">
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(1, z - 0.5))}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[11px] text-muted-foreground w-7 text-center tabular-nums">{zoom}×</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(6, z + 0.5))}>
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col p-2">
        {isMultiUp ? (
          <div className="flex-1 min-h-[120px] min-w-0 overflow-x-auto overflow-y-auto">
            <div
              className="flex items-start justify-start w-max mx-auto py-1"
              style={{ gap: gapPx }}
            >
              {Array.from({ length: multiUpCols }).map((_, idx) => (
                <DraggableLabelCanvas key={idx} {...canvasProps} fillAvailable={false} />
              ))}
            </div>
          </div>
        ) : (
          <DraggableLabelCanvas {...canvasProps} />
        )}

        <div className="text-[10px] text-muted-foreground text-center mt-1 shrink-0">
          {labelWidth}mm × {labelHeight}mm
          {isMultiUp ? ` × ${multiUpCols} · gap ${horizontalGap}mm` : ""} · drag to move · Delete removes line
          {selectAllActive ? " · Select All: drag any field or use arrows (0.5mm)" : ""}
          <span className="block mt-0.5 text-[9px] text-muted-foreground/80">
            Empty fields show field name here only (not on print)
          </span>
        </div>
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_PRECISION_CONFIG };
