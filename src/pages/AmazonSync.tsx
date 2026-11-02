import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search, Send, Store, Trash2 } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTimeDMY } from "@/lib/dateDisplay";
import { cn } from "@/lib/utils";
import {
  AMAZON_SYNC_FEATURE,
  addAmazonMappings,
  amazonRowStatus,
  callAmazonSync,
  deleteAmazonMapping,
  fetchAmazonSettings,
  fetchAmazonSkuMap,
  isMissingAmazonSql,
  parseSkuBarcodeLines,
  saveAmazonSettings,
  updateAmazonMapping,
  type AddMappingsResult,
  type AmazonSkuMapRow,
} from "@/utils/amazonSync";
import { isValidSellerId } from "../../supabase/functions/_shared/amazonSpApi";

const STATUS_LABEL: Record<ReturnType<typeof amazonRowStatus>, { text: string; cls: string }> = {
  sent: { text: "Sent", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  waiting: { text: "Waiting", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  error: { text: "Error", cls: "bg-red-50 text-red-700 border-red-200" },
  off: { text: "Off", cls: "bg-slate-50 text-slate-500 border-slate-200" },
};

function addResultText(r: AddMappingsResult): string {
  const parts = [`Added ${r.added}`];
  if (r.notFound.length) parts.push(`barcode not found: ${r.notFound.slice(0, 5).join(", ")}${r.notFound.length > 5 ? "…" : ""}`);
  if (r.duplicate.length) parts.push(`SKU already linked: ${r.duplicate.slice(0, 5).join(", ")}${r.duplicate.length > 5 ? "…" : ""}`);
  return parts.join(" · ");
}

export default function AmazonSync() {
  const { currentOrganization, hasFeature } = useOrganization();
  const { user } = useAuth();
  const orgId = currentOrganization?.id ?? "";
  const featureOn = hasFeature(AMAZON_SYNC_FEATURE);
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["amazon-settings", orgId],
    queryFn: () => fetchAmazonSettings(orgId),
    enabled: !!orgId && featureOn,
    retry: false,
  });
  const mapQuery = useQuery({
    queryKey: ["amazon-sku-map", orgId],
    queryFn: () => fetchAmazonSkuMap(orgId),
    enabled: !!orgId && featureOn,
    retry: false,
  });
  const settings = settingsQuery.data ?? null;
  const missingSql = isMissingAmazonSql((settingsQuery.error as Error | null)?.message) || isMissingAmazonSql((mapQuery.error as Error | null)?.message);

  const [sellerId, setSellerId] = useState("");
  const [defaultBuffer, setDefaultBuffer] = useState("0");
  useEffect(() => {
    setSellerId(settings?.seller_id ?? "");
    setDefaultBuffer(String(settings?.default_buffer ?? 0));
  }, [settings?.seller_id, settings?.default_buffer]);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");

  const [oneBarcode, setOneBarcode] = useState("");
  const [oneSku, setOneSku] = useState("");
  const [oneBuffer, setOneBuffer] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["amazon-settings", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["amazon-sku-map", orgId] });
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message || "Something went wrong");
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const rows = mapQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.seller_sku, r.barcode, r.product_name, r.color, r.size].some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [rows, search]);
  const counts = useMemo(() => {
    const c = { sent: 0, waiting: 0, error: 0, off: 0 };
    for (const r of rows) c[amazonRowStatus(r)]++;
    return c;
  }, [rows]);

  if (!featureOn) {
    return (
      <div className="p-4 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Store className="h-5 w-5" /> Amazon Sync</CardTitle>
            <CardDescription>Amazon stock sync is not turned on for this shop. Ask Ezzy support to enable it.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const toggleEnabled = (on: boolean) =>
    run("enabled", async () => {
      await saveAmazonSettings(orgId, { enabled: on });
      toast.success(on ? "Amazon sync switched on" : "Amazon sync switched off");
    });

  const saveSeller = () =>
    run("seller", async () => {
      const id = sellerId.trim().toUpperCase();
      if (!isValidSellerId(id)) throw new Error("Seller ID looks wrong. Copy it from Seller Central > Settings > Account Info > Merchant Token.");
      const buf = Math.max(0, Math.min(1000, Math.floor(Number(defaultBuffer) || 0)));
      await saveAmazonSettings(orgId, { seller_id: id, default_buffer: buf });
      toast.success("Saved");
    });

  const saveKeys = () =>
    run("keys", async () => {
      const res = await callAmazonSync({ action: "save_keys", organizationId: orgId, clientId, clientSecret, refreshToken });
      if (!res.success) throw new Error(res.error || "Could not save the keys");
      setClientId("");
      setClientSecret("");
      setRefreshToken("");
      toast.success(res.message || "Keys saved");
    });

  const callAction = (action: "test" | "sync_now" | "resync_all") =>
    run(action, async () => {
      const res = await callAmazonSync({ action, organizationId: orgId });
      if (!res.success) throw new Error(res.error || "Amazon did not answer");
      toast.success(res.message || "Done");
    });

  const addOne = () =>
    run("addOne", async () => {
      const barcode = oneBarcode.trim();
      if (!barcode) throw new Error("Scan or type the Ezzy barcode");
      const buffer = oneBuffer.trim() === "" ? null : Number(oneBuffer);
      const res = await addAmazonMappings(orgId, [{ sku: oneSku.trim() || barcode, barcode, buffer }], user?.id ?? null);
      if (res.error) throw new Error(res.error);
      if (res.added) {
        toast.success(addResultText(res));
        setOneBarcode("");
        setOneSku("");
        setOneBuffer("");
      } else {
        toast.error(addResultText(res));
      }
    });

  const addPasted = () =>
    run("addPaste", async () => {
      const pairs = parseSkuBarcodeLines(pasteText);
      if (pairs.length === 0) throw new Error("Paste one line per item: Amazon SKU, Ezzy barcode");
      const res = await addAmazonMappings(orgId, pairs, user?.id ?? null);
      if (res.error) throw new Error(res.error);
      (res.added ? toast.success : toast.error)(addResultText(res));
      if (res.added) setPasteText("");
    });

  const changeBuffer = (r: AmazonSkuMapRow, value: string) => {
    const next = value.trim() === "" ? null : Math.max(0, Math.min(1000, Math.floor(Number(value) || 0)));
    if (next === r.buffer_qty) return;
    void run(`buf-${r.id}`, () => updateAmazonMapping(r.id, { buffer_qty: next }));
  };

  const removeRow = (r: AmazonSkuMapRow) => {
    if (!window.confirm(`Remove the link for Amazon SKU ${r.seller_sku}? Amazon keeps its last quantity.`)) return;
    void run(`del-${r.id}`, () => deleteAmazonMapping(r.id));
  };

  const spin = (key: string) => (busy === key ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null);

  return (
    <div className="p-4 space-y-4 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-teal-700 flex items-center gap-2"><Store className="h-5 w-5" /> Amazon Sync</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sends your Ezzy stock to your Amazon.in listings a minute or two after every sale, purchase or return. Amazon orders are
          not pulled in yet: keep billing Amazon orders in Ezzy so stock stays right.
        </p>
      </div>

      {missingSql && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          Run the Amazon stock sync SQL first (Lovable SQL editor). Until then nothing here can be saved.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">1. Switch and seller</CardTitle>
            <CardDescription>Nothing is sent to Amazon while this is off.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="amazon-enabled" className="font-semibold">Amazon stock sync</Label>
                <p className="text-xs text-muted-foreground">{settings?.enabled ? "On: stock changes are sent." : "Off"}</p>
              </div>
              <Switch
                id="amazon-enabled"
                checked={!!settings?.enabled}
                disabled={busy !== null || missingSql}
                onCheckedChange={(v) => void toggleEnabled(v)}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 items-end">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="amazon-seller">Seller ID (Merchant Token)</Label>
                <Input id="amazon-seller" value={sellerId} onChange={(e) => setSellerId(e.target.value)} placeholder="A1B2C3D4E5F6G7" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="amazon-buffer" title="Pieces kept back for the counter on every SKU">Keep for counter</Label>
                <Input id="amazon-buffer" type="number" min={0} value={defaultBuffer} onChange={(e) => setDefaultBuffer(e.target.value)} />
              </div>
            </div>
            <Button size="sm" onClick={() => void saveSeller()} disabled={busy !== null || missingSql}>
              {spin("seller")}Save
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              2. Amazon app keys
              {settings?.has_keys && <span className="text-xs font-normal text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> saved</span>}
            </CardTitle>
            <CardDescription>
              From Seller Central &gt; Develop Apps, after Amazon approves you. Kept on the server only; they are never shown again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID (amzn1.application-oa2-client…)" autoComplete="off" />
            <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Client Secret" autoComplete="new-password" />
            <Input type="password" value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} placeholder="Refresh token (Atzr|…)" autoComplete="new-password" />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={() => void saveKeys()} disabled={busy !== null || missingSql || !clientId || !clientSecret || !refreshToken}>
                {spin("keys")}{settings?.has_keys ? "Replace keys" : "Save keys"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void callAction("test")} disabled={busy !== null || !settings?.has_keys}>
                {spin("test")}Test connection
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">3. Link Amazon SKUs to Ezzy items</CardTitle>
          <CardDescription>
            Scan any barcode of the item. Amazon gets the total stock of that product, colour and size (all its barcodes), minus the
            pieces kept for the counter. Leave SKU empty when your Amazon SKU is the same as the barcode.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1">
              <Label htmlFor="amazon-one-barcode">Ezzy barcode</Label>
              <Input id="amazon-one-barcode" className="w-44" value={oneBarcode} onChange={(e) => setOneBarcode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addOne(); }} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="amazon-one-sku">Amazon SKU</Label>
              <Input id="amazon-one-sku" className="w-52" value={oneSku} onChange={(e) => setOneSku(e.target.value)} placeholder="same as barcode" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="amazon-one-buffer">Keep for counter</Label>
              <Input id="amazon-one-buffer" className="w-28" type="number" min={0} value={oneBuffer} onChange={(e) => setOneBuffer(e.target.value)} placeholder="shop default" />
            </div>
            <Button size="sm" onClick={() => void addOne()} disabled={busy !== null || missingSql}>{spin("addOne")}Add</Button>
          </div>
          <div className="space-y-1">
            <Label htmlFor="amazon-paste">Or paste many: one line per item, "Amazon SKU, Ezzy barcode" (from Excel works too)</Label>
            <Textarea id="amazon-paste" rows={3} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"KURTA-RED-M, 100003548\nKURTA-RED-L, 100003549"} />
            <Button size="sm" variant="outline" onClick={() => void addPasted()} disabled={busy !== null || missingSql || !pasteText.trim()}>{spin("addPaste")}Add pasted list</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Linked SKUs ({rows.length})</CardTitle>
              <CardDescription>
                {counts.sent} sent · {counts.waiting} waiting · {counts.error} with errors
                {settings?.last_sync_at && (
                  <> · Last run {formatDateTimeDMY(settings.last_sync_at)}: <span className={settings.last_sync_ok ? "text-emerald-700" : "text-red-700"}>{settings.last_sync_message}</span></>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void callAction("sync_now")} disabled={busy !== null || !settings?.enabled || !settings?.has_keys}>
                {busy === "sync_now" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}Sync now
              </Button>
              <Button size="sm" variant="outline" onClick={() => void callAction("resync_all")} disabled={busy !== null || !settings?.enabled || !settings?.has_keys} title="Send every linked SKU again, even if unchanged">
                {busy === "resync_all" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}Send all again
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="relative max-w-xs">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SKU, barcode, item" />
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Amazon SKU</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Colour / Size</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead className="text-right">Ezzy stock</TableHead>
                  <TableHead className="w-24">Keep</TableHead>
                  <TableHead className="text-right">On Amazon</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mapQuery.isLoading && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6"><Loader2 className="h-4 w-4 inline animate-spin mr-2" />Loading…</TableCell></TableRow>
                )}
                {!mapQuery.isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">No SKUs linked yet.</TableCell></TableRow>
                )}
                {filtered.map((r) => {
                  const st = STATUS_LABEL[amazonRowStatus(r)];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.seller_sku}</TableCell>
                      <TableCell>{r.product_name}</TableCell>
                      <TableCell>{[r.color, r.size].filter(Boolean).join(" / ")}</TableCell>
                      <TableCell className="text-muted-foreground">{r.barcode}</TableCell>
                      <TableCell className="text-right">{r.last_stock_qty ?? "–"}</TableCell>
                      <TableCell>
                        <Input
                          key={`${r.id}-${r.buffer_qty ?? ""}`}
                          className="h-8 w-20"
                          type="number"
                          min={0}
                          defaultValue={r.buffer_qty ?? ""}
                          placeholder={String(settings?.default_buffer ?? 0)}
                          onBlur={(e) => changeBuffer(r, e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {r.last_pushed_qty ?? "–"}
                        {r.last_pushed_at && <div className="text-[11px] text-muted-foreground">{formatDateTimeDMY(r.last_pushed_at)}</div>}
                      </TableCell>
                      <TableCell>
                        <span className={cn("inline-block rounded border px-1.5 py-0.5 text-xs", st.cls)} title={r.last_error ?? undefined}>{st.text}</span>
                        {r.last_error && <div className="text-[11px] text-red-700 max-w-[220px] truncate" title={r.last_error}>{r.last_error}</div>}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => removeRow(r)} disabled={busy !== null} title="Remove link">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
