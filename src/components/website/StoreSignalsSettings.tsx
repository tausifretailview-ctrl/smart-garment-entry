import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { STALE_SETTINGS } from "@/lib/queryStaleTimes";
import { loadStorefrontSignalsEnabled, saveStorefrontSignalsEnabled } from "@/lib/storefrontThemeIo";

/**
 * Website → Theme: live shop signals on the Street store (best sellers this week, selling fast,
 * just arrived, complete the look). They come from the shop's own bills and purchases; the store
 * only ever receives which products, never quantities or amounts.
 */
export function StoreSignalsSettings({ orgId }: { orgId?: string }) {
  const queryClient = useQueryClient();
  const key = ["website_signals_enabled", orgId];
  const query = useQuery({
    queryKey: key,
    enabled: !!orgId,
    staleTime: STALE_SETTINGS,
    queryFn: () => loadStorefrontSignalsEnabled(orgId!),
  });
  const enabled = query.data !== false;

  const save = useMutation({
    mutationFn: async (next: boolean) => {
      await saveStorefrontSignalsEnabled(orgId!, next);
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData<boolean>(key, next);
      toast.success(
        next
          ? "Live shop signals are on. They appear on the store within 30 minutes."
          : "Live shop signals are off. Reload the store to see it.",
      );
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Could not save the setting"),
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
      <div className="max-w-2xl">
        <h3 className="text-sm font-semibold text-slate-900">Live shop signals (Street theme)</h3>
        <p className="text-sm text-muted-foreground">
          Uses your own bills and purchase bills to show “Best sellers this week”, “Selling fast”, “Just arrived” and
          “Complete the look” (products often billed together). The store shows only which products, never how many
          were sold or any amount. It refreshes about every 30 minutes.
        </p>
      </div>
      <Button
        variant={enabled ? "default" : "outline"}
        size="sm"
        className="h-9"
        disabled={!orgId || !query.isSuccess || save.isPending}
        onClick={() => save.mutate(!enabled)}
      >
        {save.isPending ? "Saving…" : enabled ? "Live signals are on — turn off" : "Live signals are off — turn on"}
      </Button>
    </div>
  );
}
