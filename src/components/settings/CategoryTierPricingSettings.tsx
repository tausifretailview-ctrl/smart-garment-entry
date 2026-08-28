import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  deleteCategoryTierPricingRule,
  fetchCategoryTierPricingRules,
  upsertCategoryTierPricingRule,
} from "@/lib/categoryTierPricingDb";
import { toast } from "sonner";

type DraftRow = {
  id?: string;
  category: string;
  singleUnitPrice: string;
  tierQty: string;
  tierTotalPrice: string;
  isActive: boolean;
};

function emptyDraft(): DraftRow {
  return {
    category: "",
    singleUnitPrice: "",
    tierQty: "",
    tierTotalPrice: "",
    isActive: true,
  };
}

function toDraft(row: Awaited<ReturnType<typeof fetchCategoryTierPricingRules>>[number]): DraftRow {
  return {
    id: row.id,
    category: row.category,
    singleUnitPrice: String(row.singleUnitPrice),
    tierQty: String(row.tierQty),
    tierTotalPrice: String(row.tierTotalPrice),
    isActive: row.isActive !== false,
  };
}

type Props = {
  organizationId: string | undefined;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
};

export function CategoryTierPricingSettings({
  organizationId,
  enabled,
  onEnabledChange,
}: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftRow>(emptyDraft);
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["category_tier_pricing", organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => fetchCategoryTierPricingRules(organizationId!),
  });

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.category.localeCompare(b.category)),
    [rules],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["category_tier_pricing", organizationId] });
  };

  const parseDraft = (row: DraftRow) => {
    const category = row.category.trim();
    const singleUnitPrice = Number(row.singleUnitPrice);
    const tierQty = Math.floor(Number(row.tierQty));
    const tierTotalPrice = Number(row.tierTotalPrice);
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
  };

  const handleSaveDraft = async () => {
    if (!organizationId) return;
    try {
      const parsed = parseDraft(draft);
      await upsertCategoryTierPricingRule({
        organizationId,
        ...parsed,
        isActive: draft.isActive,
      });
      toast.success("Discount scheme rule saved");
      setDraft(emptyDraft());
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save rule");
    }
  };

  const handleSaveExisting = async (row: DraftRow) => {
    if (!organizationId || !row.id) return;
    setSavingId(row.id);
    try {
      const parsed = parseDraft(row);
      await upsertCategoryTierPricingRule({
        organizationId,
        id: row.id,
        ...parsed,
        isActive: row.isActive,
      });
      toast.success("Rule updated");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update rule");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!organizationId) return;
    try {
      await deleteCategoryTierPricingRule(organizationId, id);
      toast.success("Rule deleted");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete rule");
    }
  };

  return (
    <div className="space-y-4 pt-4 border-t">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="pos_category_tier_pricing" className="text-sm font-medium">
            Discount Scheme (category quantity tiers)
          </Label>
          <p className="text-xs text-muted-foreground mt-1">
            When enabled, POS sums quantity per category and applies bundle pricing
            (e.g. 4 T-Shirts for ₹999; a 5th bills at single-unit price). Categories are
            independent. Other organisations leave this off — normal POS pricing unchanged.
          </p>
        </div>
        <Switch
          id="pos_category_tier_pricing"
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>

      {enabled && (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">
            Category must match the product master category exactly (case-insensitive).
            Example: T-Shirt — single ₹299, bundle 4 for ₹999.
          </p>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading rules…</p>
          ) : (
            <>
              {sortedRules.map((rule) => (
                <ExistingRuleRow
                  key={rule.id}
                  rule={toDraft(rule)}
                  saving={savingId === rule.id}
                  onChange={(next) => {
                    void handleSaveExisting(next);
                  }}
                  onDelete={() => void handleDelete(rule.id)}
                />
              ))}

              <div className="grid gap-2 sm:grid-cols-5 items-end border-t pt-3">
                <div className="sm:col-span-1">
                  <Label className="text-xs">Category</Label>
                  <Input
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                    placeholder="T-Shirt"
                  />
                </div>
                <div>
                  <Label className="text-xs">Single (₹)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={draft.singleUnitPrice}
                    onChange={(e) => setDraft({ ...draft, singleUnitPrice: e.target.value })}
                    placeholder="299"
                  />
                </div>
                <div>
                  <Label className="text-xs">Bundle qty</Label>
                  <Input
                    type="number"
                    min={2}
                    value={draft.tierQty}
                    onChange={(e) => setDraft({ ...draft, tierQty: e.target.value })}
                    placeholder="4"
                  />
                </div>
                <div>
                  <Label className="text-xs">Bundle total (₹)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={draft.tierTotalPrice}
                    onChange={(e) => setDraft({ ...draft, tierTotalPrice: e.target.value })}
                    placeholder="999"
                  />
                </div>
                <Button type="button" variant="secondary" onClick={() => void handleSaveDraft()}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ExistingRuleRow({
  rule,
  saving,
  onChange,
  onDelete,
}: {
  rule: DraftRow;
  saving: boolean;
  onChange: (row: DraftRow) => void;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState(rule);

  return (
    <div className="grid gap-2 sm:grid-cols-6 items-end rounded-md border bg-background p-2">
      <div className="sm:col-span-1">
        <Label className="text-xs">Category</Label>
        <Input
          value={local.category}
          onChange={(e) => setLocal({ ...local, category: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Single (₹)</Label>
        <Input
          type="number"
          min={1}
          value={local.singleUnitPrice}
          onChange={(e) => setLocal({ ...local, singleUnitPrice: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Bundle qty</Label>
        <Input
          type="number"
          min={2}
          value={local.tierQty}
          onChange={(e) => setLocal({ ...local, tierQty: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Bundle total (₹)</Label>
        <Input
          type="number"
          min={1}
          value={local.tierTotalPrice}
          onChange={(e) => setLocal({ ...local, tierTotalPrice: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-2 pb-1">
        <Switch
          checked={local.isActive}
          onCheckedChange={(checked) => setLocal({ ...local, isActive: checked })}
        />
        <span className="text-xs text-muted-foreground">Active</span>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => onChange(local)}
        >
          Save
        </Button>
        <Button type="button" size="icon" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
