import { useEffect, useMemo, useState } from "react";
import { parseStorefrontPath, storefrontHomePath, storefrontProductPath } from "@/lib/storefrontPath";
import type { PublicStorefrontPayload, PublicStorefrontProduct } from "@/lib/websiteTypes";
import { applyStorefrontThemeVars, isEllaNoorSlug } from "./storefrontTheme";
import { loadPublicStorefront } from "./storefrontClient";
import { buildPublicStorefrontMenuTree } from "@/lib/websiteMenuTree";
import { StorefrontHome } from "./StorefrontHome";
import { StorefrontProduct } from "./StorefrontProduct";
import { EllaStorefront } from "./EllaStorefront";
import { EllaStorefrontSkeleton } from "./EllaStorefrontHome";
import "./ella-storefront.css";

export function StorefrontApp() {
  const path = window.location.pathname;
  const parsed = useMemo(() => parseStorefrontPath(path), [path]);
  const ella = isEllaNoorSlug(parsed?.orgSlug);
  const [payload, setPayload] = useState<PublicStorefrontPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ella) return;
    document.documentElement.classList.add("ella-root");
    document.body.classList.add("ella-root");
    return () => {
      document.documentElement.classList.remove("ella-root");
      document.body.classList.remove("ella-root");
    };
  }, [ella]);

  useEffect(() => {
    if (!parsed?.orgSlug) {
      setLoading(false);
      setError("Store not found");
      return;
    }
    let cancelled = false;
    const load = () => {
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
    };
    setLoading(true);
    setError(null);
    load();
    const onFocus = () => {
      if (!ella) return;
      if (document.visibilityState === "hidden") return;
      loadPublicStorefront(parsed.orgSlug)
        .then((data) => {
          if (!cancelled) setPayload(data);
        })
        .catch(() => {
          /* keep last good catalogue on a background refresh failure */
        });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [ella, parsed?.orgSlug]);

  const canonicalSlug = payload?.shop?.slug || parsed?.orgSlug || "";
  const shopName = payload?.shop?.display_name || payload?.shop?.name || canonicalSlug || "Store";
  const accent = payload?.shop?.theme_accent_color || "#E2A33B";

  useEffect(() => {
    if (!parsed || !payload?.published || !payload.shop?.slug) return;
    if (payload.shop.slug === parsed.orgSlug) return;
    const next = parsed.productId
      ? storefrontProductPath(payload.shop.slug, parsed.productId)
      : storefrontHomePath(payload.shop.slug);
    window.history.replaceState(null, "", next);
  }, [parsed, payload]);

  useEffect(() => {
    document.title = payload?.published ? `${shopName} — Store` : "Store";
    applyStorefrontThemeVars(accent);
  }, [shopName, accent, payload?.published]);

  if (!parsed) {
    return (
      <Unavailable
        ella={false}
        title="Store not found"
        body="This link does not point to a shop catalogue."
      />
    );
  }

  if (loading) {
    return ella ? <EllaStorefrontSkeleton /> : <div className="storefront-loading">Loading catalogue…</div>;
  }

  if (error || !payload?.published) {
    return (
      <Unavailable
        ella={ella}
        title="Catalogue unavailable"
        body="This shop's catalogue is not available right now."
      />
    );
  }

  const products = payload.products || [];
  const menuTree = buildPublicStorefrontMenuTree(payload.menus || []);
  const selected: PublicStorefrontProduct | undefined = parsed.productId
    ? products.find((p) => p.product_id === parsed.productId || p.id === parsed.productId)
    : undefined;

  if (ella) {
    return (
      <EllaStorefront
        shop={payload.shop!}
        orgSlug={canonicalSlug}
        products={products}
        initialProductId={parsed.productId}
      />
    );
  }

  if (parsed.productId && !selected) {
    return (
      <Unavailable
        ella={false}
        title="Product not found"
        body="This item is no longer listed."
        actionHref={storefrontHomePath(canonicalSlug)}
        actionLabel="Back to store"
      />
    );
  }

  if (selected) {
    return (
      <StorefrontProduct
        shop={payload.shop!}
        orgSlug={canonicalSlug}
        product={selected}
      />
    );
  }

  return (
    <StorefrontHome
      shop={payload.shop!}
      orgSlug={canonicalSlug}
      products={products}
      menus={menuTree}
    />
  );
}

function Unavailable({
  title,
  body,
  actionLabel,
  actionHref,
  ella,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
  ella: boolean;
}) {
  if (ella) {
    return (
      <div className="ella-store ella-unavailable">
        <div className="ella-unavailable-inner">
          <div className="ella-display" style={{ fontSize: 22 }}>
            {title}
          </div>
          <p className="ella-collection-lead">{body}</p>
        </div>
      </div>
    );
  }
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
