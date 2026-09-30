import { createECDH, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cleanVapidKey, describeVapidKeyProblem } from "./vapidKey";

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function realKeyPair() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(ecdh.getPrivateKey()) };
}

describe("describeVapidKeyProblem", () => {
  it("accepts a real Firebase-style public key (65 bytes, 87 chars)", () => {
    const { publicKey } = realKeyPair();
    expect(publicKey).toHaveLength(87);
    expect(describeVapidKeyProblem(publicKey)).toBeNull();
  });

  it("names the private key, the most common wrong value", () => {
    const { privateKey } = realKeyPair();
    expect(privateKey.length).toBeGreaterThanOrEqual(42);
    expect(describeVapidKeyProblem(privateKey)).toBe("looks_like_private_key");
  });

  it("reports wrong lengths without echoing the key", () => {
    expect(describeVapidKeyProblem(b64url(randomBytes(20)))).toBe("wrong_length_20_bytes");
  });

  it("rejects non-keys", () => {
    expect(describeVapidKeyProblem("")).toBe("empty");
    expect(describeVapidKeyProblem("not a key!")).toBe("bad_characters");
    expect(describeVapidKeyProblem(b64url(Buffer.concat([Buffer.from([0x05]), randomBytes(64)])))).toBe("not_a_public_key");
  });
});

describe("cleanVapidKey", () => {
  it("strips wrapping quotes, spaces and line breaks from a pasted value", () => {
    const { publicKey } = realKeyPair();
    const messy = `  "${publicKey.slice(0, 40)}\n${publicKey.slice(40)}"\r\n`;
    expect(cleanVapidKey(messy)).toBe(publicKey);
    expect(describeVapidKeyProblem(cleanVapidKey(messy))).toBeNull();
  });

  it("handles missing values", () => {
    expect(cleanVapidKey(undefined)).toBe("");
    expect(cleanVapidKey(null)).toBe("");
  });
});
