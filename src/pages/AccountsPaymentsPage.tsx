import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Banknote, ChevronDown, ChevronUp, History } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import {
  useAccountsVoucherData,
  type AccountsPaymentTabId,
} from "@/hooks/useAccountsVoucherData";
import { useAccountsPaymentDialogs } from "@/hooks/useAccountsPaymentDialogs";
import { AccountsPaymentDialogs } from "@/components/accounts/AccountsPaymentDialogs";
import { CustomerPaymentTab } from "@/components/accounts/CustomerPaymentTab";
import { SupplierPaymentTab } from "@/components/accounts/SupplierPaymentTab";
import { EmployeeSalaryTab } from "@/components/accounts/EmployeeSalaryTab";
import { ExpensesTab } from "@/components/accounts/ExpensesTab";
import { PaymentTransactionHistoryPanel } from "@/components/accounts/PaymentTransactionHistoryPanel";
import { AddAdvanceBookingDialog } from "@/components/AddAdvanceBookingDialog";
import { filterVouchersForPaymentTab } from "@/utils/paymentVoucherFilters";
import { cn } from "@/lib/utils";

const TAB_IDS: AccountsPaymentTabId[] = [
  "customer-payment",
  "supplier-payment",
  "expenses",
  "employee-salary",
];

const TAB_LABELS: Record<AccountsPaymentTabId, string> = {
  "customer-payment": "Customer Payment",
  "supplier-payment": "Supplier Payment",
  expenses: "Expenses",
  "employee-salary": "Employee Salary",
};

const HISTORY_TAB_LABELS: Record<AccountsPaymentTabId, string> = {
  "customer-payment": "Customer receipts",
  "supplier-payment": "Supplier payments",
  expenses: "Expenses",
  "employee-salary": "Salary payments",
};

const TAB_TRIGGER_CLASS =
  "h-10 px-3 text-sm font-semibold shrink-0 rounded-md data-[state=active]:bg-teal-700 data-[state=active]:text-white data-[state=inactive]:text-slate-600";

function parseTabParam(value: string | null): AccountsPaymentTabId {
  if (value && TAB_IDS.includes(value as AccountsPaymentTabId)) {
    return value as AccountsPaymentTabId;
  }
  return "customer-payment";
}

export default function AccountsPaymentsPage() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: settings } = useSettings();
  const orgId = currentOrganization?.id;

  const [activeTab, setActiveTab] = useState<AccountsPaymentTabId>(() =>
    parseTabParam(searchParams.get("tab")),
  );
  const [navIndex, setNavIndex] = useState<number | null>(null);
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const paymentDialogs = useAccountsPaymentDialogs(settings);
  const { vouchers, sales, customers, suppliers, employees } = useAccountsVoucherData(
    orgId,
    activeTab,
    true,
    true,
  );

  useEffect(() => {
    const fromUrl = parseTabParam(searchParams.get("tab"));
    if (fromUrl !== activeTab) setActiveTab(fromUrl);
  }, [searchParams, activeTab]);

  useEffect(() => {
    setNavIndex(null);
    setHistoryOpen(false);
  }, [activeTab]);

  const historyRecordCount = useMemo(() => {
    if (!vouchers) return 0;
    return filterVouchersForPaymentTab(activeTab, vouchers).length;
  }, [activeTab, vouchers]);

  const handleTabChange = (value: string) => {
    const tab = parseTabParam(value);
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    orgNavigate("/");
  };

  if (!orgId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Select an organization to record payments.
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "accounts-payments-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full",
        )}
      >
        <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
          {/* Toolbar — Vasy ERP style */}
          <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 text-sm shrink-0"
                onClick={handleBack}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                  <Banknote className="h-5 w-5 shrink-0" />
                  Payments — Collect &amp; Pay
                </h1>
                <p className="text-sm text-muted-foreground mt-1 truncate">
                  Record customer receipts, supplier payments, expenses &amp; salary
                </p>
              </div>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="flex flex-1 flex-col min-h-0 overflow-hidden gap-2"
          >
            <TabsList className="shrink-0 w-full h-auto p-1 bg-white border border-slate-200 rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-1">
              {TAB_IDS.map((tab) => (
                <TabsTrigger key={tab} value={tab} className={TAB_TRIGGER_CLASS}>
                  {TAB_LABELS[tab]}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Entry form — primary pane; expands when history is collapsed */}
            <Card
              className={cn(
                "min-h-0 flex flex-col overflow-hidden rounded-lg border border-slate-200 shadow-sm p-0",
                historyOpen ? "flex-[3]" : "flex-1",
              )}
            >
              <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3">
                <TabsContent value="customer-payment" className="mt-0 outline-none data-[state=inactive]:hidden">
                  <CustomerPaymentTab
                    fullPage
                    organizationId={orgId}
                    vouchers={vouchers}
                    sales={sales}
                    customers={customers}
                    settings={settings}
                    onShowReceipt={paymentDialogs.handleShowReceipt}
                    onShowAdvanceDialog={() => setShowAdvanceDialog(true)}
                    onEditPayment={paymentDialogs.openEditPaymentDialog}
                  />
                </TabsContent>
                <TabsContent value="supplier-payment" className="mt-0 outline-none data-[state=inactive]:hidden">
                  <SupplierPaymentTab
                    fullPage
                    organizationId={orgId}
                    vouchers={vouchers}
                    suppliers={suppliers}
                    onEditPayment={paymentDialogs.openEditPaymentDialog}
                  />
                </TabsContent>
                <TabsContent value="expenses" className="mt-0 outline-none data-[state=inactive]:hidden">
                  <ExpensesTab
                    fullPage
                    organizationId={orgId}
                    vouchers={vouchers}
                    onExpenseRecorded={() => {
                      setHistoryOpen(true);
                      setNavIndex(0);
                    }}
                  />
                </TabsContent>
                <TabsContent value="employee-salary" className="mt-0 outline-none data-[state=inactive]:hidden">
                  <EmployeeSalaryTab fullPage organizationId={orgId} vouchers={vouchers} />
                </TabsContent>
              </div>
            </Card>

            {/* History — collapsed by default; click to expand */}
            {historyOpen ? (
              <Card className="flex-[2] min-h-[220px] flex flex-col overflow-hidden rounded-lg border border-slate-200 shadow-sm p-0">
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="shrink-0 flex w-full items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white text-left hover:bg-slate-50 transition-colors"
                >
                  <History className="h-4 w-4 text-teal-700 shrink-0" />
                  <span className="text-sm font-semibold text-slate-800">
                    {HISTORY_TAB_LABELS[activeTab]}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ({historyRecordCount.toLocaleString("en-IN")})
                  </span>
                  <span className="ml-auto flex items-center gap-1 text-xs text-teal-700 font-medium shrink-0">
                    Hide
                    <ChevronUp className="h-4 w-4" />
                  </span>
                </button>
                <div className="flex-1 min-h-0">
                  <PaymentTransactionHistoryPanel
                    tab={activeTab}
                    vouchers={vouchers}
                    sales={sales}
                    customers={customers}
                    suppliers={suppliers}
                    employees={employees}
                    organizationId={orgId}
                    navIndex={navIndex}
                    onNavIndexChange={setNavIndex}
                    onShowReceipt={paymentDialogs.handleShowReceipt}
                    onEditPayment={paymentDialogs.openEditPaymentDialog}
                  />
                </div>
              </Card>
            ) : (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="shrink-0 flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm hover:bg-slate-50 hover:border-teal-200 transition-colors"
              >
                <History className="h-4 w-4 text-teal-700 shrink-0" />
                <span className="text-sm font-semibold text-slate-800">
                  {HISTORY_TAB_LABELS[activeTab]}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  ({historyRecordCount.toLocaleString("en-IN")})
                </span>
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  Click to view
                  <ChevronDown className="h-4 w-4" />
                </span>
              </button>
            )}
          </Tabs>
        </div>
      </div>

      <AccountsPaymentDialogs dialogs={paymentDialogs} compactEdit />
      <AddAdvanceBookingDialog
        open={showAdvanceDialog}
        onOpenChange={setShowAdvanceDialog}
        organizationId={orgId}
      />
    </>
  );
}
