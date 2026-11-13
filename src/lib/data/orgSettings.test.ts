import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import {
  ACCOUNTING_FLAG_CACHE_MS,
  clearAccountingEngineFlagCache,
  forceAccountingFlagCacheInTests,
  getAccountingEngineSettingsRow,
} from "./orgSettings";

beforeEach(() => forceAccountingFlagCacheInTests(true));
afterEach(() => {
  forceAccountingFlagCacheInTests(false);
  clearAccountingEngineFlagCache();
  vi.clearAllMocks();
});

describe("getAccountingEngineSettingsRow", () => {
  it("reads once per org and serves repeats from cache until it expires", async () => {
    maybeSingle.mockResolvedValue({ data: { accounting_engine_enabled: false }, error: null });
    let t = 1_000;
    const now = () => t;
    expect(await getAccountingEngineSettingsRow("org-1", supabase, now)).toEqual({ accounting_engine_enabled: false });
    expect(await getAccountingEngineSettingsRow("org-1", supabase, now)).toEqual({ accounting_engine_enabled: false });
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    t += ACCOUNTING_FLAG_CACHE_MS + 1;
    await getAccountingEngineSettingsRow("org-1", supabase, now);
    expect(maybeSingle).toHaveBeenCalledTimes(2);
    await getAccountingEngineSettingsRow("org-2", supabase, now);
    expect(maybeSingle).toHaveBeenCalledTimes(3);
  });

  it("concurrent callers share one request", async () => {
    let resolve!: (v: unknown) => void;
    maybeSingle.mockReturnValue(new Promise((r) => (resolve = r)));
    const a = getAccountingEngineSettingsRow("org-1");
    const b = getAccountingEngineSettingsRow("org-1");
    resolve({ data: { accounting_engine_enabled: true }, error: null });
    expect(await a).toEqual({ accounting_engine_enabled: true });
    expect(await b).toEqual({ accounting_engine_enabled: true });
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("a failed read returns null (treated as on) and is not cached", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "timeout" } });
    expect(await getAccountingEngineSettingsRow("org-1")).toBeNull();
    maybeSingle.mockResolvedValueOnce({ data: { accounting_engine_enabled: false }, error: null });
    expect(await getAccountingEngineSettingsRow("org-1")).toEqual({ accounting_engine_enabled: false });
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });

  it("another client (tests, edge helpers) always reads directly", async () => {
    const other = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { accounting_engine_enabled: true }, error: null }) }) }) }) };
    expect(await getAccountingEngineSettingsRow("org-1", other)).toEqual({ accounting_engine_enabled: true });
    expect(maybeSingle).not.toHaveBeenCalled();
  });
});
