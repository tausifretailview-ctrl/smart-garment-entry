import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STALE_SETTINGS } from "@/lib/queryStaleTimes";
import { loadStorefrontTrialRoom, loadTrialRoomSetup, saveStorefrontTrialRoom } from "@/lib/storefrontThemeIo";
import {
  TRIAL_ROOM_MAX_DAILY_LIMIT,
  TRIAL_ROOM_VISITOR_HOURLY_LIMIT,
  clampTrialRoomDailyLimit,
  type StorefrontTrialRoom,
} from "@/lib/trialRoom";

/**
 * Website → Theme: AI Trial Room ("Try it on" on the store's product pages). Off until the shop
 * switches it on, because every try-on uses one AI image. The switch is offered only when the
 * database, the function and its AI key are in place, so the store never shows a dead button.
 */
export function StoreTrialRoomSettings({ orgId }: { orgId?: string }) {
  const queryClient = useQueryClient();
  const key = ["website_trial_room", orgId];
  const query = useQuery({
    queryKey: key,
    enabled: !!orgId,
    staleTime: STALE_SETTINGS,
    queryFn: () => loadStorefrontTrialRoom(orgId!),
  });
  const setup = useQuery({
    queryKey: ["website_trial_room_setup", orgId],
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: () => loadTrialRoomSetup(orgId!),
  });
  const saved = query.data;
  const [limit, setLimit] = useState("");
  useEffect(() => {
    if (saved) setLimit(String(saved.dailyLimit));
  }, [saved]);

  const save = useMutation({
    mutationFn: async (next: StorefrontTrialRoom) => {
      await saveStorefrontTrialRoom(orgId!, next);
      return next;
    },
    onSuccess: (next) => queryClient.setQueryData<StorefrontTrialRoom>(key, next),
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Could not save the trial room"),
  });

  const enabled = saved?.enabled === true;
  const ready = !!setup.data && setup.data.database && setup.data.deployed && setup.data.aiConfigured;
  const missing = setup.data
    ? [
        setup.data.database ? null : "run the trial-room SQL file",
        setup.data.deployed ? null : "deploy the storefront-try-on function",
        setup.data.deployed && !setup.data.aiConfigured ? "add the AI key to the function" : null,
      ].filter(Boolean)
    : [];

  return (
    <div className="space-y-3 border-t border-slate-200 pt-4" data-testid="trial-room-settings">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="text-sm font-semibold text-slate-900">AI Trial Room (all themes)</h3>
          <p className="text-sm text-muted-foreground">
            “Try it on” on product pages: the customer adds their own photo and sees an AI preview of themselves wearing
            the product. Their photo is used only for that preview and is not saved. Each try-on uses one AI image, so
            it stays off until you turn it on.
          </p>
        </div>
        <Button
          variant={enabled ? "default" : "outline"}
          size="sm"
          className="h-9"
          disabled={!orgId || !saved || save.isPending || (!enabled && !ready)}
          onClick={() =>
            saved &&
            save.mutate(
              { ...saved, enabled: !enabled },
              {
                onSuccess: (next) =>
                  toast.success(next.enabled ? "Trial room is on. Reload the store to see it." : "Trial room is off."),
              },
            )
          }
          data-testid="trial-room-switch"
        >
          {save.isPending ? "Saving…" : enabled ? "Trial room is on — turn off" : "Trial room is off — turn on"}
        </Button>
      </div>

      {setup.isLoading ? (
        <p className="text-sm text-muted-foreground">Checking the trial room setup…</p>
      ) : !ready ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="trial-room-not-ready">
          <p className="font-semibold">Not set up yet</p>
          <p>
            Before it can be turned on: {missing.length > 0 ? missing.join(", ") : "the setup could not be checked"}.
          </p>
          <Button variant="outline" size="sm" className="mt-2 h-8" onClick={() => void setup.refetch()} disabled={setup.isFetching}>
            {setup.isFetching ? "Checking…" : "Check again"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="trial-room-limit" className="text-xs">
              Try-ons allowed per day (whole shop)
            </Label>
            <Input
              id="trial-room-limit"
              type="number"
              inputMode="numeric"
              min={1}
              max={TRIAL_ROOM_MAX_DAILY_LIMIT}
              className="h-9 w-32"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={!saved || save.isPending || clampTrialRoomDailyLimit(limit) === saved.dailyLimit}
            onClick={() =>
              saved &&
              save.mutate(
                { ...saved, dailyLimit: clampTrialRoomDailyLimit(limit) },
                { onSuccess: (next) => toast.success(`Daily limit saved: ${next.dailyLimit} try-ons.`) },
              )
            }
          >
            Save limit
          </Button>
          <p className="text-sm text-muted-foreground" data-testid="trial-room-usage">
            Used in the last 24 hours: <strong>{setup.data?.usedToday ?? 0}</strong> of {saved?.dailyLimit ?? "—"}. One
            customer can try {TRIAL_ROOM_VISITOR_HOURLY_LIMIT} styles an hour.
          </p>
        </div>
      )}
    </div>
  );
}
