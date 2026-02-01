import { useState } from "react";
import { Plus, X, ShoppingCart, CreditCard, Package, Users } from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { cn } from "@/lib/utils";

interface FABAction {
  icon: React.ElementType;
  label: string;
  path: string;
  color: string;
}

const fabActions: FABAction[] = [
  { icon: ShoppingCart, label: "POS Sale", path: "/pos-sales", color: "bg-green-500" },
  { icon: CreditCard, label: "Payment", path: "/payments-dashboard", color: "bg-blue-500" },
  { icon: Package, label: "Purchase", path: "/purchase-entry", color: "bg-amber-500" },
  { icon: Users, label: "Customer", path: "/customers", color: "bg-purple-500" },
];

export const MobileFAB = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { orgNavigate } = useOrgNavigation();

  const handleAction = (path: string) => {
    setIsOpen(false);
    orgNavigate(path);
  };

  return (
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
        "flex flex-col-reverse gap-3 mb-3 transition-all duration-200",
        isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      )}>
        {fabActions.map((action, index) => {
          const Icon = action.icon;
          return (
            <button
              key={action.path}
              onClick={() => handleAction(action.path)}
              className={cn(
                "flex items-center gap-3 transition-all duration-150",
                "active:scale-95 touch-manipulation"
              )}
              style={{ 
                transitionDelay: isOpen ? `${index * 50}ms` : "0ms",
                transform: isOpen ? "translateX(0)" : "translateX(20px)"
              }}
            >
              <span className="bg-background/95 backdrop-blur-sm text-foreground text-sm font-medium px-3 py-1.5 rounded-lg shadow-lg border border-border whitespace-nowrap">
                {action.label}
              </span>
              <div className={cn(
                "w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-white",
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
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-14 h-14 rounded-full shadow-lg flex items-center justify-center",
          "bg-primary text-primary-foreground",
          "transition-all duration-200 active:scale-95 touch-manipulation",
          isOpen && "rotate-45 bg-muted text-muted-foreground"
        )}
      >
        {isOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>
    </div>
  );
};
