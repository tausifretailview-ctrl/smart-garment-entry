import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { STALE_SETTINGS } from "@/lib/queryStaleTimes";
import { loadStorefrontStripsAndCurrency, saveStorefrontStripsAndCurrency } from "@/lib/storefrontThemeIo";
import {
  CURRENCIES,
  DEFAULT_INR_RATES,
  STRIP_IDS,
  STRIP_LINES_MAX,
  parseStorefrontCurrency,
  stripLinesFromText,
  type StripId,
} from "@/lib/storefrontStrips";

const STRIP_COPY: Record<StripId, { title: string; hint: string; example: string }> = {
  top: {
    title: "Top black strip (terms)",
    hint: "Above the logo, one at a time with arrows. Example: your return or exchange rule.",
    example: "No exchange / no return / no cancellation\nPlease see the size guide before ordering",
  },
  after_banner: {
    title: "Running strip under the banner",
    hint: "Scrolls across the screen under the home banner.",
    example: "We do not take orders on WhatsApp · Order on the website only",
  },
  footer: {
    title: "Running strip above the footer (payment & delivery)",
    hint: "Scrolls across the screen at the bottom of every page.",
    example: "Pay by UPI or card\nDelivery in 5–7 working days\nOrder details are sent on WhatsApp",
  },
};

type RateCode = keyof typeof DEFAULT_INR_RATES;
const RATE_CODES = Object.keys(DEFAULT_INR_RATES) as RateCode[];

/**
 * Website → Theme: the three notice strips (one notice per line) and the bottom-left currency
 * picker with the shop's own rates.
 */
export function StoreStripsSettings({ orgId }: { orgId?: string }) {
  const queryClient = useQueryClient();
  const key = ["website_strips_currency", orgId];
  const query = useQuery({
    queryKey: key,
    enabled: !!orgId,
    staleTime: STALE_SETTINGS,
    queryFn: () => loadStorefrontStripsAndCurrency(orgId!),
  });

  const [texts, setTexts] = useState<Record<StripId, string>>({ top: "", after_banner: "", footer: "" });
  const [currencyOn, setCurrencyOn] = useState(true);
  const [rates, setRates] = useState<Record<RateCode, string>>(
    Object.fromEntries(RATE_CODES.map((c) => [c, String(DEFAULT_INR_RATES[c])])) as Record<RateCode, string>,
  );
  useEffect(() => {
    if (!query.data) return;
    setTexts({
      top: (query.data.strips.top ?? []).join("\n"),
      after_banner: (query.data.strips.after_banner ?? []).join("\n"),
      footer: (query.data.strips.footer ?? []).join("\n"),
    });
    setCurrencyOn(query.data.currency.enabled);
    setRates(Object.fromEntries(RATE_CODES.map((c) => [c, String(query.data!.currency.rates[c])])) as Record<RateCode, string>);
  }, [query.data]);

  const save = useMutation({
    mutationFn: async () => {
      const strips = Object.fromEntries(STRIP_IDS.map((id) => [id, stripLinesFromText(texts[id])])) as Record<StripId, string[]>;
      // Same reader as the store, so an empty or bad rate falls back to the starting rate.
      const currency = parseStorefrontCurrency({ storefront_currency: { enabled: currencyOn, rates } });
      await saveStorefrontStripsAndCurrency(orgId!, strips, currency);
      return { strips, currency };
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
      toast.success("Notices and currency saved. Reload the store to see them.");
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Could not save"),
  });

  const neverSaved = query.data != null && STRIP_IDS.every((id) => query.data!.strips[id] === null);

  return (
    <div className="space-y-4 border-t border-slate-200 pt-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Notices & currency (Street theme)</h3>
        <p className="text-sm text-muted-foreground">
          One notice per line, up to {STRIP_LINES_MAX} per strip. Leave a strip empty to hide it.
          {neverSaved ? " Until you save, the store shows general lines such as “Order online · pay by UPI”." : ""}
        </p>
      </div>

      {STRIP_IDS.map((id) => (
        <div key={id} className="space-y-1">
          <label className="text-sm font-medium text-slate-900" htmlFor={`strip-${id}`}>
            {STRIP_COPY[id].title}
          </label>
          <p className="text-xs text-muted-foreground">{STRIP_COPY[id].hint}</p>
          <Textarea
            id={`strip-${id}`}
            rows={3}
            className="no-uppercase"
            placeholder={STRIP_COPY[id].example}
            value={texts[id]}
            onChange={(e) => setTexts({ ...texts, [id]: e.target.value })}
          />
        </div>
      ))}

      <div className="space-y-2 rounded-lg border border-slate-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-slate-900">Currency picker (bottom left)</p>
            <p className="text-xs text-muted-foreground">
              Shows prices in another currency as an estimate, using the rates below (rupees for 1 unit). The bag and
              payment stay in rupees. Update the rates from time to time.
            </p>
          </div>
          <Button type="button" size="sm" variant={currencyOn ? "default" : "outline"} onClick={() => setCurrencyOn(!currencyOn)}>
            {currencyOn ? "Currency picker: on" : "Currency picker: off"}
          </Button>
        </div>
        {currencyOn ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {RATE_CODES.map((code) => {
              const info = CURRENCIES.find((c) => c.code === code)!;
              return (
                <label key={code} className="flex items-center gap-2 text-sm">
                  <span className="w-20 shrink-0">
                    {info.flag} 1 {code} =
                  </span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    step="0.01"
                    className="h-8"
                    aria-label={`Rupees for 1 ${code}`}
                    value={rates[code]}
                    onChange={(e) => setRates({ ...rates, [code]: e.target.value })}
                  />
                  <span className="text-muted-foreground">₹</span>
                </label>
              );
            })}
          </div>
        ) : null}
      </div>

      <Button type="button" size="sm" disabled={!orgId || !query.isSuccess || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : "Save notices & currency"}
      </Button>
    </div>
  );
}
