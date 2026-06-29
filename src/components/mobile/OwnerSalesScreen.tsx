import { useState } from "react";
import { OwnerSalesDashboard } from "./OwnerSalesDashboard";
import { OwnerSalesBillList } from "./OwnerSalesBillList";
import { MobileInvoiceDetail } from "./MobileInvoiceDetail";
import { mobilePageScrollWithNavClass } from "@/lib/mobileShell";
import { cn } from "@/lib/utils";

type Screen = "dashboard" | "bills";

const SalesScroll = ({ children }: { children: React.ReactNode }) => (
  <div className={cn(mobilePageScrollWithNavClass, "bg-muted/30")}>{children}</div>
);

export const OwnerSalesScreen = () => {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [period, setPeriod] = useState<"today" | "week" | "month" | "custom">("today");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);

  const handleViewBill = (billId: string) => {
    setDetailSaleId(billId);
    setDetailOpen(true);
  };

  if (screen === "bills") {
    return (
      <>
        <SalesScroll>
          <OwnerSalesBillList
            period={period}
            customRange={customRange}
            onBack={() => setScreen("dashboard")}
            onViewBill={handleViewBill}
          />
        </SalesScroll>
        <MobileInvoiceDetail
          saleId={detailSaleId}
          open={detailOpen}
          onOpenChange={(open) => {
            setDetailOpen(open);
            if (!open) setDetailSaleId(null);
          }}
        />
      </>
    );
  }

  return (
    <>
      <SalesScroll>
        <OwnerSalesDashboard
          period={period}
          setPeriod={setPeriod}
          customRange={customRange}
          setCustomRange={setCustomRange}
          onViewAllBills={() => setScreen("bills")}
          onViewBill={handleViewBill}
        />
      </SalesScroll>
      <MobileInvoiceDetail
        saleId={detailSaleId}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetailSaleId(null);
        }}
      />
    </>
  );
};
