import { Link } from "react-router-dom";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Percent } from "lucide-react";
import { SettingOnOffHint } from "@/components/settings/SettingOnOffHint";

type Props = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  autoCalculateDiscount: boolean;
  onAutoCalculateDiscountChange: (enabled: boolean) => void;
};

/** POS-tab opt-in — manage rules on Discount Scheme dashboard. */
export function CategoryTierPricingSettings({
  enabled,
  onEnabledChange,
  autoCalculateDiscount,
  onAutoCalculateDiscountChange,
}: Props) {
  const { getOrgPath } = useOrgNavigation();
  const { hasMenuAccess, isAdmin: isAdminPermissions } = useUserPermissions();
  const { isAdmin } = useUserRoles();
  const canAccessDiscountScheme = isAdmin || isAdminPermissions || hasMenuAccess("discount_scheme_dashboard");

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
      <div className="flex items-center justify-between gap-4 rounded-md border border-border/60 px-3 py-2">
        <div className="min-w-0">
          <Label htmlFor="pos_scheme_auto_calculate_discount" className="text-sm font-medium">
            Auto Calculate Discount
          </Label>
          <p className="text-xs text-muted-foreground mt-1">
            Off (default): leftover pieces stay at Single price — 1@₹300 / 4@₹1000 → qty 2 = ₹600.
            On (festival / discount day): leftover uses the bundle rate → qty 2 = ₹500, qty 5 = ₹1250.
            Extra Disc ₹ on a scheme line is always allowed.
          </p>
          <div className="mt-1.5">
            <SettingOnOffHint
              active={autoCalculateDiscount ? "on" : "off"}
              on="Leftover qty uses scheme rate (2 pcs = ₹500 on a 4@₹1000 scheme)."
              off="Leftover qty uses Single price (2 pcs = ₹600 on a 4@₹1000 scheme)."
            />
          </div>
        </div>
        <Switch
          id="pos_scheme_auto_calculate_discount"
          checked={autoCalculateDiscount}
          disabled={!enabled}
          onCheckedChange={onAutoCalculateDiscountChange}
        />
      </div>
      {canAccessDiscountScheme ? (
        <Button variant="outline" size="sm" asChild>
          <Link to={getOrgPath("/discount-scheme-dashboard")} className="gap-2">
            <Percent className="h-4 w-4" />
            Open Discount Scheme manager
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
