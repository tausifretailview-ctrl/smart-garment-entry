import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("owner alerts wiring", () => {
  it("bill save calls the owner alert without awaiting it", () => {
    const src = read("src/hooks/useSaveSale.tsx");
    expect(src).toContain("notifyOwnersOfNewBill(currentOrganization.id, sale.id);");
    expect(src).not.toContain("await notifyOwnersOfNewBill");
  });

  it("the bill alert is fire-and-forget and skips orgs with alerts off", () => {
    const src = read("src/lib/ownerPush.ts");
    expect(src).toMatch(/export function notifyOwnersOfNewBill\([^)]*\): void/);
    expect(src).toContain('data.invoice_mode !== "off"');
  });

  it("permission is asked only from the Settings button, not on app start", () => {
    const src = read("src/lib/ownerPush.ts");
    const refresh = src.slice(src.indexOf("export async function refreshOwnerAlertsToken"));
    expect(refresh.slice(0, refresh.indexOf("\n}\n"))).not.toContain("requestPermissions");
  });

  it("Android notifications use the owner_alerts channel with a notification block", () => {
    const src = read("supabase/functions/_shared/fcm.ts");
    expect(src).toContain('channelId = "owner_alerts"');
    expect(src).toMatch(/message: \{\s*token,\s*notification,/);
  });

  it("migration keeps alerts off until a shop enables them", () => {
    const sql = read("supabase/migrations/20261231170000_owner_alerts.sql");
    expect(sql).toContain("enabled boolean NOT NULL DEFAULT false");
    expect(sql).toContain("IF NOT EXISTS (SELECT 1 FROM public.owner_alert_settings WHERE enabled)");
    expect(sql).toContain("UNIQUE (organization_id, kind, ref)");
  });
});
