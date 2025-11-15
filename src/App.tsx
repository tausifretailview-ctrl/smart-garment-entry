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
                      <OrganizationManagement />
                    </RoleProtectedRoute>
                  </ProtectedRoute>
                }
              />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products"
              element={
                <ProtectedRoute>
                  <ProductDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/product-entry"
              element={
                <ProtectedRoute>
                  <ProductEntry />
                </ProtectedRoute>
              }
            />
            <Route
              path="/purchase-entry"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                    <PurchaseEntry />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/purchase-bills"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                    <PurchaseBillDashboard />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/barcode-printing"
              element={
                <ProtectedRoute>
                  <BarcodePrinting />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock-report"
              element={
                <ProtectedRoute>
                  <StockReport />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={["admin"]}>
                    <Settings />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
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
              path="/sales-invoice"
              element={
                <ProtectedRoute>
                  <SalesInvoice />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                    <CustomerMaster />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/suppliers"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                    <SupplierMaster />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/employees"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                    <EmployeeMaster />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/purchase-report"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                    <PurchaseReportBySupplier />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales-report"
              element={
                <ProtectedRoute>
                  <SalesReportByCustomer />
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit-log"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                    <AuditLog />
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
