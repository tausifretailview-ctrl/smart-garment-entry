import { useOrganization } from "@/contexts/OrganizationContext";


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
        <span>Connected</span>
      </div>
      <div className="w-px h-3 bg-primary-foreground/20 mx-1" />
      <div className="status-item">
        <span>{currentOrganization?.name || "—"}</span>
      </div>
      <div className="w-px h-3 bg-primary-foreground/20 mx-1" />
      <div className="status-item">
        <span>{fy}</span>
      </div>
      <div className="flex-1" />
      <div className="status-item opacity-50 text-[10px]">
        EzzyERP v2.0
      </div>
    </div>
  );
};
