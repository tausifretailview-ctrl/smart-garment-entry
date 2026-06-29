import { useState } from "react";
import { OwnerSalesDashboard } from "./OwnerSalesDashboard";
import { OwnerSalesBillList } from "./OwnerSalesBillList";
import { MobileSalePrintPreviewDialog } from "./MobileSalePrintPreviewDialog";

type Screen = "dashboard" | "bills";

export const OwnerSalesScreen = () => {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [previewSaleId, setPreviewSaleId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [period, setPeriod] = useState<"today" | "week" | "month" | "custom">("today");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);

  const handleViewBill = (billId: string) => {
    setPreviewSaleId(billId);
    setPreviewOpen(true);
  };

  if (screen === "bills") {
    return (
      <>
        <OwnerSalesBillList
          period={period}
          customRange={customRange}
          onBack={() => setScreen("dashboard")}
          onViewBill={handleViewBill}
        />
        <MobileSalePrintPreviewDialog
          saleId={previewSaleId}
          open={previewOpen}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) setPreviewSaleId(null);
          }}
        />
      </>
    );
  }

  return (
    <>
      <OwnerSalesDashboard
        period={period}
        setPeriod={setPeriod}
        customRange={customRange}
        setCustomRange={setCustomRange}
        onViewAllBills={() => setScreen("bills")}
        onViewBill={handleViewBill}
      />
      <MobileSalePrintPreviewDialog
        saleId={previewSaleId}
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setPreviewSaleId(null);
        }}
      />
    </>
  );
};
