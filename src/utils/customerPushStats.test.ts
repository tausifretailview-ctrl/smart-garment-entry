import { describe, expect, it } from "vitest";
import {
  buildPushInviteMessage,
  customersNotEnabled,
  enabledPhones,
  matchesPushStatus,
  pushFailureLabel,
  pushMessageStage,
  summarizePushMessages,
} from "./customerPushStats";

const msg = (status: string, delivered: boolean, opened: boolean) => ({
  status,
  delivered_at: delivered ? "2026-10-02T05:00:00Z" : null,
  opened_at: opened ? "2026-10-02T05:01:00Z" : null,
});

describe("summarizePushMessages", () => {
  it("counts each message once at its furthest stage; sent includes delivered and opened", () => {
    const s = summarizePushMessages([
      msg("sent", false, false),
      msg("sent", true, false),
      msg("sent", true, true),
      msg("sent", false, true),
      msg("failed", false, false),
      msg("queued", false, false),
    ]);
    expect(s).toEqual({ total: 6, sent: 4, delivered: 3, opened: 2, failed: 1, queued: 1, openRate: 50 });
  });
  it("is zero for no messages", () => {
    expect(summarizePushMessages([]).openRate).toBe(0);
  });
});

describe("pushMessageStage / matchesPushStatus", () => {
  it("failed wins over timestamps", () => {
    expect(pushMessageStage(msg("failed", true, true))).toBe("failed");
  });
  it("filters by stage", () => {
    expect(matchesPushStatus(msg("sent", true, true), "sent")).toBe(true);
    expect(matchesPushStatus(msg("sent", true, true), "delivered")).toBe(true);
    expect(matchesPushStatus(msg("sent", true, false), "opened")).toBe(false);
    expect(matchesPushStatus(msg("failed", false, false), "sent")).toBe(false);
  });
});

describe("customersNotEnabled", () => {
  const enabled = enabledPhones([
    { customer_phone_last10: "9371122145", status: "confirmed", receives_invoices: true },
    { customer_phone_last10: "9000000001", status: "confirmed", receives_invoices: false },
    { customer_phone_last10: "9000000002", status: "inactive", receives_invoices: true },
  ]);
  it("only confirmed + receives_invoices counts as on", () => {
    expect([...enabled]).toEqual(["9371122145"]);
  });
  it("one row per phone with latest bill, most bills first", () => {
    const rows = customersNotEnabled(
      [
        { id: "a", sale_number: "POS/1", customer_name: "Ali", customer_phone: "+91 90000 00001", sale_date: "2026-10-01" },
        { id: "b", sale_number: "POS/2", customer_name: "Ali K", customer_phone: "9000000001", sale_date: "2026-10-02" },
        { id: "c", sale_number: "POS/3", customer_name: "Raj", customer_phone: "9000000002", sale_date: "2026-10-02" },
        { id: "d", sale_number: "POS/4", customer_name: "Shahin", customer_phone: "9371122145", sale_date: "2026-10-02" },
        { id: "e", sale_number: "POS/5", customer_name: "Walk-in", customer_phone: "", sale_date: "2026-10-02" },
      ],
      enabled,
    );
    expect(rows.map((r) => [r.phone, r.bills, r.lastSaleId, r.customer_name])).toEqual([
      ["9000000001", 2, "b", "Ali K"],
      ["9000000002", 1, "c", "Raj"],
    ]);
  });
});

describe("pushFailureLabel / invite", () => {
  it("explains common FCM errors", () => {
    expect(pushFailureLabel('FCM 404: {"error":{"status":"NOT_FOUND"}}')).toMatch(/turned notifications off/);
    expect(pushFailureLabel("OAuth token mint failed: 400")).toBe("Firebase key problem");
    expect(pushFailureLabel(null)).toBe("");
  });
  it("builds the WhatsApp invite with the bill link", () => {
    const m = buildPushInviteMessage({ customerName: "Raj", shopName: "KS Footwear", url: "https://ks.ezzy.shop/t/x" });
    expect(m).toContain("Hi Raj,");
    expect(m).toContain("KS Footwear");
    expect(m.endsWith("https://ks.ezzy.shop/t/x")).toBe(true);
  });
});
