import { useState } from "react";
import { OwnerPurchaseDashboard } from "./OwnerPurchaseDashboard";
import { OwnerPurchaseBillList } from "./OwnerPurchaseBillList";
import { OwnerPurchaseBillDetail } from "./OwnerPurchaseBillDetail";
import { mobilePageScrollWithNavClass } from "@/lib/mobileShell";
import { cn } from "@/lib/utils";

type Screen = "dashboard" | "bills" | "detail";

const PurchaseScroll = ({ children }: { children: React.ReactNode }) => (
  <div className={cn(mobilePageScrollWithNavClass, "bg-muted/30")}>{children}</div>
);

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
      <PurchaseScroll>
        <OwnerPurchaseBillDetail
          billId={selectedBillId}
          onBack={() => setScreen("bills")}
        />
      </PurchaseScroll>
    );
  }

  if (screen === "bills") {
    return (
      <PurchaseScroll>
        <OwnerPurchaseBillList
          period={period}
          customRange={customRange}
          onBack={() => setScreen("dashboard")}
          onViewBill={handleViewBill}
        />
      </PurchaseScroll>
    );
  }

  return (
    <PurchaseScroll>
      <OwnerPurchaseDashboard
      period={period}
      setPeriod={setPeriod}
      customRange={customRange}
      setCustomRange={setCustomRange}
      onViewAllBills={() => setScreen("bills")}
      onViewBill={handleViewBill}
    />
    </PurchaseScroll>
  );
};
