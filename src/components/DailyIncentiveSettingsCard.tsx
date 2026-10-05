import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  flatPerPieceAmount,
  REHMANI_NX_ORG_ID,
  type DailyIncentiveBillSlab,
  type DailyIncentiveBracket,
} from "@/utils/dailySalesmanIncentive";
import { saveDailyIncentiveSettings } from "@/utils/dailySalesmanIncentiveSync";

type SlabDraft = { minBill: string; amount: string };

const REHMANI_START: SlabDraft[] = [
  { minBill: "10000", amount: "100" },
  { minBill: "15000", amount: "200" },
];

function slabsFromConfig(slabs: DailyIncentiveBillSlab[], starterSlabs: boolean): SlabDraft[] {
  if (slabs.length === 0) {
    return starterSlabs ? REHMANI_START.map((row) => ({ ...row })) : [];
  }
  return [...slabs]
    .sort((a, b) => Number(a.min_bill_amount) - Number(b.min_bill_amount))
    .map((slab) => ({
      minBill: String(Number(slab.min_bill_amount)),
      amount: String(Number(slab.incentive_amount)),
    }));
}

export function DailyIncentiveSettingsCard({
  organizationId,
  isEnabled,
  qtyThreshold,
  brackets,
  billSlabs,
  starterSlabs = false,
}: {
  organizationId: string;
  isEnabled: boolean;
  qtyThreshold: number | null;
  brackets: DailyIncentiveBracket[];
  billSlabs: DailyIncentiveBillSlab[];
  /** First setup only. A saved empty slab list stays empty. */
  starterSlabs?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(
    isEnabled || (starterSlabs && organizationId === REHMANI_NX_ORG_ID),
  );
  const [minQty, setMinQty] = useState(qtyThreshold == null ? "5" : String(qtyThreshold));
  const [perPiece, setPerPiece] = useState(() => {
    const flat = flatPerPieceAmount(brackets);
    return flat == null ? "10" : String(flat);
  });
  const [slabs, setSlabs] = useState<SlabDraft[]>(() => slabsFromConfig(billSlabs, starterSlabs));
  const [saving, setSaving] = useState(false);

  const updateSlab = (index: number, patch: Partial<SlabDraft>) => {
    setSlabs((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveDailyIncentiveSettings({
        organizationId,
        isEnabled: enabled,
        qtyThreshold: Number(minQty),
        perPieceAmount: Number(perPiece),
        billSlabs: slabs.map((row, index) => ({
          min_bill_amount: Number(row.minBill),
          incentive_amount: Number(row.amount),
          sort_order: index + 1,
        })),
      });
      await queryClient.invalidateQueries({ queryKey: ["daily-salesman-incentive-config", organizationId] });
      await queryClient.invalidateQueries({ queryKey: ["daily-salesman-incentive-days", organizationId] });
      toast({ title: "Incentive settings saved" });
    } catch (err) {
      toast({
        title: "Could not save incentive settings",
        description: err instanceof Error ? err.message : "Save failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="shrink-0 rounded-lg border border-border bg-card p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Incentive settings</p>
          <p className="text-xs text-muted-foreground">
            ₹ per piece after the day’s minimum quantity. On a bill, the highest matching slab is added once.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="daily-incentive-enabled" className="text-xs">
            Enabled
          </Label>
          <Switch id="daily-incentive-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <Label htmlFor="daily-incentive-min-qty" className="text-xs">
            Minimum pieces in the day
          </Label>
          <Input
            id="daily-incentive-min-qty"
            type="number"
            min="0"
            step="1"
            value={minQty}
            onChange={(e) => setMinQty(e.target.value)}
            className="h-9 w-28 tabular-nums"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="daily-incentive-per-piece" className="text-xs">
            ₹ per piece
          </Label>
          <Input
            id="daily-incentive-per-piece"
            type="number"
            min="0"
            step="1"
            value={perPiece}
            onChange={(e) => setPerPiece(e.target.value)}
            className="h-9 w-28 tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Bill slabs</p>
        {slabs.map((row, index) => (
          <div key={index} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Bill ₹ and above</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={row.minBill}
                onChange={(e) => updateSlab(index, { minBill: e.target.value })}
                className="h-9 w-32 tabular-nums"
                aria-label={`Bill slab ${index + 1} minimum`}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Incentive ₹</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={row.amount}
                onChange={(e) => updateSlab(index, { amount: e.target.value })}
                className="h-9 w-28 tabular-nums"
                aria-label={`Bill slab ${index + 1} amount`}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => setSlabs((rows) => rows.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setSlabs((rows) => [...rows, { minBill: "", amount: "" }])}
        >
          Add slab
        </Button>
      </div>

      <Button type="button" size="sm" className="h-9" onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </div>
  );
}
