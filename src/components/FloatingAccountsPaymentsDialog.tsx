import { useEffect, useState } from "react";
import { Banknote } from "lucide-react";
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
    }
  }, [open]);

  useEffect(() => {
    setNavIndex(null);
  }, [activeTab]);

  if (!orgId) return null;

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
              <TabsContent
                value="customer-payment"
                className="flex-[3] min-h-0 mt-0 outline-none data-[state=inactive]:hidden"
              >
                <ScrollArea className="h-full max-h-[52vh] border rounded-md bg-background">
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
              <TabsContent
                value="supplier-payment"
                className="flex-[3] min-h-0 mt-0 outline-none data-[state=inactive]:hidden"
              >
                <ScrollArea className="h-full max-h-[52vh] border rounded-md bg-background">
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
              <TabsContent
                value="expenses"
                className="flex-[3] min-h-0 mt-0 outline-none data-[state=inactive]:hidden"
              >
                <ScrollArea className="h-full max-h-[52vh] border rounded-md bg-background">
                  <div className="p-3">
                    <ExpensesTab embedded organizationId={orgId} vouchers={vouchers} />
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent
                value="employee-salary"
                className="flex-[3] min-h-0 mt-0 outline-none data-[state=inactive]:hidden"
              >
                <ScrollArea className="h-full max-h-[52vh] border rounded-md bg-background">
                  <div className="p-3">
                    <EmployeeSalaryTab embedded organizationId={orgId} vouchers={vouchers} />
                  </div>
                </ScrollArea>
              </TabsContent>

              <div className="flex-[2] min-h-[32vh] shrink-0 rounded-md border overflow-hidden bg-background">
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
