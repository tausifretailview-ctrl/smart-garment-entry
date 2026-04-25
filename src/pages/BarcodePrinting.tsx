import { useState, useEffect, useRef, useCallback, useMemo } from "react";

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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import JsBarcode from "jsbarcode";
import { Check, Save, Trash2, GripVertical, Eye, Download, RefreshCw, Edit, Printer, AlertTriangle, Plus, Home, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { encodePurchasePrice, getEffectivePurchasePrice } from "@/utils/purchaseCodeEncoder";
import { generateA4LabelPdf } from '@/utils/a4LabelPdf';
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
import { useBarcodeLabelSettings, SizeSortOrder } from "@/hooks/useBarcodeLabelSettings";
import { BarTenderLabelDesigner } from "@/components/BarTenderLabelDesigner";
import { DirectPrintDialog } from "@/components/DirectPrintDialog";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { LabelFieldConfig, LabelDesignConfig, LabelItem, LabelTemplate, FieldKey } from "@/types/labelTypes";
import { PrecisionThermalPrint } from "@/components/precision-barcode/PrecisionThermalPrint";
import { PrecisionA4SheetPrint } from "@/components/precision-barcode/PrecisionA4SheetPrint";
import { PrecisionLabelPreview } from "@/components/precision-barcode/PrecisionLabelPreview";
import { LabelCalibrationUI } from "@/components/precision-barcode/LabelCalibrationUI";
import { TestLabelPrint } from "@/components/precision-barcode/TestLabelPrint";
import { PrecisionPrintCSS } from "@/components/precision-barcode/PrecisionPrintCSS";
import { PrecisionLabelDesigner, DEFAULT_PRECISION_CONFIG } from "@/components/precision-barcode/PrecisionLabelDesigner";

// Utility function to sort items by size, barcode, name, price, or keep original order (Sr No)
const sortItemsBySize = (items: LabelItem[], order: SizeSortOrder): LabelItem[] => {
  if (order === 'none') return items;
  
  // Barcode-based sorting
  if (order === 'barcode_asc' || order === 'barcode_desc') {
    return [...items].sort((a, b) => {
      const barcodeA = a.barcode || '';
      const barcodeB = b.barcode || '';
      const cmp = barcodeA.localeCompare(barcodeB, undefined, { numeric: true });
      return order === 'barcode_desc' ? -cmp : cmp;
    });
  }
  
  // Product name sorting (A-Z)
  if (order === 'name_asc') {
    return [...items].sort((a, b) => (a.product_name || '').localeCompare(b.product_name || ''));
  }
  
  // Price sorting
  if (order === 'price_asc' || order === 'price_desc') {
    return [...items].sort((a, b) => {
      const diff = (a.sale_price || 0) - (b.sale_price || 0);
      return order === 'price_desc' ? -diff : diff;
    });
  }
  
  // Size-based sorting
  return [...items].sort((a, b) => {
    const parseSize = (size: string): number => {
      if (!size) return 0;
      const match = size.match(/[\d.]+/);
      return match ? parseFloat(match[0]) : 0;
    };
    
    const sizeA = parseSize(a.size);
    const sizeB = parseSize(b.size);
    return order === 'descending' ? sizeB - sizeA : sizeA - sizeB;
  });
};

// Helper function to ensure all fields are in fieldOrder (for migrating old configs)
const ensureCompleteFieldOrder = (config: Partial<LabelDesignConfig>): LabelDesignConfig => {
  const allFields: FieldKey[] = [
    'businessName', 'brand', 'productName', 'category', 'color', 'style', 'size', 'price', 'mrp', 'qty',
    'customText', 'barcode', 'barcodeText', 'billNumber', 'supplierCode', 'purchaseCode', 'supplierInvoiceNo'
  ];
  
  const existingOrder = config.fieldOrder || [];
  const missingFields = allFields.filter(f => !existingOrder.includes(f));
  
  return {
    brand: config.brand || { show: true, fontSize: 9, bold: true },
    businessName: config.businessName || { show: false, fontSize: 8, bold: true },
    productName: config.productName || { show: true, fontSize: 9, bold: true },
    category: config.category || { show: false, fontSize: 8, bold: false },
    color: config.color || { show: false, fontSize: 8, bold: false },
    style: config.style || { show: false, fontSize: 8, bold: false },
    size: config.size || { show: true, fontSize: 9, bold: false },
    price: config.price || { show: true, fontSize: 9, bold: true },
    mrp: config.mrp || { show: false, fontSize: 9, bold: false },
    qty: config.qty || { show: false, fontSize: 7, bold: false },
    customText: config.customText || { show: false, fontSize: 8, bold: false },
    barcode: config.barcode || { show: true, fontSize: 9, bold: false },
    barcodeText: config.barcodeText || { show: true, fontSize: 7, bold: false },
    billNumber: config.billNumber || { show: true, fontSize: 7, bold: false },
    supplierCode: config.supplierCode || { show: true, fontSize: 7, bold: false },
    purchaseCode: config.purchaseCode || { show: false, fontSize: 7, bold: false },
    supplierInvoiceNo: config.supplierInvoiceNo || { show: false, fontSize: 7, bold: false },
    fieldOrder: [...existingOrder, ...missingFields] as FieldKey[],
    barcodeHeight: config.barcodeHeight,
    barcodeWidth: config.barcodeWidth,
    customTextValue: config.customTextValue || '',
    lines: config.lines || [],
  };
};

// Helper function to render barcode as inline SVG string (vector, no blur)
const renderBarcodeToSVG = (code: string, height: number = 30, width: number = 1.5): string => {
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, code, {
      format: 'CODE128',
      height: height,
      width: width,
      displayValue: false,
      margin: 0,
      background: 'transparent',
      lineColor: '#000000',
    });
    const w = svg.getAttribute('width') || '100';
    const h = svg.getAttribute('height') || String(height);
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.style.display = 'block';
    return new XMLSerializer().serializeToString(svg);
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
  mrp?: number;
  barcode: string;
  stock_qty: number;
  supplier_code?: string;
  pur_price?: number;
  uom?: string;
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
  "novajet48" | "novajet40" | "a4_40sheet" | "novajet65" | "a4_12x4" | "a4_65sheet" | "a4_32sheet" | 
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
  novajet40: { cols: 5, rows: 8, width: "38mm", height: "35mm", gap: "1mm", category: "a4" },
  a4_40sheet: { cols: 5, rows: 8, width: "38mm", height: "35mm", gap: "1mm", category: "a4" },
  a4_39x35_40sheet: { cols: 5, rows: 8, width: "39mm", height: "35mm", gap: "0.6mm", category: "a4" },
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
  novajet40: { label: "Novajet 40", description: "38×35mm, 5×8 (40 labels)", group: "A4 - Medium Labels" },
  a4_40sheet: { label: "A4 40-Sheet", description: "38×35mm, 5×8 (40 labels) ✓ Exact", group: "A4 - Medium Labels" },
  a4_39x35_40sheet: { label: "A4 40-Sheet (39×35mm)", description: "39×35mm, 5×8 (40 labels) — Al Nisa", group: "A4 - Medium Labels" },
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
      businessName: { show: false, fontSize: 8, bold: true, textAlign: 'center', x: 0, y: 0, width: 100 },
      productName: { show: true, fontSize: 9, bold: true, textAlign: 'center', x: 0, y: 4, width: 100 },
      category: { show: false, fontSize: 8, bold: false, textAlign: 'center', x: 0, y: 8, width: 100 },
      color: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 25, y: 8, width: 50 },
      style: { show: true, fontSize: 8, bold: false, textAlign: 'left', x: 0, y: 8, width: 50 },
      size: { show: true, fontSize: 10, bold: true, textAlign: 'right', x: 25, y: 8, width: 50 },
      price: { show: true, fontSize: 11, bold: true, textAlign: 'center', x: 0, y: 12, width: 100 },
      mrp: { show: false, fontSize: 9, bold: false, textAlign: 'center', x: 0, y: 16, width: 50 },
      qty: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 16, width: 50 },
      customText: { show: false, fontSize: 8, bold: false, textAlign: 'center', x: 25, y: 16, width: 50 },
      barcode: { show: true, fontSize: 8, bold: false, textAlign: 'center', x: 0, y: 16, width: 100 },
      barcodeText: { show: true, fontSize: 8, bold: false, textAlign: 'center', x: 0, y: 24, width: 100 },
      billNumber: { show: false, fontSize: 6, bold: false, textAlign: 'center', x: 0, y: 27, width: 100 },
      supplierCode: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 27, width: 50 },
      purchaseCode: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 25, y: 27, width: 50 },
      fieldOrder: ['businessName', 'brand', 'style', 'size', 'price', 'mrp', 'qty', 'customText', 'barcode', 'barcodeText', 'productName', 'category', 'color', 'billNumber', 'supplierCode', 'purchaseCode'],
      barcodeHeight: 25,
      barcodeWidth: 1.5,
    }
  },
  {
    name: "Thermal - Minimal",
    config: {
      brand: { show: true, fontSize: 9, bold: true, textAlign: 'center', x: 0, y: 0, width: 100 },
      businessName: { show: false, fontSize: 8, bold: true, textAlign: 'center', x: 0, y: 0, width: 100 },
      productName: { show: false, fontSize: 8, bold: true, textAlign: 'center', x: 0, y: 4, width: 100 },
      category: { show: false, fontSize: 8, bold: false, textAlign: 'center', x: 0, y: 8, width: 100 },
      color: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 8, width: 100 },
      style: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 8, width: 100 },
      size: { show: true, fontSize: 10, bold: true, textAlign: 'center', x: 0, y: 4, width: 100 },
      price: { show: true, fontSize: 12, bold: true, textAlign: 'center', x: 0, y: 8, width: 100 },
      mrp: { show: false, fontSize: 9, bold: false, textAlign: 'center', x: 0, y: 12, width: 50 },
      qty: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 12, width: 50 },
      customText: { show: false, fontSize: 8, bold: false, textAlign: 'center', x: 25, y: 12, width: 50 },
      barcode: { show: true, fontSize: 8, bold: false, textAlign: 'center', x: 0, y: 12, width: 100 },
      barcodeText: { show: true, fontSize: 8, bold: true, textAlign: 'center', x: 0, y: 20, width: 100 },
      billNumber: { show: false, fontSize: 6, bold: false, textAlign: 'center', x: 0, y: 24, width: 100 },
      supplierCode: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 24, width: 100 },
      purchaseCode: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 27, width: 100 },
      fieldOrder: ['businessName', 'brand', 'size', 'price', 'mrp', 'qty', 'customText', 'barcode', 'barcodeText', 'productName', 'category', 'style', 'color', 'billNumber', 'supplierCode', 'purchaseCode'],
      barcodeHeight: 28,
      barcodeWidth: 1.6,
    }
  },
  {
    name: "Thermal - With Code",
    config: {
      brand: { show: true, fontSize: 9, bold: true, textAlign: 'center', x: 0, y: 0, width: 100 },
      businessName: { show: false, fontSize: 8, bold: true, textAlign: 'center', x: 0, y: 0, width: 100 },
      productName: { show: true, fontSize: 8, bold: true, textAlign: 'center', x: 0, y: 4, width: 100 },
      category: { show: false, fontSize: 8, bold: false, textAlign: 'center', x: 0, y: 8, width: 100 },
      color: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 8, width: 100 },
      style: { show: true, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 8, width: 100 },
      size: { show: true, fontSize: 9, bold: true, textAlign: 'center', x: 0, y: 8, width: 50 },
      price: { show: true, fontSize: 10, bold: true, textAlign: 'center', x: 25, y: 8, width: 50 },
      mrp: { show: false, fontSize: 9, bold: false, textAlign: 'center', x: 0, y: 12, width: 50 },
      qty: { show: false, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 12, width: 50 },
      customText: { show: false, fontSize: 8, bold: false, textAlign: 'center', x: 25, y: 12, width: 50 },
      barcode: { show: true, fontSize: 8, bold: false, textAlign: 'center', x: 0, y: 12, width: 100 },
      barcodeText: { show: true, fontSize: 7, bold: false, textAlign: 'center', x: 0, y: 20, width: 100 },
      billNumber: { show: false, fontSize: 6, bold: false, textAlign: 'center', x: 0, y: 27, width: 100 },
      supplierCode: { show: true, fontSize: 6, bold: false, textAlign: 'center', x: 0, y: 24, width: 50 },
      purchaseCode: { show: true, fontSize: 6, bold: false, textAlign: 'center', x: 25, y: 24, width: 50 },
      fieldOrder: ['businessName', 'brand', 'productName', 'category', 'style', 'size', 'price', 'mrp', 'qty', 'customText', 'barcode', 'barcodeText', 'supplierCode', 'purchaseCode', 'color', 'billNumber'],
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
        case 'businessName':
          return businessName || 'Business Name';
        case 'productName':
          return sampleItem.product_name;
        case 'category':
          return sampleItem.category || '';
        case 'color':
          return sampleItem.color ? `Color: ${sampleItem.color}` : '';
        case 'style':
          return sampleItem.style || '';
        case 'price':
          return `MRP: ${sampleItem.sale_price}`;
        case 'barcodeText':
          return sampleItem.barcode || '';
        case 'billNumber':
          return sampleItem.bill_number ? `Bill: ${sampleItem.bill_number}` : '';
        case 'supplierCode':
          return sampleItem.supplier_code || '';
        case 'purchaseCode':
          return sampleItem.purchase_code || '';
        case 'supplierInvoiceNo':
          return sampleItem.supplier_invoice_no ? `Inv: ${sampleItem.supplier_invoice_no}` : '';
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
      case 'businessName':
        return businessName || 'Business Name';
      case 'productName':
        return 'Sample Product';
      case 'category':
        return 'Category';
      case 'color':
        return 'Color: Blue';
      case 'style':
        return 'Style: Classic';
      case 'price':
        return 'MRP: 999';
      case 'barcodeText':
        return '12345678';
      case 'billNumber':
        return 'Bill: BILL001';
      case 'supplierCode':
        return 'SUP01';
      case 'purchaseCode':
        return 'PC123';
      case 'supplierInvoiceNo':
        return 'Inv: INV-2024-001';
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
        
      }
    });
  }, [labelConfig, barcodeValue]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onConfigChange) return;

    const activeKey = String(active.id).replace('preview-', '') as FieldKey;
    const overKey = String(over.id).replace('preview-', '') as FieldKey;

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
        case 'businessName': return businessName || 'Business Name';
        case 'productName': return sampleItem.product_name;
        case 'category': return sampleItem.category || '';
        case 'color': return sampleItem.color ? `Color: ${sampleItem.color}` : '';
        case 'style': return sampleItem.style || '';
        case 'price': return `Rs.${sampleItem.sale_price}`;
        case 'mrp': return sampleItem.mrp ? `MRP: ${sampleItem.mrp}` : '';
        case 'customText': return labelConfig.customTextValue || '';
        case 'barcodeText': return sampleItem.barcode || '';
        case 'billNumber': return sampleItem.bill_number ? `Bill: ${sampleItem.bill_number}` : '';
        case 'supplierCode': return sampleItem.supplier_code || '';
        case 'purchaseCode': return sampleItem.purchase_code || '';
        case 'supplierInvoiceNo': return sampleItem.supplier_invoice_no ? `Inv: ${sampleItem.supplier_invoice_no}` : '';
        case 'size': return sampleItem.size || '';
        default: return '';
      }
    }
    switch (fieldKey) {
      case 'brand': return businessName || 'Brand';
      case 'businessName': return businessName || 'Business Name';
      case 'productName': return 'Sample Product';
      case 'category': return 'Category';
      case 'color': return 'Color: Blue';
      case 'style': return 'Style: Classic';
      case 'price': return 'Rs.999';
      case 'mrp': return 'MRP: 1299';
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
  fieldLabels: Record<string, string>;
}

function SortableFieldItem({ fieldKey, labelConfig, setLabelConfig, fieldLabels }: SortableFieldItemProps) {
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
                [fieldKey]: { ...(prev[fieldKey] as LabelFieldConfig), bold: !(prev[fieldKey] as LabelFieldConfig).bold }
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
  const { orgNavigate } = useOrgNavigation();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [labelItems, setLabelItems] = useState<LabelItem[]>(() => {
    try {
      const saved = localStorage.getItem('barcode_label_items');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [quantityMode, setQuantityMode] = useState<QuantityMode>("manual");
  const [sizeSortOrder, setSizeSortOrder] = useState<SizeSortOrder>("barcode_asc");
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
  // Only set default offsets for specific presets, don't auto-reset printScale
  useEffect(() => {
    const sheetPresets: Record<string, { defaultTop?: number; defaultLeft?: number }> = {
      novajet40: { defaultTop: 2, defaultLeft: 1 },
      a4_40sheet: { defaultTop: 2, defaultLeft: 1 },
    };
    
    const preset = sheetPresets[sheetType];
    if (preset) {
      if (preset.defaultTop !== undefined) setTopOffset(preset.defaultTop);
      if (preset.defaultLeft !== undefined) setLeftOffset(preset.defaultLeft);
    }
    // Don't auto-reset printScale - let user control it
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
  
  // Custom field labels from organization settings
  const [customFieldLabels, setCustomFieldLabels] = useState<Partial<Record<FieldKey, string>>>({});

  // Label design customization state
  const [labelConfig, setLabelConfig] = useState<LabelDesignConfig>({
    brand: { show: true, fontSize: 8, bold: true, x: 0, y: 0, width: 100 },
    businessName: { show: false, fontSize: 8, bold: true, x: 0, y: 0, width: 100 },
    productName: { show: true, fontSize: 8, bold: true, x: 0, y: 4, width: 100 },
    category: { show: false, fontSize: 8, bold: false, x: 0, y: 8, width: 100 },
    color: { show: false, fontSize: 7, bold: false, x: 25, y: 8, width: 50 },
    style: { show: false, fontSize: 7, bold: false, x: 0, y: 8, width: 50 },
    size: { show: true, fontSize: 8, bold: false, x: 0, y: 8, width: 50 },
    price: { show: true, fontSize: 8, bold: true, x: 25, y: 8, width: 50 },
    mrp: { show: false, fontSize: 8, bold: false, x: 0, y: 12, width: 50 },
    qty: { show: false, fontSize: 7, bold: false, x: 25, y: 12, width: 20 },
    customText: { show: false, fontSize: 8, bold: false, x: 25, y: 12, width: 50 },
    barcode: { show: true, fontSize: 8, bold: false, x: 0, y: 16, width: 100 },
    barcodeText: { show: true, fontSize: 7, bold: false, x: 0, y: 24, width: 100 },
    billNumber: { show: false, fontSize: 6, bold: false, x: 0, y: 31, width: 100 },
    supplierCode: { show: true, fontSize: 7, bold: false, x: 0, y: 28, width: 50 },
    purchaseCode: { show: false, fontSize: 7, bold: false, x: 25, y: 28, width: 50 },
    fieldOrder: ['businessName', 'brand', 'productName', 'category', 'size', 'price', 'mrp', 'qty', 'customText', 'barcode', 'barcodeText', 'supplierCode', 'purchaseCode', 'billNumber', 'color', 'style'],
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
  const [purchaseCodeIncludeGst, setPurchaseCodeIncludeGst] = useState(false);
  const [defaultUom, setDefaultUom] = useState("NOS");
  const [isDirectPrintDialogOpen, setIsDirectPrintDialogOpen] = useState(false);
  const [precisionSettings, setPrecisionSettings] = useState({
    enabled: false,
    xOffset: 0,
    yOffset: 0,
    vGap: 2,
    labelWidth: 50,
    labelHeight: 25,
    a4Cols: 4,
    a4Rows: 12,
    printMode: 'thermal' as 'thermal' | 'thermal2up' | 'a4',
    labelConfig: null as any,
    thermalCols: 1,
  });
  const [dbPresets, setDbPresets] = useState<import("@/components/precision-barcode/LabelCalibrationUI").CalibrationPreset[]>([]);
  const [precisionConfigReady, setPrecisionConfigReady] = useState(false);
  const precisionPrintRef = useRef<HTMLDivElement>(null);
  const testPrintRef = useRef<HTMLDivElement>(null);
  const [testPrintActive, setTestPrintActive] = useState(false);
  const [activeBarTab, setActiveBarTab] = useState<string>("standard");
  const [activePrecisionTemplateName, setActivePrecisionTemplateNameRaw] = useState<string | null>(() => {
    try { return localStorage.getItem('precision_active_preset') || null; } catch { return null; }
  });
  const setActivePrecisionTemplateName = (name: string | null) => {
    setActivePrecisionTemplateNameRaw(name);
    try {
      if (name) localStorage.setItem('precision_active_preset', name);
      else localStorage.removeItem('precision_active_preset');
    } catch {}
  };
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Track whether defaults have been loaded to prevent re-runs
  const hasLoadedDefaultsRef = useRef(false);
  const hasLoadedPrecisionConfigRef = useRef(false);
  const settingsFullyLoadedRef = useRef(false);
  const [settingsLoading, setSettingsLoading] = useState(true);

  const savePrecisionConfigToSettings = useCallback(async (configToSave: LabelDesignConfig, orgId: string) => {
    const { data: existing, error: fetchError } = await supabase
      .from("settings")
      .select("bill_barcode_settings")
      .eq("organization_id", orgId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const currentBbs = (existing?.bill_barcode_settings as any) || {};
    const { error: updateError } = await supabase
      .from("settings")
      .update({
        bill_barcode_settings: {
          ...currentBbs,
          precision_label_config: configToSave,
        } as any,
      })
      .eq("organization_id", orgId);

    if (updateError) throw updateError;
  }, []);

  // Auto-save precision label config changes to active template/preset (debounced)
  const autoSavePrecisionConfig = useCallback(async (targetName: string, labelConfig: LabelDesignConfig, labelWidth: number, labelHeight: number, orgId: string) => {
    const configToSave = { ...labelConfig };
    const cleanName = targetName.startsWith("preset:")
      ? targetName.replace("preset:", "")
      : targetName;

    try {
      if (targetName.startsWith("preset:")) {
        const { error } = await supabase
          .from("printer_presets")
          .update({
            label_config: configToSave as any,
            label_width: labelWidth,
            label_height: labelHeight,
          })
          .eq("organization_id", orgId)
          .eq("name", cleanName);

        if (error) throw error;

        setDbPresets(prev => prev.map(p =>
          p.name === cleanName
            ? { ...p, labelConfig: configToSave, width: labelWidth, height: labelHeight }
            : p
        ));

        return true;
      }

      const updatedTemplate: LabelTemplate = {
        name: cleanName,
        config: configToSave,
        labelWidth,
        labelHeight,
      };

      const success = await saveTemplateToDb(updatedTemplate);

      if (success) {
        setDbPresets(prev => prev.map(p =>
          p.name === cleanName
            ? { ...p, labelConfig: configToSave, width: labelWidth, height: labelHeight }
            : p
        ));
      }

      return success;
    } catch (error) {
      console.error("Failed to auto-save precision design:", error);
      return false;
    }
  }, [saveTemplateToDb]);

  // Sync database settings with local state
  useEffect(() => {
    if (isLoadingSettings) return;
    
    // Sync label templates (always keep in sync)
    setSavedLabelTemplates(dbLabelTemplates);
    
    // Normalize active precision target once templates/presets are loaded
    if (activePrecisionTemplateName) {
      const nameWithoutPrefix = activePrecisionTemplateName.startsWith("preset:") 
        ? activePrecisionTemplateName.replace("preset:", "") : activePrecisionTemplateName;
      const isActuallyLabelTemplate = dbLabelTemplates.some((t: LabelTemplate) => t.name === nameWithoutPrefix);
      const isActuallyPrinterPreset = dbPresets.some((p) => p.name === nameWithoutPrefix);

      if (activePrecisionTemplateName.startsWith("preset:") && isActuallyLabelTemplate) {
        setActivePrecisionTemplateName(nameWithoutPrefix);
      } else if (!activePrecisionTemplateName.startsWith("preset:") && !isActuallyLabelTemplate && isActuallyPrinterPreset) {
        setActivePrecisionTemplateName(`preset:${nameWithoutPrefix}`);
      }
    }
    
    // After templates load, refresh labelConfig from barcode_label_settings source of truth
    // Only on INITIAL load — subsequent DB refetches (e.g. after auto-save) must NOT
    // overwrite the user's in-memory edits (strikethrough, lines, etc.)
    if (activePrecisionTemplateName && (!hasLoadedPrecisionConfigRef.current || !precisionSettings.labelConfig)) {
      const templateName = activePrecisionTemplateName.startsWith("preset:")
        ? activePrecisionTemplateName.replace("preset:", "")
        : activePrecisionTemplateName;
      const freshTemplate = dbLabelTemplates.find((t: LabelTemplate) => t.name === templateName);
      if (freshTemplate?.config) {
        hasLoadedPrecisionConfigRef.current = true;
        const migratedConfig = ensureCompleteFieldOrder(freshTemplate.config);
        setPrecisionSettings(prev => ({
          ...prev,
          labelConfig: migratedConfig,
          ...(freshTemplate.labelWidth ? { labelWidth: freshTemplate.labelWidth } : {}),
          ...(freshTemplate.labelHeight ? { labelHeight: freshTemplate.labelHeight } : {}),
        }));
      }
    }
    
    // Sync margin presets
    setSavedMarginPresets(dbMarginPresets);
    
    // Sync custom presets
    setSavedPresets(dbCustomPresets);
    
    // Load default format ONLY ONCE when settings first arrive
    if (!hasLoadedDefaultsRef.current && dbDefaultFormat) {
      hasLoadedDefaultsRef.current = true;
      const defaultFormat = dbDefaultFormat;
      
      // Check if default references a template
      if (defaultFormat.defaultTemplate) {
        const template = dbLabelTemplates.find((t: LabelTemplate) => t.name === defaultFormat.defaultTemplate);
        
        if (template) {
          // Load template config with field order migration
          const migratedConfig = ensureCompleteFieldOrder(template.config);
          const configWithBarcode = {
            ...migratedConfig,
            barcode: { ...migratedConfig.barcode, show: true },
            barcodeText: { ...migratedConfig.barcodeText, show: true },
          };
          setLabelConfig(configWithBarcode);
          setSelectedLabelTemplate(template.name);
        } else {
          // Template not found - notify user and suggest re-selecting
          console.warn(`Default template "${defaultFormat.defaultTemplate}" not found in saved templates. Available templates:`, dbLabelTemplates.map((t: LabelTemplate) => t.name));
          toast.warning(`Default template "${defaultFormat.defaultTemplate}" not found. Please select a template from "My Templates".`);
          
          if (defaultFormat.labelConfig) {
            // Fall back to inline config with migration
            const migratedConfig = ensureCompleteFieldOrder(defaultFormat.labelConfig);
            const configWithBarcode = {
              ...migratedConfig,
              barcode: { ...migratedConfig.barcode, show: true },
              barcodeText: { ...migratedConfig.barcodeText, show: true },
            };
            setLabelConfig(configWithBarcode);
          }
        }
      } else if (defaultFormat.labelConfig) {
        // No template reference, load inline config with migration
        const migratedConfig = ensureCompleteFieldOrder(defaultFormat.labelConfig);
        const configWithBarcode = {
          ...migratedConfig,
          barcode: { ...migratedConfig.barcode, show: true },
          barcodeText: { ...migratedConfig.barcodeText, show: true },
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
      // Load size sort order preference
      if (defaultFormat.sizeSortOrder) {
        setSizeSortOrder(defaultFormat.sizeSortOrder);
      }
    }
    // Mark precision config as ready after initial load completes
    setPrecisionConfigReady(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingSettings, dbLabelTemplates, dbMarginPresets, dbCustomPresets, activePrecisionTemplateName, dbPresets]);

  // Get organization context
  const { currentOrganization } = useOrganization();

  // Reset defaults ref when organization changes so defaults reload for new org
  useEffect(() => {
    hasLoadedDefaultsRef.current = false;
    hasLoadedPrecisionConfigRef.current = false;
    setPrecisionConfigReady(false);
    settingsFullyLoadedRef.current = false;
    setSettingsLoading(true);
  }, [currentOrganization?.id]);

  // Debounced auto-save for precision designer changes
  useEffect(() => {
    if (!activePrecisionTemplateName || !precisionSettings.labelConfig || !currentOrganization?.id) return;
    
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    
    autoSaveTimerRef.current = setTimeout(() => {
      void autoSavePrecisionConfig(
        activePrecisionTemplateName,
        precisionSettings.labelConfig,
        precisionSettings.labelWidth,
        precisionSettings.labelHeight,
        currentOrganization.id
      );
    }, 800);
    
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [precisionSettings.labelConfig, precisionSettings.labelWidth, precisionSettings.labelHeight, activePrecisionTemplateName, currentOrganization?.id, autoSavePrecisionConfig]);

  // Fetch business name from settings (organization-scoped)
  useEffect(() => {
    const fetchBusinessName = async () => {
      if (!currentOrganization?.id) return;
      
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("business_name, purchase_settings, product_settings, bill_barcode_settings")
          .eq("organization_id", currentOrganization.id)
          .maybeSingle();

        if (error) throw error;
        
        if (data?.business_name) {
          setBusinessName(data.business_name);
        }

        // Apply custom field labels from product settings
        if (data?.product_settings && typeof data.product_settings === 'object') {
          const ps = data.product_settings as any;
          if (ps.fields) {
            const labels: Partial<Record<FieldKey, string>> = {};
            const fieldMapping: Record<string, FieldKey> = {
              brand: 'brand',
              style: 'style',
              color: 'color',
              category: 'category',
            };
            Object.entries(ps.fields).forEach(([key, val]: [string, any]) => {
              const designerKey = fieldMapping[key];
              if (designerKey && val?.label) {
                labels[designerKey] = val.label;
              }
            });
            setCustomFieldLabels(labels);
          }
        }
        
        // Fetch purchase code settings
        if (data?.purchase_settings) {
          const purchaseSettings = data.purchase_settings as any;
          if (purchaseSettings.purchase_code_alphabet) {
            setPurchaseCodeAlphabet(purchaseSettings.purchase_code_alphabet);
          }
          if (purchaseSettings.default_uom) {
            setDefaultUom(purchaseSettings.default_uom);
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
          if (purchaseSettings.purchase_code_include_gst !== undefined) {
            setPurchaseCodeIncludeGst(purchaseSettings.purchase_code_include_gst);
          }
        }
        }

        // Load precision pro settings (use merge to avoid overwriting preset-loaded labelConfig)
        if (data?.bill_barcode_settings && typeof data.bill_barcode_settings === 'object') {
          const bbs = data.bill_barcode_settings as any;
          setPrecisionSettings(prev => ({
            ...prev,
            enabled: bbs.precision_pro_enabled === true,
            xOffset: bbs.precision_x_offset ?? prev.xOffset,
            yOffset: bbs.precision_y_offset ?? prev.yOffset,
            vGap: bbs.precision_v_gap ?? prev.vGap,
            labelWidth: bbs.precision_label_width ?? prev.labelWidth,
            labelHeight: bbs.precision_label_height ?? prev.labelHeight,
            a4Cols: bbs.precision_a4_cols ?? prev.a4Cols,
            a4Rows: bbs.precision_a4_rows ?? prev.a4Rows,
            printMode: bbs.precision_print_mode ?? prev.printMode,
            // Only use settings labelConfig as fallback when NO active preset is selected from localStorage
            // If activePrecisionTemplateName is set, the preset's labelConfig will be loaded by fetchDbPresets
            labelConfig: prev.labelConfig || (!activePrecisionTemplateName ? (bbs.precision_label_config || null) : prev.labelConfig),
          }));
          if (bbs.precision_pro_enabled === true) {
            setActiveBarTab("precision");
          }
        }
      } catch (error) {
        console.error("Failed to fetch business name:", error);
      }
    };

    const fetchDbPresets = async () => {
      if (!currentOrganization?.id) return;
      try {
        const { data } = await supabase
          .from("printer_presets")
          .select("*")
          .eq("organization_id", currentOrganization.id)
          .order("name");
        if (data) {
          const mapped = data.map((p: any) => ({
            id: p.id,
            name: p.name,
            xOffset: Number(p.x_offset),
            yOffset: Number(p.y_offset),
            vGap: Number(p.v_gap),
            width: Number(p.label_width),
            height: Number(p.label_height),
            a4Cols: p.a4_cols,
            a4Rows: p.a4_rows,
            printMode: p.print_mode || 'thermal',
            labelConfig: p.label_config,
            isDefault: p.is_default,
            thermalCols: p.thermal_cols || undefined,
          }));
          setDbPresets(mapped);

          // Auto-load preset: either the one saved in localStorage or the default preset
          const localStoragePresetName = activePrecisionTemplateName?.replace('preset:', '') || null;
          const presetToLoad = localStoragePresetName 
            ? mapped.find((p: any) => p.name === localStoragePresetName)
            : mapped.find((p: any) => p.isDefault);
          
          if (presetToLoad) {
            setPrecisionSettings((prev) => ({
              ...prev,
              xOffset: presetToLoad.xOffset,
              yOffset: presetToLoad.yOffset,
              vGap: presetToLoad.vGap,
              labelWidth: presetToLoad.width,
              labelHeight: presetToLoad.height,
              ...(presetToLoad.a4Cols ? { a4Cols: presetToLoad.a4Cols } : {}),
              ...(presetToLoad.a4Rows ? { a4Rows: presetToLoad.a4Rows } : {}),
              printMode: presetToLoad.printMode || (presetToLoad.a4Cols && presetToLoad.a4Rows ? 'a4' : (presetToLoad.thermalCols && presetToLoad.thermalCols > 1) ? 'thermal2up' : 'thermal'),
              ...(presetToLoad.labelConfig ? { labelConfig: presetToLoad.labelConfig } : {}),
              thermalCols: presetToLoad.thermalCols || 1,
              enabled: true,
            }));
            setActiveBarTab("precision");
            // Set name without "preset:" prefix — Fix 1 in settings sync will correct if needed
            if (!localStoragePresetName) {
              setActivePrecisionTemplateName(presetToLoad.name);
              toast.success(`Auto-loaded preset "${presetToLoad.name}" (${presetToLoad.width}×${presetToLoad.height}mm, ${presetToLoad.printMode === 'thermal2up' ? '2-Up' : presetToLoad.printMode === 'a4' ? 'A4' : '1-Up'})`);
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch printer presets:", error);
      }
    };

    settingsFullyLoadedRef.current = false;
    setSettingsLoading(true);
    const loadAll = async () => {
      await fetchBusinessName();
      await fetchDbPresets();
      settingsFullyLoadedRef.current = true;
      setSettingsLoading(false);
    };
    loadAll();
  }, [currentOrganization?.id]);

  // Set a preset as default for auto-loading from purchase
  const handleSetDefaultPreset = async (presetId: string, presetName: string) => {
    if (!currentOrganization?.id) return;
    await supabase
      .from("printer_presets")
      .update({ is_default: false })
      .eq("organization_id", currentOrganization.id);
    const { error } = await supabase
      .from("printer_presets")
      .update({ is_default: true })
      .eq("id", presetId);
    if (error) { toast.error("Failed to set default"); return; }
    toast.success(`"${presetName}" set as default preset`);
    setDbPresets(prev => prev.map(p => ({ ...p, isDefault: p.id === presetId })));
    try { localStorage.removeItem('precision_active_preset'); } catch {}
  };

  // Set a label template as default by saving it as a printer_preset with is_default
  const handleSetTemplateDefault = async (templateName: string) => {
    if (!currentOrganization?.id) return;
    const template = savedLabelTemplates.find(t => t.name === templateName);
    if (!template) { toast.error("Template not found"); return; }
    await supabase
      .from("printer_presets")
      .update({ is_default: false })
      .eq("organization_id", currentOrganization.id);
    const { error } = await supabase
      .from("printer_presets")
      .upsert({
        organization_id: currentOrganization.id,
        name: templateName,
        label_width: template.labelWidth || precisionSettings.labelWidth,
        label_height: template.labelHeight || precisionSettings.labelHeight,
        x_offset: precisionSettings.xOffset,
        y_offset: precisionSettings.yOffset,
        v_gap: precisionSettings.vGap,
        a4_cols: precisionSettings.a4Cols,
        a4_rows: precisionSettings.a4Rows,
        print_mode: precisionSettings.printMode,
        label_config: template.config as any,
        is_default: true,
      }, { onConflict: "organization_id,name" });
    if (error) { toast.error("Failed to set default"); return; }
    toast.success(`"${templateName}" set as default`);
    const { data } = await supabase
      .from("printer_presets")
      .select("*")
      .eq("organization_id", currentOrganization.id)
      .order("name");
    if (data) {
      setDbPresets(data.map((p: any) => ({
        id: p.id, name: p.name,
        xOffset: Number(p.x_offset), yOffset: Number(p.y_offset),
        vGap: Number(p.v_gap), width: Number(p.label_width), height: Number(p.label_height),
        a4Cols: p.a4_cols, a4Rows: p.a4_rows, printMode: p.print_mode || 'thermal',
        labelConfig: p.label_config, isDefault: p.is_default,
      })));
    }
  };

  // Recalculate purchase codes when alphabet changes (handles timing issues)
  useEffect(() => {
    if (purchaseCodeAlphabet && labelItems.length > 0) {
      setLabelItems(prev => prev.map(item => ({
        ...item,
        purchase_code: item.pur_price && item.pur_price > 0 
          ? encodePurchasePrice(getEffectivePurchasePrice(item.pur_price, item.gst_per || 0, purchaseCodeIncludeGst), purchaseCodeAlphabet, item.bill_date) 
          : item.purchase_code
      })));
    }
  }, [purchaseCodeAlphabet, purchaseCodeIncludeGst]);

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
    if (isLoadingSettings) return; // Wait for label design settings to load first
    if (location.state?.purchaseItems) {
      const purchaseItems = location.state.purchaseItems;
      let hasPurchasePrices = false;
      let hasStyle = false;
      let hasSupplierCode = false;
      
      const items: LabelItem[] = purchaseItems.map((item: any) => {
        const purPrice = item.pur_price || 0;
        const gstPer = item.gst_per || 0;
        // Always calculate purchase code if pur_price exists
        const billDateStr = item.bill_date || undefined;
        const effectivePrice = getEffectivePurchasePrice(purPrice, gstPer, purchaseCodeIncludeGst);
        const purchaseCode = purPrice > 0 
          ? encodePurchasePrice(effectivePrice, purchaseCodeAlphabet, billDateStr) 
          : undefined;
        
        if (purPrice > 0) {
          hasPurchasePrices = true;
        }
        if (item.style && String(item.style).trim()) {
          hasStyle = true;
        }
        if (item.supplier_code && String(item.supplier_code).trim()) {
          hasSupplierCode = true;
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
          mrp: item.mrp || 0,
          pur_price: purPrice,
          gst_per: gstPer,
          purchase_code: purchaseCode,
          bill_date: item.bill_date || undefined,
          barcode: item.barcode,
          qty: item.qty,
          uom: item.uom || 'NOS',
          bill_number: item.bill_number || "",
          supplier_code: item.supplier_code || "",
          supplier_invoice_no: item.supplier_invoice_no || "",
        };
      });
      
      // Apply size sorting based on user preference (note: sizeSortOrder from DB may not be loaded yet)
      setLabelItems(items);
      
      // Auto-enable purchase code visibility when items have purchase prices
      if (hasPurchasePrices) {
        setShowPurchaseCode(true);
        setLabelConfig(prev => ({
          ...prev,
          purchaseCode: { ...prev.purchaseCode, show: true }
        }));
      }
      
      // Auto-enable style visibility when items have style data
      if (hasStyle) {
        setLabelConfig(prev => ({
          ...prev,
          style: { ...prev.style, show: true }
        }));
      }
      
      // Auto-enable supplier code visibility when items have supplier code data
      if (hasSupplierCode) {
        setLabelConfig(prev => ({
          ...prev,
          supplierCode: { ...prev.supplierCode, show: true }
        }));
      }
      
      toast.success(`Loaded ${items.length} items from purchase bill`);
    }
  }, [location.state, purchaseCodeAlphabet, isLoadingSettings]);

  // Re-sort items when size sort order changes
  useEffect(() => {
    if (labelItems.length > 0 && sizeSortOrder !== 'none') {
      setLabelItems(prev => sortItemsBySize(prev, sizeSortOrder));
    }
  }, [sizeSortOrder]);

  // Persist label items to localStorage for reload survival
  useEffect(() => {
    if (labelItems.length > 0) {
      try { localStorage.setItem('barcode_label_items', JSON.stringify(labelItems)); } catch {}
    } else {
      localStorage.removeItem('barcode_label_items');
    }
  }, [labelItems]);

  const genEAN8 = () => {
    const seven = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10));
    const sum = seven[0] * 3 + seven[1] + seven[2] * 3 + seven[3] + seven[4] * 3 + seven[5] + seven[6] * 3;
    const chk = (10 - (sum % 10)) % 10;
    return seven.join("") + String(chk);
  };

  // Search for products as user types
  useEffect(() => {
    const searchProducts = async () => {
      if (!searchQuery.trim() || !currentOrganization?.id) {
        setSearchResults([]);
        return;
      }

      try {
        // First search products table for name/brand/style matches
        const { data: matchingProducts } = await supabase
          .from("products")
          .select("id")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .or(`product_name.ilike.%${searchQuery}%,brand.ilike.%${searchQuery}%,color.ilike.%${searchQuery}%,style.ilike.%${searchQuery}%`);

        const productIds = matchingProducts?.map((p) => p.id) || [];

        // Build variants query with organization filter
        let variantsQuery = supabase
          .from("product_variants")
          .select(
            `
            id,
            size,
            sale_price,
            mrp,
            barcode,
            stock_qty,
            color,
            pur_price,
            product_id,
            products (
              product_name,
              brand,
              color,
              style,
              category,
              uom
            )
          `
          )
          .eq("organization_id", currentOrganization.id)
          .eq("active", true)
          .is("deleted_at", null);

        const isBarcode = /^[A-Z]{2,4}[0-9]{5,}$|^[0-9]{6,}$/.test(searchQuery.trim());

        if (isBarcode) {
          // Exact + prefix match — uses B-tree index
          if (productIds.length > 0) {
            variantsQuery = variantsQuery.or(`barcode.eq.${searchQuery.trim()},barcode.ilike.${searchQuery.trim()}%,product_id.in.(${productIds.join(",")})`);
          } else {
            variantsQuery = variantsQuery.or(`barcode.eq.${searchQuery.trim()},barcode.ilike.${searchQuery.trim()}%`);
          }
        } else {
          // Fuzzy search — uses trgm index
          if (productIds.length > 0) {
            variantsQuery = variantsQuery.or(
              `barcode.ilike.%${searchQuery}%,color.ilike.%${searchQuery}%,size.ilike.%${searchQuery}%,product_id.in.(${productIds.join(",")})`
            );
          } else {
            variantsQuery = variantsQuery.or(`barcode.ilike.%${searchQuery}%,color.ilike.%${searchQuery}%,size.ilike.%${searchQuery}%`);
          }
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
          color: v.color || v.products?.color || "",
          style: v.products?.style || "",
          size: v.size,
          sale_price: v.sale_price || 0,
          mrp: v.mrp || 0,
          barcode: v.barcode || "",
          stock_qty: v.stock_qty || 0,
          supplier_code: supplierCodeMap.get(v.id) || "",
          pur_price: v.pur_price || 0,
          uom: v.products?.uom || "NOS",
        }));

        setSearchResults(results);
      } catch (error: any) {
        console.error(error);
      }
    };

    const debounce = setTimeout(searchProducts, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, currentOrganization?.id]);

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

    // Use pur_price from search result (already fetched)
    const purPrice = result.pur_price || 0;

    const newItem: LabelItem = {
      sku_id: result.id,
      product_name: result.product_name,
      brand: result.brand,
      category: result.category,
      color: result.color,
      style: result.style,
      size: result.size,
      sale_price: result.sale_price,
      mrp: result.mrp || result.sale_price,
      pur_price: purPrice,
      purchase_code: purPrice > 0 ? encodePurchasePrice(getEffectivePurchasePrice(purPrice, 0, purchaseCodeIncludeGst), purchaseCodeAlphabet) : '', // no bill_date for manual add
      barcode: result.barcode,
      bill_number: '',
      qty: 1,
      uom: result.uom || 'NOS',
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
          mrp,
          size,
          gst_per
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
          mrp,
          product_id,
          products (
            product_name,
            brand,
            color,
            style,
            uom
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
          sale_price: variant.sale_price,
          mrp: variant.mrp,
          uom: variant.products?.uom || "NOS",
        });
      });

      // Build label items from purchase items
      const loadedItems: LabelItem[] = itemsData
        .filter(item => item.sku_id && variantMap.has(item.sku_id))
        .map(item => {
          const variantInfo = variantMap.get(item.sku_id);
          const purPrice = item.pur_price || 0;
          const gstPer = (item as any).gst_per || 0;
          const effectivePrice = getEffectivePurchasePrice(purPrice, gstPer, purchaseCodeIncludeGst);
          return {
            sku_id: item.sku_id,
            product_name: variantInfo.product_name,
            brand: variantInfo.brand,
            category: variantInfo.category,
            color: variantInfo.color,
            style: variantInfo.style,
            size: item.size || variantInfo.size,
            sale_price: item.sale_price || variantInfo.sale_price,
            mrp: item.mrp || variantInfo.mrp || 0,
            pur_price: purPrice,
            gst_per: gstPer,
            purchase_code: purPrice > 0 ? encodePurchasePrice(effectivePrice, purchaseCodeAlphabet, billData.bill_date) : '',
            bill_date: billData.bill_date || undefined,
            barcode: item.barcode || variantInfo.barcode,
            bill_number: billData.software_bill_no || '',
            supplier_invoice_no: billData.supplier_invoice_no || '',
            qty: item.qty,
            uom: variantInfo.uom || 'NOS',
            supplier_code: supplierCode
          };
        });

      if (loadedItems.length === 0) {
        toast.error("Could not load product details for items in this bill");
        return;
      }

      // Apply size sorting based on user preference
      const sortedItems = sortItemsBySize(loadedItems, sizeSortOrder);
      setLabelItems(sortedItems);
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
    localStorage.removeItem('barcode_label_items');
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
      a4_40sheet: 8,
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
          businessName: preset.labelConfig.businessName || { show: false, fontSize: 8, bold: true },
          productName: preset.labelConfig.productName || { show: true, fontSize: 9, bold: true },
          category: preset.labelConfig.category || { show: false, fontSize: 8, bold: false },
          color: preset.labelConfig.color || { show: false, fontSize: 8, bold: false },
          style: preset.labelConfig.style || { show: false, fontSize: 8, bold: false },
          size: preset.labelConfig.size || { show: true, fontSize: 9, bold: false },
          price: preset.labelConfig.price || { show: true, fontSize: 9, bold: true },
          mrp: preset.labelConfig.mrp || { show: false, fontSize: 9, bold: false },
          qty: preset.labelConfig.qty || { show: false, fontSize: 7, bold: false },
          customText: preset.labelConfig.customText || { show: false, fontSize: 8, bold: false },
          barcode: preset.labelConfig.barcode || { show: true, fontSize: 9, bold: false },
          barcodeText: preset.labelConfig.barcodeText || { show: true, fontSize: 7, bold: false },
          billNumber: preset.labelConfig.billNumber || { show: true, fontSize: 7, bold: false },
          supplierCode: preset.labelConfig.supplierCode || { show: true, fontSize: 7, bold: false },
          purchaseCode: preset.labelConfig.purchaseCode || { show: false, fontSize: 7, bold: false },
          fieldOrder: preset.labelConfig.fieldOrder || ['businessName', 'brand', 'productName', 'category', 'color', 'style', 'size', 'price', 'mrp', 'qty', 'customText', 'barcode', 'billNumber', 'barcodeText', 'supplierCode', 'purchaseCode'],
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
      config: { ...labelConfig },
      labelWidth: precisionSettings.labelWidth,
      labelHeight: precisionSettings.labelHeight,
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
      // Ensure the loaded config has all required properties with field order migration
      const mergedConfig = ensureCompleteFieldOrder(template.config);
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
      // Ensure the loaded config has all required properties with field order migration
      const mergedConfig = ensureCompleteFieldOrder(template.config);
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
      sizeSortOrder,
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
        case 'businessName':
          return businessName || '';
        case 'productName':
          return item.product_name;
        case 'category':
          return item.category || '';
        case 'color': 
          return item.color || '';
        case 'style': 
          return item.style || '';
        case 'price': 
          return `Rs.${item.sale_price}`;
        case 'mrp':
          return item.mrp ? `MRP: ${item.mrp}` : '';
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
        case 'supplierInvoiceNo':
          return item.supplier_invoice_no || '';
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
          const barcodeSvg = renderBarcodeToSVG(barcode, barcodeHeight, barcodeWidth);
          
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
              ${barcodeSvg ? `<div style="height: ${barcodeHeightMm}mm; max-width: 100%; display: flex; align-items: center;">${barcodeSvg}</div>` : `<span style="font-size: 8px;">${barcode}</span>`}
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
        const barcodeSvg = renderBarcodeToSVG(barcode, barcodeHeight, barcodeWidth);
        
        if (barcodeSvg) {
          html += `<div style="display: flex; justify-content: center; margin: ${bcPaddingTop}px auto ${bcPaddingBottom}px auto; padding-left: ${bcPaddingLeft}px; padding-right: ${bcPaddingRight}px; height: ${barcodeHeight * 0.35}mm;">${barcodeSvg}</div>`;
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
        const oldIndex = prev.fieldOrder.indexOf(active.id as FieldKey);
        const newIndex = prev.fieldOrder.indexOf(over.id as FieldKey);

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

  // Detect if we're printing thermal/1-up labels (not A4 sheets)
  const isThermal1Up = (): boolean => {
    if (sheetType === "custom") {
      return customCols === 1 && customRows === 1;
    }
    const preset = sheetPresets[sheetType] as any;
    return preset?.thermal === true || sheetType.includes("thermal");
  };

  const isThermal2Up = (): boolean => {
    return precisionSettings.printMode === 'thermal2up';
  };

  const getThermal2UpGap = (): number => {
    if (!isThermal2Up()) return 0;

    if (sheetType === "custom") {
      return Math.max(0, customGap || 0);
    }

    const preset = sheetPresets[sheetType];
    return preset?.cols === 2 ? parseFloat(preset.gap) || 0 : 0;
  };

  // Auto-fit scale: shrink content to fit within A4 default-margin printable area
  // For thermal/1-up labels, no scaling is needed — return 1.0
  const getAutoFitScale = () => {
    if (isThermal1Up()) return 1;

    const dims = sheetType === "custom"
      ? { cols: customCols, rows: customRows, width: customWidth, height: customHeight, gap: customGap }
      : {
          cols: sheetPresets[sheetType].cols,
          rows: (sheetPresets[sheetType] as any).rows || 10,
          width: parseInt(sheetPresets[sheetType].width),
          height: parseInt(sheetPresets[sheetType].height),
          gap: parseInt(sheetPresets[sheetType].gap)
        };

    // Exclude user offsets - they are handled by CSS padding, not content size
    const contentWidth = (dims.cols * dims.width) + ((dims.cols - 1) * dims.gap);
    const contentHeight = (dims.rows * dims.height) + ((dims.rows - 1) * dims.gap);

    const printableWidth = 184;  // A4 210mm - ~26mm default margins
    const printableHeight = 270; // A4 297mm - ~27mm default margins

    const scaleX = contentWidth > printableWidth ? printableWidth / contentWidth : 1;
    const scaleY = contentHeight > printableHeight ? printableHeight / contentHeight : 1;

    return Math.min(scaleX, scaleY);
  };

  const getSheetPageMargins = () => {
    const w = sheetType === 'custom' ? customWidth : parseInt(sheetPresets[sheetType].width);
    const h = sheetType === 'custom' ? customHeight : parseInt(sheetPresets[sheetType].height);
    const cols = sheetType === 'custom' ? customCols : sheetPresets[sheetType].cols;
    const rows = sheetType === 'custom' ? (customRows || 8) : ((sheetPresets[sheetType] as any).rows || 8);
    const gap = sheetType === 'custom' ? customGap : parseInt(sheetPresets[sheetType].gap);

    const totalLabelW = cols * w + (cols - 1) * gap;
    const totalLabelH = rows * h + (rows - 1) * gap;

    const marginTop    = Math.max(0, ((297 - totalLabelH) / 2) + topOffset);
    const marginBottom = Math.max(0, ((297 - totalLabelH) / 2) - topOffset);
    const marginLeft   = Math.max(0, ((210 - totalLabelW) / 2) + leftOffset);
    const marginRight  = Math.max(0, ((210 - totalLabelW) / 2) - leftOffset);

    return { marginTop, marginBottom, marginLeft, marginRight };
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
      if (isThermal1Up()) {
        // Thermal 1UP: each label is its own page, no A4 pagination
        numPages = totalLabels;
      } else {
        const availableHeight = 297 - topOffset - bottomOffset;
        const explicitRows = sheetType === 'custom' ? customRows : ((sheetPresets[sheetType] as any)?.rows || null);
        const rowsPerPage = explicitRows ? explicitRows : Math.floor(availableHeight / (dimensions.height + dimensions.gap));
        const labelsPerPage = dimensions.cols * Math.max(1, rowsPerPage);
        numPages = totalLabels > 0 ? Math.ceil(totalLabels / labelsPerPage) : 0;
      }
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
      const isThermalPreview = isThermal1Up();
      const availableHeight = 297 - topOffset - bottomOffset;
      const explicitRowsP = sheetType === 'custom' ? customRows : ((sheetPresets[sheetType] as any)?.rows || null);
      const rowsPerPage = isThermalPreview ? 1 : (explicitRowsP ? explicitRowsP : Math.floor(availableHeight / (dimensions.height + dimensions.gap)));
      const labelsPerPage = isThermalPreview ? 1 : dimensions.cols * Math.max(1, rowsPerPage);

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
        
        if (isThermalPreview) {
          // Thermal 1UP: single label per page block
          gridDiv.style.cssText = `
            display: block;
            width: ${dimensions.width}mm;
            height: ${dimensions.height}mm;
            padding-top: ${topOffset}mm;
            padding-left: ${leftOffset}mm;
            padding-bottom: ${bottomOffset}mm;
            padding-right: ${rightOffset}mm;
            box-sizing: border-box;
            margin-bottom: ${page < numPages - 1 ? '10px' : '0'};
            border: 1px dashed hsl(var(--border));
          `;
        } else {
          gridDiv.style.cssText = `
            display: grid;
            grid-template-columns: repeat(${dimensions.cols}, ${dimensions.width}mm);
            grid-template-rows: repeat(${rowsPerPage}, ${dimensions.height}mm);
            gap: ${dimensions.gap}mm;
            margin-top: ${topOffset * 3.78}px;
            margin-left: ${leftOffset * 3.78}px;
            margin-bottom: ${page < numPages - 1 ? '20px' : '0'};
          `;
        }

        // Add labels for this page
        const startIdx = page * labelsPerPage;
        const endIdx = Math.min(startIdx + labelsPerPage, allLabels.length);
        
        // Check if using absolute positioning for cell styling
        const useAbsoluteLayout = hasAbsolutePositioning(labelConfig);
        
        for (let i = startIdx; i < endIdx; i++) {
          const cell = document.createElement("div");
          cell.className = "label-cell";
          
          if (useAbsoluteLayout) {
            cell.style.cssText = `
              width: ${dimensions.width}mm;
              height: ${dimensions.height}mm;
              min-height: ${dimensions.height}mm;
              max-height: ${dimensions.height}mm;
              font-family: Arial, sans-serif;
              position: relative;
              overflow: visible;
              box-sizing: border-box;
            `;
          } else {
            cell.style.cssText = `
              width: ${dimensions.width}mm;
              height: ${dimensions.height}mm;
              min-height: ${dimensions.height}mm;
              max-height: ${dimensions.height}mm;
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
      // For thermal/1-up: each label is its own page; for A4: calculate rows per page
      const labelsPerPage = isThermal1Up()
        ? 1
        : isThermal2Up()
        ? 2
        : (() => {
            const availableHeight = 297 - topOffset - bottomOffset;
            const explicitRows = sheetType === 'custom' ? customRows : ((sheetPresets[sheetType] as any)?.rows || null);
            const rowsPerPage = explicitRows ? explicitRows : Math.floor(availableHeight / (dimensions.height + dimensions.gap));
            return dimensions.cols * Math.max(1, rowsPerPage);
          })();
      const numPrintPages = allLabels.length > 0 ? Math.ceil(allLabels.length / labelsPerPage) : 0;
      
      // Check if using absolute positioning for cell styling
      const useAbsoluteLayout = hasAbsolutePositioning(labelConfig);

      for (let page = 0; page < numPrintPages; page++) {
        // Calculate indices first so we can use them for grid-template-rows
        const startIdx = page * labelsPerPage;
        const endIdx = Math.min(startIdx + labelsPerPage, allLabels.length);
        const rowsOnPage = Math.ceil((endIdx - startIdx) / dimensions.cols);

        const gridDiv = document.createElement("div");
        gridDiv.className = "label-grid";
        gridDiv.style.cssText = isThermal1Up()
          ? `
              display: block;
              width: ${dimensions.width}mm;
              height: ${dimensions.height}mm;
              min-height: ${dimensions.height}mm;
              max-height: ${dimensions.height}mm;
              margin: 0;
              padding-top: ${topOffset}mm;
              padding-left: ${leftOffset}mm;
              padding-bottom: ${bottomOffset}mm;
              padding-right: ${rightOffset}mm;
              box-sizing: border-box;
              page-break-inside: avoid;
              break-inside: avoid-page;
              page-break-after: always;
              break-after: page;
            `
          : isThermal2Up()
          ? `
              display: flex;
              flex-wrap: nowrap;
              width: ${dimensions.width * 2}mm;
              height: ${dimensions.height}mm;
              min-height: ${dimensions.height}mm;
              max-height: ${dimensions.height}mm;
              margin: 0;
              padding: 0;
              box-sizing: border-box;
              overflow: hidden;
              page-break-inside: avoid;
              break-inside: avoid-page;
              page-break-after: always;
              break-after: page;
            `
          : `
               display: grid;
               grid-template-columns: repeat(${dimensions.cols}, ${dimensions.width}mm);
               grid-template-rows: repeat(${rowsOnPage}, ${dimensions.height}mm);
               gap: ${dimensions.gap}mm;
               align-content: start;
               width: ${dimensions.cols * dimensions.width + (dimensions.cols - 1) * dimensions.gap}mm;
               height: ${rowsOnPage * dimensions.height + (rowsOnPage - 1) * dimensions.gap}mm;
               page-break-after: always;
               break-after: page;
             `;

        if (isThermal1Up() && page > 0) {
          gridDiv.style.pageBreakBefore = 'always';
          gridDiv.style.breakBefore = 'page';
        }
        
        // Don't add page break after last page
        if (page === numPrintPages - 1) {
          gridDiv.style.pageBreakAfter = 'auto';
          gridDiv.style.breakAfter = 'auto';
        }
        
        for (let i = startIdx; i < endIdx; i++) {
          const cell = document.createElement("div");
          cell.className = "label-cell";
          
          if (useAbsoluteLayout) {
            // Absolute positioning layout - matches BarTenderLabelDesigner
            cell.style.cssText = `
              width: ${dimensions.width}mm;
              height: ${dimensions.height}mm;
              min-height: ${dimensions.height}mm;
              max-height: ${dimensions.height}mm;
              font-family: Arial, sans-serif;
              position: relative;
              overflow: visible;
              box-sizing: border-box;
            `;
          } else {
            // Legacy flow-based layout
            cell.style.cssText = `
              width: ${dimensions.width}mm;
              height: ${dimensions.height}mm;
              min-height: ${dimensions.height}mm;
              max-height: ${dimensions.height}mm;
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

  const handlePrint = async () => {
    if (precisionSettings.enabled) {
      // Wait for settings to be fully loaded before printing
      if (!settingsFullyLoadedRef.current) {
        toast.info("Loading print settings...");
        const maxWait = 3000;
        const interval = 100;
        let waited = 0;
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            waited += interval;
            if (settingsFullyLoadedRef.current || waited >= maxWait) {
              clearInterval(check);
              resolve();
            }
          }, interval);
        });
      }

      // Precision Pro mode: open a clean window with only label HTML
      setTimeout(() => {
        const printArea = precisionPrintRef.current;
        if (!printArea) return;

        const labelHTML = printArea.innerHTML;
        const cols = precisionSettings.printMode === 'thermal2up' ? Math.max(2, precisionSettings.thermalCols || 2) : (precisionSettings.thermalCols || 1);
        const horizontalGap = cols > 1 ? getThermal2UpGap() : 0;
        const w = precisionSettings.labelWidth * cols + horizontalGap * Math.max(0, cols - 1);
        const h = precisionSettings.labelHeight + (precisionSettings.vGap || 0);
        const isA4 = precisionSettings.printMode === 'a4';
        const is2Up = precisionSettings.printMode === 'thermal2up';
        const pageSize = isA4 ? '210mm 297mm' : `${w}mm ${h}mm`;
        const pageWidth = isA4 ? '210mm' : `${w}mm`;

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          toast.error("Popup blocked — please allow popups for this site.");
          return;
        }

        printWindow.document.write(`<!DOCTYPE html><html><head><style>
          @page { size: ${pageSize}; margin: 0 !important; padding: 0 !important; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { margin: 0; padding: 0; width: ${pageWidth}; height: auto;
            -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .precision-print-area { margin: 0; padding: 0; width: ${pageWidth}; }
          .precision-print-area > div {
            margin: 0 !important; padding: 0 !important;
            width: ${pageWidth} !important;
            height: ${isA4 ? '297mm' : `${h}mm`} !important;
            min-height: ${isA4 ? '297mm' : `${h}mm`} !important;
            max-height: ${isA4 ? '297mm' : `${h}mm`} !important;
            overflow: hidden !important; box-sizing: border-box !important;
            position: relative !important; display: flex !important; flex-wrap: nowrap !important;
            page-break-after: always !important; page-break-inside: avoid !important;
            break-after: page !important; break-inside: avoid !important;
          }
          .precision-print-area > div:last-child {
            page-break-after: auto !important; break-after: auto !important;
          }
          .precision-label-container { position: relative !important; }
          .precision-barcode-svg { image-rendering: pixelated; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        </style></head><body><div class="precision-print-area">${labelHTML}</div></body></html>`);

        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 400);
      }, 300);
      return;
    }

    // Classic mode: Generate labels in the print area (for on-screen preview)
    generatePreview("printArea");

    // For thermal sheets: keep existing window.print() approach
    if (isThermal1Up() || isThermal2Up()) {
      const originalTitle = document.title;
      document.title = ' ';
      setTimeout(() => {
        window.print();
        document.title = originalTitle;
      }, 200);
      return;
    }

    // For A4 sheets: route through the same absolute-positioned PDF generator
    // as "Perfect PDF" to eliminate cumulative drift across the sheet.
    const hasLabels = labelItems.some((item) => item.qty > 0);
    if (!hasLabels) {
      toast.error('Please add at least one label with quantity > 0');
      return;
    }
    toast.info('Preparing label sheet…');
    try {
      const dimensions = sheetType === 'custom'
        ? { cols: customCols, rows: customRows, width: customWidth, height: customHeight, gap: customGap }
        : {
            cols: sheetPresets[sheetType].cols,
            rows: (sheetPresets[sheetType] as any).rows || 10,
            width: parseInt(sheetPresets[sheetType].width),
            height: parseInt(sheetPresets[sheetType].height),
            gap: parseInt(sheetPresets[sheetType].gap),
          };

      const pdfBytes = await generateA4LabelPdf(labelItems, {
        labelWidthMm: dimensions.width,
        labelHeightMm: dimensions.height,
        cols: dimensions.cols,
        rows: dimensions.rows,
        gapMm: dimensions.gap,
        topOffsetMm: topOffset,
        leftOffsetMm: leftOffset,
        labelConfig,
        businessName,
      });

      const blob = new Blob([new Uint8Array(pdfBytes) as any], { type: 'application/pdf' });
      const pdfUrl = URL.createObjectURL(blob);
      const printWindow = window.open(pdfUrl, '_blank');

      if (!printWindow) {
        // Pop-up blocker — fall back to download
        const a = document.createElement('a');
        a.href = pdfUrl;
        a.download = `labels-${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.error('Pop-up blocked — PDF downloaded. Open it and print at Actual Size (100%).');
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
        return;
      }

      printWindow.addEventListener('load', () => {
        setTimeout(() => {
          try { printWindow.print(); } catch { /* ignore */ }
          setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
        }, 500);
      });
      toast.success('Print at Actual Size (100%) for accurate labels');
    } catch (err) {
      console.error('Label PDF generation error:', err);
      toast.error('Failed to generate label sheet');
    }
  };

  const handleTestPrint = async () => {
    // Auto-save calibration to printer_presets
    if (currentOrganization?.id) {
      const presetName = `Auto-Cal ${precisionSettings.labelWidth}x${precisionSettings.labelHeight}mm`;
      const { error } = await supabase
        .from("printer_presets")
        .upsert({
          organization_id: currentOrganization.id,
          name: presetName,
          label_width: precisionSettings.labelWidth,
          label_height: precisionSettings.labelHeight,
          x_offset: precisionSettings.xOffset,
          y_offset: precisionSettings.yOffset,
          v_gap: precisionSettings.vGap,
          a4_cols: precisionSettings.a4Cols,
          a4_rows: precisionSettings.a4Rows,
          thermal_cols: precisionSettings.thermalCols || 1,
        }, { onConflict: "organization_id,name" });
      if (error) {
        toast.error("Failed to save calibration");
      } else {
        toast.success(`Calibration saved as "${presetName}"`);
        // Refresh presets
        const { data } = await supabase
          .from("printer_presets")
          .select("*")
          .eq("organization_id", currentOrganization.id)
          .order("name");
        if (data) {
          setDbPresets(data.map((p: any) => ({
            id: p.id, name: p.name,
            xOffset: Number(p.x_offset), yOffset: Number(p.y_offset),
            vGap: Number(p.v_gap), width: Number(p.label_width), height: Number(p.label_height),
            a4Cols: p.a4_cols, a4Rows: p.a4_rows, printMode: p.print_mode || 'thermal',
            labelConfig: p.label_config, isDefault: p.is_default,
          })));
        }
      }
    }

    // Activate test print area and trigger print
    setTestPrintActive(true);
    const originalTitle = document.title;
    document.title = ' ';
    setTimeout(() => {
      window.print();
      document.title = originalTitle;
      setTestPrintActive(false);
    }, 300);
  };

  const handleExportPerfectPDF = async () => {
    const hasLabels = labelItems.some((item) => item.qty > 0);
    if (!hasLabels) {
      toast.error('Please add at least one label with quantity > 0');
      return;
    }
    if (isThermal1Up() || isThermal2Up()) {
      toast.error('Perfect PDF is for A4 sheet labels only');
      return;
    }
    toast.info('Generating Perfect PDF...');
    try {
      const dimensions = sheetType === 'custom'
        ? { cols: customCols, rows: customRows, width: customWidth, height: customHeight, gap: customGap }
        : {
            cols: sheetPresets[sheetType].cols,
            rows: (sheetPresets[sheetType] as any).rows || 10,
            width: parseInt(sheetPresets[sheetType].width),
            height: parseInt(sheetPresets[sheetType].height),
            gap: parseInt(sheetPresets[sheetType].gap),
          };

      const pdfBytes = await generateA4LabelPdf(labelItems, {
        labelWidthMm: dimensions.width,
        labelHeightMm: dimensions.height,
        cols: dimensions.cols,
        rows: dimensions.rows,
        gapMm: dimensions.gap,
        topOffsetMm: topOffset,
        leftOffsetMm: leftOffset,
        labelConfig,
        businessName,
      });

      const blob = new Blob([new Uint8Array(pdfBytes) as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `labels-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success('PDF opened — print at Actual Size (100%) for accurate labels');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF');
    }
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

    // Precision Pro Thermal: use html2canvas on PrecisionLabelPreview per label
    if (precisionSettings.enabled && (precisionSettings.printMode === 'thermal' || precisionSettings.printMode === 'thermal2up')) {
      toast.info("Generating PDF...");
      try {
        const { labelWidth, labelHeight, xOffset, yOffset, vGap, labelConfig } = precisionSettings;
        const is2Up = precisionSettings.printMode === 'thermal2up';
        // 2-Up: NO gap between labels — they sit side by side on a 76mm roll
        const horizontalGap = 0;
        const totalLabels = labelItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
        if (totalLabels === 0) { toast.error("No labels to print"); return; }

        const pageW = is2Up ? labelWidth * 2 : labelWidth;
        const pdf = is2Up
          ? new jsPDF({
              orientation: "landscape",
              unit: "mm",
              format: [labelHeight, pageW],
            })
          : new jsPDF({
              orientation: "portrait",
              unit: "mm",
              format: [pageW, labelHeight],
            });

        // Expand items by qty
        const allItems: LabelItem[] = [];
        labelItems.forEach(item => {
          for (let i = 0; i < (item.qty || 0); i++) allItems.push({ ...item, businessName });
        });

        // Create a hidden container
        const container = document.createElement("div");
        container.style.cssText = `position:absolute;left:-9999px;top:0;width:${pageW}mm;`;
        document.body.appendChild(container);

        // Dynamically import ReactDOM to render PrecisionLabelPreview into container per label
        const { createRoot } = await import("react-dom/client");
        const { createElement } = await import("react");
        const { PrecisionLabelPreview } = await import("@/components/precision-barcode/PrecisionLabelPreview");

        // Helper: render one label to canvas
        const renderLabelToCanvas = async (item: LabelItem): Promise<HTMLCanvasElement> => {
          container.innerHTML = "";
          const wrapper = document.createElement("div");
          wrapper.style.cssText = `width:${labelWidth}mm;height:${labelHeight}mm;overflow:hidden;background:#fff;`;
          container.appendChild(wrapper);

          const root = createRoot(wrapper);
          // For PDF: do NOT apply xOffset/yOffset — those are for browser print calibration only
          // PDF placement is handled by addImage coordinates
          root.render(createElement(PrecisionLabelPreview, {
            item,
            width: labelWidth,
            height: labelHeight,
            xOffset: 0,
            yOffset: 0,
            config: labelConfig || undefined,
          }));

          await new Promise(resolve => setTimeout(resolve, 200));

          const canvas = await html2canvas(wrapper, {
            scale: 8,  // High DPI for crisp, scannable barcodes
            backgroundColor: "#ffffff",
            logging: false,
            useCORS: true,
            width: labelWidth * 3.7795,
            height: labelHeight * 3.7795,
          });

          root.unmount();
          return canvas;
        };

        if (is2Up) {
          // 2-Up: render 2 labels per page side by side, no gap
          for (let i = 0; i < allItems.length; i += 2) {
            if (i > 0) pdf.addPage();

            // Left label
            const canvasLeft = await renderLabelToCanvas(allItems[i]);
            pdf.addImage(canvasLeft.toDataURL("image/png"), "PNG", 0, 0, labelWidth, labelHeight);

            // Right label (if exists) — starts at exactly labelWidth (no gap)
            if (i + 1 < allItems.length) {
              const canvasRight = await renderLabelToCanvas(allItems[i + 1]);
              pdf.addImage(canvasRight.toDataURL("image/png"), "PNG", labelWidth, 0, labelWidth, labelHeight);
            }
          }
        } else {
          // 1-Up: one label per page
          for (let i = 0; i < allItems.length; i++) {
            if (i > 0) pdf.addPage();
            const canvas = await renderLabelToCanvas(allItems[i]);
            pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, labelWidth, labelHeight);
          }
        }

        document.body.removeChild(container);
        const timestamp = new Date().toISOString().split("T")[0];
        pdf.save(`barcode-labels-${timestamp}.pdf`);
        toast.success(`PDF generated with ${allItems.length} label${allItems.length > 1 ? 's' : ''}`);
      } catch (err) {
        console.error("Precision PDF error:", err);
        toast.error("Failed to export PDF");
      }
      return;
    }

    toast.info("Generating PDF...");

    try {
      // Calculate total labels needed
      const totalLabels = labelItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      
      // Get dimensions based on sheet type and apply scale
      const scaleFactor = (printScale / 100) * getAutoFitScale();
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
      // For thermal/1-up: each label is its own page; for A4: calculate rows per page
      const labelsPerPage = isThermal1Up()
        ? 1
        : isThermal2Up()
        ? 2
        : (() => {
            const explicitRows = sheetType === 'custom' ? customRows : ((sheetPresets[sheetType] as any)?.rows || 0);
            if (explicitRows > 0) return baseDimensions.cols * explicitRows;
            const availableHeight = 297 - 10;
            const rowsPerPage = Math.floor(availableHeight / (baseDimensions.height + baseDimensions.gap));
            return baseDimensions.cols * Math.max(1, rowsPerPage);
          })();
      
      // Calculate number of pages needed based on actual labels only
      const numPages = totalLabels > 0 ? Math.ceil(totalLabels / labelsPerPage) : 0;
      
      // Don't create PDF if no labels
      if (numPages === 0) {
        toast.error("No labels to print");
        return;
      }
      
      // Create PDF - use label dimensions for thermal, A4 for sheets
      const is1Up = isThermal1Up();
      const is2Up = isThermal2Up();

      // For 2-Up: force gap=0, labels sit flush side by side on 76mm roll
      if (is2Up) {
        baseDimensions.cols = 2;
        baseDimensions.gap = 0;
      }

      const pageWidthMm = is1Up
        ? baseDimensions.width
        : is2Up
        ? baseDimensions.width * 2
        : 210;
      const pageHeightMm = (is1Up || is2Up)
        ? baseDimensions.height
        : 297;

      const pdf = is1Up
        ? new jsPDF({ orientation: "portrait", unit: "mm", format: [baseDimensions.width, baseDimensions.height] })
        : is2Up
        ? new jsPDF({ orientation: "landscape", unit: "mm", format: [baseDimensions.height, baseDimensions.width * 2] })
        : new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      // Create temporary container for rendering each page
      const tempContainer = document.createElement("div");
      tempContainer.id = "pdfExportArea";
      tempContainer.style.position = "absolute";
      tempContainer.style.left = "-9999px";
      tempContainer.style.top = "0";
      tempContainer.style.width = isThermal1Up()
        ? `${baseDimensions.width}mm`
        : isThermal2Up()
        ? `${baseDimensions.width * 2}mm`
        : "210mm";
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
        if (is1Up || is2Up) {
          // Thermal: exact label size grid, no page offsets
          const thermalCols = is2Up ? 2 : 1;
          gridDiv.style.cssText = `
            display: grid;
            grid-template-columns: repeat(${thermalCols}, ${baseDimensions.width}mm);
            gap: 0mm;
            width: ${pageWidthMm}mm;
            height: ${pageHeightMm}mm;
            overflow: hidden;
            box-sizing: border-box;
          `;
        } else {
          gridDiv.style.cssText = `
            display: grid;
            grid-template-columns: repeat(${dimensions.cols}, ${dimensions.width}mm);
            grid-template-rows: repeat(${rowsOnThisPage}, ${dimensions.height}mm);
            gap: ${dimensions.gap}mm;
            padding-top: ${topOffset}mm;
            padding-left: ${leftOffset}mm;
            padding-bottom: ${bottomOffset}mm;
            padding-right: ${rightOffset}mm;
            width: 210mm;
            height: ${Math.min(actualContentHeight, 297)}mm;
            overflow: hidden;
          `;
        }
        
        // Check if using absolute positioning for cell styling
        const useAbsoluteLayout = hasAbsolutePositioning(labelConfig);
        
        for (let i = startIdx; i < endIdx; i++) {
          const cell = document.createElement("div");
          cell.className = "label-cell";
          
          // For thermal 2-Up: no borders, no padding — labels must fill cells exactly
          const isThermalMode = is1Up || is2Up;
          
          if (useAbsoluteLayout) {
            // Absolute positioning layout - matches BarTenderLabelDesigner
            cell.style.cssText = `
              width: ${isThermalMode ? baseDimensions.width : dimensions.width}mm;
              height: ${isThermalMode ? baseDimensions.height : dimensions.height}mm;
              min-height: ${isThermalMode ? baseDimensions.height : dimensions.height}mm;
              max-height: ${isThermalMode ? baseDimensions.height : dimensions.height}mm;
              font-family: Arial, sans-serif;
              position: relative;
              overflow: hidden;
              box-sizing: border-box;
              ${isThermalMode ? '' : 'border: 1px solid #e5e5e5;'}
              background: #fff;
              flex-shrink: 0;
            `;
          } else {
            // Legacy flow-based layout
            cell.style.cssText = `
              width: ${isThermalMode ? baseDimensions.width : dimensions.width}mm;
              height: ${isThermalMode ? baseDimensions.height : dimensions.height}mm;
              min-height: ${isThermalMode ? baseDimensions.height : dimensions.height}mm;
              max-height: ${isThermalMode ? baseDimensions.height : dimensions.height}mm;
              font-family: Arial, sans-serif;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              padding: ${isThermalMode ? '0' : '2px'};
              box-sizing: border-box;
              ${isThermalMode ? '' : 'border: 1px solid #e5e5e5;'}
              background: #fff;
              line-height: 1.1;
              flex-shrink: 0;
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

        // SVG barcodes are already inline – no conversion needed.
        // Brief wait for DOM to settle before html2canvas capture.
        await new Promise(resolve => setTimeout(resolve, 100));

        // Capture this page with high quality - only capture actual content height
        const captureWidthMm = (is1Up || is2Up) ? pageWidthMm : 210;
        const captureHeightMm = (is1Up || is2Up) ? pageHeightMm : Math.min(actualContentHeight, 297);
        const canvas = await html2canvas(tempContainer, {
          scale: (is1Up || is2Up) ? 8 : 3, // Higher scale for thermal labels — crisp barcodes
          backgroundColor: "#ffffff",
          logging: false,
          useCORS: true,
          allowTaint: true,
          width: captureWidthMm * 3.78, // Convert mm to pixels (1mm = ~3.78px)
          height: captureHeightMm * 3.78,
        });

        const imgData = canvas.toDataURL("image/png");
        pdf.addImage(imgData, "PNG", 0, 0, captureWidthMm, captureHeightMm);
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
    <div className="w-full px-6 py-6 space-y-6">
      {location.state?.purchaseItems ? (
        <div className="flex items-center gap-2 flex-wrap">
          <BackToDashboard label="Back to Purchase Bill Dashboard" to="/purchase-bills" />
          {location.state?.billId && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="mb-4"
                onClick={() => orgNavigate('/purchase-entry', { state: { editBillId: location.state.billId } })}
              >
                <Home className="h-4 w-4 mr-2" />
                Back to Purchase Bill
              </Button>
              <Button
                variant="default"
                size="sm"
                className="gap-2 ml-auto"
                onClick={() => {
                  orgNavigate('/purchase-entry', { state: { editBillId: location.state.billId } });
                }}
              >
                <Plus className="h-4 w-4" />
                Continue Adding Products
              </Button>
            </>
          )}
        </div>
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
                      value={`${result.product_name}-${result.brand}-${result.size}-${result.barcode}-${result.id}`}
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

        {/* Label Print Sort Order */}
        <div className="space-y-2">
          <Label>Print Order</Label>
          <Select value={sizeSortOrder} onValueChange={(v) => setSizeSortOrder(v as SizeSortOrder)}>
            <SelectTrigger className="w-full bg-background">
              <SelectValue placeholder="Select sort order" />
            </SelectTrigger>
            <SelectContent className="bg-background">
              <SelectItem value="barcode_asc">Barcode (Serial Order) ↑</SelectItem>
              <SelectItem value="none">Sr No (Original Entry)</SelectItem>
              <SelectItem value="name_asc">Product Name (A→Z)</SelectItem>
              <SelectItem value="price_asc">Price (Low → High)</SelectItem>
              <SelectItem value="price_desc">Price (High → Low)</SelectItem>
              <SelectItem value="ascending">Size: Ascending (35→45)</SelectItem>
              <SelectItem value="descending">Size: Descending (45→35)</SelectItem>
              <SelectItem value="barcode_desc">Barcode: Descending</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Default: Barcode serial order ensures unbroken sequence (18001212 → 18001213 → …)
          </p>
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
                <TableHead>Product Description</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>MRP</TableHead>
                <TableHead>Sale Rate</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Supplier Code</TableHead>
                <TableHead>Label Qty</TableHead>
                <TableHead className="w-[80px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {labelItems.map((item) => {
                const descParts = [item.product_name];
                if (item.category && item.category.trim() && item.category.trim() !== '-') descParts.push(item.category);
                if (item.style && item.style.trim() && item.style.trim() !== '-') descParts.push(item.style);
                if (item.color && item.color.trim() && item.color.trim() !== '-') descParts.push(item.color);
                if (item.brand && item.brand.trim() && item.brand.trim() !== '-') descParts.push(item.brand);
                const fullDesc = descParts.join('-');
                return (
                <TableRow key={item.sku_id}>
                  <TableCell className="font-medium max-w-[250px] truncate" title={fullDesc}>{fullDesc}</TableCell>
                  <TableCell>{item.size}</TableCell>
                  <TableCell>₹{item.mrp || 0}</TableCell>
                  <TableCell>₹{item.sale_price}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <span>{item.barcode || "(auto-gen)"}</span>
                    {item.barcode && (() => {
                      const count = labelItems.filter(li => li.barcode === item.barcode).length;
                      return count > 1 ? (
                        <Badge className="ml-1 text-[10px] px-1 py-0 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400">
                          DUP
                        </Badge>
                      ) : null;
                    })()}
                  </TableCell>
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
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Printing Mode Tabs */}
      <Tabs 
        value={activeBarTab} 
        onValueChange={(v) => {
          setActiveBarTab(v);
          setPrecisionSettings(prev => ({ ...prev, enabled: v === "precision" }));
          // Bridge Label Designer template to Precision Pro on tab switch
          if (v === "precision" && selectedLabelTemplate) {
            const template = savedLabelTemplates.find(t => t.name === selectedLabelTemplate);
            if (template && !precisionSettings.labelConfig) {
              const migratedConfig = ensureCompleteFieldOrder(template.config);
              setPrecisionSettings(prev => ({
                ...prev,
                labelConfig: migratedConfig,
                ...(template.labelWidth ? { labelWidth: template.labelWidth } : {}),
                ...(template.labelHeight ? { labelHeight: template.labelHeight } : {}),
              }));
              setActivePrecisionTemplateName(template.name);
              toast.info(`Loaded template "${template.name}" into Precision Pro`);
            }
          }
        }}
        className="w-full"
      >
        <TabsList className="mb-4">
          <TabsTrigger value="standard">Standard Printing</TabsTrigger>
          <TabsTrigger value="precision">🎯 Precision Pro</TabsTrigger>
          <TabsTrigger value="designer">📐 Label Designer</TabsTrigger>
        </TabsList>

        <TabsContent value="standard" className="space-y-6">
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
                  <SelectItem value="a4_40sheet">A4 40-Sheet (38×35mm, 5×8) ✓ Exact fit</SelectItem>
                  <SelectItem value="novajet40">Novajet 40 (38×35mm, 5×8)</SelectItem>
                  
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
                  <Label htmlFor="printScaleCustom">PDF Export Scale (%)</Label>
                  <Input
                    id="printScaleCustom"
                    type="number"
                    min="50"
                    max="300"
                    step="10"
                    value={printScale}
                    onChange={(e) => setPrintScale(Math.max(50, Math.min(300, parseInt(e.target.value) || 100)))}
                    placeholder="e.g., 110, 150, 170"
                  />
                  <p className="text-xs text-muted-foreground">Only affects PDF export. Direct printing always uses 100%.</p>
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
                  selectedTemplateName={selectedLabelTemplate}
                  onSaveTemplate={saveTemplateToDb}
                  onDeleteTemplate={deleteTemplateFromDb}
                  customFieldLabels={customFieldLabels}
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
        <Button onClick={handlePrint} variant="outline" disabled={settingsLoading || isLoadingSettings} title={settingsLoading ? "Loading print settings..." : "Print labels"}>
          {settingsLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Loading...</> : "Print"}
        </Button>
        {precisionSettings.enabled && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="default">
                🎯 Calibrate
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-sm">Quick Calibration</DialogTitle>
              </DialogHeader>
              <LabelCalibrationUI
                compact
                values={{
                  xOffset: precisionSettings.xOffset,
                  yOffset: precisionSettings.yOffset,
                  vGap: precisionSettings.vGap,
                  labelWidth: precisionSettings.labelWidth,
                  labelHeight: precisionSettings.labelHeight,
                  thermalCols: precisionSettings.thermalCols,
                }}
                onChange={(vals) =>
                  setPrecisionSettings((prev) => ({
                    ...prev,
                    xOffset: vals.xOffset,
                    yOffset: vals.yOffset,
                    vGap: vals.vGap,
                    labelWidth: vals.labelWidth,
                    labelHeight: vals.labelHeight,
                    thermalCols: vals.thermalCols || 1,
                  }))
                }
                presets={dbPresets}
                onSavePreset={async (preset) => {
                  if (!currentOrganization?.id) return;
                  const { error } = await supabase
                    .from("printer_presets")
                    .upsert({
                      id: preset.id || undefined,
                      organization_id: currentOrganization.id,
                      name: preset.name,
                      label_width: preset.width,
                      label_height: preset.height,
                      x_offset: preset.xOffset,
                      y_offset: preset.yOffset,
                      v_gap: preset.vGap,
                      a4_cols: preset.a4Cols ?? precisionSettings.a4Cols,
                      a4_rows: preset.a4Rows ?? precisionSettings.a4Rows,
                      print_mode: precisionSettings.printMode,
                      label_config: preset.labelConfig as any,
                    }, { onConflict: "organization_id,name" });
                  if (error) { toast.error("Failed to save preset"); return; }
                  toast.success(`Preset "${preset.name}" saved`);
                  const { data } = await supabase
                    .from("printer_presets")
                    .select("*")
                    .eq("organization_id", currentOrganization.id)
                    .order("name");
                  if (data) {
                    setDbPresets(data.map((p: any) => ({
                      id: p.id, name: p.name,
                      xOffset: Number(p.x_offset), yOffset: Number(p.y_offset),
                      vGap: Number(p.v_gap), width: Number(p.label_width), height: Number(p.label_height),
                      a4Cols: p.a4_cols, a4Rows: p.a4_rows, printMode: p.print_mode || 'thermal',
                      labelConfig: p.label_config, isDefault: p.is_default,
                    })));
                  }
                }}
                onDeletePreset={async (presetId) => {
                  const { error } = await supabase.from("printer_presets").delete().eq("id", presetId);
                  if (error) { toast.error("Failed to delete preset"); return; }
                  toast.success("Preset deleted");
                  setDbPresets((prev) => prev.filter((p) => p.id !== presetId));
                }}
                onSetDefault={handleSetDefaultPreset}
                onSetTemplateDefault={handleSetTemplateDefault}
                defaultTemplateName={dbPresets.find(p => p.isDefault)?.name || null}
                onLoadPreset={(preset) => {
                  if (preset.labelConfig) {
                    setPrecisionSettings((prev) => ({ ...prev, labelConfig: preset.labelConfig }));
                  }
                  if (preset.a4Cols) setPrecisionSettings((prev) => ({ ...prev, a4Cols: preset.a4Cols! }));
                  if (preset.a4Rows) setPrecisionSettings((prev) => ({ ...prev, a4Rows: preset.a4Rows! }));
                  setPrecisionSettings((prev) => ({ ...prev, thermalCols: preset.thermalCols || 1 }));
                  const mode = preset.printMode || (preset.a4Cols && preset.a4Rows ? 'a4' : (preset.thermalCols && preset.thermalCols > 1) ? 'thermal2up' : 'thermal');
                  setPrecisionSettings((prev) => ({ ...prev, printMode: mode }));
                  const isLabelTemplate = savedLabelTemplates.some(t => t.name === preset.name);
                  setActivePrecisionTemplateName(isLabelTemplate ? preset.name : `preset:${preset.name}`);
                }}
                labelConfig={precisionSettings.labelConfig || undefined}
                savedTemplates={savedLabelTemplates}
                sampleItem={labelItems.length > 0 ? { ...labelItems[0], businessName } : undefined}
                activePresetValue={activePrecisionTemplateName}
              />
            </DialogContent>
          </Dialog>
        )}
        {precisionSettings.enabled && (
          <Button variant="outline" onClick={handleTestPrint}>
            🖨️ Print Test Label
          </Button>
        )}
        {(sheetType.startsWith('thermal') || sheetType === 'custom') && (
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
        {!(isThermal1Up() || isThermal2Up()) && (
          <Button
            onClick={handleExportPerfectPDF}
            variant="outline"
            className="bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700 dark:bg-purple-950 dark:hover:bg-purple-900 dark:border-purple-800 dark:text-purple-300"
          >
            <Download className="h-4 w-4 mr-2" />
            Perfect PDF ✨
          </Button>
        )}
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
        </TabsContent>

        <TabsContent value="precision" className="space-y-6">
          {/* Precision Pro Calibration & Actions */}
          <div className="border rounded-lg p-4 space-y-4">
            <h2 className="text-xl font-semibold">🎯 Precision Pro Settings</h2>
            <p className="text-sm text-muted-foreground">
              Coordinate-based label printing with pixel-perfect positioning. Configure label dimensions, field positions, and calibration offsets.
            </p>
            <LabelCalibrationUI
              values={{
                xOffset: precisionSettings.xOffset,
                yOffset: precisionSettings.yOffset,
                vGap: precisionSettings.vGap,
                labelWidth: precisionSettings.labelWidth,
                labelHeight: precisionSettings.labelHeight,
                thermalCols: precisionSettings.thermalCols,
              }}
              onChange={(vals) =>
                setPrecisionSettings((prev) => ({
                  ...prev,
                  xOffset: vals.xOffset,
                  yOffset: vals.yOffset,
                  vGap: vals.vGap,
                  labelWidth: vals.labelWidth,
                  labelHeight: vals.labelHeight,
                  thermalCols: vals.thermalCols || 1,
                }))
              }
              presets={dbPresets}
              onSavePreset={async (preset) => {
                if (!currentOrganization?.id) return;
                const { error } = await supabase
                  .from("printer_presets")
                  .upsert({
                    id: preset.id || undefined,
                    organization_id: currentOrganization.id,
                    name: preset.name,
                    label_width: preset.width,
                    label_height: preset.height,
                    x_offset: preset.xOffset,
                    y_offset: preset.yOffset,
                    v_gap: preset.vGap,
                    a4_cols: preset.a4Cols ?? precisionSettings.a4Cols,
                    a4_rows: preset.a4Rows ?? precisionSettings.a4Rows,
                    print_mode: precisionSettings.printMode,
                    label_config: preset.labelConfig as any,
                    thermal_cols: preset.thermalCols || precisionSettings.thermalCols || 1,
                  }, { onConflict: "organization_id,name" });
                if (error) { toast.error("Failed to save preset"); return; }
                toast.success(`Preset "${preset.name}" saved`);
                // Mirror label design to barcode_label_settings so Label Designer dropdown lists it
                if (preset.labelConfig) {
                  try {
                    await saveTemplateToDb({
                      name: preset.name,
                      config: preset.labelConfig,
                      labelWidth: preset.width,
                      labelHeight: preset.height,
                    });
                  } catch (mirrorErr) {
                    console.warn('Failed to mirror preset to label_template:', mirrorErr);
                  }
                }
                const { data } = await supabase
                  .from("printer_presets")
                  .select("*")
                  .eq("organization_id", currentOrganization.id)
                  .order("name");
                if (data) {
                  setDbPresets(data.map((p: any) => ({
                    id: p.id, name: p.name,
                    xOffset: Number(p.x_offset), yOffset: Number(p.y_offset),
                    vGap: Number(p.v_gap), width: Number(p.label_width), height: Number(p.label_height),
                    a4Cols: p.a4_cols, a4Rows: p.a4_rows, printMode: p.print_mode || 'thermal',
                    labelConfig: p.label_config, isDefault: p.is_default,
                    thermalCols: p.thermal_cols || undefined,
                  })));
                }
              }}
              onDeletePreset={async (presetId) => {
                const { error } = await supabase.from("printer_presets").delete().eq("id", presetId);
                if (error) { toast.error("Failed to delete preset"); return; }
                toast.success("Preset deleted");
                setDbPresets((prev) => prev.filter((p) => p.id !== presetId));
              }}
              onSetDefault={handleSetDefaultPreset}
              onSetTemplateDefault={handleSetTemplateDefault}
              defaultTemplateName={dbPresets.find(p => p.isDefault)?.name || null}
              onLoadPreset={(preset) => {
                if (preset.labelConfig) {
                  setPrecisionSettings((prev) => ({ ...prev, labelConfig: preset.labelConfig }));
                }
                if (preset.a4Cols) setPrecisionSettings((prev) => ({ ...prev, a4Cols: preset.a4Cols! }));
                if (preset.a4Rows) setPrecisionSettings((prev) => ({ ...prev, a4Rows: preset.a4Rows! }));
                setPrecisionSettings((prev) => ({ ...prev, thermalCols: preset.thermalCols || 1 }));
                // Auto-detect print mode from preset
                const mode = preset.printMode || (preset.a4Cols && preset.a4Rows ? 'a4' : (preset.thermalCols && preset.thermalCols > 1) ? 'thermal2up' : 'thermal');
                setPrecisionSettings((prev) => ({ ...prev, printMode: mode }));
                // Track active template for auto-save (only for saved label templates, not built-in presets)
                  const isLabelTemplate = savedLabelTemplates.some(t => t.name === preset.name);
                  setActivePrecisionTemplateName(isLabelTemplate ? preset.name : `preset:${preset.name}`);
              }}
              labelConfig={precisionSettings.labelConfig || undefined}
              savedTemplates={savedLabelTemplates}
              printMode={precisionSettings.printMode}
              a4Cols={precisionSettings.a4Cols}
              a4Rows={precisionSettings.a4Rows}
              onPrintModeChange={(mode) => {
                setPrecisionSettings((prev) => ({
                  ...prev,
                  printMode: mode,
                  ...(mode === 'thermal2up' ? { thermalCols: 2 } : mode === 'thermal' ? { thermalCols: 1 } : {}),
                }));
              }}
              onA4ColsChange={(cols) => setPrecisionSettings((prev) => ({ ...prev, a4Cols: cols }))}
              onA4RowsChange={(rows) => setPrecisionSettings((prev) => ({ ...prev, a4Rows: rows }))}
              sampleItem={labelItems.length > 0 ? { ...labelItems[0], businessName } : undefined}
              activePresetValue={activePrecisionTemplateName}
            />
          </div>

          {/* Precision Pro Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={handlePreview}>
              <Eye className="h-4 w-4 mr-2" />
              Preview Labels
            </Button>
            <Button onClick={handlePrint} variant="outline" disabled={settingsLoading || isLoadingSettings} title={settingsLoading ? "Loading print settings..." : "Print labels"}>
              {settingsLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Loading...</> : "Print"}
            </Button>
            <Button variant="outline" onClick={handleTestPrint}>
              🖨️ Print Test Label
            </Button>
            <Button onClick={handleExportPDF} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="designer" className="space-y-6">
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">📐 Precision Pro Label Designer</h2>
              {activePrecisionTemplateName && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-medium text-green-700 dark:text-green-400">
                    Live · {activePrecisionTemplateName.replace('preset:', '')}
                  </span>
                </div>
              )}
            </div>
            
            {/* Template Selector for Designer */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[200px] space-y-1">
                <Label className="text-xs font-medium">Load Label Template</Label>
                <Select 
                  value={activePrecisionTemplateName || ""} 
                  onValueChange={(name) => {
                    // Handle printer presets (from printer_presets table)
                    if (name.startsWith("preset:")) {
                      const presetName = name.replace("preset:", "");
                      const preset = dbPresets.find(p => p.name === presetName);
                      if (preset && preset.labelConfig) {
                        const migratedConfig = ensureCompleteFieldOrder(preset.labelConfig);
                        setPrecisionSettings((prev) => ({
                          ...prev,
                          labelConfig: migratedConfig,
                          labelWidth: preset.width,
                          labelHeight: preset.height,
                        }));
                        setActivePrecisionTemplateName(name);
                        toast.success(`Preset "${presetName}" loaded`);
                      }
                      return;
                    }
                    // Handle label templates (from barcode_label_settings table)
                    const template = savedLabelTemplates.find(t => t.name === name);
                    if (template) {
                      const migratedConfig = ensureCompleteFieldOrder(template.config);
                      setPrecisionSettings((prev) => ({ 
                        ...prev, 
                        labelConfig: migratedConfig,
                        ...(template.labelWidth ? { labelWidth: template.labelWidth } : {}),
                        ...(template.labelHeight ? { labelHeight: template.labelHeight } : {}),
                      }));
                      setActivePrecisionTemplateName(name);
                      toast.success(`Template "${name}" loaded`);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select a template to edit..." />
                  </SelectTrigger>
                  <SelectContent>
                    {savedLabelTemplates.length === 0 && dbPresets.filter(p => p.labelConfig).length === 0 ? (
                      <div className="px-2 py-2 text-xs text-muted-foreground">No saved templates. Save one first.</div>
                    ) : (
                      <>
                        {savedLabelTemplates.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">💾 Label Templates</div>
                            {savedLabelTemplates.map((t) => (
                              <SelectItem key={`lt-${t.name}`} value={t.name} className="text-xs">
                                📐 {t.name}
                                {t.labelWidth && t.labelHeight && (
                                  <span className="ml-1 text-muted-foreground">
                                    ({t.labelWidth}×{t.labelHeight}mm)
                                  </span>
                                )}
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {dbPresets.filter(p => p.labelConfig).length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">🖨️ Printer Presets</div>
                            {dbPresets.filter(p => p.labelConfig).map((p) => (
                              <SelectItem key={`pp-${p.name}`} value={`preset:${p.name}`} className="text-xs">
                                🖨️ {p.name} ({p.width}×{p.height}mm)
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {activePrecisionTemplateName && (
                <div className="flex items-center gap-2 pt-4">
                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-medium text-xs">
                    ✏️ Editing: {activePrecisionTemplateName.replace("preset:", "")}
                  </span>
                  <span className="text-muted-foreground text-[10px]">(changes auto-save)</span>
                  <Button 
                    variant="ghost" 
                    size="xs" 
                    className="h-6 text-xs"
                    onClick={() => setActivePrecisionTemplateName(null)}
                  >
                    ✕ Deselect
                  </Button>
                </div>
              )}
            </div>

            {(!precisionConfigReady || isLoadingSettings) ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
                <span className="text-muted-foreground">Loading label design...</span>
              </div>
            ) : (
            <>
            <p className="text-sm text-muted-foreground">
              Configure exact field positions (in mm) for pixel-perfect label printing. Drag fields to reposition them on the live preview.
            </p>
            <PrecisionLabelDesigner
              labelWidth={precisionSettings.labelWidth}
              labelHeight={precisionSettings.labelHeight}
              config={precisionSettings.labelConfig || DEFAULT_PRECISION_CONFIG}
              onConfigChange={(cfg) =>
                setPrecisionSettings((prev) => ({ ...prev, labelConfig: cfg }))
              }
              sampleItem={labelItems.length > 0 ? { ...labelItems[0], businessName } : undefined}
              defaultUom={defaultUom}
              onSave={async () => {
                if (!currentOrganization?.id) return;
                try {
                  const configToSave = precisionSettings.labelConfig || DEFAULT_PRECISION_CONFIG;
                  await savePrecisionConfigToSettings(configToSave, currentOrganization.id);

                  // Also save to active template if one is loaded
                  if (activePrecisionTemplateName) {
                    const success = await autoSavePrecisionConfig(
                      activePrecisionTemplateName,
                      configToSave,
                      precisionSettings.labelWidth,
                      precisionSettings.labelHeight,
                      currentOrganization.id
                    );

                    if (!success) {
                      toast.error("Failed to save label design");
                      return;
                    }

                    const cleanName = activePrecisionTemplateName.startsWith("preset:")
                      ? activePrecisionTemplateName.replace("preset:", "")
                      : activePrecisionTemplateName;
                    const targetLabel = activePrecisionTemplateName.startsWith("preset:")
                      ? `preset "${cleanName}"`
                      : `template "${cleanName}"`;

                    toast.success(`Design saved & ${targetLabel} updated`);
                  } else {
                    toast.success("Label design saved successfully");
                  }
                } catch (error) {
                  console.error("Failed to save label design:", error);
                  toast.error("Failed to save label design");
                }
              }}
            />
            </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Label Preview</DialogTitle>
            <DialogDescription>
              Review your labels before printing. This is how they will appear on the sheet.
            </DialogDescription>
          </DialogHeader>
          {precisionSettings.enabled ? (
            <div className="mt-4 border rounded-md p-4 bg-white overflow-auto">
              {(isLoadingSettings || !precisionConfigReady) ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
                  <span className="text-muted-foreground">Loading label design settings...</span>
                </div>
              ) : (
                <>
                  <div className="mb-3 p-3 rounded-lg text-center font-bold text-sm" style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}>
                    Total: {labelItems.reduce((s, i) => s + (i.qty || 0), 0)} labels
                  </div>
                  {(precisionSettings.printMode === 'thermal' || precisionSettings.printMode === 'thermal2up') ? (
                    <div className="flex flex-col items-center gap-4">
                      {labelItems.filter(i => (i.qty || 0) > 0).flatMap((item, idx) =>
                        Array.from({ length: item.qty || 1 }, (_, qi) => (
                          <div key={`${idx}-${qi}`} className="border border-dashed border-border">
                            <PrecisionLabelPreview
                              item={{ ...item, businessName }}
                              width={precisionSettings.labelWidth}
                              height={precisionSettings.labelHeight}
                              config={precisionSettings.labelConfig || undefined}
                              scaleFactor={2}
                            />
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <PrecisionA4SheetPrint
                      items={labelItems.filter(i => (i.qty || 0) > 0).map(i => ({ ...i, businessName }))}
                      labelWidth={precisionSettings.labelWidth}
                      labelHeight={precisionSettings.labelHeight}
                      cols={precisionSettings.a4Cols}
                      rows={precisionSettings.a4Rows}
                      xOffset={precisionSettings.xOffset}
                      yOffset={precisionSettings.yOffset}
                      vGap={precisionSettings.vGap}
                      config={precisionSettings.labelConfig || undefined}
                    />
                  )}
                </>
              )}
            </div>
          ) : (
            <div 
              id="previewArea" 
              className="mt-4 border rounded-md p-4 bg-white"
              ref={(el) => {
                if (el && isPreviewDialogOpen) {
                  generatePreview("previewArea");
                }
              }}
            />
          )}
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
          mrp: item.mrp,
          salePrice: item.sale_price,
          barcode: item.barcode,
          billNumber: item.bill_number,
          purchaseCode: item.purchase_code,
          supplierCode: item.supplier_code,
          style: item.style,
          quantity: item.qty,
        }))}
        labelSize={sheetType === "custom" ? `custom_${customWidth}x${customHeight}` : sheetType}
        labelConfig={labelConfig}
        businessName={businessName}
        prnTemplates={prnTemplates}
        onSavePRNTemplate={savePRNTemplate}
        onDeletePRNTemplate={deletePRNTemplate}
      />

      {/* Test Label Print Area (hidden, shown only during test print) */}
      {testPrintActive && (
        <div className="hidden print:block">
          <PrecisionPrintCSS
            labelWidth={precisionSettings.labelWidth}
            labelHeight={precisionSettings.labelHeight}
            mode="thermal"
          />
          <TestLabelPrint
            ref={testPrintRef}
            width={precisionSettings.labelWidth}
            height={precisionSettings.labelHeight}
            xOffset={precisionSettings.xOffset}
            yOffset={precisionSettings.yOffset}
          />
        </div>
      )}

      {/* Print Area (hidden, used for printing) */}
      {!testPrintActive && precisionSettings.enabled ? (
        <div className="hidden print:block">
          {(precisionSettings.printMode === 'thermal' || precisionSettings.printMode === 'thermal2up') ? (
            <PrecisionThermalPrint
              ref={precisionPrintRef}
              items={labelItems.filter(i => (i.qty || 0) > 0).map(i => ({ ...i, businessName }))}
              labelWidth={precisionSettings.labelWidth}
              labelHeight={precisionSettings.labelHeight}
              xOffset={precisionSettings.xOffset}
              yOffset={precisionSettings.yOffset}
              vGap={precisionSettings.vGap}
              config={precisionSettings.labelConfig || undefined}
              thermalCols={precisionSettings.printMode === 'thermal2up' ? Math.max(2, precisionSettings.thermalCols || 2) : (precisionSettings.thermalCols || 1)}
              horizontalGap={getThermal2UpGap()}
            />
          ) : (
            <PrecisionA4SheetPrint
              ref={precisionPrintRef}
              items={labelItems.filter(i => (i.qty || 0) > 0).map(i => ({ ...i, businessName }))}
              labelWidth={precisionSettings.labelWidth}
              labelHeight={precisionSettings.labelHeight}
              cols={precisionSettings.a4Cols}
              rows={precisionSettings.a4Rows}
              xOffset={precisionSettings.xOffset}
              yOffset={precisionSettings.yOffset}
              vGap={precisionSettings.vGap}
              config={precisionSettings.labelConfig || undefined}
            />
          )}
        </div>
      ) : (
        <div id="printArea" className="hidden"></div>
      )}

      {!precisionSettings.enabled && <style>{`
        #printArea {
          width: ${isThermal1Up() ? `${sheetType === "custom" ? customWidth : parseInt(sheetPresets[sheetType].width)}mm` : '210mm'};
          min-height: ${isThermal1Up() ? `${sheetType === "custom" ? customHeight : parseInt(sheetPresets[sheetType].height)}mm` : '297mm'};
          padding: 0;
          margin: 0;
        }

        #printArea .label-grid {
          display: grid;
        }

        #printArea .label-cell {
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
          size: ${isThermal1Up() 
            ? `${(sheetType === "custom" ? customWidth : parseInt(sheetPresets[sheetType].width)) + leftOffset + rightOffset}mm ${(sheetType === "custom" ? customHeight : parseInt(sheetPresets[sheetType].height)) + topOffset + bottomOffset}mm` 
            : 'A4 portrait'}; 
          margin: ${isThermal1Up() ? '0mm' : `${topOffset}mm ${rightOffset}mm ${bottomOffset}mm ${leftOffset}mm`} !important;
        }
        
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
          }

          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          body * { visibility: hidden; }
          #printArea, #printArea * { visibility: visible; }
          .precision-print-area, .precision-print-area * { visibility: visible !important; }
          .precision-print-area {
            position: absolute;
            left: 0;
            top: 0;
            display: block !important;
          }
          .precision-barcode-svg {
            image-rendering: pixelated;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #printArea { 
            position: absolute;
            left: 0; 
            top: 0;
            display: block !important;
            width: ${isThermal1Up() ? `${(sheetType === "custom" ? customWidth : parseInt(sheetPresets[sheetType].width)) + leftOffset + rightOffset}mm` : '210mm'} !important;
            min-height: auto !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          
          #printArea .label-grid {
            ${isThermal1Up() ? `
              display: block !important;
              width: ${(sheetType === "custom" ? customWidth : parseInt(sheetPresets[sheetType].width)) + leftOffset + rightOffset}mm !important;
              height: ${(sheetType === "custom" ? customHeight : parseInt(sheetPresets[sheetType].height)) + topOffset + bottomOffset}mm !important;
              min-height: ${(sheetType === "custom" ? customHeight : parseInt(sheetPresets[sheetType].height)) + topOffset + bottomOffset}mm !important;
              max-height: ${(sheetType === "custom" ? customHeight : parseInt(sheetPresets[sheetType].height)) + topOffset + bottomOffset}mm !important;
              page-break-before: auto !important;
              break-before: auto !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid-page !important;
              padding-top: ${topOffset}mm !important;
              padding-left: ${leftOffset}mm !important;
              padding-bottom: ${bottomOffset}mm !important;
              padding-right: ${rightOffset}mm !important;
              margin: 0 !important;
              overflow: visible !important;
              box-sizing: border-box !important;
              position: relative !important;
            ` : `
              page-break-after: auto;
            `}
          }

          #printArea .label-grid:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          
          #printArea .label-cell {
            page-break-inside: avoid;
            break-inside: avoid-page;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            ${isThermal1Up() ? `
              position: relative !important;
              display: block !important;
              -webkit-text-stroke: 0.3px black;
              line-height: inherit !important;
              width: ${sheetType === "custom" ? customWidth : parseInt(sheetPresets[sheetType].width)}mm !important;
              height: ${sheetType === "custom" ? customHeight : parseInt(sheetPresets[sheetType].height)}mm !important;
              min-height: ${sheetType === "custom" ? customHeight : parseInt(sheetPresets[sheetType].height)}mm !important;
              padding: 0 !important;
              margin: 0 !important;
              overflow: visible !important;
              box-sizing: border-box !important;
            ` : ''}
          }

          ${isThermal1Up() ? `
          #printArea .label-cell > div {
            position: absolute !important;
          }
          ` : ''}
          
          /* Ensure business name and all fields print on every page */
          .brand, .prod, .mrp, .meta, .barcode, .supplier-code, .bill-num {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>}
    </div>
  );
}
