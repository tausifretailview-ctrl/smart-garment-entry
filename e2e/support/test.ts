import { test as base, expect } from "@playwright/test";
import { MockBackend } from "./mockBackend";

/**
 * `test` with a `backend` fixture: a fresh MockBackend installed on the page and a signed-in
 * cashier. After each test it checks that nothing tried to reach a real backend.
 */
export const test = base.extend<{ backend: MockBackend }>({
  backend: async ({ page, baseURL }, provide) => {
    const backend = new MockBackend();
    await backend.install(page, baseURL ?? "http://127.0.0.1");
    await provide(backend);
    expect(backend.blocked.filter((host) => /supabase/i.test(host)), "requests to a real Supabase").toEqual([]);
  },
});

export { expect };
