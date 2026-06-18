import { useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRoles } from "@/hooks/useUserRoles";
import { canModifyEntry } from "@/lib/entryOwnership";

/**
 * Hook wrapper around {@link canModifyEntry} that resolves the current
 * auth user + admin status once, and returns a stable `canModify` predicate
 * for use in row-level guards across POS / Purchase / Payment dashboards.
 */
export function useEntryOwnership() {
  const { user } = useAuth();
  const { isAdmin, loading } = useUserRoles();

  const userId = user?.id;
  const isOwnerOrAdmin = isAdmin;

  const canModify = useCallback(
    (createdBy: string | null | undefined, creatorName?: string | null) =>
      canModifyEntry({
        currentUserId: userId,
        createdBy,
        isOwnerOrAdmin,
        creatorName,
      }),
    [userId, isOwnerOrAdmin],
  );

  return useMemo(
    () => ({
      userId,
      isOwnerOrAdmin,
      rolesLoading: loading,
      canModify,
    }),
    [userId, isOwnerOrAdmin, loading, canModify],
  );
}