import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  applyCustomerPageToggle,
  CUSTOMER_PAGE_DEFAULTS,
  type CustomerPageFlags,
} from "@/utils/customerPageSettings";

const ROWS: Array<{ key: keyof CustomerPageFlags; label: string; hint: string; next?: boolean }> = [
  {
    key: "enabled",
    label: "Customer page",
    hint: "Customers can open their bill online and give feedback from a private link.",
  },
  {
    key: "push_enabled",
    label: "Bill notifications",
    hint: "Customers who allow notifications get their bill as a phone notification after a POS sale.",
  },
  {
    key: "add_link_to_whatsapp",
    label: "Add bill link to WhatsApp message",
    hint: "The invoice WhatsApp message will include the customer's bill link.",
    next: true,
  },
  {
    key: "print_qr_on_bill",
    label: "Print QR code on bill",
    hint: "The printed bill will carry a QR code that opens the customer's bill page.",
    next: true,
  },
];

export function CustomerPageSettings() {
  const { currentOrganization, organizationRole } = useOrganization();
  const orgId = currentOrganization?.id;
  const isAdmin = organizationRole === "admin";
  const queryClient = useQueryClient();
  const [flags, setFlags] = useState<CustomerPageFlags>(CUSTOMER_PAGE_DEFAULTS);
  const [savingKey, setSavingKey] = useState<keyof CustomerPageFlags | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["customer-page-settings", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [settingsRes, orgRes] = await Promise.all([
        supabase
          .from("customer_page_settings")
          .select("enabled, push_enabled, add_link_to_whatsapp, print_qr_on_bill")
          .eq("organization_id", orgId!)
          .maybeSingle(),
        supabase.from("organizations").select("public_subdomain").eq("id", orgId!).maybeSingle(),
      ]);
      if (settingsRes.error) throw settingsRes.error;
      return {
        flags: settingsRes.data ?? CUSTOMER_PAGE_DEFAULTS,
        subdomain: orgRes.data?.public_subdomain ?? null,
      };
    },
  });

  useEffect(() => {
    if (data) setFlags(data.flags);
  }, [data]);

  const handleToggle = async (key: keyof CustomerPageFlags, value: boolean) => {
    if (!orgId || savingKey) return;
    const previous = flags;
    const next = applyCustomerPageToggle(flags, key, value);
    setFlags(next);
    setSavingKey(key);
    const { error } = await supabase
      .from("customer_page_settings")
      .upsert({ organization_id: orgId, ...next }, { onConflict: "organization_id" });
    setSavingKey(null);
    if (error) {
      setFlags(previous);
      toast.error("Could not save: only an organization admin can change this setting.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["customer-page-settings", orgId] });
    toast.success("Saved");
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const noSubdomain = !data?.subdomain;

  return (
    <div className="space-y-3">
      {noSubdomain && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            The customer page web address is not set up for this shop yet. Contact support to activate it; until
            then these settings have no effect.
          </AlertDescription>
        </Alert>
      )}
      {!isAdmin && (
        <p className="text-xs text-muted-foreground">Only an organization admin can change these settings.</p>
      )}
      {ROWS.map(({ key, label, hint, next }) => {
        const dependsOnPage = key !== "enabled";
        const disabled = !isAdmin || !!savingKey || (dependsOnPage && !flags.enabled);
        return (
          <div key={key} className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor={`cps-${key}`} className="flex items-center gap-2">
                {label}
                {next && (
                  <Badge variant="secondary" className="text-[10px]">
                    Next update
                  </Badge>
                )}
              </Label>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
            <Switch
              id={`cps-${key}`}
              checked={flags[key]}
              disabled={disabled}
              onCheckedChange={(checked) => void handleToggle(key, checked)}
            />
          </div>
        );
      })}
    </div>
  );
}
