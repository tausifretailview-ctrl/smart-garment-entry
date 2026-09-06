import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATION = "supabase/migrations/20260906140000_website_storefront_sections.sql";

describe("website storefront sections migration", () => {
  const sql = readFileSync(join(root, MIGRATION), "utf8");

  it("creates an org-scoped sections table with unique slugs", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.website_sections");
    expect(sql).toContain("CONSTRAINT website_sections_org_slug_key UNIQUE (organization_id, slug)");
    expect(sql).toMatch(/organization_id IN \(SELECT public\.get_user_organization_ids\(auth\.uid\(\)\)\)/);
  });

  it("adds section_id on website_products and returns it from get_public_storefront", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS section_id/);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_public_storefront");
    expect(sql).toContain("wsec.slug AS section_slug");
    expect(sql).toContain("'sections', COALESCE(v_sections, '[]'::json)");
  });

  it("keeps the public storefront RPC callable by anon", () => {
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_public_storefront\(text\) TO anon/);
  });

  it("seeds New Arrival for existing website orgs", () => {
    expect(sql).toContain("'new-arrival'");
    expect(sql).toContain("'New Arrival'");
  });
});
