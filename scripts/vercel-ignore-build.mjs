#!/usr/bin/env node
/**
 * Vercel "Ignored Build Step" for the three Vercel projects built from this repo.
 * Vercel runs it before each build: exit 0 = skip the build, exit 1 = build.
 *
 *   node scripts/vercel-ignore-build.mjs erp          (repo root vercel.json)
 *   node ../scripts/vercel-ignore-build.mjs customer  (customer-app/vercel.json)
 *   node ../scripts/vercel-ignore-build.mjs whatsapp  (whatsapp-app/vercel.json)
 *
 * Rules:
 * - Preview builds (PR branches) are skipped. GitHub CI is the build gate. Put "[preview]" in the
 *   commit message to get a preview anyway.
 * - ERP production builds always run.
 * - Customer / WhatsApp production builds run only when a file their bundle uses changed since the
 *   last deployed commit (files found by following imports from the site's entry).
 * - Anything unknown (no previous commit, shallow clone, git error) builds.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Shared files every site's build reads, plus each site's own entry and config.
const SHARED = ["package.json", "package-lock.json", ".env", "tailwind.config.ts", "postcss.config.js", "scripts/vercel-ignore-build.mjs"];
const SITES = {
  customer: {
    entries: ["src/customer/main.tsx", "src/customer/sw.ts"],
    paths: ["customer.html", "vite.customer.config.ts", "vite.customer-sw.config.ts", "public-customer/", "customer-app/", "src/customer/"],
  },
  whatsapp: {
    entries: ["src/whatsapp-app/main.tsx"],
    paths: ["whatsapp.html", "vite.whatsapp.config.ts", "public-whatsapp/", "whatsapp-app/", "src/whatsapp-app/"],
  },
};

const BUILD = 1;
const SKIP = 0;

function done(code, why) {
  console.log(`${code === SKIP ? "Skipping build" : "Building"}: ${why}`);
  process.exit(code);
}

const site = process.argv[2];
if (site !== "erp" && !SITES[site]) done(BUILD, `unknown site "${site}"`);

const env = process.env.VERCEL_ENV;
if (env !== "production") {
  if ((process.env.VERCEL_GIT_COMMIT_MESSAGE || "").includes("[preview]")) done(BUILD, "[preview] in commit message");
  done(SKIP, `${env || "non-production"} build (GitHub CI checks PRs)`);
}
if (site === "erp") done(BUILD, "ERP production build");

const prev = process.env.VERCEL_GIT_PREVIOUS_SHA;
if (!prev) done(BUILD, "no previous deployed commit");

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

let changed;
try {
  git(["cat-file", "-e", `${prev}^{commit}`]);
  changed = git(["diff", "--name-only", prev, "HEAD"]).split("\n").filter(Boolean);
} catch {
  done(BUILD, `cannot diff against ${prev}`);
}

// Follow relative and "@/..." imports from the site's entries to find the src files it bundles.
const EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".css", "/index.ts", "/index.tsx", "/index.js"];
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith("@customer/")) base = path.join(ROOT, "src/customer", spec.slice(10));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const ext of EXTS) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}
const used = new Set();
const queue = SITES[site].entries.map((e) => path.join(ROOT, e));
while (queue.length) {
  const file = queue.pop();
  if (used.has(file) || !existsSync(file)) continue;
  used.add(file);
  for (const m of readFileSync(file, "utf8").matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
    const next = resolveImport(file, m[1]);
    if (next) queue.push(next);
  }
}
const usedRel = new Set([...used].map((f) => path.relative(ROOT, f).split(path.sep).join("/")));
const prefixes = [...SHARED, ...SITES[site].paths];

const hit = changed.find((f) => usedRel.has(f) || prefixes.some((p) => (p.endsWith("/") ? f.startsWith(p) : f === p)));
if (hit) done(BUILD, `${hit} changed`);
done(SKIP, `none of the ${changed.length} changed files are used by the ${site} site`);
