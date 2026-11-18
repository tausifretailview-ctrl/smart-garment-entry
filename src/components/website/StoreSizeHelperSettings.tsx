import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STALE_SETTINGS } from "@/lib/queryStaleTimes";
import { loadStorefrontSizeHelper, saveStorefrontSizeHelper } from "@/lib/storefrontThemeIo";
import {
  SIZE_CHART_IDS,
  SIZE_CHART_LABELS,
  SIZE_CHART_SIZES,
  STANDARD_SIZE_CHARTS,
  parseStorefrontSizeHelper,
  type SizeChartId,
  type StorefrontSizeHelper,
} from "@/lib/sizeHelper";

type Draft = Record<SizeChartId, Record<string, string>>;

function toDraft(helper: StorefrontSizeHelper): Draft {
  const draft = {} as Draft;
  for (const id of SIZE_CHART_IDS) {
    draft[id] = {};
    for (const size of SIZE_CHART_SIZES) draft[id][size] = String(helper.charts[id][size]);
  }
  return draft;
}

/**
 * Website → Theme: "Find my size" on the store's product pages. The shop can switch it off and
 * adjust the size chart (the body chest / waist in inches each letter size fits up to).
 */
export function StoreSizeHelperSettings({ orgId }: { orgId?: string }) {
  const queryClient = useQueryClient();
  const key = ["website_size_helper", orgId];
  const query = useQuery({
    queryKey: key,
    enabled: !!orgId,
    staleTime: STALE_SETTINGS,
    queryFn: () => loadStorefrontSizeHelper(orgId!),
  });
  const saved = query.data;
  const [chartOpen, setChartOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    if (saved) setDraft(toDraft(saved));
  }, [saved]);

  const save = useMutation({
    mutationFn: async (next: StorefrontSizeHelper) => {
      await saveStorefrontSizeHelper(orgId!, next);
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData<StorefrontSizeHelper>(key, next);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Could not save the size helper"),
  });

  const enabled = saved?.enabled !== false;

  const saveChart = () => {
    if (!saved || !draft) return;
    // Run the typed values through the same reader the store uses, so a bad number is dropped.
    const next = parseStorefrontSizeHelper({ storefront_size_helper: { enabled: saved.enabled, charts: draft } });
    for (const id of SIZE_CHART_IDS) {
      let last = 0;
      for (const size of SIZE_CHART_SIZES) {
        if (next.charts[id][size] <= last) {
          toast.error(`${SIZE_CHART_LABELS[id]}: ${size} must be bigger than the size before it.`);
          return;
        }
        last = next.charts[id][size];
      }
    }
    save.mutate(next, { onSuccess: () => toast.success("Size chart saved. Reload the store to see it.") });
  };

  return (
    <div className="space-y-3 border-t border-slate-200 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Size helper (Street theme)</h3>
          <p className="text-sm text-muted-foreground">
            “Find my size” on product pages: the customer enters height and weight and the store suggests a size from
            your size chart. It shows on products with letter sizes (S, M, L…) or chest / waist number sizes, not on
            free size, kids or footwear.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-9" disabled={!saved} onClick={() => setChartOpen((v) => !v)}>
            {chartOpen ? "Close size chart" : "Edit size chart"}
          </Button>
          <Button
            variant={enabled ? "default" : "outline"}
            size="sm"
            className="h-9"
            disabled={!orgId || !saved || save.isPending}
            onClick={() =>
              saved &&
              save.mutate(
                { ...saved, enabled: !enabled },
                {
                  onSuccess: (next) =>
                    toast.success(next.enabled ? "Size helper is on. Reload the store to see it." : "Size helper is off."),
                },
              )
            }
          >
            {save.isPending ? "Saving…" : enabled ? "Size helper is on — turn off" : "Size helper is off — turn on"}
          </Button>
        </div>
      </div>

      {chartOpen && draft ? (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <p className="text-sm text-muted-foreground">
            For each size, the biggest body measure in inches it fits (chest or bust for tops, waist for bottoms). Number
            sizes such as 40 or 32 are not listed: they are taken as the measure itself.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-1 pr-2 font-semibold">Size</th>
                  {SIZE_CHART_IDS.map((id) => (
                    <th key={id} className="px-1 py-1 font-semibold">
                      {SIZE_CHART_LABELS[id]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SIZE_CHART_SIZES.map((size) => (
                  <tr key={size}>
                    <th scope="row" className="py-1 pr-2 text-left font-semibold">
                      {size}
                    </th>
                    {SIZE_CHART_IDS.map((id) => (
                      <td key={id} className="px-1 py-1">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          min={20}
                          max={70}
                          className="h-8 w-24"
                          aria-label={`${SIZE_CHART_LABELS[id]}, ${size}, fits up to inches`}
                          value={draft[id][size]}
                          onChange={(e) => setDraft({ ...draft, [id]: { ...draft[id], [size]: e.target.value } })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={save.isPending} onClick={saveChart}>
              Save size chart
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={save.isPending}
              onClick={() => setDraft(toDraft({ enabled: true, charts: STANDARD_SIZE_CHARTS }))}
            >
              Fill standard sizes
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
