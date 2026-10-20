import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isJwtExpiredError } from "@/lib/jwtRetry";
import {
  PERMISSION_VERIFY_BACKOFF_MS,
  isTransientPermissionError,
  refreshAuthSessionQuietly,
  sleep,
  withAttemptTimeout,
} from "@/lib/resilientPermissionVerify";
import {
  dedupeUserRolesLoad,
  isUserRolesEntryFresh,
  readCachedUserRoles,
  userRolesCacheKey,
  writeCachedUserRoles,
} from "@/lib/userRolesCache";

type AppRole = "admin" | "manager" | "user" | "platform_admin";

const MAX_VERIFY_ATTEMPTS = PERMISSION_VERIFY_BACKOFF_MS.length + 1;

function resolveRolesOrgId(userId: string, organizationId?: string): string | null {
  if (organizationId) return organizationId;
  try {
    return (
      localStorage.getItem(`currentOrgId_${userId}`) ||
      localStorage.getItem("selectedOrgId")
    );
  } catch {
    return null;
  }
}

async function loadUserRolesOnce(
  userId: string,
  orgId: string | null,
): Promise<AppRole[]> {
  return withAttemptTimeout(async () => {
    const { data: globalRoles, error: globalError } = await (supabase as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (globalError) throw globalError;

    const allRoles: AppRole[] = globalRoles?.map((r: any) => r.role as AppRole) || [];

    if (orgId) {
      const { data: orgMember, error: orgError } = await supabase
        .from("organization_members")
        .select("role")
        .eq("user_id", userId)
        .eq("organization_id", orgId)
        .maybeSingle();

      // Failing here (instead of returning only the global roles) retries the
      // check and keeps a half answer out of the shared roles cache.
      if (orgError) throw orgError;
      if (orgMember?.role && !allRoles.includes(orgMember.role as AppRole)) {
        allRoles.push(orgMember.role as AppRole);
      }
    }

    return allRoles;
  });
}

export const useUserRoles = (organizationId?: string) => {
  const { user } = useAuth();
  const userId = user?.id;
  const cacheKey = userId
    ? userRolesCacheKey(userId, resolveRolesOrgId(userId, organizationId))
    : null;
  // Seed from the last verified roles so a known user + org renders at once
  // instead of waiting on two round trips behind a spinner on every page open.
  const initialCached = cacheKey ? readCachedUserRoles(cacheKey) : null;
  const [roles, setRoles] = useState<AppRole[]>(() => initialCached?.roles ?? []);
  const [loading, setLoading] = useState(() => !initialCached);
  const [error, setError] = useState<Error | null>(null);
  const [verifyGeneration, setVerifyGeneration] = useState(0);
  const runIdRef = useRef(0);
  const hasLoadedRef = useRef(!!initialCached);

  const refetch = useCallback(() => {
    setVerifyGeneration((g) => g + 1);
  }, []);

  useEffect(() => {
    const runId = ++runIdRef.current;
    let cancelled = false;

    const verifyRoles = async () => {
      if (!user) {
        if (cancelled || runId !== runIdRef.current) return;
        setRoles([]);
        setLoading(false);
        setError(null);
        return;
      }

      if (cancelled || runId !== runIdRef.current) return;
      const orgId = resolveRolesOrgId(user.id, organizationId);
      const key = userRolesCacheKey(user.id, orgId);
      const cached = readCachedUserRoles(key);
      if (cached) {
        setRoles(cached.roles);
        setLoading(false);
        setError(null);
        hasLoadedRef.current = true;
        // Verified moments ago (another pane, the sidebar): skip the database.
        // An explicit Retry (verifyGeneration > 0) always goes to the network.
        if (verifyGeneration === 0 && isUserRolesEntryFresh(cached)) return;
      }
      // Only show the loading shell on the very first verification — subsequent
      // re-checks (e.g. AuthContext refreshing the session on tab resume) must
      // not unmount the active dashboard. Matches Sales Invoice Dashboard.
      if (!hasLoadedRef.current) {
        setLoading(true);
      }
      setError(null);

      let lastError: Error | null = null;
      let lastRaw: unknown = null;

      for (let attempt = 0; attempt < MAX_VERIFY_ATTEMPTS; attempt++) {
        if (cancelled || runId !== runIdRef.current) return;

        if (attempt > 0) {
          // A 429 from the purchase-bill API is not an expired login. Refreshing
          // the token on every failed permission check is what rate-limited
          // Balaji Creation and then signed every browser out.
          if (isJwtExpiredError(lastRaw)) {
            await refreshAuthSessionQuietly();
          }
          await sleep(PERMISSION_VERIFY_BACKOFF_MS[attempt - 1]);
        }

        try {
          const allRoles = await dedupeUserRolesLoad(key, () =>
            loadUserRolesOnce(user.id, orgId),
          );
          writeCachedUserRoles(key, allRoles);
          if (cancelled || runId !== runIdRef.current) return;
          setRoles(allRoles);
          setLoading(false);
          hasLoadedRef.current = true;
          setError(null);
          return;
        } catch (err: unknown) {
          if (cancelled || runId !== runIdRef.current) return;
          lastRaw = err;
          lastError = err instanceof Error ? err : new Error(String(err));

          if (import.meta.env.DEV) {
            console.warn(
              `useUserRoles: attempt ${attempt + 1}/${MAX_VERIFY_ATTEMPTS} failed:`,
              lastError.message,
            );
          }

          const canRetry =
            attempt < MAX_VERIFY_ATTEMPTS - 1 && isTransientPermissionError(lastError);

          if (!canRetry) break;
        }
      }

      if (cancelled || runId !== runIdRef.current) return;
      // A failed background re-check keeps the roles already showing (cached or
      // verified earlier) instead of replacing a working page with an error.
      if (cached) return;
      setError(lastError ?? new Error("Unable to verify permissions"));
      setRoles([]);
      setLoading(false);
    };

    void verifyRoles();

    return () => {
      cancelled = true;
    };
    // Depend on user?.id (stable across session refreshes) instead of the user
    // object itself — otherwise tab-resume session refresh re-runs verification
    // and unmounts role-protected pages.
  }, [userId, organizationId, verifyGeneration]);

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole("admin");
  const isManager = hasRole("manager");
  const isPlatformAdmin = hasRole("platform_admin");
  const canAccessSettings = isAdmin;
  const canAccessPurchases = isAdmin || isManager;

  return {
    roles,
    loading,
    error,
    refetch,
    hasRole,
    isAdmin,
    isManager,
    isPlatformAdmin,
    canAccessSettings,
    canAccessPurchases,
  };
};
