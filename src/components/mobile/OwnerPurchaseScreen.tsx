import { useState } from "react";
import { OwnerPurchaseDashboard } from "./OwnerPurchaseDashboard";
import { OwnerPurchaseBillList } from "./OwnerPurchaseBillList";
import { OwnerPurchaseBillDetail } from "./OwnerPurchaseBillDetail";

type Screen = "dashboard" | "bills" | "detail";

export const OwnerPurchaseScreen = () => {
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
      <OwnerPurchaseBillDetail
        billId={selectedBillId}
        onBack={() => setScreen("bills")}
      />
    );
  }

  if (screen === "bills") {
    return (
      <OwnerPurchaseBillList
        period={period}
        customRange={customRange}
        onBack={() => setScreen("dashboard")}
        onViewBill={handleViewBill}
      />
    );
  }

  return (
    <OwnerPurchaseDashboard
      period={period}
      setPeriod={setPeriod}
      customRange={customRange}
      setCustomRange={setCustomRange}
      onViewAllBills={() => setScreen("bills")}
      onViewBill={handleViewBill}
    />
  );
};
