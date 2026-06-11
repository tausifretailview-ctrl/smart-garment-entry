import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { isDecimalUOM } from "@/constants/uom";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/hooks/useSettings";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalculatorInput } from "@/components/ui/calculator-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, ShoppingCart, Plus, X, CalendarIcon, Copy, Printer, ChevronDown, FileSpreadsheet, ChevronLeft, ChevronRight, Check, AlertTriangle, SkipBack, Search, Save, Trash2, Pencil, Lock, LockOpen } from "lucide-react";
import { applyGarmentGstRule, type GarmentGstRuleSettings } from "@/utils/gstRules";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { cn, sortSearchResults } from "@/lib/utils";
import { entryPageMainClass, entryPageSectionX, entryPageShellClass } from "@/lib/entryPageLayout";
import {
  clearPurchaseEntrySession,
  getOrCreatePurchaseEntryTabInstanceId,
  hasPurchaseEntryDraftInBrowser,
  isDocumentReload,
  markPurchaseEntryNavHandled,
  markPurchaseEntryUnmountNavKey,
  omitNewBillNavigationState,
  PURCHASE_DRAFT_DISCARDED_EVENT,
  dispatchPurchaseDraftSaved,
  readPurchaseEntryDraftMeta,
  readPurchaseEntrySnapshotAsync,
  wasPurchaseEntryNavHandled,
  wasPurchaseEntryRemount,
  writePurchaseEntrySnapshot,
  type PurchaseDraftDiscardedDetail,
  type PurchaseEntrySnapshot,
} from "@/lib/purchaseEntryPersistence";
import { useEntryViewportSync } from "@/hooks/useEntryViewportSync";
import { formatPurchaseBillEntryAt, getPurchaseBillEntryAt } from "@/lib/purchaseBillEntryAt";
import { CameraScanButton } from "@/components/CameraBarcodeScannerDialog";
import { printBarcodesDirectly } from "@/utils/barcodePrinter";
import { ExcelImportDialog, ImportProgress } from "@/components/ExcelImportDialog";
import {
  purchaseBillFields,
  purchaseBillSampleData,
  parseExcelDate,
  parseLocalizedNumber,
  normalizeImportBarcode,
  roundMoney,
  normalizePurchaseUnitPrice,
  computePurchaseLineSubTotal,
  computePurchaseBillGst,
  computePurchaseBillTotals,
  getPurchaseLineMultiplier,
  isPurchaseFreightOrChargeRow,
  extractChargeAmountFromRow,
} from "@/utils/excelImportUtils";
import { validatePurchaseBill } from "@/lib/validations";
import { SizeGridDialog } from "@/components/SizeGridDialog";
import { ProductEntryDialogGate } from "@/components/ProductEntryDialogGate";
import { prefetchProductEntryDialog } from "@/lib/productEntryDialogLoad";
import ProductEditPanel from "@/components/ProductEditPanel";
import QuickEditPopover from "@/components/QuickEditPopover";
import { PriceUpdateConfirmDialog } from "@/components/PriceUpdateConfirmDialog";
import { AddSupplierDialog } from "@/components/AddSupplierDialog";
import { useDraftSave } from "@/hooks/useDraftSave";
import { useDashboardInvalidation } from "@/hooks/useDashboardInvalidation";
import {
  incrementSupplierInvoiceNumber,
  nextSupplierInvoiceNumberFromLastBill,
} from "@/utils/purchaseSupplierInvoiceNumber";
import { checkBarcodeExists } from "@/utils/barcodeValidation";
import { IMEIScanDialog } from "@/components/IMEIScanDialog";
import { RollEntryDialog } from "@/components/RollEntryDialog";
import { compareSizes } from "@/utils/sizeSort";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { logError, extractErrorInfo } from "@/lib/errorLogger";
import { fetchProductsByIds, fetchPurchaseItemsByBillId } from "@/utils/fetchAllRows";
import { DuplicatePurchaseBillDialog, type ExistingDuplicateBill } from "@/components/DuplicatePurchaseBillDialog";
import { deleteJournalEntryByReference, recordPurchaseJournalEntry } from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";

interface PriceChange {
  sku_id: string;
  product_name: string;
  size: string;
  barcode: string;
  field: "pur_price" | "sale_price" | "mrp";
  old_value: number;
  new_value: number;
}

interface ProductVariant {
  id: string;
  product_id: string;
  size: string;
  pur_price: number;
  sale_price: number;
  mrp?: number;
  barcode: string;
  product_name: string;
  brand: string;
  category: string;
  color: string;
  style: string;
  gst_per: number;
  hsn_code: string;
  size_range?: string | null;
  uom?: string;
}

interface LineItem {
  temp_id: string;
  product_id: string;
  sku_id: string; // variant id for stock tracking
  product_name: string;
  size: string;
  qty: number;
  pur_price: number;
  sale_price: number;
  mrp?: number;
  gst_per: number;
  hsn_code: string;
  barcode: string;
  discount_percent: number; // discount percentage
  line_total: number; // total after discount
  brand?: string;
  category?: string;
  color?: string;
  style?: string;
  uom?: string;
}

interface SizeQuantity {
  size: string;
  qty: number;
  variant_id: string;
  barcode: string;
}

interface SizeGridVariant {
  id: string;
  size: string;
  sale_price?: number;
  pur_price?: number;
  mrp?: number;
  barcode?: string;
  color?: string;
  stock_qty?: number;
}

// Helper function to format product description
const formatProductDescription = (item: {
  product_name: string;
  category?: string;
  brand?: string;
  style?: string;
  color?: string;
  size: string;
}) => {
  const parts = [item.product_name];
  if (item.style && item.style.trim() && item.style.trim() !== '-') parts.push(item.style);
  if (item.color && item.color.trim() && item.color.trim() !== '-') parts.push(item.color);
  if (item.brand && item.brand.trim() && item.brand.trim() !== '-') parts.push(item.brand);
  if (item.category && item.category.trim() && item.category.trim() !== '-') parts.push(item.category);
  return parts.join('-');
};

type ExcelImportLoadingState = {
  current: number;
  total: number;
  label: string;
};

function ExcelImportLoadingOverlay({ progress }: { progress: ExcelImportLoadingState }) {
  const pct =
    progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return (
    <div className="fixed inset-0 z-[70] bg-background/85 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card border rounded-xl shadow-xl p-6 w-[min(92vw,22rem)] space-y-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
          <div>
            <p className="font-semibold text-sm">Importing Excel items...</p>
            <p className="text-xs text-muted-foreground">{progress.label}</p>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Items loaded</span>
            <span className="font-mono tabular-nums">
              {progress.current.toLocaleString("en-IN")} / {progress.total.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-primary h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground pt-1">
            Please wait — do not save the bill until import completes.
          </p>
        </div>
      </div>
    </div>
  );
}

const normalizeSizeGridVariants = (variants: SizeGridVariant[]): SizeGridVariant[] => {
  const grouped = new Map<string, SizeGridVariant>();

  variants.forEach((variant) => {
    const color = (variant.color || "").trim();
    const size = (variant.size || "").trim();
    const key = `${color.toUpperCase()}||${size.toUpperCase()}`;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        ...variant,
        color,
        size,
        stock_qty: variant.stock_qty || 0,
      });
      return;
    }

    grouped.set(key, {
      ...existing,
      stock_qty: (existing.stock_qty || 0) + (variant.stock_qty || 0),
      pur_price: existing.pur_price || variant.pur_price,
      sale_price: existing.sale_price || variant.sale_price,
      mrp: existing.mrp || variant.mrp,
      barcode: existing.barcode || variant.barcode,
      id: existing.id || variant.id,
    });
  });

  return Array.from(grouped.values()).sort((a, b) => {
    const colorCompare = (a.color || "").localeCompare(b.color || "");
    if (colorCompare !== 0) return colorCompare;
    return compareSizes(a.size, b.size);
  });
};

const PurchaseEntry = () => {
  const { toast } = useToast();
  const { orgNavigate: navigate } = useOrgNavigation();
  const routerNavigate = useNavigate();
  const location = useLocation();
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { invalidatePurchases } = useDashboardInvalidation();
  const queryClient = useQueryClient();
  const { isColumnVisible } = useUserPermissions();
  const { hasSpecialPermission } = useUserPermissions();
  const [duplicateWarning, setDuplicateWarning] = useState<{ bill: ExistingDuplicateBill; reason: string } | null>(null);
  const overrideDuplicateRef = useRef(false);
  const showPurCol = {
    size: isColumnVisible('purchase_bill', 'size'),
    gst: isColumnVisible('purchase_bill', 'gst'),
    disc_percent: isColumnVisible('purchase_bill', 'disc_percent'),
    mrp: isColumnVisible('purchase_bill', 'mrp'),
  };
  const [loading, setLoading] = useState(false);
  const savingRef = useRef(false);
  const saveLockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SAVE_LOCK_MAX_MS = 120_000;
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductVariant[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showSizeGrid, setShowSizeGrid] = useState(false);
  const [sizeGridVariants, setSizeGridVariants] = useState<SizeGridVariant[]>([]);
  const [sizeQty, setSizeQty] = useState<{ [size: string]: number }>({});
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [entryMode, setEntryMode] = useState<"grid" | "inline">("grid");
  const [billDate, setBillDate] = useState<Date>(new Date());
  const [billDateOpen, setBillDateOpen] = useState(false);
  /** When this bill was first saved in EzzyERP (read-only after save). */
  const [billEntryAt, setBillEntryAt] = useState<string | null>(null);
  const [grossAmount, setGrossAmount] = useState(0);
  const [gstAmount, setGstAmount] = useState(0);
  const [netAmount, setNetAmount] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [savedPurchaseItems, setSavedPurchaseItems] = useState<LineItem[]>([]);
  const firstSizeInputRef = useRef<HTMLInputElement>(null);
  const lastQtyInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const inlineSearchInputRef = useRef<HTMLInputElement>(null);
  const isNavigatingForProductRef = useRef(false); // Track navigation to product entry
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [originalLineItems, setOriginalLineItems] = useState<LineItem[]>([]); // Store original items for comparison
  const isInitializingEditRef = useRef(false);
  const loadedEditBillIdRef = useRef<string | null>(null);
  const workRestoredRef = useRef(false);
  const draftDiscardedExternallyRef = useRef(false);
  /** Blocks debounced draft writes after a successful bill save (pending timeout race). */
  const purchaseSaveFinalizedRef = useRef(false);
  const autoSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabInstanceIdRef = useRef(getOrCreatePurchaseEntryTabInstanceId());
  const latestSnapshotRef = useRef<Record<string, unknown> | null>(null);
  /** Always-current ref so the newBill effect can call confirmDiscard without adding it to deps. */
  const confirmDiscardRef = useRef<() => boolean>(() => true);
  /** Skip duplicate snapshot rebuild right after Excel import / bulk restore. */
  const skipSnapshotEffectRef = useRef(false);
  const importJustAppliedRef = useRef(false);
  /** Non-null while an Excel import is in flight (set at import start, cleared at
   *  completion). Persisted into every draft snapshot/checkpoint so an interrupted
   *  import (refresh/tab close) leaves a marker — doSave hard-blocks saving such a
   *  partial draft, which previously silently truncated bills. */
  const pendingImportRef = useRef<{ expectedRows: number; expectedQty: number } | null>(null);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [showAddSupplierDialog, setShowAddSupplierDialog] = useState(false);
  // Inline search state for table row
  const [inlineSearchQuery, setInlineSearchQuery] = useState("");
  const [inlineSearchResults, setInlineSearchResults] = useState<ProductVariant[]>([]);
  const [inlineDisplayLimit, setInlineDisplayLimit] = useState(100);
  const [showInlineSearch, setShowInlineSearch] = useState(false);
  const [selectedInlineIndex, setSelectedInlineIndex] = useState(0);
  
  
  // Price update confirmation state
  const [showPriceUpdateDialog, setShowPriceUpdateDialog] = useState(false);
  const [detectedPriceChanges, setDetectedPriceChanges] = useState<PriceChange[]>([]);
  const [pendingPrintAfterPriceUpdate, setPendingPrintAfterPriceUpdate] = useState(false);
  
  // State for selective barcode printing
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set());
  const [pendingSaveItems, setPendingSaveItems] = useState<LineItem[]>([]);
  
  // Pagination for large bills
  const [visibleItemCount, setVisibleItemCount] = useState(100);
  const ITEMS_PER_PAGE = 100;
  
  // Draft loading state
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftLoadProgress, setDraftLoadProgress] = useState({ loaded: 0, total: 0 });
  const [isRestoringDraft, setIsRestoringDraft] = useState(false);

  // Excel import progress overlay (large files)
  const [excelImportLoading, setExcelImportLoading] = useState<ExcelImportLoadingState | null>(null);
  
  // State for tracking newly added items for smart barcode printing
  const [newlyAddedItems, setNewlyAddedItems] = useState<LineItem[]>([]);
  const [savedBillId, setSavedBillId] = useState<string | null>(null);
  const [savedSupplierId, setSavedSupplierId] = useState<string | null>(null);
  
  // Bill navigation state (like Sales Invoice)
  const [navBillIndex, setNavBillIndex] = useState<number | null>(null);
  const [isLoadingNavBill, setIsLoadingNavBill] = useState(false);
  
  // Barcode duplicate warning state
  const [barcodeWarnings, setBarcodeWarnings] = useState<Map<string, string>>(new Map());
  const barcodeCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper: For MTR/roll items, use meters (from size field) as multiplier instead of qty
  const getMtrMultiplier = (item: { uom?: string; size?: string; qty: number }): number => {
    if ((item.uom || '').toUpperCase() === 'MTR') {
      const meters = parseFloat(item.size || '');
      if (!isNaN(meters) && meters > 0) return meters;
    }
    return item.qty;
  };

  // Backfill missing uom on line items by fetching products.uom — fixes drafts/sessionStorage rows that lost uom
  const enrichItemsWithUom = async (items: any[]): Promise<any[]> => {
    if (!items || items.length === 0) return items;
    const missing = items.filter(it => !it.uom).map(it => it.product_id).filter(Boolean);
    const uniqIds = Array.from(new Set(missing));
    let uomMap: Record<string, string> = {};
    if (uniqIds.length > 0) {
      const { data } = await supabase.from('products').select('id, uom').in('id', uniqIds);
      (data || []).forEach((p: any) => { uomMap[p.id] = p.uom || 'NOS'; });
    }
    return items.map((it) => {
      const uom = it.uom || uomMap[it.product_id] || 'NOS';
      const merged = { ...it, uom };
      const sub = computePurchaseLineSubTotal(merged);
      const lineTotal = roundMoney(sub * (1 - (Number(merged.discount_percent) || 0) / 100));
      return { ...merged, line_total: lineTotal };
    });
  };

  // Product Edit Panel state
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [editPanelIndex, setEditPanelIndex] = useState(0);
  const [editPanelFocusField, setEditPanelFocusField] = useState<string | undefined>();
  const [updatedRows, setUpdatedRows] = useState<Set<string>>(new Set());

  // DC Purchase (Direct Cash / No GST) state
  const [isDcPurchase, setIsDcPurchase] = useState(false);

  // Bill lock state
  const [isBillLocked, setIsBillLocked] = useState(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);

  // Duplicate bill detection state
  const [showDuplicateBillWarning, setShowDuplicateBillWarning] = useState(false);
  const [duplicateBillInfo, setDuplicateBillInfo] = useState<{ bill_no: string; bill_date: string } | null>(null);
  const pendingSaveRef = useRef(false);

  // IMEI Scan Dialog state (Mobile ERP mode)
  const [showIMEIScanDialog, setShowIMEIScanDialog] = useState(false);
  const [imeiScanItem, setImeiScanItem] = useState<{ tempId: string; qty: number; item: LineItem } | null>(null);

  // Roll Entry Dialog state (MTR products)
  const [showRollEntryDialog, setShowRollEntryDialog] = useState(false);
  const [rollEntryProduct, setRollEntryProduct] = useState<any>(null);
  const [rollEntryColors, setRollEntryColors] = useState<string[]>([]);
  const [rollEntryRate, setRollEntryRate] = useState(0);

  const [billData, setBillData] = useState({
    supplier_id: "",
    supplier_name: "",
    supplier_invoice_no: "",
  });
  const [softwareBillNo, setSoftwareBillNo] = useState<string>("");

  // Draft save hook for auto-saving work in progress
  const {
    hasDraft,
    draftData,
    saveDraft,
    deleteDraft,
    updateCurrentData,
    startAutoSave,
    stopAutoSave,
  } = useDraftSave('purchase');

  const clearEntrySession = useCallback(() => {
    if (!currentOrganization?.id || !user?.id) return;
    clearPurchaseEntrySession(currentOrganization.id, user.id);
  }, [currentOrganization?.id, user?.id]);

  const resetToNewBill = useCallback(() => {
    if (autoSaveDebounceRef.current) {
      clearTimeout(autoSaveDebounceRef.current);
      autoSaveDebounceRef.current = null;
    }
    latestSnapshotRef.current = null;
    pendingImportRef.current = null;
    setLineItems([]);
    setBillData({ supplier_id: "", supplier_name: "", supplier_invoice_no: "" });
    setSoftwareBillNo("");
    setBillDate(new Date());
    setBillEntryAt(null);
    setOtherCharges(0);
    setRoundOff(0);
    setDiscountAmount(0);
    setEditingBillId(null);
    setIsEditMode(false);
    setOriginalLineItems([]);
    setNavBillIndex(null);
    setSavedBillId(null);
    setSavedPurchaseItems([]);
    setNewlyAddedItems([]);
    setSearchQuery("");
    setSearchResults([]);
    setShowSearch(false);
    setSelectedProduct(null);
    setShowPrintDialog(false);
    setBarcodeWarnings(new Map());
    setDetectedPriceChanges([]);
    setSelectedForPrint(new Set());
    setIsDcPurchase(false);
    setIsBillLocked(false);
    void deleteDraft();
    clearEntrySession();
    workRestoredRef.current = false;
    loadedEditBillIdRef.current = null;
    isInitializingEditRef.current = false;
    updateCurrentData(null);
  }, [clearEntrySession, deleteDraft, updateCurrentData]);

  // Dashboard "Discard draft" — entry tab may stay mounted in window tabs and would re-save otherwise.
  useEffect(() => {
    const onDraftDiscarded = (event: Event) => {
      const detail = (event as CustomEvent<PurchaseDraftDiscardedDetail>).detail;
      if (!detail || detail.orgId !== currentOrganization?.id || detail.userId !== user?.id) return;
      draftDiscardedExternallyRef.current = true;
      resetToNewBill();
    };
    window.addEventListener(PURCHASE_DRAFT_DISCARDED_EVENT, onDraftDiscarded);
    return () => window.removeEventListener(PURCHASE_DRAFT_DISCARDED_EVENT, onDraftDiscarded);
  }, [currentOrganization?.id, user?.id, resetToNewBill]);

  useEffect(() => {
    if (lineItems.length > 0) {
      draftDiscardedExternallyRef.current = false;
      purchaseSaveFinalizedRef.current = false;
    }
  }, [lineItems.length]);

  const hasUnsavedPurchaseLines = useCallback(
    () => lineItems.some((item) => item.qty > 0 && item.product_id),
    [lineItems],
  );

  const confirmDiscardUnsavedPurchase = useCallback(() => {
    if (!hasUnsavedPurchaseLines()) return true;
    return window.confirm(
      "You have an unsaved purchase bill. Start a new bill anyway? Your current draft will be removed.",
    );
  }, [hasUnsavedPurchaseLines]);

  // Keep the ref current so stable effects (newBill) always call the latest version.
  confirmDiscardRef.current = confirmDiscardUnsavedPurchase;

  const requestNewBill = useCallback(() => {
    if (!confirmDiscardUnsavedPurchase()) return;
    resetToNewBill();
  }, [confirmDiscardUnsavedPurchase, resetToNewBill]);

  const persistEntrySession = useCallback(
    (snapshot: PurchaseEntrySnapshot | null) => {
      if (!currentOrganization?.id || !user?.id) return;
      if (!snapshot?.lineItems?.length) {
        clearPurchaseEntrySession(currentOrganization.id, user.id);
        return;
      }
      writePurchaseEntrySnapshot(currentOrganization.id, user.id, snapshot);
    },
    [currentOrganization?.id, user?.id],
  );

  const notifyWorkRestored = useCallback(
    (data: { lineItems?: unknown[]; isEditMode?: boolean }) => {
      const count = Array.isArray(data?.lineItems) ? data.lineItems.length : 0;
      if (count === 0) return;
      toast({
        title: data.isEditMode ? "Unsaved edits restored" : "Unsaved draft restored",
        description: `${count} line item(s) loaded from your last session.`,
      });
    },
    [toast],
  );

  const buildEntrySnapshot = useCallback(() => {
    if (lineItems.length === 0) return null;
    return {
      billData,
      softwareBillNo,
      billDate: billDate.toISOString(),
      lineItems,
      roundOff,
      otherCharges,
      discountAmount,
      entryMode,
      isDcPurchase,
      isEditMode,
      editingBillId,
      originalLineItems,
      tabInstanceId: tabInstanceIdRef.current,
      savedAt: Date.now(),
      pendingImport: pendingImportRef.current,
    };
  }, [
    billData,
    softwareBillNo,
    billDate,
    lineItems,
    roundOff,
    otherCharges,
    discountAmount,
    entryMode,
    isDcPurchase,
    isEditMode,
    editingBillId,
    originalLineItems,
  ]);

  /** Persist immediately — used after Excel import before a window-tab switch can unmount. */
  const persistEntrySnapshotNow = useCallback(
    (overrides?: { lineItems?: LineItem[] }) => {
      const items = overrides?.lineItems ?? lineItems;
      if (items.length === 0) {
        latestSnapshotRef.current = null;
        updateCurrentData(null);
        clearEntrySession();
        return;
      }
      const snapshot = {
        billData,
        softwareBillNo,
        billDate: billDate.toISOString(),
        lineItems: items,
        roundOff,
        otherCharges,
        discountAmount,
        entryMode,
        isDcPurchase,
        isEditMode,
        editingBillId,
        originalLineItems,
        pendingImport: pendingImportRef.current,
      };
      latestSnapshotRef.current = snapshot;
      updateCurrentData(snapshot);
      persistEntrySession(snapshot);
      return saveDraft(snapshot, false);
    },
    [
      lineItems,
      billData,
      softwareBillNo,
      billDate,
      roundOff,
      otherCharges,
      discountAmount,
      entryMode,
      isDcPurchase,
      isEditMode,
      editingBillId,
      originalLineItems,
      updateCurrentData,
      persistEntrySession,
      clearEntrySession,
      saveDraft,
    ],
  );

  const finalizeSuccessfulPurchaseSave = useCallback(async () => {
    purchaseSaveFinalizedRef.current = true;
    if (autoSaveDebounceRef.current) {
      clearTimeout(autoSaveDebounceRef.current);
      autoSaveDebounceRef.current = null;
    }
    latestSnapshotRef.current = null;
    skipSnapshotEffectRef.current = true;
    importJustAppliedRef.current = false;
    pendingImportRef.current = null;
    await deleteDraft();
    updateCurrentData(null);
    clearEntrySession();
    if (currentOrganization?.id && user?.id) {
      dispatchPurchaseDraftSaved(currentOrganization.id, user.id);
    }
    invalidatePurchases();
  }, [
    clearEntrySession,
    currentOrganization?.id,
    deleteDraft,
    invalidatePurchases,
    updateCurrentData,
    user?.id,
  ]);

  const createLineItemRow = useCallback(
    (item: Omit<LineItem, "temp_id" | "line_total">): LineItem => {
      const effectiveGst = isDcPurchase ? 0 : item.gst_per;
      const subTotal = computePurchaseLineSubTotal(item);
      const discountAmt = roundMoney(subTotal * (item.discount_percent / 100));
      const lineTotal = roundMoney(subTotal - discountAmt);
      return {
        ...item,
        gst_per: effectiveGst,
        temp_id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(36).slice(2, 11)}_${Math.random().toString(36).slice(2, 11)}`,
        line_total: lineTotal,
      };
    },
    [isDcPurchase],
  );

  // Handle product edit panel updates
  const handleProductUpdated = useCallback((tempId: string, updates: Partial<LineItem>, applyToProductId?: string) => {
    const touched = new Set<string>();
    setLineItems(prev => prev.map(item => {
      // Apply to the edited row, OR to ALL rows of the same product in this bill
      const matches = item.temp_id === tempId || (applyToProductId && item.product_id === applyToProductId);
      if (!matches) return item;
      touched.add(item.temp_id);
      const merged = { ...item, ...updates };
      const sub = computePurchaseLineSubTotal(merged);
      return { ...merged, line_total: roundMoney(sub * (1 - item.discount_percent / 100)) };
    }));
    // Show updated badge briefly on all touched rows
    setUpdatedRows(prev => { const next = new Set(prev); touched.forEach(id => next.add(id)); return next; });
    setTimeout(() => {
      setUpdatedRows(prev => { const next = new Set(prev); touched.forEach(id => next.delete(id)); return next; });
    }, 3000);
  }, []);

  const openEditPanel = useCallback((index: number, focusField?: string) => {
    setEditPanelIndex(index);
    setEditPanelFocusField(focusField);
    setShowEditPanel(true);
  }, []);

  // Load draft data callback
  const loadDraftData = useCallback(async (data: any) => {
    if (!data) return;
    const items = data.lineItems || [];
    
    // Set bill metadata immediately
    setBillData(data.billData || { supplier_id: "", supplier_name: "", supplier_invoice_no: "" });
    setSoftwareBillNo(data.softwareBillNo || "");
    setBillDate(data.billDate ? new Date(data.billDate) : new Date());
    setOtherCharges(data.otherCharges || 0);
    setDiscountAmount(data.discountAmount || 0);
    setRoundOff(data.roundOff || 0);
    setEntryMode(data.entryMode || "grid");
    setIsDcPurchase(data.isDcPurchase || false);
    
    // Backfill uom from products table for any rows missing it (drafts saved before MTR fix)
    const enrichedItems = await enrichItemsWithUom(items);

    // Restore interrupted-import marker — keeps the doSave hard-block active across sessions.
    const pendingImport = (data as { pendingImport?: { expectedRows: number; expectedQty: number } | null })
      .pendingImport;
    pendingImportRef.current =
      pendingImport && Number(pendingImport.expectedQty) > 0
        ? { expectedRows: Number(pendingImport.expectedRows) || 0, expectedQty: Number(pendingImport.expectedQty) }
        : null;
    if (pendingImportRef.current) {
      const loadedQty = enrichedItems.reduce(
        (sum: number, item: any) => sum + (Number(item?.qty) || 0),
        0,
      );
      if (loadedQty + 0.5 < pendingImportRef.current.expectedQty) {
        toast({
          title: "Excel import was interrupted",
          description: `This draft has only ${loadedQty.toLocaleString("en-IN")} qty of the ${pendingImportRef.current.expectedQty.toLocaleString("en-IN")} qty in the Excel file. Saving is blocked — discard this draft and re-import the Excel file.`,
          variant: "destructive",
          duration: 15000,
        });
      } else {
        // Draft actually has everything (e.g. interrupted after last checkpoint) — clear marker.
        pendingImportRef.current = null;
      }
    }

    // Single update — no chunked progress overlay (table windowing handles render cost).
    skipSnapshotEffectRef.current = true;
    importJustAppliedRef.current = true;
    workRestoredRef.current = true;
    setVisibleItemCount(Math.min(enrichedItems.length, 200));
    setLineItems(enrichedItems);
    
    // Restore edit mode if draft was from an edit
    if (data.isEditMode && data.editingBillId) {
      setIsEditMode(true);
      setEditingBillId(data.editingBillId);
      loadedEditBillIdRef.current = data.editingBillId;
      setOriginalLineItems(data.originalLineItems || []);
    }
  }, []);

  const readPersistedSnapshot = useCallback(async () => {
    if (!currentOrganization?.id || !user?.id) return null;
    return readPurchaseEntrySnapshotAsync(currentOrganization.id, user.id);
  }, [currentOrganization?.id, user?.id]);

  const shouldDeferRestoreForNewBill = useCallback(() => {
    if (!location.state?.newBill) return false;
    if (wasPurchaseEntryRemount(location.key)) return false;
    if (wasPurchaseEntryNavHandled(location.key)) return false;
    if (
      isDocumentReload() &&
      currentOrganization?.id &&
      user?.id &&
      hasPurchaseEntryDraftInBrowser(currentOrganization.id, user.id)
    ) {
      return false;
    }
    return true;
  }, [location.key, location.state?.newBill, currentOrganization?.id, user?.id]);

  const restorePersistedWork = useCallback(
    async (options?: { notify?: boolean }) => {
      if (workRestoredRef.current) return false;
      if (location.state?.editBillId) return false;
      if (shouldDeferRestoreForNewBill()) return false;

      const orgId = currentOrganization?.id;
      const userId = user?.id;
      const mightHaveBrowserDraft = Boolean(
        orgId && userId && hasPurchaseEntryDraftInBrowser(orgId, userId),
      );
      const mightHaveDbDraft =
        Boolean(location.state?.loadDraft && hasDraft && draftData) ||
        Boolean(hasDraft && draftData?.lineItems?.length > 0);

      if (!orgId || !userId) {
        if (mightHaveBrowserDraft || mightHaveDbDraft) {
          setIsRestoringDraft(true);
        }
        return false;
      }

      if (mightHaveBrowserDraft || mightHaveDbDraft) {
        setIsRestoringDraft(true);
      }

      try {
        const persisted = await readPersistedSnapshot();
        if (persisted?.lineItems?.length) {
          workRestoredRef.current = true;
          await loadDraftData(persisted);
          if (options?.notify !== false) notifyWorkRestored(persisted);
          return true;
        }

        if (location.state?.loadDraft) {
          if (hasDraft && draftData) {
            workRestoredRef.current = true;
            await loadDraftData(draftData);
            notifyWorkRestored(draftData);
            await deleteDraft();
            return true;
          }
          return false;
        }

        if (hasDraft && draftData?.lineItems?.length > 0) {
          workRestoredRef.current = true;
          await loadDraftData(draftData);
          notifyWorkRestored(draftData);
          return true;
        }

        return false;
      } finally {
        setIsRestoringDraft(false);
      }
    },
    [
      currentOrganization?.id,
      user?.id,
      hasDraft,
      draftData,
      location.state?.editBillId,
      location.state?.loadDraft,
      readPersistedSnapshot,
      shouldDeferRestoreForNewBill,
      loadDraftData,
      deleteDraft,
      notifyWorkRestored,
    ],
  );

  // Show restoring hint on F5 before async IDB read completes.
  useLayoutEffect(() => {
    if (lineItems.length > 0 || workRestoredRef.current) return;
    const orgId = currentOrganization?.id;
    const userId = user?.id;
    if (!orgId || !userId) return;
    if (hasPurchaseEntryDraftInBrowser(orgId, userId) || readPurchaseEntryDraftMeta(orgId, userId)) {
      setIsRestoringDraft(true);
    }
  }, [currentOrganization?.id, user?.id, lineItems.length]);

  // Restore before paint when remounting the same history entry (minimize / PWA resume).
  useLayoutEffect(() => {
    void restorePersistedWork();
  }, [restorePersistedWork]);

  // Also restore when draft metadata arrives after mount.
  useEffect(() => {
    void restorePersistedWork();
  }, [restorePersistedWork]);

  useEntryViewportSync();

  // Keep flush-on-unmount in sync; defer on large bills to avoid blocking paint.
  useLayoutEffect(() => {
    if (skipSnapshotEffectRef.current) {
      skipSnapshotEffectRef.current = false;
      return;
    }
    if (lineItems.length > 500) {
      let cancelled = false;
      const syncSnapshot = () => {
        if (!cancelled) latestSnapshotRef.current = buildEntrySnapshot();
      };
      if (typeof requestIdleCallback !== "undefined") {
        const idleId = requestIdleCallback(syncSnapshot);
        return () => {
          cancelled = true;
          cancelIdleCallback(idleId);
        };
      }
      const timerId = window.setTimeout(syncSnapshot, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timerId);
      };
    }
    latestSnapshotRef.current = buildEntrySnapshot();
  }, [buildEntrySnapshot, lineItems.length]);

  // Debounced auto-save — prevents JSON serializing 1000+ items on every keystroke
  useEffect(() => {
    if (importJustAppliedRef.current) {
      importJustAppliedRef.current = false;
      return;
    }
    if (draftDiscardedExternallyRef.current || purchaseSaveFinalizedRef.current) return;

    const snapshot = buildEntrySnapshot();
    latestSnapshotRef.current = snapshot;

    if (autoSaveDebounceRef.current) clearTimeout(autoSaveDebounceRef.current);
    autoSaveDebounceRef.current = setTimeout(() => {
      if (purchaseSaveFinalizedRef.current || draftDiscardedExternallyRef.current) return;
      if (snapshot) {
        updateCurrentData(snapshot);
        persistEntrySession(snapshot);
      } else {
        updateCurrentData(null);
        clearEntrySession();
      }
    }, lineItems.length > 200 ? 1500 : 400);
    return () => {
      if (autoSaveDebounceRef.current) clearTimeout(autoSaveDebounceRef.current);
    };
  }, [
    buildEntrySnapshot,
    lineItems.length,
    updateCurrentData,
    persistEntrySession,
    clearEntrySession,
  ]);

  const flushEntryPersistence = useCallback(() => {
    if (draftDiscardedExternallyRef.current || purchaseSaveFinalizedRef.current) {
      updateCurrentData(null);
      clearEntrySession();
      return;
    }
    const snapshot = (latestSnapshotRef.current ?? buildEntrySnapshot()) as PurchaseEntrySnapshot | null;
    if (snapshot?.lineItems && Array.isArray(snapshot.lineItems) && snapshot.lineItems.length > 0) {
      latestSnapshotRef.current = snapshot;
      updateCurrentData(snapshot);
      persistEntrySession(snapshot);
      void saveDraft(snapshot, false);
      return;
    }
    updateCurrentData(null);
    clearEntrySession();
  }, [buildEntrySnapshot, updateCurrentData, persistEntrySession, clearEntrySession, saveDraft]);

  const clearNewBillNavigation = useCallback(() => {
    if (!location.state?.newBill) return;
    markPurchaseEntryNavHandled(location.key);
    // Use raw router navigate — orgNavigate would double-prefix /:orgSlug on location.pathname.
    routerNavigate(location.pathname, {
      replace: true,
      state: omitNewBillNavigationState(location.state),
    });
  }, [location.key, location.pathname, location.state, routerNavigate]);

  const lineItemsCountRef = useRef(lineItems.length);
  lineItemsCountRef.current = lineItems.length;
  const locationKeyRef = useRef(location.key);
  locationKeyRef.current = location.key;

  // Save immediately when leaving the tab, switching browser tabs, or closing the page.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushEntryPersistence();
        return;
      }
      if (document.visibilityState === "visible" && lineItemsCountRef.current === 0) {
        void restorePersistedWork({ notify: true });
      }
    };
    const onPageHide = () => {
      flushEntryPersistence();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
      markPurchaseEntryUnmountNavKey(locationKeyRef.current);
      flushEntryPersistence();
    };
  }, [flushEntryPersistence, restorePersistedWork]);
  
  // Memoize selectedForPrint as object for O(1) lookup without triggering re-renders
  const selectedForPrintObj = useMemo(
    () => Object.fromEntries([...selectedForPrint].map(id => [id, true])),
    [selectedForPrint]
  );
  
  // Keep the visible row window in sync when lines are added (draft restore can leave
  // visibleItemCount at 1 while lineItems grows — totals update but rows stay hidden).
  useEffect(() => {
    setVisibleItemCount((prev) => {
      if (lineItems.length === 0) return 100;
      if (lineItems.length <= 200) return Math.max(prev, lineItems.length);
      if (prev < lineItems.length) {
        return Math.min(prev + ITEMS_PER_PAGE, lineItems.length);
      }
      return prev;
    });
  }, [lineItems.length]);

  // Warm Add Product dialog chunk so first click does not cold-load on slow networks.
  useEffect(() => {
    prefetchProductEntryDialog();
  }, []);

  // Start auto-save once on mount. The useDraftSave hook itself persists the
  // latest currentDataRef on unmount and respects draftClearedRef, so we must
  // NOT re-save here on every dep change — doing so used to fire the cleanup
  // with stale closure values right after a successful save (deleteDraft +
  // setLineItems([])), re-creating the draft from the bill that was just saved.
  // That caused old saved bills to reappear in Drafts and recent unsaved
  // entries to be overwritten.
  useEffect(() => {
    startAutoSave();
    return () => {
      stopAutoSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Barcode duplicate warning check — debounced 600ms after lineItems change
  useEffect(() => {
    if (barcodeCheckTimerRef.current) clearTimeout(barcodeCheckTimerRef.current);
    if (!currentOrganization?.id || lineItems.length === 0) {
      setBarcodeWarnings(new Map());
      return;
    }
    barcodeCheckTimerRef.current = setTimeout(async () => {
      const warnings = new Map<string, string>();
      const barcodesToCheck = lineItems.filter(item => item.barcode && item.barcode.length > 6);

      // Collect all sku_ids in this bill to suppress cross-row false warnings
      const allBillSkuIds = new Set(lineItems.map(i => i.sku_id).filter(Boolean));

      // Detect REAL in-bill duplicates: same barcode on DIFFERENT variants (sku_ids)
      // Same barcode + same sku_id = same product added twice (OK, not a real duplicate)
      // Same barcode + different sku_id = genuine duplicate barcode problem
      const billBarcodeMap = new Map<string, { temp_id: string; sku_id: string }>();
      const inBillDuplicates = new Set<string>();
      for (const item of lineItems) {
        if (!item.barcode) continue;
        const existing = billBarcodeMap.get(item.barcode);
        if (existing) {
          // Only flag as duplicate if different variant (different sku_id)
          if (existing.sku_id !== item.sku_id) {
            inBillDuplicates.add(item.temp_id);
            inBillDuplicates.add(existing.temp_id);
          }
          // Same sku_id = same variant, not a real duplicate — skip
        } else {
          billBarcodeMap.set(item.barcode, { temp_id: item.temp_id, sku_id: item.sku_id });
        }
      }

      // Collect original bill's variant IDs to exclude from cross-bill check
      const originalSkuIds = new Set(
        (isEditMode ? originalLineItems : []).map(i => i.sku_id).filter(Boolean)
      );

      for (const item of barcodesToCheck) {
        // In-bill duplicate: same barcode on two different variants
        if (inBillDuplicates.has(item.temp_id)) {
          warnings.set(item.temp_id, `⚠️ Duplicate barcode in this bill — same barcode assigned to multiple items`);
          continue;
        }

        try {
          const { data } = await supabase.rpc('check_barcode_duplicate', {
            p_barcode: item.barcode,
            p_org_id: currentOrganization.id,
            p_exclude_variant_id: item.sku_id || null
          });
          if (data && data.length > 0) {
            // Filter out variants in THIS bill AND variants from the original bill being edited
            const realConflicts = (data as any[]).filter((d: any) => 
              !allBillSkuIds.has(d.variant_id) && !originalSkuIds.has(d.variant_id)
            );
            if (realConflicts.length > 0) {
              const existing = realConflicts[0];
              warnings.set(item.temp_id, `⚠️ Barcode already used: "${existing.product_name}" ${existing.size}${existing.color ? ' / ' + existing.color : ''} (Stock: ${existing.stock_qty})`);
            }
          }
        } catch { /* ignore */ }
      }
      setBarcodeWarnings(warnings);
    }, 600);
    return () => { if (barcodeCheckTimerRef.current) clearTimeout(barcodeCheckTimerRef.current); };
  }, [lineItems, currentOrganization?.id]);

  const { data: settings } = useSettings();

  const showMrp = ((settings?.purchase_settings as any)?.show_mrp || false) && showPurCol.mrp;
  const accountingEngineOn = isAccountingEngineEnabled(settings as { accounting_engine_enabled?: boolean } | null);
  
  // Barcode mode: 'auto' (default) or 'scan' (manual/manufacturer barcode)
  const barcodeMode = (settings?.purchase_settings as any)?.barcode_mode || 'auto';
  const isAutoBarcode = barcodeMode !== 'scan';
  const sameBarcodeSeriesEnabled = (settings?.purchase_settings as any)?.same_barcode_series === true;

  // Detect if a barcode was system-generated (belongs to this org's auto series)
  // System barcodes: orgNumber * 10000000 + sequence (e.g., org #9 → 90001001, 90001002...)
  // Branded/universal barcodes (Jockey, Rupa etc.) won't match this pattern
  const isSystemGeneratedBarcode = (barcode: string | null | undefined): boolean => {
    if (!barcode || !currentOrganization?.organization_number) return false;
    const num = parseInt(barcode, 10);
    if (isNaN(num)) return false;
    const orgNum = currentOrganization.organization_number;
    const rangeStart = orgNum * 10000000;
    const rangeEnd = (orgNum + 1) * 10000000;
    return num >= rangeStart && num < rangeEnd;
  };

  // Helper: create a new variant with a new barcode, copying fields from source
  const createNewVariantWithBarcode = async (source: {
    product_id: string; size: string; color?: string;
    pur_price?: number; sale_price?: number; mrp?: number;
  }): Promise<{ id: string; barcode: string } | null> => {
    try {
      const newBarcode = await generateCentralizedBarcode();
      const { data: newVariant, error } = await supabase
        .from("product_variants")
        .insert({
          organization_id: currentOrganization!.id,
          product_id: source.product_id,
          size: source.size || "",
          color: source.color || "",
          barcode: newBarcode,
          pur_price: source.pur_price || 0,
          sale_price: source.sale_price || 0,
          mrp: source.mrp || 0,
          stock_qty: 0,
          active: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: newVariant.id, barcode: newBarcode };
    } catch (error: any) {
      console.error("Failed to create new variant:", error);
      toast({
        title: "Warning",
        description: "Could not create new variant, reusing existing. " + (error.message || ""),
      });
      return null;
    }
  };
  
  const autoFocusSearch = (settings?.purchase_settings as any)?.auto_focus_search || false;
  const sizeGridReviewMode = (settings?.purchase_settings as any)?.size_grid_review_mode || false;
  const rollWiseMtrEntry = (settings?.purchase_settings as any)?.roll_wise_mtr_entry || false;
  const garmentGstSettings: GarmentGstRuleSettings = {
    garment_gst_rule_enabled: (settings?.purchase_settings as any)?.garment_gst_rule_enabled === true,
    garment_gst_threshold: (settings?.purchase_settings as any)?.garment_gst_threshold,
  };
  
  const focusSearchBar = useCallback(() => {
    if (autoFocusSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [autoFocusSearch]);
  
  // Check if barcode prompt is enabled (defaults to true if not set)
  const enableBarcodePrompt = (settings?.bill_barcode_settings as any)?.enable_barcode_prompt !== false;
  
  // Mobile ERP / IMEI mode
  const mobileERPSettings = (() => {
    const productSettings = settings?.product_settings as any;
    const merp = productSettings?.mobile_erp;
    if (!merp?.enabled) return null;
    return {
      enabled: true,
      imei_scan_enforcement: merp.imei_scan_enforcement ?? true,
      locked_size_qty: merp.locked_size_qty ?? true,
      imei_min_length: merp.imei_min_length ?? 4,
      imei_max_length: merp.imei_max_length ?? 25,
    };
  })();
  const isMobileERPMode = !!mobileERPSettings?.enabled;
  
  // Check if color field is enabled in product settings
  const isColorFieldEnabled = (() => {
    const productSettings = settings?.product_settings as any;
    if (!productSettings?.fields) return true; // Default to enabled if no settings
    return productSettings.fields.color?.enabled !== false;
  })();

  // Fetch suppliers with pagination
  const { data: suppliers = [], refetch: refetchSuppliers } = useQuery({
    queryKey: ["suppliers", currentOrganization?.id],
    queryFn: async () => {
      const allSuppliers: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from("suppliers")
          .select("id, supplier_name, phone, email, gst_number, address, opening_balance")
          .eq("organization_id", currentOrganization?.id)
          .is("deleted_at", null)
          .order("supplier_name")
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allSuppliers.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      return allSuppliers;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 300000, // 5 minutes - reduces multi-tab load
    refetchOnWindowFocus: false,
  });

  // Fetch last purchase bill for reference
  const { data: lastPurchaseBill } = useQuery({
    queryKey: ["last-purchase-bill", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("software_bill_no, supplier_invoice_no, supplier_name, bill_date")
        .eq("organization_id", currentOrganization?.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows found
      return data;
    },
    enabled: !!currentOrganization?.id && !isEditMode,
  });

  // Serial supplier invoice no from the last saved bill (same reference as the header "Sup Inv").
  const nextSupplierInvNo = useMemo(() => {
    if (isEditMode) return undefined;
    return nextSupplierInvoiceNumberFromLastBill(lastPurchaseBill?.supplier_invoice_no);
  }, [isEditMode, lastPurchaseBill?.supplier_invoice_no]);

  // Fetch all purchase bill IDs for navigation
  const { data: allBillIds } = useQuery({
    queryKey: ['all-purchase-bill-ids', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from('purchase_bills')
        .select('id, software_bill_no')
        .eq('organization_id', currentOrganization.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000,
  });

  // Load a purchase bill by ID (edit from dashboard or prev/next navigation)
  const loadBillById = useCallback(async (billId: string, options?: { usePageLoader?: boolean }) => {
    if (!currentOrganization?.id) return;
    if (isInitializingEditRef.current) return;
    if (loadedEditBillIdRef.current === billId) return;

    isInitializingEditRef.current = true;
    loadedEditBillIdRef.current = billId;
    if (options?.usePageLoader) {
      setLoading(true);
    } else {
      setIsLoadingNavBill(true);
    }

    try {
      const { data: existingBill, error: billError } = await supabase
        .from('purchase_bills')
        .select('*')
        .eq('id', billId)
        .single();
      if (billError) throw billError;

      if ((existingBill as any)?.is_cancelled) {
        loadedEditBillIdRef.current = null;
        toast({
          title: "Cannot Edit Cancelled Bill",
          description: "This bill was cancelled and cannot be edited. Create a new bill or contact admin.",
          variant: "destructive",
        });
        navigate("/purchase-bills");
        return;
      }

      setBillData({
        supplier_id: existingBill.supplier_id || '',
        supplier_name: existingBill.supplier_name,
        supplier_invoice_no: existingBill.supplier_invoice_no || '',
      });
      setSoftwareBillNo(existingBill.software_bill_no || '');
      setBillDate(new Date(existingBill.bill_date));
      setBillEntryAt(getPurchaseBillEntryAt(existingBill as { bill_entry_at?: string | null; created_at?: string }));
      setRoundOff(Number(existingBill.round_off) || 0);
      setOtherCharges(Number(existingBill.other_charges) || 0);
      setDiscountAmount(Number(existingBill.discount_amount) || 0);
      setIsDcPurchase(existingBill.is_dc_purchase === true);
      setIsBillLocked(existingBill.is_locked === true);

      const itemsData = await fetchPurchaseItemsByBillId(billId);

      const productIds = [...new Set(itemsData.map((item: any) => item.product_id).filter(Boolean))];
      const productDetailsMap = new Map<string, { brand: string; category: string; style: string; color: string; uom: string }>();
      if (productIds.length > 0) {
        const productsData = await fetchProductsByIds(
          productIds,
          'id, brand, category, style, color, uom',
        );
        productsData.forEach((p: any) => {
          productDetailsMap.set(p.id, {
            brand: p.brand || '',
            category: p.category || '',
            style: p.style || '',
            color: p.color || '',
            uom: p.uom || 'NOS',
          });
        });
      }

      const loadedItems: LineItem[] = itemsData.map((item: any) => {
        const productDetails = productDetailsMap.get(item.product_id);
        const uom = productDetails?.uom || 'NOS';
        const base = {
          temp_id: item.id,
          product_id: item.product_id,
          sku_id: item.sku_id || '',
          product_name: item.product_name || '',
          brand: item.brand || productDetails?.brand || '',
          category: item.category || productDetails?.category || '',
          color: item.color || productDetails?.color || '',
          style: item.style || productDetails?.style || '',
          size: item.size,
          qty: item.qty,
          pur_price: Number(item.pur_price),
          sale_price: Number(item.sale_price),
          mrp: Number(item.mrp) || 0,
          gst_per: item.gst_per,
          hsn_code: item.hsn_code || '',
          barcode: item.barcode || '',
          discount_percent: 0,
          uom,
          line_total: Number(item.line_total),
        } as LineItem;
        const mult = getMtrMultiplier(base);
        const sub = mult * base.pur_price;
        base.line_total = sub * (1 - (base.discount_percent || 0) / 100);
        return base;
      });

      setLineItems(loadedItems);
      setOriginalLineItems(loadedItems);
      setVisibleItemCount(Math.min(loadedItems.length, 200));
      setIsEditMode(true);
      setEditingBillId(billId);
      setSavedBillId(billId);
      window.history.replaceState({}, '', location.pathname);

      const loadedQty = loadedItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      const headerQty = Number((existingBill as { total_qty?: number }).total_qty) || 0;
      if (headerQty > 0 && Math.abs(loadedQty - headerQty) > 0.5) {
        toast({
          title: "Bill lines may be incomplete",
          description: `Loaded ${loadedQty.toLocaleString("en-IN")} qty from ${loadedItems.length.toLocaleString("en-IN")} lines but the bill header shows ${headerQty.toLocaleString("en-IN")} qty. Totals may not match until all lines are present.`,
          variant: "destructive",
        });
      } else if (loadedItems.length > 1000) {
        toast({
          title: "Large bill loaded",
          description: `${loadedItems.length.toLocaleString("en-IN")} line items · scroll the table to view all rows.`,
        });
      }
    } catch (err: any) {
      loadedEditBillIdRef.current = null;
      console.error('Failed to load bill:', err);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load purchase bill' });
      if (options?.usePageLoader) {
        navigate("/purchase-bills");
      }
    } finally {
      isInitializingEditRef.current = false;
      if (options?.usePageLoader) {
        setLoading(false);
      } else {
        setIsLoadingNavBill(false);
      }
    }
  }, [currentOrganization?.id, toast, navigate, location.pathname]);

  const handleLastBill = useCallback(() => {
    if (!allBillIds || allBillIds.length === 0) return;
    setNavBillIndex(0);
    loadBillById(allBillIds[0].id);
  }, [allBillIds, loadBillById]);

  const handlePreviousBill = useCallback(() => {
    if (!allBillIds || navBillIndex === null) return;
    const newIndex = Math.min(navBillIndex + 1, allBillIds.length - 1);
    setNavBillIndex(newIndex);
    loadBillById(allBillIds[newIndex].id);
  }, [allBillIds, navBillIndex, loadBillById]);

  const handleNextBill = useCallback(() => {
    if (!allBillIds || navBillIndex === null) return;
    const newIndex = Math.max(navBillIndex - 1, 0);
    setNavBillIndex(newIndex);
    loadBillById(allBillIds[newIndex].id);
  }, [allBillIds, navBillIndex, loadBillById]);

  // Auto-populate supplier invoice number for new bills
  useEffect(() => {
    if (nextSupplierInvNo && !isEditMode && !billData.supplier_invoice_no) {
      setBillData(prev => ({ ...prev, supplier_invoice_no: nextSupplierInvNo }));
    }
  }, [nextSupplierInvNo, isEditMode]);

  // Menu / Alt+B — open blank new bill (not the last edited bill).
  // confirmDiscardRef (not confirmDiscardUnsavedPurchase) used here so this effect doesn't
  // re-fire on every lineItems change and accidentally show a second confirm dialog.
  useEffect(() => {
    if (!location.state?.newBill) return;
    if (wasPurchaseEntryNavHandled(location.key)) {
      clearNewBillNavigation();
      return;
    }

    const orgId = currentOrganization?.id;
    const userId = user?.id;
    if (
      isDocumentReload() &&
      orgId &&
      userId &&
      hasPurchaseEntryDraftInBrowser(orgId, userId)
    ) {
      void restorePersistedWork({ notify: true }).finally(() => {
        clearNewBillNavigation();
      });
      return;
    }

    // Remount/minimize recovery: restore persisted work instead of wiping on a stale newBill flag.
    if (wasPurchaseEntryRemount(location.key)) {
      void restorePersistedWork({ notify: true }).finally(() => {
        clearNewBillNavigation();
      });
      return;
    }

    if (workRestoredRef.current) {
      clearNewBillNavigation();
      return;
    }

    if (!confirmDiscardRef.current()) {
      clearNewBillNavigation();
      return;
    }
    resetToNewBill();
    clearNewBillNavigation();
  }, [
    location.state?.newBill,
    location.key,
    clearNewBillNavigation,
    resetToNewBill,
    restorePersistedWork,
    currentOrganization?.id,
    user?.id,
  ]);

  // Load bill when opened from dashboard with editBillId (same pattern as Sales Invoice)
  useEffect(() => {
    const billId = location.state?.editBillId;
    if (!billId || location.state?.loadDraft || workRestoredRef.current) return;
    if (!currentOrganization?.id) return;
    if (loadedEditBillIdRef.current === billId) return;
    void loadBillById(billId, { usePageLoader: true });
  }, [location.state?.editBillId, location.state?.loadDraft, currentOrganization?.id, loadBillById]);

  useEffect(() => {
    if (searchQuery.length >= 1) {
      searchProducts(searchQuery);
    } else {
      setSearchResults([]);
      setShowSearch(false);
    }
  }, [searchQuery]);

  // Inline search effect for table row
  useEffect(() => {
    if (inlineSearchQuery.length >= 1) {
      searchProductsInline(inlineSearchQuery);
    } else {
      setInlineSearchResults([]);
      if (inlineSearchQuery.length > 0 && inlineSearchQuery.length < 1) {
        setShowInlineSearch(true);
      } else {
        setShowInlineSearch(false);
      }
    }
  }, [inlineSearchQuery]);

  const searchProductsInline = async (query: string) => {
    if (!query || query.length < 1) {
      setInlineSearchResults([]);
      setSelectedInlineIndex(0);
      return;
    }

    try {
      // First, search products by name, brand, and style - include size_group_id
      const { data: matchingProducts } = await supabase
        .from("products")
        .select("id, size_group_id")
        .eq("organization_id", currentOrganization?.id)
        .is("deleted_at", null)
        .or(`product_name.ilike.%${query}%,brand.ilike.%${query}%,style.ilike.%${query}%`);

      const productIds = matchingProducts?.map(p => p.id) || [];
      const sizeGroupIds = [...new Set(matchingProducts?.map(p => p.size_group_id).filter(Boolean) || [])];

      // Fetch size groups for these products
      let sizeGroupsMap: Record<string, { group_name: string; sizes: string[] }> = {};
      if (sizeGroupIds.length > 0) {
        const { data: sizeGroups } = await supabase
          .from("size_groups")
          .select("id, group_name, sizes")
          .in("id", sizeGroupIds);
        
        if (sizeGroups) {
          sizeGroups.forEach((sg: any) => {
            sizeGroupsMap[sg.id] = { group_name: sg.group_name, sizes: sg.sizes || [] };
          });
        }
      }

      // Then search product_variants by barcode OR matching product IDs
      let variantsQuery = supabase
        .from("product_variants")
        .select(`
          id,
          size,
          pur_price,
          sale_price,
          mrp,
          barcode,
          active,
          color,
          product_id,
          products (
            id,
            product_name,
            brand,
            category,
            style,
            color,
            hsn_code,
            gst_per,
            purchase_gst_percent,
            sale_gst_percent,
            default_pur_price,
            default_sale_price,
            size_group_id,
            purchase_discount_type,
            purchase_discount_value,
            uom
          )
        `)
        .eq("organization_id", currentOrganization?.id)
        .eq("active", true)
        .is("deleted_at", null);

      // Add barcode or product_id filters
      if (productIds.length > 0) {
        variantsQuery = variantsQuery.or(`barcode.ilike.%${query}%,product_id.in.(${productIds.join(",")})`);
      } else {
        variantsQuery = variantsQuery.ilike("barcode", `%${query}%`);
      }

      const { data, error } = await variantsQuery.limit(100);

      if (error) throw error;

      // Also fetch size groups for barcode-matched products that weren't in the initial search
      const additionalSizeGroupIds = [...new Set(
        (data || [])
          .map((v: any) => v.products?.size_group_id)
          .filter((id: string) => id && !sizeGroupsMap[id])
      )];
      
      if (additionalSizeGroupIds.length > 0) {
        const { data: additionalSizeGroups } = await supabase
          .from("size_groups")
          .select("id, group_name, sizes")
          .in("id", additionalSizeGroupIds);
        
        if (additionalSizeGroups) {
          additionalSizeGroups.forEach((sg: any) => {
            sizeGroupsMap[sg.id] = { group_name: sg.group_name, sizes: sg.sizes || [] };
          });
        }
      }

      const results = (data || []).map((v: any) => {
        const sizeGroupId = v.products?.size_group_id;
        const sizeGroup = sizeGroupId ? sizeGroupsMap[sizeGroupId] : null;
        const sizeRange = sizeGroup && Array.isArray(sizeGroup.sizes) && sizeGroup.sizes.length > 1
          ? `${sizeGroup.sizes[0]}-${sizeGroup.sizes[sizeGroup.sizes.length - 1]}`
          : sizeGroup?.sizes?.[0] || null;
        
        return {
          id: v.id,
          product_id: v.products?.id || "",
          size: v.size,
          pur_price: v.pur_price,
          sale_price: v.sale_price,
          mrp: v.mrp || 0,
          barcode: v.barcode || "",
          product_name: v.products?.product_name || "",
          brand: v.products?.brand || "",
          category: v.products?.category || "",
          color: v.color || v.products?.color || "",
          style: v.products?.style || "",
          gst_per: v.products?.purchase_gst_percent || v.products?.gst_per || 0,
          hsn_code: v.products?.hsn_code || "",
          size_range: sizeRange,
          uom: v.products?.uom || 'NOS',
        };
      });

      // Apply smart sorting
      const sortedResults = sortSearchResults(results, query, {
        barcode: 'barcode',
        style: 'style',
        productName: 'product_name',
      });

      // Same barcode series mode: exact barcode match → instant add
      if (sameBarcodeSeriesEnabled && query.trim().length >= 1) {
        const exactMatch = sortedResults.find(
          (r: any) => r.barcode?.toLowerCase() === query.trim().toLowerCase()
        );
        if (exactMatch) {
          setInlineSearchResults([]);
          setShowInlineSearch(false);
          setInlineSearchQuery("");
          await handleProductSelectSameBarcode(exactMatch);
          return;
        }
      }

      setInlineSearchResults(sortedResults);
      setSelectedInlineIndex(0);
      setShowInlineSearch(true);
    } catch (error: any) {
      console.error(error);
    }
  };

  const handleInlineProductSelect = async (variant: ProductVariant) => {
    setInlineSearchQuery("");
    setShowInlineSearch(false);
    setInlineSearchResults([]);
    
    if (entryMode === "grid") {
      // For Size Grid mode - open size grid, focus will be handled by handleSizeGridConfirm
      openSizeGridModal(variant.product_id);
    } else {
      // For Free Size mode - add row and focus on QTY field
      await addInlineRow(variant);
      setTimeout(() => {
        lastQtyInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        lastQtyInputRef.current?.focus();
      }, 100);
    }
  };

  const handleAddNewProductFromInline = () => {
    prefetchProductEntryDialog();
    setShowProductDialog(true);
  };

  // Handle product created from dialog - auto-add items with qty to bill
  const handleProductCreated = async (product: {
    id: string;
    product_name: string;
    brand: string | null;
    category: string | null;
    gst_per: number;
    purchase_gst_percent?: number;
    sale_gst_percent?: number;
    hsn_code: string | null;
    color: string | null;
    style?: string | null;
    uom?: string | null;
    purchase_discount_type?: string | null;
    purchase_discount_value?: number | null;
    variants: any[];
  }) => {
    if (product.variants && product.variants.length > 0) {
      // Check if any variant has purchase_qty > 0 (size-wise qty was entered)
      const variantsWithQty = product.variants.filter((v: any) => (v.purchase_qty || 0) > 0);

      if (variantsWithQty.length > 0) {
        const discountPercent = (() => {
          const pdt = product.purchase_discount_type;
          const pdv = product.purchase_discount_value || 0;
          if (pdv > 0 && (!pdt || pdt === 'percent')) return pdv;
          return 0;
        })();

        const newRows = variantsWithQty.map((variant: any) =>
          createLineItemRow({
            product_name: product.product_name,
            product_id: product.id,
            sku_id: variant.id,
            size: variant.size,
            qty: variant.purchase_qty,
            pur_price: variant.pur_price || 0,
            sale_price: variant.sale_price || 0,
            mrp: variant.mrp || variant.sale_price || 0,
            gst_per: product.purchase_gst_percent || product.gst_per || 0,
            hsn_code: product.hsn_code || "",
            barcode: variant.barcode || "",
            discount_percent: discountPercent,
            brand: product.brand || "",
            category: product.category || "",
            color: variant.color || product.color || "",
            style: product.style || "",
            uom: product.uom || 'NOS',
          }),
        );

        let mergedItems: LineItem[] = [];
        setLineItems((prev) => {
          mergedItems = [...prev, ...newRows];
          return mergedItems;
        });
        setVisibleItemCount((prev) =>
          Math.max(prev, mergedItems.length <= 200 ? mergedItems.length : prev + newRows.length),
        );
        skipSnapshotEffectRef.current = true;
        importJustAppliedRef.current = true;
        await persistEntrySnapshotNow({ lineItems: mergedItems });
        invalidatePurchases();

        // Blur so "1" shortcut works immediately
        (document.activeElement as HTMLElement)?.blur();
      } else {
        // No qty entered — fallback to size grid
        const mappedVariants = normalizeSizeGridVariants(product.variants.map((v: any) => ({
          id: v.id,
          size: v.size,
          sale_price: v.sale_price,
          pur_price: v.pur_price,
          mrp: v.mrp || v.sale_price || 0,
          barcode: v.barcode,
          color: v.color || product.color || "",
          stock_qty: v.stock_qty || 0,
        })));

        // Check if MTR product with roll-wise entry enabled
        if (rollWiseMtrEntry && (product as any).uom === 'MTR') {
          const uniqueColors = [...new Set(mappedVariants.map((v: any) => v.color || '').filter(Boolean))];
          if (uniqueColors.length === 0) uniqueColors.push(product.color || 'DEFAULT');
          setRollEntryProduct(product);
          setRollEntryColors(uniqueColors);
          setRollEntryRate((product as any).default_pur_price || 0);
          setShowRollEntryDialog(true);
        } else {
          setSelectedProduct({
            id: product.id,
            product_name: product.product_name,
            brand: product.brand,
            category: product.category,
            gst_per: product.gst_per,
            hsn_code: product.hsn_code,
            color: product.color,
          });
          setSizeGridVariants(mappedVariants);
          setSizeQty({});
          setShowSizeGrid(true);
        }

        toast({
          title: "Product Created",
          description: `${product.product_name} created. Enter quantities in the size grid.`,
        });
      }
    } else {
      toast({
        title: "Product Created",
        description: `${product.product_name} created successfully.`,
      });
    }
  };

  // Check if returning from product creation with new product data
  useEffect(() => {
    const state = location.state as { newProduct?: any; createdSupplier?: any };
    
    if (state?.newProduct) {
      // Auto-add the newly created product
      const product = state.newProduct;
      if (product.variants && product.variants.length > 0) {
        const firstVariant = product.variants[0];
        handleProductSelect({
          id: firstVariant.id,
          product_id: product.id,
          size: firstVariant.size,
          pur_price: firstVariant.pur_price,
          sale_price: firstVariant.sale_price,
          barcode: firstVariant.barcode,
          product_name: product.product_name,
          brand: product.brand || '',
          category: product.category || '',
          color: product.color || '',
          style: product.style || '',
          gst_per: product.purchase_gst_percent || product.gst_per,
          hsn_code: product.hsn_code || '',
        });
        
        toast({
          title: "Product Added",
          description: `${product.product_name} has been added to purchase`,
        });
      }
    }

    // Handle supplier creation callback
    if (state?.createdSupplier) {
      const supplier = state.createdSupplier;
      refetchSuppliers();
      setBillData((prev) => ({
        ...prev,
        supplier_id: supplier.id,
        supplier_name: supplier.supplier_name,
      }));
      toast({
        title: "Supplier Selected",
        description: `${supplier.supplier_name} has been selected`,
      });
    }
      
    // Clear the state if any state was present - use window.history to avoid re-prefixing orgSlug
    if (state?.newProduct || state?.createdSupplier) {
      window.history.replaceState({}, '', location.pathname);
    }
  }, [location.state]);


  useEffect(() => {
    const totals = computePurchaseBillTotals(
      lineItems,
      discountAmount,
      otherCharges,
      isDcPurchase,
    );
    setRoundOff(totals.roundOff);
    setGrossAmount(totals.grossBeforeDiscount);
    setGstAmount(totals.gstAmount);
    setNetAmount(totals.netAmount);
  }, [lineItems, discountAmount, otherCharges, isDcPurchase]);

  // When DC Purchase is toggled ON, zero out GST on all existing line items
  useEffect(() => {
    if (isDcPurchase && lineItems.length > 0) {
      const hasNonZeroGst = lineItems.some(item => item.gst_per > 0);
      if (hasNonZeroGst) {
        setLineItems(prev => prev.map(item => ({ ...item, gst_per: 0 })));
        toast({ title: "DC Purchase", description: "Purchase GST set to 0% for all items (No GST)" });
      }
    }
  }, [isDcPurchase]);

  const generateCentralizedBarcode = async (): Promise<string> => {
    try {
      const { data, error } = await supabase.rpc('generate_next_barcode', {
        p_organization_id: currentOrganization?.id
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error generating barcode:", error);
      toast({
        title: "Error",
        description: "Failed to generate barcode from database",
        variant: "destructive",
      });
      throw error;
    }
  };

  // AbortController ref to cancel in-flight search requests
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  const searchProducts = async (query: string) => {
    // Cancel any previous search request
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    
    // Create new abort controller for this search
    searchAbortControllerRef.current = new AbortController();
    const currentController = searchAbortControllerRef.current;

    if (!query || query.length < 1) {
      setSearchResults([]);
      setSelectedSearchIndex(0);
      return;
    }

    try {
      // First, search products by name, brand, and style - include size_group_id
      const { data: matchingProducts } = await supabase
        .from("products")
        .select("id, size_group_id")
        .eq("organization_id", currentOrganization?.id)
        .is("deleted_at", null)
        .or(`product_name.ilike.%${query}%,brand.ilike.%${query}%,style.ilike.%${query}%,category.ilike.%${query}%`);

      // Check if aborted before continuing
      if (currentController.signal.aborted) return;

      const productIds = matchingProducts?.map(p => p.id) || [];
      const sizeGroupIds = [...new Set(matchingProducts?.map(p => p.size_group_id).filter(Boolean) || [])];

      // Fetch size groups for these products
      let sizeGroupsMap: Record<string, { group_name: string; sizes: string[] }> = {};
      if (sizeGroupIds.length > 0) {
        const { data: sizeGroups } = await supabase
          .from("size_groups")
          .select("id, group_name, sizes")
          .in("id", sizeGroupIds);
        
        if (currentController.signal.aborted) return;
        
        if (sizeGroups) {
          sizeGroups.forEach((sg: any) => {
            sizeGroupsMap[sg.id] = { group_name: sg.group_name, sizes: sg.sizes || [] };
          });
        }
      }

      // Then search product_variants by barcode OR matching product IDs
      let variantsQuery = supabase
        .from("product_variants")
        .select(`
          id,
          size,
          pur_price,
          sale_price,
          mrp,
          barcode,
          active,
          color,
          product_id,
          products (
            id,
            product_name,
            brand,
            category,
            style,
            color,
            hsn_code,
            gst_per,
            purchase_gst_percent,
            sale_gst_percent,
            default_pur_price,
            default_sale_price,
            size_group_id,
            purchase_discount_type,
            purchase_discount_value,
            uom
          )
        `)
        .eq("organization_id", currentOrganization?.id)
        .eq("active", true)
        .is("deleted_at", null);

      // Add barcode or product_id filters
      if (productIds.length > 0) {
        variantsQuery = variantsQuery.or(`barcode.ilike.%${query}%,product_id.in.(${productIds.join(",")})`);
      } else {
        variantsQuery = variantsQuery.ilike("barcode", `%${query}%`);
      }

      const { data, error } = await variantsQuery;

      // Check if aborted before setting state
      if (currentController.signal.aborted) return;

      if (error) throw error;

      // Also fetch size groups for barcode-matched products that weren't in the initial search
      const additionalSizeGroupIds = [...new Set(
        (data || [])
          .map((v: any) => v.products?.size_group_id)
          .filter((id: string) => id && !sizeGroupsMap[id])
      )];
      
      if (additionalSizeGroupIds.length > 0) {
        const { data: additionalSizeGroups } = await supabase
          .from("size_groups")
          .select("id, group_name, sizes")
          .in("id", additionalSizeGroupIds);
        
        if (currentController.signal.aborted) return;
        
        if (additionalSizeGroups) {
          additionalSizeGroups.forEach((sg: any) => {
            sizeGroupsMap[sg.id] = { group_name: sg.group_name, sizes: sg.sizes || [] };
          });
        }
      }

      const results = (data || []).map((v: any) => {
        const sizeGroupId = v.products?.size_group_id;
        const sizeGroup = sizeGroupId ? sizeGroupsMap[sizeGroupId] : null;
        const sizeRange = sizeGroup && Array.isArray(sizeGroup.sizes) && sizeGroup.sizes.length > 1
          ? `${sizeGroup.sizes[0]}-${sizeGroup.sizes[sizeGroup.sizes.length - 1]}`
          : sizeGroup?.sizes?.[0] || null;
        
        return {
          id: v.id,
          product_id: v.products?.id || "",
          size: v.size,
          pur_price: v.pur_price,
          sale_price: v.sale_price,
          mrp: v.mrp || 0,
          barcode: v.barcode || "",
          product_name: v.products?.product_name || "",
          brand: v.products?.brand || "",
          category: v.products?.category || "",
          color: v.color || v.products?.color || "",
          style: v.products?.style || "",
          gst_per: v.products?.purchase_gst_percent || v.products?.gst_per || 0,
          hsn_code: v.products?.hsn_code || "",
          size_range: sizeRange,
          uom: v.products?.uom || 'NOS',
        };
      });

      // Apply smart sorting
      const sortedResults = sortSearchResults(results, query, {
        barcode: 'barcode',
        style: 'style',
        productName: 'product_name',
      });

      // Final abort check before setting state
      if (currentController.signal.aborted) return;

      // Same barcode series mode: exact barcode match → instant add, no dropdown
      if (sameBarcodeSeriesEnabled && query.trim().length >= 1) {
        const exactMatch = sortedResults.find(
          (r: any) => r.barcode?.toLowerCase() === query.trim().toLowerCase()
        );
        if (exactMatch) {
          setSearchResults([]);
          setShowSearch(false);
          setSearchQuery("");
          await handleProductSelectSameBarcode(exactMatch);
          return;
        }
      }

      setSearchResults(sortedResults);
      setSelectedSearchIndex(0);
      setShowSearch(true);
    } catch (error: any) {
      // Ignore abort errors
      if (error.name === 'AbortError') return;
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to search products",
        variant: "destructive",
      });
    }
  };

  /**
   * Same barcode series mode: add the matched variant directly.
   * Never creates a new variant or new barcode.
   */
  // Defensive: if a variant somehow lands here without uom (stale cache, legacy callers),
  // fetch it once from products so MTR math remains correct.
  const ensureVariantUom = async (variant: ProductVariant): Promise<string> => {
    if (variant.uom) return variant.uom;
    if (!variant.product_id) return 'NOS';
    const { data } = await supabase
      .from('products')
      .select('uom')
      .eq('id', variant.product_id)
      .maybeSingle();
    return (data as any)?.uom || 'NOS';
  };

  const handleProductSelectSameBarcode = async (variant: ProductVariant) => {
    const resolvedUom = await ensureVariantUom(variant);
    const mtrMult = getMtrMultiplier({ uom: resolvedUom, size: variant.size || '', qty: 1 });
    const subTotal = mtrMult * (variant.pur_price || 0);
    const newItem: LineItem = {
      temp_id: Date.now().toString() + Math.random(),
      product_id: variant.product_id,
      sku_id: variant.id,
      product_name: variant.product_name,
      size: variant.size || "",
      qty: 1,
      pur_price: variant.pur_price || 0,
      sale_price: variant.sale_price || 0,
      mrp: variant.mrp || 0,
      gst_per: variant.gst_per || 0,
      hsn_code: variant.hsn_code || "",
      barcode: variant.barcode,
      discount_percent: 0,
      line_total: subTotal,
      brand: variant.brand || "",
      category: variant.category || "",
      color: variant.color || "",
      style: variant.style || "",
      uom: resolvedUom,
    };
    setLineItems(prev => [...prev, newItem]);
    setTimeout(() => {
      lastQtyInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      lastQtyInputRef.current?.focus();
      lastQtyInputRef.current?.select();
    }, 120);
  };

  const handleProductSelect = async (variant: ProductVariant) => {
    // CRITICAL: Abort any pending search requests first to prevent race condition
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
      searchAbortControllerRef.current = null;
    }
    
    // Clear search state immediately before opening dialogs
    setSearchQuery("");
    setSearchResults([]);
    setShowSearch(false);

    if (entryMode === "grid") {
      openSizeGridModal(variant.product_id);
    } else {
      await addInlineRow(variant);
      // Scroll to and focus on quantity input after adding inline row
      setTimeout(() => {
        lastQtyInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        lastQtyInputRef.current?.focus();
      }, 100);
    }
  };

  const openSizeGridModal = async (productId: string) => {
    if (!currentOrganization) return;
    
    const { data, error } = await supabase
      .from("product_variants")
      .select(`
        id,
        size,
        pur_price,
        sale_price,
        mrp,
        barcode,
        active,
        color,
        products (
          id,
          product_name,
          brand,
          category,
          color,
          style,
          hsn_code,
          gst_per,
          purchase_gst_percent,
          sale_gst_percent,
          default_pur_price,
          default_sale_price,
          purchase_discount_type,
          purchase_discount_value,
          uom
        )
      `)
      .eq("product_id", productId)
      .eq("organization_id", currentOrganization.id)
      .eq("active", true);

    if (error || !data || data.length === 0) {
      toast({
        title: "Error",
        description: "Failed to load product variants",
        variant: "destructive",
      });
      return;
    }

    // If only one variant, add directly
    if (data.length === 1) {
      const v = data[0];
      const product = v.products as any;
      let barcode = v.barcode || "";
      let skuId = v.id;
      
      // Smart barcode handling
      if (sameBarcodeSeriesEnabled) {
        // Same barcode series: reuse existing variant+barcode
        if (!barcode && isAutoBarcode) {
          const newBarcode = await generateCentralizedBarcode();
          await supabase.from("product_variants").update({ barcode: newBarcode }).eq("id", skuId);
          barcode = newBarcode;
        }
      } else {
        if (barcode && isSystemGeneratedBarcode(barcode)) {
          const result = await createNewVariantWithBarcode({
            product_id: productId, size: v.size, color: v.color,
            pur_price: product.default_pur_price, sale_price: product.default_sale_price, mrp: v.mrp,
          });
          if (result) { skuId = result.id; barcode = result.barcode; }
        } else if (!barcode && isAutoBarcode) {
          const result = await createNewVariantWithBarcode({
            product_id: productId, size: v.size, color: v.color,
            pur_price: product.default_pur_price, sale_price: product.default_sale_price, mrp: v.mrp,
          });
          if (result) { skuId = result.id; barcode = result.barcode; }
        }
      }

      addItemRow({
        product_id: productId,
        sku_id: skuId,
        product_name: product.product_name,
        size: v.size,
        qty: 1,
        pur_price: product.default_pur_price || 0,
        sale_price: product.default_sale_price || 0,
        mrp: v.mrp || 0,
        gst_per: product.purchase_gst_percent || product.gst_per || 0,
        hsn_code: product.hsn_code || "",
        barcode: barcode,
        discount_percent: (() => {
          const pdt = (product as any).purchase_discount_type;
          const pdv = (product as any).purchase_discount_value || 0;
          if (pdv > 0 && (!pdt || pdt === 'percent')) return pdv;
          return 0;
        })(),
        brand: product.brand || "",
        category: product.category || "",
        color: v.color || product.color || "",
        style: product.style || "",
        uom: product.uom || 'NOS',
      });
      return;
    }

    // Map variants with color info for SizeGridDialog
    const mappedVariants = normalizeSizeGridVariants(data.map((v: any) => ({
      id: v.id,
      size: v.size,
      sale_price: v.sale_price || v.products?.default_sale_price,
      pur_price: v.pur_price || v.products?.default_pur_price,
      mrp: v.mrp || 0,
      barcode: v.barcode,
      color: v.color || v.products?.color || "",
    })));

    // Check if this is a MTR product and roll-wise entry is enabled
    const productData = data[0].products as any;
    const productUom = productData?.uom || 'NOS';
    if (rollWiseMtrEntry && productUom === 'MTR') {
      // Collect unique colors from variants
      const uniqueColors = [...new Set(mappedVariants.map((v: any) => v.color || '').filter(Boolean))];
      if (uniqueColors.length === 0) uniqueColors.push(productData?.color || 'DEFAULT');
      setRollEntryProduct(productData);
      setRollEntryColors(uniqueColors);
      setRollEntryRate(productData?.default_pur_price || 0);
      setShowRollEntryDialog(true);
      return;
    }

    // Show size grid modal
    setSelectedProduct(productData);
    setSizeGridVariants(mappedVariants);
    setSizeQty({});
    setShowSizeGrid(true);
  };

  // Handle confirmation from SizeGridDialog
  const handleSizeGridConfirm = async (items: Array<{ variant: any; qty: number }>, newColor?: string) => {
    for (const { variant, qty } of items) {
      let barcode = variant.barcode || "";
      let skuId = variant.id;
      
      // Check if this is for a new color - need to create variants for all sizes
      const isNewColorVariant = newColor && variant.isCustomSize;
      
      // Check if this is a custom/new size that needs to be created
      if (variant.isCustomSize || isNewColorVariant) {
        try {
          // Generate barcode for new variant
          barcode = isAutoBarcode ? await generateCentralizedBarcode() : '';
          
          // Create new product variant
          const { data: newVariant, error: createError } = await supabase
            .from("product_variants")
            .insert({
              product_id: selectedProduct.id,
              organization_id: currentOrganization?.id,
              size: variant.size,
              color: newColor || variant.color || selectedProduct.color || null,
              pur_price: variant.pur_price || selectedProduct.default_pur_price || 0,
              sale_price: variant.sale_price || selectedProduct.default_sale_price || 0,
              mrp: variant.mrp || variant.sale_price || selectedProduct.default_sale_price || 0,
              barcode: barcode,
              stock_qty: 0,
              active: true,
            })
            .select("id")
            .single();
          
          if (createError) throw createError;
          
          skuId = newVariant.id;
          
          toast({
            title: newColor ? "Color Variant Created" : "Size Created",
            description: newColor 
              ? `New variant "${variant.size}" in color "${newColor}" created for ${selectedProduct.product_name}`
              : `New size "${variant.size}" created for ${selectedProduct.product_name}`,
          });
        } catch (error: any) {
          console.error("Error creating new variant:", error);
          toast({
            title: "Error",
            description: `Failed to create new variant ${variant.size}: ${error.message}`,
            variant: "destructive",
          });
          continue;
        }
      } else {
        // Existing variant - smart barcode handling
        if (sameBarcodeSeriesEnabled) {
          if (!barcode && isAutoBarcode) {
            const newBarcode = await generateCentralizedBarcode();
            await supabase.from("product_variants").update({ barcode: newBarcode }).eq("id", skuId);
            barcode = newBarcode;
          }
        } else {
          if (barcode && isSystemGeneratedBarcode(barcode)) {
            const result = await createNewVariantWithBarcode({
              product_id: selectedProduct.id, size: variant.size,
              color: newColor || variant.color || selectedProduct.color,
              pur_price: variant.pur_price || selectedProduct.default_pur_price,
              sale_price: variant.sale_price || selectedProduct.default_sale_price,
              mrp: variant.mrp,
            });
            if (result) { skuId = result.id; barcode = result.barcode; }
          } else if (!barcode && isAutoBarcode) {
            const result = await createNewVariantWithBarcode({
              product_id: selectedProduct.id, size: variant.size,
              color: newColor || variant.color || selectedProduct.color,
              pur_price: variant.pur_price || selectedProduct.default_pur_price,
              sale_price: variant.sale_price || selectedProduct.default_sale_price,
              mrp: variant.mrp,
            });
            if (result) { skuId = result.id; barcode = result.barcode; }
          }
        }
      }

      addItemRow({
        product_name: selectedProduct.product_name,
        product_id: selectedProduct.id,
        sku_id: skuId,
        size: variant.size,
        qty: qty,
        pur_price: variant.pur_price || selectedProduct.default_pur_price || 0,
        sale_price: variant.sale_price || selectedProduct.default_sale_price || 0,
        mrp: variant.mrp || variant.sale_price || 0,
        gst_per: selectedProduct.purchase_gst_percent || selectedProduct.gst_per || 0,
        hsn_code: selectedProduct.hsn_code || "",
        barcode: barcode,
        discount_percent: (() => {
          const pdt = (selectedProduct as any).purchase_discount_type;
          const pdv = (selectedProduct as any).purchase_discount_value || 0;
          if (pdv > 0 && (!pdt || pdt === 'percent')) return pdv;
          return 0;
        })(),
        brand: selectedProduct.brand || "",
        category: selectedProduct.category || "",
        color: newColor || variant.color || selectedProduct.color || "",
        style: selectedProduct.style || "",
      });
    }

    setShowSizeGrid(false);
    setSizeQty({});
    // Blur so "1" shortcut works immediately
    (document.activeElement as HTMLElement)?.blur();
    focusSearchBar();
  };

  // Add ALL active variants of a product as inline rows (qty=1 each).
  // Useful when the supplier ships every size/color of a style and the user
  // wants every variant pre-loaded into the purchase bill for editing.
  const addAllVariantsRows = async (productId: string) => {
    if (!currentOrganization) return;

    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
      searchAbortControllerRef.current = null;
    }
    setSearchQuery("");
    setSearchResults([]);
    setShowSearch(false);

    const { data, error } = await supabase
      .from("product_variants")
      .select(`
        id, size, color, barcode, pur_price, sale_price, mrp, active,
        products (
          id, product_name, brand, category, color, style,
          hsn_code, gst_per, purchase_gst_percent, sale_gst_percent,
          default_pur_price, default_sale_price,
          purchase_discount_type, purchase_discount_value, uom
        )
      `)
      .eq("product_id", productId)
      .eq("organization_id", currentOrganization.id)
      .eq("active", true);

    if (error || !data || data.length === 0) {
      toast({
        title: "Error",
        description: "Could not load variants for this product",
        variant: "destructive",
      });
      return;
    }

    const sorted = [...data].sort((a: any, b: any) => {
      const ca = (a.color || "").toString();
      const cb = (b.color || "").toString();
      if (ca !== cb) return ca.localeCompare(cb);
      return (a.size || "").toString().localeCompare((b.size || "").toString(), undefined, { numeric: true });
    });

    const newRows: LineItem[] = [];
    sorted.forEach((v: any, idx: number) => {
      const product = v.products as any;
      const purPrice = v.pur_price || product?.default_pur_price || 0;
      const salePrice = v.sale_price || product?.default_sale_price || 0;
      const gstPer = product?.purchase_gst_percent ?? product?.gst_per ?? 0;
      const discountPercent = (() => {
        const pdt = product?.purchase_discount_type;
        const pdv = product?.purchase_discount_value || 0;
        if (pdv > 0 && (!pdt || pdt === 'percent')) return pdv;
        return 0;
      })();
      const uom = product?.uom || 'NOS';
      const mtrMult = getMtrMultiplier({ uom, size: v.size || '', qty: 1 });
      const subTotal = mtrMult * purPrice;
      const lineTotal = subTotal - subTotal * (discountPercent / 100);

      newRows.push({
        temp_id: Date.now().toString() + Math.random() + idx,
        product_id: productId,
        sku_id: v.id,
        product_name: product?.product_name || "",
        size: v.size || "",
        qty: 1,
        pur_price: purPrice,
        sale_price: salePrice,
        mrp: v.mrp || 0,
        gst_per: isDcPurchase ? 0 : gstPer,
        hsn_code: product?.hsn_code || "",
        barcode: v.barcode || "",
        discount_percent: discountPercent,
        line_total: lineTotal,
        brand: product?.brand || "",
        category: product?.category || "",
        color: v.color || product?.color || "",
        style: product?.style || "",
        uom,
      });
    });

    setLineItems((prev) => [...prev, ...newRows]);
    toast({
      title: "All variants added",
      description: `Added ${newRows.length} variant${newRows.length === 1 ? "" : "s"} to bill (qty 1 each — adjust as needed).`,
    });
    setTimeout(() => {
      lastQtyInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      lastQtyInputRef.current?.focus();
    }, 100);
  };

  const addInlineRow = async (variant: ProductVariant) => {
    let skuId = variant.id;
    let barcode = variant.barcode;

    // Smart barcode logic
    if (sameBarcodeSeriesEnabled) {
      // Same barcode series: reuse existing variant+barcode
      if (!barcode && isAutoBarcode) {
        const newBarcode = await generateCentralizedBarcode();
        await supabase.from("product_variants").update({ barcode: newBarcode }).eq("id", skuId);
        barcode = newBarcode;
      }
    } else {
      if (barcode && isSystemGeneratedBarcode(barcode)) {
        const result = await createNewVariantWithBarcode({
          product_id: variant.product_id,
          size: variant.size,
          color: variant.color,
          pur_price: variant.pur_price,
          sale_price: variant.sale_price,
          mrp: variant.mrp,
        });
        if (result) {
          skuId = result.id;
          barcode = result.barcode;
        }
      } else if (!barcode && isAutoBarcode) {
        const result = await createNewVariantWithBarcode({
          product_id: variant.product_id,
          size: variant.size,
          color: variant.color,
          pur_price: variant.pur_price,
          sale_price: variant.sale_price,
          mrp: variant.mrp,
        });
        if (result) {
          skuId = result.id;
          barcode = result.barcode;
        }
      }
    }
    // Branded barcode or no barcode + scan mode → reuse as-is

    const resolvedUom = await ensureVariantUom(variant);
    const mtrMult = getMtrMultiplier({ uom: resolvedUom, size: variant.size || '', qty: 1 });
    const subTotal = mtrMult * variant.pur_price;
    const discountAmount = 0;
    const lineTotal = subTotal - discountAmount;
    const newItem: LineItem = {
      temp_id: Date.now().toString() + Math.random(),
      product_id: variant.product_id,
      sku_id: skuId,
      product_name: variant.product_name,
      size: variant.size,
      qty: 1,
      pur_price: variant.pur_price,
      sale_price: variant.sale_price,
      mrp: variant.mrp || 0,
      gst_per: variant.gst_per,
      hsn_code: variant.hsn_code,
      barcode: barcode,
      discount_percent: 0,
      line_total: lineTotal,
      brand: variant.brand || "",
      category: variant.category || "",
      color: variant.color || "",
      style: variant.style || "",
      uom: resolvedUom,
    };
    setLineItems([...lineItems, newItem]);
  };

  const addItemRow = (item: Omit<LineItem, "temp_id" | "line_total">) => {
    setLineItems((prev) => {
      const next = [...prev, createLineItemRow(item)];
      setVisibleItemCount((vc) =>
        Math.max(vc, next.length <= 200 ? next.length : vc + 1),
      );
      return next;
    });
  };

  const updateLineItem = (temp_id: string, field: keyof LineItem, value: any) => {
    // Mobile ERP mode: when qty changes to > 1, allow direct qty update
    // (IMEI is already assigned to the row via barcode field, just update qty for stock)

    setLineItems((items) =>
      items.map((item) => {
        if (item.temp_id === temp_id) {
          const updated = { ...item, [field]: value };
          if (field === "qty" || field === "pur_price" || field === "discount_percent" || field === "size") {
            const subTotal = computePurchaseLineSubTotal(updated);
            const discountAmount = roundMoney(subTotal * (updated.discount_percent / 100));
            updated.line_total = roundMoney(subTotal - discountAmount);
          }
          // Garment / Footwear GST auto-bump rule on sale price change
          if (field === "sale_price") {
            const newGst = applyGarmentGstRule(updated.sale_price, updated.gst_per, garmentGstSettings);
            if (newGst !== updated.gst_per) {
              updated.gst_per = newGst;
            }
          }
          return updated;
        }
        return item;
      })
    );
  };

  // Handle IMEI scan confirmation - each IMEI becomes its own product_variant
  const handleIMEIScanConfirm = async (imeiNumbers: string[]) => {
    if (!imeiScanItem || !currentOrganization) return;
    const { tempId, item } = imeiScanItem;

    try {
      const newRows: LineItem[] = [];

      for (let idx = 0; idx < imeiNumbers.length; idx++) {
        const imei = imeiNumbers[idx];

        // Create a NEW product_variant with this IMEI as barcode
        const { data: newVariant, error: varError } = await supabase
          .from('product_variants')
          .insert({
            organization_id: currentOrganization.id,
            product_id: item.product_id,
            size: item.size || 'None',
            color: item.color || null,
            barcode: imei,
            pur_price: item.pur_price,
            sale_price: item.sale_price,
            mrp: item.mrp || 0,
            stock_qty: 0,
            active: true,
          })
          .select('id')
          .single();

        let variantId: string;

        if (varError) {
          // If barcode already exists, find the existing variant
          const { data: existing } = await supabase
            .from('product_variants')
            .select('id')
            .eq('barcode', imei)
            .eq('organization_id', currentOrganization.id)
            .is('deleted_at', null)
            .maybeSingle();

          if (existing) {
            variantId = existing.id;
          } else {
            throw varError;
          }
        } else {
          variantId = newVariant.id;
        }

        const subTotal = 1 * item.pur_price;
        const discountAmount = subTotal * (item.discount_percent / 100);
        newRows.push({
          ...item,
          temp_id: Date.now().toString() + Math.random() + idx,
          qty: 1,
          sku_id: variantId,
          barcode: imei,
          line_total: subTotal - discountAmount,
        });
      }

      setLineItems(prev => {
        const filtered = prev.filter(i => i.temp_id !== tempId);
        const originalIndex = prev.findIndex(i => i.temp_id === tempId);
        filtered.splice(originalIndex >= 0 ? originalIndex : filtered.length, 0, ...newRows);
        return filtered;
      });

      toast({
        title: "IMEI Numbers Added",
        description: `${imeiNumbers.length} items with individual IMEI barcodes created`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to create IMEI variants: ${error.message}`,
        variant: "destructive",
      });
    }

    setShowIMEIScanDialog(false);
    setImeiScanItem(null);
  };

  // Handle Roll Entry confirmation — each roll becomes a variant with unique barcode
  const handleRollEntryConfirm = async (rolls: Array<{ color: string; meters: number }>) => {
    if (!rollEntryProduct || !currentOrganization) return;

    try {
      const newRows: LineItem[] = [];
      const product = rollEntryProduct;
      const discountPercent = (() => {
        const pdt = product.purchase_discount_type;
        const pdv = product.purchase_discount_value || 0;
        if (pdv > 0 && (!pdt || pdt === 'percent')) return pdv;
        return 0;
      })();

      for (let idx = 0; idx < rolls.length; idx++) {
        const roll = rolls[idx];
        const rollBarcode = isAutoBarcode ? await generateCentralizedBarcode() : '';

        // Create a new product_variant for this roll
        const { data: newVariant, error: varError } = await supabase
          .from('product_variants')
          .insert({
            organization_id: currentOrganization.id,
            product_id: product.id,
            size: roll.meters.toString(),
            color: roll.color || null,
            barcode: rollBarcode,
            pur_price: product.default_pur_price || 0,
            sale_price: product.default_sale_price || 0,
            mrp: 0,
            stock_qty: 0,
            active: true,
          })
          .select('id')
          .single();

        if (varError) throw varError;

        const purPrice = product.default_pur_price || 0;
        const subTotal = roll.meters * purPrice;
        const discAmount = subTotal * (discountPercent / 100);

        newRows.push({
          temp_id: Date.now().toString() + Math.random() + idx,
          product_id: product.id,
          sku_id: newVariant.id,
          product_name: product.product_name,
          size: roll.meters.toString(),
          qty: 1,
          pur_price: purPrice,
          sale_price: product.default_sale_price || 0,
          mrp: 0,
          gst_per: product.purchase_gst_percent || product.gst_per || 0,
          hsn_code: product.hsn_code || "",
          barcode: rollBarcode,
          discount_percent: discountPercent,
          line_total: subTotal - discAmount,
          brand: product.brand || "",
          category: product.category || "",
          color: roll.color || "",
          style: product.style || "",
          uom: 'MTR',
        });
      }

      setLineItems(prev => [...prev, ...newRows]);

      toast({
        title: "Rolls Added",
        description: `${rolls.length} rolls (${rolls.reduce((s, r) => s + r.meters, 0).toFixed(1)} MTR) added with individual barcodes`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to create roll variants: ${error.message}`,
        variant: "destructive",
      });
    }

    setShowRollEntryDialog(false);
    setRollEntryProduct(null);
  };

  const removeLineItem = async (temp_id: string) => {
    // Capture removed item BEFORE state update so we can tag the product
    const removed = lineItems.find((item) => item.temp_id === temp_id);
    setLineItems((items) => items.filter((item) => item.temp_id !== temp_id));

    // Tag the underlying product as "user cancelled" so it's easy to spot
    // on the Product Dashboard (added but never billed). Only when the
    // product currently has 0 stock and no purchase history.
    if (removed?.product_id && currentOrganization?.id) {
      try {
        const { data: pi } = await supabase
          .from("purchase_items")
          .select("id", { head: true, count: "exact" })
          .eq("product_id", removed.product_id)
          .is("deleted_at", null)
          .limit(1);
        // If product has any prior purchase, don't tag
        const { count: purchaseCount } = await supabase
          .from("purchase_items")
          .select("id", { head: true, count: "exact" })
          .eq("product_id", removed.product_id)
          .is("deleted_at", null);
        if ((purchaseCount ?? 0) === 0) {
          // Check total stock across variants
          const { data: vrows } = await supabase
            .from("product_variants")
            .select("stock_qty")
            .eq("product_id", removed.product_id)
            .is("deleted_at", null);
          const totalStock = (vrows || []).reduce(
            (s: number, v: any) => s + (Number(v.stock_qty) || 0),
            0
          );
          if (totalStock === 0) {
            await supabase
              .from("products")
              .update({ user_cancelled_at: new Date().toISOString() })
              .eq("id", removed.product_id)
              .eq("organization_id", currentOrganization.id);
          }
        }
      } catch (err) {
        console.warn("[PurchaseEntry] tag user_cancelled failed:", err);
      }
    }
  };

  const handleCopyLastRow = () => {
    if (lineItems.length === 0) return;
    const lastItem = lineItems[lineItems.length - 1];
    const newItem: LineItem = {
      ...lastItem,
      temp_id: Date.now().toString() + Math.random(),
    };
    setLineItems([...lineItems, newItem]);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        handleCopyLastRow();
      }
      // Press "1" key to open Add New Product dialog — skip when typing in any input field
      if (e.key === "1" && !showProductDialog) {
        const active = document.activeElement as HTMLElement;
        const tag = active?.tagName?.toLowerCase();
        const isEditable = active?.isContentEditable;
        if (tag === "input" || tag === "textarea" || tag === "select" || isEditable) {
          return; // Allow normal typing
        }
        e.preventDefault();
        setShowProductDialog(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lineItems, showProductDialog]);

  // Auto-focus search bar when ProductEntryDialog closes
  useEffect(() => {
    if (!showProductDialog) {
      focusSearchBar();
    }
  }, [showProductDialog, focusSearchBar]);

  // Auto-focus search bar on page load
  useEffect(() => {
    if (settings && autoFocusSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 300);
    }
  }, [settings, autoFocusSearch]);

  // Function to detect price changes between line items and product_variants
  const detectPriceChanges = async (items: LineItem[]): Promise<PriceChange[]> => {
    const changes: PriceChange[] = [];
    
    // Get unique sku_ids
    const skuIds = [...new Set(items.filter(i => i.sku_id).map(i => i.sku_id))];
    if (skuIds.length === 0) return [];
    
    // Fetch current prices from product_variants
    const { data: variants, error } = await supabase
      .from("product_variants")
      .select("id, pur_price, sale_price, mrp")
      .in("id", skuIds);
    
    if (error || !variants) return [];
    
    const variantMap = new Map(variants.map(v => [v.id, v]));
    
    // Helper function to compare prices with tolerance for floating-point precision
    const arePricesEqual = (p1: number | null | undefined, p2: number | null | undefined): boolean => {
      const v1 = Number(p1) || 0;
      const v2 = Number(p2) || 0;
      return Math.abs(v1 - v2) < 0.001; // Tolerance of 0.001 (less than 1 paisa)
    };
    
    // Compare prices for each unique item (by sku_id)
    const processedSkus = new Set<string>();
    
    for (const item of items) {
      if (!item.sku_id || processedSkus.has(item.sku_id)) continue;
      processedSkus.add(item.sku_id);
      
      const variant = variantMap.get(item.sku_id);
      if (!variant) continue;
      
      // Check pur_price - use tolerance-based comparison
      if (variant.pur_price !== null && !arePricesEqual(variant.pur_price, item.pur_price)) {
        changes.push({
          sku_id: item.sku_id,
          product_name: item.product_name,
          size: item.size,
          barcode: item.barcode,
          field: "pur_price",
          old_value: variant.pur_price || 0,
          new_value: item.pur_price,
        });
      }
      
      // Check sale_price - use tolerance-based comparison
      if (variant.sale_price !== null && !arePricesEqual(variant.sale_price, item.sale_price)) {
        changes.push({
          sku_id: item.sku_id,
          product_name: item.product_name,
          size: item.size,
          barcode: item.barcode,
          field: "sale_price",
          old_value: variant.sale_price || 0,
          new_value: item.sale_price,
        });
      }
      
      // Check MRP only if MRP setting is enabled - use tolerance-based comparison
      if (showMrp) {
        const itemMrp = Number(item.mrp) || 0;
        const variantMrp = Number(variant.mrp) || 0;
        if (variantMrp > 0 && itemMrp > 0 && !arePricesEqual(variantMrp, itemMrp)) {
          changes.push({
            sku_id: item.sku_id,
            product_name: item.product_name,
            size: item.size,
            barcode: item.barcode,
            field: "mrp",
            old_value: variantMrp,
            new_value: itemMrp,
          });
        }
      }
    }
    
    return changes;
  };

  // Function to update product_variants with selected price changes
  const handlePriceUpdateConfirm = async (selectedChanges: PriceChange[]) => {
    if (selectedChanges.length === 0) {
      setShowPriceUpdateDialog(false);
      return;
    }
    
    try {
      // Group changes by sku_id - also sync last_purchase_* fields
      const updatesBySkuId = new Map<string, Partial<{ 
        pur_price: number; 
        sale_price: number; 
        mrp: number;
        last_purchase_pur_price: number;
        last_purchase_sale_price: number;
        last_purchase_mrp: number;
        last_purchase_date: string;
      }>>();
      
      for (const change of selectedChanges) {
        const existing = updatesBySkuId.get(change.sku_id) || {};
        existing[change.field] = change.new_value;
        
        // Also sync the corresponding last_purchase field to prevent dialog from appearing again
        if (change.field === 'pur_price') {
          existing.last_purchase_pur_price = change.new_value;
        } else if (change.field === 'sale_price') {
          existing.last_purchase_sale_price = change.new_value;
        } else if (change.field === 'mrp') {
          existing.last_purchase_mrp = change.new_value;
        }
        
        // Update the last purchase date to now
        existing.last_purchase_date = new Date().toISOString();
        
        updatesBySkuId.set(change.sku_id, existing);
      }
      
      // Update each variant with organization scoping and row-count verification
      const failedUpdates: string[] = [];
      let successCount = 0;
      
      for (const [skuId, updates] of updatesBySkuId) {
        console.log('[PriceUpdate] Updating variant', skuId, 'with', updates);
        const { data, error } = await supabase
          .from("product_variants")
          .update(updates)
          .eq("id", skuId)
          .eq("organization_id", currentOrganization.id)
          .select("id");
        
        if (error) {
          console.error('[PriceUpdate] Error updating variant', skuId, error);
          failedUpdates.push(skuId);
        } else if (!data || data.length === 0) {
          console.warn('[PriceUpdate] No rows updated for variant', skuId);
          failedUpdates.push(skuId);
        } else {
          successCount++;
        }
      }
      
      if (failedUpdates.length > 0 && successCount > 0) {
        toast({
          title: "Partial Update",
          description: `Updated ${successCount} variant(s), but ${failedUpdates.length} failed to update. Check console for details.`,
          variant: "destructive",
        });
      } else if (failedUpdates.length > 0) {
        toast({
          title: "Update Failed",
          description: `Failed to update ${failedUpdates.length} variant(s) in Product Master. Please try again.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Prices Updated",
          description: `Updated ${successCount} product variant(s) in Product Master`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update prices",
        variant: "destructive",
      });
    } finally {
      setShowPriceUpdateDialog(false);
      setDetectedPriceChanges([]);
      // Show print dialog if it was deferred
      if (pendingPrintAfterPriceUpdate) {
        setPendingPrintAfterPriceUpdate(false);
        setShowPrintDialog(true);
      }
    }
  };

  const handlePriceUpdateSkip = () => {
    setShowPriceUpdateDialog(false);
    setDetectedPriceChanges([]);
    // Show print dialog if it was deferred
    if (pendingPrintAfterPriceUpdate) {
      setPendingPrintAfterPriceUpdate(false);
      setShowPrintDialog(true);
    }
  };

  const handleUnlockBill = async () => {
    if (!editingBillId || !currentOrganization?.id) return;
    const { error } = await supabase
      .from('purchase_bills')
      .update({ is_locked: false })
      .eq('id', editingBillId);
    if (error) {
      toast({ title: "Error", description: "Failed to unlock bill", variant: "destructive" });
      return;
    }
    setIsBillLocked(false);
    setShowUnlockConfirm(false);
    toast({ title: "Bill Unlocked", description: "You can now edit this bill." });
  };

  const releaseSaveLock = () => {
    if (saveLockTimeoutRef.current) {
      clearTimeout(saveLockTimeoutRef.current);
      saveLockTimeoutRef.current = null;
    }
    savingRef.current = false;
    setLoading(false);
  };

  const handleSave = async () => {
    // Synchronous double-click guard. `loading` alone is async — set both immediately
    // so the button disables before validation/duplicate checks finish.
    if (savingRef.current || loading || excelImportLoading) {
      if (excelImportLoading) {
        toast({
          title: "Import in progress",
          description: `Loading ${excelImportLoading.current.toLocaleString("en-IN")} of ${excelImportLoading.total.toLocaleString("en-IN")} items. Please wait before saving.`,
        });
      }
      return;
    }

    savingRef.current = true;
    setLoading(true);
    saveLockTimeoutRef.current = setTimeout(() => {
      if (savingRef.current) {
        console.warn("[PurchaseEntry] Save lock timeout — releasing stale lock");
        releaseSaveLock();
        toast({
          title: "Save timed out",
          description:
            "The save took too long or may have stalled. Your draft is preserved — please try again.",
          variant: "destructive",
          duration: 12000,
        });
      }
    }, SAVE_LOCK_MAX_MS);

    try {
      await doSave();
    } catch (err: any) {
      console.error("[PurchaseEntry] Unexpected save error (outer guard):", err);
      toast({
        title: "Bill Save Failed",
        description: `Unexpected error: ${err?.message || String(err) || "Unknown error"}. Your draft is preserved — please try again.`,
        variant: "destructive",
        duration: 12000,
      });
    } finally {
      releaseSaveLock();
    }
  };

  const doSave = async () => {
    
    // Use Zod schema validation
    const validation = validatePurchaseBill({
      supplier_name: billData.supplier_name,
      supplier_id: billData.supplier_id || undefined,
      supplier_invoice_no: billData.supplier_invoice_no || undefined,
    });

    if (!validation.success) {
      toast({
        title: "Validation Error",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }

    if (!billData.supplier_invoice_no.trim()) {
      toast({
        title: "Validation Error",
        description: "Supplier invoice number is required",
        variant: "destructive",
      });
      return;
    }

    // HARD GUARD: never save a bill from an interrupted Excel import. The marker is
    // set when an import starts and cleared only when it completes — if it is still
    // present, the line items are a truncated subset of the Excel file.
    if (pendingImportRef.current) {
      const currentQty = lineItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      const { expectedQty } = pendingImportRef.current;
      if (currentQty + 0.5 < expectedQty) {
        toast({
          title: "Cannot save — Excel import incomplete",
          description: `The bill has ${currentQty.toLocaleString("en-IN")} qty but the imported Excel file had ${expectedQty.toLocaleString("en-IN")} qty. The import was interrupted before finishing. Discard this draft and re-import the Excel file, then save.`,
          variant: "destructive",
          duration: 15000,
        });
        return;
      }
      pendingImportRef.current = null;
    }

    // UNIQUENESS CHECK: Supplier Invoice No must be unique per supplier among active bills.
    // Cancelled bills are voided — same number may be reused (same as permanent delete).
    // When the user accepted the auto-generated serial (it collides because the global
    // count overlaps with another supplier's existing number), silently bump to the next
    // free number for THIS supplier instead of blocking the save.
    const activePurchaseBillOnly = "is_cancelled.is.null,is_cancelled.eq.false";
    if (billData.supplier_id && currentOrganization?.id) {
      let dupQuery = supabase
        .from("purchase_bills")
        .select("id, software_bill_no, supplier_invoice_no")
        .eq("organization_id", currentOrganization.id)
        .eq("supplier_id", billData.supplier_id)
        .eq("supplier_invoice_no", billData.supplier_invoice_no.trim())
        .is("deleted_at", null)
        .or(activePurchaseBillOnly)
        .limit(1);

      if (isEditMode && editingBillId) {
        dupQuery = dupQuery.neq("id", editingBillId);
      }

      const { data: dupBills, error: dupErr } = await dupQuery;
      if (dupErr) {
        console.error("[PurchaseEntry] Duplicate invoice check failed:", dupErr);
      } else if (dupBills && dupBills.length > 0) {
        const typedInv = billData.supplier_invoice_no.trim();
        const wasAutoGenerated = !isEditMode && nextSupplierInvNo && typedInv === String(nextSupplierInvNo);

        if (wasAutoGenerated) {
          const { data: lastForSupplier } = await supabase
            .from("purchase_bills")
            .select("supplier_invoice_no")
            .eq("organization_id", currentOrganization.id)
            .eq("supplier_id", billData.supplier_id)
            .is("deleted_at", null)
            .or(activePurchaseBillOnly)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          let bumped = incrementSupplierInvoiceNumber(lastForSupplier?.supplier_invoice_no);
          for (let attempt = 0; attempt < 50; attempt++) {
            const { data: stillDup } = await supabase
              .from("purchase_bills")
              .select("id")
              .eq("organization_id", currentOrganization.id)
              .eq("supplier_id", billData.supplier_id)
              .eq("supplier_invoice_no", bumped)
              .is("deleted_at", null)
              .or(activePurchaseBillOnly)
              .limit(1);
            if (!stillDup?.length) break;
            bumped = incrementSupplierInvoiceNumber(bumped);
          }
          setBillData(prev => ({ ...prev, supplier_invoice_no: bumped }));
          billData.supplier_invoice_no = bumped; // sync local for downstream insert this run
          toast({
            title: "Invoice number auto-adjusted",
            description: `Invoice no "${typedInv}" was already used for this supplier. Saving as "${bumped}" instead.`,
          });
        } else {
          toast({
            title: "Duplicate Invoice Number",
            description: `Invoice "${typedInv}" already exists for this supplier (Bill: ${dupBills[0].software_bill_no}). Please enter a different number.`,
            variant: "destructive",
            duration: 8000,
          });
          const inv = document.querySelector<HTMLInputElement>('[data-field="supplier-invoice-no"]');
          inv?.focus();
          inv?.select();
          return;
        }
      }
    }

    // CONTENT/DATE DUPLICATE GUARD: catch identical re-saves that have a different
    // supplier_invoice_no (e.g. the VELVET case: 3 bills /26 /27 /28 for the same
    // supplier on the same date with the same items, all saved within ~30 minutes).
    // We only check non-edit mode; user can override via "Save Anyway".
    if (!isEditMode && !overrideDuplicateRef.current && billData.supplier_id && currentOrganization?.id) {
      const filledQty = lineItems.reduce((s, r) => s + (Number(r.qty) || 0), 0);
      if (filledQty > 0) {
        const billDateStr = format(billDate, "yyyy-MM-dd");
        const { data: sameDayBills } = await supabase
          .from("purchase_bills")
          .select("id, software_bill_no, supplier_name, supplier_invoice_no, bill_date, net_amount, created_at, total_qty")
          .eq("organization_id", currentOrganization.id)
          .eq("supplier_id", billData.supplier_id)
          .eq("bill_date", billDateStr)
          .is("deleted_at", null)
          .or(activePurchaseBillOnly)
          .order("created_at", { ascending: false })
          .limit(20);

        if (sameDayBills && sameDayBills.length > 0) {
          const dupTotals = computePurchaseBillTotals(
            lineItems,
            discountAmount,
            otherCharges,
            isDcPurchase,
          );
          const calcNet = dupTotals.netAmount;

          const match = sameDayBills.find((b: any) => {
            const qtyMatch = b.total_qty != null && Math.abs(Number(b.total_qty) - filledQty) < 0.001;
            const amtMatch = Math.abs(Number(b.net_amount || 0) - calcNet) < 1;
            return qtyMatch || amtMatch;
          }) || sameDayBills[0];

          // Only block if (a) qty AND amount match, OR (b) any same-day bill within 60 min
          const matchedQty = match.total_qty != null && Math.abs(Number(match.total_qty) - filledQty) < 0.001;
          const matchedAmt = Math.abs(Number(match.net_amount || 0) - calcNet) < 1;
          const minsAgo = (Date.now() - new Date(match.created_at).getTime()) / 60000;
          const recent = minsAgo < 60;

          if ((matchedQty && matchedAmt) || (recent && (matchedQty || matchedAmt))) {
            const reason = matchedQty && matchedAmt
              ? `Same supplier, same date, same total qty (${filledQty}) and net amount (₹${Math.round(calcNet).toLocaleString("en-IN")}).`
              : matchedQty
                ? `Same supplier, same date, same total qty (${filledQty}) — saved ${Math.round(minsAgo)} min ago.`
                : `Same supplier, same date, same net amount (₹${Math.round(calcNet).toLocaleString("en-IN")}) — saved ${Math.round(minsAgo)} min ago.`;
            setDuplicateWarning({ bill: match as ExistingDuplicateBill, reason });
            return;
          }
        }
      }
    }
    overrideDuplicateRef.current = false;

    if (lineItems.length === 0 || !lineItems.some(item => item.qty > 0)) {
      toast({
        title: "Validation Error",
        description: "Please add at least one product with quantity > 0",
        variant: "destructive",
      });
      return;
    }

    // Force-save draft before attempting bill save (safety net against data loss)
    try {
      await saveDraft({
        billData,
        softwareBillNo,
        billDate: billDate.toISOString(),
        lineItems,
        roundOff,
        otherCharges,
        discountAmount,
        entryMode,
        isDcPurchase,
        isEditMode,
        editingBillId,
        originalLineItems,
      }, false);
      
    } catch (draftErr) {
      console.error('[PurchaseEntry] Draft safety-save failed:', draftErr);
    }
    
    try {
      const billTotals = computePurchaseBillTotals(
        lineItems,
        discountAmount,
        otherCharges,
        isDcPurchase,
      );
      const calculatedGrossBeforeDiscount = billTotals.grossBeforeDiscount;
      const calculatedItemDiscount = billTotals.itemDiscount;
      const calculatedTotalDiscount = calculatedItemDiscount + discountAmount;
      const calculatedGrossAfterDiscount = billTotals.taxableAmount;
      const calculatedGst = billTotals.gstAmount;
      const calculatedNet = billTotals.netAmount;
      const calculatedRoundOff = billTotals.roundOff;

      if (isEditMode && editingBillId) {
        // Update existing bill
        const { error: billError } = await supabase
          .from("purchase_bills")
          .update({
            supplier_id: billData.supplier_id || null,
            supplier_name: billData.supplier_name,
              supplier_invoice_no: billData.supplier_invoice_no,
              bill_date: format(billDate, "yyyy-MM-dd"),
              gross_amount: calculatedGrossBeforeDiscount,
              discount_amount: calculatedTotalDiscount,
              gst_amount: isDcPurchase ? 0 : calculatedGst,
              other_charges: otherCharges,
              net_amount: isDcPurchase ? (calculatedGrossAfterDiscount + otherCharges + calculatedRoundOff) : calculatedNet,
              round_off: calculatedRoundOff,
              is_dc_purchase: isDcPurchase,
            })
            .eq("id", editingBillId);

        if (billError) throw billError;

        // =====================================================
        // INTELLIGENT LINE ITEM HANDLING
        // Compare old vs new items to determine INSERT/UPDATE/DELETE
        // =====================================================

        // Build maps for comparison
        const originalItemsMap = new Map(
          originalLineItems.map(item => [item.temp_id, item])
        );
        const currentItemsMap = new Map(
          lineItems.map(item => [item.temp_id, item])
        );

        // 1. Find items to DELETE (in original but not in current)
        const itemsToDelete = originalLineItems
          .filter(item => !currentItemsMap.has(item.temp_id))
          .map(item => item.temp_id);

        if (itemsToDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from("purchase_items")
            .delete()
            .in("id", itemsToDelete);
          
          if (deleteError) throw deleteError;
          
        }

        // 2. Find items to UPDATE (exists in both, but qty/price/details changed)
        const itemsToUpdate = lineItems.filter(item => {
          const original = originalItemsMap.get(item.temp_id);
          if (!original) return false; // Not in original, so it's new
          
        // Check if any relevant fields changed
          return (
            original.qty !== item.qty ||
            original.pur_price !== item.pur_price ||
            original.sale_price !== item.sale_price ||
            original.mrp !== item.mrp ||
            original.gst_per !== item.gst_per ||
            original.product_name !== item.product_name ||
            original.brand !== item.brand ||
            original.color !== item.color ||
            original.style !== item.style ||
            original.category !== item.category ||
            original.hsn_code !== item.hsn_code ||
            original.sku_id !== item.sku_id ||
            original.size !== item.size
          );
        });

        for (const item of itemsToUpdate) {
          const { error: updateError } = await supabase
            .from("purchase_items")
            .update({
              product_name: item.product_name,
              sku_id: item.sku_id,
              size: item.size,
              qty: item.qty,
              pur_price: item.pur_price,
              sale_price: item.sale_price,
              mrp: item.mrp || 0,
              gst_per: Math.round(item.gst_per),
              line_total: item.line_total,
              hsn_code: item.hsn_code || null,
              brand: item.brand || null,
              category: item.category || null,
              color: item.color || null,
              style: item.style || null,
            })
            .eq("id", item.temp_id);
          
          if (updateError) throw updateError;
        }
        
        if (itemsToUpdate.length > 0) {
          
        }

        // 3. Find items to INSERT (new items not in original)
        const itemsToInsert = lineItems
          .filter(item => !originalItemsMap.has(item.temp_id))
          .map(item => ({
            bill_id: editingBillId,
            product_id: item.product_id,
            sku_id: item.sku_id,
            product_name: item.product_name,
            size: item.size,
            qty: item.qty,
            pur_price: item.pur_price,
            sale_price: item.sale_price,
            mrp: item.mrp || 0,
            gst_per: Math.round(item.gst_per),
            hsn_code: item.hsn_code || null,
            barcode: item.barcode || null,
            line_total: item.line_total,
            bill_number: softwareBillNo,
            brand: item.brand || null,
            category: item.category || null,
            color: item.color || null,
            style: item.style || null,
          }));

        let insertedNewItems: LineItem[] = [];
        if (itemsToInsert.length > 0) {
          // Insert in chunks of 100 to avoid statement timeout on large bills
          const EDIT_CHUNK_SIZE = 100;
          for (let ci = 0; ci < itemsToInsert.length; ci += EDIT_CHUNK_SIZE) {
            const chunk = itemsToInsert.slice(ci, ci + EDIT_CHUNK_SIZE);
            const { error: insertError } = await supabase
              .from("purchase_items")
              .insert(chunk);
            if (insertError) throw insertError;
          }
          
          
          // Map inserted items back to LineItem format for barcode printing
          insertedNewItems = lineItems.filter(item => !originalItemsMap.has(item.temp_id));
        }

        // Store items for barcode printing (edit mode)
        // Batch-fetch product details instead of N individual queries
        const editUniqueProductIds = [...new Set(lineItems.map(i => i.product_id))];
        const editProductMap = new Map<string, { brand: string; color: string; style: string }>();
        for (let pi = 0; pi < editUniqueProductIds.length; pi += 200) {
          const chunk = editUniqueProductIds.slice(pi, pi + 200);
          const { data: prods } = await supabase.from("products").select("id, brand, color, style").in("id", chunk);
          (prods || []).forEach(p => editProductMap.set(p.id, { brand: p.brand || "", color: p.color || "", style: p.style || "" }));
        }
        const editItemsWithDetails = lineItems.map(item => {
          const pd = editProductMap.get(item.product_id) || { brand: "", color: "", style: "" };
          return { ...item, brand: item.brand || pd.brand, color: item.color || pd.color, style: item.style || pd.style };
        });
        setSavedPurchaseItems(editItemsWithDetails);
        setSavedBillId(editingBillId);
        setSavedSupplierId(billData.supplier_id || null);
        setNewlyAddedItems(insertedNewItems);

        // Clear "user cancelled" tag for products that are now in this saved bill
        if (editUniqueProductIds.length > 0) {
          for (let pi = 0; pi < editUniqueProductIds.length; pi += 200) {
            const chunk = editUniqueProductIds.slice(pi, pi + 200);
            await supabase
              .from("products")
              .update({ user_cancelled_at: null })
              .in("id", chunk);
          }
        }

        if (accountingEngineOn && editingBillId) {
          const editNet = isDcPurchase
            ? calculatedGrossAfterDiscount + otherCharges + roundOff
            : calculatedNet;
          const editBillId = editingBillId;
          const { data: billAfter } = await supabase
            .from("purchase_bills")
            .select("paid_amount")
            .eq("id", editBillId)
            .single();
          try {
            await deleteJournalEntryByReference(
              currentOrganization!.id,
              "Purchase",
              editBillId,
              supabase
            );
            await recordPurchaseJournalEntry(
              editBillId,
              currentOrganization!.id,
              editNet,
              Number(billAfter?.paid_amount ?? 0),
              "pay_later",
              supabase,
              format(billDate, "yyyy-MM-dd")
            );
            await (supabase as any)
              .from("purchase_bills")
              .update({ journal_status: "posted", journal_error: null })
              .eq("id", editBillId);
          } catch (journalErr) {
            console.error("Auto-journal (purchase edit) failed:", journalErr);
            await (supabase as any)
              .from("purchase_bills")
              .update({
                journal_status: "failed",
                journal_error: journalErr instanceof Error ? journalErr.message : "Failed to post journal",
              })
              .eq("id", editBillId);
          }
        }

        // Check for price changes and show dialog if any
        const priceChanges = await detectPriceChanges(lineItems);
        if (priceChanges.length > 0) {
          setDetectedPriceChanges(priceChanges);
          setPendingSaveItems([...lineItems]);
          setShowPriceUpdateDialog(true);
          // Defer print dialog until price update is handled
          if (enableBarcodePrompt) {
            setPendingPrintAfterPriceUpdate(true);
          }
        } else {
          // No price changes — show print dialog immediately
          if (enableBarcodePrompt) {
            setShowPrintDialog(true);
          }
        }

        await finalizeSuccessfulPurchaseSave();

        // Reset edit mode state - Critical fix for duplicate bill prevention
        setIsEditMode(false);
        setOriginalLineItems([]);
        setEditingBillId(null);
        
        // Clear location state to prevent re-triggering edit mode on refresh
        window.history.replaceState({}, document.title);
        
        // Stay on purchase bill page - reset form for new entry
        setBillData({
          supplier_id: "",
          supplier_name: "",
          supplier_invoice_no: "",
        });
        setBillDate(new Date());
        setBillEntryAt(null);
        setLineItems([]);
        setOtherCharges(0);
        setDiscountAmount(0);
        setRoundOff(0);
        setSoftwareBillNo("");
        setIsDcPurchase(false);
      } else {
        // Insert new purchase bill
        if (!currentOrganization?.id) throw new Error("No organization selected");

        // Duplicate bill detection: check if a bill with same supplier + date + amount already exists
        if (!pendingSaveRef.current) {
          const formattedDate = format(billDate, "yyyy-MM-dd");
          const { data: existingBills } = await supabase
            .from("purchase_bills")
            .select("software_bill_no, bill_date")
            .eq("organization_id", currentOrganization.id)
            .eq("supplier_name", billData.supplier_name)
            .eq("bill_date", formattedDate)
            .gte("net_amount", calculatedNet - 1)
            .lte("net_amount", calculatedNet + 1)
            .is("deleted_at", null)
            .limit(1);

          if (existingBills && existingBills.length > 0) {
            setDuplicateBillInfo({
              bill_no: existingBills[0].software_bill_no,
              bill_date: existingBills[0].bill_date,
            });
            setShowDuplicateBillWarning(true);
            return;
          }
        }
        pendingSaveRef.current = false;
        
        // Generate bill number right before saving
        const { data: newBillNo, error: billNoError } = await supabase.rpc("generate_purchase_bill_number_atomic", {
          p_organization_id: currentOrganization.id
        });
        
        if (billNoError) throw billNoError;
        const finalBillNo = newBillNo;
        
        const { data: billDataResult, error: billError } = await supabase
          .from("purchase_bills")
          .insert([
            {
              software_bill_no: finalBillNo,
              supplier_id: billData.supplier_id || null,
              supplier_name: billData.supplier_name,
              supplier_invoice_no: billData.supplier_invoice_no,
              bill_date: format(billDate, "yyyy-MM-dd"),
              bill_entry_at: new Date().toISOString(),
              gross_amount: calculatedGrossBeforeDiscount,
              discount_amount: calculatedTotalDiscount,
              gst_amount: isDcPurchase ? 0 : calculatedGst,
              other_charges: otherCharges,
              net_amount: isDcPurchase ? (calculatedGrossAfterDiscount + otherCharges + calculatedRoundOff) : calculatedNet,
              round_off: calculatedRoundOff,
              organization_id: currentOrganization.id,
              is_dc_purchase: isDcPurchase,
            },
          ])
          .select()
          .single();

        if (billError) throw billError;

        setBillEntryAt(
          getPurchaseBillEntryAt(billDataResult as { bill_entry_at?: string | null; created_at?: string }),
        );

        // Insert purchase items with sku_id for stock tracking
        const itemsToInsert = lineItems.map((item) => ({
          bill_id: billDataResult.id,
          product_id: item.product_id,
          sku_id: item.sku_id,
          product_name: item.product_name,
          size: item.size,
          qty: item.qty,
          pur_price: item.pur_price,
          sale_price: item.sale_price,
          mrp: item.mrp || 0,
          gst_per: isDcPurchase ? 0 : Math.round(item.gst_per),
          hsn_code: item.hsn_code,
          barcode: item.barcode,
          line_total: item.line_total,
          bill_number: finalBillNo,
          brand: item.brand || null,
          category: item.category || null,
          color: item.color || null,
          style: item.style || null,
          is_dc_item: isDcPurchase,
        }));

        // Insert purchase items in chunks of 100 to avoid statement timeout on large bills
        const INSERT_CHUNK_SIZE = 100;
        const isLargeBill = itemsToInsert.length > 50;
        if (isLargeBill) {
          toast({ title: "Saving large bill...", description: `Saving ${itemsToInsert.length} items. Please wait...` });
        }
        for (let ci = 0; ci < itemsToInsert.length; ci += INSERT_CHUNK_SIZE) {
          const chunk = itemsToInsert.slice(ci, ci + INSERT_CHUNK_SIZE);
          const { error: itemsError } = await supabase.from("purchase_items").insert(chunk);
          if (itemsError) throw itemsError;
        }

        // Accounting Phase 1 rollout-safe gate: auto-journal only for enabled orgs
        if (accountingEngineOn) {
          try {
            await recordPurchaseJournalEntry(
              billDataResult.id,
              currentOrganization.id,
              Number((billDataResult as any)?.net_amount ?? (isDcPurchase ? (calculatedGrossAfterDiscount + otherCharges + roundOff) : calculatedNet)),
              Number((billDataResult as any)?.paid_amount ?? 0),
              String((billDataResult as any)?.payment_method || "pay_later"),
              supabase,
              format(billDate, "yyyy-MM-dd")
            );
            await (supabase as any)
              .from("purchase_bills")
              .update({ journal_status: "posted", journal_error: null })
              .eq("id", billDataResult.id);
          } catch (journalErr) {
            console.error("Auto-journal (purchase) failed:", journalErr);
            await (supabase as any)
              .from("purchase_bills")
              .update({
                journal_status: "failed",
                journal_error: journalErr instanceof Error ? journalErr.message : "Failed to post journal",
              })
              .eq("id", billDataResult.id);
          }
        }

        // Flag product variants as DC products (or reset if non-DC purchase)
        // Chunk variant updates to avoid IN clause timeout on large bills
        const variantIds = [...new Set(lineItems.map(i => i.sku_id))];
        const VARIANT_CHUNK = 200;
        for (let vi = 0; vi < variantIds.length; vi += VARIANT_CHUNK) {
          const chunk = variantIds.slice(vi, vi + VARIANT_CHUNK);
          await supabase.from("product_variants").update({ is_dc_product: isDcPurchase }).in("id", chunk);
        }

        // Clear "user cancelled" tag for products that are now actually billed
        const billedProductIds = [...new Set(lineItems.map(i => i.product_id).filter(Boolean))];
        if (billedProductIds.length > 0) {
          for (let pi = 0; pi < billedProductIds.length; pi += VARIANT_CHUNK) {
            const chunk = billedProductIds.slice(pi, pi + VARIANT_CHUNK);
            await supabase
              .from("products")
              .update({ user_cancelled_at: null })
              .in("id", chunk);
          }
        }

        // Check for price changes and show dialog if any
        const priceChanges = await detectPriceChanges(lineItems);
        const hasPriceChanges = priceChanges.length > 0;
        if (hasPriceChanges) {
          setDetectedPriceChanges(priceChanges);
          setPendingSaveItems([...lineItems]);
          setShowPriceUpdateDialog(true);
        }

        // Silent operation - no toast for purchase bill save

        // Batch-fetch product details instead of N individual queries
        const uniqueProductIds = [...new Set(lineItems.map(i => i.product_id))];
        const productDetailsMap = new Map<string, { brand: string; color: string; style: string }>();
        for (let pi = 0; pi < uniqueProductIds.length; pi += 200) {
          const chunk = uniqueProductIds.slice(pi, pi + 200);
          const { data: prods } = await supabase.from("products").select("id, brand, color, style").in("id", chunk);
          (prods || []).forEach(p => productDetailsMap.set(p.id, { brand: p.brand || "", color: p.color || "", style: p.style || "" }));
        }
        const itemsWithDetails = lineItems.map(item => {
          const pd = productDetailsMap.get(item.product_id) || { brand: "", color: "", style: "" };
          return { ...item, brand: item.brand || pd.brand, color: item.color || pd.color, style: item.style || pd.style };
        });

        // Store items for barcode printing
        setSavedPurchaseItems(itemsWithDetails);
        setSavedBillId(billDataResult.id);
        setSavedSupplierId(billData.supplier_id || null);
        setNewlyAddedItems([]); // All items are new for a new bill
        if (enableBarcodePrompt) {
          if (hasPriceChanges) {
            // Defer print dialog until price update is handled
            setPendingPrintAfterPriceUpdate(true);
          } else {
            setShowPrintDialog(true);
          }
        }

        await finalizeSuccessfulPurchaseSave();

        // Reset edit mode if we were editing
        if (isEditMode) {
          setIsEditMode(false);
          setEditingBillId(null);
          setOriginalLineItems([]);
        }

        // Reset form and generate new bill number
        setBillData({
          supplier_id: "",
          supplier_name: "",
          supplier_invoice_no: "",
        });
        setBillDate(new Date());
        setBillEntryAt(null);
        setLineItems([]);
        setOtherCharges(0);
        setDiscountAmount(0);
        setRoundOff(0);
        setSoftwareBillNo(""); // Reset for next entry
        setIsDcPurchase(false);
      }
    } catch (error: any) {
      logError(
        {
          operation: 'purchase_bill_save',
          organizationId: currentOrganization?.id,
          additionalContext: {
            lineItemsCount: lineItems.length,
            isEditMode,
            editingBillId,
            supplierInvoice: billData.supplier_invoice_no,
          },
        },
        error
      );
      console.error('[PurchaseEntry] Bill save FAILED:', {
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        supplierName: billData.supplier_name,
        itemCount: lineItems.length,
        isEdit: isEditMode,
      });
      const info = extractErrorInfo(error);
      toast({
        title: "Bill Save Failed — Draft Preserved",
        description: `${info.message}${info.code ? ` (code: ${info.code})` : ''}. Your data is safe in draft. Please try again.`,
        variant: "destructive",
        duration: 12000,
      });
    }
  };

  const itemDiscountTotal = lineItems.reduce((sum, r) => {
    const sub = computePurchaseLineSubTotal(r);
    return sum + roundMoney(sub * r.discount_percent / 100);
  }, 0);

  const billFooterTotals = computePurchaseBillTotals(
    lineItems,
    discountAmount,
    otherCharges,
    isDcPurchase,
  );
  const taxableAmount = billFooterTotals.taxableAmount;

  const totals = { 
    totalQty: lineItems.reduce((sum, item) => sum + item.qty, 0),
    totalDiscount: discountAmount,
    itemDiscount: itemDiscountTotal,
    grossAmount, 
    taxableAmount,
    gstAmount, 
    netAmount 
  };

  const handlePrintBarcodes = async () => {
    if (lineItems.length === 0) {
      toast({
        title: "No Items",
        description: "Add items to print barcodes",
        variant: "destructive",
      });
      return;
    }

    // Get items to print - either selected items or all items if none selected
    const itemsToPrint = selectedForPrint.size > 0
      ? lineItems.filter(item => selectedForPrint.has(item.temp_id))
      : lineItems;

    if (itemsToPrint.length === 0) {
      toast({
        title: "No Items Selected",
        description: "Please select items to print barcodes",
        variant: "destructive",
      });
      return;
    }

    try {
      // Fetch supplier code
      let supplierCode = "";
      const suppId = savedSupplierId || billData.supplier_id;
      if (suppId) {
        const { data: supplierData } = await supabase
          .from("suppliers")
          .select("supplier_code")
          .eq("id", suppId)
          .single();
        supplierCode = supplierData?.supplier_code || "";
      }

      // Format items for barcode printing page
      const barcodeItems = itemsToPrint.map((item) => ({
        sku_id: item.sku_id,
        product_name: item.product_name || "",
        brand: item.brand || "",
        category: item.category || "",
        color: item.color || "",
        style: item.style || "",
        size: item.size,
        sale_price: item.sale_price,
        mrp: item.mrp,
        pur_price: item.pur_price,
        barcode: item.barcode,
        qty: item.qty,
        bill_number: softwareBillNo || "",
        bill_date: format(billDate, "yyyy-MM-dd"),
        supplier_code: supplierCode,
      }));

      // Clear selection after navigation
      setSelectedForPrint(new Set());

      // Navigate to barcode printing page with items
      navigate("/barcode-printing", { 
        state: { purchaseItems: barcodeItems, billId: savedBillId || editingBillId } 
      });
    } catch (error) {
      console.error("Error preparing barcode data:", error);
      toast({
        title: "Error",
        description: "Failed to prepare barcode data",
        variant: "destructive",
      });
    }
  };

  // Toggle selection for a single item
  const toggleItemSelection = (tempId: string) => {
    setSelectedForPrint(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tempId)) {
        newSet.delete(tempId);
      } else {
        newSet.add(tempId);
      }
      return newSet;
    });
  };

  // Toggle select all
  const toggleSelectAll = () => {
    if (selectedForPrint.size === lineItems.length) {
      setSelectedForPrint(new Set());
    } else {
      setSelectedForPrint(new Set(lineItems.map(item => item.temp_id)));
    }
  };

  // Handle Excel import for purchase bill with batch processing
  const handleExcelImport = async (
    mappedData: Record<string, any>[],
    onProgress?: (progress: ImportProgress) => void
  ) => {
    if (!currentOrganization) return;

    let skippedCount = 0;
    const reportImportProgress = (
      current: number,
      total: number,
      label: string,
      counts?: { successCount?: number; errorCount?: number; skippedCount?: number },
    ) => {
      setExcelImportLoading({ current, total, label });
      onProgress?.({
        current,
        total,
        successCount: counts?.successCount ?? current,
        errorCount: counts?.errorCount ?? 0,
        skippedCount: counts?.skippedCount ?? skippedCount,
        isImporting: true,
      });
    };

    try {
    const baseLineItems = lineItems;

    // Extract bill-level data from first row if present
    const firstRow = mappedData[0];
    if (firstRow) {
      // Set supplier if provided
      if (firstRow.bill_supplier_name) {
        const supplierName = firstRow.bill_supplier_name?.toString().trim();
        const matchingSupplier = suppliers.find(s => 
          s.supplier_name?.toLowerCase().trim() === supplierName?.toLowerCase()
        );
        if (matchingSupplier) {
          setBillData(prev => ({
            ...prev,
            supplier_id: matchingSupplier.id,
            supplier_name: matchingSupplier.supplier_name,
            supplier_invoice_no: firstRow.bill_supplier_invoice_no?.toString().trim() || prev.supplier_invoice_no,
          }));
        } else {
          // Just set the name if supplier not found
          setBillData(prev => ({
            ...prev,
            supplier_name: supplierName,
            supplier_invoice_no: firstRow.bill_supplier_invoice_no?.toString().trim() || prev.supplier_invoice_no,
          }));
        }
      } else if (firstRow.bill_supplier_invoice_no) {
        // Set invoice number even without supplier name
        setBillData(prev => ({
          ...prev,
          supplier_invoice_no: firstRow.bill_supplier_invoice_no?.toString().trim(),
        }));
      }
      
      // Set bill date if provided
      if (firstRow.bill_date) {
        const parsedDate = parseExcelDate(firstRow.bill_date);
        if (parsedDate) {
          setBillDate(parsedDate);
        }
      }
      
      // Set other charges if provided
      if (firstRow.bill_other_charges) {
        const charges = Number(firstRow.bill_other_charges);
        if (!isNaN(charges) && charges > 0) {
          setOtherCharges(charges);
        }
      }
    }
    
    // Extract courier / freight rows into bill charges (not product lines)
    let freightChargesFromExcel = 0;
    const rowsWithoutFreight = mappedData.filter((row) => {
      if (isPurchaseFreightOrChargeRow(row)) {
        freightChargesFromExcel += extractChargeAmountFromRow(row);
        return false;
      }
      return true;
    });
    if (freightChargesFromExcel > 0) {
      setOtherCharges((prev) => Math.max(prev, freightChargesFromExcel));
    }

    // Helper function to detect summary/total rows or empty rows
    const isSummaryOrEmptyRow = (row: Record<string, any>): boolean => {
      if (isPurchaseFreightOrChargeRow(row)) return true;
      // Real product lines must never be dropped as "empty"
      const rowQty = parseLocalizedNumber(row.qty);
      if (
        row.product_name?.toString().trim() &&
        row.size?.toString().trim() &&
        rowQty > 0
      ) {
        return false;
      }
      const summaryKeywords = ['total', 'subtotal', 'sub-total', 'grand total', 'sum', 'net', 'gross', 'amount', 'shipping', 'freight', 'transport', 'charges', 'discount', 'tax', 'gst'];
      let meaningfulValueCount = 0;
      
      for (const value of Object.values(row)) {
        if (value !== undefined && value !== null && value !== '') {
          meaningfulValueCount++;
          if (typeof value === 'string') {
            const lowerValue = value.toLowerCase().trim();
            if (summaryKeywords.some(keyword => lowerValue === keyword || lowerValue.startsWith(keyword + ' ') || lowerValue.endsWith(' ' + keyword))) {
              return true;
            }
          }
        }
      }
      // Skip rows with very few values (likely empty/separator rows)
      return meaningfulValueCount <= 2;
    };

    // Filter valid rows - skip empty rows and summary/total rows
    const validRows = rowsWithoutFreight.filter(row => 
      row.product_name?.toString().trim() && 
      row.size?.toString().trim() && 
      parseLocalizedNumber(row.qty) > 0 &&
      !isSummaryOrEmptyRow(row)
    );

    // Show clear error if no valid rows found after filtering
    if (validRows.length === 0) {
      toast({
        title: "No valid rows found",
        description: "Please check that required columns (Product Name, Size, Quantity, Purchase Price) are mapped correctly.",
        variant: "destructive",
      });
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    skippedCount = mappedData.length - validRows.length;

    // Mark import as in-flight BEFORE any async work. This marker rides on every
    // draft checkpoint — if the import is interrupted (refresh / tab close / crash),
    // the restored draft is flagged incomplete and saving is hard-blocked.
    const baseQtyBeforeImport = baseLineItems.reduce(
      (sum, item) => sum + (Number(item.qty) || 0),
      0,
    );
    const excelExpectedQty = validRows.reduce(
      (sum, row) => sum + (parseLocalizedNumber(row.qty) || 0),
      0,
    );
    pendingImportRef.current = {
      expectedRows: baseLineItems.length + validRows.length,
      expectedQty: baseQtyBeforeImport + excelExpectedQty,
    };

    reportImportProgress(0, validRows.length, "Starting Excel import...");

    // Helper: stable product key for deduplication
    const makeProductKey = (row: Record<string, any>) =>
      [
        row.product_name?.toString().trim() || '',
        row.brand?.toString().trim() || '',
        row.category?.toString().trim() || '',
        row.color?.toString().trim() || '',
        row.style?.toString().trim() || '',
      ].join('|').toLowerCase();

    const buildImportLineItem = (
      row: Record<string, any>,
      rowIndex: number,
      productId: string,
      skuId: string,
      barcode: string,
    ): LineItem => {
      const size = row.size?.toString().trim() || '';
      const qty = parseLocalizedNumber(row.qty) || 0;
      const purPrice = normalizePurchaseUnitPrice(parseLocalizedNumber(row.pur_price) || 0);
      const uom = row.uom?.toString().trim() || 'NOS';
      const excelLineTotal = parseLocalizedNumber(row.line_total);
      const hasExcelLineTotal = excelLineTotal > 0;
      const lineTotal = hasExcelLineTotal ? roundMoney(excelLineTotal) : roundMoney(qty * purPrice);
      const multiplier = getPurchaseLineMultiplier({ uom, size, qty });
      const effectivePurPrice =
        hasExcelLineTotal && multiplier > 0 ? roundMoney(excelLineTotal / multiplier) : purPrice;

      return {
        temp_id: `import_${rowIndex}_${barcode || skuId}`,
        product_id: productId,
        sku_id: skuId,
        product_name: row.product_name?.toString().trim() || '',
        size,
        qty,
        pur_price: effectivePurPrice,
        sale_price: parseLocalizedNumber(row.sale_price) || 0,
        gst_per: parseLocalizedNumber(row.gst_per) || 0,
        hsn_code: row.hsn_code?.toString().trim() || '',
        barcode,
        discount_percent: 0,
        line_total: lineTotal,
        brand: row.brand?.toString().trim(),
        category: row.category?.toString().trim(),
        color: row.color?.toString().trim(),
        style: row.style?.toString().trim(),
        uom,
      };
    };

    // ── Phase 1: Load ALL org products (Supabase default cap is 1000 rows/page) ──
    reportImportProgress(0, validRows.length, "Loading product catalog...");
    const productMap = new Map<string, string>();
    const PRODUCT_PAGE = 1000;
    let productOffset = 0;
    while (true) {
      const { data: page, error: pageErr } = await supabase
        .from('products')
        .select('id, product_name, brand, category, color, style')
        .eq('organization_id', currentOrganization.id)
        .is('deleted_at', null)
        .range(productOffset, productOffset + PRODUCT_PAGE - 1);
      if (pageErr) {
        console.error('Product catalog fetch error:', pageErr);
        break;
      }
      if (!page?.length) break;
      page.forEach((p) => {
        productMap.set(
          [p.product_name || '', p.brand || '', p.category || '', p.color || '', p.style || '']
            .join('|').toLowerCase(),
          p.id,
        );
      });
      if (page.length < PRODUCT_PAGE) break;
      productOffset += PRODUCT_PAGE;
    }

    reportImportProgress(0, validRows.length, "Preparing barcodes...", { skippedCount });

    // ── Phase 2: Barcodes — prefer Excel column; generate only when blank ──
    const barcodePool: string[] = new Array(validRows.length);
    const rowsNeedingGeneratedBarcode: number[] = [];
    for (let i = 0; i < validRows.length; i++) {
      const excelBarcode = normalizeImportBarcode(validRows[i].barcode);
      if (excelBarcode) {
        barcodePool[i] = excelBarcode;
      } else {
        rowsNeedingGeneratedBarcode.push(i);
      }
    }
    for (let g = 0; g < rowsNeedingGeneratedBarcode.length; g++) {
      const rowIndex = rowsNeedingGeneratedBarcode[g];
      const { data: generated } = await supabase.rpc('generate_next_barcode', {
        p_organization_id: currentOrganization.id,
      });
      barcodePool[rowIndex] =
        (generated as string) ||
        `IMP${Date.now()}${rowIndex}${Math.random().toString(36).slice(2, 7)}`;
      if (g % 100 === 0 || g === rowsNeedingGeneratedBarcode.length - 1) {
        reportImportProgress(
          Math.min(g + 1, validRows.length),
          validRows.length,
          rowsNeedingGeneratedBarcode.length > 0
            ? `Generating barcodes (${g + 1} / ${rowsNeedingGeneratedBarcode.length})...`
            : "Preparing items...",
          { skippedCount },
        );
      }
    }

    // Pre-fetch existing variants for Excel barcodes (reuse on re-import / partial runs)
    const existingVariantByBarcode = new Map<string, string>();
    const excelBarcodes = barcodePool.filter(Boolean);
    for (let b = 0; b < excelBarcodes.length; b += 500) {
      const chunk = [...new Set(excelBarcodes.slice(b, b + 500))];
      const { data: existingVariants } = await supabase
        .from('product_variants')
        .select('id, barcode')
        .eq('organization_id', currentOrganization.id)
        .in('barcode', chunk)
        .is('deleted_at', null);
      (existingVariants || []).forEach((v) => {
        if (v.barcode) existingVariantByBarcode.set(v.barcode, v.id);
      });
    }

    // ── Phase 3: Batch-create missing products (200 per insert) ───────────
    const newProductsToInsert: { key: string; insertData: Record<string, unknown> }[] = [];
    const seenNewProductKeys = new Set<string>();
    for (const row of validRows) {
      const key = makeProductKey(row);
      if (!productMap.has(key) && !seenNewProductKeys.has(key)) {
        seenNewProductKeys.add(key);
        newProductsToInsert.push({
          key,
          insertData: {
            organization_id: currentOrganization.id,
            product_name: row.product_name?.toString().trim(),
            category: row.category?.toString().trim() || null,
            brand: row.brand?.toString().trim() || null,
            style: row.style?.toString().trim() || null,
            color: row.color?.toString().trim() || null,
            hsn_code: row.hsn_code?.toString().trim() || null,
            gst_per: parseLocalizedNumber(row.gst_per),
            default_pur_price: parseLocalizedNumber(row.pur_price),
            default_sale_price: parseLocalizedNumber(row.sale_price),
            status: 'active',
          },
        });
      }
    }

    const PRODUCT_BATCH_SIZE = 200;
    for (let i = 0; i < newProductsToInsert.length; i += PRODUCT_BATCH_SIZE) {
      reportImportProgress(
        Math.min(i + PRODUCT_BATCH_SIZE, newProductsToInsert.length),
        validRows.length,
        newProductsToInsert.length > 0
          ? `Creating products (${Math.min(i + PRODUCT_BATCH_SIZE, newProductsToInsert.length)} / ${newProductsToInsert.length})...`
          : "Preparing line items...",
        { skippedCount },
      );
      const batch = newProductsToInsert.slice(i, i + PRODUCT_BATCH_SIZE);
      const { data: createdProducts, error: productBatchErr } = await supabase
        .from('products')
        .insert(batch.map((p) => p.insertData) as any)
        .select('id');

      if (!productBatchErr && createdProducts) {
        createdProducts.forEach((product: { id: string }, idx: number) => {
          if (batch[idx]) productMap.set(batch[idx].key, product.id);
        });
      } else {
        for (const entry of batch) {
          const { data: single, error: singleErr } = await supabase
            .from('products')
            .insert(entry.insertData as any)
            .select('id')
            .single();
          if (!singleErr && single) {
            productMap.set(entry.key, (single as { id: string }).id);
          } else if (productMap.has(entry.key)) {
            // already mapped from catalog page fetch
          } else {
            console.error('Product insert error:', singleErr);
          }
        }
      }
    }

    // ── Phase 4: Variants — reuse by barcode or batch-insert new SKUs ─────
    type VariantRow = { rowIndex: number; variantData: Record<string, unknown>; row: Record<string, any> };
    const variantRowsToInsert: VariantRow[] = [];
    const insertedVariantMap = new Map<number, string>();

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const productId = productMap.get(makeProductKey(row));
      if (!productId) {
        errorCount++;
        continue;
      }
      const barcode = barcodePool[i] || `IMP${Date.now()}${i}`;
      const existingSku = existingVariantByBarcode.get(barcode);
      if (existingSku) {
        insertedVariantMap.set(i, existingSku);
        successCount++;
        continue;
      }
      variantRowsToInsert.push({
        rowIndex: i,
        variantData: {
          organization_id: currentOrganization.id,
          product_id: productId,
          size: row.size?.toString().trim() || '',
          color: row.color?.toString().trim() || null,
          barcode,
          pur_price: parseLocalizedNumber(row.pur_price),
          sale_price: parseLocalizedNumber(row.sale_price),
          stock_qty: 0,
          active: true,
        },
        row,
      });
    }

    const VARIANT_BATCH_SIZE = 200;

    const buildLineItemsFromMap = (): LineItem[] => {
      const items: LineItem[] = [];
      for (let ri = 0; ri < validRows.length; ri++) {
        const skuId = insertedVariantMap.get(ri);
        if (!skuId) continue;
        const row = validRows[ri];
        const productId = productMap.get(makeProductKey(row));
        if (!productId) continue;
        items.push(
          buildImportLineItem(row, ri, productId, skuId, barcodePool[ri] || ''),
        );
      }
      return items;
    };

    const resolveVariantId = async (
      variantData: Record<string, unknown>,
      rowIndex: number,
    ): Promise<string | null> => {
      const { data: single, error: singleErr } = await supabase
        .from('product_variants')
        .insert(variantData as any)
        .select('id')
        .single();
      if (!singleErr && single) return (single as { id: string }).id;

      const barcode = variantData.barcode?.toString();
      if (barcode) {
        const { data: existing } = await supabase
          .from('product_variants')
          .select('id')
          .eq('organization_id', currentOrganization.id)
          .eq('barcode', barcode)
          .is('deleted_at', null)
          .maybeSingle();
        if (existing) return existing.id;
      }
      console.error('Variant insert error:', singleErr);
      return null;
    };

    // Track Excel row numbers (header is row 1) that fail to import, so the user can retry just those rows.
    const failedExcelRows: number[] = [];
    const totalBatches = Math.ceil(variantRowsToInsert.length / VARIANT_BATCH_SIZE);
    for (let i = 0; i < variantRowsToInsert.length; i += VARIANT_BATCH_SIZE) {
      const batchIndex = Math.floor(i / VARIANT_BATCH_SIZE) + 1;
      const batchSlice = variantRowsToInsert.slice(i, i + VARIANT_BATCH_SIZE);

      // Per-batch try/catch so a single batch error (timeout, network blip, RLS hiccup)
      // can never short-circuit the remaining batches and silently truncate the import.
      try {
        const { data: inserted, error: batchErr } = await supabase
          .from('product_variants')
          .insert(batchSlice.map((v) => v.variantData) as any)
          .select('id');

        if (!batchErr && inserted && inserted.length === batchSlice.length) {
          inserted.forEach((v: { id: string }, j: number) => {
            if (batchSlice[j]) insertedVariantMap.set(batchSlice[j].rowIndex, v.id);
          });
          successCount += inserted.length;
        } else {
          // Either an error, or a partial response — fall back to per-row resolution for the entire batch
          // to make sure every row is accounted for (mapped to an existing variant or recorded as failed).
          if (batchErr) {
            console.warn(`[ExcelImport] Batch ${batchIndex}/${totalBatches} insert failed, falling back to per-row:`, batchErr);
          }
          for (const item of batchSlice) {
            if (insertedVariantMap.has(item.rowIndex)) continue;
            try {
              const skuId = await resolveVariantId(item.variantData, item.rowIndex);
              if (skuId) {
                insertedVariantMap.set(item.rowIndex, skuId);
                successCount++;
              } else {
                errorCount++;
                failedExcelRows.push(item.rowIndex + 2);
              }
            } catch (rowErr) {
              console.error(`[ExcelImport] Row ${item.rowIndex + 2} resolve failed:`, rowErr);
              errorCount++;
              failedExcelRows.push(item.rowIndex + 2);
            }
          }
        }
      } catch (batchThrown) {
        // Network error / unhandled rejection from the supabase call itself.
        console.error(`[ExcelImport] Batch ${batchIndex}/${totalBatches} threw — attempting per-row recovery:`, batchThrown);
        for (const item of batchSlice) {
          if (insertedVariantMap.has(item.rowIndex)) continue;
          try {
            const skuId = await resolveVariantId(item.variantData, item.rowIndex);
            if (skuId) {
              insertedVariantMap.set(item.rowIndex, skuId);
              successCount++;
            } else {
              errorCount++;
              failedExcelRows.push(item.rowIndex + 2);
            }
          } catch (rowErr) {
            console.error(`[ExcelImport] Row ${item.rowIndex + 2} resolve failed:`, rowErr);
            errorCount++;
            failedExcelRows.push(item.rowIndex + 2);
          }
        }
      }

      console.info(
        `[ExcelImport] Batch ${batchIndex}/${totalBatches} done — inserted ${insertedVariantMap.size}/${variantRowsToInsert.length}, errors ${errorCount}`,
      );

      // Checkpoint draft every batch so tab switch does not lose progress.
      // Wrapped in try/catch — a checkpoint failure (sessionStorage quota, draft upsert error)
      // must never abort the remaining import batches.
      try {
        const checkpointItems = buildLineItemsFromMap();
        skipSnapshotEffectRef.current = true;
        importJustAppliedRef.current = true;
        workRestoredRef.current = true;
        await persistEntrySnapshotNow({ lineItems: [...baseLineItems, ...checkpointItems] });
      } catch (snapshotErr) {
        console.warn(`[ExcelImport] Checkpoint after batch ${batchIndex} failed (continuing import):`, snapshotErr);
      }

      reportImportProgress(
        insertedVariantMap.size,
        validRows.length,
        `Loading items into bill (${insertedVariantMap.size.toLocaleString("en-IN")} / ${validRows.length.toLocaleString("en-IN")})...`,
        { successCount: insertedVariantMap.size, errorCount, skippedCount },
      );
    }

    if (failedExcelRows.length > 0) {
      console.warn(
        `[ExcelImport] ${failedExcelRows.length} rows failed to import. Excel row numbers:`,
        failedExcelRows,
      );
    }

    const newLineItems = buildLineItemsFromMap();
    successCount = insertedVariantMap.size;

    const mergedLineItems = [...baseLineItems, ...newLineItems];
    // Import reached completion — clear the in-flight marker. Partial successes are
    // reported explicitly via the destructive toast below, so the user has been told;
    // the hard save-block is only for imports that never reached this point.
    pendingImportRef.current = null;
    importJustAppliedRef.current = true;
    skipSnapshotEffectRef.current = true;
    workRestoredRef.current = true;
    reportImportProgress(
      validRows.length,
      validRows.length,
      "Finishing import...",
      { successCount, errorCount, skippedCount },
    );
    setVisibleItemCount(Math.min(mergedLineItems.length, 200));
    setLineItems(mergedLineItems);
    await persistEntrySnapshotNow({ lineItems: mergedLineItems });

    const importedLinesTotal = newLineItems.reduce(
      (sum, item) => sum + roundMoney(item.line_total),
      0
    );
    const importPreviewTotals = computePurchaseBillTotals(
      newLineItems,
      discountAmount,
      Math.max(otherCharges, freightChargesFromExcel),
      isDcPurchase,
    );

    let description = `Added ${successCount} items · Lines ₹${importedLinesTotal.toLocaleString("en-IN")}`;
    if (!isDcPurchase && importPreviewTotals.gstAmount > 0) {
      description += ` · GST ₹${importPreviewTotals.gstAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    description += ` · Net ₹${importPreviewTotals.netAmount.toLocaleString("en-IN")}`;
    if (freightChargesFromExcel > 0) {
      description += ` · Charges ₹${freightChargesFromExcel.toLocaleString("en-IN")}`;
    }
    if (skippedCount > 0) description += ` · ${skippedCount} rows skipped`;
    if (errorCount > 0) description += ` · ${errorCount} errors`;

    const isPartial = successCount < validRows.length;
    toast({
      title: isPartial ? "Import Partially Completed" : "Import Completed",
      description: isPartial
        ? `${description} · Imported ${successCount} of ${validRows.length} rows. ${failedExcelRows.length > 0 ? `${failedExcelRows.length} failed rows logged to browser console (Excel row numbers) — re-import those rows.` : 'Check console for details.'}`
        : description,
      variant: isPartial ? "destructive" : undefined,
    });
    } finally {
      setExcelImportLoading(null);
    }
  };

  const isMobile = useIsMobile();

  if (isMobile) {
    const filledItems = lineItems.filter(i => i.product_id);
    const totalQty = filledItems.reduce((s, i) => s + (i.qty || 0), 0);
    return (
      <div className="flex flex-col min-h-screen bg-muted/30">
        {excelImportLoading && <ExcelImportLoadingOverlay progress={excelImportLoading} />}
        <MobilePageHeader
          title={isEditMode ? "Edit Purchase" : "Purchase Entry"}
          subtitle={softwareBillNo || "NEW"}
          backTo="/purchase-bills"
        />

        <div className="flex-1 overflow-y-auto pb-40 space-y-3 px-4 pt-3">
          {/* Supplier section */}
          <div className="bg-background rounded-2xl p-3.5 border border-border/40 shadow-sm space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Supplier & Bill Details</p>
            <Select value={billData.supplier_id} onValueChange={(value) => {
              const s = suppliers.find((s: any) => s.id === value);
              setBillData({ ...billData, supplier_id: value, supplier_name: s?.supplier_name || "" });
            }}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select Supplier" /></SelectTrigger>
              <SelectContent>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.supplier_name}</SelectItem>)}</SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px]">Bill Date</Label>
                <Input type="date" value={format(billDate, "yyyy-MM-dd")} onChange={(e) => setBillDate(new Date(e.target.value))} className="h-9 text-sm rounded-xl" />
              </div>
              <div>
                <Label className="text-[11px]">Supplier Inv. No.</Label>
                <Input data-field="supplier-invoice-no" value={billData.supplier_invoice_no} onChange={(e) => setBillData({ ...billData, supplier_invoice_no: e.target.value })} placeholder="Inv #" className="h-9 text-sm rounded-xl" />
              </div>
            </div>
          </div>

          {/* Product search */}
          <div className="bg-background rounded-2xl p-3.5 border border-border/40 shadow-sm space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Products</p>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Scan barcode or search…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-11 text-base rounded-xl"
                  autoComplete="off"
                  autoCapitalize="off"
                />
              </div>
              <CameraScanButton
                onBarcodeScanned={(barcode) => {
                  setSearchQuery(barcode);
                }}
                className="h-11 w-11 rounded-xl shrink-0"
              />
            </div>
            {/* Mobile Search Results Dropdown */}
            {showSearch && searchResults.length > 0 && (
              <div className="bg-popover border border-border rounded-xl shadow-lg max-h-72 overflow-auto -mx-0.5">
                {searchResults.slice(0, 50).map((result, idx) => (
                  <button
                    key={result.id + idx}
                    type="button"
                    onClick={() => handleProductSelect(result)}
                    className="w-full text-left px-3.5 py-2.5 border-b border-border/30 last:border-0 active:bg-accent/70 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{result.product_name}</p>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          {result.brand && <span className="text-[11px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded">{result.brand}</span>}
                          {result.category && <span className="text-[11px] bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-1.5 py-0.5 rounded">{result.category}</span>}
                          {result.style && <span className="text-[11px] bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded">{result.style}</span>}
                          {result.color && result.color !== '-' && <span className="text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{result.color}</span>}
                          {result.size && <span className="text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono">Size: {result.size}</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          {result.barcode && <span className="text-[11px] text-muted-foreground font-mono">{result.barcode}</span>}
                          {result.size_range && <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{result.size_range}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-primary">Buy: ₹{result.pur_price?.toFixed(2) || '0.00'}</p>
                        <p className="text-[12px] font-bold text-amber-600 dark:text-amber-400">MRP: ₹{result.mrp?.toFixed(2) || '0.00'}</p>
                        <p className="text-[11px] text-muted-foreground">Sale: ₹{result.sale_price?.toFixed(2) || '0.00'}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!showSearch && searchResults.length === 0 && searchQuery.length >= 2 && (
              <p className="text-xs text-muted-foreground text-center py-2">No products found</p>
            )}
          </div>

          {/* Items list */}
          {filledItems.length > 0 && (
            <div className="bg-background rounded-2xl border border-border/40 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/30">
                <p className="text-xs font-semibold text-foreground">Items ({filledItems.length})</p>
                <p className="text-xs text-muted-foreground">{totalQty} pcs</p>
              </div>
              <div className="divide-y divide-border/20">
                {filledItems.map((item) => {
                  const realIdx = lineItems.indexOf(item);
                  return (
                    <div key={item.temp_id} className="flex items-center justify-between px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{item.product_name || item.barcode}</p>
                        <p className="text-[11px] text-muted-foreground">{item.size} {item.color}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <button onClick={() => { const u = [...lineItems]; if (u[realIdx].qty > 1) { u[realIdx] = { ...u[realIdx], qty: u[realIdx].qty - 1 }; setLineItems(u); } }}
                            className="w-8 h-8 bg-muted rounded-lg text-base font-bold flex items-center justify-center active:scale-90 touch-manipulation">−</button>
                          <span className="w-8 text-center text-sm font-semibold tabular-nums">{item.qty}</span>
                          <button onClick={() => { const u = [...lineItems]; u[realIdx] = { ...u[realIdx], qty: u[realIdx].qty + 1 }; setLineItems(u); }}
                            className="w-8 h-8 bg-muted rounded-lg text-base font-bold flex items-center justify-center active:scale-90 touch-manipulation">+</button>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <CalculatorInput
                          value={item.pur_price}
                          onChange={(val) => { const u = [...lineItems]; u[realIdx] = { ...u[realIdx], pur_price: val }; setLineItems(u); }}
                          className="w-20 h-8 text-right text-sm rounded-lg border"
                          placeholder="Price"
                        />
                        <p className="text-xs font-semibold text-foreground mt-1 tabular-nums">= ₹{Math.round((item.pur_price || 0) * getMtrMultiplier(item)).toLocaleString("en-IN")}</p>
                        <button onClick={() => setLineItems(lineItems.filter((_, i) => i !== realIdx))} className="text-[10px] text-destructive font-medium mt-1">Remove</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Totals */}
          {filledItems.length > 0 && (
            <div className="bg-background rounded-2xl p-3.5 border border-border/40 shadow-sm space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Qty</span>
                <span className="font-medium tabular-nums">{totalQty} pcs</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-1 border-t border-border/30">
                <span>Grand Total</span>
                <span className="tabular-nums">₹{Math.round(totals.netAmount || 0).toLocaleString("en-IN")}</span>
              </div>
            </div>
          )}
        </div>

        {/* Fixed save bar — hidden while Edit Product panel is open */}
        {!showEditPanel && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 z-30" style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
          <button
            onClick={handleSave}
            disabled={loading || excelImportLoading !== null || lineItems.length === 0}
            className="w-full bg-primary text-primary-foreground rounded-xl h-12 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 touch-manipulation shadow-sm disabled:opacity-50"
          >
            {excelImportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {excelImportLoading
              ? `Importing ${excelImportLoading.current.toLocaleString("en-IN")} / ${excelImportLoading.total.toLocaleString("en-IN")}...`
              : loading
                ? "Saving…"
                : `Save Bill${filledItems.length > 0 ? ` · ₹${Math.round(totals.netAmount || 0).toLocaleString("en-IN")}` : ""}`}
          </button>
        </div>
        )}

        {/* All existing dialogs */}
        <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Bill Saved</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Button variant="outline" onClick={() => { setShowPrintDialog(false); navigate("/barcode-printing", { state: { purchaseItems: savedPurchaseItems.length > 0 ? savedPurchaseItems : lineItems, billId: savedBillId || editingBillId } }); }} className="w-full gap-2"><Printer className="h-4 w-4" /> Print Barcodes</Button>
              <Button variant="secondary" onClick={() => { setShowPrintDialog(false); if (savedBillId) navigate("/purchase-entry", { state: { editBillId: savedBillId } }); }} className="w-full gap-2"><Plus className="h-4 w-4" /> Continue Adding</Button>
              <Button variant="outline" onClick={() => setShowPrintDialog(false)} className="w-full">Skip</Button>
            </div>
          </DialogContent>
        </Dialog>
        <ExcelImportDialog open={showExcelImport} onClose={() => setShowExcelImport(false)} targetFields={purchaseBillFields} onImport={handleExcelImport} title="Import Purchase Bill" sampleData={purchaseBillSampleData} sampleFileName="Purchase_Bill_Sample.xlsx" />
        <ProductEntryDialogGate open={showProductDialog} onOpenChange={setShowProductDialog} onProductCreated={handleProductCreated} hideOpeningQty isDcPurchase={isDcPurchase} isAutoBarcode={isAutoBarcode} mobileERPMode={mobileERPSettings || undefined} />
        <PriceUpdateConfirmDialog open={showPriceUpdateDialog} onOpenChange={setShowPriceUpdateDialog} priceChanges={detectedPriceChanges} onConfirm={handlePriceUpdateConfirm} onSkip={handlePriceUpdateSkip} />
        <AddSupplierDialog open={showAddSupplierDialog} onClose={() => setShowAddSupplierDialog(false)} onSupplierCreated={(supplier) => { refetchSuppliers(); setBillData((prev) => ({ ...prev, supplier_id: supplier.id, supplier_name: supplier.supplier_name })); setTimeout(() => { const invInput = document.querySelector<HTMLInputElement>('[data-field="supplier-invoice-no"]'); invInput?.focus(); invInput?.select(); }, 200); }} />
        <DuplicatePurchaseBillDialog
          open={!!duplicateWarning}
          existingBill={duplicateWarning?.bill ?? null}
          matchReason={duplicateWarning?.reason ?? ""}
          canOverride={hasSpecialPermission('cancel_invoice')}
          onClose={() => setDuplicateWarning(null)}
          onOpenExisting={(billId) => { setDuplicateWarning(null); navigate("/purchase-entry", { state: { editBillId: billId } }); }}
          onSaveAnyway={async () => {
            overrideDuplicateRef.current = true;
            setDuplicateWarning(null);
            await handleSave();
          }}
        />
        <SizeGridDialog open={showSizeGrid} onClose={() => setShowSizeGrid(false)} product={selectedProduct} variants={sizeGridVariants} onConfirm={handleSizeGridConfirm} reviewMode={sizeGridReviewMode} showPurPrice={sizeGridReviewMode} showSizePrices={sizeGridReviewMode} showMrp={sizeGridReviewMode ? true : showMrp} />
        {isMobileERPMode && (
          <IMEIScanDialog
            open={showIMEIScanDialog}
            onClose={() => { setShowIMEIScanDialog(false); setImeiScanItem(null); }}
            quantity={imeiScanItem?.qty || 2}
            productName={imeiScanItem?.item ? formatProductDescription(imeiScanItem.item) : ''}
            onConfirm={handleIMEIScanConfirm}
            minLength={mobileERPSettings?.imei_min_length}
            maxLength={mobileERPSettings?.imei_max_length}
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn(entryPageShellClass, "bg-slate-50")} data-entry-form>
      {excelImportLoading && <ExcelImportLoadingOverlay progress={excelImportLoading} />}
      {/* Draft loading overlay for large bills */}
      {draftLoading && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-card border rounded-xl shadow-xl p-6 w-80 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div>
                <p className="font-semibold text-sm">Loading Draft Bill...</p>
                <p className="text-xs text-muted-foreground">Large bill with {draftLoadProgress.total} items</p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Loading items</span>
                <span>{draftLoadProgress.loaded} / {draftLoadProgress.total}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${draftLoadProgress.total > 0 ? (draftLoadProgress.loaded / draftLoadProgress.total) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 shrink-0 flex flex-col shadow-[0_2px_12px_rgba(0,0,0,.35)] relative z-50 border-b-2 border-green-500/50">
        <div className={cn("entry-page-header-row h-[52px] flex items-center gap-2", entryPageSectionX)}>
          <div className="entry-page-header-leading flex items-center gap-2 sm:gap-3 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => navigate('/purchase-bills')}
              className="h-8 shrink-0 text-white/70 hover:text-white hover:bg-white/10 border border-white/15 text-xs gap-1.5">
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
            <div className="w-px h-6 bg-white/15 shrink-0" />

            <span className="text-white font-bold text-[15px] whitespace-nowrap hidden md:inline">
              {isEditMode ? 'Edit Purchase Bill' : 'Purchase Entry'}
            </span>

            {(softwareBillNo || !isEditMode) && (
              <span className="bg-green-600 text-white font-mono text-[11px] font-bold px-3 py-1 rounded-md whitespace-nowrap shrink-0">
                {softwareBillNo || 'NEW'}
              </span>
            )}
            {navBillIndex !== null && allBillIds && (
              <span className="text-white/50 text-xs hidden lg:inline shrink-0">
                {navBillIndex + 1} of {allBillIds.length}
              </span>
            )}
            {isLoadingNavBill && <Loader2 className="h-4 w-4 animate-spin text-white/60 shrink-0" />}
          </div>

          <div className="entry-page-header-actions flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
            onClick={requestNewBill}
            className="h-8 text-white hover:text-white hover:bg-white/20 border border-white/30 text-xs gap-1 px-2 sm:px-2.5"
            title="New Bill"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">New</span>
            </Button>
            <div className="w-px h-6 bg-white/15 mx-0.5" />
            <Button variant="ghost" size="sm" onClick={handleLastBill}
              disabled={isLoadingNavBill || !allBillIds?.length}
              className="h-8 text-white hover:text-white hover:bg-white/20 border border-white/30 text-xs gap-1.5 w-8 p-0"
              title="Last Record">
              <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handlePreviousBill}
              disabled={isLoadingNavBill || navBillIndex === null || navBillIndex >= (allBillIds?.length || 0) - 1}
              className="h-8 text-white hover:text-white hover:bg-white/20 border border-white/30 text-xs gap-1.5 w-8 p-0"
              title="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleNextBill}
              disabled={isLoadingNavBill || navBillIndex === null || navBillIndex <= 0}
              className="h-8 text-white hover:text-white hover:bg-white/20 border border-white/30 text-xs gap-1.5 w-8 p-0"
              title="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {!isEditMode && lastPurchaseBill && (
          <div className={cn("h-[34px] bg-slate-800/80 border-t border-white/10 flex items-center gap-2 text-[12px] overflow-x-auto", entryPageSectionX)}>
            <span className="text-white/50 shrink-0">Last:</span>
            <span className="text-green-300 font-mono font-bold text-[11px] shrink-0">{lastPurchaseBill.software_bill_no}</span>
            {lastPurchaseBill.supplier_invoice_no && (
              <>
                <span className="text-white/25">|</span>
                <span className="text-white/50 shrink-0">Sup Inv:</span>
                <span className="text-green-300 font-mono font-bold text-[11px] shrink-0">{lastPurchaseBill.supplier_invoice_no}</span>
              </>
            )}
          </div>
        )}
        {isRestoringDraft && lineItems.length === 0 && (
          <div className={cn("h-[34px] bg-amber-500/20 border-t border-amber-400/40 flex items-center gap-2 text-[12px]", entryPageSectionX)}>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-200 shrink-0" />
            <span className="text-amber-100 font-medium">Restoring your bill…</span>
          </div>
        )}
      </header>

      <main className={entryPageMainClass}>

        <section className={cn("bg-white border-b border-slate-100 py-2 shrink-0 shadow-sm", entryPageSectionX)}>
            <div className="flex flex-wrap lg:flex-nowrap items-end gap-3">
              <div className="space-y-2 flex-1 min-w-[140px]">
                <Label htmlFor="software_bill_no">Software Bill No</Label>
                <Input
                  id="software_bill_no"
                  value={isEditMode ? softwareBillNo : (() => {
                    if (lastPurchaseBill?.software_bill_no) {
                      const match = lastPurchaseBill.software_bill_no.match(/^(PUR\/\d{2}-\d{2}\/)(\d+)$/);
                      if (match) return `${match[1]}${Number(match[2]) + 1}`;
                    }
                    const now = billDate || new Date();
                    const m = now.getMonth() + 1;
                    const y = now.getFullYear() % 100;
                    const fy = m >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
                    return `PUR/${fy}/1`;
                  })()}
                  readOnly
                  className="bg-muted"
                  placeholder="Auto-generated"
                />
              </div>

              <div className="space-y-2 flex-[1.5] min-w-[160px]">
                <Label htmlFor="supplier_name">Supplier *</Label>
                <div className="flex gap-1 min-w-0">
                  <Select
                    value={billData.supplier_id}
                    onValueChange={(value) => {
                      const supplier = suppliers.find(s => s.id === value);
                      setBillData({ 
                        ...billData, 
                        supplier_id: value,
                        supplier_name: supplier?.supplier_name || ""
                      });
                    }}
                  >
                    <SelectTrigger className="flex-1 min-w-0">
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.supplier_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowAddSupplierDialog(true)}
                    title="Add New Supplier"
                    className="flex-shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2 flex-1 min-w-[140px]">
                <Label htmlFor="supplier_invoice_no">Supplier Invoice No *</Label>
                <Input
                  id="supplier_invoice_no"
                  value={billData.supplier_invoice_no}
                  onChange={(e) =>
                    setBillData({ ...billData, supplier_invoice_no: e.target.value })
                  }
                  placeholder="Invoice number"
                />
              </div>

              <div className="space-y-2 flex-1 min-w-[160px]">
                <Label htmlFor="bill_date">Supplier bill date</Label>
                <Popover open={billDateOpen} onOpenChange={setBillDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !billDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {billDate ? format(billDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={billDate}
                      onSelect={(date) => { if (date) { setBillDate(date); setBillDateOpen(false); } }}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2 flex-1 min-w-[200px]">
                <Label>Bill entry date &amp; time</Label>
                <div
                  className="h-10 px-3 flex items-center rounded-md border border-input bg-muted/40 text-sm tabular-nums"
                  title="When this purchase bill was saved in EzzyERP"
                >
                  {billEntryAt ? (
                    <span className="text-foreground font-medium">
                      {formatPurchaseBillEntryAt({ bill_entry_at: billEntryAt })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">Recorded automatically when you save</span>
                  )}
                </div>
              </div>

              {/* DC Purchase Checkbox */}
              <div className="flex items-end flex-shrink-0">
                <label className="flex items-center gap-2 cursor-pointer h-10 px-3 border border-orange-300 bg-orange-50 dark:bg-orange-950/20 rounded-md">
                  <Checkbox
                    checked={isDcPurchase}
                    onCheckedChange={(checked) => setIsDcPurchase(checked === true)}
                  />
                  <span className="text-xs font-medium text-orange-700 dark:text-orange-400 whitespace-nowrap">
                    DC Purchase (No GST)
                  </span>
                </label>
              </div>

            </div>

            {/* DC Warning */}
            {isDcPurchase && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  DC Purchase — GST set to 0% for all items. This bill will NOT appear in GST Purchase Register.
                </span>
              </div>
            )}
          </section>

        {/* Locked Banner */}
        {isBillLocked && (
          <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg mx-4 mt-2">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Bill is Locked</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">This purchase bill is locked. Unlock to make changes.</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-amber-400 text-amber-700 hover:bg-amber-100"
              onClick={() => setShowUnlockConfirm(true)}
            >
              <LockOpen className="h-3.5 w-3.5 mr-1.5" />
              Unlock Bill
            </Button>
          </div>
        )}

        <section className={cn("bg-slate-50 border-b border-slate-200 py-3 shrink-0", entryPageSectionX)}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn("text-sm", entryMode === "grid" ? "font-semibold text-foreground" : "text-muted-foreground")}>
                Size Grid
              </span>
              <Switch
                id="entry-mode"
                checked={entryMode === "inline"}
                onCheckedChange={(checked) => setEntryMode(checked ? "inline" : "grid")}
              />
              <span className={cn("text-sm", entryMode === "inline" ? "font-semibold text-foreground" : "text-muted-foreground")}>
                Inline Rows
              </span>
            </div>

              <div className="relative flex-1 min-w-[280px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    disabled={isBillLocked}
                    className="pl-10 h-10 text-sm bg-card border-border uppercase"
                    onKeyDown={(e) => {
                      if (searchResults.length === 0) return;
                      
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSelectedSearchIndex(prev => 
                          prev < searchResults.length - 1 ? prev + 1 : 0
                        );
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSelectedSearchIndex(prev => 
                          prev > 0 ? prev - 1 : searchResults.length - 1
                        );
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        handleProductSelect(searchResults[selectedSearchIndex]);
                      }
                    }}
                    placeholder="SEARCH BY NAME, BRAND, CATEGORY, STYLE OR BARCODE..."
                  />
                  {showSearch && searchResults.length > 0 && (
                    <div className="absolute top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg z-[100] max-h-80 overflow-auto">
                      {searchResults.map((result, idx) => (
                        <div
                          key={result.product_id + idx}
                          onMouseEnter={() => setSelectedSearchIndex(idx)}
                          className={cn(
                            "w-full text-left px-4 py-3 text-popover-foreground border-b border-border last:border-0 transition-colors flex items-start gap-2",
                            idx === selectedSearchIndex ? "bg-accent" : "hover:bg-accent/50"
                          )}
                        >
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleProductSelect(result)}
                            className="flex-1 text-left"
                          >
                            <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm flex items-center gap-2">
                                <span>{result.product_name}</span>
                                {result.size_range && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                                    {result.size_range}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {result.brand && <span className="text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-1 py-0.5 rounded">{result.brand}</span>}
                                {result.category && <span className="text-[10px] bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-1 py-0.5 rounded">{result.category}</span>}
                                {result.style && <span className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1 py-0.5 rounded">{result.style}</span>}
                                {result.color && result.color !== '-' && <span className="text-[10px] bg-muted text-muted-foreground px-1 py-0.5 rounded">{result.color}</span>}
                                {result.size && <span className="text-[10px] bg-muted text-muted-foreground px-1 py-0.5 rounded font-mono">Size: {result.size}</span>}
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                                {result.barcode && <span className="font-mono">{result.barcode}</span>}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-primary font-bold text-sm">Buy: ₹{result.pur_price?.toFixed(2) || '0.00'}</span>
                              <div className="text-[11px] text-amber-600 dark:text-amber-400 font-bold">MRP: ₹{result.mrp?.toFixed(2) || '0.00'}</div>
                              <div className="text-[11px] text-muted-foreground">Sale: ₹{result.sale_price?.toFixed(2) || '0.00'}</div>
                            </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            title="Add all variants of this product (each qty 1)"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (result.product_id) addAllVariantsRows(result.product_id);
                            }}
                            className="shrink-0 self-center text-[11px] font-semibold px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30"
                          >
                            + All variants
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <Button
                  onClick={() => setShowExcelImport(true)}
                  variant="outline"
                  size="sm"
                  className="h-10 gap-2 border-slate-300"
                  disabled={excelImportLoading !== null}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Import Excel
                </Button>
                <Button
                  onClick={() => setShowProductDialog(true)}
                  onMouseEnter={prefetchProductEntryDialog}
                  onFocus={prefetchProductEntryDialog}
                  variant="outline"
                  size="sm"
                  className="h-10 gap-2 border-slate-300"
                  disabled={isBillLocked}
                >
                  <Plus className="h-4 w-4" />
                  Add New Product
                </Button>
              </div>

            <div className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg ml-auto shrink-0">
              <span className="text-[12px] font-semibold text-white/80">Total Qty</span>
              <span className="text-[18px] font-black text-white tabular-nums font-mono leading-none">
                {lineItems.reduce((sum, item) => sum + item.qty, 0)}
              </span>
            </div>
          </div>
        </section>

        <section className={cn("flex-1 min-h-0 pb-2 overflow-hidden bg-slate-100 relative", entryPageSectionX)}>
          <div className="h-full flex flex-col overflow-hidden rounded-lg border border-slate-200 shadow-sm bg-white">
            {lineItems.length > 100 && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b text-xs text-muted-foreground shrink-0">
                <span className="font-medium">📦 Large bill: {lineItems.length} items</span>
                <span>Showing {Math.min(visibleItemCount, lineItems.length)} rows — scroll to load more</span>
              </div>
            )}
            <div
              className={`relative flex-1 min-h-0 overflow-x-auto overflow-y-auto isolate ${isBillLocked ? "pointer-events-none" : ""}`}
              onScroll={(e) => {
                const el = e.currentTarget;
                const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 300;
                if (nearBottom && visibleItemCount < lineItems.length) {
                  setVisibleItemCount((prev) => Math.min(prev + ITEMS_PER_PAGE, lineItems.length));
                }
              }}
            >
              {isBillLocked && (
                <div className="absolute inset-0 bg-background/60 z-10 flex items-center justify-center rounded-lg backdrop-blur-[1px]">
                  <div className="flex items-center gap-2 bg-amber-100 dark:bg-amber-900 border border-amber-300 rounded-lg px-4 py-2">
                    <Lock className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Locked — click Unlock to edit</span>
                  </div>
                </div>
              )}
              <Table className="table-fixed w-full min-w-0 border-separate border-spacing-0 erp-desktop-table erp-entry-lines-table">
                <TableHeader className="sticky top-0 z-10 erp-invoice-table-header">
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <input
                        type="checkbox"
                        checked={lineItems.length > 0 && lineItems.every((_, i) => document.getElementById(`check-${i}`)?.getAttribute('data-state') === 'checked')}
                        className="rounded"
                        readOnly
                      />
                    </TableHead>
                    <TableHead className="w-[60px]">SR.NO</TableHead>
                    <TableHead className="col-product min-w-[200px]">ITEM NAME</TableHead>
                    {showPurCol.size && <TableHead className="w-[50px]">SIZE</TableHead>}
                    <TableHead className="w-[120px]">{isMobileERPMode ? "IMEI NUMBER" : "BARCODE"}</TableHead>
                    <TableHead className="w-[110px] text-right">QTY</TableHead>
                    <TableHead className="w-[140px] text-right pur-rate-col">PUR.RATE</TableHead>
                    <TableHead className="w-[140px] text-right sale-rate-col">SALE.RATE</TableHead>
                    {showMrp && <TableHead className="w-[140px] text-right">MRP</TableHead>}
                    {showPurCol.gst && <TableHead className="w-[110px] text-right">GST %</TableHead>}
                    <TableHead className="w-[120px] text-right">SUB TOTAL</TableHead>
                    {showPurCol.disc_percent && <TableHead className="w-[110px] text-right">DISC %</TableHead>}
                    <TableHead className="w-[120px] text-right total-col">TOTAL</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead className="w-[40px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.slice(0, visibleItemCount).map((item, index) => {
                    const subTotal = computePurchaseLineSubTotal(item);
                    const total = item.line_total;
                    const gstAmount = (total * item.gst_per) / 100;
                    
                    return (
                      <TableRow key={item.temp_id} className={`hover:bg-green-50/40 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                        <TableCell className="w-[40px]">
                          <Checkbox
                            checked={!!selectedForPrintObj[item.temp_id]}
                            onCheckedChange={() => toggleItemSelection(item.temp_id)}
                            aria-label={`Select ${item.product_name} for printing`}
                          />
                        </TableCell>
                        <TableCell className="w-[60px] text-center font-medium">{index + 1}</TableCell>
                        <TableCell className="col-product font-medium cursor-pointer" title={formatProductDescription(item)}
                          onDoubleClick={() => openEditPanel(index, "product_name")}>
                          <div className="text-sm leading-snug break-words">{formatProductDescription(item)}</div>
                        </TableCell>
                        {showPurCol.size && <TableCell className="w-[50px] text-sm">{item.size || "—"}</TableCell>}
                        <TableCell className="w-[120px]">
                          <Badge variant="outline" className={cn("text-xs", isMobileERPMode ? "font-mono tracking-wider" : "font-mono")}>
                            {item.barcode || "—"}
                          </Badge>
                          {barcodeWarnings.has(item.temp_id) && (() => {
                            const msg = barcodeWarnings.get(item.temp_id) || '';
                            const isInBill = msg.includes('Duplicate barcode in this bill');
                            return (
                              <div className={cn(
                                "flex items-start gap-1.5 mt-1 text-xs rounded px-2 py-1.5",
                                isInBill
                                  ? "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
                                  : "text-destructive bg-destructive/10 border border-destructive/30"
                              )}>
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span>{msg}</span>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="w-[110px]">
                          <div className="flex items-center gap-0.5">
                            <Input
                              ref={index === lineItems.length - 1 ? lastQtyInputRef : undefined}
                              type="number"
                              min={isDecimalUOM(item.uom) ? "0.001" : "1"}
                              step={isDecimalUOM(item.uom) ? "0.001" : "1"}
                              value={item.qty || ""}
                              onFocus={(e) => { if (sameBarcodeSeriesEnabled) e.target.select(); }}
                              onChange={(e) =>
                                updateLineItem(
                                  item.temp_id,
                                  "qty",
                                  isDecimalUOM(item.uom) ? (parseFloat(e.target.value) || 0) : (parseInt(e.target.value) || 0)
                                )
                              }
                              onWheel={(e) => (e.target as HTMLInputElement).blur()}
                              className="w-full text-right px-2 bg-amber-50 border-amber-200 text-center font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            {item.uom && item.uom !== 'NOS' && item.uom !== 'PCS' && (
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">{item.uom}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="w-[140px]">
                          <CalculatorInput
                            value={item.pur_price}
                            onChange={(val) =>
                              updateLineItem(item.temp_id, "pur_price", val)
                            }
                            className="w-full text-right bg-green-50 border-green-200 text-green-800 font-bold"
                          />
                        </TableCell>
                        <TableCell className="w-[140px]">
                          <CalculatorInput
                            value={item.sale_price}
                            onChange={(val) =>
                              updateLineItem(item.temp_id, "sale_price", val)
                            }
                            className="w-full text-right bg-blue-50 border-blue-200 text-blue-800 font-bold"
                          />
                        </TableCell>
                        {showMrp && (
                          <TableCell className="w-[140px]">
                            <CalculatorInput
                              value={item.mrp || 0}
                              onChange={(val) =>
                                updateLineItem(item.temp_id, "mrp", val)
                              }
                              className="w-full text-right"
                            />
                          </TableCell>
                        )}
                        {showPurCol.gst && <TableCell className="w-[110px]">
                          <Select
                            value={String(item.gst_per)}
                            onValueChange={(value) =>
                              updateLineItem(item.temp_id, "gst_per", Number(value))
                            }
                          >
                            <SelectTrigger className="w-full h-9">
                              <SelectValue placeholder="GST" />
                            </SelectTrigger>
                            <SelectContent className="bg-background z-50">
                              <SelectItem value="0">0%</SelectItem>
                              <SelectItem value="5">5%</SelectItem>
                              <SelectItem value="12">12%</SelectItem>
                              <SelectItem value="18">18%</SelectItem>
                              <SelectItem value="28">28%</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>}
                        <TableCell className="w-[120px] text-right font-semibold tabular-nums">
                          ₹{subTotal.toFixed(2)}
                        </TableCell>
                        {showPurCol.disc_percent && <TableCell className="w-[110px]">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={item.discount_percent}
                            onChange={(e) =>
                              updateLineItem(
                                item.temp_id,
                                "discount_percent",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-full text-right"
                          />
                        </TableCell>}
                        <TableCell className="w-[120px] text-right font-bold tabular-nums text-green-700 bg-green-50/40 font-mono">
                          ₹{total.toFixed(2)}
                        </TableCell>
                        <TableCell className="w-[40px]">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeLineItem(item.temp_id)}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                        <TableCell className="w-[40px]">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:bg-primary/10 group"
                              onClick={() => openEditPanel(index)}
                              title="Edit Product Details"
                            >
                              <Pencil className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            </Button>
                            {updatedRows.has(item.temp_id) && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-600 border-green-300 bg-green-50 animate-in fade-in">
                                ✓
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  
                  {/* Inline Search Row - Always visible at bottom */}
                  <TableRow className="bg-accent/30 relative" style={{ zIndex: 50 }}>
                    <TableCell className="w-[40px]"></TableCell>
                    <TableCell className="w-[60px] text-center font-medium text-muted-foreground">
                      {lineItems.length + 1}
                    </TableCell>
                    <TableCell colSpan={3} className="relative overflow-visible" style={{ overflow: 'visible' }}>
                      <div className="relative" style={{ overflow: 'visible' }}>
                        <Input
                          ref={inlineSearchInputRef}
                          value={inlineSearchQuery}
                          onChange={(e) => setInlineSearchQuery(e.target.value)}
                          onFocus={() => {
                            if (inlineSearchQuery.length >= 1) {
                              setShowInlineSearch(true);
                            }
                          }}
                          onBlur={() => {
                            // Delay hiding to allow click/touch on dropdown items (longer for mobile)
                            setTimeout(() => setShowInlineSearch(false), 400);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              if (inlineSearchResults.length > 0) {
                                setSelectedInlineIndex(prev => 
                                  prev < inlineSearchResults.length - 1 ? prev + 1 : 0
                                );
                              }
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              if (inlineSearchResults.length > 0) {
                                setSelectedInlineIndex(prev => 
                                  prev > 0 ? prev - 1 : inlineSearchResults.length - 1
                                );
                              }
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              if (inlineSearchResults.length > 0) {
                                handleInlineProductSelect(inlineSearchResults[selectedInlineIndex]);
                              }
                            }
                          }}
                          placeholder="Search product name, brand, barcode..."
                          className="w-full pr-8"
                        />
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        
                        {/* Inline Search Dropdown - Using Portal to escape table overflow */}
                        {showInlineSearch && inlineSearchInputRef.current && createPortal(
                          <div 
                            className="bg-popover border border-border rounded-md shadow-xl max-h-80 overflow-auto"
                            style={{ 
                              position: 'fixed',
                              top: inlineSearchInputRef.current.getBoundingClientRect().bottom + 4,
                              left: inlineSearchInputRef.current.getBoundingClientRect().left,
                              width: Math.min(800, window.innerWidth - inlineSearchInputRef.current.getBoundingClientRect().left - 16),
                              zIndex: 9999,
                            }}
                          >
                            {inlineSearchResults.length > 0 ? (
                              <>
                                {inlineSearchResults.length > inlineDisplayLimit && (
                                  <div className="px-3 py-2 text-sm text-muted-foreground bg-muted/50 border-b flex items-center justify-between">
                                    <span>Showing {inlineDisplayLimit} of {inlineSearchResults.length} results</span>
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="h-auto p-0 text-primary"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setInlineDisplayLimit(prev => prev + 100);
                                      }}
                                    >
                                      Load More
                                    </Button>
                                  </div>
                                )}
                                {inlineSearchResults.slice(0, inlineDisplayLimit).map((result, idx) => (
                                  <button
                                    key={result.id + idx}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => handleInlineProductSelect(result)}
                                    onMouseEnter={() => setSelectedInlineIndex(idx)}
                                    className={cn(
                                      "w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors",
                                      idx === selectedInlineIndex ? "bg-primary text-primary-foreground [&_*]:text-primary-foreground" : "text-popover-foreground hover:bg-accent/50"
                                    )}
                                  >
                                    <div className="font-medium flex items-center gap-2">
                                      <span>
                                        {formatProductDescription({
                                          product_name: result.product_name,
                                          category: result.category,
                                          brand: result.brand,
                                          style: result.style,
                                          color: result.color,
                                          size: result.size
                                        })}
                                      </span>
                                      {result.size_range && (
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                                          {result.size_range}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                      {result.barcode && (
                                        <span>Barcode: {result.barcode}</span>
                                      )}
                                      <span className="text-primary font-medium">
                                        Pur: ₹{result.pur_price?.toFixed(2) || '0.00'}
                                      </span>
                                      <span className="text-amber-600 dark:text-amber-400 font-bold">
                                        MRP: ₹{result.mrp?.toFixed(2) || '0.00'}
                                      </span>
                                      <span className="text-green-600 dark:text-green-400 font-medium">
                                        Sale: ₹{result.sale_price?.toFixed(2) || '0.00'}
                                      </span>
                                    </div>
                                  </button>
                                ))}
                                {/* Add New Product button at bottom of results */}
                                <button
                                  onClick={handleAddNewProductFromInline}
                                  className="w-full text-left px-4 py-3 text-primary font-medium border-t border-border hover:bg-accent/50 transition-colors flex items-center gap-2"
                                >
                                  <Plus className="h-4 w-4" />
                                  Add New Product
                                </button>
                              </>
                            ) : inlineSearchQuery.length >= 1 ? (
                              <>
                                <div className="px-4 py-3 text-sm text-muted-foreground">
                                  No products found for "{inlineSearchQuery}"
                                </div>
                                {/* Add New Product button when no results */}
                                <button
                                  onClick={handleAddNewProductFromInline}
                                  className="w-full text-left px-4 py-3 text-primary font-medium border-t border-border hover:bg-accent/50 transition-colors flex items-center gap-2"
                                >
                                  <Plus className="h-4 w-4" />
                                  Add New Product
                                </button>
                              </>
                            ) : null}
                          </div>,
                          document.body
                        )}
                      </div>
                    </TableCell>
                    <TableCell colSpan={(showMrp ? 1 : 0) + (showPurCol.gst ? 1 : 0) + (showPurCol.disc_percent ? 1 : 0) + 6} className="text-muted-foreground text-sm">
                      <span className="hidden md:inline">Type to search or </span>
                      <button 
                        onClick={handleAddNewProductFromInline}
                        className="text-primary hover:underline font-medium"
                      >
                        + Add New Product
                      </button>
                    </TableCell>
                  </TableRow>
                  
                  {/* Footer row with QTY total */}
                  {lineItems.length > 0 && (
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={4} className="text-right font-semibold">Total:</TableCell>
                      <TableCell className="w-[130px]"></TableCell>
                      <TableCell className="w-[110px] text-right font-semibold tabular-nums">{totals.totalQty}</TableCell>
                      <TableCell colSpan={(showMrp ? 1 : 0) + (showPurCol.gst ? 1 : 0) + (showPurCol.disc_percent ? 1 : 0) + 5}></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {lineItems.length === 0 && (
              <p className="text-xs text-center py-2 text-muted-foreground shrink-0">Tip: Press Alt+↓ to copy the last row</p>
            )}
          </div>
        </section>

      </main>

      <footer className={cn(
        "entry-page-footer shrink-0 relative z-40 shadow-[0_-10px_30px_rgba(0,0,0,0.4)]",
        showEditPanel && "hidden",
      )}>
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white overflow-x-auto border-t-2 border-green-600">
          <div className="flex items-center px-4 py-3 gap-0 min-w-max">
            <span className="text-[15px] font-extrabold uppercase tracking-wider text-slate-200 mr-2 whitespace-nowrap">Gross Amt</span>
            <span className="bg-white/10 rounded-sm px-3 h-9 flex items-center text-[15px] font-bold font-mono tabular-nums min-w-[80px] justify-end">
              {Math.round(totals.grossAmount).toLocaleString("en-IN")}
            </span>

            <div className="w-px h-8 bg-slate-600 mx-3 shrink-0" />

            <span className="text-[15px] font-extrabold uppercase tracking-wider text-slate-200 mr-2 whitespace-nowrap">Bill Disc %</span>
            <Input type="number" step="0.01"
              value={totals.grossAmount > 0 ? Number((discountAmount / totals.grossAmount * 100).toFixed(2)) || "" : ""}
              onChange={(e) => {
                const pct = parseFloat(e.target.value) || 0;
                setDiscountAmount(Math.round(totals.grossAmount * pct / 100 * 100) / 100);
              }}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              placeholder="0"
              className="w-[72px] h-9 text-[15px] text-right bg-white text-slate-800 font-bold font-mono border-0 rounded-sm"
            />

            <div className="w-px h-8 bg-slate-600 mx-3 shrink-0" />

            <span className="text-[15px] font-extrabold uppercase tracking-wider text-slate-200 mr-2 whitespace-nowrap">Bill Disc ₹</span>
            <Input type="number" step="0.01" value={discountAmount || ""}
              onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              placeholder="0"
              className="w-[80px] h-9 text-[15px] text-right bg-white text-slate-800 font-bold font-mono border-0 rounded-sm"
            />

            <div className="w-px h-8 bg-slate-600 mx-3 shrink-0" />

            <span className="text-[15px] font-extrabold uppercase tracking-wider text-slate-200 mr-2 whitespace-nowrap">Charges</span>
            <Input type="number" step="0.01" value={otherCharges || ""}
              onChange={(e) => setOtherCharges(parseFloat(e.target.value) || 0)}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              placeholder="0"
              className="w-[80px] h-9 text-[15px] text-right bg-white text-slate-800 font-bold font-mono border-0 rounded-sm"
            />

            <div className="ml-auto pl-4 border-l-2 border-green-600/60 flex flex-col items-end shrink-0">
              <span className="text-[13px] font-extrabold uppercase tracking-wider text-yellow-400">Net Payable</span>
              <span className="text-[36px] font-black font-mono tabular-nums leading-none text-green-400">₹{totals.netAmount.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-950 flex flex-wrap items-center px-4 py-2 gap-3">
          <div className="flex items-center gap-2 text-[15px] text-slate-300 font-mono flex-1 min-w-0 overflow-x-auto whitespace-nowrap">
            <span>Gross <span className="text-white font-bold">₹{Math.round(totals.grossAmount).toLocaleString("en-IN")}</span></span>
            <span className="text-slate-600">—</span>
            <span>Disc <span className="text-red-300 font-extrabold">₹{(totals.itemDiscount + discountAmount).toFixed(0)}</span></span>
            <span className="text-slate-600">=</span>
            <span>Taxable <span className="text-white font-bold">₹{totals.taxableAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
            <span className="text-slate-600">+</span>
            <span>GST <span className="text-white font-extrabold">₹{totals.gstAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
            {otherCharges !== 0 && (
              <>
                <span className="text-slate-600">{otherCharges > 0 ? "+" : "−"}</span>
                <span>Charges <span className="text-white font-extrabold">₹{Math.abs(otherCharges).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
              </>
            )}
            <span className="text-slate-600">=</span>
            <span>Net <span className="text-emerald-300 font-black">₹{totals.netAmount.toLocaleString("en-IN")}</span></span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(savedBillId || isEditMode) && (
              <Button onClick={handlePrintBarcodes}
                disabled={lineItems.length === 0}
                size="sm"
                className="h-9 px-4 text-[13px] bg-purple-600 hover:bg-purple-500 text-white font-bold gap-1.5 border border-purple-400 shadow-sm">
                <Printer className="h-3.5 w-3.5" />
                Print Barcodes
                {selectedForPrint.size > 0 && ` (${selectedForPrint.size})`}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-3 text-[13px] font-bold text-red-300 hover:bg-red-900/50 hover:text-red-200 gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={loading || excelImportLoading !== null || lineItems.length === 0 || isBillLocked}
              className="h-9 px-5 text-[14px] bg-green-600 text-white hover:bg-green-500 font-extrabold gap-1.5 shadow-[0_0_15px_rgba(34,197,94,0.4)]"
            >
              {excelImportLoading ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Importing {excelImportLoading.current.toLocaleString("en-IN")}/{excelImportLoading.total.toLocaleString("en-IN")}...</>
              ) : loading ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Saving...</>
              ) : (
                <><Check className="h-3 w-3" /> <span className="kbd-hint">✓ Save Bill <kbd>Ctrl+S</kbd></span></>
              )}
            </Button>
          </div>
        </div>
      </footer>

        {/* Size Grid Dialog with Color Selection */}
        <SizeGridDialog
          open={showSizeGrid}
          onClose={() => setShowSizeGrid(false)}
          product={selectedProduct}
          variants={sizeGridVariants}
          onConfirm={handleSizeGridConfirm}
          showStock={false}
          validateStock={false}
          title="Enter Size-wise Qty"
          allowCustomSizes={true}
          allowAddColor={isColorFieldEnabled}
          allowMultiColor={true}
          defaultPurPrice={selectedProduct?.default_pur_price}
          defaultSalePrice={selectedProduct?.default_sale_price}
          defaultMrp={sizeGridVariants[0]?.mrp || selectedProduct?.default_sale_price}
          showMrp={sizeGridReviewMode ? true : showMrp}
          showSizePrices={sizeGridReviewMode ? true : false}
          reviewMode={sizeGridReviewMode}
          showPurPrice={sizeGridReviewMode}
        />

        {/* Roll Entry Dialog for MTR products */}
        <RollEntryDialog
          open={showRollEntryDialog}
          onClose={() => { setShowRollEntryDialog(false); setRollEntryProduct(null); }}
          productName={rollEntryProduct?.product_name || ''}
          colors={rollEntryColors}
          rate={rollEntryRate}
          onConfirm={handleRollEntryConfirm}
        />

        {/* Print Barcode Dialog with Smart Selection */}
        <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Bill Saved Successfully
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Your purchase bill has been saved. Would you like to print barcodes?
              </p>
              
              {/* Show item counts */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Total Items:</span>
                  <span className="font-semibold">{savedPurchaseItems.reduce((sum, i) => sum + i.qty, 0)} labels</span>
                </div>
                {newlyAddedItems.length > 0 && (
                  <div className="flex justify-between text-primary">
                    <span>Newly Added:</span>
                    <span className="font-semibold">{newlyAddedItems.reduce((sum, i) => sum + i.qty, 0)} labels</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {/* Print All Labels Button */}
                <Button
                  onClick={async () => {
                    try {
                      // Fetch supplier code from suppliers table
                      let supplierCode = "";
                      const suppId = savedSupplierId || billData.supplier_id;
                      if (suppId) {
                        const { data: supplierData } = await supabase
                          .from("suppliers")
                          .select("supplier_code")
                          .eq("id", suppId)
                          .single();
                        supplierCode = supplierData?.supplier_code || "";
                      }

                      const barcodeItems = savedPurchaseItems.map(item => ({
                        sku_id: item.sku_id,
                        product_name: item.product_name || "",
                        brand: item.brand || "",
                        category: item.category || "",
                        color: item.color || "",
                        style: item.style || "",
                        size: item.size,
                        sale_price: item.sale_price,
                        mrp: item.mrp,
                        pur_price: item.pur_price,
                        barcode: item.barcode,
                        qty: item.qty,
                        bill_number: softwareBillNo || "",
                        bill_date: format(billDate, "yyyy-MM-dd"),
                        supplier_code: supplierCode,
                      }));

                      // Mark all items as printed
                      if (savedBillId) {
                        await supabase
                          .from("purchase_items")
                          .update({ barcode_printed: true })
                          .eq("bill_id", savedBillId);
                      }

                      setShowPrintDialog(false);
                      navigate("/barcode-printing", { 
                        state: { purchaseItems: barcodeItems, billId: savedBillId || editingBillId } 
                      });
                    } catch (error) {
                      console.error("Error preparing barcode data:", error);
                      toast({
                        title: "Error",
                        description: "Failed to prepare barcode data",
                        variant: "destructive",
                      });
                    }
                  }}
                  className="w-full gap-2"
                >
                  <Printer className="h-4 w-4" />
                  Print All Labels ({savedPurchaseItems.reduce((sum, i) => sum + i.qty, 0)})
                </Button>

                {/* Print New Labels Only Button - only show if there are newly added items */}
                {newlyAddedItems.length > 0 && (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      try {
                        // Fetch supplier code from suppliers table
                        let supplierCode = "";
                        const suppId = savedSupplierId || billData.supplier_id;
                        if (suppId) {
                          const { data: supplierData } = await supabase
                            .from("suppliers")
                            .select("supplier_code")
                            .eq("id", suppId)
                            .single();
                          supplierCode = supplierData?.supplier_code || "";
                        }

                        const barcodeItems = newlyAddedItems.map(item => ({
                          sku_id: item.sku_id,
                          product_name: item.product_name || "",
                          brand: item.brand || "",
                          category: item.category || "",
                          color: item.color || "",
                          style: item.style || "",
                          size: item.size,
                          sale_price: item.sale_price,
                          mrp: item.mrp,
                          pur_price: item.pur_price,
                          barcode: item.barcode,
                          qty: item.qty,
                          bill_number: softwareBillNo || "",
                          bill_date: format(billDate, "yyyy-MM-dd"),
                          supplier_code: supplierCode,
                        }));

                        // Mark only new items as printed
                        if (savedBillId && newlyAddedItems.length > 0) {
                          const newSkuIds = newlyAddedItems.map(i => i.sku_id).filter(Boolean);
                          if (newSkuIds.length > 0) {
                            await supabase
                              .from("purchase_items")
                              .update({ barcode_printed: true })
                              .eq("bill_id", savedBillId)
                              .in("sku_id", newSkuIds);
                          }
                        }

                        setShowPrintDialog(false);
                        navigate("/barcode-printing", { 
                          state: { purchaseItems: barcodeItems, billId: savedBillId || editingBillId } 
                        });
                      } catch (error) {
                        console.error("Error preparing barcode data:", error);
                        toast({
                          title: "Error",
                          description: "Failed to prepare barcode data",
                          variant: "destructive",
                        });
                      }
                    }}
                    className="w-full gap-2"
                  >
                    <Printer className="h-4 w-4" />
                    Print New Only ({newlyAddedItems.reduce((sum, i) => sum + i.qty, 0)})
                  </Button>
                )}

                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowPrintDialog(false);
                    if (savedBillId) {
                      // Re-open the same bill in edit mode to add more products
                      navigate("/purchase-entry", { state: { editBillId: savedBillId } });
                    }
                  }}
                  className="w-full gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Continue Adding Products
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setShowPrintDialog(false)}
                  className="w-full"
                >
                  Skip
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Excel Import Dialog */}
        <ExcelImportDialog
          open={showExcelImport}
          onClose={() => setShowExcelImport(false)}
          targetFields={purchaseBillFields}
          onImport={handleExcelImport}
          title="Import Purchase Bill from Excel"
          sampleData={purchaseBillSampleData}
          sampleFileName="Purchase_Bill_Sample.xlsx"
        />


        {/* Product Entry Dialog */}
        <ProductEntryDialogGate
          open={showProductDialog}
          onOpenChange={setShowProductDialog}
          onProductCreated={handleProductCreated}
          hideOpeningQty
          isDcPurchase={isDcPurchase}
          isAutoBarcode={isAutoBarcode}
          mobileERPMode={mobileERPSettings || undefined}
        />

        {/* Price Update Confirmation Dialog */}
        <PriceUpdateConfirmDialog
          open={showPriceUpdateDialog}
          onOpenChange={setShowPriceUpdateDialog}
          priceChanges={detectedPriceChanges}
          onConfirm={handlePriceUpdateConfirm}
          onSkip={handlePriceUpdateSkip}
        />

        {/* Add Supplier Dialog */}
        <AddSupplierDialog
          open={showAddSupplierDialog}
          onClose={() => setShowAddSupplierDialog(false)}
          onSupplierCreated={(supplier) => {
            refetchSuppliers();
            setBillData((prev) => ({
              ...prev,
              supplier_id: supplier.id,
              supplier_name: supplier.supplier_name,
            }));
            toast({
              title: "Supplier Selected",
              description: `${supplier.supplier_name} has been selected`,
            });
            setTimeout(() => {
              const invInput = document.querySelector<HTMLInputElement>('[data-field="supplier-invoice-no"]');
              invInput?.focus();
              invInput?.select();
            }, 200);
          }}
        />

        {/* Product Edit Panel */}
        <ProductEditPanel
          open={showEditPanel}
          onClose={() => setShowEditPanel(false)}
          lineItems={lineItems}
          currentIndex={editPanelIndex}
          onIndexChange={setEditPanelIndex}
          onProductUpdated={handleProductUpdated}
          focusField={editPanelFocusField}
        />

      {/* Unlock Confirmation Dialog */}
      <AlertDialog open={showUnlockConfirm} onOpenChange={setShowUnlockConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <LockOpen className="h-5 w-5 text-amber-600" />
              Unlock Purchase Bill?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This bill is locked to prevent accidental changes. Unlocking will allow editing.
              You can lock it again from the Purchase Bills dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={handleUnlockBill}
            >
              <LockOpen className="h-4 w-4 mr-1.5" />
              Unlock & Edit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Bill Warning Dialog */}
      <AlertDialog open={showDuplicateBillWarning} onOpenChange={setShowDuplicateBillWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Possible Duplicate Bill
            </AlertDialogTitle>
            <AlertDialogDescription>
              A purchase bill with the same supplier, date, and amount already exists
              {duplicateBillInfo ? ` (Bill: ${duplicateBillInfo.bill_no}, Date: ${duplicateBillInfo.bill_date})` : ''}.
              Are you sure you want to save another bill?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => {
                setShowDuplicateBillWarning(false);
                pendingSaveRef.current = true;
                handleSave();
              }}
            >
              Save Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PurchaseEntry;
