import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";

interface BackToDashboardProps {
  label?: string;
  to?: string;
}

export const BackToDashboard = ({ label = "Back to Dashboard", to = "/" }: BackToDashboardProps) => {
  const { orgNavigate } = useOrgNavigation();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => orgNavigate(to)}
      className="mb-4"
    >
      <Home className="h-4 w-4 mr-2" />
      {label}
    </Button>
  );
};
