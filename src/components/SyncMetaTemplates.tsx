import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useWhatsAppAPI } from "@/hooks/useWhatsAppAPI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RefreshCw, Loader2, Plus, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const SyncMetaTemplates = () => {
  const { currentOrganization } = useOrganization();
  const { settings } = useWhatsAppAPI();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [manualTemplateName, setManualTemplateName] = useState("");
  const [manualTemplateLanguage, setManualTemplateLanguage] = useState("en_US");

  // Sync templates from Meta API
  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) throw new Error("No organization");
      if (!settings?.waba_id || !settings?.access_token) {
        throw new Error("WhatsApp API not configured. Please configure API credentials first.");
      }

      // Build dynamic API URL based on provider settings
      const baseUrl = settings.custom_api_url || 'https://graph.facebook.com';
      const version = settings.api_version || 'v21.0';

      // Call Meta/Provider API to fetch templates
      const response = await fetch(
        `${baseUrl}/${version}/${settings.waba_id}/message_templates?fields=name,status,category,language,components`,
        {
          headers: {
            Authorization: `Bearer ${settings.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.error?.message || "Failed to fetch templates from Meta");
      }

      const data = await response.json();
      const templates = data.data || [];

      // Filter only approved templates
      const approvedTemplates = templates.filter(
        (t: any) => t.status === "APPROVED"
      );

      // Upsert templates to database
      for (const template of approvedTemplates) {
        await supabase.from("whatsapp_meta_templates").upsert(
          {
            organization_id: currentOrganization.id,
            template_name: template.name,
            template_category: template.category,
            template_language: template.language,
            template_status: template.status,
            components: template.components,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "organization_id,template_name,template_language",
          }
        );
      }

      return approvedTemplates.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["meta-templates"] });
      toast.success(`Synced ${count} approved templates from Meta`);
    },
    onError: (error: any) => {
      console.error("Sync error:", error);
      toast.error(error.message || "Failed to sync templates");
    },
  });

  // Add template manually
  const addManualMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) throw new Error("No organization");
      if (!manualTemplateName.trim()) throw new Error("Template name required");

      const { error } = await supabase.from("whatsapp_meta_templates").insert({
        organization_id: currentOrganization.id,
        template_name: manualTemplateName.trim().toLowerCase(),
        template_language: manualTemplateLanguage,
        template_status: "APPROVED",
        template_category: "UTILITY",
      });

      if (error) {
        if (error.code === "23505") {
          throw new Error("Template already exists");
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-templates"] });
      toast.success("Template added successfully");
      setManualTemplateName("");
      setIsOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to add template");
    },
  });

  const canSync = settings?.waba_id && settings?.access_token;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => syncMutation.mutate()}
        disabled={syncMutation.isPending || !canSync}
        title={canSync ? "Sync templates from Meta" : "Configure API credentials first"}
      >
        {syncMutation.isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4 mr-2" />
        )}
        Sync from Meta
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Manually
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Template Manually</DialogTitle>
            <DialogDescription>
              Add an approved Meta template by entering its exact name as shown in Meta Business Manager.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template_name">Template Name</Label>
              <Input
                id="template_name"
                placeholder="e.g., invoice_notification"
                value={manualTemplateName}
                onChange={(e) => setManualTemplateName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter the exact template name (lowercase, underscores)
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="template_language">Language Code</Label>
              <Input
                id="template_language"
                placeholder="e.g., en_US"
                value={manualTemplateLanguage}
                onChange={(e) => setManualTemplateLanguage(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addManualMutation.mutate()}
              disabled={addManualMutation.isPending || !manualTemplateName.trim()}
            >
              {addManualMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Add Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SyncMetaTemplates;
