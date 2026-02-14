import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  MessageSquare, 
  Save,
  CheckCircle, 
  XCircle, 
  Eye,
  EyeOff,
  Loader2,
  Info,
  Phone
} from "lucide-react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PlatformWhatsAppCredentials {
  phone_number_id: string;
  waba_id: string;
  access_token: string;
  business_name: string;
  api_provider: "meta_direct" | "third_party";
  custom_api_url: string;
  api_version: string;
  business_id: string;
}

export const PlatformWhatsAppSettings = () => {
  const queryClient = useQueryClient();
  const [showToken, setShowToken] = useState(false);
  const [formData, setFormData] = useState<PlatformWhatsAppCredentials>({
    phone_number_id: "",
    waba_id: "",
    access_token: "",
    business_name: "",
    api_provider: "meta_direct",
    custom_api_url: "",
    api_version: "v21.0",
    business_id: "",
  });

  // Fetch platform settings
  const { data: platformSettings, isLoading } = useQuery({
    queryKey: ['platform-whatsapp-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .eq('setting_key', 'default_whatsapp_api')
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch orgs using platform default
  const { data: orgsUsingDefault = [] } = useQuery({
    queryKey: ['orgs-using-default-whatsapp'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_api_settings')
        .select(`
          organization_id,
          is_active,
          chatbot_enabled,
          organizations!inner(name, slug)
        `)
        .eq('use_default_api', true);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch message stats per org
  const { data: orgStats = [] } = useQuery({
    queryKey: ['platform-whatsapp-stats'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from('whatsapp_logs')
        .select('organization_id, status')
        .gte('created_at', today.toISOString());
      
      if (error) throw error;
      
      // Aggregate by org
      const statsMap = new Map<string, { sent: number; delivered: number; failed: number }>();
      
      (data || []).forEach((log: any) => {
        const orgId = log.organization_id;
        if (!statsMap.has(orgId)) {
          statsMap.set(orgId, { sent: 0, delivered: 0, failed: 0 });
        }
        const stats = statsMap.get(orgId)!;
        if (log.status === 'sent') stats.sent++;
        else if (log.status === 'delivered') stats.delivered++;
        else if (log.status === 'failed') stats.failed++;
      });
      
      return Array.from(statsMap.entries()).map(([orgId, stats]) => ({
        organization_id: orgId,
        ...stats,
      }));
    },
  });

  // Load settings into form
  useEffect(() => {
    if (platformSettings?.setting_value) {
      const value = platformSettings.setting_value as unknown as PlatformWhatsAppCredentials;
      setFormData({
        phone_number_id: value.phone_number_id || "",
        waba_id: value.waba_id || "",
        access_token: value.access_token || "",
        business_name: value.business_name || "",
        api_provider: value.api_provider || "meta_direct",
        custom_api_url: value.custom_api_url || "",
        api_version: value.api_version || "v21.0",
        business_id: value.business_id || "",
      });
    }
  }, [platformSettings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Cast to JSON-compatible format
      const jsonValue = JSON.parse(JSON.stringify(formData));
      const { error } = await supabase
        .from('platform_settings')
        .update({ 
          setting_value: jsonValue,
          updated_at: new Date().toISOString(),
        })
        .eq('setting_key', 'default_whatsapp_api');
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-whatsapp-settings'] });
      toast.success('Platform WhatsApp settings saved successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save settings');
    },
  });

  const handleInputChange = (field: keyof PlatformWhatsAppCredentials, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isConfigured = formData.phone_number_id && formData.access_token;

  if (isLoading) {
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
            Platform Default WhatsApp API
          </h3>
          <p className="text-sm text-muted-foreground">
            Configure the shared WhatsApp number used by all organizations
          </p>
        </div>
        <Badge variant={isConfigured ? "default" : "secondary"}>
          {isConfigured ? (
            <><CheckCircle className="h-3 w-3 mr-1" /> Configured</>
          ) : (
            <><XCircle className="h-3 w-3 mr-1" /> Not Configured</>
          )}
        </Badge>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Shared WhatsApp Number</AlertTitle>
        <AlertDescription className="text-sm">
          Organizations can use this shared WhatsApp number instead of configuring their own. 
          Each organization's messages, reports, and chatbot settings remain separate.
        </AlertDescription>
      </Alert>

      {/* API Credentials Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4" />
            API Credentials
          </CardTitle>
          <CardDescription>
            Enter the WhatsApp Business API credentials for the platform-wide shared number
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
              <div className="space-y-2">
                <Label htmlFor="platform_custom_api_url">Custom API URL</Label>
                <Input
                  id="platform_custom_api_url"
                  placeholder="e.g., https://crmapi.wappconnect.com/api/meta"
                  value={formData.custom_api_url}
                  onChange={(e) => handleInputChange("custom_api_url", e.target.value)}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="platform_api_version">API Version</Label>
                  <Input
                    id="platform_api_version"
                    placeholder="e.g., v19.0"
                    value={formData.api_version}
                    onChange={(e) => handleInputChange("api_version", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="platform_business_id">Business ID</Label>
                  <Input
                    id="platform_business_id"
                    placeholder="e.g., 24732513237950"
                    value={formData.business_id}
                    onChange={(e) => handleInputChange("business_id", e.target.value)}
                  />
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="waba_id">WhatsApp Business Account ID</Label>
              <Input
                id="waba_id"
                placeholder="e.g., 123456789012345"
                value={formData.waba_id}
                onChange={(e) => handleInputChange("waba_id", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="access_token">Access Token</Label>
            <div className="relative">
              <Input
                id="access_token"
                type={showToken ? "text" : "password"}
                placeholder={formData.api_provider === "third_party" ? "Access Token (may be temporary)" : "Permanent Access Token"}
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="business_name">Business Name</Label>
            <Input
              id="business_name"
              placeholder="Platform Business Name"
              value={formData.business_name}
              onChange={(e) => handleInputChange("business_name", e.target.value)}
            />
          </div>

          <div className="flex justify-end pt-4">
            <Button 
              onClick={() => saveMutation.mutate()} 
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
              ) : (
                <><Save className="h-4 w-4 mr-2" /> Save Credentials</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Organizations Using Default */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organizations Using Platform Default</CardTitle>
          <CardDescription>
            Organizations that are using the shared WhatsApp number
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orgsUsingDefault.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No organizations are using the platform default WhatsApp number yet.
            </p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Chatbot</TableHead>
                    <TableHead className="text-right">Today's Messages</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgsUsingDefault.map((org: any) => {
                    const stats = orgStats.find((s: any) => s.organization_id === org.organization_id);
                    return (
                      <TableRow key={org.organization_id}>
                        <TableCell className="font-medium">
                          {org.organizations?.name || 'Unknown'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={org.is_active ? "default" : "secondary"}>
                            {org.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={org.chatbot_enabled ? "outline" : "secondary"}>
                            {org.chatbot_enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {stats ? (
                            <span className="text-sm">
                              <span className="text-green-600">{stats.sent + stats.delivered}</span>
                              {stats.failed > 0 && (
                                <span className="text-red-600 ml-2">({stats.failed} failed)</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
