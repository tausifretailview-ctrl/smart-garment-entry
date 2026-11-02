import { useEffect, useMemo, useState } from "react";
import { AlarmClock, AlertTriangle, ChevronRight, Truck, X } from "lucide-react";
import { useEwayBillAlerts } from "@/hooks/useEwayBillAlerts";
import { cn } from "@/lib/utils";
import { formatIstDateTime, summarizeEwbAlerts, type EwbAlertKind } from "@/utils/ewayBill";

type Props = {
  organizationId: string | undefined;
  /** Industrial mode with E-Invoice Settings on; nothing is read otherwise. */
  enabled: boolean;
  onShow: (kind: EwbAlertKind) => void;
  /** Lets the user hide the strip until the counts change (Sales Invoice list). */
  dismissible?: boolean;
  className?: string;
};

function timeOf(iso: string | null): string {
  return formatIstDateTime(iso).slice(11);
}

/** E-way bills that lapse soon, lapsed a little while ago, or still have no vehicle (Phase 2 step 5a). */
export function EwayBillAlertStrip({ organizationId, enabled, onShow, dismissible, className }: Props) {
  const { rows } = useEwayBillAlerts(organizationId, enabled);
  // Re-check the clock each minute so "within 8 hours" stays true while the page is open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled || rows.length === 0) return;
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, [enabled, rows.length]);
  const s = useMemo(() => summarizeEwbAlerts(rows, now), [rows, now]);
  const signature = `${s.soon}/${s.extend}/${s.partA}`;
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);

  if (!enabled || s.total === 0 || hiddenFor === signature) return null;

  const chips: Array<{ kind: EwbAlertKind; text: string; tone: string; Icon: typeof AlarmClock }> = [];
  if (s.extend > 0) {
    chips.push({
      kind: "extend",
      text: `${s.extend} lapsed: extend within 8 h`,
      tone: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
      Icon: AlertTriangle,
    });
  }
  if (s.soon > 0) {
    chips.push({
      kind: "soon",
      text: `${s.soon} expire${s.soon === 1 ? "s" : ""} soon${s.nextExpiry ? ` (next ${timeOf(s.nextExpiry)})` : ""}`,
      tone: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
      Icon: AlarmClock,
    });
  }
  if (s.partA > 0) {
    chips.push({
      kind: "partA",
      text: `${s.partA} without vehicle`,
      tone: "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100",
      Icon: Truck,
    });
  }

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-white px-3 py-1.5 text-xs shadow-sm",
        className,
      )}
      role="status"
    >
      <span className="flex items-center gap-1.5 font-semibold text-slate-700">
        <Truck className="h-4 w-4 text-teal-600" />
        E-way bills
      </span>
      {chips.map(({ kind, text, tone, Icon }) => (
        <button
          key={kind}
          type="button"
          onClick={() => onShow(kind)}
          className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium transition-colors", tone)}
        >
          <Icon className="h-3.5 w-3.5" />
          {text}
          <ChevronRight className="h-3 w-3 opacity-60" />
        </button>
      ))}
      {dismissible ? (
        <button
          type="button"
          onClick={() => setHiddenFor(signature)}
          className="ml-auto rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Hide e-way bill alerts"
          title="Hide until something changes"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
