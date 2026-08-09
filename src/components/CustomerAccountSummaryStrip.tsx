import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronDown, Loader2, ShieldCheck } from "lucide-react";
import { useCustomerAccountState } from "@/hooks/useCustomerAccountState";
import {
  formatAccountInr,
  formatNetPositionLabel,
  type CustomerAccountStateView,
} from "@/utils/customerAccountStateView";
import { CustomerAccountAuditDialog } from "@/components/CustomerAccountAuditDialog";

type Props = {
  organizationId: string | null | undefined;
  customerId: string | null | undefined;
  customerName?: string | null;
  /** Compact for dialogs; default for dashboard toolbars. */
  compact?: boolean;
  className?: string;
  /** Hide the self-service audit button (e.g. PDF-only contexts). */
  hideAuditButton?: boolean;
  /** When provided, skip the hook and render these facets directly (PDF / tests). */
  stateOverride?: CustomerAccountStateView | null;
};

/**
 * One shared Pure Outstanding strip: Outstanding − Advance [= Unclaimed SR] = Net.
 * Same component / same numbers everywhere users look.
 */
export function CustomerAccountSummaryStrip({
  organizationId,
  customerId,
  customerName,
  compact = false,
  className,
  hideAuditButton = false,
  stateOverride = null,
}: Props) {
  const hooked = useCustomerAccountState(
    stateOverride ? null : customerId,
    stateOverride ? null : organizationId,
  );
  const state = stateOverride ?? hooked.state;
  const isLoading = stateOverride ? false : hooked.isLoading;
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  if (!customerId && !stateOverride) return null;

  const showUnclaimed = state.unclaimedSaleReturn > 0;
  const netLabel = formatNetPositionLabel(state.netPosition);
  const netPositive = state.netPosition > 0;
  const netCredit = state.netPosition < 0;

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-muted/40",
        compact ? "px-2.5 py-2 space-y-1.5" : "px-3 py-2.5 space-y-2",
        className,
      )}
      data-testid="customer-account-summary-strip"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
          Account at a glance
          {customerName ? (
            <span className="text-foreground font-medium"> · {customerName.toUpperCase()}</span>
          ) : null}
        </p>
        {!hideAuditButton && customerId && organizationId && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("gap-1.5", compact ? "h-7 text-xs" : "h-8 text-xs")}
            onClick={() => setAuditOpen(true)}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Check this account
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading account…
        </div>
      ) : (
        <>
          {/* Visible arithmetic — not four detached cards */}
          <div
            className={cn(
              "flex flex-wrap items-baseline gap-x-1.5 gap-y-1 font-medium tabular-nums",
              compact ? "text-sm" : "text-base",
            )}
          >
            <span className="text-foreground">
              <span className="text-muted-foreground font-normal text-xs mr-1">Customer owes</span>
              {formatAccountInr(state.outstanding)}
              <span className="sr-only"> (Outstanding)</span>
            </span>
            <span className="text-muted-foreground font-normal" aria-hidden>
              −
            </span>
            <span className="text-foreground">
              <span className="text-muted-foreground font-normal text-xs mr-1">Advance held</span>
              {formatAccountInr(state.unusedAdvance)}
              <span className="sr-only"> (Unused Advance)</span>
            </span>
            <span className="text-muted-foreground font-normal" aria-hidden>
              =
            </span>
            <span
              className={cn(
                "font-semibold",
                netPositive && "text-destructive",
                netCredit && "text-emerald-700 dark:text-emerald-400",
                !netPositive && !netCredit && "text-foreground",
              )}
            >
              <span className="text-muted-foreground font-normal text-xs mr-1">Net</span>
              {netLabel}
              <span className="sr-only"> (Net Position)</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
              Outstanding {formatAccountInr(state.outstanding)}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
              Unused Advance {formatAccountInr(state.unusedAdvance)}
            </Badge>
            {showUnclaimed && (
              <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                Unclaimed SR {formatAccountInr(state.unclaimedSaleReturn)}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
              Net Position {netLabel}
            </Badge>
            {state.openingBalance !== 0 && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                Includes opening balance {formatAccountInr(state.openingBalance)}
                {state.openingBalance < 0 ? " Cr" : " Dr"}
              </Badge>
            )}
          </div>

          {state.unusedAdvance > 0 && state.advanceLegs.length > 0 && (
            <Collapsible open={advanceOpen} onOpenChange={setAdvanceOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-emerald-800 dark:text-emerald-300 hover:underline"
                >
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 transition-transform", advanceOpen && "rotate-180")}
                  />
                  What’s in Advance held {formatAccountInr(state.unusedAdvance)}?
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground pl-1">
                  {state.advanceLegs.map((leg) => (
                    <li key={leg.id || leg.advanceNumber} className="tabular-nums">
                      {formatAccountInr(leg.remaining)} remaining of {leg.advanceNumber}
                      <span className="text-muted-foreground/80">
                        {" "}
                        (of {formatAccountInr(leg.amount)})
                      </span>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}

      {customerId && organizationId && (
        <CustomerAccountAuditDialog
          open={auditOpen}
          onOpenChange={setAuditOpen}
          organizationId={organizationId}
          customerId={customerId}
          customerName={customerName || state.customerName}
        />
      )}
    </div>
  );
}
