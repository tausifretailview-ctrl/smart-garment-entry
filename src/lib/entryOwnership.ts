/**
 * Entry-ownership rule: only the user who created a record may modify or
 * delete it. Admins / owners always bypass.
 *
 * Used to harden multi-user POS / Purchase / Payment flows against the
 * "another terminal saved over my in-flight bill" foot-gun documented in
 * docs/mulund-multi-user-pos-audit-2026-06-18.md.
 *
 * Legacy rows with `created_by = null` are left editable (admin-or-owner
 * is still required when a role check is required) so historical data is
 * never locked out.
 */
export type EntryOwnershipInput = {
  currentUserId: string | null | undefined;
  createdBy: string | null | undefined;
  isOwnerOrAdmin: boolean;
  /** Optional human-readable creator name used to compose the reason. */
  creatorName?: string | null;
};

export type EntryOwnershipResult = {
  allowed: boolean;
  reason?: string;
};

export function canModifyEntry(input: EntryOwnershipInput): EntryOwnershipResult {
  const { currentUserId, createdBy, isOwnerOrAdmin, creatorName } = input;

  if (isOwnerOrAdmin) return { allowed: true };
  if (!createdBy) return { allowed: true }; // legacy row (created_by not recorded)
  if (currentUserId && createdBy === currentUserId) return { allowed: true };

  const who = creatorName?.trim() ? creatorName.trim() : "the user who created it";
  return {
    allowed: false,
    reason: `Only ${who} or an admin can modify this entry.`,
  };
}