/**
 * Barcode Printing sheet sizes (A4 sheets, thermal 1-up / 2-up rolls, custom), their menu
 * labels, and the built-in label templates. Moved out of BarcodePrinting.tsx unchanged
 * (Plan Phase 4, S4).
 */
import { LabelTemplate } from "@/types/labelTypes";

export type SheetType = 
  // A4 Sheet Types
  "novajet48" | "novajet40" | "a4_40sheet" | "a4_39x35_40sheet" | "novajet65" | "a4_12x4" | "a4_65sheet" | "a4_32sheet" | 
  "a4_24sheet" | "a4_20sheet" | "a4_35square" | "a4_21sheet" | "a4_80sheet" | "a4_36sheet" |
  // Thermal 1UP Types
  "thermal_50x30_1up" | "thermal_50x38_1up" | "thermal_50x25_1up" | "thermal_38x25_1up" | 
  "thermal_40x20_1up" | "thermal_40x30_1up" | "thermal_50x40_1up" |
  "thermal_60x30_1up" | "thermal_60x40_1up" | "thermal_100x50_1up" | 
  "thermal_75x50_1up" | "thermal_100x100_1up" | "thermal_80x40_1up" |
  "precision_pro_tsc" |
  "jewellery_100x15_1up" |
  // Thermal 2UP Types
  "thermal_50x30_2up" | "thermal_50x25_2up" | "thermal_38x25_2up" |
  "thermal_40x20_2up" | "thermal_40x30_2up" | "thermal_60x30_2up" | 
  "thermal_60x40_2up" | "thermal_75x50_2up" |
  // Custom
  "custom";

export const sheetPresets = {
  // ===== A4 Sheet Presets =====
  // Small Labels
  novajet48: { cols: 8, rows: 6, width: "33mm", height: "19mm", gap: "1mm", category: "a4" },
  a4_80sheet: { cols: 10, rows: 20, width: "26mm", height: "14mm", gap: "0.5mm", category: "a4" },
  novajet65: { cols: 5, rows: 13, width: "38mm", height: "21mm", gap: "1mm", category: "a4" },
  a4_65sheet: { cols: 5, rows: 12, width: "38mm", height: "22mm", gap: "1mm", category: "a4" },
  
  // Medium Labels
  // TechNova NovaJet MPL 40L — official 39×35mm, 5×8, gap 0 (die-cut).
  // Gap>0 / 38mm width caused cumulative skew (top-right / bottom-left drift).
  novajet40: { cols: 5, rows: 8, width: "39mm", height: "35mm", gap: "0mm", category: "a4" },
  a4_40sheet: { cols: 5, rows: 8, width: "39mm", height: "35mm", gap: "0mm", category: "a4" },
  a4_39x35_40sheet: { cols: 5, rows: 8, width: "39mm", height: "35mm", gap: "0mm", category: "a4" },
  a4_35x37: { cols: 5, rows: 8, width: "35mm", height: "37mm", gap: "1.2mm", category: "a4" },
  // TechNova NovaJet MPL 48L (NJMPL 48L / 48×24WR) — top margin baked into computeA4SheetMargins
  a4_12x4: {
    cols: 4,
    rows: 12,
    width: "48mm",
    height: "24mm",
    gap: "0mm",
    category: "a4",
    defaultTop: 0,
    defaultLeft: 0,
    defaultBottom: 0,
    defaultRight: 0,
  },
  a4_36sheet: { cols: 4, rows: 9, width: "48mm", height: "30mm", gap: "1mm", category: "a4" },
  a4_32sheet: { cols: 4, rows: 8, width: "52mm", height: "30mm", gap: "1mm", category: "a4" },
  a4_35square: { cols: 5, rows: 7, width: "35mm", height: "35mm", gap: "2mm", category: "a4" },
  
  // Large Labels
  a4_24sheet: { cols: 3, rows: 8, width: "70mm", height: "35mm", gap: "1mm", category: "a4" },
  a4_21sheet: { cols: 3, rows: 7, width: "63.5mm", height: "38.1mm", gap: "1mm", category: "a4" },
  a4_20sheet: { cols: 2, rows: 10, width: "100mm", height: "50mm", gap: "1mm", category: "a4" },

  // ===== Thermal Roll Presets (1UP - Single Column) =====
  // Extra Small
  thermal_40x20_1up: { cols: 1, width: "40mm", height: "20mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_40x30_1up: { cols: 1, width: "40mm", height: "30mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_38x25_1up: { cols: 1, width: "38mm", height: "25mm", gap: "0mm", category: "thermal", thermal: true },
  
  // Small
  thermal_50x25_1up: { cols: 1, width: "50mm", height: "25mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_50x30_1up: { cols: 1, width: "50mm", height: "30mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_50x38_1up: { cols: 1, width: "50mm", height: "38mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_50x40_1up: { cols: 1, width: "50mm", height: "40mm", gap: "0mm", category: "thermal", thermal: true },
  
  // Medium
  thermal_60x30_1up: { cols: 1, width: "60mm", height: "30mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_60x40_1up: { cols: 1, width: "60mm", height: "40mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_75x50_1up: { cols: 1, width: "75mm", height: "50mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_80x40_1up: { cols: 1, width: "80mm", height: "40mm", gap: "0mm", category: "thermal", thermal: true },
  
  // Large / Shipping
  thermal_100x50_1up: { cols: 1, width: "100mm", height: "50mm", gap: "0mm", category: "thermal", thermal: true },
  thermal_100x100_1up: { cols: 1, width: "100mm", height: "100mm", gap: "0mm", category: "thermal", thermal: true },
  precision_pro_tsc: { cols: 1, width: "102mm", height: "53mm", gap: "2mm", category: "thermal", thermal: true },
  jewellery_100x15_1up: { cols: 1, width: "100mm", height: "15mm", gap: "2mm", category: "thermal", thermal: true },

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
export const sheetPresetLabels: Record<string, { label: string; description: string; group: string }> = {
  // A4 Sheets - Small
  novajet48: { label: "Novajet 48", description: "33×19mm, 8 cols", group: "A4 - Small Labels" },
  a4_80sheet: { label: "A4 80-Sheet", description: "26×14mm, 10 cols (tiny)", group: "A4 - Small Labels" },
  novajet65: { label: "Novajet 65", description: "38×21mm, 5 cols", group: "A4 - Small Labels" },
  a4_65sheet: { label: "A4 65-Sheet", description: "38×22mm, 5 cols (shelf)", group: "A4 - Small Labels" },
  
  // A4 Sheets - Medium
  novajet40: { label: "Novajet 40", description: "39×35mm, 5×8 (40 labels) MPL 40L", group: "A4 - Medium Labels" },
  a4_40sheet: { label: "A4 40-Sheet", description: "39×35mm, 5×8 (40 labels) MPL 40L ✓ Exact", group: "A4 - Medium Labels" },
  a4_39x35_40sheet: { label: "A4 40-Sheet (39×35mm)", description: "39×35mm, 5×8 (40 labels) — Al Nisa / MPL 40L", group: "A4 - Medium Labels" },
  a4_35x37: { label: "A4 35×37mm", description: "35×37mm, 5×8 (40 labels)", group: "A4 - Medium Labels" },
  a4_12x4: { label: "NovaJet MPL 48L", description: "48×24mm, 4×12 (NJMPL)", group: "A4 - Medium Labels" },
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
  thermal_50x38_1up: { label: "50×38mm (1UP)", description: "Ella Noor / garment", group: "Thermal 1UP - Small" },
  
  // Thermal 1UP - Medium
  thermal_50x40_1up: { label: "50×40mm (1UP)", description: "Detailed info", group: "Thermal 1UP - Medium" },
  thermal_60x30_1up: { label: "60×30mm (1UP)", description: "Wide format", group: "Thermal 1UP - Medium" },
  thermal_60x40_1up: { label: "60×40mm (1UP)", description: "Large detailed", group: "Thermal 1UP - Medium" },
  thermal_75x50_1up: { label: "75×50mm (1UP)", description: "Medium shipping", group: "Thermal 1UP - Medium" },
  thermal_80x40_1up: { label: "80×40mm (1UP)", description: "Wide shipping", group: "Thermal 1UP - Medium" },
  
  // Thermal 1UP - Large
  thermal_100x50_1up: { label: "100×50mm (1UP)", description: "Shipping label", group: "Thermal 1UP - Large" },
  thermal_100x100_1up: { label: "100×100mm (1UP)", description: "Large shipping", group: "Thermal 1UP - Large" },
  precision_pro_tsc: { label: "Precision Pro TSC (102×53mm — Box + Pair)", description: "Footwear box + 2 pair labels", group: "Thermal 1UP - Large" },
  jewellery_100x15_1up: { label: "Jewellery Tag (100×15mm 1UP)", description: "Jewellery tag with G/L/N weight", group: "Thermal 1UP - Jewellery" },
  
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
export const builtInLabelTemplates: LabelTemplate[] = [
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
