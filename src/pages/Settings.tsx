import { useState, useEffect, useRef, Suspense, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { lazyWithRetry, pauseBackgroundPrefetch, scheduleIdleWork } from "@/lib/chunkLoadRetry";
import { createSettingsPanel } from "@/components/settings/lazySettingsPanel";
import { prefetchTabPage, shouldAllowSpeculativeChunkPrefetch } from "@/lib/tabPageRegistry";
import { logError } from "@/lib/errorLogger";
import { UOM_OPTIONS } from "@/constants/uom";
import { useManufacturerERPAvailable } from "@/hooks/useManufacturerERP";
import { useIndustrialModeAvailable } from "@/hooks/useIndustrialMode";
import { IndustrialModeSettingsCard } from "@/components/settings/IndustrialModeSettingsCard";
import type { IndustrialModeConfig } from "@/utils/industrialMode";
import { EwayBillSettingsSection } from "@/components/ewaybill/EwayBillSettingsSection";
import { DEFAULT_MANUFACTURER_ERP, type ManufacturerERPConfig } from "@/utils/manufacturing";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { ArrowLeft, Home, Save, Eye, EyeOff, Shield, Printer, Package, Paintbrush, Copy, RefreshCw, CheckCircle2, Loader2, FileText, Smartphone, History, Settings as SettingsIcon, Factory, Truck, Building2, Landmark, Layers, ShoppingCart, Receipt, Tag, ListChecks, QrCode, Barcode, Wallet, Calculator, Gift, MessageCircle, Link2, Sparkles, Store } from "lucide-react";
import { FormPageSkeleton } from "@/components/skeletons/FormPageSkeleton";
import { SaleInvoiceFormatBackupDialog } from "@/components/settings/SaleInvoiceFormatBackupDialog";
import { InvoiceTemplateSelectItems } from "@/components/settings/InvoiceTemplateSelectItems";
import { PosSettingsForm } from "@/components/settings/PosSettingsForm";
import { SettingsInvoicePreview } from "@/components/settings/SettingsInvoicePreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JoinQrCard } from "@/components/whatsapp/JoinQrCard";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STANDARD_SHEET_TYPE_OPTIONS } from "@/constants/standardSheetTypeOptions";
import { useSettings } from "@/hooks/useSettings";
import { BillTabSheetPresetOptions } from "@/components/settings/BillTabSheetPresetOptions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SETTINGS_TAB_ITEMS,
  coerceSettingsTab,
  isVisibleSettingsTab,
} from "@/components/settings/settingsChrome";
import { normalizeServiceDefaultQty } from "@/utils/serviceDefaultQty";
import { isPhotoImportEnabled } from "@/utils/purchasePhotoImport";
import { SETTINGS_TAB_LIST_CLASS, SETTINGS_TAB_TRIGGER_CLASS, SettingsField, SettingsGrid, SettingsSection, SettingsToggle } from "@/components/settings/settingsLayout";
import { OwnerAlertsSettings } from "@/components/settings/OwnerAlertsSettings";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import type { SecondFirmSettings } from "@/utils/secondFirm";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  canSelectUpiSlot,
  coerceActiveUpiId,
  patchCompanyUpi,
  resolveCompanyUpiId,
  type ActiveUpiId,
} from "@/utils/companyUpi";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { DEFAULT_BACKUP_RETENTION_DAYS } from "@/utils/backupRetention";
import { useEffect as useEffectForSizeGroups } from "react";
import type { CalibrationPreset } from "@/components/precision-barcode/LabelCalibrationUI";
import {
  getPrecisionPrintModeDisplayName,
  inferPrecisionPrintMode,
  type PrecisionPrintMode,
} from "@/utils/precisionThermalModes";
import {
  encodePurchasePrice,
  normalizePurchaseCodeAlphabet,
  resolvePurchaseCodeIncludeDate,
  validatePurchaseCodeAlphabet,
} from "@/utils/purchaseCodeEncoder";
import { isKsFootwearSlug } from "@/utils/saleScanPricePreference";
import {
  paperPatchesForInvoiceTemplate,
  resolvePosInvoiceTemplate,
  resolvePosThermalPaper,
  resolveSaleInvoiceTemplate,
  type InvoiceTemplateId,
} from "@/utils/invoicePrintFormat";
import { persistQuotationPrintTemplate } from "@/utils/quotationPrintTemplate";
import {
  resolveSaleDefaultTaxType,
  type GstTaxType,
} from "@/utils/gstRegisterUtils";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { mergeActivityNavigationState } from "@/lib/activityCenterNavigation";

const loadUserManagementPanel = () =>
  import("@/components/UserManagement").then((m) => ({ default: m.UserManagement }));
const LazyUserManagement = lazyWithRetry(loadUserManagementPanel);
const loadSizeGroupPanel = () =>
  import("@/components/SizeGroupManagement").then((m) => ({ default: m.SizeGroupManagement }));
const LazySizeGroupManagement = lazyWithRetry(loadSizeGroupPanel);
const { Panel: WhatsAppTemplatePanel, preload: preloadWhatsAppTemplatePanel } = createSettingsPanel(() =>
  import("@/components/WhatsAppTemplateSettings").then((m) => ({ default: m.WhatsAppTemplateSettings })),
);
const { Panel: WhatsAppAPIPanel, preload: preloadWhatsAppAPIPanel } = createSettingsPanel(() =>
  import("@/components/WhatsAppAPISettings").then((m) => ({ default: m.WhatsAppAPISettings })),
);
const { Panel: CustomerPagePanel, preload: preloadCustomerPagePanel } = createSettingsPanel(() =>
  import("@/components/settings/CustomerPageSettings").then((m) => ({ default: m.CustomerPageSettings })),
);

// Settings > WhatsApp "Message templates" editor is hidden for now. Saved
// templates are still used for sends. Set to true to show the editor again.
const SHOW_WHATSAPP_MESSAGE_TEMPLATES = false;

function preloadWhatsAppTab() {
  preloadWhatsAppAPIPanel();
  if (SHOW_WHATSAPP_MESSAGE_TEMPLATES) preloadWhatsAppTemplatePanel();
  preloadCustomerPagePanel();
}
import { CompanyProfileBankAccounts } from "@/components/settings/CompanyProfileBankAccounts";
import { fssaiWarning } from "@/utils/fssai";

const loadDesktopPrintPanel = () =>
  import("@/components/DesktopPrintSettings").then((m) => ({ default: m.DesktopPrintSettings }));
const LazyDesktopPrintSettings = lazyWithRetry(loadDesktopPrintPanel);
const loadGiftRewardsPanel = () =>
  import("@/components/GiftRewardsManagement").then((m) => ({ default: m.GiftRewardsManagement }));
const LazyGiftRewardsManagement = lazyWithRetry(loadGiftRewardsPanel);
const loadChequeFormatPanel = () =>
  import("@/components/ChequeFormatManagement").then((m) => ({ default: m.ChequeFormatManagement }));
const LazyChequeFormatManagement = lazyWithRetry(loadChequeFormatPanel);
const loadPaymentGatewayPanel = () =>
  import("@/components/PaymentGatewaySettings").then((m) => ({ default: m.PaymentGatewaySettings }));
const LazyPaymentGatewaySettings = lazyWithRetry(loadPaymentGatewayPanel);

/**
 * Chunks each Settings tab needs. Hovering or focusing a tab starts the download so the
 * click opens the tab without a grey skeleton; all of them also warm on idle after the page
 * opens. A failed speculative warm is ignored: the real render retries on its own.
 */
const SETTINGS_TAB_PRELOADERS: Partial<Record<string, Array<() => Promise<unknown>>>> = {
  product: [loadSizeGroupPanel],
  sale: [loadGiftRewardsPanel],
  bill: [loadDesktopPrintPanel, loadChequeFormatPanel],
  users: [loadUserManagementPanel],
  payment: [loadPaymentGatewayPanel],
};

function preloadSettingsTab(tabId: string) {
  if (tabId === "whatsapp" || tabId === "reports") {
    preloadWhatsAppTab();
    return;
  }
  for (const load of SETTINGS_TAB_PRELOADERS[tabId] ?? []) {
    void load().catch(() => {});
  }
}

function preloadAllSettingsTabs() {
  for (const id of Object.keys(SETTINGS_TAB_PRELOADERS)) preloadSettingsTab(id);
}

function SettingsPanelFallback() {
  return <FormPageSkeleton groups={1} fieldsPerGroup={4} className="p-4" />;
}

function LazySettingsPanel({ children }: { children: ReactNode }) {
  return <Suspense fallback={<SettingsPanelFallback />}>{children}</Suspense>;
}

interface FieldConfig {
  label: string;
  enabled: boolean;
}

interface LabelFieldConfig {
  show: boolean;
  fontSize: number;
  bold: boolean;
}

interface BarcodeTemplate {
  id: string;
  name: string;
  sheetType: string;
  labelConfig: {
    brand: LabelFieldConfig;
    productName: LabelFieldConfig;
    color: LabelFieldConfig;
    style: LabelFieldConfig;
    size: LabelFieldConfig;
    price: LabelFieldConfig;
    barcode: LabelFieldConfig;
    barcodeText: LabelFieldConfig;
    billNumber: LabelFieldConfig;
    fieldOrder: string[];
  };
}

interface MobileERPConfig {
  enabled?: boolean;
  imei_scan_enforcement?: boolean;
  locked_size_qty?: boolean;
  financer_billing?: boolean;
  imei_min_length?: number;
  imei_max_length?: number;
  allow_imei_edit_after_save?: boolean;
}

interface ProductSettings {
  default_margin?: number;
  low_stock_threshold?: number;
  sku_format?: string;
  default_size_group?: string;
  mobile_erp?: MobileERPConfig;
  /** Manufacturer ERP (fabric roll → stages → ready piece). Shown only when Platform Admin enabled the feature. */
  manufacturer_erp?: ManufacturerERPConfig;
  /** Show the EMI / financer button in POS without Mobile ERP mode. */
  pos_emi_option?: boolean;
  /** When false, the POS skips the qty/price dialog for service products and
   * uses the price already defined at product entry. Default (undefined) = enabled. */
  service_quick_entry_dialog?: boolean;
  fields?: {
    category?: FieldConfig;
    brand?: FieldConfig;
    style?: FieldConfig;
    color?: FieldConfig;
    hsn_code?: FieldConfig;
    /** Not a product field: prints product Style beside IMEI/Barcode on Tally A4. Off by default. */
    warranty?: FieldConfig;
  };
}

interface PurchaseSettings {
  payment_terms?: string;
  auto_approve_threshold?: number;
  default_tax_rate?: number;
  default_uom?: string;
  purchase_code_alphabet?: string;
  show_purchase_code?: boolean;
  purchase_code_include_gst?: boolean;
  /** When true, barcode purchase code is MMCODEYR (e.g. 09SEWN26). Default letters only (SEWN). */
  purchase_code_include_date?: boolean;
  purchase_code_extra_percent_enabled?: boolean;
  purchase_code_extra_percent?: number;
  /** POS cart: show the letters-only purchase code before Size. Default off. */
  show_purchase_code_on_pos?: boolean;
  show_mrp?: boolean;
  product_entry_discount_enabled?: boolean;
  barcode_mode?: 'auto' | 'scan';
  same_barcode_series?: boolean;
  auto_focus_search?: boolean;
  size_grid_review_mode?: boolean;
  roll_wise_mtr_entry?: boolean;
  per_piece_barcode?: boolean;
  cursor_after_style?: 'pur_price' | 'hsn';
  garment_gst_rule_enabled?: boolean;
  garment_gst_threshold?: number;
  garment_gst_below_rate?: number;
  /** Purchase Entry "Photo" button (read supplier bill photos). On unless set to false. */
  photo_import_enabled?: boolean;
  /** DC (No GST) transactions: "show" (default) or "hide" everywhere. Ctrl+Shift+H flips. */
  dc_visibility_mode?: 'show' | 'hide';
}

interface EInvoiceSettings {
  enabled: boolean;
  test_mode: boolean;
  auto_generate: boolean;
  seller_gstin?: string; // Optional override for sandbox testing
  // API Credentials (per-organization)
  api_email?: string;      // User Email for API calls
  api_username?: string;   // Username / User ID
  api_password?: string;   // Password
  api_client_id?: string;  // Client ID
  api_client_secret?: string; // Client Secret
  /** E-Way Bill switch (any shop). Unset: on for Industrial mode shops, off for the rest. */
  ewb_enabled?: boolean;
  // E-way bill API: separate PeriOne keys (vehicle / extend / cancel)
  ewb_api_client_id?: string;
  ewb_api_client_secret?: string;
  ewb_api_username?: string;
  ewb_api_password?: string;
}

interface SaleSettings {
  /** Settings > Product: Industrial mode (Platform Admin feature `industrial_mode` + this switch). */
  industrial_mode?: IndustrialModeConfig;
  /** Settings > WhatsApp: gift voucher buttons (off until turned on). */
  gift_vouchers_enabled?: boolean;
  /** Settings > WhatsApp: Bulk WhatsApp page and menu (off until turned on). */
  bulk_whatsapp_enabled?: boolean;
  stock_transfer_enabled?: boolean;
  /** Settings > WhatsApp > Automatic messages (whatsapp-auto cron, linked number only). */
  auto_birthday_wish_enabled?: boolean;
  auto_birthday_offer?: string;
  auto_birthday_points?: number;
  /** Points added once when a customer sends JOIN from the counter QR (points system on). */
  join_welcome_points?: number;
  enable_customer_price_memory?: boolean; // Customer-wise sale price memory
  pos_barcode_price_mode?: 'mrp' | 'sale_price';
  /** When true, POS keeps the selected salesman after save (default off). */
  pos_retain_salesman?: boolean;
  /** Per-line salesperson column in POS cart (org-gated; default off). */
  pos_per_line_salesman?: boolean;
  default_discount?: number;
  /** When true, `default_discount` is applied as flat ₹ on new POS bills; default false = %. */
  default_discount_in_rupees?: boolean;
  /** When true, POS applies category quantity-tier bundle pricing (Trendzo Discount Scheme). */
  pos_category_tier_pricing?: boolean;
  /** Festival leftover pricing. Default false: leftover pieces at Single (₹). */
  pos_scheme_auto_calculate_discount?: boolean;
  /** Active discount scheme for POS tier rules; falls back to org default scheme. */
  active_discount_scheme_id?: string | null;
  /** When true, POS asks qty/discount in a dialog when picking or scanning regular goods. */
  pos_goods_ask_qty_dialog?: boolean;
  pos_dashboard_show_purchase_code?: boolean;
  /** Shared / Sale default GST mode (existing setting — unchanged for current orgs) */
  default_tax_type?: 'inclusive' | 'exclusive' | 'no_gst';
  /** Optional POS-only override; omit to keep using `default_tax_type` */
  default_pos_tax_type?: 'inclusive' | 'exclusive' | 'no_gst';
  payment_methods?: string[];
  default_payment_method?: string;
  invoice_numbering_format?: string;  // For Sale Invoice INV-{YYYY}-{####}
  pos_numbering_format?: string;  // For POS billing POS-{YYYY}-{####}
  invoice_paper_format?: 'a5-vertical' | 'a5-horizontal' | 'a4' | 'thermal';  // Paper size
  sales_bill_format?: 'a4' | 'a5' | 'thermal';  // kept for backward compat
  pos_bill_format?: 'a4' | 'a5' | 'a5-vertical' | 'a5-horizontal' | 'thermal';  // POS bill format
  defaultEntryMode?: 'grid' | 'inline';  // Default entry mode for Sale Order
  enable_size_grid_sales?: boolean; // Enable/disable size grid in Sales Invoice
  sales_tax_rate?: number;
  invoice_template?: InvoiceTemplateId;
  /** POS-only invoice layout; falls back to `invoice_template` when unset. */
  pos_invoice_template?: InvoiceTemplateId;
  /** Quotation print layout: existing retail design vs IT-company (no MRP). */
  quotation_print_template?: 'retail' | 'it-company';
  /** When true, quotation print prepends Settings → Sale terms before quotation terms. */
  merge_sale_terms_on_quotation?: boolean;
  invoice_color_scheme?: string;
  declaration_text?: string;
  terms_list?: string[];
  show_hsn_code?: boolean;
  show_barcode?: boolean;
  show_gst_breakdown?: boolean;
  show_bank_details?: boolean;
  show_invoice_preview?: boolean;  // Enable/disable invoice preview before printing
  min_item_rows?: number;
  show_total_quantity?: boolean;
  amount_with_decimal?: boolean;
  show_received_amount?: boolean;
  show_balance_amount?: boolean;
  show_party_balance?: boolean;
  show_tax_details?: boolean;
  show_you_saved?: boolean;
  amount_with_grouping?: boolean;
  bank_details?: {
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    account_holder?: string;
    branch?: string;
  };
  // Invoice Customization
  invoice_header_text?: string;
  invoice_footer_text?: string;
  /** Heading on invoice body — e.g. BILL OF SUPPLY, CATERING SERVICE (Real Tast / A4). */
  invoice_document_title?: string;
  logo_placement?: 'left' | 'center' | 'right';
  /**
   * Preprinted Invoice only. When true, print the uploaded shop logo in the 2" top gap.
   * Default off so orgs with physical letterpad paper stay blank.
   */
  print_logo_on_preprinted_letterhead?: boolean;
  font_family?: 'inter' | 'roboto' | 'montserrat' | 'opensans' | 'playfair' | 'merriweather' | 'lora' | 'raleway' | 'poppins';
  // Wholesale Mode Settings
  enable_wholesale_mode?: boolean;
  size_display_format?: 'size/qty' | 'size×qty';
  show_product_color?: boolean;
  show_product_brand?: boolean;
  show_product_style?: boolean;
  // Item Details Settings (for bill/dashboard display)
  show_item_brand?: boolean;
  show_item_color?: boolean;
  show_item_style?: boolean;
  show_item_barcode?: boolean;
  show_item_hsn?: boolean;
  show_item_mrp?: boolean;
  /** Tally GST A4 only. Off prints the description saved on the line. */
  invoice_description_sequence_enabled?: boolean;
  /** brand_first = brand, then product name. product_first = product name, then brand. */
  invoice_description_sequence?: "product_first" | "brand_first";
  /** Show -27% style discount under Rate on printed invoices (Retail ERP, etc.) */
  show_discount_on_rate?: boolean;
  // Invoice column settings
  show_mrp_column?: boolean;
  // E-Invoice Settings
  einvoice_settings?: EInvoiceSettings;
  thermal_receipt_style?: 'classic' | 'compact' | 'modern' | 'tvs' | 'new-design';
  auto_apply_advance?: boolean;
  pos_series_start?: string;
  invoice_series_start?: string;
}

interface BillBarcodeSettings {
  logo_url?: string;
  /** Food shops: FSSAI licence number, printed under the address on sale bills when filled. */
  fssai_number?: string;
  header_text?: string;
  footer_text?: string;
  barcode_width?: number;
  barcode_height?: number;
  print_format?: string;
  show_brand?: boolean;
  show_category?: boolean;
  show_color?: boolean;
  show_style?: boolean;
  show_hsn_code?: boolean;
  upi_id?: string;
  upi_id_2?: string;
  active_upi_id?: "primary" | "secondary";
  dc_upi_id?: string;
  invoice_format?: string;
  show_product_details?: boolean;
  barcode_format?: string;
  barcode_digits?: number;
  brand_color?: string;
  login_display_name?: string;
  instagram_link?: string;
  facebook_link?: string;
  website_link?: string;
  google_review_link?: string;
  whatsapp_group_link?: string;
  enable_barcode_prompt?: boolean;
  // Cash Drawer Settings
  enable_cash_drawer?: boolean;
  cash_drawer_printer?: string;
  cash_drawer_pin?: 'pin2' | 'pin5';
  // Direct Printing (QZ Tray) Settings
  enable_direct_print?: boolean;
  direct_print_sale_printer?: string;
  direct_print_sale_paper?: 'A4' | 'A5' | '80mm' | '58mm';
  direct_print_pos_printer?: string;
  direct_print_pos_paper?: 'A4' | 'A5' | '80mm' | '58mm';
  direct_print_auto_print?: boolean;
  direct_print_copies?: number;
  // Precision Pro Barcode Settings
  precision_pro_enabled?: boolean;
  precision_x_offset?: number;
  precision_y_offset?: number;
  precision_v_gap?: number;
  precision_label_width?: number;
  precision_label_height?: number;
  precision_a4_cols?: number;
  precision_a4_rows?: number;
  precision_print_mode?: 'thermal' | 'a4' | 'thermal2up' | 'thermal3up' | 'footwear';
  precision_label_config?: any; // LabelDesignConfig stored as JSON
  /**
   * Default Barcode Printing landing:
   * auto | standard | precision | precision_1up | precision_2up | precision_3up | precision_footwear
   */
  barcode_default_print_tab?:
    | "standard"
    | "precision"
    | "auto"
    | "precision_1up"
    | "precision_2up"
    | "precision_3up"
    | "precision_footwear";
  /** Precision Pro landing mode when opening Barcode Printing */
  default_thermal_landing?: 'thermal' | 'thermal2up' | 'thermal3up' | 'footwear';
  /** Sheet Type auto-selected when Standard Printing opens (sheetPresets key) */
  default_standard_sheet_type?: string;
  /** printer_presets.id used as default label design for the landing mode */
  default_precision_preset_id?: string;
  // Stamp / Signature Settings
  stamp_image_base64?: string;
  stamp_position?: 'bottom-right' | 'bottom-left';
  stamp_size?: 'small' | 'medium' | 'large';
  stamp_show_sale?: boolean;
  stamp_show_purchase?: boolean;
  stamp_show_dc?: boolean;
  stamp_show_pos?: boolean;
}

interface ReportSettings {
  default_date_range?: string;
  export_formats?: string[];
  stock_report_columns?: string[];
  purchase_report_columns?: string[];
  /** 2nd firm header for POS bills (same stock/accounts; header only). */
  second_firm?: SecondFirmSettings;
  /** Quantity pre-filled in the service product popup on Sale bill / POS (1 when unset). */
  service_default_qty?: number;
}

interface Settings {
  business_name?: string;
  address?: string;
  mobile_number?: string;
  owner_phone?: string;
  email_id?: string;
  gst_number?: string;
  product_settings?: ProductSettings;
  purchase_settings?: PurchaseSettings;
  sale_settings?: SaleSettings;
  bill_barcode_settings?: BillBarcodeSettings;
  report_settings?: ReportSettings;
  auto_backup_enabled?: boolean;
  backup_email?: string;
  backup_retention_days?: number;
  last_auto_backup_at?: string | null;
}

/** Settings columns read by this page (excludes id, timestamps, dashboard_settings, accounting_engine_enabled, books_closed_before_date). */
const QZStatusBadge = () => {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const { waitForQZ, ensureQZConnection, isQZReady } = 
        await import('@/utils/directInvoicePrint');
      if (isQZReady()) {
        if (mounted) setStatus('connected');
        return;
      }
      const loaded = await waitForQZ();
      if (!loaded) { if (mounted) setStatus('disconnected'); return; }
      const connected = await ensureQZConnection();
      if (mounted) setStatus(connected ? 'connected' : 'disconnected');
    };
    check();
    return () => { mounted = false; };
  }, []);

  if (status === 'checking') {
    return <span className="text-xs text-muted-foreground animate-pulse">Checking...</span>;
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${status === 'connected' 
      ? 'bg-green-50 text-green-700 border-green-300' 
      : 'bg-red-50 text-red-700 border-red-300'}`}>
      {status === 'connected' ? '● Connected' : '○ Not Running'}
    </span>
  );
};

export default function Settings() {
  const { orgNavigate: navigate } = useOrgNavigation();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization, organizations } = useOrganization();
  const manufacturerErpAvailable = useManufacturerERPAvailable();
  const industrialModeAvailable = useIndustrialModeAvailable();
  const { data: cachedSettings } = useSettings();
  const settingsHydratedRef = useRef(false);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(["company"]));
  const [currentTab, setCurrentTab] = useState("company");
  // Dashboard "Set up your shop" steps open a given tab ({ settingsTab: "pos" }).
  const requestedSettingsTab = (location.state as { settingsTab?: unknown } | null)?.settingsTab;
  useEffect(() => {
    if (typeof requestedSettingsTab === "string" && isVisibleSettingsTab(requestedSettingsTab)) {
      setCurrentTab(requestedSettingsTab);
      setVisitedTabs((prev) => new Set([...prev, requestedSettingsTab]));
    }
  }, [location.key, requestedSettingsTab]);
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [sizeGroups, setSizeGroups] = useState<any[]>([]);
  const [showApiPassword, setShowApiPassword] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!shouldAllowSpeculativeChunkPrefetch()) return;
    return scheduleIdleWork(
      () => {
        preloadWhatsAppTab();
        preloadAllSettingsTabs();
      },
      { minDelay: 2_500 },
    );
  }, []);

  useEffect(() => {
    const merged = mergeActivityNavigationState(
      location.state as { scrollTo?: string } | null,
      currentOrganization?.id,
      "settings",
    );
    if (merged?.scrollTo === "backup") {
      window.history.replaceState({}, document.title);
      navigate("/backup");
    }
  }, [location.key, location.state, currentOrganization?.id, navigate]);

  const [settings, setSettings] = useState<Settings>({
    business_name: "",
    address: "",
    mobile_number: "",
    owner_phone: "",
    email_id: "",
    gst_number: "",
    product_settings: {},
    purchase_settings: {},
    sale_settings: {},
    bill_barcode_settings: {},
    report_settings: {},
    auto_backup_enabled: true,
    backup_email: "",
    backup_retention_days: DEFAULT_BACKUP_RETENTION_DAYS,
    last_auto_backup_at: null,
  });

  const [detectedPrinters, setDetectedPrinters] = useState<string[]>([]);
  const [barcodeTemplates, setBarcodeTemplates] = useState<BarcodeTemplate[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BarcodeTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateSheetType, setTemplateSheetType] = useState("a4_12x4");
  /** Live preview channel — Sale vs POS format/template (Settings → Sale). */
  const [invoicePreviewChannel, setInvoicePreviewChannel] = useState<"sale" | "pos">("sale");

  // Sample data for invoice preview - includes multiple sizes for wholesale grouping demo
  const sampleInvoiceData = {
    billNo: 'INV/25-26/0001',
    date: new Date(),
    customerName: 'Sharma Textiles',
    customerAddress: '45 Wholesale Market, Gandhi Nagar, Ahmedabad',
    customerMobile: '9876543210',
    items: [
      {
        sr: 1,
        particulars: 'Cotton Casual Shirt',
        size: '38',
        barcode: '10001001',
        hsn: '62051000',
        sp: 599,
        mrp: 599,
        qty: 2,
        rate: 450,
        total: 900,
        color: 'Blue',
        brand: 'StyleWear',
        gstPercent: 5
      },
      {
        sr: 2,
        particulars: 'Cotton Casual Shirt',
        size: '40',
        barcode: '10001002',
        hsn: '62051000',
        sp: 599,
        mrp: 599,
        qty: 3,
        rate: 450,
        total: 1350,
        color: 'Blue',
        brand: 'StyleWear',
        gstPercent: 5
      },
      {
        sr: 3,
        particulars: 'Cotton Casual Shirt',
        size: '42',
        barcode: '10001003',
        hsn: '62051000',
        sp: 599,
        qty: 1,
        rate: 450,
        total: 450,
        color: 'Blue',
        brand: 'StyleWear',
        gstPercent: 5
      },
      {
        sr: 4,
        particulars: 'Cotton Casual Shirt',
        size: '44',
        barcode: '10001004',
        hsn: '62051000',
        sp: 599,
        qty: 2,
        rate: 450,
        total: 900,
        color: 'Blue',
        brand: 'StyleWear',
        gstPercent: 5
      },
      {
        sr: 5,
        particulars: 'Formal Trouser',
        size: '32',
        barcode: '10001010',
        hsn: '62034200',
        sp: 899,
        qty: 5,
        rate: 650,
        total: 3250,
        color: 'Black',
        brand: 'FormalFit',
        gstPercent: 12
      },
      {
        sr: 6,
        particulars: 'Formal Trouser',
        size: '34',
        barcode: '10001011',
        hsn: '62034200',
        sp: 899,
        qty: 3,
        rate: 650,
        total: 1950,
        color: 'Black',
        brand: 'FormalFit',
        gstPercent: 12
      }
    ],
    subTotal: 8800,
    discount: 300,
    grandTotal: 8935,
    tenderAmount: 9000,
    cashPaid: 9000,
    refundCash: 65,
    upiPaid: 0,
    gstin: '24AABCS1234D1ZP'
  };

  const [settingsDbPresets, setSettingsDbPresets] = useState<CalibrationPreset[]>([]);
  const [allOrgPresets, setAllOrgPresets] = useState<Array<{
    preset: CalibrationPreset;
    orgId: string;
    orgName: string;
  }>>([]);
  const [importingPresetId, setImportingPresetId] = useState<string | null>(null);
  const [invoiceFormatBackupOpen, setInvoiceFormatBackupOpen] = useState(false);

  const fetchDbPresets = async () => {
    if (!currentOrganization?.id) return;
    try {
      const { data } = await supabase
        .from("printer_presets")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("name");
      if (data) {
        setSettingsDbPresets(data.map((p: any) => ({
          id: p.id, name: p.name,
          xOffset: Number(p.x_offset), yOffset: Number(p.y_offset),
          vGap: Number(p.v_gap), width: Number(p.label_width), height: Number(p.label_height),
          a4Cols: p.a4_cols, a4Rows: p.a4_rows,
          printMode: (p.print_mode as CalibrationPreset["printMode"]) || undefined,
          thermalCols: Number(p.thermal_cols) || 1,
          labelConfig: p.label_config, isDefault: p.is_default,
        })));
      }
    } catch (error) {
      console.error("Failed to fetch printer presets:", error);
    }
  };

  const fetchAllOrgPresets = async () => {
    const otherOrgIds = organizations
      .filter(o => o.id !== currentOrganization?.id)
      .map(o => o.id);

    if (otherOrgIds.length === 0 && !currentOrganization?.id) {
      setAllOrgPresets([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('printer_presets')
        .select('*')
        .in('organization_id', [...otherOrgIds, currentOrganization?.id || ''])
        .order('name');

      if (error) throw error;

      const mapped = (data || []).map((p: any) => ({
        preset: {
          id: p.id,
          name: p.name,
          xOffset: Number(p.x_offset),
          yOffset: Number(p.y_offset),
          vGap: Number(p.v_gap),
          width: Number(p.label_width),
          height: Number(p.label_height),
          a4Cols: p.a4_cols,
          a4Rows: p.a4_rows,
          printMode: p.print_mode as 'thermal' | 'a4' | undefined,
          labelConfig: p.label_config,
          isDefault: p.is_default,
        } as CalibrationPreset,
        orgId: p.organization_id,
        orgName: organizations.find(o => o.id === p.organization_id)?.name || 'Unknown',
      }));

      setAllOrgPresets(mapped);
    } catch (err) {
      console.error('Failed to fetch all org presets:', err);
    }
  };

  const handleImportPreset = async (item: {
    preset: CalibrationPreset;
    orgId: string;
    orgName: string;
  }) => {
    if (!currentOrganization?.id) return;
    setImportingPresetId(item.preset.id || item.preset.name);

    try {
      const existingNames = settingsDbPresets.map(p => p.name.toLowerCase());
      let importName = item.preset.name;
      if (existingNames.includes(importName.toLowerCase())) {
        importName = `${importName} (${item.orgName})`;
      }

      const { error } = await supabase
        .from('printer_presets')
        .insert({
          organization_id: currentOrganization.id,
          name: importName,
          x_offset: item.preset.xOffset,
          y_offset: item.preset.yOffset,
          v_gap: item.preset.vGap,
          label_width: item.preset.width,
          label_height: item.preset.height,
          a4_cols: item.preset.a4Cols ?? null,
          a4_rows: item.preset.a4Rows ?? null,
          print_mode: item.preset.printMode ?? 'thermal',
          label_config: item.preset.labelConfig ?? null,
          is_default: false,
        } as any);

      if (error) throw error;

      toast({
        title: 'Label Design Imported',
        description: `"${importName}" copied from ${item.orgName} to this shop.`,
      });

      fetchDbPresets();
    } catch (err: any) {
      toast({
        title: 'Import Failed',
        description: err.message || 'Could not import label design',
        variant: 'destructive',
      });
    } finally {
      setImportingPresetId(null);
    }
  };

  useEffect(() => {
    settingsHydratedRef.current = false;
  }, [currentOrganization?.id]);

  useEffect(() => {
    if (!cachedSettings || settingsHydratedRef.current) return;
    settingsHydratedRef.current = true;
    const settingsData = cachedSettings as any;
    setSettings({
      business_name: settingsData.business_name || "",
      address: settingsData.address || "",
      mobile_number: settingsData.mobile_number || "",
      owner_phone: settingsData.owner_phone || "",
      email_id: settingsData.email_id || "",
      gst_number: settingsData.gst_number || "",
      product_settings: (settingsData.product_settings as ProductSettings) || {},
      purchase_settings: (settingsData.purchase_settings as PurchaseSettings) || {},
      sale_settings: (settingsData.sale_settings as SaleSettings) || {},
      bill_barcode_settings: (settingsData.bill_barcode_settings as BillBarcodeSettings) || {},
      report_settings: (settingsData.report_settings as ReportSettings) || {},
      auto_backup_enabled: settingsData.auto_backup_enabled !== false,
      backup_email: settingsData.backup_email || "",
      backup_retention_days: settingsData.backup_retention_days ?? DEFAULT_BACKUP_RETENTION_DAYS,
      last_auto_backup_at: settingsData.last_auto_backup_at ?? null,
    });
  }, [cachedSettings, currentOrganization?.id]);

  useEffect(() => {
    if (!currentOrganization?.id || !visitedTabs.has("bill")) return;
    fetchDbPresets();
  }, [visitedTabs, currentOrganization?.id, organizations.length]);

  // Prefill landing + design from the org's current is_default preset when unset
  useEffect(() => {
    if (!visitedTabs.has("bill")) return;
    if (settings.bill_barcode_settings?.default_thermal_landing) return;
    if (settingsDbPresets.length === 0) return;
    const currentDefault = settingsDbPresets.find((p) => p.isDefault);
    if (!currentDefault?.id) return;
    const mode = inferPrecisionPrintMode(currentDefault);
    if (
      mode !== "thermal" &&
      mode !== "thermal2up" &&
      mode !== "thermal3up" &&
      mode !== "footwear"
    ) {
      return;
    }
    const tab =
      mode === "footwear"
        ? "precision_footwear"
        : mode === "thermal3up"
          ? "precision_3up"
          : mode === "thermal2up"
            ? "precision_2up"
            : "precision_1up";
    setSettings((prev) => ({
      ...prev,
      bill_barcode_settings: {
        ...prev.bill_barcode_settings,
        barcode_default_print_tab:
          prev.bill_barcode_settings?.barcode_default_print_tab === "auto" ||
          !prev.bill_barcode_settings?.barcode_default_print_tab
            ? tab
            : prev.bill_barcode_settings.barcode_default_print_tab === "precision"
              ? tab
              : prev.bill_barcode_settings.barcode_default_print_tab,
        default_thermal_landing: mode,
        default_precision_preset_id: currentDefault.id,
        precision_print_mode: mode,
      },
    }));
  }, [settingsDbPresets, visitedTabs, settings.bill_barcode_settings?.default_thermal_landing]);

  useEffect(() => {
    if (!currentOrganization?.id || !visitedTabs.has("product")) return;
    fetchSizeGroups();
  }, [visitedTabs, currentOrganization?.id]);

  const fetchSizeGroups = async () => {
    if (!currentOrganization?.id) return;
    try {
      const { data, error } = await supabase
        .from("size_groups")
        .select("id, group_name")
        .eq("organization_id", currentOrganization.id)
        .order("group_name");
      
      if (error) throw error;
      setSizeGroups(data || []);
    } catch (error) {
      console.error("Error fetching size groups:", error);
    }
  };

  const updateSecondFirm = (patch: Partial<SecondFirmSettings>) => {
    setSettings((prev) => ({
      ...prev,
      report_settings: {
        ...(prev.report_settings || {}),
        second_firm: { ...(prev.report_settings?.second_firm || {}), ...patch },
      },
    }));
  };

  const handleSave = async () => {
    if (!currentOrganization?.id) {
      toast({
        title: "Error",
        description: "No organization selected",
        variant: "destructive",
      });
      return;
    }

    const alphabetDraft = settings.purchase_settings?.purchase_code_alphabet;
    if (alphabetDraft && !validatePurchaseCodeAlphabet(alphabetDraft)) {
      toast({
        title: "Invalid purchase code alphabet",
        description: "Enter exactly 10 unique characters (A-Z or 0-9). First letter = 0, last = 9.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const purchaseSettingsToSave = {
        ...settings.purchase_settings,
        ...(alphabetDraft
          ? { purchase_code_alphabet: normalizePurchaseCodeAlphabet(alphabetDraft) }
          : {}),
      };

      // Check if settings already exist for this organization
      const { data: existingSettings, error: fetchError } = await supabase
        .from("settings" as any)
        .select("id")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const settingsId = existingSettings ? (existingSettings as any).id : null;
      let error;
      
      if (settingsId) {
        // Update existing settings
        const { error: updateError } = await supabase
          .from("settings" as any)
          .update({
            business_name: settings.business_name,
            address: settings.address,
            mobile_number: settings.mobile_number,
            owner_phone: settings.owner_phone,
            email_id: settings.email_id,
            gst_number: settings.gst_number,
            product_settings: settings.product_settings,
            purchase_settings: purchaseSettingsToSave,
            sale_settings: settings.sale_settings,
            bill_barcode_settings: settings.bill_barcode_settings,
            report_settings: settings.report_settings,
          })
          .eq("id", settingsId);
        error = updateError;
      } else {
        // Insert new settings
        const { error: insertError } = await supabase
          .from("settings" as any)
          .insert({
            organization_id: currentOrganization.id,
            business_name: settings.business_name,
            address: settings.address,
            mobile_number: settings.mobile_number,
            owner_phone: settings.owner_phone,
            email_id: settings.email_id,
            gst_number: settings.gst_number,
            product_settings: settings.product_settings,
            purchase_settings: purchaseSettingsToSave,
            sale_settings: settings.sale_settings,
            bill_barcode_settings: settings.bill_barcode_settings,
            report_settings: settings.report_settings,
          });
        error = insertError;
      }

      if (error) throw error;

      setSettings((prev) => ({
        ...prev,
        purchase_settings: purchaseSettingsToSave,
      }));

      // POS / other screens read via useSettings() — bump cache so toggles apply immediately.
      await queryClient.invalidateQueries({
        queryKey: ["org-settings", currentOrganization.id],
      });

      // Sync Precision Pro default landing design onto printer_presets.is_default
      const landing =
        settings.bill_barcode_settings?.default_thermal_landing || "thermal";
      const presetId = settings.bill_barcode_settings?.default_precision_preset_id;
      if (
        presetId &&
        (landing === "thermal" ||
          landing === "thermal2up" ||
          landing === "thermal3up" ||
          landing === "footwear")
      ) {
        const thermalCols =
          landing === "thermal3up" ? 3 : landing === "thermal2up" ? 2 : 1;
        const matchingIds = settingsDbPresets
          .filter((p) => inferPrecisionPrintMode(p) === landing)
          .map((p) => p.id)
          .filter((id): id is string => !!id);
        if (matchingIds.length > 0) {
          await supabase
            .from("printer_presets")
            .update({ is_default: false })
            .eq("organization_id", currentOrganization.id)
            .in("id", matchingIds);
        }
        await supabase
          .from("printer_presets")
          .update({
            is_default: true,
            print_mode: landing,
            thermal_cols: thermalCols,
          })
          .eq("id", presetId)
          .eq("organization_id", currentOrganization.id);
        await fetchDbPresets();
      }

      toast({
        title: "Success",
        description: "Settings saved successfully",
      });
    } catch (error: any) {
      logError(
        {
          operation: 'settings_save',
          organizationId: currentOrganization?.id,
          additionalContext: { section: 'general' },
        },
        error
      );
      console.error("Error saving settings:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestPrintBarcodes = async () => {
    try {
      // Create sample barcode items for testing
      const sampleItems = [
        {
          sku_id: 'sample-1',
          product_name: 'Sample Product 1',
          brand: 'SMART INVENTORY',
          color: 'Blue',
          style: 'Casual',
          size: 'M',
          sale_price: 1299,
          barcode: '10001001',
          qty: 2,
          bill_number: 'B0125001',
        },
        {
          sku_id: 'sample-2',
          product_name: 'Sample Product 2',
          brand: 'SMART INVENTORY',
          color: 'Red',
          style: 'Formal',
          size: 'L',
          sale_price: 1599,
          barcode: '10001002',
          qty: 2,
          bill_number: 'B0125001',
        },
        {
          sku_id: 'sample-3',
          product_name: 'Sample Product 3',
          brand: 'SMART INVENTORY',
          color: 'Black',
          style: 'Sport',
          size: 'XL',
          sale_price: 1899,
          barcode: '10001003',
          qty: 2,
          bill_number: 'B0125002',
        },
      ];

      const selectedFormat = settings.bill_barcode_settings?.barcode_format || 'a4_12x4';
      
      const { printBarcodesDirectly } = await import("@/utils/barcodePrinter");
      await printBarcodesDirectly(sampleItems, {
        sheetType: selectedFormat as any,
      });
      
      toast({
        title: "Test Print Sent",
        description: "Sample barcodes sent to printer with selected format",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to test print barcodes",
        variant: "destructive",
      });
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a template name",
        variant: "destructive",
      });
      return;
    }

    const defaultLabelConfig = {
      brand: { show: true, fontSize: 10, bold: true },
      productName: { show: true, fontSize: 9, bold: false },
      color: { show: true, fontSize: 8, bold: false },
      style: { show: true, fontSize: 8, bold: false },
      size: { show: true, fontSize: 10, bold: true },
      price: { show: true, fontSize: 10, bold: true },
      mrp: { show: false, fontSize: 8, bold: false },
      customText: { show: false, fontSize: 8, bold: false },
      barcode: { show: true, fontSize: 8, bold: false },
      barcodeText: { show: true, fontSize: 7, bold: false },
      billNumber: { show: true, fontSize: 7, bold: false },
      supplierCode: { show: false, fontSize: 7, bold: false },
      purchaseCode: { show: false, fontSize: 7, bold: false },
      fieldOrder: ['brand', 'productName', 'color', 'style', 'size', 'price', 'mrp', 'customText', 'barcode', 'barcodeText', 'billNumber', 'supplierCode', 'purchaseCode']
    };

    try {
      let updatedTemplates: BarcodeTemplate[];
      
      if (editingTemplate) {
        // Update existing template
        updatedTemplates = barcodeTemplates.map(t => 
          t.id === editingTemplate.id 
            ? { ...t, name: templateName, sheetType: templateSheetType, labelConfig: defaultLabelConfig }
            : t
        );
      } else {
        // Create new template
        const newTemplate: BarcodeTemplate = {
          id: Date.now().toString(),
          name: templateName,
          sheetType: templateSheetType,
          labelConfig: defaultLabelConfig
        };
        updatedTemplates = [...barcodeTemplates, newTemplate];
      }

      // Save to database
      const { error } = await supabase
        .from('settings')
        .update({
          bill_barcode_settings: {
            ...settings.bill_barcode_settings,
            barcode_templates: updatedTemplates
          } as any
        })
        .eq('organization_id', currentOrganization?.id);

      if (error) throw error;

      setBarcodeTemplates(updatedTemplates);
      setSettings(prev => ({
        ...prev,
        bill_barcode_settings: {
          ...prev.bill_barcode_settings,
          barcode_templates: updatedTemplates
        }
      }));

      toast({
        title: "Success",
        description: editingTemplate ? "Template updated successfully" : "Template created successfully",
      });

      // Reset form
      setShowTemplateDialog(false);
      setEditingTemplate(null);
      setTemplateName("");
      setTemplateSheetType("a4_12x4");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save template",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      const updatedTemplates = barcodeTemplates.filter(t => t.id !== templateId);

      const { error } = await supabase
        .from('settings')
        .update({
          bill_barcode_settings: {
            ...settings.bill_barcode_settings,
            barcode_templates: updatedTemplates
          } as any
        })
        .eq('organization_id', currentOrganization?.id);

      if (error) throw error;

      setBarcodeTemplates(updatedTemplates);
      setSettings(prev => ({
        ...prev,
        bill_barcode_settings: {
          ...prev.bill_barcode_settings,
          barcode_templates: updatedTemplates
        }
      }));

      toast({
        title: "Success",
        description: "Template deleted successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete template",
        variant: "destructive",
      });
    }
  };

  const handleEditTemplate = (template: BarcodeTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateSheetType(template.sheetType);
    setShowTemplateDialog(true);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Storage RLS for the company-logos bucket requires the object to live under a folder
    // named after the organization id (foldername(name)[1] = org id). Uploading to a flat
    // filename fails the WITH CHECK and surfaces as "Failed to upload logo".
    const orgId = currentOrganization?.id;
    if (!orgId) {
      toast({
        title: "Error",
        description: "Select an organization before uploading a logo",
        variant: "destructive",
      });
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Error",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image size should be less than 2MB",
        variant: "destructive",
      });
      return;
    }

    setUploadingLogo(true);
    try {
      // Delete old logo if exists. Derive the stored object path (org-folder + filename)
      // from the public URL so it matches what RLS expects for DELETE.
      if (settings.bill_barcode_settings?.logo_url) {
        const oldUrl = settings.bill_barcode_settings.logo_url;
        const marker = "/company-logos/";
        const idx = oldUrl.indexOf(marker);
        const oldPath =
          idx >= 0 ? oldUrl.slice(idx + marker.length) : oldUrl.split("/").pop();
        if (oldPath) {
          await supabase.storage.from("company-logos").remove([oldPath]);
        }
      }

      // Upload new logo under the org-id folder required by the bucket RLS policy.
      const fileExt = file.name.split(".").pop();
      const filePath = `${orgId}/logo-${Date.now()}.${fileExt}`;
      const { error: uploadError, data } = await supabase.storage
        .from("company-logos")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("company-logos")
        .getPublicUrl(filePath);

      setSettings({
        ...settings,
        bill_barcode_settings: {
          ...settings.bill_barcode_settings,
          logo_url: urlData.publicUrl,
        },
      });

      toast({
        title: "Success",
        description: "Logo uploaded successfully",
      });
    } catch (error) {
      console.error("Error uploading logo:", error);
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Error",
        description: message ? `Failed to upload logo: ${message}` : "Failed to upload logo",
        variant: "destructive",
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className="settings-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-sm shrink-0 border-slate-200 bg-white"
              onClick={() => {
                if (window.history.length > 1) window.history.back();
                else navigate("/");
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0 shrink-0 border-slate-200 bg-white"
              onClick={() => navigate("/")}
              title="Home"
            >
              <Home className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-none flex items-center gap-2">
                <span className="h-8 w-8 rounded-lg bg-blue-600 text-white grid place-items-center shrink-0 shadow-sm">
                  <SettingsIcon className="h-4 w-4" />
                </span>
                Settings
              </h1>
              <p className="text-xs text-slate-500 mt-1 truncate">Saved settings apply to this shop only</p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-9 px-4 text-sm font-semibold shrink-0 bg-blue-600 hover:bg-blue-700 shadow-sm"
            onClick={handleSave}
            disabled={loading}
          >
            <Save className="h-4 w-4 mr-1.5" />
            Save Settings
          </Button>
        </div>

        <Tabs
          value={coerceSettingsTab(currentTab)}
          onValueChange={(value) => {
            const next = coerceSettingsTab(value);
            setCurrentTab(next);
            setVisitedTabs((prev) => new Set([...prev, next]));
            if (next === "pos") setInvoicePreviewChannel("pos");
            if (next === "sale") setInvoicePreviewChannel("sale");
          }}
          className="settings-tabs w-full min-h-0"
        >
          <TabsList className={SETTINGS_TAB_LIST_CLASS}>
            {SETTINGS_TAB_ITEMS.map(({ id, label, icon: Icon }) => (
              <TabsTrigger
                key={id}
                value={id}
                className={cn(SETTINGS_TAB_TRIGGER_CLASS, "flex items-center")}
                onPointerEnter={() => preloadSettingsTab(id)}
                onFocus={() => preloadSettingsTab(id)}
                onPointerDown={() => {
                  pauseBackgroundPrefetch(15_000);
                  preloadSettingsTab(id);
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="company">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-start">
              <SettingsSection
                className="xl:col-span-2"
                title="Business details"
                subtitle="Printed on every bill, quotation and report"
                icon={Building2}
                tone="blue"
              >
                <SettingsGrid cols={3}>
                  <SettingsField label="Business Name" htmlFor="business_name" required important span={2}>
                    <Input
                      id="business_name"
                      className="no-uppercase"
                      value={settings.business_name || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, business_name: e.target.value })
                      }
                    />
                  </SettingsField>
                  <SettingsField label="GST Number" htmlFor="gst_number" important badge="ON BILLS">
                    <Input
                      id="gst_number"
                      value={settings.gst_number || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, gst_number: e.target.value })
                      }
                      placeholder="e.g. 27ABCDE1234F1Z5"
                      className="font-mono"
                    />
                  </SettingsField>
                  <SettingsField label="Address" htmlFor="address" span="full">
                    <Textarea
                      id="address"
                      rows={2}
                      value={settings.address || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, address: e.target.value })
                      }
                    />
                  </SettingsField>
                  <SettingsField label="Mobile Number" htmlFor="mobile_number" required>
                    <Input
                      id="mobile_number"
                      inputMode="tel"
                      value={settings.mobile_number || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, mobile_number: e.target.value })
                      }
                    />
                  </SettingsField>
                  <SettingsField
                    label="Owner WhatsApp Number"
                    htmlFor="owner_phone"
                    help={
                      <>
                        Send <strong className="text-slate-700">report, sales, stock, credit, expenses, week, staff</strong> or{" "}
                        <strong className="text-slate-700">hi</strong> to get today's tally.
                      </>
                    }
                  >
                    <Input
                      id="owner_phone"
                      inputMode="tel"
                      value={settings.owner_phone || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, owner_phone: e.target.value })
                      }
                      placeholder="e.g. 9876543210"
                    />
                  </SettingsField>
                  <SettingsField label="Email ID" htmlFor="email_id">
                    <Input
                      id="email_id"
                      type="email"
                      className="no-uppercase"
                      value={settings.email_id || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, email_id: e.target.value })
                      }
                    />
                  </SettingsField>
                  <SettingsField
                    label="FSSAI Number"
                    htmlFor="fssai_number"
                    help={
                      fssaiWarning(settings.bill_barcode_settings?.fssai_number || "") ||
                      "Food shops only. Printed under your address on sale bills when filled."
                    }
                  >
                    <Input
                      id="fssai_number"
                      inputMode="numeric"
                      value={settings.bill_barcode_settings?.fssai_number || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...(settings.bill_barcode_settings || {}),
                            fssai_number: e.target.value.replace(/\s+/g, ""),
                          } as BillBarcodeSettings,
                        })
                      }
                      placeholder="e.g. 11521999000123 (optional)"
                      className="font-mono"
                    />
                  </SettingsField>
                </SettingsGrid>
              </SettingsSection>
              <SettingsSection
                title="Receiving bank accounts"
                subtitle="UPI, card and bank receipts"
                icon={Landmark}
                tone="emerald"
              >
                <div className="p-4">
                  <CompanyProfileBankAccounts embedded />
                </div>
              </SettingsSection>
            </div>
          </TabsContent>

          <TabsContent value="branding">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-start">
              <SettingsSection
                className="xl:col-span-2"
                title="Brand identity"
                subtitle="Logo, colour and name on your login page, bills and labels"
                icon={Paintbrush}
                tone="violet"
              >
                <SettingsGrid cols={2}>
                  <SettingsField
                    label="Organization Logo"
                    htmlFor="org_logo"
                    important
                    span={2}
                    help="JPG or PNG, max 2 MB. Also prints on invoices and barcode labels."
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 bg-slate-50 grid place-items-center overflow-hidden">
                        {settings.bill_barcode_settings?.logo_url ? (
                          <img
                            src={settings.bill_barcode_settings.logo_url}
                            alt="Organization logo"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <Paintbrush className="h-5 w-5 text-slate-300" />
                        )}
                      </div>
                      <Input
                        id="org_logo"
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        disabled={uploadingLogo}
                        className="flex-1"
                      />
                    </div>
                  </SettingsField>
                  <SettingsField label="Primary Brand Color" htmlFor="brand_color" help="Used on your login page">
                    <div className="flex items-center gap-2">
                      <Input
                        id="brand_color"
                        type="color"
                        value={settings.bill_barcode_settings?.brand_color || "#3b82f6"}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            bill_barcode_settings: {
                              ...settings.bill_barcode_settings,
                              brand_color: e.target.value,
                            },
                          })
                        }
                        className="w-14 shrink-0 p-1 cursor-pointer"
                      />
                      <Input
                        type="text"
                        value={settings.bill_barcode_settings?.brand_color || "#3b82f6"}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            bill_barcode_settings: {
                              ...settings.bill_barcode_settings,
                              brand_color: e.target.value,
                            },
                          })
                        }
                        placeholder="#3b82f6"
                        className="font-mono no-uppercase"
                      />
                    </div>
                  </SettingsField>
                  <SettingsField
                    label="Login Page Display Name"
                    htmlFor="login_display_name"
                    help="Leave empty to use the business name"
                  >
                    <Input
                      id="login_display_name"
                      value={settings.bill_barcode_settings?.login_display_name || settings.business_name || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...settings.bill_barcode_settings,
                            login_display_name: e.target.value,
                          },
                        })
                      }
                      placeholder="Enter the name to show on login page"
                    />
                  </SettingsField>
                </SettingsGrid>
              </SettingsSection>
              <SettingsSection title="Login page preview" subtitle="How customers and staff see it" icon={Eye} tone="sky">
                <div className="p-4 bg-slate-50">
                  <div className="mx-auto max-w-xs rounded-xl bg-white p-5 shadow-md">
                    {settings.bill_barcode_settings?.logo_url && (
                      <div className="flex justify-center mb-3">
                        <img
                          src={settings.bill_barcode_settings.logo_url}
                          alt="Logo preview"
                          className="h-14 w-auto object-contain"
                        />
                      </div>
                    )}
                    <h2
                      className="text-lg font-bold text-center mb-1"
                      style={{ color: settings.bill_barcode_settings?.brand_color || "#3b82f6" }}
                    >
                      {settings.bill_barcode_settings?.login_display_name || settings.business_name || "Your Organization"}
                    </h2>
                    <p className="text-xs text-center text-muted-foreground">Sign in to access your account</p>
                  </div>
                </div>
              </SettingsSection>
              <SettingsSection
                className="xl:col-span-3"
                title="Authorised Stamp / Signature"
                subtitle="Upload a stamp or signature image that appears on invoices"
                icon={Pencil}
                tone="amber"
              >
                <div className="p-4">
                  <div className="space-y-4">
                    {/* Upload area */}
                    <div className="flex items-start gap-4">
                      <label
                        htmlFor="stamp_upload"
                        className="flex flex-col items-center justify-center w-40 h-32 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors bg-muted/30"
                      >
                        {settings.bill_barcode_settings?.stamp_image_base64 ? (
                          <img
                            src={settings.bill_barcode_settings.stamp_image_base64}
                            alt="Stamp preview"
                            className="max-w-full max-h-full object-contain p-1"
                          />
                        ) : (
                          <div className="text-center p-2">
                            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-1" />
                            <p className="text-xs text-muted-foreground">Click to upload</p>
                          </div>
                        )}
                        <input
                          id="stamp_upload"
                          type="file"
                          accept="image/png,image/jpeg,image/jpg"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 2 * 1024 * 1024) {
                              toast({ title: "File too large", description: "Max 2MB allowed", variant: "destructive" });
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              setSettings({
                                ...settings,
                                bill_barcode_settings: {
                                  ...settings.bill_barcode_settings,
                                  stamp_image_base64: ev.target?.result as string,
                                },
                              });
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>PNG, JPG (max 2MB)</p>
                        <p>Stamp or signature image</p>
                        {settings.bill_barcode_settings?.stamp_image_base64 && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="mt-2"
                            onClick={() =>
                              setSettings({
                                ...settings,
                                bill_barcode_settings: {
                                  ...settings.bill_barcode_settings,
                                  stamp_image_base64: undefined,
                                },
                              })
                            }
                          >
                            Remove Image
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Position */}
                    <div className="space-y-1.5">
                      <Label>Position on Invoice</Label>
                      <div className="flex gap-4">
                        {(['bottom-right', 'bottom-left'] as const).map((pos) => (
                          <label key={pos} className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <input
                              type="radio"
                              name="stamp_position"
                              checked={(settings.bill_barcode_settings?.stamp_position || 'bottom-right') === pos}
                              onChange={() =>
                                setSettings({
                                  ...settings,
                                  bill_barcode_settings: { ...settings.bill_barcode_settings, stamp_position: pos },
                                })
                              }
                            />
                            {pos === 'bottom-right' ? 'Bottom Right (default)' : 'Bottom Left'}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Size */}
                    <div className="space-y-1.5">
                      <Label>Stamp Size</Label>
                      <div className="flex gap-2">
                        {(['small', 'medium', 'large'] as const).map((sz) => (
                          <Button
                            key={sz}
                            variant={(settings.bill_barcode_settings?.stamp_size || 'medium') === sz ? 'default' : 'outline'}
                            size="sm"
                            onClick={() =>
                              setSettings({
                                ...settings,
                                bill_barcode_settings: { ...settings.bill_barcode_settings, stamp_size: sz },
                              })
                            }
                          >
                            {sz.charAt(0).toUpperCase() + sz.slice(1)}
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">Small=80px, Medium=120px, Large=160px</p>
                    </div>

                    {/* Show on */}
                    <div className="space-y-1.5">
                      <Label>Show on</Label>
                      <div className="flex flex-wrap gap-4">
                        {[
                          { key: 'stamp_show_sale' as const, label: 'Sale Invoice', def: true },
                          { key: 'stamp_show_purchase' as const, label: 'Purchase Bill', def: true },
                          { key: 'stamp_show_dc' as const, label: 'DC / Challan', def: false },
                          { key: 'stamp_show_pos' as const, label: 'POS Receipt', def: false },
                        ].map(({ key, label, def }) => (
                          <label key={key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <Checkbox
                              checked={settings.bill_barcode_settings?.[key] ?? def}
                              onCheckedChange={(checked) =>
                                setSettings({
                                  ...settings,
                                  bill_barcode_settings: { ...settings.bill_barcode_settings, [key]: !!checked },
                                })
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </SettingsSection>
            </div>
          </TabsContent>

          <TabsContent value="product">
            <div className="space-y-3">
              <SettingsSection title="Product defaults" subtitle="Used when you add a new product" icon={Package} tone="violet">
                <SettingsGrid cols={4}>
                  <SettingsField label="Default Profit Margin (%)" htmlFor="default_margin">
                    <Input
                      id="default_margin"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={settings.product_settings?.default_margin || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          product_settings: {
                            ...settings.product_settings,
                            default_margin: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      placeholder="e.g., 20"
                    />
                  </SettingsField>
                  <SettingsField
                    label="Low Stock Alert at"
                    htmlFor="low_stock_threshold"
                    important
                    help="Owner alert when stock falls to this qty"
                  >
                    <Input
                      id="low_stock_threshold"
                      type="number"
                      min="0"
                      value={settings.product_settings?.low_stock_threshold || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          product_settings: {
                            ...settings.product_settings,
                            low_stock_threshold: parseInt(e.target.value) || 0,
                          },
                        })
                      }
                      placeholder="e.g., 10"
                    />
                  </SettingsField>
                  <SettingsField label="Default Size Group" htmlFor="default_size_group" help="Add Product starts with this size group">
                    <Select
                    value={settings.product_settings?.default_size_group || "none"}
                    onValueChange={(value) =>
                      setSettings({
                        ...settings,
                        product_settings: {
                          ...settings.product_settings,
                          // Persist "none" explicitly so product entry defaults to
                          // no-size (single "None" variant) instead of inheriting
                          // the last product's size group.
                          default_size_group: value,
                        },
                      })
                    }
                  >
                    <SelectTrigger id="default_size_group">
                      <SelectValue placeholder="Select default size group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="last">Same as last product</SelectItem>
                      {sizeGroups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.group_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  </SettingsField>
                  <SettingsField
                    label="Service products"
                    htmlFor="service_quick_entry_dialog"
                    help="ON: billing a service asks qty &amp; price. OFF: adds it at the saved price."
                  >
                    <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3">
                      <span className="text-[13px] font-semibold text-slate-700">Ask Qty &amp; Price</span>
                      <Switch
                    id="service_quick_entry_dialog"
                    checked={settings.product_settings?.service_quick_entry_dialog !== false}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        product_settings: {
                          ...settings.product_settings,
                          service_quick_entry_dialog: checked,
                        },
                      })
                    }
                  />
                    </div>
                  </SettingsField>
                </SettingsGrid>
              </SettingsSection>

              <SettingsSection
                title="Product entry form fields"
                subtitle="Rename a field or switch it off on Add Product"
                icon={Layers}
                tone="amber"
              >
                <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                  {[
                    { key: 'category', defaultLabel: 'Category' },
                    { key: 'brand', defaultLabel: 'Brand' },
                    { key: 'style', defaultLabel: 'Style' },
                    { key: 'color', defaultLabel: 'Color' },
                    { key: 'hsn_code', defaultLabel: 'HSN Code' },
                    {
                      key: 'warranty',
                      defaultLabel: 'Warranty',
                      defaultEnabled: false,
                      hint: 'Prints the product Style beside IMEI/Barcode on the Tally A4 bill',
                    },
                  ].map((field) => {
                    const enabled = settings.product_settings?.fields?.[field.key as keyof NonNullable<typeof settings.product_settings.fields>]?.enabled ?? (field.defaultEnabled ?? true);
                    return (
                    <div
                      key={field.key}
                      className={cn(
                        "rounded-lg border p-2.5 space-y-2 transition-colors",
                        enabled ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Label
                          htmlFor={`enable_${field.key}`}
                          className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-slate-500"
                        >
                          {field.defaultLabel}
                        </Label>
                        <Switch
                          id={`enable_${field.key}`}
                          checked={enabled}
                          onCheckedChange={(checked) => {
                            setSettings({
                              ...settings,
                              product_settings: {
                                ...settings.product_settings,
                                fields: {
                                  ...settings.product_settings?.fields,
                                  [field.key]: {
                                    label: settings.product_settings?.fields?.[field.key as keyof NonNullable<typeof settings.product_settings.fields>]?.label || field.defaultLabel,
                                    enabled: checked as boolean,
                                  },
                                },
                              },
                            });
                          }}
                        />
                      </div>
                      <Input
                        id={`label_${field.key}`}
                        aria-label={`${field.defaultLabel} label`}
                        value={settings.product_settings?.fields?.[field.key as keyof NonNullable<typeof settings.product_settings.fields>]?.label || field.defaultLabel}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            product_settings: {
                              ...settings.product_settings,
                              fields: {
                                ...settings.product_settings?.fields,
                                [field.key]: {
                                  label: e.target.value,
                                  enabled,
                                },
                              },
                            },
                          });
                        }}
                        placeholder={field.defaultLabel}
                        disabled={!enabled}
                      />
                      {field.hint ? <p className="text-[11px] leading-snug text-slate-500">{field.hint}</p> : null}
                    </div>
                    );
                  })}
                </div>
              </SettingsSection>
            </div>

            {/* Mobile ERP / IMEI Tracking Mode */}
            <Card className="mt-3 h-fit settings-panel-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Mobile ERP Mode
                </CardTitle>
                <CardDescription>
                  Enable IMEI tracking for mobile/electronics shops. Each unit gets a unique IMEI number for full traceability.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                  <div>
                    <Label className="text-base font-semibold">Enable Mobile ERP Mode</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Activates IMEI tracking, locked size/qty, and financer billing across purchase & sales
                    </p>
                  </div>
                  <Switch
                    checked={settings.product_settings?.mobile_erp?.enabled || false}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        product_settings: {
                          ...settings.product_settings,
                          mobile_erp: {
                            ...settings.product_settings?.mobile_erp,
                            enabled: checked,
                          },
                        },
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                  <div>
                    <Label className="text-base font-semibold">POS EMI option</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Show the EMI button in POS to enter financer / EMI details. They print on the Tally A4 invoice. Works without Mobile ERP mode.
                    </p>
                  </div>
                  <Switch
                    checked={settings.product_settings?.pos_emi_option || false}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        product_settings: {
                          ...settings.product_settings,
                          pos_emi_option: checked,
                        },
                      })
                    }
                  />
                </div>

                {settings.product_settings?.mobile_erp?.enabled && (
                  <div className="space-y-3 pl-4 border-l-2 border-primary/30">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label className="font-medium">IMEI Scan Enforcement</Label>
                        <p className="text-xs text-muted-foreground">Require scanning IMEI — block manual entry without scan</p>
                      </div>
                      <Switch
                        checked={settings.product_settings?.mobile_erp?.imei_scan_enforcement ?? true}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            product_settings: {
                              ...settings.product_settings,
                              mobile_erp: {
                                ...settings.product_settings?.mobile_erp,
                                imei_scan_enforcement: checked,
                              },
                            },
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label className="font-medium">Locked Size & Qty</Label>
                        <p className="text-xs text-muted-foreground">Size fixed to "Free", Qty fixed to 1 per IMEI</p>
                      </div>
                      <Switch
                        checked={settings.product_settings?.mobile_erp?.locked_size_qty ?? true}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            product_settings: {
                              ...settings.product_settings,
                              mobile_erp: {
                                ...settings.product_settings?.mobile_erp,
                                locked_size_qty: checked,
                              },
                            },
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label className="font-medium">Financer Billing</Label>
                        <p className="text-xs text-muted-foreground">Add EMI/Loan details (Bajaj, IDFC, TVS Credit, etc.) to sale bills</p>
                      </div>
                      <Switch
                        checked={settings.product_settings?.mobile_erp?.financer_billing ?? true}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            product_settings: {
                              ...settings.product_settings,
                              mobile_erp: {
                                ...settings.product_settings?.mobile_erp,
                                financer_billing: checked,
                              },
                            },
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label className="font-medium">Allow IMEI Edit After Save</Label>
                        <p className="text-xs text-muted-foreground">
                          Let staff correct a wrong scan (e.g. universal box code instead of IMEI) on saved purchase bills
                        </p>
                      </div>
                      <Switch
                        checked={settings.product_settings?.mobile_erp?.allow_imei_edit_after_save ?? true}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            product_settings: {
                              ...settings.product_settings,
                              mobile_erp: {
                                ...settings.product_settings?.mobile_erp,
                                allow_imei_edit_after_save: checked,
                              },
                            },
                          })
                        }
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4 p-3 border rounded-lg">
                      <div className="space-y-1">
                        <Label className="text-sm">IMEI Min Length</Label>
                        <Input
                          type="number"
                          min="1"
                          max="30"
                          value={settings.product_settings?.mobile_erp?.imei_min_length ?? 4}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              product_settings: {
                                ...settings.product_settings,
                                mobile_erp: {
                                  ...settings.product_settings?.mobile_erp,
                                  imei_min_length: parseInt(e.target.value) || 4,
                                },
                              },
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-sm">IMEI Max Length</Label>
                        <Input
                          type="number"
                          min="5"
                          max="50"
                          value={settings.product_settings?.mobile_erp?.imei_max_length ?? 25}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              product_settings: {
                                ...settings.product_settings,
                                mobile_erp: {
                                  ...settings.product_settings?.mobile_erp,
                                  imei_max_length: parseInt(e.target.value) || 25,
                                },
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {manufacturerErpAvailable && (() => {
              const mfg = settings.product_settings?.manufacturer_erp;
              const setMfg = (patch: Partial<ManufacturerERPConfig>) =>
                setSettings({
                  ...settings,
                  product_settings: {
                    ...settings.product_settings,
                    manufacturer_erp: { ...mfg, ...patch },
                  },
                });
              return (
                <Card className="mt-3 h-fit settings-panel-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Factory className="h-5 w-5" />
                      Manufacturer ERP
                    </CardTitle>
                    <CardDescription>
                      Make your own garments: buy fabric in metres, send it through Cutting, Polishing, Colouring and the other stages, and see wastage and the cost of each piece.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                      <div>
                        <Label className="text-base font-semibold">Enable Manufacturer ERP</Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Adds the Manufacturing menu: stages, design cards and fabric stock in metres
                        </p>
                      </div>
                      <Switch
                        checked={mfg?.enabled || false}
                        onCheckedChange={(checked) => setMfg({ enabled: checked })}
                      />
                    </div>

                    {mfg?.enabled && (
                      <div className="space-y-3 pl-4 border-l-2 border-primary/30">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label htmlFor="mfg_allowed_wastage">Allowed fabric wastage %</Label>
                            <Input
                              id="mfg_allowed_wastage"
                              type="number"
                              min={0}
                              max={100}
                              step="0.5"
                              value={mfg?.allowed_wastage_percent ?? DEFAULT_MANUFACTURER_ERP.allowed_wastage_percent}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                setMfg({ allowed_wastage_percent: Number.isFinite(v) ? Math.min(Math.max(v, 0), 100) : 0 });
                              }}
                            />
                            <p className="text-xs text-muted-foreground">Fabric used above the design card by more than this is flagged</p>
                          </div>
                          <div className="space-y-1">
                            <Label>When fabric issued is above allowed</Label>
                            <Select
                              value={mfg?.over_issue_action ?? DEFAULT_MANUFACTURER_ERP.over_issue_action}
                              onValueChange={(v) => setMfg({ over_issue_action: v as ManufacturerERPConfig["over_issue_action"] })}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="warn">Warn only</SelectItem>
                                <SelectItem value="block">Block, owner must approve</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label>Leftover fabric after cutting</Label>
                            <Select
                              value={mfg?.end_bits_default ?? DEFAULT_MANUFACTURER_ERP.end_bits_default}
                              onValueChange={(v) => setMfg({ end_bits_default: v as ManufacturerERPConfig["end_bits_default"] })}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="wastage">Count as wastage</SelectItem>
                                <SelectItem value="stock">Put back in stock</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">This is the default. It can be changed for each lot.</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {industrialModeAvailable && (
              <IndustrialModeSettingsCard
                value={settings.sale_settings?.industrial_mode}
                onChange={(next) =>
                  setSettings({
                    ...settings,
                    sale_settings: { ...settings.sale_settings, industrial_mode: next },
                  })
                }
              />
            )}
            
            <LazySettingsPanel>
              <LazySizeGroupManagement />
            </LazySettingsPanel>
          </TabsContent>

          <TabsContent value="purchase">
            <div className="space-y-3">
              <SettingsSection title="Purchase defaults" subtitle="Filled in for you on every new purchase and product" icon={ShoppingCart} tone="blue">
                <SettingsGrid cols={4}>
                  <SettingsField label="Default Tax Rate (%)" htmlFor="default_tax_rate">
                    <Input
                      id="default_tax_rate"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={settings.purchase_settings?.default_tax_rate ?? ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          purchase_settings: {
                            ...settings.purchase_settings,
                            default_tax_rate: parseFloat(e.target.value) ?? 0,
                          },
                        })
                      }
                      placeholder="e.g., 18"
                    />
                  </SettingsField>
                  <SettingsField label="Default UOM" htmlFor="default_uom" help="Pre-selected on a new product (NOS = pieces)">
                    <Select
                      value={settings.purchase_settings?.default_uom || 'NOS'}
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          purchase_settings: {
                            ...settings.purchase_settings,
                            default_uom: value,
                          },
                        })
                      }
                    >
                      <SelectTrigger id="default_uom">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UOM_OPTIONS.map((uom) => (
                          <SelectItem key={uom.value} value={uom.value}>
                            {uom.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingsField>
                  <SettingsField
                    label="Barcode Mode"
                    htmlFor="barcode_mode"
                    important
                    help="Auto: new barcode for each new product. Scan: type or scan the supplier barcode."
                  >
                    <Select
                      value={settings.purchase_settings?.barcode_mode || 'auto'}
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          purchase_settings: {
                            ...settings.purchase_settings,
                            barcode_mode: value as 'auto' | 'scan',
                          },
                        })
                      }
                    >
                      <SelectTrigger id="barcode_mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">🔢 Auto Generate</SelectItem>
                        <SelectItem value="scan">📷 Scan / Manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingsField>
                  <SettingsField
                    label="Cursor after Style (Product Entry)"
                    htmlFor="cursor_after_style"
                    help="Where Enter / Tab goes after the Style field"
                  >
                    <Select
                      value={settings.purchase_settings?.cursor_after_style || 'pur_price'}
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          purchase_settings: {
                            ...settings.purchase_settings,
                            cursor_after_style: value as 'pur_price' | 'hsn',
                          },
                        })
                      }
                    >
                      <SelectTrigger id="cursor_after_style">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pur_price">⚡ Skip to Purchase Price (default)</SelectItem>
                        <SelectItem value="hsn">📋 Go to HSN → Pur GST → Sale GST → Pur Price</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingsField>
                </SettingsGrid>
              </SettingsSection>

              <div className="grid gap-3 xl:grid-cols-2">
                <SettingsSection
                  title="Garment / Footwear GST rule"
                  subtitle="Sale GST switches to 18% above a price"
                  icon={Receipt}
                  tone="amber"
                  action={
                    <Switch
                      id="garment_gst_rule_enabled"
                      checked={settings.purchase_settings?.garment_gst_rule_enabled === true}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          purchase_settings: {
                            ...settings.purchase_settings,
                            garment_gst_rule_enabled: checked,
                          },
                        })
                      }
                    />
                  }
                >
                  <SettingsGrid cols={2}>
                    <SettingsField label="Threshold price (incl. GST)" htmlFor="garment_gst_threshold" important>
                      <Input
                        id="garment_gst_threshold"
                        type="number"
                        min="0"
                        step="1"
                        value={settings.purchase_settings?.garment_gst_threshold ?? 2625}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            purchase_settings: {
                              ...settings.purchase_settings,
                              garment_gst_threshold: parseFloat(e.target.value) || 0,
                            },
                          })
                        }
                        disabled={!settings.purchase_settings?.garment_gst_rule_enabled}
                        placeholder="2625"
                      />
                    </SettingsField>
                    <SettingsField label="GST % at / below threshold" htmlFor="garment_gst_below_rate">
                      <Input
                        id="garment_gst_below_rate"
                        type="number"
                        min="0"
                        max="28"
                        step="0.5"
                        value={settings.purchase_settings?.garment_gst_below_rate ?? 5}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            purchase_settings: {
                              ...settings.purchase_settings,
                              garment_gst_below_rate: parseFloat(e.target.value) || 0,
                            },
                          })
                        }
                        disabled={!settings.purchase_settings?.garment_gst_rule_enabled}
                        placeholder="5"
                      />
                    </SettingsField>
                    <p className="col-span-full text-xs text-slate-500 leading-snug">
                      Above the threshold, Sale GST becomes 18%. At or below it, an 18% rate falls back to the rate here.
                      Works on goods and service lines in POS and Sale bills, using the price entered at billing.
                    </p>
                  </SettingsGrid>
                </SettingsSection>

                <SettingsSection
                  title="DC purchase (No GST) transactions"
                  subtitle="DC bills never go into GST reports. Printed bills always show every item."
                  icon={EyeOff}
                  tone="rose"
                >
                  <RadioGroup
                    value={settings.purchase_settings?.dc_visibility_mode === 'hide' ? 'hide' : 'show'}
                    onValueChange={(value) =>
                      setSettings({
                        ...settings,
                        purchase_settings: {
                          ...settings.purchase_settings,
                          dc_visibility_mode: value === 'hide' ? 'hide' : 'show',
                        },
                      })
                    }
                    className="grid gap-2 p-4 sm:grid-cols-2"
                  >
                    <label
                      htmlFor="dc_visibility_show"
                      className={cn(
                        "flex items-start gap-2 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                        settings.purchase_settings?.dc_visibility_mode !== 'hide' ? "border-blue-300 bg-blue-50/60" : "border-slate-200 hover:bg-slate-50",
                      )}
                    >
                      <RadioGroupItem value="show" id="dc_visibility_show" className="mt-0.5" />
                      <span className="text-sm leading-snug">
                        <span className="font-semibold text-slate-800">Show DC (default)</span>
                        <span className="block text-xs text-slate-500">
                          DC purchases, stock and sales show in reports as normal. Ctrl+Shift+H hides them on a screen.
                        </span>
                      </span>
                    </label>
                    <label
                      htmlFor="dc_visibility_hide"
                      className={cn(
                        "flex items-start gap-2 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                        settings.purchase_settings?.dc_visibility_mode === 'hide' ? "border-blue-300 bg-blue-50/60" : "border-slate-200 hover:bg-slate-50",
                      )}
                    >
                      <RadioGroupItem value="hide" id="dc_visibility_hide" className="mt-0.5" />
                      <span className="text-sm leading-snug">
                        <span className="font-semibold text-slate-800">Hide DC everywhere</span>
                        <span className="block text-xs text-slate-500">
                          Hidden from lists, dashboards and reports. Admins and Managers press Ctrl+Shift+H to show them
                          (hides again after 15 min idle). User Rights "Always show DC transactions" logins always see them.
                        </span>
                      </span>
                    </label>
                  </RadioGroup>
                </SettingsSection>
              </div>

              <SettingsSection
                title="Purchase code on barcode labels"
                subtitle="Prints the cost price in secret letters on labels"
                icon={Tag}
                tone="violet"
                action={
                  <div className="flex items-center gap-2">
                    <label htmlFor="show_purchase_code" className="text-xs font-semibold text-slate-600 cursor-pointer">
                      Show on labels
                    </label>
                    <Switch
                      id="show_purchase_code"
                      checked={settings.purchase_settings?.show_purchase_code || false}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          purchase_settings: {
                            ...settings.purchase_settings,
                            show_purchase_code: checked as boolean,
                          },
                        })
                      }
                    />
                  </div>
                }
              >
                <SettingsGrid cols={4}>
                  <SettingsField
                    label="Code letters for 0 to 9"
                    htmlFor="purchase_code_alphabet"
                    important
                    span={2}
                    help={
                      settings.purchase_settings?.purchase_code_alphabet &&
                      !validatePurchaseCodeAlphabet(settings.purchase_settings.purchase_code_alphabet) ? (
                        <span className="text-destructive">Must be exactly 10 different letters or digits (A-Z, 0-9)</span>
                      ) : (
                        <>
                          10 different letters: 1st = 0, 2nd = 1 … 10th = 9.
                          {settings.purchase_settings?.purchase_code_alphabet &&
                            validatePurchaseCodeAlphabet(settings.purchase_settings.purchase_code_alphabet) && (
                              <span className="ml-1 font-mono tabular-nums text-slate-800">
                                Preview: ₹100 → {encodePurchasePrice(
                                  100,
                                  settings.purchase_settings.purchase_code_alphabet,
                                  "2026-09-12",
                                  { includeDate: resolvePurchaseCodeIncludeDate(settings.purchase_settings) },
                                )}
                                {" · "}
                                ₹3190 → {encodePurchasePrice(
                                  3190,
                                  settings.purchase_settings.purchase_code_alphabet,
                                  "2026-09-12",
                                  { includeDate: resolvePurchaseCodeIncludeDate(settings.purchase_settings) },
                                )}
                              </span>
                            )}
                        </>
                      )
                    }
                  >
                    <Input
                      id="purchase_code_alphabet"
                      value={settings.purchase_settings?.purchase_code_alphabet || "ABCDEFGHIK"}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        setSettings({
                          ...settings,
                          purchase_settings: {
                            ...settings.purchase_settings,
                            purchase_code_alphabet: value,
                          },
                        });
                      }}
                      maxLength={11}
                      placeholder="ABCDEFGHIK"
                      className={cn(
                        "max-w-xs font-mono tracking-[0.2em] uppercase",
                        settings.purchase_settings?.purchase_code_alphabet &&
                          !validatePurchaseCodeAlphabet(settings.purchase_settings.purchase_code_alphabet)
                          ? "border-destructive"
                          : "",
                      )}
                    />
                  </SettingsField>
                  <SettingsField label="Extra % on code" htmlFor="purchase_code_extra_percent" help="₹500 + 10% prints the code for ₹550">
                    <Input
                      id="purchase_code_extra_percent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      inputMode="decimal"
                      value={settings.purchase_settings?.purchase_code_extra_percent ?? 10}
                      onChange={(e) => {
                        const raw = parseFloat(e.target.value);
                        const next = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0;
                        setSettings({
                          ...settings,
                          purchase_settings: {
                            ...settings.purchase_settings,
                            purchase_code_extra_percent: next,
                          },
                        });
                      }}
                      disabled={
                        !settings.purchase_settings?.show_purchase_code ||
                        settings.purchase_settings?.purchase_code_extra_percent_enabled !== true
                      }
                      placeholder="10"
                      className="max-w-[8rem]"
                    />
                  </SettingsField>
                </SettingsGrid>
                <div className="grid gap-2 px-4 pb-4 sm:grid-cols-3">
                  <SettingsToggle
                    id="purchase_code_include_date"
                    label="Add bill month / year"
                    description="Labels — ON: 09SEWN26. OFF: SEWN only. POS always shows letters only (SEWN)"
                    checked={resolvePurchaseCodeIncludeDate(settings.purchase_settings)}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        purchase_settings: {
                          ...settings.purchase_settings,
                          purchase_code_include_date: checked === true,
                        },
                      })
                    }
                    disabled={!settings.purchase_settings?.show_purchase_code}
                  />
                  <SettingsToggle
                    id="purchase_code_include_gst"
                    label="Include GST in code"
                    description="Code = purchase rate + product purchase GST. Same on labels and POS"
                    checked={settings.purchase_settings?.purchase_code_include_gst || false}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        purchase_settings: {
                          ...settings.purchase_settings,
                          purchase_code_include_gst: checked as boolean,
                        },
                      })
                    }
                    disabled={!settings.purchase_settings?.show_purchase_code}
                  />
                  <SettingsToggle
                    id="purchase_code_extra_percent_enabled"
                    label="Add extra % on code"
                    description="Uses the Extra % box above"
                    checked={settings.purchase_settings?.purchase_code_extra_percent_enabled === true}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        purchase_settings: {
                          ...settings.purchase_settings,
                          purchase_code_extra_percent_enabled: checked === true,
                          purchase_code_extra_percent:
                            settings.purchase_settings?.purchase_code_extra_percent ?? 10,
                        },
                      })
                    }
                    disabled={!settings.purchase_settings?.show_purchase_code}
                  />
                </div>
              </SettingsSection>

              <SettingsSection title="Purchase entry options" subtitle="Turn on only what your shop needs" icon={ListChecks} tone="emerald">
                <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-4">
                  <SettingsToggle
                    id="photo_import_enabled"
                    label="Purchase from bill photo"
                    badge="AI"
                    description="Photo button on Purchase Entry reads the supplier bill. Up to 50 photos a day."
                    checked={isPhotoImportEnabled(settings.purchase_settings)}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        purchase_settings: {
                          ...settings.purchase_settings,
                          photo_import_enabled: checked,
                        },
                      })
                    }
                  />
                  <SettingsToggle
                    id="show_mrp"
                    label="Enable MRP field"
                    description="MRP shows in products, sales, POS, reports and prints. POS MRP options are in the POS tab."
                    checked={settings.purchase_settings?.show_mrp || false}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        purchase_settings: {
                          ...settings.purchase_settings,
                          show_mrp: checked as boolean,
                        },
                      })
                    }
                  />
                  <SettingsToggle
                    id="product_entry_discount_enabled"
                    label="Product entry discounts"
                    description="Purchase and Sale Discount fields on Product Entry, applied automatically on bills."
                    checked={settings.purchase_settings?.product_entry_discount_enabled || false}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        purchase_settings: {
                          ...settings.purchase_settings,
                          product_entry_discount_enabled: checked,
                        },
                      })
                    }
                  />
                  <SettingsToggle
                    id="auto_focus_search"
                    label="Auto-focus product search"
                    description="Cursor goes back to search after adding a product."
                    checked={settings.purchase_settings?.auto_focus_search || false}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        purchase_settings: {
                          ...settings.purchase_settings,
                          auto_focus_search: checked as boolean,
                        },
                      })
                    }
                  />
                  <SettingsToggle
                    id="size_grid_review_mode"
                    label="Review size prices before adding"
                    description="Size window lets you edit Pur / Sale price and MRP per size. Ctrl+A adds to bill."
                    checked={settings.purchase_settings?.size_grid_review_mode || false}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        purchase_settings: {
                          ...settings.purchase_settings,
                          size_grid_review_mode: checked as boolean,
                        },
                      })
                    }
                  />
                  <SettingsToggle
                    id="same_barcode_series"
                    label="Same barcode series"
                    description="For MTR / KG / dozen items: one fixed barcode per product, no new barcode on repeat buys. Keep OFF for garments."
                    checked={settings.purchase_settings?.same_barcode_series === true}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        purchase_settings: {
                          ...settings.purchase_settings,
                          same_barcode_series: checked,
                        },
                      })
                    }
                  />
                  <SettingsToggle
                    id="roll_wise_mtr_entry"
                    label="Roll-wise entry for MTR"
                    description="Enter each roll's metres. Every roll gets its own barcode and stock."
                    checked={settings.purchase_settings?.roll_wise_mtr_entry || false}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        purchase_settings: {
                          ...settings.purchase_settings,
                          roll_wise_mtr_entry: checked as boolean,
                        },
                      })
                    }
                  />
                  <SettingsToggle
                    id="per_piece_barcode"
                    label="Barcode for every piece"
                    description="S = 2 becomes two lines with their own barcode and label. Needs Auto barcodes. IMEI, MTR/KG and supplier barcodes stay single."
                    checked={settings.purchase_settings?.per_piece_barcode || false}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        purchase_settings: {
                          ...settings.purchase_settings,
                          per_piece_barcode: checked as boolean,
                        },
                      })
                    }
                  />
                </div>
              </SettingsSection>
            </div>
          </TabsContent>

          <TabsContent value="sale" className="mt-0">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 items-start">
              <div className="space-y-3 min-w-0">
                <SettingsSection
                  title="Sale bill defaults"
                  subtitle="POS GST, numbering, discount and bill format are in the POS tab"
                  icon={Receipt}
                  tone="blue"
                >
                  <SettingsGrid cols={2}>
                    <SettingsField
                      label="Default GST Type"
                      htmlFor="default_tax_type"
                      help="Used for Sale Invoice. POS uses this until a separate POS GST Type is set under Settings → POS."
                    >
                      <Select
                        value={resolveSaleDefaultTaxType(settings.sale_settings)}
                        onValueChange={(v: GstTaxType) => {
                          setInvoicePreviewChannel("sale");
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              default_tax_type: v,
                            },
                          });
                        }}
                      >
                        <SelectTrigger id="default_tax_type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inclusive">GST Inclusive (MRP-style, GST bifurcated)</SelectItem>
                          <SelectItem value="exclusive">GST Exclusive (taxable + GST at bottom)</SelectItem>
                          <SelectItem value="no_gst">Without GST (no tax on bill)</SelectItem>
                        </SelectContent>
                      </Select>
                    </SettingsField>
                    <SettingsField
                      label="Sale Invoice Numbering Format"
                      htmlFor="invoice_numbering_format"
                      help={
                        <>
                          Available placeholders: {"{YYYY}"} (year), {"{MM}"} (month), {"{####}"} (auto-increment). Leave empty
                          for default INV/25-26/1 format.
                        </>
                      }
                    >
                      <Input
                        id="invoice_numbering_format"
                        value={settings.sale_settings?.invoice_numbering_format || ""}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              invoice_numbering_format: e.target.value,
                            },
                          })
                        }
                        placeholder="Default: INV/YY-YY/N"
                      />
                    </SettingsField>
                    <SettingsField
                      label="Sale Invoice Series Start From"
                      htmlFor="invoice_series_start"
                      help="Last sale invoice number already issued (e.g. INV/26-27/18 → next is 19). Leave blank to continue from the highest active invoice. Do not enter a future/high number — that jumps the series (e.g. 261 → next 262). Deleted bills no longer reserve numbers."
                    >
                      <Input
                        id="invoice_series_start"
                        value={settings.sale_settings?.invoice_series_start || ""}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              invoice_series_start: e.target.value,
                            },
                          })
                        }
                        placeholder="e.g., INV/25-26/100"
                      />
                    </SettingsField>

                    <SettingsField
                      label="Default Entry Mode (Sale Order / Quotation)"
                      help="Size Grid allows entering multiple sizes at once, Inline adds one variant at a time"
                    >
                      <Select
                        value={(settings.sale_settings as any)?.defaultEntryMode || "inline"}
                        onValueChange={(value: "grid" | "inline") =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              defaultEntryMode: value,
                            } as any,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="grid">Size Grid (Multi-size entry)</SelectItem>
                          <SelectItem value="inline">Inline (Single item entry)</SelectItem>
                        </SelectContent>
                      </Select>
                    </SettingsField>
                  </SettingsGrid>
                </SettingsSection>

                <SettingsSection
                  title="Billing options"
                  subtitle="Turn on only what your shop needs"
                  icon={ListChecks}
                  tone="emerald"
                >
                  <div className="grid gap-2 p-4 sm:grid-cols-2">
                    <SettingsToggle
                      label="Size Grid in Sales Invoice"
                      description="Show Size Grid / Inline entry mode toggle in Sales Invoice"
                      id="enable_size_grid_sales"
                      checked={(settings.sale_settings as any)?.enable_size_grid_sales !== false}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          sale_settings: {
                            ...settings.sale_settings,
                            enable_size_grid_sales: checked,
                          } as any,
                        })
                      }
                    />

                    <SettingsToggle
                      label="Customer Price Memory"
                      description="Automatically suggest last used price when selling to the same customer"
                      id="enable_customer_price_memory"
                      checked={(settings.sale_settings as any)?.enable_customer_price_memory ?? false}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          sale_settings: {
                            ...settings.sale_settings,
                            enable_customer_price_memory: checked,
                          } as any,
                        })
                      }
                    />

                    <SettingsToggle
                      label="Allow Sale Without Stock (Negative Stock)"
                      description="Sale Bill and POS let you bill items that have no stock, with a warning. Stock goes below zero until the next purchase."
                      id="allow_negative_stock_sale"
                      checked={(settings.sale_settings as any)?.allow_negative_stock_sale === true}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          sale_settings: {
                            ...settings.sale_settings,
                            allow_negative_stock_sale: checked,
                          } as any,
                        })
                      }
                    />

                    <SettingsToggle
                      label="Stock Transfer"
                      description="Shows the Transfer Out column in the Stock Report (stock sent to your other shop)."
                      id="stock_transfer_enabled"
                      checked={settings.sale_settings?.stock_transfer_enabled === true}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          sale_settings: { ...settings.sale_settings, stock_transfer_enabled: checked },
                        })
                      }
                    />

                    <SettingsToggle
                      label="Ask Price When Last Purchase Differs"
                      description="Show price selection dialog when last purchase price differs from master price during billing"
                      id="ask_price_on_scan"
                      checked={(settings.sale_settings as any)?.ask_price_on_scan ?? true}
                      disabled={
                        ((settings.sale_settings as any)?.auto_use_last_purchase_price ??
                          isKsFootwearSlug(currentOrganization?.slug)) === true
                      }
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          sale_settings: {
                            ...settings.sale_settings,
                            ask_price_on_scan: checked,
                          } as any,
                        })
                      }
                    />

                    <SettingsToggle
                      label="Automatically use last purchase price"
                      description="Skip the Select Price dialog and bill at last purchase sale price and MRP. On for KS Footwear by default."
                      id="auto_use_last_purchase_price"
                      checked={
                        (settings.sale_settings as any)?.auto_use_last_purchase_price ??
                        isKsFootwearSlug(currentOrganization?.slug)
                      }
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          sale_settings: {
                            ...settings.sale_settings,
                            auto_use_last_purchase_price: checked,
                          } as any,
                        })
                      }
                    />

                    <SettingsToggle
                      label="Sale Return Price"
                      description="Use original price (before discount) for sale returns. Default: OFF (uses actual paid price after discount)"
                      id="sale_return_use_original_price"
                      checked={(settings.sale_settings as any)?.sale_return_use_original_price ?? false}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          sale_settings: {
                            ...settings.sale_settings,
                            sale_return_use_original_price: checked,
                          } as any,
                        })
                      }
                    />
                  </div>
                </SettingsSection>

                <SettingsSection
                  title="Totals on printed bill"
                  subtitle="Lines printed under the item table"
                  icon={Calculator}
                  tone="amber"
                >
                  <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
                    <div className="settings-check">
                      <Checkbox
                        id="show_total_quantity"
                        checked={(settings.sale_settings as any)?.show_total_quantity ?? true}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              show_total_quantity: checked as boolean,
                            } as any,
                          })
                        }
                      />
                      <Label htmlFor="show_total_quantity" className="font-normal cursor-pointer">
                        Total Item Quantity
                      </Label>
                    </div>

                    <div className="settings-check">
                      <Checkbox
                        id="amount_with_decimal"
                        checked={(settings.sale_settings as any)?.amount_with_decimal ?? true}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              amount_with_decimal: checked as boolean,
                            } as any,
                          })
                        }
                      />
                      <Label htmlFor="amount_with_decimal" className="font-normal cursor-pointer">
                        Amount with Decimal (e.g. 0.00)
                      </Label>
                    </div>

                    <div className="settings-check">
                      <Checkbox
                        id="show_received_amount"
                        checked={(settings.sale_settings as any)?.show_received_amount ?? false}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              show_received_amount: checked as boolean,
                            } as any,
                          })
                        }
                      />
                      <Label htmlFor="show_received_amount" className="font-normal cursor-pointer">
                        Received Amount
                      </Label>
                    </div>

                    <div className="settings-check">
                      <Checkbox
                        id="show_balance_amount"
                        checked={(settings.sale_settings as any)?.show_balance_amount ?? false}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              show_balance_amount: checked as boolean,
                            } as any,
                          })
                        }
                      />
                      <Label htmlFor="show_balance_amount" className="font-normal cursor-pointer">
                        Balance Amount
                      </Label>
                    </div>

                    <div className="settings-check">
                      <Checkbox
                        id="show_party_balance"
                        checked={(settings.sale_settings as any)?.show_party_balance ?? false}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              show_party_balance: checked as boolean,
                            } as any,
                          })
                        }
                      />
                      <Label htmlFor="show_party_balance" className="font-normal cursor-pointer">
                        Current Balance of Party
                      </Label>
                    </div>

                    <div className="settings-check">
                      <Checkbox
                        id="show_tax_details"
                        checked={(settings.sale_settings as any)?.show_tax_details ?? true}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              show_tax_details: checked as boolean,
                            } as any,
                          })
                        }
                      />
                      <Label htmlFor="show_tax_details" className="font-normal cursor-pointer">
                        Tax Details
                      </Label>
                    </div>

                    <div className="settings-check">
                      <Checkbox
                        id="show_you_saved"
                        checked={(settings.sale_settings as any)?.show_you_saved ?? false}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              show_you_saved: checked as boolean,
                            } as any,
                          })
                        }
                      />
                      <Label htmlFor="show_you_saved" className="font-normal cursor-pointer">
                        You Saved
                      </Label>
                    </div>

                    <div className="settings-check">
                      <Checkbox
                        id="amount_with_grouping"
                        checked={(settings.sale_settings as any)?.amount_with_grouping ?? true}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              amount_with_grouping: checked as boolean,
                            } as any,
                          })
                        }
                      />
                      <Label htmlFor="amount_with_grouping" className="font-normal cursor-pointer">
                        Print Amount with Grouping
                      </Label>
                    </div>
                  </div>
                </SettingsSection>

                <SettingsSection
                  title="Print format"
                  subtitle="Paper size, template and preview for Sale bills"
                  icon={Printer}
                  tone="blue"
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 shrink-0"
                      onClick={() => setInvoiceFormatBackupOpen(true)}
                      disabled={!currentOrganization?.id}
                    >
                      <History className="h-4 w-4" />
                      Backup &amp; Restore
                    </Button>
                  }
                >
                  <SettingsGrid cols={2}>
                    {/* Enable preview toggle */}
                    <SettingsToggle
                      label="Invoice Preview Dialog"
                      description="Show preview before printing (disable for direct print)"
                      id="show_invoice_preview"
                      checked={settings.sale_settings?.show_invoice_preview ?? true}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          sale_settings: {
                            ...settings.sale_settings,
                            show_invoice_preview: checked as boolean,
                          },
                        })
                      }
                    />

                    <SettingsField
                      label="Sale Invoice Format"
                      htmlFor="invoice_paper_format"
                      help="POS bill format and POS invoice template are under Settings → POS."
                    >
                      <Select
                        value={settings.sale_settings?.invoice_paper_format || "a4"}
                        onValueChange={(value) => {
                          setInvoicePreviewChannel("sale");
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              invoice_paper_format: value as any,
                              // keep sales_bill_format in sync for backward compat
                              sales_bill_format: value === "thermal" ? "thermal" : value === "a5-vertical" ? "a5" : "a4",
                            },
                          });
                        }}
                      >
                        <SelectTrigger id="invoice_paper_format">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>A4 Size</SelectLabel>
                            <SelectItem value="a4">A4 — Laser / Inkjet</SelectItem>
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel>A5 Size</SelectLabel>
                            <SelectItem value="a5-vertical">A5 Portrait</SelectItem>
                            <SelectItem value="a5-horizontal">A5 Landscape</SelectItem>
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel>Thermal</SelectLabel>
                            <SelectItem value="thermal">Thermal 80mm</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </SettingsField>

                    <SettingsField
                      label="Sale Invoice Template"
                      htmlFor="sale_invoice_template"
                      help="Used for Sales Invoice bills (paper size above). Live preview updates on the right."
                    >
                      <Select
                        value={resolveSaleInvoiceTemplate(settings.sale_settings)}
                        onValueChange={(value) => {
                          setInvoicePreviewChannel("sale");
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              invoice_template: value as InvoiceTemplateId,
                              ...paperPatchesForInvoiceTemplate(value, "sale"),
                            },
                          });
                        }}
                      >
                        <SelectTrigger id="sale_invoice_template">
                          <SelectValue placeholder="Select template" />
                        </SelectTrigger>
                        <SelectContent>
                          <InvoiceTemplateSelectItems currentValue={resolveSaleInvoiceTemplate(settings.sale_settings)} />
                        </SelectContent>
                      </Select>
                    </SettingsField>

                    {resolveSaleInvoiceTemplate(settings.sale_settings) === "retail-erp-preprinted" && (
                      <SettingsToggle
                        label="Print shop logo on letterhead"
                        description="Off (default): keep the 2-inch top blank for physical letterpad paper. On: print the uploaded Organization Logo inside the invoice frame, flush with the column table."
                        id="print_logo_on_preprinted_letterhead"
                        checked={settings.sale_settings?.print_logo_on_preprinted_letterhead === true}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              print_logo_on_preprinted_letterhead: checked,
                            },
                          })
                        }
                      />
                    )}

                    <SettingsField
                      label="Quotation Print Layout"
                      htmlFor="quotation_print_template"
                      help="Also selectable on Print Quotation preview. Existing retail design stays available."
                    >
                      <Select
                        value={settings.sale_settings?.quotation_print_template || "retail"}
                        onValueChange={(value) => {
                          persistQuotationPrintTemplate(value as "retail" | "it-company", currentOrganization?.id);
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              quotation_print_template: value as "retail" | "it-company",
                            },
                          });
                        }}
                      >
                        <SelectTrigger id="quotation_print_template">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="retail">Existing (Retail) — keeps MRP / size</SelectItem>
                          <SelectItem value="it-company">IT Company — no MRP, Sale terms</SelectItem>
                        </SelectContent>
                      </Select>
                    </SettingsField>

                    <SettingsToggle
                      label="Merge Sale terms into quotations"
                      description="Off (default): print only this quotation's terms. On: prepend Settings → Sale terms."
                      id="merge_sale_terms_on_quotation"
                      checked={settings.sale_settings?.merge_sale_terms_on_quotation === true}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          sale_settings: {
                            ...settings.sale_settings,
                            merge_sale_terms_on_quotation: checked,
                          },
                        })
                      }
                    />

                  </SettingsGrid>
                </SettingsSection>

                <SettingsSection
                  title="Item details on Sale / POS screens"
                  subtitle="Extra columns on the billing screens, not on printed bills"
                  icon={Package}
                  tone="emerald"
                >
                  <div className="space-y-3 p-4">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <div className="settings-check">
                        <Checkbox
                          id="show_item_brand"
                          checked={(settings.sale_settings as any)?.show_item_brand ?? false}
                          onCheckedChange={(checked) =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                show_item_brand: checked as boolean,
                              },
                            })
                          }
                        />
                        <Label htmlFor="show_item_brand" className="font-normal cursor-pointer">
                          Brand
                        </Label>
                      </div>

                      <div className="settings-check">
                        <Checkbox
                          id="show_item_color"
                          checked={(settings.sale_settings as any)?.show_item_color ?? false}
                          onCheckedChange={(checked) =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                show_item_color: checked as boolean,
                              },
                            })
                          }
                        />
                        <Label htmlFor="show_item_color" className="font-normal cursor-pointer">
                          Color
                        </Label>
                      </div>

                      <div className="settings-check">
                        <Checkbox
                          id="show_item_style"
                          checked={(settings.sale_settings as any)?.show_item_style ?? false}
                          onCheckedChange={(checked) =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                show_item_style: checked as boolean,
                              },
                            })
                          }
                        />
                        <Label htmlFor="show_item_style" className="font-normal cursor-pointer">
                          Style
                        </Label>
                      </div>

                      <div className="settings-check">
                        <Checkbox
                          id="show_item_barcode"
                          checked={(settings.sale_settings as any)?.show_item_barcode ?? false}
                          onCheckedChange={(checked) =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                show_item_barcode: checked as boolean,
                              },
                            })
                          }
                        />
                        <Label htmlFor="show_item_barcode" className="font-normal cursor-pointer">
                          Barcode
                        </Label>
                      </div>

                      <div className="settings-check">
                        <Checkbox
                          id="show_item_hsn"
                          checked={(settings.sale_settings as any)?.show_item_hsn ?? false}
                          onCheckedChange={(checked) =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                show_item_hsn: checked as boolean,
                              },
                            })
                          }
                        />
                        <Label htmlFor="show_item_hsn" className="font-normal cursor-pointer">
                          HSN Code
                        </Label>
                      </div>

                      <div className="settings-check">
                        <Checkbox
                          id="show_item_mrp"
                          checked={(settings.sale_settings as any)?.show_item_mrp ?? true}
                          onCheckedChange={(checked) =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                show_item_mrp: checked as boolean,
                              },
                            })
                          }
                        />
                        <Label htmlFor="show_item_mrp" className="font-normal cursor-pointer">
                          MRP
                        </Label>
                      </div>

                      <div className="settings-check">
                        <Checkbox
                          id="show_discount_on_rate"
                          checked={(settings.sale_settings as any)?.show_discount_on_rate !== false}
                          onCheckedChange={(checked) =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                show_discount_on_rate: checked as boolean,
                              },
                            })
                          }
                        />
                        <Label htmlFor="show_discount_on_rate" className="font-normal cursor-pointer">
                          Discount on Rate
                        </Label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <SettingsToggle
                        label="Invoice description sequence"
                        description="Tally GST A4 only. Off prints the description already on the bill. On lets you choose the order."
                        id="invoice_description_sequence_enabled"
                        checked={(settings.sale_settings as any)?.invoice_description_sequence_enabled === true}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              invoice_description_sequence_enabled: checked === true,
                              invoice_description_sequence:
                                (settings.sale_settings as any)?.invoice_description_sequence || "brand_first",
                            },
                          })
                        }
                      />
                      {(settings.sale_settings as any)?.invoice_description_sequence_enabled === true ? (
                        <Select
                          value={(settings.sale_settings as any)?.invoice_description_sequence || "brand_first"}
                          onValueChange={(value) =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                invoice_description_sequence: value as "product_first" | "brand_first",
                              },
                            })
                          }
                        >
                          <SelectTrigger id="invoice_description_sequence">
                            <SelectValue placeholder="Choose sequence" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="brand_first">Brand first, then product name</SelectItem>
                            <SelectItem value="product_first">Product name first, then brand</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : null}
                    </div>
                  </div>
                </SettingsSection>

                <SettingsSection
                  title="Invoice design"
                  subtitle="Font, logo, title, header, footer, colours and terms"
                  icon={Paintbrush}
                  tone="violet"
                >
                  <div className="space-y-3 p-4">
                    <div className="rounded-lg border border-dashed p-3 bg-muted/20 space-y-1">
                      <p className="text-sm font-medium">Invoice templates</p>
                      <p className="text-xs text-muted-foreground">
                        Sale Invoice Template is under Print Format above. POS Invoice Template is under Settings →
                        POS. Use the Sale / POS toggle on the live preview to check both designs.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {settings.sale_settings?.invoice_template === "retail-pos-80mm"
                          ? "Retail POS prints on 80mm thermal roll in monospace — shop logo (if uploaded), org address/mobile/GSTIN, terms, and UPI QR when UPI ID is set."
                          : settings.sale_settings?.invoice_template === "kids-80mm"
                            ? "Kids 80mm prints on 80mm thermal roll — product name, size, qty, sale price, MRP total, fixed footer & terms."
                            : settings.sale_settings?.invoice_template === "kids-camp-80mm"
                              ? "Kids Camp prints on 80mm thermal roll — boxed GST invoice with barcode/HSN, cash/card/Paytm split, and 5%/18%/28% tax table."
                              : settings.sale_settings?.invoice_template === "vastrakala-80mm"
                                ? "Vastrakala prints on 80mm thermal roll — logo, shop name, Instagram, NO/Particulars/Qty/MRP/Amount table, Tot Qty, Total Amt, MRP-based Discount, Net Amt, and terms. Toggle Show MRP Column above to turn the MRP/Discount figures on or off."
                                : settings.sale_settings?.invoice_template === "retail-erp-dc"
                                  ? "Retail ERP style DC matches Retail ERP layout without HSN, organization GSTIN, customer GSTIN, or GST tax lines. Title prints as Delivery Challan (A5)."
                                  : settings.sale_settings?.invoice_template === "zaika"
                                    ? "Zaika matches Retail ERP tax invoice without Size, Barcode, Qty, Rate columns, and without Received/Balance/Prev Bal or Terms & Conditions (A5)."
                                    : settings.sale_settings?.invoice_template === "gurukrupa"
                                      ? "Gurukrupa is A5 Retail ERP tax invoice with Sub Total, Discount, S/R Adjust and Bill Total — no Round Off."
                                      : settings.sale_settings?.invoice_template === "retail-erp-preprinted"
                                        ? "Preprinted Invoice matches Retail ERP tax layout with a 2-inch top letterhead gap. Paper size follows POS Bill Format / Sale Invoice Format (A4 or A5). Leave Print shop logo on letterhead OFF if this shop already uses printed letterpad paper."
                                        : settings.sale_settings?.invoice_template === "real-tast"
                                          ? "Real Tast prints on A4 — SN, Description, HSN, Qty, Rate, Amount. Set document title and terms in Sale settings below."
                                          : settings.sale_settings?.invoice_template === "gift_tally"
                                            ? "Gift Tally prints on A4 — GST tax invoice with billed/shipped blocks, per-line CGST/SGST/IGST, bank details and terms."
                                            : settings.sale_settings?.invoice_template === "a4-gst-classic"
                                              ? "A4 GST Classic matches textile/wholesale Tax Invoice layout — logo, UPI QR, Billed/Shipped, transport, GST summary table, bank bar and signature."
                                              : settings.sale_settings?.invoice_template === "wholesale-gst-a4"
                                                ? "Wholesale GST A4 is a named A4 layout any organization can select — logo, customer GSTIN, per-rate CGST/SGST (or IGST) rows, bank details, UPI QR and editable terms. Paper is A4 only."
                                                : settings.sale_settings?.invoice_template === "klear-a4"
                                                  ? "Klear A4 is a named A4 layout any organization can select — one row per product with a quantity column per size, blended CGST/SGST, bank details and UPI QR. Paper is A4 only."
                                                  : settings.sale_settings?.invoice_template === "motas-a4"
                                                    ? "Motas is a premium A4 tax invoice any organization can select — # / Description / Qty / HSN / Unit / Discount / Taxable / Tax % / Total, billing address with Invoice No, Date, Place of Supply and Due Date, HSN-wise tax summary, bank details and terms. Long bills continue on new sheets that repeat the header. Paper is A4 only."
                                                    : settings.sale_settings?.invoice_template === "modern-wholesale"
                                                      ? "Modern Wholesale is optimized for bulk orders with size grouping (e.g., 38/2, 40/3, 42/1)."
                                                      : `Sale: ${resolveSaleInvoiceTemplate(settings.sale_settings)} · POS: ${resolvePosInvoiceTemplate(settings.sale_settings)}`}
                      </p>
                    </div>
                    {/* Wholesale Mode Settings - Show when Modern Wholesale template is selected */}
                    {settings.sale_settings?.invoice_template === "modern-wholesale" && (
                      <div className="space-y-4 p-3 rounded-lg border-l-4 border-l-teal-500 bg-teal-50/50 dark:bg-teal-950/20">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded bg-teal-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-bold text-teal-700">WHL</span>
                          </div>
                          <h4 className="text-sm font-semibold text-teal-700 dark:text-teal-400">Wholesale Mode Settings</h4>
                        </div>

                        <SettingsField label="Size Display Format" htmlFor="size_display_format">
                          <Select
                            value={(settings.sale_settings as any)?.size_display_format || "size/qty"}
                            onValueChange={(value) =>
                              setSettings({
                                ...settings,
                                sale_settings: {
                                  ...settings.sale_settings,
                                  size_display_format: value as "size/qty" | "size×qty",
                                },
                              })
                            }
                          >
                            <SelectTrigger id="size_display_format">
                              <SelectValue placeholder="Select format" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="size/qty">Size/Qty (38/2, 40/3, 42/1)</SelectItem>
                              <SelectItem value="size×qty">Size×Qty (38×2, 40×3, 42×1)</SelectItem>
                            </SelectContent>
                          </Select>
                        </SettingsField>

                        <SettingsField
                          label="Minimum Item Rows"
                          htmlFor="min_item_rows"
                          help="Minimum empty rows to display in item table"
                        >
                          <Input
                            id="min_item_rows"
                            type="number"
                            min="1"
                            max="30"
                            value={(settings.sale_settings as any)?.min_item_rows || 12}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                sale_settings: {
                                  ...settings.sale_settings,
                                  min_item_rows: parseInt(e.target.value) || 12,
                                },
                              })
                            }
                            placeholder="12"
                          />
                        </SettingsField>

                        <div className="grid grid-cols-3 gap-2">
                          <div className="settings-check">
                            <Checkbox
                              id="show_product_color"
                              checked={(settings.sale_settings as any)?.show_product_color ?? true}
                              onCheckedChange={(checked) =>
                                setSettings({
                                  ...settings,
                                  sale_settings: {
                                    ...settings.sale_settings,
                                    show_product_color: checked as boolean,
                                  },
                                })
                              }
                            />
                            <Label htmlFor="show_product_color" className="cursor-pointer text-sm">
                              Show Color
                            </Label>
                          </div>

                          <div className="settings-check">
                            <Checkbox
                              id="show_product_brand"
                              checked={(settings.sale_settings as any)?.show_product_brand ?? false}
                              onCheckedChange={(checked) =>
                                setSettings({
                                  ...settings,
                                  sale_settings: {
                                    ...settings.sale_settings,
                                    show_product_brand: checked as boolean,
                                  },
                                })
                              }
                            />
                            <Label htmlFor="show_product_brand" className="cursor-pointer text-sm">
                              Show Brand
                            </Label>
                          </div>

                          <div className="settings-check">
                            <Checkbox
                              id="show_product_style"
                              checked={(settings.sale_settings as any)?.show_product_style ?? false}
                              onCheckedChange={(checked) =>
                                setSettings({
                                  ...settings,
                                  sale_settings: {
                                    ...settings.sale_settings,
                                    show_product_style: checked as boolean,
                                  },
                                })
                              }
                            />
                            <Label htmlFor="show_product_style" className="cursor-pointer text-sm">
                              Show Style
                            </Label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <SettingsGrid cols={2} className="pt-0">
                    <SettingsField label="Font Family" htmlFor="font_family" help="Choose the font style for your invoices">
                      <Select
                        value={settings.sale_settings?.font_family || "inter"}
                        onValueChange={(value) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              font_family: value as any,
                            },
                          })
                        }
                      >
                        <SelectTrigger id="font_family">
                          <SelectValue placeholder="Select font" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inter">Inter - Modern sans-serif</SelectItem>
                          <SelectItem value="roboto">Roboto - Clean & readable</SelectItem>
                          <SelectItem value="montserrat">Montserrat - Professional</SelectItem>
                          <SelectItem value="opensans">Open Sans - Friendly</SelectItem>
                          <SelectItem value="poppins">Poppins - Contemporary</SelectItem>
                          <SelectItem value="raleway">Raleway - Elegant</SelectItem>
                          <SelectItem value="playfair">Playfair Display - Serif classic</SelectItem>
                          <SelectItem value="merriweather">Merriweather - Traditional serif</SelectItem>
                          <SelectItem value="lora">Lora - Readable serif</SelectItem>
                        </SelectContent>
                      </Select>
                    </SettingsField>

                    <SettingsField
                      label="Logo Placement"
                      htmlFor="logo_placement"
                      help="Position of your business logo on invoices"
                    >
                      <Select
                        value={settings.sale_settings?.logo_placement || "left"}
                        onValueChange={(value) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              logo_placement: value as "left" | "center" | "right",
                            },
                          })
                        }
                      >
                        <SelectTrigger id="logo_placement">
                          <SelectValue placeholder="Select placement" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Left Aligned</SelectItem>
                          <SelectItem value="center">Center Aligned</SelectItem>
                          <SelectItem value="right">Right Aligned</SelectItem>
                        </SelectContent>
                      </Select>
                    </SettingsField>

                    <SettingsField
                      label="Invoice document title"
                      htmlFor="invoice_document_title"
                      help="Trendzo bill: heading under the shop name. Leave blank to print ESTIMATE. Type TAX INVOICE or BILL OF SUPPLY when that shop needs it. Real Tast A4: blank stays BILL OF SUPPLY. Letter-pad: blank hides the title."
                    >
                      <Input
                        id="invoice_document_title"
                        value={settings.sale_settings?.invoice_document_title || ""}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              invoice_document_title: e.target.value,
                            },
                          })
                        }
                        maxLength={80}
                        placeholder="ESTIMATE, TAX INVOICE, BILL OF SUPPLY"
                      />
                    </SettingsField>

                    <SettingsField
                      label="Custom Header Text"
                      htmlFor="invoice_header_text"
                      help="Optional text to display at the top of invoices (max 200 chars)"
                    >
                      <Textarea
                        id="invoice_header_text"
                        value={settings.sale_settings?.invoice_header_text || ""}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              invoice_header_text: e.target.value,
                            },
                          })
                        }
                        rows={2}
                        maxLength={200}
                        placeholder="e.g., Thank you for shopping with us!"
                      />
                    </SettingsField>

                    <SettingsField
                      label="Custom Footer Text"
                      htmlFor="invoice_footer_text"
                      help="Optional text to display at the bottom of invoices (max 200 chars)"
                    >
                      <Textarea
                        id="invoice_footer_text"
                        value={settings.sale_settings?.invoice_footer_text || ""}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              invoice_footer_text: e.target.value,
                            },
                          })
                        }
                        rows={2}
                        maxLength={200}
                        placeholder="e.g., Visit us again! Follow us on social media"
                      />
                    </SettingsField>

                    <SettingsField label="Invoice Color Scheme" htmlFor="invoice_color_scheme">
                      <Select
                        value={settings.sale_settings?.invoice_color_scheme || "blue"}
                        onValueChange={(value) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              invoice_color_scheme: value,
                            },
                          })
                        }
                      >
                        <SelectTrigger id="invoice_color_scheme">
                          <SelectValue placeholder="Select color" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="blue">Blue - Professional</SelectItem>
                          <SelectItem value="green">Green - Fresh</SelectItem>
                          <SelectItem value="purple">Purple - Creative</SelectItem>
                          <SelectItem value="red">Red - Bold</SelectItem>
                          <SelectItem value="orange">Orange - Energetic</SelectItem>
                          <SelectItem value="gray">Gray - Neutral</SelectItem>
                        </SelectContent>
                      </Select>
                    </SettingsField>

                    <SettingsField label="Invoice Declaration Text" htmlFor="declaration_text" span="full">
                      <Textarea
                        id="declaration_text"
                        value={
                          settings.sale_settings?.declaration_text ||
                          "Declaration: Composition taxable person, not eligible to collect tax on supplies."
                        }
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              declaration_text: e.target.value,
                            },
                          })
                        }
                        rows={2}
                      />
                    </SettingsField>

                    <SettingsField
                      label="Invoice Terms & Conditions"
                      span="full"
                      help="Up to 6 terms shown on invoice & thermal receipt. Leave blank to hide."
                    >
                      <div className="space-y-2">
                        {(() => {
                          const MAX_TERMS = 6;
                          const existing = settings.sale_settings?.terms_list || [
                            "GOODS ONCE SOLD WILL NOT BE TAKEN BACK.",
                            "NO EXCHANGE WITHOUT BARCODE & BILL.",
                            "EXCHANGE TIME: 01:00 TO 04:00 PM.",
                            "",
                            "",
                            "",
                          ];
                          const padded = [...existing];
                          while (padded.length < MAX_TERMS) padded.push("");
                          const display = padded.slice(0, MAX_TERMS);

                          return display.map((term, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-5 text-right shrink-0 font-medium">
                                {index + 1}.
                              </span>
                              <Input
                                value={term}
                                onChange={(e) => {
                                  const newTerms = [...display];
                                  newTerms[index] = e.target.value;
                                  setSettings({
                                    ...settings,
                                    sale_settings: {
                                      ...settings.sale_settings,
                                      terms_list: newTerms,
                                    },
                                  });
                                }}
                                placeholder={`Term ${index + 1} (leave blank to hide)`}
                                className="flex-1"
                              />
                            </div>
                          ));
                        })()}
                      </div>
                    </SettingsField>
                  </SettingsGrid>
                </SettingsSection>

                <SettingsSection title="Invoice display options" subtitle="What prints on Sale bills" icon={Eye} tone="sky">
                  <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
                    <div className="settings-check">
                      <Checkbox
                        id="show_hsn_code"
                        checked={settings.sale_settings?.show_hsn_code ?? true}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              show_hsn_code: checked as boolean,
                            },
                          })
                        }
                      />
                      <Label htmlFor="show_hsn_code" className="cursor-pointer">
                        Show HSN Code
                      </Label>
                    </div>

                    <div className="settings-check">
                      <Checkbox
                        id="show_barcode"
                        checked={settings.sale_settings?.show_barcode ?? true}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              show_barcode: checked as boolean,
                            },
                          })
                        }
                      />
                      <Label htmlFor="show_barcode" className="cursor-pointer">
                        Show Barcode
                      </Label>
                    </div>

                    <div className="settings-check">
                      <Checkbox
                        id="show_gst_breakdown"
                        checked={settings.sale_settings?.show_gst_breakdown ?? true}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              show_gst_breakdown: checked as boolean,
                            },
                          })
                        }
                      />
                      <Label htmlFor="show_gst_breakdown" className="cursor-pointer">
                        Show GST Breakdown
                      </Label>
                    </div>

                    <div className="settings-check">
                      <Checkbox
                        id="show_bank_details"
                        checked={settings.sale_settings?.show_bank_details ?? false}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              show_bank_details: checked as boolean,
                            },
                          })
                        }
                      />
                      <Label htmlFor="show_bank_details" className="cursor-pointer">
                        Show Bank Details
                      </Label>
                    </div>

                    <div className="settings-check">
                      <Checkbox
                        id="show_mrp_column"
                        checked={settings.sale_settings?.show_mrp_column ?? false}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              show_mrp_column: checked as boolean,
                            },
                          })
                        }
                      />
                      <Label htmlFor="show_mrp_column" className="cursor-pointer">
                        Show MRP Column
                      </Label>
                    </div>
                  </div>
                </SettingsSection>

                {settings.sale_settings?.show_bank_details && (
                  <SettingsSection
                    title="Bank details on bills"
                    subtitle="Printed on Sale bills when Show Bank Details is on"
                    icon={Landmark}
                    tone="emerald"
                  >
                    <div className="settings-grid grid grid-cols-1 gap-x-4 gap-y-3 p-4 sm:grid-cols-2">
                      <SettingsField label="Bank Name" htmlFor="bank_name">
                        <Input
                          id="bank_name"
                          value={settings.sale_settings?.bank_details?.bank_name || ""}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                bank_details: {
                                  ...settings.sale_settings?.bank_details,
                                  bank_name: e.target.value,
                                },
                              },
                            })
                          }
                          placeholder="e.g., HDFC Bank"
                        />
                      </SettingsField>

                      <SettingsField label="Account Holder Name" htmlFor="account_holder">
                        <Input
                          id="account_holder"
                          value={settings.sale_settings?.bank_details?.account_holder || ""}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                bank_details: {
                                  ...settings.sale_settings?.bank_details,
                                  account_holder: e.target.value,
                                },
                              },
                            })
                          }
                          placeholder="e.g., John Doe"
                        />
                      </SettingsField>

                      <SettingsField label="Account Number" htmlFor="account_number">
                        <Input
                          id="account_number"
                          value={settings.sale_settings?.bank_details?.account_number || ""}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                bank_details: {
                                  ...settings.sale_settings?.bank_details,
                                  account_number: e.target.value,
                                },
                              },
                            })
                          }
                          placeholder="e.g., 1234567890"
                        />
                      </SettingsField>

                      <SettingsField label="IFSC Code" htmlFor="ifsc_code">
                        <Input
                          id="ifsc_code"
                          value={settings.sale_settings?.bank_details?.ifsc_code || ""}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                bank_details: {
                                  ...settings.sale_settings?.bank_details,
                                  ifsc_code: e.target.value,
                                },
                              },
                            })
                          }
                          placeholder="e.g., HDFC0001234"
                        />
                      </SettingsField>

                      <SettingsField label="Branch Name" htmlFor="bank_branch">
                        <Input
                          id="bank_branch"
                          value={(settings.sale_settings?.bank_details as any)?.branch || ""}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                bank_details: {
                                  ...settings.sale_settings?.bank_details,
                                  branch: e.target.value,
                                },
                              },
                            })
                          }
                          placeholder="e.g., Andheri West Branch"
                        />
                      </SettingsField>
                    </div>
                  </SettingsSection>
                )}

                <SettingsSection
                  title="E-Invoice (PeriOne API)"
                  subtitle="IRN for B2B bills. Keys stay saved for this shop only."
                  icon={Shield}
                  tone="rose"
                >
                  <div className="space-y-3 p-4">
                    <div className="settings-check">
                      <Checkbox
                        id="einvoice_enabled"
                        checked={settings.sale_settings?.einvoice_settings?.enabled ?? false}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              einvoice_settings: {
                                ...settings.sale_settings?.einvoice_settings,
                                enabled: checked as boolean,
                              } as any,
                            },
                          })
                        }
                      />
                      <div>
                        <Label htmlFor="einvoice_enabled" className="font-normal cursor-pointer">
                          Enable E-Invoice Generation
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          When enabled, allows generating IRN for B2B invoices via PeriOne API
                        </p>
                      </div>
                    </div>

                    {settings.sale_settings?.einvoice_settings?.enabled && (
                      <div className="space-y-4">
                        {/* PeriOne API Credentials Section */}
                        <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                          <h4 className="font-medium flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            PeriOne API Credentials
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            Enter your PeriOne API credentials. These are stored securely per organization.
                          </p>

                          <div className="settings-grid grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
                            <SettingsField label="API Email" htmlFor="api_email">
                              <Input
                                id="api_email"
                                type="email"
                                className="no-uppercase"
                                value={settings.sale_settings?.einvoice_settings?.api_email || ""}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    sale_settings: {
                                      ...settings.sale_settings,
                                      einvoice_settings: {
                                        ...settings.sale_settings?.einvoice_settings,
                                        api_email: e.target.value,
                                      } as any,
                                    },
                                  })
                                }
                                placeholder="tausifretailview@gmail.com"
                              />
                            </SettingsField>

                            <SettingsField label="Username / User ID" htmlFor="api_username">
                              <Input
                                id="api_username"
                                className="no-uppercase"
                                value={settings.sale_settings?.einvoice_settings?.api_username || ""}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    sale_settings: {
                                      ...settings.sale_settings,
                                      einvoice_settings: {
                                        ...settings.sale_settings?.einvoice_settings,
                                        api_username: e.target.value,
                                      } as any,
                                    },
                                  })
                                }
                                placeholder="Enter username"
                              />
                            </SettingsField>

                            <SettingsField label="Password" htmlFor="api_password">
                              <div className="relative">
                                <Input
                                  id="api_password"
                                  type={showApiPassword ? "text" : "password"}
                                  className="no-uppercase pr-10"
                                  value={settings.sale_settings?.einvoice_settings?.api_password || ""}
                                  onChange={(e) =>
                                    setSettings({
                                      ...settings,
                                      sale_settings: {
                                        ...settings.sale_settings,
                                        einvoice_settings: {
                                          ...settings.sale_settings?.einvoice_settings,
                                          api_password: e.target.value,
                                        } as any,
                                      },
                                    })
                                  }
                                  placeholder="••••••••"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                  onClick={() => setShowApiPassword(!showApiPassword)}
                                >
                                  {showApiPassword ? (
                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </Button>
                              </div>
                            </SettingsField>

                            <SettingsField label="Client ID" htmlFor="api_client_id">
                              <Input
                                id="api_client_id"
                                className="no-uppercase"
                                value={settings.sale_settings?.einvoice_settings?.api_client_id || ""}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    sale_settings: {
                                      ...settings.sale_settings,
                                      einvoice_settings: {
                                        ...settings.sale_settings?.einvoice_settings,
                                        api_client_id: e.target.value,
                                      } as any,
                                    },
                                  })
                                }
                                placeholder="Enter Client ID"
                              />
                            </SettingsField>

                            <div className="space-y-2 md:col-span-2">
                              <Label htmlFor="api_client_secret">Client Secret</Label>
                              <div className="relative">
                                <Input
                                  id="api_client_secret"
                                  type={showClientSecret ? "text" : "password"}
                                  value={settings.sale_settings?.einvoice_settings?.api_client_secret || ""}
                                  onChange={(e) =>
                                    setSettings({
                                      ...settings,
                                      sale_settings: {
                                        ...settings.sale_settings,
                                        einvoice_settings: {
                                          ...settings.sale_settings?.einvoice_settings,
                                          api_client_secret: e.target.value,
                                        } as any,
                                      },
                                    })
                                  }
                                  placeholder="••••••••••••••••"
                                  className="font-mono no-uppercase pr-10"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                  onClick={() => setShowClientSecret(!showClientSecret)}
                                >
                                  {showClientSecret ? (
                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3 pt-2">
                          <div className="settings-check">
                            <Checkbox
                              id="einvoice_test_mode"
                              checked={settings.sale_settings?.einvoice_settings?.test_mode ?? true}
                              onCheckedChange={(checked) =>
                                setSettings({
                                  ...settings,
                                  sale_settings: {
                                    ...settings.sale_settings,
                                    einvoice_settings: {
                                      ...settings.sale_settings?.einvoice_settings,
                                      test_mode: checked as boolean,
                                    } as any,
                                  },
                                })
                              }
                            />
                            <div>
                              <Label htmlFor="einvoice_test_mode" className="font-normal cursor-pointer">
                                Test Mode (Sandbox)
                              </Label>
                              <p className="text-xs text-muted-foreground">Use PeriOne Sandbox environment for testing</p>
                            </div>
                          </div>

                          {/* Seller GSTIN Override - only show when test mode is enabled */}
                          {settings.sale_settings?.einvoice_settings?.test_mode && (
                            <SettingsField
                              label="Seller GSTIN Override (Sandbox)"
                              htmlFor="seller_gstin_override"
                              help="Use PeriOne sandbox GSTIN for testing. Leave empty to use your Business Details GSTIN."
                            >
                              <Input
                                id="seller_gstin_override"
                                value={settings.sale_settings?.einvoice_settings?.seller_gstin || ""}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    sale_settings: {
                                      ...settings.sale_settings,
                                      einvoice_settings: {
                                        ...settings.sale_settings?.einvoice_settings,
                                        seller_gstin: e.target.value,
                                      } as any,
                                    },
                                  })
                                }
                                placeholder="29AAGCB1286Q000"
                                className="font-mono"
                              />
                            </SettingsField>
                          )}

                          <div className="settings-check">
                            <Checkbox
                              id="einvoice_auto_generate"
                              checked={settings.sale_settings?.einvoice_settings?.auto_generate ?? false}
                              onCheckedChange={(checked) =>
                                setSettings({
                                  ...settings,
                                  sale_settings: {
                                    ...settings.sale_settings,
                                    einvoice_settings: {
                                      ...settings.sale_settings?.einvoice_settings,
                                      auto_generate: checked as boolean,
                                    } as any,
                                  },
                                })
                              }
                            />
                            <div>
                              <Label htmlFor="einvoice_auto_generate" className="font-normal cursor-pointer">
                                Auto-generate E-Invoice
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Automatically generate E-Invoice when saving B2B sales
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Test Connection Button */}
                        <div className="flex items-center gap-3 mt-4">
                          <Button
                            variant="outline"
                            onClick={async () => {
                              setIsTestingConnection(true);
                              setConnectionStatus(null);
                              try {
                                const response = await supabase.functions.invoke("test-einvoice-connection", {
                                  body: { organizationId: currentOrganization?.id },
                                });
                                if (response.error) throw new Error(response.error.message);
                                const result = response.data;
                                setConnectionStatus({
                                  success: result.success,
                                  message: result.success ? result.message : result.error,
                                });
                              } catch (err: any) {
                                setConnectionStatus({ success: false, message: err.message || "Connection test failed" });
                              } finally {
                                setIsTestingConnection(false);
                              }
                            }}
                            disabled={isTestingConnection}
                          >
                            {isTestingConnection ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Eye className="h-4 w-4 mr-2" />
                            )}
                            Test Connection
                          </Button>
                          {connectionStatus && (
                            <span
                              className={`text-sm font-medium ${connectionStatus.success ? "text-green-600" : "text-destructive"}`}
                            >
                              {connectionStatus.success ? "✅" : "❌"} {connectionStatus.message}
                            </span>
                          )}
                        </div>

                        <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm">
                          <p className="font-medium text-muted-foreground mb-1">⚠️ Important Notes:</p>
                          <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs">
                            <li>API credentials are stored securely per organization</li>
                            <li>Ensure seller GSTIN is configured in Business Settings above</li>
                            <li>E-Invoice is mandatory for turnover {">"} ₹5 Crore</li>
                            <li>Test in Sandbox mode (staging.perione.in) before going live</li>
                            <li>Customer must have a valid GSTIN for B2B e-Invoice</li>
                            <li>PeriOne contact: hello@perione.in | +91 9848799417</li>
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </SettingsSection>

                <SettingsSection title="E-Way Bill" icon={Truck} tone="amber">
                  <div className="p-4">
                    <EwayBillSettingsSection
                      organizationId={currentOrganization?.id}
                      value={settings.sale_settings?.einvoice_settings}
                      einvoiceOn={settings.sale_settings?.einvoice_settings?.enabled === true}
                      industrialOn={industrialModeAvailable && settings.sale_settings?.industrial_mode?.enabled === true}
                      onChange={(patch) =>
                        setSettings({
                          ...settings,
                          sale_settings: {
                            ...settings.sale_settings,
                            einvoice_settings: {
                              ...settings.sale_settings?.einvoice_settings,
                              ...patch,
                            } as any,
                          },
                        })
                      }
                    />
                  </div>
                </SettingsSection>

                <SettingsSection
                  title="Customer points"
                  subtitle="Customers earn points on purchases and redeem them at billing"
                  icon={Gift}
                  tone="violet"
                >
                  <div className="space-y-3 p-4">
                    <div className="settings-check">
                      <Checkbox
                        id="enable_points_system"
                        checked={(settings.sale_settings as any)?.enable_points_system ?? false}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              enable_points_system: checked as boolean,
                            } as any,
                          })
                        }
                      />
                      <div>
                        <Label htmlFor="enable_points_system" className="font-normal cursor-pointer">
                          Enable Customer Points System
                        </Label>
                        <p className="text-xs text-muted-foreground">When enabled, customers earn points on their purchases</p>
                      </div>
                    </div>

                    {(settings.sale_settings as any)?.enable_points_system && (
                      <div className="space-y-4">
                        <div className="settings-grid grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                          <SettingsField
                            label="Amount per Point (₹)"
                            htmlFor="points_ratio_amount"
                            help="Amount in rupees required to earn points"
                          >
                            <Input
                              id="points_ratio_amount"
                              type="number"
                              min="1"
                              value={(settings.sale_settings as any)?.points_ratio_amount || 100}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  sale_settings: {
                                    ...settings.sale_settings,
                                    points_ratio_amount: parseInt(e.target.value) || 100,
                                  } as any,
                                })
                              }
                              placeholder="100"
                            />
                          </SettingsField>

                          <SettingsField
                            label="Points Awarded"
                            htmlFor="points_per_ratio"
                            help="Points earned per ratio amount"
                          >
                            <Input
                              id="points_per_ratio"
                              type="number"
                              min="1"
                              value={(settings.sale_settings as any)?.points_per_ratio || 1}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  sale_settings: {
                                    ...settings.sale_settings,
                                    points_per_ratio: parseInt(e.target.value) || 1,
                                  } as any,
                                })
                              }
                              placeholder="1"
                            />
                          </SettingsField>
                        </div>

                        <div className="p-3 bg-primary/5 rounded-lg">
                          <p className="text-sm font-medium">
                            Example: ₹{(settings.sale_settings as any)?.points_ratio_amount || 100} purchase ={" "}
                            {(settings.sale_settings as any)?.points_per_ratio || 1} point(s)
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Customer buying ₹2,500 worth of products will earn{" "}
                            {Math.floor(2500 / ((settings.sale_settings as any)?.points_ratio_amount || 100)) *
                              ((settings.sale_settings as any)?.points_per_ratio || 1)}{" "}
                            points
                          </p>
                        </div>

                        <div className="settings-grid grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                          <SettingsField label="Points Rounding" htmlFor="points_rounding">
                            <Select
                              value={(settings.sale_settings as any)?.points_rounding || "floor"}
                              onValueChange={(value) =>
                                setSettings({
                                  ...settings,
                                  sale_settings: {
                                    ...settings.sale_settings,
                                    points_rounding: value,
                                  } as any,
                                })
                              }
                            >
                              <SelectTrigger id="points_rounding">
                                <SelectValue placeholder="Select rounding" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="floor">Round Down (Floor)</SelectItem>
                                <SelectItem value="round">Round to Nearest</SelectItem>
                                <SelectItem value="ceil">Round Up (Ceiling)</SelectItem>
                              </SelectContent>
                            </Select>
                          </SettingsField>

                          <SettingsField
                            label="Minimum Purchase (₹)"
                            htmlFor="min_purchase_for_points"
                            help="Minimum invoice amount to earn points (0 = no minimum)"
                          >
                            <Input
                              id="min_purchase_for_points"
                              type="number"
                              min="0"
                              value={(settings.sale_settings as any)?.min_purchase_for_points || 0}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  sale_settings: {
                                    ...settings.sale_settings,
                                    min_purchase_for_points: parseInt(e.target.value) || 0,
                                  } as any,
                                })
                              }
                              placeholder="0"
                            />
                          </SettingsField>
                        </div>

                        {/* Points Redemption Settings */}
                        <div className="space-y-4 pt-4 border-t border-dashed">
                          <h4 className="font-medium text-primary flex items-center gap-2">
                            <span>🎁</span> Points Redemption Settings
                          </h4>

                          <div className="settings-check">
                            <Checkbox
                              id="enable_points_redemption"
                              checked={(settings.sale_settings as any)?.enable_points_redemption ?? false}
                              onCheckedChange={(checked) =>
                                setSettings({
                                  ...settings,
                                  sale_settings: {
                                    ...settings.sale_settings,
                                    enable_points_redemption: checked as boolean,
                                  } as any,
                                })
                              }
                            />
                            <div>
                              <Label htmlFor="enable_points_redemption" className="font-normal cursor-pointer">
                                Enable Points Redemption at Billing
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Allow customers to redeem points for instant discount
                              </p>
                            </div>
                          </div>

                          {(settings.sale_settings as any)?.enable_points_redemption && (
                            <div className="settings-grid grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                              <SettingsField
                                label="1 Point = ₹"
                                htmlFor="points_redemption_value"
                                help="Rupee value of 1 point"
                              >
                                <Input
                                  id="points_redemption_value"
                                  type="number"
                                  min="0.1"
                                  step="0.1"
                                  value={(settings.sale_settings as any)?.points_redemption_value || 1}
                                  onChange={(e) =>
                                    setSettings({
                                      ...settings,
                                      sale_settings: {
                                        ...settings.sale_settings,
                                        points_redemption_value: parseFloat(e.target.value) || 1,
                                      } as any,
                                    })
                                  }
                                  placeholder="1"
                                />
                              </SettingsField>

                              <SettingsField
                                label="Max Redemption %"
                                htmlFor="max_redemption_percent"
                                help="Max % of invoice payable via points"
                              >
                                <Input
                                  id="max_redemption_percent"
                                  type="number"
                                  min="1"
                                  max="100"
                                  value={(settings.sale_settings as any)?.max_redemption_percent || 50}
                                  onChange={(e) =>
                                    setSettings({
                                      ...settings,
                                      sale_settings: {
                                        ...settings.sale_settings,
                                        max_redemption_percent: parseInt(e.target.value) || 50,
                                      } as any,
                                    })
                                  }
                                  placeholder="50"
                                />
                              </SettingsField>

                              <SettingsField
                                label="Min Points to Redeem"
                                htmlFor="min_points_for_redemption"
                                help="Minimum old points balance required to redeem (current bill earn is pending)"
                              >
                                <Input
                                  id="min_points_for_redemption"
                                  type="number"
                                  min="1"
                                  value={(settings.sale_settings as any)?.min_points_for_redemption ?? 1}
                                  onChange={(e) =>
                                    setSettings({
                                      ...settings,
                                      sale_settings: {
                                        ...settings.sale_settings,
                                        min_points_for_redemption: parseInt(e.target.value) || 1,
                                      } as any,
                                    })
                                  }
                                  placeholder="1"
                                />
                              </SettingsField>

                              <SettingsField
                                label="Min Purchase for Redemption (₹)"
                                htmlFor="min_purchase_for_redemption"
                                help="Min invoice amount for redemption (0 = no minimum)"
                              >
                                <Input
                                  id="min_purchase_for_redemption"
                                  type="number"
                                  min="0"
                                  value={(settings.sale_settings as any)?.min_purchase_for_redemption || 0}
                                  onChange={(e) =>
                                    setSettings({
                                      ...settings,
                                      sale_settings: {
                                        ...settings.sale_settings,
                                        min_purchase_for_redemption: parseInt(e.target.value) || 0,
                                      } as any,
                                    })
                                  }
                                  placeholder="0"
                                />
                              </SettingsField>
                            </div>
                          )}

                          {(settings.sale_settings as any)?.enable_points_redemption && (
                            <div className="p-3 bg-green-500/5 rounded-lg border border-green-500/20">
                              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                                Example: Customer with 100 points can redeem up to ₹
                                {((settings.sale_settings as any)?.points_redemption_value || 1) * 100} discount
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                On ₹2,000 invoice, max redeemable: ₹
                                {Math.floor((2000 * ((settings.sale_settings as any)?.max_redemption_percent || 50)) / 100)} (
                                {(settings.sale_settings as any)?.max_redemption_percent || 50}% limit)
                              </p>
                            </div>
                          )}

                          {/* Gift Rewards Management */}
                          <div className="pt-4 border-t border-dashed">
                            <LazySettingsPanel>
                              <LazyGiftRewardsManagement />
                            </LazySettingsPanel>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </SettingsSection>
              </div>

              <SettingsInvoicePreview
                settings={settings}
                setSettings={setSettings}
                invoicePreviewChannel={invoicePreviewChannel}
                setInvoicePreviewChannel={setInvoicePreviewChannel}
                sampleInvoiceData={sampleInvoiceData}
                showChannelSwitch
              />
            </div>
          </TabsContent>

          <TabsContent value="pos" className="mt-0">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 items-start">
              <div className="flex flex-col gap-3 min-w-0">
                <PosSettingsForm
                  settings={settings}
                  setSettings={setSettings}
                  onFocusPosPreview={() => setInvoicePreviewChannel("pos")}
                />
                <SettingsSection
                  title="POS screen extras"
                  subtitle="Code letters, date and GST options for the purchase code are in the Purchase tab"
                  icon={Eye}
                  tone="sky"
                >
                  <div className="grid gap-2 p-4 sm:grid-cols-2 2xl:grid-cols-3">
                    <SettingsToggle
                      id="show_purchase_code_on_pos"
                      label="Purchase code on POS rows"
                      description="P.Code column before Size (e.g. SEWN) so staff see the cost after a scan. Not printed."
                      checked={settings.purchase_settings?.show_purchase_code_on_pos === true}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          purchase_settings: {
                            ...settings.purchase_settings,
                            show_purchase_code_on_pos: checked === true,
                          },
                        })
                      }
                    />
                    <SettingsToggle
                      id="pos_margin_indicator_for_owner"
                      label="Margin indicator for owner"
                      description="Live markup % and profit on POS for the owner. Staff need the POS Margin Indicator right."
                      checked={(settings.sale_settings as any)?.pos_margin_indicator_for_owner === true}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          sale_settings: {
                            ...settings.sale_settings,
                            pos_margin_indicator_for_owner: checked === true,
                          } as any,
                        })
                      }
                    />
                    <SettingsField
                      label="Service product default qty"
                      htmlFor="service_default_qty"
                      help="Qty filled in the service popup on Sale and POS. Default 1."
                    >
                      <Input
                        id="service_default_qty"
                        type="text"
                        inputMode="numeric"
                        className="max-w-[8rem]"
                        value={
                          settings.report_settings?.service_default_qty == null
                            ? ""
                            : String(settings.report_settings.service_default_qty)
                        }
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                          setSettings((prev) => ({
                            ...prev,
                            report_settings: {
                              ...(prev.report_settings || {}),
                              service_default_qty: digits ? parseInt(digits, 10) : undefined,
                            },
                          }));
                        }}
                        onBlur={() => {
                          setSettings((prev) => ({
                            ...prev,
                            report_settings: {
                              ...(prev.report_settings || {}),
                              service_default_qty: normalizeServiceDefaultQty(prev.report_settings?.service_default_qty),
                            },
                          }));
                        }}
                        placeholder="1"
                      />
                    </SettingsField>
                  </div>
                </SettingsSection>
                <SettingsSection
                  title="2nd billing details"
                  subtitle="For shops that bill under two names. Stock, accounts and bill numbers stay here."
                  icon={Building2}
                  tone="slate"
                  action={
                    <div className="flex items-center gap-2">
                      <label htmlFor="second_firm_enabled" className="text-xs font-semibold text-slate-600 cursor-pointer">
                        2nd firm on POS bills
                      </label>
                      <Switch
                        id="second_firm_enabled"
                        checked={settings.report_settings?.second_firm?.enabled === true}
                        onCheckedChange={(checked) => updateSecondFirm({ enabled: checked })}
                      />
                    </div>
                  }
                >
                  {settings.report_settings?.second_firm?.enabled === true ? (
                    <SettingsGrid cols={2}>
                      <SettingsField label="Company name" htmlFor="second_firm_name" important>
                        <Input
                          id="second_firm_name"
                          value={settings.report_settings?.second_firm?.name || ""}
                          onChange={(e) => updateSecondFirm({ name: e.target.value })}
                          placeholder="e.g. KMS Kids"
                        />
                      </SettingsField>
                      <SettingsField label="Phone number" htmlFor="second_firm_phone">
                        <Input
                          id="second_firm_phone"
                          value={settings.report_settings?.second_firm?.phone || ""}
                          onChange={(e) => updateSecondFirm({ phone: e.target.value })}
                        />
                      </SettingsField>
                      <SettingsField label="Address" htmlFor="second_firm_address" span="full">
                        <Textarea
                          id="second_firm_address"
                          rows={2}
                          value={settings.report_settings?.second_firm?.address || ""}
                          onChange={(e) => updateSecondFirm({ address: e.target.value })}
                        />
                      </SettingsField>
                      <SettingsField label="GSTIN (optional)" htmlFor="second_firm_gstin">
                        <Input
                          id="second_firm_gstin"
                          value={settings.report_settings?.second_firm?.gstin || ""}
                          onChange={(e) => updateSecondFirm({ gstin: e.target.value.toUpperCase() })}
                          placeholder="Leave blank to print no GSTIN"
                          className="font-mono"
                        />
                      </SettingsField>
                    </SettingsGrid>
                  ) : (
                    <p className="px-4 py-3 text-xs text-slate-500">
                      Off. When on, POS shows a small "2nd firm" tick box, and a ticked bill prints these details in the header.
                    </p>
                  )}
                </SettingsSection>
              </div>
              <SettingsInvoicePreview
                settings={settings}
                setSettings={setSettings}
                invoicePreviewChannel={invoicePreviewChannel}
                setInvoicePreviewChannel={setInvoicePreviewChannel}
                sampleInvoiceData={sampleInvoiceData}
                showChannelSwitch={false}
              />
            </div>
          </TabsContent>

          <TabsContent value="bill">
            <LazySettingsPanel>
              <LazyDesktopPrintSettings />
            </LazySettingsPanel>
            <div className="space-y-3">
              <SettingsSection
                title="UPI payment QR"
                subtitle="POS and Sale bills print the QR of the UPI ID marked Default"
                icon={QrCode}
                tone="emerald"
              >
                <SettingsGrid cols={3}>
                  <RadioGroup
                    value={coerceActiveUpiId(settings.bill_barcode_settings)}
                    onValueChange={(next) => {
                      const nextSlot = next as ActiveUpiId;
                      if (!canSelectUpiSlot(settings.bill_barcode_settings, nextSlot)) return;
                      setSettings({
                        ...settings,
                        bill_barcode_settings: patchCompanyUpi(
                          settings.bill_barcode_settings,
                          { active_upi_id: nextSlot },
                        ),
                      });
                    }}
                    className="grid gap-x-4 gap-y-3 sm:col-span-2 sm:grid-cols-2"
                  >
                    {(["primary", "secondary"] as const).map((slot) => {
                      const fieldId = slot === "primary" ? "upi_id" : "upi_id_2";
                      const value =
                        slot === "primary"
                          ? settings.bill_barcode_settings?.upi_id || ""
                          : settings.bill_barcode_settings?.upi_id_2 || "";
                      const selectable = canSelectUpiSlot(
                        settings.bill_barcode_settings,
                        slot,
                      );
                      return (
                        <SettingsField
                          key={slot}
                          label={slot === "primary" ? "UPI ID 1" : "UPI ID 2"}
                          htmlFor={fieldId}
                          important={slot === "primary"}
                        >
                          <div className="flex items-center gap-3">
                            <Input
                              id={fieldId}
                              value={value}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  bill_barcode_settings: patchCompanyUpi(
                                    settings.bill_barcode_settings,
                                    slot === "primary"
                                      ? { upi_id: e.target.value }
                                      : { upi_id_2: e.target.value },
                                  ),
                                })
                              }
                              placeholder={
                                slot === "primary"
                                  ? "e.g., yourname@paytm"
                                  : "Optional second UPI ID"
                              }
                              className="no-uppercase font-mono"
                            />
                            <label
                              htmlFor={`${fieldId}_default`}
                              className={cn(
                                "flex shrink-0 items-center gap-1.5 text-xs font-semibold",
                                selectable ? "cursor-pointer text-slate-700" : "cursor-not-allowed text-muted-foreground",
                              )}
                            >
                              <RadioGroupItem
                                value={slot}
                                id={`${fieldId}_default`}
                                disabled={!selectable}
                              />
                              Default
                            </label>
                          </div>
                        </SettingsField>
                      );
                    })}
                  </RadioGroup>
                  <SettingsField
                    label="DC invoice UPI ID"
                    htmlFor="dc_upi_id"
                    help={
                      settings.bill_barcode_settings?.dc_upi_id ? (
                        <span className="text-emerald-700">
                          DC bills use <span className="font-mono font-semibold">{settings.bill_barcode_settings.dc_upi_id}</span>
                        </span>
                      ) : (
                        <>DC bills use the company UPI: {resolveCompanyUpiId(settings.bill_barcode_settings) || "not set"}</>
                      )
                    }
                  >
                    <Input
                      id="dc_upi_id"
                      value={settings.bill_barcode_settings?.dc_upi_id || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...settings.bill_barcode_settings,
                            dc_upi_id: e.target.value,
                          },
                        })
                      }
                      placeholder="Blank = company UPI ID"
                      className="font-mono no-uppercase"
                    />
                  </SettingsField>
                </SettingsGrid>
              </SettingsSection>

              <SettingsSection
                title="Barcode labels"
                subtitle="What the Barcode Printing page opens with"
                icon={Barcode}
                tone="violet"
                action={
                  <Button type="button" variant="outline" size="sm" onClick={handleTestPrintBarcodes}>
                    <Eye className="h-4 w-4 mr-2" />
                    Test Print Preview
                  </Button>
                }
              >
                <SettingsGrid cols={3}>
                  <SettingsField
                    label="Default Barcode Printing tab"
                    htmlFor="barcode_default_print_tab"
                    important
                    help="Auto opens Standard when an A4 sheet design is default, otherwise Precision Pro."
                  >
                    <Select
                      value={(() => {
                        const tab = settings.bill_barcode_settings?.barcode_default_print_tab || "auto";
                        if (
                          tab === "precision_1up" ||
                          tab === "precision_2up" ||
                          tab === "precision_3up" ||
                          tab === "precision_footwear" ||
                          tab === "standard" ||
                          tab === "precision" ||
                          tab === "auto"
                        ) {
                          // Prefer explicit precision_* tab; if legacy "precision", derive from landing
                          if (tab === "precision") {
                            const landing =
                              settings.bill_barcode_settings?.default_thermal_landing || "thermal";
                            if (landing === "footwear") return "precision_footwear";
                            if (landing === "thermal2up") return "precision_2up";
                            if (landing === "thermal3up") return "precision_3up";
                            return "precision_1up";
                          }
                          return tab;
                        }
                        return "auto";
                      })()}
                      onValueChange={(value) => {
                        const landing:
                          | "thermal"
                          | "thermal2up"
                          | "thermal3up"
                          | "footwear"
                          | undefined =
                          value === "precision_1up"
                            ? "thermal"
                            : value === "precision_2up"
                              ? "thermal2up"
                              : value === "precision_3up"
                                ? "thermal3up"
                                : value === "precision_footwear"
                                  ? "footwear"
                                  : value === "precision"
                                    ? settings.bill_barcode_settings?.default_thermal_landing || "thermal"
                                    : undefined;

                        let nextPresetId = settings.bill_barcode_settings?.default_precision_preset_id;
                        if (landing) {
                          const matchingDefault = settingsDbPresets.find(
                            (p) => p.isDefault && inferPrecisionPrintMode(p) === landing,
                          );
                          const firstForMode = settingsDbPresets.find(
                            (p) => inferPrecisionPrintMode(p) === landing,
                          );
                          const keepCurrent =
                            nextPresetId &&
                            settingsDbPresets.some(
                              (p) =>
                                p.id === nextPresetId && inferPrecisionPrintMode(p) === landing,
                            );
                          nextPresetId =
                            matchingDefault?.id ||
                            (keepCurrent ? nextPresetId : undefined) ||
                            firstForMode?.id ||
                            undefined;
                        }

                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...settings.bill_barcode_settings,
                            barcode_default_print_tab: value as BillBarcodeSettings["barcode_default_print_tab"],
                            ...(landing
                              ? {
                                  default_thermal_landing: landing,
                                  precision_print_mode: landing,
                                  default_precision_preset_id: nextPresetId,
                                }
                              : {}),
                          },
                        });
                      }}
                    >
                      <SelectTrigger id="barcode_default_print_tab">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto (recommended)</SelectItem>
                        <SelectItem value="standard">Standard Printing</SelectItem>
                        <SelectItem value="precision_1up">Precision Pro — Thermal (1-Up)</SelectItem>
                        <SelectItem value="precision_2up">Precision Pro — Thermal (2-Up)</SelectItem>
                        <SelectItem value="precision_3up">Precision Pro — Thermal (3-Up)</SelectItem>
                        <SelectItem value="precision_footwear">Precision Pro — Footwear + Pair</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingsField>
                  <SettingsField
                    label="Default sheet type (Standard)"
                    htmlFor="default_standard_sheet_type"
                    help="Picked when Barcode Printing opens on Standard Printing"
                  >
                    <Select
                      value={settings.bill_barcode_settings?.default_standard_sheet_type || "__none__"}
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...settings.bill_barcode_settings,
                            default_standard_sheet_type: value === "__none__" ? undefined : value,
                          },
                        })
                      }
                    >
                      <SelectTrigger id="default_standard_sheet_type">
                        <SelectValue placeholder="Select sheet type" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[400px]">
                        <SelectItem value="__none__">None (use last saved default on page)</SelectItem>
                        {STANDARD_SHEET_TYPE_OPTIONS.map((group) => (
                          <SelectGroup key={group.group}>
                            <SelectLabel>{group.group}</SelectLabel>
                            {group.options.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                        {visitedTabs.has("bill") ? <BillTabSheetPresetOptions /> : null}
                      </SelectContent>
                    </Select>
                  </SettingsField>
                  <SettingsField
                    label="Default label design (Precision Pro)"
                    htmlFor="default_precision_preset_id"
                    help={
                      <>
                        Same as “Set as default” on Barcode Printing. Lists designs for the Default Barcode Printing tab.{" "}
                        {settingsDbPresets.filter(
                          (p) =>
                            inferPrecisionPrintMode(p) ===
                            (settings.bill_barcode_settings?.default_thermal_landing || "thermal"),
                        ).length === 0
                          ? "No saved designs for this mode yet — create one on Barcode Printing first."
                          : null}
                      </>
                    }
                  >
                    <Select
                      value={settings.bill_barcode_settings?.default_precision_preset_id || "__none__"}
                      onValueChange={(value) => {
                        if (value === "__none__") {
                          setSettings({
                            ...settings,
                            bill_barcode_settings: {
                              ...settings.bill_barcode_settings,
                              default_precision_preset_id: undefined,
                            },
                          });
                          return;
                        }
                        const preset = settingsDbPresets.find((p) => p.id === value);
                        const mode = preset
                          ? (inferPrecisionPrintMode(preset) as PrecisionPrintMode)
                          : "thermal";
                        const landing =
                          mode === "thermal2up" ||
                          mode === "thermal3up" ||
                          mode === "thermal" ||
                          mode === "footwear"
                            ? mode
                            : settings.bill_barcode_settings?.default_thermal_landing || "thermal";
                        const tabForMode =
                          landing === "footwear"
                            ? "precision_footwear"
                            : landing === "thermal3up"
                              ? "precision_3up"
                              : landing === "thermal2up"
                                ? "precision_2up"
                                : "precision_1up";
                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...settings.bill_barcode_settings,
                            default_precision_preset_id: value,
                            default_thermal_landing: landing,
                            precision_print_mode: landing,
                            barcode_default_print_tab: tabForMode,
                          },
                        });
                      }}
                    >
                      <SelectTrigger id="default_precision_preset_id">
                        <SelectValue placeholder="Select label design" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None (use mode default on page)</SelectItem>
                        {settingsDbPresets
                          .filter((p) => {
                            if (!p.id) return false;
                            const landing =
                              settings.bill_barcode_settings?.default_thermal_landing || "thermal";
                            return (
                              inferPrecisionPrintMode(p) === landing ||
                              p.id === settings.bill_barcode_settings?.default_precision_preset_id
                            );
                          })
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id!}>
                              {p.name}
                              {p.isDefault ? " ★" : ""} · {p.width}×{p.height}mm ·{" "}
                              {getPrecisionPrintModeDisplayName(inferPrecisionPrintMode(p))}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </SettingsField>
                  <SettingsField
                    label="Label format (direct print from Purchase)"
                    htmlFor="barcode_format"
                  >
                    <Select
                      value={settings.bill_barcode_settings?.barcode_format || "a4_12x4"}
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...settings.bill_barcode_settings,
                            barcode_format: value,
                          },
                        })
                      }
                    >
                      <SelectTrigger id="barcode_format">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="novajet48">Novajet 48 (8 cols, 33x19mm)</SelectItem>
                        <SelectItem value="novajet40">Novajet 40 (5 cols × 8 rows, 39x35mm)</SelectItem>
                        <SelectItem value="novajet65">Novajet 65 (5 cols, 38x21mm)</SelectItem>
                        <SelectItem value="a4_12x4">NovaJet MPL 48L (48×24mm, 4×12)</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingsField>
                  <SettingsField
                    label="Barcode digit length"
                    htmlFor="barcode_digits"
                    help="Grows by itself when the series is full (8 → 9 → 10)"
                  >
                    <Select
                      value={String(settings.bill_barcode_settings?.barcode_digits || "8")}
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...settings.bill_barcode_settings,
                            barcode_digits: parseInt(value),
                          },
                        })
                      }
                    >
                      <SelectTrigger id="barcode_digits">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="8">8 Digits (Default)</SelectItem>
                        <SelectItem value="9">9 Digits</SelectItem>
                        <SelectItem value="10">10 Digits</SelectItem>
                        <SelectItem value="11">11 Digits</SelectItem>
                        <SelectItem value="12">12 Digits</SelectItem>
                        <SelectItem value="13">13 Digits</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingsField>
                  <div className="settings-field min-w-0 flex items-end">
                    <SettingsToggle
                      id="enable_barcode_prompt"
                      label="Ask to print labels after purchase save"
                      className="w-full"
                      checked={settings.bill_barcode_settings?.enable_barcode_prompt !== false}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...settings.bill_barcode_settings,
                            enable_barcode_prompt: checked,
                          },
                        })
                      }
                    />
                  </div>
                </SettingsGrid>
              </SettingsSection>

              <div className="grid gap-3 xl:grid-cols-2">
                <SettingsSection
                  title="Cash drawer"
                  subtitle="Opens the drawer after a POS receipt prints"
                  icon={Wallet}
                  tone="amber"
                  action={
                    <Switch
                      id="enable_cash_drawer"
                      checked={settings.bill_barcode_settings?.enable_cash_drawer === true}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...settings.bill_barcode_settings,
                            enable_cash_drawer: checked,
                          },
                        })
                      }
                    />
                  }
                >
                  {settings.bill_barcode_settings?.enable_cash_drawer ? (
                    <SettingsGrid cols={2}>
                      <SettingsField
                        label="Drawer pin"
                        htmlFor="cash_drawer_pin"
                        help="Most drawers (incl. RUGTEK) use Pin 2. Try Pin 5 if it does not open."
                      >
                        <Select
                          value={settings.bill_barcode_settings?.cash_drawer_pin || 'pin2'}
                          onValueChange={(value: 'pin2' | 'pin5') =>
                            setSettings({
                              ...settings,
                              bill_barcode_settings: {
                                ...settings.bill_barcode_settings,
                                cash_drawer_pin: value,
                              },
                            })
                          }
                        >
                          <SelectTrigger id="cash_drawer_pin">
                            <SelectValue placeholder="Select drawer pin" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pin2">Pin 2 (Most common - RUGTEK)</SelectItem>
                            <SelectItem value="pin5">Pin 5 (Alternative)</SelectItem>
                          </SelectContent>
                        </Select>
                      </SettingsField>
                      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
                        <p className="font-semibold text-slate-700">Needs</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          <li>QZ Tray installed on the POS computer</li>
                          <li>Drawer cabled to the thermal printer (RJ11/RJ12)</li>
                          <li>Printer that supports ESC/POS</li>
                        </ul>
                      </div>
                    </SettingsGrid>
                  ) : (
                    <p className="px-4 py-3 text-xs text-slate-500">Off. Turn on the switch to pick the drawer pin.</p>
                  )}
                </SettingsSection>

                <SettingsSection
                  title="Custom barcode templates"
                  subtitle="Saved label formats you reuse when printing"
                  icon={Layers}
                  tone="sky"
                  action={
                      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
                        <DialogTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingTemplate(null);
                              setTemplateName("");
                              setTemplateSheetType("a4_12x4");
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            New Template
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Template"}</DialogTitle>
                            <DialogDescription>
                              Save a custom barcode label template with specific format for reuse across print jobs
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Template Name</Label>
                              <Input
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                placeholder="e.g., Clothing Labels, Product Tags"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Label Format</Label>
                              <select
                                value={templateSheetType}
                                onChange={(e) => setTemplateSheetType(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              >
                                <option value="novajet48">Novajet 48 (8 cols, 33x19mm)</option>
                                <option value="novajet40">Novajet 40 (5 cols × 8 rows, 39x35mm)</option>
                                <option value="novajet65">Novajet 65 (5 cols, 38x21mm)</option>
                                <option value="a4_12x4">NovaJet MPL 48L (48×24mm, 4×12)</option>
                              </select>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
                              Cancel
                            </Button>
                            <Button onClick={handleSaveTemplate}>
                              <Save className="h-4 w-4 mr-2" />
                              Save Template
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                  }
                >
                  <div className="p-4">
                    {barcodeTemplates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No custom templates saved yet</p>
                    ) : (
                      <div className="space-y-2">
                        {barcodeTemplates.map((template) => (
                          <div
                            key={template.id}
                            className="flex items-center justify-between p-3 border rounded-lg bg-card"
                          >
                            <div>
                              <p className="font-medium">{template.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {template.sheetType === 'novajet48' && 'Novajet 48 (8 cols, 33x19mm)'}
                                {template.sheetType === 'novajet40' && 'Novajet 40 (5 cols × 8 rows, 39x35mm)'}
                                {template.sheetType === 'novajet65' && 'Novajet 65 (5 cols, 38x21mm)'}
                                {template.sheetType === 'a4_12x4' && 'NovaJet MPL 48L (48×24mm, 4×12)'}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditTemplate(template)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteTemplate(template.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </SettingsSection>
              </div>

              <SettingsSection
                title="Cheque printing format"
                subtitle="Cheque layout for payment vouchers"
                icon={FileText}
                tone="slate"
              >
                <div className="p-4">
                  <LazySettingsPanel>
                    <LazyChequeFormatManagement />
                  </LazySettingsPanel>
                </div>
              </SettingsSection>
            </div>
          </TabsContent>

          <TabsContent value="reports">
            <div className="space-y-3">
              <OwnerAlertsSettings />
              <SettingsSection title="Customer page & notifications" subtitle="Your shop page for customers and the messages they get" icon={Store} tone="sky">
                <div className="p-4">
                  <CustomerPagePanel />
                </div>
              </SettingsSection>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <div className="space-y-3">
              <SettingsSection
                title="User rights"
                subtitle="Menu access and special rights (modify, delete, WhatsApp, accounts, delivery, dashboard) for each login"
                icon={Shield}
                tone="blue"
                action={
                  <Button
                    size="sm"
                    onPointerDown={() => prefetchTabPage("user-rights", { intent: true })}
                    onClick={() => navigate("/user-rights")}
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Manage User Rights
                  </Button>
                }
              >
                <div className="p-4">
                  <LazySettingsPanel>
                    <LazyUserManagement />
                  </LazySettingsPanel>
                </div>
              </SettingsSection>
            </div>
          </TabsContent>

          <TabsContent value="whatsapp">
            <div className="space-y-3">
              <SettingsSection
                title="WhatsApp connection"
                subtitle="Link your number and send bills on WhatsApp"
                icon={MessageCircle}
                tone="emerald"
              >
                <div className="p-4">
                  <WhatsAppAPIPanel />
                </div>
              </SettingsSection>
              {SHOW_WHATSAPP_MESSAGE_TEMPLATES && (
                <SettingsSection title="Message templates" icon={FileText} tone="slate">
                  <div className="p-4">
                    <WhatsAppTemplatePanel />
                  </div>
                </SettingsSection>
              )}
              <SettingsSection
                title="Links on WhatsApp bills"
                subtitle="Filled links are added at the end of every WhatsApp bill message"
                icon={Link2}
                tone="sky"
              >
                <SettingsGrid cols={3}>
                  <SettingsField label="Instagram Link" htmlFor="instagram_link">
                    <Input
                      id="instagram_link"
                      value={settings.bill_barcode_settings?.instagram_link || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...settings.bill_barcode_settings,
                            instagram_link: e.target.value,
                          },
                        })
                      }
                      placeholder="e.g., https://instagram.com/yourstore"
                      className="no-uppercase"
                    />
                  </SettingsField>

                  <SettingsField label="Facebook Link" htmlFor="facebook_link">
                    <Input
                      id="facebook_link"
                      value={settings.bill_barcode_settings?.facebook_link || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...settings.bill_barcode_settings,
                            facebook_link: e.target.value,
                          },
                        })
                      }
                      placeholder="e.g., https://facebook.com/yourstore"
                      className="no-uppercase"
                    />
                  </SettingsField>

                  <SettingsField label="Website Link" htmlFor="website_link">
                    <Input
                      id="website_link"
                      value={settings.bill_barcode_settings?.website_link || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...settings.bill_barcode_settings,
                            website_link: e.target.value,
                          },
                        })
                      }
                      placeholder="e.g., https://yourstore.com"
                      className="no-uppercase"
                    />
                  </SettingsField>

                  <SettingsField label="Google Review Link" htmlFor="google_review_link">
                    <Input
                      id="google_review_link"
                      value={settings.bill_barcode_settings?.google_review_link || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...settings.bill_barcode_settings,
                            google_review_link: e.target.value,
                          },
                        })
                      }
                      placeholder="e.g., https://g.page/yourstore/review"
                      className="no-uppercase"
                    />
                  </SettingsField>

                  <SettingsField label="WhatsApp Group Link" span={2} htmlFor="whatsapp_group_link">
                    <Input
                      id="whatsapp_group_link"
                      value={settings.bill_barcode_settings?.whatsapp_group_link || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...settings.bill_barcode_settings,
                            whatsapp_group_link: e.target.value,
                          },
                        })
                      }
                      onBlur={async (e) => {
                        const orgId = currentOrganization?.id;
                        if (!orgId) return;
                        const { data } = await supabase
                          .from("whatsapp_api_settings")
                          .select("id, social_links")
                          .eq("organization_id", orgId)
                          .maybeSingle();
                        if (!data) return;
                        await supabase
                          .from("whatsapp_api_settings")
                          .update({
                            social_links: { ...((data as any).social_links || {}), whatsapp_group: e.target.value.trim() },
                          } as any)
                          .eq("id", (data as any).id)
                          .eq("organization_id", orgId);
                      }}
                      placeholder="e.g., https://chat.whatsapp.com/xxxx"
                      className="no-uppercase"
                    />
                  </SettingsField>
                </SettingsGrid>
              </SettingsSection>
              <SettingsSection
                title="Extra features"
                subtitle="Click Save Settings after changing"
                icon={Sparkles}
                tone="violet"
              >
                <div className="grid gap-2 p-4 sm:grid-cols-2">
                  {[
                    {
                      key: "bulk_whatsapp_enabled" as const,
                      label: "Bulk WhatsApp",
                      hint: "Shows the Bulk WhatsApp page in the menu: send offers to many customers from your own linked number.",
                    },
                    {
                      key: "gift_vouchers_enabled" as const,
                      label: "Gift vouchers",
                      hint: "Shows Gift Voucher on Advance Booking and the Voucher button on POS to sell and redeem gift vouchers.",
                    },
                  ].map((f) => (
                    <SettingsToggle
                      key={f.key}
                      id={f.key}
                      label={f.label}
                      description={f.hint}
                      checked={settings.sale_settings?.[f.key] === true}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          sale_settings: { ...settings.sale_settings, [f.key]: checked },
                        })
                      }
                    />
                  ))}
                </div>
              </SettingsSection>
              <SettingsSection title="Automatic messages" subtitle="Wishes and the counter join QR" icon={Gift} tone="amber">
                <div className="grid gap-3 p-4 lg:grid-cols-2">
                  <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="auto_birthday_wish_enabled" className="text-sm font-semibold">
                          Birthday and anniversary wishes
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Every morning customers with a birthday or anniversary today (from Customer Master) get a wish, with
                          your offer and bonus points.
                        </p>
                      </div>
                      <Switch
                        id="auto_birthday_wish_enabled"
                        checked={settings.sale_settings?.auto_birthday_wish_enabled === true}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            sale_settings: { ...settings.sale_settings, auto_birthday_wish_enabled: checked },
                          })
                        }
                      />
                    </div>
                    {settings.sale_settings?.auto_birthday_wish_enabled === true && (
                      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
                        <div className="space-y-1">
                          <Label htmlFor="auto_birthday_offer" className="text-xs">
                            Offer line (optional)
                          </Label>
                          <Input
                            id="auto_birthday_offer"
                            maxLength={300}
                            placeholder="Show this message at the counter for 10% off this week."
                            value={settings.sale_settings?.auto_birthday_offer ?? ""}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                sale_settings: { ...settings.sale_settings, auto_birthday_offer: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="auto_birthday_points" className="text-xs">
                            Bonus points
                          </Label>
                          <Input
                            id="auto_birthday_points"
                            type="number"
                            min={0}
                            value={settings.sale_settings?.auto_birthday_points ?? 0}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                sale_settings: {
                                  ...settings.sale_settings,
                                  auto_birthday_points: Math.max(0, Number(e.target.value) || 0),
                                },
                              })
                            }
                          />
                        </div>
                        <p className="text-xs text-muted-foreground sm:col-span-2">
                          Bonus points are added only when the points system is on in Sale settings.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold">Counter &quot;Scan to join&quot; QR</p>
                      <p className="text-xs text-muted-foreground">
                        Print this at the counter. The customer scans it and sends JOIN, gets a welcome reply and is saved in
                        Customer Master. Customers who message you first are the safest to send offers to. Reply STOP stops
                        offers and wishes for them.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:items-start">
                      <div className="space-y-1">
                        <Label htmlFor="join_welcome_points" className="text-xs">
                          Welcome points
                        </Label>
                        <Input
                          id="join_welcome_points"
                          type="number"
                          min={0}
                          value={settings.sale_settings?.join_welcome_points ?? 0}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                join_welcome_points: Math.max(0, Number(e.target.value) || 0),
                              },
                            })
                          }
                        />
                      </div>
                      <JoinQrCard
                        shopName={settings.business_name || ""}
                        points={
                          (settings.sale_settings as { enable_points_system?: boolean } | undefined)?.enable_points_system
                            ? Number(settings.sale_settings?.join_welcome_points || 0)
                            : 0
                        }
                      />
                    </div>
                  </div>
                </div>
                <p className="px-4 pb-3 text-xs text-slate-500">
                  Works with Ezzy ERP WhatsApp or WappConnect (join QR: Ezzy ERP WhatsApp only). Messages go a few at a time
                  from your linked number to keep it safe. Click Save Settings after changing.
                </p>
              </SettingsSection>
            </div>
          </TabsContent>

          <TabsContent value="payment">
            <LazySettingsPanel>
              <LazyPaymentGatewaySettings />
            </LazySettingsPanel>
          </TabsContent>
        </Tabs>
      </div>

      <SaleInvoiceFormatBackupDialog
        open={invoiceFormatBackupOpen}
        onOpenChange={setInvoiceFormatBackupOpen}
        organizationId={currentOrganization?.id || ""}
        organizationName={currentOrganization?.name || "Organization"}
        saleSettings={(settings.sale_settings || {}) as Record<string, unknown>}
        onApplyFormat={(nextSaleSettings) => {
          setSettings({
            ...settings,
            sale_settings: {
              ...settings.sale_settings,
              ...nextSaleSettings,
            } as Settings["sale_settings"],
          });
        }}
      />
    </div>
  );
}
