import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import ProductDashboard from "./pages/ProductDashboard";
import ProductEntry from "./pages/ProductEntry";
import PurchaseEntry from "./pages/PurchaseEntry";
import PurchaseBillDashboard from "./pages/PurchaseBillDashboard";
import BarcodePrinting from "./pages/BarcodePrinting";
import StockReport from "./pages/StockReport";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();


const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
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
                  <PurchaseEntry />
                </ProtectedRoute>
              }
            />
            <Route
              path="/purchase-bills"
              element={
                <ProtectedRoute>
                  <PurchaseBillDashboard />
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
