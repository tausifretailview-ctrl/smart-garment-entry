import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Plus, X, ShoppingCart, CreditCard, Package, Users, Building2, Box, Undo2 } from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { cn } from "@/lib/utils";
import { QuickAddCustomerDialog } from "./QuickAddCustomerDialog";
import { QuickAddSupplierDialog } from "./QuickAddSupplierDialog";
import { QuickAddProductDialog } from "./QuickAddProductDialog";

interface FABAction {
  icon: React.ElementType;
  label: string;
  path?: string;
  action?: string;
  color: string;
}

const fabActions: FABAction[] = [
  { icon: ShoppingCart, label: "Add Sale", path: "/pos-sales", color: "bg-green-500" },
  { icon: Package, label: "Purchase", path: "/purchase-entry", color: "bg-amber-500" },
  { icon: CreditCard, label: "Payment", path: "/payments-dashboard", color: "bg-blue-500" },
  { icon: Users, label: "Customer", action: "quick-add-customer", color: "bg-purple-500" },
  { icon: Building2, label: "Supplier", action: "quick-add-supplier", color: "bg-orange-500" },
  { icon: Box, label: "Product", action: "quick-add-product", color: "bg-teal-500" },
  { icon: Undo2, label: "Sale Return", path: "/sale-return-entry", color: "bg-red-500" },
];

export const MobileFAB = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const { orgNavigate, getOrgPath } = useOrgNavigation();
  const location = useLocation();

  // Hide FAB on POS page - POS has its own interface
  const hiddenRoutes = ["/pos-sales", "/pos"];
  const shouldHide = hiddenRoutes.some(route => 
    location.pathname === getOrgPath(route) || 
    location.pathname.includes("/pos-sales") ||
    location.pathname.includes("/pos")
  );

  if (shouldHide) return null;

  const handleAction = (action: FABAction) => {
    setIsOpen(false);
    
    if (action.action === "quick-add-customer") {
      setShowCustomerDialog(true);
    } else if (action.action === "quick-add-supplier") {
      setShowSupplierDialog(true);
    } else if (action.action === "quick-add-product") {
      setShowProductDialog(true);
    } else if (action.path) {
      orgNavigate(action.path);
    }
  };

  // Single tap on main FAB goes directly to POS
  const handleMainFABClick = () => {
    if (isOpen) {
      setIsOpen(false);
    } else {
      orgNavigate("/pos-sales");
    }
  };

  // Long press expands the menu
  const handleMainFABLongPress = () => {
    setIsOpen(true);
  };

  return (
    <>
      <div className="fixed bottom-20 right-4 z-50 lg:hidden">
        {/* Backdrop */}
        {isOpen && (
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm -z-10"
            onClick={() => setIsOpen(false)}
          />
        )}
        
        {/* Action buttons */}
        <div className={cn(
          "flex flex-col-reverse gap-2.5 mb-3 transition-all duration-200",
          isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        )}>
          {fabActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => handleAction(action)}
                className={cn(
                  "flex items-center gap-3 transition-all duration-150",
                  "active:scale-95 touch-manipulation"
                )}
                style={{ 
                  transitionDelay: isOpen ? `${index * 40}ms` : "0ms",
                  transform: isOpen ? "translateX(0)" : "translateX(20px)"
                }}
              >
                <span className="bg-background/95 backdrop-blur-sm text-foreground text-sm font-medium px-3 py-1.5 rounded-lg shadow-lg border border-border whitespace-nowrap">
                  {action.label}
                </span>
                <div className={cn(
                  "w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-white",
                  action.color
                )}>
                  <Icon className="h-5 w-5" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Main FAB button */}
        <button
          onClick={handleMainFABClick}
          onContextMenu={(e) => {
            e.preventDefault();
            handleMainFABLongPress();
          }}
          onTouchStart={() => {
            // Start a timer for long press detection
            const timer = setTimeout(() => {
              handleMainFABLongPress();
            }, 500);
            // Store timer in element to clear on touch end
            (document.getElementById('main-fab') as any)._longPressTimer = timer;
          }}
          onTouchEnd={() => {
            const timer = (document.getElementById('main-fab') as any)?._longPressTimer;
            if (timer) clearTimeout(timer);
          }}
          id="main-fab"
          className={cn(
            "w-14 h-14 rounded-full shadow-lg flex items-center justify-center",
            "bg-green-500 text-white",
            "transition-all duration-200 active:scale-95 touch-manipulation",
            isOpen && "rotate-45 bg-muted text-muted-foreground"
          )}
        >
          {isOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </button>
      </div>

      {/* Quick Add Dialogs */}
      <QuickAddCustomerDialog 
        open={showCustomerDialog} 
        onOpenChange={setShowCustomerDialog} 
      />
      <QuickAddSupplierDialog 
        open={showSupplierDialog} 
        onOpenChange={setShowSupplierDialog} 
      />
      <QuickAddProductDialog 
        open={showProductDialog} 
        onOpenChange={setShowProductDialog} 
      />
    </>
  );
};
