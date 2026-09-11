import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function src(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("erpBootstrap lazy split (PR 1)", () => {
  it("owner screens are lazyWithRetry in App.tsx, not static imports", () => {
    const app = src("src/App.tsx");
    expect(app).not.toMatch(/import\s*\{\s*OwnerSalesScreen/);
    expect(app).not.toMatch(/import\s*\{\s*OwnerPurchaseScreen/);
    expect(app).not.toMatch(/import\s*\{\s*OwnerStockScreen/);
    expect(app).not.toMatch(/import\s*\{\s*OwnerReportsHub/);
    expect(app).toContain('import("@/components/mobile/OwnerSalesScreen")');
    expect(app).toContain('import("@/components/mobile/OwnerPurchaseScreen")');
    expect(app).toContain('import("@/components/mobile/OwnerStockScreen")');
    expect(app).toContain('import("@/components/mobile/OwnerReportsHub")');
    expect(app).toContain("lazyWithRetry");
  });

  it("print preview dynamically imports InvoiceWrapper through LazyChunkGate", () => {
    const print = src("src/components/mobile/MobileSalePrintPreviewDialog.tsx");
    expect(print).not.toMatch(/import\s*\{\s*InvoiceWrapper\s*\}\s*from\s*"@\/components\/InvoiceWrapper"/);
    expect(print).toContain("LazyChunkGate");
    expect(print).toContain('import("@/components/InvoiceWrapper")');
    expect(print).toContain("Loading invoice layout");
    expect(print).toContain("Retry");
  });

  it("POSLayout / Header / DC layout do not statically import floating widgets", () => {
    for (const rel of [
      "src/components/POSLayout.tsx",
      "src/components/Header.tsx",
      "src/components/PosDeliveryChallanLayout.tsx",
    ]) {
      const text = src(rel);
      expect(text).not.toMatch(/from "@\/components\/SizeStockDialog"/);
      expect(text).not.toMatch(/from "@\/components\/FloatingPayments"/);
      expect(text).not.toMatch(/from "@\/components\/FloatingCashTally"/);
      expect(text).not.toMatch(/from "@\/components\/FloatingPOSReports"/);
    }
    const header = src("src/components/Header.tsx");
    expect(header).toContain("LazySizeStockDialog");
    expect(header).toContain("LazyFloatingStockReport");
    expect(header).toContain("LazyFloatingSaleReport");
    const pos = src("src/components/POSLayout.tsx");
    expect(pos).toContain("LazyFloatingPayments");
    expect(pos).toContain("LazyFloatingCashTally");
  });

  it("Layout shells lazy-load chat (drops dompurify from erpBootstrap)", () => {
    for (const rel of [
      "src/components/Layout.tsx",
      "src/components/FullScreenLayout.tsx",
      "src/components/DesktopAppShell.tsx",
    ]) {
      const text = src(rel);
      expect(text).not.toMatch(/from "@\/components\/AIChatbot\/FloatingChatButton"/);
      expect(text).toContain("LazyFloatingChatButton");
    }
    const widgets = src("src/components/lazyFloatingWidgets.tsx");
    expect(widgets).toContain('import("@/components/AIChatbot/FloatingChatButton")');
    expect(widgets).toContain("LazyChunkGate");
  });

  it("does not change vite manualChunks", () => {
    const vite = src("vite.config.ts");
    expect(vite).toContain('if (id.includes("recharts") || id.includes("d3-")) return "chart-vendor"');
  });

  it("OrgAuth and OrgLayout stay untouched by this split", () => {
    const orgLayout = src("src/components/OrgLayout.tsx");
    expect(orgLayout).toContain("OrgAuth");
  });
});
