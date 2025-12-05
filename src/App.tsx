import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import { OrgLayout } from "@/components/OrgLayout";
import { OrganizationSetup } from "@/components/OrganizationSetup";
import { Layout } from "@/components/Layout";
import { FullScreenLayout } from "@/components/FullScreenLayout";
import { POSLayout } from "@/components/POSLayout";
import OrganizationManagement from "./pages/OrganizationManagement";
import Index from "./pages/Index";
import ProductDashboard from "./pages/ProductDashboard";
import ProductEntry from "./pages/ProductEntry";
import PurchaseEntry from "./pages/PurchaseEntry";
import PurchaseBillDashboard from "./pages/PurchaseBillDashboard";
import PurchaseReturnDashboard from "./pages/PurchaseReturnDashboard";
import PurchaseReturnEntry from "./pages/PurchaseReturnEntry";
import BarcodePrinting from "./pages/BarcodePrinting";
import StockReport from "./pages/StockReport";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import POSSales from "./pages/POSSales";
import POSDashboard from "./pages/POSDashboard";
import SalesInvoice from "./pages/SalesInvoice";
import SalesInvoiceDashboard from "./pages/SalesInvoiceDashboard";
import SaleReturnEntry from "./pages/SaleReturnEntry";
import SaleReturnDashboard from "./pages/SaleReturnDashboard";
import QuotationEntry from "./pages/QuotationEntry";
import QuotationDashboard from "./pages/QuotationDashboard";
import SaleOrderEntry from "./pages/SaleOrderEntry";
import SaleOrderDashboard from "./pages/SaleOrderDashboard";
import CustomerMaster from "./pages/CustomerMaster";
import SupplierMaster from "./pages/SupplierMaster";
import EmployeeMaster from "./pages/EmployeeMaster";
import PurchaseReportBySupplier from "./pages/PurchaseReportBySupplier";
import SalesReportByCustomer from "./pages/SalesReportByCustomer";
import ProductTrackingReport from "./pages/ProductTrackingReport";
import DailyCashierReport from "./pages/DailyCashierReport";
import AuditLog from "./pages/AuditLog";
import Accounts from "./pages/Accounts";
import DeliveryDashboard from "./pages/DeliveryDashboard";
import PaymentsDashboard from "./pages/PaymentsDashboard";
import UserRights from "./pages/UserRights";
import Auth from "./pages/Auth";
import OrgAuth from "./pages/OrgAuth";
import NotFound from "./pages/NotFound";
import PlatformAdmin from "./pages/PlatformAdmin";
import PublicInvoiceView from "./pages/PublicInvoiceView";
import ItemWiseSalesReport from "./pages/ItemWiseSalesReport";
import PriceHistoryReport from "./pages/PriceHistoryReport";
import GSTSalePurchaseRegister from "./pages/GSTSalePurchaseRegister";
import TallyExport from "./pages/TallyExport";

const App = () => {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <OrganizationProvider>
            <Routes>
              {/* Public routes - No org context needed */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/invoice/view/:saleId" element={<PublicInvoiceView />} />
              
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
              
              {/* Organization setup - accessible without org context */}
              <Route
                path="/organization-setup"
                element={
                  <ProtectedRoute>
                    <OrganizationSetup />
                  </ProtectedRoute>
                }
              />

              {/* Redirect root to org-specific URL */}
              <Route path="/" element={<ProtectedRoute><RootRedirect /></ProtectedRoute>} />

              {/* Organization-scoped routes */}
              <Route path="/:orgSlug" element={<OrgLayout />}>
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
                      <Layout>
                        <ProductDashboard />
                      </Layout>
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
                      <Layout>
                        <POSDashboard />
                      </Layout>
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
                      <Layout>
                        <SalesInvoiceDashboard />
                      </Layout>
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
                  path="sale-returns"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <SaleReturnDashboard />
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
              </Route>

              {/* Catch-all for 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </OrganizationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </QueryClientProvider>
  );
};

// Component to redirect root to org-specific URL
const RootRedirect = () => {
  const savedOrgSlug = localStorage.getItem("selectedOrgSlug");
  
  if (savedOrgSlug) {
    return <Navigate to={`/${savedOrgSlug}`} replace />;
  }
  
  // If no org slug saved, go to organization setup
  return <Navigate to="/organization-setup" replace />;
};

export default App;
