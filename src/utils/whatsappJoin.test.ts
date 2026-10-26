import { describe, expect, it } from "vitest";
import {
  isJoinMessage,
  joinQrLink,
  joinWelcomeMessage,
  readJoinWelcomePoints,
} from "../../supabase/functions/_shared/whatsappJoin";

describe("counter join QR", () => {
  it("recognises JOIN only at the start", () => {
    expect(isJoinMessage("JOIN")).toBe(true);
    expect(isJoinMessage(" join KS Fashion")).toBe(true);
    expect(isJoinMessage("joined?")).toBe(false);
    expect(isJoinMessage("I want to join")).toBe(false);
    expect(isJoinMessage("")).toBe(false);
  });

  it("links the linked number with JOIN typed in", () => {
    expect(joinQrLink("919876543210")).toBe("https://wa.me/919876543210?text=JOIN");
    expect(joinQrLink("98765 43210")).toBe("https://wa.me/919876543210?text=JOIN");
    expect(joinQrLink("")).toBe("");
  });

  it("reads welcome points safely", () => {
    expect(readJoinWelcomePoints({ join_welcome_points: 50 })).toBe(50);
    expect(readJoinWelcomePoints({ join_welcome_points: -3 })).toBe(0);
    expect(readJoinWelcomePoints(null)).toBe(0);
  });

  it("welcomes once, with points only when added", () => {
    const first = joinWelcomeMessage({ shopName: "KS", customerName: "Riya", points: 50, alreadyJoined: false });
    expect(first).toContain("Welcome to KS, Riya");
    expect(first).toContain("50 welcome points");
    expect(first).toContain("STOP");
    expect(joinWelcomeMessage({ shopName: "KS", points: 0, alreadyJoined: false })).not.toContain("points");
    expect(joinWelcomeMessage({ shopName: "KS", points: 0, alreadyJoined: true })).toContain("already");
  });
});
