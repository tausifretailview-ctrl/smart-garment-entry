/**
 * GST unit codes (UQC) from the unit typed in the product master (PCS, KG, Mtr…).
 * One list for the GSTR-1 file (HSN table) and the e-invoice (IRN) item lines, so the
 * two report the same unit. Plain TypeScript: used by the app and by edge functions.
 */

/** Portal UQC codes the product unit maps to. */
const UQC_BY_UNIT: Record<string, string> = {
  pcs: "PCS", pc: "PCS", piece: "PCS", pieces: "PCS", nos: "NOS", no: "NOS", number: "NOS", numbers: "NOS", unit: "UNT", units: "UNT", unt: "UNT",
  mtr: "MTR", mtrs: "MTR", m: "MTR", meter: "MTR", meters: "MTR", metre: "MTR", metres: "MTR",
  kg: "KGS", kgs: "KGS", kilogram: "KGS", kilograms: "KGS", gm: "GMS", gms: "GMS", gram: "GMS", grams: "GMS",
  ltr: "LTR", ltrs: "LTR", litre: "LTR", liter: "LTR", litres: "LTR", liters: "LTR", ml: "MLT", mlt: "MLT",
  set: "SET", sets: "SET", pair: "PRS", pairs: "PRS", prs: "PRS", box: "BOX", boxes: "BOX",
  pack: "PAC", packs: "PAC", pkt: "PAC", packet: "PAC", packets: "PAC", pac: "PAC",
  dozen: "DOZ", dozens: "DOZ", dz: "DOZ", doz: "DOZ", roll: "ROL", rolls: "ROL", rol: "ROL",
  bag: "BAG", bags: "BAG", bundle: "BDL", bundles: "BDL", bdl: "BDL", carton: "CTN", cartons: "CTN", ctn: "CTN",
  bottle: "BTL", bottles: "BTL", btl: "BTL", can: "CAN", cans: "CAN", tube: "TUB", tubes: "TUB", tub: "TUB",
  sqft: "SQF", sqf: "SQF", sqm: "SQM", sqmtr: "SQM", yard: "YDS", yards: "YDS", yds: "YDS", ton: "TON", tons: "TON",
  qtl: "QTL", quintal: "QTL", cm: "CMS", cms: "CMS", sheet: "NOS", sheets: "NOS",
  service: "NA", services: "NA", na: "NA", oth: "OTH", other: "OTH", others: "OTH",
};

/** `null` when the unit is not one the portal knows (caller reports it and uses OTH). */
export function uqcForUnit(unit: string | null | undefined): string | null {
  const key = String(unit || "").trim().toLowerCase().replace(/[.\s-]+/g, "");
  if (!key) return "PCS";
  return UQC_BY_UNIT[key] || null;
}

/**
 * E-invoice item unit: the product's UQC; OTH for services (SAC 99…), units the IRP
 * has no code for, and "NA".
 */
export function einvoiceUnit(unit: string | null | undefined, hsn: string | null | undefined): string {
  if (String(hsn ?? "").trim().startsWith("99")) return "OTH";
  const uqc = uqcForUnit(unit);
  return !uqc || uqc === "NA" ? "OTH" : uqc;
}
