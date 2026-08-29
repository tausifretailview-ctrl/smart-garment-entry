import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { createPortal, flushSync } from "react-dom";
import { logError } from "@/lib/errorLogger";
import { cn } from "@/lib/utils";
import { getUOMLabel } from "@/constants/uom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMobileERP, validateIMEI } from "@/hooks/useMobileERP";
import { getUniversalCodeScanWarning } from "@/utils/imeiValidation";
import { productRequiresImei } from "@/utils/productRequiresImei";
import { canResolvePosPurchaseBarcode, isPosPriceSearchToken, shouldUsePartialPosBarcodeMatch } from "@/utils/posBarcodeLookup";
import {
  resolvePurchaseBarcodesForStockReport,
  type PurchaseBarcodeStockClient,
} from "@/utils/stockReportPurchaseBarcodeResolve";
import { expandBarcodeScanCandidates } from "@/utils/barcodeScanResolve";
import { lookupVariantRowsByScan } from "@/utils/lookupVariantByScan";
import { pickBestVariantScanRow } from "@/utils/lookupVariantByScan";
import {
  posVariantDisplayMrp,
  shouldPromptPosPriceSelection,
} from "@/utils/posScanPriceSelection";
import { resolveBarcodeScanPicker } from "@/utils/barcodeMrpPicker";
import {
  pickLastPurchaseScanPrice,
  resolveSaleScanPriceSource,
  shouldApplyLastPurchaseScanOverride,
} from "@/utils/saleScanPricePreference";
import {
  isCompleteNumericBarcodeForPosCart,
  isPosPureNumericSearchTerm,
  POS_BARCODE_CART_LOOKUP_EXACT,
  POS_NUMERIC_BARCODE_MIN_LENGTH,
  shouldPosEnterUseExactBarcodeLookup,
} from "@/utils/posBarcodeCartLookup";
import {
  fetchPosQuickPriceCodeMatches,
  parsePosQuickPriceCode,
  posVariantEffectiveSalePrice,
  resolvePosQuickPriceCartOverride,
} from "@/utils/posQuickPriceCode";
import {
  posFastBillingUsesDropdownPick,
  expandFastBillingCompoundSearchTerm,
  posFastBillingMetaLabel,
} from "@/utils/posFastBillingMode";
import { useSettings } from "@/hooks/useSettings";
import { usePosBilling } from "@/hooks/usePosBilling";
import { useCategoryTierPricingRules } from "@/hooks/useCategoryTierPricingRules";
import { isCategoryTierPricingEnabled } from "@/lib/posBilling/categoryTierPricing";
import {
  isPosGoodsAskQtyDialogEnabled,
  resolveGoodsQtyDialogDefaultPrice,
} from "@/utils/posGoodsAskQtyDialog";
import type { CartItem, PosGrossBasis } from "@/lib/posBilling";
import { resolvePosCustomerName, resolveWhatsAppCustomerName } from "@/lib/posBilling/buildSaleData";
import {
  applyPosGarmentGstToItem,
  calculatePosCartLineNet,
  findPosServiceMergeIndex,
  getPosCartStockIndicator,
  minUnitPriceForDiscountCap,
  normalizeFlatDiscountInput,
  posLineNetUnitPrice,
  resolveBillFlatForPosEdit,
} from "@/lib/posBilling";
import { displaySaleStockQty } from "@/utils/productStockDisplay";
import { useLocation, useSearchParams } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { supabase } from "@/integrations/supabase/client";
import { useVisibilityRefetch } from "@/hooks/useVisibilityRefetch";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { usePOS } from "@/contexts/POSContext";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { useCustomerSearch, useCustomerBalances } from "@/hooks/useCustomerSearch";
import { useNavPerfPage, useNavPerfQueryWatch } from "@/hooks/useNavigationPerf";
import { useEntryViewportSync } from "@/hooks/useEntryViewportSync";
import { applyWebPosCompactScale } from "@/components/UIScaleSelector";
import { useAuth } from "@/contexts/AuthContext";
import { useCreditNotes } from "@/hooks/useCreditNotes";
import { fetchCustomerOpeningBalanceRemaining } from "@/utils/customerOpeningBalanceRemaining";
import { invalidateCustomerFinancialSnapshot, fetchCustomerFinancialSnapshot } from "@/utils/customerFinancialSnapshot";
import {
  applyExistingAdvanceToSale,
  capPosAdvanceApplyAmount,
  posAdvanceApplyBlockReason,
  posAdvanceApplyBlockToast,
  posTenderDueAfterAdvance,
} from "@/utils/posApplyAdvance";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { isElectronShell } from "@/lib/electronShell";
import { isPosSalesRoute } from "@/lib/keyboardShortcuts";
import {
  POS_OPEN_SALESMAN_PICKER_EVENT,
  shouldClearPosSalesmanAfterSave,
  shouldCreatePosCommissionOnSave,
} from "@/utils/posSalesmanRetain";
import { TabletPOSLayout } from "@/components/tablet/TabletPOSLayout";
import { WindowTabsBar } from "@/components/WindowTabsBar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QtyInput } from "@/components/ui/qty-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Scan, X, Plus, Trash2, Banknote, CreditCard, Smartphone, Printer, ChevronLeft, ChevronDown, FileText, RotateCcw, Check, UserPlus, MessageCircle, Link2, Wallet, IndianRupee, ArrowUp, Pause, Play, Loader2, AlertCircle, Clock, Coins, Package, History, BookmarkPlus, Search, Calendar as CalendarIcon } from "lucide-react";
import { MobilePOSLayout } from "@/components/mobile/MobilePOSLayout";
import { FloatingPOSReports } from "@/components/FloatingPOSReports";
import { FloatingSaleReturn } from "@/components/FloatingSaleReturn";
import { CameraScanButton } from "@/components/CameraBarcodeScannerDialog";

import { toast } from "sonner";
import { useSaveSale } from "@/hooks/useSaveSale";
import { useStockValidation } from "@/hooks/useStockValidation";
import { useOpenSettlementVariantIds, SETTLEMENT_LOCK_TOAST_DURATION_MS, settlementLockedAddToast, getSettlementLockedCartItems, settlementLockedSaveToast } from "@/hooks/useOpenSettlementVariantIds";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { useCustomerPoints, useCustomerPointsBalance } from "@/hooks/useCustomerPoints";
import { useCustomerBrandDiscounts } from "@/hooks/useCustomerBrandDiscounts";
import { useBeepSound } from "@/hooks/useBeepSound";
import { useCashDrawer } from "@/hooks/useCashDrawer";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { waitForPrintReady } from "@/utils/printReady";
import {
  resolvePosBillFormat,
  resolvePosDirectPrintPaper,
  resolvePosInvoiceTemplate,
  resolvePosThermalPaper,
  posThermalPageCss,
  toInvoiceWrapperFormat,
  getRealTastA4PrintPageStyle,
  getPosDocumentPrintPageStyle,
  type PosBillFormat,
} from "@/utils/invoicePrintFormat";
import {
  getThermalReceiptPageStyleFragment,
  INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS,
} from "@/utils/thermalReceiptPrintDocument";
import { buildPublicInvoiceViewUrl } from "@/utils/publicInvoiceLink";
import { localDayBounds, todayLocalYmd, saleDateIsoIstForDay } from "@/lib/localDayBounds";
import {
  readPersistedLastPosHint,
  persistLastPosHint,
  type LastCompletedPosHint,
} from "@/lib/posLastBillHint";
import {
  notifyPosSalesChanged,
  POS_FOCUS_BARCODE_EVENT,
} from "@/utils/posSalesRefresh";
import {
  clearPosCartSnapshot,
  readPosCartSnapshot,
  writePosCartSnapshot,
  type PosCartSnapshot,
} from "@/lib/posCartPersistence";
import { useDashboardInvalidation } from "@/hooks/useDashboardInvalidation";
import { POS_DEFERRED_INVALIDATION_OPTS } from "@/utils/saveSaleRuntimeOptions";
import { invalidatePosDashboardQueries } from "@/utils/posDashboardSales";
import { autoCorrectFY, generateOrgEstimateNumber, minSequenceFromSeriesStart, saleFormatToLikePattern } from "@/utils/saleNumber";
import { posLineDisplayTotal } from "@/utils/posGstTotals";
import { maxCombinedDiscountForGross } from "@/utils/saleSettlement";
import { clampQty, minQtyForUom } from "@/utils/qtyInput";
import {
  normalizeGstTaxType,
  resolvePosDefaultTaxType,
  type GstTaxType,
} from "@/utils/gstRegisterUtils";
import { CreditNotePrint } from "@/components/CreditNotePrint";
import { StockIssueAlertDialog } from "@/components/StockIssueAlertDialog";
import {
  buildInsufficientStockIssue,
  buildMultipleStockIssues,
  type StockIssuePresentation,
} from "@/utils/stockErrorMessages";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { MixPaymentDialog } from "@/components/MixPaymentDialog";
import { PriceSelectionDialog } from "@/components/PriceSelectionDialog";
import { MrpTierSelectionDialog, toMrpTierSelectionChoices } from "@/components/MrpTierSelectionDialog";
import { QuickServiceProductDialog } from "@/components/QuickServiceProductDialog";
import { printInvoicePDF, generateInvoiceFromHTML, printInvoiceDirectly, printA5BillFormat, generateInvoiceBase64 } from "@/utils/pdfGenerator";
import { captureElementToPdfBase64 } from "@/utils/captureInvoicePdf";
import type { SaveSaleRuntimeOptions } from "@/utils/saveSaleRuntimeOptions";
import { isWappConnectSendProvider } from "@/constants/whatsappSendProvider";
import { buildSalesInvoiceWhatsAppCaption } from "@/utils/whatsappInvoiceCaption";
import { useWhatsAppAPI } from "@/hooks/useWhatsAppAPI";
import { format } from "date-fns";
import { useReactToPrint } from "@/hooks/useGuardedReactToPrint";
import { useDirectPrint } from "@/hooks/useDirectPrint";
import { ProductHistoryDialog } from "@/components/ProductHistoryDialog";
import { DcSaleTransferDialog } from "@/components/DcSaleTransferDialog";
import { FinancerDetailsForm, FinancerDetails, saveFinancerDetails } from "@/components/FinancerDetailsForm";
import { AddAdvanceBookingDialog } from "@/components/AddAdvanceBookingDialog";
import {
  CustomerPhoneLookupInput,
  type CustomerPhoneLookupRow,
} from "@/components/CustomerPhoneLookupInput";
import { phonesMatchExactly } from "@/utils/posCustomerPhoneMatch";
import { searchSaleOrderVariants } from "@/utils/saleOrderProductSearch";

interface PendingPriceSelection {
  product: any;
  variant: any;
  masterPrice: { sale_price: number; mrp: number; date?: Date };
  lastPurchasePrice: { sale_price: number; mrp: number; date?: Date };
}

interface POSBarcodeRuntimeSettings {
  pos_barcode_price_mode: 'mrp' | 'sale_price';
  enable_mrp: boolean;
  pos_quick_price_code: boolean;
  pos_goods_ask_qty_dialog: boolean;
}

const POS_CART_BARCODE_COL_MIN = 128;
const POS_CART_BARCODE_COL_MAX = 170;
const POS_CART_MIN_DISPLAY_ROWS = 5;
/** Approximate row height for viewport-fill blank rows (px). */
const POS_CART_ROW_HEIGHT_PX = 44;

function formatPosCartBarcode(barcode: string | null | undefined): string {
  return (barcode || "").trim();
}

function posCartBarcodeColumnWidth(items: { barcode?: string | null }[]): number {
  const longest = items.reduce((max, item) => {
    const len = formatPosCartBarcode(item.barcode).length;
    return len > max ? len : max;
  }, 0);
  if (longest <= 0) return POS_CART_BARCODE_COL_MIN;
  // Mono digits at text-sm/base ≈ 8–9px; pad for cell padding + gap.
  return Math.min(
    POS_CART_BARCODE_COL_MAX,
    Math.max(POS_CART_BARCODE_COL_MIN, Math.ceil(longest * 9 + 20)),
  );
}

function posCartGridColumns(barcodeColPx: number, showMrpColumn: boolean): string {
  // Sr | Barcode | Product | Size | Color | Qty | [MRP] | Tax% | Disc% | Disc Rs | Unit | Net
  const mrpCol = showMrpColumn ? " 96px" : "";
  return `36px ${barcodeColPx}px minmax(120px, 1fr) 52px 64px 56px${mrpCol} 68px 72px 96px 110px 118px`;
}

/** Default POS service price from variant master (MRP, else sale price from product entry). */
function resolveServiceVariantDefaultMrp(variant: {
  sale_price?: number | string | null;
  mrp?: number | string | null;
}): number {
  const salePrice = parseFloat(String(variant.sale_price || 0)) || 0;
  const rawMrp = variant.mrp ? parseFloat(String(variant.mrp)) : 0;
  return rawMrp > 0 ? rawMrp : salePrice;
}

/** Columns required by POS add-to-cart (barcode scan + price-selection dialog). */
const POS_VARIANT_LOOKUP_SELECT =
  'id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id, active, last_purchase_sale_price, last_purchase_mrp, last_purchase_date, updated_at, is_dc_product, products!inner(id, product_name, brand, default_sale_price, hsn_code, gst_per, sale_gst_percent, purchase_gst_percent, category, style, color, product_type, organization_id, sale_discount_type, sale_discount_value, status, deleted_at, uom, requires_imei)';

interface PosVariantRow {
  id: string;
  barcode?: string | null;
  size?: string | null;
  color?: string | null;
  stock_qty?: number | null;
  sale_price?: number | string | null;
  mrp?: number | string | null;
  pur_price?: number | string | null;
  product_id?: string;
  active?: boolean;
  last_purchase_sale_price?: number | string | null;
  last_purchase_mrp?: number | string | null;
  last_purchase_date?: string | null;
  updated_at?: string | null;
  is_dc_product?: boolean | null;
  [key: string]: unknown;
}

interface PosProductRow {
  id: string;
  product_name: string;
  product_type?: string;
  requires_imei?: boolean | null;
  default_sale_price?: string | number;
  [key: string]: unknown;
}

const POS_BARCODE_REPEAT_CACHE_MS = 5_000;
const posRecentBarcodeScanAt = new Map<string, number>();
/** Barcodes currently going through searchAndAddProduct (prevents Enter + debounce double-add). */
const posSearchAndAddInFlight = new Set<string>();

/** Swallow scanner double-fire within 5s after a successful add for the same barcode. */
function shouldSwallowPosRepeatBarcodeScan(barcode: string): boolean {
  const key = barcode.trim();
  if (!key) return false;
  const last = posRecentBarcodeScanAt.get(key);
  return last != null && Date.now() - last < POS_BARCODE_REPEAT_CACHE_MS;
}

function recordPosBarcodeScanSuccess(barcode: string): void {
  const key = barcode.trim();
  if (!key) return;
  const now = Date.now();
  posRecentBarcodeScanAt.set(key, now);
  for (const [k, t] of posRecentBarcodeScanAt) {
    if (now - t >= POS_BARCODE_REPEAT_CACHE_MS) posRecentBarcodeScanAt.delete(k);
  }
}

function posVariantBaseQuery(orgId: string) {
  return supabase
    .from('product_variants')
    .select(POS_VARIANT_LOOKUP_SELECT)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .is('products.deleted_at', null)
    .eq('products.organization_id', orgId)
    .eq('products.status', 'active');
}

function mapPosVariantLookupRow(
  row: (PosVariantRow & { products?: PosProductRow }) | undefined,
) {
  if (!row?.products) return null;
  return { product: row.products, variant: row };
}

async function fetchPosExactBarcodeMatches(
  orgId: string,
  barcode: string,
): Promise<Array<{ product: PosProductRow; variant: PosVariantRow }>> {
  const trimmed = barcode.trim();
  if (!trimmed) return [];

  const { data, error } = await posVariantBaseQuery(orgId)
    .eq("barcode", trimmed)
    .order("stock_qty", { ascending: false })
    .limit(50);
  if (error) throw error;

  const out: Array<{ product: PosProductRow; variant: PosVariantRow }> = [];
  for (const row of data || []) {
    const mapped = mapPosVariantLookupRow(
      row as unknown as (PosVariantRow & { products?: PosProductRow }) | undefined,
    );
    if (mapped) out.push(mapped);
  }
  return out;
}

/** Same barcode resolution chain as POS add-to-cart (exact master → scan RPC). */
async function resolvePosBarcodeLookupMatches(
  orgId: string,
  trimmedTerm: string,
): Promise<Array<{ product: PosProductRow; variant: PosVariantRow }>> {
  const scanCandidates = expandBarcodeScanCandidates(trimmedTerm);
  const exactBarcodeMatches: Array<{ product: PosProductRow; variant: PosVariantRow }> = [];
  const seen = new Set<string>();

  for (const candidate of scanCandidates) {
    const hits = await fetchPosExactBarcodeMatches(orgId, candidate);
    for (const mapped of hits) {
      if (seen.has(mapped.variant.id)) continue;
      seen.add(mapped.variant.id);
      exactBarcodeMatches.push(mapped);
    }
  }

  if (exactBarcodeMatches.length === 0) {
    const scan = await lookupVariantRowsByScan(
      orgId,
      trimmedTerm,
      POS_VARIANT_LOOKUP_SELECT,
      supabase,
      { exactOnly: true },
    );
    for (const row of scan.rows) {
      const mapped = mapPosVariantLookupRow(
        row as unknown as (PosVariantRow & { products?: PosProductRow }) | undefined,
      );
      if (mapped && !seen.has(mapped.variant.id)) {
        seen.add(mapped.variant.id);
        exactBarcodeMatches.push(mapped);
      }
    }
  }

  return exactBarcodeMatches;
}

async function fetchPosVariantByBarcodeOnce(
  orgId: string,
  trimmed: string,
  mobileERPConfig?: Parameters<typeof productRequiresImei>[1],
  lookupOptions: { exactOnly?: boolean } = POS_BARCODE_CART_LOOKUP_EXACT,
): Promise<{
  product: PosProductRow;
  variant: PosVariantRow;
  remappedLiveBarcode?: string;
} | null> {
  if (!trimmed) return null;

  const { data: exactData, error: exactError } = await posVariantBaseQuery(orgId)
    .eq('barcode', trimmed)
    .order('stock_qty', { ascending: false })
    .limit(25);
  if (exactError) throw exactError;

  const exactRow = pickBestVariantScanRow(
    (exactData || []) as Record<string, unknown>[],
    [trimmed],
  );
  const exact = mapPosVariantLookupRow(
    exactRow as unknown as (PosVariantRow & { products?: PosProductRow }) | undefined,
  );
  if (exact) return exact;

  const exactOnly = lookupOptions.exactOnly !== false;

  if (!exactOnly) {
    const escaped = trimmed.replace(/[%_,]/g, '');
    if (escaped && shouldUsePartialPosBarcodeMatch(trimmed)) {
      const { data: partialData, error: partialError } = await posVariantBaseQuery(orgId)
        .ilike('barcode', `%${escaped}%`)
        .order('stock_qty', { ascending: false })
        .limit(1);
      if (partialError) throw partialError;

      const partial = mapPosVariantLookupRow(
        partialData?.[0] as unknown as (PosVariantRow & { products?: PosProductRow }) | undefined,
      );

      // Serialized (IMEI) units are unique pieces and share long common prefixes.
      // A substring match would silently add a DIFFERENT phone — exact match only.
      if (partial && productRequiresImei(partial.product, mobileERPConfig)) return null;
      if (partial) return partial;
    }
  }

  // Post-merge drift: purchase_items still has the scanned barcode; live master
  // may carry a different barcode (KS Footwear / duplicate-master consolidate).
  if (!canResolvePosPurchaseBarcode(trimmed)) return null;
  if (exactOnly && !isCompleteNumericBarcodeForPosCart(trimmed)) return null;
  try {
    const resolutions = await resolvePurchaseBarcodesForStockReport(
      supabase as unknown as PurchaseBarcodeStockClient,
      orgId,
      trimmed,
      { exactOnly },
    );
    const hit = resolutions.find((r) => !r.excludeReason && r.skuId);
    if (!hit) return null;

    const { data: bySku, error: bySkuError } = await posVariantBaseQuery(orgId)
      .eq('id', hit.skuId)
      .limit(1);
    if (bySkuError) throw bySkuError;

    const mapped = mapPosVariantLookupRow(
      bySku?.[0] as unknown as (PosVariantRow & { products?: PosProductRow }) | undefined,
    );
    if (!mapped) return null;

    const liveBc = (hit.liveBarcode || mapped.variant.barcode || "").trim();
    // Keep the scanned label barcode on the cart line (same pattern as legacy IMEI).
    const variantForCart =
      liveBc && liveBc !== trimmed
        ? ({ ...mapped.variant, barcode: trimmed } as PosVariantRow)
        : mapped.variant;

    return {
      product: mapped.product,
      variant: variantForCart,
      remappedLiveBarcode: liveBc && liveBc !== trimmed ? liveBc : undefined,
    };
  } catch (err) {
    console.error('POS purchase-barcode resolve failed:', err);
    return null;
  }
}

async function fetchPosVariantByBarcode(
  orgId: string,
  barcode: string,
  mobileERPConfig?: Parameters<typeof productRequiresImei>[1],
  lookupOptions: { exactOnly?: boolean } = POS_BARCODE_CART_LOOKUP_EXACT,
): Promise<{
  product: PosProductRow;
  variant: PosVariantRow;
  remappedLiveBarcode?: string;
} | null> {
  for (const candidate of expandBarcodeScanCandidates(barcode)) {
    const hit = await fetchPosVariantByBarcodeOnce(orgId, candidate, mobileERPConfig, lookupOptions);
    if (hit) return hit;
  }
  return null;
}

function isStockTrackedPosProduct(product: { product_type?: string | null } | null | undefined): boolean {
  return product?.product_type !== 'service' && product?.product_type !== 'combo';
}

async function fetchUnavailablePosVariantByProductName(
  orgId: string,
  searchTerm: string,
  productTypeFilter: string,
) {
  const term = searchTerm.trim();
  if (!term || productTypeFilter === 'service' || productTypeFilter === 'combo') return null;

  let query = supabase
    .from('product_variants')
    .select(POS_VARIANT_LOOKUP_SELECT)
    .eq('organization_id', orgId)
    .eq('products.organization_id', orgId)
    .eq('products.status', 'active')
    .eq('active', true)
    .is('deleted_at', null)
    .is('products.deleted_at', null)
    .ilike('products.product_name', `%${term}%`);

  if (productTypeFilter !== 'all') {
    query = query.eq('products.product_type', productTypeFilter);
  }

  const { data, error } = await query.order('stock_qty', { ascending: false }).limit(20);
  if (error) throw error;

  const rows = (data || []) as unknown as Array<PosVariantRow & { products?: PosProductRow }>;
  const row = rows.find((item) => {
    const product = item.products;
    return isStockTrackedPosProduct(product) && Number(item.stock_qty || 0) <= 0;
  });

  if (!row?.products) return null;
  return { product: row.products, variant: row };
}

function mapPosPrintItem(item: any, index: number, taxType: GstTaxType = "inclusive") {
  const taxableUnit = posLineNetUnitPrice(item as CartItem);
  const taxableTotal = Number(item.netAmount) || 0;
  const printTotal = posLineDisplayTotal(taxableTotal, item.gstPer || 0, taxType);
  const displayMrp = Math.max(
    Number(item?.originalMrp) || 0,
    Number(item?.mrp) || 0,
    Number(taxableUnit) || 0
  );
  return {
    sr: index + 1,
    particulars: item.productName,
    size: item.size,
    barcode: item.barcode || "",
    hsn: item.hsnCode || "",
    color: item.color || "",
    sp: taxableUnit,
    mrp: displayMrp,
    qty: item.quantity,
    rate: taxableUnit,
    total: printTotal,
    gstPercent: item.gstPer || 0,
    discountPercent: item.discountPercent || 0,
    itemNotes: item.itemNotes || "",
  };
}

const PERF_PATH = "pos-sales";

export default function POSSales() {
  useNavPerfPage(PERF_PATH);
  useEntryViewportSync();
  const { user } = useAuth();
  const { currentOrganization, organizationRole } = useOrganization();
  const { hasSpecialPermission } = useUserPermissions();
  const { setOnNewSale, setOnClearCart, setOnOpenCashierReport, setOnOpenStockReport, setOnOpenSaleReturn, setOnSaveChanges, setOnEstimatePrint, setHasItems, setIsEditing, setIsSavingChanges } = usePOS();
  const { saveSale, updateSale, holdSale, resumeHeldSale, isSaving } = useSaveSale();
  const { flushScheduledSalesInvalidation } = useDashboardInvalidation();
  // Ref-based lock to prevent duplicate saves from rapid keyboard + click combos
  const paymentLockRef = useRef(false);
  const { createCreditNote, getAvailableCreditBalance, applyCredit, isCreating: isCreatingCreditNote, isApplying: isApplyingCredit } = useCreditNotes();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isIPadSafari = typeof navigator !== 'undefined' && (/iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && "ontouchend" in document));
  const isIOS = typeof navigator !== 'undefined' && (/iPhone/.test(navigator.userAgent) || isIPadSafari);
  const { settings: waSettings, sendMessageAsync } = useWhatsAppAPI();
  const [isHeldSale, setIsHeldSale] = useState(false);
  const [availableCreditBalance, setAvailableCreditBalance] = useState(0);
  const [availableAdvanceBalance, setAvailableAdvanceBalance] = useState(0);
  const [advanceApplied, setAdvanceApplied] = useState(0);
  const [openingBalanceRemaining, setOpeningBalanceRemaining] = useState(0);
  const [pendingSaleReturnCredits, setPendingSaleReturnCredits] = useState<Array<{ id: string; return_number: string; net_amount: number; credit_note_id: string | null }>>([]);
  const [recentAdjustedSaleReturnCredits, setRecentAdjustedSaleReturnCredits] = useState<Array<{ id: string; return_number: string; net_amount: number; linked_sale_id: string | null; linked_sale_number?: string }>>([]);
  const [showSRCreditDropdown, setShowSRCreditDropdown] = useState(false);
  /** Full return value from same-bill S/R dialog this session — may exceed bill (exchange excess). */
  const [sameBillReturnGross, setSameBillReturnGross] = useState(0);
  const { checkStock, validateCartStock } = useStockValidation();
  const { lockedVariantIds, isLocked: isVariantLockedForSettlement } = useOpenSettlementVariantIds();
  const queryClient = useQueryClient();

  const refreshPosAfterBillPrint = useCallback(() => {
    flushScheduledSalesInvalidation(currentOrganization?.id);
    if (currentOrganization?.id) {
      queryClient.invalidateQueries({ queryKey: ['todays-sales', currentOrganization.id] });
      invalidatePosDashboardQueries(queryClient, currentOrganization.id);
    }
  }, [currentOrganization?.id, flushScheduledSalesInvalidation, queryClient]);

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { orgNavigate: orgNavigatePOS } = useOrgNavigation();
  const _savedCart = readPosCartSnapshot(currentOrganization?.id || "default");

  const [customerId, setCustomerId] = useState<string>(_savedCart?.customerId || "");
  const [customerName, setCustomerName] = useState(_savedCart?.customerName || "");
  const [customerPhone, setCustomerPhone] = useState(_savedCart?.customerPhone || "");
  /** Phone that produced the current customerId link (combobox or phone match). */
  const linkedCustomerPhoneRef = useRef(_savedCart?.customerPhone || "");
  const [searchInput, setSearchInput] = useState("");
  const [showMobilePaymentSheet, setShowMobilePaymentSheet] = useState(false);
  const [selectedProductType, setSelectedProductType] = useState<string>("all");
  
  // Customer balance hook
  const { balance: customerBalance, openingBalance: customerOpeningBalance, isLoading: isBalanceLoading } = useCustomerBalance(
    customerId || null,
    currentOrganization?.id || null
  );
  
  // Customer points hooks
  const { calculatePoints, isPointsEnabled, isRedemptionEnabled, calculateMaxRedeemablePoints, calculateRedemptionValue, redeemPoints, pointsSettings } = useCustomerPoints();
  const { data: customerPointsData } = useCustomerPointsBalance(customerId || null);
  const { getBrandDiscountForProduct, hasBrandDiscounts, brandDiscounts, isLoading: isBrandDiscountsLoading } = useCustomerBrandDiscounts(customerId || null);

  // Settings first so grossBasis / garment GST are explicit params into the billing engine.
  const { data: settingsData } = useSettings();
  const [posRuntimeSettings, setPosRuntimeSettings] = useState<POSBarcodeRuntimeSettings | null>(null);
  const posRuntimeSettingsRef = useRef<POSBarcodeRuntimeSettings | null>(null);

  useEffect(() => {
    if (!settingsData) return;
    const saleSettings = (settingsData as any)?.sale_settings || {};
    const purchaseSettings = (settingsData as any)?.purchase_settings || {};
    const next: POSBarcodeRuntimeSettings = {
      pos_barcode_price_mode: saleSettings.pos_barcode_price_mode === 'mrp' ? 'mrp' : 'sale_price',
      enable_mrp: purchaseSettings.show_mrp === true,
      pos_quick_price_code: saleSettings.pos_quick_price_code === true,
      pos_goods_ask_qty_dialog: saleSettings.pos_goods_ask_qty_dialog === true,
    };
    setPosRuntimeSettings(next);
    posRuntimeSettingsRef.current = next;
  }, [settingsData]);

  useEffect(() => {
    posRuntimeSettingsRef.current = posRuntimeSettings;
  }, [posRuntimeSettings]);

  const garmentGstSettings = useMemo(
    () => ({
      garment_gst_rule_enabled: ((settingsData as any)?.purchase_settings?.garment_gst_rule_enabled === true),
      garment_gst_threshold: (settingsData as any)?.purchase_settings?.garment_gst_threshold,
      garment_gst_below_rate: (settingsData as any)?.purchase_settings?.garment_gst_below_rate,
    }),
    [settingsData],
  );

  /** Call-site settings lookup — engine must not read settings context. */
  const grossBasis: PosGrossBasis =
    posRuntimeSettings?.enable_mrp === true && posRuntimeSettings?.pos_barcode_price_mode === "mrp"
      ? "mrp"
      : "sale_price";

  const defaultPosTaxTypeEarly = resolvePosDefaultTaxType(
    ((settingsData as any)?.sale_settings || {}) as {
      default_tax_type?: string;
      default_pos_tax_type?: string;
    },
  );

  const categoryTierPricingEnabled = isCategoryTierPricingEnabled(
    (settingsData as any)?.sale_settings,
  );
  const activeDiscountSchemeId =
    (settingsData as any)?.sale_settings?.active_discount_scheme_id ?? null;
  const { data: categoryTierRules = [] } = useCategoryTierPricingRules(
    currentOrganization?.id,
    activeDiscountSchemeId,
  );

  const billing = usePosBilling({
    grossBasis,
    garmentGstSettings,
    calculateRedemptionValue,
    initialTaxType: defaultPosTaxTypeEarly,
    initialItems: _savedCart?.items?.length ? (_savedCart.items as CartItem[]) : [],
    categoryTierPricing: {
      enabled: categoryTierPricingEnabled,
      rules: categoryTierRules,
    },
  });

  const {
    items,
    itemsRef,
    setItems,
    flatDiscountValue,
    flatDiscountMode,
    setFlatDiscountMode,
    setFlatDiscountValue,
    handleFlatDiscountValueChange,
    taxType,
    setTaxType,
    saleReturnAdjust,
    setSaleReturnAdjust,
    creditApplied,
    setCreditApplied,
    roundOff,
    setRoundOff,
    isManualRoundOff,
    setIsManualRoundOff,
    handleRoundOffChange,
    handleFinalAmountChange,
    handleResetRoundOff,
    pointsToRedeem,
    setPointsToRedeem,
    totals: billingTotals,
    addLine: billingAddLine,
    updateQty: billingUpdateQty,
    updatePrice: billingUpdatePrice,
    updateDiscountPercent: billingUpdateDiscountPercent,
    updateDiscountAmount: billingUpdateDiscountAmount,
    updateMrp: billingUpdateMrp,
    updateGstPer: billingUpdateGstPer,
    removeLine: billingRemoveLine,
    clearCart: billingClearCart,
    loadFromSaleEdit,
    loadHeldCart,
    buildSaleData,
    maxSrFromBill: billingMaxSrFromBill,
  } = billing;
  const [currentInvoiceIndex, setCurrentInvoiceIndex] = useState(0);
  const [openProductSearch, setOpenProductSearch] = useState(false);
  const [selectedProductIndex, setSelectedProductIndex] = useState(0);
  const [productSearchResults, setProductSearchResults] = useState<any[]>([]);
  const [isProductSearchLoading, setIsProductSearchLoading] = useState(false);
  const [quickServiceDialogDefaultMrp, setQuickServiceDialogDefaultMrp] = useState<number | undefined>();
  const productCommandListRef = useRef<HTMLDivElement | null>(null);
  const [openCustomerSearch, setOpenCustomerSearch] = useState(false);
  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);
  /** When an invoice is loaded for view/edit, show its stored time in the footer; cleared for new bills. */
  const [footerLoadedInvoiceTime, setFooterLoadedInvoiceTime] = useState<string | null>(null);
  const isInitializingEditRef = useRef(false);
  const hasManuallyAddedNewItemRef = useRef(false);
  const [originalItemsForEdit, setOriginalItemsForEdit] = useState<Array<{ variantId: string; quantity: number }>>([]);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [showPrintConfirmDialog, setShowPrintConfirmDialog] = useState(false);
  const [savedInvoiceData, setSavedInvoiceData] = useState<any>(null);
  const [currentInvoiceNumber, setCurrentInvoiceNumber] = useState("");
  const mixPaymentInitialBreakdown = useMemo(() => {
    if (
      !currentSaleId ||
      !savedInvoiceData?.saleId ||
      String(savedInvoiceData.saleId) !== String(currentSaleId)
    ) {
      return null;
    }
    return {
      cashAmount: Number(savedInvoiceData.cashAmount) || 0,
      cardAmount: Number(savedInvoiceData.cardAmount) || 0,
      upiAmount: Number(savedInvoiceData.upiAmount) || 0,
      bankAmount: Number(savedInvoiceData.bankAmount) || 0,
      financeAmount: Number(savedInvoiceData.financeAmount) || 0,
    };
  }, [
    currentSaleId,
    savedInvoiceData?.saleId,
    savedInvoiceData?.cashAmount,
    savedInvoiceData?.cardAmount,
    savedInvoiceData?.upiAmount,
    savedInvoiceData?.bankAmount,
    savedInvoiceData?.financeAmount,
  ]);
  const [nextInvoicePreview, setNextInvoicePreview] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'multiple' | 'pay_later'>('cash');
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  // POS bill format/template/preview are derived from cached useSettings() below.
  const printRef = useRef<HTMLDivElement>(null);
  const invoicePrintRef = useRef<HTMLDivElement>(null);
  const printBtnRef = useRef<HTMLButtonElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);
  const [cartPadRowCount, setCartPadRowCount] = useState(POS_CART_MIN_DISPLAY_ROWS);

  const syncCartPadRows = useCallback(() => {
    const el = itemsContainerRef.current;
    if (!el) return;
    const height = el.clientHeight;
    if (height <= 0) return;
    const itemCount = itemsRef.current.length;
    const targetTotal = Math.max(
      POS_CART_MIN_DISPLAY_ROWS,
      Math.floor(height / POS_CART_ROW_HEIGHT_PX),
      itemCount,
    );
    setCartPadRowCount(Math.max(0, targetTotal - itemCount));
    if (document.body.classList.contains("pos-web-desktop")) {
      const gutter = Math.max(0, el.offsetWidth - el.clientWidth);
      document.documentElement.style.setProperty("--pos-scrollbar-w", `${gutter}px`);
    }
  }, []);

  useLayoutEffect(() => {
    const el = itemsContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => syncCartPadRows());
    ro.observe(el);
    syncCartPadRows();
    return () => ro.disconnect();
  }, [syncCartPadRows]);

  useLayoutEffect(() => {
    syncCartPadRows();
  }, [items.length, syncCartPadRows]);

  // ── WhatsApp invoice PDF capture ──────────────────────────────────────────
  // A hidden off-screen InvoiceWrapper rendered with the user's selected A4
  // template (logo, header, columns, totals) so the WhatsApp auto-send
  // attaches the SAME design the customer would see when printing.
  const whatsappPdfRef = useRef<HTMLDivElement>(null);
  const [whatsappPdfSnapshot, setWhatsappPdfSnapshot] = useState<any>(null);
  const whatsappPdfResolverRef = useRef<
    { resolve: (v: string | null) => void } | null
  >(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [highlightCartItemId, setHighlightCartItemId] = useState<string | null>(null);
  const highlightClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeBlurRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const posCartRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const formatINR2 = useCallback((value: number) => {
    const parsed = Number(value);
    const safe = Number.isFinite(parsed) ? parsed : 0;
    return safe.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, []);

  const [lastCompletedPosHint, setLastCompletedPosHint] = useState<LastCompletedPosHint | null>(null);

  const applyLastCompletedPosHint = useCallback((invoiceNumber: string, amount: number, qty: number) => {
    const hint: LastCompletedPosHint = {
      invoiceNumber,
      amount: Number(amount) || 0,
      qty: Number(qty) || 0,
    };
    setLastCompletedPosHint(hint);
    if (currentOrganization?.id) {
      persistLastPosHint(currentOrganization.id, hint);
    }
  }, [currentOrganization?.id]);

  const bumpCartHighlight = useCallback((id: string) => {
    setHighlightCartItemId(id);
    if (highlightClearTimerRef.current) clearTimeout(highlightClearTimerRef.current);
    highlightClearTimerRef.current = setTimeout(() => {
      setHighlightCartItemId(null);
      highlightClearTimerRef.current = null;
    }, 2800);
  }, []);

  useLayoutEffect(() => {
    if (!highlightCartItemId) return;
    const el = posCartRowRefs.current.get(highlightCartItemId);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightCartItemId, items]);
  const [showAddCustomerDialog, setShowAddCustomerDialog] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  // Optional backdated POS invoice date (only used when the admin setting is ON).
  const [posInvoiceDate, setPosInvoiceDate] = useState<Date>(new Date());
  const [invoiceSearchInput, setInvoiceSearchInput] = useState("");
  const [showMixPaymentDialog, setShowMixPaymentDialog] = useState(false);
  const [showCreditCustomerRequiredDialog, setShowCreditCustomerRequiredDialog] = useState(false);
  /** Local draft for Unit Price cell (commit on blur — avoids mid-keystroke cap reject). */
  const [unitPriceDraft, setUnitPriceDraft] = useState<{ index: number; value: string } | null>(null);
  const [unitPriceConfirm, setUnitPriceConfirm] = useState<{
    index: number;
    value: number;
    mrp: number;
    pctOff: number;
    rupeesOff: number;
  } | null>(null);
  const [refundAmount, setRefundAmount] = useState(0);
  const [creditNoteData, setCreditNoteData] = useState<any>(null);
  const [showCreditNoteDialog, setShowCreditNoteDialog] = useState(false);
  const creditNotePrintRef = useRef<HTMLDivElement>(null);
  const [openSalesmanSearch, setOpenSalesmanSearch] = useState(false);
  const [selectedSalesman, setSelectedSalesman] = useState("");
  const [salesmanSearchInput, setSalesmanSearchInput] = useState("");
  const [saleNotes, setSaleNotes] = useState(_savedCart?.saleNotes || "");
  const [newCustomerForm, setNewCustomerForm] = useState({
    customer_name: "",
    phone: "",
    email: "",
    address: "",
    gst_number: "",
  });
  
  // Helper to open Add Customer dialog with phone pre-filled from search
  const openAddCustomerDialog = () => {
    const searchText = customerName.trim();
    const isPhone = /^\d{7,15}$/.test(searchText);
    setNewCustomerForm({
      customer_name: "",
      phone: isPhone ? searchText : "",
      email: "",
      address: "",
      gst_number: "",
    });
    setShowAddCustomerDialog(true);
  };

  // Price selection dialog state
  const [showPriceSelectionDialog, setShowPriceSelectionDialog] = useState(false);
  const [pendingPriceSelection, setPendingPriceSelection] = useState<PendingPriceSelection | null>(null);
  const [mrpTierPicker, setMrpTierPicker] = useState<{
    barcode: string;
    choices: Array<{ product: PosProductRow; variant: PosVariantRow }>;
  } | null>(null);
  
  // Stock issue dialog state (insufficient / out-of-stock on add or payment)
  const [showStockIssueDialog, setShowStockIssueDialog] = useState(false);
  const [stockIssuePresentation, setStockIssuePresentation] = useState<StockIssuePresentation | null>(null);

  // Floating reports state
  const [showFloatingCashierReport, setShowFloatingCashierReport] = useState(false);
  const [showFloatingStockReport, setShowFloatingStockReport] = useState(false);
  const [showFloatingSaleReturn, setShowFloatingSaleReturn] = useState(false);
  const [showAdvanceBooking, setShowAdvanceBooking] = useState(false);
  // Quick service product dialog state
  const [showQuickServiceDialog, setShowQuickServiceDialog] = useState(false);
  const [quickServiceCode, setQuickServiceCode] = useState("");
  const [quickServiceProductForAdd, setQuickServiceProductForAdd] = useState<{product: any; variant: any} | null>(null);

  // Financer / EMI details state (for Mobile ERP)
  const [financerDetails, setFinancerDetails] = useState<FinancerDetails | null>(null);
  const [showFinancerDialog, setShowFinancerDialog] = useState(false);

  // Out-of-stock product history dialog state
  const [showOutOfStockHistory, setShowOutOfStockHistory] = useState(false);
  const [outOfStockProduct, setOutOfStockProduct] = useState<{ productId: string; productName: string } | null>(null);

  const { playSuccessBeep, playErrorBeep } = useBeepSound();

  const openStockIssueDialog = useCallback((
    issue: StockIssuePresentation,
    historyProduct?: { productId: string; productName: string },
  ) => {
    playErrorBeep();
    setOutOfStockProduct(historyProduct ?? null);
    setStockIssuePresentation(issue);
    setShowStockIssueDialog(true);
  }, [playErrorBeep]);

  const clearPosScanInput = useCallback(() => {
    setSearchInput("");
    if (barcodeInputRef.current) {
      barcodeInputRef.current.value = "";
    }
    barcodeInputRef.current?.focus();
  }, []);

  const blockSettlementLockedVariant = useCallback(
    (variant: { id?: string } | null | undefined, productName: string, barcode: string): boolean => {
      if (!variant?.id || !isVariantLockedForSettlement(variant.id)) return false;
      const locked = settlementLockedAddToast(productName, barcode);
      toast.error(locked.title, { description: locked.description, duration: SETTLEMENT_LOCK_TOAST_DURATION_MS });
      playErrorBeep();
      clearPosScanInput();
      return true;
    },
    [isVariantLockedForSettlement, playErrorBeep, clearPosScanInput],
  );

  const validateCartSettlementLocks = useCallback(
    (cartItems: Array<{ variantId: string; productName: string; barcode?: string }>): boolean => {
      const locked = getSettlementLockedCartItems(cartItems, lockedVariantIds);
      if (locked.length === 0) return true;
      const lockedToast = settlementLockedSaveToast(locked);
      toast.error(lockedToast.title, {
        description: lockedToast.description,
        duration: SETTLEMENT_LOCK_TOAST_DURATION_MS,
      });
      playErrorBeep();
      return false;
    },
    [lockedVariantIds, playErrorBeep],
  );

  // Cash drawer hook
  const { openDrawer: openCashDrawer } = useCashDrawer();
  const { softDelete } = useSoftDelete();

  // Persist cart in sessionStorage — survives minimize / in-app tab switch, not app quit.
  useEffect(() => {
    const orgId = currentOrganization?.id || "default";
    // Don't snapshot a loaded/edited invoice — only unsaved new-sale work belongs in the snapshot.
    if (currentSaleId) {
      clearPosCartSnapshot(orgId);
      return;
    }
    if (items.length === 0) {
      clearPosCartSnapshot(orgId);
      return;
    }
    const snapshot: PosCartSnapshot = {
      items,
      customerId,
      customerName,
      customerPhone,
      saleNotes,
      saleReturnAdjust,
      sameBillReturnGross,
      savedAt: Date.now(),
    };
    writePosCartSnapshot(orgId, snapshot);
  }, [
    items,
    customerId,
    customerName,
    customerPhone,
    saleNotes,
    saleReturnAdjust,
    sameBillReturnGross,
    currentOrganization?.id,
    currentSaleId,
  ]);

  // Org may load after first paint — restore in-session cart once per org (not after app quit).
  const posCartHydratedOrgRef = useRef<string | null>(null);
  useEffect(() => {
    const orgId = currentOrganization?.id;
    if (!orgId || posCartHydratedOrgRef.current === orgId) return;
    if (items.length > 0 || currentSaleId) {
      posCartHydratedOrgRef.current = orgId;
      return;
    }
    const saved = readPosCartSnapshot(orgId);
    posCartHydratedOrgRef.current = orgId;
    if (!saved?.items?.length) return;
    setItems(saved.items as CartItem[]);
    if (saved.customerId) setCustomerId(saved.customerId);
    if (saved.customerName) setCustomerName(saved.customerName);
    if (saved.customerPhone) {
      setCustomerPhone(saved.customerPhone);
      linkedCustomerPhoneRef.current = saved.customerPhone;
    }
    if (saved.saleNotes) setSaleNotes(saved.saleNotes);
    if (Number(saved.saleReturnAdjust) > 0.005) {
      setSaleReturnAdjust(Number(saved.saleReturnAdjust) || 0);
    }
    if (Number(saved.sameBillReturnGross) > 0.005) {
      setSameBillReturnGross(Number(saved.sameBillReturnGross) || 0);
    }
  }, [currentOrganization?.id, items.length, currentSaleId, setItems, setSaleReturnAdjust]);

  // Barcode scanner detection for instant cart add
  const {
    recordKeystroke,
    reset: resetScannerDetection,
    cancelAutoSubmit,
    markSubmitted,
  } = useBarcodeScanner({ minBarcodeLength: POS_NUMERIC_BARCODE_MIN_LENGTH, autoSubmitDelay: 0 });
  const mobileERP = useMobileERP();
  const dropdownDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productSearchSeqRef = useRef(0);

  const clearPosBarcodeSubmitTimers = useCallback(() => {
    if (dropdownDebounceTimer.current) {
      clearTimeout(dropdownDebounceTimer.current);
      dropdownDebounceTimer.current = null;
    }
    cancelAutoSubmit();
  }, [cancelAutoSubmit]);
  
  // Visibility-based polling - pauses when tab is hidden
  const posRefetchInterval = useVisibilityRefetch(300000); // 5 minutes (reduced from 1 min for multi-tab perf)
  
  // Ref to skip customer re-search after dropdown selection
  const customerJustSelected = useRef(false);

  const applyCustomerFromPhoneLookup = useCallback((customer: CustomerPhoneLookupRow) => {
    customerJustSelected.current = true;
    setCustomerId(customer.id);
    setCustomerName(customer.customer_name);
    setCustomerPhone(customer.phone || "");
    linkedCustomerPhoneRef.current = customer.phone || "";
    setTimeout(() => {
      customerJustSelected.current = false;
    }, 500);
  }, []);

  const handleInlinePhoneChange = useCallback(
    (value: string) => {
      setCustomerPhone(value);
      if (!customerId || !linkedCustomerPhoneRef.current) return;
      if (!phonesMatchExactly(value, linkedCustomerPhoneRef.current)) {
        setCustomerId("");
        linkedCustomerPhoneRef.current = "";
      }
    },
    [customerId],
  );

  useEffect(() => {
    if (!customerPhone) linkedCustomerPhoneRef.current = "";
  }, [customerPhone]);

  // Load sale data if saleId is in URL (edit mode)
  useEffect(() => {
    const saleId = searchParams.get('saleId');
    if (saleId && currentOrganization?.id) {
      loadSaleForEdit(saleId).finally(() => {
        // Strip ?saleId so reactivating the POS tab (or reloading) does not reload this invoice.
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('saleId');
          return next;
        }, { replace: true });
      });
    }
  }, [searchParams, currentOrganization?.id]);

  // Auto-reset POS to a fresh new sale when the POS tab re-activates while an old invoice is still loaded.
  // Skip when the user has unsaved edits (item list differs from originally loaded items).
  const wasOnPosSalesRef = useRef(false);
  useEffect(() => {
    const isOnPosSales = location.pathname.endsWith('/pos-sales');
    const wasOn = wasOnPosSalesRef.current;
    wasOnPosSalesRef.current = isOnPosSales;
    if (!isOnPosSales || wasOn) return;
    if (searchParams.get('saleId')) return; // explicit edit URL — leave it alone
    if (!currentSaleId) return;
    // Detect unsaved edits relative to the originally loaded invoice.
    const sameLength = items.length === originalItemsForEdit.length;
    const sameContents = sameLength && items.every((it, i) => {
      const orig = originalItemsForEdit[i];
      return orig && orig.variantId === it.variantId && Number(orig.quantity) === Number(it.quantity);
    });
    if (!sameContents) return; // user has unsaved work — keep the loaded invoice
    handleNewInvoice();
  }, [location.pathname, searchParams, currentSaleId, items, originalItemsForEdit]);

  const focusBarcodeScanInput = useCallback(() => {
    if (isIOS) return;

    const tryFocus = () => {
      const el = barcodeInputRef.current;
      if (!el) return false;

      const tabPane = el.closest('[data-tab-cache-path]');
      if (tabPane?.classList.contains('hidden') || tabPane?.getAttribute('aria-hidden') === 'true') {
        return false;
      }
      if (document.querySelector('[role="dialog"][data-state="open"]')) {
        return false;
      }

      el.focus({ preventScroll: true });
      return document.activeElement === el;
    };

    const scheduleRetries = () => {
      const delays = isElectronShell() ? [120, 300] : [120];
      delays.forEach((ms) => window.setTimeout(() => tryFocus(), ms));
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!tryFocus()) scheduleRetries();
      });
    });
  }, [isIOS]);

  const shouldSkipBarcodeFocusRecovery = useCallback((active: Element | null) => {
    if (!active || active === barcodeInputRef.current) return true;
    const tag = active.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return true;
    if (active.closest('button, [role="dialog"], [role="listbox"], [data-radix-collection-item]')) return true;
    if (document.querySelector('[role="dialog"][data-state="open"]')) return true;
    return false;
  }, []);

  const handleBarcodeInputBlur = useCallback(() => {
    if (isIOS) return;
    if (barcodeBlurRecoveryTimerRef.current) clearTimeout(barcodeBlurRecoveryTimerRef.current);
    barcodeBlurRecoveryTimerRef.current = setTimeout(() => {
      barcodeBlurRecoveryTimerRef.current = null;
      if (shouldSkipBarcodeFocusRecovery(document.activeElement)) return;
      focusBarcodeScanInput();
    }, isElectronShell() ? 120 : 80);
  }, [isIOS, focusBarcodeScanInput, shouldSkipBarcodeFocusRecovery]);

  // Focus barcode when POS opens, tab becomes visible, or New Sale is clicked.
  useEffect(() => {
    if (isIOS) return;
    if (!location.pathname.includes('/pos-sales')) return;
    focusBarcodeScanInput();
  }, [location.pathname, location.search, isIOS, focusBarcodeScanInput]);

  useEffect(() => {
    if (isIOS) return;

    const onFocusRequest = () => focusBarcodeScanInput();
    window.addEventListener(POS_FOCUS_BARCODE_EVENT, onFocusRequest);

    let observer: IntersectionObserver | null = null;
    let setupTimer: ReturnType<typeof setTimeout> | undefined;

    const attachVisibilityObserver = () => {
      const el = barcodeInputRef.current;
      const tabPane = el?.closest('[data-tab-cache-path]');
      if (!el || !tabPane) return false;

      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            focusBarcodeScanInput();
          }
        },
        { threshold: 0.12 },
      );
      observer.observe(tabPane);
      return true;
    };

    if (!attachVisibilityObserver()) {
      setupTimer = setTimeout(() => attachVisibilityObserver(), 200);
    }

    return () => {
      window.removeEventListener(POS_FOCUS_BARCODE_EVENT, onFocusRequest);
      if (setupTimer) window.clearTimeout(setupTimer);
      observer?.disconnect();
    };
  }, [isIOS, focusBarcodeScanInput]);

  // Keep focus on barcode when user clicks empty areas (continuous scanning).
  useEffect(() => {
    if (isIOS) return;

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'BUTTON' ||
        target.closest('button') ||
        target.closest('[role="dialog"]') ||
        target.closest('[role="listbox"]') ||
        target.closest('[data-radix-collection-item]')
      ) {
        return;
      }
      window.setTimeout(() => focusBarcodeScanInput(), 50);
    };

    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [isIOS, focusBarcodeScanInput]);

  // Refocus barcode when the desktop window regains focus (Electron alt-tab back).
  useEffect(() => {
    if (isIOS) return;

    const onWindowFocus = () => {
      if (!location.pathname.includes('/pos-sales')) return;
      focusBarcodeScanInput();
    };

    window.addEventListener('focus', onWindowFocus);
    return () => window.removeEventListener('focus', onWindowFocus);
  }, [isIOS, location.pathname, focusBarcodeScanInput]);

  const loadSaleForEdit = async (saleId: string) => {
    isInitializingEditRef.current = true;
    hasManuallyAddedNewItemRef.current = false;
    setAdvanceApplied(0);
    // Drop any unsaved-cart snapshot — we're now viewing a specific saved invoice.
    clearPosCartSnapshot(currentOrganization?.id || "default");
    try {
      // Fetch sale data
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .eq('organization_id', currentOrganization?.id)
        .single();

      if (saleError) throw saleError;

      // Check if this is a held sale (support legacy pending Hold/* rows)
      const isHeld = isHoldLikeBill(sale);
      setIsHeldSale(isHeld);

      // Populate form with sale data
      setCurrentSaleId(saleId);
      setCurrentInvoiceNumber(sale.sale_number);
      setCustomerId(sale.customer_id || "");
      setCustomerName(sale.customer_name);
      setCustomerPhone(sale.customer_phone || "");
      linkedCustomerPhoneRef.current = sale.customer_phone || "";
      setSaleReturnAdjust(sale.sale_return_adjust || 0);
      setRoundOff(Number(sale.round_off) || 0);
      setIsManualRoundOff(true);
      setPaymentMethod(sale.payment_method as any);
      setSelectedSalesman(sale.salesman || "");

      if (isHeld) {
        const savedFlatPercent = Number(sale.flat_discount_percent) || 0;
        const savedFlatAmount = Number(sale.flat_discount_amount) || 0;
        const percentLooksClean =
          savedFlatPercent > 0 &&
          Math.abs(savedFlatPercent * 100 - Math.round(savedFlatPercent * 100)) < 0.0001;
        if (percentLooksClean) {
          handleFlatDiscountValueChange(savedFlatPercent);
          setFlatDiscountMode("percent");
        } else if (savedFlatAmount > 0) {
          handleFlatDiscountValueChange(savedFlatAmount);
          setFlatDiscountMode("amount");
        } else {
          setFlatDiscountValue(0);
          setFlatDiscountMode("percent");
        }
        // Load items from dedicated held_cart_data column (held sale doesn't have sale_items)
        try {
          const holdData = (sale as any).held_cart_data;
          if (holdData && holdData.items && Array.isArray(holdData.items)) {
            loadHeldCart(holdData);
          }
        } catch (parseError) {
          console.error("Error loading held cart data:", parseError);
        }

        toast.success("Held Bill Loaded", {
          description: `Bill ${sale.sale_number} loaded. Complete the sale with a payment method.`,
        });
      } else {
        const { data: saleItems, error: itemsError } = await supabase
          .from("sale_items")
          .select("*")
          .eq("sale_id", saleId);

        if (itemsError) throw itemsError;

        const { flat: flatRes, items: cartItems } = loadFromSaleEdit(sale, saleItems || []);

        // Load sale notes for regular sales
        setSaleNotes(sale.notes || "");

        // Store original items for stock validation in edit mode
        setOriginalItemsForEdit(
          (saleItems || []).map((item) => ({
            variantId: item.variant_id,
            quantity: item.quantity,
          })),
        );

        toast.success(`Invoice ${sale.sale_number} loaded for editing`);

        const loadedTaxType = normalizeGstTaxType((sale as { tax_type?: string }).tax_type);
        setTaxType(loadedTaxType);

        const effectiveFlat =
          flatRes.percentLooksClean ? Number(sale.flat_discount_amount) || 0 : flatRes.value;
        setSavedInvoiceData({
          invoiceNumber: sale.sale_number,
          saleId: sale.id,
          items: cartItems,
          totals: {
            quantity: cartItems.reduce((sum, item) => sum + item.quantity, 0),
            mrp: Number(sale.gross_amount),
            discount: Number(sale.discount_amount),
            subtotal: Number(sale.gross_amount) - Number(sale.discount_amount),
          },
          flatDiscountAmount: effectiveFlat,
          saleReturnAdjust: Number(sale.sale_return_adjust) || 0,
          finalAmount: Number(sale.net_amount),
          method: sale.payment_method,
          customerName: sale.customer_name,
          customerPhone: sale.customer_phone,
          paidAmount: Number(sale.paid_amount) || 0,
          cashAmount: Number(sale.cash_amount) || 0,
          upiAmount: Number(sale.upi_amount) || 0,
          cardAmount: Number(sale.card_amount) || 0,
          creditAmount: Number((sale as any).credit_amount) || 0,
          salesman: sale.salesman || null,
          roundOff: Number(sale.round_off) || 0,
          notes: sale.notes || null,
          taxType: loadedTaxType,
        });
      }

      const { data: financer } = await supabase
        .from('sale_financer_details')
        .select('*')
        .eq('sale_id', saleId)
        .maybeSingle();
      if (financer) {
        setFinancerDetails({
          financer_name: financer.financer_name,
          loan_number: financer.loan_number || '',
          emi_amount: financer.emi_amount || 0,
          tenure: financer.tenure || 0,
          down_payment: financer.down_payment || 0,
          down_payment_mode: (financer as any).down_payment_mode || 'cash',
          bank_transfer_amount: (financer as any).bank_transfer_amount || 0,
          finance_discount: (financer as any).finance_discount || 0,
        });
      }
    } catch (error: any) {
      console.error('Error loading sale:', error);
      toast.error("Error", { description: "Failed to load invoice for editing" });
    } finally {
      isInitializingEditRef.current = false;
    }
  };

  // Display gate only — computations (mrpTotal / savings / discount cap) stay unconditional.
  const enableMrp = posRuntimeSettings?.enable_mrp === true;
  const posCartGridCols = useMemo(
    () => posCartGridColumns(posCartBarcodeColumnWidth(items), enableMrp),
    [items, enableMrp],
  );

  // Optional POS invoice-date override (admin-gated). When OFF, POS silently uses today.
  const posAllowDateChange = (settingsData as any)?.sale_settings?.pos_allow_date_change === true;

  /** Master switch — default off. Existing orgs unchanged until explicitly enabled. */
  const allowPosEditUnitPrice =
    (settingsData as any)?.sale_settings?.allow_pos_edit_unit_price === true;
  const posUnitPriceOverrideConfirmPct = (() => {
    const raw = Number((settingsData as any)?.sale_settings?.pos_unit_price_override_confirm_pct);
    if (!Number.isFinite(raw)) return 30;
    return Math.min(99, Math.max(1, Math.round(raw)));
  })();
  const canEditPosUnitPrice =
    allowPosEditUnitPrice &&
    (organizationRole === "admin" ||
      organizationRole === "manager" ||
      hasSpecialPermission("pos_edit_unit_price"));

  // sale_date to persist for the current bill: backdated ISO when the setting is
  // ON, otherwise undefined so useSaveSale falls back to today-in-IST (unchanged).
  const buildPosSaleDate = useCallback((): string | undefined => {
    return posAllowDateChange ? saleDateIsoIstForDay(posInvoiceDate) : undefined;
  }, [posAllowDateChange, posInvoiceDate]);

  // Voucher/ledger day (YYYY-MM-DD): picked day when ON, else current behavior.
  const buildPosVoucherDate = useCallback((): string => {
    return posAllowDateChange
      ? format(posInvoiceDate, "yyyy-MM-dd")
      : new Date().toISOString().split("T")[0];
  }, [posAllowDateChange, posInvoiceDate]);

  // Derive POS bill format / invoice template / preview flag from cached settings (no extra DB call)
  const _posSaleSettings = (settingsData as any)?.sale_settings || {};
  const posBillFormatSetting: PosBillFormat =
    (_posSaleSettings.pos_bill_format as PosBillFormat) || 'thermal';
  const posInvoiceTemplate: string = resolvePosInvoiceTemplate(_posSaleSettings);
  const posBillFormat = resolvePosBillFormat(
    posInvoiceTemplate,
    posBillFormatSetting,
    (settingsData as any)?.sale_settings?.invoice_paper_format,
  );
  const posInvoiceWrapperFormat = toInvoiceWrapperFormat(posBillFormat);
  const posThermalPaper = resolvePosThermalPaper(
    (settingsData as any)?.bill_barcode_settings?.direct_print_pos_paper,
  );
  const posPrintSourceStyle = useMemo(() => {
    const thermalCss =
      posBillFormat === 'thermal' ? posThermalPageCss(posThermalPaper) : null;
    const width =
      posBillFormat === 'a4'
        ? '210mm'
        : posBillFormat === 'a5-horizontal'
          ? '210mm'
          : thermalCss
            ? thermalCss.sourceWidth
            : '148mm';
    const minHeight =
      posInvoiceTemplate === 'real-tast'
        ? 'auto'
        : posBillFormat === 'a4'
          ? '297mm'
          : posBillFormat === 'a5-horizontal'
            ? '148mm'
            : posBillFormat === 'thermal'
              ? 'auto'
              : 'auto';
    const maxHeight =
      posInvoiceTemplate === 'real-tast' || posBillFormat === 'thermal'
        ? 'none'
        : posBillFormat === 'a4'
          ? '297mm'
          : posBillFormat === 'a5-horizontal'
            ? '148mm'
            : '210mm';
    return { width, minHeight, maxHeight, overflow: 'visible' as const };
  }, [posBillFormat, posThermalPaper, posInvoiceTemplate]);
  const showInvoicePreviewSetting: boolean = _posSaleSettings.show_invoice_preview ?? true;
  const defaultPosTaxType = resolvePosDefaultTaxType(_posSaleSettings);
  const retainPosSalesman = _posSaleSettings.pos_retain_salesman === true;

  const clearSalesmanAfterSaveIfNeeded = useCallback(() => {
    if (shouldClearPosSalesmanAfterSave(retainPosSalesman)) {
      setSelectedSalesman("");
    }
  }, [retainPosSalesman]);

  useEffect(() => {
    setTaxType(defaultPosTaxType);
  }, [defaultPosTaxType, setTaxType]);

  const invoiceTaxType: GstTaxType = savedInvoiceData?.taxType
    ? normalizeGstTaxType(savedInvoiceData.taxType)
    : taxType;

  // Direct print hook
  const { isDirectPrintEnabled, isAutoPrintEnabled, directPrint } = useDirectPrint(
    (settingsData as any)?.bill_barcode_settings
  );

  const triggerPosAutoPrintIfEnabled = useCallback(
    (onFallback: () => void) => {
      if (!isDirectPrintEnabled || !isAutoPrintEnabled) {
        onFallback();
        return;
      }
      waitForPrintReady(invoicePrintRef, async () => {
        const paperSize = resolvePosDirectPrintPaper(
          posBillFormat,
          (settingsData as any)?.bill_barcode_settings?.direct_print_pos_paper,
        );
        await directPrint(invoicePrintRef.current, {
          context: 'pos',
          paperSize,
          onFallback,
          onSuccess: async () => {
            refreshPosAfterBillPrint();
            setSavedInvoiceData(null);
            clearSalesmanAfterSaveIfNeeded();
            const billBarcodeSettings = (settingsData as any)?.bill_barcode_settings;
            if (billBarcodeSettings?.enable_cash_drawer) {
              const drawerPin = billBarcodeSettings?.cash_drawer_pin || 'pin2';
              await openCashDrawer(undefined, { pin: drawerPin, showToast: false });
            }
            setTimeout(() => barcodeInputRef.current?.focus(), 100);
          },
        });
      });
    },
    [isDirectPrintEnabled, isAutoPrintEnabled, posBillFormat, directPrint, settingsData, refreshPosAfterBillPrint, clearSalesmanAfterSaveIfNeeded],
  );

  // Alt+M (via useGlobalNavigationShortcuts) — open salesman picker from barcode field
  useEffect(() => {
    const onOpenSalesman = () => {
      if (!isPosSalesRoute(location.pathname)) return;
      setSalesmanSearchInput("");
      setOpenSalesmanSearch(true);
      window.setTimeout(() => {
        const input = document.querySelector(
          "[data-pos-salesman-picker] [cmdk-input]",
        ) as HTMLInputElement | null;
        input?.focus();
        input?.select();
      }, 0);
    };
    window.addEventListener(POS_OPEN_SALESMAN_PICKER_EVENT, onOpenSalesman);
    return () => window.removeEventListener(POS_OPEN_SALESMAN_PICKER_EVENT, onOpenSalesman);
  }, [location.pathname]);

  // Keyboard shortcuts for POS actions
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Tab cache keeps POS mounted while other screens are open — only handle keys on active POS route.
      if (!isPosSalesRoute(location.pathname)) return;
      if (isSaving) return;
      if (
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper]',
        )
      ) {
        return;
      }

      // F1 - Cash Payment (Save & Print)
      if (e.key === 'F1') {
        e.preventDefault();
        handlePaymentAndPrint('cash');
      }
      // F2 - UPI Payment (Save & Print)
      else if (e.key === 'F2') {
        e.preventDefault();
        handlePaymentAndPrint('upi');
      }
      // F3 - Card Payment (Save & Print)
      else if (e.key === 'F3') {
        e.preventDefault();
        handlePaymentAndPrint('card');
      }
      // F4 - Credit (Pay Later)
      else if (e.key === 'F4') {
        e.preventDefault();
        handlePaymentAndPrint('pay_later');
      }
      // F5 - Sale Return
      else if (e.key === 'F5') {
        e.preventDefault();
        setShowFloatingSaleReturn(true);
      }
      // F6 - Mix Payment
      else if (e.key === 'F6') {
        e.preventDefault();
        handleMixPayment();
      }
      // F7 - Hold Bill
      else if (e.key === 'F7') {
        e.preventDefault();
        if (items.length === 0 || isHeldSale) {
          setShowHoldPanel(prev => !prev);
        } else {
          handleHoldBill();
        }
      }
      // F8 - Cashier Report
      else if (e.key === 'F8') {
        e.preventDefault();
        setShowFloatingCashierReport(true);
      }
      // F9 - Print Estimate (no save)
      else if (e.key === 'F9') {
        e.preventDefault();
        if (items.length > 0) {
          handleEstimatePrintRef.current?.();
        }
      }
      // Esc - Clear cart or go to POS Dashboard
      else if (e.key === 'Escape') {
        e.preventDefault();
        const hasItems = items.some(i => i.productId !== '');
        if (hasItems) {
          handleClearAll();
        } else {
          orgNavigatePOS('/pos-dashboard');
        }
      }
      // Ctrl+P - Print saved invoice
      else if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        if (savedInvoiceData) {
          handlePrintFromDialog();
        }
      }
      // F10 - Add New Customer
      else if (e.key === 'F10') {
        e.preventDefault();
        openAddCustomerDialog();
      }
      // F11 - Size-wise Stock Report
      else if (e.key === 'F11') {
        e.preventDefault();
        setShowFloatingStockReport(true);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [items, customerName, flatDiscountValue, roundOff, paymentMethod, savedInvoiceData, isSaving, location.pathname]);

  // Apply defaults when settings load — only for empty new bills (never stomp an active cart
  // or force Flat Disc mode back to % after the cashier toggles %/₹).
  useEffect(() => {
    if (!settingsData || currentSaleId || items.length > 0) return;
    const saleSettings = (settingsData as any).sale_settings;
    if (!saleSettings) return;
    if (saleSettings.default_discount) {
      handleFlatDiscountValueChange(saleSettings.default_discount);
      setFlatDiscountMode(saleSettings.default_discount_in_rupees ? "amount" : "percent");
    }
    if (saleSettings.default_payment_method) {
      setPaymentMethod(saleSettings.default_payment_method.toLowerCase() as any);
    }
  }, [settingsData, currentSaleId, items.length, handleFlatDiscountValueChange]);

  // Update date and time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [webDesktopPos, setWebDesktopPos] = useState(
    () => !isElectronShell() && typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );

  useEffect(() => {
    if (isElectronShell()) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setWebDesktopPos(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Hide toast popups while POS is open (less distraction for cashier workflow)
  useEffect(() => {
    document.body.classList.add("pos-hide-toasts");
    if (webDesktopPos) {
      document.body.classList.add("pos-web-desktop");
    } else {
      document.body.classList.add("pos-large-ui");
    }
    return () => {
      document.body.classList.remove("pos-hide-toasts");
      document.body.classList.remove("pos-large-ui");
      document.body.classList.remove("pos-web-desktop");
    };
  }, [webDesktopPos]);

  // Web PWA desktop: compact 16px — no CSS zoom (zoom misaligns grid/footer on browsers).
  useEffect(() => {
    if (!webDesktopPos) return;
    return applyWebPosCompactScale();
  }, [webDesktopPos]);

  // Refs for print handlers (to avoid hoisting issues)
  const handleEstimatePrintRef = useRef<(() => void) | null>(null);
  const handlePrintRef = useRef<(() => void) | null>(null);

  // Register POS header actions
  useEffect(() => {
    setOnNewSale(() => () => {
      hasManuallyAddedNewItemRef.current = false;
      setItems([]);
      setCustomerName("");
      setCustomerId("");
      setCustomerPhone("");
      setFlatDiscountValue(0);
      setFlatDiscountMode('percent');
      setSaleReturnAdjust(0);
      setSameBillReturnGross(0);
      setRoundOff(0);
      setIsManualRoundOff(false);
      setRefundAmount(0);
      setCreditApplied(0);
      setAvailableCreditBalance(0);
      setAdvanceApplied(0);
      setAvailableAdvanceBalance(0);
      setOpeningBalanceRemaining(0);
      setSearchInput("");
      setCurrentInvoiceIndex(0);
      setCurrentSaleId(null);
      setCurrentInvoiceNumber("");
      setSelectedSalesman("");
      setSaleNotes("");
      setFinancerDetails(null);
      toast.success("New Invoice", { description: "Cart cleared. Ready for new sale." });
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    });
    
    setOnClearCart(() => () => {
      hasManuallyAddedNewItemRef.current = false;
      setItems([]);
      setSaleNotes("");
      toast.success("Cart Cleared", { description: "All items removed from cart" });
    });

    // Register floating report handlers
    setOnOpenCashierReport(() => () => {
      setShowFloatingCashierReport(true);
    });
    
    setOnOpenStockReport(() => () => {
      setShowFloatingStockReport(true);
    });

    setOnOpenSaleReturn(() => () => {
      setShowFloatingSaleReturn(true);
    });

    return () => {
      setOnNewSale(null);
      setOnClearCart(null);
      setOnOpenCashierReport(null);
      setOnOpenStockReport(null);
      setOnOpenSaleReturn(null);
    };
  }, [setOnNewSale, setOnClearCart, setOnOpenCashierReport, setOnOpenStockReport, setOnOpenSaleReturn, toast]);

  // Update hasItems in header
  useEffect(() => {
    setHasItems(items.length > 0);
  }, [items.length, setHasItems]);

  // Update isEditing state when currentSaleId changes
  useEffect(() => {
    setIsEditing(!!currentSaleId);
    if (!currentSaleId) {
      hasManuallyAddedNewItemRef.current = false;
      isInitializingEditRef.current = false;
      setFooterLoadedInvoiceTime(null);
    }
  }, [currentSaleId, setIsEditing]);

  // Save metadata changes handler (customer, salesman, notes only)
  const handleSaveMetadataChanges = useCallback(async () => {
    if (!currentSaleId || !currentOrganization?.id) return;
    
    setIsSavingChanges(true);
    try {
      const { error } = await supabase
        .from('sales')
        .update({
          customer_id: customerId || null,
          customer_name: customerName || 'Walk-in Customer',
          customer_phone: customerPhone || null,
          salesman: selectedSalesman || null,
          notes: saleNotes || null,
        })
        .eq('id', currentSaleId)
        .eq('organization_id', currentOrganization.id);

      if (error) throw error;

      toast.success("Changes Saved", { description: "Customer, salesman & notes updated successfully." });

      queryClient.invalidateQueries({ queryKey: ['todays-sales', currentOrganization?.id] });
      notifyPosSalesChanged({ organizationId: currentOrganization?.id });
    } catch (error: any) {
      logError(
        {
          operation: 'pos_save_metadata',
          organizationId: currentOrganization?.id,
          additionalContext: { currentSaleId, hasCustomer: !!customerId },
        },
        error
      );
      toast.error("Save Failed", { description: error.message || "Failed to save changes" });
    } finally {
      setIsSavingChanges(false);
    }
  }, [currentSaleId, currentOrganization?.id, customerId, customerName, customerPhone, selectedSalesman, saleNotes, toast, queryClient, setIsSavingChanges]);

  // Register save changes handler
  useEffect(() => {
    setOnSaveChanges(() => handleSaveMetadataChanges);
    return () => setOnSaveChanges(null);
  }, [setOnSaveChanges, handleSaveMetadataChanges]);

  // Preview next invoice number when not editing existing sale
  useEffect(() => {
    const previewNextInvoice = async () => {
      if (currentSaleId || !currentOrganization?.id) return;
      
      try {
        const saleSettings = (settingsData as any)?.sale_settings;

        // Check for custom POS format or series start
        if (saleSettings?.pos_numbering_format || saleSettings?.pos_series_start) {
          const rawFormat = saleSettings.pos_numbering_format || saleSettings.pos_series_start;
          const rawSeriesStart = saleSettings.pos_series_start;
          const format = autoCorrectFY(rawFormat);
          const seriesStart = rawSeriesStart ? autoCorrectFY(rawSeriesStart) : rawSeriesStart;

          let safeFormat = format;
          if (!/\{#+\}/.test(safeFormat)) {
            safeFormat = /\d+$/.test(safeFormat) ? safeFormat.replace(/\d+$/, "{###}") : `${safeFormat}{###}`;
          }
          const likePattern = saleFormatToLikePattern(safeFormat);
          const minSequence = minSequenceFromSeriesStart(seriesStart);

          const { data: lastSale } = await supabase
            .from('sales')
            .select('sale_number')
            .eq('organization_id', currentOrganization.id)
            .is('deleted_at', null)
            .like('sale_number', likePattern)
            .order('created_at', { ascending: false })
            .limit(50);

          let sequence = minSequence;
          if (lastSale && lastSale.length > 0) {
            let maxSeq = 0;
            for (const s of lastSale) {
              const matches = s.sale_number.match(/(\d+)$/);
              if (matches) maxSeq = Math.max(maxSeq, parseInt(matches[1], 10));
            }
            sequence = Math.max(maxSeq + 1, minSequence);
          }

          const basePattern = safeFormat.replace(/\{#+\}/, "");
          const padLen = (safeFormat.match(/\{(#+)\}/)?.[1]?.length ?? 0);
          const seqStr = padLen > 0 ? String(sequence).padStart(padLen, "0") : String(sequence);
          setNextInvoicePreview(`${basePattern}${seqStr}`);
        } else {
          // Preview = MAX(active POS seq) + 1 — matches generate_pos_number_atomic
          const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
          const m = ist.getMonth() + 1;
          const y = ist.getFullYear();
          const fyStart = m >= 4 ? y : y - 1;
          const fyEnd = fyStart + 1;
          const series = `POS/${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;

          const { data: lastSales } = await supabase
            .from('sales')
            .select('sale_number')
            .eq('organization_id', currentOrganization.id)
            .is('deleted_at', null)
            .like('sale_number', `${series}/%`)
            .order('created_at', { ascending: false })
            .limit(50);

          let maxSeq = 0;
          for (const s of lastSales || []) {
            const matches = s.sale_number.match(/(\d+)$/);
            if (matches) maxSeq = Math.max(maxSeq, parseInt(matches[1], 10));
          }
          setNextInvoicePreview(`${series}/${maxSeq + 1}`);
        }
      } catch (error) {
        console.error('Error previewing next invoice:', error);
        setNextInvoicePreview('POS/??-??/?');
      }
    };
    
    previewNextInvoice();
  }, [currentSaleId, currentOrganization?.id, settingsData]);

  // Fetch today's sales
  const { data: todaysSales, isLoading: todaysSalesLoading, isFetching: todaysSalesFetching } = useQuery({
    queryKey: ['todays-sales', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const todayYmd = todayLocalYmd();
      const { startIso, endIso } = localDayBounds(todayYmd, todayYmd);

      const { data, error } = await (supabase as any)
        .from('sales')
        .select('id, sale_number, sale_date, net_amount, paid_amount, payment_status, customer_name, customer_phone, payment_method, created_at, sale_type, customer_id, round_off, flat_discount_percent, flat_discount_amount, sale_return_adjust, salesman, notes, total_qty')
        .eq('organization_id', currentOrganization.id)
        .eq('sale_type', 'pos')
        .is('deleted_at', null)
        .neq('payment_status', 'hold')
        .gte('sale_date', startIso)
        .lte('sale_date', endIso)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30_000,
    refetchInterval: posRefetchInterval,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!currentOrganization?.id) return;
    const cached = readPersistedLastPosHint(currentOrganization.id);
    if (cached) setLastCompletedPosHint(cached);
  }, [currentOrganization?.id]);

  useEffect(() => {
    const latest = todaysSales?.[0];
    if (!latest?.sale_number) return;
    applyLastCompletedPosHint(
      latest.sale_number,
      Number(latest.net_amount) || 0,
      Number(latest.total_qty) || 0,
    );
  }, [todaysSales, applyLastCompletedPosHint]);

  const isHoldLikeBill = (sale: any) => {
    if (!sale) return false;
    if (sale.payment_status === 'hold') return true;
    // Backward-compat: older DB trigger rewrote pay_later hold rows to pending.
    return (
      sale.payment_status === 'pending' &&
      typeof sale.sale_number === 'string' &&
      sale.sale_number.startsWith('Hold/') &&
      sale.payment_method === 'pay_later'
    );
  };

  // Held bills query (all-time, not just today)
  const { data: heldBills = [], refetch: refetchHeldBills } = useQuery({
    queryKey: ['held-bills', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await (supabase as any)
        .from('sales')
        .select('id, sale_number, sale_date, net_amount, customer_name, customer_phone, notes, held_cart_data, created_at, payment_status, payment_method')
        .eq('organization_id', currentOrganization.id)
        .eq('sale_type', 'pos')
        .in('payment_status', ['hold', 'pending'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).filter((sale: any) => isHoldLikeBill(sale));
    },
    enabled: !!currentOrganization?.id,
    staleTime: 5 * 60 * 1000,   // Cache 5 minutes
    refetchInterval: false,       // No auto-poll — refetch on hold/resume action only
  });

  const [showHoldPanel, setShowHoldPanel] = useState(false);
  const [holdSearchQuery, setHoldSearchQuery] = useState('');

  useEffect(() => {
    if (showHoldPanel) {
      void refetchHeldBills();
    }
  }, [showHoldPanel, refetchHeldBills]);

  // Fetch employees for salesman dropdown
  const { data: employees } = useQuery({
    queryKey: ['pos-employees', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from('employees')
        .select('id, employee_name, designation, commission_percent')
        .eq('organization_id', currentOrganization.id)
        .is('deleted_at', null)
        .eq('status', 'active')
        .order('employee_name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch commission rules for salesman commission calculation
  const { data: commissionRules = [] } = useQuery({
    queryKey: ['commission-rules', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await (supabase.from('commission_rules' as any) as any)
        .select('id, employee_id, employee_name, rule_type, rule_value, commission_percent')
        .eq('organization_id', currentOrganization.id)
        .eq('is_active', true);
      if (error) {
        // If this logs "relation does not exist", the migration hasn't run
        console.error('[commission_rules] Query failed — migration may not have run:', error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Filter employees based on search
  const filteredEmployees = (employees || []).filter((emp: any) =>
    emp.employee_name.toLowerCase().includes(salesmanSearchInput.toLowerCase())
  );

  useEffect(() => {
    const handleNavigationKeyPress = (e: KeyboardEvent) => {
      if (!isPosSalesRoute(location.pathname)) return;
      // Page Up - Previous Invoice (older)
      if (e.key === 'PageUp') {
        e.preventDefault();
        if (todaysSales && todaysSales.length > 0 && currentInvoiceIndex < todaysSales.length - 1) {
          handlePreviousInvoice();
        }
      }
      // Page Down - Next Invoice (newer)
      else if (e.key === 'PageDown') {
        e.preventDefault();
        if (todaysSales && todaysSales.length > 0 && currentInvoiceIndex > 0) {
          handleNextInvoice();
        }
      }
      // End - Last (newest) Invoice
      else if (e.key === 'End') {
        e.preventDefault();
        if (todaysSales && todaysSales.length > 0) {
          handleLastInvoice();
        }
      }
    };

    window.addEventListener('keydown', handleNavigationKeyPress);
    return () => window.removeEventListener('keydown', handleNavigationKeyPress);
  }, [todaysSales, currentInvoiceIndex, location.pathname]);

  // DC Sale Transfer dialog state
  const [showDcTransferDialog, setShowDcTransferDialog] = useState(false);
  const [dcTransferItems, setDcTransferItems] = useState<any[]>([]);
  const [dcTransferSaleId, setDcTransferSaleId] = useState("");

  // Use reliable customer search hook - pass customerName directly as search term
  const { 
    customers = [], 
    filteredCustomers,
    isLoading: isCustomersLoading,
    isError: isCustomersError,
    refetch: refetchCustomers,
    hasMore: hasMoreCustomers,
  } = useCustomerSearch(customerName, { enabled: !customerJustSelected.current });

  const visibleCustomerIds = useMemo(
    () => filteredCustomers.map((c: { id: string }) => c.id).filter(Boolean),
    [filteredCustomers],
  );
  
  const {
    getCustomerBalance,
    getCustomerAdvance,
    getCustomerCreditNote,
    balancesLoading,
    balancesFetching,
  } = useCustomerBalances({
    enabled: openCustomerSearch,
    customerIds: visibleCustomerIds,
  });

  useNavPerfQueryWatch("todays-sales", PERF_PATH, {
    isLoading: todaysSalesLoading,
    isFetching: todaysSalesFetching,
    rowCount: todaysSales?.length,
  });
  useNavPerfQueryWatch("customer-balances", PERF_PATH, {
    isLoading: balancesLoading,
    isFetching: balancesFetching,
  });

  // Fetch credit balance and pending sale return credit notes when customer changes
  useEffect(() => {
    const fetchCreditBalance = async () => {
      if (customerId) {
        const balance = await getAvailableCreditBalance(customerId);
        setAvailableCreditBalance(balance);
        // Fetch pending sale return credit notes for this customer
        if (currentOrganization?.id) {
          const { data: pendingReturns } = await supabase
            .from("sale_returns")
            .select("id, return_number, net_amount, credit_note_id")
            .eq("organization_id", currentOrganization.id)
            .eq("customer_id", customerId)
            .is("deleted_at", null)
            .in("credit_status", ["pending"])
            .not("credit_status", "in", '("adjusted","adjusted_outstanding")')
            .eq("refund_type", "credit_note")
            .order("return_date", { ascending: false });
          const returns = pendingReturns || [];

          // Hide stale "pending" sale-return CN rows when the linked credit note is fully used.
          const linkedCreditNoteIds = returns
            .map((r: any) => r.credit_note_id)
            .filter((id: any) => !!id);

          if (linkedCreditNoteIds.length === 0) {
            setPendingSaleReturnCredits(returns);
          } else {
            const { data: linkedNotes } = await supabase
              .from("credit_notes")
              .select("id, credit_amount, used_amount, status")
              .in("id", linkedCreditNoteIds as any);

            const linkedMap = new Map<string, any>(
              (linkedNotes || []).map((n: any) => [String(n.id), n])
            );

            const filtered = returns.filter((sr: any) => {
              if (!sr.credit_note_id) return true;
              const note = linkedMap.get(String(sr.credit_note_id));
              if (!note) return true; // keep visible if mapping missing
              const creditAmount = Number(note.credit_amount) || 0;
              const usedAmount = Number(note.used_amount) || 0;
              const remaining = Math.max(0, creditAmount - usedAmount);
              const isFullyUsed =
                String(note.status || "").toLowerCase() === "fully_used" || remaining <= 0.01;
              return !isFullyUsed;
            });

            setPendingSaleReturnCredits(filtered);
          }

          // Customer-wise CN redeem trace: recently adjusted sale returns with invoice linkage.
          const { data: adjustedReturns } = await supabase
            .from("sale_returns")
            .select("id, return_number, net_amount, linked_sale_id")
            .eq("organization_id", currentOrganization.id)
            .eq("customer_id", customerId)
            .is("deleted_at", null)
            .eq("refund_type", "credit_note")
            .eq("credit_status", "adjusted")
            .not("linked_sale_id", "is", null)
            .order("updated_at", { ascending: false })
            .limit(8);

          const adjustedRows = adjustedReturns || [];
          const linkedSaleIds = adjustedRows
            .map((r: any) => r.linked_sale_id)
            .filter((id: any) => !!id);

          if (linkedSaleIds.length > 0) {
            const { data: linkedSales } = await supabase
              .from("sales")
              .select("id, sale_number")
              .in("id", linkedSaleIds as any);

            const saleNumberMap = new Map<string, string>(
              (linkedSales || []).map((sale: any) => [String(sale.id), String(sale.sale_number || "")])
            );

            setRecentAdjustedSaleReturnCredits(
              adjustedRows.map((row: any) => ({
                ...row,
                linked_sale_number: row.linked_sale_id ? saleNumberMap.get(String(row.linked_sale_id)) || "" : "",
              }))
            );
          } else {
            setRecentAdjustedSaleReturnCredits([]);
          }
        }
      } else {
        setAvailableCreditBalance(0);
        setCreditApplied(0);
        setPendingSaleReturnCredits([]);
        setRecentAdjustedSaleReturnCredits([]);
      }
    };
    fetchCreditBalance();
  }, [customerId]);

  useEffect(() => {
    let cancelled = false;
    const fetchAdvanceBalance = async () => {
      if (!customerId || !currentOrganization?.id) {
        setAvailableAdvanceBalance(0);
        setAdvanceApplied(0);
        setOpeningBalanceRemaining(0);
        return;
      }
      try {
        const [{ data: advRows }, obRemaining] = await Promise.all([
          supabase
            .from("customer_advances")
            .select("amount, used_amount")
            .eq("customer_id", customerId)
            .eq("organization_id", currentOrganization.id),
          fetchCustomerOpeningBalanceRemaining(
            supabase,
            currentOrganization.id,
            customerId,
            queryClient,
          ),
        ]);
        if (cancelled) return;
        const unused = (advRows || []).reduce((sum, row) => {
          const available = (Number(row.amount) || 0) - (Number(row.used_amount) || 0);
          return sum + Math.max(0, available);
        }, 0);
        setAvailableAdvanceBalance(unused);
        setOpeningBalanceRemaining(obRemaining);
        setAdvanceApplied(0);
      } catch {
        if (!cancelled) {
          setAvailableAdvanceBalance(0);
          setOpeningBalanceRemaining(0);
          setAdvanceApplied(0);
        }
      }
    };
    void fetchAdvanceBalance();
    return () => {
      cancelled = true;
    };
  }, [customerId, currentOrganization?.id, queryClient]);

  // Brand-wise takes precedence: master Disc % is bill flat only with no brand rows.
  // Wait for brand query so master 3% is never race-applied over brand 7%.
  useEffect(() => {
    // Preserve historical invoice pricing while opening an existing bill in edit mode.
    if (isInitializingEditRef.current) return;
    if (currentSaleId && !hasManuallyAddedNewItemRef.current) return;
    if (isBrandDiscountsLoading) return;
    if (!customerId || !customers) return;

    const customer = customers.find((c: any) => c.id === customerId);
    if (!customer) return;

    if (hasBrandDiscounts) {
      setFlatDiscountValue(0);
      setFlatDiscountMode("percent");
      return;
    }

    if (customer.discount_percent && customer.discount_percent > 0) {
      handleFlatDiscountValueChange(customer.discount_percent);
      setFlatDiscountMode("percent");
    }
  }, [customerId, customers, hasBrandDiscounts, isBrandDiscountsLoading, currentSaleId, handleFlatDiscountValueChange]);

  // Handle barcode/product search on Enter - reads DOM value to avoid React state lag
  const handleSearch = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Go' || e.keyCode === 13) {
      // Read directly from the input element to avoid stale React state
      const rawValue = (e.currentTarget || e.target as HTMLInputElement)?.value?.trim();
      if (!rawValue) return;
      e.preventDefault();

      clearPosBarcodeSubmitTimers();
      markSubmitted(rawValue);

      const fastBilling = posRuntimeSettingsRef.current?.pos_quick_price_code === true;
      if (posFastBillingUsesDropdownPick(rawValue, fastBilling)) {
        setOpenProductSearch(true);
        if (productSearchResults.length === 0) {
          toast.message("Pick a product from the list", {
            description: "Fast billing: type name (e.g. Jeans), then click or press Enter on the row.",
          });
        }
        return;
      }

      // Numeric / SKU barcode — exact add (all orgs, fast billing on or off).
      if (shouldPosEnterUseExactBarcodeLookup(rawValue)) {
        setOpenProductSearch(false);
        void searchAndAddProduct(rawValue);
        resetScannerDetection();
        return;
      }

      // Close dropdown immediately for scanner input
      setOpenProductSearch(false);

      // Search and add product directly (refocus happens after add completes)
      void searchAndAddProduct(rawValue);

      // Reset scanner detection for next input
      resetScannerDetection();
    }
  }, [resetScannerDetection, clearPosBarcodeSubmitTimers, markSubmitted, searchAndAddProduct, productSearchResults.length]);

  const handlePosBarcodeSubmit = useCallback(() => {
    const rawValue = barcodeInputRef.current?.value?.trim() || searchInput.trim();
    if (!rawValue) return;
    clearPosBarcodeSubmitTimers();
    markSubmitted(rawValue);
    const fastBilling = posRuntimeSettingsRef.current?.pos_quick_price_code === true;
    if (posFastBillingUsesDropdownPick(rawValue, fastBilling)) {
      setOpenProductSearch(true);
      setSearchInput(rawValue);
      if (productSearchResults.length === 0) {
        toast.message("Pick a product from the list", {
          description: "Fast billing: matching products show brand and price — tap a row to add.",
        });
      }
      return;
    }
    if (shouldPosEnterUseExactBarcodeLookup(rawValue)) {
      void searchAndAddProduct(rawValue);
      return;
    }
    void searchAndAddProduct(rawValue);
  }, [clearPosBarcodeSubmitTimers, markSubmitted, searchInput, productSearchResults.length]);

  // Optimized input change handler — manual typing never auto-adds; press Enter (or scan gun Enter suffix).
  const handleBarcodeInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    recordKeystroke();
    setSearchInput(value);
    
    if (dropdownDebounceTimer.current) {
      clearTimeout(dropdownDebounceTimer.current);
      dropdownDebounceTimer.current = null;
    }
    cancelAutoSubmit();
    
    if (value.length >= 2) {
      dropdownDebounceTimer.current = setTimeout(() => {
        setOpenProductSearch(true);
      }, 300);
    } else {
      setOpenProductSearch(false);
      setProductSearchResults([]);
      setIsProductSearchLoading(false);
    }
  }, [recordKeystroke, cancelAutoSubmit]);

  useEffect(() => {
    const term = searchInput.trim();

    if (!openProductSearch || term.length < 2 || !currentOrganization?.id) {
      setProductSearchResults([]);
      setIsProductSearchLoading(false);
      return;
    }

    const requestSeq = ++productSearchSeqRef.current;
    setIsProductSearchLoading(true);

    const runSearch = async () => {
      const variantSelect = POS_VARIANT_LOOKUP_SELECT;
      const isNumeric = /^\d+$/.test(term);

      const baseFilters = (q: any) => {
        q = q
          .eq('organization_id', currentOrganization.id)
          .eq('products.organization_id', currentOrganization.id)
          .eq('products.status', 'active')
          .eq('active', true)
          .is('deleted_at', null)
          .is('products.deleted_at', null);
        if (selectedProductType !== 'all') {
          q = q.eq('products.product_type', selectedProductType);
        }
        return q;
      };

      let allData: any[] = [];
      let tokens: string[] = [];
      let quickPriceCode: { letters: string; price: number } | null = null;

      const fetchVariantsForToken = async (token: string): Promise<Set<string>> => {
        const escToken = token.replace(/[%_,]/g, '');
        const isNumericToken = /^\d+$/.test(escToken);

        const matchedVariantIds = new Set<string>();

        if (isNumericToken) {
          const strictBarcode = isCompleteNumericBarcodeForPosCart(escToken);

          const exactQ = baseFilters(
            supabase.from('product_variants').select('id, product_id'),
          ).eq('barcode', escToken);
          const exactRes = await exactQ.limit(500);
          if (!exactRes.error && exactRes.data?.length) {
            exactRes.data.forEach((v: { id: string }) => matchedVariantIds.add(v.id));
          } else if (!strictBarcode && !exactRes.error && shouldUsePartialPosBarcodeMatch(escToken)) {
            const partialQ = baseFilters(
              supabase.from('product_variants').select('id, product_id'),
            ).ilike('barcode', `%${escToken}%`);
            const partialRes = await partialQ.limit(500);
            if (!partialRes.error && partialRes.data) {
              partialRes.data.forEach((v: { id: string }) => matchedVariantIds.add(v.id));
            }
          }
          // Purchase-label barcode may differ from live master after merge
          if (matchedVariantIds.size === 0 && strictBarcode && canResolvePosPurchaseBarcode(escToken)) {
            try {
              const resolutions = await resolvePurchaseBarcodesForStockReport(
                supabase as unknown as PurchaseBarcodeStockClient,
                currentOrganization.id,
                escToken,
                { exactOnly: true },
              );
              for (const r of resolutions) {
                if (!r.excludeReason && r.skuId) matchedVariantIds.add(r.skuId);
              }
            } catch (err) {
              console.error('POS dropdown purchase-barcode resolve failed:', err);
            }
          }

          // Complete barcode scan — never widen to name/price partial matches (shared 0040… prefixes).
          if (strictBarcode) {
            return matchedVariantIds;
          }
        }

        const variantOrParts = [
          ...(isNumericToken ? [] : [`barcode.ilike.%${escToken}%`]),
          `size.ilike.%${escToken}%`,
          `color.ilike.%${escToken}%`,
        ];
        if (isPosPriceSearchToken(escToken)) {
          variantOrParts.push(`sale_price.eq.${escToken}`);
          variantOrParts.push(`mrp.eq.${escToken}`);
        }

        const variantQ = baseFilters(
          supabase.from('product_variants').select('id, product_id'),
        ).or(variantOrParts.join(','));

        const productQ = supabase
          .from('products')
          .select('id')
          .eq('organization_id', currentOrganization.id)
          .eq('status', 'active')
          .is('deleted_at', null)
          .or(`product_name.ilike.%${escToken}%,brand.ilike.%${escToken}%,category.ilike.%${escToken}%,style.ilike.%${escToken}%,hsn_code.ilike.%${escToken}%,color.ilike.%${escToken}%`);

        if (selectedProductType !== 'all') {
          productQ.eq('product_type', selectedProductType);
        }

        const [vRes, pRes] = await Promise.all([variantQ, productQ.limit(500)]);

        if (!vRes.error && vRes.data) {
          vRes.data.forEach((v: any) => matchedVariantIds.add(v.id));
        }

        if (!pRes.error && pRes.data && pRes.data.length > 0) {
          const prodIds = pRes.data.map((p: any) => p.id);
          const { data: pVariants } = await supabase
            .from('product_variants')
            .select('id')
            .eq('organization_id', currentOrganization.id)
            .in('product_id', prodIds)
            .eq('active', true)
            .is('deleted_at', null)
            .limit(1000);
          if (pVariants) {
            pVariants.forEach((v: any) => matchedVariantIds.add(v.id));
          }
        }

        return matchedVariantIds;
      };

      if (isNumeric) {
        tokens = [term];
        if (isCompleteNumericBarcodeForPosCart(term)) {
          const barcodeMatches = await resolvePosBarcodeLookupMatches(
            currentOrganization.id,
            term,
          );
          if (requestSeq !== productSearchSeqRef.current) return;
          allData = barcodeMatches.map(({ product, variant }) => ({
            ...variant,
            products: product,
          }));
        } else {
          const matchedIds = await fetchVariantsForToken(term);
          if (requestSeq !== productSearchSeqRef.current) return;
          if (matchedIds.size === 0) {
            allData = [];
          } else {
            const finalIds = Array.from(matchedIds).slice(0, 50);
            const { data: finalVariants, error } = await baseFilters(
              supabase.from('product_variants').select(variantSelect)
            )
              .in('id', finalIds)
              .order('stock_qty', { ascending: false });
            if (requestSeq !== productSearchSeqRef.current) return;
            if (error) throw error;
            allData = finalVariants || [];
          }
        }
      } else {
        quickPriceCode =
          posRuntimeSettingsRef.current?.pos_quick_price_code === true
            ? parsePosQuickPriceCode(term)
            : null;
        if (quickPriceCode) {
          const hits = await fetchPosQuickPriceCodeMatches(
            currentOrganization.id,
            quickPriceCode.letters,
            quickPriceCode.price,
            variantSelect,
          );
          if (requestSeq !== productSearchSeqRef.current) return;
          allData = hits.map((h) => h.variant);
          tokens = [quickPriceCode.letters, String(quickPriceCode.price)];
        } else {
        const fastBillingSearch =
          posRuntimeSettingsRef.current?.pos_quick_price_code === true;
        const textSearchTerm = fastBillingSearch
          ? expandFastBillingCompoundSearchTerm(term)
          : term;
        // Text / mixed search — reuse sale-order product search (name, brand, style, category, barcode)
        const saleOrderHits = await searchSaleOrderVariants(currentOrganization.id, textSearchTerm);
        if (requestSeq !== productSearchSeqRef.current) return;

        let ids = saleOrderHits.map((r) => r.id).filter(Boolean).slice(0, 50);

        if (ids.length === 0) {
          // Fallback: legacy multi-token AND search
          tokens = textSearchTerm.toLowerCase().split(/\s+/).filter((t) => t.length > 0);

          if (tokens.length === 0) {
            allData = [];
          } else {
            const tokenSets = await Promise.all(tokens.map(fetchVariantsForToken));

            if (requestSeq !== productSearchSeqRef.current) return;

            let intersection = tokenSets[0];
            for (let i = 1; i < tokenSets.length; i++) {
              intersection = new Set([...intersection].filter((id) => tokenSets[i].has(id)));
            }

            ids = Array.from(intersection).slice(0, 50);
          }
        } else {
          tokens = textSearchTerm.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
        }

        if (ids.length === 0) {
          allData = [];
        } else {
          const { data: finalVariants, error } = await baseFilters(
            supabase.from('product_variants').select(variantSelect),
          )
            .in('id', ids)
            .order('stock_qty', { ascending: false });

          if (requestSeq !== productSearchSeqRef.current) return;
          if (error) throw error;
          allData = finalVariants || [];
        }
        }
      }

      const formatted = allData
        .filter((item: any) => {
          const product = item.products;
          if (!product) return false;
          if (product.status !== 'active') return false;
          if (selectedProductType !== 'all' && product.product_type !== selectedProductType) {
            return false;
          }
          // Show matches in dropdown even when out of stock; add-to-cart still validates stock.
          return true;
        })
        .map((item: any) => {
          const p = item.products || {};
          const matches: string[] = [];

          const check = (label: string, value: any) => {
            if (value == null) return;
            const v = String(value).toLowerCase();
            tokens.forEach(tok => {
              if (v.includes(tok) && !matches.includes(label)) matches.push(label);
            });
          };

          check('Name', p.product_name);
          check('Brand', p.brand);
          check('Category', p.category);
          check('Style', p.style);
          check('HSN', p.hsn_code);
          check('Color', item.color || p.color);
          check('Size', item.size);
          check('Barcode', item.barcode);
          if (isNumeric && isCompleteNumericBarcodeForPosCart(term) && !matches.includes('Barcode')) {
            matches.push('Barcode');
          }
          tokens.forEach(tok => {
            if (isPosPriceSearchToken(tok)) {
              if (Number(item.sale_price) === Number(tok) && !matches.includes('Price')) matches.push('Price');
              if (Number(item.mrp) === Number(tok) && !matches.includes('MRP')) matches.push('MRP');
            }
          });

          return {
            product: p,
            variant: item,
            matchedOn: matches,
            displaySalePrice: posVariantEffectiveSalePrice(item, p),
            displayBarcode:
              isNumeric && isCompleteNumericBarcodeForPosCart(term) ? term : item.barcode,
            searchText: `${p.product_name || ''} ${item.size || ''} ${item.color || p.color || ''} ${item.barcode || ''} ${p.brand || ''} ${p.category || ''}`.toLowerCase(),
            quickPriceOverride: undefined as { sale_price: number; mrp: number } | undefined,
          };
        });

      const fastBillingDropdown = posRuntimeSettingsRef.current?.pos_quick_price_code === true;
      if (fastBillingDropdown && quickPriceCode) {
        for (const row of formatted) {
          row.quickPriceOverride = resolvePosQuickPriceCartOverride(
            row.product,
            row.variant,
            quickPriceCode.price,
          );
        }
      }

      setProductSearchResults(formatted);
    };

    runSearch()
      .catch((error) => {
        if (requestSeq !== productSearchSeqRef.current) return;
        console.error('POS product search failed:', error);
        setProductSearchResults([]);
      })
      .finally(() => {
        if (requestSeq === productSearchSeqRef.current) {
          setIsProductSearchLoading(false);
        }
      });
  }, [openProductSearch, searchInput, selectedProductType, currentOrganization?.id]);

  useEffect(() => {
    if (!showQuickServiceDialog || quickServiceProductForAdd || !quickServiceCode || !currentOrganization?.id) {
      if (!showQuickServiceDialog) {
        setQuickServiceDialogDefaultMrp(undefined);
      }
      return;
    }

    let cancelled = false;
    fetchPosVariantByBarcode(currentOrganization.id, quickServiceCode)
      .then((match) => {
        if (cancelled || !match) return;
        setQuickServiceDialogDefaultMrp(resolveServiceVariantDefaultMrp(match.variant));
      })
      .catch(() => {
        if (!cancelled) setQuickServiceDialogDefaultMrp(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [showQuickServiceDialog, quickServiceCode, quickServiceProductForAdd, currentOrganization?.id]);

  async function searchAndAddProduct(searchTerm: string) {
    const orgId = currentOrganization?.id;
    if (!orgId) return;

    const trimmedTerm = searchTerm.trim();
    if (!trimmedTerm) return;

    // Reject incomplete numeric barcodes — prefix match used to add wrong SKU mid-type.
    // 1–9 and 2–7 digit service codes (10, 18, 501) are complete; leading-zero EAN prefixes are not.
    if (/^\d+$/.test(trimmedTerm) && !isCompleteNumericBarcodeForPosCart(trimmedTerm)) {
      toast.message("Barcode incomplete", {
        description: `Enter at least ${POS_NUMERIC_BARCODE_MIN_LENGTH} digits or press Enter when done.`,
      });
      return;
    }

    if (shouldSwallowPosRepeatBarcodeScan(trimmedTerm)) {
      setSearchInput("");
      focusBarcodeScanInput();
      return;
    }

    if (posSearchAndAddInFlight.has(trimmedTerm)) {
      setSearchInput("");
      focusBarcodeScanInput();
      return;
    }

    posSearchAndAddInFlight.add(trimmedTerm);

    try {
      const fastBilling = posRuntimeSettingsRef.current?.pos_quick_price_code === true;

      // Fast billing name search (e.g. "Jeans") — dropdown pick only, no silent first-hit add.
      if (posFastBillingUsesDropdownPick(trimmedTerm, fastBilling)) {
        setOpenProductSearch(true);
        setSearchInput(trimmedTerm);
        if (productSearchResults.length === 0) {
          toast.message("Pick a product from the list", {
            description: "Matching products show brand and price — click the row to add.",
          });
        }
        return;
      }

      // Fast-counter price-shorthand: "J300" -> name starting with J at ₹300
      // (sale_price or MRP). Org opt-in (Settings → Sale → POS quick price-code).
      const quickCode = posRuntimeSettingsRef.current?.pos_quick_price_code
        ? parsePosQuickPriceCode(trimmedTerm)
        : null;
      if (quickCode) {
        const codeMatches = await fetchPosQuickPriceCodeMatches(
          orgId,
          quickCode.letters,
          quickCode.price,
          POS_VARIANT_LOOKUP_SELECT,
        );
        if (codeMatches.length > 0) {
          const distinctProducts = new Map<string, { product: PosProductRow; variant: PosVariantRow }>();
          for (const m of codeMatches) {
            const product = m.product as PosProductRow;
            const variant = m.variant as PosVariantRow;
            const existing = distinctProducts.get(product.id);
            if (!existing || (Number(variant.stock_qty) || 0) > (Number(existing.variant.stock_qty) || 0)) {
              distinctProducts.set(product.id, { product, variant });
            }
          }
          const choices = Array.from(distinctProducts.values());
          if (choices.length === 1) {
            setSearchInput("");
            const override = resolvePosQuickPriceCartOverride(
              choices[0].product,
              choices[0].variant,
              quickCode.price,
            );
            await addItemToCart(choices[0].product, choices[0].variant, override, "barcode");
            recordPosBarcodeScanSuccess(trimmedTerm);
            return;
          }
          // Ambiguous — more than one product starts with these letters at this price.
          setProductSearchResults(
            choices.map((c) => ({
              product: c.product,
              variant: c.variant,
              quickPriceOverride: resolvePosQuickPriceCartOverride(
                c.product,
                c.variant,
                quickCode.price,
              ),
            })),
          );
          setOpenProductSearch(true);
          setSearchInput(trimmedTerm);
          toast.message("Multiple products match this code", {
            description: `Pick which "${quickCode.letters.toUpperCase()}" product you mean.`,
          });
          return;
        }
        playErrorBeep();
        toast.error("Product not found", {
          description: `No product starting with "${quickCode.letters.toUpperCase()}" at ₹${quickCode.price}. Check the name's first letters and the sale price or MRP.`,
        });
        setSearchInput("");
        focusBarcodeScanInput();
        return;
      }

      // Quick service shortcodes (1-9): open dialog only when no real product has this barcode
      if (/^[1-9]$/.test(trimmedTerm)) {
        const shortMatch = await fetchPosVariantByBarcode(orgId, trimmedTerm, mobileERP);
        if (!shortMatch) {
          setQuickServiceCode(trimmedTerm);
          setShowQuickServiceDialog(true);
          setSearchInput("");
          return;
        }
        setSearchInput("");
        await addItemToCart(shortMatch.product, shortMatch.variant, undefined, 'barcode');
        recordPosBarcodeScanSuccess(trimmedTerm);
        return;
      }

      // Lookup barcode first. Non-serialized accessories (shared EAN) must add/merge
      // even when org IMEI min-length would reject a 13-digit retail code.
      // Branded EANs may exist at multiple MRP tiers — ask the cashier to pick.
      let exactBarcodeMatches = await resolvePosBarcodeLookupMatches(orgId, trimmedTerm);
      if (exactBarcodeMatches.length > 1) {
        const seen = new Set<string>();
        exactBarcodeMatches = exactBarcodeMatches.filter((m) => {
          if (seen.has(m.variant.id)) return false;
          seen.add(m.variant.id);
          return true;
        });
      }
      let barcodeMatch:
        | { product: PosProductRow; variant: PosVariantRow; remappedLiveBarcode?: string }
        | null = null;

      if (exactBarcodeMatches.length > 1) {
        const picker = resolveBarcodeScanPicker(exactBarcodeMatches, (m) =>
          Number(m.variant.stock_qty || 0) > 0 ||
          !isStockTrackedPosProduct(m.product) ||
          productRequiresImei(m.product, mobileERP),
        );
        if (picker.showMrpDialog) {
          setMrpTierPicker({ barcode: trimmedTerm, choices: picker.mrpDialogChoices });
          setSearchInput("");
          setOpenProductSearch(false);
          return;
        }
        if (picker.showProductPicker) {
          setProductSearchResults(
            picker.productPickerChoices.map((m) => {
              const p = m.product;
              const v = m.variant;
              const tier = posVariantDisplayMrp(v, p);
              return {
                product: p,
                variant: v,
                searchText: `${p.product_name} ${v.size} ${v.barcode} ${tier}`,
                matchLabels: ["Barcode", tier > 0 ? `₹${tier}` : "Price"].filter(Boolean),
              };
            }),
          );
          setOpenProductSearch(true);
          setSearchInput(trimmedTerm);
          toast.message("Multiple products share this barcode", {
            description: "Pick the correct product from the list.",
          });
          return;
        }
        barcodeMatch = picker.autoPick;
      } else if (exactBarcodeMatches.length === 1) {
        barcodeMatch = exactBarcodeMatches[0];
      } else {
        barcodeMatch = await fetchPosVariantByBarcode(orgId, trimmedTerm, mobileERP);
      }

      if (barcodeMatch) {
        const prod = barcodeMatch.product;
        const dbVariant = barcodeMatch.variant;
        const stockQty = dbVariant.stock_qty || 0;
        const needsImei = productRequiresImei(prod, mobileERP);

        if (needsImei) {
          if (!validateIMEI(trimmedTerm, mobileERP.imei_min_length, mobileERP.imei_max_length)) {
            toast.error("Invalid IMEI", { description: `Please scan a valid barcode (${mobileERP.imei_min_length}-${mobileERP.imei_max_length} characters)` });
            setSearchInput("");
            focusBarcodeScanInput();
            return;
          }
          const universalWarning = getUniversalCodeScanWarning(trimmedTerm);
          if (universalWarning) {
            toast.warning("Possible wrong barcode", { description: universalWarning });
          }
        }

        setSearchInput("");
        setProductSearchResults([]);
        setOpenProductSearch(false);
        if (barcodeMatch.remappedLiveBarcode) {
          toast.info("Matched purchase barcode", {
            description: `Label ${trimmedTerm} → live SKU ${barcodeMatch.remappedLiveBarcode} (${prod.product_name})`,
          });
        }
        // Serialized units are unique pieces — a zero-stock IMEI is already sold.
        if (stockQty > 0 || (!isStockTrackedPosProduct(prod) && !needsImei)) {
          // Same barcode again → addItemToCart merges qty (+1), not a duplicate line.
          await addItemToCart(prod, dbVariant, undefined, 'barcode');
          recordPosBarcodeScanSuccess(trimmedTerm);
          return;
        }

        openStockIssueDialog(
          buildInsufficientStockIssue(prod.product_name, dbVariant.size, 1, stockQty),
          { productId: prod.id, productName: prod.product_name },
        );
        return;
      }

      // No variant match — Mobile ERP IMEI format gate before name / legacy fallback
      if (mobileERP.enabled && mobileERP.imei_scan_enforcement) {
        if (!validateIMEI(trimmedTerm, mobileERP.imei_min_length, mobileERP.imei_max_length)) {
          toast.error("Invalid IMEI", { description: `Please scan a valid barcode (${mobileERP.imei_min_length}-${mobileERP.imei_max_length} characters)` });
          setSearchInput("");
          focusBarcodeScanInput();
          return;
        }
        const universalWarning = getUniversalCodeScanWarning(trimmedTerm);
        if (universalWarning) {
          toast.warning("Possible wrong barcode", { description: universalWarning });
        }
      }

      // Try product name search via DB if not IMEI mode (standard orgs — fast billing uses dropdown).
      // Never treat pure numeric input as a name — that path is barcode-only.
      if (
        !isPosPureNumericSearchTerm(trimmedTerm) &&
        !(mobileERP.enabled && mobileERP.imei_scan_enforcement) &&
        !posRuntimeSettingsRef.current?.pos_quick_price_code
      ) {
        const { data: nameResults, error: nameError } = await supabase
          .from('product_variants')
          .select(POS_VARIANT_LOOKUP_SELECT)
          .eq('organization_id', orgId)
          .eq('products.organization_id', orgId)
          .ilike('products.product_name', `%${trimmedTerm}%`)
          .is('deleted_at', null)
          .is('products.deleted_at', null)
          .eq('products.status', 'active')
          .gt('stock_qty', 0)
          .limit(1);

        if (nameError) throw nameError;

        if (nameResults && nameResults.length > 0) {
          const match = nameResults[0] as any;
          const prod = match.products;
          setSearchInput("");
          await addItemToCart(prod, match, undefined, 'manual');
          return;
        }

        const unavailableMatch = await fetchUnavailablePosVariantByProductName(
          orgId,
          trimmedTerm,
          selectedProductType,
        );
        if (unavailableMatch) {
          setSearchInput("");
          openStockIssueDialog(
            buildInsufficientStockIssue(
              unavailableMatch.product.product_name,
              unavailableMatch.variant.size,
              1,
              Number(unavailableMatch.variant.stock_qty || 0),
            ),
            { productId: unavailableMatch.product.id, productName: unavailableMatch.product.product_name },
          );
          return;
        }
      }

      // Fallback: search purchase_items for IMEI barcode (for legacy IMEI purchases).
      // Scope to current org via purchase_bills — purchase_items has no organization_id column.
      if (mobileERP.enabled) {
        const { data: purchaseItem, error: purchaseError } = await supabase
          .from('purchase_items')
          .select('sku_id, barcode, product_name, size, purchase_bills!inner(organization_id)')
          .eq('purchase_bills.organization_id', orgId)
          .is('purchase_bills.deleted_at', null)
          .eq('barcode', trimmedTerm)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle();

        if (purchaseError) throw purchaseError;

        if (purchaseItem?.sku_id) {
          // Same products.status gate as fetchPosVariantByBarcode — legacy IMEI→sku
          // must not re-open deactivated masters that still have units on hand.
          // Do not gate product_variants.active here (semantics held).
          const { data: variant, error: variantError } = await supabase
            .from('product_variants')
            .select(POS_VARIANT_LOOKUP_SELECT)
            .eq('id', purchaseItem.sku_id)
            .eq('organization_id', orgId)
            .eq('products.organization_id', orgId)
            .eq('products.status', 'active')
            .is('deleted_at', null)
            .is('products.deleted_at', null)
            .maybeSingle();

          if (variantError) throw variantError;

          const typedVariant = variant as unknown as PosVariantRow & { products?: PosProductRow };
          if (typedVariant?.products) {
            const prod = typedVariant.products;
            setSearchInput("");
            const variantWithIMEI = { ...typedVariant, barcode: trimmedTerm };
            const stockQty = Number(typedVariant.stock_qty || 0);
            if (isStockTrackedPosProduct(prod) && stockQty <= 0) {
              openStockIssueDialog(
                buildInsufficientStockIssue(prod.product_name, typedVariant.size, 1, stockQty),
                { productId: prod.id, productName: prod.product_name },
              );
              return;
            }
            await addItemToCart(prod, variantWithIMEI, undefined, 'barcode');
            recordPosBarcodeScanSuccess(trimmedTerm);
            return;
          }
        }
      }

      setSearchInput("");
      setProductSearchResults([]);
      playErrorBeep();
      toast.error("Product not found", {
        description: `No active product for barcode ${trimmedTerm}. Check service barcode on product master.`,
      });
      focusBarcodeScanInput();
    } catch (error: any) {
      console.error('POS scan/search failed:', error);
      toast.error('Lookup failed', { description: error.message || 'Could not search products. Try again.' });
      focusBarcodeScanInput();
    } finally {
      posSearchAndAddInFlight.delete(trimmedTerm);
      setIsProductSearchLoading(false);
    }
  }

  const handleQuickServiceAdd = useCallback(async ({
    code,
    quantity,
    mrp,
    discountAmount,
    description,
  }: {
    code: string;
    quantity: number;
    mrp: number;
    discountAmount?: number;
    description?: string;
  }) => {
    const closeDialog = () => {
      setShowQuickServiceDialog(false);
      setQuickServiceCode("");
      setQuickServiceProductForAdd(null);
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    };

    const applyDiscRsToServiceItem = (item: CartItem, discRs?: number): CartItem => {
      if (!discRs || discRs <= 0) return item;
      const baseAmount = item.mrp * item.quantity;
      const mappedPercent = baseAmount > 0 ? Math.min(100, (discRs / baseAmount) * 100) : 0;
      const withDisc = {
        ...item,
        discountPercent: Number(mappedPercent.toFixed(4)),
        discountAmount: 0,
        rateAuthority: "discount" as const,
      };
      const withGst = applyPosGarmentGstToItem(withDisc, garmentGstSettings);
      return { ...withGst, netAmount: calculatePosCartLineNet(withGst) };
    };

    const finishQuickServiceAdd = (newItem: CartItem, lineDiscountRs?: number) => {
      const itemToAdd = applyDiscRsToServiceItem(newItem, lineDiscountRs);
      const existingIndex = findPosServiceMergeIndex(itemsRef.current, {
        barcode: itemToAdd.barcode,
        variantId: itemToAdd.variantId,
        mrp: itemToAdd.mrp,
        unitCost: itemToAdd.unitCost,
      });

      if (existingIndex >= 0) {
        const mergedLineId = itemsRef.current[existingIndex]?.id;
        setItems((prev) => {
          const updated = [...prev];
          const merged = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + itemToAdd.quantity,
          };
          updated[existingIndex] = applyDiscRsToServiceItem(merged, lineDiscountRs);
          return updated;
        });
        if (mergedLineId) bumpCartHighlight(mergedLineId);
      } else {
        setItems((prev) => [...prev, itemToAdd]);
        bumpCartHighlight(itemToAdd.id);
      }

      playSuccessBeep();
      closeDialog();
    };

    // Pre-identified product (barcode scan service, or goods qty dialog from dropdown)
    if (quickServiceProductForAdd) {
      const { product, variant } = quickServiceProductForAdd;
      if (blockSettlementLockedVariant(variant, product.product_name || "Product", variant.barcode || code)) {
        return;
      }

      const isServiceProduct = product.product_type === "service";

      if (!isServiceProduct) {
        const barcode = variant.barcode || "";
        const beforeIdx = itemsRef.current.findIndex((item) => item.barcode === barcode);
        const beforeQty = beforeIdx >= 0 ? itemsRef.current[beforeIdx].quantity : 0;
        const targetQty = beforeQty > 0 ? beforeQty + quantity : quantity;

        const stockCheck = await checkStock(variant.id, targetQty);
        if (!stockCheck.isAvailable) {
          openStockIssueDialog(
            buildInsufficientStockIssue(stockCheck.productName, stockCheck.size, targetQty, stockCheck.availableStock),
            stockCheck.availableStock <= 0 ? { productId: product.id, productName: stockCheck.productName } : undefined,
          );
          return;
        }

        const masterSalePrice = parseFloat(String(variant.sale_price || 0)) || 0;
        const rawMrp = variant.mrp ? parseFloat(String(variant.mrp)) : 0;
        const masterMrp = rawMrp > 0 ? rawMrp : masterSalePrice;
        const defaultPrice = resolveGoodsQtyDialogDefaultPrice(variant, grossBasis);
        const overridePrice =
          Math.abs(mrp - defaultPrice) > 0.01
            ? { sale_price: mrp, mrp: Math.max(masterMrp, mrp) }
            : undefined;

        const brandDiscount = getBrandDiscountForProduct(product.brand, product.product_name);
        hasManuallyAddedNewItemRef.current = true;
        const addResult = billingAddLine({
          product,
          variant,
          overridePrice,
          brandDiscountPercent: brandDiscount,
        });

        const lineIdx = itemsRef.current.findIndex((item) => item.barcode === barcode);
        if (lineIdx < 0) {
          playErrorBeep();
          return;
        }

        if (itemsRef.current[lineIdx].quantity !== targetQty) {
          billingUpdateQty(lineIdx, targetQty);
        }

        if (discountAmount && discountAmount > 0) {
          billingUpdateDiscountAmount(lineIdx, discountAmount);
        }

        const highlightId = addResult.mergedItemId || addResult.addedItemId;
        if (highlightId) bumpCartHighlight(highlightId);
        playSuccessBeep();
        closeDialog();
        setOpenProductSearch(false);
        setSearchInput("");
        focusBarcodeScanInput();
        return;
      }

      const baseServiceGst = product.sale_gst_percent || product.gst_per || 0;
      const newItem: CartItem = {
        id: `service-${variant.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        barcode: variant.barcode || code,
        productName: product.product_name,
        baseProductName: product.product_name,
        size: variant.size || '-',
        color: variant.color || product.color || '',
        quantity,
        mrp,
        originalMrp: null,
        purchaseGstPer: product.purchase_gst_percent ?? product.gst_per ?? baseServiceGst,
        gstPer: baseServiceGst,
        discountPercent: 0,
        discountAmount: 0,
        unitCost: mrp,
        netAmount: quantity * mrp,
        productId: product.id,
        variantId: variant.id,
        hsnCode: product.hsn_code || '',
        productType: 'service',
        itemNotes: description || null,
      };
      finishQuickServiceAdd(newItem, discountAmount);
      return;
    }

    // Existing shortcode logic (1-9) — find product by barcode
    let productName = `Service Item ${code}`;
    let productId = '';
    let variantId = '';
    let matchedServiceGst = 0;
    if (currentOrganization?.id) {
      try {
        const match = await fetchPosVariantByBarcode(currentOrganization.id, code);
        if (match) {
          productName = match.product.product_name as string;
          productId = match.product.id as string;
          variantId = match.variant.id as string;
          matchedServiceGst = Number(match.product.sale_gst_percent || match.product.gst_per || 0);
        }
      } catch (error) {
        console.error('Quick service lookup failed:', error);
        toast.error('Lookup failed', { description: 'Could not resolve service product. Try again.' });
        return;
      }
    }

    // If no matching product found, we cannot save to sale_items (product_id/variant_id are required UUID columns)
    if (!productId || !variantId) {
      playErrorBeep();
      setShowQuickServiceDialog(false);
      setQuickServiceCode("");
      return;
    }

    if (blockSettlementLockedVariant({ id: variantId }, productName, code)) {
      return;
    }

    const newItem: CartItem = {
      id: `service-${code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      barcode: code,
      productName,
      size: '-',
      color: '',
      quantity,
      mrp,
      originalMrp: null,
      purchaseGstPer: matchedServiceGst,
      gstPer: matchedServiceGst,
      discountPercent: 0,
      discountAmount: 0,
      unitCost: mrp,
      netAmount: quantity * mrp,
      productId,
      variantId,
      hsnCode: '',
      productType: 'service',
      itemNotes: description || null,
    };
    finishQuickServiceAdd(newItem, discountAmount);
  }, [
    setItems,
    playSuccessBeep,
    playErrorBeep,
    currentOrganization?.id,
    toast,
    quickServiceProductForAdd,
    bumpCartHighlight,
    garmentGstSettings,
    blockSettlementLockedVariant,
    billingAddLine,
    billingUpdateQty,
    billingUpdateDiscountAmount,
    grossBasis,
    getBrandDiscountForProduct,
    checkStock,
    openStockIssueDialog,
    buildInsufficientStockIssue,
    focusBarcodeScanInput,
  ]);

  const addItemToCart = async (
    product: any,
    variant: any,
    overridePrice?: { sale_price: number; mrp: number },
    addSource: 'manual' | 'barcode' = 'manual'
  ) => {
    // Block variants currently in an open Stock Settlement session
    if (blockSettlementLockedVariant(variant, product.product_name || product.name || "Product", variant.barcode || "")) {
      return;
    }

    // Service products: merge same barcode + price into one line; different MRP stays separate (saree pieces).
    const isServiceProduct = product.product_type === 'service';

    // Regular goods from search dropdown: optional qty/discount dialog (Trendzo opt-in).
    if (
      !isServiceProduct &&
      addSource === "manual" &&
      isPosGoodsAskQtyDialogEnabled((settingsData as any)?.sale_settings) &&
      !overridePrice
    ) {
      setQuickServiceCode(variant.barcode || product.product_name);
      setQuickServiceProductForAdd({ product, variant });
      setQuickServiceDialogDefaultMrp(resolveGoodsQtyDialogDefaultPrice(variant, grossBasis));
      setShowQuickServiceDialog(true);
      setSearchInput("");
      setOpenProductSearch(false);
      return;
    }

    // Service products: ask for actual price before adding — unless the org turned
    // the quick-entry dialog OFF (Settings → Product), in which case we add the item
    // straight to the cart using the price already defined at product entry.
    if (isServiceProduct && !overridePrice) {
      const serviceQuickEntryEnabled =
        (settingsData as any)?.product_settings?.service_quick_entry_dialog !== false;
      const svcSalePrice = parseFloat(variant.sale_price || 0) || 0;
      const svcMrp = resolveServiceVariantDefaultMrp(variant);
      const hasPredefinedPrice = svcMrp > 0 || svcSalePrice > 0;

      // Default behaviour, or fall back to the dialog when no price was defined.
      if (serviceQuickEntryEnabled || !hasPredefinedPrice) {
        setQuickServiceCode(variant.barcode || product.product_name);
        setQuickServiceProductForAdd({ product, variant });
        setShowQuickServiceDialog(true);
        setSearchInput("");
        return;
      }

      // Dialog disabled + price predefined → add directly using the master price.
      setSearchInput("");
      await addItemToCart(
        product,
        variant,
        { sale_price: svcSalePrice || svcMrp, mrp: svcMrp || svcSalePrice },
        addSource,
      );
      return;
    }
    
    let existingItemIndex = -1;
    if (isServiceProduct && overridePrice) {
      const svcMrp = overridePrice.mrp || overridePrice.sale_price;
      const svcUnit = overridePrice.sale_price || svcMrp;
      existingItemIndex = findPosServiceMergeIndex(itemsRef.current, {
        barcode: variant.barcode || '',
        variantId: variant.id,
        mrp: svcMrp,
        unitCost: svcUnit,
      });
    } else if (!isServiceProduct) {
      existingItemIndex = itemsRef.current.findIndex((item) => item.barcode === variant.barcode);
    }

    if (existingItemIndex >= 0) {
      // Real-time stock validation before incrementing (skip for service — unlimited virtual stock)
      const newQty = itemsRef.current[existingItemIndex].quantity + 1;
      if (!isServiceProduct) {
        const stockCheck = await checkStock(variant.id, newQty);

        if (!stockCheck.isAvailable) {
          openStockIssueDialog(
            buildInsufficientStockIssue(stockCheck.productName, stockCheck.size, newQty, stockCheck.availableStock),
            stockCheck.availableStock <= 0 ? { productId: product.id, productName: stockCheck.productName } : undefined,
          );
          setSearchInput("");
          return;
        }
      }

      // Play success beep for quantity increment
      playSuccessBeep();

      const mergedLineId = itemsRef.current[existingItemIndex]?.id;

      // Increment quantity if already in cart — via billing engine
      billingUpdateQty(existingItemIndex, newQty);
      if (mergedLineId) bumpCartHighlight(mergedLineId);
    } else {
      // Real-time stock validation before adding new item (skip for service)
      if (!isServiceProduct) {
        const stockCheck = await checkStock(variant.id, 1);

        if (!stockCheck.isAvailable) {
          openStockIssueDialog(
            buildInsufficientStockIssue(stockCheck.productName, stockCheck.size, 1, stockCheck.availableStock),
            stockCheck.availableStock <= 0 ? { productId: product.id, productName: stockCheck.productName } : undefined,
          );
          setSearchInput("");
          return;
        }
      }
      
      // Check if last_purchase prices differ from master prices
      const masterSalePrice = parseFloat(variant.sale_price || 0);
      // Use sale_price as MRP fallback when MRP is 0 or null
      const rawMrp = variant.mrp ? parseFloat(variant.mrp) : 0;
      const masterMrp = rawMrp > 0 ? rawMrp : masterSalePrice;
      const lastPurchaseSalePrice = variant.last_purchase_sale_price ? parseFloat(variant.last_purchase_sale_price) : null;
      const lastPurchaseMrp = variant.last_purchase_mrp ? parseFloat(variant.last_purchase_mrp) : null;

      const scanPriceSource = resolveSaleScanPriceSource({
        orgSlug: currentOrganization?.slug,
        askPriceOnScan: (settingsData as any)?.sale_settings?.ask_price_on_scan ?? true,
        autoUseLastPurchasePrice: (settingsData as any)?.sale_settings?.auto_use_last_purchase_price,
      });
      if (
        !overridePrice &&
        shouldApplyLastPurchaseScanOverride({
          scanPriceSource,
          posUsesMrpAsPrice: grossBasis === "mrp",
        })
      ) {
        const picked = pickLastPurchaseScanPrice({
          masterSalePrice,
          masterMrp,
          lastPurchaseSalePrice,
          lastPurchaseMrp,
        });
        if (picked) {
          overridePrice = picked;
        }
      }
      
      // If no override provided and last purchase prices differ, show dialog (unless disabled in settings)
      const askPriceOnScan = scanPriceSource === "ask";
      if (
        shouldPromptPosPriceSelection({
          askPriceOnScan,
          hasOverridePrice: !!overridePrice,
          posUsesMrpAsPrice: grossBasis === "mrp",
          masterSalePrice,
          masterMrp,
          lastPurchaseSalePrice,
          lastPurchaseMrp,
        })
      ) {
        setPendingPriceSelection({
          product,
          variant,
          masterPrice: {
            sale_price: masterSalePrice,
            mrp: masterMrp,
            date: variant.updated_at ? new Date(variant.updated_at) : undefined,
          },
          lastPurchasePrice: { 
            sale_price: lastPurchaseSalePrice, 
            mrp: lastPurchaseMrp || lastPurchaseSalePrice,
            date: variant.last_purchase_date ? new Date(variant.last_purchase_date) : undefined
          }
        });
        setShowPriceSelectionDialog(true);
        return;
      }
      
      // Brand-wise always applies when configured (even if customer master Disc % is set).
      // Master is bill-level flat only when there are zero brand-discount rows.
      const brandDiscount = getBrandDiscountForProduct(product.brand, product.product_name);

      hasManuallyAddedNewItemRef.current = true;
      const addResult = billingAddLine({
        product,
        variant,
        overridePrice,
        brandDiscountPercent: brandDiscount,
      });
      const highlightId = addResult.mergedItemId || addResult.addedItemId;
      if (highlightId) bumpCartHighlight(highlightId);

      // Play success beep for new item added
      playSuccessBeep();
      
      // Show toast if brand discount was applied (quirk: may toast even when mrp basis zeros Disc%).
      if (brandDiscount > 0) {
        toast.success(`Brand discount applied: ${brandDiscount}%`, { description: `${product.brand} discount for this customer` });
      }
    }
    
    // Close search dropdown and clear input
    setOpenProductSearch(false);
    setSearchInput("");
    focusBarcodeScanInput();
  };

  const handlePosProductPick = useCallback(
    (product: PosProductRow, variant: PosVariantRow, quickOverride?: { sale_price: number; mrp: number }) => {
      void addItemToCart(product, variant, quickOverride);
    },
    // addItemToCart is stable enough for pick handler; eslint may warn on exhaustive deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Handle price selection from dialog
  const handlePriceSelection = (source: "master" | "last_purchase", prices: { sale_price: number; mrp: number }) => {
    if (pendingPriceSelection) {
      hasManuallyAddedNewItemRef.current = true;
      void addItemToCart(pendingPriceSelection.product, pendingPriceSelection.variant, prices, 'manual');
      setPendingPriceSelection(null);
      setShowPriceSelectionDialog(false);
    }
  };

  // Totals from headless engine (aliases preserve existing POSSales call sites).
  const totals = {
    quantity: billingTotals.quantity,
    mrp: billingTotals.mrp,
    discount: billingTotals.discount,
    subtotal: billingTotals.subtotal,
    savings: billingTotals.savings,
  };
  const flatDiscountAmount = billingTotals.flatDiscountAmount;
  const flatDiscountPercent = billingTotals.flatDiscountPercent;
  const flatDiscountCapped = billingTotals.flatDiscountCapped;
  const maxFlatDiscountForGross = billingTotals.maxFlatDiscountForGross;
  const amountBeforeRoundOff = billingTotals.amountBeforeRoundOff;
  const calculatedRoundOff = billingTotals.calculatedRoundOff;
  const pointsRedemptionValue = billingTotals.pointsRedemptionValue;
  const finalAmount = billingTotals.finalAmount;
  const amountBeforeCredit = billingTotals.amountBeforeCredit;
  const posGst = {
    taxableSubtotal: billingTotals.taxableSubtotal,
    totalGst: billingTotals.totalGst,
  };
  /** Max S/R that keeps bill net ≥ 0 (gross/subtotal after other discounts/credits). */
  const maxSrFromBill = billingMaxSrFromBill;

  const removeItem = (index: number) => {
    billingRemoveLine(index);
    // Keep focus on barcode search bar
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  };

  const updateQuantity = async (index: number, newQty: number) => {
    const item = items[index];
    const clampedQty = clampQty(newQty, item?.uom);
    if (clampedQty < minQtyForUom(item?.uom)) return;

    // Real-time stock validation before updating quantity
    const stockCheck = await checkStock(item.variantId, clampedQty);
    
    if (!stockCheck.isAvailable) {
      openStockIssueDialog(
        buildInsufficientStockIssue(item.productName, item.size, clampedQty, stockCheck.availableStock),
      );
      return;
    }
    
    billingUpdateQty(index, clampedQty);
  };

  const updateDiscountPercent = (index: number, discountPercent: number) => {
    const result = billingUpdateDiscountPercent(index, discountPercent);
    if (result.error?.code === "DISCOUNT_CAP") {
      toast.warning(result.error.message);
    }
  };

  const updateDiscountAmount = (index: number, discountAmount: number) => {
    const result = billingUpdateDiscountAmount(index, discountAmount);
    if (result.error?.code === "DISCOUNT_CAP") {
      toast.warning(result.error.message);
    }
  };

  /** Apply typed unit price. Returns false if rejected (cap / invalid). */
  const applyUnitPriceToCart = (index: number, rawValue: number): boolean => {
    const result = billingUpdatePrice(index, rawValue);
    if (result.error) {
      toast.warning(result.error.message);
      return false;
    }
    return true;
  };

  const requestUnitPriceCommit = (index: number, rawValue: number) => {
    if (!canEditPosUnitPrice) return;
    if (index < 0 || index >= items.length) return;
    if (!Number.isFinite(rawValue) || rawValue < 0) {
      setUnitPriceDraft(null);
      return;
    }
    const mrp = Number(items[index].mrp) || 0;
    const unitCost = Math.max(0, rawValue);
    // Above-MRP rate raises MRP in the mutator — no cap check needed for that direction.
    const raisesMrp = mrp > 0 ? unitCost > mrp + 0.005 : true;
    const minUnit = minUnitPriceForDiscountCap(items, index, flatDiscountAmount);
    if (!raisesMrp && unitCost + 0.005 < minUnit) {
      toast.warning(
        `Minimum ₹${minUnit.toLocaleString("en-IN", { maximumFractionDigits: 2 })} on this line.`,
      );
      // Keep draft so cashier can correct; do not snap cart.
      return;
    }
    const rupeesOff = Math.max(0, (mrp - unitCost) * (Number(items[index].quantity) || 0));
    const pctOff = mrp > 0.005 ? ((mrp - unitCost) / mrp) * 100 : 0;
    if (!raisesMrp && mrp > 0.005 && pctOff > posUnitPriceOverrideConfirmPct + 0.001) {
      setUnitPriceConfirm({
        index,
        value: unitCost,
        mrp,
        pctOff,
        rupeesOff,
      });
      return;
    }
    if (applyUnitPriceToCart(index, unitCost)) {
      setUnitPriceDraft(null);
    }
  };

  const updateMrp = (index: number, newMrp: number) => {
    const result = billingUpdateMrp(index, newMrp);
    if (result.error) {
      toast.warning(result.error.message);
    }
  };

  const updateGstPer = (index: number, newGstPer: number) => {
    billingUpdateGstPer(index, newGstPer);
  };

  const availableSrCredit = pendingSaleReturnCredits.reduce(
    (s, sr) => s + (Number(sr.net_amount) || 0),
    0,
  );
  // Same-bill exchange: allow S/R above bill (excess → Mix refund/CN).
  // Also treat live S/R > bill as exchange so we don't wipe credit after a line delete
  // when sameBillReturnGross was not set (manual entry / restored cart).
  const isSameBillExchangeSr =
    sameBillReturnGross > 0.005 || saleReturnAdjust > maxSrFromBill + 0.005;
  const maxSrAllowed = isSameBillExchangeSr
    ? Math.max(
        Math.round(Math.max(sameBillReturnGross, saleReturnAdjust) * 100) / 100,
        Math.round(availableSrCredit * 100) / 100,
      )
    : availableSrCredit > 0.005
      ? Math.min(maxSrFromBill, Math.round(availableSrCredit * 100) / 100)
      : maxSrFromBill;

  const exchangeSrApplied = Math.min(
    Math.max(0, saleReturnAdjust),
    Math.max(0, maxSrFromBill),
  );
  const exchangeRefundDue = Math.max(0, Math.round((saleReturnAdjust - exchangeSrApplied) * 100) / 100);
  /** Mix dialog bill: negative refund amount when exchange excess exists (even if net is 0). */
  const posTenderDue = posTenderDueAfterAdvance(finalAmount, advanceApplied);
  const mixDialogBillAmount =
    finalAmount < -0.005 || exchangeRefundDue > 0.005
      ? -Math.max(Math.abs(Math.min(0, finalAmount)), exchangeRefundDue)
      : posTenderDue;

  useEffect(() => {
    if (exchangeRefundDue > 0.005 && advanceApplied > 0) {
      setAdvanceApplied(0);
    }
  }, [exchangeRefundDue, advanceApplied]);

  const clampSaleReturnAdjust = (requested: number, opts?: { silent?: boolean }) => {
    const raw = Math.max(0, Math.round((Number(requested) || 0) * 100) / 100);
    const capped = Math.min(raw, maxSrAllowed);
    if (!opts?.silent && raw > capped + 0.01) {
      toast.warning(
        isSameBillExchangeSr
          ? `Only ₹${maxSrAllowed.toLocaleString("en-IN", { maximumFractionDigits: 2 })} return credit is available`
          : `Only ₹${maxSrAllowed.toLocaleString("en-IN", { maximumFractionDigits: 2 })} of credit can be applied to this bill`,
      );
    }
    setSaleReturnAdjust(capped);
    return capped;
  };

  const handleSaleReturnSavedToBill = (
    amount: number,
    returnNumber: string,
    refundType: string,
  ) => {
    const raw = Math.max(0, Math.round((Number(amount) || 0) * 100) / 100);
    // Same-bill exchange / CN-from-return: keep full return on the S/R field so
    // finalAmount can go negative and Mix Payment offers refund vs credit note.
    if (refundType === "exchange" || refundType === "credit_note") {
      setSameBillReturnGross(raw);
      setSaleReturnAdjust(raw);
      const applied = Math.min(raw, maxSrFromBill);
      const refundDue = Math.max(0, Math.round((raw - applied) * 100) / 100);
      toast.success(refundType === "exchange" ? "Exchange Applied" : "Credit Note Created", {
        description:
          refundDue > 0.01
            ? `${returnNumber} — Return ₹${Math.round(raw)} · Applied ₹${Math.round(applied)} · Refund due ₹${Math.round(refundDue)}. Open Mix Payment (F6) to refund cash or issue C/Note.`
            : `${returnNumber} — ₹${Math.round(amount)} ${refundType === "exchange" ? "deducted from new bill" : "credit note issued"}`,
      });
      return;
    }
    // Pre-existing / cash-adjust path: keep bill-only cap (excess for a future bill).
    const applyAmount = () => {
      const capped = Math.min(raw, maxSrFromBill);
      if (raw > capped + 0.01) {
        toast.warning(
          `Only ₹${maxSrFromBill.toLocaleString("en-IN", { maximumFractionDigits: 2 })} of credit can be applied to this bill`,
        );
      }
      setSaleReturnAdjust(capped);
      const leftover = Math.max(0, Math.round((raw - capped) * 100) / 100);
      return { capped, leftover };
    };
    if (items.length > 0) {
      const { capped, leftover } = applyAmount();
      toast.success("Cash Refund Adjusted", {
        description:
          leftover > 0.01
            ? `${returnNumber} — ₹${Math.round(capped)} on this bill; ₹${Math.round(leftover)} remains. Save to finalize.`
            : `${returnNumber} — ₹${Math.round(amount)} adjusted in current bill. Save to finalize.`,
      });
      return;
    }
    toast.success("Cash Refund Processed", {
      description: `${returnNumber} — ₹${Math.round(amount)} cash refunded to customer`,
    });
  };

  // ── WhatsApp invoice PDF capture wiring ──────────────────────────────────
  // When `whatsappPdfSnapshot` is set the off-screen <InvoiceWrapper> mounts
  // with the just-saved sale's props. Once React commits + the logo loads we
  // rasterize that DOM with html2canvas + jsPDF and resolve the pending
  // capture promise. The pending promise was created by `captureWhatsAppPdf`.
  useEffect(() => {
    if (!whatsappPdfSnapshot) return;
    let cancelled = false;
    (async () => {
      try {
        if (!whatsappPdfRef.current) {
          whatsappPdfResolverRef.current?.resolve(null);
          return;
        }
        const waPageFormat =
          posBillFormat === "thermal"
            ? "thermal"
            : posBillFormat === "a5" || posBillFormat === "a5-horizontal"
              ? "a5"
              : "a4";
        const base64 = await captureElementToPdfBase64(whatsappPdfRef.current, {
          extraSettleMs: 700,
          pageFormat: waPageFormat,
          thermalPaper: posThermalPaper,
          wappConnectPdf: true,
        });
        if (cancelled) return;
        whatsappPdfResolverRef.current?.resolve(base64 || null);
      } catch (err) {
        console.error('WhatsApp PDF capture failed:', err);
        whatsappPdfResolverRef.current?.resolve(null);
      } finally {
        whatsappPdfResolverRef.current = null;
        if (!cancelled) setWhatsappPdfSnapshot(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whatsappPdfSnapshot]);

  const captureWhatsAppPdf = useCallback(
    (meta: { saleNumber: string; saleId: string; saleDate: Date }): Promise<string | null> => {
      try {
        const props = {
          format: posInvoiceWrapperFormat,
          template: posInvoiceTemplate,
          billNo: meta.saleNumber,
          date: meta.saleDate,
          customerName,
          customerAddress: customers.find((c) => c.id === customerId)?.address || '',
          customerMobile: customerPhone,
          customerGSTIN: customers.find((c) => c.id === customerId)?.gst_number || '',
          items: items.map((item, index) => ({
            sr: index + 1,
            particulars: item.productName,
            productNameOnly:
              item.baseProductName || item.productName.split("-")[0] || item.productName,
            itemNotes: item.itemNotes || '',
            size: item.size,
            barcode: item.barcode,
            hsn: item.hsnCode || '',
            sp: posLineNetUnitPrice(item),
            mrp: item.originalMrp || item.mrp,
            qty: item.quantity,
            rate: posLineNetUnitPrice(item),
            total: posLineDisplayTotal(item.netAmount, item.gstPer, invoiceTaxType),
            gstPercent: item.gstPer || 0,
            discountPercent: item.discountPercent || 0,
          })),
          subTotal: totals.subtotal,
          discount: totals.discount + flatDiscountAmount,
          saleReturnAdjust,
          grandTotal: finalAmount,
          cashPaid: paymentMethod === 'cash' ? finalAmount : 0,
          upiPaid: paymentMethod === 'upi' ? finalAmount : 0,
          paymentMethod,
          paidAmount: paymentMethod === 'pay_later' ? 0 : finalAmount,
          previousBalance: customerBalance || 0,
          roundOff,
          salesman: selectedSalesman || '',
          taxType: invoiceTaxType,
          financerDetails,
          notes: saleNotes,
          showMRP: enableMrp,
          showYouSaved: enableMrp ? undefined : false,
        };
        return new Promise<string | null>((resolve) => {
          whatsappPdfResolverRef.current = { resolve };
          setWhatsappPdfSnapshot(props);
          // Safety: never block save flow more than 15s on PDF capture.
          setTimeout(() => {
            if (whatsappPdfResolverRef.current) {
              whatsappPdfResolverRef.current.resolve(null);
              whatsappPdfResolverRef.current = null;
            }
          }, 15000);
        });
      } catch (err) {
        console.error('captureWhatsAppPdf failed to snapshot props:', err);
        return Promise.resolve(null);
      }
    },
    [
      posInvoiceTemplate,
      posInvoiceWrapperFormat,
      posBillFormat,
      customerName,
      customers,
      customerId,
      customerPhone,
      items,
      invoiceTaxType,
      totals,
      flatDiscountAmount,
      saleReturnAdjust,
      finalAmount,
      paymentMethod,
      customerBalance,
      roundOff,
      selectedSalesman,
      financerDetails,
      saleNotes,
      enableMrp,
    ],
  );

  const buildPosRuntimeOpts = useCallback((): SaveSaleRuntimeOptions => ({
    ...POS_DEFERRED_INVALIDATION_OPTS,
    capturePdfBase64: captureWhatsAppPdf,
  }), [captureWhatsAppPdf]);

  const paymentModeLabel =
    paymentMethod === 'pay_later'
      ? 'Credit'
      : paymentMethod === 'upi'
        ? 'UPI'
        : paymentMethod === 'card'
          ? 'Card'
          : paymentMethod === 'multiple'
            ? 'Mix'
            : 'Cash';
  
  // Discount display should represent total discount (item-wise + flat), not SR/round/credit adjustments.
  const totalDiscountDisplay = totals.discount + flatDiscountAmount;
  const effectiveDiscountPercent = totals.mrp > 0 ? (totalDiscountDisplay / totals.mrp) * 100 : 0;

  // Handle Estimate Print (no save, cart stays intact)
  const handleEstimatePrint = useCallback(async () => {
    if (items.length === 0) return;
    if (!currentOrganization?.id) {
      toast.error("Organization not loaded");
      return;
    }

    let estimateNumber = "ESTIMATE";
    try {
      estimateNumber = await generateOrgEstimateNumber(currentOrganization.id);
    } catch (err) {
      console.error("Estimate number allocation failed:", err);
      toast.error("Could not assign estimate number", {
        description: err instanceof Error ? err.message : "Please try again",
      });
      return;
    }
    
    const estimateData = {
      invoiceNumber: estimateNumber,
      saleId: null,
      items: items,
      totals: totals,
      flatDiscountAmount: flatDiscountAmount,
      saleReturnAdjust: saleReturnAdjust,
      finalAmount: finalAmount,
      method: 'estimate',
      customerName: customerName || "Walk-in Customer",
      customerPhone: customerPhone,
      customerId: customerId,
      roundOff: roundOff,
      creditApplied: creditApplied,
      notes: saleNotes || null,
      paidAmount: 0,
      previousBalance: customerBalance || 0,
      isEstimate: true,
      taxType,
    };
    
    // flushSync: print portal must commit snapshot before waitForPrintReady polls DOM
    flushSync(() => setSavedInvoiceData(estimateData));
    
    // Wait for invoice to render, then directly open print dialog (no preview)
    const waitForContent = () => {
      const el = invoicePrintRef.current;
      if (!el) return false;
      const text = (el.textContent || '').trim();
      if (!text || text.length < 30) return false;
      if (/^loading\.?\.?\.?$/i.test(text) || /loading preview/i.test(text)) return false;
      return true;
    };

    const startedAt = Date.now();
    const pollInterval = setInterval(async () => {
      if (waitForContent() || Date.now() - startedAt > 5000) {
        clearInterval(pollInterval);
        if (isDirectPrintEnabled) {
          const paperSize = resolvePosDirectPrintPaper(
            posBillFormat,
            (settingsData as any)?.bill_barcode_settings?.direct_print_pos_paper,
          );
          await directPrint(invoicePrintRef.current, {
            context: 'pos',
            paperSize,
            onFallback: () => {
              handlePrintRef.current?.();
            },
            onSuccess: () => {
              setSavedInvoiceData(null);
              setTimeout(() => barcodeInputRef.current?.focus(), 100);
            },
          });
        } else {
          // Directly trigger browser print dialog without showing preview
          handlePrintRef.current?.();
        }
      }
    }, 150);
  }, [items, totals, flatDiscountAmount, saleReturnAdjust, finalAmount, customerName, customerPhone, customerId, roundOff, creditApplied, saleNotes, customerBalance, isDirectPrintEnabled, posBillFormat, directPrint, currentOrganization?.id, taxType]);

  // Register estimate print in POS header and ref for keyboard shortcut
  useEffect(() => {
    handleEstimatePrintRef.current = handleEstimatePrint;
    setOnEstimatePrint(() => handleEstimatePrint);
    return () => { setOnEstimatePrint(null); };
  }, [setOnEstimatePrint, handleEstimatePrint]);
  const handleApplyCredit = (amount: number) => {
    if (!customerId) {
      toast.error("Customer Required", { description: "Please select a customer to apply credit" });
      return;
    }
    
    const maxApplicable = Math.min(amount, availableCreditBalance, amountBeforeCredit);
    if (maxApplicable <= 0) {
      toast.error("Cannot Apply Credit", { description: "No credit available or bill amount is too low" });
      return;
    }
    setCreditApplied(maxApplicable);
  };

  const handleApplyAdvance = (amount: number) => {
    if (amount <= 0) {
      setAdvanceApplied(0);
      return;
    }
    const block = posAdvanceApplyBlockReason({
      customerId,
      availableAdvanceBalance,
      billRoom: Math.max(0, finalAmount),
      openingBalanceRemaining,
      exchangeRefundDue,
    });
    if (block) {
      toast.error("Cannot Apply Advance", { description: posAdvanceApplyBlockToast(block) });
      return;
    }
    const maxApplicable = capPosAdvanceApplyAmount({
      requested: amount,
      availableAdvanceBalance,
      billRoom: Math.max(0, finalAmount),
    });
    if (maxApplicable <= 0) {
      toast.error("Cannot Apply Advance", {
        description: "No unused advance or bill amount is too low",
      });
      return;
    }
    setAdvanceApplied(maxApplicable);
  };

  const applyAdvanceAfterSave = async (result: { id: string; sale_number?: string | null }) => {
    if (!(advanceApplied > 0.01 && customerId && result?.id && currentOrganization?.id)) return;
    try {
      const { consumed } = await applyExistingAdvanceToSale({
        client: supabase,
        customerId,
        organizationId: currentOrganization.id,
        saleId: result.id,
        saleNumber: result.sale_number,
        requestedAmount: advanceApplied,
        voucherDate: buildPosVoucherDate(),
        createdBy: user?.id ?? null,
      });
      invalidateCustomerFinancialSnapshot(queryClient, currentOrganization.id, customerId);
      if (consumed + 0.01 < advanceApplied) {
        toast.warning("Advance shortfall", {
          description: `Applied ₹${Math.round(consumed).toLocaleString("en-IN")} of ₹${Math.round(advanceApplied).toLocaleString("en-IN")}. Remaining due stays on the bill.`,
        });
      }
    } catch (err) {
      toast.error("Could not apply advance", {
        description:
          err instanceof Error
            ? err.message
            : "Apply from Payments if needed.",
      });
    }
  };

  const withPosAdvance = <T extends { netAmount: number }>(saleData: T): T & { advanceApplied: number } => ({
    ...saleData,
    advanceApplied,
  });

  const hasNamedPosCustomer = () =>
    !!customerName?.trim() && customerName.trim().toLowerCase() !== "walk-in customer";

  const showCustomerNameRequiredWindow = (reason: "pay_later" | "mix_credit" = "pay_later") => {
    const message =
      reason === "mix_credit"
        ? "Please enter customer name when mix payment includes a credit balance."
        : "Please enter customer name first for Credit / Pay Later invoice.";
    toast.error("Customer Name Required", { description: message });
    setOpenCustomerSearch(true);
    setShowCreditCustomerRequiredDialog(true);
  };

  // Handle save sale
  const handleSaveSale = async (forcePaymentMethod?: 'cash' | 'card' | 'upi' | 'multiple' | 'pay_later') => {
    // Same-bill exchange with refund due: force Mix so shop chooses cash refund vs CN.
    if (finalAmount < -0.005 || exchangeRefundDue > 0.005) {
      handleMixPayment();
      return;
    }
    if (items.length === 0) {
      toast.error("No Items", { description: "Please add items to the cart before saving" });
      return;
    }

    // Validate no items have 0 or negative quantity
    const zeroQtyItems = items.filter(item => !item.quantity || item.quantity <= 0);
    if (zeroQtyItems.length > 0) {
      toast.error("Invalid Quantity", { description: `${zeroQtyItems.length} item(s) have zero or invalid quantity. Please fix before saving.` });
      return;
    }

    if (!validateCartSettlementLocks(items)) {
      return;
    }

    const effectiveMethod = forcePaymentMethod || paymentMethod;
    // Credit / Pay Later must always have a named customer
    if (effectiveMethod === 'pay_later' && !hasNamedPosCustomer()) {
      showCustomerNameRequiredWindow();
      return;
    }

    const saleData = withPosAdvance(buildSaleData({
      customerId,
      customerName,
      customerPhone,
      salesman: selectedSalesman || null,
      notes: saleNotes || null,
      saleDate: buildPosSaleDate(),
    }));

    // Use updateSale if editing existing sale, otherwise create new
    const result = currentSaleId
      ? await updateSale(currentSaleId, saleData, effectiveMethod, undefined, buildPosRuntimeOpts())
      : await saveSale(saleData, effectiveMethod, undefined, "pos", buildPosRuntimeOpts());
    
    if (result) {
      // Save financer details if provided
      if (financerDetails?.financer_name) {
        await saveFinancerDetails(result.id, currentOrganization?.id || '', financerDetails);
        // Create finance discount expense voucher if applicable
        if (financerDetails.finance_discount > 0 && currentOrganization?.id) {
          try {
            const { data: lastVoucher } = await supabase
              .from("voucher_entries")
              .select("voucher_number")
              .eq("organization_id", currentOrganization.id)
              .eq("voucher_type", "expense")
              .order("created_at", { ascending: false })
              .limit(1);
            const lastNum = (lastVoucher as any)?.[0]?.voucher_number?.match(/\d+$/)?.[0] || "0";
            await supabase.from("voucher_entries").insert({
              organization_id: currentOrganization.id,
              voucher_number: `EXP-${String(parseInt(lastNum) + 1).padStart(5, "0")}`,
              voucher_type: "expense",
              voucher_date: buildPosVoucherDate(),
              reference_type: "sale",
              reference_id: result.id,
              description: `Finance Discount — ${financerDetails.financer_name} (${result.sale_number})`,
              total_amount: financerDetails.finance_discount,
              category: "finance_discount",
              payment_method: "bank",
            } as any);
          } catch (vErr) { console.error("Finance discount voucher failed:", vErr); }
        }
      }
      // Store invoice number for printing
      setCurrentInvoiceNumber(result.sale_number);
      
      queryClient.invalidateQueries({ queryKey: ['todays-sales', currentOrganization?.id] });
      invalidatePosDashboardQueries(queryClient, currentOrganization?.id);
      notifyPosSalesChanged({
        organizationId: currentOrganization?.id,
        saleDate: result.sale_date,
        saleNumber: result.sale_number,
      });

      // Reset to show the newly saved invoice (index 0, as sales are sorted by created_at desc)
      setCurrentInvoiceIndex(0);
      setCurrentSaleId(result.id);
      
      // Silent operation - no toast for POS save
      
      if (creditApplied > 0 && customerId && result?.id) {
        void applyCredit(customerId, result.id, creditApplied);
      }
      await applyAdvanceAfterSave(result);
      
      // Check for DC items — offer transfer to delivery challan for cash sales
      const effectivePayment = forcePaymentMethod || paymentMethod;
      const dcCartItems = items.filter(i => i.isDcProduct);
      if (dcCartItems.length > 0 && effectivePayment === 'cash' && !currentSaleId) {
        // Fetch the saved sale_items to get their IDs
        const { data: savedSaleItems } = await supabase
          .from('sale_items')
          .select('id, variant_id, product_name, size, quantity, line_total, product_id, barcode')
          .eq('sale_id', result.id)
          .eq('is_dc_item', true);
        
        if (savedSaleItems && savedSaleItems.length > 0) {
          setDcTransferSaleId(result.id);
          setDcTransferItems(savedSaleItems.map(si => ({
            saleItemId: si.id,
            productName: si.product_name,
            size: si.size,
            quantity: si.quantity,
            netAmount: si.line_total,
            variantId: si.variant_id,
            productId: si.product_id,
            barcode: si.barcode,
          })));
          setShowDcTransferDialog(true);
        }
      }
      
      // Auto-record salesman commission
      if (
        shouldCreatePosCommissionOnSave({
          salesmanName: selectedSalesman,
          isEditingExistingSale: !!currentSaleId,
        })
      ) {
        createCommissionRecords(result.id, result.sale_number, result.sale_date || new Date().toISOString().split('T')[0], selectedSalesman, result.net_amount);
      }

      // Clear cart on success
      setItems([]);
      setCustomerId("");
      setCustomerName("");
      setCustomerPhone("");
      setFlatDiscountValue(0);
      setFlatDiscountMode('percent');
      setSaleReturnAdjust(0);
      setSameBillReturnGross(0);
      setRoundOff(0);
      setIsManualRoundOff(false);
      setCreditApplied(0);
      setAvailableCreditBalance(0);
      setAdvanceApplied(0);
      setAvailableAdvanceBalance(0);
      setOpeningBalanceRemaining(0);
      setSearchInput("");
      setCurrentSaleId(null); // Reset edit mode
      setOriginalItemsForEdit([]); // Clear original items for edit
      clearSalesmanAfterSaveIfNeeded();
      setSaleNotes("");
      setFinancerDetails(null);
    }
  };

  // Auto-create commission records after sale save
  const createCommissionRecords = async (
    saleId: string, saleNumber: string, saleDate: string, salesmanName: string, totalNetAmount: number
  ) => {
    if (!salesmanName || !currentOrganization?.id) return;
    try {
      const employee = (employees || []).find((e: any) => e.employee_name === salesmanName);
      if (!employee) return;
      const defaultRate = (employee as any).commission_percent ?? 1.0;
      const employeeRules = (commissionRules || []).filter((r: any) => r.employee_id === employee.id);

      // Fetch saved sale_items for item-level detail (include discount fields)
      const { data: saleItems } = await supabase
        .from('sale_items')
        .select('product_id, product_name, quantity, line_total, size, discount_share, net_after_discount, discount_percent')
        .eq('sale_id', saleId);

      // Fetch product details for brand/category/style
      const productIds = [...new Set((saleItems || []).map((i: any) => i.product_id).filter(Boolean))];
      let productMap: Record<string, any> = {};
      if (productIds.length > 0) {
        const { data: prods } = await supabase.from('products').select('id, brand, category, style').in('id', productIds);
        (prods || []).forEach((p: any) => { productMap[p.id] = p; });
      }

      const getRate = (item: any): { rate: number; ruleType: string } => {
        const prod = productMap[item.product_id] || {};
        const productRule = employeeRules.find((r: any) => r.rule_type === 'product' && r.rule_value === item.product_id);
        if (productRule) return { rate: productRule.commission_percent, ruleType: 'product' };
        const styleRule = employeeRules.find((r: any) => r.rule_type === 'style' && r.rule_value?.toLowerCase() === prod.style?.toLowerCase());
        if (styleRule) return { rate: styleRule.commission_percent, ruleType: 'style' };
        const brandRule = employeeRules.find((r: any) => r.rule_type === 'brand' && r.rule_value?.toLowerCase() === prod.brand?.toLowerCase());
        if (brandRule) return { rate: brandRule.commission_percent, ruleType: 'brand' };
        const catRule = employeeRules.find((r: any) => r.rule_type === 'category' && r.rule_value?.toLowerCase() === prod.category?.toLowerCase());
        if (catRule) return { rate: catRule.commission_percent, ruleType: 'category' };
        const defRule = employeeRules.find((r: any) => r.rule_type === 'default');
        return { rate: defRule?.commission_percent ?? defaultRate, ruleType: 'default' };
      };

      if (saleItems && saleItems.length > 0) {
        const records = saleItems.map((item: any) => {
          const prod = productMap[item.product_id] || {};
          const { rate, ruleType } = getRate(item);
          // Commission on net after discount (not gross line_total).
          const netSale =
            Number(item.net_after_discount) > 0
              ? Number(item.net_after_discount)
              : Math.max(0, Number(item.line_total || 0) - Number(item.discount_share || 0));
          const amount = Math.round((netSale * rate / 100) * 100) / 100;
          return {
            organization_id: currentOrganization.id,
            employee_id: employee.id, employee_name: salesmanName,
            sale_id: saleId, sale_number: saleNumber, sale_date: saleDate,
            customer_name: customerName || 'Walk-in Customer',
            product_id: item.product_id, product_name: item.product_name,
            brand: prod.brand || null, category: prod.category || null, style: prod.style || null,
            sale_amount: netSale, commission_percent: rate,
            commission_amount: amount, rule_type: ruleType, payment_status: 'pending',
          };
        });
        await (supabase.from('salesman_commissions' as any) as any).insert(records);
      } else {
        const { rate, ruleType } = getRate({});
        const amount = Math.round((totalNetAmount * rate / 100) * 100) / 100;
        await (supabase.from('salesman_commissions' as any) as any).insert({
          organization_id: currentOrganization.id,
          employee_id: employee.id, employee_name: salesmanName,
          sale_id: saleId, sale_number: saleNumber, sale_date: saleDate,
          customer_name: customerName || 'Walk-in Customer',
          sale_amount: totalNetAmount, commission_percent: rate,
          commission_amount: amount, rule_type: ruleType, payment_status: 'pending',
        });
      }
    } catch (err) { console.error('Commission record failed (non-blocking):', err); }
  };

  const handlePaymentMethodChange = (method: 'cash' | 'card' | 'upi') => {
    setPaymentMethod(method);
    toast.success("Payment Method Selected", { description: `${method.toUpperCase()} payment selected` });
  };

  const handlePaymentAndPrint = async (method: 'cash' | 'card' | 'upi' | 'pay_later') => {
    // Ref-based lock prevents duplicate saves from rapid keyboard + click combos
    // (isSaving is React state and only updates on next render — too slow for rapid inputs)
    if (paymentLockRef.current || isSaving) {
      return;
    }
    paymentLockRef.current = true;

    if (items.length === 0) {
      paymentLockRef.current = false;
      toast.error("No Items", { description: "Please add items to the cart before processing payment" });
      return;
    }

    // Same-bill exchange / negative net: open Mix so cashier can Process Refund or Issue C/Note.
    // Cash refund does not require a customer name.
    if (finalAmount < -0.005 || exchangeRefundDue > 0.005) {
      paymentLockRef.current = false;
      handleMixPayment();
      return;
    }

    // Real-time stock validation before saving
    // When editing, pass original items so their stock is considered "freed"
    const cartItemsForValidation = items.map(item => ({
      variantId: item.variantId,
      quantity: item.quantity,
      productName: item.productName,
      size: item.size,
    }));

    const insufficientItems = await validateCartStock(
      cartItemsForValidation,
      currentSaleId ? originalItemsForEdit : undefined
    );
    
    if (insufficientItems.length > 0) {
      paymentLockRef.current = false;
      openStockIssueDialog(buildMultipleStockIssues(insufficientItems));
      return;
    }

    if (!validateCartSettlementLocks(items)) {
      paymentLockRef.current = false;
      return;
    }

    if (method === 'pay_later' && !hasNamedPosCustomer()) {
      paymentLockRef.current = false;
      showCustomerNameRequiredWindow();
      return;
    }

    // Save the sale with the selected payment method
    const saleData = withPosAdvance(buildSaleData({
      customerId,
      customerName,
      customerPhone,
      salesman: selectedSalesman || null,
      notes: saleNotes || null,
      saleDate: buildPosSaleDate(),
    }));

    // Use resumeHeldSale if this is a held sale, updateSale if editing, otherwise create new
    let result;
    if (isHeldSale && currentSaleId) {
      result = await resumeHeldSale(currentSaleId, saleData, method, undefined, buildPosRuntimeOpts());
    } else if (currentSaleId) {
      result = await updateSale(currentSaleId, saleData, method, undefined, buildPosRuntimeOpts());
    } else {
      result = await saveSale(saleData, method, undefined, 'pos', buildPosRuntimeOpts());
    }
    
    // Release lock after save attempt completes
    paymentLockRef.current = false;

    if (result) {
      // Save financer details if provided
      if (financerDetails?.financer_name) {
        await saveFinancerDetails(result.id, currentOrganization?.id || '', financerDetails);
        if (financerDetails.finance_discount > 0 && currentOrganization?.id) {
          try {
            const { data: lastVoucher } = await supabase
              .from("voucher_entries").select("voucher_number")
              .eq("organization_id", currentOrganization.id).eq("voucher_type", "expense")
              .order("created_at", { ascending: false }).limit(1);
            const lastNum = (lastVoucher as any)?.[0]?.voucher_number?.match(/\d+$/)?.[0] || "0";
            await supabase.from("voucher_entries").insert({
              organization_id: currentOrganization.id,
              voucher_number: `EXP-${String(parseInt(lastNum) + 1).padStart(5, "0")}`,
              voucher_type: "expense", voucher_date: buildPosVoucherDate(),
              reference_type: "sale", reference_id: result.id,
              description: `Finance Discount — ${financerDetails.financer_name} (${result.sale_number})`,
              total_amount: financerDetails.finance_discount, category: "finance_discount", payment_method: "bank",
            } as any);
          } catch (vErr) { console.error("Finance discount voucher failed:", vErr); }
        }
      }
      // Store invoice number and sale ID for printing
      setCurrentInvoiceNumber(result.sale_number);
      const wasEditing = !!currentSaleId;
      setCurrentSaleId(result.id);

      await applyAdvanceAfterSave(result);
      
      // Silent operation - no toast for POS save
      
      const salesmanForPrint = selectedSalesman || (result as any)?.salesman || '';

      // Store invoice data for print dialog BEFORE clearing the form
      const invoiceDataForPrint = {
        invoiceNumber: result.sale_number,
        saleId: result.id,
        items: items,
        totals: totals,
        flatDiscountAmount: flatDiscountAmount,
        saleReturnAdjust: saleReturnAdjust,
        finalAmount: finalAmount,
        method: method,
        customerName: resolvePosCustomerName(customerName),
        customerPhone: customerPhone,
        customerId: customerId,
        customerAddress: customers.find(c => c.id === customerId)?.address || "",
        customerGstNumber: customers.find(c => c.id === customerId)?.gst_number || "",
        customerTransportDetails: (customers.find(c => c.id === customerId) as any)?.transport_details || "",
        roundOff: roundOff,
        creditApplied: creditApplied,
        creditAmount: creditApplied,
        notes: saleNotes || null,
        paidAmount: method === 'pay_later' ? 0 : posTenderDue,
        previousBalance: customerBalance || 0,
        pointsRedeemed: pointsToRedeem,
        pointsRedemptionValue: pointsRedemptionValue,
        pointsBalance: (customerPointsData?.balance || 0) - pointsToRedeem,
        cashAmount: result.cash_amount || 0,
        upiAmount: result.upi_amount || 0,
        cardAmount: result.card_amount || 0,
        salesman: salesmanForPrint || null,
        taxType,
        financerDetails: financerDetails || null,
      };
      
      // Auto-record salesman commission
      if (
        shouldCreatePosCommissionOnSave({
          salesmanName: salesmanForPrint,
          isEditingExistingSale: wasEditing,
        })
      ) {
        createCommissionRecords(result.id, result.sale_number, result.sale_date || new Date().toISOString().split('T')[0], salesmanForPrint, result.net_amount);
      }

      // WhatsApp invoice auto-send is handled by useSaveSale hook — do NOT send here to avoid duplicates
      // Set print snapshot first so hidden invoice re-renders with salesman before cart clears.
      // flushSync: commit portal DOM before cart clear + auto-print (avoids blank clone).
      flushSync(() => setSavedInvoiceData(invoiceDataForPrint));
      applyLastCompletedPosHint(result.sale_number, finalAmount, totals.quantity);

      // Clear the form immediately after successful save (reset to new blank invoice)
      setItems([]);
      setCustomerId("");
      setCustomerName("");
      setCustomerPhone("");
      setFlatDiscountValue(0);
      setFlatDiscountMode('percent');
      setSaleReturnAdjust(0);
      setSameBillReturnGross(0);
      setRoundOff(0);
      setIsManualRoundOff(false);
      setCreditApplied(0);
      setAvailableCreditBalance(0);
      setAdvanceApplied(0);
      setAvailableAdvanceBalance(0);
      setOpeningBalanceRemaining(0);
      setSearchInput("");
      setCurrentSaleId(null);
      setOriginalItemsForEdit([]);
      // Same clear rule for all save paths (no auto-print divergence).
      clearSalesmanAfterSaveIfNeeded();
      setSaleNotes("");
      setFinancerDetails(null);
      setIsHeldSale(false);
      setPointsToRedeem(0);
      
      triggerPosAutoPrintIfEnabled(() => setShowPrintConfirmDialog(true));
      
      // Focus on barcode input for next sale
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    }
  };

  const handleMixPayment = () => {
    if (items.length === 0) {
      toast.error("No Items", { description: "Please add items to the cart before processing payment" });
      return;
    }
    // Auto-set refund if final amount is negative (same-bill exchange excess)
    if (finalAmount < 0 || exchangeRefundDue > 0.005) {
      setRefundAmount(Math.max(Math.abs(Math.min(0, finalAmount)), exchangeRefundDue));
    }
    setShowMixPaymentDialog(true);
  };

  const handleMixPaymentSave = async (paymentData: {
    cashAmount: number;
    cardAmount: number;
    upiAmount: number;
    bankAmount?: number;
    creditAmount: number;
    totalPaid: number;
    refundAmount: number;
    issueCreditNote?: boolean;
    refundMode?: 'cash' | 'upi' | 'bank_transfer';
  }) => {
    // Customer name required only when mix payment leaves a credit balance on the bill
    const mixCreditAmount = Math.max(0, Number(paymentData.creditAmount) || 0);
    if (mixCreditAmount > 0.01 && !hasNamedPosCustomer()) {
      showCustomerNameRequiredWindow("mix_credit");
      return;
    }
    // Cash refund after S/R excess is fine without a customer (walk-in).
    // Issue C/Note still needs a named customer so credit can be redeemed later.
    if (
      paymentData.issueCreditNote &&
      paymentData.refundAmount > 0.01 &&
      !hasNamedPosCustomer()
    ) {
      toast.error("Customer Name Required", {
        description: "Please enter customer name to issue a credit note. Cash refund does not require a customer.",
      });
      setOpenCustomerSearch(true);
      return;
    }

    // Real-time stock validation before saving
    // When editing, pass original items so their stock is considered "freed"
    const cartItemsForValidation = items.map(item => ({
      variantId: item.variantId,
      quantity: item.quantity,
      productName: item.productName,
      size: item.size,
    }));

    const insufficientItems = await validateCartStock(
      cartItemsForValidation,
      currentSaleId ? originalItemsForEdit : undefined
    );
    
    if (insufficientItems.length > 0) {
      openStockIssueDialog(buildMultipleStockIssues(insufficientItems));
      return;
    }

    if (!validateCartSettlementLocks(items)) {
      return;
    }

    // Keep full S/R + possibly-negative net through to save; applyBillCaps persists net≥0.
    // Explicit refundAmount (or issueCreditNote) tells save to settle excess instead of
    // toasting "remains for a future bill".
    const saleData = {
      ...withPosAdvance(buildSaleData({
        customerId,
        customerName,
        customerPhone,
        salesman: selectedSalesman || null,
        notes: saleNotes || null,
        saleDate: buildPosSaleDate(),
      })),
      netAmount: finalAmount,
      refundAmount: paymentData.issueCreditNote ? 0 : paymentData.refundAmount,
    };

    const paymentMethodType: 'multiple' = 'multiple';

    // ── Refund cash-flow audit fix ─────────────────────────────────────────
    // For refunds (negative net) where cash/upi/card amounts in the dialog
    // are 0 and the user picked a refundMode, persist the refund as NEGATIVE
    // cash/upi/card on the sale so cashier reports show the outflow and the
    // ledger can detect a true refund (vs phantom credit).
    let breakdownForSave = {
      ...paymentData,
      issueCreditNote: !!paymentData.issueCreditNote,
    };
    const isRefundOutflow =
      paymentData.refundAmount > 0 &&
      !paymentData.issueCreditNote &&
      paymentData.cashAmount === 0 &&
      paymentData.cardAmount === 0 &&
      paymentData.upiAmount === 0;
    if (isRefundOutflow) {
      const refund = paymentData.refundAmount;
      const mode = paymentData.refundMode || 'cash';
      breakdownForSave = {
        ...breakdownForSave,
        cashAmount: mode === 'cash' ? -refund : 0,
        upiAmount: mode === 'upi' ? -refund : 0,
        // 'bank_transfer' is treated as a card/bank outflow on the sale row
        cardAmount: mode === 'bank_transfer' ? -refund : 0,
      };
    }

    // Use updateSale if editing existing sale, otherwise create new
    const result = currentSaleId 
      ? await updateSale(currentSaleId, saleData, paymentMethodType as any, breakdownForSave, buildPosRuntimeOpts())
      : await saveSale(saleData, paymentMethodType as any, breakdownForSave, 'pos', buildPosRuntimeOpts());
    
    if (result) {
      // Save financer details if provided
      if (financerDetails?.financer_name) {
        await saveFinancerDetails(result.id, currentOrganization?.id || '', financerDetails);
        if (financerDetails.finance_discount > 0 && currentOrganization?.id) {
          try {
            const { data: lastVoucher } = await supabase
              .from("voucher_entries").select("voucher_number")
              .eq("organization_id", currentOrganization.id).eq("voucher_type", "expense")
              .order("created_at", { ascending: false }).limit(1);
            const lastNum = (lastVoucher as any)?.[0]?.voucher_number?.match(/\d+$/)?.[0] || "0";
            await supabase.from("voucher_entries").insert({
              organization_id: currentOrganization.id,
              voucher_number: `EXP-${String(parseInt(lastNum) + 1).padStart(5, "0")}`,
              voucher_type: "expense", voucher_date: buildPosVoucherDate(),
              reference_type: "sale", reference_id: result.id,
              description: `Finance Discount — ${financerDetails.financer_name} (${result.sale_number})`,
              total_amount: financerDetails.finance_discount, category: "finance_discount", payment_method: "bank",
            } as any);
          } catch (vErr) { console.error("Finance discount voucher failed:", vErr); }
        }
      }
      // Store invoice number and sale ID for printing
      setCurrentInvoiceNumber(result.sale_number);
      const wasEditing = !!currentSaleId;
      setCurrentSaleId(result.id);
      
      const isRefund = paymentData.refundAmount > 0 && !paymentData.issueCreditNote;
      const isCreditNote = paymentData.issueCreditNote && paymentData.refundAmount > 0;
      
      // If issuing credit note, create it
      if (isCreditNote) {
        const creditNote = await createCreditNote({
          saleId: result.id,
          customerId: customerId || null,
          customerName: customerName || 'Walk in Customer',
          customerPhone: customerPhone || null,
          creditAmount: paymentData.refundAmount,
          notes: `Credit note issued against invoice ${result.sale_number}`,
        });
        
        if (creditNote) {
          setCreditNoteData(creditNote);
          setShowCreditNoteDialog(true);
        }
      }

      void (async () => {
        try {
          const billNet = Number((result as any).net_amount ?? 0);
          const alreadyLinkedCn = (result as any).credit_note_id;
          const srAdjOnBill = Number(saleData.saleReturnAdjust ?? 0);
          const skipAutoCnBecauseSrAdjust =
            srAdjOnBill > 0.01 && billNet < 0 && customerId && !alreadyLinkedCn;
          if (
            !isCreditNote &&
            !isRefund &&
            !wasEditing &&
            billNet < 0 &&
            customerId &&
            !alreadyLinkedCn &&
            currentOrganization?.id &&
            !skipAutoCnBecauseSrAdjust
          ) {
            const autoCnAmount = Math.abs(billNet);
            const autoCn = await createCreditNote({
              saleId: result.id,
              customerId: customerId,
              customerName: customerName || "Walk in Customer",
              customerPhone: customerPhone || null,
              creditAmount: autoCnAmount,
              notes: `Auto-issued from S/R adjustment on invoice ${result.sale_number}`,
            });
            if (autoCn) {
              setAvailableCreditBalance((prev) => prev + autoCnAmount);
            }
          }
        } catch (autoCnErr) {
          console.error("Auto credit note creation failed:", autoCnErr);
        }
      })();
      
      // Silent operation - no toast for POS save
      
      // Credit and points operations moved to after print dialog (non-blocking, see below)
      
      const salesmanForPrint = selectedSalesman || (result as any)?.salesman || '';

      // Store invoice data BEFORE clearing the form (only for non-credit note cases)
      const invoiceDataForPrint = !isCreditNote ? {
        invoiceNumber: result.sale_number,
        saleId: result.id,
        items: items,
        totals: totals,
        flatDiscountAmount: flatDiscountAmount,
        saleReturnAdjust: saleReturnAdjust,
        finalAmount: isRefund ? 0 : finalAmount,
        method: isRefund ? `refund_${paymentData.refundMode || 'cash'}` : 'multiple',
        customerName: resolvePosCustomerName(customerName),
        customerPhone: customerPhone,
        customerId: customerId,
        customerAddress: customers.find(c => c.id === customerId)?.address || "",
        customerGstNumber: customers.find(c => c.id === customerId)?.gst_number || "",
        customerTransportDetails: (customers.find(c => c.id === customerId) as any)?.transport_details || "",
        roundOff: roundOff,
        paymentBreakdown: breakdownForSave,
        refundAmount: paymentData.refundAmount,
        refundCash: isRefund ? paymentData.refundAmount : 0,
        creditApplied: creditApplied,
        notes: saleNotes || null,
        paidAmount: paymentData.totalPaid,
        previousBalance: customerBalance || 0,
        pointsRedeemed: pointsToRedeem,
        pointsRedemptionValue: pointsRedemptionValue,
        pointsBalance: (customerPointsData?.balance || 0) - pointsToRedeem,
        cashAmount: result.cash_amount || 0,
        upiAmount: result.upi_amount || 0,
        cardAmount: result.card_amount || 0,
        creditAmount: (paymentData.creditAmount || 0) + (creditApplied || 0),
        salesman: salesmanForPrint || null,
        taxType,
        financerDetails: financerDetails || null,
      } : null;
      
      // Auto-record salesman commission
      if (
        shouldCreatePosCommissionOnSave({
          salesmanName: selectedSalesman,
          isEditingExistingSale: !!currentSaleId,
        })
      ) {
        createCommissionRecords(result.id, result.sale_number, result.sale_date || new Date().toISOString().split('T')[0], selectedSalesman, result.net_amount);
      }

      // WhatsApp invoice auto-send is handled by useSaveSale hook — do NOT send here to avoid duplicates

      setItems([]);
      setCustomerId("");
      setCustomerName("");
      setCustomerPhone("");
      setFlatDiscountValue(0);
      setFlatDiscountMode('percent');
      setSaleReturnAdjust(0);
      setSameBillReturnGross(0);
      setRoundOff(0);
      setIsManualRoundOff(false);
      setCreditApplied(0);
      setAvailableCreditBalance(0);
      setAdvanceApplied(0);
      setAvailableAdvanceBalance(0);
      setOpeningBalanceRemaining(0);
      setSearchInput("");
      setCurrentSaleId(null);
      setOriginalItemsForEdit([]);
      clearSalesmanAfterSaveIfNeeded();
      setSaleNotes("");
      setFinancerDetails(null);
      setIsHeldSale(false);
      setPointsToRedeem(0);
      
      if (invoiceDataForPrint) {
        // flushSync: commit portal DOM before cart clear + auto-print (avoids blank clone).
        flushSync(() => setSavedInvoiceData(invoiceDataForPrint));
        applyLastCompletedPosHint(
          result.sale_number,
          isRefund ? 0 : finalAmount,
          totals.quantity,
        );
        triggerPosAutoPrintIfEnabled(() => setShowPrintConfirmDialog(true));
      }
      
      // Focus on barcode input for next sale
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
      
      if (!isCreditNote && creditApplied > 0 && customerId && result?.id) {
        applyCredit(customerId, result.id, creditApplied);
      }
      if (!isCreditNote && !isRefund) {
        await applyAdvanceAfterSave(result);
      }
      if (!isCreditNote && pointsToRedeem > 0 && customerId) {
        redeemPoints(customerId, result.id, pointsToRedeem, result.sale_number).then(() => {
          queryClient.invalidateQueries({ queryKey: ['customer-points', customerId] });
        });
      }
    }
  };

  // Setup print handler using react-to-print
  const getPageStyle = () => {
    const format = posBillFormat;
    let size = 'A5 portrait';
    let margin = '5mm';

    if (posInvoiceTemplate === 'real-tast') {
      return `${getRealTastA4PrintPageStyle()}
      ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}
    `;
    }

    if (posInvoiceTemplate === 'retail-erp-preprinted') {
      const isA5 = format === 'a5' || format === 'a5-horizontal';
      const isA5Landscape = format === 'a5-horizontal';
      // Exact mm sizes — more reliable than "A5 portrait" with Chrome / Print-to-PDF on Windows
      const pageSize = isA5Landscape
        ? '210mm 148mm'
        : isA5
          ? '148mm 210mm'
          : '210mm 297mm';
      const contentW = isA5Landscape ? '210mm' : isA5 ? '148mm' : '210mm';
      const contentH = isA5Landscape ? '148mm' : isA5 ? '210mm' : '297mm';
      return `
      @page {
        size: ${pageSize};
        margin: 0;
      }
      @media print {
        html, body {
          width: ${contentW} !important;
          height: ${contentH} !important;
          max-width: ${contentW} !important;
          max-height: ${contentH} !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background: #fff !important;
        }
        .invoice-print-source,
        .invoice-print-source-screen,
        .invoice-print-root,
        .retail-erp-all-pages {
          width: ${contentW} !important;
          max-width: ${contentW} !important;
          margin: 0 !important;
          padding: 0 !important;
          visibility: visible !important;
          opacity: 1 !important;
          display: block !important;
          overflow: hidden !important;
        }
        .retail-erp-invoice-template {
          width: ${contentW} !important;
          max-width: ${contentW} !important;
          height: ${contentH} !important;
          max-height: ${contentH} !important;
          margin: 0 !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          padding-left: ${isA5 ? "5.5mm" : "8mm"} !important;
          padding-right: ${isA5 ? "7mm" : "10mm"} !important;
          padding-bottom: ${isA5 ? "7mm" : "8mm"} !important;
          page-break-after: avoid !important;
          page-break-inside: avoid !important;
        }
      }
      ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}
    `;
    }

    if (posInvoiceTemplate === 'retail-tax-ezzy' || posInvoiceTemplate === 'wholesale-a5' || posInvoiceTemplate === 'retail-erp' || posInvoiceTemplate === 'retail-erp-dc' || posInvoiceTemplate === 'zaika') {
      return `
      @page {
        size: A5 portrait;
        margin: 4mm;
      }
      @media print {
        html, body {
          width: 100%;
          margin: 0;
          padding: 0;
        }
        .retail-tax-ezzy-page,
        .retail-erp-invoice-template {
          width: 100% !important;
          max-width: none !important;
          /* Keep hidden so A5 SN grid cannot paint over Note/totals (PDF/print align). */
          overflow: hidden !important;
        }
        .retail-erp-items-grow {
          overflow: hidden !important;
          min-height: 0 !important;
        }
        .invoice-print-source,
        .invoice-print-source-screen,
        .invoice-print-root,
        .thermal-print-80mm,
        .thermal-receipt-container {
          visibility: visible !important;
          opacity: 1 !important;
          display: block !important;
          clip: auto !important;
          clip-path: none !important;
          transform: none !important;
          overflow: visible !important;
        }
      }
      ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}
    `;
    }
    
    switch (format) {
      case 'a5-horizontal':
        size = 'A5 landscape';
        break;
      case 'a4':
        size = 'A4 portrait';
        margin = '10mm';
        break;
      case 'thermal': {
        const thermalPage = posThermalPageCss(posThermalPaper);
        return `
      @page {
        size: ${thermalPage.pageSize};
        margin: 0;
      }
      ${getThermalReceiptPageStyleFragment(posThermalPaper)}
      @media print {
        html, body {
          width: ${thermalPage.sourceWidth} !important;
          max-width: ${thermalPage.sourceWidth} !important;
          margin: 0 !important;
          padding: 0 !important;
          height: auto !important;
          overflow: visible !important;
        }
        .invoice-print-source,
        .invoice-print-source-screen,
        .invoice-print-root,
        .thermal-print-80mm,
        .thermal-receipt-container,
        .modern-thermal-receipt {
          visibility: visible !important;
          opacity: 1 !important;
          display: block !important;
          clip: auto !important;
          clip-path: none !important;
          transform: none !important;
          overflow: visible !important;
        }
        .invoice-print-source-screen,
        .invoice-print-source,
        .invoice-print-root {
          width: ${thermalPage.sourceWidth} !important;
          max-width: ${thermalPage.sourceWidth} !important;
          margin: 0 !important;
          padding: 0 !important;
          transform: none !important;
          zoom: 1 !important;
        }
      }
    `;
      }
      default: // a5-vertical
        size = 'A5 portrait';
        break;
    }
    
    return `
      @page {
        size: ${size};
        margin: ${margin};
      }
      @media print {
        html, body {
          width: 100%;
          margin: 0;
          padding: 0;
        }
        .invoice-print-source,
        .invoice-print-source-screen,
        .invoice-print-root,
        .thermal-print-80mm,
        .thermal-receipt-container,
        .modern-thermal-receipt {
          visibility: visible !important;
          opacity: 1 !important;
          display: block !important;
          clip: auto !important;
          clip-path: none !important;
          transform: none !important;
          overflow: visible !important;
        }
      }
      ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}
    `;
  };

  const getCreditNotePageStyle = (): string =>
    getPosDocumentPrintPageStyle(
      posBillFormat,
      posThermalPaper,
      getThermalReceiptPageStyleFragment(posThermalPaper),
    );

  const handlePrint = useReactToPrint({
    contentRef: invoicePrintRef,
    documentTitle: savedInvoiceData?.invoiceNumber || "Invoice",
    pageStyle: getPageStyle(),
    onBeforePrint: () =>
      new Promise<void>((resolve) => {
        waitForPrintReady(invoicePrintRef, resolve, { maxWait: 8000 });
      }),
    onAfterPrint: async () => {
      refreshPosAfterBillPrint();
      toast.success("Success", { description: "Invoice printed successfully" });

      // Clear saved invoice data so screen is ready for new invoice
      setSavedInvoiceData(null);
      setShowPrintPreview(false);

      // Open cash drawer if enabled in settings
      const billBarcodeSettings = (settingsData as any)?.bill_barcode_settings;
      if (billBarcodeSettings?.enable_cash_drawer) {
        const drawerPin = billBarcodeSettings?.cash_drawer_pin || 'pin2';
        await openCashDrawer(undefined, { pin: drawerPin, showToast: false });
      }

      // Focus barcode input for next sale
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    },
  });

  const handlePrintCreditNote = useReactToPrint({
    contentRef: creditNotePrintRef,
    documentTitle: creditNoteData?.credit_note_number || "Credit Note",
    pageStyle: getCreditNotePageStyle(),
    expectedMaxPages: 1,
    onBeforePrint: () =>
      new Promise<void>((resolve) => {
        waitForPrintReady(creditNotePrintRef, resolve, { maxWait: 8000 });
      }),
    onPrintError: (_location, error) => {
      console.error("[POSSales] credit note print failed", error);
      toast.error("Print failed", {
        description: "Could not open the print dialog. Try again or check your printer settings.",
      });
    },
  });

  const triggerCreditNotePrint = useCallback(() => {
    if (!creditNoteData) {
      toast.error("Nothing to print", { description: "Credit note is not loaded yet." });
      return;
    }
    if (!creditNotePrintRef.current) {
      toast.error("Print failed", { description: "Credit note layout is not ready. Try again." });
      return;
    }
    waitForPrintReady(creditNotePrintRef, () => handlePrintCreditNote(), { maxWait: 8000 });
  }, [creditNoteData, handlePrintCreditNote]);

  // Keep ref in sync for estimate print (handlePrint defined after estimate handler)
  handlePrintRef.current = handlePrint;

  const handleTriggerBrowserPrint = useCallback(() => {
    // HARD GUARD: never print an unsaved cart. Only allow when either:
    //  (a) a real sale has been saved (savedInvoiceData.saleId present), or
    //  (b) user explicitly chose Estimate (savedInvoiceData.isEstimate === true)
    if (!savedInvoiceData || (!savedInvoiceData.saleId && !savedInvoiceData.isEstimate)) {
      toast.error("Cannot print unsaved bill", {
        description: "Complete payment to save the invoice, or press F9 for Estimate.",
      });
      return;
    }
    waitForPrintReady(invoicePrintRef, () => handlePrint(), { maxWait: 8000 });
  }, [handlePrint, savedInvoiceData]);

  const renderPosPrintSource = () => {
    if (items.length === 0 && !savedInvoiceData) return null;
    return (
      <div
        className={`invoice-print-source-screen invoice-print-source${posBillFormat === 'thermal' ? ' thermal-print-page' : ''}${posBillFormat === 'thermal' && posThermalPaper === '58mm' ? ' thermal-paper-58' : ''}`}
        data-print-format={posBillFormat === 'thermal' ? 'thermal' : undefined}
        style={posPrintSourceStyle}
      >
        <div ref={invoicePrintRef} className="invoice-print-source" style={{ position: 'relative' }}>
          {savedInvoiceData?.isEstimate && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%) rotate(-30deg)',
                fontSize: posBillFormat === 'thermal' ? '28px' : '60px',
                fontWeight: 'bold',
                color: 'rgba(0, 0, 0, 0.08)',
                letterSpacing: '8px',
                pointerEvents: 'none',
                zIndex: 10,
                whiteSpace: 'nowrap',
              }}
            >
              ESTIMATE
            </div>
          )}
          <InvoiceWrapper
            template={posInvoiceTemplate}
            format={posInvoiceWrapperFormat}
            thermalPaper={posThermalPaper}
            showMRP={enableMrp}
            showYouSaved={enableMrp ? undefined : false}
            // Only show a real invoice number when we actually have a saved sale or are editing one.
            // Falling back to nextInvoicePreview here caused unsaved cart prints to carry a real-looking
            // sequential number (e.g. POS/26-27/1576) that the next saved sale then reused.
            billNo={
              savedInvoiceData?.invoiceNumber
                || currentInvoiceNumber
                || 'DRAFT'
            }
            date={currentDateTime}
            customerName={savedInvoiceData?.customerName || customerName || 'Walk in Customer'}
            customerAddress={savedInvoiceData?.customerAddress || customers.find((c) => c.id === customerId)?.address || ''}
            customerMobile={savedInvoiceData?.customerPhone || customerPhone || ''}
            customerGSTIN={savedInvoiceData?.customerGstNumber || customers.find((c) => c.id === customerId)?.gst_number || ''}
            customerTransportDetails={savedInvoiceData?.customerTransportDetails || (customers.find((c) => c.id === customerId) as any)?.transport_details || ''}
            items={
              savedInvoiceData
                ? savedInvoiceData.items.map((item: any, index: number) =>
                    mapPosPrintItem(item, index, invoiceTaxType),
                  )
                : items.map((item, index) => mapPosPrintItem(item, index, invoiceTaxType))
            }
            subTotal={savedInvoiceData?.totals.subtotal || totals.subtotal}
            discount={
              savedInvoiceData
                ? savedInvoiceData.totals.discount + savedInvoiceData.flatDiscountAmount
                : totals.discount + flatDiscountAmount
            }
            saleReturnAdjust={savedInvoiceData?.saleReturnAdjust || saleReturnAdjust || 0}
            grandTotal={savedInvoiceData?.finalAmount || finalAmount}
            cashPaid={savedInvoiceData?.method === 'cash' ? (savedInvoiceData.paidAmount ?? savedInvoiceData.finalAmount) : paymentMethod === 'cash' ? posTenderDue : 0}
            upiPaid={savedInvoiceData?.method === 'upi' ? (savedInvoiceData.paidAmount ?? savedInvoiceData.finalAmount) : paymentMethod === 'upi' ? posTenderDue : 0}
            paymentMethod={savedInvoiceData?.method || paymentMethod}
            cashAmount={savedInvoiceData?.cashAmount || 0}
            upiAmount={savedInvoiceData?.upiAmount || 0}
            cardAmount={savedInvoiceData?.cardAmount || 0}
            creditAmount={savedInvoiceData?.creditAmount || 0}
            refundCash={savedInvoiceData?.refundCash || 0}
            notes={
              savedInvoiceData?.isEstimate
                ? `** ESTIMATE - NOT A FINAL INVOICE **${savedInvoiceData?.notes ? '\n' + savedInvoiceData.notes : ''}`
                : savedInvoiceData?.notes || saleNotes
            }
            paidAmount={savedInvoiceData?.paidAmount ?? (paymentMethod === 'pay_later' ? 0 : finalAmount)}
            previousBalance={savedInvoiceData?.previousBalance ?? customerBalance ?? 0}
            roundOff={savedInvoiceData?.roundOff ?? roundOff}
            salesman={savedInvoiceData?.salesman || selectedSalesman || ''}
            taxType={invoiceTaxType}
            financerDetails={savedInvoiceData?.financerDetails || financerDetails}
          />
        </div>
      </div>
    );
  };

  const posPrintPortal =
    typeof document !== 'undefined' ? createPortal(renderPosPrintSource(), document.body) : null;

  const handlePrintFromDialog = async () => {

    setShowPrintConfirmDialog(false);

    // Try QZ Tray direct print first
    if (isDirectPrintEnabled) {
      // Wait for invoice to fully render before direct printing
      waitForPrintReady(invoicePrintRef, async () => {
        const paperSize = resolvePosDirectPrintPaper(
          posBillFormat,
          (settingsData as any)?.bill_barcode_settings?.direct_print_pos_paper,
        );
        const success = await directPrint(invoicePrintRef.current, {
          context: 'pos',
          paperSize,
          onFallback: () => {
            // Fallback to browser print
            if (showInvoicePreviewSetting) {
              setShowPrintPreview(true);
            } else {
              handleTriggerBrowserPrint();
            }
          },
          onSuccess: async () => {
            refreshPosAfterBillPrint();
            setSavedInvoiceData(null);
            setShowPrintPreview(false);
            // Open cash drawer if enabled
            const billBarcodeSettings = (settingsData as any)?.bill_barcode_settings;
            if (billBarcodeSettings?.enable_cash_drawer) {
              const drawerPin = billBarcodeSettings?.cash_drawer_pin || 'pin2';
              await openCashDrawer(undefined, { pin: drawerPin, showToast: false });
            }
            setTimeout(() => barcodeInputRef.current?.focus(), 100);
          },
        });
      });
      return;
    }
    
    if (showInvoicePreviewSetting) {
      // Show preview dialog
      setShowPrintPreview(true);
    } else {
      // Direct print without preview - wait for data + DOM + images
      handleTriggerBrowserPrint();
    }
  };

  const handleClosePrintConfirmDialog = () => {
    refreshPosAfterBillPrint();
    setShowPrintConfirmDialog(false);
    setSavedInvoiceData(null);
    
    // Focus on barcode input for next sale
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  };

  const { sendWhatsApp } = useWhatsAppSend();

  const handleWhatsAppShare = async (useCurrentData: boolean = false) => {
    const phone = useCurrentData ? customerPhone : savedInvoiceData?.customerPhone;
    const invoiceNo = useCurrentData ? currentInvoiceNumber : savedInvoiceData?.invoiceNumber;
    const name = useCurrentData ? customerName : savedInvoiceData?.customerName;
    const itemsToUse = useCurrentData ? items : savedInvoiceData?.items;
    const totalAmount = useCurrentData ? finalAmount : savedInvoiceData?.finalAmount;
    const discountAmount = useCurrentData ? (totals.discount + flatDiscountAmount) : ((savedInvoiceData?.totals?.discount || 0) + (savedInvoiceData?.flatDiscountAmount || 0));
    const grossAmount = useCurrentData ? totals.mrp : (savedInvoiceData?.totals?.mrp || 0);
    const method = useCurrentData ? paymentMethod : savedInvoiceData?.method;
    const srAdjust = useCurrentData ? saleReturnAdjust : (savedInvoiceData?.saleReturnAdjust || 0);
    const roundOffAmount = useCurrentData ? roundOff : (savedInvoiceData?.roundOff || 0);
    const custId = useCurrentData ? customerId : savedInvoiceData?.customerId;
    
    // Points data
    const pointsRedeemedAmt = useCurrentData ? pointsToRedeem : (savedInvoiceData?.pointsRedeemed || 0);
    const pointsRedemptionVal = useCurrentData ? pointsRedemptionValue : (savedInvoiceData?.pointsRedemptionValue || 0);
    
    // Get payment breakdown from savedInvoiceData (already saved)
    const cashAmt = savedInvoiceData?.cashAmount || 0;
    const cardAmt = savedInvoiceData?.cardAmount || 0;
    const upiAmt = savedInvoiceData?.upiAmount || 0;
    const creditAmt = savedInvoiceData?.creditAmount || 0;
    
    if (!phone) {
      toast.error("No Phone Number", { description: "Customer phone number is required to send WhatsApp message" });
      return;
    }

    const itemsList = itemsToUse?.map((item: any, index: number) =>
      `${index + 1}. ${item.productName} (${item.size}) - Qty: ${item.quantity} - ₹${(item.netAmount || 0).toFixed(2)}`
    ).join('\n') || '';

    // Get invoice URL if we have a sale ID - include org slug for branding
    const saleId = useCurrentData ? currentSaleId : savedInvoiceData?.saleId;
    const orgSlug = currentOrganization?.slug || localStorage.getItem("selectedOrgSlug") || '';
    const saleSettingsForLink = (settingsData as any)?.sale_settings || {};
    const invoiceUrl = saleId
      ? buildPublicInvoiceViewUrl({
          orgSlug,
          saleId,
          billContext: 'pos',
          saleSettings: saleSettingsForLink,
          baseUrl: window.location.origin,
        })
      : '';
    
    // Build payment breakdown
    const paymentParts: string[] = [];
    if (cashAmt > 0) paymentParts.push(`Cash: ₹${Number(cashAmt).toLocaleString("en-IN")}`);
    if (cardAmt > 0) paymentParts.push(`Card: ₹${Number(cardAmt).toLocaleString("en-IN")}`);
    if (upiAmt > 0) paymentParts.push(`UPI: ₹${Number(upiAmt).toLocaleString("en-IN")}`);
    if (creditAmt > 0) paymentParts.push(`Credit: ₹${Number(creditAmt).toLocaleString("en-IN")}`);
    const paymentBreakdown = paymentParts.length > 0 ? paymentParts.join(" | ") : (method || 'cash').toUpperCase();
    
    // Fetch customer outstanding and points if customer exists
    let outstandingText = '';
    let pointsText = '';
    if (custId) {
      const { data: customer } = await supabase
        .from('customers')
        .select('points_balance, total_points_earned')
        .eq('id', custId)
        .single();

      const pointsBalance = customer?.points_balance || 0;

      let customerBalance = 0;
      if (currentOrganization?.id) {
        try {
          const snap = await fetchCustomerFinancialSnapshot(
            supabase,
            currentOrganization.id,
            custId,
          );
          customerBalance = Math.round(Number(snap.netPosition) || 0);
        } catch {
          customerBalance = 0;
        }
      }

      if (customerBalance > 0) {
        outstandingText = `\n💰 *Outstanding Balance: ₹${Number(customerBalance).toLocaleString("en-IN")}*`;
      }
      
      // Add points info
      if (isPointsEnabled) {
        if (pointsRedeemedAmt > 0) {
          pointsText = `\n\n🎁 *Loyalty Points*\nPoints Redeemed: ${pointsRedeemedAmt} pts (₹${pointsRedemptionVal.toFixed(0)} discount)\nPoints Balance: ${pointsBalance} pts`;
        } else if (pointsBalance > 0) {
          pointsText = `\n\n🎁 *Loyalty Points*\nPoints Balance: ${pointsBalance} pts`;
        }
      }
    }
    
    const message = `*Invoice Details*\n\nInvoice No: ${invoiceNo}\nDate: ${format(new Date(), 'dd/MM/yyyy')}\nCustomer: ${name || 'Walk in Customer'}\n\n*Items:*\n${itemsList}\n\nGross Amount: ₹${(grossAmount || 0).toFixed(2)}\nDiscount: ₹${(discountAmount || 0).toFixed(2)}${pointsRedeemedAmt > 0 ? `\nPoints Redeemed: ${pointsRedeemedAmt} pts (-₹${pointsRedemptionVal.toFixed(0)})` : ''}${srAdjust > 0 ? `\nS/R Adjust: -₹${srAdjust.toFixed(2)}` : ''}\nRound Off: ₹${(roundOffAmount || 0).toFixed(2)}\n*Net Amount: ₹${(totalAmount || 0).toFixed(2)}*\n\nPayment: ${paymentBreakdown}${outstandingText}${pointsText}${invoiceUrl ? `\n\n📄 View Invoice Online:\n${invoiceUrl}` : ''}\n\nThank you for your business!`;

    sendWhatsApp(phone, message);
  };

  const handlePrintInvoice = async () => {
    if (!currentSaleId) {
      toast.error("Error", { description: "Please save the sale first" });
      return;
    }

    try {
      // Wait for invoice to be fully rendered then print
      waitForPrintReady(invoicePrintRef, () => {
        handleTriggerBrowserPrint();
        setShowPrintDialog(false);
      });
    } catch (error: any) {
      console.error('Error printing invoice:', error);
      toast.error("Error", { description: error.message || "Failed to print invoice" });
    }
  };

  const loadInvoice = (sale: any) => {
    if (!sale || !sale.sale_items) return;
    isInitializingEditRef.current = true;
    hasManuallyAddedNewItemRef.current = false;

    // Load customer info
    setCustomerName(sale.customer_name || "");
    setCustomerPhone(sale.customer_phone || "");
    linkedCustomerPhoneRef.current = sale.customer_phone || "";
    setCustomerId(sale.customer_id || "");
    
    // Load items from sale_items
    const loadedItems: CartItem[] = sale.sale_items.map((item: any) => ({
      id: item.variant_id,
      barcode: item.barcode || '',
      productName: item.product_name,
      baseProductName:
        (item.product_name || "").split("-")[0]?.trim() || item.product_name || "",
      size: item.size,
      quantity: item.quantity,
      mrp: Number(item.mrp),
      gstPer: item.gst_percent,
      discountPercent: Number(item.discount_percent),
      discountAmount: 0,
      unitCost: Number(item.unit_price),
      // rateAuthority unset until price_overridden column (migration pending approval)
      netAmount: Number(item.line_total),
      productId: item.product_id,
      variantId: item.variant_id,
      itemNotes: item.item_notes || null,
    }));

    setItems(loadedItems);

    const flatRes = resolveBillFlatForPosEdit(sale, sale.sale_items || []);
    if (flatRes.percentLooksClean) {
      handleFlatDiscountValueChange(flatRes.value);
      setFlatDiscountMode("percent");
    } else if (flatRes.value > 0.005) {
      handleFlatDiscountValueChange(flatRes.value);
      setFlatDiscountMode(flatRes.mode);
    } else {
      setFlatDiscountValue(0);
      setFlatDiscountMode("percent");
    }

    const effectiveFlatForSnapshot =
      flatRes.percentLooksClean ? Number(sale.flat_discount_amount) || 0 : flatRes.value;

    setSaleReturnAdjust(Number(sale.sale_return_adjust) || 0);
    
    // Set round-off as manual to prevent auto-recalculation from overwriting saved value
    const savedRoundOff = Number(sale.round_off) || 0;
    setRoundOff(savedRoundOff);
    setIsManualRoundOff(true);

    // Restore payment method so mix-payment bills reopen as Mix (not default Cash)
    if (sale.payment_method) {
      setPaymentMethod(sale.payment_method as any);
    }

    const rawInvoiceTs = sale.sale_date ?? sale.created_at;
    setFooterLoadedInvoiceTime(
      rawInvoiceTs ? format(new Date(rawInvoiceTs), "dd/MM/yyyy HH:mm:ss") : null,
    );

    const navTaxType = normalizeGstTaxType((sale as { tax_type?: string }).tax_type);
    setTaxType(navTaxType);
    setCurrentSaleId(sale.id);
    setCurrentInvoiceNumber(sale.sale_number);
    isInitializingEditRef.current = false;

    // Set saved invoice data using actual stored values from DB
    setSavedInvoiceData({
      invoiceNumber: sale.sale_number,
      saleId: sale.id,
      items: loadedItems,
      totals: {
        quantity: loadedItems.reduce((sum, item) => sum + item.quantity, 0),
        mrp: Number(sale.gross_amount),
        discount: Number(sale.discount_amount),
        subtotal: Number(sale.gross_amount) - Number(sale.discount_amount),
      },
      flatDiscountAmount: effectiveFlatForSnapshot,
      saleReturnAdjust: Number(sale.sale_return_adjust) || 0,
      finalAmount: Number(sale.net_amount),
      method: sale.payment_method,
      customerName: sale.customer_name,
      customerPhone: sale.customer_phone,
      paidAmount: Number(sale.paid_amount) || 0,
      previousBalance: 0,
      cashAmount: Number(sale.cash_amount) || 0,
      upiAmount: Number(sale.upi_amount) || 0,
      cardAmount: Number(sale.card_amount) || 0,
      creditAmount: Number((sale as any).credit_amount) || 0,
      salesman: sale.salesman || null,
      taxType: navTaxType,
    });

    toast.success(`Invoice #${sale.sale_number} loaded successfully`);
  };

  const handleDeleteInvoice = async () => {
    if (!currentSaleId) {
      toast.error("No Invoice Selected", { description: "Please load an invoice to delete." });
      return;
    }

    if (!confirm("Are you sure you want to delete this invoice? It will be moved to the recycle bin.")) {
      return;
    }

    try {
      const success = await softDelete('sales', currentSaleId);
      if (success) {
        toast.success("Success", { description: "Invoice moved to recycle bin" });
        setSavedInvoiceData(null);
        queryClient.invalidateQueries({ queryKey: ["today-sales"] });
        handleNewInvoice();
      }
    } catch (error: any) {
      toast.error("Error", { description: error.message });
    }
  };

  const handleInvoiceSearch = async () => {
    if (!invoiceSearchInput.trim()) {
      toast.error("Enter Invoice Number", { description: "Please enter an invoice number to search." });
      return;
    }

    try {
      const { data: sale, error } = await supabase
        .from("sales")
        .select("*, sale_items(*)")
        .eq("organization_id", currentOrganization?.id)
        .eq("sale_number", invoiceSearchInput.trim())
        .maybeSingle();

      if (error) throw error;

      if (!sale) {
        toast.error("Invoice Not Found", { description: `No invoice found with number: ${invoiceSearchInput}` });
        return;
      }

      // Load the found invoice
      loadInvoice(sale);
      setInvoiceSearchInput("");
      
      toast.success(`Invoice ${sale.sale_number} loaded successfully`);
    } catch (error: any) {
      toast.error("Search Error", { description: error.message });
    }
  };

  const handlePreviousInvoice = async () => {
    if (!todaysSales || todaysSales.length === 0) {
      toast.error("No Invoices", { description: "No invoices found for today" });
      return;
    }

    // Sales are ordered DESC (newest at index 0), so Previous goes to higher index (older invoice)
    const newIndex = currentInvoiceIndex < todaysSales.length - 1 ? currentInvoiceIndex + 1 : currentInvoiceIndex;
    if (newIndex === currentInvoiceIndex && currentInvoiceIndex === todaysSales.length - 1) {
      toast.success("First Invoice", { description: "This is the oldest invoice for today" });
      return;
    }
    setCurrentInvoiceIndex(newIndex);
    await loadSaleForEdit(todaysSales[newIndex].id);
  };

  const handleNextInvoice = async () => {
    if (!todaysSales || todaysSales.length === 0) {
      toast.error("No Invoices", { description: "No invoices found for today" });
      return;
    }

    // Sales are ordered DESC (newest at index 0), so Next goes to lower index (newer invoice)
    const newIndex = currentInvoiceIndex > 0 ? currentInvoiceIndex - 1 : currentInvoiceIndex;
    if (newIndex === currentInvoiceIndex && currentInvoiceIndex === 0) {
      toast.success("Last Invoice", { description: "This is the latest invoice for today" });
      return;
    }
    setCurrentInvoiceIndex(newIndex);
    await loadSaleForEdit(todaysSales[newIndex].id);
  };

  const handleLastInvoice = async () => {
    if (!todaysSales || todaysSales.length === 0) {
      toast.error("No Invoices", { description: "No invoices found for today" });
      return;
    }

    setCurrentInvoiceIndex(0);
    await loadSaleForEdit(todaysSales[0].id);
  };

  const handleClearAll = () => {
    if (items.length === 0) {
      toast.success("Cart is already empty");
      return;
    }
    
    setItems([]);
    setCustomerName("");
    setCustomerId("");
    setCustomerPhone("");
    setFlatDiscountValue(0);
    setFlatDiscountMode('percent');
    setSaleReturnAdjust(0);
    setSameBillReturnGross(0);
    setRoundOff(0);
    setRefundAmount(0);
    setCreditApplied(0);
    setAvailableCreditBalance(0);
    setAdvanceApplied(0);
    setAvailableAdvanceBalance(0);
    setOpeningBalanceRemaining(0);
    setSearchInput("");
    setCurrentSaleId(null);
    setOriginalItemsForEdit([]);
    setSelectedSalesman("");
    setSaleNotes("");
    
    toast.success("Cart Cleared", { description: "All items removed from cart" });
  };

  const handleNewInvoice = () => {
    setItems([]);
    setCustomerName("");
    setCustomerId("");
    setCustomerPhone("");
    setFlatDiscountValue(0);
    setFlatDiscountMode('percent');
    setSaleReturnAdjust(0);
    setSameBillReturnGross(0);
    setRoundOff(0);
    setRefundAmount(0);
    setCreditApplied(0);
    setAvailableCreditBalance(0);
    setAdvanceApplied(0);
    setAvailableAdvanceBalance(0);
    setOpeningBalanceRemaining(0);
    setSearchInput("");
    setCurrentInvoiceIndex(0);
    setCurrentSaleId(null);
    setOriginalItemsForEdit([]);
    setCurrentInvoiceNumber("");
    setIsHeldSale(false);
    setSelectedSalesman("");
    setSaleNotes("");
    
    toast.success("New Invoice", { description: "Cart cleared. Ready for new sale." });
    
    // Focus on barcode input for next scan
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  };

  // Filtered held bills + item count helper
  const filteredHeldBills = heldBills.filter((bill: any) => {
    if (!holdSearchQuery.trim()) return true;
    const q = holdSearchQuery.toLowerCase();
    return (
      bill.customer_name?.toLowerCase().includes(q) ||
      bill.sale_number?.toLowerCase().includes(q) ||
      bill.customer_phone?.includes(q)
    );
  });

  const getHoldItemCount = (bill: any) => {
    try {
      const held = (bill as any).held_cart_data;
      if (held?.items && Array.isArray(held.items)) return held.items.length;
      const d = JSON.parse(bill.notes || '{}');
      return d.items?.length || 0;
    } catch { return 0; }
  };

  // Resume a held bill (auto-saves current cart first if needed)
  const handleResumeHeldBill = async (bill: any) => {
    if (items.length > 0 && !isHeldSale) {
      const holdData = {
        customerId: customerId || null,
        customerName: customerName || 'Walk in Customer',
        customerPhone: customerPhone || null,
        items,
        grossAmount: totals.mrp,
        discountAmount: totals.discount,
        flatDiscountPercent,
        flatDiscountAmount,
        saleReturnAdjust,
        roundOff,
        netAmount: finalAmount,
        notes: saleNotes || null,
        taxType,
      };
      await holdSale(holdData);
    }
    setShowHoldPanel(false);
    setHoldSearchQuery('');
    await loadSaleForEdit(bill.id);
    await refetchHeldBills();
  };

  // Delete a held bill (soft delete)
  const handleDeleteHeldBill = async (billId: string) => {
    if (!confirm('Delete this held bill permanently?')) return;
    try {
      await supabase
        .from('sales')
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq('id', billId);
      await refetchHeldBills();
      toast.success('Held bill deleted');
    } catch (err: any) {
      toast.error('Error', { description: err.message });
    }
  };

  const handleHoldBill = async () => {
    if (items.length === 0) {
      toast.error("No Items", { description: "Please add items to the cart before holding" });
      return;
    }

    const saleData = buildSaleData({
      customerId,
      customerName: customerName || "Walk in Customer",
      customerPhone,
      notes: saleNotes || null,
    });

    const result = await holdSale(saleData);
    
    if (result) {
      // Clear cart after holding
      setItems([]);
      setCustomerId("");
      setCustomerName("");
      setCustomerPhone("");
      setFlatDiscountValue(0);
      setFlatDiscountMode('percent');
      setSaleReturnAdjust(0);
      setSameBillReturnGross(0);
      setRoundOff(0);
      setSearchInput("");
      setCurrentSaleId(null);
      setCurrentInvoiceNumber("");
      setIsHeldSale(false);
      setSaleNotes("");
      
      // Refetch today's sales, dashboard data, and held bills
      await queryClient.invalidateQueries({ queryKey: ['todays-sales', currentOrganization?.id] });
      invalidatePosDashboardQueries(queryClient, currentOrganization?.id);
      notifyPosSalesChanged({ organizationId: currentOrganization?.id });
      await queryClient.refetchQueries({ queryKey: ['todays-sales', currentOrganization?.id] });
      await refetchHeldBills();
    }
  };

  // ── WhatsApp Invoice Auto-Send ──
  const sendWhatsAppInvoice = async (
    saleId: string,
    saleNumber: string,
    saleDate: string,
    netAmount: number,
    grossAmount: number,
    discountAmount: number,
    phone: string,
    custName: string,
    salesmanName: string
  ) => {
    if (!waSettings?.is_active) return;
    if (!phone || phone.trim().length < 8) return;

    try {
      const orgSlug = currentOrganization?.slug || '';
      const saleData = {
        sale_id: saleId,
        org_slug: orgSlug,
        sale_number: saleNumber,
        customer_name: resolveWhatsAppCustomerName(custName),
        customer_phone: phone,
        sale_date: saleDate,
        net_amount: netAmount,
        gross_amount: grossAmount,
        discount_amount: discountAmount,
        payment_status: 'paid',
        salesman: salesmanName,
        items_count: items.reduce((s, i) => s + i.quantity, 0),
        organization_name: currentOrganization?.name,
        organization_id: currentOrganization?.id,
        bill_context: 'pos',
        sale_source: 'pos',
      };

      if (isWappConnectSendProvider(waSettings.send_provider)) {
        if (!waSettings.auto_send_invoice) return;
        if (waSettings.send_invoice_pdf === false) return;

        const invoiceDom = invoicePrintRef.current;
        let pdfBase64: string | undefined;
        const shouldAttachPdf =
          netAmount >= (waSettings.pdf_min_amount ?? 0);

        if (shouldAttachPdf && invoiceDom) {
          await new Promise(r => setTimeout(r, 500));
          const waPageFormat =
            posBillFormat === "thermal"
              ? "thermal"
              : posBillFormat === "a5" || posBillFormat === "a5-horizontal"
                ? "a5"
                : "a4";
          pdfBase64 =
            (await captureElementToPdfBase64(invoiceDom, {
              extraSettleMs: 200,
              pageFormat: waPageFormat,
              thermalPaper: posThermalPaper,
              wappConnectPdf: true,
            })) || undefined;
        }

        if (shouldAttachPdf && !pdfBase64) {
          console.error('WhatsApp WappConnect invoice PDF was enabled but PDF generation failed; skipping text-only send.');
          return;
        }

        const invoiceCaption = currentOrganization?.id
          ? await buildSalesInvoiceWhatsAppCaption(
              currentOrganization.id,
              saleData,
              currentOrganization.name || "",
            )
          : `Your invoice ${saleNumber} is attached.`;

        await sendMessageAsync({
          phone,
          message: invoiceCaption,
          templateType: 'sales_invoice',
          referenceId: saleId,
          referenceType: 'sale',
          saleData,
          pdfBlob: pdfBase64,
          documentFilename: `Invoice_${saleNumber.replace(/\//g, '-')}.pdf`,
        });
        return;
      }

      // If send_invoice_pdf is OFF — just send text template
      if (!waSettings.send_invoice_pdf) {
        if (!waSettings.auto_send_invoice || !waSettings.invoice_template_name) return;
        await sendMessageAsync({
          phone,
          message: '',
          templateType: 'sales_invoice',
          templateName: waSettings.invoice_template_name,
          referenceId: saleId,
          referenceType: 'sale',
          saleData,
        });
        return;
      }

      // PDF mode
      const invoiceDom = invoicePrintRef.current;

      if (waSettings.use_document_header_template && waSettings.invoice_document_template_name) {
        // DOCUMENT HEADER TEMPLATE (bypasses 24h window)
        let pdfBase64: string | null = null;
        if (invoiceDom) {
          await new Promise(r => setTimeout(r, 500));
          pdfBase64 = await generateInvoiceBase64(invoiceDom);
        }
        await sendMessageAsync({
          phone,
          message: '',
          templateType: 'sales_invoice',
          templateName: waSettings.invoice_document_template_name,
          referenceId: saleId,
          referenceType: 'sale',
          saleData,
          useDocumentHeaderTemplate: true,
          documentHeaderTemplateName: waSettings.invoice_document_template_name,
          pdfBlob: pdfBase64 || undefined,
        });
      } else {
        // STANDARD ATTACHMENT — text template + separate PDF message
        if (waSettings.invoice_template_name) {
          await sendMessageAsync({
            phone,
            message: '',
            templateType: 'sales_invoice',
            templateName: waSettings.invoice_template_name,
            referenceId: saleId,
            referenceType: 'sale',
            saleData,
          });
        }
        if (invoiceDom) {
          await new Promise(r => setTimeout(r, 300));
          const pdfBase64 = await generateInvoiceBase64(invoiceDom);
          if (pdfBase64) {
            await sendMessageAsync({
              phone,
              message: `📄 Invoice ${saleNumber} — ₹${Math.round(netAmount).toLocaleString('en-IN')}`,
              templateType: 'invoice_pdf',
              referenceId: saleId,
              referenceType: 'sale',
              documentFilename: `Invoice_${saleNumber.replace(/\//g, '-')}.pdf`,
              documentCaption: `Invoice ${saleNumber} — ${custName}`,
              pdfBlob: pdfBase64,
            });
          }
        }
      }
    } catch (err: any) {
      // Non-blocking — log but don't fail the sale
      console.error('WhatsApp invoice send failed:', err);
    }
  };

  const createCustomer = useMutation({
    mutationFn: async (data: typeof newCustomerForm) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      
      const { createOrGetCustomer } = await import("@/utils/customerUtils");
      
      const result = await createOrGetCustomer({
        customer_name: data.customer_name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        gst_number: data.gst_number,
        organization_id: currentOrganization.id,
      });
      
      return { ...result.customer, isExisting: result.isExisting };
    },
    onSuccess: (newCustomer) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer added successfully");
      setCustomerId(newCustomer.id);
      setCustomerName(newCustomer.customer_name);
      setCustomerPhone(newCustomer.phone || "");
      linkedCustomerPhoneRef.current = newCustomer.phone || "";
      setNewCustomerForm({
        customer_name: "",
        phone: "",
        email: "",
        address: "",
        gst_number: "",
      });
      setShowAddCustomerDialog(false);
      
      // Focus on barcode input for scanning
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    },
    onError: (error: any) => {
      toast.error(error?.message || "Error adding customer");
    },
  });

  // Product suggestions come from on-demand server search only
  const filteredProducts = useMemo(() => productSearchResults, [productSearchResults]);

  useEffect(() => {
    if (!openProductSearch || filteredProducts.length === 0) {
      setSelectedProductIndex(0);
      return;
    }
    setSelectedProductIndex((prev) => Math.min(prev, filteredProducts.length - 1));
  }, [openProductSearch, filteredProducts.length]);

  useEffect(() => {
    if (!openProductSearch || filteredProducts.length === 0) return;
    const listEl = productCommandListRef.current;
    if (!listEl) return;
    const selectedEl = listEl.querySelector(`[data-pos-index="${selectedProductIndex}"]`) as HTMLElement | null;
    selectedEl?.scrollIntoView({ block: "nearest" });
  }, [selectedProductIndex, openProductSearch, filteredProducts.length]);

  const creditCustomerRequiredDialog = (
    <AlertDialog open={showCreditCustomerRequiredDialog} onOpenChange={setShowCreditCustomerRequiredDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Customer Details Required</AlertDialogTitle>
          <AlertDialogDescription>
            Customer name is required for Credit / Pay Later invoices and for mix payments that include a credit balance.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setShowCreditCustomerRequiredDialog(false)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setShowCreditCustomerRequiredDialog(false);
              openAddCustomerDialog();
            }}
          >
            Add Customer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const unitPriceConfirmDialog = (
    <AlertDialog
      open={!!unitPriceConfirm}
      onOpenChange={(open) => {
        if (!open) setUnitPriceConfirm(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm low unit price</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Typed unit price is more than {posUnitPriceOverrideConfirmPct}% below MRP.
              </p>
              {unitPriceConfirm && (
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    MRP ₹
                    {unitPriceConfirm.mrp.toLocaleString("en-IN", { maximumFractionDigits: 2 })} → unit ₹
                    {unitPriceConfirm.value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </li>
                  <li>
                    Effective discount{" "}
                    {unitPriceConfirm.pctOff.toLocaleString("en-IN", { maximumFractionDigits: 1 })}% (₹
                    {unitPriceConfirm.rupeesOff.toLocaleString("en-IN", {
                      maximumFractionDigits: 2,
                    })}
                    )
                  </li>
                </ul>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setUnitPriceConfirm(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!unitPriceConfirm) return;
              if (applyUnitPriceToCart(unitPriceConfirm.index, unitPriceConfirm.value)) {
                setUnitPriceDraft(null);
              }
              setUnitPriceConfirm(null);
            }}
          >
            Apply price
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // Tablet POS Layout (iPad)
  if (isTablet && !isMobile) {
    return (
      <>
        <TabletPOSLayout
          items={items}
          totals={totals}
          finalAmount={finalAmount}
          updateQuantity={updateQuantity}
          removeItem={removeItem}
          invoiceNumber={currentInvoiceNumber || nextInvoicePreview}
          customerId={customerId}
          customerName={customerName}
          customerPhone={customerPhone}
          customers={customers || []}
          customerSearchInput={customerName}
          onCustomerSearchChange={(value) => {
            setCustomerName(value);
            setOpenCustomerSearch(true);
          }}
          openCustomerSearch={openCustomerSearch}
          setOpenCustomerSearch={setOpenCustomerSearch}
          onCustomerSelect={(customer) => {
            if (customer) {
              setCustomerId(customer.id);
              setCustomerName(customer.customer_name);
              setCustomerPhone(customer.phone || "");
              linkedCustomerPhoneRef.current = customer.phone || "";
            } else {
              setCustomerId("");
              setCustomerName("");
              setCustomerPhone("");
              linkedCustomerPhoneRef.current = "";
            }
          }}
          onAddCustomer={() => openAddCustomerDialog()}
          searchInput={searchInput}
          onSearchInputChange={(value) => {
            setSearchInput(value);
            if (value.length > 0) setOpenProductSearch(true);
          }}
          onBarcodeSubmit={handlePosBarcodeSubmit}
          barcodeInputRef={barcodeInputRef}
          isSaving={isSaving}
          onPaymentAndPrint={handlePaymentAndPrint}
          onMixPayment={handleMixPayment}
          onHoldBill={handleHoldBill}
          onClear={handleClearAll}
          onNewBill={handleNewInvoice}
          onSaleReturn={() => setShowFloatingSaleReturn(true)}
          flatDiscountValue={flatDiscountValue}
          flatDiscountMode={flatDiscountMode}
          saleReturnAdjust={saleReturnAdjust}
          onFlatDiscountValueChange={handleFlatDiscountValueChange}
          onFlatDiscountModeChange={setFlatDiscountMode}
          selectedSalesman={selectedSalesman}
          setSelectedSalesman={setSelectedSalesman}
          salesmen={employees || []}
          note={saleNotes}
          setNote={setSaleNotes}
          roundOff={roundOff}
          setRoundOff={setRoundOff}
          filteredProducts={filteredProducts}
          onProductSelect={handlePosProductPick}
          fastBillingEnabled={posRuntimeSettings?.pos_quick_price_code === true}
          openProductSearch={openProductSearch}
          selectedProductType={selectedProductType}
          onProductTypeChange={setSelectedProductType}
          hasMoreCustomers={hasMoreCustomers}
          onCashierReport={() => setShowFloatingCashierReport(true)}
          onEstimatePrint={() => handleEstimatePrintRef.current?.()}
          onStockReport={() => setShowFloatingStockReport(true)}
          onAddNewCustomer={() => openAddCustomerDialog()}
          enableMrp={enableMrp}
        />

        {/* Dialogs needed for tablet too */}
        <MixPaymentDialog
          open={showMixPaymentDialog}
          onOpenChange={setShowMixPaymentDialog}
          billAmount={mixDialogBillAmount}
          creditApplied={creditApplied}
          advanceApplied={advanceApplied}
          exchangeBreakdown={
            exchangeRefundDue > 0.01
              ? { returnTotal: saleReturnAdjust, applied: exchangeSrApplied, refundDue: exchangeRefundDue }
              : null
          }
          initialBreakdown={mixPaymentInitialBreakdown}
          onSave={handleMixPaymentSave}
        />
        <FloatingSaleReturn
          open={showFloatingSaleReturn}
          onOpenChange={setShowFloatingSaleReturn}
          organizationId={currentOrganization?.id || ""}
          customerId={customerId}
          customerName={customerName || undefined}
          posCurrentSaleId={currentSaleId}
          onReturnSaved={handleSaleReturnSavedToBill}
        />
        <Dialog open={showAddCustomerDialog} onOpenChange={setShowAddCustomerDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="tablet_customer_name">Name *</Label>
                <Input id="tablet_customer_name" value={newCustomerForm.customer_name} onChange={(e) => setNewCustomerForm(prev => ({ ...prev, customer_name: e.target.value }))} placeholder="Customer name" autoFocus />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tablet_phone">Mobile</Label>
                <Input id="tablet_phone" value={newCustomerForm.phone} onChange={(e) => setNewCustomerForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="Mobile number (optional)" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tablet_address">Address</Label>
                <Input id="tablet_address" value={newCustomerForm.address} onChange={(e) => setNewCustomerForm(prev => ({ ...prev, address: e.target.value }))} placeholder="Address (optional)" />
              </div>
            </div>
            <Button onClick={() => createCustomer.mutate(newCustomerForm)} disabled={!newCustomerForm.customer_name.trim()}>Save Customer</Button>
          </DialogContent>
        </Dialog>

        {posPrintPortal}

        {creditCustomerRequiredDialog}
        {unitPriceConfirmDialog}
      </>
    );
  }

  // Mobile POS Layout
  if (isMobile) {
    return (
      <>
        <MobilePOSLayout
          items={items}
          totals={totals}
          finalAmount={finalAmount}
          updateQuantity={updateQuantity}
          removeItem={removeItem}
          invoiceNumber={currentInvoiceNumber || nextInvoicePreview}
          customerId={customerId}
          customerName={customerName}
          customerPhone={customerPhone}
          customers={customers || []}
          customerSearchInput={customerName}
          onCustomerSearchChange={(value) => {
            setCustomerName(value);
            setOpenCustomerSearch(true);
          }}
          openCustomerSearch={openCustomerSearch}
          setOpenCustomerSearch={setOpenCustomerSearch}
          onCustomerSelect={(customer) => {
            if (customer) {
              setCustomerId(customer.id);
              setCustomerName(customer.customer_name);
              setCustomerPhone(customer.phone || "");
              linkedCustomerPhoneRef.current = customer.phone || "";
            } else {
              setCustomerId("");
              setCustomerName("");
              setCustomerPhone("");
              linkedCustomerPhoneRef.current = "";
            }
          }}
          onAddCustomer={() => openAddCustomerDialog()}
          searchInput={searchInput}
          onSearchInputChange={(value) => {
            setSearchInput(value);
            // Open product search if typing
            if (value.length > 0) {
              setOpenProductSearch(true);
            }
          }}
          onBarcodeSubmit={handlePosBarcodeSubmit}
          barcodeInputRef={barcodeInputRef}
          isSaving={isSaving}
          onPaymentAndPrint={handlePaymentAndPrint}
          onMixPayment={handleMixPayment}
          onHoldBill={handleHoldBill}
          showMobilePaymentSheet={showMobilePaymentSheet}
          setShowMobilePaymentSheet={setShowMobilePaymentSheet}
          selectedProductType={selectedProductType}
          onProductTypeChange={setSelectedProductType}
          hasMoreCustomers={hasMoreCustomers}
          flatDiscountValue={flatDiscountValue}
          flatDiscountMode={flatDiscountMode}
          saleReturnAdjust={saleReturnAdjust}
          onFlatDiscountValueChange={handleFlatDiscountValueChange}
          onFlatDiscountModeChange={setFlatDiscountMode}
          onSaleReturn={() => setShowFloatingSaleReturn(true)}
          onAdvanceBooking={() => setShowAdvanceBooking(true)}
          filteredProducts={filteredProducts}
          onProductSelect={handlePosProductPick}
          openProductSearch={openProductSearch}
          enableMrp={enableMrp}
          fastBillingEnabled={posRuntimeSettings?.pos_quick_price_code === true}
        />

        {/* Dialogs needed for mobile too */}
        <MixPaymentDialog
          open={showMixPaymentDialog}
          onOpenChange={setShowMixPaymentDialog}
          billAmount={mixDialogBillAmount}
          creditApplied={creditApplied}
          advanceApplied={advanceApplied}
          exchangeBreakdown={
            exchangeRefundDue > 0.01
              ? { returnTotal: saleReturnAdjust, applied: exchangeSrApplied, refundDue: exchangeRefundDue }
              : null
          }
          initialBreakdown={mixPaymentInitialBreakdown}
          onSave={handleMixPaymentSave}
        />

        {/* Floating Sale Return for mobile */}
        <FloatingSaleReturn
          open={showFloatingSaleReturn}
          onOpenChange={setShowFloatingSaleReturn}
          organizationId={currentOrganization?.id || ""}
          customerId={customerId}
          customerName={customerName || undefined}
          posCurrentSaleId={currentSaleId}
          onReturnSaved={handleSaleReturnSavedToBill}
        />

        {/* Advance Booking Dialog - Mobile */}
        <AddAdvanceBookingDialog
          open={showAdvanceBooking}
          onOpenChange={setShowAdvanceBooking}
          organizationId={currentOrganization?.id || ""}
        />

        {/* Add Customer Dialog */}
        <Dialog open={showAddCustomerDialog} onOpenChange={setShowAddCustomerDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Add New Customer
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="customer_name">Name *</Label>
                <Input
                  id="customer_name"
                  value={newCustomerForm.customer_name}
                  onChange={(e) => setNewCustomerForm(prev => ({ ...prev, customer_name: e.target.value }))}
                  placeholder="Customer name"
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Mobile</Label>
                <Input
                  id="phone"
                  value={newCustomerForm.phone}
                  onChange={(e) => setNewCustomerForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="Mobile number (optional)"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={newCustomerForm.address}
                  onChange={(e) => setNewCustomerForm(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Address (optional)"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddCustomerDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createCustomer.mutate(newCustomerForm)}
                disabled={!newCustomerForm.customer_name.trim()}
              >
                Add Customer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        {creditCustomerRequiredDialog}
        {unitPriceConfirmDialog}

        {/* Print Confirmation Dialog */}
        <AlertDialog open={showPrintConfirmDialog} onOpenChange={setShowPrintConfirmDialog}>
          <AlertDialogContent onOpenAutoFocus={(e) => { e.preventDefault(); setTimeout(() => printBtnRef.current?.focus(), 50); }}>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-600" />
                Invoice Saved!
              </AlertDialogTitle>
              <AlertDialogDescription>
                Invoice {savedInvoiceData?.invoiceNumber} saved successfully.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-2">
              <AlertDialogCancel onClick={() => {
                refreshPosAfterBillPrint();
                setShowPrintConfirmDialog(false);
                setSavedInvoiceData(null);
                barcodeInputRef.current?.focus();
              }}>
                New Bill
              </AlertDialogCancel>
              <Button 
                variant="outline" 
                className="flex items-center gap-2"
                onClick={() => {
                  handleWhatsAppShare();
                  refreshPosAfterBillPrint();
                  setShowPrintConfirmDialog(false);
                  setSavedInvoiceData(null);
                }}
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
              <AlertDialogAction ref={printBtnRef} onClick={handlePrintFromDialog}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {posPrintPortal}
      </>
    );
  }

  // Desktop POS Layout
  return (
    <div
      className={cn(
        "pos-sales-workspace flex-1 min-h-0 h-full w-full bg-background flex items-stretch overflow-hidden pos-desktop-readable",
        !webDesktopPos && "pos-sales-readable",
      )}
    >
      {/* Left Action Button Bar */}
      <div className="w-[clamp(76px,6.4vw,96px)] self-stretch min-h-0 bg-slate-50 dark:bg-slate-900 border-r border-border/60 flex flex-col gap-1.5 p-1.5 z-30 relative overflow-y-auto shrink-0">
        {/* Buttons in sequence: Cash, UPI, Card, Credit, Mix, Hold, New, Last, Print, Clear, WhatsApp */}
        {/* flex-fill: the 13 buttons divide the column height so they always fit
            (no scroll, no manual browser zoom) on any screen — 1366×768 included.
            min-h floors + the column's overflow-y-auto guard very short screens. */}
        <div className="flex-1 min-h-0 flex flex-col gap-1.5">
          {/* 1. Cash F1 */}
          <Button
            onClick={() => handlePaymentAndPrint('cash')}
            disabled={items.length === 0 || isSaving}
            className="flex-[1.15] min-h-[38px] flex flex-col items-center justify-center gap-1 text-[clamp(10px,0.85vw,13px)] font-semibold relative w-full rounded-lg bg-green-500 hover:bg-green-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Cash Payment - Save & Print (F1)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F1</Badge>
            <Banknote className="h-4 w-4" />
            <span>Cash</span>
          </Button>
          
          {/* 2. UPI F2 */}
          <Button
            onClick={() => handlePaymentAndPrint('upi')}
            disabled={items.length === 0 || isSaving}
            className="flex-[1.15] min-h-[38px] flex flex-col items-center justify-center gap-1 text-[clamp(10px,0.85vw,13px)] font-semibold relative w-full rounded-lg bg-purple-500 hover:bg-purple-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="UPI Payment - Save & Print (F2)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F2</Badge>
            <Smartphone className="h-4 w-4" />
            <span>UPI</span>
          </Button>
          
          {/* 3. Card F3 */}
          <Button
            onClick={() => handlePaymentAndPrint('card')}
            disabled={items.length === 0 || isSaving}
            className="flex-[1.15] min-h-[38px] flex flex-col items-center justify-center gap-1 text-[clamp(10px,0.85vw,13px)] font-semibold relative w-full rounded-lg bg-cyan-500 hover:bg-cyan-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Card Payment - Save & Print (F3)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F3</Badge>
            <CreditCard className="h-4 w-4" />
            <span>Card</span>
          </Button>
          
          {/* 4. Credit F4 */}
          <Button
            onClick={() => handlePaymentAndPrint('pay_later')}
            disabled={items.length === 0 || isSaving}
            className="flex-[1.15] min-h-[38px] flex flex-col items-center justify-center gap-1 text-[clamp(10px,0.85vw,13px)] font-semibold relative w-full rounded-lg bg-orange-500 hover:bg-orange-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Credit - Pay Later (F4)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F4</Badge>
            <Clock className="h-4 w-4" />
            <span>Credit</span>
          </Button>
          
          {/* 5. Sale Return F5 */}
          <Button
            onClick={() => setShowFloatingSaleReturn(true)}
            className="flex-1 min-h-[34px] flex flex-col items-center justify-center gap-0.5 text-[clamp(9px,0.78vw,12px)] font-semibold relative w-full rounded-lg bg-red-500 hover:bg-red-600 active:scale-95 text-white shadow-sm transition-all duration-150"
            title="Sale Return (F5)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F5</Badge>
            <RotateCcw className="h-4 w-4" />
            <span>S/R</span>
          </Button>
          
          {/* 6. Mix F6 */}
          <Button
            onClick={handleMixPayment}
            disabled={items.length === 0 || isSaving}
            className="flex-[1.15] min-h-[38px] flex flex-col items-center justify-center gap-1 text-[clamp(10px,0.85vw,13px)] font-semibold relative w-full rounded-lg bg-violet-500 hover:bg-violet-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Mix Payment - Save & Print (F6)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F6</Badge>
            <Wallet className="h-4 w-4" />
            <span>Mix</span>
          </Button>
          
          {/* 7. Hold F7 */}
          <Button
            onClick={() => {
              if (items.length === 0 || isHeldSale) {
                setShowHoldPanel(true);
              } else {
                handleHoldBill();
              }
            }}
            disabled={isSaving}
            className="flex-1 min-h-[34px] flex flex-col items-center justify-center gap-0.5 text-[clamp(9px,0.78vw,12px)] font-semibold relative w-full rounded-lg bg-amber-500 hover:bg-amber-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Hold Bill (F7)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F7</Badge>
            {heldBills.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center z-10">
                {heldBills.length > 9 ? '9+' : heldBills.length}
              </span>
            )}
            <Pause className="h-4 w-4" />
            <span>Hold</span>
          </Button>
          
          {/* 9. Estimate F9 */}
          <Button
            onClick={handleEstimatePrint}
            disabled={items.length === 0}
            className="flex-1 min-h-[34px] flex flex-col items-center justify-center gap-0.5 text-[clamp(9px,0.78vw,12px)] font-semibold relative w-full rounded-lg bg-sky-500 hover:bg-sky-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Print Estimate - No Save (F9)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F9</Badge>
            <FileText className="h-4 w-4" />
            <span>Estimate</span>
          </Button>
          
          <Button
            onClick={handleNewInvoice}
            className="flex-1 min-h-[34px] flex flex-col items-center justify-center gap-0.5 text-[clamp(9px,0.78vw,12px)] font-semibold w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white shadow-sm transition-all duration-150"
            title="New Invoice"
          >
            <FileText className="h-4 w-4" />
            <span>New</span>
          </Button>
          
          {/* 8. Last - matches Dashboard "Total Bills" blue-500 */}
          <Button
            onClick={handleLastInvoice}
            disabled={!todaysSales || todaysSales.length === 0}
            className={cn(
              "flex-1 min-h-[34px] flex flex-col items-center justify-center gap-0.5 text-[clamp(9px,0.78vw,12px)] font-semibold w-full rounded-lg bg-blue-500 hover:bg-blue-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40",
              todaysSales && todaysSales.length > 0 && currentInvoiceIndex === 0 && "ring-2 ring-white/80 bg-blue-700 hover:bg-blue-700"
            )}
            title="Last Invoice"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Last</span>
          </Button>
          
          {/* 9. Print last saved invoice - never prints unsaved cart */}
          <Button
            onClick={() => {
              if (savedInvoiceData?.saleId && savedInvoiceData?.invoiceNumber) {
                handlePrintFromDialog();
              } else {
                toast.error("No saved invoice to print", {
                  description:
                    "Complete payment (Cash/UPI/Card/Credit/Mix) first, or use Estimate (F9) for an unsaved draft.",
                });
              }
            }}
            disabled={!savedInvoiceData?.saleId}
            className="flex-[1.15] min-h-[38px] flex flex-col items-center justify-center gap-1 text-[clamp(10px,0.85vw,13px)] font-semibold w-full rounded-lg bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Reprint Last Saved Invoice"
          >
            <Printer className="h-4 w-4" />
            <span>Reprint</span>
          </Button>
          
          {/* Advance Booking */}
          <Button
            onClick={() => setShowAdvanceBooking(true)}
            className="flex-1 min-h-[34px] flex flex-col items-center justify-center gap-0.5 text-[clamp(9px,0.78vw,12px)] font-semibold w-full rounded-lg bg-purple-500 hover:bg-purple-600 active:scale-95 text-white shadow-sm transition-all duration-150"
            title="Advance Booking Dashboard"
          >
            <BookmarkPlus className="h-4 w-4" />
            <span>Advance</span>
          </Button>

          {/* 10. Clear - matches Dashboard "With Refunds" rose-500 */}
          <Button
            onClick={handleClearAll}
            className="flex-1 min-h-[34px] flex flex-col items-center justify-center gap-0.5 text-[clamp(9px,0.78vw,12px)] font-semibold relative w-full rounded-lg bg-rose-500 hover:bg-rose-600 active:scale-95 text-white shadow-sm transition-all duration-150"
            title="Clear (Esc)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">ESC</Badge>
            <X className="h-4 w-4" />
            <span>Clear</span>
          </Button>
          
        </div>
      </div>

      {/* Main column — toolbar/body/footer absolutely positioned (same pattern as Sales Invoice) */}
      <div className="pos-sales-main flex-1 min-h-0 h-full min-w-0 overflow-hidden">
        <div className="hidden lg:block shrink-0 z-20">
          <WindowTabsBar className="erp-window-tabs--medium" />
        </div>
        {/* Sticky Header Section - Barcode scanning bar stays fixed */}
        <div className="pos-sales-toolbar z-20 bg-background border-b border-border/60 shadow-sm px-2 md:px-3 py-1.5">
          <div className="flex flex-nowrap items-end gap-2 md:gap-3 overflow-x-auto overflow-y-hidden">
          <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
            <PopoverTrigger asChild>
              <div className="relative w-60 shrink-0">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Barcode</Label>
                <div className="flex gap-1">
                  <div className="relative flex-1">
                    <Input
                      ref={barcodeInputRef}
                      placeholder={mobileERP.enabled && mobileERP.imei_scan_enforcement ? "Scan IMEI Number" : "Scan barcode or search: name / brand / category / style / color / size / price (use spaces to combine)"}
                      value={searchInput}
                      onChange={handleBarcodeInputChange}
                      onBlur={handleBarcodeInputBlur}
                      onKeyDown={(e) => {
                        const rawValue =
                          (e.currentTarget as HTMLInputElement)?.value?.trim() || searchInput.trim();
                        const isEnter =
                          e.key === "Enter" || e.key === "Go" || (e as any).keyCode === 13;
                        if (isEnter && rawValue) {
                          if (
                            posRuntimeSettingsRef.current?.pos_quick_price_code === true &&
                            parsePosQuickPriceCode(rawValue)
                          ) {
                            e.preventDefault();
                            clearPosBarcodeSubmitTimers();
                            markSubmitted(rawValue);
                            setOpenProductSearch(false);
                            void searchAndAddProduct(rawValue);
                            resetScannerDetection();
                            return;
                          }
                          // Barcode / SKU typed in search — exact add for all orgs (not dropdown first hit).
                          if (shouldPosEnterUseExactBarcodeLookup(rawValue)) {
                            e.preventDefault();
                            clearPosBarcodeSubmitTimers();
                            markSubmitted(rawValue);
                            setOpenProductSearch(false);
                            void searchAndAddProduct(rawValue);
                            resetScannerDetection();
                            return;
                          }
                        }
                        if (openProductSearch && filteredProducts.length > 0) {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setSelectedProductIndex((prev) => Math.min(prev + 1, filteredProducts.length - 1));
                            return;
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setSelectedProductIndex((prev) => Math.max(prev - 1, 0));
                            return;
                          }
                          if (isEnter) {
                            e.preventDefault();
                            const selected = filteredProducts[selectedProductIndex] || filteredProducts[0];
                            if (selected?.product && selected?.variant) {
                              clearPosBarcodeSubmitTimers();
                              markSubmitted(rawValue);
                              const variantForCart =
                                selected.displayBarcode &&
                                selected.displayBarcode !== selected.variant.barcode
                                  ? { ...selected.variant, barcode: selected.displayBarcode }
                                  : selected.variant;
                              const barcodeExact =
                                rawValue &&
                                variantForCart.barcode &&
                                variantForCart.barcode.trim().toLowerCase() ===
                                  rawValue.trim().toLowerCase();
                              const quickOverride =
                                selected.quickPriceOverride ??
                                (posRuntimeSettingsRef.current?.pos_quick_price_code === true &&
                                parsePosQuickPriceCode(rawValue)
                                  ? resolvePosQuickPriceCartOverride(
                                      selected.product,
                                      variantForCart,
                                      parsePosQuickPriceCode(rawValue)!.price,
                                    )
                                  : undefined);
                              void addItemToCart(
                                selected.product,
                                variantForCart,
                                quickOverride,
                                barcodeExact ? "barcode" : "manual",
                              );
                              setOpenProductSearch(false);
                              setSearchInput("");
                              setTimeout(() => barcodeInputRef.current?.focus(), 50);
                              return;
                            }
                          }
                        }
                        handleSearch(e);
                      }}
                      className="h-10 text-base pr-10 border-border/80 focus:border-primary"
                      autoFocus
                    />
                    <Scan className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
                  </div>
                  <CameraScanButton
                    onBarcodeScanned={(barcode) => {
                      const trimmed = barcode.trim();
                      if (!trimmed) return;
                      clearPosBarcodeSubmitTimers();
                      markSubmitted(trimmed);
                      setSearchInput("");
                      searchAndAddProduct(trimmed);
                      setTimeout(() => barcodeInputRef.current?.focus(), 50);
                    }}
                    className="h-10 w-10 shrink-0"
                  />
                </div>
              </div>
            </PopoverTrigger>
             <PopoverContent 
              className="w-[480px] p-0 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md shadow-lg" 
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <Command shouldFilter={false}>
                {/* Hidden input to satisfy cmdk internals - main input is outside popover */}
                <div className="hidden">
                  <CommandInput value={searchInput} onValueChange={() => {}} />
                </div>
                <CommandList ref={productCommandListRef}>
                  {isProductSearchLoading ? (
                    <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Searching products...
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">No products found.</div>
                   ) : (
                    <>
                      <div className="px-3 py-1.5 text-xs text-muted-foreground border-b bg-muted/40 flex items-center justify-between">
                        <span>
                          {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} found
                          {filteredProducts.length > 20 && ` — showing top 20`}
                        </span>
                        <span className="text-[10px] opacity-70">
                          {posRuntimeSettings?.pos_quick_price_code === true &&
                          posFastBillingUsesDropdownPick(searchInput, true)
                            ? 'Fast billing: pick brand + price, or type J900 for instant add'
                            : 'Tip: Use multiple words to narrow down (e.g. "top black 1350")'}
                        </span>
                      </div>
                      <CommandGroup heading="Products">
                        {filteredProducts.slice(0, 20).map((item: any, index: number) => {
                          const product = item.product;
                          const rowSalePrice =
                            item.displaySalePrice ?? (Number(item.variant.sale_price) || 0);
                          const fastBillingRow =
                            posRuntimeSettings?.pos_quick_price_code === true &&
                            posFastBillingUsesDropdownPick(searchInput, true);
                          const fastBillingMeta = fastBillingRow
                            ? posFastBillingMetaLabel(product)
                            : "";
                          return (
                            <CommandItem
                              key={`${product.id}-${item.variant.id}-${index}`}
                              value={item.searchText}
                              data-pos-index={index}
                              onSelect={() => {
                                const variantForCart =
                                  item.displayBarcode &&
                                  item.displayBarcode !== item.variant.barcode
                                    ? { ...item.variant, barcode: item.displayBarcode }
                                    : item.variant;
                                const quickOverride =
                                  item.quickPriceOverride ??
                                  (posRuntimeSettingsRef.current?.pos_quick_price_code === true &&
                                  parsePosQuickPriceCode(searchInput)
                                    ? resolvePosQuickPriceCartOverride(
                                        product,
                                        variantForCart,
                                        parsePosQuickPriceCode(searchInput)!.price,
                                      )
                                    : undefined);
                                void addItemToCart(product, variantForCart, quickOverride);
                              }}
                              className={`cursor-pointer group text-slate-900 dark:text-slate-100 transition-colors border-b border-slate-100 dark:border-slate-800 data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground ${
                                index === selectedProductIndex
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <Check className="mr-2 h-4 w-4 opacity-0" />
                              <div className="flex flex-col flex-1 gap-0.5">
                                <span className="font-medium text-slate-900 dark:text-white group-data-[selected=true]:text-white">{product.product_name}</span>
                                {fastBillingRow ? (
                                  <div className="flex flex-wrap items-center gap-2 text-sm">
                                    {fastBillingMeta && (
                                      <span className="font-semibold text-blue-700 dark:text-blue-300 group-data-[selected=true]:text-white">
                                        {fastBillingMeta}
                                      </span>
                                    )}
                                    <span className="font-bold tabular-nums text-primary group-data-[selected=true]:text-white">
                                      ₹{rowSalePrice}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground group-data-[selected=true]:text-white/80">
                                      Size {item.variant.size}
                                    </span>
                                    {(() => {
                                      const stockDisp = displaySaleStockQty(product.product_type, item.variant.stock_qty);
                                      return (
                                        <span className={(stockDisp > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive") + " text-[11px] group-data-[selected=true]:text-white"}>
                                          Stock: {stockDisp}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                ) : (
                                  <>
                                {item.matchedOn && item.matchedOn.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mb-0.5">
                                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground group-data-[selected=true]:text-white/80 mr-1 flex items-center">
                                      Matched:
                                    </span>
                                    {item.matchedOn.map((m: string) => (
                                      <span
                                        key={m}
                                        className="text-[10px] bg-primary/10 text-primary border border-primary/30 px-1.5 py-0 rounded font-medium group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white group-data-[selected=true]:border-white/40"
                                      >
                                        {m}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <div className="flex flex-wrap gap-1">
                                  {product.brand && (
                                    <span className="text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-1 py-0.5 rounded group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white group-data-[selected=true]:border-white/40">
                                      {product.brand}
                                    </span>
                                  )}
                                  {product.category && (
                                    <span className="text-[10px] bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-1 py-0.5 rounded group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white group-data-[selected=true]:border-white/40">
                                      {product.category}
                                    </span>
                                  )}
                                  {product.style && (
                                    <span className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1 py-0.5 rounded group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white group-data-[selected=true]:border-white/40">
                                      {product.style}
                                    </span>
                                  )}
                                  {item.variant.color && item.variant.color !== '-' && (
                                    <span className="text-[10px] bg-muted text-muted-foreground px-1 py-0.5 rounded group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white">
                                      {item.variant.color}
                                    </span>
                                  )}
                                  <span className="text-[10px] bg-muted text-muted-foreground px-1 py-0.5 rounded font-mono group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white">
                                    Size: {item.variant.size}
                                  </span>
                                </div>
                                 <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 group-data-[selected=true]:text-white/90">
                                  {formatPosCartBarcode(item.displayBarcode ?? item.variant.barcode) && (
                                    <span className="font-mono text-xs">{formatPosCartBarcode(item.displayBarcode ?? item.variant.barcode)}</span>
                                  )}
                                  <span className="font-semibold text-primary group-data-[selected=true]:text-white">₹{rowSalePrice}</span>
                                  {enableMrp && item.variant.mrp && item.variant.mrp > rowSalePrice && (
                                    <span className="text-[10px] line-through text-slate-500 dark:text-slate-400 group-data-[selected=true]:text-white/70">
                                      MRP ₹{item.variant.mrp}
                                    </span>
                                  )}
                                  {(() => {
                                    const stockDisp = displaySaleStockQty(product.product_type, item.variant.stock_qty);
                                    return (
                                  <span className={(stockDisp > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive") + " group-data-[selected=true]:text-white"}>
                                    Stock: {stockDisp}
                                  </span>
                                    );
                                  })()}
                                </div>
                                {item.variant.batch_stock && item.variant.batch_stock.length > 0 && (
                                  <span className="text-xs text-foreground/60 group-data-[selected=true]:text-accent-foreground/70">
                                    <span className="font-semibold">Bills: </span>
                                    {item.variant.batch_stock
                                      .slice(0, 3)
                                      .map((batch: any, idx: number) => (
                                        <span key={batch.bill_number} className="font-mono">
                                          {batch.bill_number}({batch.quantity})
                                          {idx < Math.min(item.variant.batch_stock.length - 1, 2) ? ', ' : ''}
                                        </span>
                                      ))}
                                    {item.variant.batch_stock.length > 3 && (
                                      <span> +{item.variant.batch_stock.length - 3} more</span>
                                    )}
                                  </span>
                                )}
                                  </>
                                )}
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          
          <Popover open={openCustomerSearch} onOpenChange={setOpenCustomerSearch}>
            <PopoverTrigger asChild>
              <div className="relative w-72 shrink-0">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer Name</Label>
                </div>
                <Input
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setOpenCustomerSearch(true);
                  }}
                  className="h-10 text-base pr-20 border-border/80 focus:border-primary"
                  placeholder="Enter customer name or phone"
                />
                {customerName && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-8 top-1/2 translate-y-0.5 h-8 w-8"
                    onClick={() => {
                      setCustomerName("");
                      setCustomerId("");
                      setCustomerPhone("");
                      linkedCustomerPhoneRef.current = "";
                    }}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 top-1/2 translate-y-0.5 h-8 w-8"
                  onClick={() => openAddCustomerDialog()}
                  title="Add New Customer"
                >
                  <UserPlus className="h-5 w-5" />
                </Button>
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0 z-50" align="start">
              <Command shouldFilter={false}>
                <CommandInput 
                  placeholder="Search by name, phone, or email..." 
                  value={customerName}
                  onValueChange={setCustomerName}
                />
                <CommandList>
                  {isCustomersLoading || balancesLoading ? (
                    <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {isCustomersLoading ? "Loading customers..." : "Loading balances..."}
                    </div>
                  ) : isCustomersError ? (
                    <div className="flex flex-col items-center justify-center p-4 text-sm">
                      <div className="flex items-center text-destructive mb-2">
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Error loading customers
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => refetchCustomers()}
                        className="text-xs"
                      >
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <>
                      <CommandEmpty>No customers found.</CommandEmpty>
                      <CommandGroup heading={`Customers (${customers?.length || 0})${hasMoreCustomers ? ' - refine search for more' : ''}`}>
                        {filteredCustomers.map((customer: any) => {
                          const balance = getCustomerBalance(customer);
                          const advanceAmt = getCustomerAdvance(customer.id);
                          const creditNoteAmt = getCustomerCreditNote(customer.id);
                          return (
                            <CommandItem
                              key={customer.id}
                              value={`${customer.customer_name} ${customer.phone || ''} ${customer.email || ''}`}
                            onSelect={() => {
                                customerJustSelected.current = true;
                                setCustomerId(customer.id);
                                setCustomerName(customer.customer_name);
                                setCustomerPhone(customer.phone || "");
                                linkedCustomerPhoneRef.current = customer.phone || "";
                                setOpenCustomerSearch(false);
                                setTimeout(() => { customerJustSelected.current = false; }, 500);
                              }}
                              className="cursor-pointer"
                            >
                              <Check className="mr-2 h-4 w-4 opacity-0" />
                              <div className="flex flex-col flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{customer.customer_name}</span>
                                  <div className="flex items-center gap-1.5">
                                    {advanceAmt > 0 && (
                                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600">
                                        ₹{advanceAmt.toLocaleString('en-IN')} Adv
                                      </span>
                                    )}
                                    {creditNoteAmt > 0 && (
                                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600">
                                        ₹{creditNoteAmt.toLocaleString('en-IN')} CN
                                      </span>
                                    )}
                                    {balance !== 0 && (
                                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                        balance > 0 
                                          ? 'bg-destructive/10 text-destructive' 
                                          : 'bg-green-500/10 text-green-600'
                                      }`}>
                                        ₹{Math.abs(balance).toLocaleString('en-IN')} {balance > 0 ? 'Due' : 'Cr'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span className="text-sm text-muted-foreground">
                                  {customer.phone && `Phone: ${customer.phone}`}
                                  {customer.email && ` | Email: ${customer.email}`}
                                </span>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Walk-in WhatsApp number — does not create a customers row */}
          <div className="relative w-40 shrink-0">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
              Mobile
            </Label>
            <CustomerPhoneLookupInput
              value={customerPhone}
              onChange={handleInlinePhoneChange}
              placeholder="WhatsApp no."
              className="h-10 text-base border-border/80 focus:border-primary font-mono tabular-nums"
              onExistingCustomerSelect={applyCustomerFromPhoneLookup}
              onUniqueExactMatch={applyCustomerFromPhoneLookup}
            />
          </div>
          
          {/* Customer Discount & Points moved to bottom after Note section */}

          {/* GST Type — Tally tax invoice / billing */}
          <div className="w-36 shrink-0">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">GST Type</Label>
            <Select value={taxType} onValueChange={(v) => setTaxType(normalizeGstTaxType(v))}>
              <SelectTrigger className="h-10 text-xs border-border/80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inclusive">Inclusive</SelectItem>
                <SelectItem value="exclusive">Exclusive</SelectItem>
                <SelectItem value="no_gst">Without GST</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Salesperson Search - After Customer Name */}
          <Popover
            open={openSalesmanSearch}
            onOpenChange={(open) => {
              setOpenSalesmanSearch(open);
              if (!open) {
                setSalesmanSearchInput("");
                // Return cursor to barcode — Esc or select (scanner must not type into filter).
                focusBarcodeScanInput();
              }
            }}
          >
            <PopoverTrigger asChild>
              <div className="relative w-36 shrink-0">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Salesperson</Label>
                <Input
                  value={selectedSalesman}
                  onChange={(e) => {
                    setSelectedSalesman(e.target.value);
                    setOpenSalesmanSearch(true);
                  }}
                  className="h-10 text-sm pr-8 border-border/80 focus:border-primary"
                  placeholder="Select..."
                />
                {selectedSalesman && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-1 top-1/2 translate-y-0.5 h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSalesman("");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </PopoverTrigger>
            <PopoverContent
              className="w-[250px] p-0 z-50"
              align="start"
              data-pos-salesman-picker
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                focusBarcodeScanInput();
              }}
            >
              <Command shouldFilter={false}>
                <CommandInput 
                  placeholder="Search employee..." 
                  value={salesmanSearchInput}
                  onValueChange={setSalesmanSearchInput}
                />
                <CommandList>
                  <CommandEmpty>No employees found.</CommandEmpty>
                  <CommandGroup heading="Employees">
                    {filteredEmployees.map((emp: any) => (
                      <CommandItem
                        key={emp.id}
                        value={emp.employee_name}
                        onSelect={() => {
                          setSelectedSalesman(emp.employee_name);
                          setOpenSalesmanSearch(false);
                          setSalesmanSearchInput("");
                          focusBarcodeScanInput();
                        }}
                        className="cursor-pointer"
                      >
                        <Check className={`mr-2 h-4 w-4 ${selectedSalesman === emp.employee_name ? 'opacity-100' : 'opacity-0'}`} />
                        <div className="flex flex-col">
                          <span className="font-medium">{emp.employee_name}</span>
                          {emp.designation && (
                            <span className="text-xs text-muted-foreground">{emp.designation}</span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Invoice Number Display */}
          <div className="relative w-40 shrink-0">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Invoice No</Label>
            <Input
              value={currentInvoiceNumber || nextInvoicePreview || "NEW"}
              readOnly
              className="h-10 text-sm font-semibold text-center bg-muted/50 border-border/80"
              placeholder="Invoice #"
            />
          </div>
          
          {/* Running Total Display */}
          <div className="h-10 bg-gradient-to-r from-green-600 to-emerald-600 rounded-md px-3 flex items-center justify-center min-w-[120px] shadow-sm shrink-0">
            <div className="text-white font-bold text-base tracking-tight">
              ₹{formatINR2(finalAmount)}
            </div>
          </div>
              
              <div className="relative h-10 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-md px-2 flex items-center justify-center min-w-[70px] shadow-sm shrink-0">
                <div className="text-white font-semibold text-xs">
                  {items.length} {items.length === 1 ? 'Item' : 'Items'}
                </div>
              </div>
              
              <TooltipProvider>
                <div className="flex gap-2 items-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handlePreviousInvoice}
                        variant="outline"
                        size="sm"
                        className="h-10"
                        disabled={!todaysSales || todaysSales.length === 0 || currentInvoiceIndex >= todaysSales.length - 1}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        <div className="flex flex-col items-start">
                          <span className="text-xs">Previous</span>
                          {todaysSales && todaysSales.length > 0 && currentInvoiceIndex < todaysSales.length - 1 && (
                            <span className="text-[10px] text-muted-foreground">
                              {todaysSales[currentInvoiceIndex + 1]?.sale_number}
                            </span>
                          )}
                        </div>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Page Up</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
              
              {/* EMI Button Row */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Financer / EMI Button */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => setShowFinancerDialog(true)}
                        disabled={!mobileERP.enabled}
                        className={`h-10 px-1.5 flex items-center gap-1 text-[11px] font-semibold rounded-md shadow-sm transition-all whitespace-nowrap ${
                          !mobileERP.enabled
                            ? 'bg-muted/40 text-muted-foreground border border-border/50 opacity-50 cursor-not-allowed'
                            : financerDetails?.financer_name
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white'
                            : 'bg-muted/60 hover:bg-muted text-foreground border border-border/50'
                        }`}
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        <span>EMI</span>
                        {financerDetails?.financer_name && (
                          <Badge className="h-4 px-1 text-[9px] bg-white/20 hover:bg-white/20 text-white">
                            {financerDetails.financer_name.split(' ')[0]}
                          </Badge>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{mobileERP.enabled ? 'Financer / EMI Details' : 'Enable Mobile ERP in Settings → Product to use EMI'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Invoice date picker — only when admin enabled "Allow invoice date change in POS" */}
                {posAllowDateChange && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-10 px-2 flex items-center gap-1 text-[11px] font-semibold rounded-md shadow-sm border border-border/50 bg-muted/60 hover:bg-muted text-foreground whitespace-nowrap"
                        title="Invoice date"
                      >
                        <CalendarIcon className="h-3.5 w-3.5" />
                        <span>{format(posInvoiceDate, "dd MMM yyyy")}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-50" align="end">
                      <Calendar
                        mode="single"
                        selected={posInvoiceDate}
                        onSelect={(d) => d && setPosInvoiceDate(d)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
        </div>

        {/* Items table — only this region scrolls; footer stays viewport-bottom */}
        <div className="pos-sales-body px-2 md:px-3">
          <div className="w-full h-full min-h-0 flex flex-col overflow-hidden">
          <Card className="flex-1 min-h-0 overflow-hidden flex flex-col border-border/60 shadow-sm">
            <div className="bg-slate-900 text-white">
              <div className="pos-sales-cart-header grid gap-1.5 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ gridTemplateColumns: posCartGridCols }}>
                <div className="text-center">Sr No</div>
                <div>Barcode</div>
                <div>Product</div>
                <div className="text-center">Size</div>
                <div className="text-center">Color</div>
                <div className="text-center">Qty</div>
                {enableMrp && <div className="text-right">MRP</div>}
                <div className="text-center">Tax%</div>
                <div className="text-center">Disc%</div>
                <div className="text-right">Disc Rs</div>
                <div className="text-right">Unit Price</div>
                <div className="text-right">Net Amount</div>
              </div>
            </div>

            {customerId && availableCreditBalance > 0 && creditApplied === 0 && items.length > 0 && (
              <div className="mx-2 mb-1 flex items-center justify-between px-3 py-1.5 bg-purple-50 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-700 rounded-lg text-sm">
                <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                  <Wallet className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>₹{availableCreditBalance.toLocaleString('en-IN')}</strong> credit note available for {customerName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const maxApplicable = Math.min(availableCreditBalance, amountBeforeCredit);
                    if (maxApplicable > 0) handleApplyCredit(maxApplicable);
                  }}
                  className="ml-3 shrink-0 px-3 py-1 bg-purple-600 text-white text-xs font-semibold rounded hover:bg-purple-700 transition-colors"
                >
                  Apply ₹{Math.min(availableCreditBalance, amountBeforeCredit) > 0
                    ? Math.min(availableCreditBalance, Math.round(amountBeforeCredit)).toLocaleString('en-IN')
                    : availableCreditBalance.toLocaleString('en-IN')} Now
                </button>
              </div>
            )}

            {customerId && availableAdvanceBalance > 0 && advanceApplied === 0 && items.length > 0 && (
              <div className="mx-2 mb-1 flex items-center justify-between px-3 py-1.5 bg-orange-50 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-700 rounded-lg text-sm">
                <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
                  <IndianRupee className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>₹{availableAdvanceBalance.toLocaleString('en-IN')}</strong> advance available for {customerName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const maxApplicable = capPosAdvanceApplyAmount({
                      requested: availableAdvanceBalance,
                      availableAdvanceBalance,
                      billRoom: Math.max(0, finalAmount),
                    });
                    if (maxApplicable > 0) handleApplyAdvance(maxApplicable);
                  }}
                  className="ml-3 shrink-0 px-3 py-1 bg-orange-600 text-white text-xs font-semibold rounded hover:bg-orange-700 transition-colors"
                >
                  Apply ₹{capPosAdvanceApplyAmount({
                    requested: availableAdvanceBalance,
                    availableAdvanceBalance,
                    billRoom: Math.max(0, finalAmount),
                  }).toLocaleString('en-IN')} Now
                </button>
              </div>
            )}

            <div
              ref={itemsContainerRef} 
              className="pos-sales-cart-scroll flex-1 min-h-0 overflow-y-auto overscroll-y-contain relative scroll-smooth"
              onScroll={(e) => {
                const target = e.target as HTMLDivElement;
                setShowScrollTop(target.scrollTop > 100);
              }}
            >
              {/* Scroll to Top Button with Item Count Badge */}
              {showScrollTop && items.length > 3 && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute bottom-3 right-3 z-30 rounded-full shadow-lg h-12 w-12"
                  onClick={() => {
                    if (itemsContainerRef.current) {
                      itemsContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                >
                  <ArrowUp className="h-5 w-5" />
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {items.length}
                  </span>
                </Button>
              )}
              {(() => {
                  const blankRowsNeeded = cartPadRowCount;
                  const blankRow = (idx: number) => (
                    <div key={`blank-${idx}`} className={`pos-sales-cart-row grid gap-1.5 px-3 py-2.5 border-b border-border/40 text-base ${(items.length + idx) % 2 === 1 ? 'bg-muted/20' : ''}`} style={{ gridTemplateColumns: posCartGridCols }}>
                      <div className="flex items-center justify-center text-muted-foreground/30 font-medium">{items.length + idx + 1}</div>
                      <div className="flex items-center text-muted-foreground/20">—</div>
                      <div className="flex items-center text-muted-foreground/20">—</div>
                      <div className="flex items-center justify-center text-muted-foreground/20">—</div>
                      <div className="flex items-center justify-center text-muted-foreground/20">—</div>
                      <div className="flex items-center justify-center text-muted-foreground/20">—</div>
                      {enableMrp && <div className="flex items-center justify-end text-muted-foreground/20">—</div>}
                      <div className="flex items-center justify-center text-muted-foreground/20">—</div>
                      <div className="flex items-center justify-center text-muted-foreground/20">—</div>
                      <div className="flex items-center justify-end text-muted-foreground/20">—</div>
                      <div className="flex items-center justify-end text-muted-foreground/20">—</div>
                      <div className="flex items-center justify-end text-muted-foreground/20">—</div>
                    </div>
                  );
                  return (
                    <>
                      {items.map((item, index) => {
                        // Informational only — checkStock / validateCartStock remain enforcement.
                        // Edit mode: stockQty ignores freedQty (may look slightly pessimistic).
                        const stockIndicator = getPosCartStockIndicator(
                          item.stockQty,
                          item.quantity,
                        );
                        return (
                        <div
                          key={item.id}
                          ref={(el) => {
                            if (el) posCartRowRefs.current.set(item.id, el);
                            else posCartRowRefs.current.delete(item.id);
                          }}
                          data-pos-cart-row={item.id}
                          className={cn(
                            "pos-sales-cart-row grid gap-1.5 px-3 py-2.5 border-b border-border/40 hover:bg-accent/30 text-base transition-colors duration-500",
                            stockIndicator?.status === "red"
                              ? "bg-red-50/80"
                              : index % 2 === 1
                                ? "bg-muted/20"
                                : "",
                            highlightCartItemId === item.id &&
                              "ring-2 ring-inset ring-primary/70 bg-primary/10 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.35)] z-[1] relative"
                          )}
                          style={{ gridTemplateColumns: posCartGridCols }}
                        >
                          <div className="flex items-center justify-center font-semibold text-foreground/80">{index + 1}</div>
                          <div
                            className={cn(
                              "flex items-center font-mono text-foreground/80 min-w-0 overflow-hidden",
                              formatPosCartBarcode(item.barcode).length > 12 ? "text-xs leading-tight" : "text-sm",
                            )}
                            title={formatPosCartBarcode(item.barcode) || undefined}
                          >
                            <span className="truncate tabular-nums">
                              {formatPosCartBarcode(item.barcode)}
                            </span>
                          </div>
                          <div className="flex items-center font-semibold text-base min-w-0 gap-1">
                            {stockIndicator && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className={cn(
                                      "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
                                      stockIndicator.status === "green" && "bg-green-500",
                                      stockIndicator.status === "yellow" && "bg-amber-400",
                                      stockIndicator.status === "red" && "bg-red-500",
                                    )}
                                    aria-label={`Stock ${stockIndicator.stockQty}, after this bill ${stockIndicator.remaining}`}
                                  />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  Stock: {stockIndicator.stockQty} · After this bill:{" "}
                                  {stockIndicator.remaining}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <span className="truncate">{item.productName}</span>
                            {item.isDcProduct && (
                              <span className="px-1 py-0.5 text-[9px] font-bold bg-orange-100 text-orange-700 border border-orange-300 rounded flex-shrink-0">DC</span>
                            )}
                            {enableMrp && (Number(item.mrp) || 0) > (Number(item.unitCost) || 0) + 0.001 && (
                              <span className="px-1 py-0.5 text-[9px] font-semibold bg-sky-100 text-sky-800 border border-sky-300 rounded flex-shrink-0" title="Selling rate below MRP (manual rate / loaded invoice line)">
                                Rate override
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-center text-sm font-medium truncate min-w-0" title={item.size}>
                            {item.size}
                          </div>
                          <div className="flex items-center justify-center text-sm text-muted-foreground truncate min-w-0" title={item.color || undefined}>
                            {item.color || '-'}
                          </div>
                          <div>
                            <QtyInput
                              uom={item.uom}
                              value={item.quantity || minQtyForUom(item.uom)}
                              onChange={(val) => updateQuantity(index, val)}
                              className="h-8 text-sm w-full text-center bg-muted/30 border-border/60 px-1"
                              selectOnFocus={false}
                            />
                            {item.uom && item.uom !== 'NOS' && item.uom !== 'PCS' && (
                              <span className="text-[10px] text-muted-foreground text-center block">{getUOMLabel(item.uom)}</span>
                            )}
                          </div>
                          {enableMrp && (
                          <div>
                            <Input
                              type="number"
                              value={item.mrp || ""}
                              onChange={(e) => updateMrp(index, parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              className="h-8 text-sm w-full text-right bg-muted/30 border-border/60"
                              min="0"
                              step="0.01"
                            />
                          </div>
                          )}
                          <div>
                            <select
                              value={taxType === "no_gst" ? "0" : String(item.gstPer ?? 0)}
                              onChange={(e) => updateGstPer(index, parseInt(e.target.value, 10))}
                              disabled={taxType === "no_gst"}
                              title={taxType === "no_gst" ? "Without GST — tax rate not applied" : undefined}
                              className="h-8 w-full rounded-md text-sm border border-border/60 bg-muted/30 px-1.5 text-center focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <option value="0">0%</option>
                              <option value="5">5%</option>
                              <option value="12">12%</option>
                              <option value="18">18%</option>
                              <option value="28">28%</option>
                            </select>
                          </div>
                          <div>
                            <Input
                              type="number"
                              value={item.discountPercent || ""}
                              onChange={(e) => updateDiscountPercent(index, parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              className="h-8 text-sm w-full text-center bg-muted/30 border-border/60"
                              min="0"
                              max="100"
                              step="0.01"
                            />
                          </div>
                          <div>
                            <Input
                              type="number"
                              value={
                                (() => {
                                  const baseAmount = Math.max(0, (Number(item.mrp) || 0) * (Number(item.quantity) || 0));
                                  const percentAmount = baseAmount > 0
                                    ? (baseAmount * (Number(item.discountPercent) || 0)) / 100
                                    : 0;
                                  const rsDiscount = Number(item.discountAmount) > 0
                                    ? Number(item.discountAmount)
                                    : percentAmount;
                                  return rsDiscount > 0 ? Number(rsDiscount.toFixed(2)) : "";
                                })()
                              }
                              onChange={(e) => updateDiscountAmount(index, parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              className="h-8 text-sm w-full text-right bg-muted/30 border-border/60"
                              min="0"
                              step="0.01"
                            />
                          </div>
                          <div>
                            {(() => {
                              const listUnit =
                                Number(item.mrp) > 0.005
                                  ? Number(item.mrp)
                                  : Number(item.unitCost) || 0;
                              const baseAmount = Math.max(
                                0,
                                (Number(item.mrp) || 0) * (Number(item.quantity) || 0),
                              );
                              const percentAmount =
                                baseAmount > 0
                                  ? (baseAmount * (Number(item.discountPercent) || 0)) / 100
                                  : 0;
                              const lineDiscRs =
                                Number(item.discountAmount) > 0
                                  ? Number(item.discountAmount)
                                  : percentAmount;
                              const discPct = Number(item.discountPercent) || 0;
                              const hasLineDisc = lineDiscRs > 0.005 || discPct > 0.005;
                              // Match bill print: show list rate + -% when line discount is on
                              if (hasLineDisc && !canEditPosUnitPrice) {
                                return (
                                  <div
                                    className="flex flex-col items-end justify-center min-h-8 leading-tight text-right"
                                    title={`List ₹${formatINR2(listUnit)} · Disc ${discPct > 0 ? `${discPct}%` : ""} ₹${formatINR2(lineDiscRs)} · Net unit ₹${formatINR2(posLineNetUnitPrice(item))}`}
                                  >
                                    <span className="text-base font-semibold tabular-nums text-foreground">
                                      ₹{formatINR2(listUnit)}
                                    </span>
                                    {discPct > 0.005 && (
                                      <span className="text-[11px] font-semibold text-muted-foreground">
                                        -{discPct % 1 === 0 ? discPct.toFixed(0) : discPct.toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                );
                              }
                              if (canEditPosUnitPrice) {
                                return (
                                  <div className="flex flex-col items-end gap-0.5">
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    value={
                                      unitPriceDraft?.index === index
                                        ? unitPriceDraft.value
                                        : item.unitCost || ""
                                    }
                                    onFocus={(e) => {
                                      setUnitPriceDraft({
                                        index,
                                        value:
                                          item.unitCost != null && item.unitCost !== 0
                                            ? String(item.unitCost)
                                            : "",
                                      });
                                      e.currentTarget.select();
                                    }}
                                    onChange={(e) =>
                                      setUnitPriceDraft({ index, value: e.target.value })
                                    }
                                    onBlur={() => {
                                      if (unitPriceDraft?.index !== index) return;
                                      const parsed = parseFloat(unitPriceDraft.value);
                                      if (!Number.isFinite(parsed)) {
                                        setUnitPriceDraft(null);
                                        return;
                                      }
                                      requestUnitPriceCommit(index, parsed);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }}
                                    placeholder="0"
                                    className="h-8 text-sm w-full text-right bg-muted/30 border-border/60"
                                    min="0"
                                    step="0.01"
                                    title="Selling unit price (typed rate clears Disc% / Disc Rs)"
                                  />
                                  {hasLineDisc && (
                                    <span className="text-[10px] font-semibold text-muted-foreground">
                                      List ₹{formatINR2(listUnit)}
                                      {discPct > 0.005
                                        ? ` · -${discPct % 1 === 0 ? discPct.toFixed(0) : discPct.toFixed(1)}%`
                                        : ""}
                                    </span>
                                  )}
                                  </div>
                                );
                              }
                              return (
                                <div
                                  className="flex items-center justify-end text-base font-medium text-muted-foreground h-8"
                                  title={
                                    taxType === "exclusive"
                                      ? "Taxable unit (GST added in line total)"
                                      : taxType === "no_gst"
                                        ? "Sale price (no GST applied)"
                                        : "Unit price"
                                  }
                                >
                                  ₹{formatINR2(listUnit > 0 ? listUnit : posLineNetUnitPrice(item))}
                                </div>
                              );
                            })()}
                          </div>
                          <div className="flex items-center justify-between gap-1 min-w-0">
                            <span className="font-extrabold text-base md:text-lg tabular-nums">
                              ₹{formatINR2(posLineDisplayTotal(item.netAmount, item.gstPer, taxType))}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeItem(index)}
                              className="h-7 w-7 shrink-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        );
                      })}
                      {Array.from({ length: blankRowsNeeded }).map((_, i) => blankRow(i))}
                    </>
                  );
                })()}
            </div>
          </Card>

          {/* Notes / discounts — sibling of table card (does not push footer; scrolls if tall) */}
          <div className="pos-sales-notes shrink-0 border-t border-border/60 bg-card">
            <div className="p-2 bg-muted/30">
              <div className="flex items-center gap-3">
                <Label className="text-sm font-medium whitespace-nowrap">
                  <FileText className="h-4 w-4 inline mr-1" />
                  Note:
                </Label>
                <Input
                  placeholder="Add note (e.g., Pico Fall Details, Alterations, etc.)"
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  className="flex-1 h-8"
                />
              </div>
            </div>
            {customerId && (() => {
              const customer = customers?.find((c: any) => c.id === customerId);
              const customerMasterDiscount = customer?.discount_percent || 0;
              const hasDiscountInfo = (hasBrandDiscounts && brandDiscounts.length > 0) || customerMasterDiscount > 0;
              const showPointsSection = isPointsEnabled;

              if (!hasDiscountInfo && !showPointsSection) return null;

              return (
                <div className="p-2 border-t border-border/60 bg-amber-50/50 dark:bg-amber-950/20 flex items-center gap-4 flex-wrap">
                  {hasBrandDiscounts && brandDiscounts.length > 0 ? (
                    <div className="flex items-center gap-2 bg-primary/5 px-3 py-1.5 rounded-lg flex-wrap">
                      <span className="text-sm text-muted-foreground font-medium">Brand Discounts:</span>
                      {brandDiscounts.slice(0, 5).map((bd, idx) => (
                        <span
                          key={idx}
                          className="text-sm bg-primary/10 text-primary px-2 py-1 rounded font-semibold"
                        >
                          {bd.brand}: {bd.discount_percent}%
                        </span>
                      ))}
                      {brandDiscounts.length > 5 && (
                        <span className="text-sm text-muted-foreground">+{brandDiscounts.length - 5} more</span>
                      )}
                      {customerMasterDiscount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          (master {customerMasterDiscount}% ignored)
                        </span>
                      )}
                    </div>
                  ) : customerMasterDiscount > 0 ? (
                    <div className="flex items-center gap-2 bg-green-500/10 px-3 py-1.5 rounded-lg">
                      <span className="text-sm text-muted-foreground font-medium">Master Discount:</span>
                      <span className="text-sm bg-green-500/20 text-green-600 px-2 py-1 rounded font-semibold">
                        {customerMasterDiscount}%
                      </span>
                    </div>
                  ) : null}
                  {showPointsSection && (
                    <div className="flex items-center gap-3 ml-auto flex-wrap">
                      <div className="flex items-center gap-2 bg-amber-500 text-white px-3 py-1.5 rounded-lg">
                        <Coins className="h-4 w-4" />
                        <span className="font-bold">
                          {Math.max(0, (customerPointsData?.balance || 0) - pointsToRedeem)} pts
                        </span>
                        {items.length > 0 && pointsToRedeem <= 0 && (() => {
                          // No earn preview while redeeming on this bill (pending = 0).
                          const pendingPts = calculatePoints(
                            Math.max(0, totals.subtotal - saleReturnAdjust - flatDiscountAmount),
                          );
                          return pendingPts > 0 ? (
                            <span className="text-amber-100 text-sm" title="Earned after bill save — not redeemable on this bill">
                              +{pendingPts} pending
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          </div>
        </div>

        {/* Totals + shortcuts — locked to viewport bottom (never shifts with line items) */}
        <div className="pos-sales-footer w-full flex flex-col">
        <div className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 text-white border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          {/* Top Info Bar — Qty → Charges → Sub Total → Discount → Time (matches bill print) */}
          <div className="flex min-h-[52px] flex-nowrap items-center px-6 py-3 gap-0 border-b border-white/10 overflow-x-auto">
            {/* Qty */}
            <div className="text-center px-3">
              <div className="text-xl font-bold leading-tight">{totals.quantity}</div>
              <div className="text-[11px] text-white/70 uppercase tracking-wider font-semibold">Qty</div>
            </div>

            <div className="w-px h-8 bg-white/20 shrink-0" />

            {/* Charges */}
            <div className="text-center px-3">
              <div className="text-lg font-bold leading-tight">₹0</div>
              <div className="text-[11px] text-white/70 uppercase font-semibold">Charges</div>
            </div>

            <div className="w-px h-8 bg-white/20 shrink-0" />

            {/* Sub Total — pre-discount gross (same as bill Sub Total) */}
            <div className="text-center px-3">
              <div className="text-lg font-bold leading-tight tabular-nums">₹{formatINR2(totals.mrp)}</div>
              <div className="text-[11px] text-white/70 uppercase font-semibold">Sub Total</div>
            </div>

            <div className="w-px h-8 bg-white/20 shrink-0" />

            {/* Discount */}
            <div className="text-center px-3 min-w-[5.5rem]">
              <div className="text-xl font-extrabold leading-tight text-white tabular-nums">
                {totalDiscountDisplay > 0.005 ? `−₹${formatINR2(totalDiscountDisplay)}` : "₹0"}
              </div>
              <div className="text-xs text-white/90 uppercase font-bold tracking-wide">Discount</div>
            </div>

            <div className="w-px h-8 bg-white/20 shrink-0" />

            {/* Invoice / wall clock — uses same 1s tick as print date */}
            <div className="text-center px-2 shrink-0 min-w-[7.5rem]">
              <div className="text-[11px] text-white/70 uppercase tracking-wider font-semibold">
                {footerLoadedInvoiceTime && currentSaleId ? "Invoice time" : "Time"}
              </div>
              <div className="text-sm font-extrabold text-white tabular-nums leading-tight mt-0.5 whitespace-nowrap">
                {footerLoadedInvoiceTime && currentSaleId
                  ? footerLoadedInvoiceTime
                  : format(currentDateTime, "HH:mm:ss")}
              </div>
            </div>
            
            {/* Invoice payment mode indicator (helps identify Edit/Last/Previous invoice mode) */}
            <div className="flex-1 hidden xl:flex items-center justify-center">
              <div className="text-center px-3">
                <div className="text-[11px] text-white/70 uppercase tracking-wider font-semibold">Payment Mode</div>
                <div className="text-base font-extrabold text-white mt-0.5">
                  {paymentModeLabel}
                </div>
              </div>
            </div>
            {posRuntimeSettingsRef.current?.pos_barcode_price_mode === 'mrp' && posRuntimeSettingsRef.current?.enable_mrp && (
              <div className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded border border-blue-200 font-semibold shrink-0">
                MRP Price Mode Active
              </div>
            )}
            
            {/* Middle Fields — Flat Disc, S/R Adj, Round (items-start + hint slots keep inputs aligned) */}
            <div className="flex items-start gap-3 flex-nowrap justify-end shrink-0 min-w-0">
              {/* Flat Disc — combined with line disc capped to gross (before S/R) */}
              <div className="text-center flex flex-col items-center min-h-[4.5rem]">
                <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">Flat Disc</div>
                <div className="flex items-center h-10">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="bg-white/20 text-white px-2 py-1 text-base rounded-l-md h-10 hover:bg-white/30 border-0 font-bold min-w-[30px]"
                    onClick={(e) => {
                      e.preventDefault();
                      setFlatDiscountMode(flatDiscountMode === 'percent' ? 'amount' : 'percent');
                    }}
                  >
                    {flatDiscountMode === 'percent' ? '%' : '₹'}
                  </Button>
                  <Input 
                    type="number"
                    className="w-24 h-10 bg-white text-foreground text-center text-lg font-semibold rounded-l-none border-0" 
                    value={flatDiscountValue === 0 ? "" : String(flatDiscountValue)}
                    placeholder=""
                    step="1"
                    min={0}
                    max={flatDiscountMode === "amount" ? maxFlatDiscountForGross : undefined}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "" || raw === "-") {
                        setFlatDiscountValue(0);
                        return;
                      }
                      const n = parseFloat(raw);
                      if (!Number.isFinite(n)) return;
                      setFlatDiscountValue(Math.round(n));
                    }}
                    onBlur={() => {
                      let next = normalizeFlatDiscountInput(flatDiscountValue);
                      if (flatDiscountMode === "amount" && next > maxFlatDiscountForGross + 0.01) {
                        toast.warning(
                          `Only ₹${maxFlatDiscountForGross.toLocaleString("en-IN", { maximumFractionDigits: 0 })} discount can be applied to this bill`,
                        );
                        next = Math.round(maxFlatDiscountForGross);
                      } else if (flatDiscountMode === "percent" && flatDiscountCapped) {
                        toast.warning(
                          `Only ₹${maxCombinedDiscountForGross(totals.mrp).toLocaleString("en-IN", { maximumFractionDigits: 0 })} discount can be applied to this bill`,
                        );
                        const base = Math.max(0.01, totals.mrp - saleReturnAdjust);
                        next = Math.min(
                          100,
                          Math.round((maxFlatDiscountForGross / base) * 100),
                        );
                      }
                      handleFlatDiscountValueChange(next);
                    }}
                  />
                </div>
                {flatDiscountCapped && (
                  <div className="text-[10px] text-amber-200 mt-0.5 max-w-[9rem] leading-tight">
                    Only ₹{maxCombinedDiscountForGross(totals.mrp).toLocaleString("en-IN", { maximumFractionDigits: 0 })} discount can be applied to this bill
                  </div>
                )}
              </div>
              
              {/* S/R Adj — same-bill exchange may exceed bill (Mix refund/CN); pre-existing credit stays bill-capped */}
              <div className="text-center flex flex-col items-center min-h-[4.5rem]">
                <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">
                  S/R Adj{customerId && pendingSaleReturnCredits.length > 0 ? ` (${pendingSaleReturnCredits.length})` : ''}
                </div>
                <div className="flex items-center h-10">
                  <Input 
                    type="number"
                    className="w-24 h-10 bg-white text-foreground text-center text-lg font-semibold border-0 rounded-md" 
                    value={saleReturnAdjust || ""}
                    placeholder="0"
                    // No HTML max on exchange — over-bill S/R is intentional (Mix refund).
                    max={isSameBillExchangeSr ? undefined : maxSrAllowed > 0 ? maxSrAllowed : undefined}
                    min={0}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "" || raw === "-") {
                        setSaleReturnAdjust(0);
                        setSameBillReturnGross(0);
                        return;
                      }
                      const n = parseFloat(raw);
                      if (!Number.isFinite(n)) return;
                      // Allow typing above bill; clamp on blur to maxSrAllowed (exchange vs pre-existing).
                      setSaleReturnAdjust(Math.max(0, n));
                      if (n > maxSrFromBill + 0.005) {
                        setSameBillReturnGross((prev) => Math.max(prev, n));
                      }
                    }}
                    step="0.01"
                    onBlur={(e) => {
                      const requested = parseFloat(e.target.value) || 0;
                      if (requested <= 0) {
                        setSaleReturnAdjust(0);
                        setSameBillReturnGross(0);
                        return;
                      }
                      // Keep exchange / over-bill S/R — never wipe when return exceeds bill
                      // (blur often fires when clicking delete on a cart line).
                      if (requested > maxSrFromBill + 0.005 || sameBillReturnGross > 0.005) {
                        setSameBillReturnGross((prev) => Math.max(prev, requested));
                        setSaleReturnAdjust(requested);
                        return;
                      }
                      if (
                        customerId &&
                        availableSrCredit <= 0.01 &&
                        requested > 0.01
                      ) {
                        toast.warning("No pending Sale Return credit for this customer");
                        setSaleReturnAdjust(0);
                        setSameBillReturnGross(0);
                        return;
                      }
                      clampSaleReturnAdjust(requested);
                    }}
                  />
                  {customerId && pendingSaleReturnCredits.length > 0 && (
                    <Popover open={showSRCreditDropdown} onOpenChange={setShowSRCreditDropdown}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20 p-0 ml-1">
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="center" side="top">
                        <div className="text-xs font-semibold text-muted-foreground mb-1.5">Pending Credit Notes</div>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {pendingSaleReturnCredits.map((sr) => (
                            <button
                              key={sr.id}
                              className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-accent text-sm text-left"
                              onClick={() => {
                                clampSaleReturnAdjust(Number(sr.net_amount) || 0);
                                setShowSRCreditDropdown(false);
                              }}
                            >
                              <span className="font-medium truncate">{sr.return_number || "S/R"}</span>
                              <Badge variant="secondary" className="ml-2 shrink-0">₹{formatINR2(sr.net_amount)}</Badge>
                            </button>
                          ))}
                          {pendingSaleReturnCredits.length === 0 && (
                            <div className="text-xs text-muted-foreground px-2 py-1">No pending credit notes</div>
                          )}
                        </div>
                        {recentAdjustedSaleReturnCredits.length > 0 && (
                          <>
                            <div className="h-px bg-border my-2" />
                            <div className="text-xs font-semibold text-muted-foreground mb-1.5">Recently Adjusted</div>
                            <div className="space-y-1 max-h-28 overflow-y-auto">
                              {recentAdjustedSaleReturnCredits.map((sr) => (
                                <div
                                  key={`adj-${sr.id}`}
                                  className="w-full flex items-center justify-between px-2 py-1.5 rounded text-sm text-left bg-muted/40 hover:bg-accent cursor-pointer transition-colors"
                                  title={`Adjusted in invoice: ${sr.linked_sale_number || sr.linked_sale_id || "N/A"}`}
                                  onClick={async () => {
                                    if (!sr.linked_sale_id) return;
                                    setShowSRCreditDropdown(false);
                                    await loadSaleForEdit(sr.linked_sale_id);
                                  }}
                                >
                                  <span className="font-medium truncate">
                                    {sr.return_number || "S/R"}{" "}
                                    <span className="text-xs text-muted-foreground">
                                      ({sr.linked_sale_number || "Invoice"})
                                    </span>
                                  </span>
                                  <Badge variant="outline" className="ml-2 shrink-0">
                                    ₹{formatINR2(sr.net_amount)}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                {exchangeRefundDue > 0.01 ? (
                  <div className="text-[10px] text-orange-200 mt-0.5 max-w-[11rem] leading-tight">
                    Return ₹{Math.round(saleReturnAdjust)} · Applied ₹{Math.round(exchangeSrApplied)} · Refund due ₹{Math.round(exchangeRefundDue)}
                  </div>
                ) : (
                  !isSameBillExchangeSr &&
                  (saleReturnAdjust > maxSrAllowed + 0.01 ||
                    (maxSrAllowed > 0 && availableSrCredit > maxSrFromBill + 0.01)) && (
                    <div className="text-[10px] text-amber-200 mt-0.5 max-w-[9rem] leading-tight">
                      Only ₹{maxSrAllowed.toLocaleString("en-IN", { maximumFractionDigits: 0 })} of credit can be applied to this bill
                    </div>
                  )
                )}
              </div>
              
              {/* Round */}
              <div className="text-center flex flex-col items-center min-h-[4.5rem]">
                <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">
                  Round{isManualRoundOff && <span className="text-yellow-300 normal-case"> (M)</span>}
                </div>
                <div className="flex items-center gap-0.5 h-10">
                  {isManualRoundOff && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="bg-white/20 text-white px-1.5 py-1 text-xs rounded h-7 hover:bg-white/30"
                            onClick={handleResetRoundOff}
                          >
                            <RotateCcw className="h-2.5 w-2.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Reset to auto round-off</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <Input 
                    type="number"
                    className={`w-24 h-10 text-center text-lg font-semibold border-0 rounded-md ${roundOff >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                    value={roundOff || ""}
                    placeholder="0"
                    onChange={(e) => handleRoundOffChange(parseFloat(e.target.value) || 0)}
                    step="1"
                  />
                </div>
              </div>

              {/* Redeem old CRM points only — current-bill earn stays pending until save */}
              {customerId && isPointsEnabled && isRedemptionEnabled && (
                <div className="text-center">
                  <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">
                    Pts ({customerPointsData?.balance || 0})
                  </div>
                  <Input
                    type="number"
                    className="w-24 h-10 bg-amber-100 text-amber-800 text-center text-lg font-semibold border-0 rounded-md"
                    value={pointsToRedeem || ""}
                    placeholder="0"
                    min={0}
                    max={calculateMaxRedeemablePoints(
                      Math.max(0, totals.subtotal - saleReturnAdjust - flatDiscountAmount),
                      customerPointsData?.balance || 0,
                    )}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10) || 0;
                      const maxPoints = calculateMaxRedeemablePoints(
                        Math.max(0, totals.subtotal - saleReturnAdjust - flatDiscountAmount),
                        customerPointsData?.balance || 0,
                      );
                      setPointsToRedeem(Math.min(Math.max(0, value), maxPoints));
                    }}
                    disabled={
                      !customerId ||
                      calculateMaxRedeemablePoints(
                        Math.max(0, totals.subtotal - saleReturnAdjust - flatDiscountAmount),
                        customerPointsData?.balance || 0,
                      ) <= 0
                    }
                    title={
                      (customerPointsData?.balance || 0) <= 0
                        ? "No old points to redeem"
                        : (customerPointsData?.balance || 0) < (pointsSettings?.min_points_for_redemption || 1)
                          ? `Need at least ${pointsSettings?.min_points_for_redemption || 1} old pts (this bill's +pts are pending)`
                          : `Redeem old points only (max ${calculateMaxRedeemablePoints(
                              Math.max(0, totals.subtotal - saleReturnAdjust - flatDiscountAmount),
                              customerPointsData?.balance || 0,
                            )})`
                    }
                  />
                  {pointsToRedeem > 0 ? (
                    <div className="text-[10px] text-amber-200 font-semibold mt-0.5 text-center">
                      −₹{calculateRedemptionValue(pointsToRedeem).toFixed(0)}
                    </div>
                  ) : (customerPointsData?.balance || 0) > 0 &&
                    (customerPointsData?.balance || 0) < (pointsSettings?.min_points_for_redemption || 1) ? (
                    <div className="text-[10px] text-white/70 font-semibold mt-0.5 text-center">
                      Min {pointsSettings?.min_points_for_redemption || 1} pts
                    </div>
                  ) : null}
                </div>
              )}

              {/* Credit Applied */}
              {(availableCreditBalance > 0 || creditApplied > 0) && (
                <div className="text-center">
                  <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">Cr ₹{availableCreditBalance.toFixed(0)}</div>
                  <Input 
                    type="number"
                    className="w-24 h-10 bg-purple-100 text-purple-700 text-center text-lg font-semibold border-0 rounded-md" 
                    value={creditApplied || ""}
                    placeholder="0"
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      const maxApplicable = Math.min(value, availableCreditBalance, amountBeforeCredit);
                      handleApplyCredit(maxApplicable > 0 ? maxApplicable : value);
                    }}
                    max={Math.min(availableCreditBalance, amountBeforeCredit)}
                    step="0.01"
                    disabled={!customerId || availableCreditBalance <= 0 || isApplyingCredit}
                  />
                  {creditApplied > 0 && (
                    <div className="text-[10px] text-green-400 font-semibold mt-0.5 text-center">
                      ✓ Applied
                    </div>
                  )}
                </div>
              )}

              {(availableAdvanceBalance > 0 || advanceApplied > 0) && (
                <div className="text-center">
                  <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">Adv ₹{availableAdvanceBalance.toFixed(0)}</div>
                  <Input
                    type="number"
                    className="w-24 h-10 bg-orange-100 text-orange-800 text-center text-lg font-semibold border-0 rounded-md"
                    value={advanceApplied || ""}
                    placeholder="0"
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      handleApplyAdvance(value);
                    }}
                    max={capPosAdvanceApplyAmount({
                      requested: availableAdvanceBalance,
                      availableAdvanceBalance,
                      billRoom: Math.max(0, finalAmount),
                    })}
                    step="0.01"
                    disabled={
                      !customerId ||
                      availableAdvanceBalance <= 0 ||
                      exchangeRefundDue > 0.005 ||
                      openingBalanceRemaining > 0.01
                    }
                  />
                  {advanceApplied > 0 && (
                    <div className="text-[10px] text-green-400 font-semibold mt-0.5 text-center">
                      ✓ Applied
                    </div>
                  )}
                </div>
              )}

              {customerId && (
                <div className="text-center shrink-0 min-w-[160px]">
                  <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">Customer Balance</div>
                  <div
                    className={`w-40 h-10 text-center text-lg font-semibold border-0 rounded-md flex items-center justify-center ${
                      customerBalance > 0
                        ? "bg-red-100 text-red-700"
                        : customerBalance < 0
                          ? "bg-green-100 text-green-700"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isBalanceLoading
                      ? "..."
                      : `₹${Math.abs(customerBalance).toLocaleString('en-IN')}`}
                  </div>
                </div>
              )}
            </div>
            
            <div className="w-px h-8 bg-white/20 mx-3 shrink-0" />

            {/* Inclusive GST is post-discount extract (breakdown); exclusive is added tax. Never add inclusive GST on top of Net. */}
            {(taxType === "exclusive" || taxType === "inclusive") && posGst.totalGst > 0.005 && (
              <>
                <div className="text-center px-3 shrink-0">
                  <div className="text-lg font-bold leading-tight">₹{formatINR2(posGst.totalGst)}</div>
                  <div className="text-[11px] text-white/70 uppercase font-semibold">
                    {taxType === "inclusive" ? "GST (incl.)" : "GST"}
                  </div>
                </div>
                <div className="w-px h-8 bg-white/20 mx-3 shrink-0" />
              </>
            )}
            
            {/* Right Summary — MRP (strikethrough), Net Amount, discount badge */}
            <div className="text-center shrink-0 min-w-[160px] flex flex-col items-center self-start min-h-[4.5rem]">
              {enableMrp && totals.mrp > 0 && totals.mrp !== finalAmount && (
                <div className="text-xs text-white/90 line-through font-bold leading-tight">
                  MRP ₹{formatINR2(totals.mrp)}
                </div>
              )}
              <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">
                {finalAmount < -0.005 || exchangeRefundDue > 0.005 ? "Refund Due" : "Net Amount"}
              </div>
              <Input
                type="number"
                className={`w-40 h-10 text-center text-lg font-semibold border-0 rounded-md bg-white tabular-nums ${finalAmount < 0 || exchangeRefundDue > 0.005 ? 'text-orange-600' : 'text-emerald-700'}`}
                value={Math.round(finalAmount < 0 || exchangeRefundDue > 0.005 ? -Math.max(Math.abs(Math.min(0, finalAmount)), exchangeRefundDue) : finalAmount)}
                onChange={(e) => handleFinalAmountChange(parseFloat(e.target.value) || 0)}
                step="1"
                readOnly={finalAmount < -0.005 || exchangeRefundDue > 0.005}
              />
              {enableMrp && effectiveDiscountPercent > 0 && (
                <div className="text-xs font-extrabold text-lime-200 mt-0.5">
                  ↓ {effectiveDiscountPercent.toFixed(1)}% off
                </div>
              )}
              {advanceApplied > 0.01 && posTenderDue !== Math.round(finalAmount) && (
                <div className="text-[10px] text-orange-200 font-semibold mt-0.5 text-center">
                  Due ₹{Math.round(posTenderDue).toLocaleString('en-IN')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Keyboard Shortcut Bar - Desktop only, redesigned with columns */}
        <div className="pos-sales-shortcuts hidden md:flex h-[52px] shrink-0 w-full flex-nowrap bg-slate-800 dark:bg-slate-950 text-white items-center gap-2 border-t border-slate-700/50 select-none px-2">
          {/* Last saved bill — pinned left so it is never clipped off-screen on web */}
          <div
            className="flex shrink-0 items-center gap-3 px-3 py-1.5 rounded-md bg-slate-900/90 border border-slate-600/50 min-w-[min(100%,22rem)]"
            title="Last saved POS invoice today"
          >
            <span className="text-xs uppercase tracking-wide text-slate-300 font-bold whitespace-nowrap">
              Last Bill
            </span>
            {lastCompletedPosHint ? (
              <>
                <span className="text-[15px] font-bold text-emerald-400 tabular-nums whitespace-nowrap">
                  {lastCompletedPosHint.invoiceNumber}
                </span>
                <span className="text-sm text-slate-200 whitespace-nowrap">
                  Qty{" "}
                  <span className="text-[15px] font-bold text-white tabular-nums">{lastCompletedPosHint.qty}</span>
                </span>
                <span className="text-base font-extrabold text-amber-300 tabular-nums whitespace-nowrap">
                  ₹{formatINR2(lastCompletedPosHint.amount)}
                </span>
              </>
            ) : (
              <span className="text-sm text-slate-500 whitespace-nowrap">No bill saved today</span>
            )}
          </div>

          <div className="w-px h-8 bg-slate-600 shrink-0" aria-hidden />

          <div className="flex flex-1 min-w-0 items-center justify-center gap-1 overflow-x-auto whitespace-nowrap">
          {/* Payment methods - amber/yellow */}
          {[
            { key: 'F1', label: 'Cash' },
            { key: 'F2', label: 'UPI' },
            { key: 'F3', label: 'Card' },
            { key: 'F4', label: 'Credit' },
          ].map(({ key, label }) => (
            <div key={key} className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-amber-600/20 cursor-pointer transition-colors min-w-[60px]">
              <kbd className="text-[10px] font-mono text-amber-400/80 font-bold leading-tight">{key}</kbd>
              <span className="text-[13px] font-extrabold text-amber-400 leading-tight">{label}</span>
            </div>
          ))}
          
          <div className="w-px h-7 bg-slate-600 mx-1 shrink-0" />
          
          {/* Actions - blue */}
          {[
            { key: 'F5', label: 'Return' },
            { key: 'F6', label: 'Mix Pay' },
            { key: 'F7', label: 'Hold' },
          ].map(({ key, label }) => (
            <div key={key} className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-blue-600/20 cursor-pointer transition-colors min-w-[60px]">
              <kbd className="text-[10px] font-mono text-blue-400/80 font-bold leading-tight">{key}</kbd>
              <span className="text-[13px] font-extrabold text-blue-400 leading-tight">{label}</span>
            </div>
          ))}
          
          <div className="w-px h-7 bg-slate-600 mx-1 shrink-0" />
          
          {/* Reports/actions - blue */}
          {[
            { key: 'F8', label: 'Report' },
            { key: 'F9', label: 'Estimate' },
            { key: 'F10', label: 'New Cust' },
            { key: 'F11', label: 'Stock' },
          ].map(({ key, label }) => (
            <div key={key} className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-blue-600/20 cursor-pointer transition-colors min-w-[60px]">
              <kbd className="text-[10px] font-mono text-blue-400/80 font-bold leading-tight">{key}</kbd>
              <span className="text-[13px] font-extrabold text-blue-400 leading-tight">{label}</span>
            </div>
          ))}
          
          <div className="w-px h-7 bg-slate-600 mx-1 shrink-0" />
          
          {/* Clear - red */}
          <div className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-red-600/20 cursor-pointer transition-colors min-w-[60px]">
            <kbd className="text-[10px] font-mono text-red-400/80 font-bold leading-tight">ESC</kbd>
            <span className="text-[13px] font-extrabold text-red-400 leading-tight">Clear</span>
          </div>
          
          {/* Print - white/neutral */}
          <div className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-slate-600/40 cursor-pointer transition-colors min-w-[60px]">
            <kbd className="text-[10px] font-mono text-slate-400/80 font-bold leading-tight">CTRL+P</kbd>
            <span className="text-[13px] font-extrabold text-slate-300 leading-tight">Print</span>
          </div>
          </div>
        </div>
        </div>

        {/* Print Dialog */}
        <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
          <DialogContent className="max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Invoice Preview</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <InvoiceWrapper
                ref={printRef}
                format={posInvoiceWrapperFormat}
                template={posInvoiceTemplate}
                thermalPaper={posThermalPaper}
                showMRP={enableMrp}
                showYouSaved={enableMrp ? undefined : false}
                billNo={currentInvoiceNumber || "DRAFT"}
                date={new Date()}
                customerName={customerName}
                customerAddress={customers.find(c => c.id === customerId)?.address || ""}
                customerMobile={customerPhone}
                customerGSTIN={customers.find(c => c.id === customerId)?.gst_number || ""}
                items={items.map((item, index) => ({
                  sr: index + 1,
                  particulars: item.productName,
                  itemNotes: item.itemNotes || "",
                  size: item.size,
                  barcode: item.barcode,
                  hsn: item.hsnCode || "",
                  sp: posLineNetUnitPrice(item),
                  mrp: item.originalMrp || item.mrp,
                  qty: item.quantity,
                  rate: posLineNetUnitPrice(item),
                  total: posLineDisplayTotal(item.netAmount, item.gstPer, invoiceTaxType),
                  gstPercent: item.gstPer || 0,
                  discountPercent: item.discountPercent || 0,
                }))}
                subTotal={totals.subtotal}
                discount={totals.discount + flatDiscountAmount}
                saleReturnAdjust={saleReturnAdjust}
                grandTotal={finalAmount}
                cashPaid={paymentMethod === 'cash' ? finalAmount : 0}
                upiPaid={paymentMethod === 'upi' ? finalAmount : 0}
                paymentMethod={paymentMethod}
                cashAmount={savedInvoiceData?.cashAmount || 0}
                upiAmount={savedInvoiceData?.upiAmount || 0}
                cardAmount={savedInvoiceData?.cardAmount || 0}
                creditAmount={savedInvoiceData?.creditAmount || 0}
                refundCash={savedInvoiceData?.refundCash || 0}
                paidAmount={paymentMethod === 'pay_later' ? 0 : finalAmount}
                previousBalance={customerBalance || 0}
                roundOff={roundOff}
                salesman={selectedSalesman || ''}
                taxType={invoiceTaxType}
                financerDetails={financerDetails}
                notes={saleNotes}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowPrintDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handlePrintInvoice} className="bg-primary">
                  <Printer className="mr-2 h-4 w-4" />
                  Download Invoice PDF
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Customer Dialog */}
        <Dialog open={showAddCustomerDialog} onOpenChange={setShowAddCustomerDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="customer_name">Customer Name *</Label>
                <Input
                  id="customer_name"
                  value={newCustomerForm.customer_name}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, customer_name: e.target.value })}
                  placeholder="Enter customer name"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Mobile Number</Label>
                <Input
                  id="phone"
                  value={newCustomerForm.phone}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                  placeholder="Enter mobile number (optional)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newCustomerForm.email}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                  placeholder="Enter email address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={newCustomerForm.address}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, address: e.target.value })}
                  placeholder="Enter address"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gst_number">GST Number</Label>
                <Input
                  id="gst_number"
                  value={newCustomerForm.gst_number}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, gst_number: e.target.value })}
                  placeholder="Enter GST number"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowAddCustomerDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createCustomer.mutate(newCustomerForm)}
                disabled={!newCustomerForm.customer_name.trim() || createCustomer.isPending}
              >
                {createCustomer.isPending ? "Adding..." : "Add Customer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        {creditCustomerRequiredDialog}
        {unitPriceConfirmDialog}

        {/* Print Confirmation Dialog */}
        <AlertDialog open={showPrintConfirmDialog} onOpenChange={setShowPrintConfirmDialog}>
          <AlertDialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => { e.preventDefault(); setTimeout(() => printBtnRef.current?.focus(), 50); }}>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                Invoice Saved!
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>
                  <p>Invoice {savedInvoiceData?.invoiceNumber} has been saved successfully.</p>
                  {savedInvoiceData?.notes && (
                    <div className="mt-2 p-2 bg-amber-50 rounded-md border border-amber-200">
                      <span className="font-medium text-amber-800">Note:</span>{' '}
                      <span className="text-amber-700">{savedInvoiceData.notes}</span>
                    </div>
                  )}
                  <p className="mt-2">What would you like to do next?</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-col gap-3 py-4">
              <Button 
                ref={printBtnRef}
                onClick={handlePrintFromDialog}
                className="w-full flex items-center justify-center gap-2"
              >
                <Printer className="h-4 w-4" />
                Print Invoice
              </Button>
              {savedInvoiceData?.customerPhone && (
                <Button 
                  variant="outline"
                  onClick={() => handleWhatsAppShare(false)}
                  className="w-full flex items-center justify-center gap-2 text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  Send via WhatsApp
                </Button>
              )}
              {!savedInvoiceData?.customerPhone && (
                <p className="text-xs text-muted-foreground text-center">
                  Add customer phone number to enable WhatsApp sharing
                </p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleClosePrintConfirmDialog}>
                Done
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Print Preview Dialog */}
        {savedInvoiceData && (
          <PrintPreviewDialog
            open={showPrintPreview}
            onOpenChange={(open) => {
              setShowPrintPreview(open);
              if (!open) {
                handleClosePrintConfirmDialog();
              }
            }}
            defaultFormat={posInvoiceWrapperFormat}
            thermalPaper={posThermalPaper}
            renderInvoice={(format) => (
              <InvoiceWrapper
                format={format}
                billNo={savedInvoiceData.invoiceNumber}
                date={new Date()}
                customerName={savedInvoiceData.customerName || "Walk-in Customer"}
                customerAddress={savedInvoiceData.customerAddress || ""}
                customerMobile={savedInvoiceData.customerPhone || ""}
                customerGSTIN={savedInvoiceData.customerGstNumber || ""}
                customerTransportDetails={savedInvoiceData.customerTransportDetails || ""}
                template={posInvoiceTemplate}
                thermalPaper={posThermalPaper}
                showMRP={enableMrp}
                showYouSaved={enableMrp ? undefined : false}
              items={savedInvoiceData.items.map((item: any, index: number) =>
                mapPosPrintItem(item, index, invoiceTaxType),
              )}
                subTotal={savedInvoiceData.totals.subtotal}
                discount={savedInvoiceData.totals.discount + savedInvoiceData.flatDiscountAmount}
                saleReturnAdjust={savedInvoiceData.saleReturnAdjust || 0}
                grandTotal={savedInvoiceData.finalAmount}
                cashPaid={savedInvoiceData.method === 'cash' ? (savedInvoiceData.paidAmount ?? savedInvoiceData.finalAmount) : 0}
                upiPaid={savedInvoiceData.method === 'upi' ? savedInvoiceData.finalAmount : 0}
                paymentMethod={savedInvoiceData.method}
                cashAmount={savedInvoiceData.cashAmount || 0}
                upiAmount={savedInvoiceData.upiAmount || 0}
                cardAmount={savedInvoiceData.cardAmount || 0}
                creditAmount={savedInvoiceData.creditAmount || 0}
                refundCash={savedInvoiceData.refundCash || 0}
                notes={savedInvoiceData.notes}
                paidAmount={savedInvoiceData.paidAmount ?? savedInvoiceData.finalAmount}
                previousBalance={savedInvoiceData.previousBalance ?? 0}
                roundOff={savedInvoiceData.roundOff ?? 0}
                salesman={savedInvoiceData?.salesman || selectedSalesman || ''}
                taxType={invoiceTaxType}
                financerDetails={savedInvoiceData?.financerDetails || financerDetails}
              />
            )}
            onPrint={handleClosePrintConfirmDialog}
          />
        )}

        {posPrintPortal}

        {/* Mix Payment Dialog */}
        <MixPaymentDialog
          open={showMixPaymentDialog}
          onOpenChange={setShowMixPaymentDialog}
          billAmount={mixDialogBillAmount}
          creditApplied={creditApplied}
          advanceApplied={advanceApplied}
          exchangeBreakdown={
            exchangeRefundDue > 0.01
              ? { returnTotal: saleReturnAdjust, applied: exchangeSrApplied, refundDue: exchangeRefundDue }
              : null
          }
          initialBreakdown={mixPaymentInitialBreakdown}
          onSave={handleMixPaymentSave}
        />

        {/* Credit Note Dialog */}
        <Dialog open={showCreditNoteDialog} onOpenChange={setShowCreditNoteDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-purple-600">Credit Note Issued</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-4">
              {creditNoteData && (
                <div className="bg-purple-50 p-4 rounded-lg text-center">
                  <p className="text-sm text-gray-600">Credit Note Number</p>
                  <p className="text-lg font-bold text-purple-700">{creditNoteData.credit_note_number}</p>
                  <p className="text-2xl font-bold text-purple-700 mt-2">₹{creditNoteData.credit_amount?.toFixed(2)}</p>
                  <p className="text-sm text-gray-600 mt-2">Customer: {creditNoteData.customer_name}</p>
                </div>
              )}
              <Button 
                onClick={triggerCreditNotePrint}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700"
              >
                <Printer className="h-4 w-4" />
                Print Credit Note
              </Button>
              {creditNoteData?.customer_phone && (
                <Button 
                  variant="outline"
                  onClick={() => {
                    const message = `*CREDIT NOTE ISSUED*\n\nC/Note No: ${creditNoteData.credit_note_number}\nDate: ${format(new Date(), 'dd/MM/yyyy')}\n\nCustomer: ${creditNoteData.customer_name}\nCredit Amount: ₹${creditNoteData.credit_amount?.toFixed(2)}\n\nThis credit can be used for your next purchase.\n\nThank you for your business!`;
                    sendWhatsApp(creditNoteData.customer_phone, message);
                  }}
                  className="w-full flex items-center justify-center gap-2 text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  Send via WhatsApp
                </Button>
              )}
            </div>
            <div className="flex justify-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowCreditNoteDialog(false);
                  setCreditNoteData(null);
                  // Clear cart
                  setItems([]);
                  setCustomerId("");
                  setCustomerName("");
                  setCustomerPhone("");
                  setFlatDiscountValue(0);
                  setFlatDiscountMode('percent');
                  setSaleReturnAdjust(0);
                  setSameBillReturnGross(0);
                  setRoundOff(0);
                  setSearchInput("");
                }}
              >
                Done
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <MrpTierSelectionDialog
          open={mrpTierPicker != null}
          enableMrp={posRuntimeSettings?.enable_mrp === true}
          onOpenChange={(open) => {
            if (!open) {
              setMrpTierPicker(null);
              focusBarcodeScanInput();
            }
          }}
          barcode={mrpTierPicker?.barcode ?? ""}
          choices={toMrpTierSelectionChoices(mrpTierPicker?.choices ?? [])}
          onSelect={(choiceId) => {
            const pick = mrpTierPicker?.choices.find((c) => c.variant.id === choiceId);
            const scannedBarcode = mrpTierPicker?.barcode ?? "";
            setMrpTierPicker(null);
            if (!pick) {
              focusBarcodeScanInput();
              return;
            }
            void addItemToCart(pick.product, pick.variant, undefined, "barcode").then(() => {
              if (scannedBarcode) recordPosBarcodeScanSuccess(scannedBarcode);
              focusBarcodeScanInput();
            });
          }}
        />

        {/* Price Selection Dialog */}
        {pendingPriceSelection && (
          <PriceSelectionDialog
            open={showPriceSelectionDialog}
            onOpenChange={(open) => {
              setShowPriceSelectionDialog(open);
              if (!open) {
                setPendingPriceSelection(null);
                focusBarcodeScanInput();
              }
            }}
            productName={pendingPriceSelection.product.product_name}
            size={pendingPriceSelection.variant.size}
            masterPrice={pendingPriceSelection.masterPrice}
            lastPurchasePrice={pendingPriceSelection.lastPurchasePrice}
            onSelect={handlePriceSelection}
          />
        )}

        {/* Hidden Credit Note for Printing */}
        {creditNoteData && (
          <div
            className="credit-note-print-source"
            style={{ position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -9999 }}
          >
            <CreditNotePrint 
              ref={creditNotePrintRef}
              creditNote={creditNoteData}
              settings={settingsData as any}
              format={posBillFormat}
              thermalPaper={posThermalPaper}
            />
          </div>
        )}

        <StockIssueAlertDialog
          open={showStockIssueDialog}
          onOpenChange={(open) => {
            setShowStockIssueDialog(open);
            if (!open) focusBarcodeScanInput();
          }}
          issue={stockIssuePresentation}
          onConfirm={() => {
            setOutOfStockProduct(null);
            focusBarcodeScanInput();
          }}
          secondaryAction={outOfStockProduct ? {
            label: "View History",
            onClick: () => setShowOutOfStockHistory(true),
          } : undefined}
        />

        {/* Floating Reports */}
        <FloatingPOSReports
          showCashierReport={showFloatingCashierReport}
          onCloseCashierReport={() => setShowFloatingCashierReport(false)}
          showStockReport={showFloatingStockReport}
          onCloseStockReport={() => setShowFloatingStockReport(false)}
        />

        {/* Floating Sale Return */}
        <FloatingSaleReturn
          open={showFloatingSaleReturn}
          onOpenChange={setShowFloatingSaleReturn}
          organizationId={currentOrganization?.id || ""}
          customerId={customerId}
          customerName={customerName || undefined}
          posCurrentSaleId={currentSaleId}
          onReturnSaved={handleSaleReturnSavedToBill}
        />

        {/* Advance Booking Dialog - Desktop */}
        <AddAdvanceBookingDialog
          open={showAdvanceBooking}
          onOpenChange={setShowAdvanceBooking}
          organizationId={currentOrganization?.id || ""}
        />

        <QuickServiceProductDialog
          open={showQuickServiceDialog}
          onOpenChange={(open) => {
            setShowQuickServiceDialog(open);
            if (!open) setQuickServiceProductForAdd(null);
          }}
          serviceCode={quickServiceCode}
          productName={quickServiceProductForAdd?.product?.product_name}
          defaultMrp={(() => {
            if (quickServiceProductForAdd?.variant) {
              if (quickServiceProductForAdd.product?.product_type === "service") {
                return resolveServiceVariantDefaultMrp(quickServiceProductForAdd.variant);
              }
              return resolveGoodsQtyDialogDefaultPrice(quickServiceProductForAdd.variant, grossBasis);
            }
            return quickServiceDialogDefaultMrp;
          })()}
          showDiscountField={
            quickServiceProductForAdd != null &&
            quickServiceProductForAdd.product?.product_type !== "service"
          }
          onAdd={handleQuickServiceAdd}
        />

        {/* Out-of-Stock Product History Dialog */}
        {outOfStockProduct && (
          <ProductHistoryDialog
            isOpen={showOutOfStockHistory}
            onClose={() => {
              setShowOutOfStockHistory(false);
              setOutOfStockProduct(null);
              barcodeInputRef.current?.focus();
            }}
            productId={outOfStockProduct.productId}
            productName={outOfStockProduct.productName}
            organizationId={currentOrganization?.id || ""}
          />
        )}

      </div>

      {/* DC Sale Transfer Dialog */}
      <DcSaleTransferDialog
        open={showDcTransferDialog}
        onOpenChange={setShowDcTransferDialog}
        saleId={dcTransferSaleId}
        customerId={customerId || null}
        customerName={customerName || "Walk-in"}
        dcItems={dcTransferItems}
      />

      {/* Financer / EMI Floating Dialog (Mobile ERP) */}
      <Dialog open={showFinancerDialog} onOpenChange={setShowFinancerDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Financer / EMI Details
            </DialogTitle>
          </DialogHeader>
          <FinancerDetailsForm
            value={financerDetails}
            onChange={(details) => setFinancerDetails(details)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowFinancerDialog(false)}>
              Close
            </Button>
            <Button size="sm" onClick={() => {
              setShowFinancerDialog(false);
              toast.success("Saved", { description: "Financer / EMI details saved" });
            }}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hold Bills Panel */}
      {showHoldPanel && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={(e) => { if (e.target === e.currentTarget) setShowHoldPanel(false); }}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-sm bg-background border-l border-border shadow-2xl flex flex-col h-full z-10">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-amber-600 shrink-0">
              <div className="flex items-center gap-2">
                <Pause className="h-4 w-4 text-white" />
                <span className="text-white font-semibold text-base">On Hold</span>
                <span className="bg-amber-900 text-amber-200 text-xs font-bold px-2 py-0.5 rounded-full">
                  {heldBills.length} bill{heldBills.length !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={() => setShowHoldPanel(false)}
                className="text-white/70 hover:text-white text-2xl leading-none"
              >×</button>
            </div>

            {/* Search */}
            <div className="px-3 py-2 border-b border-border shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search customer / bill no..."
                  value={holdSearchQuery}
                  onChange={(e) => setHoldSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
              </div>
            </div>

            {/* Bills list */}
            <div className="flex-1 overflow-y-auto py-2 px-3 space-y-2">
              {filteredHeldBills.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <Pause className="h-12 w-12 opacity-20" />
                  <p className="text-sm">
                    {holdSearchQuery ? 'No bills match your search' : 'No bills on hold'}
                  </p>
                </div>
              ) : (
                filteredHeldBills.map((bill: any) => {
                  const itemCount = getHoldItemCount(bill);
                  const timeStr = new Date(bill.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={bill.id} className="border border-border rounded-lg overflow-hidden bg-card">
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono text-muted-foreground">{bill.sale_number}</span>
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">ON HOLD</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{timeStr}</span>
                        </div>
                        <p className="font-semibold text-sm text-foreground mb-1">{bill.customer_name || 'Walk-in Customer'}</p>
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-xs text-muted-foreground">
                            {itemCount} item{itemCount !== 1 ? 's' : ''}
                            {bill.customer_phone && ` · ${bill.customer_phone}`}
                          </span>
                          <span className="text-sm font-bold text-foreground">₹{Math.round(bill.net_amount || 0).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                            onClick={() => handleResumeHeldBill(bill)}
                          >
                            <Play className="h-3 w-3" />
                            Resume Bill
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => handleDeleteHeldBill(bill.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-border bg-muted/40 shrink-0">
              <p className="text-[11px] text-muted-foreground text-center">
                Resume saves current cart to hold first if not empty
              </p>
            </div>
          </div>
        </div>
      )}

      {/*
        Hidden off-screen A4 invoice used solely for WhatsApp PDF capture.
        Positioned far off-canvas (not display:none) so html2canvas can read
        actual layout / loaded images. Mounts only while a snapshot is active.
      */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-100000px',
          top: 0,
          width: posPrintSourceStyle.width,
          maxWidth: posPrintSourceStyle.width,
          background: '#ffffff',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        <div ref={whatsappPdfRef}>
          {whatsappPdfSnapshot && <InvoiceWrapper {...whatsappPdfSnapshot} />}
        </div>
      </div>
    </div>
  );
}

