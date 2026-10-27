/**
 * A customer's reply to a bulk message that unsubscribes ("stop") or subscribes again ("start");
 * null for anything else. Any case, punctuation and emoji ("Stop", "STOP.", "stop 🙏"), plus short
 * replies that ask to stop ("pls stop", "stop sending msg", "band karo", "mat bhejo").
 *
 * wa-gateway/src/sessions.ts keeps a copy (separate Docker build); keep the two the same.
 */
const STOP_EXACT = new Set([
  "stop", "unsubscribe", "opt out", "optout", "stop offers", "stop messages", "band", "band karo",
  "bandh karo", "mat bhejo", "mat bhejna", "dont send", "do not send", "no more", "no more messages",
  "remove me", "बंद", "बंद करो", "मत भेजो",
]);
const START_EXACT = new Set(["start", "subscribe", "resume", "start offers", "start again", "unstop"]);
const STOP_WORD_RE = /(^| )(stop|stopp|unsubscribe|optout|बंद)( |$)/;
const STOP_PHRASE_RE = /(band karo|bandh karo|band kar do|bandh kar do|mat bhejo|mat bhejna|dont send|do not send|opt out)/;
// "don't stop", "band nahi karo": the customer wants the messages.
const NEGATED_RE = /(dont stop|do not stop|not stop|never stop|band nahi|band mat|bandh nahi|nahi band|mat band)/;

export function optOutKeyword(text: string): "stop" | "start" | null {
  const t = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z\u0900-\u097f ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  if (STOP_EXACT.has(t)) return "stop";
  if (START_EXACT.has(t)) return "start";
  if (t.split(" ").length > 5 || NEGATED_RE.test(t)) return null;
  if (STOP_WORD_RE.test(t) || STOP_PHRASE_RE.test(t)) return "stop";
  return null;
}
