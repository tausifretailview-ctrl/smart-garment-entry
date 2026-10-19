import { describe, expect, it } from "vitest";
import {
  buildBulkLinkLines,
  fillBulkMessage,
  formatBulkPhone,
  instagramLink,
  locationLink,
  mergeContacts,
  normalizeBulkPhone,
  parseContactSheet,
  parseTypedContacts,
  stripBulkExtras,
} from "./bulkWhatsAppContacts";

describe("normalizeBulkPhone", () => {
  it("adds 91 to 10-digit numbers and drops a trunk 0", () => {
    expect(normalizeBulkPhone("98765 43210")).toBe("919876543210");
    expect(normalizeBulkPhone("09876543210")).toBe("919876543210");
    expect(normalizeBulkPhone("+91-98765-43210")).toBe("919876543210");
    expect(normalizeBulkPhone(9876543210)).toBe("919876543210");
  });
  it("rejects short numbers", () => {
    expect(normalizeBulkPhone("12345")).toBeNull();
    expect(normalizeBulkPhone("")).toBeNull();
  });
  it("formats Indian numbers for display", () => {
    expect(formatBulkPhone("919876543210")).toBe("+91 98765 43210");
  });
});

describe("parseTypedContacts", () => {
  it("reads name + number lines and number lists", () => {
    const { contacts, invalid } = parseTypedContacts("Ravi 9876543210\n9123456789, Sana\n9000000001, 9000000002\nhello");
    expect(contacts).toEqual([
      { phone: "919876543210", name: "Ravi" },
      { phone: "919123456789", name: "Sana" },
      { phone: "919000000001", name: null },
      { phone: "919000000002", name: null },
    ]);
    expect(invalid).toEqual(["hello"]);
  });
});

describe("parseContactSheet", () => {
  it("uses the Mobile and Name headers", () => {
    const { contacts, invalid } = parseContactSheet([
      ["Sr", "Customer Name", "Mobile No"],
      [1, "Ravi", "9876543210"],
      [2, "Sana", 9123456789],
      [3, "Bad", "123"],
    ]);
    expect(contacts).toEqual([
      { phone: "919876543210", name: "Ravi" },
      { phone: "919123456789", name: "Sana" },
    ]);
    expect(invalid).toBe(1);
  });
  it("finds the phone column without headers", () => {
    const { contacts } = parseContactSheet([
      ["Ravi", 9876543210],
      ["Sana", 9123456789],
    ]);
    expect(contacts).toEqual([
      { phone: "919876543210", name: "Ravi" },
      { phone: "919123456789", name: "Sana" },
    ]);
  });
});

describe("mergeContacts / fillBulkMessage", () => {
  it("drops duplicates and keeps a name", () => {
    const { contacts, duplicates } = mergeContacts(
      [{ phone: "919876543210", name: null }],
      [{ phone: "919876543210", name: "Ravi" }, { phone: "919123456789", name: null }],
    );
    expect(duplicates).toBe(1);
    expect(contacts).toEqual([
      { phone: "919876543210", name: "Ravi" },
      { phone: "919123456789", name: null },
    ]);
  });
  it("fills {name}", () => {
    expect(fillBulkMessage("Hi {name}, sale!", "Ravi")).toBe("Hi Ravi, sale!");
    expect(fillBulkMessage("Hi { Name }", null)).toBe("Hi Customer");
  });
});

describe("buildBulkLinkLines", () => {
  it("adds only the filled links, as tappable WhatsApp text", () => {
    const lines = buildBulkLinkLines({
      instagram: "@shubharamb",
      call: "98765 43210",
      location: "Andheri West, Mumbai",
      enquire: "9876543210",
    });
    expect(lines).toEqual([
      "📞 *Call now:* +91 98765 43210",
      "💬 *Enquire now:* https://wa.me/919876543210?text=Hi%2C%20I%20want%20to%20know%20more%20about%20your%20offer",
      "📍 *Shop location:* https://www.google.com/maps/search/?api=1&query=Andheri%20West%2C%20Mumbai",
      "📸 *Follow us on Instagram:* https://instagram.com/shubharamb",
    ]);
  });

  it("keeps pasted links and skips bad numbers", () => {
    expect(
      buildBulkLinkLines({ instagram: "instagram.com/abc", call: "123", location: "https://maps.app.goo.gl/x", enquire: "" }),
    ).toEqual(["📍 *Shop location:* https://maps.app.goo.gl/x", "📸 *Follow us on Instagram:* https://instagram.com/abc"]);
    expect(instagramLink("bad handle!")).toBeNull();
    expect(locationLink("")).toBeNull();
  });
});

describe("stripBulkExtras", () => {
  it("drops the STOP footer and the added link lines", () => {
    const sent = [
      "*Diwali sale*",
      "",
      "Up to 15% off",
      "",
      "📞 *Call now:* +91 98765 43210",
      "📍 *Shop location:* https://maps.app.goo.gl/abc",
      "",
      "_Reply STOP to stop these messages_",
    ].join("\n");
    expect(stripBulkExtras(sent)).toBe("*Diwali sale*\n\nUp to 15% off");
  });

  it("keeps a message with nothing added", () => {
    expect(stripBulkExtras("Hello {name}")).toBe("Hello {name}");
  });
});
