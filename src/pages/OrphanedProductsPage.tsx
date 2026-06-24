import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Loader2, PackageX, RefreshCw, Search } from "lucide-react";

import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportSkeleton } from "@/components/ui/skeletons";
import { cn } from "@/lib/utils";
import { fetchAllOrphanedProducts, type OrphanedProductRpcRow } from "@/utils/fetchAllRows";

const PAGE_SIZE = 30;

function matchesSearch(row: OrphanedProductRpcRow, query: string) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return (
    row.product_name?.toLowerCase().includes(q) ||
    row.brand?.toLowerCase().includes(q) ||
    row.category?.toLowerCase().includes(q) ||
    row.reason?.toLowerCase().includes(q)
  );
}

export default function OrphanedProductsPage() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const orgId = currentOrganization?.id;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: rows = [], isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["orphaned-products", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: () => fetchAllOrphanedProducts(orgId!),
  });

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesSearch(row, search)),
    [rows, search],
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  const pageStart = filteredRows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * PAGE_SIZE, filteredRows.length);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-[1400px] mx-auto w-full">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => orgNavigate("/products")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Product Dashboard
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <PackageX className="h-6 w-6 text-amber-600 shrink-0" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">Orphaned Products</h1>
            <p className="text-sm text-muted-foreground">
              Review-only — zero stock, no active references. Soft-delete will be enabled after verification.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-2"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, brand, category, reason…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Badge variant="secondary" className="tabular-nums">
            {filteredRows.length} orphan{filteredRows.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {isLoading ? (
          <ReportSkeleton rows={8} />
        ) : error ? (
          <p className="text-destructive text-sm py-8 text-center">
            Failed to load orphaned products. Apply migration{" "}
            <code className="text-xs">20260911120000_get_orphaned_products</code> if the RPC is missing.
          </p>
        ) : filteredRows.length === 0 ? (
          <p className="text-muted-foreground text-sm py-12 text-center">
            No orphaned products found for this organization.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Product</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRows.map((row) => (
                    <TableRow key={row.product_id}>
                      <TableCell className="font-medium">{row.product_name?.toUpperCase()}</TableCell>
                      <TableCell>{row.brand || "—"}</TableCell>
                      <TableCell>{row.category || "—"}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {row.created_at
                          ? format(new Date(row.created_at), "dd MMM yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-red-600">
                        {row.total_stock}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "text-xs",
                            row.reason === "Line cancelled before save"
                              ? "bg-amber-100 text-amber-800 border-amber-200"
                              : "bg-slate-100 text-slate-700 border-slate-200",
                          )}
                        >
                          {row.reason}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mt-4 text-sm text-muted-foreground">
              <span>
                Showing {pageStart}–{pageEnd} of {filteredRows.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="tabular-nums">
                  Page {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
