import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "PurchaseEntry.tsx"), "utf8");

/** Review items B3 and B9 (22 Nov 2026): saving a purchase again must not add stock twice. */
describe("Purchase Entry: saving again is safe", () => {
  it("B3: each saved group of new lines is marked before the next group is sent", () => {
    const loopStart = src.indexOf("for (let ci = 0; ci < itemsToInsert.length; ci += EDIT_CHUNK_SIZE)");
    expect(loopStart).toBeGreaterThan(0);
    const loop = src.slice(loopStart, src.indexOf("} catch (chunkErr) {", loopStart));
    const insertAt = loop.indexOf("await insertPurchaseItemsRows(chunk)");
    const markAt = loop.indexOf("editSaveInsertedTempIdsRef.current.add(entry.item.temp_id)");
    expect(insertAt).toBeGreaterThan(0);
    // The marker sits inside the loop, after the insert of that group.
    expect(markAt).toBeGreaterThan(insertAt);
  });

  it("B3: when a later group fails, the groups that saved become saved lines on screen", () => {
    const catchStart = src.indexOf("} catch (chunkErr) {");
    const block = src.slice(catchStart, src.indexOf("throw chunkErr;", catchStart));
    expect(block).toContain("setLineItems((prev) => prev.map(asSaved))");
    expect(block).toContain("setOriginalLineItems((prev) => [");
  });

  it("B9: the save lock is not opened by a timer while the save is still running", () => {
    const timerStart = src.indexOf("saveLockTimeoutRef.current = setTimeout(() => {");
    const timer = src.slice(timerStart, src.indexOf("}, SAVE_LOCK_MAX_MS);", timerStart));
    expect(timer).not.toContain("releaseSaveLock()");
    expect(timer).toContain("Do not save again");
    // The lock is released when the save ends.
    expect(src).toMatch(/await doSave\(\);[\s\S]{0,600}finally \{\s*releaseSaveLock\(\);/);
  });
});
