import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * The root tsconfig.json is references-only ("files": []), so `tsc --noEmit`
 * against it compiles ZERO files and exits 0 on any type error. CI ran exactly
 * that for its "Typecheck" step, and `vite build` does not typecheck either
 * (esbuild strips types), so nothing was checking types at all. A deliberate
 * canary (`const canary: number = "nope"`) passed CI's command and failed
 * `tsc -b`. These tests keep the working form wired up.
 */
describe("typecheck is actually a typecheck", () => {
  it("root tsconfig is references-only, so a bare tsc --noEmit is a no-op", async () => {
    const raw = await readFile(path.join(ROOT, "tsconfig.json"), "utf8");
    const cfg = JSON.parse(raw) as { files?: unknown[]; references?: unknown[] };
    // If this ever stops being true the guard below can be relaxed — but until
    // then, a bare `tsc --noEmit` must never be treated as verification.
    expect(cfg.files).toEqual([]);
    expect(Array.isArray(cfg.references)).toBe(true);
    expect((cfg.references ?? []).length).toBeGreaterThan(0);
  });

  it("exposes a typecheck script that follows project references", async () => {
    const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.typecheck).toBeDefined();
    expect(pkg.scripts.typecheck).toMatch(/tsc\s+-b\b/);
    expect(pkg.scripts.typecheck).not.toMatch(/tsc\s+--noEmit\s*$/);
  });

  it("CI runs the real typecheck, not the no-op form", async () => {
    const ci = await readFile(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
    const runLines = ci
      .split("\n")
      .filter((l) => l.trim().startsWith("run:"))
      .map((l) => l.trim());

    expect(runLines.some((l) => /npm run typecheck/.test(l))).toBe(true);
    // The exact command that silently passed everything.
    expect(runLines.some((l) => /npx\s+tsc\s+--noEmit\s*$/.test(l))).toBe(false);
  });
});
