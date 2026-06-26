import { isElectronShell } from "@/lib/electronShell";

/** Main JS bundle path from index.html (e.g. /assets/index-abc123.js). */
export function getLoadedMainAsset(): string | null {
  const scripts = Array.from(document.querySelectorAll("script[src]"));
  for (let i = scripts.length - 1; i >= 0; i--) {
    const src = scripts[i].getAttribute("src") || "";
    if (src.includes("/assets/index-") && src.endsWith(".js")) {
      return src.startsWith("/") ? src : new URL(src, window.location.origin).pathname;
    }
  }
  return null;
}

async function fetchLatestMainAsset(): Promise<string | null> {
  const res = await fetch(`${window.location.origin}/index.html?_=${Date.now()}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const match = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  return match?.[1] ?? null;
}

/** True when the server has a newer web build than the JS bundle currently running. */
export async function isElectronWebBuildStale(): Promise<boolean> {
  if (!isElectronShell()) return false;
  const current = getLoadedMainAsset();
  if (!current) return false;
  try {
    const latest = await fetchLatestMainAsset();
    return !!latest && latest !== current;
  } catch {
    return false;
  }
}
