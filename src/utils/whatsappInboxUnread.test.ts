import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

import { isCustomerReplyMessage } from "./whatsappInboxUnread";

describe("isCustomerReplyMessage", () => {
  it("accepts inbound text replies", () => {
    expect(isCustomerReplyMessage("inbound", "text")).toBe(true);
  });

  it("accepts inbound button and interactive replies", () => {
    expect(isCustomerReplyMessage("inbound", "button")).toBe(true);
    expect(isCustomerReplyMessage("inbound", "interactive")).toBe(true);
  });

  it("rejects outbound sends", () => {
    expect(isCustomerReplyMessage("outbound", "text")).toBe(false);
    expect(isCustomerReplyMessage("outbound", "template")).toBe(false);
  });

  it("rejects inbound without a reply message type", () => {
    expect(isCustomerReplyMessage("inbound", null)).toBe(false);
    expect(isCustomerReplyMessage("inbound", "template")).toBe(false);
  });
});
