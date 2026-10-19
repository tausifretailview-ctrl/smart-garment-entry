import { describe, expect, it } from "vitest";
import { lastSendByPhone } from "./bulkWhatsAppHistory";

const campaigns = [
  { id: "a", name: "Diwali 1", status: "completed", created_at: "2026-10-18T10:00:00Z" },
  { id: "b", name: "Diwali 2", status: "completed", created_at: "2026-10-19T10:00:00Z" },
  { id: "c", name: "Diwali 3", status: "running", created_at: "2026-10-19T12:00:00Z" },
  { id: "d", name: "Old stopped", status: "stopped", created_at: "2026-10-17T10:00:00Z" },
];

describe("lastSendByPhone", () => {
  it("keeps the latest campaign per number and counts how many reached it", () => {
    const map = lastSendByPhone(
      [
        { phone: "919800000001", campaign_id: "a", status: "read", sent_at: "2026-10-18T10:01:00Z" },
        { phone: "919800000001", campaign_id: "b", status: "delivered", sent_at: "2026-10-19T10:01:00Z" },
      ],
      campaigns,
    );
    expect(map.get("919800000001")).toEqual({ campaignName: "Diwali 2", at: "2026-10-19T10:01:00Z", queued: false, times: 2 });
  });

  it("treats failed, skipped and never-sent numbers of finished campaigns as not sent", () => {
    const map = lastSendByPhone(
      [
        { phone: "919800000002", campaign_id: "a", status: "failed", sent_at: null },
        { phone: "919800000003", campaign_id: "b", status: "skipped", sent_at: null },
        { phone: "919800000004", campaign_id: "d", status: "pending", sent_at: null },
      ],
      campaigns,
    );
    expect(map.size).toBe(0);
  });

  it("counts numbers still waiting in a running campaign as queued", () => {
    const map = lastSendByPhone([{ phone: "919800000005", campaign_id: "c", status: "pending", sent_at: null }], campaigns);
    expect(map.get("919800000005")).toMatchObject({ campaignName: "Diwali 3", queued: true });
  });
});
