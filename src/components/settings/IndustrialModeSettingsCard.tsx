import { Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DEFAULT_INDUSTRIAL_MODE,
  type CreditLimitAction,
  type IndustrialModeConfig,
} from "@/utils/industrialMode";

type Props = {
  value: IndustrialModeConfig | undefined;
  onChange: (next: IndustrialModeConfig) => void;
};

/** Settings > Product: Industrial mode switch. Only shown when Platform Admin enabled the feature. */
export function IndustrialModeSettingsCard({ value, onChange }: Props) {
  const set = (patch: Partial<IndustrialModeConfig>) => onChange({ ...value, ...patch });
  const enabled = value?.enabled || false;

  return (
    <Card className="mt-3 h-fit settings-panel-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Industrial mode
        </CardTitle>
        <CardDescription>
          For industrial units, traders and warehouses that sell on credit to businesses: credit limits and
          credit days for each party, with more B2B tools added step by step.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
          <div>
            <Label htmlFor="industrial_mode_enabled" className="text-base font-semibold">
              Enable Industrial mode
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              Adds Credit limit, Credit days, Contact person and PAN to Customer Master and checks them on Sale Invoice
            </p>
          </div>
          <Switch
            id="industrial_mode_enabled"
            checked={enabled}
            onCheckedChange={(checked) => set({ enabled: checked })}
          />
        </div>

        {enabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-4 border-l-2 border-primary/30">
            <div className="space-y-1">
              <Label htmlFor="industrial_credit_action">When a bill crosses the credit limit</Label>
              <Select
                value={value?.credit_limit_action ?? DEFAULT_INDUSTRIAL_MODE.credit_limit_action}
                onValueChange={(v) => set({ credit_limit_action: v as CreditLimitAction })}
              >
                <SelectTrigger id="industrial_credit_action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warn">Warn, user can still save</SelectItem>
                  <SelectItem value="block">Block, only admin can save</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Cash and UPI paid on the bill are not counted as credit</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <Label htmlFor="industrial_auto_due" className="text-sm font-medium">
                  Due date from credit days
                </Label>
                <p className="text-xs text-muted-foreground">Bill date + party credit days, can still be changed</p>
              </div>
              <Switch
                id="industrial_auto_due"
                checked={value?.auto_due_date ?? DEFAULT_INDUSTRIAL_MODE.auto_due_date}
                onCheckedChange={(checked) => set({ auto_due_date: checked })}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
