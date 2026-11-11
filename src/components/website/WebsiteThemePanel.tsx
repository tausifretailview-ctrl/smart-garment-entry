import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { INSIGHTS_TAB_SHELL, InsightsPanel } from "@/components/business-insights/insightsLayout";
import { STALE_SETTINGS } from "@/lib/queryStaleTimes";
import { loadStorefrontTheme, saveStorefrontTheme } from "@/lib/storefrontThemeIo";
import {
  STOREFRONT_THEMES,
  resolveStorefrontTheme,
  type StorefrontThemeId,
} from "@/lib/storefrontThemes";
import { cn } from "@/lib/utils";

/** Small drawn sketch of each theme's home page, so the choice is visible before saving. */
function ThemeSketch({ id }: { id: StorefrontThemeId }) {
  if (id === "street") {
    return (
      <div className="h-28 w-full overflow-hidden rounded border border-slate-200 bg-white" aria-hidden="true">
        <div className="h-2 bg-black" />
        <div className="flex h-4 items-center justify-between border-b border-slate-200 px-2">
          <span className="h-1 w-5 bg-slate-300" />
          <span className="h-1.5 w-10 bg-black" />
          <span className="h-1 w-5 bg-slate-300" />
        </div>
        <div className="h-9 bg-slate-800" />
        <div className="grid grid-cols-4 gap-1 p-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-6 bg-slate-200" />
              <div className="mt-0.5 h-1 w-4/5 bg-black" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (id === "ella-noor") {
    return (
      <div className="h-28 w-full overflow-hidden rounded border border-slate-200 bg-white" aria-hidden="true">
        <div className="h-1.5 bg-[#12100e]" />
        <div className="flex h-4 items-center gap-2 border-b border-[#c9a227]/40 px-2">
          <span className="h-1.5 w-8 bg-[#12100e]" />
          <span className="ml-auto h-1 w-10 bg-slate-300" />
        </div>
        <div className="flex h-11 items-end bg-[#3a2f25] p-1.5">
          <span className="h-1.5 w-12 bg-[#c9a227]" />
        </div>
        <div className="grid grid-cols-3 gap-1 p-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-7 bg-[#f5f3ef]" />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="h-28 w-full overflow-hidden rounded border border-slate-200 bg-slate-50" aria-hidden="true">
      <div className="flex h-5 items-center gap-2 bg-white px-2">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        <span className="h-1.5 w-10 bg-slate-400" />
      </div>
      <div className="grid grid-cols-3 gap-1.5 p-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-md bg-white p-1 shadow-sm">
            <div className="h-5 rounded bg-slate-200" />
            <div className="mt-1 h-1 w-3/4 bg-slate-300" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function WebsiteThemePanel({
  orgId,
  orgSlug,
  storeUrl,
}: {
  orgId?: string;
  orgSlug: string;
  storeUrl: string;
}) {
  const queryClient = useQueryClient();
  const themeQuery = useQuery({
    queryKey: ["website_theme", orgId],
    enabled: !!orgId,
    staleTime: STALE_SETTINGS,
    queryFn: () => loadStorefrontTheme(orgId!),
  });

  const live = resolveStorefrontTheme(themeQuery.data, orgSlug);
  const [choice, setChoice] = useState<StorefrontThemeId>(live);
  useEffect(() => {
    if (themeQuery.isSuccess) setChoice(live);
  }, [themeQuery.isSuccess, live]);

  const save = useMutation({
    mutationFn: () => saveStorefrontTheme(orgId!, choice),
    onSuccess: () => {
      queryClient.setQueryData(["website_theme", orgId], choice);
      toast.success("Store theme saved. Reload the store to see it.");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not save the theme");
    },
  });

  const chosen = STOREFRONT_THEMES.find((t) => t.id === choice) ?? STOREFRONT_THEMES[0];
  const dirty = choice !== live;

  return (
    <div className={INSIGHTS_TAB_SHELL}>
      <InsightsPanel
        title="Store theme"
        subtitle="How your public store looks to customers. Products, sections, menus and prices stay the same."
        className="flex-1 min-h-0"
      >
        <div className="space-y-4 overflow-y-auto p-4">
          {themeQuery.isError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Could not read the saved theme. Showing the default for this store.
            </p>
          ) : null}

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="website-theme-select">Theme</Label>
              <select
                id="website-theme-select"
                value={choice}
                disabled={!orgId || themeQuery.isLoading}
                onChange={(e) => setChoice(e.target.value as StorefrontThemeId)}
                className="h-9 min-w-[14rem] rounded-md border border-slate-200 bg-white px-2 text-sm"
              >
                {STOREFRONT_THEMES.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.label}
                    {theme.id === live ? " (in use)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <Button
              size="sm"
              className="h-9"
              disabled={!orgId || !dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save theme"}
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9">
              <a href={storeUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1 h-4 w-4" />
                View store
              </a>
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            {chosen.tagline}
            {chosen.note ? <span className="block text-amber-700">{chosen.note}</span> : null}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {STOREFRONT_THEMES.map((theme) => {
              const selected = theme.id === choice;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setChoice(theme.id)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-lg border bg-white p-3 text-left transition-colors",
                    selected ? "border-teal-600 ring-2 ring-teal-600/20" : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <ThemeSketch id={theme.id} />
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{theme.label}</span>
                    {theme.id === live ? (
                      <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[11px] font-semibold text-teal-700">
                        In use
                      </span>
                    ) : null}
                    {selected ? <Check className="ml-auto h-4 w-4 text-teal-600" /> : null}
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                    {theme.features.map((feature) => (
                      <li key={feature}>· {feature}</li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </div>
      </InsightsPanel>
    </div>
  );
}
