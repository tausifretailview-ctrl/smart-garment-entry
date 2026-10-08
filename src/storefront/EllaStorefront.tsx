import { useCallback, useEffect, useMemo, useState } from "react";
import { parseStorefrontPath, storefrontHomePath, storefrontProductPath } from "@/lib/storefrontPath";
import { publicStorefrontUrl, storefrontWhatsAppShareText, whatsappShareUrl } from "@/lib/storefrontShare";
import type { PublicStorefrontMenu, PublicStorefrontProduct, PublicStorefrontShop } from "@/lib/websiteTypes";
import type { PublicStorefrontSection } from "@/lib/websiteSections";
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
import { ellaWhatsAppNumber } from "./ellaWhatsApp";
import "./ella-storefront.css";

export function EllaStorefront({
  shop,
  orgSlug,
  products,
  sections = [],
  menus = [],
  initialProductId,
}: {
  shop: PublicStorefrontShop;
  orgSlug: string;
  products: PublicStorefrontProduct[];
  sections?: PublicStorefrontSection[];
  menus?: PublicStorefrontMenu[];
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
  const shareUrl = publicStorefrontUrl(window.location.origin, orgSlug);
  // Shops often save a bare 10-digit mobile; wa.me needs the 91 prefix.
  const shopWa = ellaWhatsAppNumber(shop.whatsapp_number) || null;
  const studioWa = shopWa ? whatsappShareUrl(storefrontWhatsAppShareText(shopName, shareUrl), shopWa) : null;

  return (
    <div className="ella-store">
      <EllaStorefrontHome
        shopName={shopName}
        orgSlug={orgSlug}
        whatsapp={shopWa}
        logoUrl={shop.logo_url}
        address={shop.address}
        instagramUrl={shop.instagram_url}
        facebookUrl={shop.facebook_url}
        products={ellaProducts}
        sections={sections}
        menus={menus}
        cartCount={cartCount}
        onOpenProduct={openProduct}
        onOpenGeneralEnquire={() => {
          setSelected(null);
          setCartOpen(false);
          setGeneralOpen(true);
        }}
        onOpenCart={openCart}
        onNavigate={() => {
          setSelected(null);
          setGeneralOpen(false);
          setCartOpen(false);
          window.history.replaceState({}, "", storefrontHomePath(orgSlug));
        }}
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
          shopWhatsApp={shopWa}
          product={selected}
          upiId={shop.upi_id}
          upiBusinessName={shop.upi_business_name || shopName}
          onClose={closeSheet}
        />
      ) : null}

      {generalOpen && !selected && !cartOpen ? (
        <GeneralEnquireSheet
          slug={orgSlug}
          shopName={shopName}
          shopWhatsApp={shopWa}
          upiId={shop.upi_id}
          upiBusinessName={shop.upi_business_name || shopName}
          onClose={closeSheet}
        />
      ) : null}

      {cartOpen ? (
        <EllaCartSheet
          slug={orgSlug}
          shopName={shopName}
          shopWhatsApp={shopWa}
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
  shopName,
  shopWhatsApp,
  upiId,
  upiBusinessName,
  onClose,
}: {
  slug: string;
  shopName: string;
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
            shopName={shopName}
            shopWhatsApp={shopWhatsApp}
            upiId={upiId}
            upiBusinessName={upiBusinessName}
          />
        </div>
      </section>
    </>
  );
}
