import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomerFinancialSnapshotMap } from "@/utils/customerFinancialSnapshot";
import { loadSupplierBalanceMapForOrg } from "@/utils/supplierBalanceUtils";
import { sortSizes } from "@/utils/sizeSort";
import { withMobileQueryTimeout } from "@/lib/mobileQueryTimeout";
import { MobileReportSearchBar } from "@/components/mobile/MobileReportSearchBar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChevronDown, Phone } from "lucide-react";

const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

const LoadingRows = () => (
  <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
);

const EmptyState = ({ message = "No matching records" }: { message?: string }) => (
  <div className="text-center py-12">
    <p className="text-muted-foreground text-sm">{message}</p>
  </div>
);

function tokenMatch(haystack: string, query: string) {
  const tokens = query
    .toLowerCase()
    .split(/[-\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = haystack.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

const MetricCard = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="flex-1 min-w-[100px] rounded-xl border border-border/40 bg-card p-3">
    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
    <p className={cn("text-base font-bold mt-0.5 tabular-nums", color || "text-foreground")}>{value}</p>
  </div>
);

type SizeWiseRow = {
  productKey: string;
  productName: string;
  brand: string;
  color: string;
  department: string;
  category: string;
  sizeStocks: Record<string, number>;
  totalStock: number;
};

export function SizeWiseStockReport({ orgId }: { orgId?: string }) {
  const [search, setSearch] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["rpt-size-wise-stock", orgId],
    enabled: !!orgId,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
        const { data: variants, error } = await supabase
          .from("product_variants")
          .select(
            "size, color, stock_qty, product_id, products!inner(product_name, brand, category, department, organization_id)",
          )
          .eq("organization_id", orgId!)
          .eq("products.organization_id", orgId!)
          .is("deleted_at", null);
        if (error) throw error;
        return variants || [];
      }),
  });

  const { rows, sizes, totals } = useMemo(() => {
    if (!data?.length) return { rows: [] as SizeWiseRow[], sizes: [] as string[], totals: { qty: 0, products: 0 } };

    const filtered = data.filter((v: any) => {
      const prod = v.products;
      const hay = [prod?.product_name, prod?.brand, v.color, v.size, prod?.category, prod?.department]
        .filter(Boolean)
        .join(" ");
      return tokenMatch(hay, search);
    });

    const productMap = new Map<string, SizeWiseRow>();
    filtered.forEach((v: any) => {
      const prod = v.products;
      const productKey = `${prod?.product_name}-${prod?.brand}-${v.color}-${prod?.department || ""}`;
      if (!productMap.has(productKey)) {
        productMap.set(productKey, {
          productKey,
          productName: prod?.product_name || "—",
          brand: prod?.brand || "",
          color: v.color || "",
          department: prod?.department || "",
          category: prod?.category || "",
          sizeStocks: {},
          totalStock: 0,
        });
      }
      const row = productMap.get(productKey)!;
      const size = v.size || "—";
      const qty = v.stock_qty || 0;
      row.sizeStocks[size] = (row.sizeStocks[size] || 0) + qty;
      row.totalStock += qty;
    });

    const rows = [...productMap.values()].sort((a, b) => a.productName.localeCompare(b.productName));
    const allSizes = sortSizes([...new Set(filtered.map((v: any) => v.size).filter(Boolean))]);
    const qty = rows.reduce((s, r) => s + r.totalStock, 0);
    return { rows, sizes: allSizes, totals: { qty, products: rows.length } };
  }, [data, search]);

  if (isLoading) return <LoadingRows />;
  if (!data?.length) return <EmptyState message="No stock data found" />;

  return (
    <div className="space-y-3">
      <MobileReportSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search product, brand, color, size…"
      />
      <div className="flex gap-2">
        <MetricCard label="Products" value={String(totals.products)} />
        <MetricCard label="Total Qty" value={String(totals.qty)} color="text-violet-600" />
      </div>
      {!rows.length ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const expanded = expandedKey === row.productKey;
            return (
              <div key={row.productKey} className="bg-card rounded-xl border border-border/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedKey(expanded ? null : row.productKey)}
                  className="w-full flex items-center justify-between p-3 text-left active:bg-muted/40 touch-manipulation"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-sm font-semibold truncate">{row.productName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[row.brand, row.color, row.department].filter(Boolean).join(" • ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        "text-sm font-bold tabular-nums",
                        row.totalStock <= 0 ? "text-destructive" : row.totalStock <= 5 ? "text-orange-600" : "text-emerald-600",
                      )}
                    >
                      {row.totalStock}
                    </span>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                  </div>
                </button>
                {expanded && (
                  <div className="px-3 pb-3 border-t border-border/40 pt-2">
                    <div className="flex flex-wrap gap-1.5">
                      {sortSizes(Object.keys(row.sizeStocks)).map((size) => (
                        <div
                          key={size}
                          className="flex flex-col items-center min-w-[2.75rem] px-2 py-1.5 rounded-lg bg-muted/50 border border-border/40"
                        >
                          <span className="text-[10px] font-medium text-muted-foreground">{size}</span>
                          <span className="text-xs font-bold tabular-nums">{row.sizeStocks[size] || 0}</span>
                        </div>
                      ))}
                    </div>
                    {row.category ? (
                      <p className="text-[10px] text-muted-foreground mt-2">Category: {row.category}</p>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {sizes.length > 0 && rows.length > 0 ? (
        <div className="rounded-xl border border-border/40 bg-muted/30 p-3">
          <p className="text-[10px] font-medium text-muted-foreground uppercase mb-2">Size totals (filtered)</p>
          <div className="flex flex-wrap gap-1.5">
            {sizes.map((size) => {
              const qty = rows.reduce((s, r) => s + (r.sizeStocks[size] || 0), 0);
              return (
                <div key={size} className="px-2 py-1 rounded-md bg-card border border-border/40 text-[11px]">
                  <span className="font-medium">{size}</span>
                  <span className="ml-1 tabular-nums font-bold">{qty}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type CustomerBalanceRow = {
  id: string;
  customer_name: string;
  phone: string | null;
  opening_balance: number | null;
  outstanding: number;
  advance: number;
  cnAvailable: number;
};

export function CustomerBalanceReport({ orgId }: { orgId?: string }) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showZero, setShowZero] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["rpt-customer-balance", orgId],
    enabled: !!orgId,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
        const { data: customers, error } = await supabase
          .from("customers")
          .select("id, customer_name, phone, opening_balance, gst_number, address")
          .eq("organization_id", orgId!)
          .is("deleted_at", null)
          .order("customer_name");
        if (error) throw error;
        if (!customers?.length) return [] as CustomerBalanceRow[];

        const snapMap = await fetchCustomerFinancialSnapshotMap(
          orgId!,
          customers.map((c) => c.id),
        );

        return customers.map((c) => ({
          id: c.id,
          customer_name: c.customer_name,
          phone: c.phone,
          opening_balance: c.opening_balance,
          outstanding: snapMap.get(c.id)?.outstandingDr ?? 0,
          advance: snapMap.get(c.id)?.advanceAvailable ?? 0,
          cnAvailable: snapMap.get(c.id)?.cnAvailableTotal ?? 0,
          gst_number: (c as { gst_number?: string }).gst_number,
          address: (c as { address?: string }).address,
        }));
      }),
  });

  const filtered = useMemo(() => {
    let list = data || [];
    if (!showZero) {
      list = list.filter((c) => c.outstanding > 0 || c.advance > 0 || Math.abs(c.opening_balance || 0) > 0);
    }
    if (search.trim()) {
      list = list.filter((c) => tokenMatch([c.customer_name, c.phone || ""].join(" "), search));
    }
    return [...list].sort((a, b) => b.outstanding - a.outstanding);
  }, [data, search, showZero]);

  const totalOutstanding = useMemo(
    () => filtered.reduce((s, c) => s + Math.max(0, c.outstanding), 0),
    [filtered],
  );

  if (isLoading) return <LoadingRows />;
  if (!data?.length) return <EmptyState message="No customers found" />;

  return (
    <div className="space-y-3">
      <MobileReportSearchBar value={search} onChange={setSearch} placeholder="Search customer name or phone…" />
      <div className="flex gap-2 items-center">
        <MetricCard label="Total O/S" value={fmt(totalOutstanding)} color="text-destructive" />
        <MetricCard label="Shown" value={String(filtered.length)} />
      </div>
      <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground touch-manipulation">
        <input
          type="checkbox"
          checked={showZero}
          onChange={(e) => setShowZero(e.target.checked)}
          className="rounded border-border"
        />
        Include zero-balance customers
      </label>
      {!filtered.length ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const expanded = expandedId === c.id;
            return (
              <div key={c.id} className="bg-card rounded-xl border border-border/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : c.id)}
                  className="w-full flex items-center justify-between p-3 text-left active:bg-muted/40 touch-manipulation"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-sm font-semibold truncate">{c.customer_name}</p>
                    {c.phone ? (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {c.phone}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className={cn("text-sm font-bold tabular-nums", c.outstanding > 0 ? "text-destructive" : "text-muted-foreground")}>
                        {fmt(c.outstanding)}
                      </p>
                      {c.advance > 0 ? (
                        <p className="text-[10px] text-emerald-600 tabular-nums">Adv {fmt(c.advance)}</p>
                      ) : null}
                    </div>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                  </div>
                </button>
                {expanded && (
                  <div className="px-3 pb-3 border-t border-border/40 pt-2 space-y-1.5 text-xs">
                    <DetailRow label="Opening balance" value={fmt(c.opening_balance || 0)} />
                    <DetailRow label="Outstanding (Dr)" value={fmt(c.outstanding)} highlight={c.outstanding > 0 ? "destructive" : undefined} />
                    <DetailRow label="Advance available" value={fmt(c.advance)} highlight={c.advance > 0 ? "success" : undefined} />
                    <DetailRow label="Credit notes" value={fmt(c.cnAvailable)} />
                    {(c as { gst_number?: string }).gst_number ? (
                      <DetailRow label="GSTIN" value={(c as { gst_number?: string }).gst_number!} />
                    ) : null}
                    {(c as { address?: string }).address ? (
                      <p className="text-[11px] text-muted-foreground pt-1">{(c as { address?: string }).address}</p>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type SupplierBalanceRow = {
  id: string;
  supplier_name: string;
  phone: string | null;
  opening_balance: number | null;
  balance: number;
  totalPurchases: number;
  totalPaid: number;
  unappliedCreditNotes: number;
};

export function SupplierBalanceReport({ orgId }: { orgId?: string }) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showZero, setShowZero] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["rpt-supplier-balance", orgId],
    enabled: !!orgId,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
        const [{ data: suppliers, error: supErr }, balanceResult] = await Promise.all([
          supabase
            .from("suppliers")
            .select("id, supplier_name, phone, opening_balance, gst_number, address")
            .eq("organization_id", orgId!)
            .is("deleted_at", null)
            .order("supplier_name"),
          loadSupplierBalanceMapForOrg(supabase, orgId!),
        ]);
        if (supErr) throw supErr;
        const balanceMap = balanceResult.balanceMap;

        return (suppliers || []).map((s) => {
          const snap = balanceMap.get(s.id);
          return {
            id: s.id,
            supplier_name: s.supplier_name,
            phone: s.phone,
            opening_balance: s.opening_balance,
            balance: snap?.balance ?? s.opening_balance ?? 0,
            totalPurchases: snap?.totalPurchases ?? 0,
            totalPaid: snap?.totalPaid ?? 0,
            unappliedCreditNotes: snap?.unappliedCreditNotes ?? 0,
            gst_number: (s as { gst_number?: string }).gst_number,
            address: (s as { address?: string }).address,
          } satisfies SupplierBalanceRow & { gst_number?: string; address?: string };
        });
      }),
  });

  const filtered = useMemo(() => {
    let list = data || [];
    if (!showZero) {
      list = list.filter((s) => Math.abs(s.balance) > 0.5);
    }
    if (search.trim()) {
      list = list.filter((s) => tokenMatch([s.supplier_name, s.phone || ""].join(" "), search));
    }
    return [...list].sort((a, b) => b.balance - a.balance);
  }, [data, search, showZero]);

  const totalPayable = useMemo(
    () => filtered.reduce((s, r) => s + Math.max(0, r.balance), 0),
    [filtered],
  );

  if (isLoading) return <LoadingRows />;
  if (!data?.length) return <EmptyState message="No suppliers found" />;

  return (
    <div className="space-y-3">
      <MobileReportSearchBar value={search} onChange={setSearch} placeholder="Search supplier name or phone…" />
      <div className="flex gap-2">
        <MetricCard label="Total Payable" value={fmt(totalPayable)} color="text-destructive" />
        <MetricCard label="Shown" value={String(filtered.length)} />
      </div>
      <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground touch-manipulation">
        <input
          type="checkbox"
          checked={showZero}
          onChange={(e) => setShowZero(e.target.checked)}
          className="rounded border-border"
        />
        Include settled (zero) suppliers
      </label>
      {!filtered.length ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const expanded = expandedId === s.id;
            const balanceColor =
              s.balance > 0 ? "text-destructive" : s.balance < 0 ? "text-emerald-600" : "text-muted-foreground";
            return (
              <div key={s.id} className="bg-card rounded-xl border border-border/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : s.id)}
                  className="w-full flex items-center justify-between p-3 text-left active:bg-muted/40 touch-manipulation"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-sm font-semibold truncate">{s.supplier_name}</p>
                    {s.phone ? (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {s.phone}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className={cn("text-sm font-bold tabular-nums", balanceColor)}>{fmt(Math.abs(s.balance))}</p>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                  </div>
                </button>
                {expanded && (
                  <div className="px-3 pb-3 border-t border-border/40 pt-2 space-y-1.5 text-xs">
                    <DetailRow label="Opening balance" value={fmt(s.opening_balance || 0)} />
                    <DetailRow label="Total purchases" value={fmt(s.totalPurchases)} />
                    <DetailRow label="Total paid" value={fmt(s.totalPaid)} />
                    <DetailRow label="Unapplied CN" value={fmt(s.unappliedCreditNotes)} />
                    <DetailRow
                      label="Net balance (payable)"
                      value={fmt(s.balance)}
                      highlight={s.balance > 0 ? "destructive" : s.balance < 0 ? "success" : undefined}
                    />
                    {s.balance > 0 ? <p className="text-[10px] text-destructive">Amount owed to supplier</p> : null}
                    {s.balance < 0 ? <p className="text-[10px] text-emerald-600">Advance / credit with supplier</p> : null}
                    {(s as { gst_number?: string }).gst_number ? (
                      <DetailRow label="GSTIN" value={(s as { gst_number?: string }).gst_number!} />
                    ) : null}
                    {(s as { address?: string }).address ? (
                      <p className="text-[11px] text-muted-foreground pt-1">{(s as { address?: string }).address}</p>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "destructive" | "success";
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-semibold tabular-nums text-right",
          highlight === "destructive" && "text-destructive",
          highlight === "success" && "text-emerald-600",
        )}
      >
        {value}
      </span>
    </div>
  );
}
