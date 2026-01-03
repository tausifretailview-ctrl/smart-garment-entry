import { Button } from "@/components/ui/button";
import { TrendingUp, Package, Users, HelpCircle } from "lucide-react";

interface QuickActionsProps {
  onAction: (query: string) => void;
  disabled?: boolean;
}

const quickActions = [
  {
    label: "Today's Sales",
    query: "What's today's total sales?",
    icon: TrendingUp,
  },
  {
    label: "Low Stock",
    query: "Show items with low stock (less than 10)",
    icon: Package,
  },
  {
    label: "Top Customers",
    query: "Who are the top 5 customers by sales?",
    icon: Users,
  },
  {
    label: "Help",
    query: "How do I create a new sale?",
    icon: HelpCircle,
  },
];

export const QuickActions = ({ onAction, disabled }: QuickActionsProps) => {
  return (
    <div className="flex flex-wrap gap-2 px-3 pb-2">
      {quickActions.map((action) => (
        <Button
          key={action.label}
          variant="outline"
          size="sm"
          onClick={() => onAction(action.query)}
          disabled={disabled}
          className="h-7 text-xs gap-1"
        >
          <action.icon className="h-3 w-3" />
          {action.label}
        </Button>
      ))}
    </div>
  );
};
