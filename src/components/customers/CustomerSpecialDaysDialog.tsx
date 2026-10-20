import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Cake, Heart, Loader2, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { whatsappShareUrl } from "@/lib/storefrontShare";
import { normalizeBulkPhone, formatBulkPhone } from "@/utils/bulkWhatsAppContacts";
import { fetchSpecialDayCustomers } from "@/utils/customerSpecialDaysFetch";
import {
  isMissingSpecialDayColumnError,
  specialDayWishMessage,
  upcomingSpecialDays,
  type UpcomingSpecialDay,
} from "@/utils/customerSpecialDays";

const RANGES = [
  { days: 0, label: "Today" },
  { days: 7, label: "Next 7 days" },
  { days: 30, label: "Next 30 days" },
] as const;

const whenLabel = (d: UpcomingSpecialDay) =>
  d.daysAway === 0 ? "Today" : d.daysAway === 1 ? "Tomorrow" : `${format(d.on, "dd MMM")} (in ${d.daysAway} days)`;

/** Customer Master → Birthdays: who to wish today / this week, one tap to WhatsApp. */
export function CustomerSpecialDaysDialog({
  organizationId,
  shopName,
  open,
  onOpenChange,
}: {
  organizationId: string;
  shopName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [range, setRange] = useState<number>(7);
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const q = useQuery({
    queryKey: ["customer-special-days", organizationId],
    queryFn: () => fetchSpecialDayCustomers(organizationId),
    enabled: open && !!organizationId,
    staleTime: 5 * 60 * 1000,
    retry: (count, err) => !isMissingSpecialDayColumnError(err) && count < 2,
  });

  const rows = useMemo(() => upcomingSpecialDays(q.data ?? [], new Date(), range), [q.data, range]);
  const todayCount = useMemo(() => upcomingSpecialDays(q.data ?? [], new Date(), 0).length, [q.data]);
  const missingSql = q.isError && isMissingSpecialDayColumnError(q.error);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cake className="h-5 w-5 text-pink-500" />
            Birthdays & Anniversaries
            {todayCount > 0 && <Badge className="bg-pink-500 hover:bg-pink-500">{todayCount} today</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <Button
              key={r.days}
              size="sm"
              variant={range === r.days ? "default" : "outline"}
              className="h-8"
              onClick={() => setRange(r.days)}
            >
              {r.label}
            </Button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
          {q.isLoading && (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {missingSql && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              Birthday and anniversary are not set up on the database yet. Run the birthday SQL, then reopen this window.
            </p>
          )}
          {q.isError && !missingSql && (
            <p className="text-sm text-destructive">Could not load: {(q.error as Error)?.message}</p>
          )}
          {q.isSuccess && rows.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {(q.data?.length ?? 0) === 0
                ? "No customer has a birthday or anniversary saved yet. Add them in Edit Customer."
                : "No birthdays or anniversaries in this period."}
            </p>
          )}
          {rows.map((d) => {
            const key = `${d.customer.id}:${d.kind}`;
            const phone = normalizeBulkPhone(d.customer.phone);
            const message = drafts[key] ?? specialDayWishMessage(d.kind, d.customer.customer_name, shopName);
            return (
              <div key={key} className={cn("rounded-lg border p-3", d.daysAway === 0 && "border-pink-300 bg-pink-50/60 dark:bg-pink-950/20")}>
                <div className="flex items-center gap-3">
                  {d.kind === "birthday" ? (
                    <Cake className="h-5 w-5 shrink-0 text-pink-500" />
                  ) : (
                    <Heart className="h-5 w-5 shrink-0 text-rose-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.customer.customer_name || "Customer"}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.kind === "birthday" ? "Birthday" : "Anniversary"} · {whenLabel(d)}
                      {phone ? ` · ${formatBulkPhone(phone)}` : " · no mobile number"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => setEditing(editing === key ? null : key)}
                  >
                    {editing === key ? "Done" : "Edit message"}
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 bg-green-600 hover:bg-green-700"
                    disabled={!phone}
                    onClick={() => window.open(whatsappShareUrl(message, phone), "_blank", "noopener")}
                  >
                    <MessageCircle className="h-4 w-4 mr-1" /> Wish
                  </Button>
                </div>
                {editing === key && (
                  <Textarea
                    className="mt-2 min-h-[90px] text-sm"
                    value={message}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          To send many at once, use Bulk WhatsApp → Customer Master and pick "Birthday / anniversary today".
        </p>
      </DialogContent>
    </Dialog>
  );
}
