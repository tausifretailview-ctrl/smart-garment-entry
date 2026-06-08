import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { resolveFirstAllowedPath } from "@/lib/menuPermissions";
import { useOrganization } from "@/contexts/OrganizationContext";
import { isGlobalShortcutBlocked } from "@/lib/keyboardShortcuts";

type NavTarget = {
  path: string;
  permission: string;
  altKey: string;
  ctrlShiftKey: string;
};

const MODULE_SHORTCUTS: NavTarget[] = [
  { path: "pos-sales", permission: "pos_sales", altKey: "p", ctrlShiftKey: "p" },
  { path: "sales-invoice", permission: "sales_invoice", altKey: "n", ctrlShiftKey: "s" },
  { path: "purchase-entry", permission: "purchase_bill", altKey: "b", ctrlShiftKey: "b" },
];

/**
 * Tally-style module shortcuts: Alt+P/N/B and Ctrl+Shift+P/S/B (work inside inputs).
 * Mounted once at org layout so Full Screen / POS shells all receive them.
 */
export function useGlobalNavigationShortcuts() {
  const { orgNavigate } = useOrgNavigation();
  const location = useLocation();
  const { hasMenuAccess, permissions, loading: permissionsLoading } = useUserPermissions();
  const { organizationRole } = useOrganization();

  useEffect(() => {
    const canGo = (permission: string) =>
      !permissionsLoading && (permissions === null || hasMenuAccess(permission));

    const go = (path: string, permission: string) => {
      if (!canGo(permission)) return;
      orgNavigate(`/${path}`);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isGlobalShortcutBlocked()) return;

      const key = e.key.toLowerCase();

      // Alt+D — dashboard (first allowed home)
      if (e.altKey && !e.ctrlKey && !e.shiftKey && key === "d") {
        e.preventDefault();
        if (permissionsLoading) return;
        const fallback = resolveFirstAllowedPath(hasMenuAccess, permissions, organizationRole);
        orgNavigate(fallback ? `/${fallback}` : "/");
        return;
      }

      // Alt+S — stock report
      if (e.altKey && !e.ctrlKey && !e.shiftKey && key === "s") {
        e.preventDefault();
        go("stock-report", "stock_report");
        return;
      }

      const ctrlShift = e.ctrlKey && e.shiftKey && !e.altKey;
      const altOnly = e.altKey && !e.ctrlKey && !e.shiftKey;

      for (const target of MODULE_SHORTCUTS) {
        const match =
          (altOnly && key === target.altKey) ||
          (ctrlShift && key === target.ctrlShiftKey);
        if (match) {
          e.preventDefault();
          if (target.path === "purchase-entry") {
            if (!canGo(target.permission)) return;
            orgNavigate("/purchase-entry", { state: { newBill: true } });
          } else {
            go(target.path, target.permission);
          }
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    orgNavigate,
    permissionsLoading,
    hasMenuAccess,
    permissions,
    organizationRole,
    location.pathname,
  ]);
}

/** Electron menu → same routes as Alt shortcuts (Windows desktop shell). */
export function useElectronNavigationBridge() {
  const { orgNavigate } = useOrgNavigation();
  const { hasMenuAccess, permissions, loading: permissionsLoading } = useUserPermissions();
  const { organizationRole } = useOrganization();

  useEffect(() => {
    const api = (window as unknown as { electronAPI?: { onNavigate?: (cb: (path: string) => void) => () => void } })
      .electronAPI;
    if (!api?.onNavigate) return;

    return api.onNavigate((path) => {
      if (permissionsLoading) return;
      if (path === "dashboard" || path === "/") {
        const fallback = resolveFirstAllowedPath(hasMenuAccess, permissions, organizationRole);
        orgNavigate(fallback ? `/${fallback}` : "/");
        return;
      }
      const clean = path.replace(/^\//, "");
      const permissionMap: Record<string, string> = {
        "pos-sales": "pos_sales",
        "sales-invoice": "sales_invoice",
        "purchase-entry": "purchase_bill",
        "stock-report": "stock_report",
      };
      const perm = permissionMap[clean];
      if (perm && permissions !== null && !hasMenuAccess(perm)) return;
      if (clean === "purchase-entry") {
        orgNavigate("/purchase-entry", { state: { newBill: true } });
        return;
      }
      orgNavigate(`/${clean}`);
    });
  }, [orgNavigate, permissionsLoading, hasMenuAccess, permissions, organizationRole]);
}
