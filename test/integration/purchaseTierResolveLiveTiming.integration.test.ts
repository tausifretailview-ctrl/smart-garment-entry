/**
 * Live read-only benchmark: batch price-tier resolution for purchase bill save.
 *
 * Requires service-role access (read product_variants only — no bill writes):
 *   SUPABASE_TEST_URL + SUPABASE_TEST_SERVICE_ROLE_KEY  (.env.test), OR
 *   VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Orgs: Ella Noor + KS Footwear (user-approved production tenants).
 */
import { describe, expect, it, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { resolveVariantsForIncomingPriceTiers } from "@/utils/purchaseVariantPriceTierFork";

const ORGS = [
  { slug: "ella-noor", id: "3fdca631-1e0c-4417-9704-421f5129ff67", label: "ELLA NOOR" },
  { slug: "ks-footwear", id: "4bc73037-e877-4123-9261-eb6e3876698c", label: "KS FOOTWEAR" },
] as const;

function readLiveBenchmarkEnv(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.SUPABASE_TEST_URL || process.env.VITE_SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

const liveEnv = readLiveBenchmarkEnv();
const describeLive = liveEnv ? describe : describe.skip;

describeLive("purchase tier resolve — live timing (read-only)", () => {
  let client: ReturnType<typeof createClient>;

  beforeAll(() => {
    const env = readLiveBenchmarkEnv();
    if (!env) throw new Error("Missing live benchmark credentials");
    client = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  for (const org of ORGS) {
    it(`batch-resolves 25 lines for ${org.label} within reasonable time`, async () => {
      const { data: variants, error } = await client
        .from("product_variants")
        .select("id, product_id, barcode, pur_price, sale_price, mrp")
        .eq("organization_id", org.id)
        .is("deleted_at", null)
        .not("barcode", "is", null)
        .gt("sale_price", 0)
        .gt("pur_price", 0)
        .limit(30);

      expect(error).toBeNull();
      expect(variants?.length ?? 0).toBeGreaterThanOrEqual(2);

      const pool = variants!;
      const lines = Array.from({ length: 25 }, (_, i) => {
        const v = pool[i % pool.length]!;
        const altSale =
          i % 3 === 0 && Number(v.sale_price) > 0
            ? Number(v.sale_price) + (i % 2 === 0 ? 20 : 0)
            : Number(v.sale_price);
        return {
          organizationId: org.id,
          variantId: v.id,
          barcode: String(v.barcode || ""),
          incomingPurPrice: Number(v.pur_price) || 0,
          incomingSalePrice: altSale,
          incomingMrp: Number(v.mrp) || undefined,
        };
      });

      const t0 = performance.now();
      const results = await resolveVariantsForIncomingPriceTiers(lines);
      const elapsedMs = Math.round(performance.now() - t0);

      expect(results).toHaveLength(25);
      expect(results.every(Boolean)).toBe(true);

      // eslint-disable-next-line no-console -- intentional benchmark output
      console.log(
        `[purchaseTierLive] ${org.label} (${org.slug}): ${elapsedMs}ms for 25 lines, ` +
          `${pool.length} distinct variants sampled`,
      );

      // Batch path should stay well under statement_timeout budget (8s) for tier resolve alone.
      expect(elapsedMs).toBeLessThan(8_000);
    }, 30_000);
  }
});
