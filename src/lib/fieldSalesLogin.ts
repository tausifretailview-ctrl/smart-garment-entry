import { normalizeOrgSlug } from "@/lib/orgSlug";

/**
 * Field Sales login by mobile number.
 *
 * Shops could only give a salesman the Field Sales app by first making a login (email +
 * password) elsewhere and then linking it in Employee Master. Now Employee Master makes the
 * login itself from the employee's mobile number: the account's email is built from the mobile
 * number and the shop code (never shown, never mailed: it is confirmed when made), and the
 * Field Sales login page turns a typed mobile number back into it.
 *
 *   7385990258 at shop "jindal-trading" -> 7385990258.jindal-trading@fieldsales.ezzy.shop
 *
 * The same mobile number in two shops gives two different logins.
 */

export const FIELD_SALES_LOGIN_DOMAIN = "fieldsales.ezzy.shop";
export const FIELD_SALES_PASSWORD_MIN = 6;

/** Digits of a mobile number as the login uses them, or null when it cannot be one. */
export function normalizeLoginMobile(raw: string | null | undefined): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** The hidden email of a shop's mobile-number login, or null without a mobile or shop code. */
export function fieldSalesLoginEmail(mobile: string | null | undefined, orgSlug: string | null | undefined): string | null {
  const digits = normalizeLoginMobile(mobile);
  const slug = normalizeOrgSlug(orgSlug);
  if (!digits || !slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
  return `${digits}.${slug}@${FIELD_SALES_LOGIN_DOMAIN}`;
}

/**
 * What the salesman typed on the Field Sales login page -> the email to sign in with.
 * An email is used as typed; a mobile number becomes this shop's mobile login.
 */
export function fieldSalesLoginIdToEmail(typed: string, orgSlug: string | null | undefined): string {
  const t = String(typed ?? "").trim();
  if (!t || t.includes("@")) return t;
  return fieldSalesLoginEmail(t, orgSlug) ?? t;
}

/** The mobile number of a mobile-number login, for showing instead of its hidden email. */
export function mobileFromFieldSalesLoginEmail(email: string | null | undefined): string | null {
  const m = /^(\d{8,15})\.[a-z0-9-]+@fieldsales\.ezzy\.shop$/i.exec(String(email ?? "").trim());
  return m ? m[1] : null;
}

/** How a login is shown in pickers: "Mobile 7385990258" for a mobile login, else the email. */
export function loginDisplayName(email: string | null | undefined): string {
  const mobile = mobileFromFieldSalesLoginEmail(email);
  return mobile ? `Mobile ${mobile}` : String(email ?? "");
}

export type CreateLoginResult = { userId: string; email: string; existed: boolean };

/**
 * Make (or find) the mobile-number login for an employee. Uses create-org-user, which only an
 * admin of the shop may call. When the login already exists in the shop it is reused.
 */
export async function createFieldSalesMobileLogin(args: {
  supabaseUrl: string;
  accessToken: string;
  organizationId: string;
  orgSlug: string;
  mobile: string;
  password: string;
  existingUsers: Array<{ id: string; email: string }>;
  fetchImpl?: typeof fetch;
}): Promise<CreateLoginResult> {
  const email = fieldSalesLoginEmail(args.mobile, args.orgSlug);
  if (!email) throw new Error("Enter the employee's mobile number (10 digits) first.");
  const existing = args.existingUsers.find((u) => u.email.toLowerCase() === email);
  if (existing) return { userId: existing.id, email, existed: true };
  if (String(args.password ?? "").length < FIELD_SALES_PASSWORD_MIN) {
    throw new Error(`Password must be at least ${FIELD_SALES_PASSWORD_MIN} characters.`);
  }
  const response = await (args.fetchImpl ?? fetch)(`${args.supabaseUrl}/functions/v1/create-org-user`, {
    method: "POST",
    headers: { Authorization: `Bearer ${args.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: args.password, role: "user", organizationId: args.organizationId }),
  });
  let body: { error?: string; user?: { id?: string } } = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) {
    const msg = String(body.error || "");
    if (/already (been )?registered|already exists/i.test(msg)) {
      throw new Error("A login for this mobile number already exists. Pick it in the list, or reset its password in User Rights.");
    }
    if (/only organization admins/i.test(msg)) {
      throw new Error("Only a shop admin can create a login.");
    }
    throw new Error(msg || "Could not create the login.");
  }
  const userId = body.user?.id;
  if (!userId) throw new Error("Could not create the login.");
  return { userId, email, existed: false };
}
