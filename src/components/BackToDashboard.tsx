import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

interface BackToDashboardProps {
  label?: string;
  to?: string;
}

export const BackToDashboard = ({ label = "Back to Dashboard", to = "/" }: BackToDashboardProps) => {
  const navigate = useNavigate();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => navigate(to)}
      className="mb-4"
    >
      <Home className="h-4 w-4 mr-2" />
      {label}
    </Button>
  );
};
