import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { orgLedgerCustomersQueryKey } from "@/hooks/useOrgLedgerReferenceData";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, Phone, MapPin, ShoppingCart, ChevronRight, RefreshCw, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { STALE_FREQUENT } from "@/lib/queryStaleTimes";
import { ORGANIZATION_RECEIVABLES_QUERY_KEY } from "@/utils/organizationReceivables";
import {
  enrichSalesmanCustomerActivity,
  fetchSalesmanCustomerListCore,
  SALESMAN_CUSTOMER_LIST_QUERY_KEY,
  type SalesmanCustomerRow,
} from "@/utils/salesmanCustomerList";

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
      void enrichSalesmanCustomerActivity(orgId!, core, queryClient).then((enriched) => {
        queryClient.setQueryData([SALESMAN_CUSTOMER_LIST_QUERY_KEY, orgId], enriched);
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

  const getBalanceColor = (balance: number) => {
    if (balance <= 0) return "bg-green-500/10 text-green-600";
    if (balance < 5000) return "bg-yellow-500/10 text-yellow-600";
    return "bg-red-500/10 text-red-600";
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
      <div className="p-4 space-y-4">
        <Skeleton className="h-12 w-full" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  const errorMsg = error instanceof Error ? error.message : error ? "Could not load customers." : null;

  return (
    <div className="p-3 space-y-4 max-w-full overflow-x-hidden">
      <div className="sticky top-0 z-10 bg-background pb-2 flex gap-2 w-full">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or area..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-12"
          />
        </div>
        <Button variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={handleRefresh}>
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? "s" : ""}
      </p>

      <div className="space-y-3">
        {filteredCustomers.map((customer) => (
          <CustomerCard
            key={customer.id}
            customer={customer}
            getBalanceColor={getBalanceColor}
            formatDaysAgo={formatDaysAgo}
            onNavigate={navigate}
          />
        ))}

        {filteredCustomers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            {errorMsg ? (
              <>
                <p className="text-destructive font-medium">Couldn't load customers</p>
                <p className="text-xs mt-1 px-6 break-words">{errorMsg}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={handleRefresh}>
                  <RefreshCw className={cn("h-4 w-4 mr-1", isFetching && "animate-spin")} />
                  Retry
                </Button>
              </>
            ) : (
              <p>No customers found</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function CustomerCard({
  customer,
  getBalanceColor,
  formatDaysAgo,
  onNavigate,
}: {
  customer: SalesmanCustomerRow;
  getBalanceColor: (balance: number) => string;
  formatDaysAgo: (dateStr: string | null, emptyLabel?: string) => string;
  onNavigate: (path: string) => void;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <button
              type="button"
              className="font-semibold text-left text-primary underline-offset-2 hover:underline truncate w-full text-base"
              onClick={() => onNavigate(`/salesman/customer/${customer.id}`)}
            >
              {customer.customer_name}
            </button>
            {customer.phone && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <Phone className="h-3 w-3" />
                {customer.phone}
              </p>
            )}
            {customer.address && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 truncate">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                {customer.address}
              </p>
            )}
          </div>
          <Badge className={cn("ml-2 shrink-0", getBalanceColor(customer.balance))}>
            ₹{Math.abs(customer.balance).toLocaleString("en-IN")}
            {customer.balance < 0 && " CR"}
          </Badge>
        </div>

        <div className="flex flex-col gap-1 text-xs text-muted-foreground mb-3">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                customer.balance > 0 &&
                  customer.daysSinceLastPayment >= 60 &&
                  "text-amber-700 font-medium",
              )}
            >
              Last Payment: {formatDaysAgo(customer.lastPaymentDate, "No payment")}
            </span>
            <span className="shrink-0">
              Due: ₹{Math.max(0, customer.balance).toLocaleString("en-IN")}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Last Order: {formatDaysAgo(customer.lastOrderDate, "No orders")}</span>
            <span className="shrink-0">
              Sales: ₹{customer.totalSales.toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        <div className="flex gap-1.5 w-full">
          {customer.phone && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 min-w-0 px-2"
              onClick={() => window.open(`tel:${customer.phone}`)}
            >
              <Phone className="h-4 w-4 mr-1 shrink-0" />
              <span className="truncate">Call</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="flex-1 min-w-0 px-2"
            onClick={() => onNavigate(`/salesman/customer/${customer.id}`)}
          >
            <span className="truncate">Account</span>
            <ChevronRight className="h-4 w-4 ml-1 shrink-0" />
          </Button>
          <Button
            size="sm"
            className="flex-1 min-w-0 px-2"
            onClick={() => onNavigate(`/salesman/order/new?customerId=${customer.id}`)}
          >
            <ShoppingCart className="h-4 w-4 mr-1 shrink-0" />
            <span className="truncate">Order</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default SalesmanCustomers;
