import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Loader2, PackageCheck, PackageX, Undo2 } from "lucide-react";
import { useSaveSale } from "@/hooks/useSaveSale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateDMY } from "@/lib/dateDisplay";
import {
  buildAmazonBillLines,
  ensureAmazonCustomer,
  fetchAmazonReturns,
  fetchAmazonSkuMap,
  fetchAmazonStockRows,
  fetchBillsForOrders,
  fetchImportedLineKeys,
  saveImportedLines,
  setReturnStatus,
} from "@/utils/amazonSync";
import {
  buildAmazonStockFile,
  groupByOrder,
  isOrdersReport,
  isReturnsReport,
  parseReportText,
  readOrderLines,
  readReturnLines,
  type AmazonOrderLine,
  type SkippedLine,
} from "@/utils/amazonReports";

type OrderPlan = {
  newOrders: { orderId: string; lines: AmazonOrderLine[] }[];
  already: number;
  skipped: SkippedLine[];
  unlinked: string[];
};

function downloadText(name: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const todayStamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}-${pad(d.getHours())}${pad(d.getMinutes())}`;
};

export function AmazonOfflineTools({ orgId, userId, defaultBuffer, disabled }: {
  orgId: string;
  userId: string | null;
  defaultBuffer: number;
  disabled: boolean;
}) {
  const queryClient = useQueryClient();
  const { saveSale } = useSaveSale();
  const [busy, setBusy] = useState<string | null>(null);
  const [plan, setPlan] = useState<OrderPlan | null>(null);
  const [progress, setProgress] = useState("");
  const ordersInput = useRef<HTMLInputElement>(null);
  const returnsInput = useRef<HTMLInputElement>(null);

  const returnsQuery = useQuery({
    queryKey: ["amazon-returns", orgId],
    queryFn: () => fetchAmazonReturns(orgId),
    enabled: !!orgId && !disabled,
    retry: false,
  });
  const returns = returnsQuery.data ?? [];
  const pendingReturns = useMemo(() => returns.filter((r) => r.status === "pending"), [returns]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message || "Something went wrong");
    } finally {
      setBusy(null);
      setProgress("");
    }
  };

  const downloadStockFile = () =>
    run("stock", async () => {
      const rows = await fetchAmazonStockRows(orgId, defaultBuffer);
      if (rows.length === 0) throw new Error("Link at least one Amazon SKU first.");
      downloadText(`amazon-stock-${todayStamp()}.txt`, buildAmazonStockFile(rows));
      toast.success(`Stock file for ${rows.length} SKUs downloaded`);
    });

  const readOrdersFile = (file: File) =>
    run("readOrders", async () => {
      const table = parseReportText(await file.text());
      if (!isOrdersReport(table)) {
        throw new Error("This is not an Amazon orders report. Download Reports > Fulfillment > All Orders (or Orders > Order Reports).");
      }
      const { lines, skipped } = readOrderLines(table);
      const done = await fetchImportedLineKeys(orgId, "order", lines.map((l) => l.lineKey));
      const maps = await fetchAmazonSkuMap(orgId);
      const linked = new Set(maps.filter((m) => m.active).map((m) => m.seller_sku.toUpperCase()));
      const fresh = lines.filter((l) => !done.has(l.lineKey));
      const unlinked = [...new Set(fresh.filter((l) => !linked.has(l.sku.toUpperCase())).map((l) => l.sku))];
      const orders = groupByOrder(fresh).filter((o) => o.lines.every((l) => linked.has(l.sku.toUpperCase())));
      setPlan({ newOrders: orders, already: lines.length - fresh.length, skipped, unlinked });
    });

  const makeBills = () =>
    run("bills", async () => {
      if (!plan || plan.newOrders.length === 0) return;
      const customer = await ensureAmazonCustomer(orgId);
      const maps = await fetchAmazonSkuMap(orgId);
      let made = 0;
      let failed = 0;
      for (const [i, order] of plan.newOrders.entries()) {
        setProgress(`Bill ${i + 1} of ${plan.newOrders.length}`);
        const { items, missing } = await buildAmazonBillLines(orgId, order.lines, maps);
        if (missing.length > 0 || items.length === 0) {
          failed++;
          continue;
        }
        const total = Math.round(items.reduce((s, it) => s + it.netAmount, 0) * 100) / 100;
        const rounded = Math.round(total);
        const orderDate = order.lines[0].orderDate ? formatDateDMY(order.lines[0].orderDate) : "";
        const sale = await saveSale(
          {
            customerId: customer.id,
            customerName: customer.name,
            customerPhone: null,
            items,
            grossAmount: total,
            discountAmount: 0,
            flatDiscountPercent: 0,
            flatDiscountAmount: 0,
            saleReturnAdjust: 0,
            roundOff: Math.round((rounded - total) * 100) / 100,
            netAmount: rounded,
            notes: `Amazon order ${order.orderId}${orderDate ? ` dated ${orderDate}` : ""}`,
            taxType: "inclusive",
          },
          "pay_later",
          undefined,
          "sale_invoice",
        );
        if (!sale?.id) {
          failed++;
          continue;
        }
        await saveImportedLines(
          order.lines.map((l) => ({
            organization_id: orgId,
            kind: "order",
            amazon_order_id: l.orderId,
            line_key: l.lineKey,
            seller_sku: l.sku,
            quantity: l.quantity,
            amount: l.amount,
            order_date: l.orderDate,
            sale_id: sale.id,
            sale_number: sale.sale_number ?? null,
            status: "done",
            created_by: userId,
          })),
        );
        made++;
      }
      setPlan(null);
      if (ordersInput.current) ordersInput.current.value = "";
      (failed ? toast.error : toast.success)(`Made ${made} Amazon bill${made === 1 ? "" : "s"}${failed ? `, ${failed} could not be made` : ""}.`);
      void queryClient.invalidateQueries({ queryKey: ["amazon-sku-map", orgId] });
    });

  const readReturnsFile = (file: File) =>
    run("returns", async () => {
      const table = parseReportText(await file.text());
      if (!isReturnsReport(table)) {
        throw new Error("This is not an Amazon returns report. Download it from Orders > Manage Returns (or Reports > Returns).");
      }
      const lines = readReturnLines(table);
      const done = await fetchImportedLineKeys(orgId, "return", lines.map((l) => l.lineKey));
      const fresh = lines.filter((l) => !done.has(l.lineKey));
      const bills = await fetchBillsForOrders(orgId, fresh.map((l) => l.orderId));
      await saveImportedLines(
        fresh.map((l) => ({
          organization_id: orgId,
          kind: "return",
          amazon_order_id: l.orderId,
          line_key: l.lineKey,
          seller_sku: l.sku,
          quantity: l.quantity,
          order_date: l.returnDate,
          sale_number: bills.get(l.orderId) ?? null,
          status: "pending",
          reason: l.reason || null,
          created_by: userId,
        })),
      );
      if (returnsInput.current) returnsInput.current.value = "";
      toast.success(`${fresh.length} new return${fresh.length === 1 ? "" : "s"} added${lines.length - fresh.length ? `, ${lines.length - fresh.length} already in the list` : ""}.`);
      void queryClient.invalidateQueries({ queryKey: ["amazon-returns", orgId] });
    });

  const markReturn = (id: string, status: "received" | "damaged" | "pending") =>
    run(`ret-${id}`, async () => {
      await setReturnStatus(id, status);
      void queryClient.invalidateQueries({ queryKey: ["amazon-returns", orgId] });
    });

  const spin = (key: string) => (busy === key ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Without the Amazon API: files</CardTitle>
        <CardDescription>
          Works without Amazon developer approval. Do it each morning and evening: upload the Amazon orders report so Ezzy
          makes the bills and lowers stock, then download the stock file and upload it in Seller Central.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="font-semibold text-sm">1. Amazon orders report → Ezzy bills</div>
          <p className="text-xs text-muted-foreground">
            Seller Central &gt; Reports &gt; Fulfillment &gt; All Orders (or Orders &gt; Order Reports), download the .txt and pick it here.
            Each Amazon order becomes one Sales Invoice to "Amazon Customer" (Pay Later), with the Amazon order number in the
            note. Orders already made are skipped, so uploading the same file twice is safe. FBA and cancelled orders are skipped.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={ordersInput}
              type="file"
              accept=".txt,.tsv,.csv,text/plain,text/csv"
              className="text-sm"
              disabled={disabled || busy !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readOrdersFile(f);
              }}
            />
            {busy === "readOrders" && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          {plan && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <div><b>{plan.newOrders.length}</b> new order{plan.newOrders.length === 1 ? "" : "s"} to bill ({plan.newOrders.reduce((s, o) => s + o.lines.length, 0)} lines)</div>
              {plan.already > 0 && <div className="text-muted-foreground">{plan.already} lines already billed earlier</div>}
              {plan.skipped.length > 0 && (
                <div className="text-muted-foreground">
                  {plan.skipped.length} skipped: {[...new Set(plan.skipped.map((s) => s.reason))].join("; ")}
                </div>
              )}
              {plan.unlinked.length > 0 && (
                <div className="text-red-700">
                  Not linked to Ezzy items (link them above, then upload again): {plan.unlinked.slice(0, 10).join(", ")}
                  {plan.unlinked.length > 10 ? "…" : ""}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={() => void makeBills()} disabled={busy !== null || plan.newOrders.length === 0}>
                  {spin("bills")}{busy === "bills" && progress ? progress : `Make ${plan.newOrders.length} bills`}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPlan(null)} disabled={busy !== null}>Cancel</Button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="font-semibold text-sm">2. Ezzy stock → Amazon</div>
          <p className="text-xs text-muted-foreground">
            Downloads Amazon's price-and-quantity file for every linked SKU (stock minus "keep for counter"; price left empty so
            Amazon keeps your price). Upload it in Seller Central &gt; Catalogue &gt; Add Products via Upload &gt; Upload your
            spreadsheet. Try it with a few SKUs the first time and check the quantities on Amazon.
          </p>
          <Button size="sm" variant="outline" onClick={() => void downloadStockFile()} disabled={disabled || busy !== null}>
            {busy === "stock" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}Download Amazon stock file
          </Button>
        </div>

        <div className="space-y-2">
          <div className="font-semibold text-sm">3. Amazon returns</div>
          <p className="text-xs text-muted-foreground">
            Seller Central &gt; Orders &gt; Manage Returns, download the report and pick it here. Returns land in the list below.
            When the parcel reaches the shop, check it: if it is fine, make the Sale Return in Ezzy (customer "Amazon
            Customer") and tick Received; if damaged, tick Damaged so it stays out of stock.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={returnsInput}
              type="file"
              accept=".txt,.tsv,.csv,text/plain,text/csv"
              className="text-sm"
              disabled={disabled || busy !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readReturnsFile(f);
              }}
            />
            {busy === "returns" && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Amazon order</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Ezzy bill</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-4">No Amazon returns uploaded yet.</TableCell></TableRow>
                )}
                {returns.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.amazon_order_id}</TableCell>
                    <TableCell>{r.seller_sku}</TableCell>
                    <TableCell className="text-right">{r.quantity}</TableCell>
                    <TableCell>{r.sale_number ?? "–"}</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={r.reason ?? undefined}>{r.reason ?? ""}</TableCell>
                    <TableCell>{r.status === "pending" ? "To receive" : r.status === "received" ? "Received" : r.status === "damaged" ? "Damaged" : r.status}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.status === "pending" ? (
                        <>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => void markReturn(r.id, "received")} disabled={busy !== null} title="Parcel received in good condition (make the Sale Return in Ezzy)">
                            <PackageCheck className="h-4 w-4 mr-1" />Received
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => void markReturn(r.id, "damaged")} disabled={busy !== null} title="Damaged: keep it out of stock">
                            <PackageX className="h-4 w-4 mr-1" />Damaged
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => void markReturn(r.id, "pending")} disabled={busy !== null} title="Undo">
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {pendingReturns.length > 0 && <p className="text-xs text-amber-700">{pendingReturns.length} return{pendingReturns.length === 1 ? "" : "s"} still to receive.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
