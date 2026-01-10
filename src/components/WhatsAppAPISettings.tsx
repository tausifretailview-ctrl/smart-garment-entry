import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useWhatsAppAPI } from "@/hooks/useWhatsAppAPI";
import { useQuery } from "@tanstack/react-query";
import { 
  MessageSquare, 
  Settings2, 
  Send, 
  CheckCircle, 
  XCircle, 
  Clock,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  AlertCircle,
  Info
} from "lucide-react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

export const WhatsAppAPISettings = () => {
  const { 
    settings, 
    settingsLoading, 
    updateSettings, 
    isUpdating,
    testConnection,
    isTesting,
    getMessageStats 
  } = useWhatsAppAPI();

  const [formData, setFormData] = useState({
    phone_number_id: "",
    waba_id: "",
    access_token: "",
    business_name: "",
    is_active: false,
    auto_send_invoice: false,
    auto_send_quotation: false,
    auto_send_sale_order: false,
    auto_send_payment_reminder: false,
  });

  const [showToken, setShowToken] = useState(false);
  const [testPhone, setTestPhone] = useState("");

  // Load settings into form
  useEffect(() => {
    if (settings) {
      setFormData({
        phone_number_id: settings.phone_number_id || "",
        waba_id: settings.waba_id || "",
        access_token: settings.access_token || "",
        business_name: settings.business_name || "",
        is_active: settings.is_active || false,
        auto_send_invoice: settings.auto_send_invoice || false,
        auto_send_quotation: settings.auto_send_quotation || false,
        auto_send_sale_order: settings.auto_send_sale_order || false,
        auto_send_payment_reminder: settings.auto_send_payment_reminder || false,
      });
    }
  }, [settings]);

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['whatsapp-stats'],
    queryFn: getMessageStats,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    updateSettings(formData);
  };

  const handleTestConnection = () => {
    if (!testPhone) {
      toast.error("Please enter a phone number to test");
      return;
    }
    testConnection(testPhone);
  };

  const isConfigured = formData.phone_number_id && formData.access_token;

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-600" />
            WhatsApp Business API
          </h3>
          <p className="text-sm text-muted-foreground">
            Configure Official WhatsApp Business API for automated messaging
          </p>
        </div>
        <Badge variant={formData.is_active && isConfigured ? "default" : "secondary"}>
          {formData.is_active && isConfigured ? (
            <><CheckCircle className="h-3 w-3 mr-1" /> Connected</>
          ) : (
            <><XCircle className="h-3 w-3 mr-1" /> Disconnected</>
          )}
        </Badge>
      </div>

      {/* Setup Guide Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Setup Guide</AlertTitle>
        <AlertDescription className="text-sm">
          To use WhatsApp Business API, you need a Meta Business Account with WhatsApp Business Platform.
          <a 
            href="https://business.facebook.com/latest/whatsapp_manager" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:underline ml-1 inline-flex items-center"
          >
            Open Meta Business Manager <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        </AlertDescription>
      </Alert>

      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            API Configuration
          </CardTitle>
          <CardDescription>
            Enter your WhatsApp Business API credentials from Meta Business Manager
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone_number_id">Phone Number ID</Label>
              <Input
                id="phone_number_id"
                placeholder="e.g., 123456789012345"
                value={formData.phone_number_id}
                onChange={(e) => handleInputChange("phone_number_id", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Found in WhatsApp Manager → Phone Numbers
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="waba_id">WhatsApp Business Account ID</Label>
              <Input
                id="waba_id"
                placeholder="e.g., 123456789012345"
                value={formData.waba_id}
                onChange={(e) => handleInputChange("waba_id", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Found in WhatsApp Manager → Account settings
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="access_token">Access Token</Label>
            <div className="relative">
              <Input
                id="access_token"
                type={showToken ? "text" : "password"}
                placeholder="Permanent Access Token from System User"
                value={formData.access_token}
                onChange={(e) => handleInputChange("access_token", e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Create a System User in Business Settings → System Users → Generate Token
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="business_name">Business Name</Label>
            <Input
              id="business_name"
              placeholder="Your Business Name"
              value={formData.business_name}
              onChange={(e) => handleInputChange("business_name", e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => handleInputChange("is_active", checked)}
                disabled={!isConfigured}
              />
              <Label htmlFor="is_active">Enable WhatsApp API Integration</Label>
            </div>
          </div>

          <Separator />

          {/* Test Connection */}
          <div className="space-y-3">
            <Label>Test Connection</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter phone number to test (e.g., 9876543210)"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="flex-1"
              />
              <Button 
                onClick={handleTestConnection} 
                disabled={isTesting || !isConfigured}
                variant="outline"
              >
                {isTesting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testing...</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> Test</>
                )}
              </Button>
            </div>
            {!isConfigured && (
              <p className="text-xs text-orange-600">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                Configure Phone Number ID and Access Token to test
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Auto-Send Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" />
            Auto-Send Settings
          </CardTitle>
          <CardDescription>
            Automatically send WhatsApp messages when documents are created
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto_invoice">Auto-send Invoice</Label>
              <p className="text-xs text-muted-foreground">Send invoice details after sale is saved</p>
            </div>
            <Switch
              id="auto_invoice"
              checked={formData.auto_send_invoice}
              onCheckedChange={(checked) => handleInputChange("auto_send_invoice", checked)}
              disabled={!formData.is_active}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto_quotation">Auto-send Quotation</Label>
              <p className="text-xs text-muted-foreground">Send quotation details after creation</p>
            </div>
            <Switch
              id="auto_quotation"
              checked={formData.auto_send_quotation}
              onCheckedChange={(checked) => handleInputChange("auto_send_quotation", checked)}
              disabled={!formData.is_active}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto_sale_order">Auto-send Sale Order</Label>
              <p className="text-xs text-muted-foreground">Send order confirmation after creation</p>
            </div>
            <Switch
              id="auto_sale_order"
              checked={formData.auto_send_sale_order}
              onCheckedChange={(checked) => handleInputChange("auto_send_sale_order", checked)}
              disabled={!formData.is_active}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto_reminder">Payment Reminders</Label>
              <p className="text-xs text-muted-foreground">Send payment reminder messages</p>
            </div>
            <Switch
              id="auto_reminder"
              checked={formData.auto_send_payment_reminder}
              onCheckedChange={(checked) => handleInputChange("auto_send_payment_reminder", checked)}
              disabled={!formData.is_active}
            />
          </div>

          {!formData.is_active && (
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Enable WhatsApp API integration above to configure auto-send options
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Message Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today's Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-primary">{stats?.todaySent || 0}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Send className="h-3 w-3" /> Sent
              </div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats?.todayDelivered || 0}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <CheckCircle className="h-3 w-3" /> Delivered
              </div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{stats?.todayPending || 0}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" /> Pending
              </div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-red-600">{stats?.todayFailed || 0}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <XCircle className="h-3 w-3" /> Failed
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isUpdating}>
          {isUpdating ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
          ) : (
            "Save Settings"
          )}
        </Button>
      </div>
    </div>
  );
};
