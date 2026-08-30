import { Link } from "react-router-dom";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Percent } from "lucide-react";

type Props = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
};

/** POS-tab opt-in — manage rules on Discount Scheme dashboard. */
export function CategoryTierPricingSettings({ enabled, onEnabledChange }: Props) {
  const { getOrgPath } = useOrgNavigation();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="pos_category_tier_pricing" className="text-sm font-medium">
            Discount Scheme (category quantity tiers)
          </Label>
          <p className="text-xs text-muted-foreground mt-1">
            When enabled, POS matches the active scheme by product name, then category, then
            selling price. A BAGGY TRACK @ ₹450 rule does not apply to every TRACK item.
            Configure rules on the Discount Scheme page (Sales menu).
          </p>
        </div>
        <Switch
          id="pos_category_tier_pricing"
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link to={getOrgPath("/discount-scheme-dashboard")} className="gap-2">
          <Percent className="h-4 w-4" />
          Open Discount Scheme manager
        </Link>
      </Button>
    </div>
  );
}
