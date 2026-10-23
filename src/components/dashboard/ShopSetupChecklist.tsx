import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Rocket, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SETUP_SHOW_DAYS,
  setupProgress,
  type ShopSetupFacts,
  type ShopSetupStep,
  buildShopSetupSteps,
} from "@/utils/shopSetupSteps";

const dismissKey = (orgId: string) => `ezzy-shop-setup-dismissed:${orgId}`;

function readDismissed(orgId: string): boolean {
  try {
    return localStorage.getItem(dismissKey(orgId)) === "1";
  } catch {
    return false;
  }
}

async function headCount(table: "products" | "customers" | "sales", orgId: string) {
  const { count, error } = await supabase
    .from(table as "sales")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("deleted_at", null);
  return error ? 0 : count ?? 0;
}

async function memberCount(orgId: string) {
  const { count, error } = await supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  return error ? 0 : count ?? 0;
}

/** Counts are head requests (no rows sent), so this stays cheap even for big shops. */
async function fetchShopSetupFacts(orgId: string): Promise<ShopSetupFacts | null> {
  // Older shops never see the card, so they skip the counts below.
  const { data: org } = await supabase.from("organizations").select("created_at").eq("id", orgId).maybeSingle();
  const createdAt = (org as { created_at?: string } | null)?.created_at;
  if (!createdAt || (Date.now() - new Date(createdAt).getTime()) / 86_400_000 > SETUP_SHOW_DAYS) return null;

  const [settings, wa, products, customers, sales, members] = await Promise.all([
    supabase
      .from("settings")
      .select("business_name, address, mobile_number, sale_settings")
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase.from("whatsapp_api_settings").select("is_active").eq("organization_id", orgId).maybeSingle(),
    headCount("products", orgId),
    headCount("customers", orgId),
    headCount("sales", orgId),
    memberCount(orgId),
  ]);
  const s = settings.data;
  const sale = (s?.sale_settings ?? {}) as Record<string, unknown>;
  return {
    hasShopDetails: Boolean(s?.business_name?.trim() && s?.address?.trim() && s?.mobile_number?.trim()),
    hasBillFormat: Boolean(sale.pos_bill_format || sale.invoice_template || sale.pos_invoice_template),
    products,
    customers,
    sales,
    members,
    whatsappOn: Boolean(wa.data?.is_active),
  };
}

/**
 * Dashboard card for new shops (first SETUP_SHOW_DAYS days): the few steps that get a shop
 * from login to its first real bill, each ticked from live data and one click from its screen.
 * Hidden once every step is done, when the owner closes it, or for older shops.
 */
export function ShopSetupChecklist({ organizationId }: { organizationId: string }) {
  const { orgNavigate } = useOrgNavigation();
  const [dismissed, setDismissed] = useState(() => readDismissed(organizationId));
  const [collapsed, setCollapsed] = useState(false);

  const { data } = useQuery({
    queryKey: ["shop-setup-checklist", organizationId],
    queryFn: () => fetchShopSetupFacts(organizationId),
    enabled: !dismissed,
    staleTime: 60 * 1000,
    retry: false,
  });

  if (dismissed || !data) return null;

  const steps = buildShopSetupSteps(data);
  const { done, total, percent } = setupProgress(steps);
  if (done === total) return null;
  const next = steps.find((s) => !s.done);

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey(organizationId), "1");
    } catch {
      /* private window: hide for this visit only */
    }
    setDismissed(true);
  };

  const open = (step: ShopSetupStep) => orgNavigate(step.path, step.state ? { state: step.state } : undefined);

  return (
    <div className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
          <Rocket className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Set up your shop · {percent}% ready</p>
          <p className="text-sm text-slate-600">
            {done} of {total} steps done{next ? `. Next: ${next.title}` : ""}
          </p>
          <div className="mt-1.5 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-teal-100">
            <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          {next && (
            <Button size="sm" className="h-8 bg-teal-600 text-white hover:bg-teal-700" onClick={() => open(next)}>
              {next.action}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Show steps" : "Hide steps"}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={dismiss} aria-label="Close setup checklist" title="Close for good">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!collapsed && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => open(step)}
                className={cn(
                  "flex h-full w-full items-start gap-2 rounded-lg border bg-white p-2.5 text-left text-sm transition hover:border-teal-400",
                  step.done ? "border-emerald-200" : "border-slate-200",
                )}
              >
                {step.done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                )}
                <span className="min-w-0">
                  <span className={cn("block font-medium", step.done ? "text-slate-500 line-through" : "text-slate-900")}>
                    {step.title}
                  </span>
                  <span className="block text-xs text-slate-500">{step.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
