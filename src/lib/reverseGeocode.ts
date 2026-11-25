/**
 * Area name for a map point ("Dadar West, Mumbai") for the Salesman Location screen, from
 * OpenStreetMap's Nominatim. Its usage policy allows at most one request per second and asks
 * for results to be cached: requests here run one at a time, 1.1 s apart, and answers are kept
 * on this device per ~100 m square. Falls back to the coordinates when it cannot answer.
 */
const CACHE_KEY = "ezzy_area_name_cache_v1";
const MAX_CACHE = 500;
const GAP_MS = 1_100;

type NominatimAddress = Partial<Record<
  "suburb" | "neighbourhood" | "quarter" | "city_district" | "residential" | "village" | "town" | "city" | "county" | "state_district" | "state" | "road",
  string
>>;

/** Short area label from a Nominatim address: locality, then town / city. */
export function areaLabelFromAddress(address: NominatimAddress | null | undefined): string | null {
  if (!address) return null;
  const local = address.suburb || address.neighbourhood || address.quarter || address.residential || address.city_district || address.road;
  const town = address.city || address.town || address.village || address.county || address.state_district;
  const parts = [local, town].filter((p, i, all): p is string => !!p && all.indexOf(p) === i);
  if (parts.length === 0) return address.state || null;
  return parts.join(", ");
}

export const coordsLabel = (lat: number, lng: number) => `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
const cacheKeyFor = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

function readCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function writeCache(cache: Record<string, string>) {
  try {
    const keys = Object.keys(cache);
    if (keys.length > MAX_CACHE) for (const k of keys.slice(0, keys.length - MAX_CACHE)) delete cache[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

export function cachedAreaName(lat: number, lng: number): string | null {
  return readCache()[cacheKeyFor(lat, lng)] ?? null;
}

let chain: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;
const inFlight = new Map<string, Promise<string | null>>();

/** Area name, or null when the service did not answer (show the coordinates instead). */
export function lookupAreaName(lat: number, lng: number): Promise<string | null> {
  const key = cacheKeyFor(lat, lng);
  const cached = readCache()[key];
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const run = async (): Promise<string | null> => {
    const wait = lastRequestAt + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=en&lat=${lat}&lon=${lng}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const body = (await res.json()) as { address?: NominatimAddress };
      const label = areaLabelFromAddress(body.address);
      if (label) {
        const cache = readCache();
        cache[key] = label;
        writeCache(cache);
      }
      return label;
    } catch {
      return null;
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  inFlight.set(key, p);
  void p.finally(() => inFlight.delete(key));
  return p;
}
