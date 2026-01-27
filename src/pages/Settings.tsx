import { useState, useEffect } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Home, Save, Eye, Shield } from "lucide-react";
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

interface ProductSettings {
  default_margin?: number;
  low_stock_threshold?: number;
  sku_format?: string;
  default_size_group?: string;
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
  purchase_code_alphabet?: string;
  show_purchase_code?: boolean;
  show_mrp?: boolean;
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
  invoice_paper_format?: 'a5-vertical' | 'a5-horizontal' | 'a4';  // Paper size
  sales_bill_format?: 'a4' | 'a5' | 'thermal';  // Sales bill format
  pos_bill_format?: 'a4' | 'a5' | 'a5-horizontal' | 'thermal';  // POS bill format
  defaultEntryMode?: 'grid' | 'inline';  // Default entry mode for Sale Order
  sales_tax_rate?: number;
  invoice_template?: 'professional' | 'modern' | 'modern-wholesale' | 'classic' | 'minimal' | 'compact' | 'detailed' | 'tax-invoice' | 'retail';
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
  invoice_format?: string;
  show_product_details?: boolean;
  barcode_format?: string;
  brand_color?: string;
  login_display_name?: string;
  instagram_link?: string;
  website_link?: string;
  google_review_link?: string;
  enable_barcode_prompt?: boolean;  // Enable/disable barcode print prompt after purchase save
  // Cash Drawer Settings
  enable_cash_drawer?: boolean;  // Enable/disable auto cash drawer open after POS print
  cash_drawer_printer?: string;  // Printer name where cash drawer is connected
  cash_drawer_pin?: 'pin2' | 'pin5';  // Drawer kick pin (most use pin2)
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
  email_id?: string;
  gst_number?: string;
  product_settings?: ProductSettings;
  purchase_settings?: PurchaseSettings;
  sale_settings?: SaleSettings;
  bill_barcode_settings?: BillBarcodeSettings;
  report_settings?: ReportSettings;
}

export default function Settings() {
  const { orgNavigate: navigate } = useOrgNavigation();
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [sizeGroups, setSizeGroups] = useState<any[]>([]);
  const [showApiPassword, setShowApiPassword] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    business_name: "",
    address: "",
    mobile_number: "",
    email_id: "",
    gst_number: "",
    product_settings: {},
    purchase_settings: {},
    sale_settings: {},
    bill_barcode_settings: {},
    report_settings: {},
  });

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


  useEffect(() => {
    if (currentOrganization?.id) {
      fetchSettings();
      fetchSizeGroups();
    }
  }, [currentOrganization?.id]);

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
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
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
          <TabsList className="grid w-full grid-cols-6 lg:grid-cols-12">
            <TabsTrigger value="company">Company</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="product">Product</TabsTrigger>
            <TabsTrigger value="purchase">Purchase</TabsTrigger>
            <TabsTrigger value="sale">Sale</TabsTrigger>
            <TabsTrigger value="bill">Bill & Barcode</TabsTrigger>
            <TabsTrigger value="payment">Payment</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="users">User Rights</TabsTrigger>
            <TabsTrigger value="sms">SMS</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="backup">Backup</TabsTrigger>
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

            {/* WhatsApp Templates Section */}
            <div className="mt-6">
              <WhatsAppTemplateSettings />
            </div>
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
                  <select
                    id="payment_terms"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={settings.purchase_settings?.payment_terms || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        purchase_settings: {
                          ...settings.purchase_settings,
                          payment_terms: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="">Select payment terms</option>
                    <option value="immediate">Immediate</option>
                    <option value="net15">Net 15</option>
                    <option value="net30">Net 30</option>
                    <option value="net45">Net 45</option>
                    <option value="net60">Net 60</option>
                    <option value="net90">Net 90</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="auto_approve_threshold">Auto-Approve Threshold Amount</Label>
                  <Input
                    id="auto_approve_threshold"
                    type="number"
                    min="0"
                    step="0.01"
                    value={settings.purchase_settings?.auto_approve_threshold || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        purchase_settings: {
                          ...settings.purchase_settings,
                          auto_approve_threshold: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                    placeholder="e.g., 10000"
                  />
                  <p className="text-xs text-muted-foreground">
                    Purchase orders below this amount will be auto-approved
                  </p>
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
                
                <div className="space-y-2">
                  <Label htmlFor="purchase_code_alphabet">Purchase Code Alphabet (0-9 mapping)</Label>
                  <Input
                    id="purchase_code_alphabet"
                    value={settings.purchase_settings?.purchase_code_alphabet || "ABCDEFGHIK"}
                    onChange={(e) => {
                      const value = e.target.value.toUpperCase();
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
                    Enter 10 unique letters (A-Z). First letter = 0, Second = 1, ... Tenth = 9. 
                    Example: ABCDEFGHIK means 100 = BAA
                  </p>
                  {settings.purchase_settings?.purchase_code_alphabet &&
                    !validatePurchaseCodeAlphabet(settings.purchase_settings.purchase_code_alphabet) && (
                      <p className="text-xs text-destructive">
                        Invalid alphabet: Must be exactly 10 unique uppercase letters (A-Z)
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
              </CardContent>
            </Card>
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
                  <Label htmlFor="min_rows">Min No. of Rows in Item Table</Label>
                  <Input
                    id="min_rows"
                    type="number"
                    min="1"
                    max="50"
                    value={(settings.sale_settings as any)?.min_item_rows || 12}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        sale_settings: {
                          ...settings.sale_settings,
                          min_item_rows: parseInt(e.target.value) || 12,
                        } as any,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum number of rows to display in the item table
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

                <div className="space-y-2">
                  <Label htmlFor="invoice_paper_format">Invoice Paper Format</Label>
                  <Select
                    value={settings.sale_settings?.invoice_paper_format || "a5-vertical"}
                    onValueChange={(value) =>
                      setSettings({
                        ...settings,
                        sale_settings: {
                          ...settings.sale_settings,
                          invoice_paper_format: value as 'a5-vertical' | 'a5-horizontal' | 'a4',
                        },
                      })
                    }
                  >
                    <SelectTrigger id="invoice_paper_format">
                      <SelectValue placeholder="Select paper format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="a5-vertical">A5 Vertical (148mm × 210mm) - Most common</SelectItem>
                      <SelectItem value="a5-horizontal">A5 Horizontal (210mm × 148mm) - Landscape</SelectItem>
                      <SelectItem value="a4">A4 Full (210mm × 297mm) - Professional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-4 pt-4 border-t">
                  <h3 className="text-lg font-semibold">Bill Format Settings</h3>
                  <p className="text-sm text-muted-foreground">Configure print formats for sales and POS</p>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
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
                    <div>
                      <Label htmlFor="show_invoice_preview" className="font-normal cursor-pointer">
                        Enable Invoice Preview
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        When enabled, shows a preview dialog before printing. When disabled, directly opens the print dialog.
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="sales_bill_format">Sales Invoice Bill Format</Label>
                    <Select
                      value={settings.sale_settings?.sales_bill_format || "a4"}
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          sale_settings: {
                            ...settings.sale_settings,
                            sales_bill_format: value as 'a4' | 'a5' | 'thermal',
                          },
                        })
                      }
                    >
                      <SelectTrigger id="sales_bill_format">
                        <SelectValue placeholder="Select format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="a4">A4 (210mm × 297mm)</SelectItem>
                        <SelectItem value="a5">A5 (148mm × 210mm)</SelectItem>
                        <SelectItem value="thermal">Thermal (80mm)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Default format for sales invoice printing
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="pos_bill_format">POS Bill Format</Label>
                    <Select
                      value={settings.sale_settings?.pos_bill_format || "thermal"}
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          sale_settings: {
                            ...settings.sale_settings,
                            pos_bill_format: value as 'a4' | 'a5' | 'a5-horizontal' | 'thermal',
                          },
                        })
                      }
                    >
                      <SelectTrigger id="pos_bill_format">
                        <SelectValue placeholder="Select format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="thermal">Thermal (80mm) - Most common</SelectItem>
                        <SelectItem value="a5">A5 Vertical (148mm × 210mm)</SelectItem>
                        <SelectItem value="a5-horizontal">A5 Horizontal (210mm × 148mm)</SelectItem>
                        <SelectItem value="a4">A4 (210mm × 297mm)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Default format for POS printing (Thermal recommended)
                    </p>
                  </div>
                </div>

                {/* Item Details Display Settings */}
                <div className="space-y-4 pt-4 border-t">
                  <h3 className="text-lg font-semibold">Item Details Display</h3>
                  <p className="text-sm text-muted-foreground">Configure which product fields to show on bills and dashboards</p>
                  
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
                            invoice_template: value as 'professional' | 'modern' | 'modern-wholesale' | 'classic' | 'minimal' | 'compact' | 'detailed' | 'tax-invoice' | 'retail',
                          },
                        })
                      }
                    >
                      <SelectTrigger id="invoice_template">
                        <SelectValue placeholder="Select template" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Professional - Detailed business style</SelectItem>
                        <SelectItem value="modern">Modern - Clean gradient design</SelectItem>
                        <SelectItem value="modern-wholesale">Modern Wholesale - Size grouping for bulk</SelectItem>
                        <SelectItem value="classic">Classic - Traditional receipt</SelectItem>
                        <SelectItem value="minimal">Minimal - Simple & elegant</SelectItem>
                        <SelectItem value="compact">Compact - Space-saving layout</SelectItem>
                        <SelectItem value="detailed">Detailed - Comprehensive info</SelectItem>
                        <SelectItem value="tax-invoice">Tax Invoice - GST compliant</SelectItem>
                        <SelectItem value="retail">Retail Invoice - Fixed ERP style</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Modern Wholesale is optimized for bulk orders with size grouping (e.g., 38/2, 40/3, 42/1)
                    </p>
                  </div>

                  {/* Wholesale Mode Settings - Show when Modern Wholesale template is selected */}
                  {settings.sale_settings?.invoice_template === 'modern-wholesale' && (
                    <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
                      <h4 className="text-sm font-semibold text-primary">Wholesale Mode Settings</h4>
                      
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
                          value={(settings.sale_settings as any)?.min_item_rows || 8}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                min_item_rows: parseInt(e.target.value) || 8,
                              },
                            })
                          }
                          placeholder="8"
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
                    <h3 className="text-lg font-semibold">Invoice Customization</h3>
                    <p className="text-sm text-muted-foreground">Customize invoice appearance and branding</p>
                    
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
                  <div className="space-y-2">
                    {(settings.sale_settings?.terms_list || [
                      'GOODS ONCE SOLD WILL NOT BE TAKEN BACK.',
                      'NO EXCHANGE WITHOUT BARCODE & BILL.',
                      'EXCHANGE TIME: 01:00 TO 04:00 PM.'
                    ]).map((term, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={term}
                          onChange={(e) => {
                            const newTerms = [...(settings.sale_settings?.terms_list || [])];
                            newTerms[index] = e.target.value;
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                terms_list: newTerms,
                              },
                            });
                          }}
                          placeholder={`Term ${index + 1}`}
                        />
                      </div>
                    ))}
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
                    </div>
                  </div>
                )}

                {/* E-Invoice Settings Section */}
                <div className="space-y-4 pt-6 border-t">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">E-Invoice Settings (WhiteBooks API)</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Configure WhiteBooks e-Invoice integration for B2B invoices
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
                        When enabled, allows generating IRN for B2B invoices via WhiteBooks API
                      </p>
                    </div>
                  </div>

                  {settings.sale_settings?.einvoice_settings?.enabled && (
                    <div className="space-y-4 pl-6 border-l-2 border-primary/20">
                      {/* WhiteBooks API Credentials Section */}
                      <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                        <h4 className="font-medium flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          WhiteBooks API Credentials
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Enter your WhiteBooks API credentials. These are stored securely per organization.
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="api_email">API Email</Label>
                            <Input
                              id="api_email"
                              type="email"
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
                              placeholder="user@whitebooks.in"
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="api_username">Username / User ID</Label>
                            <Input
                              id="api_username"
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
                            <Input
                              id="api_password"
                              type="password"
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
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="api_client_id">Client ID</Label>
                            <Input
                              id="api_client_id"
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
                            <Input
                              id="api_client_secret"
                              type="password"
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
                              className="font-mono"
                            />
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
                              Use WhiteBooks Sandbox environment for testing
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
                              Use WhiteBooks sandbox GSTIN for testing. Leave empty to use your Business Details GSTIN.
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

                      <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm">
                        <p className="font-medium text-muted-foreground mb-1">⚠️ Important Notes:</p>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs">
                          <li>API credentials are stored securely per organization</li>
                          <li>Ensure seller GSTIN is configured in Business Settings above</li>
                          <li>E-Invoice is mandatory for turnover {">"} ₹5 Crore</li>
                          <li>Test in Sandbox mode before going live</li>
                          <li>Customer must have a valid GSTIN for B2B e-Invoice</li>
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
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    Live Invoice Preview
                  </CardTitle>
                  <CardDescription>
                    See real-time changes as you customize
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg p-4 bg-muted/50 overflow-auto max-h-[calc(100vh-200px)]">
                    <div className="flex justify-center scale-75 origin-top">
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
                        format={settings.sale_settings?.invoice_paper_format}
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
                  <Label htmlFor="logo_upload">Company Logo</Label>
                  {settings.bill_barcode_settings?.logo_url && (
                    <div className="mb-2">
                      <img
                        src={settings.bill_barcode_settings.logo_url}
                        alt="Company Logo"
                        className="h-20 w-auto object-contain border rounded p-2"
                      />
                    </div>
                  )}
                  <Input
                    id="logo_upload"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                  />
                  <p className="text-xs text-muted-foreground">
                    Upload your company logo (max 2MB, JPG/PNG)
                  </p>
                </div>
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
                <div className="space-y-2">
                  <Label htmlFor="header_text">Bill Header Text</Label>
                  <Textarea
                    id="header_text"
                    value={settings.bill_barcode_settings?.header_text || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        bill_barcode_settings: {
                          ...settings.bill_barcode_settings,
                          header_text: e.target.value,
                        },
                      })
                    }
                    placeholder="e.g., Thank you for your business!"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="footer_text">Bill Footer Text</Label>
                  <Textarea
                    id="footer_text"
                    value={settings.bill_barcode_settings?.footer_text || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        bill_barcode_settings: {
                          ...settings.bill_barcode_settings,
                          footer_text: e.target.value,
                        },
                      })
                    }
                    placeholder="e.g., Terms and conditions apply"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="barcode_format">Default Barcode Label Format (for Direct Printing)</Label>
                  <select
                    id="barcode_format"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={settings.bill_barcode_settings?.barcode_format || "a4_12x4"}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        bill_barcode_settings: {
                          ...settings.bill_barcode_settings,
                          barcode_format: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="novajet48">Novajet 48 (8 cols, 33x19mm)</option>
                    <option value="novajet40">Novajet 40 (5 cols × 8 rows, 39x35mm)</option>
                    <option value="novajet65">Novajet 65 (5 cols, 38x21mm)</option>
                    <option value="a4_12x4">A4 12x4 (4 cols, 50x24mm)</option>
                  </select>
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

                {/* Cheque Printing Section */}
                <div className="pt-6 border-t">
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
                <div className="space-y-2">
                  <Label htmlFor="default_date_range">Default Date Range</Label>
                  <select
                    id="default_date_range"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={settings.report_settings?.default_date_range || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        report_settings: {
                          ...settings.report_settings,
                          default_date_range: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="">Select default date range</option>
                    <option value="today">Today</option>
                    <option value="this_week">This Week</option>
                    <option value="this_month">This Month</option>
                    <option value="last_month">Last Month</option>
                    <option value="last_quarter">Last Quarter</option>
                    <option value="this_year">This Year</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Export Formats</Label>
                  <div className="space-y-2">
                    {["PDF", "Excel", "CSV"].map((format) => (
                      <div key={format} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`export_${format}`}
                          className="h-4 w-4 rounded border-input"
                          checked={settings.report_settings?.export_formats?.includes(format) || false}
                          onChange={(e) => {
                            const currentFormats = settings.report_settings?.export_formats || [];
                            const newFormats = e.target.checked
                              ? [...currentFormats, format]
                              : currentFormats.filter((f) => f !== format);
                            setSettings({
                              ...settings,
                              report_settings: {
                                ...settings.report_settings,
                                export_formats: newFormats,
                              },
                            });
                          }}
                        />
                        <Label htmlFor={`export_${format}`} className="font-normal cursor-pointer">
                          {format}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Stock Report Columns</Label>
                  <div className="space-y-2">
                    {[
                      { value: "product_name", label: "Product Name" },
                      { value: "size", label: "Size" },
                      { value: "barcode", label: "Barcode" },
                      { value: "stock_qty", label: "Stock Quantity" },
                      { value: "pur_price", label: "Purchase Price" },
                      { value: "sale_price", label: "Sale Price" },
                      { value: "category", label: "Category" },
                      { value: "brand", label: "Brand" },
                    ].map((column) => (
                      <div key={column.value} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`stock_col_${column.value}`}
                          className="h-4 w-4 rounded border-input"
                          checked={settings.report_settings?.stock_report_columns?.includes(column.value) || false}
                          onChange={(e) => {
                            const currentCols = settings.report_settings?.stock_report_columns || [];
                            const newCols = e.target.checked
                              ? [...currentCols, column.value]
                              : currentCols.filter((c) => c !== column.value);
                            setSettings({
                              ...settings,
                              report_settings: {
                                ...settings.report_settings,
                                stock_report_columns: newCols,
                              },
                            });
                          }}
                        />
                        <Label htmlFor={`stock_col_${column.value}`} className="font-normal cursor-pointer">
                          {column.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Purchase Report Columns</Label>
                  <div className="space-y-2">
                    {[
                      { value: "bill_date", label: "Bill Date" },
                      { value: "invoice_no", label: "Invoice No" },
                      { value: "supplier_name", label: "Supplier Name" },
                      { value: "gross_amount", label: "Gross Amount" },
                      { value: "gst_amount", label: "GST Amount" },
                      { value: "net_amount", label: "Net Amount" },
                      { value: "items_count", label: "Items Count" },
                    ].map((column) => (
                      <div key={column.value} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`purchase_col_${column.value}`}
                          className="h-4 w-4 rounded border-input"
                          checked={settings.report_settings?.purchase_report_columns?.includes(column.value) || false}
                          onChange={(e) => {
                            const currentCols = settings.report_settings?.purchase_report_columns || [];
                            const newCols = e.target.checked
                              ? [...currentCols, column.value]
                              : currentCols.filter((c) => c !== column.value);
                            setSettings({
                              ...settings,
                              report_settings: {
                                ...settings.report_settings,
                                purchase_report_columns: newCols,
                              },
                            });
                          }}
                        />
                        <Label htmlFor={`purchase_col_${column.value}`} className="font-normal cursor-pointer">
                          {column.label}
                        </Label>
                      </div>
                    ))}
                  </div>
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
