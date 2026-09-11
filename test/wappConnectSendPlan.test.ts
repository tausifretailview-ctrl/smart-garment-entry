import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyWappConnectCaptionFields,
  planWappConnectSendSteps,
  sendViaWappConnect,
  truncateWappConnectMessage,
  WAPPCONNECT_PDF_PLACEHOLDER_CAPTION,
} from "../supabase/functions/_shared/wappConnectSend.ts";
import { getWhatsAppErrorHint } from "../src/utils/whatsappErrorHints.ts";

const RANAWAT_DESCRIPTION = `THANK YOU FOR SHOPPING AT RANAWAT'S BLING!
FOR LATEST COLLECTIONS AND UPDATE, PLEASE FOLLOW US ON OUR INSTAGRAM HANDLE HTTPS://WWW.INSTAGRAM.COM/RANAWATS_BLING?IGSH=BDBJCTBPNGDQDMVX

HTTPS://YOUTUBE.COM/@RANAWATRAKESH1?FEATURE=SHARED

PLEASE SUBSCRIBE LIKE COMMENT, AND SHARE TO YOUR FRIENDS N FAMILY..
HELP US TO GROW`;

describe("planWappConnectSendSteps", () => {
  it("sends invoice description as sendText first, then the PDF", () => {
    const steps = planWappConnectSendSteps({
      hasFile: true,
      message: "Hello ARIYA,\nYour invoice POS/26-27/8 is attached.",
    });
    expect(steps.map((s) => s.endpoint)).toEqual([
      "/api/sendText",
      "/api/sendFileWithCaption",
    ]);
    expect(steps[0].message).toContain("POS/26-27/8");
    expect(steps[1].message).toBe(WAPPCONNECT_PDF_PLACEHOLDER_CAPTION);
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

  it("POSTs description (not query string) then POSTs the PDF with a short caption", async () => {
    const textFields: Record<string, string> = {};
    const fileFields: Record<string, string> = {};
    const sendTextUrls: string[] = [];
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
      if (url.includes("/api/sendText") && method === "POST") {
        sendTextUrls.push(url);
        const body = init?.body as FormData;
        textFields.message = String(body.get("message") ?? "");
        textFields.caption = String(body.get("caption") ?? "");
        textFields.description = String(body.get("description") ?? "");
        expect(new URL(url).searchParams.get("message")).toBeNull();
        return new Response(
          JSON.stringify({ status: "success", data: { connStatus: true, messageIDs: ["text-1"] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/sendFileWithCaption") && method === "POST") {
        const body = init?.body as FormData;
        fileFields.message = String(body.get("message") ?? "");
        fileFields.caption = String(body.get("caption") ?? "");
        fileFields.description = String(body.get("description") ?? "");
        return new Response(
          JSON.stringify({ status: "success", data: { connStatus: true, messageIDs: ["file-1"] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    });

    const result = await sendViaWappConnect("inst1234", "9876543210", {
      message: RANAWAT_DESCRIPTION,
      fileUrl: "https://example.com/invoice.pdf",
      filename: "Invoice_POS-26-27-902.pdf",
    });

    expect(textFields.description).toContain("HELP US TO GROW");
    expect(textFields.description).toContain("RANAWATS_BLING");
    expect(fileFields).toEqual({
      message: WAPPCONNECT_PDF_PLACEHOLDER_CAPTION,
      caption: WAPPCONNECT_PDF_PLACEHOLDER_CAPTION,
      description: WAPPCONNECT_PDF_PLACEHOLDER_CAPTION,
    });
    expect(sendTextUrls[0]).not.toContain("INSTAGRAM");
    expect(sendTextUrls[0]).not.toContain("HELP+US");
    expect(result.success).toBe(true);
    expect(result.endpoint).toBe("/api/sendText+/api/sendFileWithCaption");
    expect(result.messageId).toBe("text-1");
  });
});

describe("getWhatsAppErrorHint combined file+text endpoint", () => {
  it("does not treat PDF+description send as text-only", () => {
    const hint = getWhatsAppErrorHint(
      "invalid message",
      {
        endpoint: "/api/sendText+/api/sendFileWithCaption",
        requestUrl: "https://api.wappconnect.com/api/sendText?token=***&phone=91",
      },
      "wappconnect",
    );
    expect(hint?.title).toBe("PDF link not readable by WappConnect");
  });
});
