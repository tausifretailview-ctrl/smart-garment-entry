import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, ChevronDown, ChevronUp, FileDown, Loader2, Play, Search, Truck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PrintSaleOrderDialog } from "@/components/sale-order/PrintSaleOrderDialog";
import { fetchSaleOrderLineItems, fetchSaleOrderWithItems } from "@/utils/saleOrderListQueries";
import { fetchInvoicedSaleNumbers } from "@/lib/saleOrderInvoiceLink";
import {
  DISPATCH_TABS,
  dispatchStatusLabel,
  fetchDispatchCounts,
  fetchDispatchOrders,
  markDelivered,
  matchEmployee,
  startDispatch,
  undoDispatchStep,
  type DispatchDb,
  type DispatchOrderRow,
  type DispatchStatus,
} from "@/lib/data/saleOrderDispatch";

/**
 * Sales → Dispatch (Nov 2026): accepted sale orders waiting to go out. Check the items,
 * download / print them, Start (staff who dispatches), then Delivered.
 */
const db = supabase as unknown as DispatchDb;
const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dmy = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : format(d, "dd/MM/yyyy");
};
const dmyHm = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : format(d, "dd/MM/yyyy hh:mm a");
};

const STATUS_CLASS: Record<DispatchStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  in_process: "bg-blue-100 text-blue-800 border-blue-300",
  delivered: "bg-green-100 text-green-800 border-green-300",
};

type Employee = { id: string; employee_name: string; designation: string | null };

const DispatchDashboard = () => {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();
  const [tab, setTab] = useState<DispatchStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [startFor, setStartFor] = useState<DispatchOrderRow | null>(null);
  const [staffName, setStaffName] = useState("");
  const [printOrder, setPrintOrder] = useState<Record<string, unknown> | null>(null);

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["dispatch-orders", orgId, tab],
    enabled: !!orgId,
    queryFn: () => fetchDispatchOrders(db, orgId!, tab),
  });
  const { data: counts } = useQuery({
    queryKey: ["dispatch-counts", orgId],
    enabled: !!orgId,
    queryFn: () => fetchDispatchCounts(db, orgId!),
  });
  const missingSql = rows === null || counts === null;

  const orderIds = useMemo(() => (rows ?? []).map((r) => r.id), [rows]);
  const { data: billNos = {} } = useQuery({
    queryKey: ["dispatch-bill-numbers", orgId, orderIds.join(",")],
    enabled: orderIds.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchInvoicedSaleNumbers(supabase, orderIds),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["dispatch-employees", orgId],
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Employee[]> => {
      const { data } = await supabase
        .from("employees")
        .select("id, employee_name, designation, status")
        .eq("organization_id", orgId!)
        .is("deleted_at", null)
        .order("employee_name");
      return ((data ?? []) as Array<Employee & { status: string | null }>).filter((e) => e.status !== "inactive");
    },
  });

  const { data: lines = [], isFetching: linesLoading } = useQuery({
    queryKey: ["dispatch-order-lines", expanded],
    enabled: !!expanded,
    queryFn: () => fetchSaleOrderLineItems(expanded!),
  });

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter(
      (r) =>
        r.order_number.toLowerCase().includes(q) ||
        r.customer_name.toLowerCase().includes(q) ||
        (r.customer_phone ?? "").includes(q) ||
        (r.dispatch_staff ?? "").toLowerCase().includes(q) ||
        (billNos[r.id] ?? "").toLowerCase().includes(q),
    );
  }, [rows, search, billNos]);

  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: ["dispatch-orders", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["dispatch-counts", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["sale-orders-list", orgId] });
  };

  const run = async (orderId: string, work: () => Promise<void>, done: string) => {
    setBusy(orderId);
    try {
      await work();
      toast.success(done);
      reload();
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const openPrint = async (r: DispatchOrderRow) => {
    setBusy(r.id);
    try {
      const full = await fetchSaleOrderWithItems(r.id);
      if (!full) throw new Error("Order not found");
      setPrintOrder(full as Record<string, unknown>);
    } catch (e) {
      toast.error("Could not open the order", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const confirmStart = async () => {
    if (!startFor || !orgId) return;
    const emp = matchEmployee(employees, staffName);
    const order = startFor;
    setStartFor(null);
    await run(
      order.id,
      () => startDispatch(db, orgId, order.id, { name: emp?.employee_name ?? staffName, employeeId: emp?.id ?? null }),
      `${order.order_number}: dispatch started by ${emp?.employee_name ?? staffName.trim()}`,
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2">
        <BackToDashboard />
        <Truck className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold mr-auto">Dispatch</h1>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order no, customer, staff, bill no"
            className="h-9 w-64 pl-8"
            aria-label="Search dispatch"
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Accepted sale orders. Check the items, download or print them, press Start with the staff who dispatches, then
        Delivered.
      </p>

      <div className="flex flex-wrap gap-2" role="tablist">
        {DISPATCH_TABS.map((t) => {
          const n = t.value === "all" ? null : counts?.[t.value];
          return (
            <Button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              variant={tab === t.value ? "default" : "outline"}
              size="sm"
              onClick={() => setTab(t.value)}
              data-testid={`dispatch-tab-${t.value}`}
            >
              {t.label}
              {n != null ? <span className="ml-1.5 rounded-full bg-background/80 px-1.5 text-xs font-bold text-foreground">{n}</span> : null}
            </Button>
          );
        })}
      </div>

      {missingSql ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
          Run SQL 76 (dispatch) in the database first.
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && !missingSql && shown.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          {tab === "pending" ? "No accepted orders waiting for dispatch." : "No orders here."}
        </Card>
      ) : null}

      {shown.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-xs uppercase text-white">
              <tr className="text-left">
                <th className="px-2 py-2 w-8" />
                <th className="px-2 py-2">Order</th>
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">Amount</th>
                <th className="px-2 py-2">Bill no</th>
                <th className="px-2 py-2">Dispatch staff</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const open = expanded === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr className="border-t align-top" data-testid="dispatch-row">
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          aria-label={open ? `Hide items ${r.order_number}` : `Show items ${r.order_number}`}
                          onClick={() => setExpanded(open ? null : r.id)}
                          className="rounded p-1 hover:bg-muted"
                        >
                          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-2 py-2">
                        <div className="whitespace-nowrap font-semibold text-blue-700">{r.order_number}</div>
                        <div className="text-xs text-muted-foreground">{dmy(r.order_date)}</div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium">{r.customer_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.customer_phone || ""}
                          {r.salesman ? ` · ${r.salesman}` : ""}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.total_qty}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{money(r.net_amount)}</td>
                      <td className="px-2 py-2 whitespace-nowrap" data-testid="dispatch-bill-no">
                        {billNos[r.id] ? <span className="font-semibold text-green-700">{billNos[r.id]}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-2" data-testid="dispatch-staff">
                        {r.dispatch_staff ? (
                          <>
                            <div className="font-medium">{r.dispatch_staff}</div>
                            <div className="text-xs text-muted-foreground">{dmyHm(r.dispatch_started_at)}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          data-testid="dispatch-status"
                          className={cn("inline-block rounded-full border px-2 py-0.5 text-xs font-bold", STATUS_CLASS[r.dispatch_status])}
                        >
                          {dispatchStatusLabel(r.dispatch_status)}
                        </span>
                        {r.delivered_at ? <div className="mt-0.5 text-xs text-muted-foreground">{dmyHm(r.delivered_at)}</div> : null}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy === r.id}
                            onClick={() => void openPrint(r)}
                            aria-label={`Download ${r.order_number}`}
                          >
                            <FileDown className="h-4 w-4 mr-1" /> Download
                          </Button>
                          {r.dispatch_status === "pending" ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={busy === r.id}
                              onClick={() => {
                                setStaffName("");
                                setStartFor(r);
                              }}
                              aria-label={`Start dispatch ${r.order_number}`}
                            >
                              <Play className="h-4 w-4 mr-1" /> Start
                            </Button>
                          ) : null}
                          {r.dispatch_status === "in_process" ? (
                            <Button
                              type="button"
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white"
                              disabled={busy === r.id}
                              onClick={() =>
                                void run(r.id, () => markDelivered(db, orgId!, r.id), `${r.order_number}: delivered`)
                              }
                              aria-label={`Mark delivered ${r.order_number}`}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Delivered
                            </Button>
                          ) : null}
                          {r.dispatch_status !== "pending" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busy === r.id}
                              title={r.dispatch_status === "delivered" ? "Back to Dispatching" : "Back to Pending"}
                              onClick={() =>
                                void run(
                                  r.id,
                                  () => undoDispatchStep(db, orgId!, r.id, r.dispatch_status),
                                  `${r.order_number}: moved back to ${r.dispatch_status === "delivered" ? "Dispatching" : "Pending"}`,
                                )
                              }
                              aria-label={`Undo ${r.order_number}`}
                            >
                              {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="bg-muted/40">
                        <td />
                        <td colSpan={8} className="px-2 py-2">
                          {linesLoading && lines.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Loading items…</p>
                          ) : (
                            <table className="w-full text-xs" data-testid="dispatch-items">
                              <thead className="text-muted-foreground">
                                <tr className="text-left">
                                  <th className="py-1 pr-2">Item</th>
                                  <th className="py-1 pr-2">Colour</th>
                                  <th className="py-1 pr-2">Size</th>
                                  <th className="py-1 pr-2">Barcode</th>
                                  <th className="py-1 pr-2 text-right">Qty</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(lines as Array<Record<string, unknown>>).map((l) => (
                                  <tr key={String(l.id)} className="border-t">
                                    <td className="py-1 pr-2 font-medium">{String(l.product_name ?? "")}</td>
                                    <td className="py-1 pr-2">{String(l.color ?? "")}</td>
                                    <td className="py-1 pr-2">{String(l.size ?? "")}</td>
                                    <td className="py-1 pr-2">{String(l.barcode ?? "")}</td>
                                    <td className="py-1 pr-2 text-right tabular-nums">{Number(l.order_qty) || 0}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : null}

      <Dialog open={!!startFor} onOpenChange={(o) => (!o ? setStartFor(null) : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start dispatch</DialogTitle>
            <DialogDescription>
              {startFor ? `${startFor.order_number} · ${startFor.customer_name}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="dispatch-staff">Dispatch staff</Label>
            <Input
              id="dispatch-staff"
              list="dispatch-staff-list"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder={employees.length > 0 ? "Pick or type the staff name" : "Type the staff name"}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && staffName.trim()) void confirmStart();
              }}
            />
            <datalist id="dispatch-staff-list">
              {employees.map((e) => (
                <option key={e.id} value={e.employee_name}>
                  {e.designation ?? ""}
                </option>
              ))}
            </datalist>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStartFor(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={!staffName.trim()} onClick={() => void confirmStart()}>
              <Play className="h-4 w-4 mr-1" /> Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {printOrder ? (
        <PrintSaleOrderDialog order={printOrder} settings={settings} onClose={() => setPrintOrder(null)} />
      ) : null}
    </div>
  );
};

export default DispatchDashboard;
