import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { fetchShop, readCache, writeCache, type ShopInfo } from "../lib/account";

/** Shop header data: cached on this device (public), refreshed in the background. */
export function useShop(): ShopInfo | null {
  const [shop, setShop] = useState<ShopInfo | null>(() => readCache<ShopInfo>("shop"));
  useEffect(() => {
    let cancelled = false;
    void fetchShop()
      .then((res) => {
        if (cancelled || !res?.shop) return;
        writeCache("shop", res.shop);
        setShop(res.shop);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return shop;
}

const Icon = {
  phone: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8Z" />
    </svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.1.1.7-.1 1.2Z" />
    </svg>
  ),
  home: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" /></svg>,
  bills: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12a1 1 0 0 1 1 1v19l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 0 1 1-1Zm3 5v2h6V7H9Zm0 4v2h6v-2H9Z" /></svg>,
  returns: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4V1L7 5l5 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z" /></svg>,
  history: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 1-8.95 10h2.02A7 7 0 1 0 7 7.1V10H2V5l1.6 1.6A9 9 0 0 1 12 3Zm-1 4h2v5.6l3.7 2.2-1 1.7L11 13.7V7Z" /></svg>,
  offers: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.4 11.6 12.4 2.6A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .55.22 1.05.59 1.42l9 9a2 2 0 0 0 2.82 0l7-7a2 2 0 0 0 0-2.82ZM6.5 8A1.5 1.5 0 1 1 6.5 5a1.5 1.5 0 0 1 0 3Z" /></svg>,
};

/** Top bar: which shop this is (logo, name, address) with call / WhatsApp. */
export function ShopHeader() {
  const shop = useShop();
  const initial = (shop?.name ?? "S").trim().charAt(0).toUpperCase() || "S";
  return (
    <header className="c-top no-print">
      <div className="c-top-inner">
        {shop?.logo_url ? (
          <img className="c-top-logo" src={shop.logo_url} alt="" />
        ) : (
          <span className="c-top-logo c-top-initial">{initial}</span>
        )}
        <div className="c-top-text">
          <b>{shop?.name ?? " "}</b>
          <span>{shop?.address ?? "Your bills & offers"}</span>
        </div>
        {shop?.phone ? (
          <a className="c-top-btn" href={`tel:${shop.phone.replace(/[^\d+]/g, "")}`} aria-label="Call shop">
            {Icon.phone}
          </a>
        ) : null}
        {shop?.whatsapp ? (
          <a
            className="c-top-btn c-top-wa"
            href={`https://wa.me/${shop.whatsapp}`}
            target="_blank"
            rel="noreferrer"
            aria-label="WhatsApp shop"
          >
            {Icon.whatsapp}
          </a>
        ) : null}
      </div>
    </header>
  );
}

const TABS: Array<[string, string, keyof typeof Icon]> = [
  ["/account", "Home", "home"],
  ["/bills", "Bills", "bills"],
  ["/returns", "Returns", "returns"],
  ["/transactions", "History", "history"],
  ["/offers", "Offers", "offers"],
];

/** Fixed bottom tab bar (logged-in pages). */
export function BottomNav() {
  return (
    <nav className="c-tabbar no-print" aria-label="Main">
      {TABS.map(([to, label, icon]) => (
        <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "on" : "")}>
          {Icon[icon]}
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** Grey placeholder rows while the first answer loads. */
export function Skeleton({ rows = 4, hero = false }: { rows?: number; hero?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {hero ? <div className="c-skel c-skel-hero" /> : null}
      <div className="c-card">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="c-skel-row">
            <div>
              <div className="c-skel" style={{ width: "46%", height: 14 }} />
              <div className="c-skel" style={{ width: "30%", height: 11, marginTop: 7 }} />
            </div>
            <div className="c-skel" style={{ width: 64, height: 14 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PoweredBy() {
  return <p className="c-powered no-print">Powered by EzzyERP</p>;
}

/** Animated check mark for "done" moments (notifications on, review sent). */
export function SuccessTick({ size = 44 }: { size?: number }) {
  return (
    <svg className="c-tick" width={size} height={size} viewBox="0 0 52 52" aria-hidden="true">
      <circle className="c-tick-circle" cx="26" cy="26" r="24" />
      <path className="c-tick-check" d="M15 27l7 7 15-16" />
    </svg>
  );
}
