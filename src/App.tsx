import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import { OrganizationSetup } from "@/components/OrganizationSetup";
import { Layout } from "@/components/Layout";
import OrganizationManagement from "./pages/OrganizationManagement";
import Index from "./pages/Index";
import ProductDashboard from "./pages/ProductDashboard";
import ProductEntry from "./pages/ProductEntry";
import PurchaseEntry from "./pages/PurchaseEntry";
import PurchaseBillDashboard from "./pages/PurchaseBillDashboard";
import BarcodePrinting from "./pages/BarcodePrinting";
import StockReport from "./pages/StockReport";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import POSSales from "./pages/POSSales";
import POSDashboard from "./pages/POSDashboard";
import SalesInvoice from "./pages/SalesInvoice";
import CustomerMaster from "./pages/CustomerMaster";
import SupplierMaster from "./pages/SupplierMaster";
import EmployeeMaster from "./pages/EmployeeMaster";
import PurchaseReportBySupplier from "./pages/PurchaseReportBySupplier";
import SalesReportByCustomer from "./pages/SalesReportByCustomer";
import AuditLog from "./pages/AuditLog";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

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
              <Route path="/auth" element={<Auth />} />
              <Route
                path="/organization-setup"
                element={
                  <ProtectedRoute>
                    <OrganizationSetup />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organization-management"
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
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Index />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/products"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ProductDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/product-entry"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ProductEntry />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/purchase-entry"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                    <Layout>
                      <PurchaseEntry />
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/purchase-bills"
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
              path="/barcode-printing"
              element={
                <ProtectedRoute>
                  <Layout>
                    <BarcodePrinting />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock-report"
              element={
                <ProtectedRoute>
                  <Layout>
                    <StockReport />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
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
              path="/profile"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Profile />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pos-sales"
              element={
                <ProtectedRoute>
                  <POSSales />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pos-dashboard"
              element={
                <ProtectedRoute>
                  <Layout>
                    <POSDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales-invoice"
              element={
                <ProtectedRoute>
                  <Layout>
                    <SalesInvoice />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                    <Layout>
                      <CustomerMaster />
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/suppliers"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                    <Layout>
                      <SupplierMaster />
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/employees"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                    <Layout>
                      <EmployeeMaster />
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/purchase-report"
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
              path="/sales-report"
              element={
                <ProtectedRoute>
                  <Layout>
                    <SalesReportByCustomer />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit-log"
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
            </Routes>
          </OrganizationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
