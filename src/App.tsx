import { useState, useEffect, lazy, Suspense } from "react";
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

// Lazy-loaded page components for code splitting
const OrganizationManagement = lazy(() => import("./pages/OrganizationManagement"));
const Index = lazy(() => import("./pages/Index"));
const ProductDashboard = lazy(() => import("./pages/ProductDashboard"));
const ProductEntry = lazy(() => import("./pages/ProductEntry"));
const PurchaseEntry = lazy(() => import("./pages/PurchaseEntry"));
const PurchaseBillDashboard = lazy(() => import("./pages/PurchaseBillDashboard"));
const PurchaseReturnDashboard = lazy(() => import("./pages/PurchaseReturnDashboard"));
const PurchaseReturnEntry = lazy(() => import("./pages/PurchaseReturnEntry"));
const BarcodePrinting = lazy(() => import("./pages/BarcodePrinting"));
const StockReport = lazy(() => import("./pages/StockReport"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const POSSales = lazy(() => import("./pages/POSSales"));
const POSDashboard = lazy(() => import("./pages/POSDashboard"));
const SalesInvoice = lazy(() => import("./pages/SalesInvoice"));
const SalesInvoiceDashboard = lazy(() => import("./pages/SalesInvoiceDashboard"));
const SaleReturnEntry = lazy(() => import("./pages/SaleReturnEntry"));
const SaleReturnDashboard = lazy(() => import("./pages/SaleReturnDashboard"));
const QuotationEntry = lazy(() => import("./pages/QuotationEntry"));
const QuotationDashboard = lazy(() => import("./pages/QuotationDashboard"));
const SaleOrderEntry = lazy(() => import("./pages/SaleOrderEntry"));
const SaleOrderDashboard = lazy(() => import("./pages/SaleOrderDashboard"));
const PurchaseOrderEntry = lazy(() => import("./pages/PurchaseOrderEntry"));
const PurchaseOrderDashboard = lazy(() => import("./pages/PurchaseOrderDashboard"));
const CustomerMaster = lazy(() => import("./pages/CustomerMaster"));
const SupplierMaster = lazy(() => import("./pages/SupplierMaster"));
const EmployeeMaster = lazy(() => import("./pages/EmployeeMaster"));
const PurchaseReportBySupplier = lazy(() => import("./pages/PurchaseReportBySupplier"));
const SalesReportByCustomer = lazy(() => import("./pages/SalesReportByCustomer"));
const ProductTrackingReport = lazy(() => import("./pages/ProductTrackingReport"));
const DailyCashierReport = lazy(() => import("./pages/DailyCashierReport"));
const DailyTally = lazy(() => import("./pages/DailyTally"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const Accounts = lazy(() => import("./pages/Accounts"));
const DeliveryDashboard = lazy(() => import("./pages/DeliveryDashboard"));
const PaymentsDashboard = lazy(() => import("./pages/PaymentsDashboard"));
const UserRights = lazy(() => import("./pages/UserRights"));
const Auth = lazy(() => import("./pages/Auth"));
const OrgAuth = lazy(() => import("./pages/OrgAuth"));
const FieldSalesAuth = lazy(() => import("./pages/FieldSalesAuth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PlatformAdmin = lazy(() => import("./pages/PlatformAdmin"));
const PublicInvoiceView = lazy(() => import("./pages/PublicInvoiceView"));
const PublicPaymentPage = lazy(() => import("./pages/PublicPaymentPage"));
const ItemWiseSalesReport = lazy(() => import("./pages/ItemWiseSalesReport"));
const ItemWiseStockReport = lazy(() => import("./pages/ItemWiseStockReport"));
const PriceHistoryReport = lazy(() => import("./pages/PriceHistoryReport"));
const GSTSalePurchaseRegister = lazy(() => import("./pages/GSTSalePurchaseRegister"));
const GSTReports = lazy(() => import("./pages/GSTReports"));
const TallyExport = lazy(() => import("./pages/TallyExport"));
const SalesAnalyticsDashboard = lazy(() => import("./pages/SalesAnalyticsDashboard"));
const AccountingReports = lazy(() => import("./pages/AccountingReports"));
const NetProfitAnalysis = lazy(() => import("./pages/NetProfitAnalysis"));
const HourlySalesAnalysis = lazy(() => import("./pages/HourlySalesAnalysis"));
const RecycleBin = lazy(() => import("./pages/RecycleBin"));
const StockAdjustment = lazy(() => import("./pages/StockAdjustment"));
const StockAnalysis = lazy(() => import("./pages/StockAnalysis"));
const StockAgeingReport = lazy(() => import("./pages/StockAgeingReport"));
const BulkProductUpdate = lazy(() => import("./pages/BulkProductUpdate"));
const DeliveryChallanEntry = lazy(() => import("./pages/DeliveryChallanEntry"));
const DeliveryChallanDashboard = lazy(() => import("./pages/DeliveryChallanDashboard"));
const AdvanceBookingDashboard = lazy(() => import("./pages/AdvanceBookingDashboard"));
const SalesmanLayout = lazy(() => import("./layouts/SalesmanLayout"));
const SalesmanDashboard = lazy(() => import("./pages/salesman/SalesmanDashboard"));
const SalesmanCustomers = lazy(() => import("./pages/salesman/SalesmanCustomers"));
const SalesmanOrderEntry = lazy(() => import("./pages/salesman/SalesmanOrderEntry"));
const SalesmanOrderView = lazy(() => import("./pages/salesman/SalesmanOrderView"));
const SalesmanCustomerAccount = lazy(() => import("./pages/salesman/SalesmanCustomerAccount"));
const SalesmanOrders = lazy(() => import("./pages/salesman/SalesmanOrders"));
const SalesmanOutstanding = lazy(() => import("./pages/salesman/SalesmanOutstanding"));
const WhatsAppLogs = lazy(() => import("./pages/WhatsAppLogs"));
const WhatsAppInbox = lazy(() => import("./pages/WhatsAppInbox"));
const MobileMoreMenu = lazy(() => import("./pages/mobile/MobileMoreMenu"));
const MobileReportsHub = lazy(() => import("./pages/mobile/MobileReportsHub"));
const StudentMaster = lazy(() => import("./pages/school/StudentMaster"));
const StudentEntry = lazy(() => import("./pages/school/StudentEntry"));
const AcademicYearSetup = lazy(() => import("./pages/school/AcademicYearSetup"));
const ClassSectionSetup = lazy(() => import("./pages/school/ClassSectionSetup"));
const FeeHeadsSetup = lazy(() => import("./pages/school/FeeHeadsSetup"));
const FeeCollection = lazy(() => import("./pages/school/FeeCollection"));
const FeeStructureSetup = lazy(() => import("./pages/school/FeeStructureSetup"));
const TeacherMaster = lazy(() => import("./pages/school/TeacherMaster"));
const StudentReports = lazy(() => import("./pages/school/StudentReports"));

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

  if (savedOrgSlug) {
    return <Navigate to={`/${savedOrgSlug}/${path}`} replace />;
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
        staleTime: 30000, // 30 seconds default stale time
        gcTime: 300000, // 5 minutes garbage collection (was cacheTime)
        refetchOnWindowFocus: false, // Don't refetch on window focus
        retry: 1, // Reduce retry attempts
      },
    },
  }));

  return (
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
                {/* Public invoice view - org-scoped (no auth required) */}
                <Route path="invoice/view/:saleId" element={<PublicInvoiceView />} />
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

                {/* Settings & Profile */}
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

                {/* POS */}
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
                        <DailyTally />
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

                {/* Recycle Bin - Admin Only */}
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
  );
};


export default App;
