/**
 * Client-side guard before saving WappConnect instance secrets.
 * WappConnect's API `token` must be the instance id from their dashboard — not login email/password.
 */
export function validateWappConnectInstanceId(value: string): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;

  if (trimmed.includes("@")) {
    return (
      "This looks like a login email, not a WappConnect instance id. " +
      "In the WappConnect dashboard, open your connected WhatsApp instance and copy the Instance id field — not your email or password."
    );
  }

  if (/\s/.test(trimmed)) {
    return "Instance id should not contain spaces.";
  }

  return null;
}
