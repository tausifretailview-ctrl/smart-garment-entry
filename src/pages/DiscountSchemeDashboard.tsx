import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/hooks/useSettings";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Pencil, Trash2, RefreshCw, Percent } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MenuPermissionRoute } from "@/components/MenuPermissionRoute";
import {
  InsightsPanel,
  InsightsSubTabPanel,
  InsightsSubTabs,
  INSIGHTS_BODY_CELL,
  INSIGHTS_BODY_CELL_NUM,
  INSIGHTS_BODY_ROW,
  INSIGHTS_NEUTRAL_TH,
  INSIGHTS_TABLE_HEAD,
} from "@/components/business-insights/insightsLayout";
import {
  createDiscountScheme,
  deleteCategoryTierPricingRule,
  ensureDefaultDiscountScheme,
  fetchCategoryTierPricingRules,
  fetchDiscountSchemeRuleHistory,
  fetchDiscountSchemes,
  upsertCategoryTierPricingRule,
  type DiscountSchemeRow,
} from "@/lib/discountSchemeDb";
import { normalizeCategoryKey, pricesMatchForTier } from "@/lib/posBilling/categoryTierPricing";

type RuleForm = {
  id?: string;
  category: string;
  singleUnitPrice: string;
  tierQty: string;
  tierTotalPrice: string;
  isActive: boolean;
};

function emptyRuleForm(): RuleForm {
  return {
    category: "",
    singleUnitPrice: "",
    tierQty: "",
    tierTotalPrice: "",
    isActive: true,
  };
}

function parseRuleForm(form: RuleForm) {
  const category = form.category.trim();
  const singleUnitPrice = Number(form.singleUnitPrice);
  const tierQty = Math.floor(Number(form.tierQty));
  const tierTotalPrice = Number(form.tierTotalPrice);
  if (!category) throw new Error("Product name or category is required");
  if (!Number.isFinite(singleUnitPrice) || singleUnitPrice <= 0) {
    throw new Error("Single unit price must be greater than 0");
  }
  if (!Number.isFinite(tierQty) || tierQty < 2) {
    throw new Error("Bundle quantity must be at least 2");
  }
  if (!Number.isFinite(tierTotalPrice) || tierTotalPrice <= 0) {
    throw new Error("Bundle total price must be greater than 0");
  }
  return { category, singleUnitPrice, tierQty, tierTotalPrice };
}

export default function DiscountSchemeDashboard() {
  return (
    <MenuPermissionRoute permission="discount_scheme_dashboard">
      <DiscountSchemeDashboardPage />
    </MenuPermissionRoute>
  );
}

function DiscountSchemeDashboardPage() {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { data: settingsData, refetch: refetchSettings } = useSettings();
  const { getOrgPath, orgNavigate } = useOrgNavigation();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  const posEnabled =
    (settingsData as { sale_settings?: { pos_category_tier_pricing?: boolean } })?.sale_settings
      ?.pos_category_tier_pricing === true;

  const autoCalculateDiscount =
    (settingsData as { sale_settings?: { pos_scheme_auto_calculate_discount?: boolean } })?.sale_settings
      ?.pos_scheme_auto_calculate_discount === true;

  const activeSchemeId =
    (settingsData as { sale_settings?: { active_discount_scheme_id?: string | null } })?.sale_settings
      ?.active_discount_scheme_id ?? null;

  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRuleForm);
  const [newSchemeName, setNewSchemeName] = useState("");
  const [savingPosToggle, setSavingPosToggle] = useState(false);
  const [savingAutoCalc, setSavingAutoCalc] = useState(false);
  const [detailTab, setDetailTab] = useState<"rules" | "history">("rules");

  const { data: schemes = [], isLoading: schemesLoading, refetch: refetchSchemes } = useQuery({
    queryKey: ["discount_schemes", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      await ensureDefaultDiscountScheme(orgId!);
      return fetchDiscountSchemes(orgId!);
    },
  });

  const effectiveSchemeId = useMemo(() => {
    if (selectedSchemeId && schemes.some((s) => s.id === selectedSchemeId)) return selectedSchemeId;
    if (activeSchemeId && schemes.some((s) => s.id === activeSchemeId)) return activeSchemeId;
    return schemes.find((s) => s.is_default)?.id ?? schemes[0]?.id ?? null;
  }, [selectedSchemeId, activeSchemeId, schemes]);

  const activeScheme = schemes.find((s) => s.id === effectiveSchemeId) ?? null;

  const { data: rules = [], isLoading: rulesLoading, refetch: refetchRules } = useQuery({
    queryKey: ["category_tier_pricing", orgId, effectiveSchemeId],
    enabled: Boolean(orgId && effectiveSchemeId),
    queryFn: () => fetchCategoryTierPricingRules(orgId!, effectiveSchemeId!),
  });

  const { data: history = [], isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["discount_scheme_history", orgId, effectiveSchemeId],
    enabled: Boolean(orgId && effectiveSchemeId),
    queryFn: () => fetchDiscountSchemeRuleHistory(orgId!, effectiveSchemeId!, 200),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["discount_schemes", orgId] });
    queryClient.invalidateQueries({ queryKey: ["category_tier_pricing", orgId] });
    queryClient.invalidateQueries({ queryKey: ["discount_scheme_history", orgId] });
    queryClient.invalidateQueries({ queryKey: ["org-settings", orgId] });
  };

  const persistSaleSettings = async (patch: Record<string, unknown>) => {
    if (!orgId) return;
    const current = ((settingsData as any)?.sale_settings || {}) as Record<string, unknown>;
    const nextSaleSettings = { ...current, ...patch };

    const { data: existing, error: fetchError } = await supabase
      .from("settings" as any)
      .select("id, sale_settings")
      .eq("organization_id", orgId)
      .maybeSingle();
    if (fetchError) throw fetchError;

    const existingRow = existing as { id?: string } | null;
    if (existingRow?.id) {
      const { error } = await supabase
        .from("settings" as any)
        .update({ sale_settings: nextSaleSettings })
        .eq("id", existingRow.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("settings" as any)
        .insert({ organization_id: orgId, sale_settings: nextSaleSettings });
      if (error) throw error;
    }
    await refetchSettings();
    invalidateAll();
  };

  const handlePosToggle = async (checked: boolean) => {
    setSavingPosToggle(true);
    try {
      await persistSaleSettings({
        pos_category_tier_pricing: checked,
        ...(checked ? {} : { pos_scheme_auto_calculate_discount: false }),
      });
      toast.success(checked ? "Discount scheme enabled on POS" : "Discount scheme disabled on POS");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update POS setting");
    } finally {
      setSavingPosToggle(false);
    }
  };

  const handleAutoCalcToggle = async (checked: boolean) => {
    setSavingAutoCalc(true);
    try {
      await persistSaleSettings({ pos_scheme_auto_calculate_discount: checked });
      toast.success(
        checked
          ? "Auto Calculate Discount on — leftover qty uses scheme rate"
          : "Auto Calculate Discount off — leftover qty uses Single price",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update Auto Calculate setting");
    } finally {
      setSavingAutoCalc(false);
    }
  };

  const handleSetActiveScheme = async (scheme: DiscountSchemeRow) => {
    try {
      await persistSaleSettings({ active_discount_scheme_id: scheme.id });
      setSelectedSchemeId(scheme.id);
      toast.success(`Active scheme set to "${scheme.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not set active scheme");
    }
  };

  const openCreateRule = () => {
    setRuleForm(emptyRuleForm());
    setRuleDialogOpen(true);
  };

  const openEditRule = (rule: (typeof rules)[number]) => {
    setRuleForm({
      id: rule.id,
      category: rule.category,
      singleUnitPrice: String(rule.singleUnitPrice),
      tierQty: String(rule.tierQty),
      tierTotalPrice: String(rule.tierTotalPrice),
      isActive: rule.isActive !== false,
    });
    setRuleDialogOpen(true);
  };

  const saveRule = async () => {
    if (!orgId || !effectiveSchemeId) return;
    try {
      const parsed = parseRuleForm(ruleForm);
      const duplicate = rules.find(
        (rule) =>
          rule.id !== ruleForm.id &&
          normalizeCategoryKey(rule.category) === normalizeCategoryKey(parsed.category) &&
          pricesMatchForTier(rule.singleUnitPrice, parsed.singleUnitPrice),
      );
      if (duplicate) {
        throw new Error("A rule already exists for this product/category at this selling price");
      }
      await upsertCategoryTierPricingRule({
        organizationId: orgId,
        schemeId: effectiveSchemeId,
        id: ruleForm.id,
        ...parsed,
        isActive: ruleForm.isActive,
        changedBy: user?.id ?? null,
      });
      toast.success(ruleForm.id ? "Rule updated" : "Rule added");
      setRuleDialogOpen(false);
      invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save rule");
    }
  };

  const removeRule = async (rule: (typeof rules)[number]) => {
    if (!orgId) return;
    try {
      await deleteCategoryTierPricingRule(
        orgId,
        {
          id: rule.id,
          schemeId: rule.schemeId,
          category: rule.category,
          snapshot: {
            category: rule.category,
            single_unit_price: rule.singleUnitPrice,
            tier_qty: rule.tierQty,
            tier_total_price: rule.tierTotalPrice,
            is_active: rule.isActive,
          },
        },
        user?.id ?? null,
      );
      toast.success("Rule deleted");
      invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete rule");
    }
  };

  const addScheme = async () => {
    if (!orgId || !newSchemeName.trim()) return;
    try {
      const created = await createDiscountScheme({
        organizationId: orgId,
        name: newSchemeName.trim(),
      });
      setNewSchemeName("");
      setSelectedSchemeId(created.id);
      toast.success(`Scheme "${created.name}" created`);
      refetchSchemes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create scheme");
    }
  };

  return (
    <div className="business-insights-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-sm shrink-0"
              onClick={() => orgNavigate("/")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <Percent className="h-5 w-5 shrink-0" />
                Discount Scheme
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Category + unit-price bundle pricing for POS. Enable below or in{" "}
                <Link to={getOrgPath("/settings")} className="text-teal-700 underline-offset-2 hover:underline">
                  Settings → POS
                </Link>
                .
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 text-sm shrink-0"
            onClick={() => {
              refetchSchemes();
              refetchRules();
              refetchHistory();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>

        <div className="shrink-0 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100">
            <div className="min-w-0 mr-auto">
              <h3 className="text-sm font-bold text-slate-800 leading-tight">POS application</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                When enabled, POS sums quantity per matching product/category and unit price.
                Qty 1 bills at Single (₹). Leftover pieces stay at Single unless Auto Calculate
                Discount is on for a festival day (then 1@₹300 / 4@₹1000 → qty 2 = ₹500). Extra
                Disc ₹ on a scheme line is always allowed.
              </p>
            </div>
            {activeScheme && (
              <Badge
                className={cn(
                  "text-xs font-semibold",
                  posEnabled
                    ? "bg-teal-600 hover:bg-teal-600 text-white"
                    : "bg-slate-200 text-slate-700 hover:bg-slate-200",
                )}
              >
                Active scheme: {activeScheme.name}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 px-3 py-3">
            <Switch
              checked={posEnabled}
              disabled={savingPosToggle}
              onCheckedChange={(checked) => void handlePosToggle(checked)}
            />
            <span className="text-sm font-semibold text-slate-800">
              {posEnabled ? "Enabled on POS bills" : "Disabled — normal POS pricing"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 px-3 py-3 border-t border-slate-100">
            <Switch
              checked={autoCalculateDiscount}
              disabled={!posEnabled || savingAutoCalc}
              onCheckedChange={(checked) => void handleAutoCalcToggle(checked)}
            />
            <div className="min-w-0">
              <span className="text-sm font-semibold text-slate-800">Auto Calculate Discount</span>
              <p className="text-xs text-muted-foreground">
                {autoCalculateDiscount
                  ? "On — leftover qty uses scheme rate (2 pcs = ₹500 on a 4@₹1000 scheme)."
                  : "Off — leftover qty uses Single price (2 pcs = ₹600 on a 4@₹1000 scheme)."}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 lg:grid-cols-[260px_1fr] flex-1 min-h-0 overflow-hidden">
          <InsightsPanel
            className="min-h-0 h-full"
            title="Schemes"
            subtitle="One scheme is active on POS."
          >
            <div className="space-y-2 p-3">
              {schemesLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                schemes.map((scheme) => (
                  <button
                    key={scheme.id}
                    type="button"
                    onClick={() => setSelectedSchemeId(scheme.id)}
                    className={cn(
                      "w-full text-left rounded-md border px-3 py-2 text-sm transition-colors",
                      effectiveSchemeId === scheme.id
                        ? "border-teal-600 bg-teal-50"
                        : "border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    <div className="font-semibold text-slate-800 flex items-center gap-2">
                      {scheme.name}
                      {scheme.is_default && (
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                          default
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {activeSchemeId === scheme.id || (scheme.is_default && !activeSchemeId)
                        ? "Active on POS"
                        : "Set active"}
                    </div>
                    {effectiveSchemeId === scheme.id && activeSchemeId !== scheme.id && !scheme.is_default && (
                      <Button
                        size="sm"
                        variant="link"
                        className="h-auto p-0 text-xs text-teal-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSetActiveScheme(scheme);
                        }}
                      >
                        Use on POS
                      </Button>
                    )}
                    {effectiveSchemeId !== scheme.id && (
                      <Button
                        size="sm"
                        variant="link"
                        className="h-auto p-0 text-xs text-teal-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSetActiveScheme(scheme);
                        }}
                      >
                        Set active on POS
                      </Button>
                    )}
                  </button>
                ))
              )}
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <div className="space-y-1 flex-1 min-w-0">
                  <Label
                    htmlFor="new-scheme-name"
                    className="text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    New scheme name
                  </Label>
                  <Input
                    id="new-scheme-name"
                    placeholder="New scheme name"
                    value={newSchemeName}
                    onChange={(e) => setNewSchemeName(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="self-end h-8"
                  onClick={() => void addScheme()}
                  disabled={!newSchemeName.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </InsightsPanel>

          <div className="flex flex-col min-h-0 min-w-0 overflow-hidden">
            <InsightsSubTabs
              value={detailTab}
              onValueChange={(value) => {
                if (value === "rules" || value === "history") setDetailTab(value);
              }}
              items={[
                { id: "rules", label: "Rules" },
                { id: "history", label: "History" },
              ]}
            >
              <InsightsSubTabPanel value="rules">
                <InsightsPanel
                  className="flex-1 min-h-0 h-full"
                  title={activeScheme?.name ?? "Rules"}
                  subtitle="Each rule is product name or category + selling price. BAGGY TRACK @ ₹450 is not the same as every TRACK @ ₹450."
                  toolbar={
                    <Button size="sm" className="h-8 text-sm" onClick={openCreateRule} disabled={!effectiveSchemeId}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add rule
                    </Button>
                  }
                >
                  {rulesLoading ? (
                    <p className="text-sm text-muted-foreground px-3 py-8">Loading rules…</p>
                  ) : rules.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No rules yet. Add a product name (BAGGY TRACK) or a category (TRACK).
                    </p>
                  ) : (
                    <Table>
                      <TableHeader className={INSIGHTS_TABLE_HEAD}>
                        <TableRow>
                          <TableHead className={INSIGHTS_NEUTRAL_TH}>Product / category</TableHead>
                          <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Single (₹)</TableHead>
                          <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Bundle qty</TableHead>
                          <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>
                            Bundle total (₹)
                          </TableHead>
                          <TableHead className={INSIGHTS_NEUTRAL_TH}>Status</TableHead>
                          <TableHead className={INSIGHTS_NEUTRAL_TH}>Updated</TableHead>
                          <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "w-[88px]")} />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rules.map((rule) => (
                          <TableRow key={rule.id} className={INSIGHTS_BODY_ROW}>
                            <TableCell className={cn(INSIGHTS_BODY_CELL, "font-semibold")}>
                              {rule.category}
                            </TableCell>
                            <TableCell className={INSIGHTS_BODY_CELL_NUM}>{rule.singleUnitPrice}</TableCell>
                            <TableCell className={INSIGHTS_BODY_CELL_NUM}>{rule.tierQty}</TableCell>
                            <TableCell className={INSIGHTS_BODY_CELL_NUM}>{rule.tierTotalPrice}</TableCell>
                            <TableCell className={INSIGHTS_BODY_CELL}>
                              <Badge variant={rule.isActive !== false ? "default" : "secondary"}>
                                {rule.isActive !== false ? "Active" : "Off"}
                              </Badge>
                            </TableCell>
                            <TableCell className={cn(INSIGHTS_BODY_CELL, "text-xs text-muted-foreground")}>
                              {rule.updatedAt
                                ? format(new Date(rule.updatedAt), "dd MMM yyyy HH:mm")
                                : "—"}
                            </TableCell>
                            <TableCell className={INSIGHTS_BODY_CELL}>
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={() => openEditRule(rule)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => void removeRule(rule)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </InsightsPanel>
              </InsightsSubTabPanel>

              <InsightsSubTabPanel value="history">
                <InsightsPanel
                  className="flex-1 min-h-0 h-full"
                  title="Change history"
                  subtitle="Created, updated, and deleted category rules."
                >
                  {historyLoading ? (
                    <p className="text-sm text-muted-foreground px-3 py-8">Loading history…</p>
                  ) : history.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No history yet.</p>
                  ) : (
                    <Table>
                      <TableHeader className={INSIGHTS_TABLE_HEAD}>
                        <TableRow>
                          <TableHead className={INSIGHTS_NEUTRAL_TH}>When</TableHead>
                          <TableHead className={INSIGHTS_NEUTRAL_TH}>Action</TableHead>
                          <TableHead className={INSIGHTS_NEUTRAL_TH}>Category</TableHead>
                          <TableHead className={INSIGHTS_NEUTRAL_TH}>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map((row) => (
                          <TableRow key={row.id} className={INSIGHTS_BODY_ROW}>
                            <TableCell className={cn(INSIGHTS_BODY_CELL, "text-xs whitespace-nowrap")}>
                              {format(new Date(row.created_at), "dd MMM yyyy HH:mm")}
                            </TableCell>
                            <TableCell className={INSIGHTS_BODY_CELL}>
                              <Badge variant="outline">{row.action}</Badge>
                            </TableCell>
                            <TableCell className={INSIGHTS_BODY_CELL}>{row.category ?? "—"}</TableCell>
                            <TableCell
                              className={cn(INSIGHTS_BODY_CELL, "text-xs text-muted-foreground max-w-md truncate")}
                            >
                              {JSON.stringify(row.snapshot)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </InsightsPanel>
              </InsightsSubTabPanel>
            </InsightsSubTabs>
          </div>
        </div>
      </div>

      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ruleForm.id ? "Edit rule" : "Add rule"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Product name or category</Label>
              <Input
                value={ruleForm.category}
                onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value })}
                placeholder="BAGGY TRACK or TRACK"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Product name (BAGGY TRACK) wins over category (TRACK). Single ₹ must match the POS
                selling price. Qty 1 = Single; qty 2+ = scheme rate (Bundle total ÷ Bundle qty).
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Single (₹)</Label>
                <Input
                  type="number"
                  min={1}
                  value={ruleForm.singleUnitPrice}
                  onChange={(e) => setRuleForm({ ...ruleForm, singleUnitPrice: e.target.value })}
                />
              </div>
              <div>
                <Label>Bundle qty</Label>
                <Input
                  type="number"
                  min={2}
                  value={ruleForm.tierQty}
                  onChange={(e) => setRuleForm({ ...ruleForm, tierQty: e.target.value })}
                />
              </div>
              <div>
                <Label>Bundle total (₹)</Label>
                <Input
                  type="number"
                  min={1}
                  value={ruleForm.tierTotalPrice}
                  onChange={(e) => setRuleForm({ ...ruleForm, tierTotalPrice: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={ruleForm.isActive}
                onCheckedChange={(checked) => setRuleForm({ ...ruleForm, isActive: checked })}
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveRule()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
