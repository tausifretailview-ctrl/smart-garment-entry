import { describe, expect, it } from "vitest";
import { buildChatTimeline, filterInboxChats, inboxTagList } from "./bulkWhatsAppInbox";

const chats = [
  { phone: "919800000001", name: "Asha", tags: ["Interested"], unread_count: 2, last_message_preview: "Price?" },
  { phone: "919800000002", name: "Ravi", tags: [], unread_count: 0, last_message_preview: "Thanks" },
  { phone: "919800000003", name: null, tags: ["VIP"], unread_count: 0, last_message_preview: "Size M?" },
];

describe("filterInboxChats", () => {
  it("filters by unread, tag (any case) and search on name, number or last message", () => {
    expect(filterInboxChats(chats, "unread", "").map((c) => c.name)).toEqual(["Asha"]);
    expect(filterInboxChats(chats, "interested", "").map((c) => c.name)).toEqual(["Asha"]);
    expect(filterInboxChats(chats, "all", "ravi").map((c) => c.phone)).toEqual(["919800000002"]);
    expect(filterInboxChats(chats, "all", "0003").map((c) => c.phone)).toEqual(["919800000003"]);
    expect(filterInboxChats(chats, "all", "size").map((c) => c.phone)).toEqual(["919800000003"]);
  });
});

describe("inboxTagList", () => {
  it("lists presets first, then shop tags once", () => {
    expect(inboxTagList(chats)).toEqual(["Interested", "Follow up", "Ordered", "Not interested", "VIP"]);
  });
});

describe("buildChatTimeline", () => {
  it("puts the campaign message (with the customer's name) before the reply, by time", () => {
    const campaigns = new Map([
      ["c1", { name: "Diwali", message: "Hi {name}, 15% off", media_url: null, media_type: null, created_at: "2026-10-19T09:00:00Z" }],
    ]);
    const items = buildChatTimeline(
      [{ id: "m1", direction: "in", body: "Price?", media_type: null, status: "received", error: null, created_at: "2026-10-19T10:00:00Z" }],
      [
        { id: "r1", campaign_id: "c1", name: "Asha", status: "read", error: null, sent_at: "2026-10-19T09:30:00Z" },
        { id: "r2", campaign_id: "c1", name: "Asha", status: "skipped", error: "Stopped", sent_at: null },
      ],
      campaigns,
    );
    expect(items.map((i) => i.key)).toEqual(["c-r1", "m-m1"]);
    expect(items[0]).toMatchObject({ kind: "campaign", text: "Hi Asha, 15% off", status: "read" });
  });
});
