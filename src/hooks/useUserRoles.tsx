import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  PERMISSION_VERIFY_BACKOFF_MS,
  isTransientPermissionError,
  refreshAuthSessionQuietly,
  sleep,
  withAttemptTimeout,
} from "@/lib/resilientPermissionVerify";

type AppRole = "admin" | "manager" | "user" | "platform_admin";

const MAX_VERIFY_ATTEMPTS = PERMISSION_VERIFY_BACKOFF_MS.length + 1;

async function loadUserRolesOnce(
  userId: string,
  organizationId?: string,
): Promise<AppRole[]> {
  return withAttemptTimeout(async () => {
    const { data: globalRoles, error: globalError } = await (supabase as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (globalError) throw globalError;

    const allRoles: AppRole[] = globalRoles?.map((r: any) => r.role as AppRole) || [];

    const orgId =
      organizationId ||
      localStorage.getItem(`currentOrgId_${userId}`) ||
      localStorage.getItem("selectedOrgId");

    if (orgId) {
      const { data: orgMember, error: orgError } = await supabase
        .from("organization_members")
        .select("role")
        .eq("user_id", userId)
        .eq("organization_id", orgId)
        .maybeSingle();

      if (!orgError && orgMember?.role && !allRoles.includes(orgMember.role as AppRole)) {
        allRoles.push(orgMember.role as AppRole);
      }
    }

    return allRoles;
  });
}

export const useUserRoles = (organizationId?: string) => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [verifyGeneration, setVerifyGeneration] = useState(0);
  const runIdRef = useRef(0);

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
      setLoading(true);
      setError(null);

      let lastError: Error | null = null;

      for (let attempt = 0; attempt < MAX_VERIFY_ATTEMPTS; attempt++) {
        if (cancelled || runId !== runIdRef.current) return;

        if (attempt > 0) {
          await refreshAuthSessionQuietly();
          await sleep(PERMISSION_VERIFY_BACKOFF_MS[attempt - 1]);
        }

        try {
          const allRoles = await loadUserRolesOnce(user.id, organizationId);
          if (cancelled || runId !== runIdRef.current) return;
          setRoles(allRoles);
          setLoading(false);
          setError(null);
          return;
        } catch (err: unknown) {
          if (cancelled || runId !== runIdRef.current) return;
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
      setError(lastError ?? new Error("Unable to verify permissions"));
      setRoles([]);
      setLoading(false);
    };

    void verifyRoles();

    return () => {
      cancelled = true;
    };
  }, [user, organizationId, verifyGeneration]);

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
