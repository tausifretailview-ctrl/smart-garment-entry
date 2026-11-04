import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { useIndustrialMode } from "@/hooks/useIndustrialMode";
import { challanTypeLabel } from "@/utils/industrialMode";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Card } from "@/components/ui/card";
import { ErpDashboardKpiCard } from "@/components/dashboard/ErpDashboardKpiCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Search, Plus, Calendar as CalendarIcon, FileText, Trash2, ArrowRight, Loader2, Home, RefreshCw, Edit, Truck } from "lucide-react";
import { useContextMenu, useIsDesktop } from "@/hooks/useContextMenu";
import { DesktopContextMenu, ContextMenuItem } from "@/components/DesktopContextMenu";
import { ListTableSkeleton } from "@/components/skeletons/ListPageSkeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useOpenCustomerAccount } from "@/hooks/useOpenCustomerAccount";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters } from "@/lib/dashboardFilterPersistence";
import { ResetPersistedFiltersButton } from "@/components/ResetPersistedFiltersButton";
import { useTabCacheLayout } from "@/contexts/TabCacheLayoutContext";
import { useSharedAppShell } from "@/contexts/SharedAppShellContext";
import { cn } from "@/lib/utils";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { postSaleJournalInBackground } from "@/utils/accounting/journalService";
import { useEwayBillOn } from "@/hooks/useEwayBillOn";
import { ChallanEwayBillDialog, type EwbChallanInfo } from "@/components/ewaybill/ChallanEwayBillDialog";
import { fetchEwayBillsForChallans, formatEwbNo } from "@/utils/ewayBill";
import { fetchDocGodownNames, syncSaleFromChallanGodown } from "@/utils/godownDocs";

export default function DeliveryChallanDashboard() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { user } = useAuth();
  const inTabCache = useTabCacheLayout();
  const sharedShell = useSharedAppShell();

  const isDesktop = useIsDesktop();
  const rowContextMenu = useContextMenu<any>();

  const getChallanContextMenuItems = (challan: any): ContextMenuItem[] => [
    {
      label: "Edit",
      icon: Edit,
      onClick: () => navigate("/delivery-challan-entry", { state: { challanData: challan } }),
    },
    {
      label: "E-way bill",
      icon: Truck,
      onClick: () => setEwbChallan(challan),
      hidden: !ewbOn,
    },
    {
      label: "Convert to Invoice",
      icon: ArrowRight,
      onClick: () => setConvertConfirm(challan),
      hidden: challan.status !== "pending",
    },
    {
      label: "View Invoice",
      icon: FileText,
      onClick: () => navigate("/sales-invoice-dashboard"),
      hidden: !challan.converted_to_invoice_id,
    },
    { label: "", separator: true, onClick: () => {} },
    {
      label: "Delete",
      icon: Trash2,
      onClick: () => setDeleteConfirm(challan.id),
      destructive: true,
    },
  ];

  const handleRowContextMenu = (e: React.MouseEvent, challan: any) => {
    if (!isDesktop) return;
    rowContextMenu.openMenu(e, challan);
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date>(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date>(endOfMonth(new Date()));

  const deliveryChallanFilterSnapshot = useMemo(
    () => ({
      searchQuery,
      statusFilter,
      dateFrom,
      dateTo,
    }),
    [searchQuery, statusFilter, dateFrom, dateTo],
  );

  const { clearPersistedFilters } = useDashboardFilterPersistence(
    "delivery-challan-dashboard",
    currentOrganization?.id,
    deliveryChallanFilterSnapshot,
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["searchQuery", setSearchQuery],
          ["statusFilter", setStatusFilter],
        ],
        requiredDates: [
          ["dateFrom", setDateFrom],
          ["dateTo", setDateTo],
        ],
      });
    },
  );

  const deliveryChallanFiltersDirty =
    searchQuery !== "" ||
    statusFilter !== "all" ||
    format(dateFrom, "yyyy-MM-dd") !== format(startOfMonth(new Date()), "yyyy-MM-dd") ||
    format(dateTo, "yyyy-MM-dd") !== format(endOfMonth(new Date()), "yyyy-MM-dd");

  const resetDeliveryChallanFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setDateFrom(startOfMonth(new Date()));
    setDateTo(endOfMonth(new Date()));
    clearPersistedFilters();
  };

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [convertConfirm, setConvertConfirm] = useState<any | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const openCustomerAccount = useOpenCustomerAccount();
  const { data: orgSettings } = useSettings();
  const industrialMode = useIndustrialMode();
  // E-Way Bill switch (Settings > Sale): off makes no e-way bill query and shows no truck button.
  const ewbOn = useEwayBillOn();
  const [ewbChallan, setEwbChallan] = useState<any | null>(null);

  /** Industrial mode: badge for challans that are not a plain "bill to follow" delivery. */
  const challanTypeBadge = (challan: { challan_type?: string | null }) => {
    if (!industrialMode.enabled || !challan.challan_type || challan.challan_type === "sale_delivery") return null;
    const label = challanTypeLabel(challan.challan_type);
    if (!label) return null;
    return (
      <span className="mt-0.5 inline-block rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-200">
        {label}
      </span>
    );
  };

  const { data: challansData, isLoading, refetch } = useQuery({
    queryKey: ['delivery-challans', currentOrganization?.id, dateFrom, dateTo, statusFilter],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      let query = supabase
        .from('delivery_challans')
        .select(`
          *,
          delivery_challan_items (*)
        `)
        .eq('organization_id', currentOrganization.id)
        .is('deleted_at', null)
        .gte('challan_date', dateFrom.toISOString())
        .lte('challan_date', dateTo.toISOString())
        .order('challan_date', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const filteredChallans = (challansData || []).filter((challan: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      challan.challan_number?.toLowerCase().includes(query) ||
      challan.customer_name?.toLowerCase().includes(query) ||
      challan.customer_phone?.includes(query)
    );
  });

  // Industrial mode: the godown each challan was sent from ("Dispatch from", Phase 3 step 3d-2).
  const challanPlaceKey = useMemo(
    () => (industrialMode.enabled ? (challansData || []).map((c: any) => String(c.id)).sort().join(",") : ""),
    [industrialMode.enabled, challansData],
  );
  const { data: challanPlaces } = useQuery({
    queryKey: ["challan-godown-places", currentOrganization?.id ?? "", challanPlaceKey],
    queryFn: () => fetchDocGodownNames("challan", challanPlaceKey.split(",")),
    enabled: industrialMode.enabled && !!currentOrganization?.id && challanPlaceKey.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const challanPlaceName = (id: unknown): string => (challanPlaces && challanPlaces[String(id)]) || "";

  // E-way bills of the challans in this period (step 6b), only with the E-Way Bill switch on.
  const challanIdsKey = useMemo(
    () => (ewbOn ? (challansData || []).map((c: any) => String(c.id)).sort().join(",") : ""),
    [ewbOn, challansData],
  );
  const { data: challanEwb, refetch: refetchChallanEwb } = useQuery({
    queryKey: ["challan-eway-bills", currentOrganization?.id ?? "", challanIdsKey],
    queryFn: () => fetchEwayBillsForChallans(currentOrganization!.id, challanIdsKey.split(",")),
    enabled: ewbOn && !!currentOrganization?.id && challanIdsKey.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const ewbOfChallan = (id: string) => challanEwb?.rows.get(String(id)) ?? null;
  const ewbChallanInfo: EwbChallanInfo | null = ewbChallan
    ? {
        id: String(ewbChallan.id),
        challan_number: String(ewbChallan.challan_number ?? ""),
        challan_date: String(ewbChallan.challan_date ?? ""),
        challan_type: ewbChallan.challan_type ?? null,
        net_amount: ewbChallan.net_amount ?? null,
        customer_name: ewbChallan.customer_name ?? null,
      }
    : null;

  const handleDelete = async (challanId: string) => {
    try {
      const { error } = await supabase.rpc('soft_delete_delivery_challan', {
        p_challan_id: challanId,
        p_user_id: user?.id
      });
      if (error) throw error;
      toast({ title: "Deleted", description: "Challan moved to recycle bin" });
      refetch();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
    setDeleteConfirm(null);
  };

  const handleConvertToInvoice = async (challan: any) => {
    setIsConverting(true);
    try {
      const { data: saleNumber, error: saleNumError } = await supabase.rpc('generate_sale_number_atomic', {
        p_organization_id: currentOrganization?.id
      });
      if (saleNumError) throw saleNumError;

      const saleSettings = (orgSettings as any)?.sale_settings;
      const defaultGst = saleSettings?.default_gst_percent || 0;

      const items = challan.delivery_challan_items || [];
      let grossAmount = 0;
      let gstAmount = 0;

      const saleItems = items.map((item: any) => {
        const lineGst = item.line_total * defaultGst / 100;
        grossAmount += item.line_total;
        gstAmount += lineGst;
        return {
          product_id: item.product_id,
          variant_id: item.variant_id,
          product_name: item.product_name,
          size: item.size,
          barcode: item.barcode,
          color: item.color,
          quantity: item.quantity,
          unit_price: item.unit_price,
          mrp: item.mrp,
          discount_percent: item.discount_percent,
          gst_percent: defaultGst,
          line_total: item.line_total + (item.line_total * defaultGst / 100),
          hsn_code: item.hsn_code,
        };
      });

      const netAmount = grossAmount + gstAmount - challan.flat_discount_amount + challan.round_off;

      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert([{
          sale_number: saleNumber,
          sale_date: new Date().toISOString(),
          sale_type: 'invoice',
          customer_id: challan.customer_id,
          customer_name: challan.customer_name,
          customer_phone: challan.customer_phone,
          customer_email: challan.customer_email,
          customer_address: challan.customer_address,
          gross_amount: grossAmount,
          discount_amount: challan.discount_amount,
          flat_discount_percent: challan.flat_discount_percent,
          flat_discount_amount: challan.flat_discount_amount,
          round_off: challan.round_off,
          net_amount: netAmount,
          // GST is added on top of the challan line totals below, as on a GST-exclusive invoice.
          tax_type: defaultGst > 0 ? 'exclusive' : 'inclusive',
          payment_method: 'pay_later',
          payment_status: 'pending',
          organization_id: currentOrganization?.id,
          salesman: challan.salesman,
          shipping_address: challan.shipping_address,
          notes: `Converted from Delivery Challan: ${challan.challan_number}`,
        }])
        .select()
        .single();

      if (saleError) throw saleError;

      await supabase.from('delivery_challan_items').delete().eq('challan_id', challan.id);

      const saleItemsData = saleItems.map((item: any) => ({
        sale_id: saleData.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name: item.product_name,
        size: item.size,
        barcode: item.barcode,
        color: item.color,
        quantity: item.quantity,
        unit_price: item.unit_price,
        mrp: item.mrp,
        discount_percent: item.discount_percent,
        // line_total above includes this GST; the invoice journal and GST reports read the rate.
        gst_percent: item.gst_percent,
        line_total: item.line_total,
        hsn_code: item.hsn_code,
      }));
      const { error: itemsError } = await supabase.from('sale_items').insert(saleItemsData);
      if (itemsError) throw itemsError;

      // Industrial mode: the invoice goes out of the godown the challan was sent from.
      const godownNote = industrialMode.enabled ? await syncSaleFromChallanGodown(String(challan.id), String(saleData.id)) : null;

      if (isAccountingEngineEnabled(orgSettings as { accounting_engine_enabled?: boolean } | null)) {
        postSaleJournalInBackground(
          saleData.id,
          currentOrganization!.id,
          Number(saleData.net_amount ?? netAmount),
          0,
          'pay_later',
          saleData.sale_date,
          supabase,
        );
      }

      await supabase
        .from('delivery_challans')
        .update({
          status: 'invoiced',
          converted_to_invoice_id: saleData.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', challan.id);

      toast({
        title: "Invoice Created",
        description: `Invoice ${saleNumber} created from challan ${challan.challan_number}`
      });
      if (godownNote) {
        toast({ variant: "destructive", title: godownNote.title, description: godownNote.description, duration: 12000 });
      }

      refetch();
    } catch (error: any) {
      console.error('Error converting to invoice:', error);
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsConverting(false);
      setConvertConfirm(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="min-w-[80px] justify-center border-amber-300 bg-amber-50 text-amber-800">Pending</Badge>;
      case 'delivered':
        return <Badge variant="outline" className="min-w-[80px] justify-center border-emerald-300 bg-emerald-50 text-emerald-800">Delivered</Badge>;
      case 'invoiced':
        return <Badge variant="outline" className="min-w-[80px] justify-center border-sky-300 bg-sky-50 text-sky-800">Invoiced</Badge>;
      default:
        return <Badge variant="outline" className="min-w-[80px] justify-center">{status}</Badge>;
    }
  };

  const totalChallans = filteredChallans.length;
  const totalAmount = filteredChallans.reduce((sum: number, c: any) => sum + (c.net_amount || 0), 0);
  const pendingCount = filteredChallans.filter((c: any) => c.status === 'pending').length;
  const invoicedCount = filteredChallans.filter((c: any) => c.status === 'invoiced').length;
  const deliveredCount = filteredChallans.filter((c: any) => c.status === 'delivered').length;

  const handleStatusCardClick = (status: string) => {
    setStatusFilter(status);
  };

  return (
    <div
      className={cn(
        "purchase-dashboard-workspace purchase-bill-dashboard flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 px-2 py-2 sm:px-3",
        !inTabCache && !sharedShell && "h-[calc(100vh-3.5rem)]",
      )}
    >
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold leading-none tracking-tight text-teal-700">
              <Home className="h-4 w-4 shrink-0 opacity-70" />
              Delivery Challans
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isLoading ? "Loading…" : `${totalChallans.toLocaleString("en-IN")} challans`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 border-slate-200 text-sm"
              onClick={() => void refetch()}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            <Button
              onClick={() => navigate("/delivery-challan-entry")}
              className="h-9 px-4 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm gap-1.5"
            >
              <Plus className="h-4 w-4" />
              New Challan
            </Button>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3">
          <ErpDashboardKpiCard
            title="Total Challans"
            subtitle="In date range"
            value={totalChallans.toLocaleString("en-IN")}
            shellClass="bg-sky-50 border-sky-200/70 hover:bg-sky-100/80"
            valueClass="text-sky-800"
            active={statusFilter === "all"}
            onClick={() => handleStatusCardClick("all")}
          />
          <ErpDashboardKpiCard
            title="Total Value"
            value={`₹${totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
            shellClass="bg-violet-50 border-violet-200/70 hover:bg-violet-100/80"
            valueClass="text-violet-800"
          />
          <ErpDashboardKpiCard
            title="Pending"
            subtitle="Not invoiced"
            value={pendingCount.toLocaleString("en-IN")}
            shellClass="bg-amber-50 border-amber-200/70 hover:bg-amber-100/80"
            valueClass="text-amber-800"
            active={statusFilter === "pending"}
            onClick={() => handleStatusCardClick("pending")}
          />
          <ErpDashboardKpiCard
            title="Invoiced"
            subtitle={deliveredCount > 0 ? `${deliveredCount} delivered` : undefined}
            value={invoicedCount.toLocaleString("en-IN")}
            shellClass="bg-emerald-50 border-emerald-200/70 hover:bg-emerald-100/80"
            valueClass="text-emerald-800"
            active={statusFilter === "invoiced"}
            onClick={() => handleStatusCardClick("invoiced")}
          />
        </div>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 shadow-sm p-0">
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-2.5 overflow-x-auto">
              <div className="relative flex-1 min-w-[180px] max-w-full sm:max-w-md md:max-w-lg">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search list..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-sm border-slate-200 bg-slate-50 focus:bg-white no-uppercase"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px] h-9 text-sm border-slate-200 bg-slate-50 hover:bg-white">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="invoiced">Invoiced</SelectItem>
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[130px] h-9 text-sm border-slate-200 bg-slate-50 hover:bg-white justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateFrom, "dd/MM/yy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[130px] h-9 text-sm border-slate-200 bg-slate-50 hover:bg-white justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateTo, "dd/MM/yy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} />
                </PopoverContent>
              </Popover>
              <ResetPersistedFiltersButton
                visible={deliveryChallanFiltersDirty}
                onReset={resetDeliveryChallanFilters}
              />
            </div>

            <div
              data-tab-scroll
              className="purchase-dashboard-table-panel flex-1 min-h-0 overflow-y-auto overflow-x-auto tab-scroll-stable overscroll-y-contain"
            >
              {isLoading ? (
                <div className="bg-white p-3">
                  <ListTableSkeleton rows={8} columns={7} />
                </div>
              ) : filteredChallans.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground bg-white">
                  <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No challans found</p>
                  <p className="text-sm">Create your first delivery challan to get started</p>
                </div>
              ) : (
                <Table className="erp-desktop-table w-full [&_td]:!text-base [&_th]:!text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Challan No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredChallans.map((challan: any) => (
                      <TableRow
                        key={challan.id}
                        className="h-11"
                        onContextMenu={(e) => handleRowContextMenu(e, challan)}
                      >
                        <TableCell className="font-semibold text-teal-800">
                          <div>{challan.challan_number}</div>
                          {challanTypeBadge(challan)}
                          {challanPlaceName(challan.id) && (
                            <span
                              className={cn(
                                "mt-0.5 inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200",
                                challanTypeBadge(challan) && "ml-1",
                              )}
                            >
                              From {challanPlaceName(challan.id)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{format(new Date(challan.challan_date), 'dd/MM/yyyy')}</TableCell>
                        <TableCell>
                          <div>
                            <button
                              className="text-teal-700 hover:underline cursor-pointer bg-transparent border-none p-0 font-semibold text-left"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCustomerAccount(challan.customer_id, challan.customer_name);
                              }}
                            >
                              {challan.customer_name}
                            </button>
                          </div>
                          <div className="text-xs text-muted-foreground">{challan.customer_phone}</div>
                        </TableCell>
                        <TableCell className="text-center tabular-nums font-medium">
                          {challan.delivery_challan_items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          ₹{(challan.net_amount || 0).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-center">{getStatusBadge(challan.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => navigate("/delivery-challan-entry", { state: { challanData: challan } })}
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {ewbOn ? (() => {
                              const ewb = ewbOfChallan(challan.id);
                              const on = ewb?.status === "active";
                              return (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={cn("h-8 w-8", on ? "text-teal-600" : "text-slate-400 hover:text-teal-600")}
                                  onClick={() => setEwbChallan(challan)}
                                  title={on ? `E-way bill ${formatEwbNo(ewb!.ewb_no)}` : "Generate e-way bill"}
                                >
                                  <Truck className="h-4 w-4" />
                                </Button>
                              );
                            })() : null}
                            {challan.status === 'pending' && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setConvertConfirm(challan)} title="Convert to Invoice">
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                            )}
                            {challan.converted_to_invoice_id && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/sales-invoice-dashboard`)} title="View Invoice">
                                <FileText className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(challan.id)} title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </Card>
      </div>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Challan?</AlertDialogTitle>
            <AlertDialogDescription>This will move the challan to recycle bin and restore the stock.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirm && handleDelete(deleteConfirm)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!convertConfirm} onOpenChange={() => setConvertConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a Sales Invoice from this delivery challan. GST will be added based on your settings.
              Stock has already been deducted via the challan.
              {industrialMode.enabled &&
                ["job_work", "branch_transfer", "repair_return"].includes(convertConfirm?.challan_type ?? "") && (
                  <span className="mt-2 block font-semibold text-amber-700">
                    This challan is marked "{challanTypeLabel(convertConfirm?.challan_type)}". These goods usually come back
                    or stay with you, so they are not normally billed.
                  </span>
                )}
              {convertConfirm && challanPlaceName(convertConfirm.id) && (
                <span className="mt-2 block font-semibold text-emerald-700">
                  The invoice takes the goods out of {challanPlaceName(convertConfirm.id)}, the godown this challan was sent from.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConverting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => convertConfirm && handleConvertToInvoice(convertConfirm)} disabled={isConverting}>
              {isConverting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Converting...</> : "Convert to Invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {ewbOn && currentOrganization?.id ? (
        <ChallanEwayBillDialog
          open={!!ewbChallan}
          onOpenChange={(o) => {
            if (!o) setEwbChallan(null);
          }}
          organizationId={currentOrganization.id}
          challan={ewbChallanInfo}
          ewayBill={ewbChallan ? ewbOfChallan(ewbChallan.id) : null}
          missingSql={!!challanEwb?.missingSql}
          onChanged={() => void refetchChallanEwb()}
        />
      ) : null}

      {isDesktop && (
        <DesktopContextMenu
          isOpen={rowContextMenu.isOpen}
          position={rowContextMenu.position}
          items={rowContextMenu.contextData ? getChallanContextMenuItems(rowContextMenu.contextData) : []}
          onClose={rowContextMenu.closeMenu}
        />
      )}
    </div>
  );
}
