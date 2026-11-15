// Counts statements that start with `await supabase…` (result not assigned) and write to a
// table (insert / update / delete / upsert): their error is never looked at, so a failed save
// looks like success. Used by src/lib/data/uncheckedWrites.test.ts as a ratchet.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export function findUncheckedWrites(root) {
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        const lines = readFileSync(p, "utf8").split("\n");
        lines.forEach((line, i) => {
          const s = line.trim();
          if (!/^await (supabase|sb|client|db)\b/.test(s) || /=\s*await/.test(line)) return;
          const block = lines.slice(i, i + 5).map((l) => l.trim()).join(" ");
          const m = block.match(/\.from\(['"](\w+)['"]\)\s*\.(insert|update|delete|upsert)\(/);
          if (m) hits.push(`${p}:${i + 1} ${m[2]} ${m[1]}`);
        });
      }
    }
  };
  walk(root);
  return hits;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const hits = findUncheckedWrites(process.argv[2] || "src");
  console.log(hits.join("\n"));
  console.log(`unchecked writes: ${hits.length}`);
}
