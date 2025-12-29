import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { MessageSquare, Save, Settings } from "lucide-react";

interface SMSSettings {
  id?: string;
  provider: string;
  sender_id: string;
  is_active: boolean;
}

interface Template {
  id: string;
  template_type: string;
  template_name: string;
  message_template: string;
  dlt_template_id: string;
  is_active: boolean;
}

const defaultTemplates = {
  sales_invoice: `Dear {customer_name}, Thank you for your purchase! Invoice {invoice_number} dated {invoice_date}. Amount: Rs.{amount}. Status: {payment_status}. - {business_name}`,
  
  payment_reminder: `Dear {customer_name}, Reminder: Invoice {invoice_number} has pending amount Rs.{pending_amount}. Due date: {due_date}. Kindly pay at earliest. - {business_name}`,
  
  promotional: `Dear Customer, {promotional_message}. Visit us today! - {business_name}`,
  
  delivery_update: `Dear {customer_name}, Your order {invoice_number} is {delivery_status}. Thank you for shopping with us! - {business_name}`,
};

const templateLabels = {
  sales_invoice: "Sale Invoice Alert",
  payment_reminder: "Payment Reminder",
  promotional: "Promotional Message",
  delivery_update: "Delivery Update",
};

const templateDescriptions = {
  sales_invoice: "Sent after a sale is completed",
  payment_reminder: "Sent for outstanding payments",
  promotional: "Marketing and promotional messages",
  delivery_update: "Delivery status updates",
};

export const SMSTemplateSettings = () => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [templates, setTemplates] = useState<Record<string, { message: string; dlt_id: string }>>({});
  const [smsSettings, setSmsSettings] = useState<SMSSettings>({
    provider: "msg91",
    sender_id: "",
    is_active: false,
  });

  // Fetch SMS settings
  const { data: existingSettings, isLoading: loadingSettings } = useQuery({
    queryKey: ["sms-settings", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const { data, error } = await supabase
        .from("sms_settings")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch existing templates
  const { data: existingTemplates, isLoading: loadingTemplates } = useQuery({
    queryKey: ["sms-templates", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from("sms_templates")
        .select("*")
        .eq("organization_id", currentOrganization.id);

      if (error) throw error;
      return data as Template[];
    },
    enabled: !!currentOrganization?.id,
  });

  // Initialize state when data loads
  useEffect(() => {
    if (existingSettings) {
      setSmsSettings({
        id: existingSettings.id,
        provider: existingSettings.provider || "msg91",
        sender_id: existingSettings.sender_id || "",
        is_active: existingSettings.is_active || false,
      });
    }
  }, [existingSettings]);

  useEffect(() => {
    if (existingTemplates !== undefined) {
      const templateState: Record<string, { message: string; dlt_id: string }> = {};
      Object.keys(defaultTemplates).forEach((type) => {
        const existing = existingTemplates?.find((t) => t.template_type === type);
        templateState[type] = {
          message: existing?.message_template || defaultTemplates[type as keyof typeof defaultTemplates],
          dlt_id: existing?.dlt_template_id || "",
        };
      });
      setTemplates(templateState);
    }
  }, [existingTemplates]);

  // Save SMS settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: SMSSettings) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");

      if (settings.id) {
        const { error } = await supabase
          .from("sms_settings")
          .update({
            provider: settings.provider,
            sender_id: settings.sender_id,
            is_active: settings.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("sms_settings").insert({
          organization_id: currentOrganization.id,
          provider: settings.provider,
          sender_id: settings.sender_id,
          is_active: settings.is_active,
        });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sms-settings"] });
      toast.success("SMS settings saved successfully");
    },
    onError: (error) => {
      console.error("Error saving SMS settings:", error);
      toast.error("Failed to save SMS settings");
    },
  });

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async ({ templateType, message, dltId }: { templateType: string; message: string; dltId: string }) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");

      const existing = existingTemplates?.find((t) => t.template_type === templateType);

      if (existing) {
        const { error } = await supabase
          .from("sms_templates")
          .update({
            message_template: message,
            dlt_template_id: dltId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("sms_templates").insert({
          organization_id: currentOrganization.id,
          template_type: templateType,
          template_name: templateLabels[templateType as keyof typeof templateLabels],
          message_template: message,
          dlt_template_id: dltId,
          is_active: true,
        });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sms-templates"] });
      toast.success("Template saved successfully");
    },
    onError: (error) => {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
    },
  });

  const handleSaveSettings = () => {
    saveSettingsMutation.mutate(smsSettings);
  };

  const handleSaveTemplate = (templateType: string) => {
    const template = templates[templateType];
    if (!template?.message?.trim()) {
      toast.error("Template message cannot be empty");
      return;
    }

    saveTemplateMutation.mutate({
      templateType,
      message: template.message,
      dltId: template.dlt_id,
    });
  };

  const handleResetTemplate = (templateType: string) => {
    setTemplates((prev) => ({
      ...prev,
      [templateType]: {
        message: defaultTemplates[templateType as keyof typeof defaultTemplates],
        dlt_id: prev[templateType]?.dlt_id || "",
      },
    }));
    toast.success("Template reset to default");
  };

  const getCharacterCount = (message: string) => {
    const length = message?.length || 0;
    const smsCount = Math.ceil(length / 160) || 1;
    return { length, smsCount };
  };

  if (loadingSettings || loadingTemplates) {
    return <div>Loading SMS settings...</div>;
  }

  return (
    <div className="space-y-6">
      {/* SMS Provider Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <CardTitle>SMS Provider Settings</CardTitle>
          </div>
          <CardDescription>
            Configure your MSG91 SMS provider settings. You'll need to add the MSG91_API_KEY in Supabase secrets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable SMS</Label>
              <p className="text-sm text-muted-foreground">Turn on SMS notifications</p>
            </div>
            <Switch
              checked={smsSettings.is_active}
              onCheckedChange={(checked) => setSmsSettings((prev) => ({ ...prev, is_active: checked }))}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="provider">SMS Provider</Label>
              <Input id="provider" value="MSG91" disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sender_id">Sender ID (6 characters)</Label>
              <Input
                id="sender_id"
                value={smsSettings.sender_id}
                onChange={(e) => setSmsSettings((prev) => ({ ...prev, sender_id: e.target.value.toUpperCase().slice(0, 6) }))}
                placeholder="e.g., NOTIFY"
                maxLength={6}
              />
            </div>
          </div>

          <Button onClick={handleSaveSettings} disabled={saveSettingsMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Save Settings
          </Button>
        </CardContent>
      </Card>

      {/* SMS Templates */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <CardTitle>SMS Message Templates</CardTitle>
          </div>
          <CardDescription>
            Customize SMS messages for different events. Available placeholders: {"{customer_name}"}, {"{invoice_number}"}, {"{amount}"}, {"{payment_status}"}, {"{invoice_date}"}, {"{pending_amount}"}, {"{due_date}"}, {"{delivery_status}"}, {"{business_name}"}, {"{promotional_message}"}
            <br />
            <span className="text-yellow-600 dark:text-yellow-400">Note: SMS has a 160 character limit per message. Longer messages will be split into multiple SMS.</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.entries(templateLabels).map(([type, label]) => {
            const template = templates[type] || { message: "", dlt_id: "" };
            const { length, smsCount } = getCharacterCount(template.message);

            return (
              <div key={type} className="space-y-3 p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-semibold">{label}</Label>
                    <p className="text-sm text-muted-foreground">
                      {templateDescriptions[type as keyof typeof templateDescriptions]}
                    </p>
                  </div>
                  <span className={`text-sm ${length > 160 ? "text-yellow-600" : "text-muted-foreground"}`}>
                    {length}/160 chars ({smsCount} SMS)
                  </span>
                </div>

                <Textarea
                  value={template.message}
                  onChange={(e) =>
                    setTemplates((prev) => ({
                      ...prev,
                      [type]: { ...prev[type], message: e.target.value },
                    }))
                  }
                  rows={3}
                  className="font-mono text-sm"
                  placeholder="Enter your SMS template..."
                />

                <div className="space-y-2">
                  <Label htmlFor={`dlt-${type}`}>DLT Template ID (for India)</Label>
                  <Input
                    id={`dlt-${type}`}
                    value={template.dlt_id}
                    onChange={(e) =>
                      setTemplates((prev) => ({
                        ...prev,
                        [type]: { ...prev[type], dlt_id: e.target.value },
                      }))
                    }
                    placeholder="Enter DLT Template ID"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleSaveTemplate(type)}
                    disabled={saveTemplateMutation.isPending}
                    size="sm"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save Template
                  </Button>
                  <Button onClick={() => handleResetTemplate(type)} variant="outline" size="sm">
                    Reset to Default
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};
