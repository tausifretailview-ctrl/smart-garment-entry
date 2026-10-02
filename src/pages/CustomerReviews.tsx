import { useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Star, Download } from "lucide-react";
import type * as XLSXType from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  matchesReviewFilters,
  summarizeReviews,
  type CustomerReviewRow,
  type RatingFilter,
} from "@/utils/customerReviewStats";

let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

const MAX_ROWS = 2000;

async function fetchReviews(orgId: string, from: string, to: string): Promise<CustomerReviewRow[]> {
  const { data: feedback, error } = await supabase
    .from("customer_feedback")
    .select("id, rating, comment, tags, salesman, source, created_at, sale_id")
    .eq("organization_id", orgId)
    .gte("created_at", `${from}T00:00:00+05:30`)
    .lte("created_at", `${to}T23:59:59.999+05:30`)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;
  const rows = feedback ?? [];
  const saleIds = Array.from(new Set(rows.map((r) => r.sale_id).filter(Boolean)));
  const sales = new Map<string, { sale_number: string | null; customer_name: string | null; customer_phone: string | null }>();
  for (let i = 0; i < saleIds.length; i += 200) {
    const { data } = await supabase
      .from("sales")
      .select("id, sale_number, customer_name, customer_phone")
      .eq("organization_id", orgId)
      .in("id", saleIds.slice(i, i + 200));
    for (const s of data ?? []) sales.set(s.id, s);
  }
  return rows.map((r) => {
    const s = sales.get(r.sale_id);
    return {
      ...r,
      tags: r.tags ?? [],
      sale_number: s?.sale_number ?? null,
      customer_name: s?.customer_name ?? null,
      customer_phone: s?.customer_phone ?? null,
    };
  });
}

function Stars({ value }: { value: number }) {
  const n = Math.round(value);
  return (
    <span className="inline-flex" aria-label={`${n} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-4 w-4 ${i <= n ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
      ))}
    </span>
  );
}

/** Reports → Customer Reviews: ratings and comments customers left on their bill page. */
export default function CustomerReviews() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rating, setRating] = useState<RatingFilter>("all");
  const [salesman, setSalesman] = useState("all");
  const [search, setSearch] = useState("");

  const { data: reviews = [], isLoading, error } = useQuery({
    queryKey: ["customer-reviews", orgId, fromDate, toDate],
    queryFn: () => fetchReviews(orgId!, fromDate, toDate),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const salesmen = useMemo(
    () => Array.from(new Set(reviews.map((r) => r.salesman).filter((s): s is string => !!s))).sort(),
    [reviews],
  );
  const filtered = useMemo(
    () => reviews.filter((r) => matchesReviewFilters(r, { rating, salesman, search })),
    [reviews, rating, salesman, search],
  );
  const summary = useMemo(() => summarizeReviews(filtered), [filtered]);

  const exportExcel = async () => {
    const XLSX = await loadXlsx();
    const header = ["Date", "Bill No", "Customer", "Phone", "Rating", "Tags", "Comment", "Salesman"];
    const body = filtered.map((r) => [
      format(new Date(r.created_at), "dd-MM-yyyy HH:mm"),
      r.sale_number ?? "",
      r.customer_name ?? "",
      r.customer_phone ?? "",
      r.rating,
      (r.tags ?? []).join(", "),
      r.comment ?? "",
      r.salesman ?? "",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Reviews");
    XLSX.writeFile(wb, `customer-reviews-${fromDate}-to-${toDate}.xlsx`);
  };

  const card = "rounded-lg border bg-card p-3";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 text-[15px]">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-bold">Customer Reviews</h1>
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" className="h-9 w-[150px]" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" className="h-9 w-[150px]" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Rating</Label>
          <Select value={rating} onValueChange={(v) => setRating(v as RatingFilter)}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ratings</SelectItem>
              <SelectItem value="good">Happy (4–5★)</SelectItem>
              <SelectItem value="ok">Okay (3★)</SelectItem>
              <SelectItem value="bad">Unhappy (1–2★)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {salesmen.length > 0 && (
          <div>
            <Label className="text-xs">Salesman</Label>
            <Select value={salesman} onValueChange={setSalesman}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All salesmen</SelectItem>
                {salesmen.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Input
          className="h-9 w-[220px]"
          placeholder="Bill no, customer, phone, comment"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="outline" className="h-9" disabled={!filtered.length} onClick={() => void exportExcel()}>
          <Download className="mr-1 h-4 w-4" /> Excel
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className={card}>
          <div className="text-xs text-muted-foreground">Average rating</div>
          <div className="flex items-center gap-2 text-2xl font-bold">
            {summary.count ? summary.average.toFixed(1) : "–"} <Stars value={summary.average} />
          </div>
        </div>
        <div className={card}>
          <div className="text-xs text-muted-foreground">Reviews</div>
          <div className="text-2xl font-bold">{summary.count}</div>
        </div>
        <div className={card}>
          <div className="text-xs text-muted-foreground">Happy customers (4–5★)</div>
          <div className="text-2xl font-bold">{summary.count ? `${summary.happyPercent}%` : "–"}</div>
        </div>
        <div className={card}>
          <div className="text-xs text-muted-foreground">By stars</div>
          <div className="mt-1 flex gap-2 text-sm">
            {[5, 4, 3, 2, 1].map((s) => (
              <span key={s}>
                {s}★ <b>{summary.byStars[s - 1]}</b>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        {error ? (
          <p className="p-4 text-sm text-destructive">
            Could not load reviews: {error instanceof Error ? error.message : String(error)}
          </p>
        ) : isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading reviews…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No reviews in this period. Customers can rate their bill on the bill page link (WhatsApp / notification).
          </p>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-slate-800">
              <TableRow>
                {["Date", "Bill No", "Customer", "Phone", "Rating", "Tags", "Comment", "Salesman"].map((h) => (
                  <TableHead key={h} className="font-bold text-white">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{format(new Date(r.created_at), "dd-MM-yyyy HH:mm")}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium">{r.sale_number ?? "–"}</TableCell>
                  <TableCell>{r.customer_name ?? "–"}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.customer_phone ?? "–"}</TableCell>
                  <TableCell>
                    <Stars value={r.rating} />
                  </TableCell>
                  <TableCell>{(r.tags ?? []).join(", ") || "–"}</TableCell>
                  <TableCell className="max-w-[360px] whitespace-pre-wrap">{r.comment || "–"}</TableCell>
                  <TableCell>{r.salesman ?? "–"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {reviews.length >= MAX_ROWS && (
        <p className="text-xs text-muted-foreground">Showing the latest {MAX_ROWS} reviews. Narrow the dates to see older ones.</p>
      )}
    </div>
  );
}
