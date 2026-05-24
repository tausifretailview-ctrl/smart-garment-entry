import { useEffect, useMemo, useState } from "react";
import { Banknote, ChevronDown, ChevronUp, History } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import { useAccountsVoucherData, type AccountsPaymentTabId } from "@/hooks/useAccountsVoucherData";
import { useAccountsPaymentDialogs } from "@/hooks/useAccountsPaymentDialogs";
import { AccountsPaymentDialogs } from "@/components/accounts/AccountsPaymentDialogs";
import { CustomerPaymentTab } from "@/components/accounts/CustomerPaymentTab";
import { SupplierPaymentTab } from "@/components/accounts/SupplierPaymentTab";
import { EmployeeSalaryTab } from "@/components/accounts/EmployeeSalaryTab";
import { ExpensesTab } from "@/components/accounts/ExpensesTab";
import { PaymentTransactionHistoryPanel } from "@/components/accounts/PaymentTransactionHistoryPanel";
import { AddAdvanceBookingDialog } from "@/components/AddAdvanceBookingDialog";
import { Button } from "@/components/ui/button";
import { filterVouchersForPaymentTab } from "@/utils/paymentVoucherFilters";
import { cn } from "@/lib/utils";

const HISTORY_TAB_LABELS: Record<AccountsPaymentTabId, string> = {
  "customer-payment": "Customer receipts",
  "supplier-payment": "Supplier payments",
  expenses: "Expenses",
  "employee-salary": "Salary payments",
};

interface FloatingAccountsPaymentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FloatingAccountsPaymentsDialog({
  open,
  onOpenChange,
}: FloatingAccountsPaymentsDialogProps) {
  const { currentOrganization } = useOrganization();
  const { data: settings } = useSettings();
  const orgId = currentOrganization?.id;

  const [activeTab, setActiveTab] = useState<AccountsPaymentTabId>("customer-payment");
  const [navIndex, setNavIndex] = useState<number | null>(null);
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);

  const paymentDialogs = useAccountsPaymentDialogs(settings);
  const { vouchers, sales, customers, suppliers, employees } = useAccountsVoucherData(
    orgId,
    activeTab,
    open,
    true
  );

  useEffect(() => {
    if (!open) {
      setNavIndex(null);
      setActiveTab("customer-payment");
      setShowPaymentHistory(false);
    }
  }, [open]);

  useEffect(() => {
    setNavIndex(null);
    setShowPaymentHistory(false);
  }, [activeTab]);

  const historyRecordCount = useMemo(() => {
    if (!vouchers) return 0;
    return filterVouchersForPaymentTab(activeTab, vouchers).length;
  }, [activeTab, vouchers]);

  if (!orgId) return null;

  const tabContentClass = cn(
    "min-h-0 mt-0 outline-none data-[state=inactive]:hidden flex flex-col",
    showPaymentHistory ? "flex-[3]" : "flex-1"
  );
  const tabScrollClass = cn(
    "h-full border rounded-md bg-background",
    showPaymentHistory ? "max-h-[52vh]" : "flex-1 min-h-0"
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[min(1280px,95vw)] w-[95vw] max-h-[92vh] h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0 px-4 pt-4 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Banknote className="h-5 w-5" />
              Payments — Collect &amp; Pay
            </DialogTitle>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as AccountsPaymentTabId)}
            className="flex-1 flex flex-col min-h-0 overflow-hidden"
          >
            <TabsList className="shrink-0 mx-4 mt-2 grid grid-cols-4 h-9">
              <TabsTrigger value="customer-payment" className="text-xs">
                Customer Payment
              </TabsTrigger>
              <TabsTrigger value="supplier-payment" className="text-xs">
                Supplier Payment
              </TabsTrigger>
              <TabsTrigger value="expenses" className="text-xs">
                Expenses
              </TabsTrigger>
              <TabsTrigger value="employee-salary" className="text-xs">
                Employee Salary
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-4 pb-2 pt-2 gap-2">
              <TabsContent value="customer-payment" className={tabContentClass}>
                <ScrollArea className={tabScrollClass}>
                  <div className="p-3">
                    <CustomerPaymentTab
                      embedded
                      organizationId={orgId}
                      vouchers={vouchers}
                      sales={sales}
                      customers={customers}
                      settings={settings}
                      onShowReceipt={paymentDialogs.handleShowReceipt}
                      onShowAdvanceDialog={() => setShowAdvanceDialog(true)}
                      onEditPayment={paymentDialogs.openEditPaymentDialog}
                    />
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="supplier-payment" className={tabContentClass}>
                <ScrollArea className={tabScrollClass}>
                  <div className="p-3">
                    <SupplierPaymentTab
                      embedded
                      organizationId={orgId}
                      vouchers={vouchers}
                      suppliers={suppliers}
                      onEditPayment={paymentDialogs.openEditPaymentDialog}
                    />
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="expenses" className={tabContentClass}>
                <ScrollArea className={tabScrollClass}>
                  <div className="p-3">
                    <ExpensesTab embedded organizationId={orgId} vouchers={vouchers} />
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="employee-salary" className={tabContentClass}>
                <ScrollArea className={tabScrollClass}>
                  <div className="p-3">
                    <EmployeeSalaryTab embedded organizationId={orgId} vouchers={vouchers} />
                  </div>
                </ScrollArea>
              </TabsContent>

              {showPaymentHistory ? (
                <div className="flex flex-col flex-[2] min-h-[28vh] max-h-[40vh] shrink-0 rounded-md border overflow-hidden bg-background">
                  <div className="shrink-0 px-2 py-1 border-b bg-muted/30 flex justify-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1.5 text-muted-foreground"
                      onClick={() => setShowPaymentHistory(false)}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                      Hide {HISTORY_TAB_LABELS[activeTab]}
                    </Button>
                  </div>
                  <div className="flex-1 min-h-0">
                    <PaymentTransactionHistoryPanel
                      tab={activeTab}
                      vouchers={vouchers}
                      sales={sales}
                      customers={customers}
                      suppliers={suppliers}
                      employees={employees}
                      navIndex={navIndex}
                      onNavIndexChange={setNavIndex}
                      onShowReceipt={paymentDialogs.handleShowReceipt}
                      onEditPayment={paymentDialogs.openEditPaymentDialog}
                    />
                  </div>
                </div>
              ) : (
                <div className="shrink-0 flex justify-center py-1.5 border-t bg-muted/20">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => setShowPaymentHistory(true)}
                  >
                    <History className="h-3.5 w-3.5" />
                    Show {HISTORY_TAB_LABELS[activeTab]}
                    <span className="text-muted-foreground">
                      ({historyRecordCount.toLocaleString("en-IN")})
                    </span>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AccountsPaymentDialogs dialogs={paymentDialogs} compactEdit />
      <AddAdvanceBookingDialog
        open={showAdvanceDialog}
        onOpenChange={setShowAdvanceDialog}
        organizationId={orgId}
      />
    </>
  );
}
