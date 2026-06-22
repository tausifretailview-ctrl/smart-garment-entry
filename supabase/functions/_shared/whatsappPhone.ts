/** Normalize phone for WhatsApp send (Indian numbers → 91 prefix). */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return "";

  const cleaned = phone.replace(/\D/g, "");

  if (cleaned.length === 10) {
    return `91${cleaned}`;
  }

  return cleaned;
}
