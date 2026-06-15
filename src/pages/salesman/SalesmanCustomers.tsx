import { useEffect, useState } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import {
  buildOrgCustomerBalanceBatch,
  computeCustomerBalanceCore,
  type CustomerBalanceCoreVoucher,
} from "@/utils/customerBalanceCore";
import { fetchCustomerFinancialSnapshotMap } from "@/utils/customerFinancialSnapshot";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, Phone, MapPin, ShoppingCart, ChevronRight, RefreshCw, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface CustomerWithBalance {
  id: string;
  customer_name: string;
  phone: string | null;
  address: string | null;
  opening_balance: number;
  totalSales: number;
  totalPaid: number;
  balance: number;
  lastOrderDate: string | null;
  lastPaymentDate: string | null;
  daysSinceLastPayment: number;
}

const SalesmanCustomers = () => {
  const { navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<CustomerWithBalance[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchCustomersWithBalance();
    }
  }, [currentOrganization?.id]);

  useEffect(() => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      setFilteredCustomers(
        customers.filter(
          (c) =>
            c.customer_name.toLowerCase().includes(term) ||
            (c.phone && c.phone.includes(term)) ||
            (c.address && c.address.toLowerCase().includes(term))
        )
      );
    } else {
      setFilteredCustomers(customers);
    }
  }, [searchTerm, customers]);

  const fetchCustomersWithBalance = async () => {
    try {
      setErrorMsg(null);
      const orgId = currentOrganization!.id;

      // Fetch customers
      const { data: customersData, error: customersError } = await supabase
        .from("customers")
        .select("id, customer_name, phone, address, opening_balance")
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .order("customer_name");
      if (customersError) throw customersError;

      // Fetch all sales (exclude cancelled/hold — same as ledger)
      const { data: salesData } = await supabase
        .from("sales")
        .select("id, customer_id, net_amount, paid_amount, sale_date, sale_return_adjust, payment_status")
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .not("payment_status", "in", '("cancelled","hold")');

      // Receipt vouchers — include dates for last-payment sorting
      const { data: receiptVouchers } = await supabase
        .from("voucher_entries")
        .select(
          "reference_id, reference_type, total_amount, payment_method, description, voucher_date, created_at, voucher_type, discount_amount"
        )
        .eq("organization_id", orgId)
        .eq("voucher_type", "receipt")
        .is("deleted_at", null);

      const { data: allSaleReturns } = await supabase
        .from("sale_returns")
        .select("customer_id, net_amount, credit_status, linked_sale_id")
        .eq("organization_id", orgId)
        .is("deleted_at", null);

      const { data: refundVouchers } = await supabase
        .from("voucher_entries")
        .select("reference_id, total_amount")
        .eq("organization_id", orgId)
        .eq("voucher_type", "payment")
        .eq("reference_type", "customer")
        .is("deleted_at", null);

      const { data: adjustments } = await supabase
        .from("customer_balance_adjustments")
        .select("customer_id, outstanding_difference")
        .eq("organization_id", orgId);

      const { data: advances } = await supabase
        .from("customer_advances")
        .select("id, customer_id, amount, used_amount")
        .eq("organization_id", orgId)
        .in("status", ["active", "partially_used"]);

      const advanceIds = (advances || []).map((a: any) => a.id).filter(Boolean);
      const refundByAdvanceId = new Map<string, number>();
      if (advanceIds.length > 0) {
        const { data: advRefunds } = await supabase
          .from("advance_refunds")
          .select("advance_id, refund_amount")
          .in("advance_id", advanceIds);
        (advRefunds || []).forEach((r: any) => {
          if (!r.advance_id) return;
          refundByAdvanceId.set(
            r.advance_id,
            (refundByAdvanceId.get(r.advance_id) || 0) + (Number(r.refund_amount) || 0)
          );
        });
      }

      const customerIds = new Set((customersData || []).map((c: { id: string }) => c.id));

      type VoucherWithDate = CustomerBalanceCoreVoucher & {
        voucher_date?: string | null;
        created_at?: string | null;
      };

      const voucherRows: VoucherWithDate[] = (receiptVouchers || []).map((v: any) => ({
        voucher_type: "receipt",
        reference_type: v.reference_type,
        reference_id: v.reference_id,
        total_amount: v.total_amount,
        discount_amount: v.discount_amount,
        payment_method: v.payment_method,
        description: v.description,
        voucher_date: v.voucher_date,
        created_at: v.created_at,
      }));

      const paymentVoucherRows: CustomerBalanceCoreVoucher[] = (refundVouchers || []).map(
        (v: any) => ({
          voucher_type: "payment",
          reference_type: "customer",
          reference_id: v.reference_id,
          total_amount: v.total_amount,
        })
      );

      const salesForBatch = (salesData || [])
        .filter((s: any) => s.customer_id && s.id)
        .map((s: any) => ({
          id: s.id,
          customer_id: s.customer_id,
          net_amount: s.net_amount,
          paid_amount: s.paid_amount,
          sale_return_adjust: s.sale_return_adjust,
          payment_status: s.payment_status,
        }));

      const customerIdList = (customersData || []).map((c: { id: string }) => c.id);
      // Balance enrichment must never blank the list: if the snapshot RPC fails,
      // fall back to the client-computed core.balance below (snapMap stays empty).
      let snapMap = new Map<string, { outstandingDr: number }>() as Awaited<
        ReturnType<typeof fetchCustomerFinancialSnapshotMap>
      >;
      try {
        snapMap = await fetchCustomerFinancialSnapshotMap(orgId, customerIdList);
      } catch (snapErr) {
        console.warn("Customer financial snapshot failed; using client-computed balances", snapErr);
      }

      const batch = buildOrgCustomerBalanceBatch({
        sales: salesForBatch,
        vouchers: [...voucherRows, ...paymentVoucherRows],
        advances: (advances || []).map((a: any) => ({
          customer_id: a.customer_id,
          amount: a.amount,
          used_amount: a.used_amount,
        })),
        refunds: (advances || []).flatMap((a: any) => {
          const amt = refundByAdvanceId.get(a.id) || 0;
          return amt > 0 && a.customer_id
            ? [{ customer_id: a.customer_id, refund_amount: amt }]
            : [];
        }),
        adjustments: (adjustments || []).map((a: any) => ({
          customer_id: a.customer_id,
          outstanding_difference: a.outstanding_difference,
        })),
        saleReturns: (allSaleReturns || []).map((sr: any) => ({
          customer_id: sr.customer_id,
          net_amount: sr.net_amount,
          credit_status: sr.credit_status,
          linked_sale_id: sr.linked_sale_id,
        })),
        customerIds,
      });

      const lastOrderByCustomer = new Map<string, string | null>();
      (salesData || []).forEach((sale: any) => {
        if (!sale.customer_id || !sale.sale_date) return;
        const prev = lastOrderByCustomer.get(sale.customer_id);
        if (!prev || sale.sale_date > prev) {
          lastOrderByCustomer.set(sale.customer_id, sale.sale_date);
        }
      });

      const resolveLastPaymentDate = (customerId: string): string | null => {
        const rows = (batch.vouchersByCustomerId.get(customerId) || []) as VoucherWithDate[];
        let latest: string | null = null;
        for (const v of rows) {
          if (String(v.voucher_type || "").toLowerCase() !== "receipt") continue;
          const d = v.voucher_date || v.created_at;
          if (!d) continue;
          if (!latest || d > latest) latest = d;
        }
        return latest;
      };

      const daysSincePayment = (paymentDate: string | null) => {
        if (!paymentDate) return 99999;
        return Math.floor(
          (Date.now() - new Date(paymentDate).getTime()) / (1000 * 60 * 60 * 24)
        );
      };

      const customersWithBalance: CustomerWithBalance[] = (customersData || []).map((c: any) => {
        const openingBalance = Number(c.opening_balance || 0);
        const core = computeCustomerBalanceCore({
          openingBalance,
          customerId: c.id,
          sales: batch.salesByCustomerId.get(c.id) || [],
          voucherEntries: batch.vouchersByCustomerId.get(c.id) || [],
          customerAdvances: batch.advancesByCustomerId.get(c.id) || [],
          advanceRefunds: batch.refundsByCustomerId.get(c.id) || [],
          adjustmentTotal: batch.adjustmentsByCustomerId.get(c.id) || 0,
          saleReturns: batch.saleReturnsByCustomerId.get(c.id) || [],
        });

        const lastPaymentDate = resolveLastPaymentDate(c.id);
        const daysSinceLastPayment = daysSincePayment(lastPaymentDate);

        const ledgerBalance = snapMap.get(c.id)?.outstandingDr ?? core.balance;

        return {
          ...c,
          opening_balance: openingBalance,
          totalSales: core.totalSalesNet,
          totalPaid: core.totalRealPayments,
          balance: ledgerBalance,
          lastOrderDate: lastOrderByCustomer.get(c.id) ?? null,
          lastPaymentDate,
          daysSinceLastPayment,
        };
      });

      // Longest without payment first (collection priority), then highest balance due
      customersWithBalance.sort((a, b) => {
        if (b.daysSinceLastPayment !== a.daysSinceLastPayment) {
          return b.daysSinceLastPayment - a.daysSinceLastPayment;
        }
        return b.balance - a.balance;
      });
      setCustomers(customersWithBalance);
      setFilteredCustomers(customersWithBalance);
    } catch (error: any) {
      console.error("Error fetching customers:", error);
      setErrorMsg(error?.message || "Could not load customers. Pull to refresh or try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCustomersWithBalance();
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

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-12 w-full" />
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4 max-w-full overflow-x-hidden">
      {/* Search Bar */}
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
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Customer Count */}
      <p className="text-sm text-muted-foreground">
        {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? "s" : ""}
      </p>

      {/* Customer List */}
      <div className="space-y-3">
        {filteredCustomers.map((customer) => (
          <Card key={customer.id} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    className="font-semibold text-left text-primary underline-offset-2 hover:underline truncate w-full text-base"
                    onClick={() => navigate(`/salesman/customer/${customer.id}`)}
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
                        "text-amber-700 font-medium"
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
                  onClick={() => navigate(`/salesman/customer/${customer.id}`)}
                >
                  <span className="truncate">Account</span>
                  <ChevronRight className="h-4 w-4 ml-1 shrink-0" />
                </Button>
                <Button
                  size="sm"
                  className="flex-1 min-w-0 px-2"
                  onClick={() => navigate(`/salesman/order/new?customerId=${customer.id}`)}
                >
                  <ShoppingCart className="h-4 w-4 mr-1 shrink-0" />
                  <span className="truncate">Order</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredCustomers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            {errorMsg ? (
              <>
                <p className="text-destructive font-medium">Couldn't load customers</p>
                <p className="text-xs mt-1 px-6 break-words">{errorMsg}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={handleRefresh}>
                  <RefreshCw className={cn("h-4 w-4 mr-1", refreshing && "animate-spin")} />
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

export default SalesmanCustomers;
