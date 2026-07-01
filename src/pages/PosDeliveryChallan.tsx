import { useEffect, useState } from "react";
import {
  Banknote,
  Clock,
  CreditCard,
  Printer,
  RotateCcw,
  Smartphone,
  Truck,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isGlobalShortcutBlocked } from "@/lib/keyboardShortcuts";
import { useOrganization } from "@/contexts/OrganizationContext";
import { usePosDC } from "@/contexts/PosDCContext";
import { usePosDeliveryChallan } from "@/hooks/usePosDeliveryChallan";
import { PosDeliveryChallanWorkspace } from "@/components/pos-dc/PosDeliveryChallanWorkspace";
import { FloatingPOSReports } from "@/components/FloatingPOSReports";
import { FloatingSaleReturn } from "@/components/FloatingSaleReturn";
import { useEntryViewportSync } from "@/hooks/useEntryViewportSync";

export default function PosDeliveryChallan() {
  useEntryViewportSync();
  const { currentOrganization } = useOrganization();
  const dc = usePosDeliveryChallan({ enabled: true });
  const {
    setOnNewChallan,
    setOnClearCart,
    setOnOpenCashierReport,
    setOnOpenStockReport,
    setOnOpenSaleReturn,
    setOnReprintLast,
    setHasItems,
    setCanReprint,
    setIsSaving,
  } = usePosDC();

  const [showFloatingCashierReport, setShowFloatingCashierReport] = useState(false);
  const [showFloatingSaleReturn, setShowFloatingSaleReturn] = useState(false);
  const [showFloatingStockReport, setShowFloatingStockReport] = useState(false);

  useEffect(() => {
    setOnNewChallan(dc.resetChallan);
    setOnClearCart(dc.resetChallan);
    setOnOpenCashierReport(() => () => setShowFloatingCashierReport(true));
    setOnOpenStockReport(() => () => setShowFloatingStockReport(true));
    setOnOpenSaleReturn(() => () => setShowFloatingSaleReturn(true));
    setOnReprintLast(dc.handleReprintLast);
    setHasItems(dc.items.length > 0);
    setCanReprint(dc.hasSavedForReprint);
    setIsSaving(dc.isSavingDC);
    return () => {
      setOnNewChallan(null);
      setOnClearCart(null);
      setOnOpenCashierReport(null);
      setOnOpenStockReport(null);
      setOnOpenSaleReturn(null);
      setOnReprintLast(null);
    };
  }, [
    dc.items.length,
    dc.isSavingDC,
    dc.resetChallan,
    dc.handleReprintLast,
    dc.hasSavedForReprint,
    setOnNewChallan,
    setOnClearCart,
    setOnOpenCashierReport,
    setOnOpenStockReport,
    setOnOpenSaleReturn,
    setOnReprintLast,
    setHasItems,
    setCanReprint,
    setIsSaving,
  ]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!window.location.pathname.includes("/pos-delivery-challan")) return;
      if (isGlobalShortcutBlocked()) return;
      if (dc.isSavingDC) return;

      if (e.key === "F1") {
        e.preventDefault();
        dc.setPaymentMethod("cash");
        void dc.handleSaveDC("cash");
      } else if (e.key === "F2") {
        e.preventDefault();
        dc.setPaymentMethod("upi");
        void dc.handleSaveDC("upi");
      } else if (e.key === "F3") {
        e.preventDefault();
        dc.setPaymentMethod("card");
        void dc.handleSaveDC("card");
      } else if (e.key === "F4") {
        e.preventDefault();
        dc.setPaymentMethod("pay_later");
        void dc.handleSaveDC("pay_later");
      } else if (e.key === "F5") {
        e.preventDefault();
        setShowFloatingSaleReturn(true);
      } else if (e.key === "F8") {
        e.preventDefault();
        setShowFloatingCashierReport(true);
      } else if (e.key === "F11") {
        e.preventDefault();
        setShowFloatingStockReport(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (dc.items.length > 0) dc.resetChallan();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [dc]);

  useEffect(() => {
    document.body.classList.add("pos-hide-toasts");
    document.body.classList.add("pos-large-ui");
    return () => {
      document.body.classList.remove("pos-hide-toasts");
      document.body.classList.remove("pos-large-ui");
    };
  }, []);

  const paymentBtn = (
    method: "cash" | "upi" | "card" | "pay_later",
    label: string,
    icon: React.ReactNode,
    fKey: string,
    color: string,
  ) => (
    <Button
      onClick={() => {
        dc.setPaymentMethod(method);
        void dc.handleSaveDC(method);
      }}
      disabled={dc.items.length === 0 || dc.isSavingDC}
      className={cn(
        "h-[60px] flex flex-col items-center justify-center gap-1 text-[12px] font-semibold relative w-full rounded-lg active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40",
        color,
      )}
      title={`${label} — Save & Print (${fKey})`}
    >
      <Badge className="absolute top-0.5 right-0.5 h-[14px] px-1 text-[8px] leading-[14px] bg-black/50 text-white/90 rounded-sm">
        {fKey}
      </Badge>
      {icon}
      <span>{label}</span>
    </Button>
  );

  return (
    <>
      <div className="pos-sales-workspace flex-1 min-h-0 h-full w-full bg-background flex items-stretch overflow-hidden pos-desktop-readable">
        <div className="w-[88px] self-stretch min-h-0 bg-orange-50 dark:bg-orange-950/30 border-r border-orange-200/60 flex flex-col gap-1.5 p-1.5 z-30 overflow-y-auto shrink-0">
          <div className="space-y-1.5">
            {paymentBtn("cash", "Cash", <Banknote className="h-4 w-4" />, "F1", "bg-green-500 hover:bg-green-600")}
            {paymentBtn("upi", "UPI", <Smartphone className="h-4 w-4" />, "F2", "bg-purple-500 hover:bg-purple-600")}
            {paymentBtn("card", "Card", <CreditCard className="h-4 w-4" />, "F3", "bg-cyan-500 hover:bg-cyan-600")}
            {paymentBtn("pay_later", "Credit", <Clock className="h-4 w-4" />, "F4", "bg-orange-500 hover:bg-orange-600")}

            <Button
              onClick={() => setShowFloatingSaleReturn(true)}
              className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold relative w-full rounded-lg bg-red-500 hover:bg-red-600 text-white"
            >
              <Badge className="absolute top-0.5 right-0.5 h-[14px] px-1 text-[8px] leading-[14px] bg-black/50 text-white/90 rounded-sm">
                F5
              </Badge>
              <RotateCcw className="h-4 w-4" />
              <span>S/R</span>
            </Button>

            <Button
              onClick={dc.resetChallan}
              className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold relative w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              <Truck className="h-4 w-4" />
              <span>New</span>
            </Button>

            <Button
              onClick={dc.handleReprintLast}
              disabled={!dc.hasSavedForReprint}
              className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold w-full rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-40"
            >
              <Printer className="h-4 w-4" />
              <span>Reprint</span>
            </Button>

            <Button
              onClick={dc.resetChallan}
              disabled={dc.items.length === 0}
              className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold relative w-full rounded-lg bg-rose-500 hover:bg-rose-600 text-white disabled:opacity-40"
            >
              <Badge className="absolute top-0.5 right-0.5 h-[14px] px-1 text-[8px] leading-[14px] bg-black/50 text-white/90 rounded-sm">
                ESC
              </Badge>
              <X className="h-4 w-4" />
              <span>Clear</span>
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 h-full w-0 overflow-hidden flex flex-col">
          <PosDeliveryChallanWorkspace dc={dc} variant="page" />
        </div>
      </div>

      <FloatingPOSReports
        showCashierReport={showFloatingCashierReport}
        onCloseCashierReport={() => setShowFloatingCashierReport(false)}
        showStockReport={showFloatingStockReport}
        onCloseStockReport={() => setShowFloatingStockReport(false)}
      />
      {currentOrganization?.id && (
        <FloatingSaleReturn
          open={showFloatingSaleReturn}
          onOpenChange={setShowFloatingSaleReturn}
          organizationId={currentOrganization.id}
          customerId={dc.customerId || undefined}
          customerName={dc.customerName || undefined}
          onReturnSaved={() => setShowFloatingSaleReturn(false)}
        />
      )}
    </>
  );
}
