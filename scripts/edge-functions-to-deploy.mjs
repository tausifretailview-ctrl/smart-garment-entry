#!/usr/bin/env node
/**
 * Which Supabase Edge Functions a merge must deploy.
 *
 * Input: changed file paths (one per line on stdin, or as arguments).
 * Output (stdout, JSON): { deploy: string[], unpinned: string[] }
 *
 *  - A change under supabase/functions/<name>/ deploys <name>.
 *  - A change under supabase/functions/_shared/ deploys every function (they import it).
 *  - A deleted function (its folder is gone) is not deployed.
 *  - Only functions whose verify_jwt is written in supabase/config.toml are deployed.
 *    The CLI turns JWT checking ON for a function with no entry, which would break a
 *    webhook or public function that is live with it OFF. Those go to `unpinned` so
 *    the workflow can stop and say so instead of guessing.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export function pinnedFunctions(configToml) {
  const pinned = new Set();
  let current = null;
  for (const raw of configToml.split(/\r?\n/)) {
    const line = raw.trim();
    const header = /^\[functions\.([A-Za-z0-9_-]+)\]$/.exec(line);
    if (header) {
      current = header[1];
      continue;
    }
    if (line.startsWith("[")) current = null;
    if (current && /^verify_jwt\s*=\s*(true|false)\s*(#.*)?$/.test(line)) pinned.add(current);
  }
  return pinned;
}

export function planDeploy(changedPaths, existingFunctions, pinned) {
  const existing = new Set(existingFunctions);
  const wanted = new Set();
  for (const raw of changedPaths) {
    const p = String(raw).trim().replace(/^\.\//, "");
    const m = /^supabase\/functions\/([^/]+)\//.exec(p);
    if (!m) continue;
    if (m[1] === "_shared") {
      for (const name of existing) wanted.add(name);
    } else if (existing.has(m[1])) {
      wanted.add(m[1]);
    }
  }
  const sorted = [...wanted].sort();
  return {
    deploy: sorted.filter((n) => pinned.has(n)),
    unpinned: sorted.filter((n) => !pinned.has(n)),
  };
}

export function listFunctions(root) {
  const dir = path.join(root, "supabase/functions");
  return readdirSync(dir).filter(
    (n) => !n.startsWith("_") && !n.startsWith(".") && statSync(path.join(dir, n)).isDirectory() && existsSync(path.join(dir, n, "index.ts")),
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const input = args.length > 0 ? args : readFileSync(0, "utf8").split(/\r?\n/);
  const plan = planDeploy(
    input.filter(Boolean),
    listFunctions(root),
    pinnedFunctions(readFileSync(path.join(root, "supabase/config.toml"), "utf8")),
  );
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}
