import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  GripVertical,
  ImagePlus,
  Loader2,
  MessageCircle,
  Phone,
  Search,
  Store,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { DndContext, type DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  INSIGHTS_BODY_CELL,
  INSIGHTS_BODY_CELL_NUM,
  INSIGHTS_BODY_ROW,
  INSIGHTS_SUB_TAB_LIST,
  INSIGHTS_SUB_TAB_TRIGGER,
  INSIGHTS_TAB_SHELL,
  InsightsPanel,
  InsightsStaticTh,
  InsightsTableHeader,
} from "@/components/business-insights/insightsLayout";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { compressImageFile } from "@/lib/compressImage";
import { STALE_FREQUENT, STALE_LIVE, STALE_REFERENCE, STALE_SETTINGS } from "@/lib/queryStaleTimes";
import {
  normalizeInstagramUrl,
  publicStorefrontUrl,
  storefrontWhatsAppShareText,
  whatsappShareUrl,
} from "@/lib/storefrontShare";
import { classifyStorefrontStock, formatStorefrontPrice, aggregateWebsiteVariantStock } from "@/lib/storefrontStock";
import { aggregateVariantRows } from "@/lib/storefrontVariantSummary";
import { coerceToArray, lookupMap } from "@/lib/coerceToMap";
import { websiteFrom } from "@/lib/websiteDb";
import { WebsiteMenusPanel } from "@/components/website/WebsiteMenusPanel";
import { cn } from "@/lib/utils";
import type { WebsiteEnquiry, WebsiteEnquiryStatus, WebsiteProduct, WebsiteSettings } from "@/lib/websiteTypes";

type CatalogProduct = {
  id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  default_sale_price: number | null;
};

type VariantRow = {
  product_id: string;
  sale_price: number | null;
  stock_qty: number;
  size?: string | null;
  color?: string | null;
};

type WebsiteTabId = "catalogue" | "add" | "menus" | "profile" | "enquiries";

const ENQUIRY_STATUSES: WebsiteEnquiryStatus[] = ["new", "contacted", "converted", "closed"];

const WEBSITE_TAB_TRIGGER = cn(
  "h-9 px-4 text-sm font-semibold rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm",
  "data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:border-slate-700",
);

export default function WebsiteSettingsPage() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const orgId = currentOrganization?.id;
  const orgSlug = currentOrganization?.slug || "";
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<WebsiteTabId>("catalogue");
  const [visitedTabs, setVisitedTabs] = useState<Set<WebsiteTabId>>(() => new Set(["catalogue"]));

  const handleTabChange = useCallback((tab: string) => {
    const id = tab as WebsiteTabId;
    setSelectedTab(id);
    setVisitedTabs((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
  }, []);

  const shouldMountTab = useCallback((tab: WebsiteTabId) => visitedTabs.has(tab), [visitedTabs]);

  const settingsQuery = useQuery({
    queryKey: ["website_settings", orgId],
    enabled: !!orgId,
    staleTime: STALE_SETTINGS,
    queryFn: async () => {
      const { data, error } = await websiteFrom("website_settings")
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as WebsiteSettings | null;
    },
  });

  const listingsQuery = useQuery({
    queryKey: ["website_products", orgId],
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
    queryFn: async () => {
      const { data, error } = await websiteFrom("website_products")
        .select("*")
        .eq("organization_id", orgId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as WebsiteProduct[];
    },
  });

  const listings = coerceToArray<WebsiteProduct>(listingsQuery.data);
  const storeUrl = publicStorefrontUrl(window.location.origin, orgSlug);
  const listingsError = listingsQuery.error instanceof Error ? listingsQuery.error.message : "";

  return (
    <div className="website-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-sm shrink-0"
              onClick={() => orgNavigate("/settings")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Settings
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <Store className="h-5 w-5 shrink-0" />
                Website
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Catalogue · Add products · Menus · Store profile · Enquiries
              </p>
            </div>
          </div>
          <ShareButtons
            storeUrl={storeUrl}
            shopName={currentOrganization?.name || "our shop"}
            whatsapp={settingsQuery.data?.whatsapp_number}
          />
        </div>

        {listingsError ? (
          <p className="shrink-0 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Could not load the catalogue. {listingsError}
          </p>
        ) : null}

        <Tabs
          value={selectedTab}
          onValueChange={handleTabChange}
          className="flex flex-col flex-1 min-h-0 gap-2"
        >
          <TabsList className="no-print flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 shrink-0">
            <TabsTrigger value="catalogue" className={WEBSITE_TAB_TRIGGER}>
              Catalogue
            </TabsTrigger>
            <TabsTrigger value="add" className={WEBSITE_TAB_TRIGGER}>
              Add products
            </TabsTrigger>
            <TabsTrigger value="menus" className={WEBSITE_TAB_TRIGGER}>
              Menus
            </TabsTrigger>
            <TabsTrigger value="profile" className={WEBSITE_TAB_TRIGGER}>
              Store profile
            </TabsTrigger>
            <TabsTrigger value="enquiries" className={WEBSITE_TAB_TRIGGER}>
              Enquiries
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="catalogue"
            className="flex-1 min-h-0 flex flex-col mt-0 data-[state=inactive]:hidden"
          >
            {shouldMountTab("catalogue") ? (
              <PublishedCatalogue
                orgId={orgId}
                listings={listings}
                loading={listingsQuery.isLoading}
                onChanged={() => queryClient.invalidateQueries({ queryKey: ["website_products", orgId] })}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="add" className="flex-1 min-h-0 flex flex-col mt-0 data-[state=inactive]:hidden">
            {shouldMountTab("add") ? (
              <AddProducts
                orgId={orgId}
                listings={listings}
                onChanged={() => queryClient.invalidateQueries({ queryKey: ["website_products", orgId] })}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="menus" className="flex-1 min-h-0 flex flex-col mt-0 data-[state=inactive]:hidden">
            {shouldMountTab("menus") ? <WebsiteMenusPanel orgId={orgId} /> : null}
          </TabsContent>

          <TabsContent value="profile" className="flex-1 min-h-0 flex flex-col mt-0 data-[state=inactive]:hidden">
            {shouldMountTab("profile") ? (
              <StoreProfile
                orgId={orgId}
                orgSlug={orgSlug}
                settings={settingsQuery.data || null}
                onChanged={() => {
                  queryClient.invalidateQueries({ queryKey: ["website_settings", orgId] });
                  queryClient.invalidateQueries({ queryKey: ["website_profile_bill_settings", orgId] });
                }}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="enquiries" className="flex-1 min-h-0 flex flex-col mt-0 data-[state=inactive]:hidden">
            {shouldMountTab("enquiries") ? <EnquiryInbox orgId={orgId} /> : null}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ShareButtons({
  storeUrl,
  shopName,
  whatsapp,
}: {
  storeUrl: string;
  shopName: string;
  whatsapp?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!storeUrl) return;
    await navigator.clipboard.writeText(storeUrl);
    setCopied(true);
    toast.success("Store link copied");
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex flex-wrap gap-2 shrink-0">
      <Button type="button" variant="outline" size="sm" className="h-9 text-sm" onClick={copy} disabled={!storeUrl}>
        {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
        Copy link
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-9 text-sm" asChild disabled={!storeUrl}>
        <a href={storeUrl} target="_blank" rel="noreferrer">
          <ExternalLink className="mr-1.5 h-4 w-4" />
          View store
        </a>
      </Button>
      <Button type="button" size="sm" className="h-9 text-sm" asChild disabled={!storeUrl}>
        <a
          href={whatsappShareUrl(storefrontWhatsAppShareText(shopName, storeUrl), whatsapp)}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle className="mr-1.5 h-4 w-4" />
          WhatsApp share
        </a>
      </Button>
    </div>
  );
}

function StoreProfile({
  orgId,
  orgSlug,
  settings,
  onChanged,
}: {
  orgId?: string;
  orgSlug: string;
  settings: WebsiteSettings | null;
  onChanged: () => void;
}) {
  const [whatsapp, setWhatsapp] = useState(settings?.whatsapp_number || "");
  const [instagram, setInstagram] = useState(settings?.instagram_url || "");
  const [facebook, setFacebook] = useState(settings?.facebook_url || "");
  const [upiId, setUpiId] = useState("");
  const [accent, setAccent] = useState(settings?.theme_accent_color || "#2563EB");
  const [published, setPublished] = useState(!!settings?.is_published);

  const billQuery = useQuery({
    queryKey: ["website_profile_bill_settings", orgId],
    enabled: !!orgId,
    staleTime: STALE_SETTINGS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("bill_barcode_settings")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return (data?.bill_barcode_settings || {}) as {
        upi_id?: string | null;
        instagram_link?: string | null;
      };
    },
  });

  useEffect(() => {
    setWhatsapp(settings?.whatsapp_number || "");
    setInstagram(settings?.instagram_url || billQuery.data?.instagram_link || "");
    setFacebook(settings?.facebook_url || "");
    setUpiId(billQuery.data?.upi_id || "");
    setAccent(settings?.theme_accent_color || "#2563EB");
    setPublished(!!settings?.is_published);
  }, [settings, billQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId || !orgSlug) throw new Error("No organization");
      const instagramUrl = normalizeInstagramUrl(instagram);
      const payload = {
        organization_id: orgId,
        slug: orgSlug,
        whatsapp_number: whatsapp.trim() || null,
        instagram_url: instagramUrl,
        facebook_url: facebook.trim() || null,
        theme_accent_color: accent || null,
        is_published: published,
      };
      const { error } = await websiteFrom("website_settings").upsert(payload, {
        onConflict: "organization_id",
      });
      if (error) throw error;

      const { data: existing, error: readErr } = await supabase
        .from("settings")
        .select("bill_barcode_settings")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (readErr) throw readErr;
      const prev = (existing?.bill_barcode_settings || {}) as Record<string, unknown>;
      const { error: billErr } = await supabase
        .from("settings")
        .update({
          bill_barcode_settings: {
            ...prev,
            upi_id: upiId.trim() || null,
            instagram_link: instagramUrl || prev.instagram_link || null,
          },
        })
        .eq("organization_id", orgId);
      if (billErr) throw billErr;
    },
    onSuccess: () => {
      toast.success("Store profile saved");
      onChanged();
    },
    onError: (err: Error) => toast.error(err.message || "Could not save"),
  });

  return (
    <div className={INSIGHTS_TAB_SHELL}>
      <InsightsPanel title="Store profile" subtitle="Public store link, contact details, and theme">
        <div className="max-w-xl space-y-4 p-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 p-4">
            <div>
              <div className="text-sm font-bold text-slate-800">Publish store</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                When on, anyone with the link can browse published products.
              </p>
            </div>
            <Switch checked={published} onCheckedChange={setPublished} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              WhatsApp number
            </Label>
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="9198XXXXXXXX"
              className="h-9 text-sm border-slate-200 bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              UPI ID (store booking)
            </Label>
            <Input
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="studio@okaxis"
              className="h-9 text-sm border-slate-200 bg-white"
            />
            <p className="text-xs text-muted-foreground">
              Shown on the public store when a customer books or pays. Same UPI as invoice settings.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Instagram URL
            </Label>
            <Input
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="https://instagram.com/..."
              className="h-9 text-sm border-slate-200 bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Facebook URL
            </Label>
            <Input
              value={facebook}
              onChange={(e) => setFacebook(e.target.value)}
              placeholder="https://facebook.com/..."
              className="h-9 text-sm border-slate-200 bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Accent color
            </Label>
            <div className="flex items-center gap-3">
              <Input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-9 w-16 p-1 border-slate-200"
              />
              <Input
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-9 font-mono text-sm border-slate-200 bg-white"
              />
            </div>
          </div>
          <Button type="button" className="h-9 text-sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save profile
          </Button>
        </div>
      </InsightsPanel>
    </div>
  );
}

function AddProducts({
  orgId,
  listings,
  onChanged,
}: {
  orgId?: string;
  listings: WebsiteProduct[];
  onChanged: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [websitePrices, setWebsitePrices] = useState<Record<string, string>>({});
  const publishedIds = useMemo(() => new Set(listings.map((l) => l.product_id)), [listings]);

  const productsQuery = useQuery({
    queryKey: ["website_product_picker", orgId, search],
    enabled: !!orgId,
    staleTime: STALE_LIVE,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, product_name, brand, category, image_url, default_sale_price")
        .eq("organization_id", orgId!)
        .is("deleted_at", null)
        .order("product_name")
        .limit(80);
      const term = search.trim();
      if (term) q = q.ilike("product_name", `%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as CatalogProduct[];
    },
  });

  const rows = coerceToArray<CatalogProduct>(productsQuery.data).filter((p) => !publishedIds.has(p.id));
  const rowIds = rows.map((p) => p.id).join(",");

  const variantsQuery = useQuery({
    queryKey: ["website_picker_variants", orgId, rowIds],
    enabled: !!orgId && rows.length > 0,
    staleTime: STALE_LIVE,
    queryFn: async () => {
      const ids = rows.map((p) => p.id);
      const { data, error } = await supabase
        .from("product_variants")
        .select("product_id, size, color")
        .eq("organization_id", orgId!)
        .in("product_id", ids)
        .is("deleted_at", null);
      if (error) throw error;
      return aggregateVariantRows((data || []) as { product_id: string; size?: string | null; color?: string | null }[]);
    },
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization");
      const ids = [...selected].filter((id) => !publishedIds.has(id));
      if (ids.length === 0) throw new Error("Select products that are not already published");
      const maxOrder = listings.reduce((m, l) => Math.max(m, l.display_order || 0), 0);
      const productById = Object.fromEntries(rows.map((p) => [p.id, p]));
      const rowsToInsert = ids.map((product_id, i) => {
        const product = productById[product_id];
        const rawPrice = websitePrices[product_id];
        const parsed = rawPrice != null && rawPrice.trim() !== "" ? Number(rawPrice) : NaN;
        const display_price =
          Number.isFinite(parsed) && parsed >= 0
            ? parsed
            : product?.default_sale_price ?? null;
        return {
          organization_id: orgId,
          product_id,
          variant_id: null,
          display_price,
          display_order: maxOrder + i + 1,
          is_active: true,
        };
      });
      const { error } = await websiteFrom("website_products").insert(rowsToInsert);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Products added to the store");
      setSelected(new Set());
      setWebsitePrices({});
      onChanged();
    },
    onError: (err: Error) => toast.error(err.message || "Could not publish"),
  });

  const defaultWebsitePrice = (p: CatalogProduct) => {
    if (websitePrices[p.id] != null) return websitePrices[p.id];
    return p.default_sale_price != null ? String(p.default_sale_price) : "";
  };

  return (
    <div className={INSIGHTS_TAB_SHELL}>
      <InsightsPanel
        title="Add products to store"
        subtitle="Search ERP products, set a website price if needed, and publish to the public catalogue"
        className="flex-1 min-h-0"
        toolbar={
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="h-9 w-56 pl-8 text-sm border-slate-200 bg-white"
              />
            </div>
            <Button
              type="button"
              className="h-9 text-sm"
              onClick={() => publish.mutate()}
              disabled={selected.size === 0 || publish.isPending}
            >
              Publish selected ({selected.size})
            </Button>
          </div>
        }
        footer={
          <span className="text-xs text-muted-foreground">
            {rows.length} unpublished product{rows.length === 1 ? "" : "s"} shown
          </span>
        }
      >
        <Table className="w-full min-w-max">
          <InsightsTableHeader>
            <InsightsStaticTh label="" className="w-10" />
            <InsightsStaticTh label="Product" />
            <InsightsStaticTh label="Category" />
            <InsightsStaticTh label="Brand" />
            <InsightsStaticTh label="Size" />
            <InsightsStaticTh label="Colour" />
            <InsightsStaticTh label="ERP price" className="text-right" />
            <InsightsStaticTh label="Website price" className="text-right w-28" />
          </InsightsTableHeader>
          <TableBody>
            {rows.map((p) => {
              const variantMeta = lookupMap<{ sizesLabel: string; colorsLabel: string }>(
                variantsQuery.data,
                p.id,
              );
              return (
              <TableRow key={p.id} className={INSIGHTS_BODY_ROW}>
                <TableCell className={INSIGHTS_BODY_CELL}>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={selected.has(p.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      setSelected(next);
                    }}
                  />
                </TableCell>
                <TableCell className={cn(INSIGHTS_BODY_CELL, "font-semibold text-slate-900")}>
                  {p.product_name}
                </TableCell>
                <TableCell className={cn(INSIGHTS_BODY_CELL, "text-slate-600")}>{p.category || "—"}</TableCell>
                <TableCell className={cn(INSIGHTS_BODY_CELL, "text-slate-600")}>{p.brand || "—"}</TableCell>
                <TableCell className={cn(INSIGHTS_BODY_CELL, "text-slate-600 text-xs")}>
                  {variantMeta?.sizesLabel ?? "—"}
                </TableCell>
                <TableCell className={cn(INSIGHTS_BODY_CELL, "text-slate-600 text-xs")}>
                  {variantMeta?.colorsLabel ?? "—"}
                </TableCell>
                <TableCell className={INSIGHTS_BODY_CELL_NUM}>
                  {formatStorefrontPrice(p.default_sale_price) || "—"}
                </TableCell>
                <TableCell className={INSIGHTS_BODY_CELL_NUM}>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={defaultWebsitePrice(p)}
                    onChange={(e) =>
                      setWebsitePrices((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    className="h-8 w-24 ml-auto text-right text-sm font-mono border-slate-200 bg-white"
                    placeholder="Same as ERP"
                  />
                </TableCell>
              </TableRow>
            );
            })}
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {productsQuery.isLoading ? "Loading…" : "No unpublished products match."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </InsightsPanel>
    </div>
  );
}

function PublishedCatalogue({
  orgId,
  listings,
  loading,
  onChanged,
}: {
  orgId?: string;
  listings: WebsiteProduct[];
  loading: boolean;
  onChanged: () => void;
}) {
  const productIds = listings.map((l) => l.product_id);
  const productsQuery = useQuery({
    queryKey: ["website_published_products", orgId, productIds.join(",")],
    enabled: !!orgId && productIds.length > 0,
    staleTime: STALE_REFERENCE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, product_name, brand, category, image_url, default_sale_price")
        .eq("organization_id", orgId!)
        .in("id", productIds);
      if (error) throw error;
      return Object.fromEntries(((data || []) as CatalogProduct[]).map((p) => [p.id, p]));
    },
  });

  const variantsQuery = useQuery({
    queryKey: ["website_published_variants", orgId, productIds.join(",")],
    enabled: !!orgId && productIds.length > 0,
    staleTime: STALE_FREQUENT,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("product_id, sale_price, stock_qty, size, color")
        .eq("organization_id", orgId!)
        .in("product_id", productIds)
        .is("deleted_at", null);
      if (error) throw error;
      const rows = (data || []) as VariantRow[];
      return {
        stock: aggregateWebsiteVariantStock(rows),
        variants: aggregateVariantRows(rows),
      };
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [order, setOrder] = useState(listings.map((l) => l.id));
  const listingById = useMemo(() => Object.fromEntries(listings.map((l) => [l.id, l])), [listings]);

  useEffect(() => {
    setOrder(listings.map((l) => l.id));
  }, [listings]);

  const persistOrder = async (ids: string[]) => {
    await Promise.all(
      ids.map((id, index) =>
        websiteFrom("website_products").update({ display_order: index }).eq("id", id).eq("organization_id", orgId!),
      ),
    );
    onChanged();
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    try {
      await persistOrder(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reorder");
    }
  };

  if (loading) {
    return (
      <div className={INSIGHTS_TAB_SHELL}>
        <InsightsPanel title="Published catalogue" className="flex-1 min-h-0">
          <p className="p-4 text-sm text-muted-foreground">Loading catalogue…</p>
        </InsightsPanel>
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className={INSIGHTS_TAB_SHELL}>
        <InsightsPanel title="Published catalogue" className="flex-1 min-h-0">
          <p className="p-4 text-sm text-muted-foreground">
            No products published yet. Use the Add products tab.
          </p>
        </InsightsPanel>
      </div>
    );
  }

  return (
    <div className={INSIGHTS_TAB_SHELL}>
      <InsightsPanel
        title="Published catalogue"
        subtitle="Drag rows to reorder · edit display price · toggle visibility"
        className="flex-1 min-h-0"
        footer={
          <span className="text-xs text-muted-foreground">
            {listings.length} product{listings.length === 1 ? "" : "s"} on store
          </span>
        }
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <Table className="w-full min-w-max">
              <InsightsTableHeader>
                <InsightsStaticTh label="" className="w-10" />
                <InsightsStaticTh label="Photo" className="w-16" />
                <InsightsStaticTh label="Product" />
                <InsightsStaticTh label="Category" />
                <InsightsStaticTh label="Brand" />
                <InsightsStaticTh label="Size" />
                <InsightsStaticTh label="Colour" />
                <InsightsStaticTh label="Stock" />
                <InsightsStaticTh label="Display price" className="text-right" />
                <InsightsStaticTh label="Upload" className="w-24" />
                <InsightsStaticTh label="Active" className="w-20" />
                <InsightsStaticTh label="" className="w-12" />
              </InsightsTableHeader>
              <TableBody>
                {order.map((id) => {
                  const listing = listingById[id];
                  if (!listing) return null;
                  const product = lookupMap<CatalogProduct>(productsQuery.data, listing.product_id);
                  const stock = lookupMap<{ qty: number; price: number | null }>(
                    variantsQuery.data?.stock,
                    listing.product_id,
                  );
                  const variantMeta = lookupMap<{ sizesLabel: string; colorsLabel: string }>(
                    variantsQuery.data?.variants,
                    listing.product_id,
                  );
                  const publicStock = classifyStorefrontStock(stock?.qty ?? 0);
                  return (
                    <SortableListingRow
                      key={id}
                      listing={listing}
                      product={product}
                      categoryLabel={product?.category || "—"}
                      sizesLabel={variantMeta?.sizesLabel ?? "—"}
                      colorsLabel={variantMeta?.colorsLabel ?? "—"}
                      stockLabel={publicStock.label}
                      salePrice={listing.display_price ?? stock?.price ?? product?.default_sale_price ?? null}
                      orgId={orgId!}
                      onChanged={onChanged}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </SortableContext>
        </DndContext>
      </InsightsPanel>
    </div>
  );
}

function SortableListingRow({
  listing,
  product,
  categoryLabel,
  sizesLabel,
  colorsLabel,
  stockLabel,
  salePrice,
  orgId,
  onChanged,
}: {
  listing: WebsiteProduct;
  product?: CatalogProduct;
  categoryLabel: string;
  sizesLabel: string;
  colorsLabel: string;
  stockLabel: string;
  salePrice: number | null;
  orgId: string;
  onChanged: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: listing.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [price, setPrice] = useState(listing.display_price != null ? String(listing.display_price) : "");

  const savePrice = async () => {
    const parsed = price.trim() === "" ? null : Number(price);
    if (parsed != null && !Number.isFinite(parsed)) {
      toast.error("Enter a valid price");
      return;
    }
    const { error } = await websiteFrom("website_products")
      .update({ display_price: parsed })
      .eq("id", listing.id)
      .eq("organization_id", orgId);
    if (error) toast.error(error.message);
    else {
      toast.success("Display price saved");
      onChanged();
    }
  };

  const toggleActive = async (is_active: boolean) => {
    const { error } = await websiteFrom("website_products")
      .update({ is_active })
      .eq("id", listing.id)
      .eq("organization_id", orgId);
    if (error) toast.error(error.message);
    else onChanged();
  };

  const remove = async () => {
    const { error } = await websiteFrom("website_products")
      .delete()
      .eq("id", listing.id)
      .eq("organization_id", orgId);
    if (error) toast.error(error.message);
    else {
      toast.success("Removed from store");
      onChanged();
    }
  };

  const uploadPhoto = async (file: File) => {
    try {
      const blob = await compressImageFile(file);
      const path = `${orgId}/${listing.id}/${Date.now()}.jpg`;
      const { error: upError } = await supabase.storage.from("website-photos").upload(path, blob, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (upError) throw upError;
      const { data } = supabase.storage.from("website-photos").getPublicUrl(path);
      const next = [...(listing.photo_urls || []), data.publicUrl];
      const { error } = await websiteFrom("website_products")
        .update({ photo_urls: next })
        .eq("id", listing.id)
        .eq("organization_id", orgId);
      if (error) throw error;
      toast.success("Photo uploaded");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const thumbUrl = listing.photo_urls?.[0] || product?.image_url || "";

  return (
    <TableRow ref={setNodeRef} style={style} className={INSIGHTS_BODY_ROW}>
      <TableCell className={cn(INSIGHTS_BODY_CELL, "w-10")}>
        <button
          type="button"
          className="cursor-grab text-slate-400 hover:text-slate-600"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
      <TableCell className={INSIGHTS_BODY_CELL}>
        <div className="h-11 w-11 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
          {thumbUrl ? <img src={thumbUrl} alt="" className="h-full w-full object-cover" /> : null}
        </div>
      </TableCell>
      <TableCell className={cn(INSIGHTS_BODY_CELL, "font-semibold text-slate-900 min-w-[10rem]")}>
        {product?.product_name || listing.product_id}
      </TableCell>
      <TableCell className={cn(INSIGHTS_BODY_CELL, "text-slate-600")}>{categoryLabel}</TableCell>
      <TableCell className={cn(INSIGHTS_BODY_CELL, "text-slate-600")}>{product?.brand || "—"}</TableCell>
      <TableCell className={cn(INSIGHTS_BODY_CELL, "text-slate-600 text-xs")}>{sizesLabel}</TableCell>
      <TableCell className={cn(INSIGHTS_BODY_CELL, "text-slate-600 text-xs")}>{colorsLabel}</TableCell>
      <TableCell className={cn(INSIGHTS_BODY_CELL, "text-slate-600 whitespace-nowrap")}>{stockLabel}</TableCell>
      <TableCell className={INSIGHTS_BODY_CELL_NUM}>
        <Input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={savePrice}
          placeholder={salePrice != null ? String(salePrice) : "Price"}
          className="h-9 w-28 font-mono text-sm tabular-nums border-slate-200 bg-white ml-auto"
        />
      </TableCell>
      <TableCell className={INSIGHTS_BODY_CELL}>
        <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium hover:bg-slate-50">
          <ImagePlus className="mr-1 h-3.5 w-3.5" />
          Upload
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadPhoto(file);
              e.target.value = "";
            }}
          />
        </label>
      </TableCell>
      <TableCell className={INSIGHTS_BODY_CELL}>
        <Switch checked={listing.is_active} onCheckedChange={toggleActive} />
      </TableCell>
      <TableCell className={INSIGHTS_BODY_CELL}>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={remove}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function EnquiryInbox({ orgId }: { orgId?: string }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<WebsiteEnquiryStatus | "all">("all");

  const enquiriesQuery = useQuery({
    queryKey: ["website_enquiries", orgId, statusFilter],
    enabled: !!orgId,
    staleTime: STALE_LIVE,
    queryFn: async () => {
      let q = websiteFrom("website_enquiries")
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as WebsiteEnquiry[];
    },
  });

  const rows = coerceToArray<WebsiteEnquiry>(enquiriesQuery.data);
  const productIds = [...new Set(rows.map((e) => e.product_id).filter(Boolean))] as string[];
  const namesQuery = useQuery({
    queryKey: ["website_enquiry_products", orgId, productIds.join(",")],
    enabled: !!orgId && productIds.length > 0,
    staleTime: STALE_FREQUENT,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, product_name")
        .eq("organization_id", orgId!)
        .in("id", productIds);
      if (error) throw error;
      return Object.fromEntries((data || []).map((p) => [p.id, p.product_name]));
    },
  });

  const setStatus = async (id: string, status: WebsiteEnquiryStatus) => {
    const { error } = await websiteFrom("website_enquiries")
      .update({ status })
      .eq("id", id)
      .eq("organization_id", orgId!);
    if (error) toast.error(error.message);
    else {
      toast.success("Enquiry updated");
      void queryClient.invalidateQueries({ queryKey: ["website_enquiries", orgId] });
    }
  };

  const statusTabs = (["all", ...ENQUIRY_STATUSES] as const).map((s) => ({
    id: s,
    label: s === "all" ? "All" : s[0].toUpperCase() + s.slice(1),
  }));

  return (
    <div className={INSIGHTS_TAB_SHELL}>
      <Tabs
        value={statusFilter}
        onValueChange={(v) => setStatusFilter(v as WebsiteEnquiryStatus | "all")}
        className="flex flex-col flex-1 min-h-0 gap-2"
      >
        <TabsList className={INSIGHTS_SUB_TAB_LIST}>
          {statusTabs.map(({ id, label }) => (
            <TabsTrigger key={id} value={id} className={INSIGHTS_SUB_TAB_TRIGGER}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={statusFilter} className="mt-0 flex flex-1 min-h-0 flex-col focus-visible:outline-none">
          <InsightsPanel
            title="Customer enquiries"
            subtitle="Messages from the public store — no cart in Phase 1"
            className="flex-1 min-h-0"
            footer={
              <span className="text-xs text-muted-foreground">
                {rows.length} enquir{rows.length === 1 ? "y" : "ies"}
                {statusFilter !== "all" ? ` · ${statusFilter}` : ""}
              </span>
            }
          >
            <Table className="w-full min-w-max">
              <InsightsTableHeader>
                <InsightsStaticTh label="Customer" />
                <InsightsStaticTh label="Product" />
                <InsightsStaticTh label="Message" />
                <InsightsStaticTh label="Status" />
                <InsightsStaticTh label="When" />
              </InsightsTableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className={cn(INSIGHTS_BODY_ROW, "align-top")}>
                    <TableCell className={INSIGHTS_BODY_CELL}>
                      <div className="font-semibold text-slate-900">{row.customer_name}</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <a className="inline-flex items-center text-xs text-primary" href={`tel:${row.customer_phone}`}>
                          <Phone className="mr-1 h-3 w-3" />
                          {row.customer_phone}
                        </a>
                        <a
                          className="inline-flex items-center text-xs text-emerald-700"
                          href={whatsappShareUrl(`Hi ${row.customer_name}`, row.customer_phone)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle className="mr-1 h-3 w-3" />
                          WhatsApp
                        </a>
                      </div>
                    </TableCell>
                    <TableCell className={cn(INSIGHTS_BODY_CELL, "text-slate-700")}>
                      {(row.product_id && lookupMap<string>(namesQuery.data, row.product_id)) || "—"}
                    </TableCell>
                    <TableCell className={cn(INSIGHTS_BODY_CELL, "max-w-xs text-slate-600")}>
                      {row.message || "—"}
                    </TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL}>
                      <select
                        className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                        value={row.status}
                        onChange={(e) => setStatus(row.id, e.target.value as WebsiteEnquiryStatus)}
                      >
                        {ENQUIRY_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s[0].toUpperCase() + s.slice(1)}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className={cn(INSIGHTS_BODY_CELL, "text-xs text-muted-foreground whitespace-nowrap")}>
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">
                      {enquiriesQuery.isLoading ? "Loading…" : "No enquiries yet."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </InsightsPanel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
