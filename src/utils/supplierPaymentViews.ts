import type { Query, QueryClient } from "@tanstack/react-query";
import { notifyMoneyViewChanged } from "@/utils/posSalesRefresh";

/**
 * Every screen that shows supplier dues, a purchase bill's paid amount / status,
 * or the supplier payment list. One list so the Purchase dashboard, Supplier
 * Payment tab, Supplier Ledger and Payments page all refresh together.
 */
export const SUPPLIER_PAYMENT_VIEW_QUERY_KEYS = [
  "voucher-entries",
  "supplier-bills",
  "supplier-balance",
  "supplier-balance-snapshot",
  "supplier-balance-map",
  "suppliers-with-balance",
  "suppliers-unpaid-bills",
  "supplier-ledger",
  "supplier-ledger-embed-snapshot",
  "supplier-transactions",
  "supplier-bill-payment-voucher-drift",
  "purchase-bills",
  "purchase-bills-summary",
  "purchase-summary",
  "journal-vouchers",
] as const;

/**
 * Mark supplier payment views stale. Open screens refetch now; closed ones
 * refetch when opened (the Purchase dashboard uses {@link refetchOnMountIfInvalidated}
 * so its tab-return cache does not keep showing the old status).
 */
export function invalidateSupplierPaymentViews(queryClient: QueryClient) {
  for (const key of SUPPLIER_PAYMENT_VIEW_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/** After this tab saved / deleted a supplier payment: refresh here and ping other tabs. */
export function invalidateSupplierPaymentViewsAfterMutation(
  queryClient: QueryClient,
  organizationId?: string | null,
) {
  if (organizationId) {
    notifyMoneyViewChanged({ organizationId, supplierPayments: true });
  }
  invalidateSupplierPaymentViews(queryClient);
}

/**
 * refetchOnMount for tab-return caches: keep the cached list when nothing changed,
 * but refetch when another screen invalidated it (e.g. a supplier payment).
 */
export function refetchOnMountIfInvalidated(query: Query<any, any, any, any>): boolean {
  return query.state.isInvalidated;
}

type RealtimeRowPayload = {
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
};

/** A voucher_entries Realtime change that belongs to a supplier (payment, CN, refund). */
export function isSupplierVoucherRealtimeChange(payload: RealtimeRowPayload | null | undefined): boolean {
  const ref = (row?: Record<string, unknown> | null) =>
    String(row?.reference_type ?? "").toLowerCase() === "supplier";
  return ref(payload?.new) || ref(payload?.old);
}

export type SupplierVoucherCacheRow = {
  id: string;
  created_at?: string | null;
  [key: string]: unknown;
};

/**
 * Put just-saved payment vouchers at the top of the cached voucher list so the
 * payment shows at once. The full list (many pages for big shops) refetches after.
 */
export function prependVouchersToCache(
  queryClient: QueryClient,
  organizationId: string,
  rows: SupplierVoucherCacheRow[],
) {
  if (!rows.length) return;
  queryClient.setQueryData<SupplierVoucherCacheRow[] | undefined>(
    ["voucher-entries", organizationId],
    (prev) => {
      if (!Array.isArray(prev)) return prev;
      const newIds = new Set(rows.map((r) => r.id));
      const fresh = [...rows].sort((a, b) =>
        String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
      );
      return [...fresh, ...prev.filter((v) => !newIds.has(v.id))];
    },
  );
}
