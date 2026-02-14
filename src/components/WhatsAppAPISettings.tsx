import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useWhatsAppAPI, TemplateParam, SocialLinks } from "@/hooks/useWhatsAppAPI";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTierBasedRefresh } from "@/hooks/useTierBasedRefresh";
import { MetaTemplateSelector } from "@/components/MetaTemplateSelector";
import { SyncMetaTemplates } from "@/components/SyncMetaTemplates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Info,
    Bot,
    BrainCircuit,
    ChevronDown,
    ChevronRight,
    Link,
    Globe,
    Instagram,
    Facebook,
    Star,
    FileText
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
  
  const [sharedNumberWarning, setSharedNumberWarning] = useState<string | null>(null);
  
  // Tier-based polling - free tier uses manual refresh only
  const { getRefreshInterval } = useTierBasedRefresh();

  const [formData, setFormData] = useState({
    phone_number_id: "",
    waba_id: "",
    access_token: "",
    business_name: "",
    is_active: false,
    use_default_api: true,
    // Third-party provider fields
    api_provider: "meta_direct" as "meta_direct" | "third_party",
    custom_api_url: "",
    api_version: "v21.0",
    business_id: "",
    auto_send_invoice: false,
    auto_send_quotation: false,
    auto_send_sale_order: false,
    auto_send_payment_reminder: false,
    invoice_template_name: "",
    quotation_template_name: "",
    sale_order_template_name: "",
    payment_reminder_template_name: "",
    // Template parameter mappings
    invoice_template_params: [] as TemplateParam[],
    quotation_template_params: [] as TemplateParam[],
    sale_order_template_params: [] as TemplateParam[],
    payment_reminder_template_params: [] as TemplateParam[],
    // Chatbot settings
    chatbot_enabled: false,
    chatbot_greeting: "Hello! I'm an AI assistant. How can I help you today?",
    chatbot_system_prompt: "You are a helpful business assistant. Keep responses concise and mobile-friendly (under 500 characters). Help customers with invoice inquiries, order status, payment information, and general business questions.",
    business_hours_enabled: false,
    business_hours_start: "09:00",
    business_hours_end: "18:00",
    outside_hours_message: "Thank you for your message. Our business hours are 9 AM to 6 PM. We will respond during business hours.",
    handoff_keywords: ["human", "agent", "support", "help", "speak to someone"],
    // Button click follow-up settings (WhatsApp 24h compliant)
    send_followup_on_button_click: false,
    button_followup_message: "📄 Thank you for viewing your invoice!\n\nHere are your links:\n🌐 Website: {website}\n📷 Instagram: {instagram}\n\nRate us: ⭐⭐⭐⭐⭐",
    followup_menu_message: "Thank you for your interest! 🙏\n\nPlease select what you need:",
    followup_invoice_message: "📄 Here is your invoice link:\n{invoice_link}\n\nInvoice No: {sale_number}\nThank you for your business!",
    followup_social_message: "📱 Connect with us on social media:\n\n🌐 Website: {website}\n📷 Instagram: {instagram}\n📘 Facebook: {facebook}\n\nFollow us for latest updates! 🌟",
    followup_review_message: "⭐ We would love your feedback!\n\nPlease take a moment to rate us:\n{google_review}\n\nYour review helps us serve you better! 🙏",
    followup_chat_message: "💬 Chat with us directly!\n\nClick here to start a conversation:\n{whatsapp_link}\n\nOur team is ready to assist you!",
    social_links: { website: "", instagram: "", facebook: "", google_review: "" } as SocialLinks,
    // Invoice PDF attachment settings
    send_invoice_pdf: false,
    invoice_pdf_template: "professional",
    // Document header template (PDF embedded in template - bypasses 24h window)
    use_document_header_template: false,
    invoice_document_template_name: "",
    invoice_document_template_params: [] as any[],
  });

  const [showToken, setShowToken] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [openTemplateSection, setOpenTemplateSection] = useState<string | null>(null);

  // Load settings into form
  useEffect(() => {
    if (settings) {
      setFormData({
        phone_number_id: settings.phone_number_id || "",
        waba_id: settings.waba_id || "",
        access_token: settings.access_token || "",
        business_name: settings.business_name || "",
        is_active: settings.is_active || false,
        use_default_api: settings.use_default_api !== false, // Default to true
        // Third-party provider fields
        api_provider: (settings as any).api_provider || "meta_direct",
        custom_api_url: (settings as any).custom_api_url || "",
        api_version: (settings as any).api_version || "v21.0",
        business_id: (settings as any).business_id || "",
        auto_send_invoice: settings.auto_send_invoice || false,
        auto_send_quotation: settings.auto_send_quotation || false,
        auto_send_sale_order: settings.auto_send_sale_order || false,
        auto_send_payment_reminder: settings.auto_send_payment_reminder || false,
        invoice_template_name: settings.invoice_template_name || "",
        quotation_template_name: settings.quotation_template_name || "",
        sale_order_template_name: settings.sale_order_template_name || "",
        payment_reminder_template_name: settings.payment_reminder_template_name || "",
        // Template parameter mappings
        invoice_template_params: settings.invoice_template_params || [],
        quotation_template_params: settings.quotation_template_params || [],
        sale_order_template_params: settings.sale_order_template_params || [],
        payment_reminder_template_params: settings.payment_reminder_template_params || [],
        // Chatbot settings
        chatbot_enabled: settings.chatbot_enabled || false,
        chatbot_greeting: settings.chatbot_greeting || "Hello! I'm an AI assistant. How can I help you today?",
        chatbot_system_prompt: settings.chatbot_system_prompt || "You are a helpful business assistant. Keep responses concise and mobile-friendly (under 500 characters). Help customers with invoice inquiries, order status, payment information, and general business questions.",
        business_hours_enabled: settings.business_hours_enabled || false,
        business_hours_start: settings.business_hours_start || "09:00",
        business_hours_end: settings.business_hours_end || "18:00",
        outside_hours_message: settings.outside_hours_message || "Thank you for your message. Our business hours are 9 AM to 6 PM. We will respond during business hours.",
        handoff_keywords: settings.handoff_keywords || ["human", "agent", "support", "help", "speak to someone"],
        // Button click follow-up settings
        send_followup_on_button_click: settings.send_followup_on_button_click || false,
        button_followup_message: settings.button_followup_message || "📄 Thank you for viewing your invoice!\n\nHere are your links:\n🌐 Website: {website}\n📷 Instagram: {instagram}\n\nRate us: ⭐⭐⭐⭐⭐",
        followup_menu_message: (settings as any).followup_menu_message || "Thank you for your interest! 🙏\n\nPlease select what you need:",
        followup_invoice_message: (settings as any).followup_invoice_message || "📄 Here is your invoice link:\n{invoice_link}\n\nInvoice No: {sale_number}\nThank you for your business!",
        followup_social_message: (settings as any).followup_social_message || "📱 Connect with us on social media:\n\n🌐 Website: {website}\n📷 Instagram: {instagram}\n📘 Facebook: {facebook}\n\nFollow us for latest updates! 🌟",
        followup_review_message: (settings as any).followup_review_message || "⭐ We would love your feedback!\n\nPlease take a moment to rate us:\n{google_review}\n\nYour review helps us serve you better! 🙏",
        followup_chat_message: (settings as any).followup_chat_message || "💬 Chat with us directly!\n\nClick here to start a conversation:\n{whatsapp_link}\n\nOur team is ready to assist you!",
        social_links: settings.social_links || { website: "", instagram: "", facebook: "", google_review: "" },
        // Invoice PDF attachment settings
        send_invoice_pdf: (settings as any).send_invoice_pdf || false,
        invoice_pdf_template: (settings as any).invoice_pdf_template || "professional",
        // Document header template
        use_document_header_template: (settings as any).use_document_header_template || false,
        invoice_document_template_name: (settings as any).invoice_document_template_name || "",
        invoice_document_template_params: (settings as any).invoice_document_template_params || [],
      });
    }
  }, [settings]);

  // Fetch stats - tier-based polling
  const { data: stats } = useQuery({
    queryKey: ['whatsapp-stats'],
    queryFn: getMessageStats,
    refetchInterval: getRefreshInterval('fast'), // Tier-based: false for free tier
  });

  const handleInputChange = (field: string, value: string | boolean | string[] | TemplateParam[] | SocialLinks) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSocialLinkChange = (field: keyof SocialLinks, value: string) => {
    setFormData(prev => ({
      ...prev,
      social_links: { ...prev.social_links, [field]: value }
    }));
  };

  const handleSave = async () => {
    // Check if this phone_number_id is used by other organizations
    if (!formData.use_default_api && formData.phone_number_id) {
      const { data: existingSettings } = await supabase
        .from('whatsapp_api_settings')
        .select('organization_id, organizations!inner(name)')
        .eq('phone_number_id', formData.phone_number_id)
        .eq('use_default_api', false)
        .neq('organization_id', settings?.organization_id || '');
      
      if (existingSettings && existingSettings.length > 0) {
        const orgNames = existingSettings.map((s: any) => s.organizations?.name).filter(Boolean).join(', ');
        setSharedNumberWarning(
          `This Phone Number ID is already used by: ${orgNames || 'other organizations'}. Messages will be routed based on customer's last interaction.`
        );
      } else {
        setSharedNumberWarning(null);
      }
    } else {
      setSharedNumberWarning(null);
    }
    
    updateSettings(formData);
  };

  const handleTestConnection = () => {
    if (!testPhone) {
      toast.error("Please enter a phone number to test");
      return;
    }
    testConnection(testPhone);
  };

  const isConfigured = formData.use_default_api || (formData.phone_number_id && formData.access_token);

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
            Choose to use the platform's shared WhatsApp number or configure your own
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Platform Default Toggle */}
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <Label htmlFor="use_default_api" className="font-medium">Use Platform Default WhatsApp Number</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Use the shared platform WhatsApp number for all messages. Your organization's messages, reports, and chatbot settings remain separate.
              </p>
            </div>
            <Switch
              id="use_default_api"
              checked={formData.use_default_api}
              onCheckedChange={(checked) => handleInputChange("use_default_api", checked)}
            />
          </div>

          {formData.use_default_api ? (
            <Alert>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle>Using Platform Default Number</AlertTitle>
              <AlertDescription className="text-sm">
                Your organization will use the shared platform WhatsApp number. All messages sent will appear from the platform number, 
                but your reports, chatbot settings, and message logs remain specific to your organization.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Separator />
              
              {/* API Provider Toggle */}
              <div className="space-y-2">
                <Label>API Provider</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={formData.api_provider === "meta_direct" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleInputChange("api_provider", "meta_direct")}
                    className="flex-1"
                  >
                    Direct Meta API
                  </Button>
                  <Button
                    type="button"
                    variant={formData.api_provider === "third_party" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleInputChange("api_provider", "third_party")}
                    className="flex-1"
                  >
                    Third-Party Provider
                  </Button>
                </div>
              </div>

              {/* Third-party specific fields */}
              {formData.api_provider === "third_party" && (
                <>
                  <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-800 dark:text-amber-200">Third-Party Provider</AlertTitle>
                    <AlertDescription className="text-sm text-amber-700 dark:text-amber-300">
                      Third-party providers may use temporary access tokens that need periodic renewal. Make sure to update the token before it expires.
                    </AlertDescription>
                  </Alert>

                  {/* Webhook Configuration Section */}
                  <div className="p-4 bg-muted rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      <Label className="font-medium">Webhook Configuration</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Configure this URL in your third-party provider's webhook settings to receive delivery updates and customer replies.
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          readOnly
                          value={`https://lkbbrqcsbhqjvsxiorvp.supabase.co/functions/v1/whatsapp-webhook`}
                          className="text-xs font-mono bg-background"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(`https://lkbbrqcsbhqjvsxiorvp.supabase.co/functions/v1/whatsapp-webhook`);
                            toast.success("Webhook URL copied!");
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          readOnly
                          value="lovable_whatsapp_webhook"
                          className="text-xs font-mono bg-background"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText("lovable_whatsapp_webhook");
                            toast.success("Verify token copied!");
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <strong>Webhook URL</strong> (top) and <strong>Verify Token</strong> (bottom)
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="custom_api_url">Custom API URL</Label>
                    <Input
                      id="custom_api_url"
                      placeholder="e.g., https://crmapi.wappconnect.com/api/meta"
                      value={formData.custom_api_url}
                      onChange={(e) => handleInputChange("custom_api_url", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      The base URL provided by your third-party WhatsApp API provider
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="api_version">API Version</Label>
                      <Input
                        id="api_version"
                        placeholder="e.g., v19.0"
                        value={formData.api_version}
                        onChange={(e) => handleInputChange("api_version", e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        API version (default: v21.0)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="business_id">Business ID</Label>
                      <Input
                        id="business_id"
                        placeholder="e.g., 24732513237950"
                        value={formData.business_id}
                        onChange={(e) => handleInputChange("business_id", e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Third-party Business ID (if applicable)
                      </p>
                    </div>
                  </div>
                </>
              )}

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
                    {formData.api_provider === "third_party" ? "Phone Number ID from your provider" : "Found in WhatsApp Manager → Phone Numbers"}
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
                    {formData.api_provider === "third_party" ? "WABA ID from your provider" : "Found in WhatsApp Manager → Account settings"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="access_token">Access Token</Label>
                <div className="relative">
                  <Input
                    id="access_token"
                    type={showToken ? "text" : "password"}
                    placeholder={formData.api_provider === "third_party" ? "Access Token from your provider (may be temporary)" : "Permanent Access Token from System User"}
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
                  {formData.api_provider === "third_party" 
                    ? "⚠️ Token may be temporary — update before it expires" 
                    : "Create a System User in Business Settings → System Users → Generate Token"}
                </p>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="business_name">Business Name</Label>
            <Input
              id="business_name"
              placeholder="Your Business Name"
              value={formData.business_name}
              onChange={(e) => handleInputChange("business_name", e.target.value)}
            />
          </div>

          {/* Shared Number Warning */}
          {sharedNumberWarning && (
            <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 dark:text-amber-200">Shared Phone Number Detected</AlertTitle>
              <AlertDescription className="text-sm text-amber-700 dark:text-amber-300">
                {sharedNumberWarning}
              </AlertDescription>
            </Alert>
          )}

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
                disabled={isTesting || !isConfigured || !formData.is_active}
                variant="outline"
              >
                {isTesting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testing...</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> Test</>
                )}
              </Button>
            </div>
            {!formData.is_active && (
              <p className="text-xs text-orange-600">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                Enable WhatsApp API Integration to test
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI Chatbot Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4" />
            AI Chatbot
            {formData.chatbot_enabled && (
              <Badge variant="default" className="ml-2">
                <BrainCircuit className="h-3 w-3 mr-1" /> Active
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Enable AI-powered automatic responses to customer WhatsApp messages
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <BrainCircuit className="h-4 w-4" />
            <AlertDescription className="text-sm">
              When enabled, the AI chatbot will automatically respond to incoming WhatsApp messages.
              It can answer questions about invoices, payments, order status, and more using your business data.
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="chatbot_enabled">Enable AI Chatbot</Label>
              <p className="text-xs text-muted-foreground">Auto-respond to customer messages</p>
            </div>
            <Switch
              id="chatbot_enabled"
              checked={formData.chatbot_enabled}
              onCheckedChange={(checked) => handleInputChange("chatbot_enabled", checked)}
              disabled={!formData.is_active}
            />
          </div>

          {formData.chatbot_enabled && (
            <>
              <Separator />
              
              <div className="space-y-2">
                <Label htmlFor="chatbot_system_prompt">AI Instructions</Label>
                <Textarea
                  id="chatbot_system_prompt"
                  placeholder="Instructions for the AI assistant..."
                  value={formData.chatbot_system_prompt}
                  onChange={(e) => handleInputChange("chatbot_system_prompt", e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Customize how the AI responds to customers. Include your business policies, tone, and any specific instructions.
                </p>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="business_hours_enabled">Business Hours Only</Label>
                  <p className="text-xs text-muted-foreground">Only respond during business hours</p>
                </div>
                <Switch
                  id="business_hours_enabled"
                  checked={formData.business_hours_enabled}
                  onCheckedChange={(checked) => handleInputChange("business_hours_enabled", checked)}
                />
              </div>

              {formData.business_hours_enabled && (
                <div className="grid gap-4 md:grid-cols-2 pl-4 border-l-2 border-muted">
                  <div className="space-y-2">
                    <Label htmlFor="business_hours_start">Start Time</Label>
                    <Input
                      id="business_hours_start"
                      type="time"
                      value={formData.business_hours_start}
                      onChange={(e) => handleInputChange("business_hours_start", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="business_hours_end">End Time</Label>
                    <Input
                      id="business_hours_end"
                      type="time"
                      value={formData.business_hours_end}
                      onChange={(e) => handleInputChange("business_hours_end", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="outside_hours_message">Outside Hours Message</Label>
                    <Textarea
                      id="outside_hours_message"
                      placeholder="Message to send outside business hours..."
                      value={formData.outside_hours_message}
                      onChange={(e) => handleInputChange("outside_hours_message", e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="handoff_keywords">Handoff Keywords</Label>
                <Input
                  id="handoff_keywords"
                  placeholder="human, agent, support, help"
                  value={formData.handoff_keywords.join(", ")}
                  onChange={(e) => handleInputChange("handoff_keywords", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated keywords that trigger handoff to human agent
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Meta Template Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Meta Message Templates
              </CardTitle>
              <CardDescription>
                Select your approved Meta WhatsApp templates and configure their parameters.
                <a 
                  href="https://business.facebook.com/latest/whatsapp_manager/message_templates" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline ml-1 inline-flex items-center"
                >
                  Manage Templates <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </CardDescription>
            </div>
            <SyncMetaTemplates />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Two PDF Sending Methods Explanation */}
          <Alert className="border-blue-300 bg-blue-100 dark:border-blue-700 dark:bg-blue-900/40">
            <Info className="h-4 w-4 text-blue-700 dark:text-blue-300" />
            <AlertTitle className="text-blue-900 dark:text-blue-100 font-semibold">Two Ways to Send Invoice PDF</AlertTitle>
            <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
              <div className="mt-2 space-y-2">
                <div className="flex items-start gap-2">
                  <Badge className="mt-0.5 shrink-0 bg-green-600 text-white">Method 1</Badge>
                  <div className="text-blue-900 dark:text-blue-100">
                    <strong>Standard Attachment:</strong> Select a TEXT/UTILITY template below + enable "Send Invoice PDF" checkbox. 
                    PDF sent as separate message. <span className="text-amber-700 dark:text-amber-400 font-medium">(May fail outside 24h window)</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Badge className="mt-0.5 shrink-0 bg-purple-600 text-white">Method 2</Badge>
                  <div className="text-blue-900 dark:text-blue-100">
                    <strong>Direct PDF Delivery:</strong> Use DOCUMENT header template with "Direct PDF Delivery" enabled. 
                    PDF embedded in template. <span className="text-green-700 dark:text-green-400 font-medium">(Works anytime!)</span>
                  </div>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {/* Warning when Direct PDF is enabled */}
          {formData.use_document_header_template && formData.invoice_document_template_name && (
            <Alert className="border-purple-300 bg-purple-100 dark:border-purple-700 dark:bg-purple-900/40">
              <AlertCircle className="h-4 w-4 text-purple-700 dark:text-purple-300" />
              <AlertTitle className="text-purple-900 dark:text-purple-100 font-semibold">Direct PDF Delivery Active</AlertTitle>
              <AlertDescription className="text-sm text-purple-800 dark:text-purple-200">
                Invoice Template below is <strong>disabled</strong> because you're using Direct PDF Delivery with template "{formData.invoice_document_template_name}". 
                The PDF will be embedded directly in the template header.
              </AlertDescription>
            </Alert>
          )}

          {/* Invoice Template */}
          <div className={formData.use_document_header_template && formData.invoice_document_template_name ? 'opacity-50 pointer-events-none' : ''}>
            <MetaTemplateSelector
              templateType="invoice"
              selectedTemplateId={null}
              selectedTemplateName={formData.invoice_template_name}
              params={formData.invoice_template_params}
              onTemplateChange={(id, name) => handleInputChange("invoice_template_name", name)}
              onParamsChange={(params) => handleInputChange("invoice_template_params", params)}
              isOpen={openTemplateSection === 'invoice'}
              onOpenChange={(open) => setOpenTemplateSection(open ? 'invoice' : null)}
              hideDocumentHeaderTemplates={true}
            />
            {formData.use_document_header_template && formData.invoice_document_template_name && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                ⚠️ Disabled - Using Direct PDF Delivery instead
              </p>
            )}
          </div>

          {/* Quotation Template */}
          <MetaTemplateSelector
            templateType="quotation"
            selectedTemplateId={null}
            selectedTemplateName={formData.quotation_template_name}
            params={formData.quotation_template_params}
            onTemplateChange={(id, name) => handleInputChange("quotation_template_name", name)}
            onParamsChange={(params) => handleInputChange("quotation_template_params", params)}
            isOpen={openTemplateSection === 'quotation'}
            onOpenChange={(open) => setOpenTemplateSection(open ? 'quotation' : null)}
          />

          {/* Sale Order Template */}
          <MetaTemplateSelector
            templateType="sale_order"
            selectedTemplateId={null}
            selectedTemplateName={formData.sale_order_template_name}
            params={formData.sale_order_template_params}
            onTemplateChange={(id, name) => handleInputChange("sale_order_template_name", name)}
            onParamsChange={(params) => handleInputChange("sale_order_template_params", params)}
            isOpen={openTemplateSection === 'sale_order'}
            onOpenChange={(open) => setOpenTemplateSection(open ? 'sale_order' : null)}
          />

          {/* Payment Reminder Template */}
          <MetaTemplateSelector
            templateType="payment_reminder"
            selectedTemplateId={null}
            selectedTemplateName={formData.payment_reminder_template_name}
            params={formData.payment_reminder_template_params}
            onTemplateChange={(id, name) => handleInputChange("payment_reminder_template_name", name)}
            onParamsChange={(params) => handleInputChange("payment_reminder_template_params", params)}
            isOpen={openTemplateSection === 'payment_reminder'}
            onOpenChange={(open) => setOpenTemplateSection(open ? 'payment_reminder' : null)}
          />
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

      {/* Invoice PDF Attachment Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Invoice PDF Attachment
            {formData.send_invoice_pdf && (
              <Badge variant="default" className="ml-2">Enabled</Badge>
            )}
            {formData.use_document_header_template && formData.invoice_document_template_name && (
              <Badge className="ml-2 bg-purple-600">Direct PDF</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Send invoice PDF document along with the WhatsApp template message
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="send_invoice_pdf">Send Invoice PDF</Label>
              <p className="text-xs text-muted-foreground">Attach PDF invoice with WhatsApp messages</p>
            </div>
            <Switch
              id="send_invoice_pdf"
              checked={formData.send_invoice_pdf}
              onCheckedChange={(checked) => handleInputChange("send_invoice_pdf", checked)}
              disabled={!formData.is_active}
            />
          </div>

          {formData.send_invoice_pdf && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="invoice_pdf_template">PDF Template</Label>
                <Select
                  value={formData.invoice_pdf_template}
                  onValueChange={(value) => handleInputChange("invoice_pdf_template", value)}
                >
                  <SelectTrigger id="invoice_pdf_template">
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="modern">Modern</SelectItem>
                    <SelectItem value="classic">Classic</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="minimal">Minimal</SelectItem>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="detailed">Detailed</SelectItem>
                    <SelectItem value="tax-invoice">Tax Invoice</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose which invoice template format to use for PDF generation
                </p>
              </div>

              <Separator />

              {/* Method Selection */}
              <div className="space-y-3">
                <Label className="font-medium">PDF Delivery Method</Label>
                
                {/* Method 1: Standard Attachment */}
                <div className={`p-4 rounded-lg border-2 transition-colors ${
                  !formData.use_document_header_template 
                    ? 'border-green-500 bg-green-100 dark:bg-green-900/40' 
                    : 'border-muted bg-muted/30'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id="method_standard"
                        name="pdf_method"
                        checked={!formData.use_document_header_template}
                        onChange={() => handleInputChange("use_document_header_template", false)}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="method_standard" className="font-medium cursor-pointer">
                        Standard Attachment
                      </Label>
                      <Badge variant="outline" className="text-xs bg-green-200 text-green-800 border-green-400 dark:bg-green-800 dark:text-green-100 dark:border-green-600">
                        TEXT Template
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-foreground/70 ml-6">
                    Uses TEXT/UTILITY template from "Invoice Template" above. PDF sent as separate message after template.
                    <span className="text-amber-700 dark:text-amber-400 font-medium"> Note: May fail if customer hasn't replied in 24 hours.</span>
                  </p>
                </div>

                {/* Method 2: Direct PDF Delivery */}
                <div className={`p-4 rounded-lg border-2 transition-colors ${
                  formData.use_document_header_template 
                    ? 'border-purple-500 bg-purple-100 dark:bg-purple-900/40' 
                    : 'border-muted bg-muted/30'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id="method_direct"
                        name="pdf_method"
                        checked={formData.use_document_header_template}
                        onChange={() => handleInputChange("use_document_header_template", true)}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="method_direct" className="font-medium cursor-pointer">
                        📎 Direct PDF Delivery (Recommended)
                      </Label>
                      <Badge variant="outline" className="text-xs bg-purple-200 text-purple-800 border-purple-400 dark:bg-purple-800 dark:text-purple-100 dark:border-purple-600">
                        DOCUMENT Template
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-foreground/70 ml-6">
                    Uses DOCUMENT header template. PDF embedded directly in template header.
                    <span className="text-green-700 dark:text-green-400 font-medium"> ✓ Bypasses 24-hour window restriction!</span>
                  </p>

                  {formData.use_document_header_template && (
                    <div className="space-y-3 mt-3 ml-6">
                      <Label className="text-sm">Document Header Template</Label>
                      <MetaTemplateSelector
                        templateType="invoice"
                        selectedTemplateId={null}
                        selectedTemplateName={formData.invoice_document_template_name}
                        params={formData.invoice_document_template_params}
                        onTemplateChange={(id, name) => handleInputChange("invoice_document_template_name", name)}
                        onParamsChange={(params) => handleInputChange("invoice_document_template_params", params)}
                        isOpen={openTemplateSection === 'document_header'}
                        onOpenChange={(open) => setOpenTemplateSection(open ? 'document_header' : null)}
                        forDocumentHeader={true}
                      />
                      <p className="text-xs text-foreground/60">
                        Only DOCUMENT header templates (marked with PDF badge) are shown here.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Configuration Summary */}
              <Alert className={formData.use_document_header_template 
                ? 'border-purple-300 bg-purple-100 dark:border-purple-700 dark:bg-purple-900/40' 
                : 'border-green-300 bg-green-100 dark:border-green-700 dark:bg-green-900/40'}>
                <CheckCircle className={`h-4 w-4 ${formData.use_document_header_template ? 'text-purple-700 dark:text-purple-300' : 'text-green-700 dark:text-green-300'}`} />
                <AlertTitle className={formData.use_document_header_template 
                  ? 'text-purple-900 dark:text-purple-100 font-semibold' 
                  : 'text-green-900 dark:text-green-100 font-semibold'}>
                  Current Configuration
                </AlertTitle>
                <AlertDescription className={`text-sm ${formData.use_document_header_template 
                  ? 'text-purple-800 dark:text-purple-200' 
                  : 'text-green-800 dark:text-green-200'}`}>
                  {formData.use_document_header_template ? (
                    <span>
                      Using <strong>Direct PDF Delivery</strong> with template "{formData.invoice_document_template_name || 'Not set'}". 
                      The "Invoice Template" in Message Templates section is <strong>disabled</strong>.
                    </span>
                  ) : (
                    <span>
                      Using <strong>Standard Attachment</strong>. 
                      Make sure "Invoice Template" above is set to a TEXT/UTILITY template (not DOCUMENT).
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            </>
          )}

          {!formData.is_active && (
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Enable WhatsApp API integration above to use PDF attachments
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Button Click Follow-up Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link className="h-4 w-4" />
            Button Click Follow-up
          </CardTitle>
          <CardDescription>
            When customer clicks template button, show them options: Invoice, Social Media, Google Review, or Chat
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>How it works:</strong> When customer clicks a CTA button in your template (Invoice Details, Chat With Us), 
              they see a menu with options. Based on their choice, the appropriate message is sent automatically (FREE within 24-hour window).
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="send_followup_on_button_click">Enable Interactive Follow-up Menu</Label>
              <p className="text-xs text-muted-foreground">Show options menu when customer clicks template button</p>
            </div>
            <Switch
              id="send_followup_on_button_click"
              checked={formData.send_followup_on_button_click}
              onCheckedChange={(checked) => handleInputChange("send_followup_on_button_click", checked)}
              disabled={!formData.is_active || !formData.auto_send_invoice}
            />
          </div>

          {formData.send_followup_on_button_click && (
            <>
              <Separator />
              
              {/* Menu Message */}
              <div className="space-y-2">
                <Label htmlFor="followup_menu_message">Menu Message</Label>
                <Textarea
                  id="followup_menu_message"
                  placeholder="Thank you for your interest! Please select..."
                  value={formData.followup_menu_message}
                  onChange={(e) => handleInputChange("followup_menu_message", e.target.value)}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">This message appears with the option buttons</p>
              </div>

              <Separator />

              {/* Response Messages */}
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="invoice">
                  <AccordionTrigger className="text-sm">📄 Invoice Link Response</AccordionTrigger>
                  <AccordionContent>
                    <Textarea
                      value={formData.followup_invoice_message}
                      onChange={(e) => handleInputChange("followup_invoice_message", e.target.value)}
                      rows={4}
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Placeholders: <code className="bg-muted px-1 rounded">{'{invoice_link}'}</code>, <code className="bg-muted px-1 rounded">{'{sale_number}'}</code>, <code className="bg-muted px-1 rounded">{'{customer_name}'}</code>
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="social">
                  <AccordionTrigger className="text-sm">📱 Social Media Response</AccordionTrigger>
                  <AccordionContent>
                    <Textarea
                      value={formData.followup_social_message}
                      onChange={(e) => handleInputChange("followup_social_message", e.target.value)}
                      rows={4}
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Placeholders: <code className="bg-muted px-1 rounded">{'{website}'}</code>, <code className="bg-muted px-1 rounded">{'{instagram}'}</code>, <code className="bg-muted px-1 rounded">{'{facebook}'}</code>
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="review">
                  <AccordionTrigger className="text-sm">⭐ Google Review Response</AccordionTrigger>
                  <AccordionContent>
                    <Textarea
                      value={formData.followup_review_message}
                      onChange={(e) => handleInputChange("followup_review_message", e.target.value)}
                      rows={4}
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Placeholder: <code className="bg-muted px-1 rounded">{'{google_review}'}</code>
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="chat">
                  <AccordionTrigger className="text-sm">💬 Chat With Us Response</AccordionTrigger>
                  <AccordionContent>
                    <Textarea
                      value={formData.followup_chat_message}
                      onChange={(e) => handleInputChange("followup_chat_message", e.target.value)}
                      rows={4}
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Placeholder: <code className="bg-muted px-1 rounded">{'{whatsapp_link}'}</code> (auto-generated from your phone number)
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <Separator />

              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Social & Business Links
                </Label>
                <p className="text-xs text-muted-foreground">
                  These links are used in follow-up responses
                </p>
                
                <div className="grid gap-3">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="https://yourwebsite.com"
                      value={formData.social_links?.website || ""}
                      onChange={(e) => handleSocialLinkChange("website", e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Instagram className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="https://instagram.com/yourpage"
                      value={formData.social_links?.instagram || ""}
                      onChange={(e) => handleSocialLinkChange("instagram", e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Facebook className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="https://facebook.com/yourpage"
                      value={formData.social_links?.facebook || ""}
                      onChange={(e) => handleSocialLinkChange("facebook", e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="https://g.page/r/YOUR_GOOGLE_REVIEW_LINK"
                      value={formData.social_links?.google_review || ""}
                      onChange={(e) => handleSocialLinkChange("google_review", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {!formData.auto_send_invoice && formData.is_active && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Enable "Auto-send Invoice" above to use this feature
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
