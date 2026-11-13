/**
 * Barcode Printing label-config helpers: printer preset rows, resolving a preset's label design,
 * completing old configs' field order, and sorting labels. Moved out of BarcodePrinting.tsx
 * unchanged (Plan Phase 4, S4).
 */
import { SizeSortOrder } from "@/hooks/useBarcodeLabelSettings";
import { LabelFieldConfig, LabelDesignConfig, LabelItem, FieldKey } from "@/types/labelTypes";
import { migrateCustomTextFields } from "@/utils/labelCustomText";
import { type CalibrationPreset } from "@/components/precision-barcode/LabelCalibrationUI";
import { DEFAULT_PRECISION_CONFIG } from "@/components/precision-barcode/PrecisionLabelDesigner";
import { resolveFixedBuiltinLabelConfig } from "@/constants/fixedBuiltinLabelPresets";
import { isBoutiqueGridPresetName, resolveBoutiqueGridLabelConfig } from "@/constants/boutiqueGridLabelTemplate";
import { LABEL_STYLE_BOUTIQUE_GRID, isBoutiqueGridLabelStyle } from "@/types/labelTypes";
import { isRanawatBlingPresetName, resolveRanawatBlingLabelConfig } from "@/constants/ranawatBlingLabelTemplate";
import { isRetailNarrowPresetName, resolveRetailNarrowLabelConfig } from "@/constants/retailNarrowLabelTemplate";

export function mapPrinterPresetFromRow(p: Record<string, unknown>): CalibrationPreset {
  return {
    id: p.id != null ? String(p.id) : undefined,
    name: String(p.name),
    xOffset: Number(p.x_offset),
    yOffset: Number(p.y_offset),
    vGap: Number(p.v_gap),
    hGap: p.h_gap != null ? Number(p.h_gap) : 0,
    width: Number(p.label_width),
    height: Number(p.label_height),
    a4Cols: p.a4_cols != null ? Number(p.a4_cols) : undefined,
    a4Rows: p.a4_rows != null ? Number(p.a4_rows) : undefined,
    printMode: (p.print_mode as CalibrationPreset["printMode"]) || undefined,
    labelConfig: p.label_config as LabelDesignConfig | null,
    isDefault: Boolean(p.is_default),
    thermalCols: p.thermal_cols != null ? Number(p.thermal_cols) : undefined,
  };
}

export const resolvePresetLabelConfig = (
  presetName: string,
  stored?: Partial<LabelDesignConfig> | null,
): LabelDesignConfig => {
  const fixed = resolveFixedBuiltinLabelConfig(presetName);
  if (fixed) return fixed;
  // Boutique Grid: opt-in style — merge saved field toggles, always keep labelStyle.
  if (isBoutiqueGridPresetName(presetName) || isBoutiqueGridLabelStyle(stored)) {
    if (stored && (stored.fieldOrder?.length || stored.businessName || stored.barcode)) {
      return ensureCompleteFieldOrder({
        ...stored,
        labelStyle: LABEL_STYLE_BOUTIQUE_GRID,
      });
    }
    return resolveBoutiqueGridLabelConfig();
  }
  if (isRanawatBlingPresetName(presetName)) {
    if (stored && (stored.fieldOrder?.length || stored.businessName || stored.barcode)) {
      return ensureCompleteFieldOrder(stored);
    }
    return resolveRanawatBlingLabelConfig();
  }
  // Retail Narrow is an editable starting design (never locked): resolve the
  // built-in only when nothing saved exists under that name.
  if (isRetailNarrowPresetName(presetName)) {
    if (stored && (stored.fieldOrder?.length || stored.businessName || stored.barcode)) {
      return ensureCompleteFieldOrder(stored);
    }
    return resolveRetailNarrowLabelConfig();
  }
  return ensureCompleteFieldOrder(stored || {});
};

// Utility function to sort items by size, barcode, name, price, or keep original order (Sr No)
export const sortItemsBySize = (items: LabelItem[], order: SizeSortOrder): LabelItem[] => {
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

export const mergeLabelField = (
  partial: Partial<LabelFieldConfig> | undefined,
  fallback: LabelFieldConfig,
): LabelFieldConfig => (partial ? { ...fallback, ...partial } : { ...fallback });

// Helper function to ensure all fields are in fieldOrder (for migrating old configs)
export const ensureCompleteFieldOrder = (config: Partial<LabelDesignConfig>): LabelDesignConfig => {
  const allFields: FieldKey[] = [
    'businessName', 'brand', 'productName', 'category', 'color', 'style', 'size', 'price', 'mrp', 'saleDiscPercent', 'qty',
    'customText', 'barcode', 'barcodeText', 'billNumber', 'supplierCode', 'purchaseCode', 'supplierInvoiceNo'
  ];

  const existingOrder = config.fieldOrder || [];
  const missingFields = allFields.filter(f => !existingOrder.includes(f));
  const base = DEFAULT_PRECISION_CONFIG;

  return {
    brand: mergeLabelField(config.brand, base.brand),
    businessName: mergeLabelField(config.businessName, base.businessName),
    productName: mergeLabelField(config.productName, base.productName),
    category: mergeLabelField(config.category, base.category),
    color: mergeLabelField(config.color, base.color),
    style: mergeLabelField(config.style, base.style),
    size: mergeLabelField(config.size, base.size),
    price: mergeLabelField(config.price, base.price),
    mrp: mergeLabelField(config.mrp, base.mrp),
    saleDiscPercent: mergeLabelField(config.saleDiscPercent, base.saleDiscPercent!),
    qty: mergeLabelField(config.qty, base.qty),
    customText: mergeLabelField(config.customText, base.customText),
    barcode: mergeLabelField(config.barcode, base.barcode),
    barcodeText: mergeLabelField(config.barcodeText, base.barcodeText),
    billNumber: mergeLabelField(config.billNumber, base.billNumber),
    supplierCode: mergeLabelField(config.supplierCode, base.supplierCode),
    purchaseCode: mergeLabelField(config.purchaseCode, base.purchaseCode),
    supplierInvoiceNo: mergeLabelField(config.supplierInvoiceNo, base.supplierInvoiceNo!),
    fieldOrder: [...existingOrder, ...missingFields] as FieldKey[],
    barcodeHeight: config.barcodeHeight ?? base.barcodeHeight,
    barcodeWidth: config.barcodeWidth ?? base.barcodeWidth,
    customTextValue: config.customTextValue ?? base.customTextValue ?? '',
    customTextFields: migrateCustomTextFields(config),
    lines: config.lines ?? base.lines ?? [],
    // Pass through only when already set — never invent a style for existing presets.
    ...(config.labelStyle ? { labelStyle: config.labelStyle } : {}),
  };
};
