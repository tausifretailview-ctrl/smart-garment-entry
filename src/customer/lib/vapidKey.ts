/**
 * The Firebase "Web Push certificate" public key (VAPID) is 65 bytes: 0x04 followed by the
 * P-256 point, written as ~87 characters of URL-safe base64 starting with "B". The browser
 * rejects anything else with "The provided applicationServerKey is not valid", which says
 * nothing about what is wrong. These helpers clean the usual paste mistakes and name the
 * problem (length and kind only, never the key itself).
 */

/** Vercel keeps an env value exactly as typed: strip wrapping quotes and stray whitespace/newlines. */
export function cleanVapidKey(raw: string | undefined | null): string {
  return (raw ?? "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, "");
}

function decodedLength(key: string): { length: number; firstByte: number } | null {
  try {
    const standard = key.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
    const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
    const bytes = atob(padded);
    return { length: bytes.length, firstByte: bytes.length ? bytes.charCodeAt(0) : -1 };
  } catch {
    return null;
  }
}

/** null when the key is usable; otherwise a short, customer-safe reason. */
export function describeVapidKeyProblem(key: string): string | null {
  if (!key) return "empty";
  if (!/^[A-Za-z0-9_\-+/]+={0,2}$/.test(key)) return "bad_characters";
  const decoded = decodedLength(key);
  if (!decoded) return "not_base64";
  // A VAPID *private* key is 32 bytes (43 characters): the most common wrong value to paste.
  if (decoded.length === 32) return "looks_like_private_key";
  if (decoded.length !== 65) return `wrong_length_${decoded.length}_bytes`;
  if (decoded.firstByte !== 0x04) return "not_a_public_key";
  return null;
}
