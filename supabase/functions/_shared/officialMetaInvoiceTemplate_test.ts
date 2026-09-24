import { assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { replaceTemplateLogoWithShopDetails } from "./officialMetaInvoiceTemplate.ts";

Deno.test("replaces image header with shop name and adds address without changing seven placeholders", () => {
  const components = [
    { type: "HEADER", format: "IMAGE", example: { header_handle: ["https://example.com/logo.png"] } },
    {
      type: "BODY",
      text: "Hello {{1}},\n\nThank you for your purchase with {{2}}.\nInvoice: {{3}}\nAmount: {{4}}\n{{5}}\n{{6}}\n{{7}}",
      example: { body_text: [["A", "B", "C", "D", "E", "F", "G"]] },
    },
    { type: "FOOTER", text: "Thank you." },
  ];

  const updated = replaceTemplateLogoWithShopDetails(components, {
    businessName: "VASTRAKALA SAREES & LADIES WEAR",
    address: "MAHARANA PRATAP CHOWK, LAXMI ROAD, KOLHAPUR",
  });

  assertEquals(updated[0], {
    type: "HEADER",
    format: "TEXT",
    text: "VASTRAKALA SAREES & LADIES WEAR",
  });
  assertFalse(updated.some((component) => component.format === "IMAGE"));
  const body = String(updated.find((component) => component.type === "BODY")?.text ?? "");
  assertEquals((body.match(/\{\{\d+\}\}/g) ?? []).length, 7);
  assertEquals(body.startsWith("📍 MAHARANA PRATAP CHOWK, LAXMI ROAD, KOLHAPUR\n\n"), true);
});