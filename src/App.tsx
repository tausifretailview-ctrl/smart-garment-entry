import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import ProductEntry from "./pages/ProductEntry";
import PurchaseEntry from "./pages/PurchaseEntry";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const Navigation = () => (
  <nav className="bg-card border-b border-border sticky top-0 z-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between h-16">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-primary">Smart Inventory</span>
        </div>
        <div className="flex gap-4">
          <Link
            to="/product-entry"
            className="px-4 py-2 rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            Product Entry
          </Link>
          <Link
            to="/purchase-entry"
            className="px-4 py-2 rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            Purchase Entry
          </Link>
        </div>
      </div>
    </div>
  </nav>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Navigation />
        <Routes>
          <Route path="/" element={<ProductEntry />} />
          <Route path="/product-entry" element={<ProductEntry />} />
          <Route path="/purchase-entry" element={<PurchaseEntry />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
