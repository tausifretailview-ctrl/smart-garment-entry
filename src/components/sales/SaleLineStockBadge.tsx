import { cn } from "@/lib/utils";
import type { LiveStockView } from "@/lib/saleLineLiveStock";

const TONE: Record<LiveStockView["tone"], string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  low: "bg-amber-50 text-amber-800 ring-amber-200",
  out: "bg-red-50 text-red-700 ring-red-200",
};

/** Live stock under a Sale Invoice line's barcode. Screen only: never part of the printed bill. */
export function SaleLineStockBadge({ view, className }: { view: LiveStockView | null; className?: string }) {
  if (!view) return null;
  return (
    <span
      className={cn(
        "sale-line-stock mt-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-semibold ring-1 tabular-nums print:hidden",
        TONE[view.tone],
        className,
      )}
      title={view.title}
      aria-label={view.title}
      data-tone={view.tone}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {view.label}
    </span>
  );
}
