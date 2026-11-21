import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { orgLedgerCustomersQueryKey } from "@/hooks/useOrgLedgerReferenceData";
import { Search, Phone, ShoppingCart, ChevronRight, RefreshCw, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { STALE_FREQUENT } from "@/lib/queryStaleTimes";
import { ORGANIZATION_RECEIVABLES_QUERY_KEY } from "@/utils/organizationReceivables";
import {
  enrichSalesmanCustomerActivity,
  fetchSalesmanCustomerListCore,
  SALESMAN_CUSTOMER_LIST_QUERY_KEY,
  type SalesmanCustomerRow,
} from "@/utils/salesmanCustomerList";

function formatCustomerListError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const msg = String((error as { message?: unknown }).message || "").trim();
    if (msg) return msg;
  }
  return "Could not load customers.";
}

const SalesmanCustomers = () => {
  const { navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;
  const [searchTerm, setSearchTerm] = useState("");

  const {
    data: customers = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: [SALESMAN_CUSTOMER_LIST_QUERY_KEY, orgId],
    queryFn: async () => {
      const core = await fetchSalesmanCustomerListCore(orgId!, queryClient);
      // Enrich dates in background — list is usable immediately after core resolves.
      void enrichSalesmanCustomerActivity(orgId!, core, queryClient)
        .then((enriched) => {
          queryClient.setQueryData([SALESMAN_CUSTOMER_LIST_QUERY_KEY, orgId], enriched);
        })
        .catch((err) => {
          console.warn("[SalesmanCustomers] activity enrich failed", err);
        });
      return core;
    },
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
    refetchOnWindowFocus: false,
  });

  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customers;
    const term = searchTerm.toLowerCase();
    return customers.filter(
      (c) =>
        c.customer_name.toLowerCase().includes(term) ||
        (c.phone && c.phone.includes(term)) ||
        (c.address && c.address.toLowerCase().includes(term)),
    );
  }, [searchTerm, customers]);

  const handleRefresh = () => {
    if (!orgId) return;
    queryClient.removeQueries({ queryKey: [SALESMAN_CUSTOMER_LIST_QUERY_KEY, orgId] });
    queryClient.invalidateQueries({ queryKey: orgLedgerCustomersQueryKey(orgId) });
    queryClient.invalidateQueries({ queryKey: [ORGANIZATION_RECEIVABLES_QUERY_KEY, orgId] });
    void refetch();
  };

  const formatDaysAgo = (dateStr: string | null, emptyLabel = "Never") => {
    if (!dateStr) return emptyLabel;
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
  };

  if (isLoading) {
    return (
      <div className="space-y-3 p-3">
        <div className="h-12 animate-pulse rounded-2xl bg-slate-200" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-200" />
        ))}
      </div>
    );
  }

  const errorMsg = formatCustomerListError(error);

  return (
    <div className="max-w-full overflow-x-hidden" data-testid="fs-customers">
      <div className="sticky top-0 z-10 bg-slate-50 px-3 pb-2 pt-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Search name, phone or area"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-3 text-base text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
            />
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm active:bg-slate-100"
            aria-label="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </button>
        </div>
        <p className="mt-2 px-1 text-xs font-medium text-slate-500">
          {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="space-y-2.5 px-3 pb-6">
        {filteredCustomers.map((customer) => (
          <CustomerCard key={customer.id} customer={customer} formatDaysAgo={formatDaysAgo} onNavigate={navigate} />
        ))}

        {filteredCustomers.length === 0 && (
          <div className="px-6 py-12 text-center text-slate-500">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-slate-500">
              <Users className="h-8 w-8" />
            </span>
            {error ? (
              <>
                <p className="mt-3 font-semibold text-red-600">Couldn't load customers</p>
                <p className="mt-1 break-words text-xs">{errorMsg}</p>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 active:bg-slate-100"
                >
                  <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
                  Retry
                </button>
              </>
            ) : (
              <p className="mt-3 text-sm font-semibold text-slate-700">No customers found</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function CustomerCard({
  customer,
  formatDaysAgo,
  onNavigate,
}: {
  customer: SalesmanCustomerRow;
  formatDaysAgo: (dateStr: string | null, emptyLabel?: string) => string;
  onNavigate: (path: string) => void;
}) {
  const due = customer.balance > 0;
  const overdue = due && customer.daysSinceLastPayment >= 60;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="fs-customer">
      <button
        type="button"
        className="flex w-full items-start gap-3 text-left"
        onClick={() => onNavigate(`/salesman/customer/${customer.id}`)}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-base font-bold uppercase text-orange-700">
          {customer.customer_name.trim().charAt(0) || "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-tight text-slate-900">{customer.customer_name}</span>
          <span className="mt-0.5 block truncate text-xs leading-tight text-slate-500">
            {[customer.phone, customer.address].filter(Boolean).join(" · ") || "No phone or address"}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span
            className={cn(
              "block text-[15px] font-bold leading-tight tabular-nums",
              due ? (customer.balance < 5000 ? "text-amber-600" : "text-red-600") : "text-emerald-600",
            )}
          >
            ₹{Math.abs(customer.balance).toLocaleString("en-IN")}
          </span>
          <span className="block text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-400">
            {customer.balance < 0 ? "Advance" : due ? "Due" : "Clear"}
          </span>
        </span>
      </button>

      <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 px-2.5 py-2 text-[11px] leading-tight">
        <div className="min-w-0">
          <p className="text-slate-400">Last order</p>
          <p className="truncate font-semibold text-slate-700">{formatDaysAgo(customer.lastOrderDate, "None")}</p>
        </div>
        <div className="min-w-0">
          <p className="text-slate-400">Last payment</p>
          <p className={cn("truncate font-semibold", overdue ? "text-red-600" : "text-slate-700")}>
            {formatDaysAgo(customer.lastPaymentDate, "None")}
          </p>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-slate-400">Total sales</p>
          <p className="truncate font-semibold tabular-nums text-slate-700">₹{customer.totalSales.toLocaleString("en-IN")}</p>
        </div>
      </div>

      <div className="mt-2.5 flex gap-2">
        {customer.phone && (
          <a
            href={`tel:${customer.phone}`}
            className="flex h-10 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 active:bg-slate-100"
            aria-label={`Call ${customer.customer_name}`}
          >
            <Phone className="h-4 w-4" />
          </a>
        )}
        <button
          type="button"
          className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 active:bg-slate-100"
          onClick={() => onNavigate(`/salesman/customer/${customer.id}`)}
        >
          <span className="truncate">Account</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
        <button
          type="button"
          className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-500 text-sm font-bold text-white shadow-sm active:bg-orange-600"
          onClick={() => onNavigate(`/salesman/order/new?customerId=${customer.id}`)}
        >
          <ShoppingCart className="h-4 w-4 shrink-0" />
          <span className="truncate">New order</span>
        </button>
      </div>
    </div>
  );
}

export default SalesmanCustomers;
