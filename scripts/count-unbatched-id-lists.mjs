// Counts `.in(column, someIds)` reads whose id list is not batched. A list that grows with the
// shop's history (a customer's bills, a school's students, a period's customers) makes the URL
// too long for the gateway (~200 UUIDs is the safe size), and the server answers at most 1,000
// rows. Use fetchInIdBatches / fetchAllRows (src/lib/data/fetchInIdBatches.ts) instead.
// Used by src/lib/data/fetchInIdBatches.test.ts as a ratchet: the count may only go down.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export function findUnbatchedIdLists(root) {
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        const lines = readFileSync(p, "utf8").split("\n");
        lines.forEach((line, i) => {
          const m = line.match(/\.in\(\s*["'](\w+)["']\s*,\s*([A-Za-z_][\w.]*)\s*(?:as\s+\w+(?:\[\])?)?\s*\)/);
          if (!m || !/(Ids|IdList|IDs)$/.test(m[2])) return;
          // Batched nearby (helper, chunk / slice loop) counts as safe.
          const context = lines.slice(Math.max(0, i - 30), i + 1).join("\n");
          if (/fetchInIdBatches|chunk|slice\(|CHUNK|BATCH|batch/i.test(context)) return;
          hits.push(`${p}:${i + 1} .in(${m[1]}, ${m[2]})`);
        });
      }
    }
  };
  walk(root);
  return hits;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const hits = findUnbatchedIdLists(process.argv[2] || "src");
  console.log(hits.join("\n"));
  console.log(`unbatched id lists: ${hits.length}`);
}
