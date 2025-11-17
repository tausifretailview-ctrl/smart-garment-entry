import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Home, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { UserManagement } from "@/components/UserManagement";
import { SizeGroupManagement } from "@/components/SizeGroupManagement";
import { useOrganization } from "@/contexts/OrganizationContext";
import { InvoicePrint } from "@/components/InvoicePrint";
import { useEffect as useEffectForSizeGroups } from "react";

interface ProductSettings {
  default_margin?: number;
  low_stock_threshold?: number;
  sku_format?: string;
  default_size_group?: string;
}

interface PurchaseSettings {
  payment_terms?: string;
  auto_approve_threshold?: number;
  default_tax_rate?: number;
}

interface SaleSettings {
  default_discount?: number;
  payment_methods?: string[];
  invoice_format?: string;
  sales_tax_rate?: number;
  invoice_template?: string;
  invoice_color_scheme?: string;
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
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [sizeGroups, setSizeGroups] = useState<any[]>([]);
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

  // Sample data for invoice preview
  const sampleInvoiceData = {
    billNo: '2025-01-0001',
    date: new Date(),
    customerName: 'John Doe',
    customerAddress: '123 Sample Street, City',
    customerMobile: '9876543210',
    items: [
      {
        sr: 1,
        particulars: 'Sample Product 1',
        size: 'M',
        barcode: '10001001',
        hsn: '62051000',
        sp: 999,
        qty: 2,
        rate: 899,
        total: 1798
      },
      {
        sr: 2,
        particulars: 'Sample Product 2',
        size: 'L',
        barcode: '10001002',
        hsn: '62052000',
        sp: 1499,
        qty: 1,
        rate: 1299,
        total: 1299
      }
    ],
    subTotal: 3097,
    discount: 97,
    grandTotal: 3000,
    tenderAmount: 3000,
    cashPaid: 3000,
    refundCash: 0,
    upiPaid: 0,
    gstin: 'SAMPLE123456789'
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
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7">
            <TabsTrigger value="company">Company</TabsTrigger>
            <TabsTrigger value="product">Product</TabsTrigger>
            <TabsTrigger value="purchase">Purchase</TabsTrigger>
            <TabsTrigger value="sale">Sale</TabsTrigger>
            <TabsTrigger value="bill">Bill & Barcode</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="users">User Rights</TabsTrigger>
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
                    value={settings.purchase_settings?.default_tax_rate || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        purchase_settings: {
                          ...settings.purchase_settings,
                          default_tax_rate: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                    placeholder="e.g., 18"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sale">
            <Card>
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
                  <Label>Payment Methods</Label>
                  <div className="space-y-2">
                    {["Cash", "Card", "UPI", "Net Banking"].map((method) => (
                      <div key={method} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={method}
                          className="h-4 w-4 rounded border-input"
                          checked={settings.sale_settings?.payment_methods?.includes(method) || false}
                          onChange={(e) => {
                            const currentMethods = settings.sale_settings?.payment_methods || [];
                            const newMethods = e.target.checked
                              ? [...currentMethods, method]
                              : currentMethods.filter((m) => m !== method);
                            setSettings({
                              ...settings,
                              sale_settings: {
                                ...settings.sale_settings,
                                payment_methods: newMethods,
                              },
                            });
                          }}
                        />
                        <Label htmlFor={method} className="font-normal cursor-pointer">
                          {method}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoice_format">Invoice Numbering Format</Label>
                  <Input
                    id="invoice_format"
                    value={settings.sale_settings?.invoice_format || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        sale_settings: {
                          ...settings.sale_settings,
                          invoice_format: e.target.value,
                        },
                      })
                    }
                    placeholder="e.g., INV-{YYYY}-{####}"
                  />
                  <p className="text-xs text-muted-foreground">
                    Available placeholders: {"{YYYY}"} (year), {"{MM}"} (month), {"{####}"} (auto-increment number)
                  </p>
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
                  <Label htmlFor="invoice_template">Invoice Template</Label>
                  <Select
                    value={settings.sale_settings?.invoice_template || "classic"}
                    onValueChange={(value) =>
                      setSettings({
                        ...settings,
                        sale_settings: {
                          ...settings.sale_settings,
                          invoice_template: value,
                        },
                      })
                    }
                  >
                    <SelectTrigger id="invoice_template">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classic">Classic - Traditional receipt style</SelectItem>
                      <SelectItem value="modern">Modern - Clean minimal design</SelectItem>
                      <SelectItem value="professional">Professional - Corporate invoice</SelectItem>
                      <SelectItem value="compact">Compact - Space-saving layout</SelectItem>
                    </SelectContent>
                  </Select>
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
                
                {/* Invoice Preview Section */}
                <div className="space-y-4 pt-6 border-t">
                  <h3 className="text-lg font-semibold">Invoice Preview</h3>
                  <p className="text-sm text-muted-foreground">
                    Preview how your invoice will look with the selected template and color scheme
                  </p>
                  <div className="border rounded-lg p-4 bg-muted/50 overflow-auto max-h-[600px]">
                    <div className="flex justify-center">
                      <InvoicePrint
                        {...sampleInvoiceData}
                        template={settings.sale_settings?.invoice_template}
                        colorScheme={settings.sale_settings?.invoice_color_scheme}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="barcode_width">Barcode Label Width (mm)</Label>
                    <Input
                      id="barcode_width"
                      type="number"
                      min="10"
                      max="200"
                      value={settings.bill_barcode_settings?.barcode_width || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...settings.bill_barcode_settings,
                            barcode_width: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      placeholder="e.g., 50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="barcode_height">Barcode Label Height (mm)</Label>
                    <Input
                      id="barcode_height"
                      type="number"
                      min="10"
                      max="200"
                      value={settings.bill_barcode_settings?.barcode_height || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          bill_barcode_settings: {
                            ...settings.bill_barcode_settings,
                            barcode_height: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      placeholder="e.g., 25"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="print_format">Print Format</Label>
                  <select
                    id="print_format"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={settings.bill_barcode_settings?.print_format || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        bill_barcode_settings: {
                          ...settings.bill_barcode_settings,
                          print_format: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="">Select print format</option>
                    <option value="a4">A4 (210 x 297 mm)</option>
                    <option value="thermal">Thermal (80mm)</option>
                    <option value="thermal-small">Thermal Small (58mm)</option>
                    <option value="custom">Custom Size</option>
                  </select>
                </div>
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Product Details to Display</Label>
                  <p className="text-sm text-muted-foreground">
                    Select which product details to show on bills and barcodes
                  </p>
                  <div className="space-y-3 pl-1">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="show_brand"
                        checked={settings.bill_barcode_settings?.show_brand || false}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            bill_barcode_settings: {
                              ...settings.bill_barcode_settings,
                              show_brand: checked === true,
                            },
                          })
                        }
                      />
                      <Label 
                        htmlFor="show_brand"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Show Brand
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="show_category"
                        checked={settings.bill_barcode_settings?.show_category || false}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            bill_barcode_settings: {
                              ...settings.bill_barcode_settings,
                              show_category: checked === true,
                            },
                          })
                        }
                      />
                      <Label 
                        htmlFor="show_category"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Show Category
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="show_color"
                        checked={settings.bill_barcode_settings?.show_color || false}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            bill_barcode_settings: {
                              ...settings.bill_barcode_settings,
                              show_color: checked === true,
                            },
                          })
                        }
                      />
                      <Label 
                        htmlFor="show_color"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Show Color
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="show_style"
                        checked={settings.bill_barcode_settings?.show_style || false}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            bill_barcode_settings: {
                              ...settings.bill_barcode_settings,
                              show_style: checked === true,
                            },
                          })
                        }
                      />
                      <Label 
                        htmlFor="show_style"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Show Style
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="show_hsn_code"
                        checked={settings.bill_barcode_settings?.show_hsn_code || false}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            bill_barcode_settings: {
                              ...settings.bill_barcode_settings,
                              show_hsn_code: checked === true,
                            },
                          })
                        }
                      />
                      <Label 
                        htmlFor="show_hsn_code"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Show HSN Code
                      </Label>
                    </div>
                  </div>
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
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>User Rights Management</CardTitle>
                <CardDescription>
                  Manage user roles and permissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UserManagement />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
