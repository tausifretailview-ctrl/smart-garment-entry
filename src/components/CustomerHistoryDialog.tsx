import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { CustomerAccountHistoryContent } from "@/components/customer-account/CustomerAccountHistoryContent";

interface CustomerHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  customerName: string;
  organizationId: string;
}

export function CustomerHistoryDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  organizationId,
}: CustomerHistoryDialogProps) {
  const isMobile = useIsMobile();
  const queriesEnabled = open && !!customerId && !!organizationId;

  if (isMobile) {
    return (
      <div
        className={cn(
          "fixed inset-0 z-50 bg-background flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full pointer-events-none",
        )}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-3 py-3 flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition-all touch-manipulation"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold truncate">{customerName}</h2>
            <p className="text-[11px] text-muted-foreground">Account history & transactions</p>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <CustomerAccountHistoryContent
            customerId={customerId}
            customerName={customerName}
            organizationId={organizationId}
            queriesEnabled={queriesEnabled}
          />
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] overflow-hidden flex flex-col p-0 bg-slate-50">
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-blue-600 to-violet-500 rounded-t-lg flex-shrink-0" />
        <div className="p-4 sm:p-5 pb-0 bg-slate-50">
          <DialogHeader>
            <DialogTitle className="text-2xl font-extrabold text-blue-600 tracking-tight leading-tight">
              {customerName}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-base mt-0.5">
              Customer account history and transactions
            </DialogDescription>
          </DialogHeader>
        </div>
        <CustomerAccountHistoryContent
          customerId={customerId}
          customerName={customerName}
          organizationId={organizationId}
          queriesEnabled={queriesEnabled}
        />
      </DialogContent>
    </Dialog>
  );
}
