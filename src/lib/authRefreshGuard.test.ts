import { describe, expect, it, vi } from "vitest";
import {
  decideAuthRefresh,
  fetchWithAuthRateLimitRetry,
  isAuthRateLimitError,
  isAuthTokenRefreshUrl,
  parseAuthTokenBody,
  readRequestRefreshToken,
  tokenBodyForClient,
} from "./authRefreshGuard";

describe("auth refresh guard", () => {
  it("recognises the Supabase refresh-token request", () => {
    expect(
      isAuthTokenRefreshUrl("https://example.supabase.co/auth/v1/token?grant_type=refresh_token"),
    ).toBe(true);
    expect(isAuthTokenRefreshUrl("https://example.supabase.co/auth/v1/token?grant_type=password")).toBe(
      false,
    );
  });

  it("reads the refresh token the client is about to replay", () => {
    expect(readRequestRefreshToken(JSON.stringify({ refresh_token: "old-token" }))).toBe("old-token");
    expect(readRequestRefreshToken(undefined)).toBeUndefined();
  });

  it("adopts the rotated session instead of replaying a used refresh token", () => {
    const decision = decideAuthRefresh({
      requestRefreshToken: "old-token",
      latest: {
        access_token: "new-access",
        refresh_token: "new-token",
        expires_at: 1_800_000_000,
        user: { id: "4ba2ad0a-2e5b-4f6d-a703-a3e40b5073e4" },
      },
    });
    expect("adopt" in decision).toBe(true);
    if ("adopt" in decision) {
      expect(decision.adopt.refresh_token).toBe("new-token");
      expect(decision.adopt.expires_in).toBeGreaterThan(0);
    }
  });

  it("still refreshes when this tab holds the current refresh token", () => {
    expect(
      decideAuthRefresh({
        requestRefreshToken: "current",
        latest: { access_token: "a", refresh_token: "current" },
      }),
    ).toEqual({ fetch: true });
  });

  it("retries HTTP 429 and returns the later success", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "ok" }), { status: 200 }));

    const response = await fetchWithAuthRateLimitRetry(run, {
      maxAttempts: 3,
      sleep: async () => undefined,
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ access_token: "ok" });
  });

  it("does not treat a normal auth error as a rate limit", () => {
    expect(isAuthRateLimitError({ status: 400, message: "Invalid Refresh Token" })).toBe(false);
    expect(isAuthRateLimitError({ status: 429, message: "Too many requests" })).toBe(true);
  });

  it("keeps expires_in on a stored token body", () => {
    const parsed = parseAuthTokenBody(
      JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: 2_000 }),
    );
    expect(tokenBodyForClient(parsed!, 1_000).expires_in).toBe(1_000);
  });
});
