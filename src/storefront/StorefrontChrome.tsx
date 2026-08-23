import type { PublicStorefrontShop } from "@/lib/websiteTypes";

export function StorefrontHeader({ shop }: { shop: PublicStorefrontShop }) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="text-sm font-semibold tracking-tight">{shop.name}</div>
        <div className="flex items-center gap-3 text-xs font-medium text-slate-600">
          {shop.instagram_url ? (
            <a href={shop.instagram_url} target="_blank" rel="noreferrer">
              Instagram
            </a>
          ) : null}
          {shop.facebook_url ? (
            <a href={shop.facebook_url} target="_blank" rel="noreferrer">
              Facebook
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function StorefrontFooter({ shop }: { shop: PublicStorefrontShop }) {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <div>{shop.name}</div>
        <div>Powered by EzzyERP</div>
      </div>
    </footer>
  );
}
