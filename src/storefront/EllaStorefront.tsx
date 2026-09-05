import { useCallback, useEffect, useMemo, useState } from "react";
import { parseStorefrontPath, storefrontHomePath, storefrontProductPath } from "@/lib/storefrontPath";
import { publicStorefrontUrl, storefrontWhatsAppShareText, whatsappShareUrl } from "@/lib/storefrontShare";
import type { PublicStorefrontProduct, PublicStorefrontShop } from "@/lib/websiteTypes";
import { StorefrontFloatingSocial } from "./StorefrontFloatingSocial";
import { toEllaStorefrontProduct, type EllaStorefrontProduct } from "./ellaProduct";
import { isEllaProductPurchasable } from "./ellaStock";
import { EllaEnquirySheet } from "./EllaEnquirySheet";
import { EllaEnquiryForm } from "./EllaEnquiryForm";
import { EllaStorefrontHome } from "./EllaStorefrontHome";
import { EllaProductSheet } from "./EllaProductSheet";
import { EllaCartSheet } from "./EllaCartSheet";
import { ellaCartCount, type EllaCartLine } from "./ellaCart";
import { useLockBodyScroll } from "./ellaLockBody";
import "./ella-storefront.css";

export function EllaStorefront({
  shop,
  orgSlug,
  products,
  initialProductId,
}: {
  shop: PublicStorefrontShop;
  orgSlug: string;
  products: PublicStorefrontProduct[];
  initialProductId: string | null;
}) {
  const ellaProducts = useMemo(() => products.map(toEllaStorefrontProduct), [products]);
  const findById = useCallback(
    (id: string | null) =>
      id ? ellaProducts.find((p) => p.productId === id || p.id === id) || null : null,
    [ellaProducts],
  );

  const [selected, setSelected] = useState<EllaStorefrontProduct | null>(() => findById(initialProductId));
  const [generalOpen, setGeneralOpen] = useState(false);
  const [cart, setCart] = useState<EllaCartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    if (initialProductId) setSelected(findById(initialProductId));
  }, [findById, initialProductId]);

  const openProduct = (product: EllaStorefrontProduct) => {
    setGeneralOpen(false);
    setCartOpen(false);
    setSelected(product);
    window.history.pushState({ ellaSheet: product.productId }, "", storefrontProductPath(orgSlug, product.productId));
  };

  const closeSheet = useCallback(() => {
    setSelected(null);
    setGeneralOpen(false);
    setCartOpen(false);
    window.history.replaceState({}, "", storefrontHomePath(orgSlug));
  }, [orgSlug]);

  const openCart = useCallback(() => {
    setSelected(null);
    setGeneralOpen(false);
    setCartOpen(true);
    window.history.replaceState({}, "", storefrontHomePath(orgSlug));
  }, [orgSlug]);

  useEffect(() => {
    const onPop = () => {
      const parsed = parseStorefrontPath(window.location.pathname);
      const next = findById(parsed?.productId || null);
      setSelected(next);
      if (!next) {
        setGeneralOpen(false);
        setCartOpen(false);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [findById]);

  const cartCount = ellaCartCount(cart);
  const shopName = shop.display_name || shop.name;
  const shareUrl = publicStorefrontUrl(orgSlug);
  const studioWa = shop.whatsapp_number
    ? whatsappShareUrl(storefrontWhatsAppShareText(shopName, shareUrl), shop.whatsapp_number)
    : null;

  return (
    <div className="ella-store">
      <EllaStorefrontHome
        shopName={shopName}
        orgSlug={orgSlug}
        whatsapp={shop.whatsapp_number}
        logoUrl={shop.logo_url}
        address={shop.address}
        instagramUrl={shop.instagram_url}
        facebookUrl={shop.facebook_url}
        products={ellaProducts}
        cartCount={cartCount}
        onOpenProduct={openProduct}
        onOpenGeneralEnquire={() => {
          setSelected(null);
          setCartOpen(false);
          setGeneralOpen(true);
        }}
        onOpenCart={openCart}
      />

      {selected && isEllaProductPurchasable(selected.stock) ? (
        <EllaProductSheet
          product={selected}
          cart={cart}
          onAddToCart={setCart}
          onOpenCart={openCart}
          onClose={closeSheet}
        />
      ) : null}

      {selected && !isEllaProductPurchasable(selected.stock) ? (
        <EllaEnquirySheet
          slug={orgSlug}
          shopWhatsApp={shop.whatsapp_number}
          product={selected}
          upiId={shop.upi_id}
          upiBusinessName={shop.upi_business_name || shopName}
          onClose={closeSheet}
        />
      ) : null}

      {generalOpen && !selected && !cartOpen ? (
        <GeneralEnquireSheet
          slug={orgSlug}
          shopWhatsApp={shop.whatsapp_number}
          upiId={shop.upi_id}
          upiBusinessName={shop.upi_business_name || shopName}
          onClose={closeSheet}
        />
      ) : null}

      {cartOpen ? (
        <EllaCartSheet
          slug={orgSlug}
          shopName={shopName}
          upiId={shop.upi_id}
          upiBusinessName={shop.upi_business_name || shopName}
          cart={cart}
          onCartChange={setCart}
          onClose={() => setCartOpen(false)}
        />
      ) : null}

      <StorefrontFloatingSocial
        variant="ella"
        whatsappHref={studioWa}
        instagramUrl={shop.instagram_url}
      />
    </div>
  );
}

function GeneralEnquireSheet({
  slug,
  shopWhatsApp,
  upiId,
  upiBusinessName,
  onClose,
}: {
  slug: string;
  shopWhatsApp?: string | null;
  upiId?: string | null;
  upiBusinessName?: string | null;
  onClose: () => void;
}) {
  useLockBodyScroll(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button type="button" className="ella-scrim" aria-label="Close enquiry" onClick={onClose} />
      <section className="ella-sheet" role="dialog" aria-modal="true" aria-labelledby="ella-general-title">
        <div className="ella-sheet-scroll">
          <div className="ella-sheet-head">
            <div>
              <div className="ella-eyebrow">Studio</div>
              <h2 id="ella-general-title" className="ella-display ella-sheet-name">
                Enquire
              </h2>
            </div>
            <button type="button" className="ella-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <EllaEnquiryForm
            slug={slug}
            product={null}
            whatsAppHref={whatsappShareUrl("Hi, I would like to book a studio visit.", shopWhatsApp)}
            upiId={upiId}
            upiBusinessName={upiBusinessName}
          />
        </div>
      </section>
    </>
  );
}
