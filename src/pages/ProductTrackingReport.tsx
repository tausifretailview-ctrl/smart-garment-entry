import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Barcode, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { BackToDashboard } from "@/components/BackToDashboard";
import { format, subDays } from "date-fns";
import { ColumnDef } from "@tanstack/react-table";
import { ERPTable } from "@/components/erp-table";

interface MovementRecord {
  id: string;
  created_at: string;
  movement_type: string;
  quantity: number;
  bill_number: string;
  notes: string;
  variant_id: string;
  product_name: string;
  size: string;
  color: string;
  barcode: string;
  category: string;
  brand: string;
}

const columns: ColumnDef<MovementRecord, any>[] = [
  {
    id: "date",
    accessorKey: "created_at",
    header: "Date & Time",
    size: 160,
    cell: ({ getValue }) => (
      <span className="font-mono text-sm">
        {format(new Date(getValue()), "dd/MM/yyyy HH:mm")}
      </span>
    ),
  },
  {
    id: "barcode",
    accessorKey: "barcode",
    header: "Barcode",
    size: 140,
    cell: ({ getValue }) => (
      <span className="font-mono font-semibold">{getValue() || "N/A"}</span>
    ),
  },
  {
    id: "product_name",
    accessorKey: "product_name",
    header: "Product Name",
    size: 200,
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
  },
  {
    id: "size",
    accessorKey: "size",
    header: "Size",
    size: 80,
  },
  {
    id: "color",
    accessorKey: "color",
    header: "Color",
    size: 100,
    cell: ({ getValue }) => (
      <span className="text-sm">{getValue() as string || "—"}</span>
    ),
  },
  {
    id: "type",
    accessorKey: "movement_type",
    header: "Type",
    size: 100,
    cell: ({ getValue }) => {
      const type = getValue() as string;
      const typeConfig: Record<string, { label: string; className: string }> = {
        purchase:        { label: "Purchase",        className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
        sale:            { label: "Sale",             className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
        sale_return:     { label: "Sale Return",      className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
        purchase_return: { label: "Purchase Return",  className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
        adjustment:      { label: "Adjustment",       className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
        purchase_delete: { label: "Bill Deleted",     className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
      };
      const config = typeConfig[type] || { label: type, className: "bg-slate-100 text-slate-600" };
      return (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${config.className}`}>
          {config.label}
        </span>
      );
    },
  },
  {
    id: "bill_number",
    accessorKey: "bill_number",
    header: "Bill Number",
    size: 130,
    cell: ({ getValue }) => <span className="font-mono">{getValue()}</span>,
  },
  {
    id: "credit",
    accessorFn: (row) => (row.movement_type === "purchase" ? row.quantity : null),
    header: "Credit (In)",
    size: 100,
    cell: ({ getValue }) => (
      <span className="text-right font-semibold text-green-600 block">
        {getValue() != null ? getValue() : "-"}
      </span>
    ),
  },
  {
    id: "debit",
    accessorFn: (row) => (row.movement_type === "sale" ? Math.abs(row.quantity) : null),
    header: "Debit (Out)",
    size: 100,
    cell: ({ getValue }) => (
      <span className="text-right font-semibold text-red-600 block">
        {getValue() != null ? getValue() : "-"}
      </span>
    ),
  },
  {
    id: "notes",
    accessorKey: "notes",
    header: "Notes",
    size: 200,
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground truncate max-w-xs block">
        {getValue() as string}
      </span>
    ),
  },
];

const PAGE_SIZE = 100;
const MAX_DATE_RANGE_DAYS = 365;

const ProductTrackingReport = () => {
  const { currentOrganization } = useOrganization();
  const [searchBarcode, setSearchBarcode] = useState("");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 90), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Validate date range
  const dateRangeError = useMemo(() => {
    if (!startDate || !endDate) return "Please select a date range";
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return "End date must be after start date";
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > MAX_DATE_RANGE_DAYS) return `Date range cannot exceed 1 year`;
    return null;
  }, [startDate, endDate]);

  // Fetch category/brand options from products (lightweight)
  const { data: filterOptions } = useQuery({
    queryKey: ["product-tracking-filters", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return { categories: [], brands: [] };
      const { data } = await supabase
        .from("products")
        .select("category, brand")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);
      const categories = [...new Set((data || []).map(p => p.category).filter(Boolean))].sort() as string[];
      const brands = [...new Set((data || []).map(p => p.brand).filter(Boolean))].sort() as string[];
      return { categories, brands };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000,
  });

  // Server-side paginated query
  const { data: queryResult, isLoading } = useQuery({
    queryKey: [
      "product-tracking",
      currentOrganization?.id,
      startDate,
      endDate,
      searchBarcode,
      movementTypeFilter,
      categoryFilter,
      brandFilter,
      currentPage,
    ],
    queryFn: async () => {
      if (!currentOrganization?.id || dateRangeError) return { data: [], totalCount: 0 };

      // Build the query with server-side filters
      let query = supabase
        .from("stock_movements")
        .select(`
          id,
          created_at,
          movement_type,
          quantity,
          bill_number,
          notes,
          variant_id,
          organization_id,
          product_variants!inner (
            barcode,
            size,
            color,
            products!inner (
              product_name,
              category,
              brand
            )
          )
        `, { count: "exact" })
        .eq("organization_id", currentOrganization.id)
        .gte("created_at", startDate + "T00:00:00")
        .lte("created_at", endDate + "T23:59:59")
        .order("created_at", { ascending: false });

      // Server-side filters
      if (movementTypeFilter !== "all") {
        query = query.eq("movement_type", movementTypeFilter);
      }

      if (searchBarcode) {
        const trimmed = searchBarcode.trim();
        // Detect barcode: numeric-only OR alphanumeric like SZ13777323, EAN codes etc.
        // Rule: if it contains ANY digit AND is 5+ chars, treat as barcode first
        const looksLikeBarcode = /\d/.test(trimmed) && trimmed.length >= 5;
        if (looksLikeBarcode) {
          // Search barcode on variant — try exact match first, then partial
          query = query.or(
            `barcode.eq.${trimmed},barcode.ilike.${trimmed}%`,
            { referencedTable: "product_variants" }
          );
        } else {
          // Pure text — search product name
          query = query.ilike(
            "product_variants.products.product_name",
            `%${trimmed}%`
          );
        }
      }

      if (categoryFilter !== "all") {
        query = query.eq("product_variants.products.category", categoryFilter);
      }

      if (brandFilter !== "all") {
        query = query.eq("product_variants.products.brand", brandFilter);
      }

      // Server-side pagination
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      const movements: MovementRecord[] = (data || []).map((movement: any) => ({
        id: movement.id,
        created_at: movement.created_at,
        movement_type: movement.movement_type,
        quantity: movement.quantity,
        bill_number: movement.bill_number,
        notes: movement.notes,
        variant_id: movement.variant_id,
        product_name: movement.product_variants.products.product_name,
        size: movement.product_variants.size,
        color: movement.product_variants.color || "",
        barcode: movement.product_variants.barcode || "",
        category: movement.product_variants.products.category || "",
        brand: movement.product_variants.products.brand || "",
      }));

      return { data: movements, totalCount: count || 0 };
    },
    enabled: !!currentOrganization?.id && !dateRangeError,
  });

  const movements = queryResult?.data || [];
  const totalCount = queryResult?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Reset page when filters change
  const handleFilterChange = useCallback((setter: (v: string) => void) => {
    return (value: string) => {
      setter(value);
      setCurrentPage(1);
    };
  }, []);

  if (isLoading && !movements.length) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Barcode className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Product Tracking Report</h1>
              <p className="text-sm text-muted-foreground">
                Track product movements · purchases · sales · returns · adjustments
              </p>
            </div>
          </div>
          <BackToDashboard />
        </div>

        {/* Filters */}
        <Card className="p-4 space-y-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Search by Barcode / Product</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter barcode or product name..."
                  value={searchBarcode}
                  onChange={(e) => { setSearchBarcode(e.target.value); setCurrentPage(1); }}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Movement Type</label>
              <Select value={movementTypeFilter} onValueChange={handleFilterChange(setMovementTypeFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="purchase">Purchase (Stock In)</SelectItem>
                  <SelectItem value="sale">Sale (Stock Out)</SelectItem>
                  <SelectItem value="sale_return">Sale Return (Stock In)</SelectItem>
                  <SelectItem value="purchase_return">Purchase Return (Stock Out)</SelectItem>
                  <SelectItem value="adjustment">Stock Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</label>
              <Select value={categoryFilter} onValueChange={handleFilterChange(setCategoryFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {(filterOptions?.categories || []).map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brand</label>
              <Select value={brandFilter} onValueChange={handleFilterChange(setBrandFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {(filterOptions?.brands || []).map((brand) => (
                    <SelectItem key={brand} value={brand}>
                      {brand}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
              />
            </div>
          </div>

          {dateRangeError && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-md text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {dateRangeError}
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <p className="text-sm text-muted-foreground">
              {totalCount > 0
                ? <span>Found <span className="font-semibold text-foreground">{totalCount}</span> movements — showing page {currentPage} of {totalPages}</span>
                : <span className="text-muted-foreground/60 italic">No movements found for the selected filters</span>
              }
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchBarcode("");
                setStartDate(format(subDays(new Date(), 90), "yyyy-MM-dd"));
                setEndDate(format(new Date(), "yyyy-MM-dd"));
                setMovementTypeFilter("all");
                setCategoryFilter("all");
                setBrandFilter("all");
                setCurrentPage(1);
              }}
            >
              Clear Filters
            </Button>
          </div>
        </Card>

        {/* Summary bar */}
        {totalCount > 0 && movements.length > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-lg border border-green-200 dark:border-green-800">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="font-medium">In: {movements.filter(m => m.movement_type === 'purchase' || m.movement_type === 'sale_return').reduce((s, m) => s + Math.abs(m.quantity), 0)} units</span>
            </div>
            <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800">
              <TrendingDown className="h-3.5 w-3.5" />
              <span className="font-medium">Out: {movements.filter(m => m.movement_type === 'sale' || m.movement_type === 'purchase_return').reduce((s, m) => s + Math.abs(m.quantity), 0)} units</span>
            </div>
          </div>
        )}

        {/* Movements Table */}
        <Card className="shadow-sm overflow-hidden">
          <ERPTable
            tableId="product_tracking"
            columns={columns}
            data={movements}
            stickyFirstColumn={true}
            isLoading={isLoading}
            emptyMessage={dateRangeError ? "Please fix the date range to view data" : "No movement records found"}
            defaultColumnVisibility={{}}
          />

          {/* Server-side Pagination */}
          {totalCount > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages} ({totalCount} total records)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm px-4">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
    </div>
  );
};

export default ProductTrackingReport;
