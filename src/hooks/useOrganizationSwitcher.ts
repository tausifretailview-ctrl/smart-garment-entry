import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrganization } from "@/contexts/OrganizationContext";

/** Shared switch + navigate logic for OrganizationSelector and CompactOrgSwitcher. */
export function useOrganizationSwitcher() {
  const { currentOrganization, organizations, switchOrganization } = useOrganization();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleSwitchOrganization = useCallback(
    (org: (typeof organizations)[0]) => {
      switchOrganization(org.id);
      setOpen(false);
      navigate(`/${org.slug}`);
    },
    [navigate, switchOrganization],
  );

  return {
    currentOrganization,
    organizations,
    open,
    setOpen,
    handleSwitchOrganization,
  };
}
