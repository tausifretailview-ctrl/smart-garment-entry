import { Suspense } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import { OrgLayout } from "@/components/OrgLayout";
import { MenuPermissionRoute } from "@/components/MenuPermissionRoute";
import { OrganizationSetup } from "@/components/OrganizationSetup";
import { Layout } from "@/components/Layout";
import { FullScreenLayout } from "@/components/FullScreenLayout";
import { POSLayout } from "@/components/POSLayout";
import { ChunkLoadBoundary } from "@/components/ChunkLoadBoundary";
import { PosDeliveryChallanLayout } from "@/components/PosDeliveryChallanLayout";
import { SchoolFeatureGate } from "@/components/school/SchoolFeatureGate";
import { resolveStartupOrgSlug } from "@/lib/bundledOrg";
import InstallApp from "@/pages/InstallApp";
import { MobileOrgIndexRedirect } from "@/components/mobile/MobileOrgIndexRedirect";
import { LazyFallback } from "@/app/LazyFallback";
import {
  OAuthConsent,
  OrganizationManagement,
  Index,
  ProductDashboard,
  ProductEntry,
  PurchaseEntry,
  PurchaseBillDashboard,
  PurchaseReturnDashboard,
  PurchaseReturnEntry,
  BarcodePrinting,
  StockReport,
  StockSummary,
  Settings,
  Manufacturing,
  Profile,
  POSSales,
  PosDeliveryChallan,
  POSDashboard,
  SalesInvoice,
  SalesInvoiceDashboard,
  SaleReturnEntry,
  SaleReturnDashboard,
  QuotationEntry,
  QuotationDashboard,
  SaleOrderEntry,
  SaleOrderDashboard,
  PurchaseOrderEntry,
  PurchaseOrderDashboard,
  CustomerMaster,
  CustomerAccountPage,
  SupplierMaster,
  EmployeeMaster,
  PurchaseReportBySupplier,
  SalesReportByCustomer,
  ProductTrackingReport,
  DailyCashierReport,
  DailyTallyDashboard,
  DailyAccountTally,
  AuditLog,
  Accounts,
  ChartOfAccounts,
  JournalVouchers,
  ManualJournalEntry,
  ThirdPartyVoucherEntry,
  ThirdPartyBalancesPage,
  BankStatementPage,
  LedgerOpeningBalances,
  DeliveryDashboard,
  PaymentsDashboard,
  UserRights,
  Auth,
  ResetPassword,
  FieldSalesAuth,
  NotFound,
  PlatformAdmin,
  PlatformDataIntegrity,
  PublicInvoiceView,
  OwnerAlertBill,
  OwnerAlertReport,
  PublicPaymentPage,
  PaymentStatusPage,
  ItemWiseSalesReport,
  ItemWiseStockReport,
  PriceHistoryReport,
  GSTSalePurchaseRegister,
  GSTReports,
  GSTAnalysis,
  GSTReadiness,
  GSTFiling,
  TallyExport,
  SalesAnalyticsDashboard,
  AccountingReports,
  ExpenseSalaryReport,
  NetProfitAnalysis,
  HourlySalesAnalysis,
  RecycleBin,
  ListSkeletonSpotCheck,
  DialogA11ySpotCheck,
  StockAdjustment,
  DuplicatePurchaseBills,
  StockTransfer,
  StockTransferEntry,
  Godowns,
  GodownTransfers,
  GodownTransferEntry,
  StockAnalysis,
  StockAgeingReport,
  StockSettlement,
  DailySaleAnalysis,
  EInvoiceReport,
  ReportsHub,
  BusinessInsights,
  CustomerLedgerPage,
  CustomerAuditReport,
  CreditNoteSrAdjustmentRegister,
  CustomerReviews,
  OwnerNotifications,
  CustomerNotifications,
  CustomerLedgerReport,
  CustomerPointsReport,
  CustomerAccountStatementAuditPage,
  CustomerBalanceActivityPage,
  CustomerPartyBalancesPage,
  CustomerOutstandingReport,
  AccountsPaymentsPage,
  SupplierPartyBalancesPage,
  PartyPaymentFlowPage,
  OrphanedProductsPage,
  CustomerReconciliation,
  StockReconciliationReport,
  BulkProductUpdate,
  DeliveryChallanEntry,
  DeliveryChallanDashboard,
  DebitNoteDashboard,
  EwayBillRegister,
  AdvanceBookingDashboard,
  DiscountSchemeDashboard,
  SalesmanLayout,
  SalesmanDashboard,
  SalesmanCustomers,
  SalesmanOrderEntry,
  SalesmanOrderView,
  SalesmanCustomerAccount,
  SalesmanOrders,
  SalesmanOutstanding,
  WhatsAppLogs,
  WhatsAppInbox,
  BulkWhatsApp,
  MobileMoreMenu,
  MobileSalesHub,
  MobilePosBilling,
  MobilePurchaseEntry,
  MobileDashboardPage,
  MobileAccountsPage,
  OwnerSalesScreen,
  OwnerPurchaseScreen,
  OwnerStockScreen,
  OwnerReportsHub,
  StudentMaster,
  StudentEntry,
  AcademicYearSetup,
  ClassSectionSetup,
  FeeHeadsSetup,
  FeeCollection,
  FeeStructureSetup,
  TeacherMaster,
  StudentReports,
  StudentPromotion,
  StudentLedger,
  PortalLogin,
  PortalHome,
  PortalCatalogue,
  PortalOrders,
  PortalInvoices,
  PortalAccount,
  PublicStorefront,
  WebsiteSettings,
  AmazonSync,
  BackupSettingsPage,
  SalesmanCommission,
  AdminHealth,
} from "@/app/lazyPages";

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
  const savedOrgSlug = resolveStartupOrgSlug();
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
  const savedOrgSlug = resolveStartupOrgSlug();

  if (savedOrgSlug) {
    return <Navigate to={`/${savedOrgSlug}/${path}`} replace />;
  }

  return <Navigate to="/organization-setup" replace />;
}

/** Same as NonOrgRedirect but preserves a path suffix after the prefix (e.g. /sale-return-entry/:id). */
function NonOrgRedirectWithTail({ pathPrefix }: { pathPrefix: string }) {
  const params = useParams();
  const tail = (params["*"] as string | undefined)?.replace(/^\/+/, "") ?? "";
  const savedOrgSlug = resolveStartupOrgSlug();
  if (savedOrgSlug) {
    const suffix = tail ? `/${tail}` : "";
    return <Navigate to={`/${savedOrgSlug}/${pathPrefix}${suffix}`} replace />;
  }
  return <Navigate to="/organization-setup" replace />;
}

/** Legacy dashboard URL → canonical sale returns route under org. */
function NonOrgLegacySaleReturnDashboardRedirect() {
  const savedOrgSlug = resolveStartupOrgSlug();
  if (savedOrgSlug) {
    return <Navigate to={`/${savedOrgSlug}/sale-returns`} replace />;
  }
  return <Navigate to="/organization-setup" replace />;
}

/** The whole route tree. Moved out of App.tsx (Plan Phase 4, S3). */
export function AppRoutes() {
  return (
    <Routes>
      {/* Public routes - No org context needed */}
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/invoice/view/:saleId" element={<PublicInvoiceView />} />
      <Route path="/i/:saleId" element={<PublicInvoiceView />} />
      <Route path="/pay" element={<PublicPaymentPage />} />
      <Route path="/payment-status" element={<PaymentStatusPage />} />
      {ListSkeletonSpotCheck ? (
        <Route path="/__dev__/list-skeletons" element={<ListSkeletonSpotCheck />} />
      ) : null}
      {DialogA11ySpotCheck ? (
        <Route path="/__dev__/dialog-a11y" element={<DialogA11ySpotCheck />} />
      ) : null}

      {/* MCP OAuth 2.1 consent screen (Supabase authorization server) */}
      <Route path="/oauth/consent" element={<OAuthConsent />} />
      {/* Legacy dotted path — Lovable hosting 404s dotted paths, kept for older links */}
      <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
      
      {/* Non-org fallbacks (in case org slug is missing in URL) */}
      <Route path="/purchase-bills" element={<NonOrgRedirect path="purchase-bills" />} />
      <Route path="/purchase-entry" element={<NonOrgRedirect path="purchase-entry" />} />
      <Route path="/purchase-returns" element={<NonOrgRedirect path="purchase-returns" />} />
      <Route path="/purchase-return-entry" element={<NonOrgRedirect path="purchase-return-entry" />} />
      <Route path="/payments-dashboard" element={<NonOrgRedirect path="payments-dashboard" />} />
      <Route path="/accounts" element={<NonOrgRedirect path="accounts" />} />
      <Route path="/accounts-payments" element={<NonOrgRedirect path="accounts-payments" />} />
      <Route path="/sale-returns" element={<NonOrgRedirect path="sale-returns" />} />
      <Route path="/sale-return-entry/*" element={<NonOrgRedirectWithTail pathPrefix="sale-return-entry" />} />
      <Route path="/sale-return-dashboard" element={<NonOrgLegacySaleReturnDashboardRedirect />} />
      <Route path="/product-dashboard" element={<NonOrgRedirect path="products" />} />
      <Route path="/purchase-bill-dashboard" element={<NonOrgRedirect path="purchase-bills" />} />
      <Route path="/purchase-return-dashboard" element={<NonOrgRedirect path="purchase-returns" />} />
      
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
      <Route
        path="/platform-admin/data-integrity"
        element={
          <ProtectedRoute>
            <RoleProtectedRoute allowedRoles={["platform_admin"]}>
              <PlatformDataIntegrity />
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
        {/* Public storefront — browse + enquiry, no login. Prefer a full
            navigation so main.tsx loads the lite storefront bundle. */}
        <Route path="store" element={<PublicStorefront />} />
        <Route path="store/p/:productId" element={<PublicStorefront />} />
        {/* Org home: mobile → business dashboard, desktop → main dashboard */}
        <Route
          index
          element={
            <ProtectedRoute>
              <MobileOrgIndexRedirect />
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
        <Route path="product-dashboard" element={<Navigate to="products" replace />} />
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
                <FullScreenLayout>
                  <PurchaseBillDashboard />
                </FullScreenLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route path="purchase-bill-dashboard" element={<Navigate to="purchase-bills" replace />} />
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
        <Route path="purchase-return-dashboard" element={<Navigate to="purchase-returns" replace />} />
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
              <Layout>
                <BarcodePrinting />
              </Layout>
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
          path="stock-summary"
          element={
            <ProtectedRoute>
              <Layout>
                <StockSummary />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="duplicate-purchase-bills"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin"]}>
                <Layout>
                  <DuplicatePurchaseBills />
                </Layout>
              </RoleProtectedRoute>
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
          path="stock-transfer"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <Layout>
                  <Suspense fallback={<LazyFallback />}>
                    <StockTransfer />
                  </Suspense>
                </Layout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="stock-transfer-entry"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin"]}>
                <FullScreenLayout>
                  <StockTransferEntry />
                </FullScreenLayout>
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
          path="godowns"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <Layout>
                  <Godowns />
                </Layout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="godown-transfers"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <Layout>
                  <GodownTransfers />
                </Layout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="godown-transfer-entry"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <FullScreenLayout>
                  <GodownTransferEntry />
                </FullScreenLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="manufacturing"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <Layout>
                  <Manufacturing />
                </Layout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="settings"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <Layout>
                  <Settings />
                </Layout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="amazon-sync"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin"]}>
                <Layout>
                  <AmazonSync />
                </Layout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="website"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <MenuPermissionRoute permission="website_settings">
                  <Layout>
                    <WebsiteSettings />
                  </Layout>
                </MenuPermissionRoute>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="backup"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <Layout>
                  <BackupSettingsPage />
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
        <Route
          path="stock-reconciliation"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin"]}>
                <Layout>
                  <StockReconciliationReport />
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
                <ChunkLoadBoundary>
                  <POSSales />
                </ChunkLoadBoundary>
              </POSLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="pos-delivery-challan"
          element={
            <ProtectedRoute>
              <PosDeliveryChallanLayout>
                <PosDeliveryChallan />
              </PosDeliveryChallanLayout>
            </ProtectedRoute>
          }
        />
        {/* Owner alert taps on the phone: just the bill, or the colour day report (no menus) */}
        <Route
          path="owner-alert/bill/:saleId"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LazyFallback />}>
                <OwnerAlertBill />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="owner-alert/report"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LazyFallback />}>
                <OwnerAlertReport />
              </Suspense>
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
        <Route
          path="debit-notes"
          element={
            <ProtectedRoute>
              <Layout>
                <DebitNoteDashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="eway-bills"
          element={
            <ProtectedRoute>
              <Layout>
                <EwayBillRegister />
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

        <Route
          path="discount-scheme-dashboard"
          element={
            <ProtectedRoute>
              <MenuPermissionRoute permission="discount_scheme_dashboard">
                <Layout>
                  <DiscountSchemeDashboard />
                </Layout>
              </MenuPermissionRoute>
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
          path="accounting/customer/:customerId"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <FullScreenLayout>
                  <CustomerAccountPage />
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
          path="reports"
          element={
            <ProtectedRoute>
              <Layout>
                <ReportsHub />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="insights"
          element={
            <ProtectedRoute>
              <MenuPermissionRoute permission="business_insights">
                <Layout>
                  <BusinessInsights />
                </Layout>
              </MenuPermissionRoute>
            </ProtectedRoute>
          }
        />
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
          path="account-tally"
          element={
            <ProtectedRoute>
              <Layout>
                <DailyAccountTally />
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
          path="gst-analysis"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <Layout>
                  <GSTAnalysis />
                </Layout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="gst-readiness"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <Layout>
                  <GSTReadiness />
                </Layout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="gst-filing"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <Layout>
                  <GSTFiling />
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
          path="customer-points-report"
          element={
            <ProtectedRoute>
              <Layout>
                <CustomerPointsReport />
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
          path="customer-account-statement-audit"
          element={
            <ProtectedRoute>
              <Layout>
                <CustomerAccountStatementAuditPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="customer-balance-activity"
          element={
            <ProtectedRoute>
              <Layout>
                <CustomerBalanceActivityPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="customer-party-balances"
          element={
            <ProtectedRoute>
              <Layout>
                <CustomerPartyBalancesPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="customer-outstanding-report"
          element={
            <ProtectedRoute>
              <Layout>
                <CustomerOutstandingReport />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="accounts-payments"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <Layout>
                  <AccountsPaymentsPage />
                </Layout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="supplier-party-balances"
          element={
            <ProtectedRoute>
              <Layout>
                <SupplierPartyBalancesPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="payment-flow"
          element={
            <ProtectedRoute>
              <Layout>
                <PartyPaymentFlowPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="orphaned-products"
          element={
            <ProtectedRoute>
              <Layout>
                <OrphanedProductsPage />
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
          path="customer-notifications"
          element={
            <ProtectedRoute>
              <Layout>
                <CustomerNotifications />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="notifications"
          element={
            <ProtectedRoute>
              <Layout>
                <OwnerNotifications />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="customer-reviews"
          element={
            <ProtectedRoute>
              <Layout>
                <CustomerReviews />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="cn-sr-adjustment-register"
          element={
            <ProtectedRoute>
              <Layout>
                <CreditNoteSrAdjustmentRegister />
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
                <Layout>
                  <NetProfitAnalysis />
                </Layout>
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
          path="manual-journal"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <Layout>
                  <ManualJournalEntry />
                </Layout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="third-party-entry"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <Layout>
                  <ThirdPartyVoucherEntry />
                </Layout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="third-party-balances"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <Layout>
                  <ThirdPartyBalancesPage />
                </Layout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="bank-statement"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <Layout>
                  <BankStatementPage />
                </Layout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="ledger-opening-balances"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <Layout>
                  <LedgerOpeningBalances />
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

        {/* Bulk WhatsApp (each user's own linked number) */}
        <Route
          path="bulk-whatsapp"
          element={
            <ProtectedRoute>
              <MenuPermissionRoute permission="bulk_whatsapp" allowOrgAdmin>
                <Layout>
                  <BulkWhatsApp />
                </Layout>
              </MenuPermissionRoute>
            </ProtectedRoute>
          }
        />

        {/* Mobile More Menu */}
        <Route
          path="mobile-more"
          element={
            <ProtectedRoute>
              <FullScreenLayout>
                <MobileMoreMenu />
              </FullScreenLayout>
            </ProtectedRoute>
          }
        />

        {/* Legacy path → owner mobile reports */}
        <Route path="mobile-reports" element={<Navigate to="owner-reports" replace />} />

        {/* Mobile Business Dashboard (native app home) — same Main Dashboard right as desktop Index */}
        <Route
          path="mobile-dashboard"
          element={
            <ProtectedRoute>
              <MenuPermissionRoute permission="main_dashboard">
                <Suspense fallback={<LazyFallback />}>
                  <MobileDashboardPage />
                </Suspense>
              </MenuPermissionRoute>
            </ProtectedRoute>
          }
        />

        {/* Mobile Sales Hub */}
        <Route
          path="mobile-sales"
          element={
            <ProtectedRoute>
              <FullScreenLayout>
                <Suspense fallback={<LazyFallback />}>
                  <MobileSalesHub />
                </Suspense>
              </FullScreenLayout>
            </ProtectedRoute>
          }
        />

        {/* Mobile POS billing — usePosBilling UI (Phase 2) */}
        <Route
          path="mobile-pos"
          element={
            <ProtectedRoute>
              <MenuPermissionRoute permission="pos_sales">
                <FullScreenLayout>
                  <Suspense fallback={<LazyFallback />}>
                    <MobilePosBilling />
                  </Suspense>
                </FullScreenLayout>
              </MenuPermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="mobile-purchase-entry"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                <FullScreenLayout>
                  <Suspense fallback={<LazyFallback />}>
                    <MobilePurchaseEntry />
                  </Suspense>
                </FullScreenLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        {/* Mobile Accounts Page */}
        <Route
          path="mobile-accounts"
          element={
            <ProtectedRoute>
              <FullScreenLayout>
                <Suspense fallback={<LazyFallback />}>
                  <MobileAccountsPage />
                </Suspense>
              </FullScreenLayout>
            </ProtectedRoute>
          }
        />

        {/* Owner Mobile Placeholder Screens */}
        <Route
          path="owner-sales"
          element={
            <ProtectedRoute>
              <FullScreenLayout>
                <Suspense fallback={<LazyFallback />}>
                  <OwnerSalesScreen />
                </Suspense>
              </FullScreenLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="owner-purchases"
          element={
            <ProtectedRoute>
              <FullScreenLayout>
                <Suspense fallback={<LazyFallback />}>
                  <OwnerPurchaseScreen />
                </Suspense>
              </FullScreenLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="owner-stock"
          element={
            <ProtectedRoute>
              <FullScreenLayout>
                <Suspense fallback={<LazyFallback />}>
                  <OwnerStockScreen />
                </Suspense>
              </FullScreenLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="owner-reports"
          element={
            <ProtectedRoute>
              <FullScreenLayout>
                <Suspense fallback={<LazyFallback />}>
                  <OwnerReportsHub />
                </Suspense>
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
                  <Suspense fallback={<LazyFallback />}>
                    <RecycleBin />
                  </Suspense>
                </Layout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        {/* User Rights — managers may configure subordinate rights */}
        <Route
          path="user-rights"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
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
  );
}
