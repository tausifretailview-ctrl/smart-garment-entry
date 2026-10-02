import { describe, expect, it } from "vitest";
import { buildPushDisplay } from "./pushDisplay";

describe("buildPushDisplay", () => {
  it("reads a data-only payload", () => {
    const d = buildPushDisplay({ data: { message_id: "m1", title: "Invoice POS/26-27/340", body: "₹900 — tap to view" } });
    expect(d).toMatchObject({ title: "Invoice POS/26-27/340", body: "₹900 — tap to view", messageId: "m1", tag: "m1" });
    expect(d.url).toBe("/m/m1?title=Invoice%20POS%2F26-27%2F340&body=%E2%82%B9900%20%E2%80%94%20tap%20to%20view");
  });
  it("prefers a notification block and falls back sensibly", () => {
    expect(buildPushDisplay({ notification: { title: "T", body: "B" }, data: { title: "x" } })).toMatchObject({ title: "T", body: "B" });
    expect(buildPushDisplay({})).toMatchObject({ title: "New update", body: "", tag: "shop-update", messageId: undefined });
  });
});
