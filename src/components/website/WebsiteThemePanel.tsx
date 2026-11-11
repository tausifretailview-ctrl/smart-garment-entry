import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, ExternalLink, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { INSIGHTS_TAB_SHELL, InsightsPanel } from "@/components/business-insights/insightsLayout";
import { STALE_SETTINGS } from "@/lib/queryStaleTimes";
import { Input } from "@/components/ui/input";
import {
  loadStorefrontLook,
  saveStorefrontBanners,
  saveStorefrontTheme,
  uploadStorefrontBannerImage,
  type StorefrontLook,
} from "@/lib/storefrontThemeIo";
import {
  STOREFRONT_BANNERS_MAX,
  moveStorefrontBanner,
  type StorefrontBanner,
} from "@/lib/storefrontBanners";
import { useWebsiteSections } from "@/hooks/useWebsiteSections";
import { activeWebsiteSections } from "@/lib/websiteSections";
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
    queryFn: () => loadStorefrontLook(orgId!),
  });

  const live = resolveStorefrontTheme(themeQuery.data?.theme, orgSlug);
  const [choice, setChoice] = useState<StorefrontThemeId>(live);
  useEffect(() => {
    if (themeQuery.isSuccess) setChoice(live);
  }, [themeQuery.isSuccess, live]);

  const save = useMutation({
    mutationFn: () => saveStorefrontTheme(orgId!, choice),
    onSuccess: () => {
      queryClient.setQueryData<StorefrontLook>(["website_theme", orgId], (prev) => ({
        banners: prev?.banners ?? [],
        theme: choice,
      }));
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

          <StoreBanners
            orgId={orgId}
            saved={themeQuery.data?.banners}
            ready={themeQuery.isSuccess}
            onSaved={(banners) =>
              queryClient.setQueryData<StorefrontLook>(["website_theme", orgId], (prev) => ({
                theme: prev?.theme ?? null,
                banners,
              }))
            }
          />
        </div>
      </InsightsPanel>
    </div>
  );
}

/** Home-page banner images for the Street theme. Until any are added it shows sample banners. */
function StoreBanners({
  orgId,
  saved,
  ready,
  onSaved,
}: {
  orgId?: string;
  saved?: StorefrontBanner[];
  ready: boolean;
  onSaved: (banners: StorefrontBanner[]) => void;
}) {
  const sectionsQuery = useWebsiteSections(orgId);
  const sections = activeWebsiteSections(sectionsQuery.data?.sections ?? []);
  const [banners, setBanners] = useState<StorefrontBanner[]>([]);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (ready && !dirty) setBanners(saved ?? []);
  }, [ready, saved, dirty]);

  const change = (next: StorefrontBanner[]) => {
    setBanners(next);
    setDirty(true);
  };
  const patch = (id: string, values: Partial<StorefrontBanner>) =>
    change(banners.map((b) => (b.id === id ? { ...b, ...values } : b)));

  const save = useMutation({
    mutationFn: () => saveStorefrontBanners(orgId!, banners),
    onSuccess: () => {
      setDirty(false);
      onSaved(banners);
      toast.success("Banners saved. Reload the store to see them.");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not save the banners");
    },
  });

  const onFiles = async (files: FileList | null) => {
    if (!orgId || !files || files.length === 0) return;
    const room = STOREFRONT_BANNERS_MAX - banners.length;
    const picked = Array.from(files).slice(0, room);
    setUploading(true);
    try {
      const added: StorefrontBanner[] = [];
      for (const file of picked) {
        const image_url = await uploadStorefrontBannerImage(orgId, file);
        added.push({
          id: `banner-${Date.now()}-${added.length}`,
          image_url,
          heading: "",
          subheading: "",
          target: "",
        });
      }
      change([...banners, ...added]);
      toast.success(`${added.length} image${added.length === 1 ? "" : "s"} uploaded. Press Save banners to publish.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const full = banners.length >= STOREFRONT_BANNERS_MAX;

  return (
    <div className="space-y-3 border-t border-slate-200 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Home page banners (Street theme)</h3>
          <p className="text-sm text-muted-foreground">
            Until you add your own, the store shows sample banners made from your products. Use wide images, about
            1920 × 800. Phones show the whole image, smaller.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void onFiles(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={!orgId || !ready || uploading || full}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="mr-1 h-4 w-4" />
            {uploading ? "Uploading…" : full ? `Maximum ${STOREFRONT_BANNERS_MAX}` : "Add banner image"}
          </Button>
          <Button size="sm" className="h-9" disabled={!orgId || !dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save banners"}
          </Button>
        </div>
      </div>

      {banners.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-600">
          No banner images yet. The store is showing the sample banners.
        </p>
      ) : (
        <ul className="space-y-2">
          {banners.map((banner, index) => (
            <li key={banner.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-2">
              <img
                src={banner.image_url}
                alt=""
                className="h-16 w-36 shrink-0 rounded border border-slate-200 object-cover"
              />
              <div className="grid min-w-[16rem] flex-1 gap-2 sm:grid-cols-3">
                <Input
                  value={banner.heading}
                  maxLength={60}
                  placeholder="Heading (optional)"
                  aria-label={`Banner ${index + 1} heading`}
                  onChange={(e) => patch(banner.id, { heading: e.target.value })}
                />
                <Input
                  value={banner.subheading}
                  maxLength={120}
                  placeholder="Small line (optional)"
                  aria-label={`Banner ${index + 1} small line`}
                  onChange={(e) => patch(banner.id, { subheading: e.target.value })}
                />
                <select
                  value={banner.target}
                  aria-label={`Banner ${index + 1} opens`}
                  onChange={(e) => patch(banner.id, { target: e.target.value })}
                  className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm"
                >
                  <option value="">Opens: all products</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.slug}>
                      Opens: {section.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => change(moveStorefrontBanner(banners, index, -1))}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  aria-label="Move down"
                  disabled={index === banners.length - 1}
                  onClick={() => change(moveStorefrontBanner(banners, index, 1))}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive"
                  aria-label="Remove banner"
                  onClick={() => change(banners.filter((b) => b.id !== banner.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
