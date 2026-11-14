import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";

import { useLocation, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import JsBarcode from "jsbarcode";
import { Check, Save, Trash2, Download, RefreshCw, Edit, Printer, Plus, Loader2, ChevronDown, ChevronLeft, Search, Package, History, Maximize2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  encodePurchasePriceForLabel,
  normalizePurchaseBillDate,
  resolveLabelPurchaseBillDate,
  resolvePurchaseCodeAlphabet,
  resolvePurchaseCodeGstPer,
  resolvePurchaseCodeDiscount,
  type PurchaseCodeDiscount,
  resolvePurchaseCodeIncludeDate,
} from "@/utils/purchaseCodeEncoder";
import { generateA4LabelPdf } from '@/utils/a4LabelPdf';
import {
  computeA4SheetMargins,
  novaJetBrandFromSheetType,
  resolveA4LayoutGap,
  resolveA4LabelWidthMm,
} from '@/utils/a4SheetLayout';
import {
  findMatchingA4SheetType,
  resolveStandardSheetTypeForLabelDimensions,
  resolveTemplateLabelDimensions,
  sheetPresetDimensions,
} from "@/utils/labelTemplateDimensions";
import {
  buildPrecisionLabelDocument,
  buildStandardLabelDocument,
  printBarcodeViaDesktop,
} from '@/utils/barcodeDesktopPrint';
import {
  ensureLabelNarrowFontLoaded,
  LABEL_NARROW_FONT_FACE_CSS,
  LABEL_NARROW_FONT_FAMILY,
  previewFontFamilyStyle,
} from '@/utils/labelFontFace';
import { isElectron } from "@/utils/appPrint";
import {
  assertPrintTargetSafe,
  printHtmlLooksLikeLeakedCss,
  PrintPreflightError,
} from "@/utils/printOutputPreflight";
import {
  resolveBarcodePrintTab,
  thermalLandingFromDefaultPrintTab,
  type BarcodeDefaultPrintTabSetting,
  type ResolveBarcodePrintTabInput,
} from "@/utils/resolveBarcodePrintTab";
import { isStandardA4SheetType } from "@/utils/standardA4SheetType";
import { isValidStandardSheetType } from "@/constants/standardSheetTypeOptions";
import {
  findDefaultPresetForMode,
  getPrecisionPrintModeDisplayName,
  getPrecisionThermalCols,
  getPrecisionThermalModeLabel,
  inferPrecisionPrintMode,
  isPrecisionThermalMultiUp,
  isPrecisionThermalSheetMode,
  isPrecisionFootwearMode,
  presetMatchesPrintMode,
  printModeToThermalCols,
  shouldApplyPurchaseLanding,
  type PrecisionPrintMode,
} from "@/utils/precisionThermalModes";
import {
  applyPrintModeDecision,
  printModeWriteAllowed,
  resolveLockedPrintMode,
  thermalColsForPrintMode,
  type PrintModeLockReason,
  type UserPrintModeLock,
} from "@/utils/precisionPrintModeLock";
import {
  decidePrecisionAutoload,
  markPrecisionAutoload,
  nextBarcodeLoadAllMountSeq,
  normalizePrecisionPresetName,
  precisionAutoloadSettingsAlreadyInPlace,
} from "@/utils/precisionPresetAutoloadGuard";
import {
  labelDesignNamesMatch,
  normalizeLabelDesignName,
  preferSavedLabelConfig,
} from "@/utils/labelDesignPersist";
import {
  precisionLabelDesignHasUnsavedChanges,
  snapshotPrecisionDesign,
  syncBaselineLabelConfig,
} from "@/utils/precisionDesignBaseline";
import {
  barcodePrintSelectionNavKey,
  clearBarcodePrintSelection,
  clearBarcodePurchaseBillContext,
  clearBarcodePurchaseItems,
  consumeBarcodePurchaseItems,
  hasPendingBarcodePurchaseItems,
  peekBarcodePurchaseItems,
  persistBarcodePrintSelection,
  persistBarcodePurchaseBillContext,
  queueBarcodePurchaseItems,
  readBarcodePurchaseBillContext,
  readBarcodePrintSelection,
  purchaseBillIdForBarcodeBack,
  resolvePurchaseBillIdForBarcodeReturn,
  isBarcodePrintingPathname,
  shouldContinueBarcodePurchaseHydrate,
} from "@/utils/barcodePurchaseBillContext";
import {
  BARCODE_PRINT_PURCHASE_BILL_QUERY,
  barcodePrintingPathWithBill,
  fetchBarcodePrintItemsForBill,
  resolvePurchaseLabelIdentity,
} from "@/utils/barcodePurchaseBillItems";
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
import { useBarcodeLabelSettings, SizeSortOrder } from "@/hooks/useBarcodeLabelSettings";
import { BarTenderLabelDesigner } from "@/components/BarTenderLabelDesigner";
import { FootwearPanelDesigner } from "@/components/labels/FootwearPanelDesigner";
import { DirectPrintDialog } from "@/components/DirectPrintDialog";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { SettlementScanBadge } from "@/components/SettlementScanBadge";
import {
  fetchOpenScansByVariantIds,
  type OpenSettlementScanInfo,
} from "@/utils/stockSettlementScans";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useProductFieldSettings } from "@/hooks/useSettings";
import { entryPageShellClass } from "@/lib/entryPageLayout";
import { LabelFieldConfig, LabelDesignConfig, LabelItem, LabelTemplate, FieldKey } from "@/types/labelTypes";
import { PrecisionThermalPrint } from "@/components/precision-barcode/PrecisionThermalPrint";
import { PrecisionThermalRowPreview } from "@/components/precision-barcode/PrecisionThermalRowPreview";
import { PrecisionA4SheetPrint } from "@/components/precision-barcode/PrecisionA4SheetPrint";
import { PrecisionProTSCPreview } from "@/components/labels/PrecisionProTSCPreview";
import {
  loadFootwearDesignFromStorage,
  resolveFootwearFormDesign,
  saveFootwearDesignToStorage,
  footwearFormSizeMm,
  type FootwearFormDesign,
} from "@/utils/labels/precisionProFootwearDesign";

import { LabelCalibrationUI, type CalibrationPreset } from "@/components/precision-barcode/LabelCalibrationUI";
import { TestLabelPrint } from "@/components/precision-barcode/TestLabelPrint";
import { PrecisionPrintCSS } from "@/components/precision-barcode/PrecisionPrintCSS";
import { PrecisionLabelDesigner, DEFAULT_PRECISION_CONFIG } from "@/components/precision-barcode/PrecisionLabelDesigner";
import { PrinterPresetBackupDialog } from "@/components/precision-barcode/PrinterPresetBackupDialog";
import {
  getFixedBuiltinLabelDimensions,
  isFixedBuiltinLabelPreset,
  resolveFixedBuiltinLabelConfig,
} from "@/constants/fixedBuiltinLabelPresets";
import {
  isBoutiqueGridPresetName,
} from "@/constants/boutiqueGridLabelTemplate";
import {
  LABEL_STYLE_BOUTIQUE_GRID,
} from "@/types/labelTypes";
import {
  RANAWAT_BLING_TEMPLATE_NAME,
  isRanawatBlingPresetName,
} from "@/constants/ranawatBlingLabelTemplate";
import {
  RETAIL_NARROW_TEMPLATE_NAME,
  isRetailNarrowPresetName,
} from "@/constants/retailNarrowLabelTemplate";
import { upsertPrinterPresetRow } from "@/utils/printerPresetDbCompat";
import { fetchSaleDiscPercentBySkuId } from "@/utils/pricingSaleDiscPercentLookup";
import { formatDateDMY } from "@/lib/dateDisplay";
import {
  ensureCompleteFieldOrder,
  resolvePresetLabelConfig,
  sortItemsBySize,
} from "@/lib/barcode/barcodeLabelConfig";
import { exportLabelsPdf } from "@/lib/barcode/exportLabelsPdf";
import { renderLabelSheet } from "@/lib/barcode/renderLabelSheet";
import {
  fetchBillLineQuantities,
  findPurchaseBillIdByNumber,
  loadLabelItemsFromBill,
  quantityOnBill,
  type BillLineQuantities,
} from "@/lib/barcode/loadLabelItemsFromBill";
import { buildLabelHtml, hasAbsolutePositioning } from "@/lib/barcode/labelHtml";
import { searchLabelProducts, type LabelProductSearchResult } from "@/lib/barcode/searchLabelProducts";
import { BarcodeLabelListPanel } from "@/components/barcode/BarcodeLabelListPanel";
import { BarcodePrintFooter } from "@/components/barcode/BarcodePrintFooter";
import { builtInLabelTemplates, sheetPresetLabels, sheetPresets, type SheetType } from "@/lib/barcode/sheetPresets";
import { refreshOrgSettingsCache } from "@/hooks/useSettings";
import { useQueryClient } from "@tanstack/react-query";
import {
  clearDefaultPrinterPresetsForMode,
  deletePrinterPreset,
  fetchPrinterPresetByName,
  fetchPrinterPresets,
  markPrinterPresetDefault,
} from "@/lib/data/printerPresets";

const precisionPresetStorageKey = (orgId: string) => `precision_active_preset_${orgId}`;

/** Same ceiling as mobile PDF share — recover from hung fetches without a full reload. */
const BARCODE_SETTINGS_LOAD_TIMEOUT_MS = 8_000;

type SearchResult = LabelProductSearchResult;

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

type DesignFormat = "BT1" | "BT2" | "BT3" | "BT4";
type QuantityMode = "manual" | "lastPurchase" | "byBill";

export default function BarcodePrinting() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const purchaseBillIdParam = searchParams.get(BARCODE_PRINT_PURCHASE_BILL_QUERY);
  const routeRequestedTab = useMemo<"standard" | "precision" | null>(() => {
    const tab = (location.state as any)?.openTab;
    if (tab === "standard" || tab === "precision") return tab;
    return null;
  }, [location.state]);
  const { orgNavigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const productFieldSettings = useProductFieldSettings();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [openSettlementScans, setOpenSettlementScans] = useState<Map<string, OpenSettlementScanInfo>>(
    () => new Map(),
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Do not hydrate prior products when Print Barcode just navigated here —
  // otherwise tab-cache/localStorage old rows merge with the new bill items.
  const [labelItems, setLabelItems] = useState<LabelItem[]>(() => {
    try {
      if (hasPendingBarcodePurchaseItems()) return [];
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get(BARCODE_PRINT_PURCHASE_BILL_QUERY)) return [];
      }
      const saved = localStorage.getItem('barcode_label_items');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [labelSourceOpen, setLabelSourceOpen] = useState(false);
  const [layoutStyleOpen, setLayoutStyleOpen] = useState(false);
  const [marginSectionOpen, setMarginSectionOpen] = useState(false);
  const [quantityMode, setQuantityMode] = useState<QuantityMode>("manual");
  const [sizeSortOrder, setSizeSortOrder] = useState<SizeSortOrder>("barcode_asc");
  const [billNumber, setBillNumber] = useState("");
  const [sourcePurchaseBillId, setSourcePurchaseBillId] = useState<string | null>(null);
  const sourcePurchaseBillIdRef = useRef<string | null>(null);
  const appliedPurchaseNavKeyRef = useRef<string | null>(null);
  /** Back already opened the purchase bill — do not navigate back here. */
  const userLeftForPurchaseBillRef = useRef(false);
  const labelItemsCountRef = useRef(0);
  useEffect(() => {
    labelItemsCountRef.current = labelItems.length;
  }, [labelItems.length]);
  const printModeLockRef = useRef<UserPrintModeLock>(null);
  useEffect(() => {
    sourcePurchaseBillIdRef.current = sourcePurchaseBillId;
  }, [sourcePurchaseBillId]);
  const [fromPurchaseBill, setFromPurchaseBill] = useState(false);
  const [isNavigatingToPurchaseBill, setIsNavigatingToPurchaseBill] = useState(false);
  const [recentBills, setRecentBills] = useState<RecentBill[]>([]);
  const [sheetType, setSheetType] = useState<SheetType>("novajet48");
  const [designFormat, setDesignFormat] = useState<DesignFormat>("BT1");
  const [topOffset, setTopOffset] = useState(0);
  const [leftOffset, setLeftOffset] = useState(0);
  // Start Label Position (Standard A4 only) — skips already-used slots on a
  // partially-used sheet. 1 = normal behavior. Ephemeral, not persisted.
  const [startPosition, setStartPosition] = useState(1);
  const [bottomOffset, setBottomOffset] = useState(0);
  const [rightOffset, setRightOffset] = useState(0);
  const [businessName, setBusinessName] = useState("SMART INVENTORY");
  const [printScale, setPrintScale] = useState(100);
  
  // Auto-load calibrated page offsets when switching sheet type
  useEffect(() => {
    const preset = sheetPresets[sheetType] as {
      defaultTop?: number;
      defaultLeft?: number;
      defaultBottom?: number;
      defaultRight?: number;
      width?: string;
      height?: string;
      cols?: number;
      rows?: number;
      gap?: string;
    };
    if (preset?.defaultTop !== undefined) setTopOffset(preset.defaultTop);
    if (preset?.defaultLeft !== undefined) setLeftOffset(preset.defaultLeft);
    if (preset?.defaultBottom !== undefined) setBottomOffset(preset.defaultBottom);
    if (preset?.defaultRight !== undefined) setRightOffset(preset.defaultRight);

    // Keep Precision Pro dimensions aligned with standard A4 sheet presets —
    // never after the user locked a thermal n-up mode.
    if (!printModeWriteAllowed(printModeLockRef.current, "sheet-type")) return;
    if (sheetType === 'a4_12x4' || sheetType === 'novajet48') {
      setPrecisionSettings((prev) => ({
        ...prev,
        labelWidth: 48,
        labelHeight: 24,
        a4Cols: 4,
        a4Rows: 12,
        vGap: 0,
        hGap: 0,
      }));
    } else if (
      sheetType === 'novajet40' ||
      sheetType === 'a4_40sheet' ||
      sheetType === 'a4_39x35_40sheet'
    ) {
      setPrecisionSettings((prev) => ({
        ...prev,
        labelWidth: 39,
        labelHeight: 35,
        a4Cols: 5,
        a4Rows: 8,
        vGap: 0,
        hGap: 0,
      }));
    }
  }, [sheetType]);
  
  // Custom dimensions state
  const [customWidth, setCustomWidth] = useState(50);
  const [customHeight, setCustomHeight] = useState(25);
  const [customCols, setCustomCols] = useState(4);
  const [customRows, setCustomRows] = useState(12);
  // Die-cut A4 sheets are usually gap 0; default 2 made 48×24 presets look misaligned.
  const [customGap, setCustomGap] = useState(0);
  
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
    saleDiscPercent: { show: false, fontSize: 7, bold: false, x: 25, y: 12, width: 50 },
    qty: { show: false, fontSize: 7, bold: false, x: 25, y: 12, width: 20 },
    customText: { show: false, fontSize: 8, bold: false, x: 25, y: 12, width: 50 },
    barcode: { show: true, fontSize: 8, bold: false, x: 0, y: 16, width: 100 },
    barcodeText: { show: true, fontSize: 7, bold: false, x: 0, y: 24, width: 100 },
    billNumber: { show: false, fontSize: 6, bold: false, x: 0, y: 31, width: 100 },
    supplierCode: { show: true, fontSize: 7, bold: false, x: 0, y: 28, width: 50 },
    purchaseCode: { show: false, fontSize: 7, bold: false, x: 25, y: 28, width: 50 },
    fieldOrder: ['businessName', 'brand', 'productName', 'category', 'size', 'price', 'mrp', 'saleDiscPercent', 'qty', 'customText', 'barcode', 'barcodeText', 'supplierCode', 'purchaseCode', 'billNumber', 'color', 'style'],
  });

  // Label template state
  const [savedLabelTemplates, setSavedLabelTemplates] = useState<LabelTemplate[]>([]);
  const savedLabelTemplatesRef = useRef(savedLabelTemplates);
  savedLabelTemplatesRef.current = savedLabelTemplates;
  const [selectedLabelTemplate, setSelectedLabelTemplate] = useState<string>("");
  const selectedLabelTemplateRef = useRef(selectedLabelTemplate);
  selectedLabelTemplateRef.current = selectedLabelTemplate;
  const [isLabelTemplateSaveDialogOpen, setIsLabelTemplateSaveDialogOpen] = useState(false);
  const [newLabelTemplateName, setNewLabelTemplateName] = useState("");
  const [isEditingLabelTemplate, setIsEditingLabelTemplate] = useState(false);
  const [showCustomizeFields, setShowCustomizeFields] = useState(true);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [precisionPrintConfirmOpen, setPrecisionPrintConfirmOpen] = useState(false);
  const [precisionPrintConfirmQty, setPrecisionPrintConfirmQty] = useState(0);
  const [isPrecisionPrintRunning, setIsPrecisionPrintRunning] = useState(false);
  const [modeSwitchConfirmOpen, setModeSwitchConfirmOpen] = useState(false);
  const pendingPrintModeSwitchRef = useRef<PrecisionPrintMode | null>(null);
  const precisionDesignBaselineRef = useRef(
    snapshotPrecisionDesign(
      {
        xOffset: 0,
        yOffset: 0,
        vGap: 2,
        hGap: 0,
        labelWidth: 50,
        labelHeight: 25,
        a4Cols: 4,
        a4Rows: 12,
        thermalCols: 1,
        printMode: "thermal",
        labelConfig: null,
      },
      null,
    ),
  );
  const precisionPrintOkRef = useRef<HTMLButtonElement>(null);
  const [purchaseCodeAlphabet, setPurchaseCodeAlphabet] = useState("ABCDEFGHIK");
  const [showPurchaseCode, setShowPurchaseCode] = useState(false);
  /** Settings > Purchase "MRP" field (purchase_settings.show_mrp). Off → hide MRP column in the item list. */
  const [showMrpColumn, setShowMrpColumn] = useState(true);
  const [purchaseCodeIncludeGst, setPurchaseCodeIncludeGst] = useState(false);
  const [purchaseCodeIncludeDate, setPurchaseCodeIncludeDate] = useState(true);
  const [purchaseCodeExtraPercentEnabled, setPurchaseCodeExtraPercentEnabled] = useState(false);
  const [purchaseCodeExtraPercent, setPurchaseCodeExtraPercent] = useState(10);
  const [defaultUom, setDefaultUom] = useState("NOS");
  const [isDirectPrintDialogOpen, setIsDirectPrintDialogOpen] = useState(false);
  const [showFullscreenDesigner, setShowFullscreenDesigner] = useState(false);
  const [precisionSettings, setPrecisionSettings] = useState({
    enabled: false,
    xOffset: 0,
    yOffset: 0,
    vGap: 2,
    hGap: 0,
    labelWidth: 50,
    labelHeight: 25,
    a4Cols: 4,
    a4Rows: 12,
    printMode: 'thermal' as PrecisionPrintMode,
    labelConfig: null as any,
    thermalCols: 1,
  });
  const precisionSettingsRef = useRef(precisionSettings);
  precisionSettingsRef.current = precisionSettings;
  const [footwearDesign, setFootwearDesign] = useState<FootwearFormDesign>(() =>
    resolveFootwearFormDesign(null),
  );
  const [dbPresets, setDbPresets] = useState<CalibrationPreset[]>([]);
  const designerPresetsForMode = useMemo(
    () =>
      dbPresets.filter(
        (p) => p.labelConfig && presetMatchesPrintMode(p, precisionSettings.printMode),
      ),
    [dbPresets, precisionSettings.printMode],
  );
  const defaultPresetNameForMode = useMemo(
    () => findDefaultPresetForMode(dbPresets, precisionSettings.printMode)?.name ?? null,
    [dbPresets, precisionSettings.printMode],
  );
  const noDefaultForModeHint = useMemo(() => {
    if (isPrecisionFootwearMode(precisionSettings.printMode)) return null;
    if (findDefaultPresetForMode(dbPresets, precisionSettings.printMode)) return null;
    return `No default set for ${getPrecisionPrintModeDisplayName(precisionSettings.printMode)}. Save a design and click Set Default.`;
  }, [dbPresets, precisionSettings.printMode]);
  const showDesignerLabelTemplates =
    precisionSettings.printMode === "thermal" || precisionSettings.printMode === "a4";
  const [backupRestoreOpen, setBackupRestoreOpen] = useState(false);
  const [precisionConfigReady, setPrecisionConfigReady] = useState(false);
  const precisionPrintRef = useRef<HTMLDivElement>(null);
  const testPrintRef = useRef<HTMLDivElement>(null);
  const [testPrintActive, setTestPrintActive] = useState(false);
  /**
   * Gates the persistent `<style>` block that contains an `@page` rule for
   * standard-mode label printing. The block must only be present in the DOM
   * while a label print job is actually running — otherwise the `@page size`
   * leaks into other print jobs (e.g. thermal receipts via react-to-print),
   * which causes the invoice preview to shrink to the label page size.
   */
  const [printPageActive, setPrintPageActive] = useState(false);
  useEffect(() => {
    const handleAfterPrint = () => setPrintPageActive(false);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);
  const [activeBarTab, setActiveBarTab] = useState<string>("standard");
  const [settingsDefaultBarTab, setSettingsDefaultBarTab] =
    useState<BarcodeDefaultPrintTabSetting>("auto");
  /** From bill_barcode_settings — not overwritten when user toggles tabs */
  const [precisionProEnabledFromSettings, setPrecisionProEnabledFromSettings] = useState(false);
  const [activePrecisionTemplateName, setActivePrecisionTemplateNameRaw] = useState<string | null>(null);
  const activePrecisionTemplateNameRef = useRef<string | null>(activePrecisionTemplateName);
  useEffect(() => {
    activePrecisionTemplateNameRef.current = activePrecisionTemplateName;
  }, [activePrecisionTemplateName]);
  const setActivePrecisionTemplateName = useCallback((name: string | null) => {
    activePrecisionTemplateNameRef.current = name;
    setActivePrecisionTemplateNameRaw(name);
    if (!currentOrganization?.id) return;
    if (name) {
      try {
        markPrecisionAutoload({
          orgId: currentOrganization.id,
          presetName: name,
          storage: typeof sessionStorage !== "undefined" ? sessionStorage : null,
        });
      } catch {}
    }
    try {
      const key = precisionPresetStorageKey(currentOrganization.id);
      if (name) localStorage.setItem(key, name);
      else localStorage.removeItem(key);
      localStorage.removeItem("precision_active_preset");
    } catch {}
  }, [currentOrganization?.id]);

  useEffect(() => {
    const orgId = currentOrganization?.id;
    setFootwearDesign(loadFootwearDesignFromStorage(orgId));
    if (!orgId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("barcode_label_settings")
        .select("setting_data")
        .eq("organization_id", orgId)
        .eq("setting_type", "footwear_design")
        .eq("setting_name", "default")
        .maybeSingle();
      if (cancelled || !data?.setting_data) return;
      const resolved = resolveFootwearFormDesign(data.setting_data as any);
      setFootwearDesign(resolved);
      saveFootwearDesignToStorage(orgId, resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentOrganization?.id]);

  const [savingFootwearDesign, setSavingFootwearDesign] = useState(false);
  const handleFootwearDesignSave = useCallback(
    async (design: FootwearFormDesign) => {
      const orgId = currentOrganization?.id;
      if (!orgId) {
        toast.error("No organization selected");
        return;
      }
      const resolved = resolveFootwearFormDesign(design);
      setSavingFootwearDesign(true);
      try {
        const { error } = await supabase
          .from("barcode_label_settings")
          .upsert(
            {
              organization_id: orgId,
              setting_type: "footwear_design",
              setting_name: "default",
              setting_data: resolved as any,
            } as any,
            { onConflict: "organization_id,setting_type,setting_name" },
          );
        if (error) throw error;
        setFootwearDesign(resolved);
        saveFootwearDesignToStorage(orgId, resolved);
        toast.success("Footwear label design saved");
      } catch (err) {
        console.error("Failed to save footwear design:", err);
        toast.error("Failed to save footwear design");
      } finally {
        setSavingFootwearDesign(false);
      }
    },
    [currentOrganization?.id],
  );

  const handleFootwearDesignChange = useCallback(
    (design: FootwearFormDesign) => {
      const resolved = resolveFootwearFormDesign(design);
      setFootwearDesign(resolved);
      saveFootwearDesignToStorage(currentOrganization?.id, resolved);
    },
    [currentOrganization?.id],
  );

  const activePrecisionTemplateBaseName = activePrecisionTemplateName?.replace(/^preset:/, "") ?? null;
  const activePrecisionTemplateBaseNameRef = useRef(activePrecisionTemplateBaseName);
  activePrecisionTemplateBaseNameRef.current = activePrecisionTemplateBaseName;

  /** Latest Standard-tab design — auto-save must read this, not a stale Precision copy. */
  const labelConfigRef = useRef(labelConfig);
  labelConfigRef.current = labelConfig;

  /**
   * Standard-tab designer writes `labelConfig`. Loading a template also mirrors it into
   * Precision (`precisionSettings.labelConfig`) and enables Precision auto-save.
   * Keep both copies in sync so field toggles / Update aren't overwritten by a stale
   * Precision auto-save of the old show/hide flags.
   */
  const setStandardLabelConfig = useCallback<React.Dispatch<React.SetStateAction<LabelDesignConfig>>>(
    (update) => {
      setLabelConfig((prev) => {
        const next = typeof update === "function" ? (update as (p: LabelDesignConfig) => LabelDesignConfig)(prev) : update;
        labelConfigRef.current = next;
        const selected = selectedLabelTemplateRef.current;
        const precisionBase = activePrecisionTemplateBaseNameRef.current;
        // Mirror into Precision when targets share a name. Microtask avoids setState-during-render.
        // Safe on Standard tab because Precision auto-save is disabled there.
        if (selected && precisionBase && selected === precisionBase) {
          queueMicrotask(() => {
            setPrecisionSettings((p) => {
              if (p.labelConfig === next) return p;
              return { ...p, labelConfig: next };
            });
          });
        }
        return next;
      });
    },
    [],
  );

  /**
   * Label Designer edits. When the Standard tab has the same template selected,
   * keep its copy in sync too, so Standard "Update" can't write back a stale layout.
   */
  const handlePrecisionDesignerConfigChange = useCallback((cfg: LabelDesignConfig) => {
    setPrecisionSettings((prev) => ({ ...prev, labelConfig: cfg }));
    const selected = selectedLabelTemplateRef.current;
    const precisionBase = activePrecisionTemplateBaseNameRef.current;
    if (selected && precisionBase && labelDesignNamesMatch(selected, precisionBase)) {
      labelConfigRef.current = cfg;
      setLabelConfig(cfg);
    }
  }, []);

  /** Kids Zone / Jewellery use a hard-coded layout; other presets use saved DB config. */
  const effectivePrecisionLabelConfig = useMemo((): LabelDesignConfig => {
    const fixed = resolveFixedBuiltinLabelConfig(activePrecisionTemplateBaseName);
    if (fixed) return fixed;
    const cfg = precisionSettings.labelConfig || DEFAULT_PRECISION_CONFIG;
    // Boutique is editable (not locked), but keep KEY:VALUE renderer while that preset is active.
    if (isBoutiqueGridPresetName(activePrecisionTemplateBaseName)) {
      return { ...cfg, labelStyle: LABEL_STYLE_BOUTIQUE_GRID };
    }
    return cfg;
  }, [activePrecisionTemplateBaseName, precisionSettings.labelConfig]);

  const effectivePrecisionLabelWidth = useMemo(
    () =>
      getFixedBuiltinLabelDimensions(activePrecisionTemplateBaseName)?.width
        ?? precisionSettings.labelWidth,
    [activePrecisionTemplateBaseName, precisionSettings.labelWidth],
  );

  const effectivePrecisionLabelHeight = useMemo(
    () =>
      getFixedBuiltinLabelDimensions(activePrecisionTemplateBaseName)?.height
        ?? precisionSettings.labelHeight,
    [activePrecisionTemplateBaseName, precisionSettings.labelHeight],
  );

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dedupe guard: skip printer_presets/templates writes when signature unchanged.
  // Prevents the auto-save effects from re-persisting identical config on every
  // mount, route change or render — which was driving ~1.6M printer_presets
  // UPDATEs and dominating DB CPU on the small instance.
  const lastPersistedSignatureRef = useRef<string>("");
  // Tracks whether we've resolved the initial default tab for the current org.
  // Resolution is "Auto": prefer Standard if a saved A4 sheet default exists,
  // otherwise prefer Precision Pro (thermal/barcode printer workflow).
  const hasResolvedDefaultTabRef = useRef(false);

  const takePrintModeWrite = (requestedMode: PrecisionPrintMode, reason: PrintModeLockReason) => {
    const decision = applyPrintModeDecision({
      lock: printModeLockRef.current,
      reason,
      requestedMode,
    });
    printModeLockRef.current = decision.lock;
    return decision;
  };

  const lockedPrintLayout = () =>
    resolveLockedPrintMode(
      printModeLockRef.current,
      precisionSettings.printMode,
      precisionSettings.thermalCols,
    );
  // Settings → Bill & Barcode → Default Sheet Type (Standard Printing)
  const settingsStandardSheetTypeRef = useRef<string | null>(null);
  const hasAppliedSettingsSheetTypeRef = useRef(false);
  const [settingsStandardSheetType, setSettingsStandardSheetType] = useState<string | null>(null);
  // Helper function to check if a template is the current default
  const getDefaultTemplateName = (): string | null => {
    return (dbDefaultFormat as any)?.defaultTemplate || null;
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
  const settingsOrgLoadedRef = useRef<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsLoadStale, setSettingsLoadStale] = useState(false);
  const [settingsLoadRetryToken, setSettingsLoadRetryToken] = useState(0);

  const retryBarcodeSettingsLoad = useCallback(() => {
    settingsOrgLoadedRef.current = null;
    settingsFullyLoadedRef.current = false;
    setSettingsLoadStale(false);
    setSettingsLoading(true);
    setSettingsLoadRetryToken((n) => n + 1);
  }, []);

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
    void refreshOrgSettingsCache(queryClient, orgId);
  }, [queryClient]);

  // Auto-save precision label config changes to active template/preset (debounced)
  const autoSavePrecisionConfig = useCallback(async (
    targetName: string,
    labelConfig: LabelDesignConfig,
    labelWidth: number,
    labelHeight: number,
    orgId: string,
    opts?: { force?: boolean },
  ) => {
    const configToSave = isFixedBuiltinLabelPreset(targetName)
      ? resolveFixedBuiltinLabelConfig(targetName.replace(/^preset:/, ""))!
      : { ...labelConfig };
    const cleanName = targetName.startsWith("preset:")
      ? targetName.replace("preset:", "")
      : targetName;
    const fixedDims = getFixedBuiltinLabelDimensions(cleanName);
    const saveWidth = fixedDims?.width ?? labelWidth;
    const saveHeight = fixedDims?.height ?? labelHeight;

    // Skip the write entirely when nothing material has changed since the last
    // persist. Without this the auto-save effects re-write printer_presets on
    // every mount/route-change/render — millions of identical UPDATEs per day.
    let signature = "";
    try {
      signature = `${orgId}|${cleanName}|${saveWidth}|${saveHeight}|${JSON.stringify(configToSave)}`;
    } catch {
      signature = `${orgId}|${cleanName}|${saveWidth}|${saveHeight}`;
    }
    if (!opts?.force && lastPersistedSignatureRef.current === signature) {
      return true;
    }

    try {
      const updatedTemplate: LabelTemplate = {
        name: cleanName,
        config: configToSave,
        labelWidth: saveWidth,
        labelHeight: saveHeight,
      };
      const templateSaved = await saveTemplateToDb(updatedTemplate);
      if (!templateSaved) throw new Error("Failed to sync label template");

      setDbPresets(prev => prev.map(p =>
        labelDesignNamesMatch(p.name, cleanName)
          ? { ...p, labelConfig: configToSave, width: saveWidth, height: saveHeight }
          : p
      ));

      lastPersistedSignatureRef.current = signature;
      return true;
    } catch (error) {
      console.error("Failed to auto-save precision design:", error);
      return false;
    }
  }, [saveTemplateToDb]);

  const markLabelDesignBaselineSaved = useCallback(
    (labelConfig: LabelDesignConfig | null, presetName?: string | null) => {
      const baseName =
        (presetName ?? activePrecisionTemplateName)?.replace(/^preset:/, "") ?? null;
      if (!baseName) return;
      precisionDesignBaselineRef.current = syncBaselineLabelConfig(
        precisionDesignBaselineRef.current,
        baseName,
        labelConfig,
      );
    },
    [activePrecisionTemplateName],
  );

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
      const fixedConfig = resolveFixedBuiltinLabelConfig(templateName);
      const fixedDims = getFixedBuiltinLabelDimensions(templateName);
      if (fixedConfig && fixedDims) {
        hasLoadedPrecisionConfigRef.current = true;
        setPrecisionSettings(prev => ({
          ...prev,
          labelConfig: fixedConfig,
          labelWidth: fixedDims.width,
          labelHeight: fixedDims.height,
        }));
      } else {
        const freshTemplate = dbLabelTemplates.find((t: LabelTemplate) =>
          labelDesignNamesMatch(t.name, templateName),
        );
        const freshPreset = dbPresets.find((p) => labelDesignNamesMatch(p.name, templateName));
        const storedConfig = preferSavedLabelConfig(freshTemplate?.config, freshPreset?.labelConfig);
        if (storedConfig) {
          hasLoadedPrecisionConfigRef.current = true;
          const migratedConfig = resolvePresetLabelConfig(templateName, storedConfig);
          const templateDims = freshTemplate
            ? resolveTemplateLabelDimensions(freshTemplate)
            : freshPreset
              ? { width: freshPreset.width, height: freshPreset.height }
              : null;
          setPrecisionSettings(prev => ({
            ...prev,
            labelConfig: migratedConfig,
            ...(templateDims ? { labelWidth: templateDims.width, labelHeight: templateDims.height } : {}),
          }));
        }
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
          const migratedConfig = resolvePresetLabelConfig(template.name, template.config);
          const configWithBarcode = {
            ...migratedConfig,
            barcode: { ...migratedConfig.barcode, show: true },
            barcodeText: { ...migratedConfig.barcodeText, show: true },
          };
          setLabelConfig(configWithBarcode);
          labelConfigRef.current = configWithBarcode;
          setSelectedLabelTemplate(template.name);
          // Keep Precision mirror on the same template so toggles/Update stay in sync.
          setActivePrecisionTemplateName(template.name);
          const defaultTemplateDims = resolveTemplateLabelDimensions(template);
          setPrecisionSettings((prev) => ({
            ...prev,
            labelConfig: configWithBarcode,
            ...(defaultTemplateDims
              ? {
                  labelWidth: defaultTemplateDims.width,
                  labelHeight: defaultTemplateDims.height,
                }
              : {}),
          }));
          const templateDims = resolveTemplateLabelDimensions(template);
          if (templateDims) {
            const savedDims = defaultFormat.sheetType
              ? sheetPresetDimensions(sheetPresets, String(defaultFormat.sheetType))
              : null;
            const dimsMismatch =
              !savedDims ||
              Math.abs(savedDims.width - templateDims.width) >= 0.5 ||
              Math.abs(savedDims.height - templateDims.height) >= 0.5;
            if (dimsMismatch) {
              const resolved = resolveStandardSheetTypeForLabelDimensions(
                templateDims.width,
                templateDims.height,
                sheetPresets,
              );
              if (resolved.custom) {
                setSheetType("custom");
                setCustomWidth(resolved.custom.width);
                setCustomHeight(resolved.custom.height);
                setCustomCols(resolved.custom.cols);
                setCustomRows(resolved.custom.rows);
                setCustomGap(resolved.custom.gap);
                setSelectedPreset("");
              } else {
                setSheetType(resolved.sheetType as SheetType);
                setSelectedPreset("");
              }
            }
          }
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
      if (defaultFormat.sheetType && !settingsStandardSheetTypeRef.current) {
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
      // Default Sheet Margin Preset (set from the Standard tab) wins over raw offsets
      if (defaultFormat.defaultMarginPreset) {
        const marginPreset = dbMarginPresets.find(
          (p: MarginPreset) => p.name === defaultFormat.defaultMarginPreset,
        );
        if (marginPreset) {
          setTopOffset(marginPreset.topOffset);
          setLeftOffset(marginPreset.leftOffset);
          setBottomOffset(marginPreset.bottomOffset);
          setRightOffset(marginPreset.rightOffset);
          setSelectedMarginPreset(marginPreset.name);
        }
      }
      if (defaultFormat.printScale !== undefined) {
        setPrintScale(defaultFormat.printScale);
      }
      // Prefer the live sheet_preset row over a stale default_format.customDimensions
      // snapshot — Update writes the named preset; reload must not revert those edits.
      if (defaultFormat.sheetType === "custom") {
        const livePreset = defaultFormat.customPresetName
          ? dbCustomPresets.find((p: CustomPreset) => p.name === defaultFormat.customPresetName)
          : undefined;
        if (livePreset) {
          setCustomWidth(livePreset.width);
          setCustomHeight(livePreset.height);
          setCustomCols(livePreset.cols);
          setCustomRows(livePreset.rows || 10);
          setCustomGap(livePreset.gap);
          setPrintScale(livePreset.scale || defaultFormat.printScale || 100);
          setSelectedPreset(livePreset.name);
        } else if (defaultFormat.customDimensions) {
          setCustomWidth(defaultFormat.customDimensions.width);
          setCustomHeight(defaultFormat.customDimensions.height);
          setCustomCols(defaultFormat.customDimensions.cols);
          setCustomRows(defaultFormat.customDimensions.rows || 10);
          setCustomGap(defaultFormat.customDimensions.gap);
          if (defaultFormat.customDimensions.scale) {
            setPrintScale(defaultFormat.customDimensions.scale);
          }
          if (defaultFormat.customPresetName) {
            setSelectedPreset(defaultFormat.customPresetName);
          }
        } else if (defaultFormat.customPresetName) {
          setSelectedPreset(defaultFormat.customPresetName);
        }
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

  // Settings → Bill & Barcode → "Default Sheet Type (Standard Printing)":
  // auto-select that sheet type + layout when the page opens.
  useEffect(() => {
    if (isLoadingSettings) return;
    if (hasAppliedSettingsSheetTypeRef.current) return;
    const configured = settingsStandardSheetType;
    if (!isValidStandardSheetType(configured)) return;
    hasAppliedSettingsSheetTypeRef.current = true;
    if (configured.startsWith("preset_")) {
      const presetName = configured.slice("preset_".length);
      const preset = savedPresets.find((p) => p.name === presetName);
      if (!preset) {
        // presets may not be loaded yet — retry on next change
        hasAppliedSettingsSheetTypeRef.current = false;
        return;
      }
      setCustomWidth(preset.width);
      setCustomHeight(preset.height);
      setCustomCols(preset.cols);
      setCustomRows(preset.rows);
      setCustomGap(preset.gap);
      setPrintScale(preset.scale || 100);
      setSelectedPreset(preset.name);
      setSheetType("custom");
      return;
    }
    setSheetType(configured as SheetType);
    setSelectedPreset("");
  }, [isLoadingSettings, settingsStandardSheetType, savedPresets]);

  // Reset defaults ref when organization changes so defaults reload for new org
  useEffect(() => {
    hasLoadedDefaultsRef.current = false;
    hasLoadedPrecisionConfigRef.current = false;
    hasResolvedDefaultTabRef.current = false;
    appliedPurchaseLandingKeyRef.current = null;
    printModeLockRef.current = applyPrintModeDecision({
      lock: printModeLockRef.current,
      reason: "org-change",
      requestedMode: "thermal",
    }).lock;
    hasAppliedSettingsSheetTypeRef.current = false;
    settingsStandardSheetTypeRef.current = null;
    setSettingsStandardSheetType(null);
    setPrecisionConfigReady(false);
    settingsFullyLoadedRef.current = false;
    settingsOrgLoadedRef.current = null;
    setSettingsLoading(true);
    setSettingsLoadStale(false);
    setActivePrecisionTemplateNameRaw(null);
    if (!currentOrganization?.id) {
      activePrecisionTemplateNameRef.current = null;
      setSettingsLoading(false);
      return;
    }
    try {
      const saved = localStorage.getItem(precisionPresetStorageKey(currentOrganization.id));
      if (saved) {
        activePrecisionTemplateNameRef.current = saved;
        setActivePrecisionTemplateNameRaw(saved);
      } else {
        activePrecisionTemplateNameRef.current = null;
      }
    } catch {
      activePrecisionTemplateNameRef.current = null;
    }
  }, [currentOrganization?.id]);

  // Resolve barcode-printing tab from Settings (same rules as web app).
  // Re-resolve on every purchase navigation so Windows tab-cache does not stick
  // on the wrong tab from a prior visit.
  const purchaseNavKey = useMemo(() => {
    const st = location.state as { purchaseItems?: unknown[]; billId?: string } | null;
    if (st?.purchaseItems?.length) {
      const billId = st.billId ?? "";
      const count = st.purchaseItems.length;
      const firstSku = (st.purchaseItems[0] as { sku_id?: string })?.sku_id ?? "";
      return `${location.key}|${billId}|${count}|${firstSku}`;
    }
    if (purchaseBillIdParam) {
      return `query|${purchaseBillIdParam}|${location.key}`;
    }
    const queued = peekBarcodePurchaseItems();
    if (queued?.navKey) return queued.navKey;
    return null;
  }, [location.key, location.state, purchaseBillIdParam]);

  // Landing print mode + default preset configured in Settings → Barcode.
  // Kept in refs so a cached (tab-restored) page can re-apply them on a fresh
  // purchase navigation without re-running the one-time settings fetch.
  const configuredLandingModeRef = useRef<PrecisionPrintMode | null>(null);
  const defaultPrecisionPresetIdRef = useRef<string | null>(null);
  const appliedPurchaseLandingKeyRef = useRef<string | null>(null);
  const handlePrecisionPresetLoadRef = useRef<
    ((
      preset: CalibrationPreset,
      opts?: { keepPrintMode?: PrecisionPrintMode; reason?: PrintModeLockReason },
    ) => void) | null
  >(null);
  const executePrintModeSwitchRef = useRef<
    ((mode: PrecisionPrintMode, reason?: PrintModeLockReason) => void) | null
  >(null);

  useEffect(() => {
    if (settingsLoading || isLoadingSettings) return;
    if (!precisionConfigReady) return;

    const fromPurchase = !!purchaseNavKey;
    if (!fromPurchase && hasResolvedDefaultTabRef.current) return;
    // Never auto-override an explicit Label Designer selection — the resolver
    // only returns "standard"/"precision", so re-running on a purchase nav or
    // a settings refetch would silently kick the user out of the Designer tab.
    if (activeBarTab === "designer") {
      hasResolvedDefaultTabRef.current = true;
      return;
    }

    const resolved = resolveBarcodePrintTab({
      routeRequestedTab,
      settingsDefaultBarTab,
      precisionProEnabled: precisionProEnabledFromSettings,
      defaultFormat: dbDefaultFormat as ResolveBarcodePrintTabInput["defaultFormat"],
      presets: dbPresets,
    });

    hasResolvedDefaultTabRef.current = true;
    setActiveBarTab(resolved);
    setPrecisionSettings(prev =>
      prev.enabled === (resolved === "precision")
        ? prev
        : { ...prev, enabled: resolved === "precision" }
    );

    // Printing straight from the Purchase dashboard must land on the configured
    // Precision mode (e.g. Footwear Box+Pair) even when the page is restored from
    // the window-tab cache with a different mode left over from a prior visit.
    if (
      fromPurchase &&
      resolved === "precision" &&
      shouldApplyPurchaseLanding(appliedPurchaseLandingKeyRef.current, purchaseNavKey)
    ) {
      if (!settingsFullyLoadedRef.current) return;
      const landing = configuredLandingModeRef.current;
      appliedPurchaseLandingKeyRef.current = purchaseNavKey;
      if (landing) {
        const byId = defaultPrecisionPresetIdRef.current
          ? dbPresets.find((p) => p.id === defaultPrecisionPresetIdRef.current)
          : undefined;
        const target =
          byId && inferPrecisionPrintMode(byId) === landing
            ? byId
            : findDefaultPresetForMode(dbPresets, landing);
        if (target) {
          handlePrecisionPresetLoadRef.current?.(target, {
            keepPrintMode: landing,
            reason: "new-purchase-nav",
          });
        } else {
          executePrintModeSwitchRef.current?.(landing, "new-purchase-nav");
        }
      }
    }
  }, [
    settingsLoading,
    isLoadingSettings,
    precisionConfigReady,
    routeRequestedTab,
    dbDefaultFormat,
    dbPresets,
    precisionProEnabledFromSettings,
    settingsDefaultBarTab,
    purchaseNavKey,
  ]);

  // Push canonical fixed built-in layouts to DB whenever those presets are active.
  useEffect(() => {
    if (!activePrecisionTemplateName || !currentOrganization?.id) return;
    const fixedConfig = resolveFixedBuiltinLabelConfig(activePrecisionTemplateBaseName);
    const fixedDims = getFixedBuiltinLabelDimensions(activePrecisionTemplateBaseName);
    if (!fixedConfig || !fixedDims) return;
    void autoSavePrecisionConfig(
      activePrecisionTemplateName,
      fixedConfig,
      fixedDims.width,
      fixedDims.height,
      currentOrganization.id,
    );
  }, [activePrecisionTemplateName, activePrecisionTemplateBaseName, currentOrganization?.id, autoSavePrecisionConfig]);

  // Debounced auto-save for precision designer changes.
  // On Standard tab the explicit "Update" button owns persistence — auto-save here
  // was racing and writing a stale Precision copy over field toggles.
  useEffect(() => {
    if (activeBarTab === "standard") return;
    if (!activePrecisionTemplateName || !precisionSettings.labelConfig || !currentOrganization?.id) return;
    if (isFixedBuiltinLabelPreset(activePrecisionTemplateBaseName)) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    
    autoSaveTimerRef.current = setTimeout(() => {
      void (async () => {
        // This effect never runs on the Standard tab, so the Label Designer /
        // Precision copy is always the one being edited. Do not fall back to the
        // Standard-tab copy here: it still holds the config from when the
        // template was loaded and would overwrite the designer's Save.
        const cfg = precisionSettings.labelConfig;
        if (!cfg) return;
        const ok = await autoSavePrecisionConfig(
          activePrecisionTemplateName,
          cfg,
          precisionSettings.labelWidth,
          precisionSettings.labelHeight,
          currentOrganization.id,
        );
        if (ok) {
          markLabelDesignBaselineSaved(cfg, activePrecisionTemplateName);
        }
      })();
    }, 800);
    
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [precisionSettings.labelConfig, precisionSettings.labelWidth, precisionSettings.labelHeight, activePrecisionTemplateName, currentOrganization?.id, autoSavePrecisionConfig, markLabelDesignBaselineSaved, activeBarTab]);

  // Fetch business name from settings (organization-scoped) — once per org.
  useEffect(() => {
    const orgId = currentOrganization?.id;
    if (!orgId) return;
    if (settingsOrgLoadedRef.current === orgId) return;

    let resolvedPrintMode: PrecisionPrintMode = "thermal";
    let defaultPresetIdFromSettings: string | null = null;

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

        if (data) {
          setShowMrpColumn((data.purchase_settings as { show_mrp?: boolean } | null)?.show_mrp === true);
        }

        // Fetch purchase code settings
        if (data?.purchase_settings) {
          const purchaseSettings = data.purchase_settings as any;
          if (purchaseSettings.purchase_code_alphabet) {
            setPurchaseCodeAlphabet(
              resolvePurchaseCodeAlphabet(purchaseSettings.purchase_code_alphabet),
            );
          }
          if (purchaseSettings.default_uom) {
            setDefaultUom(purchaseSettings.default_uom);
          }
          if (purchaseSettings.show_purchase_code !== undefined) {
            // Flag for encoding only — never mutate label design field toggles here.
            setShowPurchaseCode(purchaseSettings.show_purchase_code);
          }
          if (purchaseSettings.purchase_code_include_gst !== undefined) {
            setPurchaseCodeIncludeGst(purchaseSettings.purchase_code_include_gst);
          }
          setPurchaseCodeIncludeDate(resolvePurchaseCodeIncludeDate(purchaseSettings));
          setPurchaseCodeExtraPercentEnabled(purchaseSettings.purchase_code_extra_percent_enabled === true);
          if (typeof purchaseSettings.purchase_code_extra_percent === "number") {
            setPurchaseCodeExtraPercent(purchaseSettings.purchase_code_extra_percent);
          }
        }

        // Load precision pro settings (use merge to avoid overwriting preset-loaded labelConfig)
        if (data?.bill_barcode_settings && typeof data.bill_barcode_settings === 'object') {
          const bbs = data.bill_barcode_settings as any;
          const rawTab = String(bbs.barcode_default_print_tab || "auto");
          const configuredDefaultTab: BarcodeDefaultPrintTabSetting =
            rawTab === "precision_1up" ||
            rawTab === "precision_2up" ||
            rawTab === "precision_3up" ||
            rawTab === "precision_footwear" ||
            rawTab === "precision" ||
            rawTab === "standard" ||
            rawTab === "auto"
              ? rawTab
              : "auto";
          setSettingsDefaultBarTab(configuredDefaultTab);
          setPrecisionProEnabledFromSettings(bbs.precision_pro_enabled === true);
          if (isValidStandardSheetType(bbs.default_standard_sheet_type)) {
            settingsStandardSheetTypeRef.current = bbs.default_standard_sheet_type;
            setSettingsStandardSheetType(bbs.default_standard_sheet_type);
          } else {
            settingsStandardSheetTypeRef.current = null;
            setSettingsStandardSheetType(null);
          }
          const fromTab = thermalLandingFromDefaultPrintTab(configuredDefaultTab);
          const landing = fromTab || bbs.default_thermal_landing || bbs.precision_print_mode;
          resolvedPrintMode =
            landing === "thermal2up" ||
            landing === "thermal3up" ||
            landing === "thermal" ||
            landing === "footwear"
              ? landing
              : "thermal";
          defaultPresetIdFromSettings =
            typeof bbs.default_precision_preset_id === "string" && bbs.default_precision_preset_id
              ? bbs.default_precision_preset_id
              : null;
          configuredLandingModeRef.current = resolvedPrintMode;
          defaultPrecisionPresetIdRef.current = defaultPresetIdFromSettings;
          const settingsMode = takePrintModeWrite(resolvedPrintMode, "settings-fetch");
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
            ...(settingsMode.accepted
              ? {
                  printMode: settingsMode.mode,
                  thermalCols: thermalColsForPrintMode(settingsMode.mode, prev.thermalCols),
                }
              : {}),
            // Only use settings labelConfig as fallback when NO active preset is selected.
            // Read the ref — the closured state is stale on remount (starts null).
            labelConfig: prev.labelConfig || (!normalizePrecisionPresetName(activePrecisionTemplateNameRef.current) ? (bbs.precision_label_config || null) : prev.labelConfig),
          }));
        }
      } catch (error) {
        console.error("Failed to fetch business name:", error);
      }
    };

    const fetchDbPresets = async () => {
      if (!currentOrganization?.id) return;
      try {
        const mapped = await fetchPrinterPresets(currentOrganization.id).catch(() => null);
        if (mapped) {
          setDbPresets(mapped);

          // Auto-load: localStorage → settings default design → is_default for landing mode
          // Read the ref, not the closured state — remount starts with null even when
          // the UI has already restored "PAYAL 102*53" from localStorage.
          const localStoragePresetName = normalizePrecisionPresetName(
            activePrecisionTemplateNameRef.current,
          );
          const settingsPreset = defaultPresetIdFromSettings
            ? mapped.find((p: { id?: string }) => p.id === defaultPresetIdFromSettings)
            : undefined;
          const presetToLoad = localStoragePresetName
            ? mapped.find((p: { name: string }) => labelDesignNamesMatch(p.name, localStoragePresetName))
            : settingsPreset || findDefaultPresetForMode(mapped, resolvedPrintMode);

          if (presetToLoad) {
            const matchingTemplate = savedLabelTemplatesRef.current.find((t) =>
              labelDesignNamesMatch(t.name, presetToLoad.name),
            );
            const fixedDims = getFixedBuiltinLabelDimensions(presetToLoad.name);
            const configSource = preferSavedLabelConfig(
              matchingTemplate?.config,
              presetToLoad.labelConfig,
            );
            const resolvedConfig = fixedDims || configSource
              ? resolvePresetLabelConfig(presetToLoad.name, configSource)
              : undefined;
            const loadedMode = inferPrecisionPrintMode(presetToLoad);
            const landing = resolvedPrintMode;
            const requestedMode =
              (landing === "thermal2up" || landing === "thermal3up") && loadedMode === "thermal"
                ? landing
                : loadedMode;
            const autoloadMode = takePrintModeWrite(requestedMode, "preset-autoload");
            const printMode = autoloadMode.accepted ? autoloadMode.mode : requestedMode;
            const incomingWidth = fixedDims?.width ?? presetToLoad.width;
            const incomingHeight = fixedDims?.height ?? presetToLoad.height;
            const live = precisionSettingsRef.current;
            const sessionStore = typeof sessionStorage !== "undefined" ? sessionStorage : null;
            const decision = decidePrecisionAutoload({
              orgId: currentOrganization.id,
              currentPresetName: localStoragePresetName,
              incomingPresetName: presetToLoad.name,
              settingsAlreadyInPlace: precisionAutoloadSettingsAlreadyInPlace(
                {
                  name: localStoragePresetName,
                  width: live.labelWidth,
                  height: live.labelHeight,
                  xOffset: live.xOffset,
                  yOffset: live.yOffset,
                },
                {
                  name: presetToLoad.name,
                  width: incomingWidth,
                  height: incomingHeight,
                  xOffset: presetToLoad.xOffset,
                  yOffset: presetToLoad.yOffset,
                },
              ),
              storage: sessionStore,
            });
            if (decision.apply) {
              setPrecisionSettings((prev) => {
                const next = {
                  ...prev,
                  xOffset: presetToLoad.xOffset,
                  yOffset: presetToLoad.yOffset,
                  vGap: presetToLoad.vGap,
                  hGap: presetToLoad.hGap ?? 0,
                  labelWidth: incomingWidth,
                  labelHeight: incomingHeight,
                  ...(presetToLoad.a4Cols ? { a4Cols: presetToLoad.a4Cols } : {}),
                  ...(presetToLoad.a4Rows ? { a4Rows: presetToLoad.a4Rows } : {}),
                  ...(autoloadMode.accepted
                    ? {
                        printMode,
                        thermalCols:
                          printModeToThermalCols(printMode) > 1
                            ? printModeToThermalCols(printMode)
                            : presetToLoad.thermalCols || 1,
                      }
                    : {}),
                  ...(resolvedConfig ? { labelConfig: resolvedConfig } : {}),
                  enabled: true,
                };
                precisionDesignBaselineRef.current = snapshotPrecisionDesign(next, presetToLoad.name);
                return next;
              });
            }
            if (decision.setActiveName) {
              setActivePrecisionTemplateName(presetToLoad.name);
            }
            if (decision.toast) {
              toast.success(
                `Auto-loaded preset "${presetToLoad.name}" (${presetToLoad.width}×${presetToLoad.height}mm, ${getPrecisionThermalModeLabel(printMode)})`,
              );
            }
            markPrecisionAutoload({
              orgId: currentOrganization.id,
              presetName: presetToLoad.name,
              storage: sessionStore,
            });
          }
        }
      } catch (error) {
        console.error("Failed to fetch printer presets:", error);
      }
    };

    settingsFullyLoadedRef.current = false;
    setSettingsLoading(true);
    setSettingsLoadStale(false);
    const loadAllMountN = nextBarcodeLoadAllMountSeq();
    console.info(`[BarcodePrinting] loadAll mount #${loadAllMountN} for org ${orgId}`);
    let cancelled = false;
    let loadSettled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled || loadSettled) return;
      console.warn(
        `[BarcodePrinting] settings load timed out after ${BARCODE_SETTINGS_LOAD_TIMEOUT_MS}ms (org ${orgId})`,
      );
      settingsFullyLoadedRef.current = false;
      setSettingsLoadStale(true);
      setSettingsLoading(false);
    }, BARCODE_SETTINGS_LOAD_TIMEOUT_MS);
    const loadAll = async () => {
      try {
        await fetchBusinessName();
        await fetchDbPresets();
        if (cancelled) return;
        loadSettled = true;
        window.clearTimeout(timeoutId);
        settingsFullyLoadedRef.current = true;
        settingsOrgLoadedRef.current = orgId;
        setSettingsLoadStale(false);
      } catch (error) {
        if (cancelled) return;
        loadSettled = true;
        window.clearTimeout(timeoutId);
        console.error("[BarcodePrinting] settings load failed:", error);
        settingsFullyLoadedRef.current = false;
        setSettingsLoadStale(true);
      } finally {
        if (!cancelled) {
          setSettingsLoading(false);
        }
      }
    };
    void loadAll();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [currentOrganization?.id, settingsLoadRetryToken]);

  const refreshDbPresetsFromServer = useCallback(async () => {
    if (!currentOrganization?.id) return;
    setDbPresets(await fetchPrinterPresets(currentOrganization.id));
  }, [currentOrganization?.id]);

  const clearDefaultPresetsForMode = useCallback(
    async (printMode: PrecisionPrintMode): Promise<boolean> => {
      if (!currentOrganization?.id) return false;
      try {
        await clearDefaultPrinterPresetsForMode(currentOrganization.id, printMode);
        return true;
      } catch (err) {
        console.error("Failed to clear default presets:", err);
        toast.error((err as { message?: string })?.message || "Failed to set default");
        return false;
      }
    },
    [currentOrganization?.id],
  );

  const upsertAndActivatePrinterPreset = useCallback(
    async (preset: CalibrationPreset): Promise<void> => {
      if (!currentOrganization?.id) return;
      const printMode = preset.printMode ?? precisionSettings.printMode;
      const row: Record<string, unknown> = {
        id: preset.id || undefined,
        organization_id: currentOrganization.id,
        name: preset.name,
        label_width: preset.width,
        label_height: preset.height,
        x_offset: preset.xOffset,
        y_offset: preset.yOffset,
        v_gap: preset.vGap,
        h_gap: preset.hGap ?? 0,
        a4_cols: preset.a4Cols ?? precisionSettings.a4Cols,
        a4_rows: preset.a4Rows ?? precisionSettings.a4Rows,
        print_mode: printMode,
        label_config: preset.labelConfig as any,
        thermal_cols:
          preset.thermalCols ??
          precisionSettings.thermalCols ??
          printModeToThermalCols(printMode),
      };

      let data;
      let error;
      ({ data, error } = await upsertPrinterPresetRow(row));

      if (error) {
        console.error("Failed to save printer preset:", error);
        toast.error(error.message ? `Failed to save preset: ${error.message}` : "Failed to save preset");
        return;
      }

      setPrecisionSettings((prev) => ({
        ...prev,
        labelWidth: preset.width,
        labelHeight: preset.height,
        xOffset: preset.xOffset,
        yOffset: preset.yOffset,
        vGap: preset.vGap,
        hGap: preset.hGap ?? 0,
        thermalCols:
          preset.thermalCols ??
          prev.thermalCols ??
          printModeToThermalCols(printMode),
        printMode,
      }));

      if (preset.labelConfig) {
        try {
          await saveTemplateToDb({
            name: preset.name,
            config: preset.labelConfig,
            labelWidth: preset.width,
            labelHeight: preset.height,
          });
        } catch (mirrorErr) {
          console.warn("Failed to mirror preset to label_template:", mirrorErr);
        }
      }

      setActivePrecisionTemplateName(`preset:${preset.name}`);
      await refreshDbPresetsFromServer();

      precisionDesignBaselineRef.current = snapshotPrecisionDesign(
        {
          ...precisionSettings,
          xOffset: preset.xOffset,
          yOffset: preset.yOffset,
          vGap: preset.vGap,
          hGap: preset.hGap ?? 0,
          labelWidth: preset.width,
          labelHeight: preset.height,
          a4Cols: preset.a4Cols ?? precisionSettings.a4Cols,
          a4Rows: preset.a4Rows ?? precisionSettings.a4Rows,
          printMode,
          labelConfig: preset.labelConfig ?? precisionSettings.labelConfig,
          thermalCols:
            preset.thermalCols ??
            precisionSettings.thermalCols ??
            printModeToThermalCols(printMode),
        },
        preset.name,
      );
      markLabelDesignBaselineSaved(preset.labelConfig ?? null, preset.name);
      toast.success(`Preset "${preset.name}" saved`);
    },
    [
      currentOrganization?.id,
      markLabelDesignBaselineSaved,
      precisionSettings,
      refreshDbPresetsFromServer,
      saveTemplateToDb,
      setActivePrecisionTemplateName,
    ],
  );

  /** Active preset/template for designer Save, or auto-create on first-ever org save. */
  const resolveLabelDesignerSaveTarget = useCallback(async (): Promise<string | null> => {
    if (activePrecisionTemplateNameRef.current) {
      return activePrecisionTemplateNameRef.current;
    }
    const hasExistingDesign =
      dbPresets.length > 0 || savedLabelTemplates.length > 0;
    if (hasExistingDesign) {
      toast.error("No saved preset to update — save the design first");
      return null;
    }
    if (!currentOrganization?.id) return null;

    const live = precisionSettingsRef.current;
    const liveConfig = live.labelConfig ?? DEFAULT_PRECISION_CONFIG;
    const autoName =
      normalizeLabelDesignName(`${live.labelWidth}*${live.labelHeight} mm`) ||
      "Label design";

    const preset: CalibrationPreset = {
      name: autoName,
      width: live.labelWidth,
      height: live.labelHeight,
      xOffset: live.xOffset,
      yOffset: live.yOffset,
      vGap: live.vGap,
      hGap: live.hGap ?? 0,
      a4Cols: live.a4Cols,
      a4Rows: live.a4Rows,
      printMode: live.printMode,
      thermalCols: live.thermalCols,
      labelConfig: liveConfig,
    };

    await upsertAndActivatePrinterPreset(preset);
    return activePrecisionTemplateNameRef.current;
  }, [
    currentOrganization?.id,
    dbPresets.length,
    savedLabelTemplates.length,
    upsertAndActivatePrinterPreset,
  ]);

  const persistPrecisionLabelDesignerSave = useCallback(async (): Promise<void> => {
    if (!currentOrganization?.id) return;

    const activeTemplateName = await resolveLabelDesignerSaveTarget();
    if (!activeTemplateName) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    const templateName = activeTemplateName.replace(/^preset:/, "");
    const fixedConfig = resolveFixedBuiltinLabelConfig(templateName);
    const fixedDims = getFixedBuiltinLabelDimensions(templateName);
    const liveConfig = precisionSettingsRef.current.labelConfig;
    const configToSave = fixedConfig
      ?? (liveConfig
        ? (JSON.parse(JSON.stringify(liveConfig)) as LabelDesignConfig)
        : DEFAULT_PRECISION_CONFIG);
    const livePrecision = precisionSettingsRef.current;
    const saveWidth = fixedDims?.width ?? livePrecision.labelWidth;
    const saveHeight = fixedDims?.height ?? livePrecision.labelHeight;

    await savePrecisionConfigToSettings(configToSave, currentOrganization.id);

    const success = await autoSavePrecisionConfig(
      activeTemplateName,
      configToSave,
      saveWidth,
      saveHeight,
      currentOrganization.id,
      { force: true },
    );

    if (!success) {
      toast.error("Failed to save label design");
      return;
    }

    try {
      await refreshDbPresetsFromServer();
    } catch (refreshErr) {
      console.warn("Failed to refresh printer presets after save:", refreshErr);
    }

    markLabelDesignBaselineSaved(configToSave, activeTemplateName);

    const cleanName = activeTemplateName.startsWith("preset:")
      ? activeTemplateName.replace("preset:", "")
      : activeTemplateName;
    const targetLabel = activeTemplateName.startsWith("preset:")
      ? `preset "${cleanName}"`
      : `template "${cleanName}"`;

    toast.success(`Design saved & ${targetLabel} updated`);
  }, [
    autoSavePrecisionConfig,
    currentOrganization?.id,
    markLabelDesignBaselineSaved,
    refreshDbPresetsFromServer,
    resolveLabelDesignerSaveTarget,
    savePrecisionConfigToSettings,
  ]);

  // Set a preset as default for its print mode only
  const handleSetDefaultPreset = async (
    presetId: string,
    presetName: string,
    printMode: PrecisionPrintMode,
  ) => {
    if (!currentOrganization?.id || !presetId) {
      toast.error("Failed to set default");
      return;
    }

    const cleared = await clearDefaultPresetsForMode(printMode);
    if (!cleared) return;

    let error: { message?: string } | null = null;
    let data = false;
    try {
      data = await markPrinterPresetDefault(currentOrganization.id, presetId, printMode);
    } catch (err) {
      error = err as { message?: string };
    }

    if (error || !data) {
      console.error("Failed to set default preset:", error);
      toast.error(error?.message ? `Failed to set default: ${error.message}` : "Failed to set default");
      return;
    }
    toast.success(`"${presetName}" set as default for ${getPrecisionPrintModeDisplayName(printMode)}`);
    setDbPresets((prev) =>
      prev.map((p) => {
        if (p.id === presetId) {
          return {
            ...p,
            isDefault: true,
            printMode,
            thermalCols:
              printMode === "thermal3up" ? 3 : printMode === "thermal2up" ? 2 : 1,
          };
        }
        if (presetMatchesPrintMode(p, printMode) || p.printMode === printMode) {
          return { ...p, isDefault: false };
        }
        return p;
      }),
    );

    // Mirror into Settings → Bill & Barcode so landing + design stay in sync
    if (
      printMode === "thermal" ||
      printMode === "thermal2up" ||
      printMode === "thermal3up" ||
      printMode === "footwear"
    ) {
      try {
        const { data: settingsRow } = await supabase
          .from("settings")
          .select("id, bill_barcode_settings")
          .eq("organization_id", currentOrganization.id)
          .maybeSingle();
        if (settingsRow?.id) {
          const prevBbs =
            settingsRow.bill_barcode_settings &&
            typeof settingsRow.bill_barcode_settings === "object"
              ? (settingsRow.bill_barcode_settings as Record<string, unknown>)
              : {};
          const tabForMode =
            printMode === "footwear"
              ? "precision_footwear"
              : printMode === "thermal3up"
                ? "precision_3up"
                : printMode === "thermal2up"
                  ? "precision_2up"
                  : "precision_1up";
          await supabase
            .from("settings")
            .update({
              bill_barcode_settings: {
                ...prevBbs,
                barcode_default_print_tab: tabForMode,
                default_thermal_landing: printMode,
                default_precision_preset_id: presetId,
                precision_print_mode: printMode,
              },
            })
            .eq("id", settingsRow.id)
            .eq("organization_id", currentOrganization.id);
          void refreshOrgSettingsCache(queryClient, currentOrganization.id);
        }
      } catch (syncErr) {
        console.warn("Failed to sync default label design to settings:", syncErr);
      }
    }

    try {
      localStorage.removeItem("precision_active_preset");
      if (currentOrganization?.id) {
        localStorage.removeItem(precisionPresetStorageKey(currentOrganization.id));
      }
    } catch {}
  };

  // Set a label template as default for the current print mode
  const handleSetTemplateDefault = async (templateName: string) => {
    if (!currentOrganization?.id) return;
    const template = savedLabelTemplates.find(t => t.name === templateName);
    if (!template) { toast.error("Template not found"); return; }
    const mode = precisionSettings.printMode;
    const cleared = await clearDefaultPresetsForMode(mode);
    if (!cleared) return;

    const templateRow: Record<string, unknown> = {
      organization_id: currentOrganization.id,
      name: templateName,
      label_width: template.labelWidth || precisionSettings.labelWidth,
      label_height: template.labelHeight || precisionSettings.labelHeight,
      x_offset: precisionSettings.xOffset,
      y_offset: precisionSettings.yOffset,
      v_gap: precisionSettings.vGap,
      h_gap: precisionSettings.hGap,
      a4_cols: precisionSettings.a4Cols,
      a4_rows: precisionSettings.a4Rows,
      print_mode: mode,
      label_config: template.config as any,
      thermal_cols:
        mode === "thermal3up" ? 3 : mode === "thermal2up" ? 2 : precisionSettings.thermalCols || 1,
      is_default: true,
    };

    const { data: upserted, error } = await upsertPrinterPresetRow(templateRow, { single: false });
    const upsertedRow = Array.isArray(upserted) ? upserted[0] : upserted;

    if (error || !upsertedRow) {
      console.error("Failed to set template default:", error);
      toast.error(error?.message ? `Failed to set default: ${error.message}` : "Failed to set default");
      return;
    }
    toast.success(`"${templateName}" set as default for ${getPrecisionPrintModeDisplayName(mode)}`);
    const refreshed = await fetchPrinterPresets(currentOrganization.id).catch(() => null);
    if (refreshed) setDbPresets(refreshed);
  };

  /** Load a precision preset/template and keep Label Designer + Standard tabs in sync. */
  const handlePrecisionPresetLoad = useCallback((
    preset: CalibrationPreset,
    opts?: { keepPrintMode?: PrecisionPrintMode; reason?: PrintModeLockReason },
  ) => {
    const fixedDims = getFixedBuiltinLabelDimensions(preset.name);
    const migratedConfig = resolvePresetLabelConfig(preset.name, preset.labelConfig);
    const requestedMode = opts?.keepPrintMode ?? inferPrecisionPrintMode(preset);
    const reason = opts?.reason ?? (opts?.keepPrintMode ? "user-click" : "preset-load");
    const modeWrite = takePrintModeWrite(requestedMode, reason);
    const mode = modeWrite.mode;
    const thermalCols = isPrecisionThermalSheetMode(mode)
      ? printModeToThermalCols(mode)
      : preset.thermalCols || printModeToThermalCols(mode);
    const labelWidth = fixedDims?.width ?? preset.width;
    const labelHeight = fixedDims?.height ?? preset.height;

    const isLabelTemplate = savedLabelTemplates.some((t) => t.name === preset.name);
    const activeName = isLabelTemplate ? preset.name : `preset:${preset.name}`;

    setPrecisionSettings((prev) => {
      const next = {
        ...prev,
        labelConfig: migratedConfig,
        ...(fixedDims
          ? {
              labelWidth: fixedDims.width,
              labelHeight: fixedDims.height,
            }
          : {
              labelWidth: preset.width ?? prev.labelWidth,
              labelHeight: preset.height ?? prev.labelHeight,
            }),
        xOffset: preset.xOffset ?? prev.xOffset,
        yOffset: preset.yOffset ?? prev.yOffset,
        vGap: preset.vGap ?? prev.vGap,
        hGap: preset.hGap ?? prev.hGap ?? 0,
        ...(preset.a4Cols ? { a4Cols: preset.a4Cols } : {}),
        ...(preset.a4Rows ? { a4Rows: preset.a4Rows } : {}),
        ...(modeWrite.accepted ? { thermalCols, printMode: mode } : {}),
      };
      precisionDesignBaselineRef.current = snapshotPrecisionDesign(next, preset.name);
      return next;
    });

    setActivePrecisionTemplateName(activeName);

    const template = savedLabelTemplates.find((t) => t.name === preset.name);
    if (template) {
      setSelectedLabelTemplate(preset.name);
      setLabelConfig(migratedConfig);
    }

    // A4 presets (e.g. Bansari Creation 39×35 5×8) must also set Standard sheetType.
    // Perfect PDF / on-screen A4 layout read sheetType for brand + grid; leaving
    // novajet48 (default) while Precision is 5×8 causes mismatch preview vs PDF.
    if (
      modeWrite.accepted &&
      mode === "a4" &&
      labelWidth != null &&
      labelHeight != null &&
      Number.isFinite(labelWidth) &&
      Number.isFinite(labelHeight)
    ) {
      const resolved = resolveStandardSheetTypeForLabelDimensions(
        labelWidth,
        labelHeight,
        sheetPresets,
        {
          cols: preset.a4Cols,
          rows: preset.a4Rows,
          gap: preset.vGap ?? preset.hGap ?? 0,
        },
      );
      if (resolved.custom) {
        setSheetType("custom");
        setCustomWidth(resolved.custom.width);
        setCustomHeight(resolved.custom.height);
        setCustomCols(resolved.custom.cols);
        setCustomRows(resolved.custom.rows);
        setCustomGap(resolved.custom.gap);
        setSelectedPreset("");
      } else {
        setSheetType(resolved.sheetType as SheetType);
        setSelectedPreset("");
      }
    }

    if (modeWrite.accepted && mode === "footwear") {
      setSheetType("precision_pro_tsc");
    }
  }, [savedLabelTemplates, setActivePrecisionTemplateName]);
  handlePrecisionPresetLoadRef.current = handlePrecisionPresetLoad;

  const executePrintModeSwitch = useCallback((
    mode: PrecisionPrintMode,
    reason: PrintModeLockReason = "user-click",
  ) => {
    const modeWrite = takePrintModeWrite(mode, reason);
    if (!modeWrite.accepted) return;
    const applied = modeWrite.mode;

    setPrecisionSettings((prev) => ({
      ...prev,
      printMode: applied,
      ...(applied === "thermal3up"
        ? { thermalCols: 3 }
        : applied === "thermal2up"
          ? { thermalCols: 2 }
          : applied === "thermal" || applied === "footwear"
            ? { thermalCols: 1 }
            : {}),
    }));

    if (applied === "footwear") {
      const activeName = activePrecisionTemplateName?.replace(/^preset:/, "") ?? null;
      setPrecisionSettings((prev) => {
        const next = {
          ...prev,
          printMode: applied,
          labelWidth: 102,
          labelHeight: 53,
          thermalCols: 1,
        };
        precisionDesignBaselineRef.current = snapshotPrecisionDesign(next, activeName);
        return next;
      });
      setSheetType("precision_pro_tsc");
      return;
    }

    const defaultPreset = findDefaultPresetForMode(dbPresets, applied);
    if (defaultPreset) {
      handlePrecisionPresetLoad(defaultPreset, {
        keepPrintMode: applied,
        reason: "preset-load",
      });
      return;
    }

    const activeName = activePrecisionTemplateName?.replace(/^preset:/, "") ?? null;
    setPrecisionSettings((prev) => {
      const next = {
        ...prev,
        printMode: applied,
        ...(applied === "thermal3up"
          ? { thermalCols: 3 }
          : applied === "thermal2up"
            ? { thermalCols: 2 }
            : applied === "thermal"
              ? { thermalCols: 1 }
              : {}),
      };
      precisionDesignBaselineRef.current = snapshotPrecisionDesign(next, activeName);
      return next;
    });
  }, [activePrecisionTemplateName, dbPresets, handlePrecisionPresetLoad]);
  executePrintModeSwitchRef.current = executePrintModeSwitch;

  const requestPrintModeChange = useCallback((mode: PrecisionPrintMode) => {
    if (mode === precisionSettings.printMode) {
      takePrintModeWrite(mode, "user-click");
      return;
    }

    const presetName = activePrecisionTemplateName?.replace(/^preset:/, "") ?? null;
    const isSavedUserPreset = Boolean(
      presetName && dbPresets.some((p) => p.name === presetName),
    );
    const hasUnsavedLabelDesign =
      isSavedUserPreset &&
      precisionLabelDesignHasUnsavedChanges(
        precisionDesignBaselineRef.current,
        precisionSettings.labelConfig,
        presetName,
      );

    if (hasUnsavedLabelDesign) {
      pendingPrintModeSwitchRef.current = mode;
      setModeSwitchConfirmOpen(true);
      return;
    }

    executePrintModeSwitch(mode);
  }, [
    activePrecisionTemplateName,
    dbPresets,
    executePrintModeSwitch,
    precisionSettings.labelConfig,
    precisionSettings.printMode,
  ]);

  const saveActivePrecisionPreset = useCallback(async (): Promise<boolean> => {
    const baseName = activePrecisionTemplateName?.replace(/^preset:/, "");
    if (!baseName || !currentOrganization?.id) {
      toast.error("No saved preset to update — save the design first");
      return false;
    }
    const existing = dbPresets.find((p) => p.name === baseName);
    if (!existing?.id) {
      toast.error("No saved preset to update — save the design first");
      return false;
    }

    const preset: CalibrationPreset = {
      ...existing,
      xOffset: precisionSettings.xOffset,
      yOffset: precisionSettings.yOffset,
      vGap: precisionSettings.vGap,
      hGap: precisionSettings.hGap,
      width: precisionSettings.labelWidth,
      height: precisionSettings.labelHeight,
      a4Cols: precisionSettings.a4Cols,
      a4Rows: precisionSettings.a4Rows,
      printMode: precisionSettings.printMode,
      thermalCols: precisionSettings.thermalCols,
      labelConfig: precisionSettings.labelConfig,
    };

    const presetRow: Record<string, unknown> = {
      id: existing.id,
      organization_id: currentOrganization.id,
      name: preset.name,
      label_width: preset.width,
      label_height: preset.height,
      x_offset: preset.xOffset,
      y_offset: preset.yOffset,
      v_gap: preset.vGap,
      h_gap: preset.hGap ?? 0,
      a4_cols: preset.a4Cols ?? precisionSettings.a4Cols,
      a4_rows: preset.a4Rows ?? precisionSettings.a4Rows,
      print_mode: precisionSettings.printMode,
      label_config: preset.labelConfig as any,
      thermal_cols: preset.thermalCols || precisionSettings.thermalCols || 1,
    };

    const { error } = await upsertPrinterPresetRow(presetRow, { single: false, select: "id" });
    if (error) {
      toast.error("Failed to save preset");
      return false;
    }

    precisionDesignBaselineRef.current = snapshotPrecisionDesign(precisionSettings, baseName);
    markLabelDesignBaselineSaved(precisionSettings.labelConfig, baseName);
    toast.success(`Preset "${baseName}" saved`);
    return true;
  }, [
    activePrecisionTemplateName,
    currentOrganization?.id,
    dbPresets,
    markLabelDesignBaselineSaved,
    precisionSettings,
  ]);

  const handleDiscardModeSwitch = useCallback(() => {
    const mode = pendingPrintModeSwitchRef.current;
    pendingPrintModeSwitchRef.current = null;
    setModeSwitchConfirmOpen(false);
    if (mode) executePrintModeSwitch(mode);
  }, [executePrintModeSwitch]);

  const handleSaveFirstModeSwitch = useCallback(async () => {
    const mode = pendingPrintModeSwitchRef.current;
    const saved = await saveActivePrecisionPreset();
    if (!saved) return;
    pendingPrintModeSwitchRef.current = null;
    setModeSwitchConfirmOpen(false);
    if (mode) executePrintModeSwitch(mode);
  }, [executePrintModeSwitch, saveActivePrecisionPreset]);

  const handlePresetsChangedAfterBackup = useCallback(async () => {
    await refreshDbPresetsFromServer();
    const activeName = activePrecisionTemplateName?.replace(/^preset:/, "");
    if (!activeName || !currentOrganization?.id) return;
    const preset = await fetchPrinterPresetByName(currentOrganization.id, activeName).catch(() => null);
    if (!preset) return;
    handlePrecisionPresetLoad(preset);
  }, [
    activePrecisionTemplateName,
    currentOrganization?.id,
    handlePrecisionPresetLoad,
    refreshDbPresetsFromServer,
  ]);

  // Recalculate purchase codes when alphabet / encode options change (handles settings-load timing)
  useEffect(() => {
    if (purchaseCodeAlphabet && labelItems.length > 0) {
      setLabelItems(prev => prev.map(item => ({
        ...item,
        purchase_code: item.pur_price && item.pur_price > 0
          ? encodePurchasePriceForLabel(item.pur_price, purchaseCodeAlphabet, {
              gstPer: item.gst_per || 0,
              purchaseDiscount: item.pur_disc,
              includeGst: purchaseCodeIncludeGst,
              extraPercentEnabled: purchaseCodeExtraPercentEnabled,
              extraPercent: purchaseCodeExtraPercent,
              billDate: item.bill_date,
              includeDate: purchaseCodeIncludeDate,
            })
          : item.purchase_code
      })));
    }
  }, [purchaseCodeAlphabet, purchaseCodeIncludeGst, purchaseCodeIncludeDate, purchaseCodeExtraPercentEnabled, purchaseCodeExtraPercent]);

  // Restore purchase-bill context (survives tab switch when router state is cleared)
  useEffect(() => {
    if (!currentOrganization?.id) return;
    const ctx = readBarcodePurchaseBillContext(currentOrganization.id);
    if (ctx?.billId) {
      sourcePurchaseBillIdRef.current = ctx.billId;
      setSourcePurchaseBillId(ctx.billId);
      setFromPurchaseBill(true);
    }
  }, [currentOrganization?.id]);

  // Fetch recent bills for this organization
  useEffect(() => {
    if (!currentOrganization?.id) return;

    const fetchRecentBills = async () => {
      try {
        const { data, error } = await supabase
          .from("purchase_bills")
          .select("id, software_bill_no, supplier_name, bill_date")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
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

    void fetchRecentBills();
  }, [currentOrganization?.id]);

  // Stash Print-Barcode payload immediately (before other effects can clear router state).
  useLayoutEffect(() => {
    const st = location.state as { purchaseItems?: unknown[]; billId?: string } | null;
    if (!purchaseNavKey || !st?.purchaseItems?.length) return;
    if (st.billId) {
      persistBarcodePrintSelection(st.billId, st.purchaseItems);
    }
    queueBarcodePurchaseItems({
      navKey: purchaseNavKey,
      billId: st.billId,
      items: st.purchaseItems,
    });
  }, [purchaseNavKey, location.state]);

  // Load purchase bill items into Product Description — always REPLACE, never merge with prior list.
  // Tab-cache keeps this page mounted, so old products would otherwise stay beside the new bill.
  // Hydrate sale_price / mrp / barcode / size / color from live product_variants so labels
  // match the master after price edits (callers pass a bill-line snapshot).
  useEffect(() => {
    if (isLoadingSettings || settingsLoading) return;

    const st = location.state as { purchaseItems?: unknown[]; billId?: string } | null;
    const fromState = st?.purchaseItems?.length
      ? { navKey: purchaseNavKey, billId: st.billId, items: st.purchaseItems as unknown[] }
      : null;

    // A new Print Barcode click is a fresh arrival. Back's leave flag must not
    // block it. A hydrate already in flight keeps the flag and aborts below.
    if (
      Boolean(st?.purchaseItems?.length) &&
      isBarcodePrintingPathname(window.location.pathname)
    ) {
      userLeftForPurchaseBillRef.current = false;
    }

    let cancelled = false;

    const load = async () => {
      const hydrateStillWanted = () =>
        !cancelled &&
        shouldContinueBarcodePurchaseHydrate({
          pathname: window.location.pathname,
          userLeftForPurchaseBill: userLeftForPurchaseBillRef.current,
        });

      if (!hydrateStillWanted()) return;

      const billIdForFetch =
        purchaseBillIdParam ||
        st?.billId ||
        (currentOrganization?.id
          ? readBarcodePurchaseBillContext(currentOrganization.id)?.billId
          : null) ||
        null;

      let pending = fromState?.navKey
        ? fromState
        : consumeBarcodePurchaseItems(purchaseNavKey ?? undefined, billIdForFetch);

      if (!pending?.items?.length && billIdForFetch) {
        const persistedItems = readBarcodePrintSelection(billIdForFetch);
        if (persistedItems?.length) {
          pending = {
            navKey: barcodePrintSelectionNavKey(billIdForFetch, persistedItems),
            billId: billIdForFetch,
            items: persistedItems,
          };
        }
      }

      // Full-bill DB fetch only when there is no explicit Purchase Entry subset.
      if (!pending?.items?.length && currentOrganization?.id && billIdForFetch) {
        const navKey = `db|${billIdForFetch}`;
        const blockedByClear = appliedPurchaseNavKeyRef.current === navKey;
        if (!blockedByClear) {
          try {
            const fetched = await fetchBarcodePrintItemsForBill(
              currentOrganization.id,
              billIdForFetch,
            );
            if (fetched.items.length > 0) {
              pending = {
                navKey,
                billId: billIdForFetch,
                items: fetched.items,
              };
            } else if (!pending?.items?.length) {
              if (!hydrateStillWanted()) return;
              toast.error("No items found on this purchase bill");
              return;
            }
          } catch (err) {
            console.error("[BarcodePrinting] purchase bill fallback fetch failed", err);
            if (!pending?.items?.length) {
              if (!hydrateStillWanted()) return;
              toast.error("Failed to load purchase bill items");
              return;
            }
          }
        }
      }

      if (!hydrateStillWanted()) return;
      if (!pending?.items?.length || !pending.navKey) return;
      const effectiveNavKey =
        pending.billId && pending.items.length
          ? barcodePrintSelectionNavKey(pending.billId, pending.items)
          : pending.navKey;
      if (
        appliedPurchaseNavKeyRef.current === effectiveNavKey &&
        labelItemsCountRef.current > 0
      ) {
        return;
      }
      clearBarcodePurchaseItems();
      let hasPurchasePrices = false;
      let hasStyle = false;
      let hasSupplierCode = false;

      const skuIds = [
        ...new Set(
          pending.items
            .map((item: any) => item.sku_id)
            .filter((id: unknown): id is string => typeof id === "string" && !!id),
        ),
      ];

      const liveBySku = new Map<
        string,
        {
          barcode: string;
          size: string;
          color: string;
          sale_price: number;
          mrp: number;
          pur_price: number;
          gst_per: number;
          pur_disc: PurchaseCodeDiscount;
          product_name?: string;
          brand?: string;
          category?: string;
          style?: string;
          uom?: string;
        }
      >();

      if (skuIds.length > 0 && currentOrganization?.id) {
        const { data: liveRows, error: liveErr } = await supabase
          .from("product_variants")
          .select(
            `
            id,
            barcode,
            size,
            color,
            sale_price,
            mrp,
            pur_price,
            products (
              product_name,
              brand,
              category,
              style,
              color,
              uom,
              purchase_gst_percent,
              gst_per,
              purchase_discount_type,
              purchase_discount_value
            )
          `,
          )
          .in("id", skuIds)
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null);

        if (liveErr) {
          console.warn("[BarcodePrinting] live variant hydrate failed — using bill snapshot", liveErr);
        } else {
          for (const row of liveRows ?? []) {
            const p = row.products as {
              product_name?: string;
              brand?: string;
              category?: string;
              style?: string;
              color?: string;
              uom?: string;
              purchase_gst_percent?: number | null;
              gst_per?: number | null;
              purchase_discount_type?: string | null;
              purchase_discount_value?: number | null;
            } | null;
            liveBySku.set(row.id, {
              barcode: row.barcode || "",
              size: row.size || "",
              color: row.color || p?.color || "",
              sale_price: Number(row.sale_price) || 0,
              mrp: Number(row.mrp) || 0,
              pur_price: Number(row.pur_price) || 0,
              gst_per: resolvePurchaseCodeGstPer(p, 0),
              pur_disc: resolvePurchaseCodeDiscount(p),
              product_name: p?.product_name,
              brand: p?.brand,
              category: p?.category,
              style: p?.style,
              uom: p?.uom,
            });
          }
        }
      }

      if (!hydrateStillWanted()) return;

      // Saved invoice date wins. Print Barcodes after save used to stamp today
      // because the form resets, so September printed as the current month.
      let savedInvoiceDate: string | undefined;
      if (pending.billId && currentOrganization?.id) {
        const { data: billDateRow, error: billDateErr } = await supabase
          .from("purchase_bills")
          .select("bill_date")
          .eq("id", pending.billId)
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .maybeSingle();
        if (billDateErr) {
          console.warn("[BarcodePrinting] purchase invoice date lookup failed", billDateErr);
        } else {
          savedInvoiceDate = normalizePurchaseBillDate(billDateRow?.bill_date);
        }
      }

      if (!hydrateStillWanted()) return;

      const items: LabelItem[] = pending.items.map((item: any) => {
        const live = item.sku_id ? liveBySku.get(item.sku_id) : undefined;
        // Bill snapshot keeps qty, bill meta, and this barcode's name/style.
        // Variant prices still come from the live SKU.
        const purPrice = live?.pur_price ?? item.pur_price ?? 0;
        // Purchase Entry's print payload carries no GST %, so "Include GST in code" was
        // silently skipped here while POS added it. Same product GST as POS.
        const gstPer = live ? live.gst_per : Number(item.gst_per) || 0;
        const billDateStr = resolveLabelPurchaseBillDate({
          savedInvoiceDate,
          itemBillDate: item.bill_date,
        });
        const purDisc = live?.pur_disc ?? null;
        const purchaseCode = encodePurchasePriceForLabel(purPrice, purchaseCodeAlphabet, {
          gstPer,
          purchaseDiscount: purDisc,
          includeGst: purchaseCodeIncludeGst,
          extraPercentEnabled: purchaseCodeExtraPercentEnabled,
          extraPercent: purchaseCodeExtraPercent,
          billDate: billDateStr,
          includeDate: purchaseCodeIncludeDate,
        }) || undefined;

        if (purPrice > 0) hasPurchasePrices = true;
        // Name / brand / style / colour stay on this barcode's bill line.
        // The catalog row is shared by every size, so it must not overwrite them.
        const identity = resolvePurchaseLabelIdentity(item, live);
        const style = identity.style;
        if (style && String(style).trim()) hasStyle = true;
        if (item.supplier_code && String(item.supplier_code).trim()) hasSupplierCode = true;

        return {
          sku_id: item.sku_id,
          product_name: identity.product_name,
          brand: identity.brand,
          category: identity.category,
          color: identity.color,
          style,
          size: live?.size || item.size,
          sale_price: live?.sale_price ?? item.sale_price,
          mrp: live?.mrp ?? item.mrp ?? 0,
          pur_price: purPrice,
          gst_per: gstPer,
          pur_disc: purDisc,
          purchase_code: purchaseCode,
          bill_date: billDateStr,
          barcode: live?.barcode || item.barcode,
          qty: item.qty,
          uom: live?.uom || item.uom || "NOS",
          bill_number: item.bill_number || "",
          supplier_code: item.supplier_code || "",
          supplier_invoice_no: item.supplier_invoice_no || "",
          sale_disc_percent: item.sale_disc_percent ?? null,
        };
      });

      const discMap = await fetchSaleDiscPercentBySkuId(
        currentOrganization.id,
        items.map((i) => i.sku_id).filter((id): id is string => Boolean(id)),
      );
      for (const row of items) {
        if (row.sku_id && discMap.has(row.sku_id)) {
          row.sale_disc_percent = discMap.get(row.sku_id);
        }
      }

      // User may have pressed Back while this fetch was in flight. Tab cache
      // keeps this page mounted, so finishing the hydrate would send them back.
      if (!hydrateStillWanted()) return;

      // Replace entire print list (do not append to products already on the page)
      setLabelItems(items);
      appliedPurchaseNavKeyRef.current = effectiveNavKey;
      try {
        localStorage.setItem("barcode_label_items", JSON.stringify(items));
      } catch {
        /* ignore */
      }

      if (hasPurchasePrices) {
        // Encode purchase codes on label items — do NOT force the Purchase Code field
        // visible in the designer (that overwrote user add/remove / template edits).
        setShowPurchaseCode(true);
      }

      toast.success(`Loaded ${items.length} items from purchase bill`);

      const billId = pending.billId;
      const billNumber = items.find((item) => item.bill_number?.trim())?.bill_number;
      if (billId && pending.items.length && !String(pending.navKey || "").startsWith("db|")) {
        persistBarcodePrintSelection(billId, pending.items);
      }
      if (currentOrganization?.id && billId) {
        persistBarcodePurchaseBillContext(currentOrganization.id, {
          billId,
          billNumber,
        });
        sourcePurchaseBillIdRef.current = billId;
        setSourcePurchaseBillId(billId);
        setFromPurchaseBill(true);
      } else if (currentOrganization?.id && billNumber) {
        setFromPurchaseBill(true);
      }

      // Drop purchaseItems from router state; keep purchaseBillId in the URL for reload survival.
      if (st?.purchaseItems?.length || billId) {
        const preserveState = routeRequestedTab ? { openTab: routeRequestedTab } : undefined;
        if (billId) {
          orgNavigate(barcodePrintingPathWithBill(billId), {
            replace: true,
            state: preserveState,
          });
        } else {
          orgNavigate("/barcode-printing", {
            replace: true,
            state: preserveState ?? {},
          });
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    isLoadingSettings,
    settingsLoading,
    location.state,
    purchaseNavKey,
    purchaseBillIdParam,
    currentOrganization?.id,
    purchaseCodeAlphabet,
    purchaseCodeIncludeGst,
    purchaseCodeIncludeDate,
    purchaseCodeExtraPercentEnabled,
    purchaseCodeExtraPercent,
    orgNavigate,
    routeRequestedTab,
  ]);

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

  // Search for products as user types
  useEffect(() => {
    // Set when the text changes again: a slower, older search must not overwrite newer results.
    let superseded = false;
    const searchProducts = async () => {
      if (!searchQuery.trim() || !currentOrganization?.id) {
        setSearchResults([]);
        setOpenSettlementScans(new Map());
        return;
      }

      try {
        const results = await searchLabelProducts(currentOrganization.id, searchQuery);
        if (superseded) return;
        setSearchResults(results);

        if (results.length > 0 && currentOrganization?.id) {
          const scanMap = await fetchOpenScansByVariantIds(
            currentOrganization.id,
            results.map((r) => r.id),
          );
          if (superseded) return;
          setOpenSettlementScans(scanMap);
        } else {
          setOpenSettlementScans(new Map());
        }
      } catch (error: any) {
        if (superseded) return;
        console.error(error);
        setOpenSettlementScans(new Map());
      }
    };

    const debounce = setTimeout(searchProducts, 300);
    return () => {
      superseded = true;
      clearTimeout(debounce);
    };
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
      gst_per: result.gst_per || 0,
      pur_disc: result.pur_disc ?? null,
      purchase_code: encodePurchasePriceForLabel(purPrice, purchaseCodeAlphabet, {
        gstPer: result.gst_per || 0,
        purchaseDiscount: result.pur_disc,
        includeGst: purchaseCodeIncludeGst,
        extraPercentEnabled: purchaseCodeExtraPercentEnabled,
        extraPercent: purchaseCodeExtraPercent,
        includeDate: purchaseCodeIncludeDate,
      }),
      barcode: result.barcode,
      bill_number: '',
      qty: 1,
      uom: result.uom || 'NOS',
      supplier_code: result.supplier_code || '',
      sale_disc_percent: result.sale_disc_percent ?? null,
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
    if (!currentOrganization?.id) return;

    try {
      const billNumber = items.find((item) => item.bill_number?.trim())?.bill_number;
      const targetBillId = await resolvePurchaseBillIdForBarcodeReturn(
        currentOrganization.id,
        {
          billId: sourcePurchaseBillIdRef.current,
          billNumber,
        },
      );

      if (!targetBillId) {
        toast.info("No purchase bills found");
        return;
      }

      const quantities = await fetchBillLineQuantities(targetBillId);
      setLabelItems((prev) => prev.map((item) => ({ ...item, qty: quantityOnBill(quantities, item) })));
    } catch (error) {
      console.error("Failed to fill last purchase quantities:", error);
      toast.error("Could not load quantities from last purchase");
    }
  };

  // Bill quantities for "load quantities from bill" while adding products: one bill search and
  // one read of its lines per bill number, not two queries for every product added.
  const billQuantitiesCacheRef = useRef(new Map<string, Promise<BillLineQuantities | null>>());
  const loadQuantitiesForItem = async (item: LabelItem) => {
    if (!billNumber.trim() || !currentOrganization?.id) return;
    const orgId = currentOrganization.id;
    const key = `${orgId}|${billNumber.trim()}`;

    let pending = billQuantitiesCacheRef.current.get(key);
    if (!pending) {
      pending = findPurchaseBillIdByNumber(orgId, billNumber.trim()).then((billId) =>
        billId ? fetchBillLineQuantities(billId) : null,
      );
      billQuantitiesCacheRef.current.set(key, pending);
      // A failed read is not kept, so the next product tries again.
      pending.catch(() => billQuantitiesCacheRef.current.delete(key));
    }

    try {
      const quantities = await pending;
      if (!quantities) return; // bill not found
      const qty = quantityOnBill(quantities, item);
      if (qty) {
        setLabelItems((prev) => prev.map((i) => (i.sku_id === item.sku_id ? { ...i, qty } : i)));
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
    if (!currentOrganization?.id) return;

    try {
      const result = await loadLabelItemsFromBill(currentOrganization.id, billNumber, {
        alphabet: purchaseCodeAlphabet,
        includeGst: purchaseCodeIncludeGst,
        includeDate: purchaseCodeIncludeDate,
        extraPercentEnabled: purchaseCodeExtraPercentEnabled,
        extraPercent: purchaseCodeExtraPercent,
      });
      if (result.status === "bill_not_found") {
        toast.error("Bill not found");
        return;
      }

      clearBarcodePrintSelection(result.bill.id);
      appliedPurchaseNavKeyRef.current = null;

      if (result.status !== "ok") {
        toast.error(
          result.status === "no_items"
            ? "No items found in this bill"
            : result.status === "no_products"
              ? "No valid products found in this bill"
              : "Could not load product details for items in this bill",
        );
        return;
      }

      // Apply size sorting based on user preference
      setLabelItems(sortItemsBySize(result.items, sizeSortOrder));
      toast.success(`Loaded ${result.items.length} items from bill ${result.bill.supplier_invoice_no || result.bill.id}`);
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

  const clearBarcodeLabelQueue = useCallback((opts?: { silent?: boolean }) => {
    const billId =
      sourcePurchaseBillId ??
      purchaseBillIdParam ??
      (currentOrganization?.id
        ? readBarcodePurchaseBillContext(currentOrganization.id)?.billId
        : null);

    setLabelItems([]);
    localStorage.removeItem("barcode_label_items");
    clearBarcodePurchaseItems();
    clearBarcodePurchaseBillContext();
    if (billId) {
      clearBarcodePrintSelection(billId);
      // Block purchase-bill DB fallback from re-populating after clear.
      appliedPurchaseNavKeyRef.current = `db|${billId}`;
    } else {
      appliedPurchaseNavKeyRef.current = "cleared-manual";
    }
    sourcePurchaseBillIdRef.current = null;
    setSourcePurchaseBillId(null);
    setFromPurchaseBill(false);
    setSearchQuery("");

    // Strip purchaseItems out of history.state — this is what
    // hasPendingBarcodePurchaseItems() / the tab-cache purchase-nav resolver
    // check to decide whether to auto-switch back to this page. Without this
    // replace, that marker survives even though the visible queue is empty.
    const st = location.state as { purchaseItems?: unknown[]; openTab?: string } | null;
    if (purchaseBillIdParam || st?.purchaseItems?.length) {
      const preserveState = routeRequestedTab ? { openTab: routeRequestedTab } : {};
      orgNavigate("/barcode-printing", {
        replace: true,
        state: preserveState,
      });
    }

    if (!opts?.silent) {
      toast.success("Cleared all labels");
    }
  }, [
    sourcePurchaseBillId,
    purchaseBillIdParam,
    currentOrganization?.id,
    location.state,
    routeRequestedTab,
    orgNavigate,
  ]);

  const handleClearAll = () => clearBarcodeLabelQueue();

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
      // Renamed while editing — drop the old row so Update doesn't leave a duplicate.
      if (
        isEditingPreset &&
        selectedPreset &&
        selectedPreset !== trimmedName
      ) {
        await deleteCustomFromDb(selectedPreset);
      }
      setSavedPresets((prev) => {
        const withoutOld = prev.filter(
          (p) =>
            p.name !== trimmedName &&
            !(isEditingPreset && selectedPreset && p.name === selectedPreset),
        );
        return [...withoutOld, newPreset];
      });
      // Only rewrite default_format when this preset is already the saved default
      // (or we're renaming that default) — don't hijack default on "Save Current".
      if (
        dbDefaultFormat &&
        (dbDefaultFormat.customPresetName === selectedPreset ||
          dbDefaultFormat.customPresetName === trimmedName)
      ) {
        await saveDefaultToDb({
          ...dbDefaultFormat,
          sheetType: "custom",
          customPresetName: trimmedName,
          printScale,
          customDimensions: {
            width: customWidth,
            height: customHeight,
            cols: customCols,
            rows: customRows,
            gap: customGap,
            scale: printScale,
          },
        });
      }
      if (isEditingPreset) {
        toast.success(`Preset "${trimmedName}" updated successfully`);
      } else {
        toast.success(`Preset "${trimmedName}" saved successfully`);
      }
      setNewPresetName("");
      setIsSaveDialogOpen(false);
      setIsEditingPreset(false);
      setSelectedPreset(trimmedName);
      setSheetType("custom");
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

    const existing = savedPresets.find((p) => p.name === selectedPreset);
    if (!existing) {
      toast.error("Selected sheet preset not found — pick it from Sheet Type again");
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
      setSavedPresets((prev) =>
        prev.map((p) => (p.name === selectedPreset ? updatedPreset : p)),
      );
      // Sync default_format when this named preset is the org default (or none set yet
      // while we're on custom) so reload doesn't restore a stale dimensions snapshot.
      if (
        dbDefaultFormat &&
        (!dbDefaultFormat.customPresetName ||
          dbDefaultFormat.customPresetName === selectedPreset)
      ) {
        await saveDefaultToDb({
          ...dbDefaultFormat,
          sheetType: "custom",
          customPresetName: selectedPreset,
          printScale,
          customDimensions: {
            width: customWidth,
            height: customHeight,
            cols: customCols,
            rows: customRows,
            gap: customGap,
            scale: printScale,
          },
        });
      }
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
    
    // A4 die-cut sheets must stay at 100% — scaling causes corner-to-corner skew.
    setPrintScale(100);
    
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
        setLabelConfig(ensureCompleteFieldOrder(preset.labelConfig));
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

    const existingIndex = savedMarginPresets.findIndex(
      (p) => p.name.toLowerCase() === trimmedName.toLowerCase(),
    );
    
    if (!isEditingMarginPreset && existingIndex !== -1) {
      toast.error("A margin preset with this name already exists");
      return;
    }

    if (
      isEditingMarginPreset &&
      trimmedName !== selectedMarginPreset &&
      savedMarginPresets.some((p) => p.name.toLowerCase() === trimmedName.toLowerCase())
    ) {
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
      // Renamed while editing — drop the old row so we don't leave a duplicate.
      if (
        isEditingMarginPreset &&
        selectedMarginPreset &&
        selectedMarginPreset !== trimmedName
      ) {
        await deleteMarginFromDb(selectedMarginPreset);
      }
      setSavedMarginPresets((prev) => {
        const withoutOld = prev.filter(
          (p) =>
            p.name !== trimmedName &&
            !(
              isEditingMarginPreset &&
              selectedMarginPreset &&
              p.name === selectedMarginPreset
            ),
        );
        return [...withoutOld, newPreset];
      });
      if (
        dbDefaultFormat &&
        (dbDefaultFormat.defaultMarginPreset === selectedMarginPreset ||
          dbDefaultFormat.defaultMarginPreset === trimmedName)
      ) {
        await saveDefaultToDb({
          ...dbDefaultFormat,
          defaultMarginPreset: trimmedName,
          topOffset,
          leftOffset,
          bottomOffset,
          rightOffset,
        });
      }
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

  /** One-click update: write current margin inputs onto the selected preset. */
  const handleUpdateSelectedMarginPreset = async () => {
    if (!selectedMarginPreset) {
      toast.error("Please select a margin preset to update");
      return;
    }

    const existing = savedMarginPresets.find((p) => p.name === selectedMarginPreset);
    if (!existing) {
      toast.error("Selected margin preset not found");
      return;
    }

    const updatedPreset: MarginPreset = {
      name: selectedMarginPreset,
      topOffset,
      leftOffset,
      bottomOffset,
      rightOffset,
      description: existing.description,
    };

    const success = await saveMarginToDb(updatedPreset);
    if (success) {
      setSavedMarginPresets((prev) =>
        prev.map((p) => (p.name === selectedMarginPreset ? updatedPreset : p)),
      );
      // Keep default_format offsets aligned when this preset is the org default.
      if (
        dbDefaultFormat &&
        dbDefaultFormat.defaultMarginPreset === selectedMarginPreset
      ) {
        await saveDefaultToDb({
          ...dbDefaultFormat,
          defaultMarginPreset: selectedMarginPreset,
          topOffset,
          leftOffset,
          bottomOffset,
          rightOffset,
        });
      }
      toast.success(`Margin preset "${selectedMarginPreset}" updated`);
    }
  };

  const handleEditMarginPreset = () => {
    if (!selectedMarginPreset) {
      toast.error("Please select a margin preset to edit");
      return;
    }

    const preset = savedMarginPresets.find(p => p.name === selectedMarginPreset);
    if (preset) {
      // Keep current Top/Left/Bottom/Right inputs — those are what the user wants to save.
      // Only prefill name/description for the update dialog.
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

  // Mark the selected margin preset as the organization default (auto-applies on load)
  const handleSetDefaultMarginPreset = async () => {
    if (!selectedMarginPreset) {
      toast.error("Please select a margin preset first");
      return;
    }
    const success = await saveDefaultToDb({
      ...(dbDefaultFormat || {}),
      defaultMarginPreset: selectedMarginPreset,
      topOffset,
      leftOffset,
      bottomOffset,
      rightOffset,
    });
    if (success) {
      toast.success(`"${selectedMarginPreset}" set as default margins`);
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

    const { width: currentLabelWidth, height: currentLabelHeight } = getLabelDimensions();
    const configToPersist = ensureCompleteFieldOrder(
      JSON.parse(JSON.stringify(labelConfig)) as LabelDesignConfig,
    );

    const newTemplate: LabelTemplate = {
      name: trimmedName,
      config: configToPersist,
      labelWidth: currentLabelWidth,
      labelHeight: currentLabelHeight,
    };

    // Keep Precision mirror in sync before DB write (prevents stale auto-save race)
    setLabelConfig(configToPersist);
    if (
      activePrecisionTemplateBaseName &&
      (activePrecisionTemplateBaseName === trimmedName ||
        activePrecisionTemplateBaseName === selectedLabelTemplate)
    ) {
      setPrecisionSettings((prev) => ({ ...prev, labelConfig: configToPersist }));
    }

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
      const mergedConfig = resolvePresetLabelConfig(template.name, template.config);
      setLabelConfig(mergedConfig);
      setNewLabelTemplateName(template.name);
      setIsEditingLabelTemplate(true);
      setShowCustomizeFields(true);
      setIsLabelTemplateSaveDialogOpen(true);
    }
  };

  const handleLoadLabelTemplate = (templateName: string) => {
    const template = savedLabelTemplates.find((t) => t.name === templateName);
    if (template) {
      const templateDims = resolveTemplateLabelDimensions(template);
      const mergedConfig = resolvePresetLabelConfig(template.name, template.config);
      // Standard tab source of truth first — then mirror into Precision so auto-save
      // cannot later clobber field toggles with a stale precision copy.
      setLabelConfig(mergedConfig);
      setSelectedLabelTemplate(template.name);
      const loadWidth =
        templateDims?.width ?? template.labelWidth ?? precisionSettings.labelWidth;
      const loadHeight =
        templateDims?.height ?? template.labelHeight ?? precisionSettings.labelHeight;
      // 39×35 (and other A4 die-cuts) → A4 print mode so Standard sheet syncs to 40-sheet.
      const inferredA4Sheet = findMatchingA4SheetType(loadWidth, loadHeight, sheetPresets, {
        cols: precisionSettings.a4Cols,
        rows: precisionSettings.a4Rows,
      });
      const loadPrintMode =
        inferredA4Sheet || precisionSettings.printMode === "a4"
          ? "a4"
          : precisionSettings.printMode;
      handlePrecisionPresetLoad({
        name: template.name,
        xOffset: precisionSettings.xOffset,
        yOffset: precisionSettings.yOffset,
        vGap: precisionSettings.vGap,
        hGap: precisionSettings.hGap,
        width: loadWidth,
        height: loadHeight,
        labelConfig: mergedConfig,
        printMode: loadPrintMode,
        thermalCols: precisionSettings.thermalCols,
        a4Cols: precisionSettings.a4Cols,
        a4Rows: precisionSettings.a4Rows,
      });
      if (templateDims) {
        applyStandardSheetForTemplateDims(templateDims.width, templateDims.height, {
          cols: precisionSettings.a4Cols,
          rows: precisionSettings.a4Rows,
          gap: precisionSettings.vGap,
        });
      }
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
  /** Align Standard tab sheet size with template sticker (prevents 1st label split on 50×38 etc.). */
  const applyStandardSheetForTemplateDims = useCallback(
    (
      width: number,
      height: number,
      opts?: { force?: boolean; cols?: number; rows?: number; gap?: number },
    ) => {
      const current =
        sheetType === "custom"
          ? { width: customWidth, height: customHeight }
          : sheetPresetDimensions(sheetPresets, sheetType);
      const matches =
        current &&
        Math.abs(current.width - width) < 0.5 &&
        Math.abs(current.height - height) < 0.5;
      if (!opts?.force && matches) return;

      const resolved = resolveStandardSheetTypeForLabelDimensions(
        width,
        height,
        sheetPresets,
        { cols: opts?.cols, rows: opts?.rows, gap: opts?.gap },
      );
      if (resolved.custom) {
        setSheetType("custom");
        setCustomWidth(resolved.custom.width);
        setCustomHeight(resolved.custom.height);
        setCustomCols(resolved.custom.cols);
        setCustomRows(resolved.custom.rows);
        setCustomGap(resolved.custom.gap);
        setSelectedPreset("");
      } else {
        setSheetType(resolved.sheetType as SheetType);
        setSelectedPreset("");
      }
    },
    [sheetType, customWidth, customHeight],
  );

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

  /** Persist the selected Standard template from current designer state (explicit Update). */
  const persistSelectedLabelTemplate = useCallback(async (): Promise<boolean> => {
    const name = selectedLabelTemplateRef.current;
    if (!name) {
      toast.error("Please select a template to update");
      return false;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    const existing = savedLabelTemplates.find((t) => t.name === name);
    const { width: sheetW, height: sheetH } = getLabelDimensions();
    // Prefer template sticker size over sheet cell size (avoids saving 48×24 as 33×19).
    const templateDims = existing ? resolveTemplateLabelDimensions(existing) : null;
    const saveWidth = templateDims?.width ?? existing?.labelWidth ?? sheetW;
    const saveHeight = templateDims?.height ?? existing?.labelHeight ?? sheetH;

    const configToPersist = ensureCompleteFieldOrder(
      JSON.parse(JSON.stringify(labelConfigRef.current)) as LabelDesignConfig,
    );

    setLabelConfig(configToPersist);
    labelConfigRef.current = configToPersist;
    setPrecisionSettings((prev) => ({ ...prev, labelConfig: configToPersist }));
    if (activePrecisionTemplateBaseNameRef.current !== name) {
      setActivePrecisionTemplateName(name);
    }

    const success = await saveTemplateToDb({
      name,
      config: configToPersist,
      labelWidth: saveWidth,
      labelHeight: saveHeight,
    });

    if (success) {
      const orgId = currentOrganization?.id ?? "";
      try {
        lastPersistedSignatureRef.current =
          `${orgId}|${name}|${saveWidth}|${saveHeight}|${JSON.stringify(configToPersist)}`;
      } catch {
        lastPersistedSignatureRef.current = `${orgId}|${name}|${saveWidth}|${saveHeight}`;
      }
      markLabelDesignBaselineSaved(configToPersist, name);
      toast.success(`Template "${name}" updated`);
    }
    return success;
  }, [
    savedLabelTemplates,
    saveTemplateToDb,
    currentOrganization?.id,
    setActivePrecisionTemplateName,
    markLabelDesignBaselineSaved,
    sheetType,
    customWidth,
    customHeight,
  ]);

  const getLabelHTML = (item: LabelItem, format: DesignFormat) => {
    const { width, height } = getLabelDimensions();
    return buildLabelHtml(item, format, { labelConfig, businessName, labelWidthMm: width, labelHeightMm: height });
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

  const isThermalMultiUp = (): boolean => {
    return isPrecisionThermalMultiUp(lockedPrintLayout().mode);
  };

  const isA4SheetType = (): boolean => {
    if (isThermalMultiUp()) return false;
    if (sheetType === "custom") {
      return isStandardA4SheetType("custom", {
        width: customWidth,
        height: customHeight,
        cols: customCols,
        rows: customRows,
        gap: customGap,
      });
    }
    return isStandardA4SheetType(sheetType);
  };

  const getThermalMultiUpCols = (): number => {
    if (!isThermalMultiUp()) return 1;
    return lockedPrintLayout().cols;
  };

  const getThermalMultiUpGap = (): number => {
    if (!isThermalMultiUp()) return 0;

    if (precisionSettings.enabled) {
      return Math.max(0, precisionSettings.hGap || 0);
    }

    if (sheetType === "custom") {
      return Math.max(0, customGap || 0);
    }

    const preset = sheetPresets[sheetType];
    return preset?.cols === 2 ? parseFloat(preset.gap) || 0 : 0;
  };

  const getA4ColumnGap = (): number => {
    if (precisionSettings.printMode !== "a4" || precisionSettings.a4Cols <= 1) return 0;
    const raw = Math.max(0, precisionSettings.hGap || 0);
    return resolveA4LayoutGap(
      precisionSettings.a4Cols,
      precisionSettings.a4Rows,
      precisionSettings.labelWidth,
      precisionSettings.labelHeight,
      raw,
      novaJetBrandFromSheetType(sheetType),
    );
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
          width: parseFloat(sheetPresets[sheetType].width),
          height: parseFloat(sheetPresets[sheetType].height),
          gap: parseFloat(sheetPresets[sheetType].gap)
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

  /** A4 cell size for Standard print/preview — coerces MPL 48L/40L gap & 40L width when brand sheetType. */
  const getA4SheetDimensions = () => {
    const brand = novaJetBrandFromSheetType(sheetType);
    const cols = sheetType === "custom" ? customCols : sheetPresets[sheetType].cols;
    const rows =
      sheetType === "custom"
        ? customRows || 8
        : ((sheetPresets[sheetType] as { rows?: number }).rows || 8);
    const rawWidth =
      sheetType === "custom" ? customWidth : parseFloat(sheetPresets[sheetType].width);
    const height =
      sheetType === "custom" ? customHeight : parseFloat(sheetPresets[sheetType].height);
    const rawGap =
      sheetType === "custom" ? customGap : parseFloat(sheetPresets[sheetType].gap);
    const width = resolveA4LabelWidthMm(cols, rows, rawWidth, height, rawGap, brand);
    return {
      cols,
      rows,
      width,
      height,
      gap: resolveA4LayoutGap(cols, rows, rawWidth, height, rawGap, brand),
      rawGap,
      rawWidth,
      novaJetBrand: brand,
    };
  };

  const getSheetPageMargins = () => {
    const { cols, rows, width, height, gap, novaJetBrand } = getA4SheetDimensions();

    return computeA4SheetMargins(
      cols,
      rows,
      width,
      height,
      gap,
      {
        top: topOffset,
        left: leftOffset,
        bottom: bottomOffset,
        right: rightOffset,
      },
      novaJetBrand,
    );
  };

  const generatePreview = (targetElementId: string) =>
    renderLabelSheet(targetElementId, {
      bottomOffset,
      customRows,
      designFormat,
      getA4SheetDimensions,
      getLabelHTML,
      getSheetPageMargins,
      getThermalMultiUpCols,
      getThermalMultiUpGap,
      hasAbsolutePositioning,
      isThermal1Up,
      isThermalMultiUp,
      labelConfig,
      labelItems,
      leftOffset,
      rightOffset,
      sheetType,
      startPosition,
      topOffset,
    });

  const getTotalBarcodeLabelQty = useCallback(
    () => labelItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
    [labelItems],
  );

  const executePrecisionPrint = async () => {
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

    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    const printArea = precisionPrintRef.current;
    if (!printArea) return;

    const labelHTML = printArea.innerHTML;
    const locked = lockedPrintLayout();
    const isFootwearForm = isPrecisionFootwearMode(locked.mode);
    const cols = isFootwearForm ? 1 : locked.cols;
    const horizontalGap = cols > 1 ? getThermalMultiUpGap() : 0;
    // Footwear form size comes from the designed panel sizes (box + pair column).
    const footwearForm = footwearFormSizeMm(resolveFootwearFormDesign(footwearDesign).layout);
    const labelW = isFootwearForm ? footwearForm.widthMm : effectivePrecisionLabelWidth;
    const labelH = isFootwearForm ? footwearForm.heightMm : effectivePrecisionLabelHeight;
    const w = labelW * cols + horizontalGap * Math.max(0, cols - 1);
    const isA4 = !isFootwearForm && locked.mode === "a4";
    // Thermal: page size must match physical sticker. vGap is roll spacing only — never add to page height.
    const h = isA4 ? 297 : labelH;

    const htmlDoc = buildPrecisionLabelDocument(labelHTML, {
      contentWidthMm: w,
      pageHeightMm: h,
      labelWidthMm: labelW,
      isA4,
      thermalCols: cols,
    });
    const electronPageSize = isA4
      ? "A4"
      : { width: Math.round(w * 1000), height: Math.round(h * 1000) };

    if (await printBarcodeViaDesktop(htmlDoc, electronPageSize)) {
      clearBarcodeLabelQueue({ silent: true });
      toast.success("Labels printed");
      return;
    }

    if (printHtmlLooksLikeLeakedCss(htmlDoc)) {
      toast.error("Print blocked", {
        description:
          "Print preview contains raw CSS text. Printing was blocked so a customer document is not sent like this.",
      });
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup blocked — please allow popups for this site.");
      return;
    }

    printWindow.document.write(htmlDoc);
    printWindow.document.close();
    printWindow.focus();
    toast.info(`Print Actual Size 100% (no Fit/Shrink). Label: ${labelW}×${labelH}mm`);
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 400);
    clearBarcodeLabelQueue({ silent: true });
  };

  const handleConfirmPrecisionPrint = async () => {
    if (isPrecisionPrintRunning) return;
    setPrecisionPrintConfirmOpen(false);
    setIsPrecisionPrintRunning(true);
    try {
      await executePrecisionPrint();
    } finally {
      setIsPrecisionPrintRunning(false);
    }
  };

  const handlePrint = async () => {
    if (precisionSettings.enabled) {
      takePrintModeWrite(precisionSettings.printMode, "user-print");
      const totalQty = getTotalBarcodeLabelQty();
      if (totalQty <= 0) {
        toast.error("Please add at least one label with quantity > 0");
        return;
      }

      if (isElectron()) {
        setPrecisionPrintConfirmQty(totalQty);
        setPrecisionPrintConfirmOpen(true);
        return;
      }

      setIsPrecisionPrintRunning(true);
      try {
        await executePrecisionPrint();
      } finally {
        setIsPrecisionPrintRunning(false);
      }
      return;
    }

    // Classic mode: Generate labels in the print area (for on-screen preview)
    generatePreview("printArea");

    // Condensed (EzzyNarrow) glyphs must be ready before the desktop document
    // is built or window.print runs — 3s timeout, then print anyway.
    await ensureLabelNarrowFontLoaded();

    if (isThermal1Up() || isThermalMultiUp()) {
      const labelW =
        sheetType === "custom"
          ? customWidth
          : parseFloat(sheetPresets[sheetType].width);
      const labelH =
        sheetType === "custom"
          ? customHeight
          : parseFloat(sheetPresets[sheetType].height);
      const printEl = document.getElementById("printArea");
      if (printEl?.innerHTML.trim()) {
        const standardCss = `
          html, body { margin: 0 !important; padding: 0 !important; width: ${labelW}mm !important; }
          .label-grid, .thermal-page {
            display: block !important;
            width: ${labelW}mm !important;
            height: ${labelH}mm !important;
            min-height: ${labelH}mm !important;
            max-height: ${labelH}mm !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            break-inside: avoid-page !important;
            page-break-after: always !important;
            break-after: page !important;
          }
          .label-grid:last-child, .thermal-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .label-cell {
            width: ${labelW}mm !important;
            height: ${labelH}mm !important;
            min-height: ${labelH}mm !important;
            max-height: ${labelH}mm !important;
            overflow: hidden !important;
            position: relative !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            break-inside: avoid-page !important;
          }
          .label-row { display: flex; flex-wrap: nowrap; }
          svg.barcode { max-width: 100%; height: auto; }
        `;
        const htmlDoc = buildStandardLabelDocument(printEl.innerHTML, {
          pageWidthMm: labelW,
          pageHeightMm: labelH,
          extraHeadStyles: standardCss,
        });
        if (
          await printBarcodeViaDesktop(htmlDoc, {
            width: Math.round(labelW * 1000),
            height: Math.round(labelH * 1000),
          })
        ) {
          clearBarcodeLabelQueue({ silent: true });
          toast.success("Labels printed");
          return;
        }
      }

      const originalTitle = document.title;
      document.title = " ";
      setPrintPageActive(true);
      setTimeout(() => {
        try {
          assertPrintTargetSafe(document.getElementById("printArea"));
        } catch (err) {
          document.title = originalTitle;
          setPrintPageActive(false);
          if (err instanceof PrintPreflightError) {
            toast.error("Print blocked", { description: err.message });
          }
          return;
        }
        window.print();
        document.title = originalTitle;
        clearBarcodeLabelQueue({ silent: true });
        toast.success("Labels printed");
        // Fallback in case `afterprint` does not fire (some browsers/dialogs).
        setTimeout(() => setPrintPageActive(false), 1500);
      }, 200);
      return;
    }

    // For A4 sheets: open Perfect PDF preview only (no auto-download).
    // Browser print() → "Microsoft Print to PDF" re-encodes with Fit/scale and
    // destroys die-cut alignment. User prints from the preview at Actual Size 100%.
    // Explicit download remains on "Perfect PDF" / Export actions.
    const hasLabels = labelItems.some((item) => item.qty > 0);
    if (!hasLabels) {
      toast.error('Please add at least one label with quantity > 0');
      return;
    }
    toast.info('Preparing label sheet preview…');
    try {
      const dimensions = getA4SheetDimensions();

      const pdfBytes = await generateA4LabelPdf(labelItems, {
        labelWidthMm: dimensions.width,
        labelHeightMm: dimensions.height,
        cols: dimensions.cols,
        rows: dimensions.rows,
        gapMm: dimensions.gap,
        topOffsetMm: topOffset,
        leftOffsetMm: leftOffset,
        bottomOffsetMm: bottomOffset,
        rightOffsetMm: rightOffset,
        labelConfig,
        businessName,
        startPosition,
        sheetType,
        novaJetBrand: dimensions.novaJetBrand,
      });

      const blob = new Blob([new Uint8Array(pdfBytes) as any], { type: 'application/pdf' });
      const pdfUrl = URL.createObjectURL(blob);
      const previewWin = window.open(pdfUrl, '_blank');
      if (!previewWin) {
        toast.error('Pop-up blocked — allow pop-ups to preview the label sheet PDF');
        URL.revokeObjectURL(pdfUrl);
        return;
      }
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 120000);
      toast.success(
        'Preview opened — print Actual Size 100% (no Fit / Shrink). Use Perfect PDF if you need a download.',
      );
    } catch (err) {
      console.error('Label PDF generation error:', err);
      toast.error('Failed to generate label sheet');
    }
  };

  const handleTestPrint = async () => {
    // Auto-save calibration to printer_presets
    if (currentOrganization?.id) {
      const presetName = `Auto-Cal ${precisionSettings.labelWidth}x${precisionSettings.labelHeight}mm`;
      const testRow: Record<string, unknown> = {
        organization_id: currentOrganization.id,
        name: presetName,
        label_width: precisionSettings.labelWidth,
        label_height: precisionSettings.labelHeight,
        x_offset: precisionSettings.xOffset,
        y_offset: precisionSettings.yOffset,
        v_gap: precisionSettings.vGap,
        h_gap: precisionSettings.hGap,
        a4_cols: precisionSettings.a4Cols,
        a4_rows: precisionSettings.a4Rows,
        thermal_cols: precisionSettings.thermalCols || 1,
      };
      const { error } = await upsertPrinterPresetRow(testRow, { single: false });
      if (error) {
        toast.error("Failed to save calibration");
      } else {
        toast.success(`Calibration saved as "${presetName}"`);
        // Refresh presets
        const refreshed = await fetchPrinterPresets(currentOrganization.id).catch(() => null);
        if (refreshed) setDbPresets(refreshed);
      }
    }

    // Activate test print area and trigger print
    setTestPrintActive(true);
    const originalTitle = document.title;
    document.title = ' ';
    setPrintPageActive(true);
    setTimeout(() => {
      try {
        assertPrintTargetSafe(document.getElementById("printArea"));
      } catch (err) {
        document.title = originalTitle;
        setTestPrintActive(false);
        setPrintPageActive(false);
        if (err instanceof PrintPreflightError) {
          toast.error("Print blocked", { description: err.message });
        }
        return;
      }
      window.print();
      document.title = originalTitle;
      setTestPrintActive(false);
      setTimeout(() => setPrintPageActive(false), 1500);
    }, 300);
  };

  const handleExportPerfectPDF = async () => {
    const hasLabels = labelItems.some((item) => item.qty > 0);
    if (!hasLabels) {
      toast.error('Please add at least one label with quantity > 0');
      return;
    }
    if (isThermal1Up() || isThermalMultiUp()) {
      toast.error('Perfect PDF is for A4 sheet labels only');
      return;
    }
    toast.info('Generating Perfect PDF...');
    try {
      const dimensions = getA4SheetDimensions();

      const pdfBytes = await generateA4LabelPdf(labelItems, {
        labelWidthMm: dimensions.width,
        labelHeightMm: dimensions.height,
        cols: dimensions.cols,
        rows: dimensions.rows,
        gapMm: dimensions.gap,
        topOffsetMm: topOffset,
        leftOffsetMm: leftOffset,
        bottomOffsetMm: bottomOffset,
        rightOffsetMm: rightOffset,
        labelConfig,
        businessName,
        startPosition,
        sheetType,
        novaJetBrand: dimensions.novaJetBrand,
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
      toast.success('PDF ready — print Actual Size 100% (no Fit / Shrink) for die-cut sheets');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF');
    }
  };

  const handleExportPDF = () =>
    exportLabelsPdf({
      businessName,
      customCols,
      customGap,
      customHeight,
      customRows,
      customWidth,
      designFormat,
      getA4SheetDimensions,
      getAutoFitScale,
      getLabelHTML,
      getSheetPageMargins,
      getThermalMultiUpCols,
      getThermalMultiUpGap,
      hasAbsolutePositioning,
      isA4SheetType,
      isThermal1Up,
      isThermalMultiUp,
      labelConfig,
      labelItems,
      lockedPrintLayout,
      precisionSettings,
      printScale,
      productFieldSettings,
      sheetType,
      topOffset,
    });

  const showPurchaseBillNav = useMemo(
    () =>
      fromPurchaseBill
      || Boolean((location.state as { purchaseItems?: unknown[] } | null)?.purchaseItems?.length)
      || labelItems.some((item) => Boolean(item.bill_number?.trim())),
    [fromPurchaseBill, location.state, labelItems],
  );

  const openPurchaseBillAndStay = useCallback((billId: string) => {
    // Drop the session markers the hidden tab-cache page uses to reload this
    // bill and replace the URL with /barcode-printing.
    userLeftForPurchaseBillRef.current = true;
    clearBarcodePurchaseItems();
    clearBarcodePurchaseBillContext();
    clearBarcodePrintSelection(billId);
    appliedPurchaseNavKeyRef.current = `db|${billId}`;
    sourcePurchaseBillIdRef.current = null;
    setSourcePurchaseBillId(null);
    setFromPurchaseBill(false);
    orgNavigate("/purchase-entry", { state: { editBillId: billId } });
  }, [orgNavigate]);

  const handleBackToPurchaseBill = useCallback(async () => {
    if (!currentOrganization?.id) return;
    userLeftForPurchaseBillRef.current = true;
    setIsNavigatingToPurchaseBill(true);
    try {
      const navState = location.state as { billId?: string } | null;
      const billNumber = labelItems.find((item) => item.bill_number?.trim())?.bill_number;
      const billId = await resolvePurchaseBillIdForBarcodeReturn(currentOrganization.id, {
        billId: sourcePurchaseBillId ?? purchaseBillIdParam ?? navState?.billId ?? null,
        billNumber,
      });
      if (!billId) {
        userLeftForPurchaseBillRef.current = false;
        toast.error("Could not find the purchase bill to open");
        return;
      }
      openPurchaseBillAndStay(billId);
    } finally {
      setIsNavigatingToPurchaseBill(false);
    }
  }, [currentOrganization?.id, labelItems, location.state, openPurchaseBillAndStay, purchaseBillIdParam, sourcePurchaseBillId]);

  const totalLabelQty = labelItems.reduce((sum, item) => sum + item.qty, 0);
  const quantityModeLabel =
    quantityMode === "manual"
      ? "Manual qty"
      : quantityMode === "lastPurchase"
        ? "Auto: last purchase"
        : "Auto: by bill";

  const sheetLayoutSummary =
    selectedPreset ||
    sheetPresetLabels[sheetType]?.label ||
    sheetType.replace(/_/g, " ");

  const handleBackNavigation = () => {
    const orgId = currentOrganization?.id;
    if (!orgId) return;
    userLeftForPurchaseBillRef.current = true;
    setIsNavigatingToPurchaseBill(true);
    void (async () => {
      try {
        const navState = location.state as { billId?: string } | null;
        const openedFromBill = purchaseBillIdForBarcodeBack({
          queryBillId: purchaseBillIdParam,
          navBillId: navState?.billId,
        });
        const billNumber = openedFromBill
          ? null
          : labelItems.find((item) => item.bill_number?.trim())?.bill_number;
        const billId = await resolvePurchaseBillIdForBarcodeReturn(orgId, {
          billId: openedFromBill,
          billNumber,
        });
        if (!billId) {
          userLeftForPurchaseBillRef.current = false;
          toast.error("Could not find the purchase bill to open");
          return;
        }
        openPurchaseBillAndStay(billId);
      } finally {
        setIsNavigatingToPurchaseBill(false);
      }
    })();
  };

  // Standard tab with Layout & Style collapsed: product list fills the page height
  const standardListFillsPage = activeBarTab === "standard" && !layoutStyleOpen && labelItems.length > 0;

  return (
    <div
      className={cn(entryPageShellClass, "barcode-printing-page bg-slate-50 dark:bg-background flex flex-col min-h-0 h-full w-full max-w-none")}
      data-entry-form
      {...(activeBarTab === "designer" ? { "data-designer-tab": true } : {})}
      {...(activeBarTab === "precision" ? { "data-precision-tab": true } : {})}
      {...(showPurchaseBillNav ? { "data-from-purchase": true } : {})}
    >
      {/* Header — back + purchase shortcuts */}
      <header className="barcode-print-header shrink-0 flex items-center gap-2 px-2 py-1.5 border-b bg-background">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 font-semibold shrink-0"
          disabled={isNavigatingToPurchaseBill}
          title="Open the last purchase bill"
          onClick={handleBackNavigation}
        >
          {isNavigatingToPurchaseBill ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
          Back
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate">Barcode Printing</p>
          {labelItems.length > 0 && (
            <p className="text-[11px] text-muted-foreground tabular-nums truncate">
              {labelItems.length} products · {totalLabelQty} labels
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5 shrink-0"
          onClick={() => orgNavigate("/purchase-bills")}
        >
          <Package className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Purchase Dashboard</span>
          <span className="sm:hidden">Purchases</span>
        </Button>
        {showPurchaseBillNav && (
          <Button
            variant="default"
            size="sm"
            className="h-8 text-xs gap-1 shrink-0"
            disabled={isNavigatingToPurchaseBill}
            onClick={() => void handleBackToPurchaseBill()}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Products
          </Button>
        )}
      </header>

      <main
        className={cn(
          "flex-1 min-h-0 flex flex-col gap-2 p-2",
          activeBarTab === "designer" || activeBarTab === "precision" || activeBarTab === "standard"
            ? "overflow-hidden"
            : "overflow-y-auto overflow-x-hidden",
        )}
      >

      {/* Search Bar with Dropdown */}
      <div className="barcode-print-search shrink-0">
        <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={isSearchOpen}
              className="w-full h-9 justify-between font-normal text-sm bg-background"
            >
              <span className="flex items-center gap-2 truncate text-left">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                {searchQuery || "Search product, brand, size, or barcode..."}
              </span>
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
                  {searchResults.map((result) => {
                    const openScan = openSettlementScans.get(result.id);
                    return (
                    <CommandItem
                      key={result.id}
                      value={`${result.product_name}-${result.brand}-${result.size}-${result.barcode}-${result.id}`}
                      onSelect={() => handleSelectProduct(result)}
                      className="flex flex-col items-stretch gap-1.5 cursor-pointer py-3"
                    >
                      <div className="flex items-center gap-2">
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
                      </div>
                      {openScan && (
                        <SettlementScanBadge
                          scan={openScan}
                          currentUserId={user?.id}
                          currentUserEmail={user?.email ?? undefined}
                          className="ml-6"
                        />
                      )}
                    </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Label Source — collapsed by default */}
      <Collapsible open={labelSourceOpen} onOpenChange={setLabelSourceOpen} className="barcode-label-source-collapsible shrink-0">
        <div className="border rounded-md bg-card overflow-hidden shadow-sm">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="barcode-label-source-trigger w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            >
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", labelSourceOpen && "rotate-180")} />
              <span className="text-sm font-semibold">Label Source</span>
              <span className="text-xs text-muted-foreground truncate">{quantityModeLabel}</span>
              {sizeSortOrder === "barcode_asc" && (
                <span className="text-[11px] text-muted-foreground hidden sm:inline">· Barcode order</span>
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pb-3 pt-2 border-t space-y-2">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantity Mode</Label>
                  <RadioGroup value={quantityMode} onValueChange={(v) => setQuantityMode(v as QuantityMode)} className="flex flex-wrap gap-x-4 gap-y-1">
                    <div className="flex items-center space-x-1.5">
                      <RadioGroupItem value="manual" id="manual" className="h-3.5 w-3.5" />
                      <Label htmlFor="manual" className="text-sm font-medium cursor-pointer">Manual</Label>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <RadioGroupItem value="lastPurchase" id="lastPurchase" className="h-3.5 w-3.5" />
                      <Label htmlFor="lastPurchase" className="text-sm font-medium cursor-pointer">Auto: Last Purchase</Label>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <RadioGroupItem value="byBill" id="byBill" className="h-3.5 w-3.5" />
                      <Label htmlFor="byBill" className="text-sm font-medium cursor-pointer">Auto: By Bill No</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Print Order</Label>
                  <Select value={sizeSortOrder} onValueChange={(v) => setSizeSortOrder(v as SizeSortOrder)}>
                    <SelectTrigger className="h-8 text-sm bg-background">
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
                </div>
              </div>

              {quantityMode === "byBill" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Select
                    value={billNumber}
                    onValueChange={(value) => {
                      setBillNumber(value);
                      if (value) {
                        setTimeout(() => handleLoadByBill(), 100);
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 bg-background text-sm">
                      <SelectValue placeholder="Select recent bill..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      {recentBills.length > 0 ? (
                        recentBills.map((bill) => (
                          <SelectItem key={bill.id} value={bill.software_bill_no || bill.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{bill.software_bill_no}</span>
                              <span className="text-xs text-muted-foreground">
                                {bill.supplier_name} - {formatDateDMY(bill.bill_date)}
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
                  <div className="flex gap-2">
                    <Input
                      placeholder="Or enter bill number"
                      value={billNumber}
                      onChange={(e) => setBillNumber(e.target.value)}
                      className="h-8 text-sm flex-1"
                    />
                    <Button size="sm" className="h-8" onClick={handleLoadByBill}>Load</Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleClearAll}>
                  Clear All
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Results Table */}
      {labelItems.length > 0 && (
        <BarcodeLabelListPanel
          items={labelItems}
          totalLabelQty={totalLabelQty}
          showMrpColumn={showMrpColumn}
          className={
            standardListFillsPage
              ? "flex-1 min-h-0"
              : activeBarTab === "designer"
                ? "shrink-0 max-h-[32vh]"
                : activeBarTab === "precision"
                  ? "shrink-0 max-h-[42vh]"
                  : showCustomizeFields
                    ? "shrink-0 max-h-[30vh]"
                    : "shrink-0 max-h-[28vh]"
          }
          onClearAll={handleClearAll}
          onQtyChange={handleQtyChange}
          onRemove={(skuId) => {
            setLabelItems((prev) => prev.filter((i) => i.sku_id !== skuId));
            toast.success("Product removed");
          }}
        />
      )}

      {/* Printing Mode Tabs */}
      <Tabs 
        value={activeBarTab} 
        onValueChange={(v) => {
          setActiveBarTab(v);
          setPrecisionSettings((prev) => ({
            ...prev,
            enabled: v === "precision" || v === "designer",
          }));

          // Bridge Standard / Label Designer selection into Precision Pro + Designer
          if ((v === "precision" || v === "designer") && selectedLabelTemplate) {
            const template = savedLabelTemplates.find((t) => t.name === selectedLabelTemplate);
            if (template && activePrecisionTemplateBaseName !== selectedLabelTemplate) {
              const templateDims = resolveTemplateLabelDimensions(template);
              handlePrecisionPresetLoad({
                name: template.name,
                xOffset: precisionSettings.xOffset,
                yOffset: precisionSettings.yOffset,
                vGap: precisionSettings.vGap,
                hGap: precisionSettings.hGap,
                width: templateDims?.width ?? template.labelWidth ?? precisionSettings.labelWidth,
                height: templateDims?.height ?? template.labelHeight ?? precisionSettings.labelHeight,
                labelConfig: template.config,
                printMode: precisionSettings.printMode,
                thermalCols: precisionSettings.thermalCols,
                a4Cols: precisionSettings.a4Cols,
                a4Rows: precisionSettings.a4Rows,
              });
              if (v === "precision") {
                toast.info(`Loaded template "${template.name}" into Precision Pro`);
              }
            }
          }
        }}
        className={cn(
          "w-full flex flex-col",
          // Layout & Style closed → tabs sit at the bottom and the product list takes the page
          standardListFillsPage ? "shrink-0" : "flex-1 min-h-0",
        )}
      >
        <TabsList className="barcode-print-tabs mb-1 h-10 shrink-0 w-full justify-start rounded-lg bg-slate-200/80 dark:bg-muted p-1">
          <TabsTrigger value="standard" className="text-sm font-bold px-4 py-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Standard
          </TabsTrigger>
          <TabsTrigger value="precision" className="text-sm font-bold px-4 py-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Precision Pro
          </TabsTrigger>
          <TabsTrigger value="designer" className="text-sm font-bold px-4 py-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Label Designer
          </TabsTrigger>
        </TabsList>

        <TabsContent value="standard" className="mt-0 flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
      <div className="barcode-standard-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain space-y-2 pr-1">
      <Collapsible open={layoutStyleOpen} onOpenChange={setLayoutStyleOpen}>
        <div className="border rounded-md overflow-hidden bg-card">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="barcode-label-source-trigger w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            >
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", layoutStyleOpen && "rotate-180")} />
              <span className="text-sm font-bold">Layout &amp; Style</span>
              <span className="text-xs text-muted-foreground truncate ml-auto">{sheetLayoutSummary}</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pb-3 pt-2 border-t space-y-2">

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
                  <SelectItem value="a4_12x4">NovaJet MPL 48L (48×24mm, 4×12)</SelectItem>
                  <SelectItem value="a4_36sheet">A4 36-Sheet (48×30mm, 4×9)</SelectItem>
                  <SelectItem value="a4_32sheet">A4 32-Sheet (52×30mm, retail)</SelectItem>
                  <SelectItem value="a4_35square">A4 35-Square (35×35mm, square)</SelectItem>
                  <SelectItem value="a4_40sheet">A4 40-Sheet (39×35mm, 5×8) MPL 40L ✓ Exact</SelectItem>
                  <SelectItem value="novajet40">Novajet 40 (39×35mm, 5×8) MPL 40L</SelectItem>
                  
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
                  <SelectItem value="thermal_50x38_1up">50×38mm (Ella Noor / garment)</SelectItem>
                  
                  {/* Thermal Roll Presets - 1UP Medium */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">🔥 Thermal 1UP - Medium</div>
                  <SelectItem value="thermal_50x40_1up">50×40mm (detailed)</SelectItem>
                  <SelectItem value="thermal_60x30_1up">60×30mm (wide)</SelectItem>
                  <SelectItem value="thermal_60x40_1up">60×40mm (large)</SelectItem>
                  <SelectItem value="thermal_75x50_1up">75×50mm (medium shipping)</SelectItem>
                  <SelectItem value="thermal_80x40_1up">80×40mm (wide shipping)</SelectItem>
                  
                  {/* Thermal Roll Presets - Jewellery */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">💎 Thermal 1UP - Jewellery</div>
                  <SelectItem value="jewellery_100x15_1up">Jewellery Tag (100×15mm 1UP)</SelectItem>

                  {/* Thermal Roll Presets - 1UP Large */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">🔥 Thermal 1UP - Large</div>
                  <SelectItem value="thermal_100x50_1up">100×50mm (shipping)</SelectItem>
                  <SelectItem value="thermal_100x100_1up">100×100mm (large shipping)</SelectItem>
                  <SelectItem value="precision_pro_tsc">Precision Pro TSC (102×53mm — Box + Pair)</SelectItem>
                  
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
              {sheetType !== "custom" && !sheetType.startsWith("thermal") && sheetType !== "precision_pro_tsc" && sheetType !== "jewellery_100x15_1up" && (
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
            {(sheetType === "novajet40" || sheetType === "a4_40sheet" || sheetType === "a4_39x35_40sheet") && (
              <p className="text-xs text-muted-foreground mt-2 p-2 bg-muted/30 rounded border">
                <strong>MPL 40L (39×35mm, 5×8, gap 0):</strong> Use Print / Perfect PDF — open the{" "}
                <em>downloaded</em> PDF and print Actual Size 100% (no Fit / Shrink). Do not send through
                Microsoft Print to PDF again. Die-cut white edge is ~8.5mm top/bottom and ~7.5mm left/right
                (Top nudge 0 is correct). Portrait A4: 5 columns × 8 rows.
              </p>
            )}
            {isA4SheetType() && sheetType !== "custom" && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 bg-muted/30 rounded border text-xs">
                <div><span className="text-muted-foreground">Width:</span> <span className="font-semibold tabular-nums">{parseFloat(sheetPresets[sheetType].width)}mm</span></div>
                <div><span className="text-muted-foreground">Height:</span> <span className="font-semibold tabular-nums">{parseFloat(sheetPresets[sheetType].height)}mm</span></div>
                <div><span className="text-muted-foreground">Columns:</span> <span className="font-semibold tabular-nums">{sheetPresets[sheetType].cols}</span></div>
                <div><span className="text-muted-foreground">Rows:</span> <span className="font-semibold tabular-nums">{(sheetPresets[sheetType] as { rows?: number }).rows || "—"}</span></div>
                <div><span className="text-muted-foreground">Gap:</span> <span className="font-semibold tabular-nums">{parseFloat(sheetPresets[sheetType].gap)}mm</span></div>
                <div><span className="text-muted-foreground">Per sheet:</span> <span className="font-semibold tabular-nums">{sheetPresets[sheetType].cols * ((sheetPresets[sheetType] as { rows?: number }).rows || 0)} labels</span></div>
              </div>
            )}
            {(sheetType.startsWith("thermal") || sheetType === "precision_pro_tsc" || sheetType === "jewellery_100x15_1up") && (
              <div className="mt-2 p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-800">
                <p className="text-xs text-orange-700 dark:text-orange-300 font-medium mb-1">🔥 Thermal Printer Tips:</p>
                <ul className="text-xs text-orange-600 dark:text-orange-400 space-y-0.5 list-disc list-inside">
                  {sheetType === "precision_pro_tsc" ? (
                    <>
                      <li>TSC TTP-244 Pro / 245 — use Direct Print (WebUSB) for raw TSPL</li>
                      <li>Label roll: 102×53mm with 2mm gap</li>
                    </>
                  ) : sheetType === "jewellery_100x15_1up" ? (
                    <>
                      <li>Jewellery tag roll: 100×15mm with 2mm gap</li>
                      <li>Load matching layout from Label Designer → Jewellery Tag preset</li>
                    </>
                  ) : (
                    <>
                      <li>Set printer paper size to match label size</li>
                      <li>Use "No Margins" in print settings</li>
                      <li>Select "Continuous Roll" if available</li>
                    </>
                  )}
                </ul>
              </div>
            )}
            {sheetType === "precision_pro_tsc" && labelItems.length > 0 && (
              <div className="mt-3 p-3 rounded-lg border bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Layout preview (first item) — use Direct Print for TSC output
                </p>
                <div className="flex justify-center overflow-auto">
                  <PrecisionProTSCPreview
                    item={labelItems[0]}
                    businessName={businessName}
                    scaleFactor={1.5}
                    design={footwearDesign}
                  />
                </div>
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
                    step="0.1"
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
                    step="0.1"
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
                  <Label htmlFor="customGap">Gap between labels (mm)</Label>
                  <Input
                    id="customGap"
                    type="number"
                    min="0"
                    max="50"
                    step="0.1"
                    value={customGap}
                    onChange={(e) => setCustomGap(Math.max(0, Math.min(50, parseFloat(e.target.value) || 0)))}
                    placeholder="e.g., 0"
                  />
                  {customCols === 4 &&
                    customRows === 12 &&
                    Math.abs(customWidth - 48) < 0.05 &&
                    Math.abs(customHeight - 24) < 0.05 && (
                    <p className="text-xs text-muted-foreground bg-muted/40 border rounded px-2 py-1.5">
                      These dimensions match NovaJet MPL 48L stock. For manufacturer margins
                      (Top 7.5mm / Left 9mm, gap 0), pick Sheet Type → <strong>NovaJet MPL 48L</strong>.
                      Custom sheets use your saved gap and centered margins as-is.
                    </p>
                  )}
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
                        type="button"
                        size="sm" 
                        variant="default"
                        onClick={() => void handleQuickUpdatePreset()}
                        title={`Save width/height/gap/scale into "${selectedPreset}"`}
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
                        setLabelConfig(ensureCompleteFieldOrder(builtIn.config));
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
                  variant={showCustomizeFields ? "secondary" : "outline"}
                  onClick={() => setShowCustomizeFields(!showCustomizeFields)}
                >
                  {showCustomizeFields ? "Hide" : "Show"} Designer
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
              <div className="pt-3 border-t flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <div>
                    <h4 className="font-medium text-sm mb-0.5">Label Designer</h4>
                    <p className="text-xs text-muted-foreground">Drag fields on preview • click <strong>Expand</strong> for full-screen design</p>
                  </div>
                  {selectedLabelTemplate && (
                    <Button 
                      size="sm" 
                      variant="default"
                      onClick={() => void persistSelectedLabelTemplate()}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Update "{selectedLabelTemplate}"
                    </Button>
                  )}
                </div>
                
                <BarTenderLabelDesigner
                  labelConfig={labelConfig}
                  setLabelConfig={setStandardLabelConfig}
                  businessName={businessName}
                  sampleItem={labelItems.length > 0 ? labelItems[0] : null}
                  labelWidth={sheetType === 'custom' ? customWidth : parseFloat(sheetPresets[sheetType].width)}
                  labelHeight={sheetType === 'custom' ? customHeight : parseFloat(sheetPresets[sheetType].height)}
                  columns={sheetType === 'custom' ? customCols : sheetPresets[sheetType].cols}
                  savedTemplates={dbLabelTemplates}
                  selectedTemplateName={selectedLabelTemplate}
                  onSaveTemplate={saveTemplateToDb}
                  onUpdateTemplate={persistSelectedLabelTemplate}
                  onDeleteTemplate={deleteTemplateFromDb}
                  productFieldSettings={productFieldSettings}
                />
              </div>
            )}
          </div>

          {/* Margin Presets Section — collapsed by default to give designer more room */}
          <Collapsible open={marginSectionOpen} onOpenChange={setMarginSectionOpen}>
          <div className="col-span-full border rounded-lg overflow-hidden bg-muted/30">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
              >
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", marginSectionOpen && "rotate-180")} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm">Sheet Margins &amp; Offsets</h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {(() => {
                      const m = getSheetPageMargins();
                      return `Nudge T${topOffset} L${leftOffset} B${bottomOffset} R${rightOffset}mm · Effective T${m.marginTop.toFixed(1)} L${m.marginLeft.toFixed(1)}mm`;
                    })()}
                  </p>
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 space-y-4 border-t">
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold">Sheet Margin Presets</h3>
                <p className="text-sm text-muted-foreground">
                  Save nudge configurations for different printers/trays. Values are fine-tunes on top of
                  the die-cut sheet margins (not absolute edge distance). Select a preset, change nudges, then Update.
                </p>
              </div>

              {/* Wrapped toolbar — parent card uses overflow-hidden; a single-row flex was clipping Update */}
              <div className="flex flex-wrap gap-2 items-center">
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
                  <SelectTrigger className="w-[220px]">
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

                {selectedMarginPreset && (
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={() => void handleUpdateSelectedMarginPreset()}
                    title={`Save current Top/Left/Bottom/Right into "${selectedMarginPreset}"`}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Update &quot;{selectedMarginPreset}&quot;
                  </Button>
                )}

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
                      Save as New
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{isEditingMarginPreset ? "Update" : "Save"} Margin Preset</DialogTitle>
                      <DialogDescription>
                        {isEditingMarginPreset
                          ? "Rename or edit description, then save current margin values"
                          : "Save current margin settings as a new preset"}
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
                      variant={dbDefaultFormat?.defaultMarginPreset === selectedMarginPreset ? "default" : "outline"}
                      onClick={handleSetDefaultMarginPreset}
                      title="Set as default margins (auto-applied when printing from Purchase Bill / Dashboard)"
                    >
                      {dbDefaultFormat?.defaultMarginPreset === selectedMarginPreset ? "Default ✓" : "Set Default"}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleEditMarginPreset}
                      title="Rename / edit description"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Rename
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

          {(() => {
            const effective = getSheetPageMargins();
            const is40L =
              sheetType === "novajet40" ||
              sheetType === "a4_40sheet" ||
              sheetType === "a4_39x35_40sheet" ||
              (sheetType === "custom" &&
                customCols === 5 &&
                customRows === 8 &&
                Math.abs(customHeight - 35) <= 1);
            return (
              <p className="text-xs text-muted-foreground mb-3 p-2 bg-muted/40 rounded border">
                Fields below are <strong>fine-tune nudges</strong> (mm).{" "}
                {is40L ? (
                  <>
                    MPL 40L die-cut base is Top/Bottom <strong>8.5mm</strong>, Left/Right{" "}
                    <strong>7.5mm</strong> — so Top=0 still leaves ~8.5mm white edge (correct for the sheet).
                  </>
                ) : (
                  <>Nudge 0 keeps manufacturer / centered sheet margins.</>
                )}{" "}
                Effective now: Top {effective.marginTop.toFixed(1)} · Left {effective.marginLeft.toFixed(1)} ·
                Bottom {effective.marginBottom.toFixed(1)} · Right {effective.marginRight.toFixed(1)} mm.
                Negative nudge moves the grid toward that edge.
              </p>
            );
          })()}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="space-y-2">
            <Label>Top Nudge (mm)</Label>
            <Input
              type="number"
              min={-20}
              max={40}
              step={0.5}
              value={topOffset}
              onChange={(e) => {
                setTopOffset(parseFloat(e.target.value) || 0);
                setSelectedMarginPreset("");
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Left Nudge (mm)</Label>
            <Input
              type="number"
              min={-20}
              max={40}
              step={0.5}
              value={leftOffset}
              onChange={(e) => {
                setLeftOffset(parseFloat(e.target.value) || 0);
                setSelectedMarginPreset("");
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Bottom Nudge (mm)</Label>
            <Input
              type="number"
              min={-20}
              max={40}
              step={0.5}
              value={bottomOffset}
              onChange={(e) => {
                setBottomOffset(parseFloat(e.target.value) || 0);
                setSelectedMarginPreset("");
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Right Nudge (mm)</Label>
            <Input
              type="number"
              min={-20}
              max={40}
              step={0.5}
              value={rightOffset}
              onChange={(e) => {
                setRightOffset(parseFloat(e.target.value) || 0);
                setSelectedMarginPreset("");
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Start Label Position</Label>
            <Input
              type="number"
              min={1}
              max={
                sheetType === "custom"
                  ? Math.max(1, customCols * customRows)
                  : Math.max(
                      1,
                      sheetPresets[sheetType].cols *
                        ((sheetPresets[sheetType] as any).rows || 10)
                    )
              }
              value={startPosition}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setStartPosition(Number.isFinite(n) && n >= 1 ? n : 1);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Skip already-used labels on the sheet. Default 1 (start from first label).
            </p>
          </div>
          </div>
          </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

            </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      </div>
        </TabsContent>

        <TabsContent value="precision" className="barcode-precision-workspace mt-0 flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
          <div className="border rounded-md flex flex-col flex-1 min-h-0 overflow-hidden bg-card">
            <div className="barcode-precision-toolbar shrink-0 flex flex-wrap items-center gap-2 px-2 py-1.5 border-b bg-muted/30">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 font-semibold shrink-0"
                disabled={isNavigatingToPurchaseBill}
                title="Open the last purchase bill"
                onClick={handleBackNavigation}
              >
                {isNavigatingToPurchaseBill ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
                Back
              </Button>
              <span className="text-sm font-bold">Precision Pro</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {effectivePrecisionLabelWidth}×{effectivePrecisionLabelHeight}mm
              </span>
              {labelItems.length > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums ml-1">
                  · {labelItems.length} products · {totalLabelQty} labels
                </span>
              )}
              <div className="flex items-center gap-1.5 ml-auto shrink-0">
                {showPurchaseBillNav && (
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    disabled={isNavigatingToPurchaseBill}
                    onClick={() => void handleBackToPurchaseBill()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Products
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => orgNavigate("/purchase-bills")}
                >
                  <Package className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Purchase Dashboard</span>
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2">
            <LabelCalibrationUI
              values={{
                xOffset: precisionSettings.xOffset,
                yOffset: precisionSettings.yOffset,
                vGap: precisionSettings.vGap,
                hGap: precisionSettings.hGap,
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
                  hGap: vals.hGap,
                  labelWidth: vals.labelWidth,
                  labelHeight: vals.labelHeight,
                  thermalCols: vals.thermalCols || 1,
                }))
              }
              presets={dbPresets}
              onSavePreset={upsertAndActivatePrinterPreset}
              onDeletePreset={async (presetId) => {
                if (!currentOrganization?.id) return;
                try {
                  await deletePrinterPreset(currentOrganization.id, presetId);
                } catch {
                  toast.error("Failed to delete preset");
                  return;
                }
                toast.success("Preset deleted");
                setDbPresets((prev) => prev.filter((p) => p.id !== presetId));
              }}
              onSetDefault={handleSetDefaultPreset}
              onSetTemplateDefault={handleSetTemplateDefault}
              defaultTemplateName={defaultPresetNameForMode}
              onLoadPreset={handlePrecisionPresetLoad}
              labelConfig={effectivePrecisionLabelConfig}
              savedTemplates={savedLabelTemplates}
              printMode={precisionSettings.printMode}
              a4Cols={precisionSettings.a4Cols}
              a4Rows={precisionSettings.a4Rows}
              onPrintModeChange={requestPrintModeChange}
              noDefaultForModeHint={noDefaultForModeHint}
              onA4ColsChange={(cols) => setPrecisionSettings((prev) => ({ ...prev, a4Cols: cols }))}
              onA4RowsChange={(rows) => setPrecisionSettings((prev) => ({ ...prev, a4Rows: rows }))}
              sampleItem={labelItems.length > 0 ? { ...labelItems[0], businessName } : undefined}
              fullWorkspace
              activePresetValue={activePrecisionTemplateName}
              onOpenBackupRestore={() => setBackupRestoreOpen(true)}
              footwearDesign={footwearDesign}
              onFootwearDesignChange={handleFootwearDesignChange}
            />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="designer" className="mt-0 flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
          <div className="border rounded-md flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
              <h2 className="text-sm font-semibold">Label Designer</h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setBackupRestoreOpen(true)}
              >
                <History className="h-3.5 w-3.5" />
                Backup &amp; Restore
              </Button>
              {activePrecisionTemplateName && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[11px] font-medium text-green-700 dark:text-green-400">
                    {activePrecisionTemplateName.replace('preset:', '')}
                  </span>
                </div>
              )}
            
            {/* Template Selector for Designer */}
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[200px] ml-auto">
              <Select 
                value={activePrecisionTemplateName || ""} 
                onValueChange={(name) => {
                    if (name.startsWith("preset:")) {
                      const presetName = name.replace("preset:", "");
                      const preset = dbPresets.find((p) => labelDesignNamesMatch(p.name, presetName));
                      const matchingTemplate = savedLabelTemplates.find((t) =>
                        labelDesignNamesMatch(t.name, presetName),
                      );
                      const fixedDims = getFixedBuiltinLabelDimensions(presetName);
                      const labelConfig = resolvePresetLabelConfig(
                        presetName,
                        preferSavedLabelConfig(matchingTemplate?.config, preset?.labelConfig),
                      );
                      if (
                        preset ||
                        isRanawatBlingPresetName(presetName) ||
                        isRetailNarrowPresetName(presetName) ||
                        isFixedBuiltinLabelPreset(presetName) ||
                        isBoutiqueGridPresetName(presetName)
                      ) {
                        handlePrecisionPresetLoad({
                          name: presetName,
                          xOffset: preset?.xOffset ?? precisionSettings.xOffset,
                          yOffset: preset?.yOffset ?? precisionSettings.yOffset,
                          vGap: preset?.vGap ?? precisionSettings.vGap,
                          hGap: preset?.hGap ?? precisionSettings.hGap,
                          width: fixedDims?.width ?? preset?.width ?? precisionSettings.labelWidth,
                          height: fixedDims?.height ?? preset?.height ?? precisionSettings.labelHeight,
                          labelConfig,
                          printMode: preset?.printMode,
                          thermalCols: preset?.thermalCols,
                          a4Cols: preset?.a4Cols,
                          a4Rows: preset?.a4Rows,
                        });
                        toast.success(`Preset "${presetName}" loaded`);
                      }
                      return;
                    }
                    const template = savedLabelTemplates.find((t) => labelDesignNamesMatch(t.name, name));
                    if (template) {
                      const templateDims = resolveTemplateLabelDimensions(template);
                      handlePrecisionPresetLoad({
                        name: template.name,
                        xOffset: precisionSettings.xOffset,
                        yOffset: precisionSettings.yOffset,
                        vGap: precisionSettings.vGap,
                        hGap: precisionSettings.hGap,
                        width: templateDims?.width ?? template.labelWidth ?? precisionSettings.labelWidth,
                        height: templateDims?.height ?? template.labelHeight ?? precisionSettings.labelHeight,
                        labelConfig: template.config,
                        printMode: precisionSettings.printMode,
                        thermalCols: precisionSettings.thermalCols,
                        a4Cols: precisionSettings.a4Cols,
                        a4Rows: precisionSettings.a4Rows,
                      });
                      toast.success(`Template "${name}" loaded`);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select a template to edit..." />
                  </SelectTrigger>
                  <SelectContent>
                    {precisionSettings.printMode === "thermal" && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">📌 Built-in (1-Up)</div>
                        <SelectItem value="preset:kidszone" className="text-xs">
                          kidszone (50×40mm) — fixed layout
                        </SelectItem>
                        <SelectItem value="preset:jewellery" className="text-xs">
                          Jewellery Tag (100×15mm 1UP) — fixed layout
                        </SelectItem>
                        <SelectItem value="preset:boutique-grid" className="text-xs">
                          Boutique Grid (50×38mm) — STYLE BOUTIQUE KEY:VALUE
                        </SelectItem>
                        <SelectItem value={`preset:${RANAWAT_BLING_TEMPLATE_NAME}`} className="text-xs">
                          BLING JEWELLERY LABEL (100×15mm 1UP)
                        </SelectItem>
                        <SelectItem value={`preset:${RETAIL_NARROW_TEMPLATE_NAME}`} className="text-xs">
                          Retail Narrow (50×25mm) — condensed, editable
                        </SelectItem>
                      </>
                    )}
                    {showDesignerLabelTemplates &&
                    savedLabelTemplates.length === 0 &&
                    designerPresetsForMode.length === 0 &&
                    precisionSettings.printMode !== "thermal" ? (
                      <div className="px-2 py-2 text-xs text-muted-foreground">
                        No saved designs for {getPrecisionThermalModeLabel(precisionSettings.printMode)} mode.
                      </div>
                    ) : (
                      <>
                        {showDesignerLabelTemplates && savedLabelTemplates.length > 0 && (
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
                        {designerPresetsForMode.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">🖨️ Printer Presets</div>
                            {designerPresetsForMode.map((p) => (
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
              {activePrecisionTemplateName && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="h-8 text-xs px-2"
                  onClick={() => setActivePrecisionTemplateName(null)}
                >
                  ✕
                </Button>
              )}
              {!isPrecisionFootwearMode(precisionSettings.printMode) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs px-2"
                  onClick={() => setShowFullscreenDesigner(true)}
                  title="Open Label Designer in a full-screen window"
                >
                  <Maximize2 className="h-3.5 w-3.5 mr-1.5" />
                  Label Designer
                </Button>
              )}
            </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-2">
            {(!precisionConfigReady || isLoadingSettings) ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">Loading label design...</span>
              </div>
            ) : (
            <>
            {isPrecisionFootwearMode(precisionSettings.printMode) ? (
            <FootwearPanelDesigner
              design={footwearDesign}
              onChange={handleFootwearDesignChange}
              onSave={handleFootwearDesignSave}
              isSaving={savingFootwearDesign}
              sampleItem={labelItems.length > 0 ? labelItems[0] : undefined}
              businessName={businessName}
              className="flex-1 min-h-0"
            />
            ) : (
            <PrecisionLabelDesigner
              labelWidth={effectivePrecisionLabelWidth}
              labelHeight={effectivePrecisionLabelHeight}
              config={effectivePrecisionLabelConfig}
              thermalCols={getPrecisionThermalCols(precisionSettings.printMode, precisionSettings.thermalCols)}
              horizontalGap={isThermalMultiUp() ? getThermalMultiUpGap() : 0}
              onConfigChange={handlePrecisionDesignerConfigChange}
              sampleItem={labelItems.length > 0 ? { ...labelItems[0], businessName } : undefined}
              defaultUom={defaultUom}
              productFieldSettings={productFieldSettings}
              onSave={async () => {
                try {
                  await persistPrecisionLabelDesignerSave();
                } catch (error) {
                  console.error("Failed to save label design:", error);
                  toast.error("Failed to save label design");
                }
              }}
            />
            )}
            </>
            )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
      </main>

      {/* Independent, full-screen Label Designer — same component and save
          logic as the embedded panel above, just given proper room to work
          instead of a cramped in-page panel. */}
      <Dialog open={showFullscreenDesigner} onOpenChange={setShowFullscreenDesigner}>
        <DialogContent className="max-w-[98vw] w-full h-[95vh] max-h-[95vh] flex flex-col p-4">
          <DialogHeader className="shrink-0">
            <DialogTitle>Label Designer</DialogTitle>
            <DialogDescription>
              Design and save your label layout. Changes here are the same design used on the
              main Barcode Printing page.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            {(!precisionConfigReady || isLoadingSettings) ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">Loading label design...</span>
              </div>
            ) : !isPrecisionFootwearMode(precisionSettings.printMode) ? (
            <PrecisionLabelDesigner
              labelWidth={effectivePrecisionLabelWidth}
              labelHeight={effectivePrecisionLabelHeight}
              config={effectivePrecisionLabelConfig}
              thermalCols={getPrecisionThermalCols(precisionSettings.printMode, precisionSettings.thermalCols)}
              horizontalGap={isThermalMultiUp() ? getThermalMultiUpGap() : 0}
              onConfigChange={handlePrecisionDesignerConfigChange}
              sampleItem={labelItems.length > 0 ? { ...labelItems[0], businessName } : undefined}
              defaultUom={defaultUom}
              productFieldSettings={productFieldSettings}
              onSave={async () => {
                try {
                  await persistPrecisionLabelDesignerSave();
                } catch (error) {
                  console.error("Failed to save label design:", error);
                  toast.error("Failed to save label design");
                }
              }}
            />
            ) : (
              <FootwearPanelDesigner
                design={footwearDesign}
                onChange={handleFootwearDesignChange}
                onSave={handleFootwearDesignSave}
                isSaving={savingFootwearDesign}
                sampleItem={labelItems.length > 0 ? labelItems[0] : undefined}
                businessName={businessName}
                className="flex-1 min-h-0"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sticky print bar — always visible without scrolling */}
      <BarcodePrintFooter
        onPreview={handlePreview}
        onPrint={handlePrint}
        printDisabled={settingsLoading || isLoadingSettings || isPrecisionPrintRunning || labelItems.every((i) => !i.qty)}
        settingsLoading={settingsLoading}
        printing={isPrecisionPrintRunning}
        settingsStale={settingsLoadStale}
        onRetrySettings={retryBarcodeSettingsLoad}
        onTestLabel={
          (precisionSettings.enabled || activeBarTab === "precision" || activeBarTab === "designer") &&
          !isPrecisionFootwearMode(precisionSettings.printMode)
            ? handleTestPrint
            : undefined
        }
        onDirectPrint={
          isThermal1Up() || sheetType === "precision_pro_tsc" || sheetType === "custom"
            ? () => setIsDirectPrintDialogOpen(true)
            : undefined
        }
        onPdf={handleExportPDF}
        saveDefault={
          activeBarTab === "standard"
            ? { isDefault: !!selectedLabelTemplate && isTemplateDefault(selectedLabelTemplate), onClick: handleSaveAsDefault }
            : undefined
        }
        calibrate={
          (precisionSettings.enabled || activeBarTab === "precision" || activeBarTab === "designer") && (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="barcode-print-footer-btn-outline h-9 border-orange-400/70 text-orange-100 bg-orange-950/40 hover:bg-orange-900/60 hover:text-orange-50"
              >
                Calibrate
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
                  hGap: precisionSettings.hGap,
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
                    hGap: vals.hGap,
                    labelWidth: vals.labelWidth,
                    labelHeight: vals.labelHeight,
                    thermalCols: vals.thermalCols || 1,
                  }))
                }
                presets={dbPresets}
                onSavePreset={upsertAndActivatePrinterPreset}
                onDeletePreset={async (presetId) => {
                  if (!currentOrganization?.id) return;
                  try {
                    await deletePrinterPreset(currentOrganization.id, presetId);
                  } catch {
                    toast.error("Failed to delete preset");
                    return;
                  }
                  toast.success("Preset deleted");
                  setDbPresets((prev) => prev.filter((p) => p.id !== presetId));
                }}
                onSetDefault={handleSetDefaultPreset}
                onSetTemplateDefault={handleSetTemplateDefault}
                defaultTemplateName={defaultPresetNameForMode}
                onLoadPreset={handlePrecisionPresetLoad}
                labelConfig={effectivePrecisionLabelConfig}
                savedTemplates={savedLabelTemplates}
                sampleItem={labelItems.length > 0 ? { ...labelItems[0], businessName } : undefined}
                activePresetValue={activePrecisionTemplateName}
                footwearDesign={footwearDesign}
                onFootwearDesignChange={handleFootwearDesignChange}
              />
            </DialogContent>
          </Dialog>
        )
        }
      />

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
                    {isPrecisionFootwearMode(precisionSettings.printMode)
                      ? (() => {
                          const forms = labelItems.reduce((s, i) => s + (i.qty || 0), 0);
                          return `Total: ${forms} forms · ${forms * 3} stickers (box + 2 pairs each)`;
                        })()
                      : `Total: ${labelItems.reduce((s, i) => s + (i.qty || 0), 0)} labels`}
                  </div>
                  {isPrecisionFootwearMode(precisionSettings.printMode) ? (
                    <div className="flex flex-col items-center gap-4">
                      {labelItems
                        .filter((i) => (i.qty || 0) > 0)
                        .flatMap((item, idx) =>
                          Array.from({ length: item.qty || 1 }, (_, qi) => (
                            <PrecisionProTSCPreview
                              key={`fw-${idx}-${qi}`}
                              item={item}
                              businessName={businessName}
                              scaleFactor={1.5}
                              design={footwearDesign}
                            />
                          )),
                        )}
                    </div>
                  ) : isPrecisionThermalSheetMode(precisionSettings.printMode) ? (
                    <div className="flex flex-col items-center gap-4">
                      {(() => {
                        const expanded: LabelItem[] = [];
                        labelItems
                          .filter((i) => (i.qty || 0) > 0)
                          .forEach((item) => {
                            for (let q = 0; q < (item.qty || 0); q++) {
                              expanded.push({ ...item, businessName });
                            }
                          });
                        const cols = getPrecisionThermalCols(precisionSettings.printMode, precisionSettings.thermalCols);
                        const rows: LabelItem[][] = [];
                        for (let i = 0; i < expanded.length; i += cols) {
                          rows.push(expanded.slice(i, i + cols));
                        }
                        return rows.map((row, rowIdx) => (
                          <div key={rowIdx} className="border border-dashed border-border">
                            <PrecisionThermalRowPreview
                              items={row}
                              labelWidth={effectivePrecisionLabelWidth}
                              labelHeight={effectivePrecisionLabelHeight}
                              xOffset={precisionSettings.xOffset}
                              yOffset={precisionSettings.yOffset}
                              horizontalGap={cols > 1 ? getThermalMultiUpGap() : 0}
                              thermalCols={cols}
                              config={effectivePrecisionLabelConfig}
                              scaleFactor={2}
                              productFieldSettings={productFieldSettings}
                            />
                          </div>
                        ));
                      })()}
                    </div>
                  ) : (
                    <PrecisionA4SheetPrint
                      items={labelItems.filter(i => (i.qty || 0) > 0).map(i => ({ ...i, businessName }))}
                      labelWidth={effectivePrecisionLabelWidth}
                      labelHeight={effectivePrecisionLabelHeight}
                      cols={precisionSettings.a4Cols}
                      rows={precisionSettings.a4Rows}
                      xOffset={precisionSettings.xOffset}
                      yOffset={precisionSettings.yOffset}
                      vGap={precisionSettings.vGap}
                      columnGap={getA4ColumnGap()}
                      config={effectivePrecisionLabelConfig}
                      startPosition={startPosition}
                      productFieldSettings={productFieldSettings}
                      sheetType={sheetType}
                    />
                  )}
                </>
              )}
            </div>
          ) : sheetType === "precision_pro_tsc" ? (
            <div className="mt-4 border rounded-md p-4 bg-white overflow-auto">
              <div className="mb-3 p-3 rounded-lg text-center font-bold text-sm" style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}>
                {(() => {
                  const forms = labelItems.reduce((s, i) => s + (i.qty || 0), 0);
                  const fw = footwearFormSizeMm(resolveFootwearFormDesign(footwearDesign).layout);
                  return `Total: ${forms} forms · ${forms * 3} stickers (${fw.widthMm}×${fw.heightMm}mm box + pair)`;
                })()}
              </div>
              <div className="flex flex-col items-center gap-4">
                {labelItems
                  .filter((i) => (i.qty || 0) > 0)
                  .flatMap((item, idx) =>
                    Array.from({ length: item.qty || 1 }, (_, qi) => (
                      <PrecisionProTSCPreview
                        key={`${idx}-${qi}`}
                        item={item}
                        businessName={businessName}
                        scaleFactor={1.5}
                        design={footwearDesign}
                      />
                    )),
                  )}
              </div>
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

      {/* Unsaved design guard when switching print mode */}
      <AlertDialog
        open={modeSwitchConfirmOpen}
        onOpenChange={(open) => {
          setModeSwitchConfirmOpen(open);
          if (!open) pendingPrintModeSwitchRef.current = null;
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved label design</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in the Label Designer for &ldquo;{activePrecisionTemplateBaseName}&rdquo;.
              Save the design or discard before switching print mode.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button type="button" variant="outline" onClick={() => void handleSaveFirstModeSwitch()}>
              Save design
            </Button>
            <AlertDialogAction onClick={handleDiscardModeSwitch}>
              Discard and switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Windows app: confirm barcode qty before Precision Pro print */}
      <AlertDialog open={precisionPrintConfirmOpen} onOpenChange={setPrecisionPrintConfirmOpen}>
        <AlertDialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            setTimeout(() => precisionPrintOkRef.current?.focus(), 50);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isPrecisionPrintRunning) {
              e.preventDefault();
              void handleConfirmPrecisionPrint();
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Confirm Barcode Print
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-base text-foreground">
                <p>
                  You Are Printing barcode Qty{" "}
                  <span className="font-bold tabular-nums text-primary">{precisionPrintConfirmQty}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Press OK or Enter to continue. Load labels in the printer manually if needed.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPrecisionPrintRunning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              ref={precisionPrintOkRef}
              disabled={isPrecisionPrintRunning}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmPrecisionPrint();
              }}
            >
              {isPrecisionPrintRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Printing...
                </>
              ) : (
                "OK"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
          saleDiscPercent: item.sale_disc_percent,
          barcode: item.barcode,
          billNumber: item.bill_number,
          purchaseCode: item.purchase_code,
          supplierCode: item.supplier_code,
          style: item.style,
          category: item.category,
          quantity: item.qty ?? 1,
        }))}
        labelSize={
          isPrecisionFootwearMode(precisionSettings.printMode) || sheetType === "precision_pro_tsc"
            ? "precision_pro_tsc"
            : sheetType === "custom"
              ? `custom_${customWidth}x${customHeight}`
              : sheetType
        }
        labelConfig={labelConfig}
        businessName={businessName}
        footwearDesign={footwearDesign}
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
            active={printPageActive}
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
          {isPrecisionFootwearMode(precisionSettings.printMode) ? (
            <div ref={precisionPrintRef}>
              {labelItems
                .filter((i) => (i.qty || 0) > 0)
                .flatMap((item, idx) =>
                  Array.from({ length: item.qty || 1 }, (_, qi) => (
                    <div className="precision-thermal-page" key={`fw-${idx}-${qi}`}>
                      <div className="precision-label-container">
                        <PrecisionProTSCPreview
                          item={item}
                          businessName={businessName}
                          scaleFactor={1}
                          design={footwearDesign}
                        />
                      </div>
                    </div>
                  )),
                )}
            </div>
          ) : isPrecisionThermalSheetMode(precisionSettings.printMode) ? (
            <PrecisionThermalPrint
              ref={precisionPrintRef}
              items={labelItems.filter(i => (i.qty || 0) > 0).map(i => ({ ...i, businessName }))}
              labelWidth={effectivePrecisionLabelWidth}
              labelHeight={effectivePrecisionLabelHeight}
              xOffset={precisionSettings.xOffset}
              yOffset={precisionSettings.yOffset}
              vGap={precisionSettings.vGap}
              config={effectivePrecisionLabelConfig}
              thermalCols={getPrecisionThermalCols(precisionSettings.printMode, precisionSettings.thermalCols)}
              horizontalGap={getThermalMultiUpGap()}
              active={printPageActive}
              productFieldSettings={productFieldSettings}
            />
          ) : (
            <PrecisionA4SheetPrint
              ref={precisionPrintRef}
              items={labelItems.filter(i => (i.qty || 0) > 0).map(i => ({ ...i, businessName }))}
              labelWidth={effectivePrecisionLabelWidth}
              labelHeight={effectivePrecisionLabelHeight}
              cols={precisionSettings.a4Cols}
              rows={precisionSettings.a4Rows}
              xOffset={precisionSettings.xOffset}
              yOffset={precisionSettings.yOffset}
              vGap={precisionSettings.vGap}
              columnGap={getA4ColumnGap()}
              config={effectivePrecisionLabelConfig}
              startPosition={startPosition}
              active={printPageActive}
              productFieldSettings={productFieldSettings}
              sheetType={sheetType}
            />
          )}
        </div>
      ) : (
        <div id="printArea" className="hidden"></div>
      )}

      {!precisionSettings.enabled && printPageActive && <style>{`
        ${LABEL_NARROW_FONT_FACE_CSS}
        #printArea {
          width: ${isThermal1Up() ? `${sheetType === "custom" ? customWidth : parseFloat(sheetPresets[sheetType].width)}mm` : '210mm'};
          min-height: ${isThermal1Up() ? `${sheetType === "custom" ? customHeight : parseFloat(sheetPresets[sheetType].height)}mm` : '297mm'};
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
            ? `${sheetType === "custom" ? customWidth : parseFloat(sheetPresets[sheetType].width)}mm ${sheetType === "custom" ? customHeight : parseFloat(sheetPresets[sheetType].height)}mm` 
            : 'A4 portrait'}; 
          /* A4 die-cut grids position via label-grid margins (computeA4SheetMargins).
             Do NOT also put topOffset into @page — that double-shifted the sheet. */
          margin: 0mm !important;
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
            width: ${isThermal1Up() ? `${(sheetType === "custom" ? customWidth : parseFloat(sheetPresets[sheetType].width)) + leftOffset + rightOffset}mm` : '210mm'} !important;
            min-height: auto !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          
          #printArea .label-grid,
          #printArea .thermal-page {
            ${isThermal1Up() ? `
              display: block !important;
              width: ${sheetType === "custom" ? customWidth : parseFloat(sheetPresets[sheetType].width)}mm !important;
              height: ${sheetType === "custom" ? customHeight : parseFloat(sheetPresets[sheetType].height)}mm !important;
              min-height: ${sheetType === "custom" ? customHeight : parseFloat(sheetPresets[sheetType].height)}mm !important;
              max-height: ${sheetType === "custom" ? customHeight : parseFloat(sheetPresets[sheetType].height)}mm !important;
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
              overflow: hidden !important;
              box-sizing: border-box !important;
              position: relative !important;
            ` : `
              page-break-after: auto;
            `}
          }

          #printArea .label-grid:last-child,
          #printArea .thermal-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          
          #printArea .label-cell {
            page-break-inside: avoid;
            break-inside: avoid-page;
            overflow: ${isThermal1Up() ? "hidden" : hasAbsolutePositioning(labelConfig) ? "visible" : "hidden"} !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            ${isThermal1Up() ? `
              position: relative !important;
              display: block !important;
              -webkit-text-stroke: 0.3px black;
              line-height: inherit !important;
              width: ${sheetType === "custom" ? customWidth : parseFloat(sheetPresets[sheetType].width)}mm !important;
              height: ${sheetType === "custom" ? customHeight : parseFloat(sheetPresets[sheetType].height)}mm !important;
              min-height: ${sheetType === "custom" ? customHeight : parseFloat(sheetPresets[sheetType].height)}mm !important;
              padding: 0 !important;
              margin: 0 !important;
              box-sizing: border-box !important;
            ` : ''}
          }

          ${isThermal1Up() && hasAbsolutePositioning(labelConfig) ? `
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

      <PrinterPresetBackupDialog
        open={backupRestoreOpen}
        onOpenChange={setBackupRestoreOpen}
        organizationId={currentOrganization?.id}
        organizationName={businessName || currentOrganization?.name || "organization"}
        presets={dbPresets
          .filter((p) => p.id)
          .map((p) => ({ id: p.id!, name: p.name, width: p.width, height: p.height }))}
        activePresetName={activePrecisionTemplateName}
        sampleItem={labelItems.length > 0 ? { ...labelItems[0], businessName } : undefined}
        productFieldSettings={productFieldSettings}
        onPresetsChanged={handlePresetsChangedAfterBackup}
      />
    </div>
  );
}
