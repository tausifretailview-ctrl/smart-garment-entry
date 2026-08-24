import { useEffect, useMemo, useState } from "react";
import { parseStorefrontPath, storefrontHomePath } from "@/lib/storefrontPath";
import type { PublicStorefrontPayload, PublicStorefrontProduct } from "@/lib/websiteTypes";
import { loadPublicStorefront } from "./storefrontClient";
import { StorefrontHome } from "./StorefrontHome";
import { StorefrontProduct } from "./StorefrontProduct";
import { applyStorefrontThemeVars } from "./storefrontTheme";

export function StorefrontApp() {
  const path = window.location.pathname;
  const parsed = useMemo(() => parseStorefrontPath(path), [path]);
  const [payload, setPayload] = useState<PublicStorefrontPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!parsed?.orgSlug) {
      setLoading(false);
      setError("Store not found");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadPublicStorefront(parsed.orgSlug)
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load this store");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [parsed?.orgSlug]);

  const shopName = payload?.shop?.display_name || payload?.shop?.name || parsed?.orgSlug || "Store";
  const accent = payload?.shop?.theme_accent_color || "#E2A33B";

  useEffect(() => {
    document.title = payload?.published ? `${shopName} — Store` : "Store";
    applyStorefrontThemeVars(accent);
  }, [shopName, accent, payload?.published]);

  if (!parsed) {
    return (
      <Unavailable
        title="Store not found"
        body="This link does not point to a shop catalogue."
      />
    );
  }

  if (loading) {
    return <div className="storefront-loading">Loading catalogue…</div>;
  }

  if (error || !payload?.published) {
    return (
      <Unavailable
        title="Catalogue unavailable"
        body="This shop's catalogue is not available right now."
      />
    );
  }

  const products = payload.products || [];
  const selected: PublicStorefrontProduct | undefined = parsed.productId
    ? products.find((p) => p.product_id === parsed.productId || p.id === parsed.productId)
    : undefined;

  if (parsed.productId && !selected) {
    return (
      <Unavailable
        title="Product not found"
        body="This item is no longer listed."
        actionHref={storefrontHomePath(parsed.orgSlug)}
        actionLabel="Back to store"
      />
    );
  }

  if (selected) {
    return (
      <StorefrontProduct
        shop={payload.shop!}
        orgSlug={parsed.orgSlug}
        product={selected}
      />
    );
  }

  return (
    <StorefrontHome
      shop={payload.shop!}
      orgSlug={parsed.orgSlug}
      products={products}
    />
  );
}

function Unavailable({
  title,
  body,
  actionLabel,
  actionHref,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="storefront-page flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="text-lg font-semibold text-[color:var(--store-charcoal)]">{title}</div>
        <p className="mt-2 text-sm text-[color:var(--store-muted)]">{body}</p>
        {actionLabel && actionHref ? (
          <a href={actionHref} className="storefront-btn-primary mt-5 inline-block px-6">
            {actionLabel}
          </a>
        ) : null}
      </div>
    </div>
  );
}
