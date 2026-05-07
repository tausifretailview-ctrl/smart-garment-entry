import { useEffect } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";

export function usePageTitle(pageName: string) {
  const { currentOrganization } = useOrganization();

  useEffect(() => {
    const orgName = currentOrganization?.name || "EzzyERP";
    document.title = `${pageName} — ${orgName}`;
    return () => {
      document.title = "EzzyERP";
    };
  }, [pageName, currentOrganization?.name]);
}
