/** Contacts for the Bulk WhatsApp page: typed numbers, Excel rows, dedupe and {name} fill. */

export interface BulkContact {
  phone: string;
  name: string | null;
}

/** Digits only; 10-digit Indian numbers get 91, a leading trunk 0 is dropped (same rule as bulk-whatsapp). */
export function normalizeBulkPhone(raw: unknown): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

/** "+91 98765 43210" style display. */
export function formatBulkPhone(phone: string): string {
  if (phone.startsWith("91") && phone.length === 12) return `+91 ${phone.slice(2, 7)} ${phone.slice(7)}`;
  return `+${phone}`;
}

const PHONE_RUN = /\+?\d[\d\s-]{8,17}\d/g;

/**
 * One contact per line: "9876543210", "Ravi 9876543210", "9876543210, Ravi". A line may also hold
 * several numbers separated by commas or spaces (no names then).
 */
export function parseTypedContacts(text: string): { contacts: BulkContact[]; invalid: string[] } {
  const contacts: BulkContact[] = [];
  const invalid: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const runs: string[] = trimmed.match(PHONE_RUN) ?? [];
    if (!runs.length) {
      invalid.push(trimmed);
      continue;
    }
    const rest = runs.reduce((acc, r) => acc.replace(r, " "), trimmed);
    const name = runs.length === 1 ? rest.replace(/[,;:|\t]+/g, " ").replace(/\s+/g, " ").trim() || null : null;
    for (const run of runs) {
      const phone = normalizeBulkPhone(run);
      if (phone) contacts.push({ phone, name });
      else invalid.push(run.trim());
    }
  }
  return { contacts, invalid };
}

const PHONE_HEADER = /(mobile|phone|whats\s*app|contact|number|mob\b|cell)/i;
const NAME_HEADER = /name/i;

/**
 * Excel / CSV sheet rows (array of arrays, first row may be headers). Picks the phone column by its
 * header, else the column with the most phone-like cells; the name column by a header with "name".
 */
export function parseContactSheet(rows: unknown[][]): { contacts: BulkContact[]; invalid: number } {
  const data = rows.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""));
  if (!data.length) return { contacts: [], invalid: 0 };
  const header = data[0].map((c) => String(c ?? "").trim());
  const headerHasPhone = header.some((h) => PHONE_HEADER.test(h) && !normalizeBulkPhone(h));
  let phoneCol = headerHasPhone ? header.findIndex((h) => PHONE_HEADER.test(h)) : -1;
  let nameCol = headerHasPhone ? header.findIndex((h, i) => i !== phoneCol && NAME_HEADER.test(h)) : -1;
  const body = headerHasPhone ? data.slice(1) : data;

  if (phoneCol < 0) {
    const width = Math.max(...body.map((r) => r.length));
    let best = -1;
    let bestHits = 0;
    for (let c = 0; c < width; c++) {
      const hits = body.filter((r) => normalizeBulkPhone(r[c])).length;
      if (hits > bestHits) {
        best = c;
        bestHits = hits;
      }
    }
    phoneCol = best;
    // No headers: the first mostly-text column next to it is the name.
    if (phoneCol >= 0) {
      for (let c = 0; c < width && nameCol < 0; c++) {
        if (c === phoneCol) continue;
        const texty = body.filter((r) => /[a-z]/i.test(String(r[c] ?? ""))).length;
        if (texty >= body.length / 2) nameCol = c;
      }
    }
  }
  if (phoneCol < 0) return { contacts: [], invalid: body.length };

  const contacts: BulkContact[] = [];
  let invalid = 0;
  for (const r of body) {
    const phone = normalizeBulkPhone(r[phoneCol]);
    if (!phone) {
      invalid++;
      continue;
    }
    const name = nameCol >= 0 ? String(r[nameCol] ?? "").trim() || null : null;
    contacts.push({ phone, name });
  }
  return { contacts, invalid };
}

/** Keeps the first entry per number; a later entry fills in a missing name. */
export function mergeContacts(existing: BulkContact[], added: BulkContact[]): { contacts: BulkContact[]; duplicates: number } {
  const byPhone = new Map<string, BulkContact>();
  for (const c of existing) byPhone.set(c.phone, c);
  let duplicates = 0;
  for (const c of added) {
    const prev = byPhone.get(c.phone);
    if (prev) {
      duplicates++;
      if (!prev.name && c.name) byPhone.set(c.phone, { ...prev, name: c.name });
      continue;
    }
    byPhone.set(c.phone, c);
  }
  return { contacts: [...byPhone.values()], duplicates };
}

/** vCard text value: backslash, comma, semicolon and line breaks escaped. */
function vcardText(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => `\\${m}`).replace(/\r?\n/g, "\\n");
}

/**
 * Contacts file (.vcf, vCard 3.0) to import into Google Contacts / the phone, so the shop phone has
 * every number saved. A number with no name is saved under its phone number.
 */
export function buildContactsVcf(contacts: BulkContact[]): string {
  return contacts
    .map((c) => {
      const name = vcardText((c.name ?? "").replace(/\s+/g, " ").trim() || formatBulkPhone(c.phone));
      return ["BEGIN:VCARD", "VERSION:3.0", `FN:${name}`, `N:;${name};;;`, `TEL;TYPE=CELL:+${c.phone}`, "END:VCARD"].join("\r\n");
    })
    .join("\r\n")
    .concat(contacts.length ? "\r\n" : "");
}

/** {name} → contact name, or "Customer" when the number has no name. */
export function fillBulkMessage(message: string, name: string | null): string {
  const n = (name ?? "").trim();
  return message.replace(/\{\s*name\s*\}/gi, n || "Customer");
}

/** Rough send time for the confirm box: average 14 s gap plus ~3 s per message. */
export function estimateBulkMinutes(count: number): number {
  return Math.max(1, Math.round((count * 17) / 60));
}

/** Shop links added under a bulk message. QR-linked numbers cannot send real buttons, so these go as tappable links. */
export interface BulkLinks {
  instagram: string;
  call: string;
  location: string;
  enquire: string;
}

export const EMPTY_BULK_LINKS: BulkLinks = { instagram: "", call: "", location: "", enquire: "" };

const ENQUIRE_TEXT = "Hi, I want to know more about your offer";

/** "@shop", "shop" or a full URL → https://instagram.com/shop; null when nothing usable. */
export function instagramLink(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^(www\.)?instagram\.com\//i.test(v)) return `https://${v.replace(/^www\./i, "")}`;
  const handle = v.replace(/^@/, "");
  return /^[\w.]{1,30}$/.test(handle) ? `https://instagram.com/${handle}` : null;
}

/** A Google Maps link as pasted, or an address turned into a Maps search link. */
export function locationLink(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^(maps\.app\.goo\.gl|goo\.gl|(www\.)?google\.[a-z.]+\/maps)/i.test(v)) return `https://${v}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v)}`;
}

/** Lines for the links that are filled in, in a fixed order. Invalid phone numbers are left out. */
export function buildBulkLinkLines(links: BulkLinks): string[] {
  const lines: string[] = [];
  const call = normalizeBulkPhone(links.call);
  if (call) lines.push(`📞 *Call now:* ${formatBulkPhone(call)}`);
  const enquire = normalizeBulkPhone(links.enquire);
  if (enquire) lines.push(`💬 *Enquire now:* https://wa.me/${enquire}?text=${encodeURIComponent(ENQUIRE_TEXT)}`);
  const loc = locationLink(links.location);
  if (loc) lines.push(`📍 *Shop location:* ${loc}`);
  const insta = instagramLink(links.instagram);
  if (insta) lines.push(`📸 *Follow us on Instagram:* ${insta}`);
  return lines;
}

const LINK_LINE = /^(📞 \*Call now:\*|💬 \*Enquire now:\*|📍 \*Shop location:\*|📸 \*Follow us on Instagram:\*) /;

/**
 * A sent message back to what was typed: drops the STOP footer and the link lines the page adds,
 * so "Use again" does not add them twice.
 */
export function stripBulkExtras(sent: string): string {
  const lines = sent.replace(/\r\n/g, "\n").split("\n");
  for (;;) {
    const last = lines[lines.length - 1];
    if (last === undefined) break;
    if (!last.trim() || /^_Reply STOP to stop these messages_$/.test(last.trim()) || LINK_LINE.test(last)) lines.pop();
    else break;
  }
  return lines.join("\n");
}
