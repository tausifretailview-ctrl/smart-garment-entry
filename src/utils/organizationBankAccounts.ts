export type OrganizationBankAccount = {
  id: string;
  organization_id: string;
  bank_name: string;
  account_holder: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  branch: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export const RECEIVING_BANK_PAYMENT_METHODS = [
  "upi",
  "card",
  "bank_transfer",
  "online",
] as const;

export type ReceivingBankPaymentMethod = (typeof RECEIVING_BANK_PAYMENT_METHODS)[number];

export function paymentMethodNeedsReceivingBank(paymentMethod: string | null | undefined): boolean {
  const pm = (paymentMethod || "").toLowerCase().trim();
  return (RECEIVING_BANK_PAYMENT_METHODS as readonly string[]).includes(pm);
}

export function maskAccountNumber(accountNumber: string | null | undefined): string {
  const raw = (accountNumber || "").replace(/\s/g, "");
  if (!raw) return "";
  if (raw.length <= 4) return raw;
  return `****${raw.slice(-4)}`;
}

export function formatBankAccountLabel(account: Pick<OrganizationBankAccount, "bank_name" | "account_number">): string {
  const mask = maskAccountNumber(account.account_number);
  return mask ? `${account.bank_name} · ${mask}` : account.bank_name;
}

export function pickDefaultBankAccountId(accounts: OrganizationBankAccount[]): string | null {
  if (!accounts.length) return null;
  const def = accounts.find((a) => a.is_default);
  return (def ?? accounts[0]).id;
}

/** Default receiving bank from Settings → Company → Receiving Bank Accounts. */
export function pickDefaultReceivingBankAccount(
  accounts: OrganizationBankAccount[],
): OrganizationBankAccount | null {
  if (!accounts.length) return null;
  return accounts.find((a) => a.is_default) ?? accounts[0];
}

/** Map org receiving bank to invoice template bank_details shape. */
export function organizationBankAccountToInvoiceDetails(
  account: OrganizationBankAccount | null | undefined,
) {
  if (!account) return undefined;
  return {
    bank_name: account.bank_name,
    bankName: account.bank_name,
    account_holder: account.account_holder || "",
    accountHolder: account.account_holder || "",
    account_number: account.account_number || "",
    accountNumber: account.account_number || "",
    ifsc_code: account.ifsc_code || "",
    ifscCode: account.ifsc_code || "",
    branch: account.branch || "",
  };
}

const RECEIVED_IN_MARKER = " | Received in: ";

export function appendReceivingBankToDescription(
  description: string,
  account: Pick<OrganizationBankAccount, "bank_name" | "account_number"> | null | undefined,
): string {
  const base = stripReceivingBankFromDescription(description);
  if (!account?.bank_name) return base;
  const label = formatBankAccountLabel(account);
  return base ? `${base}${RECEIVED_IN_MARKER}${label}` : `${RECEIVED_IN_MARKER.trim()} ${label}`.trim();
}

export function stripReceivingBankFromDescription(description: string): string {
  const idx = description.indexOf(RECEIVED_IN_MARKER);
  if (idx === -1) return description;
  return description.slice(0, idx).trimEnd();
}

export function validateReceivingBankForSave(
  paymentMethod: string,
  accounts: OrganizationBankAccount[],
  selectedBankAccountId: string | null | undefined,
): { ok: true; bankAccountId: string | null } | { ok: false; message: string } {
  if (!paymentMethodNeedsReceivingBank(paymentMethod)) {
    return { ok: true, bankAccountId: null };
  }
  // Receiving bank is optional — for tracking which account got UPI/card/transfer only.
  if (!selectedBankAccountId) {
    return { ok: true, bankAccountId: null };
  }
  const found = accounts.some((a) => a.id === selectedBankAccountId);
  if (!found) {
    return { ok: false, message: "Select a valid bank account or leave unset." };
  }
  return { ok: true, bankAccountId: selectedBankAccountId };
}
