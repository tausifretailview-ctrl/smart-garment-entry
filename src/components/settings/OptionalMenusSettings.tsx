import { useState } from "react";
import { LayoutList } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOptionalMenus } from "@/hooks/useOptionalMenus";
import { OPTIONAL_MENU_GROUPS, OPTIONAL_MENU_GROUP_KEYS, type OptionalMenuGroup } from "@/utils/optionalMenus";
import { SettingsSection, SettingsToggle } from "@/components/settings/settingsLayout";

/**
 * Settings → Users → Optional menus. Turn a group of rarely used screens on or off for the whole
 * shop (organizations.settings.optional_menus). New shops start with every group off; user rights
 * still decide who sees a group that is on. Admins only; each switch saves at once.
 */
export function OptionalMenusSettings() {
  const { currentOrganization, organizationRole, refetchOrganizations } = useOrganization();
  const menus = useOptionalMenus();
  const [saving, setSaving] = useState<OptionalMenuGroup | null>(null);
  const isAdmin = organizationRole === "admin";

  const toggle = async (key: OptionalMenuGroup, on: boolean) => {
    const orgId = currentOrganization?.id;
    if (!orgId || !isAdmin) return;
    setSaving(key);
    try {
      // Re-read first so another setting written meanwhile (website theme, etc.) is kept.
      const { data, error: readErr } = await supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle();
      if (readErr) throw readErr;
      const current =
        data?.settings && typeof data.settings === "object" && !Array.isArray(data.settings)
          ? (data.settings as Record<string, unknown>)
          : {};
      const prevMenus =
        current.optional_menus && typeof current.optional_menus === "object"
          ? (current.optional_menus as Record<string, unknown>)
          : {};
      const next = { ...current, optional_menus: { ...prevMenus, [key]: on } };
      const { error } = await supabase.from("organizations").update({ settings: next as Json }).eq("id", orgId);
      if (error) throw error;
      refetchOrganizations();
      toast.success(`${OPTIONAL_MENU_GROUPS[key].label} ${on ? "shown" : "hidden"} in the menu`);
    } catch (err) {
      toast.error("Could not save", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(null);
    }
  };

  return (
    <SettingsSection
      title="Optional menus"
      subtitle="Screens most shops do not need. New shops start with these hidden; turn on what you use. User rights still apply."
      icon={LayoutList}
      tone="violet"
    >
      <div className="grid gap-2 p-4 md:grid-cols-2" data-testid="optional-menus-settings">
        {OPTIONAL_MENU_GROUP_KEYS.map((key) => (
          <SettingsToggle
            key={key}
            id={`optional-menu-${key}`}
            label={OPTIONAL_MENU_GROUPS[key].label}
            description={OPTIONAL_MENU_GROUPS[key].help}
            checked={menus[key]}
            disabled={!isAdmin || saving !== null}
            onCheckedChange={(on) => void toggle(key, on)}
          />
        ))}
        {!isAdmin ? (
          <p className="text-xs text-muted-foreground md:col-span-2">Only an admin can change these.</p>
        ) : null}
      </div>
    </SettingsSection>
  );
}
