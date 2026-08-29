import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/hooks/useSettings";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Plus, Pencil, Trash2, RefreshCw, Percent, History } from "lucide-react";
import { toast } from "sonner";
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
  if (!category) throw new Error("Category is required");
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
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { data: settingsData, refetch: refetchSettings } = useSettings();
  const { getOrgPath } = useOrgNavigation();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  const posEnabled =
    (settingsData as { sale_settings?: { pos_category_tier_pricing?: boolean } })?.sale_settings
      ?.pos_category_tier_pricing === true;

  const activeSchemeId =
    (settingsData as { sale_settings?: { active_discount_scheme_id?: string | null } })?.sale_settings
      ?.active_discount_scheme_id ?? null;

  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRuleForm);
  const [newSchemeName, setNewSchemeName] = useState("");
  const [savingPosToggle, setSavingPosToggle] = useState(false);

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
      await persistSaleSettings({ pos_category_tier_pricing: checked });
      toast.success(checked ? "Discount scheme enabled on POS" : "Discount scheme disabled on POS");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update POS setting");
    } finally {
      setSavingPosToggle(false);
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
        throw new Error("A rule already exists for this category at this unit price");
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
    <div className="container max-w-6xl py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Percent className="h-6 w-6 text-primary" />
            Discount Scheme
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Category + unit-price bundle pricing for POS (e.g. Track Pants @ ₹300 → 4 for ₹1000).
            A different price in the same category is a separate product line. Manage rules
            here; enable on POS from the toggle below or{" "}
            <Link to={getOrgPath("/settings")} className="text-primary underline-offset-2 hover:underline">
              Settings → Sale
            </Link>
            .
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">POS application</CardTitle>
          <CardDescription>
            When enabled, POS sums quantity per category and matching unit price, then applies
            the active scheme&apos;s rules. Unmatched prices bill at their own rate.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={posEnabled}
              disabled={savingPosToggle}
              onCheckedChange={(checked) => void handlePosToggle(checked)}
            />
            <span className="text-sm font-medium">
              {posEnabled ? "Enabled on POS bills" : "Disabled — normal POS pricing"}
            </span>
          </div>
          {activeScheme && (
            <Badge variant={posEnabled ? "default" : "secondary"}>
              Active scheme: {activeScheme.name}
            </Badge>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Schemes</CardTitle>
            <CardDescription>Multiple schemes supported — one is active on POS.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {schemesLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              schemes.map((scheme) => (
                <button
                  key={scheme.id}
                  type="button"
                  onClick={() => setSelectedSchemeId(scheme.id)}
                  className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-colors ${
                    effectiveSchemeId === scheme.id
                      ? "border-primary bg-primary/10"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="font-medium flex items-center gap-2">
                    {scheme.name}
                    {scheme.is_default && (
                      <Badge variant="outline" className="text-[10px]">
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
                      className="h-auto p-0 text-xs"
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
                      className="h-auto p-0 text-xs"
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
            <div className="flex gap-2 pt-2 border-t">
              <Input
                placeholder="New scheme name"
                value={newSchemeName}
                onChange={(e) => setNewSchemeName(e.target.value)}
                className="h-8 text-sm"
              />
              <Button size="sm" variant="secondary" onClick={() => void addScheme()} disabled={!newSchemeName.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="rules" className="min-w-0">
          <TabsList>
            <TabsTrigger value="rules">Category rules</TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-1" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base">
                    {activeScheme?.name ?? "Rules"}
                  </CardTitle>
                  <CardDescription>
                    Each rule is category + single unit price. Same category at ₹300 and ₹600
                    are two rules. Example: Track Pants @ ₹300 — 4 for ₹1000.
                  </CardDescription>
                </div>
                <Button size="sm" onClick={openCreateRule} disabled={!effectiveSchemeId}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add rule
                </Button>
              </CardHeader>
              <CardContent>
                {rulesLoading ? (
                  <p className="text-sm text-muted-foreground">Loading rules…</p>
                ) : rules.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No category rules yet. Add T-Shirt, Shirt, Jeans, etc.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Single (₹)</TableHead>
                        <TableHead className="text-right">Bundle qty</TableHead>
                        <TableHead className="text-right">Bundle total (₹)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="w-[88px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell className="font-medium">{rule.category}</TableCell>
                          <TableCell className="text-right tabular-nums">{rule.singleUnitPrice}</TableCell>
                          <TableCell className="text-right tabular-nums">{rule.tierQty}</TableCell>
                          <TableCell className="text-right tabular-nums">{rule.tierTotalPrice}</TableCell>
                          <TableCell>
                            <Badge variant={rule.isActive !== false ? "default" : "secondary"}>
                              {rule.isActive !== false ? "Active" : "Off"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {rule.updatedAt
                              ? format(new Date(rule.updatedAt), "dd MMM yyyy HH:mm")
                              : "—"}
                          </TableCell>
                          <TableCell>
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
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Change history</CardTitle>
                <CardDescription>Created, updated, and deleted category rules.</CardDescription>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <p className="text-sm text-muted-foreground">Loading history…</p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No history yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {format(new Date(row.created_at), "dd MMM yyyy HH:mm")}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.action}</Badge>
                          </TableCell>
                          <TableCell>{row.category ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                            {JSON.stringify(row.snapshot)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ruleForm.id ? "Edit price-point rule" : "Add price-point rule"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Category</Label>
              <Input
                value={ruleForm.category}
                onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value })}
                placeholder="T-Shirt"
              />
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
