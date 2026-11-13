import { Loader2 } from "lucide-react";
import { draftLoadPercent } from "@/utils/draftLoadProgress";

/**
 * Full-screen "Loading Draft Bill…" card with a progress bar, shown while a large saved draft
 * loads into Purchase Entry. Moved out of PurchaseEntry.tsx unchanged (Plan Phase 4, S4).
 */
export function PurchaseDraftLoadingOverlay({ loaded, total }: { loaded: number; total: number }) {
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card border rounded-xl shadow-xl p-6 w-80 space-y-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div>
            <p className="font-semibold text-sm">Loading Draft Bill...</p>
            <p className="text-xs text-muted-foreground">Large bill with {total} items</p>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Loading items</span>
            <span>
              {loaded} / {total}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${draftLoadPercent(loaded, total)}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
