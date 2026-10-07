import { SkeletonKpiCards } from "@/components/skeletons/SkeletonKpiCards";
import { SkeletonTableRows } from "@/components/skeletons/SkeletonTableRows";
import { SALES_INVOICE_TABLE_SKELETON_COLUMNS } from "@/components/skeletons/dashboardSkeletonPresets";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody } from "@/components/ui/table";

/**
 * Tab-load shell for Sales Invoice Dashboard: same shape as the page's own initial-load
 * skeleton (KPI strip + invoice table rows), shown while the lazy chunk downloads, so the
 * first open does not look like the generic chart-tile dashboard.
 */
export function SalesInvoiceDashboardLoadShell() {
  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col gap-2 p-3"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-ezzy-load-shell="sales-invoice-dashboard"
    >
      <Skeleton className="h-7 w-48 rounded" />
      <SkeletonKpiCards
        count={7}
        columnsClassName="grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7 lg:gap-2"
      />
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200/80 bg-white">
        <Table>
          <TableBody>
            <SkeletonTableRows count={10} columns={SALES_INVOICE_TABLE_SKELETON_COLUMNS} />
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
