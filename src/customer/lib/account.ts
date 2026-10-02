// Customer account (login by mobile number) for the customer app.
// Talks only to the customer-app edge function; the session token lives in
// localStorage per shop subdomain.
import { resolveSubdomain } from "./client";

export type BillSale = {
  id: string;
  sale_number: string;
  sale_date: string;
  customer_name: string;
  items: Array<{
    name: string;
    size: string;
    colour: string | null;
    qty: number;
    rate: number;
    mrp: number;
    discount_percent: number;
    gst_percent: number;
    amount: number;
    taxable: number;
    tax: number;
  }>;
  taxable_value: number;
  tax_total: number;
  discount_amount: number;
  sale_return_adjust: number;
  round_off: number;
  net_amount: number;
  paid_amount: number | null;
  payment_method: string;
  payment_status: string;
  salesman: string | null;
};

export type AccountSummary = {
  shop: string;
  customer: { name: string; phone: string; points: number };
  totals: { bills: number; shopping: number; items: number; returns: number; returnAmount: number };
  balance: { outstanding: number; advance: number; creditNotes: number };
};

export type BillListRow = {
  id: string;
  sale_number: string;
  sale_date: string;
  net_amount: number;
  paid_amount: number;
  payment_status: string;
  total_qty: number;
};

export type ReturnRow = {
  id: string;
  return_number: string | null;
  return_date: string;
  net_amount: number;
  original_sale_number: string | null;
  refund_type: string | null;
  credit_status: string | null;
};

export type TxnRow = {
  date: string;
  kind: "bill" | "payment" | "return";
  ref: string;
  amount: number;
  due?: number;
  saleId?: string;
  note?: string;
};

export type OfferRow = {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  offer_code: string | null;
  valid_till: string | null;
  created_at: string;
};

export class AccountError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const sessionKey = (subdomain: string) => `ezzy_cust_session:${subdomain}`;

export function getSessionToken(subdomain = resolveSubdomain()): string | null {
  try {
    return localStorage.getItem(sessionKey(subdomain));
  } catch {
    return null;
  }
}

function setSessionToken(token: string | null, subdomain = resolveSubdomain()): void {
  try {
    if (token) localStorage.setItem(sessionKey(subdomain), token);
    else localStorage.removeItem(sessionKey(subdomain));
  } catch {
    /* private mode: session lasts this page only */
  }
}

async function call<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const subdomain = resolveSubdomain();
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  let res: Response;
  try {
    res = await fetch(`${base}/functions/v1/customer-app`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ action, subdomain, token: getSessionToken(subdomain), ...args }),
    });
  } catch {
    throw new AccountError("network");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok || data.error) {
    if (data.error === "session_expired") setSessionToken(null, subdomain);
    throw new AccountError(data.error ?? `http_${res.status}`);
  }
  return data as T;
}

export async function loginWithMobile(mobile: string): Promise<void> {
  const res = await call<{ token: string }>("login", { mobile });
  setSessionToken(res.token);
}

/** Opened from a bill link: log in quietly so the account is there next time. */
export async function loginWithBillToken(billToken: string): Promise<void> {
  if (getSessionToken()) return;
  try {
    const res = await call<{ token: string }>("login_bill", { billToken });
    setSessionToken(res.token);
  } catch {
    /* optional convenience — the bill page works without it */
  }
}

export async function logout(): Promise<void> {
  await call("logout").catch(() => undefined);
  setSessionToken(null);
}

export const fetchSummary = () => call<AccountSummary>("summary");
export const fetchBills = (page: number) => call<{ bills: BillListRow[]; hasMore: boolean }>("bills", { page });
export const fetchBill = (saleId: string) => call<{ sale: BillSale; shop: string }>("bill", { saleId });
export const fetchReturns = () => call<{ returns: ReturnRow[] }>("returns");
export const fetchTransactions = () => call<{ transactions: TxnRow[] }>("transactions");
export const fetchOffers = () => call<{ offers: OfferRow[] }>("offers");
export const registerAccountPush = (fcmToken: string, platform: string) =>
  call<{ ok: boolean }>("register_push", { fcmToken, platform });

export function accountErrorMessage(err: unknown): string {
  const code = err instanceof AccountError ? err.code : "";
  switch (code) {
    case "invalid_mobile":
      return "Please enter your 10-digit mobile number.";
    case "no_account":
      return "No bills found for this mobile number at this shop. Use the number given at billing.";
    case "too_many_attempts":
      return "Too many tries. Please wait a few minutes and try again.";
    case "shop_not_found":
      return "This shop's page is not available right now.";
    case "session_expired":
      return "Please log in again.";
    case "bill_not_found":
      return "This bill is not on your account.";
    case "network":
      return "No internet connection. Please try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
