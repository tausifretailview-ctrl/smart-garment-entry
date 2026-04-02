import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, CreditCard, X } from "lucide-react";
import { cn } from "@/lib/utils";

const FINANCER_PRESETS = [
  "Bajaj Finserv",
  "IDFC First",
  "TVS Credit",
  "HDB Finance",
];

export interface FinancerDetails {
  financer_name: string;
  loan_number: string;
  emi_amount: number;
  tenure: number;
  down_payment: number;
  down_payment_mode: 'cash' | 'upi' | 'card';
  bank_transfer_amount: number;
  finance_discount: number;
}

interface FinancerDetailsFormProps {
  value: FinancerDetails | null;
  onChange: (details: FinancerDetails | null) => void;
}

export const FinancerDetailsForm = ({ value, onChange }: FinancerDetailsFormProps) => {
  const [isOpen, setIsOpen] = useState(!!value?.financer_name);

  const handleChange = (field: keyof FinancerDetails, val: string | number) => {
    const current = value || {
      financer_name: "", loan_number: "", emi_amount: 0, tenure: 0,
      down_payment: 0, down_payment_mode: 'cash' as const,
      bank_transfer_amount: 0, finance_discount: 0,
    };
    onChange({ ...current, [field]: val });
  };

  const handleClear = () => {
    onChange(null);
    setIsOpen(false);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between gap-2 h-9">
          <span className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Financer / EMI Details
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <Card className="border-dashed">
          <CardContent className="pt-4 space-y-3">
            {/* Quick-select financer buttons */}
            <div className="flex flex-wrap gap-1.5">
              {FINANCER_PRESETS.map((name) => (
                <Button
                  key={name}
                  type="button"
                  variant={value?.financer_name === name ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleChange("financer_name", name)}
                >
                  {name}
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleChange("financer_name", "")}
              >
                Custom
              </Button>
            </div>

            {/* Row 1: Financer Name full-width */}
            <div className="space-y-1">
              <Label className="text-xs font-medium text-primary">Financer Name</Label>
              <Input
                value={value?.financer_name || ""}
                onChange={(e) => handleChange("financer_name", e.target.value)}
                placeholder="Enter financer name"
                className="h-8 text-sm"
              />
            </div>

            {/* Row 2: Loan Number + Tenure */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">DSBS / Ref No.</Label>
                <Input
                  value={value?.loan_number || ""}
                  onChange={(e) => handleChange("loan_number", e.target.value)}
                  placeholder="Loan reference"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tenure (months)</Label>
                <Input
                  type="number" min="0"
                  value={value?.tenure || ""}
                  onChange={(e) => handleChange("tenure", parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Payment Split Section */}
            <div className="border-t border-dashed border-border/60 pt-2">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Payment Split (Accounting)</p>
            </div>

            {/* Down Payment */}
            <div className="space-y-1">
              <Label className="text-xs font-medium text-green-700 dark:text-green-400">Down Payment (₹)</Label>
              <Input
                type="number" min="0"
                value={value?.down_payment || ""}
                onChange={(e) => handleChange("down_payment", parseFloat(e.target.value) || 0)}
                placeholder="₹ 0"
                className="h-8 text-sm"
              />
            </div>

            {/* EMI Amount */}
            <div className="space-y-1">
              <Label className="text-xs">Monthly EMI (₹) — info only</Label>
              <Input
                type="number" min="0"
                value={value?.emi_amount || ""}
                onChange={(e) => handleChange("emi_amount", parseFloat(e.target.value) || 0)}
                placeholder="₹ 0"
                className="h-8 text-sm"
              />
            </div>

            {value?.financer_name && (
              <Button type="button" variant="ghost" size="sm" className="text-xs text-destructive" onClick={handleClear}>
                <X className="h-3 w-3 mr-1" /> Clear Financer Details
              </Button>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
};

export const saveFinancerDetails = async (
  saleId: string,
  organizationId: string,
  details: FinancerDetails
) => {
  // Upsert — delete existing then insert
  await supabase
    .from("sale_financer_details" as any)
    .delete()
    .eq("sale_id", saleId)
    .eq("organization_id", organizationId);

  if (details.financer_name) {
    const { error } = await supabase
      .from("sale_financer_details" as any)
      .insert({
        sale_id: saleId,
        organization_id: organizationId,
    financer_name: details.financer_name,
    loan_number: details.loan_number || null,
    emi_amount: details.emi_amount || 0,
    tenure: details.tenure || 0,
    down_payment: details.down_payment || 0,
    down_payment_mode: details.down_payment_mode || 'cash',
    bank_transfer_amount: details.bank_transfer_amount || 0,
    finance_discount: details.finance_discount || 0,
  });
    if (error) {
      console.error("Error saving financer details:", error);
    }
  }
};
