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
  const info = await getElectronWebBuildStaleInfo();
  return info.stale;
}

/**
 * Stale-build details for silent auto-update. `latest` changes when a newer
 * deploy ships while an older update is still pending — callers use it as a
 * restart token for the 2h banner ceiling.
 */
export async function getElectronWebBuildStaleInfo(): Promise<{
  stale: boolean;
  current: string | null;
  latest: string | null;
}> {
  if (!isElectronShell()) {
    return { stale: false, current: null, latest: null };
  }
  const current = getLoadedMainAsset();
  if (!current) {
    return { stale: false, current: null, latest: null };
  }
  try {
    const latest = await fetchLatestMainAsset();
    const stale = !!latest && latest !== current;
    return { stale, current, latest: latest ?? null };
  } catch {
    return { stale: false, current, latest: null };
  }
}
