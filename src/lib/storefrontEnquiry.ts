export const ENQUIRY_RATE_LIMIT_MAX = 5;
export const ENQUIRY_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export type EnquiryRateLimitState = {
  windowStartedAt: number;
  hitCount: number;
};

export function evaluateEnquiryRateLimit(
  prev: EnquiryRateLimitState | null,
  now: number,
  max = ENQUIRY_RATE_LIMIT_MAX,
  windowMs = ENQUIRY_RATE_LIMIT_WINDOW_MS,
): { allowed: boolean; next: EnquiryRateLimitState } {
  if (!prev || now - prev.windowStartedAt >= windowMs) {
    return { allowed: true, next: { windowStartedAt: now, hitCount: 1 } };
  }
  if (prev.hitCount >= max) {
    return { allowed: false, next: prev };
  }
  return {
    allowed: true,
    next: { windowStartedAt: prev.windowStartedAt, hitCount: prev.hitCount + 1 },
  };
}

export function normalizeEnquiryPhone(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

export type EnquiryInput = {
  customerName: string;
  customerPhone: string;
  message?: string;
  productId?: string | null;
};

export type ValidEnquiry = {
  customerName: string;
  customerPhone: string;
  message: string | null;
  productId: string | null;
};

export function validateEnquiryInput(
  input: EnquiryInput,
): { ok: true; value: ValidEnquiry } | { ok: false; error: string } {
  const customerName = String(input.customerName || "").trim();
  const customerPhone = normalizeEnquiryPhone(input.customerPhone);
  const message = String(input.message || "").trim();
  const productId = input.productId ? String(input.productId).trim() : null;

  if (customerName.length < 2 || customerName.length > 80) {
    return { ok: false, error: "Please enter your name" };
  }
  if (customerPhone.length < 10 || customerPhone.length > 15) {
    return { ok: false, error: "Please enter a valid mobile number" };
  }
  if (message.length > 1000) {
    return { ok: false, error: "Message is too long" };
  }
  if (productId && !/^[0-9a-f-]{36}$/i.test(productId)) {
    return { ok: false, error: "Invalid product" };
  }

  return {
    ok: true,
    value: {
      customerName,
      customerPhone,
      message: message || null,
      productId,
    },
  };
}
