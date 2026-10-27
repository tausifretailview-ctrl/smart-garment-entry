import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { optOutKeyword } from "../supabase/functions/_shared/bulkOptOutKeyword";

describe("bulk WhatsApp STOP / START replies", () => {
  it.each(["Stop", "STOP", "stop.", " stop 🙏", "Stop!!", "Unsubscribe", "opt out", "pls stop", "stop sending msg", "Please stop it",
    "band karo", "Band kar do bhai", "mat bhejo", "don't send", "बंद", "बंद करो"])("%s unsubscribes", (text) => {
    expect(optOutKeyword(text)).toBe("stop");
  });

  it.each(["Start", "START", "subscribe", "start again"])("%s subscribes again", (text) => {
    expect(optOutKeyword(text)).toBe("start");
  });

  it.each(["", "Ok", "Ys", "Price?", "Don't stop", "Apne aap jayega na band nahi karo", "Reviewed on google",
    "I will stop by your shop on sunday evening with family"])("%s is a normal reply", (text) => {
    expect(optOutKeyword(text)).toBeNull();
  });

  it("wa-gateway keeps the same word lists", () => {
    const shared = readFileSync("supabase/functions/_shared/bulkOptOutKeyword.ts", "utf8");
    const gateway = readFileSync("wa-gateway/src/sessions.ts", "utf8");
    const rules = (src: string) => src.slice(src.indexOf("const STOP_EXACT"), src.indexOf("return null;\n}") );
    expect(rules(gateway)).toBe(rules(shared));
  });
});
