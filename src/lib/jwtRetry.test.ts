import { describe, expect, it, vi } from "vitest";
import { withJwtRetry } from "@/lib/jwtRetry";

const expiredError = { code: "PGRST301", message: "JWT expired", status: 401 };

describe("withJwtRetry", () => {
  it("refreshes and retries once when an expired JWT is returned", async () => {
    const operation = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: expiredError })
      .mockResolvedValueOnce({ data: { id: "variant-1" }, error: null });
    const refresh = vi.fn().mockResolvedValue({ error: null });

    await expect(withJwtRetry(operation, refresh)).resolves.toEqual({
      data: { id: "variant-1" },
      error: null,
    });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes and retries once when an expired JWT is thrown", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(expiredError)
      .mockResolvedValueOnce("found");
    const refresh = vi.fn().mockResolvedValue({ error: null });

    await expect(withJwtRetry(operation, refresh)).resolves.toBe("found");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-authentication error", async () => {
    const result = { data: null, error: { message: "network unavailable" } };
    const operation = vi.fn().mockResolvedValue(result);
    const refresh = vi.fn();

    await expect(withJwtRetry(operation, refresh)).resolves.toBe(result);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not repeat the request when session refresh fails", async () => {
    const result = { data: null, error: expiredError };
    const operation = vi.fn().mockResolvedValue(result);
    const refresh = vi.fn().mockResolvedValue({ error: new Error("refresh failed") });

    await expect(withJwtRetry(operation, refresh)).resolves.toBe(result);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("rethrows an expired JWT when refresh fails after a thrown error", async () => {
    const operation = vi.fn().mockRejectedValue(expiredError);
    const refresh = vi.fn().mockRejectedValue(new Error("refresh failed"));

    await expect(withJwtRetry(operation, refresh)).rejects.toBe(expiredError);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});