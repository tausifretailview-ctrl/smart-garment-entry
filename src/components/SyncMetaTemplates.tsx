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
import { RefreshCw, Loader2, Plus, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import {
  canSyncWhatsAppTemplates,
  isThirdPartyWhatsAppProvider,
  resolveWabaIdForTemplates,
} from "@/lib/whatsappApiUrl";
import {
  isEdgeFunctionUnreachableError,
  parseEdgeFunctionInvokeError,
  syncWhatsAppTemplatesFromProvider,
} from "@/lib/syncWhatsAppTemplates";

export const SyncMetaTemplates = () => {
  const { currentOrganization } = useOrganization();
  const { settings } = useWhatsAppAPI();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [manualTemplateName, setManualTemplateName] = useState("");
  const [manualTemplateLanguage, setManualTemplateLanguage] = useState("en_US");

  const isThirdParty = isThirdPartyWhatsAppProvider(settings?.api_provider);
  const syncLabel = isThirdParty ? "Sync from Provider" : "Sync from Meta";

  // Sync templates via edge function (uses org third-party or Meta credentials server-side)
  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) throw new Error("No organization");
      if (!settings?.access_token?.trim()) {
        throw new Error("Configure access token and save settings first");
      }

      const orgSyncSettings = {
        api_provider: settings.api_provider,
        custom_api_url: settings.custom_api_url,
        api_version: settings.api_version,
        waba_id: settings.waba_id,
        business_id: settings.business_id,
        access_token: settings.access_token,
      };

      // Own org credentials: sync directly so we never pull platform-default (old account) templates.
      const usePlatformDefault = settings.use_default_api === true;
      if (!usePlatformDefault && canSyncWhatsAppTemplates(orgSyncSettings)) {
        const result = await syncWhatsAppTemplatesFromProvider(
          currentOrganization.id,
          orgSyncSettings,
        );
        return result.count;
      }

      const { data, error } = await supabase.functions.invoke("sync-whatsapp-templates", {
        body: { organizationId: currentOrganization.id },
      });

      if (data && data.success === false) {
        throw new Error(data.error || "Failed to sync templates");
      }

      if (!error && data?.success) {
        return data.count as number;
      }

      // Edge function missing or unreachable — sync directly using saved org credentials
      if (error && (isEdgeFunctionUnreachableError(error) || !data)) {
        console.warn("sync-whatsapp-templates edge call failed, using direct provider API", error);
        const result = await syncWhatsAppTemplatesFromProvider(currentOrganization.id, {
          api_provider: settings.api_provider,
          custom_api_url: settings.custom_api_url,
          api_version: settings.api_version,
          waba_id: settings.waba_id,
          business_id: settings.business_id,
          access_token: settings.access_token,
        });
        return result.count;
      }

      if (error) {
        throw new Error(await parseEdgeFunctionInvokeError(error));
      }

      throw new Error("Failed to sync templates");
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["meta-templates"] });
      const via = isThirdParty ? "your API provider" : "Meta";
      toast.success(`Synced ${count} approved templates from ${via}`);
    },
    onError: (error: unknown) => {
      console.error("Sync error:", error);
      const message = error instanceof Error ? error.message : "Failed to sync templates";
      toast.error(message);
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
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to add template";
      toast.error(message);
    },
  });

  const canSync = canSyncWhatsAppTemplates(settings);
  const wabaHint = settings
    ? resolveWabaIdForTemplates(settings)
    : "";

  const syncDisabledReason = !settings?.access_token?.trim()
    ? "Configure access token and save settings first"
    : !wabaHint
      ? isThirdParty
        ? "Enter Business ID or WABA ID from your provider, then save"
        : "Enter WhatsApp Business Account ID (WABA), then save"
      : isThirdParty && !settings?.custom_api_url?.trim()
        ? "Enter Custom API URL for your third-party provider, then save"
        : undefined;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {isThirdParty && (
        <p className="text-xs text-muted-foreground sm:mr-2">
          Using third-party API
          {settings?.custom_api_url ? `: ${settings.custom_api_url.replace(/^https?:\/\//i, "").split("/")[0]}` : ""}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending || !canSync}
          title={canSync ? syncLabel : syncDisabledReason}
        >
          {syncMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {syncLabel}
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
                Add an approved template by entering its exact name as shown in your provider or Meta Business Manager.
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
    </div>
  );
};

export default SyncMetaTemplates;
