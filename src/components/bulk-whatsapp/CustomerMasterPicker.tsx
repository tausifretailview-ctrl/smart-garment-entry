import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Cake, Check, Loader2, Search, Send, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatBulkPhone, normalizeBulkPhone, type BulkContact } from "@/utils/bulkWhatsAppContacts";
import { lastSendByPhone } from "@/utils/bulkWhatsAppHistory";
import { upcomingSpecialDays } from "@/utils/customerSpecialDays";
import { fetchSpecialDayCustomers } from "@/utils/customerSpecialDaysFetch";
import { CAMPAIGN_LIST_LIMIT, fetchSentHistory, useBulkCampaigns } from "./bulkWhatsAppApi";

const BATCH = 1000;
const MAX_CUSTOMERS = 20000;
const SHOWN_ROWS = 300;

/** "new" = never got a bulk message (the default, so each batch goes to fresh customers). */
type SentFilter = "new" | "sent" | "all";

interface PickRow extends BulkContact {
  id: string;
}

/** Customers with a usable mobile number, one row per number (first name wins). */
async function fetchCustomerContacts(organizationId: string): Promise<PickRow[]> {
  const byPhone = new Map<string, PickRow>();
  for (let from = 0; from < MAX_CUSTOMERS; from += BATCH) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, customer_name, phone")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .not("phone", "is", null)
      .order("customer_name", { ascending: true })
      .range(from, from + BATCH - 1);
    if (error) throw error;
    for (const c of data ?? []) {
      const phone = normalizeBulkPhone(c.phone);
      if (phone && !byPhone.has(phone)) byPhone.set(phone, { id: c.id, phone, name: c.customer_name?.trim() || null });
    }
    if (!data || data.length < BATCH) break;
  }
  return [...byPhone.values()];
}

/**
 * Choose Customer Master customers for a bulk send; search, select all matching, add. Each customer
 * shows the last campaign that reached them, and the list opens on "Not sent yet" so shops can
 * work through their customers batch by batch without repeating anyone.
 */
export function CustomerMasterPicker({
  organizationId,
  open,
  onOpenChange,
  onAdd,
}: {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (contacts: BulkContact[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sentFilter, setSentFilter] = useState<SentFilter>("new");
  const [specialToday, setSpecialToday] = useState(false);
  // Birthday / anniversary today. Quietly empty until the birthday SQL is run.
  const special = useQuery({
    queryKey: ["customer-special-days", organizationId],
    queryFn: () => fetchSpecialDayCustomers(organizationId),
    enabled: open,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const specialTodayPhones = useMemo(() => {
    const phones = new Set<string>();
    for (const d of upcomingSpecialDays(special.data ?? [], new Date(), 0)) {
      const phone = normalizeBulkPhone(d.customer.phone);
      if (phone) phones.add(phone);
    }
    return phones;
  }, [special.data]);
  const q = useQuery({
    queryKey: ["bulk-whatsapp-customer-contacts", organizationId],
    queryFn: () => fetchCustomerContacts(organizationId),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const campaigns = useBulkCampaigns(organizationId).data;
  // Changes whenever a campaign is added or sends more, so a just-finished batch shows as sent.
  const historyKey = campaigns
    ? `${campaigns.length}:${campaigns[0]?.id ?? ""}:${campaigns.reduce((n, c) => n + c.sent_count + c.failed_count, 0)}`
    : "";
  const history = useQuery({
    queryKey: ["bulk-whatsapp-sent-history", organizationId, historyKey],
    queryFn: async () => lastSendByPhone(await fetchSentHistory(campaigns!.map((c) => c.id)), campaigns!),
    enabled: open && Boolean(campaigns),
    staleTime: 60 * 1000,
  });
  const sentMap = history.data;

  const all = q.data ?? [];
  const sentCount = useMemo(() => (sentMap ? all.filter((c) => sentMap.has(c.phone)).length : 0), [all, sentMap]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return all.filter(
      (c) =>
        (sentFilter === "all" || !sentMap || (sentFilter === "sent") === sentMap.has(c.phone)) &&
        (!specialToday || specialTodayPhones.has(c.phone)) &&
        (!s || (c.name ?? "").toLowerCase().includes(s) || (digits.length >= 3 && c.phone.includes(digits))),
    );
  }, [all, search, sentFilter, sentMap, specialToday, specialTodayPhones]);
  const allFilteredPicked = filtered.length > 0 && filtered.every((c) => picked.has(c.phone));

  const toggle = (phone: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });

  const toggleAllFiltered = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allFilteredPicked) filtered.forEach((c) => next.delete(c.phone));
      else filtered.forEach((c) => next.add(c.phone));
      return next;
    });

  const add = () => {
    onAdd(all.filter((c) => picked.has(c.phone)).map(({ phone, name }) => ({ phone, name })));
    setPicked(new Set());
    setSearch("");
    setSentFilter("new");
    setSpecialToday(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600" /> Customers from Customer Master
          </DialogTitle>
          <p className="text-xs text-slate-500">
            {q.isLoading
              ? "Loading customers…"
              : `${all.length.toLocaleString("en-IN")} customers with a mobile number${
                  sentMap ? ` · ${sentCount.toLocaleString("en-IN")} already got a bulk message` : ""
                }`}
          </p>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          {(
            [
              ["new", "Not sent yet", all.length - sentCount],
              ["sent", "Already sent", sentCount],
              ["all", "All", all.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSentFilter(key)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 font-medium transition",
                sentFilter === key ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900",
              )}
            >
              {label}
              {sentMap || key === "all" ? <span className="ml-1 tabular-nums text-slate-400">({count.toLocaleString("en-IN")})</span> : null}
            </button>
          ))}
        </div>
        {history.isLoading && open && (
          <p className="-mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Checking who already got a message…
          </p>
        )}
        {sentMap && campaigns && campaigns.length >= CAMPAIGN_LIST_LIMIT && (
          <p className="-mt-1 text-xs text-slate-500">Checked against your last {CAMPAIGN_LIST_LIMIT} campaigns.</p>
        )}
        {history.isError && (
          <p className="-mt-1 text-xs text-amber-700">Could not check earlier campaigns, so all customers are shown.</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or mobile"
              className="no-uppercase pl-8"
            />
          </div>
          {specialTodayPhones.size > 0 && (
            <Button
              type="button"
              variant={specialToday ? "default" : "outline"}
              size="sm"
              className={cn("h-9", specialToday && "bg-pink-600 hover:bg-pink-700")}
              onClick={() => {
                const next = !specialToday;
                setSpecialToday(next);
                if (next) setSentFilter("all");
              }}
            >
              <Cake className="mr-1 h-4 w-4" /> Birthday / anniversary today ({specialTodayPhones.size})
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={toggleAllFiltered} disabled={!filtered.length}>
            {allFilteredPicked ? "Unselect" : "Select"} all {search.trim() ? "matching " : ""}({filtered.length.toLocaleString("en-IN")})
          </Button>
        </div>

        <div className="min-h-[240px] flex-1 overflow-auto rounded-xl border border-slate-200">
          {q.isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : q.isError ? (
            <p className="p-6 text-center text-sm text-destructive">Could not load customers. Please try again.</p>
          ) : !filtered.length ? (
            <p className="p-6 text-center text-sm text-slate-500">
              {sentFilter === "new" && sentMap && !search.trim() ? "Every customer has already got a bulk message" : "No customers found"}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.slice(0, SHOWN_ROWS).map((c) => {
                const on = picked.has(c.phone);
                const last = sentMap?.get(c.phone);
                return (
                  <li key={c.phone}>
                    <button
                      type="button"
                      onClick={() => toggle(c.phone)}
                      className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50", on && "bg-emerald-50/70")}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          on ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white",
                        )}
                      >
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-800">{c.name ?? "–"}</span>
                        {last && (
                          <span
                            className={cn(
                              "mt-0.5 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                              last.queued ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700",
                            )}
                            title={`Last bulk message: ${last.campaignName}${last.times > 1 ? ` (reached ${last.times} times)` : ""}`}
                          >
                            <Send className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {last.queued ? "Sending now" : format(new Date(last.at), "dd MMM")} · {last.campaignName}
                            </span>
                            {last.times > 1 && <span className="shrink-0 tabular-nums">· {last.times}×</span>}
                          </span>
                        )}
                      </span>
                      <span className="whitespace-nowrap tabular-nums text-slate-600">{formatBulkPhone(c.phone)}</span>
                    </button>
                  </li>
                );
              })}
              {filtered.length > SHOWN_ROWS && (
                <li className="px-3 py-2 text-xs text-slate-500">
                  Showing {SHOWN_ROWS} of {filtered.length.toLocaleString("en-IN")}. Search to narrow, or use Select all.
                </li>
              )}
            </ul>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <span className="text-sm text-slate-600">
            <b className="tabular-nums">{picked.size.toLocaleString("en-IN")}</b> selected
          </span>
          <Button
            type="button"
            className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700"
            disabled={!picked.size}
            onClick={add}
          >
            Add {picked.size.toLocaleString("en-IN")} customers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
