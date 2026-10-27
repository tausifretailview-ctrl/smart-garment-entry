import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import pino from "pino";
import makeWASocket, {
  areJidsSameUser,
  DisconnectReason,
  fetchLatestBaileysVersion,
  normalizeMessageContent,
  type WAMessage,
  type WASocket,
  type proto,
} from "@whiskeysockets/baileys";
import { isDiskFull, pruneSessionDir } from "./storage.js";
import { CREDS_BACKUP_FILE, CREDS_FILE, hasLinkedCredsOnDisk, ownUserIds, readLinkedCreds, useSafeAuthState } from "./authState.js";

/**
 * Uploaded posters, so a bulk campaign uploads its poster to WhatsApp once instead of once per number
 * (keeps the server light for bill sends). WhatsApp keeps uploaded media for a while, not forever,
 * so entries expire and a long campaign uploads again the next day.
 */
const MEDIA_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MEDIA_CACHE_MAX = 50;

function makeMediaCache() {
  const items = new Map<string, { value: unknown; at: number }>();
  return {
    get<T>(key: string): T | undefined {
      const hit = items.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.at > MEDIA_CACHE_TTL_MS) {
        items.delete(key);
        return undefined;
      }
      return hit.value as T;
    },
    set<T>(key: string, value: T) {
      items.set(key, { value, at: Date.now() });
      if (items.size > MEDIA_CACHE_MAX) items.delete(items.keys().next().value as string);
    },
    del(key: string) {
      items.delete(key);
    },
    flushAll() {
      items.clear();
    },
  };
}

export type SessionStatus = "connected" | "connecting" | "qr" | "disconnected" | "logged_out";

interface Session {
  sock: WASocket | null;
  status: SessionStatus;
  qr: string | null;
  /** "ABCD-EFGH" code to type on the phone (Link with phone number instead), while linking by code. */
  pairingCode: string | null;
  number: string | null;
  starting: boolean;
  sentToday: number;
  day: string;
  lastSendAt: number;
  queue: Promise<unknown>;
  retries: number;
  /** Set by logout so a closing socket never reconnects. */
  stopped: boolean;
  /** Recently sent messages, so WhatsApp retry requests can be answered (else "Waiting for this message"). */
  sent: Map<string, proto.IMessage>;
  mediaCache: ReturnType<typeof makeMediaCache>;
  /** Why WhatsApp last closed the connection, shown on the page and in campaign notes. */
  lastClose: { code: number | null; reason: string; at: string } | null;
  /** Customers added to a group from bills: own daily cap, gap and queue (group adds are watched for spam). */
  groupAddsToday: number;
  groupDay: string;
  lastGroupAddAt: number;
  groupQueue: Promise<unknown>;
  groupPending: number;
  /** A new link (QR / code) is being made; on open its time is written to LINKED_AT_FILE. */
  newLink: boolean;
  contactSavesToday: number;
  contactDay: string;
}

/** Plain words for WhatsApp's close codes (Baileys DisconnectReason). */
function closeReason(code: number | undefined): string {
  switch (code) {
    case DisconnectReason.loggedOut:
      return "WhatsApp logged this number out: it was unlinked on the phone (Linked devices), or WhatsApp stopped it after too many bulk messages. Link it again to continue.";
    case DisconnectReason.forbidden:
      return "WhatsApp blocked this number from sending (often after many messages to people who have not saved it). Check WhatsApp on the phone.";
    case DisconnectReason.connectionReplaced:
      return "This number was opened on another WhatsApp Web or server, which pushed this link off. Reconnecting.";
    case DisconnectReason.badSession:
    case DisconnectReason.multideviceMismatch:
      return "WhatsApp rejected the saved link. Unlink and link the number again.";
    default:
      return "The connection to WhatsApp dropped (network or WhatsApp restart). Reconnecting by itself.";
  }
}

const SENT_CACHE_SIZE = 3000;

/** Digits for a pairing-code link: 10-digit Indian numbers get 91, a leading trunk 0 is dropped. */
function linkPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

/** "linked", a link that never finished (with its age), or a creds file that cannot be read. */
function credsState(dir: string): "linked" | "unreadable" | { age: number } {
  // A damaged creds.json next to a good backup is still a linked number (the backup is used on connect).
  if (readLinkedCreds(path.join(dir, CREDS_BACKUP_FILE))) return "linked";
  const file = path.join(dir, CREDS_FILE);
  let text: string;
  let age: number;
  try {
    text = fs.readFileSync(file, "utf8");
    age = Date.now() - fs.statSync(file).mtimeMs;
  } catch (e) {
    // No creds file: nothing was ever linked here.
    return (e as NodeJS.ErrnoException).code === "ENOENT" ? { age: Infinity } : "unreadable";
  }
  try {
    return (JSON.parse(text) as { account?: unknown }).account ? "linked" : { age };
  } catch {
    return "unreadable";
  }
}

function remember(s: Session, res: WAMessage | undefined) {
  const id = res?.key?.id;
  if (!id || !res?.message) return;
  s.sent.set(id, res.message);
  if (s.sent.size > SENT_CACHE_SIZE) s.sent.delete(s.sent.keys().next().value as string);
}

const AUTH_DIR = process.env.AUTH_DIR ?? "./data/sessions";
const APP_EVENT_URL = process.env.APP_EVENT_URL ?? "";
/** Customer replies (text) are posted here, e.g. https://<project>.supabase.co/functions/v1/whatsapp-webhook */
const APP_INBOUND_URL = process.env.APP_INBOUND_URL ?? "";
const API_KEY = process.env.GATEWAY_API_KEY ?? "";
const MAX_PER_DAY = Number(process.env.MAX_MSGS_PER_DAY ?? 300);
/** Bulk WhatsApp: each user links their own number (session id "u_<userId>") with its own daily cap. */
const MAX_BULK_PER_DAY = Number(process.env.MAX_BULK_MSGS_PER_DAY ?? 500);
/**
 * A freshly linked bulk number starts slow: WhatsApp logs out or bans new links that message many
 * strangers on day one. Caps by day since the QR scan (day 1 = first 24 h); BULK_WARMUP=off turns it off.
 */
const BULK_WARMUP_CAPS = process.env.BULK_WARMUP === "off" ? [] : [30, 60, 100, 150, 200, 300, 400];
/** Gap between two campaign messages while a number warms up (the normal campaign gap is 8-20 s). */
export const WARMUP_GAP_MS: [number, number] = [30_000, 60_000];
/** Contacts saved to a bulk number per day, the pause between two, and no saves in the first hours after linking. */
const MAX_CONTACT_SAVES_PER_DAY = Number(process.env.MAX_CONTACT_SAVES_PER_DAY ?? 50);
const CONTACT_SAVE_MIN_GAP_MS = 4000;
const CONTACT_SAVE_MAX_GAP_MS = 8000;
const CONTACT_SAVE_AFTER_LINK_MS = 24 * 60 * 60 * 1000;
/** When this number was linked by QR / code on this server; missing = linked before this file existed. */
const LINKED_AT_FILE = "linked-at.json";
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_GAP_MS = 2000;
const MAX_GAP_MS = 5000;
/** Bill customers added to a WhatsApp group per shop number per day, and the gap between two adds. */
const MAX_GROUP_ADDS_PER_DAY = Number(process.env.MAX_GROUP_ADDS_PER_DAY ?? 25);
const GROUP_ADD_MIN_GAP_MS = 20_000;
const GROUP_ADD_MAX_GAP_MS = 40_000;
/** Adds waiting in a shop's queue before new ones are turned away (they are tried on the customer's next bill). */
const GROUP_QUEUE_MAX = 5;
/**
 * Shop (bill) sessions are keyed by organization id; Bulk WhatsApp sessions by "u_" + user id; Ezzy's own
 * support number (posts support tokens to the Technical Support group) is the one session "support".
 */
const SESSION_ID_RE = /^((u_)?[0-9a-fA-F-]{36}|support)$/;
export const isUserSession = (id: string) => id.startsWith("u_");
export const isSupportSession = (id: string) => id === "support";

/**
 * A customer's reply to a bulk message that unsubscribes ("stop") or subscribes again ("start");
 * null for anything else. Any case, punctuation and emoji ("Stop", "STOP.", "stop 🙏"), plus short
 * replies that ask to stop ("pls stop", "stop sending msg", "band karo", "mat bhejo").
 *
 * Copy of supabase/functions/_shared/bulkOptOutKeyword.ts (this server builds on its own); keep the two the same.
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
const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });
/** Shown when a number's saved link on the server is gone or damaged and a restore or reconnect cannot use it. */
const LINK_LOST_REASON =
  "The saved WhatsApp link on the server is missing or damaged, so it cannot reconnect by itself. Link the number again.";
/** Shown in the app instead of "ENOSPC: no space left on device". */
export const DISK_FULL_MESSAGE =
  "The WhatsApp server's storage is full. Old files are being cleared now; try again in a minute. If it keeps happening, give the server's volume more space.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

/** Digits only; 10-digit numbers get India's 91 (same rule as the edge function). A group JID passes through. */
export function toJid(phone: string): string {
  const group = phone.trim();
  if (/^[0-9-]+@g\.us$/.test(group)) return group;
  const digits = phone.replace(/\D/g, "");
  const full = digits.length === 10 ? `91${digits}` : digits;
  if (full.length < 10) throw new Error("Invalid phone number");
  return `${full}@s.whatsapp.net`;
}

/** Message content for bulk sends: text alone, or a poster/file (by https URL) with the text as its caption. */
export interface BulkContent {
  text: string;
  media?: { url: string; mimetype: string; filename: string; kind: "image" | "video" | "document" };
}

export type ReceiptStatus = "delivered" | "read";

/** A message in a bulk number's chat with a customer, for the app's Inbox. */
export interface InboxEvent {
  phone: string;
  /** The customer's WhatsApp name (incoming only). */
  name: string | null;
  text: string;
  /** image, video, audio, document, sticker, location or contact; null for plain text. */
  mediaType: string | null;
  messageId: string | null;
  /** Typed on the linked phone itself rather than received. */
  fromMe: boolean;
  at: string;
}

const MEDIA_KINDS: [keyof proto.IMessage, string][] = [
  ["imageMessage", "image"],
  ["videoMessage", "video"],
  ["audioMessage", "audio"],
  ["documentMessage", "document"],
  ["stickerMessage", "sticker"],
  ["locationMessage", "location"],
  ["contactMessage", "contact"],
];

/** Contact names: one line, at most 100 characters. */
const cleanName = (raw: unknown) => String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 100);

export interface JoinCustomerInput {
  phone: string;
  name?: string;
  saveContact?: boolean;
  /** WhatsApp group id (…@g.us) to add the customer to; empty = contact only. */
  groupId?: string;
  /** Customer's privacy blocks the add: send them the invite link instead. */
  inviteFallback?: boolean;
  inviteText?: string;
}

export interface JoinCustomerResult {
  contact: "saved" | "skipped" | "failed";
  group: "added" | "already" | "invited" | "privacy" | "not_admin" | "left_recently" | "full" | "limit" | "failed" | "skipped";
  detail?: string;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  /** Set while the server stops (redeploy): sockets close without logging out and do not reconnect here. */
  private shuttingDown = false;
  /** Delivery / read ticks for messages sent from Bulk WhatsApp sessions. */
  onReceipt: ((sessionId: string, messageId: string, status: ReceiptStatus) => void) | null = null;
  /** A customer replied STOP / START to a bulk number. */
  onOptOut: ((sessionId: string, phone: string, subscribe: boolean) => void) | null = null;
  /** Any message in a bulk number's chats (customer replies, or typed on the phone), for the Inbox. */
  onInbox: ((sessionId: string, event: InboxEvent) => void) | null = null;

  /** Delivered / read ticks for bill messages, sent to the app every few seconds per shop. */
  private billReceipts = new Map<string, { messageId: string; status: ReceiptStatus; at: string }[]>();
  private billReceiptTimer: ReturnType<typeof setInterval> | null = null;

  private queueBillReceipt(orgId: string, messageId: string, status: ReceiptStatus) {
    if (!APP_EVENT_URL || isSupportSession(orgId)) return;
    const list = this.billReceipts.get(orgId) ?? [];
    list.push({ messageId, status, at: new Date().toISOString() });
    this.billReceipts.set(orgId, list);
    this.billReceiptTimer ??= setInterval(() => void this.flushBillReceipts(), 5000);
  }

  private async flushBillReceipts() {
    for (const [orgId, list] of this.billReceipts) {
      if (!list.length) continue;
      const batch = list.splice(0, 200);
      try {
        const res = await fetch(APP_EVENT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
          body: JSON.stringify({ action: "gateway-receipts", organizationId: orgId, receipts: batch }),
        });
        if (!res.ok) logger.warn({ status: res.status }, "bill receipts rejected");
      } catch (e) {
        logger.warn({ err: e }, "bill receipts failed");
      }
    }
  }

  private assertOrg(orgId: string) {
    if (!SESSION_ID_RE.test(orgId)) throw new Error("Invalid session id");
  }

  private dailyCap(id: string) {
    if (!isUserSession(id)) return MAX_PER_DAY;
    const day = this.linkDay(id);
    const warm = day !== null ? BULK_WARMUP_CAPS[day] : undefined;
    return warm !== undefined ? Math.min(warm, MAX_BULK_PER_DAY) : MAX_BULK_PER_DAY;
  }

  /** Time the number was linked on this server (ms), or null when unknown (linked before warm-up existed). */
  private linkedAt(id: string): number | null {
    try {
      const at = Number((JSON.parse(fs.readFileSync(path.join(this.dir(id), LINKED_AT_FILE), "utf8")) as { at?: unknown }).at);
      return Number.isFinite(at) && at > 0 ? at : null;
    } catch {
      return null;
    }
  }

  /** 0 in the first 24 h after linking, 1 the next day, ...; null when the link time is unknown. */
  private linkDay(id: string): number | null {
    const at = this.linkedAt(id);
    return at === null ? null : Math.max(0, Math.floor((Date.now() - at) / DAY_MS));
  }

  /** A bulk number still in its first days: messages today are capped lower and spaced wider. */
  inWarmup(id: string): boolean {
    const day = this.linkDay(id);
    return isUserSession(id) && day !== null && day < BULK_WARMUP_CAPS.length;
  }

  /** Daily-cap note for a campaign: plain words for a warm-up cap. */
  capNote(id: string): string {
    if (!this.inWarmup(id)) return "Daily limit reached; continues tomorrow";
    return `New number warm-up: ${this.dailyCap(id)} messages today (day ${(this.linkDay(id) ?? 0) + 1} after linking), more each day. Continues tomorrow by itself.`;
  }

  /** WhatsApp logged the number out (401) or it was unlinked: only a new QR scan brings it back. */
  isLoggedOut(id: string): boolean {
    return this.sessions.get(id)?.status === "logged_out";
  }

  private get(orgId: string): Session {
    let s = this.sessions.get(orgId);
    if (!s) {
      s = {
        sock: null, status: "disconnected", qr: null, pairingCode: null, number: null, starting: false,
        sentToday: 0, day: today(), lastSendAt: 0, queue: Promise.resolve(), retries: 0, stopped: false,
        sent: new Map(),
        mediaCache: makeMediaCache(),
        lastClose: null,
        groupAddsToday: 0, groupDay: today(), lastGroupAddAt: 0, groupQueue: Promise.resolve(), groupPending: 0,
        newLink: false, contactSavesToday: 0, contactDay: today(),
      };
      this.sessions.set(orgId, s);
    }
    return s;
  }

  private dir(orgId: string) {
    return path.join(AUTH_DIR, orgId);
  }

  private async notify(orgId: string, s: Session) {
    // Bulk WhatsApp sessions are not the shop's bill number: the page polls their status instead.
    // The support number is not a shop either: the platform admin page polls it too.
    if (!APP_EVENT_URL || isUserSession(orgId) || isSupportSession(orgId)) return;
    try {
      await fetch(APP_EVENT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({
          action: "gateway-event",
          organizationId: orgId,
          status: s.status,
          connectedNumber: s.number,
        }),
      });
    } catch (e) {
      logger.warn({ err: e }, "notify failed");
    }
  }

  async restoreAll() {
    if (!fs.existsSync(AUTH_DIR)) return;
    for (const orgId of fs.readdirSync(AUTH_DIR)) {
      // Only numbers that finished linking; an abandoned QR or pairing code leaves nothing worth restoring.
      if (!SESSION_ID_RE.test(orgId) || !hasLinkedCredsOnDisk(this.dir(orgId))) continue;
      await this.connect(orgId).catch((e) => {
        logger.warn({ orgId, err: e }, "restore failed");
        this.reconnectLater(orgId, this.get(orgId));
      });
    }
  }

  /**
   * Tries again after `s.retries`-based backoff (5 s doubling, at most 1 min). A try that fails before
   * a socket opens (disk full, WhatsApp version lookup down) schedules the next one, so a linked number
   * never stops reconnecting by itself.
   */
  private reconnectLater(orgId: string, s: Session) {
    const delay = Math.min(60_000, 5000 * 2 ** s.retries);
    s.retries++;
    setTimeout(() => {
      if (s.stopped || this.shuttingDown) return;
      this.connect(orgId, false).catch((e: unknown) => {
        logger.warn({ orgId, err: e }, "WhatsApp reconnect failed");
        if (isDiskFull(e)) this.freeSpaceNow();
        this.reconnectLater(orgId, s);
      });
    }, delay);
  }

  /**
   * Opens a socket for the number. `fresh` (the user pressed Connect) may start a new link with a QR or
   * code; a restore or reconnect only ever uses a finished link, and when that is gone it says so and
   * stops, instead of showing a QR nobody scans and then wiping the folder.
   */
  private async connect(orgId: string, fresh = false) {
    const s = this.get(orgId);
    if (s.starting || s.sock) return; // already open, linking, or connecting
    s.starting = true;
    s.stopped = false;
    s.status = "connecting";
    try {
      const { state, saveCreds, fromBackup } = await useSafeAuthState(this.dir(orgId));
      if (fromBackup) logger.warn({ orgId }, "creds.json was damaged; reconnecting with the backup copy");
      // A QR / code link starts here; the restart WhatsApp asks for right after the scan keeps the flag.
      if (!fresh) s.newLink = false;
      else if (!state.creds.account) s.newLink = true;
      if (!fresh && !state.creds.account) {
        s.status = "disconnected";
        s.lastClose = { code: null, reason: LINK_LOST_REASON, at: new Date().toISOString() };
        logger.error({ orgId }, "saved WhatsApp link missing or damaged; cannot reconnect without a new link");
        await this.notify(orgId, s);
        return;
      }
      const { version } = await fetchLatestBaileysVersion();
      const sock = makeWASocket({
        version,
        auth: state,
        logger: logger as never,
        printQRInTerminal: false,
        browser: ["Ezzy ERP", "Chrome", "1.0"],
        markOnlineOnConnect: false,
        syncFullHistory: false,
        // A recipient's phone that cannot decrypt the first copy asks for it again; answer from the cache.
        getMessage: async (key) => (key.id ? s.sent.get(key.id) : undefined),
        // Media sent by URL (bulk posters) is uploaded once and reused from here.
        mediaCache: s.mediaCache,
      });
      s.sock = sock;
      sock.ev.on("creds.update", () => {
        saveCreds().catch((e: unknown) => {
          logger.warn({ orgId, err: e }, "saving WhatsApp keys failed");
          if (!isDiskFull(e)) return;
          // The old creds.json stays whole (writes are atomic); free space and save the new keys again.
          this.freeSpaceNow(true);
          saveCreds().catch((again: unknown) => logger.error({ orgId, err: again }, "saving WhatsApp keys failed again"));
        });
      });
      sock.ev.on("messages.upsert", ({ messages, type }) => {
        if (type !== "notify") return;
        for (const m of messages) void this.forwardInbound(orgId, m);
      });
      // WhatsApp status: 3 = delivered (two grey ticks), 4 = read, 5 = played (voice/video seen).
      // Bulk numbers report to the campaign runner; a shop's bill number to the app's WhatsApp logs.
      sock.ev.on("messages.update", (updates) => {
        for (const { key, update } of updates) {
          const st = update.status;
          if (!key.fromMe || !key.id || typeof st !== "number" || st < 3) continue;
          const status: ReceiptStatus = st >= 4 ? "read" : "delivered";
          if (isUserSession(orgId)) this.onReceipt?.(orgId, key.id, status);
          else this.queueBillReceipt(orgId, key.id, status);
        }
      });
      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          s.qr = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
          s.status = "qr";
        }
        if (connection === "open") {
          s.status = "connected";
          s.qr = null;
          s.pairingCode = null;
          s.retries = 0;
          if (s.lastClose) logger.info({ orgId, after: s.lastClose.code }, "WhatsApp reconnected");
          s.number = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
          if (s.newLink) {
            s.newLink = false;
            try {
              fs.writeFileSync(path.join(this.dir(orgId), LINKED_AT_FILE), JSON.stringify({ at: Date.now() }));
            } catch (e) {
              logger.warn({ orgId, err: e }, "could not save the link time");
            }
            if (isUserSession(orgId)) logger.warn({ orgId, number: s.number }, "Bulk number linked: warm-up limits apply");
          }
          await this.notify(orgId, s);
        } else if (connection === "close") {
          if (s.sock !== sock) return; // an older socket closing after a restart
          const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
          s.sock = null;
          s.qr = null;
          s.pairingCode = null;
          // `account` is written only when the phone accepts the link; a pairing-code request already sets `me`.
          const linked = Boolean(state.creds.account);
          if (linked && !s.stopped && code !== DisconnectReason.restartRequired) {
            s.lastClose = { code: code ?? null, reason: closeReason(code), at: new Date().toISOString() };
            logger.warn({ orgId, code, error: lastDisconnect?.error?.message }, "WhatsApp connection closed");
          }
          if (code === DisconnectReason.loggedOut) {
            logger.error(
              { orgId, number: s.number, error: lastDisconnect?.error?.message },
              "WhatsApp logged this number out (401): removed on the phone, phone offline 14+ days, or stopped by WhatsApp",
            );
            s.status = "logged_out";
            s.number = null;
            fs.rmSync(this.dir(orgId), { recursive: true, force: true });
            await this.notify(orgId, s);
          } else if (s.stopped) {
            s.status = "logged_out";
          } else if (!linked) {
            // QR / pairing code expired without a link: stop here instead of making new codes forever.
            // A folder that still holds an earlier finished link (its backup) is kept.
            s.status = "disconnected";
            if (!hasLinkedCredsOnDisk(this.dir(orgId))) fs.rmSync(this.dir(orgId), { recursive: true, force: true });
          } else if (code === DisconnectReason.restartRequired) {
            // Normal right after a scan: WhatsApp asks for one restart before the link opens.
            s.status = "connecting";
            setTimeout(() => {
              if (!s.stopped) void this.connect(orgId, true).catch(() => undefined);
            }, 500);
          } else {
            s.status = "disconnected";
            // Network drop or WhatsApp restart: back off up to 1 min between tries.
            if (s.retries === 0) await this.notify(orgId, s);
            this.reconnectLater(orgId, s);
          }
        }
      });
    } catch (e) {
      s.status = "disconnected";
      throw e;
    } finally {
      s.starting = false;
    }
  }

  /**
   * Customer text replies go to the app: on a shop number they feed the review "OK" → stars flow. On a
   * bulk number every message goes to the Inbox (STOP / START also unsubscribe), including ones typed
   * on the phone itself so the conversation stays complete. Groups, status and this server's own sends
   * (those arrive as "append", not "notify") are skipped.
   */
  private async forwardInbound(orgId: string, m: WAMessage) {
    const bulk = isUserSession(orgId);
    if (isSupportSession(orgId) || (m.key.fromMe && !bulk)) return;
    if (!bulk && !APP_INBOUND_URL) return;
    const key = m.key as WAMessage["key"] & { senderPn?: string; remoteJidAlt?: string };
    let jid = key.remoteJid ?? "";
    if (jid.endsWith("@lid")) jid = key.senderPn || key.remoteJidAlt || "";
    if (!jid.endsWith("@s.whatsapp.net")) return;
    const msg = m.message;
    const text = (
      msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      msg?.buttonsResponseMessage?.selectedDisplayText ||
      msg?.listResponseMessage?.title ||
      ""
    ).trim();
    if (bulk) {
      if (m.key.fromMe && key.id && this.get(orgId).sent.has(key.id)) return;
      const phone = jid.split("@")[0];
      if (!m.key.fromMe && text) {
        const kw = optOutKeyword(text);
        if (kw) this.onOptOut?.(orgId, phone, kw === "start");
      }
      const content = normalizeMessageContent(msg);
      const media = MEDIA_KINDS.find(([k]) => content?.[k]);
      const caption =
        content?.imageMessage?.caption || content?.videoMessage?.caption || content?.documentMessage?.caption || "";
      const body = (text || caption || content?.extendedTextMessage?.text || "").trim();
      if (!body && !media) return;
      const ts = Number(m.messageTimestamp ?? 0);
      this.onInbox?.(orgId, {
        phone,
        name: m.key.fromMe ? null : m.pushName ?? null,
        text: body.slice(0, 4000),
        mediaType: media?.[1] ?? null,
        messageId: key.id ?? null,
        fromMe: Boolean(m.key.fromMe),
        at: (ts > 0 ? new Date(ts * 1000) : new Date()).toISOString(),
      });
      return;
    }
    if (!text) return;
    try {
      await fetch(APP_INBOUND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({
          event: "ezzy-gateway-inbound",
          organizationId: orgId,
          from: jid.split("@")[0],
          text: text.slice(0, 1000),
          messageId: key.id ?? null,
          senderName: m.pushName ?? null,
        }),
      });
    } catch (e) {
      logger.warn({ err: e }, "inbound forward failed");
    }
  }

  /**
   * Opens the link screen. With `phone` (country code + number), also asks WhatsApp for an 8-character
   * pairing code: the user types it under Linked devices → Link with phone number instead.
   */
  async start(orgId: string, phone?: string) {
    this.assertOrg(orgId);
    const s = this.get(orgId);
    const digits = phone ? linkPhone(phone) : null;
    if (phone && !digits) throw new Error("Enter the WhatsApp number with country code, e.g. 919876543210");
    try {
      await this.connect(orgId, true); // no-op while a socket is open; the QR refreshes on its own
    } catch (e) {
      if (!isDiskFull(e)) throw e;
      this.freeSpaceNow(true);
      try {
        await this.connect(orgId, true);
      } catch (again) {
        throw isDiskFull(again) ? new Error(DISK_FULL_MESSAGE) : again;
      }
    }
    // Give Baileys a moment to emit the first QR (the socket must be ready before a pairing code too)
    for (let i = 0; i < 40 && s.status !== "qr" && s.status !== "connected"; i++) await sleep(250);
    if (digits && s.status === "qr" && s.sock) {
      const code = await s.sock.requestPairingCode(digits);
      s.pairingCode = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
    }
    return this.status(orgId);
  }

  /**
   * Frees space on the volume: folders of numbers that never finished linking (and are not being linked
   * now), and per-customer key files not used for `maxAgeDays` in linked numbers.
   */
  cleanStorage(maxAgeDays: number): { folders: number; files: number } {
    let folders = 0;
    let files = 0;
    let ids: string[] = [];
    try {
      ids = fs.readdirSync(AUTH_DIR);
    } catch {
      return { folders, files };
    }
    for (const id of ids) {
      if (!SESSION_ID_RE.test(id)) continue;
      const dir = this.dir(id);
      const state = credsState(dir);
      if (state === "linked") {
        files += pruneSessionDir(dir, maxAgeDays, Date.now(), ownUserIds(dir));
        continue;
      }
      // Only a readable link that never finished, an hour old, is an abandoned QR / code. A creds file cut
      // short by a full disk is unreadable and stays, so a linked shop is never wiped by mistake.
      const s = this.sessions.get(id);
      if (state === "unreadable" || s?.starting || s?.sock || s?.status === "qr" || state.age < 60 * 60 * 1000) continue;
      fs.rmSync(dir, { recursive: true, force: true });
      folders++;
    }
    return { folders, files };
  }

  private lastEmergencyClean = 0;
  /** Disk full right now: clear customer files older than 3 days (at most every 10 minutes unless forced). */
  freeSpaceNow(force = false) {
    if (!force && Date.now() - this.lastEmergencyClean < 10 * 60 * 1000) return;
    this.lastEmergencyClean = Date.now();
    const freed = this.cleanStorage(3);
    logger.warn({ ...freed }, "WhatsApp server storage full: removed old files");
  }

  async status(orgId: string) {
    this.assertOrg(orgId);
    const s = this.get(orgId);
    return {
      status: s.status,
      qr: s.qr,
      pairingCode: s.pairingCode,
      connectedNumber: s.number,
      lastDisconnect: s.status === "connected" ? null : s.lastClose,
    };
  }

  /**
   * Railway stops the old server on every redeploy. Close each socket the way WhatsApp Web does on a tab
   * close (never a logout), let key writes in flight finish, and leave the links on the volume for the
   * new server to restore.
   */
  async shutdown() {
    this.shuttingDown = true;
    for (const s of this.sessions.values()) {
      s.stopped = true;
      try {
        s.sock?.end(undefined);
      } catch {
        /* already closed */
      }
    }
    await sleep(1500);
  }

  async logout(orgId: string) {
    this.assertOrg(orgId);
    const s = this.get(orgId);
    s.stopped = true;
    try {
      await s.sock?.logout();
    } catch {
      /* already closed */
    }
    s.sock = null;
    s.status = "logged_out";
    s.qr = null;
    s.pairingCode = null;
    s.number = null;
    s.lastClose = null;
    fs.rmSync(this.dir(orgId), { recursive: true, force: true });
  }

  private ready(orgId: string): Session {
    this.assertOrg(orgId);
    const s = this.get(orgId);
    if (s.status !== "connected" || !s.sock) throw new Error("WhatsApp session is not connected");
    return s;
  }

  /** Why a campaign on this number is waiting, in the user's words. */
  offlineNote(id: string): string {
    const s = this.sessions.get(id);
    // A saved, finished link reconnects by itself; without one (unlinked, logged out, a new QR or code
    // still waiting) only linking again helps.
    const linked = s?.status !== "logged_out" && hasLinkedCredsOnDisk(this.dir(id));
    if (!linked) {
      return s?.lastClose?.code === DisconnectReason.loggedOut
        ? s.lastClose.reason
        : "Your WhatsApp is not linked. Link it again on the Send page; sending continues from here.";
    }
    return s?.lastClose?.reason ?? "Waiting for your WhatsApp to reconnect";
  }

  isConnected(id: string): boolean {
    const s = this.sessions.get(id);
    return Boolean(s && s.status === "connected" && s.sock);
  }

  /** Messages this number can still send today (resets at 00:00 UTC). */
  remainingToday(id: string): number {
    const s = this.get(id);
    if (s.day !== today()) return this.dailyCap(id);
    return Math.max(0, this.dailyCap(id) - s.sentToday);
  }

  /** Serialize sends per org with a random human-like gap and a daily cap (ban protection). */
  private enqueue<T>(s: Session, job: () => Promise<T>, cap = MAX_PER_DAY): Promise<T> {
    const run = async () => {
      if (s.day !== today()) {
        s.day = today();
        s.sentToday = 0;
      }
      if (s.sentToday >= cap) throw new Error(`Daily send limit (${cap}) reached`);
      const gap = MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS);
      const wait = s.lastSendAt + gap - Date.now();
      if (wait > 0) await sleep(wait);
      const result = await job();
      s.sentToday++;
      s.lastSendAt = Date.now();
      return result;
    };
    const next = s.queue.then(run, run);
    s.queue = next.catch(() => undefined);
    return next;
  }

  async sendText(orgId: string, phone: string, message: string) {
    const s = this.ready(orgId);
    if (!message.trim()) throw new Error("message is required");
    const jid = toJid(phone);
    return this.enqueue(s, async () => {
      const res = await s.sock!.sendMessage(jid, { text: message });
      remember(s, res);
      return res?.key?.id ?? null;
    });
  }

  async sendFile(orgId: string, phone: string, fileUrl: string, filename: string, caption?: string) {
    const s = this.ready(orgId);
    const jid = toJid(phone);
    const url = new URL(fileUrl);
    if (url.protocol !== "https:") throw new Error("fileUrl must be https");
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Could not download file (${resp.status})`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length > 16 * 1024 * 1024) throw new Error("File too large");
    return this.enqueue(s, async () => {
      const res = await s.sock!.sendMessage(jid, {
        document: buffer,
        mimetype: resp.headers.get("content-type")?.split(";")[0] || "application/pdf",
        fileName: filename,
        caption,
      });
      remember(s, res);
      return res?.key?.id ?? null;
    });
  }

  /** One bulk message; the campaign runner waits its own (longer) random gap between calls. */
  async sendBulk(id: string, phone: string, content: BulkContent): Promise<string | null> {
    const s = this.ready(id);
    const jid = toJid(phone);
    return this.enqueue(
      s,
      async () => {
        const { text, media } = content;
        // By URL, not bytes: Baileys then caches the upload (mediaCache) and reuses it for every number.
        const file = media ? { url: media.url } : undefined;
        const msg = !media || !file
          ? { text }
          : media.kind === "image"
            ? { image: file, mimetype: media.mimetype, caption: text || undefined }
            : media.kind === "video"
              ? { video: file, mimetype: media.mimetype, caption: text || undefined }
              : { document: file, mimetype: media.mimetype, fileName: media.filename, caption: text || undefined };
        const res = await s.sock!.sendMessage(jid, msg);
        remember(s, res);
        return res?.key?.id ?? null;
      },
      this.dailyCap(id),
    );
  }

  /** Which of `phones` (up to 50, digits) have WhatsApp, in one lookup. */
  async checkNumbers(orgId: string, phones: string[]): Promise<string[]> {
    const s = this.ready(orgId);
    const jids = phones.slice(0, 50).flatMap((p) => {
      try {
        return [toJid(p)];
      } catch {
        return [];
      }
    });
    if (!jids.length) return [];
    const found = (await s.sock!.onWhatsApp(...jids)) ?? [];
    return found.filter((r) => r.exists).map((r) => String(r.jid).split("@")[0].split(":")[0]);
  }

  /** "New contact" on WhatsApp Web for one number (also saved to the phone's address book). */
  private async saveOneContact(s: Session, phone: string, name: string) {
    if (!name) throw new Error("name is required");
    if (s.status !== "connected" || !s.sock) throw new Error("WhatsApp session is not connected");
    const jid = toJid(phone);
    const lid = await s.sock.signalRepository.lidMapping.getLIDForPN(jid).catch(() => null);
    await s.sock.addOrEditContact(jid, {
      fullName: name,
      firstName: name.split(" ")[0],
      ...(lid ? { lidJid: lid } : {}),
      saveOnPrimaryAddressbook: true,
    });
  }

  /**
   * Saves numbers as contacts on this WhatsApp, like "New contact" on WhatsApp Web (also saved to the
   * phone's address book). One at a time with a 4-8 s pause, at most 10 per call; not counted as sends.
   * Every save is a sync to the phone, so a bulk number gets none in its first 24 h after linking and at
   * most MAX_CONTACT_SAVES_PER_DAY a day (dozens of saves right after a QR scan look like a bot).
   */
  async saveContacts(
    orgId: string,
    contacts: { phone: string; name: string }[],
  ): Promise<{ saved: string[]; failed: { phone: string; error: string }[] }> {
    const s = this.ready(orgId);
    const list = contacts.slice(0, 10);
    const saved: string[] = [];
    const failed: { phone: string; error: string }[] = [];
    if (isUserSession(orgId)) {
      const at = this.linkedAt(orgId);
      if (at !== null && Date.now() - at < CONTACT_SAVE_AFTER_LINK_MS) {
        const hours = Math.ceil((at + CONTACT_SAVE_AFTER_LINK_MS - Date.now()) / 3_600_000);
        throw new Error(
          `This number was linked less than a day ago. Saving many contacts right after linking can make WhatsApp log it out; try again in ${hours} h.`,
        );
      }
    }
    if (s.contactDay !== today()) {
      s.contactDay = today();
      s.contactSavesToday = 0;
    }
    for (const [i, c] of list.entries()) {
      const phone = String(c.phone ?? "").replace(/\D/g, "");
      const name = cleanName(c.name);
      if (s.contactSavesToday >= MAX_CONTACT_SAVES_PER_DAY) {
        failed.push({ phone, error: `Daily limit of ${MAX_CONTACT_SAVES_PER_DAY} contact saves reached; save the rest tomorrow` });
        continue;
      }
      try {
        await this.saveOneContact(s, phone, name);
        s.contactSavesToday++;
        saved.push(phone);
      } catch (e) {
        failed.push({ phone, error: e instanceof Error ? e.message : String(e) });
      }
      if (i < list.length - 1 && s.contactSavesToday < MAX_CONTACT_SAVES_PER_DAY) {
        await sleep(CONTACT_SAVE_MIN_GAP_MS + Math.random() * (CONTACT_SAVE_MAX_GAP_MS - CONTACT_SAVE_MIN_GAP_MS));
      }
    }
    if (failed.length) logger.warn({ orgId, saved: saved.length, failed: failed.length, error: failed[0].error }, "Save contacts failed");
    return { saved, failed };
  }

  /**
   * A bill customer: save the number as a contact and/or add it to one group this number is admin of.
   * When the customer's privacy blocks the add, sends the group's invite link instead (if asked).
   * Adds are queued per shop with a 20-40 s gap and a daily cap; when the queue is full or the cap is
   * reached the add is skipped ("limit") so the app tries again on the customer's next bill.
   */
  async joinCustomer(orgId: string, input: JoinCustomerInput): Promise<JoinCustomerResult> {
    const s = this.ready(orgId);
    const phone = String(input.phone ?? "").replace(/\D/g, "");
    const name = cleanName(input.name) || `+${phone}`;
    const groupId = String(input.groupId ?? "").trim();
    if (groupId && !/^[0-9-]+@g\.us$/.test(groupId)) throw new Error("Invalid group id");

    const result: JoinCustomerResult = { contact: "skipped", group: "skipped" };
    if (input.saveContact) {
      try {
        await this.saveOneContact(s, phone, name);
        result.contact = "saved";
      } catch (e) {
        result.contact = "failed";
        result.detail = `Contact: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    if (!groupId) return result;

    if (s.groupDay !== today()) {
      s.groupDay = today();
      s.groupAddsToday = 0;
    }
    if (s.groupAddsToday >= MAX_GROUP_ADDS_PER_DAY) {
      return { ...result, group: "limit", detail: `Daily group add limit (${MAX_GROUP_ADDS_PER_DAY}) reached` };
    }
    if (s.groupPending >= GROUP_QUEUE_MAX) {
      return { ...result, group: "limit", detail: "Too many group adds waiting; tried again on the next bill" };
    }

    s.groupPending++;
    const run = async () => {
      try {
        const wait = s.lastGroupAddAt + GROUP_ADD_MIN_GAP_MS + Math.random() * (GROUP_ADD_MAX_GAP_MS - GROUP_ADD_MIN_GAP_MS) - Date.now();
        if (wait > 0) await sleep(wait);
        return await this.addToGroup(s, phone, groupId, input.inviteFallback === true, input.inviteText);
      } finally {
        s.groupPending--;
      }
    };
    const next = s.groupQueue.then(run, run);
    s.groupQueue = next.catch(() => undefined);
    const group = await next;
    return { ...result, ...group, detail: [result.detail, group.detail].filter(Boolean).join("; ") || undefined };
  }

  private async addToGroup(
    s: Session,
    phone: string,
    groupId: string,
    inviteFallback: boolean,
    inviteText?: string,
  ): Promise<Pick<JoinCustomerResult, "group" | "detail">> {
    if (s.status !== "connected" || !s.sock) return { group: "failed", detail: "WhatsApp session is not connected" };
    const sock = s.sock;
    const jid = toJid(phone);
    try {
      const meta = await sock.groupMetadata(groupId);
      const me = sock.user;
      const mine = meta.participants.find((p) =>
        [p.id, p.lid, p.phoneNumber].some((id) => areJidsSameUser(id, me?.id) || (me?.lid ? areJidsSameUser(id, me.lid) : false)),
      );
      if (!mine?.admin) return { group: "not_admin", detail: `This WhatsApp number is not an admin of "${meta.subject}"` };

      const [res] = await sock.groupParticipantsUpdate(groupId, [jid], "add");
      s.lastGroupAddAt = Date.now();
      s.groupAddsToday++;
      const code = String(res?.status ?? "");
      if (code === "200") return { group: "added" };
      if (code === "409") return { group: "already" };
      if (code === "408") return { group: "left_recently", detail: "Customer left this group recently" };
      if (code === "500") return { group: "full", detail: "Group is full" };
      if (code !== "403") return { group: "failed", detail: `WhatsApp answered ${code || "nothing"}` };

      // Privacy: only the customer's contacts may add them. Send the invite link so they can tap Join.
      if (!inviteFallback) return { group: "privacy", detail: "Customer's privacy settings block group adds" };
      const inviteCode = await sock.groupInviteCode(groupId);
      if (!inviteCode) return { group: "privacy", detail: "Could not get the group invite link" };
      const text =
        `${(inviteText ?? "").trim() || `Join our WhatsApp group "${meta.subject}" for offers and new arrivals:`}\n` +
        `https://chat.whatsapp.com/${inviteCode}`;
      await this.enqueue(s, async () => {
        const sent = await sock.sendMessage(jid, { text });
        remember(s, sent);
        return sent?.key?.id ?? null;
      });
      return { group: "invited", detail: "Privacy blocks direct adds; invite link sent" };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.warn({ groupId, error: message }, "Group add failed");
      return { group: "failed", detail: message };
    }
  }

  /** Groups this number is in (and whether it is admin there), for Technical Support and bill group adds. */
  async groups(orgId: string): Promise<{ id: string; name: string; size: number; isAdmin: boolean }[]> {
    const s = this.ready(orgId);
    const me = s.sock!.user;
    const all = await s.sock!.groupFetchAllParticipating();
    return Object.values(all)
      .map((g) => ({
        id: g.id,
        name: g.subject || g.id,
        size: g.participants?.length ?? 0,
        isAdmin: (g.participants ?? []).some(
          (p) =>
            Boolean(p.admin) &&
            [p.id, p.lid, p.phoneNumber].some((id) => areJidsSameUser(id, me?.id) || (me?.lid ? areJidsSameUser(id, me.lid) : false)),
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async checkNumber(orgId: string, phone: string): Promise<boolean> {
    const s = this.ready(orgId);
    const [result] = (await s.sock!.onWhatsApp(toJid(phone))) ?? [];
    return Boolean(result?.exists);
  }
}
