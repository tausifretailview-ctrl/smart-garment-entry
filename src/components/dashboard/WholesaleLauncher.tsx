import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Barcode,
  BookOpenText,
  Boxes,
  CalendarRange,
  ChartColumnBig,
  ChartPie,
  ClipboardCheck,
  ClipboardList,
  ClipboardPen,
  Clock,
  Container,
  Factory,
  FilePenLine,
  FilePlus2,
  HandCoins,
  Landmark,
  PackageMinus,
  PackageOpen,
  PackagePlus,
  Receipt,
  Route,
  ScanBarcode,
  Search,
  Settings,
  ShoppingBag,
  Star,
  Truck,
  Undo2,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { prefetchTabPage } from "@/lib/tabPageRegistry";
import { cn } from "@/lib/utils";
import {
  LAUNCHER_FAVOURITES_KEY,
  LAUNCHER_GROUPS,
  LAUNCHER_RECENTS_KEY,
  greetingFor,
  parseLauncherPathList,
  pushRecent,
  searchLauncherTiles,
  toggleFavourite,
  visibleLauncherTiles,
  type LauncherTile,
} from "@/lib/wholesaleLauncher";
import "./wholesale-launcher.css";

const ICONS: Record<string, LucideIcon> = {
  Banknote,
  Barcode,
  BookOpenText,
  Boxes,
  CalendarRange,
  ChartColumnBig,
  ChartPie,
  ClipboardCheck,
  ClipboardList,
  ClipboardPen,
  Container,
  Factory,
  FilePenLine,
  FilePlus2,
  HandCoins,
  Landmark,
  PackageMinus,
  PackageOpen,
  PackagePlus,
  Receipt,
  Route,
  ScanBarcode,
  Settings,
  ShoppingBag,
  Truck,
  Undo2,
  Users,
  Wallet,
  Warehouse,
};

function readList(key: string): string[] {
  try {
    return parseLauncherPathList(window.localStorage.getItem(key));
  } catch {
    return [];
  }
}
function writeList(key: string, list: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage blocked — favourites / recents last for this visit only */
  }
}

function Glyph({ tile, size = "lg" }: { tile: LauncherTile; size?: "lg" | "sm" }) {
  const Icon = ICONS[tile.icon] ?? Boxes;
  return (
    <span
      className={cn(
        "wl-glyph relative flex items-center justify-center text-white",
        size === "lg" ? "h-[60px] w-[60px] rounded-[18px] sm:h-[68px] sm:w-[68px]" : "h-8 w-8 rounded-[10px]",
      )}
      style={{ "--wl-from": tile.from, "--wl-to": tile.to } as React.CSSProperties}
      aria-hidden="true"
    >
      <Icon className={size === "lg" ? "h-7 w-7 sm:h-8 sm:w-8" : "h-4 w-4"} strokeWidth={2} />
    </span>
  );
}

/**
 * Wholesale Dashboard: the main pages as app icons, grouped (Sales, Purchase, Inventory…),
 * with search ("/" to focus, Enter to open), favourites (star) and recently opened pages.
 * Only pages the user's rights open are shown. Settings → Company → Home page switches it on.
 */
export function WholesaleLauncher() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const { isAdmin, hasMenuAccess, permissions, loading } = useUserPermissions();
  const [query, setQuery] = useState("");
  const [favourites, setFavourites] = useState<string[]>(() => readList(LAUNCHER_FAVOURITES_KEY));
  const [recents, setRecents] = useState<string[]>(() => readList(LAUNCHER_RECENTS_KEY));
  const searchRef = useRef<HTMLInputElement | null>(null);
  const now = useMemo(() => new Date(), []);

  const tiles = useMemo(
    () => visibleLauncherTiles(hasMenuAccess, isAdmin || permissions === null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rights object identity changes with permissions
    [isAdmin, permissions],
  );
  const byPath = useMemo(() => new Map(tiles.map((t) => [t.path, t])), [tiles]);
  const results = useMemo(() => searchLauncherTiles(tiles, query), [tiles, query]);
  const favouriteTiles = favourites.map((p) => byPath.get(p)).filter((t): t is LauncherTile => !!t);
  const recentTiles = recents.map((p) => byPath.get(p)).filter((t): t is LauncherTile => !!t);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const open = (tile: LauncherTile) => {
    const next = pushRecent(recents, tile.path);
    setRecents(next);
    writeList(LAUNCHER_RECENTS_KEY, next);
    orgNavigate(`/${tile.path}`);
  };
  const star = (tile: LauncherTile) => {
    const next = toggleFavourite(favourites, tile.path);
    setFavourites(next);
    writeList(LAUNCHER_FAVOURITES_KEY, next);
  };

  const tileButton = (tile: LauncherTile, index: number) => {
    const fav = favourites.includes(tile.path);
    return (
      <div key={tile.path} className="wl-tile group relative" style={{ "--wl-i": index } as React.CSSProperties}>
        <button
          type="button"
          className="flex w-full flex-col items-center gap-2 rounded-2xl px-1 py-3 outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          onClick={() => open(tile)}
          onMouseEnter={() => prefetchTabPage(tile.path, { intent: true })}
          onFocus={() => prefetchTabPage(tile.path, { intent: true })}
        >
          <Glyph tile={tile} />
          <span className="line-clamp-2 text-center text-[13px] font-medium leading-tight text-slate-700">{tile.label}</span>
        </button>
        <button
          type="button"
          className={cn(
            "absolute right-1 top-1 rounded-full p-1 transition-opacity",
            fav ? "text-amber-500 opacity-100" : "text-slate-400 opacity-0 hover:text-amber-500 group-hover:opacity-100 focus:opacity-100",
          )}
          aria-label={fav ? `Remove ${tile.label} from favourites` : `Add ${tile.label} to favourites`}
          aria-pressed={fav}
          onClick={() => star(tile)}
        >
          <Star className="h-3.5 w-3.5" fill={fav ? "currentColor" : "none"} />
        </button>
      </div>
    );
  };

  const grid = "grid grid-cols-3 gap-x-2 gap-y-1 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8";
  let i = 0;

  return (
    <div className="wl-root h-full min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-violet-600">
              {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {greetingFor(now)}
              {currentOrganization?.name ? (
                <span className="text-slate-500">, {currentOrganization.name}</span>
              ) : null}
            </h1>
          </div>
          <label className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) open(results[0]);
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Find a page…"
              aria-label="Find a page"
              className="no-uppercase h-11 w-full rounded-xl border border-slate-200 bg-white/80 pl-9 pr-10 text-sm shadow-sm outline-none backdrop-blur placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 text-[11px] text-slate-500">
              /
            </kbd>
          </label>
        </div>

        {loading && tiles.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">Loading…</p>
        ) : query.trim() ? (
          <section aria-label="Search results">
            {results.length > 0 ? (
              <div className={grid}>{results.map((t) => tileButton(t, i++))}</div>
            ) : (
              <p className="py-16 text-center text-sm text-slate-500">No page matches “{query.trim()}”.</p>
            )}
          </section>
        ) : (
          <div className="space-y-6">
            {recentTiles.length > 0 ? (
              <section aria-label="Recently opened" className="flex flex-wrap items-center gap-2">
                <span className="mr-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Clock className="h-3.5 w-3.5" /> Recent
                </span>
                {recentTiles.map((t) => (
                  <button
                    key={t.path}
                    type="button"
                    onClick={() => open(t)}
                    onMouseEnter={() => prefetchTabPage(t.path, { intent: true })}
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 py-1 pl-1 pr-3 text-sm text-slate-700 shadow-sm transition hover:border-violet-300 hover:bg-white"
                  >
                    <Glyph tile={t} size="sm" />
                    {t.label}
                  </button>
                ))}
              </section>
            ) : null}

            {favouriteTiles.length > 0 ? (
              <section aria-label="Favourites" className="rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-50/80 to-white/60 p-3 sm:p-4">
                <h2 className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-amber-700">
                  <Star className="h-3.5 w-3.5" fill="currentColor" /> Favourites
                </h2>
                <div className={grid}>{favouriteTiles.map((t) => tileButton(t, i++))}</div>
              </section>
            ) : null}

            {LAUNCHER_GROUPS.map((group) => {
              const inGroup = tiles.filter((t) => t.group === group);
              if (inGroup.length === 0) return null;
              return (
                <section key={group} aria-label={group}>
                  <h2 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{group}</h2>
                  <div className={grid}>{inGroup.map((t) => tileButton(t, i++))}</div>
                </section>
              );
            })}

            {tiles.length > 0 && favouriteTiles.length === 0 ? (
              <p className="text-center text-xs text-slate-400">
                Tip: hover a page and tap the ☆ to pin it to the top. Press / to search.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
