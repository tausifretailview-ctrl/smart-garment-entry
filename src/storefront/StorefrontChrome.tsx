import type { ReactNode } from "react";
import { storefrontHomePath } from "@/lib/storefrontPath";
import { publicStorefrontUrl, storefrontWhatsAppShareText, whatsappShareUrl } from "@/lib/storefrontShare";
import type { PublicStorefrontShop } from "@/lib/websiteTypes";
import { StorefrontFloatingSocial } from "./StorefrontFloatingSocial";
import { storefrontLocationLine } from "./storefrontTheme";

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2zm5.8 14.2c-.24.7-1.4 1.3-1.9 1.35-.5.06-1.1.08-1.8-.1-.4-.1-.95-.3-1.6-.6-2.9-1.25-4.8-4.2-4.9-4.4-.15-.2-1.2-1.6-1.2-3.05 0-1.45.75-2.15 1.05-2.45.24-.24.55-.35.75-.35h.55c.18 0 .4-.02.6.45.24.55.8 1.9.85 2.05.06.14.1.32 0 .5-.1.2-.15.32-.3.5-.14.16-.3.36-.44.5-.14.14-.3.3-.13.6.18.3.8 1.3 1.7 2.1 1.2 1.05 2.15 1.4 2.45 1.55.3.14.5.12.68-.08.2-.2.8-.9 1-1.2.2-.3.4-.25.65-.15.26.1 1.65.78 1.93.92.28.14.46.2.53.32.08.13.08.7-.16 1.4z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M14 9h3V6h-3a3 3 0 00-3 3v2H8v3h3v7h3v-7h3l1-3h-4V9a1 1 0 011-1z" />
    </svg>
  );
}

export function StorefrontShell({
  shop,
  orgSlug,
  children,
}: {
  shop: PublicStorefrontShop;
  orgSlug: string;
  children: ReactNode;
}) {
  const displayName = shop.display_name || shop.name;
  const location = storefrontLocationLine(shop.address);
  const shareUrl = publicStorefrontUrl(window.location.origin, orgSlug);
  const waHref = shop.whatsapp_number
    ? whatsappShareUrl(
        storefrontWhatsAppShareText(displayName, shareUrl),
        shop.whatsapp_number,
      )
    : null;

  return (
    <div className="storefront-page">
      <div className="storefront-wrap">
        <header className="storefront-header">
          <a href={storefrontHomePath(orgSlug)} className="storefront-brand">
            {shop.logo_url ? (
              <img src={shop.logo_url} alt="" className="storefront-brand-logo" />
            ) : (
              <div
                className="storefront-brand-logo flex items-center justify-center text-sm font-bold"
                aria-hidden
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="storefront-brand-text">
              <div className="storefront-brand-name">{displayName}</div>
              {location ? <div className="storefront-brand-loc">{location}</div> : null}
            </div>
          </a>
          {waHref ? (
            <a href={waHref} target="_blank" rel="noreferrer" className="storefront-wa-pill">
              <WhatsAppIcon />
              Chat
            </a>
          ) : null}
        </header>

        {children}

        <footer className="storefront-footer">
          <div className="storefront-footer-name">{displayName}</div>
          {shop.address ? (
            <>
              {shop.address}
              <br />
            </>
          ) : null}
          {shop.whatsapp_number ? (
            <>
              WhatsApp: {shop.whatsapp_number}
              <br />
            </>
          ) : null}
          <div className="storefront-social-row">
            {shop.instagram_url ? (
              <a href={shop.instagram_url} target="_blank" rel="noreferrer" aria-label="Instagram">
                <InstagramIcon />
              </a>
            ) : null}
            {shop.facebook_url ? (
              <a href={shop.facebook_url} target="_blank" rel="noreferrer" aria-label="Facebook">
                <FacebookIcon />
              </a>
            ) : null}
            {waHref ? (
              <a href={waHref} target="_blank" rel="noreferrer" aria-label="WhatsApp">
                <WhatsAppIcon />
              </a>
            ) : null}
          </div>
          <div className="storefront-credit">Built on Ezzy ERP</div>
        </footer>
      </div>
      <StorefrontFloatingSocial whatsappHref={waHref} instagramUrl={shop.instagram_url} />
    </div>
  );
}

/** @deprecated use StorefrontShell */
export function StorefrontHeader({ shop }: { shop: PublicStorefrontShop }) {
  return (
    <header className="storefront-header">
      <div className="storefront-brand-name">{shop.display_name || shop.name}</div>
    </header>
  );
}

/** @deprecated use StorefrontShell */
export function StorefrontFooter({ shop }: { shop: PublicStorefrontShop }) {
  return (
    <footer className="storefront-footer">
      <div className="storefront-footer-name">{shop.display_name || shop.name}</div>
      <div className="storefront-credit">Built on Ezzy ERP</div>
    </footer>
  );
}
