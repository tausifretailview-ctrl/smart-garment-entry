import { describe, expect, it } from "vitest";
import {
  buildPushInviteMessage,
  bulkAudienceLabel,
  bulkHistoryMatches,
  customersNotEnabled,
  enabledPhones,
  matchesPushStatus,
  pushFailureLabel,
  pushMessageStage,
  summarizeBulkSends,
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

describe("summarizeBulkSends", () => {
  const campaign = {
    id: "camp-1",
    title: "Diwali Sale",
    body: "New stock",
    created_at: "2026-10-06T04:00:00Z",
    status: "done",
    target: { phones: ["9527465086"] },
  };
  const all = {
    id: "camp-2",
    title: "All customers",
    body: "Shop closed Sunday",
    created_at: "2026-10-05T04:00:00Z",
    status: "done",
    target: {},
  };

  it("totals sent, failed and read for offer messages and keeps one history row per send", () => {
    const result = summarizeBulkSends(
      [
        { campaign_id: "camp-1", status: "sent", delivered_at: "t", opened_at: "t", created_at: "2026-10-06T04:01:00Z" },
        { campaign_id: "camp-1", status: "failed", delivered_at: null, opened_at: null, created_at: "2026-10-06T04:01:00Z" },
        { campaign_id: null, status: "sent", delivered_at: null, opened_at: null, created_at: "2026-10-06T04:02:00Z" },
        { campaign_id: "camp-2", status: "sent", delivered_at: "t", opened_at: null, created_at: "2026-10-05T04:01:00Z" },
      ],
      [campaign, all],
    );
    expect(result.summary).toMatchObject({ total: 3, sent: 2, opened: 1, failed: 1 });
    expect(result.history.map((r) => [r.title, r.audience, r.sent, r.failed, r.read])).toEqual([
      ["Diwali Sale", "1 selected", 1, 1, 1],
      ["All customers", "All contacts", 1, 0, 0],
    ]);
    expect(bulkHistoryMatches(result.history[0], "failed")).toBe(true);
    expect(bulkHistoryMatches(result.history[1], "failed")).toBe(false);
    expect(bulkHistoryMatches(result.history[1], "read")).toBe(false);
    expect(bulkAudienceLabel(null)).toBe("All contacts");
    expect(bulkAudienceLabel({ phones: ["9000000001", "9000000002"] })).toBe("2 selected");
  });

  it("still lists a send when the campaign row is missing", () => {
    const result = summarizeBulkSends(
      [
        { campaign_id: "camp-x", status: "failed", delivered_at: null, opened_at: null, created_at: "2026-10-06T10:00:00Z" },
        { campaign_id: "camp-x", status: "failed", delivered_at: null, opened_at: null, created_at: "2026-10-06T09:00:00Z" },
      ],
      [],
    );
    expect(result.history).toEqual([
      expect.objectContaining({
        campaignId: "camp-x",
        title: "Offer",
        audience: "All contacts",
        sent: 0,
        failed: 2,
        read: 0,
        createdAt: "2026-10-06T09:00:00Z",
      }),
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
