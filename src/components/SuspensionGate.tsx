import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserRoles } from "@/hooks/useUserRoles";
import { SuspendedOrgScreen } from "./SuspendedOrgScreen";

// Routes that must stay accessible even when the org is suspended.
const ALLOW_PATHS = ["/auth", "/reset-password", "/platform-admin", "/pay", "/invoice/view"];

export const SuspensionGate = ({ children }: { children: ReactNode }) => {
  const { currentOrganization } = useOrganization();
  const { isPlatformAdmin } = useUserRoles();
  const location = useLocation();

  const onAllowedPath = ALLOW_PATHS.some((p) => location.pathname.startsWith(p));

  if (
    currentOrganization?.is_suspended &&
    !isPlatformAdmin &&
    !onAllowedPath
  ) {
    return (
      <SuspendedOrgScreen
        orgName={currentOrganization.name}
        reason={currentOrganization.suspension_reason}
      />
    );
  }

  return <>{children}</>;
};

export default SuspensionGate;