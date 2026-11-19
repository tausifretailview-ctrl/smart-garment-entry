import { useQuery } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STALE_SETTINGS } from "@/lib/queryStaleTimes";
import { fetchTransporters, isMissingTransportersTable, type Transporter } from "@/lib/data/transporters";

const NONE = "__none__";

export function useTransporters(orgId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["transporters", orgId],
    enabled: !!orgId && enabled,
    staleTime: STALE_SETTINGS,
    retry: (count, error) => !isMissingTransportersTable(error as { message?: string }) && count < 2,
    queryFn: () => fetchTransporters(orgId!),
  });
}

/**
 * Customer Master → Transporter: pick one of the shop's transporters (Master → Transport Master).
 * Inactive ones are left out unless already chosen for this customer.
 */
export function TransporterSelect({
  orgId,
  value,
  onChange,
  id,
  className,
}: {
  orgId: string | undefined;
  value: string;
  onChange: (transporterId: string, transporter: Transporter | null) => void;
  id?: string;
  className?: string;
}) {
  const query = useTransporters(orgId);
  const list = (query.data ?? []).filter((t) => t.is_active || t.id === value);
  const notSetUp = query.error != null && isMissingTransportersTable(query.error as { message?: string });

  return (
    <div className="space-y-1">
      <Select
        value={value || NONE}
        onValueChange={(next) => {
          if (next === NONE) onChange("", null);
          else onChange(next, list.find((t) => t.id === next) ?? null);
        }}
        disabled={notSetUp || query.isLoading}
      >
        <SelectTrigger id={id} className={className ?? "h-9"}>
          <SelectValue placeholder={query.isLoading ? "Loading…" : "Select transporter"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No transporter</SelectItem>
          {list.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              <span className="flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                {t.transporter_name}
                {t.city ? <span className="text-muted-foreground">· {t.city}</span> : null}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {notSetUp ? (
        <p className="text-[10px] text-muted-foreground">Transport Master is not set up yet (run the transport SQL).</p>
      ) : !query.isLoading && list.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">Add transporters in Master → Transport Master.</p>
      ) : null}
    </div>
  );
}
