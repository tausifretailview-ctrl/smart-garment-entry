import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Loader2, PackageX, RefreshCw, Search, Trash2 } from "lucide-react";

import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useToast } from "@/hooks/use-toast";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportSkeleton } from "@/components/ui/skeletons";
import { cn } from "@/lib/utils";
import {
  fetchAllOrphanedProducts,
  softDeleteOrphanedProducts,
  type OrphanedProductRpcRow,
} from "@/utils/fetchAllRows";

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
  const { toast } = useToast();
  const { hasSpecialPermission } = useUserPermissions();
  const queryClient = useQueryClient();
  const canDelete = hasSpecialPermission("delete_records");

  const orgId = currentOrganization?.id;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = new Set(filteredRows.map((r) => r.product_id));
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
      }
      return next;
    });
  }, [filteredRows]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  const pageStart = filteredRows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * PAGE_SIZE, filteredRows.length);

  const allPageSelected =
    paginatedRows.length > 0 && paginatedRows.every((r) => selectedIds.has(r.product_id));
  const somePageSelected = paginatedRows.some((r) => selectedIds.has(r.product_id));

  const toggleRow = useCallback((productId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }, []);

  const togglePage = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const row of paginatedRows) {
          if (checked) next.add(row.product_id);
          else next.delete(row.product_id);
        }
        return next;
      });
    },
    [paginatedRows],
  );

  const handleBulkDelete = async () => {
    if (!orgId || selectedIds.size === 0) return;

    if (!canDelete) {
      toast({
        title: "Permission Denied",
        description:
          "You don't have permission to delete products. Ask admin to enable 'Delete Records' in User Rights.",
        variant: "destructive",
      });
      setShowDeleteDialog(false);
      return;
    }

    setIsDeleting(true);
    try {
      const result = await softDeleteOrphanedProducts(orgId, Array.from(selectedIds));

      if (result.deleted_count > 0) {
        toast({
          title: "Moved to Recycle Bin",
          description: `${result.deleted_count} orphaned product(s) soft-deleted. Restore from Recycle Bin if needed.`,
        });
      }

      if (result.skipped.length > 0) {
        const notOrphan = result.skipped.filter((s) => s.reason === "not_orphan").length;
        toast({
          title: result.deleted_count > 0 ? "Some items skipped" : "Nothing deleted",
          description:
            notOrphan > 0
              ? `${result.skipped.length} product(s) were no longer orphaned (references appeared since the list loaded). Refresh and review.`
              : `${result.skipped.length} product(s) could not be deleted.`,
          variant: result.deleted_count > 0 ? "default" : "destructive",
        });
      }

      setSelectedIds(new Set());
      setShowDeleteDialog(false);
      await queryClient.invalidateQueries({ queryKey: ["orphaned-products", orgId] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete orphaned products";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

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
              Zero stock, no active references. Soft-delete moves items to Recycle Bin (recoverable).
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
          {canDelete && selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-4 w-4" />
              Soft-delete selected ({selectedIds.size})
            </Button>
          )}
        </div>

        {isLoading ? (
          <ReportSkeleton rows={8} />
        ) : error ? (
          <p className="text-destructive text-sm py-8 text-center">
            Failed to load orphaned products. Apply migrations{" "}
            <code className="text-xs">20260911120000</code> and{" "}
            <code className="text-xs">20260911130000</code> if RPCs are missing.
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
                    {canDelete && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                          onCheckedChange={(v) => togglePage(v === true)}
                          aria-label="Select all on this page"
                        />
                      </TableHead>
                    )}
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
                      {canDelete && (
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(row.product_id)}
                            onCheckedChange={(v) => toggleRow(row.product_id, v === true)}
                            aria-label={`Select ${row.product_name}`}
                          />
                        </TableCell>
                      )}
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
                {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
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

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Soft-delete orphaned products?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.size} product(s) will be moved to the Recycle Bin along with their variants.
              This is recoverable. The server will re-check that each product is still orphaned before
              deleting — items that gained references since you loaded the list will be skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleBulkDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Soft-delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
