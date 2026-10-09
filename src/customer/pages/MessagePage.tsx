import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { BillView } from "./account";
import { BottomNav, PoweredBy, ShopHeader, useShop } from "../components/AppChrome";
import InstallAppCard from "../components/InstallApp";
import { fetchOffer, getSessionToken, type OfferRow, type ShopInfo } from "../lib/account";
import { formatDate, offerValidity } from "../lib/format";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ShopContactButtons({ shop }: { shop: ShopInfo | null }) {
  if (!shop?.phone && !shop?.whatsapp) return null;
  return (
    <div className="c-row2 no-print">
      {shop.whatsapp ? (
        <a className="c-btn c-btn-wa" href={`https://wa.me/${shop.whatsapp}`} target="_blank" rel="noreferrer">
          💬 WhatsApp
        </a>
      ) : null}
      {shop.phone ? (
        <a className="c-btn c-btn-ghost" href={`tel:${shop.phone.replace(/[^\d+]/g, "")}`}>
          📞 Call shop
        </a>
      ) : null}
    </div>
  );
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="c-code c-code-btn"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(code)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => undefined);
      }}
    >
      <span>{code}</span>
      <small>{copied ? "Copied ✓" : "Tap to copy"}</small>
    </button>
  );
}

/** The offer a notification was about: picture, text, code, validity and how to reach the shop. */
function OfferView({
  campaignId,
  fallbackTitle,
  fallbackBody,
  headerShop,
}: {
  campaignId: string;
  fallbackTitle: string;
  fallbackBody: string;
  headerShop: ShopInfo | null;
}) {
  const [offer, setOffer] = useState<OfferRow | null>(null);
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetchOffer(campaignId)
      .then((res) => {
        if (cancelled) return;
        setOffer(res.offer);
        setShop(res.shop);
      })
      .catch((e: unknown) => {
        // Older customer-app deploys don't know this action: the text from the notification still shows.
        if (!cancelled && (e as { code?: string } | null)?.code === "offer_not_found") setEnded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const title = offer?.title || fallbackTitle;
  const body = offer?.body ?? fallbackBody;
  const validity = offerValidity(offer?.valid_till);
  const isEnded = ended || validity?.ended === true;
  const contact = shop ?? headerShop;

  return (
    <>
      <article className="c-card c-offer-hero">
        {offer?.image_url ? <img className="c-offer-banner" src={offer.image_url} alt="" /> : <div className="c-offer-burst" aria-hidden="true">🛍️</div>}
        <div className="c-offer-content">
          <div className="c-offer-tags">
            <span className="c-chip">{isEnded ? "Offer" : "🎉 Special offer"}</span>
            {validity && !validity.ended ? (
              <span className={validity.urgent ? "c-chip c-chip-hot" : "c-chip c-chip-soft"}>{validity.label}</span>
            ) : null}
            {isEnded ? <span className="c-chip c-chip-off">Offer ended</span> : null}
          </div>
          <h1 className="c-offer-title">{title}</h1>
          {body ? <p className="c-offer-body">{body}</p> : null}
          {offer?.offer_code && !isEnded ? <CopyCode code={offer.offer_code} /> : null}
          {offer && !offer.valid_till ? <div className="c-muted c-offer-date">Sent {formatDate(offer.created_at)}</div> : null}
        </div>
      </article>
      {!isEnded ? (
        <p className="c-offer-visit">
          Visit {contact?.name ?? "the shop"}{offer?.offer_code ? " and show this code at billing" : " to grab this offer"}.
        </p>
      ) : null}
      <ShopContactButtons shop={contact} />
      <Link className="c-btn c-btn-ghost" to="/offers">
        See all offers
      </Link>
    </>
  );
}

// /m/:id — opened from a notification tap when the push has no bill link
// (/t/<token>). The raw bill token is never stored, but invoice pushes carry
// sale_id: a logged-in customer sees the full bill straight away, otherwise
// they log in with their mobile number first. Offer pushes carry campaign_id:
// the offer itself (picture, code, validity) loads without a login.
export default function MessagePage() {
  const [params] = useSearchParams();
  const shop = useShop();
  const title = params.get("title") || "New update from your shop";
  const body = params.get("body") || "";
  const saleId = params.get("sale") ?? "";
  const campaignId = params.get("campaign") ?? "";
  const loggedIn = !!getSessionToken();

  let content: React.ReactNode;
  if (UUID.test(saleId)) {
    content = (
      <>
        <BillView saleId={saleId} />
        {loggedIn ? null : (
          <p className="c-hint c-center">Use the mobile number you gave at billing. No password or OTP needed.</p>
        )}
      </>
    );
  } else if (UUID.test(campaignId)) {
    content = <OfferView campaignId={campaignId} fallbackTitle={title} fallbackBody={body} headerShop={shop} />;
  } else {
    content = (
      <>
        <article className="c-card c-msg">
          <span className="c-chip">Message from {shop?.name ?? "your shop"}</span>
          <h1 className="c-offer-title">{title}</h1>
          {body ? <p className="c-offer-body">{body}</p> : null}
        </article>
        <Link className="c-btn" to="/account">
          My bills &amp; offers
        </Link>
      </>
    );
  }

  return (
    <>
      <ShopHeader />
      <div className={loggedIn ? "c-wrap c-wrap-tabs" : "c-wrap"}>
        <div className="c-enter">{content}</div>
        <InstallAppCard shopName={shop?.name} />
        <PoweredBy />
      </div>
      {loggedIn ? <BottomNav /> : null}
    </>
  );
}
