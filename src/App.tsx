import { useState, useEffect, lazy, Suspense } from "react";
import { RootErrorBoundary } from "@/components/RootErrorBoundary";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { WindowTabsProvider } from "@/contexts/WindowTabsContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import { OrgLayout } from "@/components/OrgLayout";
import { OrganizationSetup } from "@/components/OrganizationSetup";
import { Layout } from "@/components/Layout";
import { FullScreenLayout } from "@/components/FullScreenLayout";
import { POSLayout } from "@/components/POSLayout";
import { SchoolFeatureGate } from "./components/school/SchoolFeatureGate";
import { getStoredOrgSlug } from "@/lib/orgSlug";
import InstallApp from "./pages/InstallApp";

// Auto-retry lazy imports to handle chunk failures after deployments
function lazyWithRetry(importFn: () => Promise<any>) {
  return lazy(() =>
    importFn().catch((error) => {
      const reloadCount = parseInt(
        sessionStorage.getItem("chunk_reload_count") || "0"
      );
      if (reloadCount < 1) {
        // First failure — try one reload
        sessionStorage.setItem("chunk_reload_count", String(reloadCount + 1));
        window.location.reload();
        return new Promise(() => {}); // suspend while reload happens
      }
      // Already reloaded once — don't loop, let error boundary catch it
      throw error;
    })
  );
}

// Lazy-loaded page components for code splitting
const OrganizationManagement = lazyWithRetry(() => import("./pages/OrganizationManagement"));
const Index = lazyWithRetry(() => import("./pages/Index"));
const ProductDashboard = lazyWithRetry(() => import("./pages/ProductDashboard"));
const ProductEntry = lazyWithRetry(() => import("./pages/ProductEntry"));
const PurchaseEntry = lazyWithRetry(() => import("./pages/PurchaseEntry"));
const PurchaseBillDashboard = lazyWithRetry(() => import("./pages/PurchaseBillDashboard"));
const PurchaseReturnDashboard = lazyWithRetry(() => import("./pages/PurchaseReturnDashboard"));
const PurchaseReturnEntry = lazyWithRetry(() => import("./pages/PurchaseReturnEntry"));
const BarcodePrinting = lazyWithRetry(() => import("./pages/BarcodePrinting"));
const StockReport = lazyWithRetry(() => import("./pages/StockReport"));
const Settings = lazyWithRetry(() => import("./pages/Settings"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));
const POSSales = lazyWithRetry(() => import("./pages/POSSales"));
const POSDashboard = lazyWithRetry(() => import("./pages/POSDashboard"));
const SalesInvoice = lazyWithRetry(() => import("./pages/SalesInvoice"));
const SalesInvoiceDashboard = lazyWithRetry(() => import("./pages/SalesInvoiceDashboard"));
const SaleReturnEntry = lazyWithRetry(() => import("./pages/SaleReturnEntry"));
const SaleReturnDashboard = lazyWithRetry(() => import("./pages/SaleReturnDashboard"));
const QuotationEntry = lazyWithRetry(() => import("./pages/QuotationEntry"));
const QuotationDashboard = lazyWithRetry(() => import("./pages/QuotationDashboard"));
const SaleOrderEntry = lazyWithRetry(() => import("./pages/SaleOrderEntry"));
const SaleOrderDashboard = lazyWithRetry(() => import("./pages/SaleOrderDashboard"));
const PurchaseOrderEntry = lazyWithRetry(() => import("./pages/PurchaseOrderEntry"));
const PurchaseOrderDashboard = lazyWithRetry(() => import("./pages/PurchaseOrderDashboard"));
const CustomerMaster = lazyWithRetry(() => import("./pages/CustomerMaster"));
const SupplierMaster = lazyWithRetry(() => import("./pages/SupplierMaster"));
const EmployeeMaster = lazyWithRetry(() => import("./pages/EmployeeMaster"));
const PurchaseReportBySupplier = lazyWithRetry(() => import("./pages/PurchaseReportBySupplier"));
const SalesReportByCustomer = lazyWithRetry(() => import("./pages/SalesReportByCustomer"));
const ProductTrackingReport = lazyWithRetry(() => import("./pages/ProductTrackingReport"));
const DailyCashierReport = lazyWithRetry(() => import("./pages/DailyCashierReport"));
const DailyTallyDashboard = lazyWithRetry(() => import("./pages/DailyTallyDashboard"));
const AuditLog = lazyWithRetry(() => import("./pages/AuditLog"));
const Accounts = lazyWithRetry(() => import("./pages/Accounts"));
const ChartOfAccounts = lazyWithRetry(() => import("./pages/accounts/ChartOfAccounts"));
const JournalVouchers = lazyWithRetry(() => import("./pages/accounts/JournalVouchers"));
const DeliveryDashboard = lazyWithRetry(() => import("./pages/DeliveryDashboard"));
const PaymentsDashboard = lazyWithRetry(() => import("./pages/PaymentsDashboard"));
const UserRights = lazyWithRetry(() => import("./pages/UserRights"));
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const OrgAuth = lazyWithRetry(() => import("./pages/OrgAuth"));
const FieldSalesAuth = lazyWithRetry(() => import("./pages/FieldSalesAuth"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const PlatformAdmin = lazyWithRetry(() => import("./pages/PlatformAdmin"));
const PublicInvoiceView = lazyWithRetry(() => import("./pages/PublicInvoiceView"));
const PublicPaymentPage = lazyWithRetry(() => import("./pages/PublicPaymentPage"));
const ItemWiseSalesReport = lazyWithRetry(() => import("./pages/ItemWiseSalesReport"));
const ItemWiseStockReport = lazyWithRetry(() => import("./pages/ItemWiseStockReport"));
const PriceHistoryReport = lazyWithRetry(() => import("./pages/PriceHistoryReport"));
const GSTSalePurchaseRegister = lazyWithRetry(() => import("./pages/GSTSalePurchaseRegister"));
const GSTReports = lazyWithRetry(() => import("./pages/GSTReports"));
const TallyExport = lazyWithRetry(() => import("./pages/TallyExport"));
const SalesAnalyticsDashboard = lazyWithRetry(() => import("./pages/SalesAnalyticsDashboard"));
const AccountingReports = lazyWithRetry(() => import("./pages/AccountingReports"));
const ExpenseSalaryReport = lazyWithRetry(() => import("./pages/ExpenseSalaryReport"));
const NetProfitAnalysis = lazyWithRetry(() => import("./pages/NetProfitAnalysis"));
const HourlySalesAnalysis = lazyWithRetry(() => import("./pages/HourlySalesAnalysis"));
const RecycleBin = lazyWithRetry(() => import("./pages/RecycleBin"));
const StockAdjustment = lazyWithRetry(() => import("./pages/StockAdjustment"));
const StockAnalysis = lazyWithRetry(() => import("./pages/StockAnalysis"));
const StockAgeingReport = lazyWithRetry(() => import("./pages/StockAgeingReport"));
const StockSettlement = lazyWithRetry(() => import("./pages/StockSettlement"));
const DailySaleAnalysis = lazyWithRetry(() => import("./pages/DailySaleAnalysis"));
const EInvoiceReport = lazyWithRetry(() => import("./pages/EInvoiceReport"));
const CustomerLedgerPage = lazyWithRetry(() => import("./pages/CustomerLedgerPage"));
const CustomerAuditReport = lazyWithRetry(() => import("./pages/CustomerAuditReport"));
const CustomerLedgerReport = lazyWithRetry(() => import("./pages/CustomerLedgerReport"));
const CustomerReconciliation = lazyWithRetry(() => import("./pages/CustomerReconciliation"));
const BulkProductUpdate = lazyWithRetry(() => import("./pages/BulkProductUpdate"));
const DeliveryChallanEntry = lazyWithRetry(() => import("./pages/DeliveryChallanEntry"));
const DeliveryChallanDashboard = lazyWithRetry(() => import("./pages/DeliveryChallanDashboard"));
const AdvanceBookingDashboard = lazyWithRetry(() => import("./pages/AdvanceBookingDashboard"));
const SalesmanLayout = lazyWithRetry(() => import("./layouts/SalesmanLayout"));
const SalesmanDashboard = lazyWithRetry(() => import("./pages/salesman/SalesmanDashboard"));
const SalesmanCustomers = lazyWithRetry(() => import("./pages/salesman/SalesmanCustomers"));
const SalesmanOrderEntry = lazyWithRetry(() => import("./pages/salesman/SalesmanOrderEntry"));
const SalesmanOrderView = lazyWithRetry(() => import("./pages/salesman/SalesmanOrderView"));
const SalesmanCustomerAccount = lazyWithRetry(() => import("./pages/salesman/SalesmanCustomerAccount"));
const SalesmanOrders = lazyWithRetry(() => import("./pages/salesman/SalesmanOrders"));
const SalesmanOutstanding = lazyWithRetry(() => import("./pages/salesman/SalesmanOutstanding"));
const WhatsAppLogs = lazyWithRetry(() => import("./pages/WhatsAppLogs"));
const WhatsAppInbox = lazyWithRetry(() => import("./pages/WhatsAppInbox"));
const MobileMoreMenu = lazyWithRetry(() => import("./pages/mobile/MobileMoreMenu"));
const MobileReportsHub = lazyWithRetry(() => import("./pages/mobile/MobileReportsHub"));
const MobileSalesHub = lazyWithRetry(() => import("./pages/mobile/MobileSalesHub"));
const MobileAccountsPage = lazyWithRetry(() => import("./pages/mobile/MobileAccountsPage"));
import { OwnerPlaceholderScreen } from "@/components/mobile/OwnerPlaceholderScreen";
import { OwnerSalesScreen } from "@/components/mobile/OwnerSalesScreen";
import { OwnerPurchaseScreen } from "@/components/mobile/OwnerPurchaseScreen";
import { OwnerStockScreen } from "@/components/mobile/OwnerStockScreen";
import { OwnerReportsHub } from "@/components/mobile/OwnerReportsHub";
const StudentMaster = lazyWithRetry(() => import("./pages/school/StudentMaster"));
const StudentEntry = lazyWithRetry(() => import("./pages/school/StudentEntry"));
const AcademicYearSetup = lazyWithRetry(() => import("./pages/school/AcademicYearSetup"));
const ClassSectionSetup = lazyWithRetry(() => import("./pages/school/ClassSectionSetup"));
const FeeHeadsSetup = lazyWithRetry(() => import("./pages/school/FeeHeadsSetup"));
const FeeCollection = lazyWithRetry(() => import("./pages/school/FeeCollection"));
const FeeStructureSetup = lazyWithRetry(() => import("./pages/school/FeeStructureSetup"));
const TeacherMaster = lazyWithRetry(() => import("./pages/school/TeacherMaster"));
const StudentReports = lazyWithRetry(() => import("./pages/school/StudentReports"));
const StudentPromotion = lazyWithRetry(() => import("./pages/school/StudentPromotion"));
const StudentLedger = lazyWithRetry(() => import("./pages/school/StudentLedger"));
const PortalLogin = lazyWithRetry(() => import("./pages/portal/PortalLogin"));
const PortalHome = lazyWithRetry(() => import("./pages/portal/PortalHome"));
const PortalCatalogue = lazyWithRetry(() => import("./pages/portal/PortalCatalogue"));
const PortalOrders = lazyWithRetry(() => import("./pages/portal/PortalOrders"));
const PortalInvoices = lazyWithRetry(() => import("./pages/portal/PortalInvoices"));
const PortalAccount = lazyWithRetry(() => import("./pages/portal/PortalAccount"));
const SalesmanCommission = lazyWithRetry(() => import("./pages/SalesmanCommission"));
const AdminHealth = lazyWithRetry(() => import("./pages/AdminHealth"));

const LazyFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

// Check if this is a Field Sales PWA launch (check URL param or sessionStorage)
function isFieldSalesPWA(): boolean {
  const urlParams = new URLSearchParams(window.location.search);
  const urlHasFieldSales = urlParams.get('app') === 'fieldsales';
  
  // If URL has the param, persist it to sessionStorage for auth flow resilience
  if (urlHasFieldSales) {
    sessionStorage.setItem('fieldSalesPWA', 'true');
    return true;
  }
  
  // Check sessionStorage (survives redirects during auth flow)
  return sessionStorage.getItem('fieldSalesPWA') === 'true';
}

// Component to redirect root to org-specific URL
function RootRedirect() {
  const savedOrgSlug = getStoredOrgSlug();
  const isFieldSales = isFieldSalesPWA();

  if (savedOrgSlug) {
    // If launched from Field Sales PWA, redirect to salesman dashboard
    if (isFieldSales) {
      return <Navigate to={`/${savedOrgSlug}/salesman`} replace />;
    }
    return <Navigate to={`/${savedOrgSlug}`} replace />;
  }

  // Check if user might be a platform admin (no org slug but authenticated)
  // The ProtectedRoute will handle the auth check; this just avoids
  // sending potential admins to /organization-setup unnecessarily
  return <Navigate to="/organization-setup" replace />;
}

// Redirect non-org routes (like /purchase-bills) to /:orgSlug/... when possible
function NonOrgRedirect({ path }: { path: string }) {
  const savedOrgSlug = getStoredOrgSlug();
  const search = typeof window !== "undefined" ? window.location.search : "";

  if (savedOrgSlug) {
    return <Navigate to={`/${savedOrgSlug}/${path}${search}`} replace />;
  }

  return <Navigate to="/organization-setup" replace />;
}

// Startup health check: clear corrupted auth tokens before React mounts
(function cleanupCorruptedAuthTokens() {
  try {
    const authKeys = Object.keys(localStorage).filter(
      (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
    );
    for (const key of authKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        // Must have access_token and refresh_token to be valid
        if (!parsed?.access_token || !parsed?.refresh_token) {
          console.warn('[Auth Health] Removing malformed auth token (missing fields):', key);
          localStorage.removeItem(key);
        }
      } catch {
        console.warn('[Auth Health] Removing corrupted auth token (invalid JSON):', key);
        localStorage.removeItem(key);
      }
    }
  } catch (e) {
    // localStorage may be unavailable in rare cases
    console.error('[Auth Health] Startup check failed:', e);
  }
})();

const App = () => {
  // Clear chunk reload counter only after the app has loaded successfully for 5s.
  // This prevents infinite reload loops when a chunk is persistently broken:
  // if the app crashes before 5s the guard remains and stops a second reload.
  useEffect(() => {
    const clearTimer = setTimeout(() => {
      sessionStorage.removeItem("chunk_reload_count");
    }, 5000);
    return () => clearTimeout(clearTimer);
  }, []);

  // Global unhandled rejection handler
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
      // Don't prevent default - let error boundaries handle if possible
    };
    
    window.addEventListener("unhandledrejection", handleRejection);
    return () => window.removeEventListener("unhandledrejection", handleRejection);
  }, []);

  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,    // 5 minutes — was 30s, saves ~80% re-fetches on navigation
        gcTime: 30 * 60 * 1000,      // 30 minutes cache retention
        refetchOnWindowFocus: false,  // Already off - keep it off
        retry: 1,
      },
    },
  }));

  return (
    <RootErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <OrganizationProvider>
            <WindowTabsProvider>
            <Suspense fallback={<LazyFallback />}>
            <Routes>
              {/* Public routes - No org context needed */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/invoice/view/:saleId" element={<PublicInvoiceView />} />
              <Route path="/pay" element={<PublicPaymentPage />} />
              
              {/* Non-org fallbacks (in case org slug is missing in URL) */}
              <Route path="/purchase-bills" element={<NonOrgRedirect path="purchase-bills" />} />
              <Route path="/purchase-entry" element={<NonOrgRedirect path="purchase-entry" />} />
              <Route path="/purchase-returns" element={<NonOrgRedirect path="purchase-returns" />} />
              <Route path="/purchase-return-entry" element={<NonOrgRedirect path="purchase-return-entry" />} />
              <Route path="/payments-dashboard" element={<NonOrgRedirect path="payments-dashboard" />} />
              <Route path="/accounts" element={<NonOrgRedirect path="accounts" />} />
              
              {/* Platform admin route */}
              <Route
                path="/platform-admin"
                element={
                  <ProtectedRoute>
                    <RoleProtectedRoute allowedRoles={["platform_admin"]}>
                      <PlatformAdmin />
                    </RoleProtectedRoute>
                  </ProtectedRoute>
                }
              />

              {/* Organization setup - public page (also used when session expires) */}
              <Route path="/organization-setup" element={<OrganizationSetup />} />

              {/* Redirect root to org-specific URL */}
              <Route path="/" element={<ProtectedRoute><RootRedirect /></ProtectedRoute>} />

              {/* Organization-scoped routes */}
              <Route path="/:orgSlug" element={<OrgLayout />}>
                {/* Field Sales dedicated login - public, no auth required */}
                <Route path="field-sales" element={<FieldSalesAuth />} />
                {/* Per-organization install landing page - public */}
                <Route path="install" element={<InstallApp />} />
                {/* Public invoice view - org-scoped (no auth required) */}
                <Route path="invoice/view/:saleId" element={<PublicInvoiceView />} />
                {/* Buyer Portal - public, no auth required */}
                <Route path="portal" element={<PortalLogin />} />
                <Route path="portal/home" element={<PortalHome />} />
                <Route path="portal/catalogue" element={<PortalCatalogue />} />
                <Route path="portal/orders" element={<PortalOrders />} />
                <Route path="portal/invoices" element={<PortalInvoices />} />
                <Route path="portal/account" element={<PortalAccount />} />
                {/* Dashboard - index route */}
                <Route
                  index
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Index />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                
                {/* Organization Management */}
                <Route
                  path="organization-management"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin"]}>
                        <Layout>
                          <OrganizationManagement />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />

                {/* System Health - admin-gated inside the page via useUserRoles */}
                <Route
                  path="admin/health"
                  element={
                    <ProtectedRoute>
                      <AdminHealth />
                    </ProtectedRoute>
                  }
                />

                {/* Products */}
                <Route
                  path="products"
                  element={
                    <ProtectedRoute>
                      <FullScreenLayout>
                        <ProductDashboard />
                      </FullScreenLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="product-entry"
                  element={
                    <ProtectedRoute>
                      <FullScreenLayout>
                        <ProductEntry />
                      </FullScreenLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="bulk-product-update"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <BulkProductUpdate />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />

                {/* Purchase */}
                <Route
                  path="purchase-entry"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <FullScreenLayout>
                          <PurchaseEntry />
                        </FullScreenLayout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="purchase-bills"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <PurchaseBillDashboard />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="purchase-returns"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <PurchaseReturnDashboard />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="purchase-return-entry"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <FullScreenLayout>
                          <PurchaseReturnEntry />
                        </FullScreenLayout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />

                {/* Purchase Orders */}
                <Route
                  path="purchase-order-entry"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <FullScreenLayout>
                          <PurchaseOrderEntry />
                        </FullScreenLayout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="purchase-orders"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <PurchaseOrderDashboard />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />

                {/* Barcode & Stock */}
                <Route
                  path="barcode-printing"
                  element={
                    <ProtectedRoute>
                      <FullScreenLayout>
                        <BarcodePrinting />
                      </FullScreenLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="stock-report"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <StockReport />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="stock-adjustment"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin"]}>
                        <Layout>
                          <StockAdjustment />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="stock-ageing"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <StockAgeingReport />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="stock-settlement"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin"]}>
                        <Layout>
                          <StockSettlement />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="settings"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin"]}>
                        <Layout>
                          <Settings />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="profile"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Profile />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="customer-reconciliation"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin"]}>
                        <Layout>
                          <CustomerReconciliation />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />

                {/* School Module Routes */}
                <Route
                  path="students"
                  element={
                    <ProtectedRoute>
                      <SchoolFeatureGate>
                        <Layout>
                          <StudentMaster />
                        </Layout>
                      </SchoolFeatureGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="student-entry"
                  element={
                    <ProtectedRoute>
                      <SchoolFeatureGate>
                        <Layout>
                          <StudentEntry />
                        </Layout>
                      </SchoolFeatureGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="student-entry/:id"
                  element={
                    <ProtectedRoute>
                      <SchoolFeatureGate>
                        <Layout>
                          <StudentEntry />
                        </Layout>
                      </SchoolFeatureGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="academic-years"
                  element={
                    <ProtectedRoute>
                      <SchoolFeatureGate>
                        <Layout>
                          <AcademicYearSetup />
                        </Layout>
                      </SchoolFeatureGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="classes"
                  element={
                    <ProtectedRoute>
                      <SchoolFeatureGate>
                        <Layout>
                          <ClassSectionSetup />
                        </Layout>
                      </SchoolFeatureGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="fee-heads"
                  element={
                    <ProtectedRoute>
                      <SchoolFeatureGate>
                        <Layout>
                          <FeeHeadsSetup />
                        </Layout>
                      </SchoolFeatureGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="fee-structures"
                  element={
                    <ProtectedRoute>
                      <SchoolFeatureGate>
                        <Layout>
                          <FeeStructureSetup />
                        </Layout>
                      </SchoolFeatureGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="fee-collection"
                  element={
                    <ProtectedRoute>
                      <SchoolFeatureGate>
                        <Layout>
                          <FeeCollection />
                        </Layout>
                      </SchoolFeatureGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="teachers"
                  element={
                    <ProtectedRoute>
                      <SchoolFeatureGate>
                        <Layout>
                          <TeacherMaster />
                        </Layout>
                      </SchoolFeatureGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="student-reports"
                  element={
                    <ProtectedRoute>
                      <SchoolFeatureGate>
                        <Layout>
                          <StudentReports />
                        </Layout>
                      </SchoolFeatureGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="student-promotion"
                  element={
                    <ProtectedRoute>
                      <SchoolFeatureGate>
                        <Layout>
                          <StudentPromotion />
                        </Layout>
                      </SchoolFeatureGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="student-ledger"
                  element={
                    <ProtectedRoute>
                      <SchoolFeatureGate>
                        <Layout>
                          <StudentLedger />
                        </Layout>
                      </SchoolFeatureGate>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="pos-sales"
                  element={
                    <ProtectedRoute>
                      <POSLayout>
                        <POSSales />
                      </POSLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="pos-dashboard"
                  element={
                    <ProtectedRoute>
                      <FullScreenLayout>
                        <POSDashboard />
                      </FullScreenLayout>
                    </ProtectedRoute>
                  }
                />

                {/* Quotations */}
                <Route
                  path="quotation-entry"
                  element={
                    <ProtectedRoute>
                      <FullScreenLayout>
                        <QuotationEntry />
                      </FullScreenLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="quotation-dashboard"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <QuotationDashboard />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                {/* Sale Orders */}
                <Route
                  path="sale-order-entry"
                  element={
                    <ProtectedRoute>
                      <FullScreenLayout>
                        <SaleOrderEntry />
                      </FullScreenLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="sale-order-dashboard"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <SaleOrderDashboard />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                {/* Sales Invoice */}
                <Route
                  path="sales-invoice"
                  element={
                    <ProtectedRoute>
                      <FullScreenLayout>
                        <SalesInvoice />
                      </FullScreenLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="sales-invoice-dashboard"
                  element={
                    <ProtectedRoute>
                      <FullScreenLayout>
                        <SalesInvoiceDashboard />
                      </FullScreenLayout>
                    </ProtectedRoute>
                  }
                />

                {/* Sale Returns */}
                <Route
                  path="sale-return-entry"
                  element={
                    <ProtectedRoute>
                      <FullScreenLayout>
                        <SaleReturnEntry />
                      </FullScreenLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="sale-return-entry/:editId"
                  element={
                    <ProtectedRoute>
                      <FullScreenLayout>
                        <SaleReturnEntry />
                      </FullScreenLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="sale-returns"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <SaleReturnDashboard />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                {/* Delivery Challan */}
                <Route
                  path="delivery-challan-entry"
                  element={
                    <ProtectedRoute>
                      <FullScreenLayout>
                        <DeliveryChallanEntry />
                      </FullScreenLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="delivery-challan-dashboard"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <DeliveryChallanDashboard />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                {/* Advance Booking */}
                <Route
                  path="advance-booking-dashboard"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <AdvanceBookingDashboard />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                {/* Master Data */}
                <Route
                  path="customers"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <FullScreenLayout>
                          <CustomerMaster />
                        </FullScreenLayout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="suppliers"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <FullScreenLayout>
                          <SupplierMaster />
                        </FullScreenLayout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="employees"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <FullScreenLayout>
                          <EmployeeMaster />
                        </FullScreenLayout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                  />
                <Route
                  path="salesman-commission"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <FullScreenLayout>
                          <SalesmanCommission />
                        </FullScreenLayout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />

                {/* Reports */}
                <Route
                  path="purchase-report"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <PurchaseReportBySupplier />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="sales-report"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <SalesReportByCustomer />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="product-tracking"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <ProductTrackingReport />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="daily-cashier-report"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <DailyCashierReport />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="daily-tally"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <DailyTallyDashboard />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="item-wise-sales"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <ItemWiseSalesReport />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="item-wise-stock"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <ItemWiseStockReport />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="price-history"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <PriceHistoryReport />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="gst-reports"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <GSTReports />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="gst-register"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <GSTSalePurchaseRegister />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="tally-export"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <TallyExport />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="sales-analytics"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <SalesAnalyticsDashboard />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="accounting-reports"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <AccountingReports />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="expense-salary-report"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <ExpenseSalaryReport />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="customer-ledger-report"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <CustomerLedgerReport />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="customer-account-statement"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <CustomerLedgerPage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="customer-audit-report"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <CustomerAuditReport />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="daily-sale-analysis"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <DailySaleAnalysis />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="einvoice-report"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <EInvoiceReport />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="stock-analysis"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <StockAnalysis />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="net-profit-analysis"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <FullScreenLayout>
                          <NetProfitAnalysis />
                        </FullScreenLayout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="hourly-sales-analysis"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <HourlySalesAnalysis />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="audit-log"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <AuditLog />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />

                {/* Accounts */}
                <Route
                  path="accounts"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <Accounts />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="chart-of-accounts"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <ChartOfAccounts />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="journal-vouchers"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <JournalVouchers />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="payments-dashboard"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <Layout>
                          <PaymentsDashboard />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />

                {/* Delivery */}
                <Route
                  path="delivery-dashboard"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <DeliveryDashboard />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                {/* WhatsApp Logs */}
                <Route
                  path="whatsapp-logs"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <FullScreenLayout>
                          <WhatsAppLogs />
                        </FullScreenLayout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />
                
                {/* WhatsApp Inbox */}
                <Route
                  path="whatsapp-inbox"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                        <FullScreenLayout>
                          <WhatsAppInbox />
                        </FullScreenLayout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />

                {/* Mobile More Menu */}
                <Route
                  path="mobile-more"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <MobileMoreMenu />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                {/* Mobile Reports Hub */}
                <Route
                  path="mobile-reports"
                  element={
                    <ProtectedRoute>
                      <MobileReportsHub />
                    </ProtectedRoute>
                  }
                />

                {/* Mobile Sales Hub */}
                <Route
                  path="mobile-sales"
                  element={
                    <ProtectedRoute>
                      <Suspense fallback={<LazyFallback />}>
                        <MobileSalesHub />
                      </Suspense>
                    </ProtectedRoute>
                  }
                />

                {/* Mobile Accounts Page */}
                <Route
                  path="mobile-accounts"
                  element={
                    <ProtectedRoute>
                      <Suspense fallback={<LazyFallback />}>
                        <MobileAccountsPage />
                      </Suspense>
                    </ProtectedRoute>
                  }
                />

                {/* Owner Mobile Placeholder Screens */}
                <Route
                  path="owner-sales"
                  element={
                    <ProtectedRoute>
                      <FullScreenLayout>
                        <OwnerSalesScreen />
                      </FullScreenLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="owner-purchases"
                  element={
                    <ProtectedRoute>
                      <FullScreenLayout>
                        <OwnerPurchaseScreen />
                      </FullScreenLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="owner-stock"
                  element={
                    <ProtectedRoute>
                      <FullScreenLayout>
                        <OwnerStockScreen />
                      </FullScreenLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="owner-reports"
                  element={
                    <ProtectedRoute>
                      <FullScreenLayout>
                        <OwnerReportsHub />
                      </FullScreenLayout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="recycle-bin"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin"]}>
                        <Layout>
                          <RecycleBin />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />

                {/* User Rights */}
                <Route
                  path="user-rights"
                  element={
                    <ProtectedRoute>
                      <RoleProtectedRoute allowedRoles={["admin"]}>
                        <Layout>
                          <UserRights />
                        </Layout>
                      </RoleProtectedRoute>
                    </ProtectedRoute>
                  }
                />

                {/* Field Salesman Mobile App */}
                <Route path="salesman" element={<ProtectedRoute><SalesmanLayout /></ProtectedRoute>}>
                  <Route index element={<SalesmanDashboard />} />
                  <Route path="customers" element={<SalesmanCustomers />} />
                  <Route path="customer/:customerId" element={<SalesmanCustomerAccount />} />
                  <Route path="order/new" element={<SalesmanOrderEntry />} />
                  <Route path="order/:orderId" element={<SalesmanOrderView />} />
                  <Route path="orders" element={<SalesmanOrders />} />
                  <Route path="outstanding" element={<SalesmanOutstanding />} />
                </Route>
              </Route>

              {/* OAuth callback guard - prevent NotFound for /~oauth paths */}
              <Route path="/~oauth/*" element={
                <div className="min-h-screen flex items-center justify-center gap-2">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  <span className="text-muted-foreground">Completing sign-in...</span>
                </div>
              } />

              {/* Catch-all for 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            </WindowTabsProvider>
          </OrganizationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
    </RootErrorBoundary>
  );
};


export default App;
