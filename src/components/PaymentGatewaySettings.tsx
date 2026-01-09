import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Copy, Check, CreditCard, Smartphone, Link2, AlertCircle, Info, ExternalLink } from "lucide-react";
import { usePaymentGateway, GatewayType } from "@/hooks/usePaymentGateway";
import { toast } from "sonner";

export function PaymentGatewaySettings() {
  const {
    gatewaySettings,
    isLoadingSettings,
    saveSettings,
    isSaving,
  } = usePaymentGateway();

  const [localSettings, setLocalSettings] = useState({
    active_gateway: 'upi_link' as GatewayType,
    upi_id: '',
    upi_business_name: '',
    razorpay_key_id: '',
    razorpay_enabled: false,
    phonepe_merchant_id: '',
    phonepe_enabled: false,
  });

  const [copied, setCopied] = useState<string | null>(null);

  // Sync with fetched settings
  useEffect(() => {
    if (gatewaySettings) {
      setLocalSettings({
        active_gateway: gatewaySettings.active_gateway || 'upi_link',
        upi_id: gatewaySettings.upi_id || '',
        upi_business_name: gatewaySettings.upi_business_name || '',
        razorpay_key_id: gatewaySettings.razorpay_key_id || '',
        razorpay_enabled: gatewaySettings.razorpay_enabled || false,
        phonepe_merchant_id: gatewaySettings.phonepe_merchant_id || '',
        phonepe_enabled: gatewaySettings.phonepe_enabled || false,
      });
    }
  }, [gatewaySettings]);

  const handleSave = () => {
    saveSettings(localSettings);
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const webhookBaseUrl = window.location.origin.replace(/:\d+$/, '');
  const razorpayWebhookUrl = `https://lkbbrqcsbhqjvsxiorvp.supabase.co/functions/v1/razorpay-webhook`;
  const phonepeCallbackUrl = `https://lkbbrqcsbhqjvsxiorvp.supabase.co/functions/v1/phonepe-webhook`;

  if (isLoadingSettings) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="h-10 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Payment Gateway Settings
        </CardTitle>
        <CardDescription>
          Configure how customers can pay you. Choose from simple UPI links, Razorpay, or PhonePe payment gateways.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Gateway Selection */}
        <div className="space-y-4">
          <Label className="text-base font-semibold">Select Payment Gateway</Label>
          <RadioGroup
            value={localSettings.active_gateway}
            onValueChange={(value) => setLocalSettings({ ...localSettings, active_gateway: value as GatewayType })}
            className="grid gap-4"
          >
            {/* UPI Link Option */}
            <div className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors ${
              localSettings.active_gateway === 'upi_link' ? 'border-primary bg-primary/5' : 'border-muted'
            }`}>
              <RadioGroupItem value="upi_link" id="upi_link" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="upi_link" className="font-medium cursor-pointer">
                    Simple UPI Link
                  </Label>
                  <Badge variant="secondary" className="text-xs">Free</Badge>
                  <Badge className="text-xs">Default</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Generate UPI payment links directly. No gateway fees, but requires manual payment confirmation.
                </p>
              </div>
            </div>

            {/* Razorpay Option */}
            <div className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors ${
              localSettings.active_gateway === 'razorpay' ? 'border-primary bg-primary/5' : 'border-muted'
            }`}>
              <RadioGroupItem value="razorpay" id="razorpay" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="razorpay" className="font-medium cursor-pointer">
                    Razorpay
                  </Label>
                  <Badge variant="outline" className="text-xs">~2% fees</Badge>
                  <Badge variant="secondary" className="text-xs">Auto-confirm</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Professional payment links with automatic payment confirmation via webhooks. Supports UPI, Cards, NetBanking.
                </p>
              </div>
            </div>

            {/* PhonePe Option */}
            <div className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors ${
              localSettings.active_gateway === 'phonepe' ? 'border-primary bg-primary/5' : 'border-muted'
            }`}>
              <RadioGroupItem value="phonepe" id="phonepe" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="phonepe" className="font-medium cursor-pointer">
                    PhonePe Payment Gateway
                  </Label>
                  <Badge variant="outline" className="text-xs">~1.99% fees</Badge>
                  <Badge variant="secondary" className="text-xs">Auto-confirm</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  PhonePe payment gateway with automatic confirmation. Popular among Indian customers.
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        {/* Gateway-specific Settings */}
        <div className="border-t pt-6 space-y-6">
          {/* UPI Link Settings */}
          {localSettings.active_gateway === 'upi_link' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">UPI Link Configuration</h3>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="upi_id">UPI ID *</Label>
                  <Input
                    id="upi_id"
                    value={localSettings.upi_id}
                    onChange={(e) => setLocalSettings({ ...localSettings, upi_id: e.target.value })}
                    placeholder="yourname@upi or 9876543210@paytm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your UPI ID where payments will be received
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="upi_business_name">Business Name</Label>
                  <Input
                    id="upi_business_name"
                    value={localSettings.upi_business_name}
                    onChange={(e) => setLocalSettings({ ...localSettings, upi_business_name: e.target.value })}
                    placeholder="Your Business Name"
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown on payment page and UPI apps
                  </p>
                </div>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  With UPI Link, you'll need to manually verify payments in your bank app and mark invoices as paid.
                  Consider Razorpay or PhonePe for automatic confirmation.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Razorpay Settings */}
          {localSettings.active_gateway === 'razorpay' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold">Razorpay Configuration</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="razorpay_enabled" className="text-sm">Enable</Label>
                  <Switch
                    id="razorpay_enabled"
                    checked={localSettings.razorpay_enabled}
                    onCheckedChange={(checked) => setLocalSettings({ ...localSettings, razorpay_enabled: checked })}
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="razorpay_key_id">API Key ID *</Label>
                  <Input
                    id="razorpay_key_id"
                    value={localSettings.razorpay_key_id}
                    onChange={(e) => setLocalSettings({ ...localSettings, razorpay_key_id: e.target.value })}
                    placeholder="rzp_live_xxxxxxxxxxxxx"
                  />
                  <p className="text-xs text-muted-foreground">
                    Get this from Razorpay Dashboard → Settings → API Keys
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Webhook URL</Label>
                  <div className="flex gap-2">
                    <Input
                      value={razorpayWebhookUrl}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(razorpayWebhookUrl, 'razorpay_webhook')}
                    >
                      {copied === 'razorpay_webhook' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add this URL in Razorpay Dashboard → Settings → Webhooks → Add Webhook
                  </p>
                </div>

                <Alert className="bg-blue-50 border-blue-200">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    <strong>Important:</strong> The API Secret Key must be configured as a secure environment secret.
                    Contact your administrator to set up RAZORPAY_KEY_SECRET.
                  </AlertDescription>
                </Alert>

                <Button variant="outline" size="sm" asChild>
                  <a href="https://dashboard.razorpay.com/app/keys" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Razorpay Dashboard
                  </a>
                </Button>
              </div>
            </div>
          )}

          {/* PhonePe Settings */}
          {localSettings.active_gateway === 'phonepe' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-purple-600" />
                  <h3 className="font-semibold">PhonePe Configuration</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="phonepe_enabled" className="text-sm">Enable</Label>
                  <Switch
                    id="phonepe_enabled"
                    checked={localSettings.phonepe_enabled}
                    onCheckedChange={(checked) => setLocalSettings({ ...localSettings, phonepe_enabled: checked })}
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phonepe_merchant_id">Merchant ID *</Label>
                  <Input
                    id="phonepe_merchant_id"
                    value={localSettings.phonepe_merchant_id}
                    onChange={(e) => setLocalSettings({ ...localSettings, phonepe_merchant_id: e.target.value })}
                    placeholder="MERCHANTID123"
                  />
                  <p className="text-xs text-muted-foreground">
                    Get this from PhonePe Business Dashboard
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Callback URL</Label>
                  <div className="flex gap-2">
                    <Input
                      value={phonepeCallbackUrl}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(phonepeCallbackUrl, 'phonepe_callback')}
                    >
                      {copied === 'phonepe_callback' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Configure this as the callback URL in PhonePe Business Dashboard
                  </p>
                </div>

                <Alert className="bg-purple-50 border-purple-200">
                  <AlertCircle className="h-4 w-4 text-purple-600" />
                  <AlertDescription className="text-purple-800">
                    <strong>Important:</strong> Salt Key and Salt Index must be configured as secure environment secrets.
                    Contact your administrator to set up PHONEPE_SALT_KEY and PHONEPE_SALT_INDEX.
                  </AlertDescription>
                </Alert>

                <Button variant="outline" size="sm" asChild>
                  <a href="https://business.phonepe.com" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open PhonePe Business Dashboard
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Gateway Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
