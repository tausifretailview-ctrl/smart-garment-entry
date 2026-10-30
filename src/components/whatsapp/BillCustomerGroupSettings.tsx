import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getEdgeFunctionErrorMessage } from "@/utils/edgeFunctionError";

interface GatewayGroup {
  id: string;
  name: string;
  size: number;
  isAdmin?: boolean;
}

interface GroupJoinSettings {
  builtin_save_contacts: boolean;
  builtin_group_id: string | null;
  builtin_group_name: string | null;
  builtin_group_invite_fallback: boolean;
}

const NO_GROUP = "__none__";

const STATUS_LABELS: Record<string, string> = {
  added: "added to group",
  already: "already in group",
  invited: "sent invite link",
  privacy: "blocked by privacy",
  not_admin: "number not group admin",
  left_recently: "left recently",
  full: "group full",
  failed: "failed",
};

/**
 * Ezzy ERP WhatsApp: after a sale bill is sent, save the customer's number as a contact on the
 * linked WhatsApp, and/or end the bill message with the join link of one group this number is admin
 * of. Customers are no longer added to the group directly (that got shop numbers banned). Off by default.
 */
export function BillCustomerGroupSettings() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();
  const [form, setForm] = useState<GroupJoinSettings | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: saved, isLoading } = useQuery({
    queryKey: ["whatsapp-group-join-settings", orgId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("whatsapp_api_settings") as any)
        .select("builtin_save_contacts, builtin_group_id, builtin_group_name, builtin_group_invite_fallback")
        .eq("organization_id", orgId)
        .maybeSingle();
      // Columns not created yet (SQL not run): hide the section.
      if (error) return { missing: true as const };
      return { missing: false as const, row: (data ?? null) as GroupJoinSettings | null };
    },
    enabled: !!orgId,
  });

  useEffect(() => {
    if (saved && !saved.missing) {
      setForm({
        builtin_save_contacts: saved.row?.builtin_save_contacts === true,
        builtin_group_id: saved.row?.builtin_group_id ?? null,
        builtin_group_name: saved.row?.builtin_group_name ?? null,
        builtin_group_invite_fallback: saved.row?.builtin_group_invite_fallback !== false,
      });
    }
  }, [saved]);

  const groupsQuery = useQuery({
    queryKey: ["whatsapp-gateway-groups", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-gateway-proxy", {
        body: { action: "groups", organizationId: orgId },
      });
      if (error) throw new Error(await getEdgeFunctionErrorMessage(error, data, "Could not load WhatsApp groups"));
      return ((data?.groups ?? []) as GatewayGroup[]).sort(
        (a, b) => Number(Boolean(b.isAdmin)) - Number(Boolean(a.isAdmin)) || a.name.localeCompare(b.name),
      );
    },
    enabled: !!orgId && !!saved && !saved.missing,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const { data: recent } = useQuery({
    queryKey: ["whatsapp-group-joins-today", orgId],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data, error } = await (supabase.from("whatsapp_group_joins" as any) as any)
        .select("contact_status, group_status")
        .eq("organization_id", orgId)
        .gte("created_at", start.toISOString())
        .limit(1000);
      if (error) return null;
      return (data ?? []) as { contact_status: string | null; group_status: string }[];
    },
    enabled: !!orgId && !!saved && !saved.missing,
    staleTime: 60_000,
  });

  if (!orgId || isLoading || !saved || saved.missing || !form) return null;

  const groups = groupsQuery.data ?? [];
  const selectedMissing = form.builtin_group_id && !groups.some((g) => g.id === form.builtin_group_id);

  const save = async () => {
    setSaving(true);
    try {
      const { data, error } = await (supabase.from("whatsapp_api_settings") as any)
        .update(form)
        .eq("organization_id", orgId)
        .select("organization_id");
      if (error) throw error;
      if (!data?.length) throw new Error("Click Save Settings below once first, then save this again.");
      toast.success("Bill customer settings saved");
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-group-join-settings", orgId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const counts = new Map<string, number>();
  let contactsSaved = 0;
  for (const r of recent ?? []) {
    counts.set(r.group_status, (counts.get(r.group_status) ?? 0) + 1);
    if (r.contact_status === "saved") contactsSaved++;
  }
  const summary = [
    contactsSaved ? `${contactsSaved} contacts saved` : "",
    ...[...counts].filter(([k]) => STATUS_LABELS[k]).map(([k, n]) => `${n} ${STATUS_LABELS[k]}`),
  ].filter(Boolean);

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-start gap-2">
        <Users className="h-4 w-4 mt-0.5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Bill customers: save contact &amp; group link</p>
          <p className="text-xs text-muted-foreground">
            After a sale bill is sent on WhatsApp, the customer's number can be saved on this WhatsApp (once per
            customer, up to 30 a day, never in the first day after linking), and the bill can end with your
            group's join link so customers join by themselves.
          </p>
          <p className="text-xs text-destructive mt-1">
            WhatsApp bans numbers that add people to groups without asking, so customers are not added directly.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="builtin_save_contacts" className="text-sm font-normal">
          Save customer number as a contact on this WhatsApp
        </Label>
        <Switch
          id="builtin_save_contacts"
          checked={form.builtin_save_contacts}
          onCheckedChange={(v) => setForm({ ...form, builtin_save_contacts: v })}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm font-normal">WhatsApp group for the join link</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={groupsQuery.isFetching}
            onClick={() => void groupsQuery.refetch()}
          >
            {groupsQuery.isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        </div>
        <Select
          value={form.builtin_group_id ?? NO_GROUP}
          onValueChange={(v) => {
            const g = groups.find((x) => x.id === v);
            setForm({
              ...form,
              builtin_group_id: v === NO_GROUP ? null : v,
              builtin_group_name: v === NO_GROUP ? null : g?.name ?? form.builtin_group_name,
            });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="No group link" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_GROUP}>No group link</SelectItem>
            {selectedMissing && (
              <SelectItem value={form.builtin_group_id!}>{form.builtin_group_name || "Saved group"}</SelectItem>
            )}
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id} disabled={!g.isAdmin}>
                {g.name} ({g.size}){g.isAdmin ? "" : " · not admin"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {groupsQuery.error && (
          <p className="text-xs text-destructive">{(groupsQuery.error as Error).message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Only groups where this WhatsApp number is an admin can be picked (WhatsApp gives the join link only to
          admins).
        </p>
      </div>

      {form.builtin_group_id && (
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="builtin_group_invite_fallback" className="text-sm font-normal">
            Add the group's join link at the end of every sale bill message
          </Label>
          <Switch
            id="builtin_group_invite_fallback"
            checked={form.builtin_group_invite_fallback}
            onCheckedChange={(v) => setForm({ ...form, builtin_group_invite_fallback: v })}
          />
        </div>
      )}

      {summary.length > 0 && <p className="text-xs text-muted-foreground">Today: {summary.join(", ")}</p>}

      <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Save
      </Button>
    </div>
  );
}
