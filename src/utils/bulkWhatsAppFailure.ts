/**
 * Bulk WhatsApp failure reasons in plain words. The WhatsApp server stores either its own text
 * ("Not on WhatsApp") or a raw WhatsApp error ("Timed Out", "rate-overlimit"); shops see these.
 */
export interface FailureReason {
  /** Short label for the reason chip and the report column. */
  label: string;
  /** One line on what it means and what to do. */
  hint: string;
}

const RULES: { test: RegExp; reason: FailureReason }[] = [
  {
    test: /not on whatsapp/i,
    reason: { label: "Not on WhatsApp", hint: "This number has no WhatsApp account. Check the number or remove it." },
  },
  {
    test: /invalid phone|bad-request|item-not-found|jid/i,
    reason: { label: "Wrong number", hint: "The number is incomplete or wrong. Check the digits." },
  },
  {
    test: /unsubscribed/i,
    reason: { label: "Unsubscribed", hint: "The customer replied STOP, so no more promotions go to them." },
  },
  {
    test: /rate-overlimit|429|too many/i,
    reason: {
      label: "WhatsApp slowed sending",
      hint: "WhatsApp limited your number for sending too fast. Send fewer messages per day for a while.",
    },
  },
  {
    test: /forbidden|403|not-authorized|401|blocked|banned/i,
    reason: {
      label: "Blocked by WhatsApp",
      hint: "WhatsApp refused this message. The customer may have blocked you, or your number is restricted.",
    },
  },
  {
    test: /daily send limit/i,
    reason: { label: "Daily limit reached", hint: "Your number reached today's limit. Send the rest tomorrow." },
  },
  {
    test: /media upload|upload failed|could not download|too large|poster/i,
    reason: { label: "Poster or video failed", hint: "The photo or video could not be uploaded. Try a smaller file." },
  },
  {
    test: /timed out|timeout/i,
    reason: { label: "WhatsApp did not answer", hint: "WhatsApp took too long to reply. Usually fine to send again." },
  },
  {
    test: /connection|not connected|closed|terminated|logged out|stream errored/i,
    reason: {
      label: "Your WhatsApp disconnected",
      hint: "Your linked WhatsApp went offline while sending. Keep the phone online and send again.",
    },
  },
];

/** Plain-words reason for a failed or skipped number; null when there is no error text. */
export function describeBulkFailure(error: string | null | undefined): FailureReason | null {
  const raw = (error ?? "").trim();
  if (!raw) return null;
  for (const r of RULES) if (r.test.test(raw)) return r.reason;
  return { label: "Send failed", hint: raw };
}

/** Failed numbers grouped by reason, biggest group first. */
export function groupBulkFailures<T extends { status: string; error: string | null }>(rows: T[]) {
  const groups = new Map<string, { reason: FailureReason; count: number }>();
  for (const r of rows) {
    if (r.status !== "failed") continue;
    const reason = describeBulkFailure(r.error) ?? { label: "Send failed", hint: "No reason was reported." };
    const g = groups.get(reason.label);
    if (g) g.count += 1;
    else groups.set(reason.label, { reason, count: 1 });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}
