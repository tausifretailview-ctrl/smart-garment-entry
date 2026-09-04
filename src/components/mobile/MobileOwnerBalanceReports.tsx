import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomerFinancialSnapshotMap } from "@/utils/customerFinancialSnapshot";
import { fetchAllCustomers, fetchAllSuppliers } from "@/utils/fetchAllRows";
import { loadSupplierBalanceMapForOrg } from "@/utils/supplierBalanceUtils";
import { sortSizes } from "@/utils/sizeSort";
import { withMobileQueryTimeout } from "@/lib/mobileQueryTimeout";
import { MobileReportSearchBar } from "@/components/mobile/MobileReportSearchBar";
import { ReportExportButton } from "@/components/mobile/ReportExportButton";
import { MetricCard } from "@/components/mobile/MobileReportMetricCard";
import {
  MobileReportTable,
  mobileReportTableWrapClass,
  mobileReportTdClass,
  mobileReportThClass,
  mobileReportTheadClass,
  type ReportTableColumn,
} from "@/components/mobile/MobileReportTable";
import { buildCsvFromReportTable } from "@/utils/reportCsvExport";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChevronsUpDown, X } from "lucide-react";
import { MobilePickerSheet } from "@/components/mobile/MobilePickerSheet";
import { fetchMobileStockReportPages } from "@/utils/mobileStockReportQuery";

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
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["rpt-size-wise-stock", orgId],
    enabled: !!orgId,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
        try {
          const rpcRows = await fetchMobileStockReportPages(orgId!, { maxRows: 2000, pageSize: 250 });
          if (rpcRows.length) {
            return rpcRows.map((r) => ({
              size: r.size,
              color: r.color,
              stock_qty: Number(r.current_stock) || 0,
              product_id: r.variant_id,
              products: {
                product_name: r.product_name,
                brand: r.brand,
                category: r.category,
                department: r.style,
              },
            }));
          }
        } catch {
          // Fall through to a paged variant query.
        }

        const pageSize = 800;
        const all: Array<{
          size: string | null;
          color: string | null;
          stock_qty: number | null;
          product_id: string;
          products: { product_name?: string | null; brand?: string | null; category?: string | null; department?: string | null } | null;
        }> = [];
        let offset = 0;
        while (offset < 4000) {
          const { data: variants, error } = await supabase
            .from("product_variants")
            .select("size, color, stock_qty, product_id, products!inner(product_name, brand, category, style)")
            .eq("organization_id", orgId!)
            .is("deleted_at", null)
            .range(offset, offset + pageSize - 1);
          if (error) throw error;
          if (!variants?.length) break;
          for (const row of variants as Array<{
            size: string | null;
            color: string | null;
            stock_qty: number | null;
            product_id: string;
            products: { product_name?: string | null; brand?: string | null; category?: string | null; style?: string | null } | null;
          }>) {
            all.push({
              size: row.size,
              color: row.color,
              stock_qty: row.stock_qty,
              product_id: row.product_id,
              products: row.products
                ? {
                    product_name: row.products.product_name,
                    brand: row.products.brand,
                    category: row.products.category,
                    department: row.products.style || "",
                  }
                : null,
            });
          }
          if (variants.length < pageSize) break;
          offset += pageSize;
        }
        return all;
      }, 25_000),
  });

  const { rows, sizes, totals } = useMemo(() => {
    if (!data?.length) return { rows: [] as SizeWiseRow[], sizes: [] as string[], totals: { qty: 0, products: 0 } };

    const filtered = data.filter((v: any) => {
      const prod = v.products;
      if (selectedProduct && prod?.product_name !== selectedProduct) return false;
      const hay = [prod?.product_name, prod?.brand, v.color, v.size, prod?.category, prod?.department]
        .filter(Boolean)
        .join(" ");
      return tokenMatch(hay, selectedProduct ? "" : search);
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
  }, [data, search, selectedProduct]);

  const productNames = useMemo(() => {
    if (!data?.length) return [] as string[];
    const names = new Set<string>();
    data.forEach((v: any) => {
      const n = v.products?.product_name;
      if (n) names.add(n);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const pickerNames = useMemo(
    () => productNames.filter((n) => tokenMatch(n, pickerOpen ? search : "")),
    [productNames, search, pickerOpen],
  );

  if (isLoading) return <LoadingRows />;
  if (isError) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-muted-foreground text-sm">Could not load size-wise stock.</p>
        <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-primary">
          Try again
        </button>
      </div>
    );
  }
  if (!data?.length) return <EmptyState message="No stock data found" />;

  const sizeWiseCsvColumns: ReportTableColumn<SizeWiseRow>[] = [
    {
      key: "product",
      header: "Product",
      render: () => "",
      csvText: (row) => {
        const subtitle = [row.brand, row.color, row.department].filter(Boolean).join(" • ");
        return subtitle ? `${row.productName} — ${subtitle}` : row.productName;
      },
    },
    ...sizes.map((size) => ({
      key: `size-${size}`,
      header: size,
      render: () => "",
      csvText: (row: SizeWiseRow) => String(row.sizeStocks[size] || 0),
    })),
    {
      key: "total",
      header: "Total",
      render: () => "",
      csvText: (row) => String(row.totalStock),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <MobileReportSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search product, brand, color, size…"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex-1 min-w-0 flex items-center justify-between gap-2 rounded-xl border border-border/40 bg-card px-3 py-2.5 text-left touch-manipulation active:bg-muted/40"
        >
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Select product details</p>
            <p className="text-sm font-semibold truncate">{selectedProduct || "Choose a product for cut sizes"}</p>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
        {selectedProduct ? (
          <button
            type="button"
            aria-label="Clear product"
            onClick={() => setSelectedProduct(null)}
            className="shrink-0 h-11 w-11 rounded-xl border border-border/40 bg-card flex items-center justify-center touch-manipulation"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        ) : null}
      </div>
      <MobilePickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Select product details"
        description="Pick a product to open the cut-size report"
      >
        <MobileReportSearchBar value={search} onChange={setSearch} placeholder="Search product name…" />
        <div className="max-h-[50vh] overflow-y-auto space-y-1">
          {pickerNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setSelectedProduct(name);
                setPickerOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-lg text-sm touch-manipulation",
                selectedProduct === name ? "bg-primary/10 text-primary font-semibold" : "active:bg-muted/40",
              )}
            >
              {name}
            </button>
          ))}
          {!pickerNames.length ? <EmptyState message="No products match" /> : null}
        </div>
      </MobilePickerSheet>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Summary</p>
        <ReportExportButton
          fileBaseName={`size-wise-stock-${format(new Date(), "ddMMyyyy")}`}
          buildCsv={() => buildCsvFromReportTable(sizeWiseCsvColumns, rows)}
          tableRef={tableRef}
        />
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <MetricCard label="Products" value={String(totals.products)} />
        <MetricCard label="Total Stock" value={String(totals.qty)} color="text-violet-600" />
      </div>
      <p className="text-sm font-semibold text-sky-700">Size-wise Stock</p>
      {!rows.length ? (
        <EmptyState />
      ) : (
        <div ref={tableRef} className={mobileReportTableWrapClass}>
          <table className="w-full min-w-full text-xs border-collapse">
            <thead className={cn(mobileReportTheadClass, "bg-sky-100")}>
              <tr>
                <th className={cn(mobileReportThClass, "sticky left-0 bg-sky-100 z-20 text-left min-w-[120px] text-sky-900 uppercase text-[10px]")}>
                  Product
                </th>
                {sizes.map((size) => (
                  <th key={size} className={cn(mobileReportThClass, "text-right min-w-[44px] bg-sky-100 text-sky-900 uppercase text-[10px]")}>
                    {size}
                  </th>
                ))}
                <th className={cn(mobileReportThClass, "text-right min-w-[44px] font-bold bg-sky-100 text-sky-900 uppercase text-[10px]")}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.productKey} className="group odd:bg-muted/20 even:bg-card border-b border-border/40 last:border-b-0">
                  <td className={cn(mobileReportTdClass, "sticky left-0 z-10 bg-card group-odd:bg-muted/20 min-w-[120px] max-w-[160px]")}>
                    <p className="font-semibold truncate">{row.productName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[row.brand, row.color, row.department].filter(Boolean).join(" • ")}
                    </p>
                  </td>
                  {sizes.map((size) => {
                    const qty = row.sizeStocks[size] || 0;
                    return (
                      <td
                        key={size}
                        className={cn(
                          mobileReportTdClass,
                          "text-right tabular-nums",
                          qty === 0 && "text-muted-foreground",
                        )}
                      >
                        {qty}
                      </td>
                    );
                  })}
                  <td
                    className={cn(
                      mobileReportTdClass,
                      "text-right font-bold tabular-nums",
                      row.totalStock <= 0 ? "text-destructive" : row.totalStock <= 5 ? "text-orange-600" : "text-emerald-600",
                    )}
                  >
                    {row.totalStock}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  const [showZero, setShowZero] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["rpt-customer-balance", orgId],
    enabled: !!orgId,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
        const customers = await fetchAllCustomers(orgId!);
        if (!customers.length) return [] as CustomerBalanceRow[];

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
          gst_number: c.gst_number,
          address: c.address,
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
  const totalAdvance = useMemo(
    () => filtered.reduce((s, c) => s + Math.max(0, c.advance), 0),
    [filtered],
  );

  if (isLoading) return <LoadingRows />;
  if (!data?.length) return <EmptyState message="No customers found" />;

  const customerColumns: ReportTableColumn<(typeof filtered)[number]>[] = [
    {
      key: "name",
      header: "Name",
      sticky: true,
      minWidth: "min-w-[120px]",
      csvText: (c) => (c.phone ? `${c.customer_name} — ${c.phone}` : c.customer_name),
      render: (c) => (
        <div className="min-w-[120px] max-w-[160px]">
          <p className="font-semibold truncate">{c.customer_name}</p>
          {c.phone ? <p className="text-[11px] text-muted-foreground truncate">{c.phone}</p> : null}
        </div>
      ),
    },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right",
      csvText: (c) => fmt(c.outstanding),
      render: (c) => (
        <span className={cn(c.outstanding > 0 ? "text-destructive" : undefined)}>{fmt(c.outstanding)}</span>
      ),
    },
    {
      key: "advance",
      header: "Advance",
      align: "right",
      csvText: (c) => fmt(c.advance),
      render: (c) => (
        <span className={cn(c.advance > 0 ? "text-emerald-600" : undefined)}>{fmt(c.advance)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <MobileReportSearchBar value={search} onChange={setSearch} placeholder="Search customer name or phone…" />
      <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground touch-manipulation">
        <input
          type="checkbox"
          checked={showZero}
          onChange={(e) => setShowZero(e.target.checked)}
          className="rounded border-border"
        />
        Include zero-balance customers
      </label>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Summary</p>
        <ReportExportButton
          fileBaseName={`customer-balance-${format(new Date(), "ddMMyyyy")}`}
          buildCsv={() => buildCsvFromReportTable(customerColumns, filtered)}
          tableRef={tableRef}
        />
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <MetricCard label="Customers" value={String(filtered.length)} />
        <MetricCard label="Total Outstanding" value={fmt(totalOutstanding)} color="text-destructive" />
        <MetricCard label="Total Advance" value={fmt(totalAdvance)} color="text-emerald-600" />
      </div>
      <p className="text-sm font-semibold text-sky-700">Customer Balance</p>
      {!filtered.length ? (
        <EmptyState />
      ) : (
        <MobileReportTable ref={tableRef} variant="statement" columns={customerColumns} rows={filtered} rowKey={(c) => c.id} />
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
  const [showZero, setShowZero] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["rpt-supplier-balance", orgId],
    enabled: !!orgId,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
        const [suppliers, balanceResult] = await Promise.all([
          fetchAllSuppliers(orgId!),
          loadSupplierBalanceMapForOrg(supabase, orgId!),
        ]);
        const balanceMap = balanceResult.balanceMap;

        return suppliers.map((s) => {
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
            gst_number: s.gst_number,
            address: s.address,
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

  const supplierColumns: ReportTableColumn<(typeof filtered)[number]>[] = [
    {
      key: "name",
      header: "Name",
      sticky: true,
      minWidth: "min-w-[120px]",
      csvText: (s) => (s.phone ? `${s.supplier_name} — ${s.phone}` : s.supplier_name),
      render: (s) => (
        <div className="min-w-[120px] max-w-[160px]">
          <p className="font-semibold truncate">{s.supplier_name}</p>
          {s.phone ? <p className="text-[11px] text-muted-foreground truncate">{s.phone}</p> : null}
        </div>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      csvText: (s) => fmt(Math.abs(s.balance)),
      render: (s) => {
        const balanceColor =
          s.balance > 0 ? "text-destructive" : s.balance < 0 ? "text-emerald-600" : "text-muted-foreground";
        return <span className={balanceColor}>{fmt(Math.abs(s.balance))}</span>;
      },
    },
    {
      key: "purchases",
      header: "Purchases",
      align: "right",
      csvText: (s) => fmt(s.totalPurchases),
      render: (s) => fmt(s.totalPurchases),
    },
    {
      key: "paid",
      header: "Paid",
      align: "right",
      csvText: (s) => fmt(s.totalPaid),
      render: (s) => fmt(s.totalPaid),
    },
  ];

  return (
    <div className="space-y-3">
      <MobileReportSearchBar value={search} onChange={setSearch} placeholder="Search supplier name or phone…" />
      <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground touch-manipulation">
        <input
          type="checkbox"
          checked={showZero}
          onChange={(e) => setShowZero(e.target.checked)}
          className="rounded border-border"
        />
        Include settled (zero) suppliers
      </label>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Summary</p>
        <ReportExportButton
          fileBaseName={`supplier-balance-${format(new Date(), "ddMMyyyy")}`}
          buildCsv={() => buildCsvFromReportTable(supplierColumns, filtered)}
          tableRef={tableRef}
        />
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <MetricCard label="Suppliers" value={String(filtered.length)} />
        <MetricCard label="Total Payable" value={fmt(totalPayable)} color="text-destructive" />
      </div>
      <p className="text-sm font-semibold text-sky-700">Supplier Balance</p>
      {!filtered.length ? (
        <EmptyState />
      ) : (
        <MobileReportTable ref={tableRef} variant="statement" columns={supplierColumns} rows={filtered} rowKey={(s) => s.id} />
      )}
    </div>
  );
}

