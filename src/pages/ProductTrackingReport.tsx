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
import { Search, Barcode, AlertTriangle } from "lucide-react";
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
    id: "type",
    accessorKey: "movement_type",
    header: "Type",
    size: 100,
    cell: ({ getValue }) => {
      const type = getValue() as string;
      return (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            type === "purchase"
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {type === "purchase" ? "Purchase" : "Sale"}
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
const MAX_DATE_RANGE_DAYS = 90;

const ProductTrackingReport = () => {
  const { currentOrganization } = useOrganization();
  const [searchBarcode, setSearchBarcode] = useState("");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
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
    if (diffDays > MAX_DATE_RANGE_DAYS) return `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days`;
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
          product_variants!inner (
            barcode,
            size,
            products!inner (
              product_name,
              organization_id,
              category,
              brand
            )
          )
        `, { count: "exact" })
        .eq("product_variants.products.organization_id", currentOrganization.id)
        .gte("created_at", startDate + "T00:00:00")
        .lte("created_at", endDate + "T23:59:59")
        .order("created_at", { ascending: false });

      // Server-side filters
      if (movementTypeFilter !== "all") {
        query = query.eq("movement_type", movementTypeFilter);
      }

      if (searchBarcode) {
        const isNumeric = /^\d+$/.test(searchBarcode.trim());
        if (isNumeric) {
          // Barcode search: filter directly on variant barcode
          query = query.ilike("product_variants.barcode", `%${searchBarcode}%`);
        } else {
          // Text search: filter on product name
          query = query.ilike("product_variants.products.product_name", `%${searchBarcode}%`);
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
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent flex items-center gap-2">
              <Barcode className="h-8 w-8 text-primary" />
              Product Tracking Report
            </h1>
            <p className="text-muted-foreground mt-1">
              Track product movements with credit and debit details
            </p>
          </div>
          <BackToDashboard />
        </div>

        {/* Filters */}
        <Card className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search by Barcode/Product</label>
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
              <label className="text-sm font-medium">Movement Type</label>
              <Select value={movementTypeFilter} onValueChange={handleFilterChange(setMovementTypeFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="sale">Sale</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
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
              <label className="text-sm font-medium">Brand</label>
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
              <label className="text-sm font-medium">Start Date *</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">End Date *</label>
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
              {totalCount > 0 ? `Showing ${movements.length} of ${totalCount} records (page ${currentPage}/${totalPages})` : "No records found"}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchBarcode("");
                setStartDate(format(subDays(new Date(), 30), "yyyy-MM-dd"));
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

        {/* Movements Table */}
        <Card>
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
