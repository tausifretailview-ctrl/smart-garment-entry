import { describe, expect, it } from "vitest";
import {
  buildWappConnectReviewPrompt,
  isOkReply,
  parseWappConnectInbound,
  ratingFromReplyText,
} from "../supabase/functions/_shared/wappConnectInbound.ts";

describe("parseWappConnectInbound", () => {
  it("reads event + data payloads", () => {
    expect(
      parseWappConnectInbound({
        event: "message",
        instance_id: "inst1",
        data: { id: "m1", from: "919876543210@c.us", body: "Ok", pushName: "Test" },
      }),
    ).toEqual({ from: "919876543210", text: "Ok", messageId: "m1", instanceId: "inst1", senderName: "Test" });
  });

  it("reads Baileys messages.upsert payloads", () => {
    const parsed = parseWappConnectInbound({
      event: "messages.upsert",
      data: {
        key: { remoteJid: "919876543210@s.whatsapp.net", fromMe: false, id: "B1" },
        message: { conversation: "5" },
      },
    });
    expect(parsed?.from).toBe("919876543210");
    expect(parsed?.text).toBe("5");
    expect(parsed?.messageId).toBe("B1");
  });

  it("reads flat payloads", () => {
    expect(parseWappConnectInbound({ from: "919876543210", message: "ok" })?.text).toBe("ok");
  });

  it("ignores our own messages, groups, statuses and Meta payloads", () => {
    expect(parseWappConnectInbound({ event: "message", data: { from: "919876543210", body: "Hi", fromMe: true } })).toBeNull();
    expect(parseWappConnectInbound({ event: "message", data: { from: "1203630@g.us", body: "Hi" } })).toBeNull();
    expect(parseWappConnectInbound({ event: "message.status", data: { message_id: "x", status: "read" } })).toBeNull();
    expect(parseWappConnectInbound({ object: "whatsapp_business_account", entry: [] })).toBeNull();
    expect(parseWappConnectInbound({ messaging_channel: "whatsapp", message: { queue_id: "q", message_status: "read" } })).toBeNull();
  });
});

describe("reply classification", () => {
  it("recognises OK replies", () => {
    for (const t of ["Ok", "OK", "ok.", "okay", "Okk", "👍", "ok 👍", "Done", "saved"]) {
      expect(isOkReply(t)).toBe(true);
    }
    for (const t of ["ok but size is wrong", "where is my bill", "5", ""]) {
      expect(isOkReply(t)).toBe(false);
    }
  });

  it("reads ratings", () => {
    expect(ratingFromReplyText("5")).toBe(5);
    expect(ratingFromReplyText("4 star")).toBe(4);
    expect(ratingFromReplyText("3 Average")).toBe(3);
    expect(ratingFromReplyText("⭐⭐")).toBe(2);
    expect(ratingFromReplyText("6")).toBeNull();
    expect(ratingFromReplyText("50")).toBeNull();
    expect(ratingFromReplyText("ok")).toBeNull();
  });

  it("builds the star menu with the bill page link", () => {
    const text = buildWappConnectReviewPrompt({ shopName: "ALBELI FASHION", billLink: "https://albeli.ezzy.shop/t/abc" });
    expect(text).toContain("*ALBELI FASHION*");
    expect(text).toContain("5 ⭐⭐⭐⭐⭐ Excellent");
    expect(text).toContain("https://albeli.ezzy.shop/t/abc#rate");
  });
});
