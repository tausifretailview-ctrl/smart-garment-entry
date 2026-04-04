import { useOrganization } from "@/contexts/OrganizationContext";
import { Database, Calendar, Wifi } from "lucide-react";

export const StatusBar = () => {
  const { currentOrganization } = useOrganization();

  // Current financial year (Indian FY: Apr-Mar)
  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fy = `FY ${fyStart}-${(fyStart + 1).toString().slice(-2)}`;

  return (
    <div className="erp-status-bar hidden lg:flex">
      <div className="status-item">
        <span className="status-dot" />
        <Wifi className="h-3 w-3" />
        <span>Connected</span>
      </div>
      <div className="status-item">
        <Database className="h-3 w-3" />
        <span>{currentOrganization?.name || "—"}</span>
      </div>
      <div className="status-item">
        <Calendar className="h-3 w-3" />
        <span>{fy}</span>
      </div>
      <div className="flex-1" />
      <div className="status-item opacity-60">
        <span>EzzyERP v2.0</span>
      </div>
    </div>
  );
};
