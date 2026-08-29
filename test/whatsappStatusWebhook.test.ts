import { describe, expect, it } from "vitest";
import { parseProviderStatusWebhook, extractWhatsAppDeliveryError, isBspSendAccepted } from "../supabase/functions/_shared/whatsappStatusWebhook.ts";

describe("parseProviderStatusWebhook", () => {
  it("parses message.status events", () => {
    expect(
      parseProviderStatusWebhook({
        event: "message.status",
        data: { message_id: "ABC123", status: "read" },
      }),
    ).toEqual({ messageId: "ABC123", status: "read", timestampIso: undefined, errorMessage: undefined });
  });

  it("parses ack events (delivered / read)", () => {
    expect(
      parseProviderStatusWebhook({
        event: "message.ack",
        data: { id: "MSG-1", ack: 2 },
      }),
    ).toEqual({ messageId: "MSG-1", status: "delivered", timestampIso: undefined, errorMessage: undefined });

    expect(
      parseProviderStatusWebhook({
        event: "message.ack",
        data: { id: "MSG-1", ack: 3 },
      }),
    ).toEqual({ messageId: "MSG-1", status: "read", timestampIso: undefined, errorMessage: undefined });
  });

  it("parses WappConnect BSP status-only shape", () => {
    expect(
      parseProviderStatusWebhook({
        messaging_channel: "whatsapp",
        message: { queue_id: "q-99", message_status: "delivered" },
      }),
    ).toEqual({ messageId: "q-99", status: "delivered", timestampIso: undefined, errorMessage: undefined });
  });

  it("extractWhatsAppDeliveryError reads nested Meta error objects", () => {
    expect(
      extractWhatsAppDeliveryError({
        message: {
          queue_id: "q-1",
          message_status: "failed",
          error: { code: 131026, message: "Message undeliverable" },
        },
      }),
    ).toBe("Message undeliverable (131026)");
  });

  it("isBspSendAccepted treats queue_id + queued as success even when HTTP is not ok", () => {
    expect(
      isBspSendAccepted(
        {
          messaging_channel: "whatsapp",
          message: { queue_id: "63112560-88e2-478b-be75-5cc8d62996f5", message_status: "queued" },
        },
        false,
      ),
    ).toBe(true);
  });
});
