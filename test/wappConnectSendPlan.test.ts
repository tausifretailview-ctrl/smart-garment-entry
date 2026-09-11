import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyWappConnectCaptionFields,
  planWappConnectSendSteps,
  sendViaWappConnect,
  truncateWappConnectMessage,
} from "../supabase/functions/_shared/wappConnectSend.ts";
import { getWhatsAppErrorHint } from "../src/utils/whatsappErrorHints.ts";

describe("planWappConnectSendSteps", () => {
  it("sends PDF then invoice description as sendText", () => {
    const steps = planWappConnectSendSteps({
      hasFile: true,
      message: "Hello ARIYA,\nYour invoice POS/26-27/8 is attached.",
    });
    expect(steps.map((s) => s.endpoint)).toEqual([
      "/api/sendFileWithCaption",
      "/api/sendText",
    ]);
    expect(steps[1].message).toContain("POS/26-27/8");
  });

  it("does not send a second text when description is empty", () => {
    const steps = planWappConnectSendSteps({ hasFile: true, message: "  " });
    expect(steps).toEqual([
      {
        endpoint: "/api/sendFileWithCaption",
        role: "file",
        message: "Please find your document attached.",
      },
    ]);
  });

  it("sends text-only when there is no file", () => {
    const steps = planWappConnectSendSteps({ hasFile: false, message: "Pay reminder" });
    expect(steps).toEqual([
      { endpoint: "/api/sendText", role: "text", message: "Pay reminder" },
    ]);
  });
});

describe("applyWappConnectCaptionFields", () => {
  it("sets message, caption, and description", () => {
    const fields: Record<string, string> = {};
    applyWappConnectCaptionFields((key, value) => {
      fields[key] = value;
    }, "Invoice body");
    expect(fields).toEqual({
      message: "Invoice body",
      caption: "Invoice body",
      description: "Invoice body",
    });
  });
});

describe("truncateWappConnectMessage", () => {
  it("keeps short text unchanged", () => {
    expect(truncateWappConnectMessage("Hello")).toBe("Hello");
  });

  it("truncates over 2000 bytes", () => {
    const long = "₹".repeat(1200);
    const truncated = truncateWappConnectMessage(long);
    expect(new TextEncoder().encode(truncated).length).toBeLessThanOrEqual(2000 + new TextEncoder().encode("…").length);
    expect(truncated.endsWith("…")).toBe(true);
  });
});

describe("sendViaWappConnect PDF + description", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs file with description field then sendTexts the invoice body", async () => {
    const formFields: Record<string, string> = {};
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || "GET").toUpperCase();

      if (url.includes("example.com/invoice.pdf") && method === "HEAD") {
        return new Response(null, { status: 200, headers: { "content-type": "application/pdf" } });
      }
      if (url.includes("example.com/invoice.pdf") && method === "GET") {
        return new Response(new Uint8Array([37, 80, 68, 70]), {
          status: 200,
          headers: { "content-type": "application/pdf" },
        });
      }
      if (url.includes("/api/sendFileWithCaption") && method === "POST") {
        const body = init?.body as FormData;
        formFields.message = String(body.get("message") ?? "");
        formFields.caption = String(body.get("caption") ?? "");
        formFields.description = String(body.get("description") ?? "");
        return new Response(
          JSON.stringify({ status: "success", data: { connStatus: true, messageIDs: ["file-1"] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/sendText")) {
        const parsed = new URL(url);
        expect(parsed.searchParams.get("message")).toBe("Your invoice POS/26-27/8 is attached.");
        return new Response(
          JSON.stringify({ status: "success", data: { connStatus: true, messageIDs: ["text-1"] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    });

    const result = await sendViaWappConnect("inst1234", "9876543210", {
      message: "Your invoice POS/26-27/8 is attached.",
      fileUrl: "https://example.com/invoice.pdf",
      filename: "Invoice_POS-26-27-8.pdf",
    });

    expect(formFields).toEqual({
      message: "Your invoice POS/26-27/8 is attached.",
      caption: "Your invoice POS/26-27/8 is attached.",
      description: "Your invoice POS/26-27/8 is attached.",
    });
    expect(result.success).toBe(true);
    expect(result.endpoint).toBe("/api/sendFileWithCaption+/api/sendText");
    expect(result.messageId).toBe("text-1");
  });
});

describe("getWhatsAppErrorHint combined file+text endpoint", () => {
  it("does not treat PDF+description send as text-only", () => {
    const hint = getWhatsAppErrorHint(
      "invalid message",
      {
        endpoint: "/api/sendFileWithCaption+/api/sendText",
        requestUrl: "https://api.wappconnect.com/api/sendText?token=***&phone=91",
      },
      "wappconnect",
    );
    expect(hint?.title).toBe("PDF link not readable by WappConnect");
  });
});
