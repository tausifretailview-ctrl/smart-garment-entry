import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Minus, ShieldCheck } from "lucide-react";

type DigestRow = {
  check_name: string;
  violation_count: number;
  prev_count: number;
  delta: number;
};

/**
 * Accounting-invariant summary strip for System Health — the daily digest has to
 * reach a screen a human actually opens, not just sit inside a view.
 * paid_diverges_from_receipts (paid vs compute_sale_settlement) is called out when open.
 */
export function InvariantHealthRow() {
  const { data: rows = [] } = useQuery({
    queryKey: ["invariant_digest", "health-row"],
    queryFn: async (): Promise<DigestRow[]> => {
      const { data, error } = await supabase.rpc("get_invariant_digest" as any, {});
      if (error) throw error;
      return ((data as unknown) || []) as DigestRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const total = rows.reduce((s, r) => s + Number(r.violation_count || 0), 0);
  const delta = rows.reduce((s, r) => s + Number(r.delta || 0), 0);
  const regressions = rows.filter((r) => Number(r.delta || 0) > 0).length;
  const paidMismatch = rows
    .filter((r) => r.check_name === "paid_diverges_from_receipts")
    .reduce((s, r) => s + Number(r.violation_count || 0), 0);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <div className="text-sm font-semibold">Accounting invariants</div>
        <div className="tabular-nums font-mono text-sm">{total} open</div>
        {paidMismatch > 0 && (
          <Badge variant="destructive" className="tabular-nums font-mono">
            {paidMismatch} paid≠settlement
          </Badge>
        )}
        <Badge
          variant={delta > 0 ? "destructive" : "secondary"}
          className={`tabular-nums font-mono ${delta < 0 ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}`}
        >
          {delta > 0 ? <ArrowUp className="mr-1 h-3 w-3" /> : delta < 0 ? <ArrowDown className="mr-1 h-3 w-3" /> : <Minus className="mr-1 h-3 w-3" />}
          {delta > 0 ? `+${delta}` : delta} since previous snapshot
        </Badge>
        {regressions > 0 && (
          <span className="text-xs text-muted-foreground">{regressions} org/check combinations worsened</span>
        )}
        <Link
          to="/platform-admin/data-integrity"
          className="ml-auto text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Open Data Integrity →
        </Link>
      </CardContent>
    </Card>
  );
}
