import { InstagramBrandIcon, WhatsAppBrandIcon } from "./storefrontSocialIcons";

type StorefrontFloatingSocialProps = {
  whatsappHref?: string | null;
  instagramUrl?: string | null;
  /** Ella mobile action bar needs extra bottom offset. */
  variant?: "default" | "ella";
};

export function StorefrontFloatingSocial({
  whatsappHref,
  instagramUrl,
  variant = "default",
}: StorefrontFloatingSocialProps) {
  if (!whatsappHref && !instagramUrl) return null;

  const rootClass =
    variant === "ella" ? "storefront-floating-social ella-floating-social" : "storefront-floating-social";

  return (
    <div className={rootClass} aria-label="Contact us">
      {whatsappHref ? (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          className="storefront-floating-social-btn storefront-floating-social-wa"
          aria-label="WhatsApp"
        >
          <WhatsAppBrandIcon className="storefront-floating-social-icon" />
        </a>
      ) : null}
      {instagramUrl ? (
        <a
          href={instagramUrl}
          target="_blank"
          rel="noreferrer"
          className="storefront-floating-social-btn storefront-floating-social-ig"
          aria-label="Instagram"
        >
          <InstagramBrandIcon className="storefront-floating-social-icon" />
        </a>
      ) : null}
    </div>
  );
}
