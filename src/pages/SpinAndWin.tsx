import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2, Plus, Save, Search, Trash2, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SpinWheel } from "@/components/spin/SpinWheel";
import { formatDateDMY } from "@/lib/dateDisplay";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SPIN_CAMPAIGN,
  SPIN_COLORS,
  SPIN_PRIZE_TYPES,
  isSpinSchemaMissing,
  loadRecentSpins,
  loadSpinSetup,
  saveSpinSetup,
  spinChances,
  spinPrizeDescription,
  starterSpinPrizes,
  validateSpinSetup,
  type SpinCampaign,
  type SpinPrize,
  type SpinPrizeType,
  type SpinCodeCheck,
  checkSpinCode,
  redeemSpinCode,
} from "@/lib/spinAndWin";

type VariantHit = { id: string; product_id: string; size: string | null; color: string | null; barcode: string | null; products: { product_name: string } | null };

/** Gift product: search by name or barcode, pick one size. */
function GiftProductPicker({ value, onPick, orgId }: { value: string | null | undefined; onPick: (v: VariantHit, label: string) => void; orgId: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<VariantHit[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setBusy(true);
      const term = q.trim().replace(/[%,()]/g, " ");
      const base = () =>
        supabase
          .from("product_variants")
          .select("id, product_id, size, color, barcode, products!inner(product_name)")
          .eq("organization_id", orgId)
          .is("deleted_at", null);
      const [byName, byBarcode] = await Promise.all([
        base().ilike("products.product_name", `%${term}%`).limit(20),
        base().ilike("barcode", `%${term}%`).limit(10),
      ]);
      const seen = new Set<string>();
      const merged = [...((byBarcode.data ?? []) as unknown as VariantHit[]), ...((byName.data ?? []) as unknown as VariantHit[])].filter((h) =>
        seen.has(h.id) ? false : (seen.add(h.id), true),
      );
      setHits(merged.slice(0, 20));
      setBusy(false);
    }, 300);
    return () => window.clearTimeout(t);
  }, [q, open, orgId]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-9 w-full justify-start truncate text-left font-normal" data-testid="spin-gift-picker">
          <Gift className="mr-1.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span className="truncate">{value || "Pick gift product"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Barcode or product name" className="h-9 pl-8" />
        </div>
        <div className="mt-2 max-h-64 overflow-y-auto">
          {busy ? <p className="p-2 text-xs text-muted-foreground">Searching…</p> : null}
          {!busy && q.trim().length >= 2 && hits.length === 0 ? <p className="p-2 text-xs text-muted-foreground">No product found.</p> : null}
          {hits.map((h) => {
            const label = [h.products?.product_name, h.size, h.color, h.barcode].filter(Boolean).join(" · ");
            return (
              <button
                key={h.id}
                type="button"
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onPick(h, label);
                  setOpen(false);
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Check a prize code, then mark it used on a bill (until POS takes codes itself). */
function CodeCheckPanel({ orgId, onUsed }: { orgId: string; onUsed: () => void }) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [bill, setBill] = useState("");
  const [res, setRes] = useState<SpinCodeCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    setRes(await checkSpinCode(supabase, orgId, code));
    setBusy(false);
  };
  const markUsed = async () => {
    if (!res?.ok) return;
    const { data } = await supabase
      .from("sales")
      .select("id, net_amount")
      .eq("organization_id", orgId)
      .eq("sale_number", bill.trim().toUpperCase())
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) {
      toast({ title: "Bill not found", description: `No bill ${bill.trim()}.`, variant: "destructive" });
      return;
    }
    if (Number((data as { net_amount?: number }).net_amount || 0) < res.min_redeem_amount) {
      toast({ title: "Bill too small", description: `This code needs a bill of at least ₹${res.min_redeem_amount}.`, variant: "destructive" });
      return;
    }
    try {
      const ok = await redeemSpinCode(supabase, orgId, res.code, (data as { id: string }).id);
      toast(ok ? { title: "Code used", description: `${res.code} used on ${bill.trim().toUpperCase()}.` } : { title: "Not used", description: "The code was already used or has expired.", variant: "destructive" });
      if (ok) {
        setRes(null);
        setCode("");
        setBill("");
        onUsed();
      }
    } catch (err) {
      toast({ title: "Could not use the code", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };
  return (
    <Card className="p-3" data-testid="spin-code-check">
      <h2 className="mb-2 text-sm font-bold text-slate-800">Check a prize code</h2>
      <div className="flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="SW-XXXXX" className="h-9 font-mono" onKeyDown={(e) => e.key === "Enter" && void check()} />
        <Button type="button" variant="outline" onClick={() => void check()} disabled={busy || !code.trim()}>Check</Button>
      </div>
      {res ? (
        res.ok ? (
          <div className="mt-2 rounded-md border border-green-200 bg-green-50 p-2 text-sm" data-testid="spin-code-ok">
            <p className="font-semibold text-green-800">{spinPrizeDescription({ ...res, prize_type: res.type })}</p>
            <p className="text-xs text-slate-600">
              Won on {res.won_on_sale}{res.customer_name ? ` by ${res.customer_name}` : ""}{res.expires_at ? ` · valid till ${formatDateDMY(res.expires_at)}` : ""}
              {res.min_redeem_amount > 0 ? ` · next bill ₹${res.min_redeem_amount}+` : ""}
            </p>
            <div className="mt-2 flex gap-2">
              <Input value={bill} onChange={(e) => setBill(e.target.value)} placeholder="Used on bill no. (POS/26-27/…)" className="h-9" />
              <Button type="button" onClick={() => void markUsed()} disabled={!bill.trim()}>Mark used</Button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm font-semibold text-red-700" data-testid="spin-code-error">{"error" in res ? res.error : ""}</p>
        )
      ) : null}
    </Card>
  );
}

const STATUS_BADGE: Record<string, string> = {
  won: "bg-amber-500",
  redeemed: "bg-green-600",
  lost: "bg-slate-400",
  cancelled: "bg-red-500",
};

/**
 * Sales → Spin & Win: the owner sets the wheel. Customers get a spin link in the POS bill's
 * WhatsApp message; prizes come back as a code the cashier enters at POS.
 */
export default function SpinAndWin() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [campaign, setCampaign] = useState<SpinCampaign>(DEFAULT_SPIN_CAMPAIGN);
  const [prizes, setPrizes] = useState<SpinPrize[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const setup = useQuery({
    queryKey: ["spin-setup", orgId],
    enabled: !!orgId,
    queryFn: () => loadSpinSetup(supabase, orgId!),
    retry: false,
  });
  const recent = useQuery({
    queryKey: ["spin-recent", orgId],
    enabled: !!orgId && !!setup.data?.campaign,
    queryFn: () => loadRecentSpins(supabase, orgId!),
    retry: false,
  });

  useEffect(() => {
    if (!setup.data) return;
    setCampaign(setup.data.campaign ?? DEFAULT_SPIN_CAMPAIGN);
    setPrizes(setup.data.prizes.length > 0 ? setup.data.prizes : starterSpinPrizes());
    setRemoved([]);
  }, [setup.data]);

  const schemaMissing = setup.isError && isSpinSchemaMissing(setup.error as { code?: string; message?: string });
  const chances = useMemo(() => spinChances(prizes), [prizes]);
  const activeSlices = prizes
    .map((p, i) => ({ label: p.label || "—", color: p.color || SPIN_COLORS[i % SPIN_COLORS.length], active: p.active }))
    .filter((p) => p.active);
  const problems = validateSpinSetup(campaign, prizes);

  const setPrize = (i: number, patch: Partial<SpinPrize>) => setPrizes((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addPrize = () =>
    setPrizes((list) => [
      ...list,
      { label: "", prize_type: "discount_amount", value: 50, max_discount: null, product_id: null, variant_id: null, weight: 10, stock_total: null, stock_per_day: null, color: SPIN_COLORS[list.length % SPIN_COLORS.length], sort_order: list.length, active: true },
    ]);
  const removePrize = (i: number) =>
    setPrizes((list) => {
      const p = list[i];
      if (p?.id) setRemoved((r) => [...r, p.id!]);
      return list.filter((_, j) => j !== i);
    });

  const save = async () => {
    if (!orgId) return;
    if (problems.length > 0) {
      toast({ title: "Check Spin & Win", description: problems[0], variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveSpinSetup(supabase, orgId, campaign, prizes, removed);
      await queryClient.invalidateQueries({ queryKey: ["spin-setup", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["spin-campaign-live", orgId] });
      toast({ title: "Spin & Win saved", description: campaign.enabled ? "Customers get the spin link on their POS bills." : "Spin & Win is off." });
    } catch (err) {
      toast({ title: "Could not save", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, el: React.ReactNode, hint?: string) => (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-slate-600">{label}</Label>
      {el}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3" data-testid="spin-and-win-page">
      <div className="flex flex-wrap items-center gap-2">
        <BackToDashboard />
        <h1 className="flex items-center gap-2 text-xl font-bold text-orange-700">
          <Ticket className="h-5 w-5" /> Spin & Win
        </h1>
        <span className="text-sm text-muted-foreground">Customers spin a prize wheel from their POS bill's WhatsApp link</span>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <Switch
              checked={campaign.enabled}
              onCheckedChange={(v) => setCampaign((c) => ({ ...c, enabled: v }))}
              disabled={schemaMissing}
              data-testid="spin-enabled"
            />
            {campaign.enabled ? <span className="text-green-700">On</span> : <span className="text-slate-500">Off</span>}
          </label>
          <Button onClick={() => void save()} disabled={saving || schemaMissing || !setup.data} data-testid="spin-save">
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>

      {schemaMissing ? (
        <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="spin-schema-missing">
          Spin & Win needs its database update first (SQL file 57, Spin & Win). Run it in Supabase, then reload this page.
        </Card>
      ) : setup.isLoading ? (
        <p className="p-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            <Card className="grid grid-cols-1 gap-3 p-3 md:grid-cols-3">
              {field("Wheel title", <Input value={campaign.title} maxLength={60} onChange={(e) => setCampaign((c) => ({ ...c, title: e.target.value }))} className="no-uppercase" />)}
              {field("Start date", <Input type="date" value={campaign.starts_on ?? ""} onChange={(e) => setCampaign((c) => ({ ...c, starts_on: e.target.value || null }))} />, "Empty = from today")}
              {field("End date", <Input type="date" value={campaign.ends_on ?? ""} onChange={(e) => setCampaign((c) => ({ ...c, ends_on: e.target.value || null }))} />, "Empty = no end")}
              {field(
                "Bills that get a spin",
                <Select value={campaign.pos_only ? "pos" : "all"} onValueChange={(v) => setCampaign((c) => ({ ...c, pos_only: v === "pos" }))}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pos">POS bills only</SelectItem>
                    <SelectItem value="all">POS and Sale bills</SelectItem>
                  </SelectContent>
                </Select>,
              )}
              {field("Minimum bill amount (₹)", <Input type="number" min={0} value={campaign.min_bill_amount} onChange={(e) => setCampaign((c) => ({ ...c, min_bill_amount: Number(e.target.value) || 0 }))} />, "0 = every bill")}
              {field("Spin link valid (days)", <Input type="number" min={1} max={60} value={campaign.link_valid_days} onChange={(e) => setCampaign((c) => ({ ...c, link_valid_days: Number(e.target.value) || 1 }))} />)}
              {field("Prize code valid (days)", <Input type="number" min={1} max={365} value={campaign.code_valid_days} onChange={(e) => setCampaign((c) => ({ ...c, code_valid_days: Number(e.target.value) || 1 }))} />)}
              {field("Minimum next bill to use the code (₹)", <Input type="number" min={0} value={campaign.min_redeem_amount} onChange={(e) => setCampaign((c) => ({ ...c, min_redeem_amount: Number(e.target.value) || 0 }))} />, "0 = any bill")}
              <div className="md:col-span-3">
                {field("Terms shown under the wheel", <Textarea rows={2} maxLength={500} value={campaign.terms ?? ""} onChange={(e) => setCampaign((c) => ({ ...c, terms: e.target.value }))} className="no-uppercase" />)}
              </div>
            </Card>

            <Card className="p-3">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-800">Prizes on the wheel</h2>
                <span className="text-xs text-muted-foreground">Chance = how often a prize comes up compared with the others. Stock limits stop a prize once given out.</span>
                <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={addPrize} disabled={prizes.length >= 12} data-testid="spin-add-prize">
                  <Plus className="mr-1 h-4 w-4" /> Add prize
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-slate-500">
                      <th className="w-8 p-1.5" />
                      <th className="p-1.5">Name on wheel</th>
                      <th className="p-1.5">Type</th>
                      <th className="p-1.5">Value</th>
                      <th className="p-1.5">Chance</th>
                      <th className="p-1.5">Stock total</th>
                      <th className="p-1.5">Per day</th>
                      <th className="p-1.5">Won</th>
                      <th className="p-1.5">On</th>
                      <th className="w-8 p-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {prizes.map((p, i) => (
                      <tr key={p.id ?? `new-${i}`} className="border-b align-top" data-testid="spin-prize-row">
                        <td className="p-1.5">
                          <input
                            type="color"
                            value={p.color || SPIN_COLORS[i % SPIN_COLORS.length]}
                            onChange={(e) => setPrize(i, { color: e.target.value.toUpperCase() })}
                            className="h-8 w-8 cursor-pointer rounded border"
                            aria-label="Slice colour"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input value={p.label} maxLength={40} onChange={(e) => setPrize(i, { label: e.target.value })} className="h-9 no-uppercase" placeholder="e.g. 10% OFF" />
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{p.prize_type !== "better_luck" && p.label ? spinPrizeDescription(p) : ""}</p>
                        </td>
                        <td className="p-1.5">
                          <Select value={p.prize_type} onValueChange={(v) => setPrize(i, { prize_type: v as SpinPrizeType })}>
                            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {SPIN_PRIZE_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="w-56 p-1.5">
                          {p.prize_type === "gift_item" && orgId ? (
                            <GiftProductPicker
                              orgId={orgId}
                              value={p.product_label}
                              onPick={(v, label) => setPrize(i, { product_id: v.product_id, variant_id: v.id, product_label: label })}
                            />
                          ) : p.prize_type === "discount_percent" ? (
                            <div className="flex gap-1">
                              <Input type="number" min={1} max={100} value={p.value} onChange={(e) => setPrize(i, { value: Number(e.target.value) || 0 })} className="h-9 w-16" aria-label="Discount %" />
                              <span className="self-center text-xs">% up to ₹</span>
                              <Input type="number" min={0} value={p.max_discount ?? ""} onChange={(e) => setPrize(i, { max_discount: e.target.value === "" ? null : Number(e.target.value) })} className="h-9 w-20" placeholder="no cap" aria-label="Maximum discount" />
                            </div>
                          ) : p.prize_type === "discount_amount" ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs">₹</span>
                              <Input type="number" min={1} value={p.value} onChange={(e) => setPrize(i, { value: Number(e.target.value) || 0 })} className="h-9 w-24" aria-label="Discount ₹" />
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No prize</span>
                          )}
                        </td>
                        <td className="p-1.5">
                          <Input type="number" min={0} max={1000} value={p.weight} onChange={(e) => setPrize(i, { weight: Number(e.target.value) || 0 })} className="h-9 w-20" aria-label="Chance" />
                          <p className="mt-0.5 text-[11px] font-semibold text-orange-700">{chances[i]}%</p>
                        </td>
                        <td className="p-1.5">
                          <Input type="number" min={0} value={p.stock_total ?? ""} placeholder="∞" onChange={(e) => setPrize(i, { stock_total: e.target.value === "" ? null : Number(e.target.value) })} className="h-9 w-20" aria-label="Stock total" />
                        </td>
                        <td className="p-1.5">
                          <Input type="number" min={0} value={p.stock_per_day ?? ""} placeholder="∞" onChange={(e) => setPrize(i, { stock_per_day: e.target.value === "" ? null : Number(e.target.value) })} className="h-9 w-20" aria-label="Per day" />
                        </td>
                        <td className="p-1.5 pt-3 tabular-nums">{p.won_count ?? 0}</td>
                        <td className="p-1.5 pt-2.5">
                          <Switch checked={p.active} onCheckedChange={(v) => setPrize(i, { active: v })} aria-label="Prize on" />
                        </td>
                        <td className="p-1.5">
                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-red-600" onClick={() => removePrize(i)} aria-label="Remove prize">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {problems.length > 0 ? (
                <ul className="mt-2 list-disc pl-5 text-xs text-red-700" data-testid="spin-problems">
                  {problems.slice(0, 5).map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              ) : null}
            </Card>

            <Card className="p-3">
              <h2 className="mb-2 text-sm font-bold text-slate-800">Recent spins</h2>
              {(recent.data ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No spins yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm" data-testid="spin-recent">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-slate-500">
                        <th className="p-1.5">Date</th>
                        <th className="p-1.5">Bill</th>
                        <th className="p-1.5">Customer</th>
                        <th className="p-1.5">Prize</th>
                        <th className="p-1.5">Code</th>
                        <th className="p-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(recent.data ?? []).map((r) => (
                        <tr key={r.id} className="border-b">
                          <td className="p-1.5">{formatDateDMY(r.created_at)}</td>
                          <td className="p-1.5">{r.sale_number}</td>
                          <td className="p-1.5">{r.customer_name || "—"}</td>
                          <td className="p-1.5">{r.prize_label}</td>
                          <td className="p-1.5 font-mono">{r.code || "—"}</td>
                          <td className="p-1.5">
                            <Badge className={cn("text-white", STATUS_BADGE[r.status] ?? "bg-slate-400")}>{r.status}</Badge>
                            {r.status === "won" && r.expires_at ? <span className="ml-1 text-[11px] text-muted-foreground">till {formatDateDMY(r.expires_at)}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-3 xl:sticky xl:top-0 h-fit">
          {orgId && setup.data?.campaign ? <CodeCheckPanel orgId={orgId} onUsed={() => void recent.refetch()} /> : null}
          <Card className="h-fit p-4">
            <p className="text-center text-sm font-bold text-slate-800">{campaign.title || "Spin & Win"}</p>
            <p className="mb-3 text-center text-xs text-muted-foreground">What the customer sees</p>
            {activeSlices.length >= 2 ? (
              <SpinWheel slices={activeSlices} size={300} />
            ) : (
              <p className="py-16 text-center text-xs text-muted-foreground">Add at least 2 active prizes to see the wheel.</p>
            )}
            {campaign.terms ? <p className="mt-3 text-center text-[11px] text-muted-foreground">{campaign.terms}</p> : null}
          </Card>
          </div>
        </div>
      )}
    </div>
  );
}
