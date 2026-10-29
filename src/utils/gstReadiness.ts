/**
 * GST readiness: is this shop's data complete enough to file GSTR-1 / GSTR-3B itself?
 *
 * Pure checks over the shop GSTIN, filing preferences, product HSN / units, customer and
 * supplier GSTINs and last month's bill numbers. The page loads the rows; this decides
 * what blocks a filing ("block"), what needs a look ("warn") and what is fine ("ok").
 */
import { extractStateCode, getStateNameFromCode } from "@/utils/gstRegisterUtils";
import { documentSeries, isValidGstin, isValidHsn, uqcForUnit } from "@/utils/gstr1Json";

export type GstFilingScheme = "regular" | "qrmp" | "composition";

/** Stored in `settings.report_settings.gst_filing` (no extra column). */
export type GstFilingPrefs = {
  /** Regular = monthly GSTR-1 + 3B; QRMP = quarterly returns, monthly payment; Composition = CMP-08 / GSTR-4. */
  scheme: GstFilingScheme | null;
  /** Under ₹5 crore turnover: 4-digit HSN, and HSN optional on retail (B2C) lines. */
  turnoverUnder5Cr: boolean;
  /** Person whose mobile / email gets the filing OTP. */
  signatoryName: string;
};

export const DEFAULT_GST_FILING_PREFS: GstFilingPrefs = { scheme: null, turnoverUnder5Cr: true, signatoryName: "" };

const SCHEMES: GstFilingScheme[] = ["regular", "qrmp", "composition"];

export function resolveGstFilingPrefs(settings: { report_settings?: unknown } | null | undefined): GstFilingPrefs {
  const raw = (settings?.report_settings as { gst_filing?: Record<string, unknown> } | null | undefined)?.gst_filing;
  if (!raw || typeof raw !== "object") return { ...DEFAULT_GST_FILING_PREFS };
  const scheme = SCHEMES.includes(raw.scheme as GstFilingScheme) ? (raw.scheme as GstFilingScheme) : null;
  return {
    scheme,
    turnoverUnder5Cr: raw.turnover_under_5cr === undefined ? true : raw.turnover_under_5cr === true,
    signatoryName: String(raw.signatory_name || ""),
  };
}

/** The report_settings object to save: everything already there, plus these preferences. */
export function withGstFilingPrefs(reportSettings: unknown, prefs: GstFilingPrefs): Record<string, unknown> {
  const base = reportSettings && typeof reportSettings === "object" ? (reportSettings as Record<string, unknown>) : {};
  return {
    ...base,
    gst_filing: {
      scheme: prefs.scheme,
      turnover_under_5cr: prefs.turnoverUnder5Cr,
      signatory_name: prefs.signatoryName.trim(),
    },
  };
}

export type ReadinessLevel = "ok" | "warn" | "block";

export type ReadinessItem = { label: string; note?: string };

export type ReadinessSection = {
  key: "shop" | "scheme" | "hsn" | "units" | "customers" | "suppliers" | "documents";
  title: string;
  level: ReadinessLevel;
  /** One line the owner reads first. */
  summary: string;
  /** Why it matters / what to do. */
  detail?: string;
  items: ReadinessItem[];
  fixPath?: string;
  fixLabel?: string;
};

export type GstReadiness = {
  level: ReadinessLevel;
  blockers: number;
  warnings: number;
  sections: ReadinessSection[];
};

export type GstReadinessInput = {
  shopGstin: string | null | undefined;
  prefs: GstFilingPrefs;
  products: Array<{ id: string; name: string; hsn: string | null | undefined; unit: string | null | undefined }>;
  customers: Array<{ id: string; name: string; gstin: string | null | undefined }>;
  suppliers: Array<{ id: string; name: string; gstin: string | null | undefined }>;
  lastMonth: {
    /** e.g. "Sep 2026". */
    label: string;
    /** Bills of that month, held carts already left out. */
    documents: Array<{ number: string; cancelled: boolean }>;
    heldCarts: number;
  };
};

const ITEM_CAP = 300;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

function worst(a: ReadinessLevel, b: ReadinessLevel): ReadinessLevel {
  const rank = { ok: 0, warn: 1, block: 2 };
  return rank[a] >= rank[b] ? a : b;
}

type GstinSplit<T> = { invalid: T[]; partial: T[]; none: T[]; valid: T[] };

/** 15 characters that fail the checksum are "invalid"; anything else non-blank is "partial". */
export function splitByGstin<T extends { gstin: string | null | undefined }>(rows: T[]): GstinSplit<T> {
  const out: GstinSplit<T> = { invalid: [], partial: [], none: [], valid: [] };
  for (const row of rows) {
    const gstin = String(row.gstin || "").trim().toUpperCase();
    if (!gstin) out.none.push(row);
    else if (isValidGstin(gstin)) out.valid.push(row);
    else if (gstin.length === 15) out.invalid.push(row);
    else out.partial.push(row);
  }
  return out;
}

/** Numbers missing between the first and last of each series (deleted bills show up here). */
export function seriesGaps(docs: readonly { number: string; cancelled: boolean }[]): Array<{ prefix: string; from: string; to: string; total: number; cancelled: number; missing: number }> {
  return documentSeries(docs).map((s) => {
    const ordinals = s.docs.map((d) => d.ordinal);
    const distinct = new Set(ordinals).size;
    const span = ordinals.length ? ordinals[ordinals.length - 1] - ordinals[0] + 1 : 0;
    return {
      prefix: s.prefix || "(no prefix)",
      from: s.docs[0].number,
      to: s.docs[s.docs.length - 1].number,
      total: s.docs.length,
      cancelled: s.docs.filter((d) => d.cancelled).length,
      missing: Math.max(0, span - distinct),
    };
  });
}

export function checkGstReadiness(input: GstReadinessInput): GstReadiness {
  const sections: ReadinessSection[] = [];

  // ── Shop GSTIN ──
  const shopGstin = String(input.shopGstin || "").trim().toUpperCase();
  if (!shopGstin) {
    sections.push({
      key: "shop", title: "Shop GSTIN", level: "block",
      summary: "No GSTIN saved for this shop.",
      detail: "Every return is filed under the shop's GSTIN. Add it in Settings → Business Info.",
      items: [], fixPath: "/settings", fixLabel: "Open Settings",
    });
  } else if (!isValidGstin(shopGstin)) {
    sections.push({
      key: "shop", title: "Shop GSTIN", level: "block",
      summary: `${shopGstin} is not a valid GSTIN (format or check digit).`,
      detail: "Copy it exactly from the GST registration certificate.",
      items: [], fixPath: "/settings", fixLabel: "Open Settings",
    });
  } else {
    const code = extractStateCode(shopGstin);
    sections.push({
      key: "shop", title: "Shop GSTIN", level: "ok",
      summary: `${shopGstin} · ${getStateNameFromCode(code) || "state " + code}`,
      detail: "Walk-in sales are reported in this state; a buyer's GSTIN decides inter-state bills.",
      items: [],
    });
  }

  // ── Filing scheme ──
  if (!input.prefs.scheme) {
    sections.push({
      key: "scheme", title: "Filing scheme", level: "warn",
      summary: "Tell us how this shop files: Regular (monthly), QRMP (quarterly) or Composition.",
      detail: "It decides the period of the GSTR-1 file and the due dates we remind you about.",
      items: [],
    });
  } else if (input.prefs.scheme === "composition") {
    sections.push({
      key: "scheme", title: "Filing scheme", level: "warn",
      summary: "Composition scheme: this shop files CMP-08 every quarter and GSTR-4 yearly, not GSTR-1 / 3B.",
      detail: "The GSTR-1 file is not needed. Sale totals for CMP-08 are on GST Analysis.",
      items: [],
    });
  } else {
    sections.push({
      key: "scheme", title: "Filing scheme", level: "ok",
      summary: input.prefs.scheme === "qrmp"
        ? "QRMP: GSTR-1 and GSTR-3B every quarter, tax paid monthly (PMT-06)."
        : "Regular: GSTR-1 by the 11th and GSTR-3B by the 20th of every month.",
      items: [],
    });
  }

  // ── Product HSN ──
  const noHsn = input.products.filter((p) => !String(p.hsn || "").trim());
  const badHsn = input.products.filter((p) => String(p.hsn || "").trim() && !isValidHsn(p.hsn));
  const hsnItems: ReadinessItem[] = [
    ...badHsn.slice(0, ITEM_CAP).map((p) => ({ label: p.name, note: `HSN "${String(p.hsn).trim()}" is not 4, 6 or 8 digits` })),
    ...noHsn.slice(0, Math.max(0, ITEM_CAP - Math.min(badHsn.length, ITEM_CAP))).map((p) => ({ label: p.name, note: "no HSN" })),
  ];
  if (badHsn.length > 0 || (noHsn.length > 0 && !input.prefs.turnoverUnder5Cr)) {
    sections.push({
      key: "hsn", title: "Product HSN codes", level: "block",
      summary: [
        badHsn.length ? `${plural(badHsn.length, "product")} with an HSN that is not 4, 6 or 8 digits` : "",
        noHsn.length ? `${plural(noHsn.length, "product")} without HSN` : "",
      ].filter(Boolean).join(" · "),
      detail: input.prefs.turnoverUnder5Cr
        ? "The portal rejects an HSN it does not know. Use 4 digits (6 is also fine)."
        : "Above ₹5 crore turnover every line needs a 6-digit HSN, retail included.",
      items: hsnItems, fixPath: "/products", fixLabel: "Open Products",
    });
  } else if (noHsn.length > 0) {
    sections.push({
      key: "hsn", title: "Product HSN codes", level: "warn",
      summary: `${plural(noHsn.length, "product")} without HSN. Fine for retail bills under ₹5 crore turnover; any of them on a bill to a GST-registered buyer will block the file.`,
      detail: "Garments are mostly 6109 / 6203 / 6204 / 6206; footwear 6403 / 6404; sarees 5407 / 5208 — ask your supplier's bill if unsure.",
      items: hsnItems, fixPath: "/products", fixLabel: "Open Products",
    });
  } else {
    sections.push({
      key: "hsn", title: "Product HSN codes", level: "ok",
      summary: `All ${plural(input.products.length, "product")} have an HSN code.`,
      items: [],
    });
  }

  // ── Units ──
  const unitCounts = new Map<string, number>();
  for (const p of input.products) {
    const unit = String(p.unit || "").trim();
    if (uqcForUnit(unit) === null) unitCounts.set(unit, (unitCounts.get(unit) || 0) + 1);
  }
  if (unitCounts.size > 0) {
    sections.push({
      key: "units", title: "Product units", level: "warn",
      summary: `${plural(unitCounts.size, "unit")} not in the GST unit list; those lines are reported as OTH (Others).`,
      detail: "GST wants PCS, NOS, MTR, KGS, SET, PRS, BOX, PAC, DOZ, ROL, BAG… Rename the unit in the product master to one of these.",
      items: [...unitCounts.entries()].sort((a, b) => b[1] - a[1]).map(([unit, n]) => ({ label: `"${unit}"`, note: plural(n, "product") })),
      fixPath: "/products", fixLabel: "Open Products",
    });
  } else {
    sections.push({ key: "units", title: "Product units", level: "ok", summary: "Every product unit maps to a GST unit code.", items: [] });
  }

  // ── Customers ──
  const cust = splitByGstin(input.customers);
  if (cust.invalid.length > 0) {
    sections.push({
      key: "customers", title: "Customer GSTINs", level: "block",
      summary: `${plural(cust.invalid.length, "customer")} with a GSTIN that fails the GST check digit${cust.partial.length ? ` · ${plural(cust.partial.length, "customer")} with a partial GSTIN` : ""}.`,
      detail: "A bill to such a customer cannot go in the B2B table. Correct the GSTIN, or clear it to bill them as retail.",
      items: [
        ...cust.invalid.slice(0, ITEM_CAP).map((c) => ({ label: c.name, note: `${String(c.gstin).trim().toUpperCase()} · wrong check digit` })),
        ...cust.partial.slice(0, ITEM_CAP).map((c) => ({ label: c.name, note: `${String(c.gstin).trim()} · not 15 characters` })),
      ],
      fixPath: "/customers", fixLabel: "Open Customers",
    });
  } else if (cust.partial.length > 0) {
    sections.push({
      key: "customers", title: "Customer GSTINs", level: "warn",
      summary: `${plural(cust.partial.length, "customer")} with a partial GSTIN; their bills are reported as retail (B2C) and the buyer gets no input credit.`,
      items: cust.partial.slice(0, ITEM_CAP).map((c) => ({ label: c.name, note: String(c.gstin).trim() })),
      fixPath: "/customers", fixLabel: "Open Customers",
    });
  } else {
    sections.push({
      key: "customers", title: "Customer GSTINs", level: "ok",
      summary: `${plural(cust.valid.length, "GST-registered customer")} with a valid GSTIN.`,
      items: [],
    });
  }

  // ── Suppliers ──
  const sup = splitByGstin(input.suppliers);
  if (sup.invalid.length + sup.partial.length > 0) {
    sections.push({
      key: "suppliers", title: "Supplier GSTINs", level: "warn",
      summary: `${plural(sup.invalid.length + sup.partial.length, "supplier")} with a GSTIN that is wrong or incomplete; purchases from them count as no ITC until fixed.`,
      detail: `${plural(sup.none.length, "supplier")} have no GSTIN at all (unregistered or composition): no input credit on those purchases, which is correct.`,
      items: [
        ...sup.invalid.slice(0, ITEM_CAP).map((s) => ({ label: s.name, note: `${String(s.gstin).trim().toUpperCase()} · wrong check digit` })),
        ...sup.partial.slice(0, ITEM_CAP).map((s) => ({ label: s.name, note: `${String(s.gstin).trim()} · not 15 characters` })),
      ],
      fixPath: "/suppliers", fixLabel: "Open Suppliers",
    });
  } else {
    sections.push({
      key: "suppliers", title: "Supplier GSTINs", level: "ok",
      summary: `${plural(sup.valid.length, "supplier")} with a valid GSTIN · ${plural(sup.none.length, "supplier")} without one (no ITC on their bills).`,
      items: [],
    });
  }

  // ── Last month's documents ──
  const gaps = seriesGaps(input.lastMonth.documents);
  const missing = gaps.reduce((n, g) => n + g.missing, 0);
  const cancelled = gaps.reduce((n, g) => n + g.cancelled, 0);
  const total = gaps.reduce((n, g) => n + g.total, 0);
  const docItems: ReadinessItem[] = gaps.map((g) => ({
    label: `${g.prefix}  ${g.from} → ${g.to}`,
    note: `${plural(g.total, "bill")}${g.cancelled ? `, ${g.cancelled} cancelled` : ""}${g.missing ? `, ${g.missing} missing in between` : ""}`,
  }));
  if (input.lastMonth.heldCarts > 0) {
    docItems.push({ label: "Held carts (not bills)", note: plural(input.lastMonth.heldCarts, "cart") });
  }
  if (total === 0) {
    sections.push({
      key: "documents", title: `Bill numbers · ${input.lastMonth.label}`, level: "ok",
      summary: "No bills last month.", items: docItems,
    });
  } else if (missing > 0) {
    sections.push({
      key: "documents", title: `Bill numbers · ${input.lastMonth.label}`, level: "warn",
      summary: `${plural(missing, "bill number")} missing inside a series (deleted bills). Table 13 of GSTR-1 reports numbers issued and cancelled; a gap can draw a question.`,
      detail: "Cancel a wrong bill instead of deleting it, so the number stays on record.",
      items: docItems,
    });
  } else {
    sections.push({
      key: "documents", title: `Bill numbers · ${input.lastMonth.label}`, level: "ok",
      summary: `${plural(total, "bill")} in ${plural(gaps.length, "series")}${cancelled ? `, ${cancelled} cancelled` : ""}, no gaps.`,
      items: docItems,
    });
  }

  const level = sections.reduce<ReadinessLevel>((acc, s) => worst(acc, s.level), "ok");
  return {
    level,
    blockers: sections.filter((s) => s.level === "block").length,
    warnings: sections.filter((s) => s.level === "warn").length,
    sections,
  };
}
