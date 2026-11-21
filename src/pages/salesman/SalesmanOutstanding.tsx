import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Phone,
  MessageCircle,
  IndianRupee,
  RefreshCw,
  Link2,
} from "lucide-react";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { cn } from "@/lib/utils";
import { PaymentLinkDialog } from "@/components/PaymentLinkDialog";
import {
  fetchOrgLedgerCustomersReference,
  fetchOrgLedgerSalesSummaryReference,
} from "@/hooks/useOrgLedgerReferenceData";
import {
  fetchOrganizationFinancialSnapshotMap,
} from "@/utils/customerFinancialSnapshot";

interface CustomerOutstanding {
  id: string;
  customer_name: string;
  phone: string | null;
  balance: number;
  invoiceCount: number;
}

const SalesmanOutstanding = () => {
  const { navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const { sendWhatsApp } = useWhatsAppSend();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  const [searchTerm, setSearchTerm] = useState("");
  const [paymentLinkOpen, setPaymentLinkOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOutstanding | null>(null);

  const {
    data: outstandingData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["salesman-outstanding", orgId],
    enabled: !!orgId,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const customersData = await fetchOrgLedgerCustomersReference(orgId!, queryClient);
      // DB-side count when the RPC exists; otherwise fall back to the cached sales rows.
      const countsRpc = await (supabase.rpc as any)("get_customer_open_invoice_counts", {
        p_organization_id: orgId,
      });
      const countsFromDb: { customer_id: string; open_invoice_count: number | string }[] | null =
        !countsRpc.error && Array.isArray(countsRpc.data) ? countsRpc.data : null;
      const allSales = countsFromDb
        ? []
        : await fetchOrgLedgerSalesSummaryReference(orgId!, queryClient);
      // Phase 1c: whole-org set-based snapshot RPC (missing rows = all-zero)
      const snapMap = await fetchOrganizationFinancialSnapshotMap(orgId!);

      const invoiceCountMap: Record<string, number> = {};
      (countsFromDb ?? []).forEach((row) => {
        invoiceCountMap[row.customer_id] = Number(row.open_invoice_count) || 0;
      });
      (allSales || []).forEach((sale: any) => {
        if (sale.customer_id && sale.payment_status !== "completed") {
          invoiceCountMap[sale.customer_id] = (invoiceCountMap[sale.customer_id] || 0) + 1;
        }
      });

      const outstandingCustomers: CustomerOutstanding[] = (customersData || [])
        .map((c: any) => {
          // Bills still unpaid (shop rule, Nov 2026: advance is not subtracted).
          const balance = snapMap.get(c.id)?.grossOutstandingDr ?? 0;
          const openingBalance = c.opening_balance || 0;
          return {
            id: c.id,
            customer_name: c.customer_name,
            phone: c.phone,
            balance,
            invoiceCount: (invoiceCountMap[c.id] || 0) + (openingBalance > 0 ? 1 : 0),
          };
        })
        .filter((c) => c.balance >= 1)
        .sort((a, b) => b.balance - a.balance);

      const totalOutstanding = outstandingCustomers.reduce((sum, c) => sum + c.balance, 0);
      return { customers: outstandingCustomers, totalOutstanding };
    },
  });

  const customers = outstandingData?.customers ?? [];
  const totalOutstanding = outstandingData?.totalOutstanding ?? 0;

  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customers;
    const term = searchTerm.toLowerCase();
    return customers.filter(
      (c) =>
        c.customer_name.toLowerCase().includes(term) ||
        (c.phone && c.phone.includes(term)),
    );
  }, [searchTerm, customers]);

  const handleRefresh = () => {
    if (orgId) {
      void queryClient.invalidateQueries({ queryKey: ["salesman-outstanding", orgId] });
    } else {
      void refetch();
    }
  };

  const sendReminder = async (customer: CustomerOutstanding) => {
    if (!customer.phone) return;

    const message =
      `🔔 *Payment Reminder*\n\n` +
      `Dear ${customer.customer_name},\n\n` +
      `This is a friendly reminder that you have an outstanding balance of *₹${Math.round(customer.balance).toLocaleString("en-IN")}*.\n\n` +
      `Pending Invoices: ${customer.invoiceCount}\n\n` +
      `Please clear your dues at the earliest convenience.\n\n` +
      `Thank you for your business!`;

    await sendWhatsApp(customer.phone, message);
  };

  const openPaymentLink = (customer: CustomerOutstanding) => {
    setSelectedCustomer(customer);
    setPaymentLinkOpen(true);
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-24" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col" data-testid="fs-outstanding">
      <div className="sticky top-0 z-10 space-y-2.5 bg-slate-50 px-3 pb-2 pt-3">
        {/* Summary */}
        <div className="flex items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-sm">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Total outstanding · {customers.length} customer{customers.length !== 1 ? "s" : ""}
            </p>
            <p className="truncate text-2xl font-bold leading-tight tabular-nums text-rose-300">
              ₹{totalOutstanding.toLocaleString("en-IN")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
            aria-label="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Search name or phone"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-3 text-base text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
          />
        </div>
      </div>

      <div className="flex-1 space-y-2.5 px-3 pb-6 pt-1">
        {filteredCustomers.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <IndianRupee className="h-8 w-8" />
            </span>
            <p className="mt-3 text-[15px] font-semibold text-slate-800">No outstanding found</p>
          </div>
        ) : (
          filteredCustomers.map((customer) => (
            <div key={customer.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="fs-due">
              <button
                type="button"
                className="flex w-full items-start gap-3 text-left"
                onClick={() => navigate(`/salesman/customer/${customer.id}`)}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-base font-bold uppercase text-rose-700">
                  {customer.customer_name.trim().charAt(0) || "?"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold leading-tight text-slate-900">{customer.customer_name}</span>
                  <span className="mt-0.5 block truncate text-xs leading-tight text-slate-500">
                    {customer.phone || "No phone"} · {customer.invoiceCount} bill{customer.invoiceCount !== 1 ? "s" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[15px] font-bold leading-tight tabular-nums text-red-600">
                  ₹{customer.balance.toLocaleString("en-IN")}
                </span>
              </button>

              {customer.phone && (
                <div className="mt-2.5 flex gap-2">
                  <a
                    href={`tel:${customer.phone}`}
                    className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 active:bg-slate-100"
                  >
                    <Phone className="h-4 w-4 shrink-0" />
                    <span className="truncate">Call</span>
                  </a>
                  <button
                    type="button"
                    className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700 active:bg-emerald-100"
                    onClick={() => sendReminder(customer)}
                  >
                    <MessageCircle className="h-4 w-4 shrink-0" />
                    <span className="truncate">Remind</span>
                  </button>
                  <button
                    type="button"
                    className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-500 text-sm font-bold text-white shadow-sm active:bg-orange-600"
                    onClick={() => openPaymentLink(customer)}
                  >
                    <Link2 className="h-4 w-4 shrink-0" />
                    <span className="truncate">Pay link</span>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Payment Link Dialog */}
      {selectedCustomer && (
        <PaymentLinkDialog
          open={paymentLinkOpen}
          onOpenChange={setPaymentLinkOpen}
          customerName={selectedCustomer.customer_name}
          customerPhone={selectedCustomer.phone}
          amount={selectedCustomer.balance}
          invoiceCount={selectedCustomer.invoiceCount}
        />
      )}
    </div>
  );
};

export default SalesmanOutstanding;
