import { useState } from "react";
import { OwnerStockOverview } from "./OwnerStockOverview";
import { OwnerStockProductDetail } from "./OwnerStockProductDetail";

type Screen = "overview" | "detail";

export const OwnerStockScreen = () => {
  const [screen, setScreen] = useState<Screen>("overview");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const handleViewProduct = (productId: string) => {
    setSelectedProductId(productId);
    setScreen("detail");
  };

  if (screen === "detail" && selectedProductId) {
    return (
      <OwnerStockProductDetail
        productId={selectedProductId}
        onBack={() => setScreen("overview")}
      />
    );
  }

  return <OwnerStockOverview onViewProduct={handleViewProduct} />;
};
