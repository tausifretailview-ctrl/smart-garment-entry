import { useState, useEffect } from "react";
import { logError } from "@/lib/errorLogger";
import { UOM_OPTIONS } from "@/constants/uom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Home, Save, Eye, EyeOff, Shield, Printer, Package, Paintbrush, Copy, RefreshCw, CheckCircle2, Loader2, Building2, ShoppingCart, Receipt, CreditCard, BarChart2, Users, MessageSquare, MessageCircle, Database, Palette, FileText, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { UserManagement } from "@/components/UserManagement";
import { SizeGroupManagement } from "@/components/SizeGroupManagement";
import { WhatsAppTemplateSettings } from "@/components/WhatsAppTemplateSettings";
import { WhatsAppAPISettings } from "@/components/WhatsAppAPISettings";
import { SMSTemplateSettings } from "@/components/SMSTemplateSettings";
import { StockReconciliation } from "@/components/StockReconciliation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { useEffect as useEffectForSizeGroups } from "react";
import { printBarcodesDirectly } from "@/utils/barcodePrinter";

import { LabelCalibrationUI, CalibrationPreset } from "@/components/precision-barcode/LabelCalibrationUI";
import { validatePurchaseCodeAlphabet } from "@/utils/purchaseCodeEncoder";
import BackupSettings from "@/components/BackupSettings";
import { GiftRewardsManagement } from "@/components/GiftRewardsManagement";
import { ChequeFormatManagement } from "@/components/ChequeFormatManagement";
import { PaymentGatewaySettings } from "@/components/PaymentGatewaySettings";
import { Plus, Pencil, Trash2 } from "lucide-react";

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
}

interface ProductSettings {
  default_margin?: number;
  low_stock_threshold?: number;
  sku_format?: string;
  default_size_group?: string;
  mobile_erp?: MobileERPConfig;
  fields?: {
    category?: FieldConfig;
    brand?: FieldConfig;
    style?: FieldConfig;
    color?: FieldConfig;
    hsn_code?: FieldConfig;
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
  show_mrp?: boolean;
  product_entry_discount_enabled?: boolean;
  barcode_mode?: 'auto' | 'scan';
  same_barcode_series?: boolean;
  auto_focus_search?: boolean;
  size_grid_review_mode?: boolean;
  roll_wise_mtr_entry?: boolean;
  cursor_after_style?: 'pur_price' | 'hsn';
  garment_gst_rule_enabled?: boolean;
  garment_gst_threshold?: number;
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
}

interface SaleSettings {
  enable_customer_price_memory?: boolean; // Customer-wise sale price memory
  default_discount?: number;
  payment_methods?: string[];
  default_payment_method?: string;
  invoice_numbering_format?: string;  // For Sale Invoice INV-{YYYY}-{####}
  pos_numbering_format?: string;  // For POS billing POS-{YYYY}-{####}
  invoice_paper_format?: 'a5-vertical' | 'a5-horizontal' | 'a4' | 'thermal';  // Paper size
  sales_bill_format?: 'a4' | 'a5' | 'thermal';  // kept for backward compat
  pos_bill_format?: 'a4' | 'a5' | 'a5-horizontal' | 'thermal';  // POS bill format
  defaultEntryMode?: 'grid' | 'inline';  // Default entry mode for Sale Order
  enable_size_grid_sales?: boolean; // Enable/disable size grid in Sales Invoice
  sales_tax_rate?: number;
  invoice_template?: 'professional' | 'modern' | 'modern-wholesale' | 'classic' | 'minimal' | 'compact' | 'detailed' | 'tax-invoice' | 'tally-tax-invoice' | 'retail' | 'retail-erp' | 'wholesale-a5';
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
  logo_placement?: 'left' | 'center' | 'right';
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
  // Invoice column settings
  show_mrp_column?: boolean;
  // E-Invoice Settings
  einvoice_settings?: EInvoiceSettings;
  thermal_receipt_style?: 'classic' | 'compact' | 'modern';
  auto_apply_advance?: boolean;
  pos_series_start?: string;
  invoice_series_start?: string;
}

interface BillBarcodeSettings {
  logo_url?: string;
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
  dc_upi_id?: string;
  invoice_format?: string;
  show_product_details?: boolean;
  barcode_format?: string;
  barcode_digits?: number;
  brand_color?: string;
  login_display_name?: string;
  instagram_link?: string;
  website_link?: string;
  google_review_link?: string;
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
  precision_print_mode?: 'thermal' | 'a4';
  precision_label_config?: any; // LabelDesignConfig stored as JSON
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
}

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
  const { toast } = useToast();
  const { currentOrganization, organizations } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [sizeGroups, setSizeGroups] = useState<any[]>([]);
  const [showApiPassword, setShowApiPassword] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string } | null>(null);
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
  });

  const [detectedPrinters, setDetectedPrinters] = useState<string[]>([]);
  const [barcodeTemplates, setBarcodeTemplates] = useState<BarcodeTemplate[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BarcodeTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateSheetType, setTemplateSheetType] = useState("a4_12x4");

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

  const [settingsDbPresets, setSettingsDbPresets] = useState<import("@/components/precision-barcode/LabelCalibrationUI").CalibrationPreset[]>([]);
  const [allOrgPresets, setAllOrgPresets] = useState<Array<{
    preset: CalibrationPreset;
    orgId: string;
    orgName: string;
  }>>([]);
  const [importingPresetId, setImportingPresetId] = useState<string | null>(null);

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
    if (currentOrganization?.id) {
      fetchSettings();
      fetchSizeGroups();
      fetchDbPresets();
      fetchAllOrgPresets();
    }
  }, [currentOrganization?.id, organizations.length]);

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

  const fetchSettings = async () => {
    if (!currentOrganization?.id) return;
    
    try {
      const { data, error } = await supabase
        .from("settings" as any)
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        const settingsData = data as any;
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
        });
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
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

    setLoading(true);
    try {
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
            purchase_settings: settings.purchase_settings,
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
            purchase_settings: settings.purchase_settings,
            sale_settings: settings.sale_settings,
            bill_barcode_settings: settings.bill_barcode_settings,
            report_settings: settings.report_settings,
          });
        error = insertError;
      }

      if (error) throw error;

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
      
      await printBarcodesDirectly(sampleItems, { 
        sheetType: selectedFormat as any 
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
      // Delete old logo if exists
      if (settings.bill_barcode_settings?.logo_url) {
        const oldPath = settings.bill_barcode_settings.logo_url.split("/").pop();
        if (oldPath) {
          await supabase.storage.from("company-logos").remove([oldPath]);
        }
      }

      // Upload new logo
      const fileExt = file.name.split(".").pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const { error: uploadError, data } = await supabase.storage
        .from("company-logos")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("company-logos")
        .getPublicUrl(fileName);

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
      toast({
        title: "Error",
        description: "Failed to upload logo",
        variant: "destructive",
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-6 py-6">
      <div className="w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate("/")}
            >
              <Home className="h-4 w-4" />
            </Button>
            <h1 className="text-3xl font-bold">Settings</h1>
          </div>
          <Button onClick={handleSave} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            Save Settings
          </Button>
        </div>

        <Tabs defaultValue="company" className="w-full">
          <TabsList className="flex flex-wrap gap-1 h-auto p-1 bg-muted/60 rounded-xl mb-2">
            <TabsTrigger value="company" className="flex items-center gap-1.5 text-xs font-medium"><Building2 className="h-3.5 w-3.5" /> Company</TabsTrigger>
            <TabsTrigger value="product" className="flex items-center gap-1.5 text-xs font-medium"><Package className="h-3.5 w-3.5" /> Product</TabsTrigger>
            <TabsTrigger value="purchase" className="flex items-center gap-1.5 text-xs font-medium"><ShoppingCart className="h-3.5 w-3.5" /> Purchase</TabsTrigger>
            <TabsTrigger value="sale" className="flex items-center gap-1.5 text-xs font-medium"><Receipt className="h-3.5 w-3.5" /> Sale</TabsTrigger>
            <TabsTrigger value="bill" className="flex items-center gap-1.5 text-xs font-medium"><Printer className="h-3.5 w-3.5" /> Bill & Barcode</TabsTrigger>
            <TabsTrigger value="payment" className="flex items-center gap-1.5 text-xs font-medium"><CreditCard className="h-3.5 w-3.5" /> Payment</TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-1.5 text-xs font-medium"><BarChart2 className="h-3.5 w-3.5" /> Reports</TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-1.5 text-xs font-medium"><Users className="h-3.5 w-3.5" /> User Rights</TabsTrigger>
            <TabsTrigger value="sms" className="flex items-center gap-1.5 text-xs font-medium"><MessageSquare className="h-3.5 w-3.5" /> SMS</TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex items-center gap-1.5 text-xs font-medium"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</TabsTrigger>
            <TabsTrigger value="backup" className="flex items-center gap-1.5 text-xs font-medium"><Database className="h-3.5 w-3.5" /> Backup</TabsTrigger>
            <TabsTrigger value="branding" className="flex items-center gap-1.5 text-xs font-medium"><Palette className="h-3.5 w-3.5" /> Branding</TabsTrigger>
          </TabsList>

          <TabsContent value="company">
            <Card>
              <CardHeader>
                <CardTitle>Company Profile</CardTitle>
                <CardDescription>
                  Manage your business information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="business_name">Business Name</Label>
                  <Input
                    id="business_name"
                    className="no-uppercase"
                    value={settings.business_name || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, business_name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    value={settings.address || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, address: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="mobile_number">Mobile Number</Label>
                    <Input
                      id="mobile_number"
                      value={settings.mobile_number || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, mobile_number: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="owner_phone">Owner WhatsApp Number</Label>
                    <Input
                      id="owner_phone"
                      value={settings.owner_phone || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, owner_phone: e.target.value })
                      }
                      placeholder="e.g. 9876543210"
                    />
                    <p className="text-xs text-muted-foreground">
                      Owner can message this WhatsApp number with commands:
                      <strong className="text-foreground"> report, sales, stock, credit, expenses, week, staff, help</strong>
                      <br />
                      Type <em>"hi"</em> or <em>"report"</em> to get today's full tally instantly.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email_id">Email ID</Label>
                  <Input
                    id="email_id"
                    type="email"
                    value={settings.email_id || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, email_id: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gst_number">GST Number</Label>
                  <Input
                    id="gst_number"
                    value={settings.gst_number || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, gst_number: e.target.value })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding">
            <Card>
              <CardHeader>
                <CardTitle>Organization Branding</CardTitle>
                <CardDescription>
                  Customize your organization's login page and brand identity
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="org_logo">Organization Logo</Label>
                    <div className="flex items-center gap-4">
                      {settings.bill_barcode_settings?.logo_url && (
                        <img
                          src={settings.bill_barcode_settings.logo_url}
                          alt="Organization logo"
                          className="h-20 w-20 object-contain rounded-md border"
                        />
                      )}
                      <div className="flex-1">
                        <Input
                          id="org_logo"
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          disabled={uploadingLogo}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Upload your organization logo (max 2MB, JPG/PNG)
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">This logo also prints on invoices and barcode labels</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="brand_color">Primary Brand Color</Label>
                    <div className="flex items-center gap-4">
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
                        className="w-24 h-10"
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
                        className="font-mono"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This color will be used on your organization's login page
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login_display_name">Login Page Display Name</Label>
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
                    <p className="text-xs text-muted-foreground">
                      Leave empty to use the business name
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h3 className="text-sm font-semibold mb-2">Preview</h3>
                  <div className="p-6 rounded-lg border bg-muted/50">
                    <div className="max-w-sm mx-auto bg-background rounded-lg shadow-lg p-6">
                      {settings.bill_barcode_settings?.logo_url && (
                        <div className="flex justify-center mb-4">
                          <img
                            src={settings.bill_barcode_settings.logo_url}
                            alt="Logo preview"
                            className="h-16 w-auto object-contain"
                          />
                        </div>
                      )}
                      <h2 
                        className="text-xl font-bold text-center mb-2"
                        style={{ color: settings.bill_barcode_settings?.brand_color || "#3b82f6" }}
                      >
                        {settings.bill_barcode_settings?.login_display_name || settings.business_name || "Your Organization"}
                      </h2>
                      <p className="text-sm text-center text-muted-foreground">
                        Sign in to access your account
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

          </TabsContent>

          <TabsContent value="sms">
            <SMSTemplateSettings />
          </TabsContent>

          <TabsContent value="product">
            <Card>
              <CardHeader>
                <CardTitle>Product Settings</CardTitle>
                <CardDescription>
                  Configure product-related preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="default_margin">Default Profit Margin (%)</Label>
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
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="low_stock_threshold">Low Stock Alert Threshold</Label>
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
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sku_format">Auto-Generate SKU Format</Label>
                  <Input
                    id="sku_format"
                    value={settings.product_settings?.sku_format || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        product_settings: {
                          ...settings.product_settings,
                          sku_format: e.target.value,
                        },
                      })
                    }
                    placeholder="e.g., PRD-{YYYY}-{####}"
                  />
                  <p className="text-xs text-muted-foreground">
                    Available placeholders: {"{YYYY}"} (year), {"{MM}"} (month), {"{####}"} (auto-increment number)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default_size_group">Default Size Group</Label>
                  <Select
                    value={settings.product_settings?.default_size_group || "none"}
                    onValueChange={(value) =>
                      setSettings({
                        ...settings,
                        product_settings: {
                          ...settings.product_settings,
                          default_size_group: value === "none" ? undefined : value,
                        },
                      })
                    }
                  >
                    <SelectTrigger id="default_size_group">
                      <SelectValue placeholder="Select default size group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {sizeGroups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.group_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Default size group for new products
                  </p>
                </div>

                <div className="space-y-4 mt-6 pt-6 border-t">
                  <h3 className="text-lg font-semibold">Product Entry Form Fields</h3>
                  <p className="text-sm text-muted-foreground">Customize field labels and enable/disable fields</p>
                  
                  {[
                    { key: 'category', defaultLabel: 'Category' },
                    { key: 'brand', defaultLabel: 'Brand' },
                    { key: 'style', defaultLabel: 'Style' },
                    { key: 'color', defaultLabel: 'Color' },
                    { key: 'hsn_code', defaultLabel: 'HSN Code' },
                  ].map((field) => (
                    <div key={field.key} className="flex items-center gap-4 p-4 border rounded-lg">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`enable_${field.key}`}
                          checked={settings.product_settings?.fields?.[field.key as keyof NonNullable<typeof settings.product_settings.fields>]?.enabled ?? true}
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
                        <Label htmlFor={`enable_${field.key}`} className="cursor-pointer">
                          Enable
                        </Label>
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label htmlFor={`label_${field.key}`}>Field Label</Label>
                        <Input
                          id={`label_${field.key}`}
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
                                    enabled: settings.product_settings?.fields?.[field.key as keyof NonNullable<typeof settings.product_settings.fields>]?.enabled ?? true,
                                  },
                                },
                              },
                            });
                          }}
                          placeholder={field.defaultLabel}
                          disabled={!(settings.product_settings?.fields?.[field.key as keyof NonNullable<typeof settings.product_settings.fields>]?.enabled ?? true)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Mobile ERP / IMEI Tracking Mode */}
            <Card className="mt-4">
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
            
            <SizeGroupManagement />
          </TabsContent>

          <TabsContent value="purchase">
            <Card>
              <CardHeader>
                <CardTitle>Purchase Settings</CardTitle>
                <CardDescription>
                  Configure purchase-related preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="payment_terms">Default Payment Terms</Label>
                  <Select
                    value={settings.purchase_settings?.payment_terms || ""}
                    onValueChange={(value) =>
                      setSettings({
                        ...settings,
                        purchase_settings: {
                          ...settings.purchase_settings,
                          payment_terms: value,
                        },
                      })
                    }
                  >
                    <SelectTrigger id="payment_terms">
                      <SelectValue placeholder="Select payment terms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">Immediate</SelectItem>
                      <SelectItem value="net15">Net 15</SelectItem>
                      <SelectItem value="net30">Net 30</SelectItem>
                      <SelectItem value="net45">Net 45</SelectItem>
                      <SelectItem value="net60">Net 60</SelectItem>
                      <SelectItem value="net90">Net 90</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default_tax_rate">Default Tax Rate (%)</Label>
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
                </div>

                {/* Garment / Footwear GST Auto-Bump Rule */}
                <div className="col-span-full rounded-lg border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-semibold">
                        Auto-set Sale GST 18% above price threshold (Garment / Footwear rule)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        When sale price exceeds the threshold below, Sale GST % auto-changes to 18%.
                        Below or equal, it follows Purchase GST %. Manual GST &gt; 18% is preserved.
                      </p>
                    </div>
                    <Switch
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
                  </div>
                  <div className="space-y-1.5 max-w-xs">
                    <Label htmlFor="garment_gst_threshold" className="text-xs">
                      Threshold price (incl. GST)
                    </Label>
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
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Default Unit of Measurement (UOM)</Label>
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
                    <SelectTrigger className="w-56">
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
                  <p className="text-xs text-muted-foreground">
                    Default UOM pre-selected when adding a new product. Default: NOS - Numbers/Pieces
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Barcode Mode</Label>
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
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">🔢 Auto Generate</SelectItem>
                      <SelectItem value="scan">📷 Scan / Manual</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Auto Generate: system creates barcode on new product.<br />
                    Scan / Manual: barcode field stays blank — user scans manufacturer barcode or types supplier code.
                  </p>
                </div>
                
                <div className="flex items-center justify-between py-3 border rounded-lg px-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Same Barcode Series</p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      For products sold by MTR, KG, dozen — each product has one
                      permanent barcode (e.g. 501, 8001). Type the barcode in purchase
                      to instantly load the product and enter quantity. No new barcode
                      is created on repeat purchases.
                    </p>
                    <p className="text-xs text-amber-600">
                      Default OFF — garment/size-based businesses should keep this OFF.
                    </p>
                  </div>
                  <Switch
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="purchase_code_alphabet">Purchase Code Alphabet (0-9 mapping)</Label>
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
                    maxLength={10}
                    placeholder="ABCDEFGHIK"
                    className={
                      settings.purchase_settings?.purchase_code_alphabet &&
                      !validatePurchaseCodeAlphabet(settings.purchase_settings.purchase_code_alphabet)
                        ? "border-destructive"
                        : ""
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter 10 unique characters (A-Z or 0-9). First = 0, Second = 1, ... Tenth = 9. 
                    Example: ABCDEFGHIK means 100 = BAA. Numeric: 0123456789 means 500 = 500
                  </p>
                  {settings.purchase_settings?.purchase_code_alphabet &&
                    !validatePurchaseCodeAlphabet(settings.purchase_settings.purchase_code_alphabet) && (
                      <p className="text-xs text-destructive">
                        Invalid alphabet: Must be exactly 10 unique characters (A-Z or 0-9)
                      </p>
                    )}
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
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
                  <Label htmlFor="show_purchase_code" className="font-normal cursor-pointer">
                    Show Purchase Code on Barcode Labels
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  When enabled, purchase prices will be automatically encoded using the alphabet above 
                  and printed on barcode labels (e.g., ₹100 → BAA)
                </p>
                
                <div className="flex items-center space-x-2 ml-6">
                  <Checkbox
                    id="purchase_code_include_gst"
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
                  <Label htmlFor="purchase_code_include_gst" className="font-normal cursor-pointer">
                    Include GST in Purchase Code
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground ml-12">
                  When enabled, purchase code = (Purchase Rate − Discount + GST Amount) instead of just purchase rate
                </p>
                
                <div className="flex items-center space-x-2 pt-4">
                  <Checkbox
                    id="show_mrp"
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
                  <Label htmlFor="show_mrp" className="font-normal cursor-pointer">
                    Enable MRP Field
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  When enabled, MRP field will be shown in Product Entry, Sales, POS, Reports and Print invoices. 
                  Discount will be calculated as MRP - Sale Price.
                </p>
                
                <div className="flex items-center space-x-2 pt-4">
                  <Switch
                    id="product_entry_discount_enabled"
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
                  <Label htmlFor="product_entry_discount_enabled" className="font-normal cursor-pointer">
                    Product Entry Discounts
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  When enabled, Purchase Discount and Sale Discount fields appear on the Product Entry form. 
                  Discounts auto-apply when adding products to Purchase Bills, Sales, and POS.
                </p>

                <div className="flex items-center space-x-2 pt-4">
                  <Checkbox
                    id="auto_focus_search"
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
                  <Label htmlFor="auto_focus_search" className="font-normal cursor-pointer">
                    Auto-Focus Product Search Bar
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  When enabled, cursor automatically moves to the product search bar after adding a product or closing the Add New Product window.
                </p>

                <div className="flex items-center space-x-2 pt-4">
                  <Checkbox
                    id="size_grid_review_mode"
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
                  <Label htmlFor="size_grid_review_mode" className="font-normal cursor-pointer">
                    Review Variant Prices Before Adding to Bill
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  When enabled, the size-wise quantity window shows editable Purchase Price, Sale Price, and MRP per size for review before adding to bill. Use Ctrl+A or the "Add to Bill" button to confirm.
                </p>

                <div className="flex items-center space-x-2 pt-4">
                  <Checkbox
                    id="roll_wise_mtr_entry"
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
                  <Label htmlFor="roll_wise_mtr_entry" className="font-normal cursor-pointer">
                    Roll-wise Entry for MTR Products
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  When enabled, products with UOM = MTR show a roll entry dialog where each roll's individual meter length is entered. Each roll gets its own barcode and variant for per-roll stock tracking.
                </p>

                <div className="space-y-2 pt-4 border-t">
                  <Label className="text-sm font-semibold">Product Entry — Cursor Position After Style</Label>
                  <p className="text-xs text-muted-foreground">
                    Controls where the cursor moves after the Style field when pressing Enter/Tab in Product Entry.
                  </p>
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
                    <SelectTrigger className="w-72">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pur_price">⚡ Skip to Purchase Price (default)</SelectItem>
                      <SelectItem value="hsn">📋 Go to HSN → Pur GST → Sale GST → Pur Price</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
            <div className="mt-4">
              <DuplicatePurchaseBillsReconciler />
            </div>
          </TabsContent>

          <TabsContent value="sale">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Settings Form */}
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>Sale Settings</CardTitle>
                  <CardDescription>
                    Configure sale-related preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="default_discount">Default Discount (%)</Label>
                  <Input
                    id="default_discount"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={settings.sale_settings?.default_discount || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        sale_settings: {
                          ...settings.sale_settings,
                          default_discount: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                    placeholder="e.g., 5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoice_numbering_format">Sale Invoice Numbering Format</Label>
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
                  <p className="text-xs text-muted-foreground">
                    Available placeholders: {"{YYYY}"} (year), {"{MM}"} (month), {"{####}"} (auto-increment). Leave empty for default INV/25-26/1 format.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pos_numbering_format">POS Bill Numbering Format</Label>
                  <Input
                    id="pos_numbering_format"
                    value={settings.sale_settings?.pos_numbering_format || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        sale_settings: {
                          ...settings.sale_settings,
                          pos_numbering_format: e.target.value,
                        },
                      })
                    }
                    placeholder="Default: POS/YY-YY/N"
                  />
                  <p className="text-xs text-muted-foreground">
                    Available placeholders: {"{YYYY}"} (year), {"{MM}"} (month), {"{####}"} (auto-increment). Leave empty for default POS/25-26/1 format.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pos_series_start">POS Series Start From</Label>
                  <Input
                    id="pos_series_start"
                    value={settings.sale_settings?.pos_series_start || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        sale_settings: {
                          ...settings.sale_settings,
                          pos_series_start: e.target.value,
                        },
                      })
                    }
                    placeholder="e.g., POS/36-27/11"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the last used POS bill number. Next bill will auto-increment from this. Leave blank for default.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invoice_series_start">Sale Invoice Series Start From</Label>
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
                  <p className="text-xs text-muted-foreground">
                    Enter the last used Sale Invoice number. Next invoice will auto-increment from this. Leave blank for default.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Default Entry Mode (Sale Order / Quotation)</Label>
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
                  <p className="text-xs text-muted-foreground">
                    Size Grid allows entering multiple sizes at once, Inline adds one variant at a time
                  </p>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <div className="space-y-0.5">
                    <Label htmlFor="enable_size_grid_sales" className="text-sm font-medium">
                      Size Grid in Sales Invoice
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Show Size Grid / Inline entry mode toggle in Sales Invoice
                    </p>
                  </div>
                  <Switch
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
                </div>
                
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <div className="space-y-0.5">
                    <Label htmlFor="enable_customer_price_memory" className="text-sm font-medium">
                      Customer Price Memory
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically suggest last used price when selling to the same customer
                    </p>
                  </div>
                  <Switch
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
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <div className="space-y-0.5">
                    <Label htmlFor="ask_price_on_scan" className="text-sm font-medium">
                      Ask Price When Last Purchase Differs
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Show price selection dialog when last purchase price differs from master price during billing
                    </p>
                  </div>
                  <Switch
                    id="ask_price_on_scan"
                    checked={(settings.sale_settings as any)?.ask_price_on_scan ?? true}
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
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto_apply_advance" className="text-sm font-medium">
                      Auto-Apply Advance Balance
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically apply advance balance to oldest pending invoice when new payment is received (like Tally bill-by-bill settlement)
                    </p>
                  </div>
                  <Switch
                    id="auto_apply_advance"
                    checked={(settings.sale_settings as any)?.auto_apply_advance ?? false}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        sale_settings: {
                          ...settings.sale_settings,
                          auto_apply_advance: checked,
                        } as any,
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <div className="space-y-0.5">
                    <Label htmlFor="sale_return_use_original_price" className="text-sm font-medium">
                      Sale Return Price
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Use original price (before discount) for sale returns. Default: OFF (uses actual paid price after discount)
                    </p>
                  </div>
                  <Switch
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

                <div className="space-y-3">
                  <Label className="text-base font-semibold">Totals & Taxes</Label>
                  
                  <div className="flex items-center space-x-2">
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

                  <div className="flex items-center space-x-2">
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

                  <div className="flex items-center space-x-2">
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

                  <div className="flex items-center space-x-2">
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

                  <div className="flex items-center space-x-2">
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

                  <div className="flex items-center space-x-2">
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

                  <div className="flex items-center space-x-2">
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

                  <div className="flex items-center space-x-2">
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

                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Printer className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold leading-none">Print Format</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Paper size and printer settings for invoices</p>
                    </div>
                  </div>

                  {/* Enable preview toggle */}
                  <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                    <div>
                      <p className="text-sm font-medium">Invoice Preview Dialog</p>
                      <p className="text-xs text-muted-foreground">Show preview before printing (disable for direct print)</p>
                    </div>
                    <Switch
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
                  </div>

                  {/* 2-column grid: Sale format | POS format */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="invoice_paper_format" className="text-sm font-medium">Sale Invoice Format</Label>
                      <Select
                        value={settings.sale_settings?.invoice_paper_format || "a4"}
                        onValueChange={(value) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              invoice_paper_format: value as any,
                              // keep sales_bill_format in sync for backward compat
                              sales_bill_format:
                                value === 'thermal' ? 'thermal'
                                : value === 'a5-vertical' ? 'a5'
                                : 'a4',
                            },
                          })
                        }
                      >
                        <SelectTrigger id="invoice_paper_format">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="a4">A4 — Laser / Inkjet</SelectItem>
                          <SelectItem value="a5-vertical">A5 Portrait</SelectItem>
                          <SelectItem value="a5-horizontal">A5 Landscape</SelectItem>
                          <SelectItem value="thermal">Thermal 80mm</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pos_bill_format" className="text-sm font-medium">POS Bill Format</Label>
                      <Select
                        value={settings.sale_settings?.pos_bill_format || "thermal"}
                        onValueChange={(value) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              pos_bill_format: value as any,
                            },
                          })
                        }
                      >
                        <SelectTrigger id="pos_bill_format">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="thermal">Thermal 80mm — Most common</SelectItem>
                          <SelectItem value="a5-vertical">A5 Portrait</SelectItem>
                          <SelectItem value="a5-horizontal">A5 Landscape</SelectItem>
                          <SelectItem value="a4">A4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Thermal style — shown only when either format is thermal */}
                  {(settings.sale_settings?.invoice_paper_format === 'thermal' ||
                    settings.sale_settings?.pos_bill_format === 'thermal') && (
                    <div className="space-y-2">
                      <Label htmlFor="thermal_receipt_style" className="text-sm font-medium">Thermal Receipt Style</Label>
                      <Select
                        value={settings.sale_settings?.thermal_receipt_style || "classic"}
                        onValueChange={(value) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              thermal_receipt_style: value as 'classic' | 'compact' | 'modern',
                            },
                          })
                        }
                      >
                        <SelectTrigger id="thermal_receipt_style">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="classic">Classic — Monospace receipt</SelectItem>
                          <SelectItem value="compact">Compact — Sans-serif, denser</SelectItem>
                          <SelectItem value="modern">Modern — Stylish, pill headers</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Applies to all thermal printers (sale + POS)</p>
                    </div>
                  )}

                  {/* Default Printer Selection — quick setup for direct printing */}
                  <div className="space-y-3 pt-3 border-t border-dashed">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">Default Printer (Direct Print)</p>
                        <p className="text-xs text-muted-foreground">
                          Set default printer to skip browser print dialog. Requires QZ Tray installed.
                        </p>
                      </div>
                      <Switch
                        checked={settings.bill_barcode_settings?.enable_direct_print === true}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            bill_barcode_settings: {
                              ...settings.bill_barcode_settings,
                              enable_direct_print: checked,
                              direct_print_auto_print: checked, // auto-enable auto print
                            },
                          })
                        }
                      />
                    </div>

                    {settings.bill_barcode_settings?.enable_direct_print && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Sale Invoice Printer</Label>
                            <Select
                              value={settings.bill_barcode_settings?.direct_print_sale_printer || ''}
                              onValueChange={(value) =>
                                setSettings({
                                  ...settings,
                                  bill_barcode_settings: {
                                    ...settings.bill_barcode_settings,
                                    direct_print_sale_printer: value,
                                  },
                                })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select printer..." />
                              </SelectTrigger>
                              <SelectContent>
                                {detectedPrinters.map(p => (
                                  <SelectItem key={p} value={p}>{p}</SelectItem>
                                ))}
                                {detectedPrinters.length === 0 && (
                                  <div className="p-2 text-xs text-muted-foreground">Click "Detect Printers" first</div>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">POS Bill Printer</Label>
                            <Select
                              value={settings.bill_barcode_settings?.direct_print_pos_printer || ''}
                              onValueChange={(value) =>
                                setSettings({
                                  ...settings,
                                  bill_barcode_settings: {
                                    ...settings.bill_barcode_settings,
                                    direct_print_pos_printer: value,
                                  },
                                })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select printer..." />
                              </SelectTrigger>
                              <SelectContent>
                                {detectedPrinters.map(p => (
                                  <SelectItem key={p} value={p}>{p}</SelectItem>
                                ))}
                                {detectedPrinters.length === 0 && (
                                  <div className="p-2 text-xs text-muted-foreground">Click "Detect Printers" first</div>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={async () => {
                              const { getQZPrinters } = await import('@/utils/directInvoicePrint');
                              const printers = await getQZPrinters();
                              if (printers.length === 0) {
                                toast({
                                  title: "No Printers Found",
                                  description: "Make sure QZ Tray app is running on this computer (system tray). Download from qz.io/download if not installed.",
                                  variant: "destructive",
                                });
                              } else {
                                setDetectedPrinters(printers);
                                toast({
                                  title: `${printers.length} Printer(s) Detected`,
                                  description: "Select your printers from the dropdowns above.",
                                });
                              }
                            }}
                          >
                            🔍 Detect Printers
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={async () => {
                              const { printTestReceipt } = await import('@/utils/directInvoicePrint');
                              const printer = settings.bill_barcode_settings?.direct_print_pos_printer 
                                || settings.bill_barcode_settings?.direct_print_sale_printer;
                              if (!printer) {
                                toast({ title: "Select a printer first", variant: "destructive" });
                                return;
                              }
                              const paper = (settings.bill_barcode_settings?.direct_print_pos_paper || '80mm') as any;
                              await printTestReceipt(printer, paper);
                            }}
                          >
                            🖨️ Test Print
                          </Button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium">Auto Print After Save</p>
                            <p className="text-[11px] text-muted-foreground">Print instantly without confirmation dialog</p>
                          </div>
                          <Switch
                            checked={settings.bill_barcode_settings?.direct_print_auto_print === true}
                            onCheckedChange={(checked) =>
                              setSettings({
                                ...settings,
                                bill_barcode_settings: {
                                  ...settings.bill_barcode_settings,
                                  direct_print_auto_print: checked,
                                },
                              })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Item Details Display Settings */}
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Package className="h-3.5 w-3.5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold leading-none">Item Details Display</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Fields shown on bills and dashboards</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="flex items-center space-x-2">
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

                    <div className="flex items-center space-x-2">
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

                    <div className="flex items-center space-x-2">
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

                    <div className="flex items-center space-x-2">
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

                    <div className="flex items-center space-x-2">
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

                    <div className="flex items-center space-x-2">
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
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sales_tax_rate">Sales Tax Rate (%)</Label>
                  <Input
                    id="sales_tax_rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={settings.sale_settings?.sales_tax_rate || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        sale_settings: {
                          ...settings.sale_settings,
                          sales_tax_rate: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                    placeholder="e.g., 18"
                  />
                </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoice_template">Invoice Template Style</Label>
                    <Select
                      value={settings.sale_settings?.invoice_template || "professional"}
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          sale_settings: {
                            ...settings.sale_settings,
                            invoice_template: value as 'professional' | 'modern' | 'modern-wholesale' | 'classic' | 'minimal' | 'compact' | 'detailed' | 'tax-invoice' | 'tally-tax-invoice' | 'retail' | 'retail-erp' | 'wholesale-a5',
                          },
                        })
                      }
                    >
                      <SelectTrigger id="invoice_template">
                        <SelectValue placeholder="Select template" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">
                          <span className="flex items-center gap-2">
                            <span className="text-blue-600 font-bold text-xs w-5">PRO</span>
                            Professional — Detailed GST-ready
                          </span>
                        </SelectItem>
                        <SelectItem value="modern">
                          <span className="flex items-center gap-2">
                            <span className="text-violet-600 font-bold text-xs w-5">MOD</span>
                            Modern — Clean gradient design
                          </span>
                        </SelectItem>
                        <SelectItem value="modern-wholesale">
                          <span className="flex items-center gap-2">
                            <span className="text-teal-600 font-bold text-xs w-5">WHL</span>
                            Wholesale — Size grouping (38/2, 40/3)
                          </span>
                        </SelectItem>
                        <SelectItem value="classic">
                          <span className="flex items-center gap-2">
                            <span className="text-gray-600 font-bold text-xs w-5">CLS</span>
                            Classic — Traditional receipt style
                          </span>
                        </SelectItem>
                        <SelectItem value="minimal">
                          <span className="flex items-center gap-2">
                            <span className="text-slate-500 font-bold text-xs w-5">MIN</span>
                            Minimal — Simple &amp; clean
                          </span>
                        </SelectItem>
                        <SelectItem value="compact">
                          <span className="flex items-center gap-2">
                            <span className="text-orange-600 font-bold text-xs w-5">CMP</span>
                            Compact — Space-saving layout
                          </span>
                        </SelectItem>
                        <SelectItem value="detailed">
                          <span className="flex items-center gap-2">
                            <span className="text-green-600 font-bold text-xs w-5">DET</span>
                            Detailed — Full product info
                          </span>
                        </SelectItem>
                        <SelectItem value="tax-invoice">
                          <span className="flex items-center gap-2">
                            <span className="text-red-600 font-bold text-xs w-5">TAX</span>
                            Tax Invoice — GST B2B compliant
                          </span>
                        </SelectItem>
                        <SelectItem value="tally-tax-invoice">
                          <span className="flex items-center gap-2">
                            <span className="text-amber-700 font-bold text-xs w-5">TLY</span>
                            Tally Tax Invoice — Mobile/Electronics Shop
                          </span>
                        </SelectItem>
                        <SelectItem value="retail">
                          <span className="flex items-center gap-2">
                            <span className="text-pink-600 font-bold text-xs w-5">RET</span>
                            Retail — Fixed ERP format
                          </span>
                        </SelectItem>
                        <SelectItem value="retail-erp">
                          <span className="flex items-center gap-2">
                            <span className="text-indigo-600 font-bold text-xs w-5">ERP</span>
                            Retail ERP — Tax Invoice ERP style
                          </span>
                        </SelectItem>
                        <SelectItem value="wholesale-a5">
                          <span className="flex items-center gap-2">
                            <span className="text-stone-700 font-bold text-xs w-5">A5W</span>
                            Wholesale A5 — Laser print estimate
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Modern Wholesale is optimized for bulk orders with size grouping (e.g., 38/2, 40/3, 42/1)
                    </p>
                  </div>

                  {/* Wholesale Mode Settings - Show when Modern Wholesale template is selected */}
                  {settings.sale_settings?.invoice_template === 'modern-wholesale' && (
                    <div className="space-y-4 p-3 rounded-lg border-l-4 border-l-teal-500 bg-teal-50/50 dark:bg-teal-950/20">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded bg-teal-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-teal-700">WHL</span>
                        </div>
                        <h4 className="text-sm font-semibold text-teal-700 dark:text-teal-400">Wholesale Mode Settings</h4>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="size_display_format">Size Display Format</Label>
                        <Select
                          value={(settings.sale_settings as any)?.size_display_format || "size/qty"}
                          onValueChange={(value) =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                size_display_format: value as 'size/qty' | 'size×qty',
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
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="min_item_rows">Minimum Item Rows</Label>
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
                        <p className="text-xs text-muted-foreground">
                          Minimum empty rows to display in item table
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div className="flex items-center space-x-2">
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

                        <div className="flex items-center space-x-2">
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

                        <div className="flex items-center space-x-2">
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
                
                  {/* Invoice Customization Section */}
                  <div className="space-y-4 mt-6 pt-6 border-t">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                        <Paintbrush className="h-3.5 w-3.5 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold leading-none">Invoice Customization</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">Template, colors, fonts, logo, header &amp; footer</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="font_family">Font Family</Label>
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
                      <p className="text-xs text-muted-foreground">
                        Choose the font style for your invoices
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="logo_placement">Logo Placement</Label>
                      <Select
                        value={settings.sale_settings?.logo_placement || "left"}
                        onValueChange={(value) =>
                          setSettings({
                            ...settings,
                            sale_settings: {
                              ...settings.sale_settings,
                              logo_placement: value as 'left' | 'center' | 'right',
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
                      <p className="text-xs text-muted-foreground">
                        Position of your business logo on invoices
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="invoice_header_text">Custom Header Text</Label>
                      <Textarea
                        id="invoice_header_text"
                        value={settings.sale_settings?.invoice_header_text || ''}
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
                      <p className="text-xs text-muted-foreground">
                        Optional text to display at the top of invoices (max 200 chars)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="invoice_footer_text">Custom Footer Text</Label>
                      <Textarea
                        id="invoice_footer_text"
                        value={settings.sale_settings?.invoice_footer_text || ''}
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
                      <p className="text-xs text-muted-foreground">
                        Optional text to display at the bottom of invoices (max 200 chars)
                      </p>
                    </div>
                  </div>
                <div className="space-y-2">
                  <Label htmlFor="invoice_color_scheme">Invoice Color Scheme</Label>
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="declaration_text">Invoice Declaration Text</Label>
                  <Textarea
                    id="declaration_text"
                    value={settings.sale_settings?.declaration_text || 'Declaration: Composition taxable person, not eligible to collect tax on supplies.'}
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
                </div>

                <div className="space-y-2">
                  <Label>Invoice Terms & Conditions</Label>
                  <p className="text-xs text-muted-foreground">
                    Up to 6 terms shown on invoice & thermal receipt. Leave blank to hide.
                  </p>
                  <div className="space-y-2">
                    {(() => {
                      const MAX_TERMS = 6;
                      const existing = settings.sale_settings?.terms_list || [
                        'GOODS ONCE SOLD WILL NOT BE TAKEN BACK.',
                        'NO EXCHANGE WITHOUT BARCODE & BILL.',
                        'EXCHANGE TIME: 01:00 TO 04:00 PM.',
                        '', '', '',
                      ];
                      const padded = [...existing];
                      while (padded.length < MAX_TERMS) padded.push('');
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
                </div>

                {/* Invoice Display Options */}
                <div className="space-y-4 pt-6 border-t">
                  <h3 className="text-lg font-semibold">Invoice Display Options</h3>
                  <p className="text-sm text-muted-foreground">
                    Customize what information appears on your invoices
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
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

                    <div className="flex items-center space-x-2">
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

                    <div className="flex items-center space-x-2">
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

                    <div className="flex items-center space-x-2">
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

                    <div className="flex items-center space-x-2">
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
                </div>

                {/* Bank Details Section */}
                {settings.sale_settings?.show_bank_details && (
                  <div className="space-y-4 pt-6 border-t">
                    <h3 className="text-lg font-semibold">Bank Account Details</h3>
                    <p className="text-sm text-muted-foreground">
                      Bank details will appear on your invoices
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="bank_name">Bank Name</Label>
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
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="account_holder">Account Holder Name</Label>
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
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="account_number">Account Number</Label>
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
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="ifsc_code">IFSC Code</Label>
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
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="bank_branch">Branch Name</Label>
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
                      </div>
                    </div>
                  </div>
                )}

                {/* E-Invoice Settings Section */}
                <div className="space-y-4 pt-6 border-t">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">E-Invoice Settings (PeriOne API)</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Configure PeriOne e-Invoice integration for B2B invoices
                  </p>
                  
                  <div className="flex items-center space-x-2">
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
                    <div className="space-y-4 pl-6 border-l-2 border-primary/20">
                       {/* PeriOne API Credentials Section */}
                       <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                         <h4 className="font-medium flex items-center gap-2">
                           <Shield className="h-4 w-4" />
                           PeriOne API Credentials
                         </h4>
                         <p className="text-xs text-muted-foreground">
                           Enter your PeriOne API credentials. These are stored securely per organization.
                         </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="api_email">API Email</Label>
                             <Input
                              id="api_email"
                              type="email"
                              className="no-uppercase"
                              value={settings.sale_settings?.einvoice_settings?.api_email || ''}
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
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="api_username">Username / User ID</Label>
                            <Input
                              id="api_username"
                              className="no-uppercase"
                              value={settings.sale_settings?.einvoice_settings?.api_username || ''}
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
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="api_password">Password</Label>
                            <div className="relative">
                              <Input
                                id="api_password"
                                type={showApiPassword ? "text" : "password"}
                                className="no-uppercase pr-10"
                                value={settings.sale_settings?.einvoice_settings?.api_password || ''}
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
                              <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowApiPassword(!showApiPassword)}>
                                {showApiPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                              </Button>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="api_client_id">Client ID</Label>
                            <Input
                              id="api_client_id"
                              className="no-uppercase"
                              value={settings.sale_settings?.einvoice_settings?.api_client_id || ''}
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
                          </div>
                          
                          <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="api_client_secret">Client Secret</Label>
                            <div className="relative">
                              <Input
                                id="api_client_secret"
                                type={showClientSecret ? "text" : "password"}
                                value={settings.sale_settings?.einvoice_settings?.api_client_secret || ''}
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
                              <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowClientSecret(!showClientSecret)}>
                                {showClientSecret ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 pt-2">
                        <div className="flex items-center space-x-2">
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
                            <p className="text-xs text-muted-foreground">
                              Use PeriOne Sandbox environment for testing
                            </p>
                          </div>
                        </div>

                        {/* Seller GSTIN Override - only show when test mode is enabled */}
                        {settings.sale_settings?.einvoice_settings?.test_mode && (
                          <div className="space-y-2">
                            <Label htmlFor="seller_gstin_override">Seller GSTIN Override (Sandbox)</Label>
                            <Input
                              id="seller_gstin_override"
                              value={settings.sale_settings?.einvoice_settings?.seller_gstin || ''}
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
                            <p className="text-xs text-muted-foreground">
                              Use PeriOne sandbox GSTIN for testing. Leave empty to use your Business Details GSTIN.
                            </p>
                          </div>
                        )}

                        <div className="flex items-center space-x-2">
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
                              const response = await supabase.functions.invoke('test-einvoice-connection', {
                                body: { organizationId: currentOrganization?.id },
                              });
                              if (response.error) throw new Error(response.error.message);
                              const result = response.data;
                              setConnectionStatus({
                                success: result.success,
                                message: result.success ? result.message : result.error,
                              });
                            } catch (err: any) {
                              setConnectionStatus({ success: false, message: err.message || 'Connection test failed' });
                            } finally {
                              setIsTestingConnection(false);
                            }
                          }}
                          disabled={isTestingConnection}
                        >
                          {isTestingConnection ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
                          Test Connection
                        </Button>
                        {connectionStatus && (
                          <span className={`text-sm font-medium ${connectionStatus.success ? 'text-green-600' : 'text-destructive'}`}>
                            {connectionStatus.success ? '✅' : '❌'} {connectionStatus.message}
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

                {/* Customer Points System */}
                <div className="space-y-4 pt-6 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🎯</span>
                    <h3 className="text-lg font-semibold">Customer Points System</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Reward your customers with loyalty points based on their purchases
                  </p>
                  
                  <div className="flex items-center space-x-2">
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
                      <p className="text-xs text-muted-foreground">
                        When enabled, customers earn points on their purchases
                      </p>
                    </div>
                  </div>

                  {(settings.sale_settings as any)?.enable_points_system && (
                    <div className="space-y-4 pl-6 border-l-2 border-primary/20">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="points_ratio_amount">Amount per Point (₹)</Label>
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
                          <p className="text-xs text-muted-foreground">
                            Amount in rupees required to earn points
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="points_per_ratio">Points Awarded</Label>
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
                          <p className="text-xs text-muted-foreground">
                            Points earned per ratio amount
                          </p>
                        </div>
                      </div>

                      <div className="p-3 bg-primary/5 rounded-lg">
                        <p className="text-sm font-medium">
                          Example: ₹{(settings.sale_settings as any)?.points_ratio_amount || 100} purchase = {(settings.sale_settings as any)?.points_per_ratio || 1} point(s)
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Customer buying ₹2,500 worth of products will earn {Math.floor(2500 / ((settings.sale_settings as any)?.points_ratio_amount || 100)) * ((settings.sale_settings as any)?.points_per_ratio || 1)} points
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="points_rounding">Points Rounding</Label>
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
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="min_purchase_for_points">Minimum Purchase (₹)</Label>
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
                          <p className="text-xs text-muted-foreground">
                            Minimum invoice amount to earn points (0 = no minimum)
                          </p>
                        </div>
                      </div>

                      {/* Points Redemption Settings */}
                      <div className="space-y-4 pt-4 border-t border-dashed">
                        <h4 className="font-medium text-primary flex items-center gap-2">
                          <span>🎁</span> Points Redemption Settings
                        </h4>
                        
                        <div className="flex items-center space-x-2">
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
                          <div className="grid grid-cols-2 gap-4 pl-6 border-l-2 border-green-500/20">
                            <div className="space-y-2">
                              <Label htmlFor="points_redemption_value">1 Point = ₹</Label>
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
                              <p className="text-xs text-muted-foreground">
                                Rupee value of 1 point
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="max_redemption_percent">Max Redemption %</Label>
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
                              <p className="text-xs text-muted-foreground">
                                Max % of invoice payable via points
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="min_points_for_redemption">Min Points to Redeem</Label>
                              <Input
                                id="min_points_for_redemption"
                                type="number"
                                min="1"
                                value={(settings.sale_settings as any)?.min_points_for_redemption || 10}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    sale_settings: {
                                      ...settings.sale_settings,
                                      min_points_for_redemption: parseInt(e.target.value) || 10,
                                    } as any,
                                  })
                                }
                                placeholder="10"
                              />
                              <p className="text-xs text-muted-foreground">
                                Minimum points required to redeem
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="min_purchase_for_redemption">Min Purchase for Redemption (₹)</Label>
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
                              <p className="text-xs text-muted-foreground">
                                Min invoice amount for redemption (0 = no minimum)
                              </p>
                            </div>
                          </div>
                        )}

                        {(settings.sale_settings as any)?.enable_points_redemption && (
                          <div className="p-3 bg-green-500/5 rounded-lg border border-green-500/20">
                            <p className="text-sm font-medium text-green-700 dark:text-green-400">
                              Example: Customer with 100 points can redeem up to ₹{((settings.sale_settings as any)?.points_redemption_value || 1) * 100} discount
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              On ₹2,000 invoice, max redeemable: ₹{Math.floor(2000 * ((settings.sale_settings as any)?.max_redemption_percent || 50) / 100)} ({(settings.sale_settings as any)?.max_redemption_percent || 50}% limit)
                            </p>
                          </div>
                        )}

                        {/* Gift Rewards Management */}
                        <div className="pt-4 border-t border-dashed">
                          <GiftRewardsManagement />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                </CardContent>
              </Card>
              
              {/* Live Preview Panel */}
              <Card className="sticky top-6 h-fit">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Live Invoice Preview</CardTitle>
                      <CardDescription className="text-xs mt-1">Updates as you change settings</CardDescription>
                    </div>
                    {/* Format switcher buttons */}
                    <div className="flex gap-1">
                      {(['a4', 'a5-vertical', 'a5-horizontal', 'thermal'] as const).map(fmt => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                invoice_paper_format: fmt as any,
                              },
                            })
                          }
                          className={`px-2 py-1 text-[10px] font-semibold rounded border transition-colors
                            ${settings.sale_settings?.invoice_paper_format === fmt
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground border-border hover:border-primary'
                            }`}
                        >
                          {fmt === 'a5-vertical' ? 'A5↑'
                           : fmt === 'a5-horizontal' ? 'A5→'
                           : fmt === 'thermal' ? '80mm'
                           : 'A4'}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg p-4 bg-muted/50 overflow-auto max-h-[calc(100vh-200px)]">
                    <div
                      className="flex justify-center origin-top"
                      style={{
                        transform:
                          settings.sale_settings?.invoice_paper_format === 'thermal'
                            ? 'scale(0.9)'
                            : settings.sale_settings?.invoice_paper_format === 'a4'
                            ? 'scale(0.6)'
                            : 'scale(0.72)',
                        transformOrigin: 'top center',
                      }}
                    >
                      <InvoiceWrapper
                        billNo={sampleInvoiceData.billNo}
                        date={sampleInvoiceData.date}
                        customerName={sampleInvoiceData.customerName}
                        customerAddress={sampleInvoiceData.customerAddress}
                        customerMobile={sampleInvoiceData.customerMobile}
                        customerGSTIN={sampleInvoiceData.gstin}
                        items={sampleInvoiceData.items}
                        subTotal={sampleInvoiceData.subTotal}
                        discount={sampleInvoiceData.discount}
                        grandTotal={sampleInvoiceData.grandTotal}
                        tenderAmount={sampleInvoiceData.tenderAmount}
                        cashPaid={sampleInvoiceData.cashPaid}
                        refundCash={sampleInvoiceData.refundCash}
                        upiPaid={sampleInvoiceData.upiPaid}
                        paymentMethod="cash"
                        template={settings.sale_settings?.invoice_template}
                        colorScheme={settings.sale_settings?.invoice_color_scheme}
                        format={
                          settings.sale_settings?.invoice_paper_format === 'thermal'
                            ? 'thermal'
                            : (settings.sale_settings?.invoice_paper_format
                               || (settings.sale_settings?.sales_bill_format === 'a5' ? 'a5-vertical' : undefined)
                               || 'a4') as any
                        }
                        showHSN={settings.sale_settings?.show_hsn_code ?? true}
                        showBarcode={settings.sale_settings?.show_barcode ?? true}
                        showGSTBreakdown={settings.sale_settings?.show_gst_breakdown ?? true}
                        showBankDetails={settings.sale_settings?.show_bank_details ?? false}
                        showMRP={settings.sale_settings?.show_mrp_column ?? false}
                        minItemRows={(settings.sale_settings as any)?.min_item_rows}
                        showTotalQuantity={(settings.sale_settings as any)?.show_total_quantity}
                        amountWithDecimal={(settings.sale_settings as any)?.amount_with_decimal}
                        showReceivedAmount={(settings.sale_settings as any)?.show_received_amount}
                        showBalanceAmount={(settings.sale_settings as any)?.show_balance_amount}
                        showPartyBalance={(settings.sale_settings as any)?.show_party_balance}
                        showTaxDetails={(settings.sale_settings as any)?.show_tax_details}
                        showYouSaved={(settings.sale_settings as any)?.show_you_saved}
                        amountWithGrouping={(settings.sale_settings as any)?.amount_with_grouping}
                        customHeaderText={settings.sale_settings?.invoice_header_text}
                        customFooterText={settings.sale_settings?.invoice_footer_text}
                        logoPlacement={settings.sale_settings?.logo_placement}
                        fontFamily={settings.sale_settings?.font_family}
                        declarationText={settings.sale_settings?.declaration_text}
                        termsConditions={settings.sale_settings?.terms_list}
                        enableWholesaleMode={settings.sale_settings?.invoice_template === 'modern-wholesale'}
                        sizeDisplayFormat={(settings.sale_settings as any)?.size_display_format}
                        showProductColor={(settings.sale_settings as any)?.show_product_color}
                        showProductBrand={(settings.sale_settings as any)?.show_product_brand}
                        showProductStyle={(settings.sale_settings as any)?.show_product_style}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="bill">
            <Card>
              <CardHeader>
                <CardTitle>Bill & Barcode Settings</CardTitle>
                <CardDescription>
                  Configure billing and barcode preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="upi_id">UPI ID</Label>
                  <Input
                    id="upi_id"
                    value={settings.bill_barcode_settings?.upi_id || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        bill_barcode_settings: {
                          ...settings.bill_barcode_settings,
                          upi_id: e.target.value,
                        },
                      })
                    }
                    placeholder="e.g., yourname@paytm"
                  />
                  <p className="text-xs text-muted-foreground">
                    UPI ID for payment QR code on invoice
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">
                    DC Invoice UPI ID
                    <span className="text-xs font-normal text-muted-foreground">
                      Personal account for DC/cash invoices
                    </span>
                  </Label>
                  <Input
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
                    placeholder="personal@upi  (leave blank to use Company UPI ID)"
                    className="font-mono"
                  />
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    ⚠️ This UPI ID will appear on DC purchase invoices only.
                    Keep your personal account separate from business account.
                  </p>
                  {settings.bill_barcode_settings?.dc_upi_id ? (
                    <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1 flex items-center gap-1">
                      ✅ DC invoices will use: <span className="font-mono font-bold">
                        {settings.bill_barcode_settings.dc_upi_id}
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">
                      DC invoices will use company UPI: {settings.bill_barcode_settings?.upi_id || 'not set'}
                    </div>
                  )}
                </div>
                
                {/* Social Media Links for WhatsApp */}
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="text-sm font-semibold">Social Media Links (for WhatsApp Messages)</h4>
                  <p className="text-xs text-muted-foreground">
                    These links will be available as placeholders in WhatsApp message templates
                  </p>
                  
                  <div className="space-y-2">
                    <Label htmlFor="instagram_link">Instagram Link</Label>
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
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="website_link">Website Link</Label>
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
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="google_review_link">Google Review Link</Label>
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
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Invoice header/footer text is configured in the Sale tab → Invoice Customization section</p>
                <div className="space-y-2">
                  <Label htmlFor="barcode_format">Default Barcode Label Format (for Direct Printing)</Label>
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
                      <SelectItem value="a4_12x4">A4 12x4 (4 cols, 50x24mm)</SelectItem>
                    </SelectContent>
                  </Select>
                   <p className="text-xs text-muted-foreground">Used when printing barcodes directly from Purchase Bills</p>
                   <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestPrintBarcodes}
                    className="mt-2"
                   >
                     <Eye className="h-4 w-4 mr-2" />
                     Test Print Preview
                   </Button>
                 </div>
                 <div className="space-y-2">
                   <Label htmlFor="barcode_digits">Barcode Digit Length</Label>
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
                    <p className="text-xs text-muted-foreground">Starting digit length for barcodes. Auto-scales to next digit when series is full (e.g. 8→9→10).</p>
                 </div>

                {/* Enable/Disable Barcode Prompt after Purchase Save */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="enable_barcode_prompt" className="cursor-pointer">
                      Show Barcode Print Prompt After Purchase Save
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      When enabled, a dialog will appear after saving a purchase bill asking if you want to print barcode labels
                    </p>
                  </div>
                  <Switch
                    id="enable_barcode_prompt"
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

                {/* Cash Drawer Settings */}
                <Card className="border-dashed">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      💵 Cash Drawer Settings
                    </CardTitle>
                    <CardDescription>
                      Configure automatic cash drawer opening after POS receipt printing
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="enable_cash_drawer" className="cursor-pointer">
                          Open Cash Drawer After Print
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Automatically opens the cash drawer after printing a POS receipt
                        </p>
                      </div>
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
                    </div>

                    {settings.bill_barcode_settings?.enable_cash_drawer && (
                      <>
                        <div className="space-y-2">
                          <Label>Drawer Pin</Label>
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
                            <SelectTrigger>
                              <SelectValue placeholder="Select drawer pin" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pin2">Pin 2 (Most common - RUGTEK)</SelectItem>
                              <SelectItem value="pin5">Pin 5 (Alternative)</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Most cash drawers including RUGTEK use Pin 2. Try Pin 5 if drawer doesn't open.
                          </p>
                        </div>

                        <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-2">
                          <p className="font-medium">Setup Requirements:</p>
                          <ul className="list-disc list-inside text-muted-foreground space-y-1">
                            <li>QZ Tray must be installed on the POS computer</li>
                            <li>Cash drawer connected to thermal printer via RJ11/RJ12 cable</li>
                            <li>Thermal printer must support ESC/POS commands</li>
                          </ul>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* USB Receipt Printing — Windows Reality Check */}
                <Card className="border-dashed">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      🖨️ Direct Bill Printing — Setup Guide
                    </CardTitle>
                    <CardDescription>
                      Print receipts instantly without browser print dialog
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-3 bg-destructive/10 rounded-lg space-y-1.5">
                      <p className="text-sm font-medium text-destructive">⚠️ Why "Connect USB Printer" shows Access Denied</p>
                      <p className="text-xs text-muted-foreground">
                        Windows installs a printer driver the moment you plug in a USB thermal printer.
                        That driver blocks direct USB access from the browser — this is a Windows
                        security design and cannot be bypassed in code. This affects all browsers
                        including Chrome and Edge.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">✅ Correct Solution — QZ Tray (Free, works with all printers)</p>
                      <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1.5">
                        <li>Download QZ Tray from qz.io/download — free, 8MB install</li>
                        <li>Run the installer — it starts automatically with Windows</li>
                        <li>Come back to Settings → scroll to "Direct Printing (QZ Tray)" below</li>
                        <li>Click "Detect Printers" → select your thermal printer</li>
                        <li>Enable "Auto Print After Save" — bills print instantly, no dialog</li>
                      </ol>
                      <p className="text-xs text-muted-foreground mt-2">
                        QZ Tray works WITH the Windows printer driver, not around it.
                        It handles Epson TM-T82, TVS RP3200, Sam4s Ellix, Rugtek RP76 and all standard thermal printers.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">Comparison:</p>
                      <div className="grid grid-cols-4 gap-1 text-xs">
                        <div className="font-medium p-1.5 bg-muted rounded">Method</div>
                        <div className="font-medium p-1.5 bg-muted rounded">Works on Windows</div>
                        <div className="font-medium p-1.5 bg-muted rounded">Setup required</div>
                        <div className="p-1.5"></div>
                        <div className="p-1.5">Browser print</div>
                        <div className="p-1.5">✅ Always</div>
                        <div className="p-1.5">None</div>
                        <div className="p-1.5"></div>
                        <div className="p-1.5">QZ Tray</div>
                        <div className="p-1.5">✅ Yes</div>
                        <div className="p-1.5">8MB install</div>
                        <div className="p-1.5"></div>
                        <div className="p-1.5">WebUSB</div>
                        <div className="p-1.5">❌ Blocked by driver</div>
                        <div className="p-1.5">Remove printer driver</div>
                        <div className="p-1.5"></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Direct Printing (QZ Tray) Settings */}
                <Card className="border-dashed">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 justify-between">
                      <span className="flex items-center gap-2">
                        🖨️ Direct Printing (QZ Tray)
                      </span>
                      <QZStatusBadge />
                    </CardTitle>
                    <CardDescription>
                      Print invoices directly to thermal or laser printers without browser print dialog
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="enable_direct_print" className="cursor-pointer">
                          Enable Direct Printing
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Send invoices directly to printer via QZ Tray (no print preview dialog)
                        </p>
                      </div>
                      <Switch
                        id="enable_direct_print"
                        checked={settings.bill_barcode_settings?.enable_direct_print === true}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            bill_barcode_settings: {
                              ...settings.bill_barcode_settings,
                              enable_direct_print: checked,
                            },
                          })
                        }
                      />
                    </div>

                    {settings.bill_barcode_settings?.enable_direct_print && (
                      <>
                        <div className="space-y-2">
                          <Label>Sale Invoice Printer</Label>
                          <Select
                            value={settings.bill_barcode_settings?.direct_print_sale_printer || ''}
                            onValueChange={(value) =>
                              setSettings({
                                ...settings,
                                bill_barcode_settings: {
                                  ...settings.bill_barcode_settings,
                                  direct_print_sale_printer: value,
                                },
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Click 'Detect Printers' first, then select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {detectedPrinters.map(p => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                              ))}
                              {detectedPrinters.length === 0 && (
                                <div className="p-2 text-sm text-muted-foreground">No printers detected. Click "Detect Printers" below.</div>
                              )}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Printer for Sale Invoice (A4/A5). Detect printers first, then select.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label>Sale Invoice Paper Size</Label>
                          <Select
                            value={settings.bill_barcode_settings?.direct_print_sale_paper || 'A4'}
                            onValueChange={(value) =>
                              setSettings({
                                ...settings,
                                bill_barcode_settings: {
                                  ...settings.bill_barcode_settings,
                                  direct_print_sale_paper: value as any,
                                },
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="A4">A4 (210×297mm) — Laser / Inkjet</SelectItem>
                              <SelectItem value="A5">A5 (148×210mm) — Laser / Inkjet</SelectItem>
                              <SelectItem value="80mm">80mm Thermal Roll</SelectItem>
                              <SelectItem value="58mm">58mm Thermal Roll</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>POS Printer</Label>
                          <Select
                            value={settings.bill_barcode_settings?.direct_print_pos_printer || ''}
                            onValueChange={(value) =>
                              setSettings({
                                ...settings,
                                bill_barcode_settings: {
                                  ...settings.bill_barcode_settings,
                                  direct_print_pos_printer: value,
                                },
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Click 'Detect Printers' first, then select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {detectedPrinters.map(p => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                              ))}
                              {detectedPrinters.length === 0 && (
                                <div className="p-2 text-sm text-muted-foreground">No printers detected. Click "Detect Printers" below.</div>
                              )}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Printer for POS billing (thermal 80mm/58mm). Supports shared printers (e.g., \\PC-NAME\PrinterShare).
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label>POS Printer Paper Size</Label>
                          <Select
                            value={settings.bill_barcode_settings?.direct_print_pos_paper || '80mm'}
                            onValueChange={(value) =>
                              setSettings({
                                ...settings,
                                bill_barcode_settings: {
                                  ...settings.bill_barcode_settings,
                                  direct_print_pos_paper: value as any,
                                },
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="80mm">80mm Thermal Roll</SelectItem>
                              <SelectItem value="58mm">58mm Thermal Roll</SelectItem>
                              <SelectItem value="A4">A4 (210×297mm) — Laser / Inkjet</SelectItem>
                              <SelectItem value="A5">A5 (148×210mm) — Laser / Inkjet</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label htmlFor="direct_print_auto" className="cursor-pointer">
                              Auto Print After Save
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Automatically print invoice after saving (skip print confirmation dialog)
                            </p>
                          </div>
                          <Switch
                            id="direct_print_auto"
                            checked={settings.bill_barcode_settings?.direct_print_auto_print === true}
                            onCheckedChange={(checked) =>
                              setSettings({
                                ...settings,
                                bill_barcode_settings: {
                                  ...settings.bill_barcode_settings,
                                  direct_print_auto_print: checked,
                                },
                              })
                            }
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label htmlFor="direct_print_copies">Print Copies</Label>
                            <p className="text-xs text-muted-foreground">
                              Number of copies to print per invoice
                            </p>
                          </div>
                          <input
                            id="direct_print_copies"
                            type="number"
                            min={1}
                            max={5}
                            className="w-16 h-9 border rounded-md text-center text-sm"
                            value={settings.bill_barcode_settings?.direct_print_copies || 1}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                bill_barcode_settings: {
                                  ...settings.bill_barcode_settings,
                                  direct_print_copies: Math.max(1, Math.min(5, Number(e.target.value))),
                                },
                              })
                            }
                          />
                        </div>

                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const { getQZPrinters } = await import('@/utils/directInvoicePrint');
                              const printers = await getQZPrinters();
                              if (printers.length === 0) {
                                toast({
                                  title: "No Printers Found",
                                  description: "Make sure QZ Tray app is running on this computer (system tray). Download from qz.io/download if not installed.",
                                  variant: "destructive",
                                });
                              } else {
                                setDetectedPrinters(printers);
                                toast({
                                  title: `${printers.length} Printer(s) Detected`,
                                  description: "Select your printers from the dropdowns above.",
                                });
                              }
                            }}
                          >
                            🔍 Detect Printers
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const { printTestReceipt } = await import('@/utils/directInvoicePrint');
                              const printer = settings.bill_barcode_settings?.direct_print_pos_printer 
                                || settings.bill_barcode_settings?.direct_print_sale_printer;
                              if (!printer) {
                                toast({
                                  title: "No Printer Set",
                                  description: "Please enter a printer name first",
                                  variant: "destructive",
                                });
                                return;
                              }
                              const paper = (settings.bill_barcode_settings?.direct_print_pos_paper
                                || settings.bill_barcode_settings?.direct_print_sale_paper
                                || 'A4') as '58mm' | '80mm' | 'A4' | 'A5';
                              const success = await printTestReceipt(printer, paper);
                              if (success) {
                                toast({ title: "Test Print Sent", description: "Check your printer for the test receipt" });
                              }
                            }}
                          >
                            🧪 Test Print
                          </Button>
                        </div>

                        <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-2">
                          <p className="font-medium">Setup Requirements:</p>
                          <ul className="list-disc list-inside text-muted-foreground space-y-1">
                            <li>
                              <strong>Step 1:</strong> Install QZ Tray on this PC — {' '}
                              <a href="https://qz.io/download/" target="_blank" 
                                 rel="noopener noreferrer" className="text-primary underline">
                                Download QZ Tray
                              </a>
                            </li>
                            <li><strong>Step 2:</strong> Launch QZ Tray — it runs in the system tray</li>
                            <li><strong>Step 3:</strong> Click "Detect Printers" above — select your printers</li>
                            <li><strong>Step 4:</strong> Choose correct paper size per printer</li>
                            <li><strong>Step 5:</strong> Click "Test Print" to verify</li>
                            <li>First connection will show a QZ Tray approval popup — click <em>Allow</em></li>
                            <li>Thermal printers: select 80mm or 58mm paper size</li>
                            <li>Laser/Inkjet printers: select A4 or A5 paper size</li>
                            <li>Shared network printers are also supported</li>
                          </ul>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>


                {/* ═══ All Org Label Designs ═══ */}
                {allOrgPresets.length > 0 && (
                  <div className="space-y-3 pt-4 border-t">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <Copy className="h-4 w-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold leading-none">Label Designs from All Your Shops</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Reuse calibrated label designs from your other organizations — import in one click
                        </p>
                      </div>
                    </div>

                    {Array.from(
                      allOrgPresets.reduce((map, item) => {
                        if (!map.has(item.orgId)) map.set(item.orgId, {
                          orgName: item.orgName,
                          presets: [],
                          isCurrent: item.orgId === currentOrganization?.id
                        });
                        map.get(item.orgId)!.presets.push(item);
                        return map;
                      }, new Map<string, { orgName: string; presets: typeof allOrgPresets; isCurrent: boolean }>())
                    ).map(([orgId, group]) => (
                      <div key={orgId} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${group.isCurrent ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            {group.isCurrent ? '● Current Shop' : group.orgName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {group.presets.length} design{group.presets.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {group.presets.map((item) => {
                            const p = item.preset;
                            const isCurrentOrg = item.orgId === currentOrganization?.id;
                            const alreadyImported = settingsDbPresets.some(
                              sp => sp.name === p.name && sp.width === p.width && sp.height === p.height
                            );
                            const isImporting = importingPresetId === (p.id || p.name);

                            return (
                              <div
                                key={p.id || p.name}
                                className={`flex items-start justify-between p-3 rounded-lg border bg-card gap-3 ${alreadyImported && !isCurrentOrg ? 'opacity-60 border-dashed' : ''}`}
                              >
                                <div className="flex gap-2.5 min-w-0">
                                  <div className={`flex-shrink-0 rounded border-2 ${p.printMode === 'a4' ? 'border-violet-300 bg-violet-50 w-8 h-10' : 'border-teal-300 bg-teal-50 w-10 h-6'} flex items-center justify-center mt-0.5`}>
                                    <span className="text-[8px] font-bold text-muted-foreground">
                                      {p.printMode === 'a4' ? 'A4' : '🖨'}
                                    </span>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{p.name}</p>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${p.printMode === 'a4' ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>
                                        {p.printMode === 'a4' ? 'Laser/A4' : 'Thermal'}
                                      </span>
                                      <span className="text-[9px] bg-slate-50 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-full font-mono">
                                        {p.width}×{p.height}mm
                                      </span>
                                      {p.printMode === 'a4' && p.a4Cols && p.a4Rows && (
                                        <span className="text-[9px] bg-slate-50 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-full">
                                          {p.a4Cols}×{p.a4Rows} grid
                                        </span>
                                      )}
                                      {p.labelConfig && (
                                        <span className="text-[9px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full">
                                          ✓ Design saved
                                        </span>
                                      )}
                                      {(p.xOffset !== 0 || p.yOffset !== 0) && (
                                        <span className="text-[9px] bg-orange-50 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded-full font-mono">
                                          ±{p.xOffset},{p.yOffset} offset
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {!isCurrentOrg && (
                                  <Button
                                    type="button"
                                    variant={alreadyImported ? 'ghost' : 'outline'}
                                    size="sm"
                                    disabled={isImporting}
                                    onClick={() => handleImportPreset(item)}
                                    className="flex-shrink-0 h-8 text-xs"
                                  >
                                    {isImporting ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : alreadyImported ? (
                                      <>
                                        <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
                                        Imported
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-3 w-3 mr-1" />
                                        Import
                                      </>
                                    )}
                                  </Button>
                                )}
                                {isCurrentOrg && (
                                  <span className="text-[10px] text-muted-foreground flex-shrink-0 self-center">
                                    This shop
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground h-7"
                      onClick={fetchAllOrgPresets}
                    >
                      <RefreshCw className="h-3 w-3 mr-1.5" />
                      Refresh designs
                    </Button>
                  </div>
                )}

                {allOrgPresets.length === 0 && organizations.length <= 1 && (
                  <div className="pt-4 border-t">
                    <div className="rounded-lg border border-dashed p-4 text-center">
                      <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center mx-auto mb-2">
                        <Copy className="h-4 w-4 text-slate-400" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">No other shops to copy from</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Once you create or join another shop, its label designs will appear here for reuse.
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Custom Barcode Templates</Label>
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
                              <option value="a4_12x4">A4 12x4 (4 cols, 50x24mm)</option>
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
                  </div>
                  
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
                              {template.sheetType === 'a4_12x4' && 'A4 12x4 (4 cols, 50x24mm)'}
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

                {/* Authorised Stamp / Signature Section */}
                <div className="pt-6 border-t">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-7 w-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                      <Pencil className="h-3.5 w-3.5 text-indigo-700 dark:text-indigo-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Authorised Stamp / Signature</p>
                      <p className="text-xs text-muted-foreground">Upload a stamp or signature image that appears on invoices</p>
                    </div>
                  </div>

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

                {/* Cheque Printing Section */}
                <div className="pt-6 border-t">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center">
                      <FileText className="h-3.5 w-3.5 text-amber-700" />
                    </div>
                    <div><p className="text-sm font-semibold">Cheque Printing Format</p><p className="text-xs text-muted-foreground">Configure cheque layout for payment vouchers</p></div>
                  </div>
                  <ChequeFormatManagement />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <CardTitle>Report Settings</CardTitle>
                <CardDescription>
                  Configure report preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Report column customization coming soon</p>
                  <p className="text-xs mt-1">Use the Stock Adjustment and Reconciliation tools below</p>
                </div>
              </CardContent>
            </Card>

            {/* Stock Adjustment Tool */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Stock Adjustment Tool</CardTitle>
                <CardDescription>
                  Correct opening quantities while accounting for purchases and sales
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Use this tool to adjust opening stock quantities when test data needs to be corrected. 
                  It automatically calculates the correct stock based on: New Stock = New Opening + Purchases - Sales + Returns
                </p>
                <Button onClick={() => navigate("/stock-adjustment")}>
                  Open Stock Adjustment Tool
                </Button>
              </CardContent>
            </Card>

            {/* Stock Reconciliation Tool */}
            <div className="mt-6">
              <StockReconciliation />
            </div>

            {/* Customer Balance Reconciliation */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Customer Balance Reconciliation</CardTitle>
                <CardDescription>
                  Cross-verify customer balances from raw transactions vs ledger display
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => navigate("/customer-reconciliation")}>
                  🔍 Reconcile Customer Balances
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>User Rights Management</CardTitle>
                <CardDescription>
                  Manage user roles and configure granular permissions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="border rounded-lg p-4 bg-muted/50">
                  <h3 className="font-medium mb-2">Configure User Permissions</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Set granular permissions for each user including menu access, special rights like modify, delete, WhatsApp, accounting, delivery module, and dashboard customization.
                  </p>
                  <Button onClick={() => navigate("/user-rights")}>
                    <Shield className="h-4 w-4 mr-2" />
                    Manage User Rights
                  </Button>
                </div>
                <UserManagement />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="whatsapp">
            <Card>
              <CardHeader>
                <CardTitle>WhatsApp Integration</CardTitle>
                <CardDescription>
                  Configure WhatsApp Business API and message templates
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <WhatsAppAPISettings />
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold mb-4">Message Templates</h3>
                  <WhatsAppTemplateSettings />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="backup">
            <BackupSettings />
          </TabsContent>

          <TabsContent value="payment">
            <PaymentGatewaySettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
