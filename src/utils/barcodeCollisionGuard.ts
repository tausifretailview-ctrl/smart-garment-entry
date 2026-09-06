import { supabase } from "@/integrations/supabase/client";

const MAX_REGENERATE_ATTEMPTS = 5;
const MAX_LOCAL_WALK = 200;

export function isBarcodeCollisionError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "");
  return (
    code === "23505" ||
    /duplicate key/i.test(message) ||
    /unique constraint/i.test(message) ||
    /product_variants_active_product_color_size_barcode/i.test(message)
  );
}

/** Next integer in the org series, keeping the same zero-padding when possible. */
export function nextGeneratedBarcodeCandidate(barcode: string): string {
  const raw = String(barcode || "").trim();
  if (!/^\d+$/.test(raw)) return "";
  const next = (BigInt(raw) + 1n).toString();
  return next.length < raw.length ? next.padStart(raw.length, "0") : next;
}

async function allocateGeneratedBarcode(organizationId: string): Promise<string> {
  const { data, error } = await supabase.rpc("generate_next_barcode", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  const barcode = String(data ?? "").trim();
  if (!barcode) {
    throw new Error("generate_next_barcode returned an empty value");
  }
  return barcode;
}

async function generatedBarcodeTaken(
  organizationId: string,
  barcode: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("barcode", barcode)
    .is("deleted_at", null)
    .limit(1);
  if (error) throw error;
  return Boolean(data && data.length > 0);
}

/**
 * Gap-fill `generate_next_barcode` returns the first free hole and does not
 * reserve it. Saving a purchase product with several sizes therefore gets the
 * same number back on every RPC call until a row is inserted. Walk forward
 * past claimed / already-used values so the batch still gets unique codes.
 */
async function firstFreeFromAllocated(
  organizationId: string,
  startBarcode: string,
  claimedInBatch?: Set<string>,
): Promise<string | null> {
  let probe = String(startBarcode || "").trim();
  for (let step = 0; step < MAX_LOCAL_WALK && probe; step += 1) {
    const takenInBatch = claimedInBatch?.has(probe) === true;
    if (!takenInBatch && !(await generatedBarcodeTaken(organizationId, probe))) {
      return probe;
    }
    probe = nextGeneratedBarcodeCandidate(probe);
  }
  return null;
}

/**
 * Immediately before inserting a row with an app-generated barcode,
 * re-verify it's still free and regenerate if not. Closes the gap between
 * "barcode was generated" and "row was actually inserted", which can be
 * arbitrarily long if the user takes time filling out the rest of a form
 * in between — a stale generated value is not a safe value to trust at
 * insert time.
 *
 * `claimedInBatch` holds barcodes already assigned to other rows in the
 * same not-yet-inserted payload so two stale copies of 450006772 in one
 * save cannot both pass the DB check and collide with each other.
 */
export async function ensureFreshGeneratedBarcode(
  organizationId: string,
  candidateBarcode: string,
  claimedInBatch?: Set<string>,
): Promise<string> {
  let barcode = String(candidateBarcode ?? "").trim();
  let attempts = 0;
  while (attempts < MAX_REGENERATE_ATTEMPTS) {
    const takenInBatch = Boolean(barcode) && claimedInBatch?.has(barcode) === true;
    if (barcode && !takenInBatch && !(await generatedBarcodeTaken(organizationId, barcode))) {
      claimedInBatch?.add(barcode);
      return barcode;
    }
    const allocated = await allocateGeneratedBarcode(organizationId);
    const available = await firstFreeFromAllocated(organizationId, allocated, claimedInBatch);
    if (available) {
      claimedInBatch?.add(available);
      return available;
    }
    barcode = allocated;
    attempts += 1;
  }
  throw new Error("Could not find a free generated barcode after 5 attempts");
}

export async function ensureFreshGeneratedBarcodes(
  organizationId: string,
  candidates: string[],
): Promise<string[]> {
  const claimed = new Set<string>();
  const out: string[] = [];
  for (const candidate of candidates) {
    out.push(await ensureFreshGeneratedBarcode(organizationId, candidate, claimed));
  }
  return out;
}

/**
 * Insert a generated-barcode variant, re-checking uniqueness first and
 * retrying once if the insert still reports a unique-constraint collision.
 */
export async function insertGeneratedProductVariant<T = { id: string }>(
  row: Record<string, unknown> & { organization_id: string; barcode: string },
  select = "id",
): Promise<{ data: T; barcode: string }> {
  const orgId = row.organization_id;
  let barcode = await ensureFreshGeneratedBarcode(orgId, String(row.barcode ?? ""));

  const run = async (bc: string) => {
    const payload = {
      ...row,
      barcode: bc,
      barcode_source: row.barcode_source ?? "generated",
    };
    return supabase
      .from("product_variants")
      .insert(payload as never)
      .select(select)
      .single();
  };

  let result = await run(barcode);
  if (result.error && isBarcodeCollisionError(result.error)) {
    barcode = await ensureFreshGeneratedBarcode(orgId, barcode);
    result = await run(barcode);
  }
  if (result.error) throw result.error;
  return { data: result.data as T, barcode };
}
