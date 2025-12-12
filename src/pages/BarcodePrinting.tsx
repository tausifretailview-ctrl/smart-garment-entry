import { useState, useEffect, useRef, useCallback } from "react";
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
import { Check, Save, Trash2, GripVertical, Eye, Download, RefreshCw, Edit, Printer } from "lucide-react";
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
import { useBarcodeLabelSettings } from "@/hooks/useBarcodeLabelSettings";
import { BarTenderLabelDesigner } from "@/components/BarTenderLabelDesigner";
import { DirectPrintDialog } from "@/components/DirectPrintDialog";
import { useOrganization } from "@/contexts/OrganizationContext";
import { LabelFieldConfig, LabelDesignConfig, LabelItem, LabelTemplate, FieldKey } from "@/types/labelTypes";
// Helper function to pre-render barcode as image data URL
const renderBarcodeToDataURL = (code: string, height: number = 30, width: number = 1.5): string => {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, code, {
      format: 'CODE128',
      height: height,
      width: width,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Failed to render barcode:', code, error);
    return '';
  }
};

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
  supplier_code?: string;
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
  scale?: number;
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

interface MarginPreset {
  name: string;
  topOffset: number;
  leftOffset: number;
  bottomOffset: number;
  rightOffset: number;
  description?: string;
}


type SheetType = 
  // A4 Sheet Types
  "novajet48" | "novajet40" | "novajet65" | "a4_12x4" | "a4_65sheet" | "a4_32sheet" | 
  "a4_24sheet" | "a4_20sheet" | "a4_35square" | "a4_21sheet" | "a4_80sheet" | "a4_36sheet" |
  // Thermal 1UP Types
  "thermal_50x30_1up" | "thermal_50x25_1up" | "thermal_38x25_1up" | 
  "thermal_40x20_1up" | "thermal_40x30_1up" | "thermal_50x40_1up" |
  "thermal_60x30_1up" | "thermal_60x40_1up" | "thermal_100x50_1up" | 
  "thermal_75x50_1up" | "thermal_100x100_1up" | "thermal_80x40_1up" |
  // Thermal 2UP Types
  "thermal_50x30_2up" | "thermal_50x25_2up" | "thermal_38x25_2up" |
  "thermal_40x20_2up" | "thermal_40x30_2up" | "thermal_60x30_2up" | 
  "thermal_60x40_2up" | "thermal_75x50_2up" |
  // Custom
  "custom";
type DesignFormat = "BT1" | "BT2" | "BT3" | "BT4";
type QuantityMode = "manual" | "lastPurchase" | "byBill";

const sheetPresets = {
  // ===== A4 Sheet Presets =====
  // Small Labels
  novajet48: { cols: 8, width: "33mm", height: "19mm", gap: "1mm", category: "a4" },
  a4_80sheet: { cols: 10, width: "26mm", height: "14mm", gap: "0.5mm", category: "a4" },
  novajet65: { cols: 5, width: "38mm", height: "21mm", gap: "1mm", category: "a4" },
  a4_65sheet: { cols: 5, width: "38mm", height: "22mm", gap: "1mm", category: "a4" },
  
  // Medium Labels
  novajet40: { cols: 5, rows: 8, width: "35mm", height: "37mm", gap: "1.2mm", category: "a4" },
  a4_35x37: { cols: 5, rows: 8, width: "35mm", height: "37mm", gap: "1.2mm", category: "a4" },
  a4_12x4: { cols: 4, width: "50mm", height: "24mm", gap: "1mm", category: "a4" },
  a4_36sheet: { cols: 4, width: "48mm", height: "30mm", gap: "1mm", category: "a4" },
  a4_32sheet: { cols: 4, width: "52mm", height: "30mm", gap: "1mm", category: "a4" },
  a4_35square: { cols: 5, width: "35mm", height: "35mm", gap: "2mm", category: "a4" },
  
  // Large Labels
  a4_24sheet: { cols: 3, width: "70mm", height: "35mm", gap: "1mm", category: "a4" },
  a4_21sheet: { cols: 3, width: "63.5mm", height: "38.1mm", gap: "1mm", category: "a4" },
  a4_20sheet: { cols: 2, width: "100mm", height: "50mm", gap: "1mm", category: "a4" },

  // ===== Thermal Roll Presets (1UP - Single Column) =====
  // Extra Small
  thermal_40x20_1up: { cols: 1, width: "40mm", height: "20mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_40x30_1up: { cols: 1, width: "40mm", height: "30mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_38x25_1up: { cols: 1, width: "38mm", height: "25mm", gap: "0mm", category: "thermal", thermal: true },
  
  // Small
  thermal_50x25_1up: { cols: 1, width: "50mm", height: "25mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_50x30_1up: { cols: 1, width: "50mm", height: "30mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_50x40_1up: { cols: 1, width: "50mm", height: "40mm", gap: "0mm", category: "thermal", thermal: true },
  
  // Medium
  thermal_60x30_1up: { cols: 1, width: "60mm", height: "30mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_60x40_1up: { cols: 1, width: "60mm", height: "40mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_75x50_1up: { cols: 1, width: "75mm", height: "50mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_80x40_1up: { cols: 1, width: "80mm", height: "40mm", gap: "0mm", category: "thermal", thermal: true },
  
  // Large / Shipping
  thermal_100x50_1up: { cols: 1, width: "100mm", height: "50mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_100x100_1up: { cols: 1, width: "100mm", height: "100mm", gap: "0mm", category: "thermal", thermal: true },

  // ===== Thermal Roll Presets (2UP - Two Columns) =====
  thermal_40x20_2up: { cols: 2, width: "40mm", height: "20mm", gap: "2mm", category: "thermal", thermal: true },
  thermal_40x30_2up: { cols: 2, width: "40mm", height: "30mm", gap: "2mm", category: "thermal", thermal: true },
  thermal_38x25_2up: { cols: 2, width: "38mm", height: "25mm", gap: "2mm", category: "thermal", thermal: true },
  thermal_50x25_2up: { cols: 2, width: "50mm", height: "25mm", gap: "2mm", category: "thermal", thermal: true },
  thermal_50x30_2up: { cols: 2, width: "50mm", height: "30mm", gap: "2mm", category: "thermal", thermal: true },
  thermal_60x30_2up: { cols: 2, width: "60mm", height: "30mm", gap: "2mm", category: "thermal", thermal: true },
  thermal_60x40_2up: { cols: 2, width: "60mm", height: "40mm", gap: "2mm", category: "thermal", thermal: true },
  thermal_75x50_2up: { cols: 2, width: "75mm", height: "50mm", gap: "2mm", category: "thermal", thermal: true },

  // Custom
  custom: { cols: 4, width: "50mm", height: "25mm", gap: "2mm", category: "custom" },
};

// Sheet preset labels for UI with grouping
const sheetPresetLabels: Record<string, { label: string; description: string; group: string }> = {
  // A4 Sheets - Small
  novajet48: { label: "Novajet 48", description: "33×19mm, 8 cols", group: "A4 - Small Labels" },
  a4_80sheet: { label: "A4 80-Sheet", description: "26×14mm, 10 cols (tiny)", group: "A4 - Small Labels" },
  novajet65: { label: "Novajet 65", description: "38×21mm, 5 cols", group: "A4 - Small Labels" },
  a4_65sheet: { label: "A4 65-Sheet", description: "38×22mm, 5 cols (shelf)", group: "A4 - Small Labels" },
  
  // A4 Sheets - Medium
  novajet40: { label: "Novajet 40", description: "35×37mm, 5×8", group: "A4 - Medium Labels" },
  a4_35x37: { label: "A4 35×37mm", description: "35×37mm, 5×8 (40 labels)", group: "A4 - Medium Labels" },
  a4_12x4: { label: "A4 48-Sheet", description: "50×24mm, 4×12", group: "A4 - Medium Labels" },
  a4_36sheet: { label: "A4 36-Sheet", description: "48×30mm, 4×9", group: "A4 - Medium Labels" },
  a4_32sheet: { label: "A4 32-Sheet", description: "52×30mm, 4×8 (retail)", group: "A4 - Medium Labels" },
  a4_35square: { label: "A4 35-Square", description: "35×35mm, 5×7 (square)", group: "A4 - Medium Labels" },
  
  // A4 Sheets - Large
  a4_24sheet: { label: "A4 24-Sheet", description: "70×35mm, 3×8 (warehouse)", group: "A4 - Large Labels" },
  a4_21sheet: { label: "A4 21-Sheet", description: "63.5×38.1mm, 3×7 (address)", group: "A4 - Large Labels" },
  a4_20sheet: { label: "A4 20-Sheet", description: "100×50mm, 2×10 (shipping)", group: "A4 - Large Labels" },
  
  // Thermal 1UP - Small
  thermal_40x20_1up: { label: "40×20mm (1UP)", description: "Jewelry/small items", group: "Thermal 1UP - Small" },
  thermal_38x25_1up: { label: "38×25mm (1UP)", description: "Compact retail", group: "Thermal 1UP - Small" },
  thermal_40x30_1up: { label: "40×30mm (1UP)", description: "Small retail", group: "Thermal 1UP - Small" },
  thermal_50x25_1up: { label: "50×25mm (1UP)", description: "Standard small", group: "Thermal 1UP - Small" },
  thermal_50x30_1up: { label: "50×30mm (1UP)", description: "Standard retail", group: "Thermal 1UP - Small" },
  
  // Thermal 1UP - Medium
  thermal_50x40_1up: { label: "50×40mm (1UP)", description: "Detailed info", group: "Thermal 1UP - Medium" },
  thermal_60x30_1up: { label: "60×30mm (1UP)", description: "Wide format", group: "Thermal 1UP - Medium" },
  thermal_60x40_1up: { label: "60×40mm (1UP)", description: "Large detailed", group: "Thermal 1UP - Medium" },
  thermal_75x50_1up: { label: "75×50mm (1UP)", description: "Medium shipping", group: "Thermal 1UP - Medium" },
  thermal_80x40_1up: { label: "80×40mm (1UP)", description: "Wide shipping", group: "Thermal 1UP - Medium" },
  
  // Thermal 1UP - Large
  thermal_100x50_1up: { label: "100×50mm (1UP)", description: "Shipping label", group: "Thermal 1UP - Large" },
  thermal_100x100_1up: { label: "100×100mm (1UP)", description: "Large shipping", group: "Thermal 1UP - Large" },
  
  // Thermal 2UP
  thermal_40x20_2up: { label: "40×20mm (2UP)", description: "Dual small", group: "Thermal 2UP" },
  thermal_40x30_2up: { label: "40×30mm (2UP)", description: "Dual compact", group: "Thermal 2UP" },
  thermal_38x25_2up: { label: "38×25mm (2UP)", description: "Dual compact", group: "Thermal 2UP" },
  thermal_50x25_2up: { label: "50×25mm (2UP)", description: "Dual standard", group: "Thermal 2UP" },
  thermal_50x30_2up: { label: "50×30mm (2UP)", description: "Dual retail", group: "Thermal 2UP" },
  thermal_60x30_2up: { label: "60×30mm (2UP)", description: "Dual wide", group: "Thermal 2UP" },
  thermal_60x40_2up: { label: "60×40mm (2UP)", description: "Dual large", group: "Thermal 2UP" },
  thermal_75x50_2up: { label: "75×50mm (2UP)", description: "Dual shipping", group: "Thermal 2UP" },
  
  // Custom
  custom: { label: "Custom Size", description: "Set your own dimensions", group: "Custom" },
};

// Built-in label templates for thermal printers
const builtInLabelTemplates: LabelTemplate[] = [
  {
    name: "Thermal - Classic",
    config: {
      brand: { show: true, fontSize: 10, bold: true, textAlign: 'center', x: 0, y: 0, width: 100 },
      productName: { show: true, fontSize: 9, bold: true, textAlign: 'center', x: 0, y: 4, width: 100 },
      color: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 25, y: 8, width: 50 },
      style: { show: true, fontSize: 8, bold: false, textAlign: 'left', x: 0, y: 8, width: 50 },
      size: { show: true, fontSize: 10, bold: true, textAlign: 'right', x: 25, y: 8, width: 50 },
      price: { show: true, fontSize: 11, bold: true, textAlign: 'center', x: 0, y: 12, width: 100 },
      mrp: { show: false, fontSize: 9, bold: false, textAlign: 'center', x: 0, y: 16, width: 50 },
      customText: { show: false, fontSize: 8, bold: false, textAlign: 'center', x: 25, y: 16, width: 50 },
      barcode: { show: true, fontSize: 8, bold: false, textAlign: 'center', x: 0, y: 16, width: 100 },
      barcodeText: { show: true, fontSize: 8, bold: false, textAlign: 'center', x: 0, y: 24, width: 100 },
      billNumber: { show: false, fontSize: 6, bold: false, textAlign: 'center', x: 0, y: 27, width: 100 },
      supplierCode: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 27, width: 50 },
      purchaseCode: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 25, y: 27, width: 50 },
      fieldOrder: ['brand', 'style', 'size', 'price', 'mrp', 'customText', 'barcode', 'barcodeText', 'productName', 'color', 'billNumber', 'supplierCode', 'purchaseCode'],
      barcodeHeight: 25,
      barcodeWidth: 1.5,
    }
  },
  {
    name: "Thermal - Minimal",
    config: {
      brand: { show: true, fontSize: 9, bold: true, textAlign: 'center', x: 0, y: 0, width: 100 },
      productName: { show: false, fontSize: 8, bold: true, textAlign: 'center', x: 0, y: 4, width: 100 },
      color: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 8, width: 100 },
      style: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 8, width: 100 },
      size: { show: true, fontSize: 10, bold: true, textAlign: 'center', x: 0, y: 4, width: 100 },
      price: { show: true, fontSize: 12, bold: true, textAlign: 'center', x: 0, y: 8, width: 100 },
      mrp: { show: false, fontSize: 9, bold: false, textAlign: 'center', x: 0, y: 12, width: 50 },
      customText: { show: false, fontSize: 8, bold: false, textAlign: 'center', x: 25, y: 12, width: 50 },
      barcode: { show: true, fontSize: 8, bold: false, textAlign: 'center', x: 0, y: 12, width: 100 },
      barcodeText: { show: true, fontSize: 8, bold: true, textAlign: 'center', x: 0, y: 20, width: 100 },
      billNumber: { show: false, fontSize: 6, bold: false, textAlign: 'center', x: 0, y: 24, width: 100 },
      supplierCode: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 24, width: 100 },
      purchaseCode: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 27, width: 100 },
      fieldOrder: ['brand', 'size', 'price', 'mrp', 'customText', 'barcode', 'barcodeText', 'productName', 'style', 'color', 'billNumber', 'supplierCode', 'purchaseCode'],
      barcodeHeight: 28,
      barcodeWidth: 1.6,
    }
  },
  {
    name: "Thermal - With Code",
    config: {
      brand: { show: true, fontSize: 9, bold: true, textAlign: 'center', x: 0, y: 0, width: 100 },
      productName: { show: true, fontSize: 8, bold: true, textAlign: 'center', x: 0, y: 4, width: 100 },
      color: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 8, width: 100 },
      style: { show: true, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 8, width: 100 },
      size: { show: true, fontSize: 9, bold: true, textAlign: 'center', x: 0, y: 8, width: 50 },
      price: { show: true, fontSize: 10, bold: true, textAlign: 'center', x: 25, y: 8, width: 50 },
      mrp: { show: false, fontSize: 9, bold: false, textAlign: 'center', x: 0, y: 12, width: 50 },
      customText: { show: false, fontSize: 8, bold: false, textAlign: 'center', x: 25, y: 12, width: 50 },
      barcode: { show: true, fontSize: 8, bold: false, textAlign: 'center', x: 0, y: 12, width: 100 },
      barcodeText: { show: true, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 20, width: 100 },
      billNumber: { show: false, fontSize: 6, bold: false, textAlign: 'center', x: 0, y: 27, width: 100 },
      supplierCode: { show: true, fontSize: 6, bold: false, textAlign: 'center', x: 0, y: 24, width: 50 },
      purchaseCode: { show: true, fontSize: 6, bold: false, textAlign: 'center', x: 25, y: 24, width: 50 },
      fieldOrder: ['brand', 'productName', 'style', 'size', 'price', 'mrp', 'customText', 'barcode', 'barcodeText', 'supplierCode', 'purchaseCode', 'color', 'billNumber'],
      barcodeHeight: 22,
      barcodeWidth: 1.4,
    }
  },
];

interface LivePreviewLabelProps {
  labelConfig: LabelDesignConfig;
  businessName: string;
  onConfigChange?: React.Dispatch<React.SetStateAction<LabelDesignConfig>>;
  editable?: boolean;
  sampleItem?: LabelItem | null;
  labelWidth?: number;
  labelHeight?: number;
}

interface DraggablePreviewFieldProps {
  fieldKey: keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth'>;
  labelConfig: LabelDesignConfig;
  businessName: string;
  sampleItem?: LabelItem | null;
}

function DraggablePreviewField({ fieldKey, labelConfig, businessName, sampleItem }: DraggablePreviewFieldProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `preview-${fieldKey}` });

  const field = labelConfig[fieldKey] as LabelFieldConfig;
  if (!field.show) return null;

  const scale = 0.7;
  const fontSize = Math.max(5, field.fontSize * scale);
  const pt = (field.paddingTop ?? 0) * scale;
  const pb = (field.paddingBottom ?? 0) * scale;
  const pl = (field.paddingLeft ?? 0) * scale;
  const pr = (field.paddingRight ?? 0) * scale;

  const style: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    fontWeight: field.bold ? 'bold' : 'normal',
    textAlign: (field.textAlign || 'center') as 'left' | 'center' | 'right',
    margin: `${pt}px ${pr}px ${pb}px ${pl}px`,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
    backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
    borderRadius: '2px',
  };

  const getContent = () => {
    if (sampleItem) {
      switch (fieldKey) {
        case 'brand':
          return sampleItem.brand || businessName || 'Brand';
        case 'productName':
          return sampleItem.product_name + (labelConfig.size.show ? '' : ` (${sampleItem.size})`);
        case 'color':
          return sampleItem.color ? `Color: ${sampleItem.color}` : '';
        case 'style':
          return sampleItem.style || '';
        case 'price':
          return `MRP: ₹${sampleItem.sale_price}`;
        case 'barcodeText':
          return sampleItem.barcode || '';
        case 'billNumber':
          return sampleItem.bill_number ? `Bill: ${sampleItem.bill_number}` : '';
        case 'supplierCode':
          return sampleItem.supplier_code || '';
        case 'purchaseCode':
          return sampleItem.purchase_code || '';
        case 'size':
          return sampleItem.size || '';
        default:
          return '';
      }
    }
    // Fallback to placeholder
    switch (fieldKey) {
      case 'brand':
        return businessName || 'Brand';
      case 'productName':
        return 'Sample Product';
      case 'color':
        return 'Color: Blue';
      case 'style':
        return 'Style: Classic';
      case 'price':
        return 'MRP: ₹999';
      case 'barcodeText':
        return '12345678';
      case 'billNumber':
        return 'Bill: BILL001';
      case 'supplierCode':
        return 'SUP01';
      case 'purchaseCode':
        return 'PC123';
      case 'size':
        return 'M';
      default:
        return '';
    }
  };

  if (fieldKey === 'barcode') {
    return (
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        style={{
          margin: `${pt}px ${pr}px ${pb}px ${pl}px`,
          display: 'flex',
          justifyContent: 'center',
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.5 : 1,
          cursor: 'grab',
          backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
          borderRadius: '2px',
        }}
      >
        <svg className={`preview-barcode-${fieldKey}`} style={{ height: '20px', width: '60px' }} />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={style}>
      {getContent()}
    </div>
  );
}

function LivePreviewLabel({ labelConfig, businessName, onConfigChange, editable = false, sampleItem, labelWidth, labelHeight }: LivePreviewLabelProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const barcodeValue = sampleItem?.barcode || '12345678';

  // Render barcodes after component mounts/updates
  useEffect(() => {
    if (!previewRef.current) return;
    const svgs = previewRef.current.querySelectorAll('[class^="preview-barcode-"]');
    svgs.forEach((svg) => {
      try {
        JsBarcode(svg, barcodeValue, {
          format: 'CODE128',
          width: 1,
          height: 18,
          displayValue: false,
          margin: 0
        });
      } catch (e) {
        console.log('Preview barcode error:', e);
      }
    });
  }, [labelConfig, barcodeValue]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onConfigChange) return;

    const activeKey = String(active.id).replace('preview-', '') as keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth' | 'customTextValue'>;
    const overKey = String(over.id).replace('preview-', '') as keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth' | 'customTextValue'>;

    onConfigChange(prev => {
      const oldIndex = prev.fieldOrder.indexOf(activeKey);
      const newIndex = prev.fieldOrder.indexOf(overKey);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const newOrder = arrayMove(prev.fieldOrder, oldIndex, newIndex);
      return { ...prev, fieldOrder: newOrder };
    });
  };

  const visibleFields = labelConfig.fieldOrder.filter(key => {
    const field = labelConfig[key] as LabelFieldConfig;
    return field.show;
  });

  // Helper to get content based on sampleItem or placeholder
  const getFieldContent = (fieldKey: keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth' | 'customTextValue'>) => {
    if (sampleItem) {
      switch (fieldKey) {
        case 'brand': return sampleItem.brand || businessName || 'Brand';
        case 'productName': return sampleItem.product_name + (labelConfig.size.show ? '' : ` (${sampleItem.size})`);
        case 'color': return sampleItem.color ? `Color: ${sampleItem.color}` : '';
        case 'style': return sampleItem.style || '';
        case 'price': return `₹${sampleItem.sale_price}`;
        case 'mrp': return sampleItem.mrp ? `MRP ₹${sampleItem.mrp}` : '';
        case 'customText': return labelConfig.customTextValue || '';
        case 'barcodeText': return sampleItem.barcode || '';
        case 'billNumber': return sampleItem.bill_number ? `Bill: ${sampleItem.bill_number}` : '';
        case 'supplierCode': return sampleItem.supplier_code || '';
        case 'purchaseCode': return sampleItem.purchase_code || '';
        case 'size': return sampleItem.size || '';
        default: return '';
      }
    }
    switch (fieldKey) {
      case 'brand': return businessName || 'Brand';
      case 'productName': return 'Sample Product';
      case 'color': return 'Color: Blue';
      case 'style': return 'Style: Classic';
      case 'price': return '₹999';
      case 'mrp': return 'MRP ₹1299';
      case 'customText': return labelConfig.customTextValue || 'Custom Text';
      case 'barcodeText': return '12345678';
      case 'billNumber': return 'Bill: BILL001';
      case 'supplierCode': return 'SUP01';
      case 'purchaseCode': return 'PC123';
      case 'size': return 'M';
      default: return '';
    }
  };

  if (editable && onConfigChange) {
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleFields.map(k => `preview-${k}`)} strategy={verticalListSortingStrategy}>
          <div
            ref={previewRef}
            style={{
              fontFamily: 'Arial, sans-serif',
              textAlign: 'center',
              padding: '2px',
              fontSize: '6px',
              lineHeight: 1.2,
              width: '100%',
              height: '100%',
            }}
          >
            {visibleFields.map((fieldKey) => (
              <DraggablePreviewField
                key={fieldKey}
                fieldKey={fieldKey}
                labelConfig={labelConfig}
                businessName={businessName}
                sampleItem={sampleItem}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  // Non-editable static preview
  return (
    <div
      ref={previewRef}
      style={{
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        padding: '2px',
        fontSize: '6px',
        lineHeight: 1.2,
        width: '100%',
        height: '100%',
      }}
    >
      {labelConfig.fieldOrder.map((fieldKey) => {
        const field = labelConfig[fieldKey] as LabelFieldConfig;
        if (!field.show) return null;

        const scale = 0.7;
        const fontSize = Math.max(5, field.fontSize * scale);
        const pt = (field.paddingTop ?? 0) * scale;
        const pb = (field.paddingBottom ?? 0) * scale;
        const pl = (field.paddingLeft ?? 0) * scale;
        const pr = (field.paddingRight ?? 0) * scale;

        const style: React.CSSProperties = {
          fontSize: `${fontSize}px`,
          fontWeight: field.bold ? 'bold' : 'normal',
          textAlign: (field.textAlign || 'center') as 'left' | 'center' | 'right',
          margin: `${pt}px ${pr}px ${pb}px ${pl}px`,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        };

        if (fieldKey === 'barcode') {
          return (
            <div
              key={fieldKey}
              style={{
                margin: `${pt}px ${pr}px ${pb}px ${pl}px`,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <svg className={`preview-barcode-${fieldKey}`} style={{ height: '20px', width: '60px' }} />
            </div>
          );
        }

        return <div key={fieldKey} style={style}>{getFieldContent(fieldKey)}</div>;
      })}
    </div>
  );
}

interface SortableFieldItemProps {
  fieldKey: keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth' | 'customTextValue'>;
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

  const fieldLabels: Record<keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth' | 'customTextValue'>, string> = {
    brand: 'Brand Name',
    productName: 'Product Name',
    color: 'Color',
    style: 'Style',
    size: 'Size',
    price: 'Sale Price',
    mrp: 'MRP',
    customText: 'Custom Text',
    barcode: 'Barcode Image',
    barcodeText: 'Barcode Number',
    billNumber: 'Bill Number',
    supplierCode: 'Supplier Code',
    purchaseCode: 'Purchase Code',
  };

  const field = labelConfig[fieldKey] as LabelFieldConfig;

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
        <div className="flex items-center gap-2 flex-wrap">
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

          {fieldKey === 'barcodeText' && (
            <Select
              value={field.fontFamily || 'Arial'}
              onValueChange={(value) => {
                setLabelConfig(prev => ({
                  ...prev,
                  [fieldKey]: { ...prev[fieldKey], fontFamily: value }
                }));
              }}
            >
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue placeholder="Font" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Arial">Arial</SelectItem>
                <SelectItem value="Courier New">Courier New</SelectItem>
                <SelectItem value="Georgia">Georgia</SelectItem>
                <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                <SelectItem value="Verdana">Verdana</SelectItem>
                <SelectItem value="Tahoma">Tahoma</SelectItem>
                <SelectItem value="Trebuchet MS">Trebuchet MS</SelectItem>
                <SelectItem value="Comic Sans MS">Comic Sans MS</SelectItem>
              </SelectContent>
            </Select>
          )}
          
          <Select
            value={field.textAlign || 'center'}
            onValueChange={(value: 'left' | 'center' | 'right') => {
              setLabelConfig(prev => ({
                ...prev,
                [fieldKey]: { ...prev[fieldKey], textAlign: value }
              }));
            }}
          >
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue placeholder="Align" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Padding controls */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 px-2 text-xs">
                Spacing
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Field Spacing (px)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs w-8">Top:</Label>
                    <Input
                      type="number"
                      min="-10"
                      max="20"
                      value={field.paddingTop ?? 0}
                      onChange={(e) => {
                        setLabelConfig(prev => ({
                          ...prev,
                          [fieldKey]: { ...prev[fieldKey], paddingTop: parseInt(e.target.value) || 0 }
                        }));
                      }}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs w-8">Bot:</Label>
                    <Input
                      type="number"
                      min="-10"
                      max="20"
                      value={field.paddingBottom ?? 0}
                      onChange={(e) => {
                        setLabelConfig(prev => ({
                          ...prev,
                          [fieldKey]: { ...prev[fieldKey], paddingBottom: parseInt(e.target.value) || 0 }
                        }));
                      }}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs w-8">Left:</Label>
                    <Input
                      type="number"
                      min="-10"
                      max="20"
                      value={field.paddingLeft ?? 0}
                      onChange={(e) => {
                        setLabelConfig(prev => ({
                          ...prev,
                          [fieldKey]: { ...prev[fieldKey], paddingLeft: parseInt(e.target.value) || 0 }
                        }));
                      }}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs w-8">Right:</Label>
                    <Input
                      type="number"
                      min="-10"
                      max="20"
                      value={field.paddingRight ?? 0}
                      onChange={(e) => {
                        setLabelConfig(prev => ({
                          ...prev,
                          [fieldKey]: { ...prev[fieldKey], paddingRight: parseInt(e.target.value) || 0 }
                        }));
                      }}
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
      
      {field.show && fieldKey === 'barcode' && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground">Height:</Label>
            <Input
              type="number"
              min="15"
              max="80"
              value={labelConfig.barcodeHeight || 28}
              onChange={(e) => {
                setLabelConfig(prev => ({
                  ...prev,
                  barcodeHeight: parseInt(e.target.value) || 28
                }));
              }}
              className="w-16 h-8 text-xs"
              title="Barcode height"
            />
            <span className="text-xs text-muted-foreground">px</span>
          </div>
          
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground">Width:</Label>
            <Input
              type="number"
              min="1"
              max="3"
              step="0.1"
              value={labelConfig.barcodeWidth || 1.8}
              onChange={(e) => {
                setLabelConfig(prev => ({
                  ...prev,
                  barcodeWidth: parseFloat(e.target.value) || 1.8
                }));
              }}
              className="w-16 h-8 text-xs"
              title="Barcode line width"
            />
          </div>
          
          {/* Spacing controls for barcode */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 px-2 text-xs">
                Spacing
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Barcode Spacing (px)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs w-8">Top:</Label>
                    <Input
                      type="number"
                      min="-10"
                      max="20"
                      value={field.paddingTop ?? 0}
                      onChange={(e) => {
                        setLabelConfig(prev => ({
                          ...prev,
                          barcode: { ...prev.barcode, paddingTop: parseInt(e.target.value) || 0 }
                        }));
                      }}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs w-8">Bot:</Label>
                    <Input
                      type="number"
                      min="-10"
                      max="20"
                      value={field.paddingBottom ?? 0}
                      onChange={(e) => {
                        setLabelConfig(prev => ({
                          ...prev,
                          barcode: { ...prev.barcode, paddingBottom: parseInt(e.target.value) || 0 }
                        }));
                      }}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs w-8">Left:</Label>
                    <Input
                      type="number"
                      min="-10"
                      max="20"
                      value={field.paddingLeft ?? 0}
                      onChange={(e) => {
                        setLabelConfig(prev => ({
                          ...prev,
                          barcode: { ...prev.barcode, paddingLeft: parseInt(e.target.value) || 0 }
                        }));
                      }}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs w-8">Right:</Label>
                    <Input
                      type="number"
                      min="-10"
                      max="20"
                      value={field.paddingRight ?? 0}
                      onChange={(e) => {
                        setLabelConfig(prev => ({
                          ...prev,
                          barcode: { ...prev.barcode, paddingRight: parseInt(e.target.value) || 0 }
                        }));
                      }}
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
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
  const [printScale, setPrintScale] = useState(100);
  
  // Auto-load default offsets and scale when novajet40 is selected
  useEffect(() => {
    const sheetPresets: Record<string, { defaultTop?: number; defaultLeft?: number; defaultScale?: number }> = {
      novajet40: { defaultTop: 2, defaultLeft: 1, defaultScale: 150 },
    };
    
    const preset = sheetPresets[sheetType];
    if (preset) {
      if (preset.defaultTop !== undefined) setTopOffset(preset.defaultTop);
      if (preset.defaultLeft !== undefined) setLeftOffset(preset.defaultLeft);
      if (preset.defaultScale !== undefined) setPrintScale(preset.defaultScale);
    } else {
      // Reset to 100% for other sheet types
      setPrintScale(100);
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
  
  // Margin preset state
  const [savedMarginPresets, setSavedMarginPresets] = useState<MarginPreset[]>([]);
  const [selectedMarginPreset, setSelectedMarginPreset] = useState<string>("");
  const [isMarginSaveDialogOpen, setIsMarginSaveDialogOpen] = useState(false);
  const [newMarginPresetName, setNewMarginPresetName] = useState("");
  const [newMarginPresetDescription, setNewMarginPresetDescription] = useState("");
  const [isEditingMarginPreset, setIsEditingMarginPreset] = useState(false);

  // Use the database hook for settings
  const {
    labelTemplates: dbLabelTemplates,
    marginPresets: dbMarginPresets,
    customPresets: dbCustomPresets,
    prnTemplates,
    defaultFormat: dbDefaultFormat,
    isLoading: isLoadingSettings,
    saveLabelTemplate: saveTemplateToDb,
    deleteLabelTemplate: deleteTemplateFromDb,
    saveMarginPreset: saveMarginToDb,
    deleteMarginPreset: deleteMarginFromDb,
    saveCustomPreset: saveCustomToDb,
    deleteCustomPreset: deleteCustomFromDb,
    savePRNTemplate,
    deletePRNTemplate,
    saveDefaultFormat: saveDefaultToDb,
  } = useBarcodeLabelSettings();
  
  // Label design customization state
  const [labelConfig, setLabelConfig] = useState<LabelDesignConfig>({
    brand: { show: true, fontSize: 8, bold: true, x: 0, y: 0, width: 100 },
    productName: { show: true, fontSize: 8, bold: true, x: 0, y: 4, width: 100 },
    color: { show: false, fontSize: 7, bold: false, x: 25, y: 8, width: 50 },
    style: { show: false, fontSize: 7, bold: false, x: 0, y: 8, width: 50 },
    size: { show: true, fontSize: 8, bold: false, x: 0, y: 8, width: 50 },
    price: { show: true, fontSize: 8, bold: true, x: 25, y: 8, width: 50 },
    mrp: { show: false, fontSize: 8, bold: false, x: 0, y: 12, width: 50 },
    customText: { show: false, fontSize: 8, bold: false, x: 25, y: 12, width: 50 },
    barcode: { show: true, fontSize: 8, bold: false, x: 0, y: 16, width: 100 },
    barcodeText: { show: true, fontSize: 7, bold: false, x: 0, y: 24, width: 100 },
    billNumber: { show: false, fontSize: 6, bold: false, x: 0, y: 31, width: 100 },
    supplierCode: { show: true, fontSize: 7, bold: false, x: 0, y: 28, width: 50 },
    purchaseCode: { show: false, fontSize: 7, bold: false, x: 25, y: 28, width: 50 },
    fieldOrder: ['brand', 'productName', 'size', 'price', 'mrp', 'customText', 'barcode', 'barcodeText', 'supplierCode', 'purchaseCode', 'billNumber', 'color', 'style'],
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
  const [isDirectPrintDialogOpen, setIsDirectPrintDialogOpen] = useState(false);

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

  // Sync database settings with local state
  useEffect(() => {
    if (isLoadingSettings) return;
    
    // Sync label templates
    setSavedLabelTemplates(dbLabelTemplates);
    
    // Sync margin presets
    setSavedMarginPresets(dbMarginPresets);
    
    // Sync custom presets
    setSavedPresets(dbCustomPresets);
    
    // Load default format if available
    if (dbDefaultFormat) {
      const defaultFormat = dbDefaultFormat;
      
      // Check if default references a template
      if (defaultFormat.defaultTemplate) {
        const template = dbLabelTemplates.find((t: LabelTemplate) => t.name === defaultFormat.defaultTemplate);
        
        if (template) {
          // Load template config
          const configWithBarcode = {
            ...template.config,
            barcode: { ...template.config.barcode, show: true },
            barcodeText: { ...template.config.barcodeText, show: true },
          };
          setLabelConfig(configWithBarcode);
          setSelectedLabelTemplate(template.name);
        } else if (defaultFormat.labelConfig) {
          // Template was deleted, fall back to inline config
          const configWithBarcode = {
            ...defaultFormat.labelConfig,
            barcode: { ...defaultFormat.labelConfig.barcode, show: true },
            barcodeText: { ...defaultFormat.labelConfig.barcodeText, show: true },
          };
          setLabelConfig(configWithBarcode);
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
      
      // Always load sheet settings - only load "custom" if valid customDimensions exist
      if (defaultFormat.sheetType) {
        // Don't load "custom" without valid dimensions, fallback to default preset
        if (defaultFormat.sheetType === "custom" && !defaultFormat.customDimensions) {
          setSheetType("novajet48");
        } else {
          setSheetType(defaultFormat.sheetType as SheetType);
        }
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
      if (defaultFormat.printScale !== undefined) {
        setPrintScale(defaultFormat.printScale);
      }
      if (defaultFormat.customDimensions && defaultFormat.sheetType === "custom") {
        setCustomWidth(defaultFormat.customDimensions.width);
        setCustomHeight(defaultFormat.customDimensions.height);
        setCustomCols(defaultFormat.customDimensions.cols);
        setCustomRows(defaultFormat.customDimensions.rows || 10);
        setCustomGap(defaultFormat.customDimensions.gap);
        if (defaultFormat.customDimensions.scale) {
          setPrintScale(defaultFormat.customDimensions.scale);
        }
      }
      // Load custom preset name if saved
      if (defaultFormat.customPresetName && defaultFormat.sheetType === "custom") {
        setSelectedPreset(defaultFormat.customPresetName);
      }
    }
  }, [isLoadingSettings, dbLabelTemplates, dbMarginPresets, dbCustomPresets, dbDefaultFormat]);

  // Get organization context
  const { currentOrganization } = useOrganization();

  // Fetch business name from settings (organization-scoped)
  useEffect(() => {
    const fetchBusinessName = async () => {
      if (!currentOrganization?.id) return;
      
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("business_name, purchase_settings")
          .eq("organization_id", currentOrganization.id)
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
  }, [currentOrganization?.id]);

  // Recalculate purchase codes when alphabet changes (handles timing issues)
  useEffect(() => {
    if (purchaseCodeAlphabet && labelItems.length > 0) {
      setLabelItems(prev => prev.map(item => ({
        ...item,
        purchase_code: item.pur_price && item.pur_price > 0 
          ? encodePurchasePrice(item.pur_price, purchaseCodeAlphabet) 
          : item.purchase_code
      })));
    }
  }, [purchaseCodeAlphabet]);

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
      let hasPurchasePrices = false;
      
      const items: LabelItem[] = purchaseItems.map((item: any) => {
        const purPrice = item.pur_price || 0;
        // Always calculate purchase code if pur_price exists
        const purchaseCode = purPrice > 0 
          ? encodePurchasePrice(purPrice, purchaseCodeAlphabet) 
          : undefined;
        
        if (purPrice > 0) {
          hasPurchasePrices = true;
        }
        
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
      
      // Auto-enable purchase code visibility when items have purchase prices
      if (hasPurchasePrices) {
        setShowPurchaseCode(true);
        setLabelConfig(prev => ({
          ...prev,
          purchaseCode: { ...prev.purchaseCode, show: true }
        }));
      }
      
      toast.success(`Loaded ${items.length} items from purchase bill`);
    }
  }, [location.state, purchaseCodeAlphabet]);

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
              style,
              category
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

        // Get variant IDs to fetch supplier codes
        const variantIds = (data || []).map((v: any) => v.id);
        
        // Fetch the most recent supplier code for each variant from purchase_items
        const supplierCodeMap = new Map<string, string>();
        if (variantIds.length > 0) {
          const { data: purchaseData } = await supabase
            .from("purchase_items")
            .select("sku_id, bill_id, created_at")
            .in("sku_id", variantIds)
            .order("created_at", { ascending: false });

          if (purchaseData) {
            // Get unique bill IDs
            const billIds = [...new Set(purchaseData.map((item: any) => item.bill_id))];
            
            // Fetch supplier info for these bills
            const { data: billData } = await supabase
              .from("purchase_bills")
              .select("id, supplier_id")
              .in("id", billIds);

            if (billData) {
              // Get supplier IDs
              const supplierIds = [...new Set(billData.map((bill: any) => bill.supplier_id).filter(Boolean))];
              
              // Fetch supplier codes
              const { data: supplierData } = await supabase
                .from("suppliers")
                .select("id, supplier_code")
                .in("id", supplierIds);

              // Build a map of bill_id -> supplier_code
              const billSupplierMap = new Map<string, string>();
              if (supplierData) {
                billData.forEach((bill: any) => {
                  const supplier = supplierData.find((s: any) => s.id === bill.supplier_id);
                  if (supplier?.supplier_code) {
                    billSupplierMap.set(bill.id, supplier.supplier_code);
                  }
                });
              }

              // Map sku_id to supplier_code (most recent purchase)
              const processedSkus = new Set<string>();
              purchaseData.forEach((item: any) => {
                if (!processedSkus.has(item.sku_id)) {
                  const supplierCode = billSupplierMap.get(item.bill_id);
                  if (supplierCode) {
                    supplierCodeMap.set(item.sku_id, supplierCode);
                  }
                  processedSkus.add(item.sku_id);
                }
              });
            }
          }
        }

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
          supplier_code: supplierCodeMap.get(v.id) || "",
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

    // Fetch pur_price from product_variants
    const { data: variantData } = await supabase
      .from("product_variants")
      .select("pur_price")
      .eq("id", result.id)
      .maybeSingle();

    const purPrice = variantData?.pur_price || 0;

    const newItem: LabelItem = {
      sku_id: result.id,
      product_name: result.product_name,
      brand: result.brand,
      category: result.category,
      color: result.color,
      style: result.style,
      size: result.size,
      sale_price: result.sale_price,
      pur_price: purPrice,
      purchase_code: purPrice > 0 ? encodePurchasePrice(purPrice, purchaseCodeAlphabet) : '',
      barcode: result.barcode,
      bill_number: '',
      qty: 1,
      supplier_code: result.supplier_code || '',
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
          pur_price,
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

      // Fetch supplier code from the bill
      const { data: billDetailData } = await supabase
        .from("purchase_bills")
        .select("supplier_id")
        .eq("id", billData.id)
        .maybeSingle();

      let supplierCode = '';
      if (billDetailData?.supplier_id) {
        const { data: supplierData } = await supabase
          .from("suppliers")
          .select("supplier_code")
          .eq("id", billDetailData.supplier_id)
          .maybeSingle();
        
        supplierCode = supplierData?.supplier_code || '';
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
          const purPrice = item.pur_price || 0;
          return {
            sku_id: item.sku_id,
            product_name: variantInfo.product_name,
            brand: variantInfo.brand,
            category: variantInfo.category,
            color: variantInfo.color,
            style: variantInfo.style,
            size: item.size || variantInfo.size,
            sale_price: item.sale_price || variantInfo.sale_price,
            pur_price: purPrice,
            purchase_code: purPrice > 0 ? encodePurchasePrice(purPrice, purchaseCodeAlphabet) : '',
            barcode: item.barcode || variantInfo.barcode,
            bill_number: billData.software_bill_no || '',
            qty: item.qty,
            supplier_code: supplierCode
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
  const handleSavePreset = async () => {
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
      scale: printScale,
    };

    const success = await saveCustomToDb(newPreset);
    if (success) {
      if (isEditingPreset) {
        toast.success(`Preset "${trimmedName}" updated successfully`);
      } else {
        toast.success(`Preset "${trimmedName}" saved successfully`);
      }
      setNewPresetName("");
      setIsSaveDialogOpen(false);
      setIsEditingPreset(false);
      setSelectedPreset(trimmedName);
    }
  };

  const handleEditPreset = () => {
    if (!selectedPreset) {
      toast.error("Please select a preset to rename");
      return;
    }

    // Use current form values, just set the name for renaming
    setNewPresetName(selectedPreset);
    setIsEditingPreset(true);
    setIsSaveDialogOpen(true);
  };

  const handleQuickUpdatePreset = async () => {
    if (!selectedPreset) {
      toast.error("Please select a preset to update");
      return;
    }

    const updatedPreset: CustomPreset = {
      name: selectedPreset,
      width: customWidth,
      height: customHeight,
      cols: customCols,
      rows: customRows,
      gap: customGap,
      scale: printScale,
    };

    const success = await saveCustomToDb(updatedPreset);
    if (success) {
      toast.success(`Preset "${selectedPreset}" updated`);
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
      setPrintScale(preset.scale || 100);
      setSelectedPreset(presetName);
      toast.success(`Loaded preset "${presetName}"`);
    }
  };

  const handleDeletePreset = async () => {
    if (!selectedPreset) {
      toast.error("Please select a preset to delete");
      return;
    }

    const success = await deleteCustomFromDb(selectedPreset);
    if (success) {
      setSelectedPreset("");
      toast.success(`Preset "${selectedPreset}" deleted`);
    }
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
    
    // Set scale based on preset type
    const scaleMap: Record<string, number> = {
      novajet40: 150,
    };
    setPrintScale(scaleMap[sheetType] || 100);
    
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
          mrp: preset.labelConfig.mrp || { show: false, fontSize: 9, bold: false },
          customText: preset.labelConfig.customText || { show: false, fontSize: 8, bold: false },
          barcode: preset.labelConfig.barcode || { show: true, fontSize: 9, bold: false },
          barcodeText: preset.labelConfig.barcodeText || { show: true, fontSize: 7, bold: false },
          billNumber: preset.labelConfig.billNumber || { show: true, fontSize: 7, bold: false },
          supplierCode: preset.labelConfig.supplierCode || { show: true, fontSize: 7, bold: false },
          purchaseCode: preset.labelConfig.purchaseCode || { show: false, fontSize: 7, bold: false },
          fieldOrder: preset.labelConfig.fieldOrder || ['brand', 'productName', 'color', 'style', 'size', 'price', 'mrp', 'customText', 'barcode', 'billNumber', 'barcodeText', 'supplierCode', 'purchaseCode'],
          customTextValue: preset.labelConfig.customTextValue || '',
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

  // Margin preset management functions
  const handleSaveMarginPreset = async () => {
    const trimmedName = newMarginPresetName.trim();
    
    if (!trimmedName) {
      toast.error("Please enter a preset name");
      return;
    }

    if (trimmedName.length > 50) {
      toast.error("Preset name must be less than 50 characters");
      return;
    }

    const existingIndex = savedMarginPresets.findIndex(p => p.name === trimmedName);
    
    if (!isEditingMarginPreset && existingIndex !== -1) {
      toast.error("A margin preset with this name already exists");
      return;
    }

    const newPreset: MarginPreset = {
      name: trimmedName,
      topOffset,
      leftOffset,
      bottomOffset,
      rightOffset,
      description: newMarginPresetDescription.trim() || undefined,
    };

    const success = await saveMarginToDb(newPreset);
    if (success) {
      if (isEditingMarginPreset) {
        toast.success(`Margin preset "${trimmedName}" updated`);
      } else {
        toast.success(`Margin preset "${trimmedName}" saved`);
      }
      setSelectedMarginPreset(trimmedName);
      setIsMarginSaveDialogOpen(false);
      setIsEditingMarginPreset(false);
      setNewMarginPresetName("");
      setNewMarginPresetDescription("");
    }
  };

  const handleEditMarginPreset = () => {
    if (!selectedMarginPreset) {
      toast.error("Please select a margin preset to edit");
      return;
    }

    const preset = savedMarginPresets.find(p => p.name === selectedMarginPreset);
    if (preset) {
      setTopOffset(preset.topOffset);
      setLeftOffset(preset.leftOffset);
      setBottomOffset(preset.bottomOffset);
      setRightOffset(preset.rightOffset);
      setNewMarginPresetName(preset.name);
      setNewMarginPresetDescription(preset.description || "");
      setIsEditingMarginPreset(true);
      setIsMarginSaveDialogOpen(true);
    }
  };

  const handleLoadMarginPreset = (presetName: string) => {
    const preset = savedMarginPresets.find(p => p.name === presetName);
    if (preset) {
      setTopOffset(preset.topOffset);
      setLeftOffset(preset.leftOffset);
      setBottomOffset(preset.bottomOffset);
      setRightOffset(preset.rightOffset);
      setSelectedMarginPreset(presetName);
      toast.success(`Loaded margin preset "${presetName}"`);
    }
  };

  const handleDeleteMarginPreset = async () => {
    if (!selectedMarginPreset) {
      toast.error("Please select a margin preset to delete");
      return;
    }

    const success = await deleteMarginFromDb(selectedMarginPreset);
    if (success) {
      setSelectedMarginPreset("");
      toast.success(`Margin preset "${selectedMarginPreset}" deleted`);
    }
  };

  // Label template management functions
  const handleSaveLabelTemplate = async () => {
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

    // Save to database
    const success = await saveTemplateToDb(newTemplate);
    if (success) {
      if (isEditingLabelTemplate) {
        toast.success(`Template "${trimmedName}" updated successfully`);
      } else {
        toast.success(`Template "${trimmedName}" saved successfully`);
      }
      setNewLabelTemplateName("");
      setIsLabelTemplateSaveDialogOpen(false);
      setIsEditingLabelTemplate(false);
      setSelectedLabelTemplate(trimmedName);
    }
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
        mrp: template.config.mrp || { show: false, fontSize: 9, bold: false },
        customText: template.config.customText || { show: false, fontSize: 8, bold: false },
        barcode: template.config.barcode || { show: true, fontSize: 9, bold: false },
        barcodeText: template.config.barcodeText || { show: true, fontSize: 7, bold: false },
        billNumber: template.config.billNumber || { show: true, fontSize: 7, bold: false },
        supplierCode: template.config.supplierCode || { show: true, fontSize: 7, bold: false },
        purchaseCode: template.config.purchaseCode || { show: false, fontSize: 7, bold: false },
        fieldOrder: template.config.fieldOrder || ['brand', 'productName', 'color', 'style', 'size', 'price', 'mrp', 'customText', 'barcode', 'billNumber', 'barcodeText', 'supplierCode', 'purchaseCode'],
        customTextValue: template.config.customTextValue || '',
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
        mrp: template.config.mrp || { show: false, fontSize: 9, bold: false },
        customText: template.config.customText || { show: false, fontSize: 8, bold: false },
        barcode: template.config.barcode || { show: true, fontSize: 9, bold: false },
        barcodeText: template.config.barcodeText || { show: true, fontSize: 7, bold: false },
        billNumber: template.config.billNumber || { show: true, fontSize: 7, bold: false },
        supplierCode: template.config.supplierCode || { show: true, fontSize: 7, bold: false },
        purchaseCode: template.config.purchaseCode || { show: false, fontSize: 7, bold: false },
        fieldOrder: template.config.fieldOrder || ['brand', 'productName', 'color', 'style', 'size', 'price', 'mrp', 'customText', 'barcode', 'billNumber', 'barcodeText', 'supplierCode', 'purchaseCode'],
        customTextValue: template.config.customTextValue || '',
      };
      setLabelConfig(mergedConfig);
      setSelectedLabelTemplate(templateName);
      toast.success(`Loaded template "${templateName}"`);
    }
  };

  const handleDeleteLabelTemplate = async () => {
    if (!selectedLabelTemplate) {
      toast.error("Please select a template to delete");
      return;
    }

    const success = await deleteTemplateFromDb(selectedLabelTemplate);
    if (success) {
      setSelectedLabelTemplate("");
      toast.success(`Template "${selectedLabelTemplate}" deleted`);
    }
  };

  const handleSaveAsDefault = async () => {
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
      printScale,
      customPresetName: sheetType === "custom" && selectedPreset ? selectedPreset : undefined,
      customDimensions: sheetType === "custom" ? {
        width: customWidth,
        height: customHeight,
        cols: customCols,
        rows: customRows,
        gap: customGap,
        scale: printScale,
      } : undefined,
    };

    const success = await saveDefaultToDb(defaultFormat);
    if (success) {
      if (selectedLabelTemplate) {
        toast.success(`Template "${selectedLabelTemplate}" set as default format`);
      } else {
        toast.success("Current layout saved as default format");
      }
    }
  };

  // Check if config has absolute positioning (x/y defined)
  const hasAbsolutePositioning = (config: LabelDesignConfig): boolean => {
    return config.fieldOrder.some(fieldKey => {
      const field = config[fieldKey] as LabelFieldConfig;
      return field && (field.x !== undefined || field.y !== undefined);
    });
  };

  // Get label dimensions based on current sheet type
  const getLabelDimensions = () => {
    if (sheetType === "custom") {
      return { width: customWidth, height: customHeight };
    }
    const preset = sheetPresets[sheetType];
    return {
      width: parseInt(preset.width),
      height: parseInt(preset.height)
    };
  };

  const getLabelHTML = (item: LabelItem, format: DesignFormat) => {
    const barcode = item.barcode || genEAN8();
    const config = labelConfig;
    const labelDimensions = getLabelDimensions();
    const labelWidthMm = labelDimensions.width;
    const labelHeightMm = labelDimensions.height;

    // Get field content matching BarTenderLabelDesigner.getFieldContent exactly
    const getFieldContent = (fieldKey: keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth'>) => {
      switch (fieldKey) {
        case 'brand': 
          return item.brand || businessName || 'Brand';
        case 'productName': 
          return item.product_name + (config.size.show ? '' : ` (${item.size})`);
        case 'color': 
          return item.color || '';
        case 'style': 
          return item.style || '';
        case 'price': 
          return `₹${item.sale_price}`;
        case 'barcode':
          return barcode;
        case 'barcodeText': 
          return barcode;
        case 'billNumber': 
          return item.bill_number || '';
        case 'supplierCode': 
          return item.supplier_code || '';
        case 'purchaseCode': 
          return item.purchase_code || '';
        case 'size': 
          return item.size || '';
        default: 
          return '';
      }
    };

    // Check if using absolute positioning (matching BarTenderLabelDesigner)
    if (hasAbsolutePositioning(config)) {
      // Generate HTML with absolute positioning matching the designer exactly
      let fieldsHtml = '';

      config.fieldOrder.forEach((fieldKey) => {
        const field = config[fieldKey] as LabelFieldConfig;
        if (!field.show) return;

        const content = getFieldContent(fieldKey);
        if (!content) return;

        const x = field.x ?? 0;
        const y = field.y ?? 0;
        const widthPercent = field.width ?? 100;
        const widthMm = (widthPercent / 100) * labelWidthMm;
        const heightStyle = field.height ? `height: ${field.height}mm;` : '';

        if (fieldKey === 'barcode') {
          // Pre-render barcode as image for reliable printing
          const barcodeHeight = config.barcodeHeight || 25;
          const barcodeWidth = config.barcodeWidth || 1.5;
          const barcodeHeightMm = Math.max(6, barcodeHeight * 0.35);
          const barcodeDataUrl = renderBarcodeToDataURL(barcode, barcodeHeight, barcodeWidth);
          
          fieldsHtml += `
            <div style="
              position: absolute;
              left: ${x}mm;
              top: ${y}mm;
              width: ${widthMm}mm;
              height: ${barcodeHeightMm}mm;
              display: flex;
              justify-content: ${field.textAlign === 'left' ? 'flex-start' : field.textAlign === 'right' ? 'flex-end' : 'center'};
              align-items: center;
              overflow: visible;
            ">
              ${barcodeDataUrl ? `<img src="${barcodeDataUrl}" style="height: ${barcodeHeightMm}mm; max-width: 100%; display: block;" alt="barcode" />` : `<span style="font-size: 8px;">${barcode}</span>`}
            </div>
          `;
        } else {
          // Text field with absolute positioning
          fieldsHtml += `
            <div style="
              position: absolute;
              left: ${x}mm;
              top: ${y}mm;
              width: ${widthMm}mm;
              ${heightStyle}
              font-size: ${field.fontSize}px;
              font-weight: ${field.bold ? 'bold' : 'normal'};
              ${field.fontFamily ? `font-family: ${field.fontFamily};` : ''}
              text-align: ${field.textAlign || 'center'};
              line-height: ${field.lineHeight || 1.1};
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            ">${content}</div>
          `;
        }
      });

      return fieldsHtml;
    }

    // Legacy flow-based layout for configs without absolute positioning
    const getStyle = (field: LabelFieldConfig, extraStyles: string = '') => {
      const paddingTop = field.paddingTop ?? 0;
      const paddingBottom = field.paddingBottom ?? 0;
      const paddingLeft = field.paddingLeft ?? 0;
      const paddingRight = field.paddingRight ?? 0;
      return `font-size: ${field.fontSize}px; font-weight: ${field.bold ? 'bold' : 'normal'};${field.fontFamily ? ` font-family: ${field.fontFamily};` : ''} text-align: ${field.textAlign || 'center'}; padding: ${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px; line-height: 1.1; width: 100%; box-sizing: border-box;${extraStyles}`;
    };

    let html = '';
    
    config.fieldOrder.forEach((fieldKey) => {
      const field = config[fieldKey] as LabelFieldConfig;
      
      if (!field.show) return;
      
      const content = getFieldContent(fieldKey);
      if (!content) return;
      
      if (fieldKey === 'barcode') {
        const bcPaddingTop = field.paddingTop ?? 0;
        const bcPaddingBottom = field.paddingBottom ?? 0;
        const bcPaddingLeft = field.paddingLeft ?? 0;
        const bcPaddingRight = field.paddingRight ?? 0;
        const barcodeHeight = config.barcodeHeight || 28;
        const barcodeWidth = config.barcodeWidth || 1.8;
        const barcodeDataUrl = renderBarcodeToDataURL(barcode, barcodeHeight, barcodeWidth);
        
        if (barcodeDataUrl) {
          html += `<img src="${barcodeDataUrl}" class="barcode-img" style="display: block; margin: ${bcPaddingTop}px auto ${bcPaddingBottom}px auto; padding-left: ${bcPaddingLeft}px; padding-right: ${bcPaddingRight}px; height: ${barcodeHeight * 0.35}mm;" alt="barcode" />`;
        } else {
          html += `<div style="text-align: center; font-size: 10px; font-weight: bold;">${barcode}</div>`;
        }
      } else {
        html += `<div class="${fieldKey}" style="${getStyle(field)}">${content}</div>`;
      }
    });

    return html;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLabelConfig((prev) => {
        const oldIndex = prev.fieldOrder.indexOf(active.id as keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth' | 'customTextValue'>);
        const newIndex = prev.fieldOrder.indexOf(over.id as keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth' | 'customTextValue'>);

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
        
        // Check if using absolute positioning for cell styling
        const useAbsoluteLayout = hasAbsolutePositioning(labelConfig);
        
        for (let i = startIdx; i < endIdx; i++) {
          const cell = document.createElement("div");
          cell.className = "label-cell";
          
          if (useAbsoluteLayout) {
            // Absolute positioning layout - matches BarTenderLabelDesigner
            cell.style.cssText = `
              width: ${dimensions.width}mm;
              height: ${dimensions.height}mm;
              font-family: Arial, sans-serif;
              position: relative;
              overflow: hidden;
              box-sizing: border-box;
            `;
          } else {
            // Legacy flow-based layout
            cell.style.cssText = `
              width: ${dimensions.width}mm;
              height: ${dimensions.height}mm;
              font-family: Arial, sans-serif;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              padding: 2px;
              box-sizing: border-box;
              line-height: 1.1;
            `;
          }
          cell.innerHTML = allLabels[i].html;
          gridDiv.appendChild(cell);
        }

        printArea.appendChild(gridDiv);
      }
    } else {
      // Print mode: Create separate grids per page for proper page breaks
      const availableHeight = 297 - topOffset - bottomOffset - 5; // A4 height with margins
      const rowsPerPage = Math.floor(availableHeight / (dimensions.height + dimensions.gap));
      const labelsPerPage = dimensions.cols * Math.max(1, rowsPerPage);
      const numPrintPages = allLabels.length > 0 ? Math.ceil(allLabels.length / labelsPerPage) : 0;
      
      // Check if using absolute positioning for cell styling
      const useAbsoluteLayout = hasAbsolutePositioning(labelConfig);

      for (let page = 0; page < numPrintPages; page++) {
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
          page-break-after: always;
          break-after: page;
        `;
        
        // Don't add page break after last page
        if (page === numPrintPages - 1) {
          gridDiv.style.pageBreakAfter = 'auto';
          gridDiv.style.breakAfter = 'auto';
        }
        
        // Add labels for this page
        const startIdx = page * labelsPerPage;
        const endIdx = Math.min(startIdx + labelsPerPage, allLabels.length);
        
        for (let i = startIdx; i < endIdx; i++) {
          const cell = document.createElement("div");
          cell.className = "label-cell";
          
          if (useAbsoluteLayout) {
            // Absolute positioning layout - matches BarTenderLabelDesigner
            cell.style.cssText = `
              width: ${dimensions.width}mm;
              height: ${dimensions.height}mm;
              font-family: Arial, sans-serif;
              position: relative;
              overflow: hidden;
              box-sizing: border-box;
            `;
          } else {
            // Legacy flow-based layout
            cell.style.cssText = `
              width: ${dimensions.width}mm;
              height: ${dimensions.height}mm;
              font-family: Arial, sans-serif;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              padding: 2px;
              box-sizing: border-box;
              line-height: 1.1;
            `;
          }
          cell.innerHTML = allLabels[i].html;
          gridDiv.appendChild(cell);
        }

        printArea.appendChild(gridDiv);
      }
    }
    // Barcodes are now pre-rendered as images in getLabelHTML, no setTimeout needed
  };

  const handlePrint = () => {
    // Generate labels in the print area
    generatePreview("printArea");
    
    // Print immediately since barcodes are pre-rendered
    setTimeout(() => {
      window.print();
    }, 50);
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
      
      // Get dimensions based on sheet type and apply scale
      const scaleFactor = printScale / 100;
      const baseDimensions = sheetType === "custom"
        ? { cols: customCols, rows: customRows, width: customWidth, height: customHeight, gap: customGap }
        : {
            cols: sheetPresets[sheetType].cols,
            rows: Math.ceil(totalLabels / sheetPresets[sheetType].cols),
            width: parseInt(sheetPresets[sheetType].width),
            height: parseInt(sheetPresets[sheetType].height),
            gap: parseInt(sheetPresets[sheetType].gap)
          };
      
      // Apply scale to dimensions for PDF
      const dimensions = {
        ...baseDimensions,
        width: baseDimensions.width * scaleFactor,
        height: baseDimensions.height * scaleFactor,
        gap: baseDimensions.gap * scaleFactor
      };
      
      // Calculate how many rows fit on one page - use BASE dimensions (unscaled) for accurate page calculation
      const availableHeight = 297 - topOffset - bottomOffset - 10; // A4 height with margins
      const rowsPerPage = Math.floor(availableHeight / (baseDimensions.height + baseDimensions.gap));
      const labelsPerPage = baseDimensions.cols * Math.max(1, rowsPerPage);
      
      // Calculate number of pages needed based on actual labels only
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
        // Calculate labels for this page
        const startIdx = page * labelsPerPage;
        const endIdx = Math.min(startIdx + labelsPerPage, allLabels.length);
        
        // Skip if no labels for this page
        if (startIdx >= allLabels.length) {
          continue;
        }

        if (page > 0) {
          pdf.addPage();
        }

        // Clear temp container
        tempContainer.innerHTML = "";

        // Calculate actual rows on this page for height calculation
        const labelsOnThisPage = endIdx - startIdx;
        const rowsOnThisPage = Math.ceil(labelsOnThisPage / dimensions.cols);
        const actualContentHeight = topOffset + (rowsOnThisPage * (dimensions.height + dimensions.gap)) + bottomOffset + 5;

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
          height: ${Math.min(actualContentHeight, 297)}mm;
          overflow: hidden;
        `;
        
        // Check if using absolute positioning for cell styling
        const useAbsoluteLayout = hasAbsolutePositioning(labelConfig);
        
        for (let i = startIdx; i < endIdx; i++) {
          const cell = document.createElement("div");
          cell.className = "label-cell";
          
          if (useAbsoluteLayout) {
            // Absolute positioning layout - matches BarTenderLabelDesigner
            cell.style.cssText = `
              width: ${dimensions.width}mm;
              height: ${dimensions.height}mm;
              font-family: Arial, sans-serif;
              position: relative;
              overflow: hidden;
              box-sizing: border-box;
              border: 1px solid #e5e5e5;
              background: #fff;
            `;
          } else {
            // Legacy flow-based layout
            cell.style.cssText = `
              width: ${dimensions.width}mm;
              height: ${dimensions.height}mm;
              font-family: Arial, sans-serif;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              padding: 2px;
              box-sizing: border-box;
              border: 1px solid #e5e5e5;
              background: #fff;
              line-height: 1.1;
            `;
          }
          
          // Add style tag for inner elements to remove default spacing
          const styleTag = document.createElement("style");
          styleTag.textContent = `
            .label-cell div { line-height: 1.1; }
            .label-cell svg.barcode { display: block; margin: 0 auto; }
            .label-cell .barcode-text { line-height: 1; }
          `;
          cell.appendChild(styleTag);
          cell.innerHTML += allLabels[i].html;
          gridDiv.appendChild(cell);
        }

        tempContainer.appendChild(gridDiv);

        // Pre-render barcodes as canvas images for reliable PDF capture
        const barcodes = tempContainer.querySelectorAll("svg.barcode");
        const barcodePromises: Promise<void>[] = [];
        
        barcodes.forEach((svg) => {
          const code = (svg as HTMLElement).dataset.code;
          if (code) {
            const promise = new Promise<void>((resolve) => {
              try {
                const barcodeHeight = labelConfig.barcodeHeight || 28;
                const barcodeWidth = labelConfig.barcodeWidth || 1.8;
                
                // Create a temporary canvas to render barcode
                const tempCanvas = document.createElement('canvas');
                
                // First render to SVG to get dimensions
                const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                JsBarcode(tempSvg, code, {
                  format: "CODE128",
                  fontSize: 0,
                  height: barcodeHeight,
                  width: barcodeWidth,
                  textMargin: 0,
                  margin: 0,
                  marginTop: 0,
                  marginBottom: 0,
                  marginLeft: 0,
                  marginRight: 0,
                  displayValue: false,
                  background: 'transparent',
                  lineColor: '#000000',
                });
                
                // Get SVG dimensions
                const svgWidth = tempSvg.getAttribute('width') || '100';
                const svgHeight = tempSvg.getAttribute('height') || '30';
                
                // Convert SVG to data URL and create image
                const svgString = new XMLSerializer().serializeToString(tempSvg);
                const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);
                
                const img = new Image();
                img.onload = () => {
                  // Draw to canvas
                  tempCanvas.width = img.width * 2; // Higher resolution
                  tempCanvas.height = img.height * 2;
                  const ctx = tempCanvas.getContext('2d');
                  if (ctx) {
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                    ctx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
                  }
                  
                  // Convert canvas to data URL
                  const dataUrl = tempCanvas.toDataURL('image/png');
                  
                  // Replace SVG with IMG element
                  const imgElement = document.createElement('img');
                  imgElement.src = dataUrl;
                  imgElement.style.cssText = `width: 100%; height: ${barcodeHeight}px; display: block; object-fit: contain;`;
                  
                  svg.parentNode?.replaceChild(imgElement, svg);
                  
                  URL.revokeObjectURL(url);
                  resolve();
                };
                
                img.onerror = () => {
                  console.error('Failed to load barcode image for:', code);
                  // Fallback: render barcode number as text
                  const textDiv = document.createElement('div');
                  textDiv.textContent = code;
                  textDiv.style.cssText = 'font-size: 10px; font-weight: bold; text-align: center; font-family: monospace;';
                  svg.parentNode?.replaceChild(textDiv, svg);
                  URL.revokeObjectURL(url);
                  resolve();
                };
                
                img.src = url;
              } catch (error) {
                console.error("Barcode generation failed for code:", code, error);
                // Fallback: display barcode as text
                const textDiv = document.createElement('div');
                textDiv.textContent = code;
                textDiv.style.cssText = 'font-size: 10px; font-weight: bold; text-align: center; font-family: monospace;';
                svg.parentNode?.replaceChild(textDiv, svg);
                resolve();
              }
            });
            barcodePromises.push(promise);
          }
        });

        // Wait for all barcodes to be converted to images
        await Promise.all(barcodePromises);
        
        // Additional wait to ensure DOM is updated
        await new Promise(resolve => setTimeout(resolve, 100));

        // Capture this page with high quality - only capture actual content height
        const captureHeight = Math.min(actualContentHeight, 297);
        const canvas = await html2canvas(tempContainer, {
          scale: 3, // Higher scale for better quality
          backgroundColor: "#ffffff",
          logging: false,
          useCORS: true,
          allowTaint: true,
          width: 210 * 3.78, // Convert mm to pixels (1mm = ~3.78px)
          height: captureHeight * 3.78,
        });

        const imgData = canvas.toDataURL("image/png");
        pdf.addImage(imgData, "PNG", 0, 0, 210, captureHeight);
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
                      <div className="flex-1 grid grid-cols-6 gap-2 text-sm">
                        <div className="font-semibold truncate">{result.product_name}</div>
                        <div className="text-muted-foreground truncate">{result.brand || "-"}</div>
                        <div className="text-muted-foreground truncate">{result.color || "-"} / {result.style || "-"}</div>
                        <div className="font-medium">Size: {result.size}</div>
                        <div className="text-muted-foreground text-xs">Sup: {result.supplier_code || "-"}</div>
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
          <div className="bg-muted p-3 border-b">
            <p className="text-sm font-medium">
              Total Products: <span className="font-bold">{labelItems.length}</span> | 
              Total Labels: <span className="font-bold text-primary">{labelItems.reduce((sum, item) => sum + item.qty, 0)}</span>
            </p>
          </div>
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
                <TableHead className="w-[80px]">Action</TableHead>
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
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLabelItems(prev => prev.filter(i => i.sku_id !== item.sku_id));
                        toast.success("Product removed");
                      }}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
                <SelectContent className="bg-background z-50 max-h-[400px]">
                  {/* A4 Sheet Presets - Small */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">📄 A4 - Small Labels</div>
                  <SelectItem value="a4_80sheet">A4 80-Sheet (26×14mm, tiny)</SelectItem>
                  <SelectItem value="novajet48">Novajet 48 (33×19mm, 8 cols)</SelectItem>
                  <SelectItem value="novajet65">Novajet 65 (38×21mm, 5 cols)</SelectItem>
                  <SelectItem value="a4_65sheet">A4 65-Sheet (38×22mm, shelf)</SelectItem>
                  
                  {/* A4 Sheet Presets - Medium */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">📄 A4 - Medium Labels</div>
                  <SelectItem value="a4_12x4">A4 48-Sheet (50×24mm, 4×12)</SelectItem>
                  <SelectItem value="a4_36sheet">A4 36-Sheet (48×30mm, 4×9)</SelectItem>
                  <SelectItem value="a4_32sheet">A4 32-Sheet (52×30mm, retail)</SelectItem>
                  <SelectItem value="a4_35square">A4 35-Square (35×35mm, square)</SelectItem>
                  <SelectItem value="novajet40">Novajet 40 (39×35mm, 5×8)</SelectItem>
                  
                  {/* A4 Sheet Presets - Large */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">📄 A4 - Large Labels</div>
                  <SelectItem value="a4_24sheet">A4 24-Sheet (70×35mm, warehouse)</SelectItem>
                  <SelectItem value="a4_21sheet">A4 21-Sheet (63.5×38.1mm, address)</SelectItem>
                  <SelectItem value="a4_20sheet">A4 20-Sheet (100×50mm, shipping)</SelectItem>
                  
                  {/* Thermal Roll Presets - 1UP Small */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">🔥 Thermal 1UP - Small</div>
                  <SelectItem value="thermal_40x20_1up">40×20mm (jewelry/small)</SelectItem>
                  <SelectItem value="thermal_38x25_1up">38×25mm (compact)</SelectItem>
                  <SelectItem value="thermal_40x30_1up">40×30mm (small retail)</SelectItem>
                  <SelectItem value="thermal_50x25_1up">50×25mm (standard)</SelectItem>
                  <SelectItem value="thermal_50x30_1up">50×30mm (retail)</SelectItem>
                  
                  {/* Thermal Roll Presets - 1UP Medium */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">🔥 Thermal 1UP - Medium</div>
                  <SelectItem value="thermal_50x40_1up">50×40mm (detailed)</SelectItem>
                  <SelectItem value="thermal_60x30_1up">60×30mm (wide)</SelectItem>
                  <SelectItem value="thermal_60x40_1up">60×40mm (large)</SelectItem>
                  <SelectItem value="thermal_75x50_1up">75×50mm (medium shipping)</SelectItem>
                  <SelectItem value="thermal_80x40_1up">80×40mm (wide shipping)</SelectItem>
                  
                  {/* Thermal Roll Presets - 1UP Large */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">🔥 Thermal 1UP - Large</div>
                  <SelectItem value="thermal_100x50_1up">100×50mm (shipping)</SelectItem>
                  <SelectItem value="thermal_100x100_1up">100×100mm (large shipping)</SelectItem>
                  
                  {/* Thermal Roll Presets - 2UP */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">🔥 Thermal 2UP (Dual Column)</div>
                  <SelectItem value="thermal_40x20_2up">40×20mm (2UP)</SelectItem>
                  <SelectItem value="thermal_40x30_2up">40×30mm (2UP)</SelectItem>
                  <SelectItem value="thermal_38x25_2up">38×25mm (2UP)</SelectItem>
                  <SelectItem value="thermal_50x25_2up">50×25mm (2UP)</SelectItem>
                  <SelectItem value="thermal_50x30_2up">50×30mm (2UP)</SelectItem>
                  <SelectItem value="thermal_60x30_2up">60×30mm (2UP)</SelectItem>
                  <SelectItem value="thermal_60x40_2up">60×40mm (2UP)</SelectItem>
                  <SelectItem value="thermal_75x50_2up">75×50mm (2UP)</SelectItem>
                  
                  {/* Custom */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">⚙️ Custom</div>
                  <SelectItem value="custom">Custom Dimensions</SelectItem>
                  
                  {savedPresets.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">💾 My Saved Presets</div>
                      {savedPresets.map((preset) => (
                        <SelectItem key={preset.name} value={`preset_${preset.name}`}>
                          {preset.name} ({preset.width}×{preset.height}mm, {preset.cols}×{preset.rows})
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              {sheetType !== "custom" && !sheetType.startsWith("thermal") && (
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
                <strong>Recommended Print Settings:</strong> Scale 150% (auto-applied), Margins: None, Headers/Footers: Off<br />
                <strong>Starting Offsets:</strong> Top 2mm, Left 1mm (auto-loaded, adjust as needed)
              </p>
            )}
            {sheetType.startsWith("thermal") && (
              <div className="mt-2 p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-800">
                <p className="text-xs text-orange-700 dark:text-orange-300 font-medium mb-1">🔥 Thermal Printer Tips:</p>
                <ul className="text-xs text-orange-600 dark:text-orange-400 space-y-0.5 list-disc list-inside">
                  <li>Set printer paper size to match label size</li>
                  <li>Use "No Margins" in print settings</li>
                  <li>Select "Continuous Roll" if available</li>
                </ul>
              </div>
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
                <div className="space-y-2">
                  <Label htmlFor="printScaleCustom">Print Scale (%)</Label>
                  <Input
                    id="printScaleCustom"
                    type="number"
                    min="50"
                    max="200"
                    value={printScale}
                    onChange={(e) => setPrintScale(Math.max(50, Math.min(200, parseInt(e.target.value) || 100)))}
                    placeholder="e.g., 100"
                  />
                  <p className="text-xs text-muted-foreground">100% = normal, 150% = larger</p>
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
                             <li>Print Scale: {printScale}%</li>
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
                        variant="default"
                        onClick={handleQuickUpdatePreset}
                        title="Update preset with current values"
                        className="gap-2"
                      >
                        <Save className="h-4 w-4" />
                        Update
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleEditPreset}
                        title="Rename this preset"
                        className="gap-2"
                      >
                        <Edit className="h-4 w-4" />
                        Rename
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
                    } else if (v.startsWith("builtin_")) {
                      // Handle built-in template
                      const templateName = v.replace("builtin_", "");
                      const builtIn = builtInLabelTemplates.find(t => t.name === templateName);
                      if (builtIn) {
                        setLabelConfig(builtIn.config);
                        setSelectedLabelTemplate(templateName);
                        toast.success(`Loaded template "${templateName}"`);
                      }
                    } else {
                      handleLoadLabelTemplate(v);
                    }
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select template..." />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50 max-h-[300px]">
                    <SelectItem value="none">No Template</SelectItem>
                    
                    {/* Built-in Thermal Templates */}
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">🔥 Thermal Templates</div>
                    {builtInLabelTemplates.map((template) => (
                      <SelectItem key={template.name} value={`builtin_${template.name}`}>
                        {template.name}
                      </SelectItem>
                    ))}
                    
                    {savedLabelTemplates.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">💾 My Templates</div>
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
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-medium text-sm mb-1">Interactive Label Editor</h4>
                    <p className="text-xs text-muted-foreground">Click fields in preview to edit, use arrow keys for precise spacing</p>
                  </div>
                  {selectedLabelTemplate && (
                    <Button 
                      size="sm" 
                      variant="default"
                      onClick={async () => {
                        const newTemplate: LabelTemplate = {
                          name: selectedLabelTemplate,
                          config: { ...labelConfig }
                        };
                        const success = await saveTemplateToDb(newTemplate);
                        if (success) {
                          toast.success(`Template "${selectedLabelTemplate}" updated`);
                        }
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Update "{selectedLabelTemplate}"
                    </Button>
                  )}
                </div>
                
                <BarTenderLabelDesigner
                  labelConfig={labelConfig}
                  setLabelConfig={setLabelConfig}
                  businessName={businessName}
                  sampleItem={labelItems.length > 0 ? labelItems[0] : null}
                  labelWidth={sheetType === 'custom' ? customWidth : parseInt(sheetPresets[sheetType].width)}
                  labelHeight={sheetType === 'custom' ? customHeight : parseInt(sheetPresets[sheetType].height)}
                  columns={sheetType === 'custom' ? customCols : sheetPresets[sheetType].cols}
                  savedTemplates={dbLabelTemplates}
                  onSaveTemplate={saveTemplateToDb}
                  onDeleteTemplate={deleteTemplateFromDb}
                />
              </div>
            )}
          </div>

          {/* Margin Presets Section */}
          <div className="col-span-full border rounded-lg p-4 space-y-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Sheet Margin Presets</h3>
                <p className="text-sm text-muted-foreground">
                  Save margin configurations for different label sheet brands (Avery, Brother, etc.)
                </p>
              </div>
              
              <div className="flex gap-2 items-center">
                <Select 
                  value={selectedMarginPreset || "none"} 
                  onValueChange={(v) => {
                    if (v === "none") {
                      setSelectedMarginPreset("");
                    } else {
                      handleLoadMarginPreset(v);
                    }
                  }}
                >
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Select margin preset..." />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="none">No Preset</SelectItem>
                    {savedMarginPresets.length > 0 && (
                      <>
                        <SelectItem value="divider" disabled className="font-semibold text-xs uppercase opacity-50">
                          — Saved Margin Presets —
                        </SelectItem>
                        {savedMarginPresets.map((preset) => (
                          <SelectItem key={preset.name} value={preset.name}>
                            <div className="flex flex-col items-start">
                              <span>{preset.name}</span>
                              {preset.description && (
                                <span className="text-xs text-muted-foreground">{preset.description}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>

                <Dialog open={isMarginSaveDialogOpen} onOpenChange={setIsMarginSaveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        setNewMarginPresetName("");
                        setNewMarginPresetDescription("");
                        setIsEditingMarginPreset(false);
                      }}
                    >
                      <Save className="h-4 w-4 mr-1" />
                      Save Margins
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{isEditingMarginPreset ? "Update" : "Save"} Margin Preset</DialogTitle>
                      <DialogDescription>
                        {isEditingMarginPreset ? "Update the margin preset" : "Save current margin settings for a specific label sheet brand"}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Preset Name</Label>
                        <Input
                          placeholder="e.g., Avery 5160, Brother DK-1234"
                          value={newMarginPresetName}
                          onChange={(e) => setNewMarginPresetName(e.target.value.slice(0, 50))}
                          maxLength={50}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description (Optional)</Label>
                        <Input
                          placeholder="e.g., Standard address labels, 30 per sheet"
                          value={newMarginPresetDescription}
                          onChange={(e) => setNewMarginPresetDescription(e.target.value.slice(0, 100))}
                          maxLength={100}
                        />
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1 p-3 bg-muted/50 rounded-lg">
                        <p className="font-medium">Current Margins:</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>• Top: {topOffset}mm</div>
                          <div>• Left: {leftOffset}mm</div>
                          <div>• Bottom: {bottomOffset}mm</div>
                          <div>• Right: {rightOffset}mm</div>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => {
                        setIsMarginSaveDialogOpen(false);
                        setIsEditingMarginPreset(false);
                        setNewMarginPresetName("");
                        setNewMarginPresetDescription("");
                      }}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveMarginPreset}>
                        {isEditingMarginPreset ? "Update" : "Save"} Preset
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {selectedMarginPreset && (
                  <>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleEditMarginPreset}
                      title="Edit this margin preset"
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleDeleteMarginPreset}
                      title="Delete this margin preset"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Top Margin (mm)</Label>
            <Input
              type="number"
              min="0"
              value={topOffset}
              onChange={(e) => {
                setTopOffset(parseFloat(e.target.value) || 0);
                setSelectedMarginPreset("");
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Left Margin (mm)</Label>
            <Input
              type="number"
              min="0"
              value={leftOffset}
              onChange={(e) => {
                setLeftOffset(parseFloat(e.target.value) || 0);
                setSelectedMarginPreset("");
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Bottom Margin (mm)</Label>
            <Input
              type="number"
              min="0"
              value={bottomOffset}
              onChange={(e) => {
                setBottomOffset(parseFloat(e.target.value) || 0);
                setSelectedMarginPreset("");
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Right Margin (mm)</Label>
            <Input
              type="number"
              min="0"
              value={rightOffset}
              onChange={(e) => {
                setRightOffset(parseFloat(e.target.value) || 0);
                setSelectedMarginPreset("");
              }}
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handlePreview}>
          <Eye className="h-4 w-4 mr-2" />
          Preview Labels
        </Button>
        <Button onClick={handlePrint} variant="outline">
          Print
        </Button>
        {sheetType.startsWith('thermal') && (
          <Button 
            onClick={() => setIsDirectPrintDialogOpen(true)} 
            variant="outline"
            className="bg-green-50 hover:bg-green-100 border-green-200 text-green-700 dark:bg-green-950 dark:hover:bg-green-900 dark:border-green-800 dark:text-green-300"
          >
            <Printer className="h-4 w-4 mr-2" />
            Direct Print
          </Button>
        )}
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

      {/* Direct Print Dialog for Thermal Printers */}
      <DirectPrintDialog
        open={isDirectPrintDialogOpen}
        onOpenChange={setIsDirectPrintDialogOpen}
        items={labelItems.map(item => ({
          productName: item.product_name,
          brand: item.brand,
          size: item.size,
          color: item.color,
          mrp: undefined,
          salePrice: item.sale_price,
          barcode: item.barcode,
          billNumber: item.bill_number,
          purchaseCode: item.purchase_code,
          supplierCode: item.supplier_code,
          style: item.style,
          quantity: item.qty,
        }))}
        labelSize={sheetType}
        labelConfig={labelConfig}
        prnTemplates={prnTemplates}
        onSavePRNTemplate={savePRNTemplate}
        onDeletePRNTemplate={deletePRNTemplate}
      />

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
            transform: scale(${printScale / 100});
            transform-origin: top left;
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
