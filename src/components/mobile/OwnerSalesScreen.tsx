import { useState } from "react";
import { OwnerSalesDashboard } from "./OwnerSalesDashboard";
import { OwnerSalesBillList } from "./OwnerSalesBillList";
import { OwnerSalesBillDetail } from "./OwnerSalesBillDetail";

type Screen = "dashboard" | "bills" | "detail";

export const OwnerSalesScreen = () => {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [period, setPeriod] = useState<"today" | "week" | "month" | "custom">("today");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);

  const handleViewBill = (billId: string) => {
    setSelectedBillId(billId);
    setScreen("detail");
  };

  if (screen === "detail" && selectedBillId) {
    return (
      <OwnerSalesBillDetail
        billId={selectedBillId}
        onBack={() => setScreen("bills")}
      />
    );
  }

  if (screen === "bills") {
    return (
      <OwnerSalesBillList
        period={period}
        customRange={customRange}
        onBack={() => setScreen("dashboard")}
        onViewBill={handleViewBill}
      />
    );
  }

  return (
    <OwnerSalesDashboard
      period={period}
      setPeriod={setPeriod}
      customRange={customRange}
      setCustomRange={setCustomRange}
      onViewAllBills={() => setScreen("bills")}
      onViewBill={handleViewBill}
    />
  );
};
