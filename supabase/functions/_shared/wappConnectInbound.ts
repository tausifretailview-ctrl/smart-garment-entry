/**
 * Customer replies that WappConnect (unofficial, WhatsApp Web based) forwards to
 * whatsapp-webhook. WappConnect does not document one payload shape, so this reads the
 * common ones: `{ event: "message", data: { from, body } }`, Baileys-style
 * `messages.upsert` (`key.remoteJid`, `message.conversation`), and flat `{ from, message }`.
 * Meta `entry[]` payloads and our own outbound echoes (`fromMe`) are ignored.
 */

export type WappConnectInboundMessage = {
  /** Digits only, as sent (usually with country code). */
  from: string;
  text: string;
  messageId: string;
  /** WappConnect instance id/token when the payload carries one. */
  instanceId: string;
  senderName: string;
};

const INBOUND_EVENTS = new Set([
  "message",
  "messages",
  "message.received",
  "message_received",
  "message.incoming",
  "incoming_message",
  "incoming",
  "messages.upsert",
  "onmessage",
  "on_message",
  "received",
]);

type Obj = Record<string, unknown>;

function asObj(value: unknown): Obj | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : null;
}

function str(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function pickText(msg: Obj): string {
  const direct = str(msg.body) || str(msg.text) || str(msg.content) || str(msg.caption);
  if (direct) return direct;
  const textObj = asObj(msg.text);
  if (textObj && str(textObj.body)) return str(textObj.body);
  if (typeof msg.message === "string") return str(msg.message);
  const inner = asObj(msg.message);
  if (inner) {
    return (
      str(inner.conversation) ||
      str(asObj(inner.extendedTextMessage)?.text) ||
      str(inner.body) ||
      str(inner.text) ||
      str(asObj(asObj(inner.buttonsResponseMessage))?.selectedDisplayText) ||
      str(asObj(asObj(inner.listResponseMessage)?.singleSelectReply)?.selectedRowId)
    );
  }
  return "";
}

function pickFrom(msg: Obj): string {
  const key = asObj(msg.key);
  return (
    str(msg.from) ||
    str(msg.sender) ||
    str(msg.phone) ||
    str(msg.number) ||
    str(msg.chatId) ||
    str(msg.remoteJid) ||
    str(key?.remoteJid) ||
    str(msg.author)
  );
}

function isFromMe(msg: Obj): boolean {
  const key = asObj(msg.key);
  const flag = msg.fromMe ?? msg.from_me ?? key?.fromMe;
  return flag === true || flag === "true" || flag === 1;
}

/** One inbound customer text from a WappConnect webhook body, else null. */
export function parseWappConnectInbound(body: Obj): WappConnectInboundMessage | null {
  if (!body || Array.isArray(body.entry) || body.object === "whatsapp_business_account") return null;

  const event = str(body.event || body.type || body.event_type || body.action).toLowerCase();
  if (event && !INBOUND_EVENTS.has(event)) return null;

  const dataField = body.data;
  const candidates: unknown[] = [
    Array.isArray(dataField) ? dataField[0] : dataField,
    Array.isArray(asObj(dataField)?.messages) ? (asObj(dataField)!.messages as unknown[])[0] : null,
    body.payload,
    asObj(body.message) && (asObj(body.message)!.from || asObj(body.message)!.key) ? body.message : null,
    Array.isArray(body.messages) ? body.messages[0] : null,
    body,
  ];

  for (const candidate of candidates) {
    const msg = asObj(candidate);
    if (!msg) continue;
    const rawFrom = pickFrom(msg);
    const text = pickText(msg);
    if (!rawFrom || !text) continue;
    // Statuses carry ids and statuses, not a sender + text; groups and broadcasts are not customers.
    if (/@g\.us|@broadcast|status@/i.test(rawFrom)) return null;
    if (isFromMe(msg)) return null;
    const from = rawFrom.split("@")[0].replace(/\D/g, "");
    if (from.length < 10) continue;
    const key = asObj(msg.key);
    return {
      from,
      text,
      messageId: str(msg.id) || str(msg.message_id) || str(msg.messageId) || str(key?.id),
      instanceId:
        str(body.instance_id) || str(body.instanceId) || str(body.instance) || str(body.token) ||
        str(msg.instance_id) || str(msg.instanceId),
      senderName: str(msg.pushName) || str(msg.notifyName) || str(msg.sender_name) || str(msg.name),
    };
  }
  return null;
}

/** "OK" to the bill message's "Reply OK to save our number" line. */
export function isOkReply(text: string): boolean {
  const t = String(text || "")
    .toLowerCase()
    .replace(/[.!\s]+/g, " ")
    .trim();
  if (!t) return false;
  return /^(ok|okay|okk+|okey|k|kk|ok ok|ok thanks|ok thank you|ok thx|done|saved|yes|ha|haan|ji|👍|👌|🙏|👍🏻|👍🏼|👍🏽|👍🏾|👍🏿)( 👍| 🙏| 👌)?$/u.test(t);
}

/** Stars from a rating reply: "5", "4 star", "⭐⭐⭐", "5 Excellent". Null when not a rating. */
export function ratingFromReplyText(text: string): number | null {
  const t = String(text || "").trim();
  if (!t) return null;
  const stars = (t.match(/⭐|★/gu) || []).length;
  if (stars >= 1 && stars <= 5 && t.replace(/⭐|★|\s/gu, "") === "") return stars;
  const m = t.match(/^([1-5])(\s*(star|stars|⭐|excellent|good|average|poor|bad))?[\s.!]*$/iu);
  return m ? Number(m[1]) : null;
}

export const WAPPCONNECT_REVIEW_PROMPT_HOURS = 12;

/** Plain-text star menu: WappConnect cannot send WhatsApp list buttons. */
export function buildWappConnectReviewPrompt(opts: { shopName?: string; billLink?: string }): string {
  const shop = String(opts.shopName || "").trim();
  const lines = [
    `Thank you${shop ? ` for shopping at *${shop}*` : ""}! 🙏 Our number is saved.`,
    "",
    "⭐ *How was your shopping?* Reply with a number:",
    "5 ⭐⭐⭐⭐⭐ Excellent",
    "4 ⭐⭐⭐⭐ Good",
    "3 ⭐⭐⭐ Average",
    "2 ⭐⭐ Poor",
    "1 ⭐ Bad",
  ];
  const link = String(opts.billLink || "").trim();
  if (link) lines.push("", `Or rate on your bill page: ${link.split("#")[0]}#rate`);
  return lines.join("\n");
}
