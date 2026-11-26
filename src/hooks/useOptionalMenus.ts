import { useMemo } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { resolveOptionalMenus, type OptionalMenus } from "@/utils/optionalMenus";

/** Optional menu groups shown for the current organization (Settings → Optional menus). */
export function useOptionalMenus(): OptionalMenus {
  const { currentOrganization } = useOrganization();
  const settings = currentOrganization?.settings;
  return useMemo(() => resolveOptionalMenus(settings), [settings]);
}
