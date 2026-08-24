import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  ExternalLink,
  GripVertical,
  ImagePlus,
  Loader2,
  MessageCircle,
  Phone,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { compressImageFile } from "@/lib/compressImage";
import { STALE_FREQUENT, STALE_LIVE, STALE_REFERENCE, STALE_SETTINGS } from "@/lib/queryStaleTimes";
import {
  publicStorefrontUrl,
  storefrontWhatsAppShareText,
  whatsappShareUrl,
} from "@/lib/storefrontShare";
import { classifyStorefrontStock, formatStorefrontPrice, aggregateWebsiteVariantStock } from "@/lib/storefrontStock";
import { coerceToArray, lookupMap } from "@/lib/coerceToMap";
import { websiteFrom } from "@/lib/websiteDb";
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
};

const ENQUIRY_STATUSES: WebsiteEnquiryStatus[] = ["new", "contacted", "converted", "closed"];

export default function WebsiteSettingsPage() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const orgSlug = currentOrganization?.slug || "";
  const queryClient = useQueryClient();

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
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b bg-background px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <Store className="h-5 w-5 text-primary" />
              Website
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Publish selected products to a public store page. Customers enquire — no cart in Phase 1.
            </p>
          </div>
          <ShareButtons storeUrl={storeUrl} shopName={currentOrganization?.name || "our shop"} whatsapp={settingsQuery.data?.whatsapp_number} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
        {listingsError ? (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Could not load the catalogue. {listingsError}
          </p>
        ) : null}
        <Tabs defaultValue="catalogue">
          <TabsList>
            <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
            <TabsTrigger value="add">Add products</TabsTrigger>
            <TabsTrigger value="profile">Store profile</TabsTrigger>
            <TabsTrigger value="enquiries">Enquiries</TabsTrigger>
          </TabsList>
          <TabsContent value="catalogue" className="mt-4">
            <PublishedCatalogue
              orgId={orgId}
              listings={listings}
              loading={listingsQuery.isLoading}
              onChanged={() => queryClient.invalidateQueries({ queryKey: ["website_products", orgId] })}
            />
          </TabsContent>
          <TabsContent value="add" className="mt-4">
            <AddProducts
              orgId={orgId}
              listings={listings}
              onChanged={() => queryClient.invalidateQueries({ queryKey: ["website_products", orgId] })}
            />
          </TabsContent>
          <TabsContent value="profile" className="mt-4">
            <StoreProfile
              orgId={orgId}
              orgSlug={orgSlug}
              settings={settingsQuery.data || null}
              onChanged={() => queryClient.invalidateQueries({ queryKey: ["website_settings", orgId] })}
            />
          </TabsContent>
          <TabsContent value="enquiries" className="mt-4">
            <EnquiryInbox orgId={orgId} />
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
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={copy} disabled={!storeUrl}>
        {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
        Copy link
      </Button>
      <Button type="button" variant="outline" size="sm" asChild disabled={!storeUrl}>
        <a href={storeUrl} target="_blank" rel="noreferrer">
          <ExternalLink className="mr-1.5 h-4 w-4" />
          View store
        </a>
      </Button>
      <Button type="button" size="sm" asChild disabled={!storeUrl}>
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
  const [accent, setAccent] = useState(settings?.theme_accent_color || "#2563EB");
  const [published, setPublished] = useState(!!settings?.is_published);

  useEffect(() => {
    setWhatsapp(settings?.whatsapp_number || "");
    setInstagram(settings?.instagram_url || "");
    setFacebook(settings?.facebook_url || "");
    setAccent(settings?.theme_accent_color || "#2563EB");
    setPublished(!!settings?.is_published);
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId || !orgSlug) throw new Error("No organization");
      const payload = {
        organization_id: orgId,
        slug: orgSlug,
        whatsapp_number: whatsapp.trim() || null,
        instagram_url: instagram.trim() || null,
        facebook_url: facebook.trim() || null,
        theme_accent_color: accent || null,
        is_published: published,
      };
      const { error } = await websiteFrom("website_settings").upsert(payload, {
        onConflict: "organization_id",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Store profile saved");
      onChanged();
    },
    onError: (err: Error) => toast.error(err.message || "Could not save"),
  });

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <div className="font-medium">Publish store</div>
          <p className="text-sm text-muted-foreground">
            When on, anyone with the link can browse published products.
          </p>
        </div>
        <Switch checked={published} onCheckedChange={setPublished} />
      </div>
      <div className="space-y-2">
        <Label>WhatsApp number</Label>
        <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="9198XXXXXXXX" />
      </div>
      <div className="space-y-2">
        <Label>Instagram URL</Label>
        <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="https://instagram.com/..." />
      </div>
      <div className="space-y-2">
        <Label>Facebook URL</Label>
        <Input value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="https://facebook.com/..." />
      </div>
      <div className="space-y-2">
        <Label>Accent color</Label>
        <div className="flex items-center gap-3">
          <Input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-10 w-16 p-1" />
          <Input value={accent} onChange={(e) => setAccent(e.target.value)} className="font-mono" />
        </div>
      </div>
      <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Save profile
      </Button>
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

  const publish = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization");
      const ids = [...selected].filter((id) => !publishedIds.has(id));
      if (ids.length === 0) throw new Error("Select products that are not already published");
      const maxOrder = listings.reduce((m, l) => Math.max(m, l.display_order || 0), 0);
      const rows = ids.map((product_id, i) => ({
        organization_id: orgId,
        product_id,
        variant_id: null,
        display_order: maxOrder + i + 1,
        is_active: true,
      }));
      const { error } = await websiteFrom("website_products").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Products added to the store");
      setSelected(new Set());
      onChanged();
    },
    onError: (err: Error) => toast.error(err.message || "Could not publish"),
  });

  const rows = coerceToArray<CatalogProduct>(productsQuery.data).filter((p) => !publishedIds.has(p.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products to publish"
          className="max-w-sm"
        />
        <Button type="button" onClick={() => publish.mutate()} disabled={selected.size === 0 || publish.isPending}>
          Publish selected ({selected.size})
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2 text-right">Sale price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      setSelected(next);
                    }}
                  />
                </td>
                <td className="px-3 py-2 font-medium">{p.product_name}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.brand || "—"}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {formatStorefrontPrice(p.default_sale_price) || "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  {productsQuery.isLoading ? "Loading…" : "No unpublished products match."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
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
        .select("product_id, sale_price, stock_qty")
        .eq("organization_id", orgId!)
        .in("product_id", productIds)
        .is("deleted_at", null);
      if (error) throw error;
      return aggregateWebsiteVariantStock((data || []) as VariantRow[]);
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

  if (loading) return <p className="text-sm text-muted-foreground">Loading catalogue…</p>;
  if (listings.length === 0) {
    return <p className="text-sm text-muted-foreground">No products published yet. Use Add products.</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {order.map((id) => {
            const listing = listingById[id];
            if (!listing) return null;
            const product = lookupMap<CatalogProduct>(productsQuery.data, listing.product_id);
            const stock = lookupMap<{ qty: number; price: number | null }>(
              variantsQuery.data,
              listing.product_id,
            );
            const publicStock = classifyStorefrontStock(stock?.qty ?? 0);
            return (
              <SortableListing
                key={id}
                listing={listing}
                product={product}
                stockLabel={publicStock.label}
                salePrice={listing.display_price ?? stock?.price ?? product?.default_sale_price ?? null}
                orgId={orgId!}
                onChanged={onChanged}
              />
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableListing({
  listing,
  product,
  stockLabel,
  salePrice,
  orgId,
  onChanged,
}: {
  listing: WebsiteProduct;
  product?: CatalogProduct;
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

  return (
    <li ref={setNodeRef} style={style} className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center">
      <button type="button" className="cursor-grab text-muted-foreground" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="h-14 w-14 overflow-hidden rounded-md bg-muted">
        {(listing.photo_urls?.[0] || product?.image_url) ? (
          <img src={listing.photo_urls?.[0] || product?.image_url || ""} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{product?.product_name || listing.product_id}</div>
        <div className="text-xs text-muted-foreground">
          {product?.brand || "—"} · public stock: {stockLabel}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={savePrice}
          placeholder={salePrice != null ? String(salePrice) : "Sale price"}
          className="h-9 w-28 font-mono"
        />
        <label className="inline-flex cursor-pointer items-center rounded-md border px-2 py-1 text-xs">
          <ImagePlus className="mr-1 h-3.5 w-3.5" />
          Photo
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
        <div className="flex items-center gap-2 text-xs">
          <span>On</span>
          <Switch checked={listing.is_active} onCheckedChange={toggleActive} />
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={remove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
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

  const rows = coerceToArray<WebsiteEnquiry>(enquiriesQuery.data);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["all", ...ENQUIRY_STATUSES] as const).map((s) => (
          <Button
            key={s}
            type="button"
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Message</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t align-top">
                <td className="px-3 py-2">
                  <div className="font-medium">{row.customer_name}</div>
                  <div className="mt-1 flex gap-2">
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
                </td>
                <td className="px-3 py-2">{(row.product_id && lookupMap<string>(namesQuery.data, row.product_id)) || "—"}</td>
                <td className="max-w-xs px-3 py-2 text-muted-foreground">{row.message || "—"}</td>
                <td className="px-3 py-2">
                  <select
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                    value={row.status}
                    onChange={(e) => setStatus(row.id, e.target.value as WebsiteEnquiryStatus)}
                  >
                    {ENQUIRY_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  {enquiriesQuery.isLoading ? "Loading…" : "No enquiries yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
