// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { op: string; args: unknown[] };
const db = vi.hoisted(() => ({
  calls: [] as Call[],
  // what the next awaited query resolves to, in order
  results: [] as { data: unknown; error: unknown }[],
}));
vi.mock("@/integrations/supabase/client", () => {
  const make = () => {
    const b: Record<string, unknown> = {};
    for (const op of ["select", "update", "delete", "eq", "in", "order"]) {
      b[op] = (...args: unknown[]) => {
        db.calls.push({ op, args });
        return b;
      };
    }
    b.maybeSingle = () => {
      db.calls.push({ op: "maybeSingle", args: [] });
      return b;
    };
    b.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(db.results.shift() ?? { data: null, error: null }).then(resolve, reject);
    return b;
  };
  return { supabase: { from: (t: string) => (db.calls.push({ op: "from", args: [t] }), make()) } };
});

import {
  clearDefaultPrinterPresetsForMode,
  deletePrinterPreset,
  fetchPrinterPresets,
  savePrecisionLabelConfigToSettings,
  setDefaultPrinterPreset,
  syncDefaultLabelDesignToSettings,
} from "@/lib/data/printerPresets";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Plan Phase 4, D6 + S4: printer preset reads and default switching in one place. */
describe("printer presets data module", () => {
  beforeEach(() => {
    db.calls = [];
    db.results = [];
  });

  it("maps rows into label-screen presets, A→Z", async () => {
    db.results.push({
      data: [{ id: "p1", name: "50x25", x_offset: "1", y_offset: "2", v_gap: "3", label_width: "50", label_height: "25", is_default: true, thermal_cols: 2 }],
      error: null,
    });
    const [p] = await fetchPrinterPresets("org-1");
    expect(p).toMatchObject({ id: "p1", name: "50x25", xOffset: 1, width: 50, height: 25, isDefault: true, thermalCols: 2 });
    expect(db.calls).toContainEqual({ op: "order", args: ["name"] });
  });

  it("clears only the current defaults of that print mode, inside the shop", async () => {
    db.results.push({
      data: [
        { id: "a", name: "A", print_mode: "thermal2up", thermal_cols: 2 },
        { id: "b", name: "B", print_mode: "thermal", thermal_cols: 1 },
      ],
      error: null,
    });
    db.results.push({ data: null, error: null });
    await clearDefaultPrinterPresetsForMode("org-1", "thermal2up");
    expect(db.calls).toContainEqual({ op: "update", args: [{ is_default: false }] });
    expect(db.calls).toContainEqual({ op: "in", args: ["id", ["a"]] });
    expect(db.calls.filter((c) => c.op === "eq" && c.args[0] === "organization_id")).toHaveLength(2);
  });

  it("set default reports a preset that is gone, and throws on errors", async () => {
    db.results.push({ data: [], error: null }); // nothing to clear
    db.results.push({ data: null, error: null }); // update matched no row
    expect(await setDefaultPrinterPreset("org-1", "p9", "thermal")).toBe(false);
    db.results.push({ data: null, error: { message: "denied" } });
    await expect(clearDefaultPrinterPresetsForMode("org-1", "thermal")).rejects.toMatchObject({ message: "denied" });
  });

  it("delete is scoped to the shop", async () => {
    await deletePrinterPreset("org-1", "p1");
    expect(db.calls).toContainEqual({ op: "eq", args: ["organization_id", "org-1"] });
  });

  it("mirrors a default into Settings keeping other barcode settings, and throws on a failed write", async () => {
    db.results.push({ data: { id: "set-1", bill_barcode_settings: { logo_url: "x.png" } }, error: null });
    db.results.push({ data: null, error: null });
    expect(await syncDefaultLabelDesignToSettings("org-1", "p1", "thermal2up")).toBe(true);
    expect(db.calls).toContainEqual({
      op: "update",
      args: [{ bill_barcode_settings: {
        logo_url: "x.png",
        barcode_default_print_tab: "precision_2up",
        default_thermal_landing: "thermal2up",
        default_precision_preset_id: "p1",
        precision_print_mode: "thermal2up",
      } }],
    });

    db.results.push({ data: { id: "set-1", bill_barcode_settings: {} }, error: null });
    db.results.push({ data: null, error: { message: "denied" } });
    await expect(syncDefaultLabelDesignToSettings("org-1", "p1", "thermal")).rejects.toMatchObject({ message: "denied" });

    db.results.push({ data: null, error: null }); // shop without a settings row
    expect(await syncDefaultLabelDesignToSettings("org-1", "p1", "thermal")).toBe(false);
  });

  it("saves the precision design into Settings, keeping other barcode settings", async () => {
    db.results.push({ data: { bill_barcode_settings: { logo_url: "x.png", default_thermal_landing: "thermal" } }, error: null });
    db.results.push({ data: null, error: null });
    await savePrecisionLabelConfigToSettings("org-1", { fieldOrder: ["barcode"] });
    expect(db.calls).toContainEqual({
      op: "update",
      args: [{ bill_barcode_settings: { logo_url: "x.png", default_thermal_landing: "thermal", precision_label_config: { fieldOrder: ["barcode"] } } }],
    });
    db.results.push({ data: null, error: { message: "denied" } });
    await expect(savePrecisionLabelConfigToSettings("org-1", {})).rejects.toMatchObject({ message: "denied" });
  });

  it("Barcode Printing reads settings from the shared copy, not its own query", () => {
    const page = readFileSync(join(root, "src/pages/BarcodePrinting.tsx"), "utf8");
    expect(page).not.toMatch(/\.from\(\s*["']settings["']\s*\)/);
    expect(page).toContain("getOrgSettingsRow(queryClient, currentOrganization.id)");
  });

  it("Barcode Printing and Settings no longer query printer_presets themselves", () => {
    for (const page of ["src/pages/BarcodePrinting.tsx"]) {
      expect(readFileSync(join(root, page), "utf8")).not.toMatch(/\.from\(\s*["']printer_presets["']\s*\)/);
    }
    // Settings keeps only the cross-shop import (reads other shops' presets) and its insert.
    const settings = readFileSync(join(root, "src/pages/Settings.tsx"), "utf8");
    expect((settings.match(/\.from\(\s*["']printer_presets["']\s*\)/g) || []).length).toBeLessThanOrEqual(2);
  });
});
