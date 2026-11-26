import { describe, expect, it, vi } from "vitest";
import {
  createFieldSalesMobileLogin,
  fieldSalesLoginEmail,
  fieldSalesLoginIdToEmail,
  loginDisplayName,
  mobileFromFieldSalesLoginEmail,
  normalizeLoginMobile,
} from "./fieldSalesLogin";

describe("Field Sales login by mobile number", () => {
  it("reads a mobile number with +91, 0, spaces or dashes", () => {
    for (const raw of ["7385990258", "+91 73859 90258", "917385990258", "07385990258", "73859-90258"]) {
      expect(normalizeLoginMobile(raw), raw).toBe("7385990258");
    }
    expect(normalizeLoginMobile("12345")).toBeNull();
    expect(normalizeLoginMobile("")).toBeNull();
  });

  it("builds one login per mobile number and shop", () => {
    expect(fieldSalesLoginEmail("+91 73859 90258", "Jindal-Trading")).toBe("7385990258.jindal-trading@fieldsales.ezzy.shop");
    expect(fieldSalesLoginEmail("7385990258", "ks-footwear")).not.toBe(fieldSalesLoginEmail("7385990258", "jindal-trading"));
    expect(fieldSalesLoginEmail("", "jindal-trading")).toBeNull();
    expect(fieldSalesLoginEmail("7385990258", "")).toBeNull();
    expect(fieldSalesLoginEmail("7385990258", "bad slug@x")).toBeNull();
  });

  it("login page: a mobile number becomes the shop's login, an email stays as typed", () => {
    expect(fieldSalesLoginIdToEmail(" 7385990258 ", "jindal-trading")).toBe("7385990258.jindal-trading@fieldsales.ezzy.shop");
    expect(fieldSalesLoginIdToEmail("ravi@gmail.com", "jindal-trading")).toBe("ravi@gmail.com");
    expect(fieldSalesLoginIdToEmail("ravi", "jindal-trading")).toBe("ravi");
  });

  it("shows a mobile login as its mobile number", () => {
    expect(mobileFromFieldSalesLoginEmail("7385990258.jindal-trading@fieldsales.ezzy.shop")).toBe("7385990258");
    expect(loginDisplayName("7385990258.jindal-trading@fieldsales.ezzy.shop")).toBe("Mobile 7385990258");
    expect(loginDisplayName("ravi@gmail.com")).toBe("ravi@gmail.com");
  });

  const base = {
    supabaseUrl: "https://x.supabase.co",
    accessToken: "tok",
    organizationId: "org-1",
    orgSlug: "jindal-trading",
    mobile: "7385990258",
    password: "123456",
    existingUsers: [] as Array<{ id: string; email: string }>,
  };
  const reply = (status: number, body: unknown) =>
    vi.fn().mockResolvedValue({ ok: status < 300, status, json: async () => body }) as unknown as typeof fetch;

  it("creates the login as a shop user through create-org-user", async () => {
    const fetchImpl = reply(200, { success: true, user: { id: "u-9" } });
    const r = await createFieldSalesMobileLogin({ ...base, fetchImpl });
    expect(r).toEqual({ userId: "u-9", email: "7385990258.jindal-trading@fieldsales.ezzy.shop", existed: false });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://x.supabase.co/functions/v1/create-org-user");
    expect(JSON.parse(init.body)).toEqual({
      email: "7385990258.jindal-trading@fieldsales.ezzy.shop",
      password: "123456",
      role: "user",
      organizationId: "org-1",
    });
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("reuses a login the shop already has for the mobile number, without a password", async () => {
    const fetchImpl = reply(200, {});
    const r = await createFieldSalesMobileLogin({
      ...base,
      password: "",
      existingUsers: [{ id: "u-1", email: "7385990258.jindal-trading@fieldsales.ezzy.shop" }],
      fetchImpl,
    });
    expect(r).toEqual({ userId: "u-1", email: "7385990258.jindal-trading@fieldsales.ezzy.shop", existed: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("explains a missing mobile, short password, non-admin or existing login", async () => {
    await expect(createFieldSalesMobileLogin({ ...base, mobile: "", fetchImpl: reply(200, {}) })).rejects.toThrow(/mobile number/);
    await expect(createFieldSalesMobileLogin({ ...base, password: "123", fetchImpl: reply(200, {}) })).rejects.toThrow(/at least 6/);
    await expect(
      createFieldSalesMobileLogin({ ...base, fetchImpl: reply(403, { error: "Only organization admins can create users" }) }),
    ).rejects.toThrow("Only a shop admin can create a login.");
    await expect(
      createFieldSalesMobileLogin({ ...base, fetchImpl: reply(400, { error: "A user with this email address has already been registered" }) }),
    ).rejects.toThrow(/already exists/);
  });
});
