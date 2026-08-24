import { useCallback, useEffect, useMemo, useState } from "react";
import { parseStorefrontPath, storefrontHomePath, storefrontProductPath } from "@/lib/storefrontPath";
import type { PublicStorefrontProduct, PublicStorefrontShop } from "@/lib/websiteTypes";
import { toEllaStorefrontProduct, type EllaStorefrontProduct } from "./ellaProduct";
import { EllaEnquirySheet } from "./EllaEnquirySheet";
import { EllaEnquiryForm } from "./EllaEnquiryForm";
import { EllaStorefrontHome } from "./EllaStorefrontHome";
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

  useEffect(() => {
    if (initialProductId) setSelected(findById(initialProductId));
  }, [findById, initialProductId]);

  const openProduct = (product: EllaStorefrontProduct) => {
    setGeneralOpen(false);
    setSelected(product);
    window.history.pushState({ ellaSheet: product.productId }, "", storefrontProductPath(orgSlug, product.productId));
  };

  const closeSheet = useCallback(() => {
    setSelected(null);
    setGeneralOpen(false);
    window.history.replaceState({}, "", storefrontHomePath(orgSlug));
  }, [orgSlug]);

  useEffect(() => {
    const onPop = () => {
      const parsed = parseStorefrontPath(window.location.pathname);
      const next = findById(parsed?.productId || null);
      setSelected(next);
      if (!next) setGeneralOpen(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [findById]);

  return (
    <div className="ella-store">
      <EllaStorefrontHome
        shopName={shop.display_name || shop.name}
        orgSlug={orgSlug}
        whatsapp={shop.whatsapp_number}
        products={ellaProducts}
        onOpenProduct={openProduct}
        onOpenGeneralEnquire={() => {
          setSelected(null);
          setGeneralOpen(true);
        }}
      />

      {selected ? (
        <EllaEnquirySheet
          slug={orgSlug}
          shopWhatsApp={shop.whatsapp_number}
          product={selected}
          onClose={closeSheet}
        />
      ) : null}

      {generalOpen && !selected ? <GeneralEnquireSheet slug={orgSlug} onClose={closeSheet} /> : null}
    </div>
  );
}

function GeneralEnquireSheet({ slug, onClose }: { slug: string; onClose: () => void }) {
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
          <EllaEnquiryForm slug={slug} product={null} />
        </div>
      </section>
    </>
  );
}
