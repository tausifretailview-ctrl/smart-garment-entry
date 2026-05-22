import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { OwnerStockOverview } from "./OwnerStockOverview";
import { OwnerStockProductDetail } from "./OwnerStockProductDetail";

type Screen = "overview" | "detail";

export const OwnerStockScreen = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const productFromUrl = searchParams.get("product");
  const [screen, setScreen] = useState<Screen>(productFromUrl ? "detail" : "overview");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(productFromUrl);

  useEffect(() => {
    if (productFromUrl) {
      setSelectedProductId(productFromUrl);
      setScreen("detail");
    }
  }, [productFromUrl]);

  const handleViewProduct = (productId: string) => {
    setSelectedProductId(productId);
    setScreen("detail");
  };

  if (screen === "detail" && selectedProductId) {
    return (
      <OwnerStockProductDetail
        productId={selectedProductId}
        onBack={() => {
          setScreen("overview");
          setSelectedProductId(null);
          if (searchParams.has("product")) {
            const next = new URLSearchParams(searchParams);
            next.delete("product");
            setSearchParams(next, { replace: true });
          }
        }}
      />
    );
  }

  return <OwnerStockOverview onViewProduct={handleViewProduct} />;
};
