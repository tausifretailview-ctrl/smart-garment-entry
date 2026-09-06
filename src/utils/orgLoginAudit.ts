import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";

export const LOGIN_AUDIT_ACTION = "LOGIN";
export const LOGIN_AUDIT_ENTITY_TYPE = "auth";
export const ORG_LOGIN_HISTORY_MAX = 200;
export const ORG_LOGIN_HISTORY_DEFAULT_LIMIT = 100;

export type OrgLoginHistoryRow = {
  user_email: string | null;
  logged_in_at: string;
};

export type LoginAuditInsert = {
  organization_id: string;
  user_id: string;
  user_email: string | null | undefined;
  action: typeof LOGIN_AUDIT_ACTION;
  entity_type: typeof LOGIN_AUDIT_ENTITY_TYPE;
  entity_id: string;
  user_agent: string;
};

export function buildLoginAuditRow(args: {
  organizationId: string;
  userId: string;
  userEmail: string | null | undefined;
  userAgent: string;
}): LoginAuditInsert {
  return {
    organization_id: args.organizationId,
    user_id: args.userId,
    user_email: args.userEmail,
    action: LOGIN_AUDIT_ACTION,
    entity_type: LOGIN_AUDIT_ENTITY_TYPE,
    entity_id: args.userId,
    user_agent: args.userAgent,
  };
}

/**
 * Fire-and-forget — never block or fail the actual login over a logging
 * error, same resilience pattern as errorLogger.ts elsewhere in this app.
 */
export function logSuccessfulOrgLogin(
  client: SupabaseClient,
  args: {
    organizationId: string;
    userId: string;
    userEmail: string | null | undefined;
    userAgent: string;
  },
): void {
  client
    .from("audit_logs")
    .insert(buildLoginAuditRow(args))
    .then(({ error }) => {
      if (error) console.error("Login audit log failed:", error);
    });
}

export async function fetchOrganizationLoginHistory(
  client: SupabaseClient,
  orgId: string,
  limit: number = ORG_LOGIN_HISTORY_DEFAULT_LIMIT,
): Promise<OrgLoginHistoryRow[]> {
  const { data, error } = await client.rpc("get_organization_login_history", {
    p_org_id: orgId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as OrgLoginHistoryRow[];
}

export function formatOrgLoginAt(loggedInAt: string): string {
  return format(new Date(loggedInAt), "dd/MM/yyyy, hh:mm a");
}
