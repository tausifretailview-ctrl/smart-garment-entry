import { Loader2 } from "lucide-react";
import { ERP_STATUS_BAR_HEIGHT_CLASS } from "@/lib/entryPageLayout";

/** Full-viewport placeholder while Sales/Purchase bill JS chunk loads (Windows WebView). */
export function EntryBillLoadingFallback() {
  return (
    <div
      className={`flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-slate-100 ${ERP_STATUS_BAR_HEIGHT_CLASS}`}
    >
      <div className="h-[52px] shrink-0 bg-gradient-to-r from-slate-900 to-slate-800" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 min-h-0">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading bill screen…</p>
      </div>
      <div className="h-24 shrink-0 bg-slate-900/90" />
    </div>
  );
}
