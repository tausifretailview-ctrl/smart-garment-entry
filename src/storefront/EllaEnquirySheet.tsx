import { useEffect } from "react";
import { whatsappShareUrl } from "@/lib/storefrontShare";
import { ellaStockBadgeClass } from "./ellaStock";
import { ellaProductWhatsAppText, type EllaStorefrontProduct } from "./ellaProduct";
import { EllaEnquiryForm } from "./EllaEnquiryForm";
import { useLockBodyScroll } from "./ellaLockBody";

export function EllaEnquirySheet({
  slug,
  shopWhatsApp,
  product,
  onClose,
  upiId,
  upiBusinessName,
}: {
  slug: string;
  shopWhatsApp?: string | null;
  product: EllaStorefrontProduct;
  onClose: () => void;
  upiId?: string | null;
  upiBusinessName?: string | null;
}) {
  useLockBodyScroll(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sizing = "Made to measure · studio fitting";
  const waHref = whatsappShareUrl(ellaProductWhatsAppText(product), shopWhatsApp);

  return (
    <>
      <button type="button" className="ella-scrim" aria-label="Close enquiry" onClick={onClose} />
      <section className="ella-sheet" role="dialog" aria-modal="true" aria-labelledby="ella-sheet-title">
        <div className="ella-sheet-scroll">
          <div className="ella-sheet-head">
            <div>
              <div className="ella-eyebrow">{product.category}</div>
              <h2 id="ella-sheet-title" className="ella-display ella-sheet-name">
                {product.name}
              </h2>
            </div>
            <button type="button" className="ella-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          <div className="ella-price-row">
            {product.priceLabel ? <div className="ella-price">{product.priceLabel}</div> : null}
            <span className={ellaStockBadgeClass(product.stock.state)} style={{ position: "static" }}>
              {product.stock.label}
            </span>
          </div>

          <dl className="ella-spec">
            <div className="ella-spec-row">
              <dt>Fabric</dt>
              <dd>{product.fabric}</dd>
            </div>
            <div className="ella-spec-row">
              <dt>Lead time</dt>
              <dd>
                {product.leadTimeWeeks != null
                  ? `${product.leadTimeWeeks} weeks`
                  : product.stock.state === "out"
                    ? "Enquire for availability"
                    : "Ready"}
              </dd>
            </div>
            <div className="ella-spec-row">
              <dt>Sizing</dt>
              <dd>{sizing}</dd>
            </div>
            <div className="ella-spec-row">
              <dt>Availability</dt>
              <dd>{product.stock.label}</dd>
            </div>
          </dl>

          <EllaEnquiryForm
            slug={slug}
            product={product}
            whatsAppHref={waHref}
            upiId={upiId}
            upiBusinessName={upiBusinessName}
          />
        </div>
      </section>
    </>
  );
}
