import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("customer push is data-only (one notification, tap opens the bill)", () => {
  const src = read("supabase/functions/push-send/index.ts");
  const body = src.slice(src.indexOf("message: {"), src.indexOf("message: {") + 900);

  it("sends no notification block", () => {
    expect(body).not.toMatch(/\bnotification:\s*\{/);
  });
  it("puts title and body in data, with high urgency", () => {
    expect(body).toContain('title: String(title ?? "")');
    expect(body).toContain('body: String(body ?? "")');
    expect(body).toContain('webpush: { headers: { Urgency: "high" } }');
  });
  it("service worker still reads title/body from data", () => {
    const sw = read("src/customer/sw.ts");
    expect(sw).toContain("buildPushDisplay(payload");
    const display = read("src/customer/lib/pushDisplay.ts");
    expect(display).toContain("data.title");
    expect(display).toContain("data.body");
  });
});

describe("WhatsApp reply alerts keep their realtime channel across screens", () => {
  const src = read("src/components/WhatsAppMessageNotifier.tsx");

  it("subscribes only per org, not per screen", () => {
    expect(src).toContain("}, [canNotify, currentOrganization?.id]);");
    expect(src).not.toMatch(/location\.pathname, orgNavigate\]/);
  });
  it("asks for desktop-alert permission only from a click", () => {
    const calls = src.split("Notification.requestPermission(").length - 1;
    expect(calls).toBe(1);
    expect(src).toContain('label: "Enable desktop alerts"');
  });
});
