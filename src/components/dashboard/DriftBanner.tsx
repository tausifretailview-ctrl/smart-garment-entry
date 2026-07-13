import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserRoles } from "@/hooks/useUserRoles";

/**
 * Small dashboard banner: shows when this org has open CRITICAL settlement drift.
 * Read-only — links to the platform admin data-integrity page for platform admins.
 */
export function DriftBanner() {
  const { currentOrganization } = useOrganization();
  const { isPlatformAdmin } = useUserRoles();
  const orgId = currentOrganization?.id;

  const { data: count = 0 } = useQuery({
    enabled: !!orgId,
    queryKey: ["org-drift-count", orgId],
    queryFn: async () => {
      const { count: c } = await supabase
        .from("settlement_drift_log" as any)
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId!)
        .eq("severity", "critical")
        .is("resolved_at", null);
      return c || 0;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!count) return null;

  return (
    <div className="mb-2 flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <div className="flex-1">
        <span className="font-semibold text-destructive">{count} invoice{count === 1 ? "" : "s"} need review</span>
        <span className="ml-2 text-muted-foreground">
          payment records don't match receipts.
        </span>
      </div>
      {isPlatformAdmin && (
        <a
          href="/platform-admin/data-integrity"
          className="rounded-md border border-destructive/40 bg-white px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
        >
          Review
        </a>
      )}
    </div>
  );
}