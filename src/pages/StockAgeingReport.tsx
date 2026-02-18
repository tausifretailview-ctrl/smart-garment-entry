import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationData } from "@/hooks/useOrganizationData";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Package, Clock, AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays, format } from "date-fns";
import * as XLSX from "xlsx";

interface BatchRow {
  id: string;
  bill_number: string;
  purchase_date: string;
  quantity: number;
  purchase_bill_id: string | null;
  variant_id: string;
  product_variants: {
    size: string;
    color: string | null;
    barcode: string | null;
    mrp: number;
    pur_price: number;
    product_id: string;
    products: {
      product_name: string;
      brand: string | null;
    } | null;
  } | null;
  purchase_bills: {
    supplier_name: string;
  } | null;
}

function getAgeBucket(days: number): string {
  if (days <= 30) return "0-30d";
  if (days <= 60) return "31-60d";
  if (days <= 90) return "61-90d";
  return "90d+";
}

function getBucketVariant(bucket: string) {
  switch (bucket) {
    case "0-30d": return "success-outline" as const;
    case "31-60d": return "info" as const;
    case "61-90d": return "warning-outline" as const;
    case "90d+": return "destructive-outline" as const;
    default: return "outline" as const;
  }
}

const PAGE_SIZE = 200;

export default function StockAgeingReport() {
  const { organizationId, isReady } = useOrganizationData();
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState("30");
  const [brandFilter, setBrandFilter] = useState("all");
  const [page, setPage] = useState(0);

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["stock-ageing", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      let allRows: BatchRow[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("batch_stock")
          .select(`
            id, bill_number, purchase_date, quantity, purchase_bill_id, variant_id,
            product_variants!inner(size, color, barcode, mrp, pur_price, product_id,
              products!inner(product_name, brand)
            ),
            purchase_bills(supplier_name)
          `)
          .eq("organization_id", organizationId)
          .gt("quantity", 0)
          .order("purchase_date", { ascending: true })
          .range(from, from + 999);
        if (error) throw error;
        if (data) allRows = allRows.concat(data as unknown as BatchRow[]);
        hasMore = (data?.length || 0) === 1000;
        from += 1000;
      }
      return allRows;
    },
    enabled: isReady,
    staleTime: 30000,
  });

  const today = new Date();

  const enrichedData = useMemo(() => {
    if (!rawData) return [];
    return rawData.map((row) => {
      const ageDays = differenceInDays(today, new Date(row.purchase_date));
      return {
        ...row,
        ageDays,
        bucket: getAgeBucket(ageDays),
        productName: row.product_variants?.products?.product_name || "",
        brand: row.product_variants?.products?.brand || "",
        size: row.product_variants?.size || "",
        barcode: row.product_variants?.barcode || "",
        mrp: row.product_variants?.mrp || 0,
        purchasePrice: row.product_variants?.pur_price || 0,
        supplier: row.purchase_bills?.supplier_name || "N/A",
      };
    });
  }, [rawData]);

  // Extract unique suppliers and brands for filters
  const suppliers = useMemo(() => {
    const set = new Set(enrichedData.map((r) => r.supplier));
    return Array.from(set).sort();
  }, [enrichedData]);

  const brands = useMemo(() => {
    const set = new Set(enrichedData.filter((r) => r.brand).map((r) => r.brand));
    return Array.from(set).sort();
  }, [enrichedData]);

  // Filter
  const filtered = useMemo(() => {
    let rows = enrichedData;
    // Age threshold
    const minAge = ageFilter === "all" ? 0 : parseInt(ageFilter);
    rows = rows.filter((r) => r.ageDays >= minAge);
    // Supplier
    if (supplierFilter !== "all") rows = rows.filter((r) => r.supplier === supplierFilter);
    // Brand
    if (brandFilter !== "all") rows = rows.filter((r) => r.brand === brandFilter);
    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.productName.toLowerCase().includes(q) ||
          r.barcode.toLowerCase().includes(q) ||
          r.brand.toLowerCase().includes(q) ||
          r.size.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [enrichedData, ageFilter, supplierFilter, brandFilter, search]);

  // Summary
  const summary = useMemo(() => {
    const totalValue = filtered.reduce((s, r) => s + r.purchasePrice * r.quantity, 0);
    const over30 = filtered.filter((r) => r.ageDays > 30).reduce((s, r) => s + r.purchasePrice * r.quantity, 0);
    const over60 = filtered.filter((r) => r.ageDays > 60).reduce((s, r) => s + r.purchasePrice * r.quantity, 0);
    const over90 = filtered.filter((r) => r.ageDays > 90).reduce((s, r) => s + r.purchasePrice * r.quantity, 0);
    const totalQty = filtered.reduce((s, r) => s + r.quantity, 0);
    return { totalValue, over30, over60, over90, totalQty, count: filtered.length };
  }, [filtered]);

  // Pagination
  const paginatedRows = useMemo(() => {
    return filtered.slice(0, (page + 1) * PAGE_SIZE);
  }, [filtered, page]);

  const hasMore = paginatedRows.length < filtered.length;

  const exportToExcel = () => {
    if (!filtered.length) return toast.error("No data to export");
    const rows = filtered.map((r) => ({
      "Product Name": r.productName,
      Brand: r.brand,
      Size: r.size,
      Barcode: r.barcode,
      Supplier: r.supplier,
      "Bill No.": r.bill_number,
      "Purchase Date": format(new Date(r.purchase_date), "dd-MM-yyyy"),
      "Age (Days)": r.ageDays,
      Qty: r.quantity,
      "Purchase Value": r.purchasePrice * r.quantity,
      "Sale Value (MRP)": r.mrp * r.quantity,
      "Ageing Bucket": r.bucket,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Ageing");
    XLSX.writeFile(wb, `Stock_Ageing_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
    toast.success("Excel exported");
  };

  const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  return (
    <div className="space-y-4">
      <BackToDashboard />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Stock Ageing Report</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Package className="h-3.5 w-3.5" /> Total Aged Stock</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-lg font-bold tabular-nums">{fmt(summary.totalValue)}</p>
            <p className="text-xs text-muted-foreground">{summary.totalQty} pcs · {summary.count} batches</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> &gt;30 Days</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-lg font-bold tabular-nums">{fmt(summary.over30)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> &gt;60 Days</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-lg font-bold tabular-nums text-warning">{fmt(summary.over60)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> &gt;90 Days</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-lg font-bold tabular-nums text-destructive">{fmt(summary.over90)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, barcode, brand..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9 h-9 text-sm" />
        </div>
        <Select value={ageFilter} onValueChange={(v) => { setAgeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ages</SelectItem>
            <SelectItem value="30">&gt; 30 Days</SelectItem>
            <SelectItem value="60">&gt; 60 Days</SelectItem>
            <SelectItem value="90">&gt; 90 Days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={supplierFilter} onValueChange={(v) => { setSupplierFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px] h-9 text-sm"><SelectValue placeholder="All Suppliers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {suppliers.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={brandFilter} onValueChange={(v) => { setBrandFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="All Brands" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Brands</SelectItem>
            {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportToExcel} className="h-9 gap-1.5">
          <Download className="h-4 w-4" /> Export
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">Showing {paginatedRows.length} of {filtered.length}</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <div className="rounded-lg border overflow-auto max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Bill No.</TableHead>
                <TableHead>Purchase Date</TableHead>
                <TableHead className="text-right">Age</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Purchase Val.</TableHead>
                <TableHead className="text-right">MRP Val.</TableHead>
                <TableHead>Bucket</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRows.length === 0 ? (
                <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No aged stock found</TableCell></TableRow>
              ) : (
                paginatedRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium max-w-[200px] truncate">{r.productName}</TableCell>
                    <TableCell>{r.brand || "-"}</TableCell>
                    <TableCell>{r.size}</TableCell>
                    <TableCell className="font-mono text-xs">{r.barcode || "-"}</TableCell>
                    <TableCell>{r.supplier}</TableCell>
                    <TableCell>{r.bill_number}</TableCell>
                    <TableCell>{format(new Date(r.purchase_date), "dd-MM-yyyy")}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{r.ageDays}d</TableCell>
                    <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.purchasePrice * r.quantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.mrp * r.quantity)}</TableCell>
                    <TableCell><Badge variant={getBucketVariant(r.bucket)}>{r.bucket}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setPage((p) => p + 1)}>Load More ({filtered.length - paginatedRows.length} remaining)</Button>
        </div>
      )}
    </div>
  );
}
