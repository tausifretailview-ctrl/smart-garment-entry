/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/OrganizationContext", () => ({ useOrganization: () => ({ currentOrganization: { id: "org-1" } }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    delete: () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    upsert: () => Promise.resolve({ error: null }),
    then: (r: any) => Promise.resolve({ error: null }).then(r),
  };
  return { supabase: { from: () => chain } };
});

import { draftResumeKey, isExplicitEntryOpen, useDraftSave, useResumeEntryOnReturn } from "./useDraftSave";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const KEY = draftResumeKey("org-1", "user-1", "sale_invoice");

function Entry({ data, onApply, explicit = false }: { data: any; onApply?: (d: any) => void; explicit?: boolean }) {
  const { updateCurrentData, takeResumeCopy, deleteDraft } = useDraftSave("sale_invoice");
  useResumeEntryOnReturn(takeResumeCopy, onApply ?? (() => {}), explicit);
  React.useEffect(() => updateCurrentData(data), [data, updateCurrentData]);
  (window as any).__deleteDraft = deleteDraft;
  return null;
}

describe("entry pages keep the unsaved bill when the user switches window", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("keeps the bill on leaving and puts it back once on return", async () => {
    const host = document.createElement("div");
    let root = createRoot(host);
    const bill = { selectedCustomerId: "cust-1", lineItems: [{ productId: "p1", quantity: 2 }] };
    await act(async () => root.render(<Entry data={bill} />));
    act(() => root.unmount()); // switch to another window
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual(bill);

    const apply = vi.fn();
    root = createRoot(host);
    await act(async () => root.render(<Entry data={null} onApply={apply} />));
    expect(apply).toHaveBeenCalledWith(bill);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    act(() => root.unmount());
  });

  it("keeps nothing when the bill is empty or was saved / discarded", async () => {
    const host = document.createElement("div");
    let root = createRoot(host);
    await act(async () => root.render(<Entry data={null} />));
    act(() => root.unmount());
    expect(sessionStorage.getItem(KEY)).toBeNull();

    root = createRoot(host);
    await act(async () => root.render(<Entry data={{ lineItems: [{ productId: "p1" }] }} />));
    await act(async () => {
      await (window as any).__deleteDraft(); // bill saved or "New Bill"
    });
    act(() => root.unmount());
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("an explicit open (resume a draft, edit, duplicate) drops the kept copy instead", async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ lineItems: [{ productId: "p1" }] }));
    const apply = vi.fn();
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<Entry data={null} onApply={apply} explicit />));
    expect(apply).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(KEY)).toBeNull();
    act(() => root.unmount());
  });

  it("tells an explicit open from a plain window switch", () => {
    expect(isExplicitEntryOpen(null, "")).toBe(false);
    expect(isExplicitEntryOpen({}, "")).toBe(false);
    expect(isExplicitEntryOpen({ loadDraft: true }, "")).toBe(true);
    expect(isExplicitEntryOpen({ editInvoiceId: "x" }, "")).toBe(true);
    expect(isExplicitEntryOpen(null, "?id=abc")).toBe(true);
    expect(isExplicitEntryOpen(null, "?tab=lines")).toBe(false);
  });

  it("is used by Sale Invoice, Quotation, Sale Order and Purchase Return", () => {
    for (const page of ["SalesInvoice", "QuotationEntry", "SaleOrderEntry", "PurchaseReturnEntry"]) {
      const src = readFileSync(join(process.cwd(), `src/pages/${page}.tsx`), "utf8");
      expect(src, page).toContain(
        "useResumeEntryOnReturn(takeResumeCopy, loadDraftData, isExplicitEntryOpen(location.state, location.search));",
      );
    }
  });
});
