import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, MapPin, Route, Settings2 } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { istCalendarYmd } from "@/lib/localDayBounds";
import { cachedAreaName, coordsLabel, lookupAreaName } from "@/lib/reverseGeocode";
import { SalesmanLiveMap, type MapSalesman } from "@/components/salesman/SalesmanLiveMap";
import {
  formatHhmm,
  googleMapsPointUrl,
  googleMapsRouteUrl,
  groupTrailIntoStops,
  resolveTrackingWindow,
  shiftYmd,
  stopDurationLabel,
  type TrailPoint,
} from "@/lib/salesmanTracking";

type LiveRow = {
  user_id: string;
  employee_name: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  recorded_at: string | null;
  source: string | null;
  points_today: number;
};

/** A salesman counts as "live" when his last point is this recent. */
const LIVE_WITHIN_MS = 10 * 60_000;

const istToday = () => istCalendarYmd();
const istTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function AreaName({ lat, lng }: { lat: number; lng: number }) {
  const [name, setName] = useState<string | null>(() => cachedAreaName(lat, lng));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const hit = cachedAreaName(lat, lng);
    if (hit) {
      setName(hit);
      return;
    }
    setName(null);
    setFailed(false);
    void lookupAreaName(lat, lng).then((n) => {
      if (!alive) return;
      if (n) setName(n);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [lat, lng]);
  if (name) return <span>{name}</span>;
  if (failed) return <span className="tabular-nums">{coordsLabel(lat, lng)}</span>;
  return <span className="text-muted-foreground">Finding area…</span>;
}

async function fetchTrail(organizationId: string, userId: string, day: string): Promise<TrailPoint[]> {
  const { data, error } = await (supabase as any).rpc("get_salesman_location_trail", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_day: day,
  });
  if (error) throw error;
  return (data ?? []) as TrailPoint[];
}

function DayTrail({
  userId,
  day,
  setDay,
  points,
  isLoading,
}: {
  userId: string;
  day: string;
  setDay: (d: string) => void;
  points: TrailPoint[];
  isLoading: boolean;
}) {
  const minDay = shiftYmd(istToday(), -6);
  const stops = useMemo(() => groupTrailIntoStops(points), [points]);
  const routeUrl = googleMapsRouteUrl(stops);

  return (
    <div className="mt-3 rounded-lg border bg-slate-50 p-3" data-testid="salesman-trail">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-slate-600" htmlFor={`trail-day-${userId}`}>Day</label>
        <Input
          id={`trail-day-${userId}`}
          type="date"
          value={day}
          min={minDay}
          max={istToday()}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          className="h-8 w-40 bg-white"
        />
        {routeUrl && (
          <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
            <a href={routeUrl} target="_blank" rel="noreferrer">
              <Route className="h-3.5 w-3.5" /> Route in Google Maps
            </a>
          </Button>
        )}
      </div>
      {isLoading ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : stops.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No location on this day.</p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {stops.map((s, i) => (
            <li key={`${s.from}-${i}`} className="flex items-start gap-2 text-sm">
              <span className="w-36 shrink-0 whitespace-nowrap tabular-nums text-slate-600">
                {istTime(s.from)}{s.to !== s.from ? `–${istTime(s.to)}` : ""}
                {stopDurationLabel(s.from, s.to) ? (
                  <span className="block text-[11px] text-slate-500" data-testid="salesman-stop-duration">
                    {stopDurationLabel(s.from, s.to)}
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1 font-medium"><AreaName lat={s.lat} lng={s.lng} /></span>
              <a href={googleMapsPointUrl(s.lat, s.lng)} target="_blank" rel="noreferrer" className="shrink-0 text-primary" aria-label="Open in Google Maps">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Field Sales > Salesman Location (admins and managers): where each salesman is now, as an area
 * name with a Google Maps link, and a day's places for the last 7 days. Points are sent by the
 * Field Sales app during the work hours set in Settings > Sale.
 */
export default function SalesmanLocations() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? "";
  const { data: settingsData } = useSettings();
  const { orgNavigate } = useOrgNavigation();
  const saleSettings = (settingsData as { sale_settings?: Record<string, unknown> } | null)?.sale_settings;
  const window = resolveTrackingWindow(saleSettings);
  const hours = (saleSettings?.salesman_tracking ?? {}) as { start?: string; end?: string };
  const [openTrail, setOpenTrail] = useState<string | null>(null);
  const [trailDay, setTrailDay] = useState(istToday());

  const { data: rows = [], isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["salesman-live-locations", orgId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_salesman_live_locations", { p_organization_id: orgId });
      if (error) throw error;
      return (data ?? []) as LiveRow[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const trailIsToday = trailDay === istToday();
  const { data: trail = [], isLoading: trailLoading } = useQuery({
    queryKey: ["salesman-location-trail", orgId, openTrail, trailDay],
    queryFn: () => fetchTrail(orgId, openTrail as string, trailDay),
    enabled: !!orgId && !!openTrail,
    staleTime: 30_000,
    // Today's route follows the salesman; an old day does not change.
    refetchInterval: trailIsToday ? 60_000 : false,
  });
  const mapSalesmen = useMemo<MapSalesman[]>(
    () =>
      rows
        .filter((r) => r.lat !== null && r.lng !== null && !!r.recorded_at)
        .map((r) => ({
          user_id: r.user_id,
          employee_name: r.employee_name,
          lat: r.lat as number,
          lng: r.lng as number,
          recorded_at: r.recorded_at as string,
          live: Date.now() - Date.parse(r.recorded_at as string) <= LIVE_WITHIN_MS,
        })),
    [rows],
  );
  const pickSalesman = (userId: string) => {
    setOpenTrail(userId);
    setTrailDay(istToday());
  };

  const missingSql = !!error && /get_salesman_live_locations|could not find the function/i.test(String((error as Error).message));

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4" data-testid="salesman-locations-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><MapPin className="h-5 w-5 text-emerald-600" /> Salesman Location</h1>
          <p className="text-sm text-muted-foreground">
            {window
              ? `Shared by the Field Sales app between ${formatHhmm(hours.start || "10:00")} and ${formatHhmm(hours.end || "20:00")}. Kept 7 days.`
              : "Tracking is off. Turn it on in Settings > Sale > Salesman live location."}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => orgNavigate("/settings")}>
          <Settings2 className="h-4 w-4" /> Settings
        </Button>
      </div>

      {missingSql ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          The location SQL has not been run on this database yet (20270523120000_salesman_live_location).
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{(error as Error).message}</div>
      ) : isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Field Sales users yet. Give an employee "Field Sales access" in Employee Master.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-2 lg:self-start">
          <SalesmanLiveMap
            className="h-[55vh] min-h-[320px] w-full overflow-hidden rounded-xl border shadow-sm lg:h-[calc(100vh-11rem)]"
            salesmen={mapSalesmen}
            selectedUserId={openTrail}
            trail={openTrail ? trail : []}
            trailIsToday={trailIsToday}
            viewKey={`${openTrail ?? "all"}|${trailDay}`}
            onSelect={pickSalesman}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {openTrail
              ? `Blue line: the route${trailIsToday ? " so far (follows him every minute)" : ""}. Orange dots: places he stopped (hover for the time). Green: start.`
              : "Tap a name to see the day's route."}
          </p>
        </div>
        <ul className="space-y-2">
          {rows.map((r) => {
            const has = r.lat !== null && r.lng !== null && !!r.recorded_at;
            const live = has && Date.now() - Date.parse(r.recorded_at as string) <= LIVE_WITHIN_MS;
            return (
              <li key={r.user_id} className="rounded-xl border bg-white p-3 shadow-sm" data-testid="salesman-location-row">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", live ? "bg-emerald-500" : has ? "bg-amber-400" : "bg-slate-300")} />
                  <span className="font-semibold">{r.employee_name}</span>
                  <span className={cn("text-xs font-medium", live ? "text-emerald-700" : "text-muted-foreground")}>
                    {!has
                      ? "No location yet"
                      : live
                        ? "Live"
                        : `Last seen ${formatDistanceToNowStrict(new Date(r.recorded_at as string))} ago`}
                  </span>
                  {has && (
                    <span className="text-xs text-muted-foreground">
                      at {istTime(r.recorded_at as string)}
                      {r.accuracy_m ? ` · ±${Math.round(r.accuracy_m)} m` : ""}
                      {r.source === "foreground" ? " · app open" : ""}
                    </span>
                  )}
                </div>
                {has && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 text-[15px] font-medium" data-testid="salesman-area">
                      <AreaName lat={r.lat as number} lng={r.lng as number} />
                    </span>
                    <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
                      <a href={googleMapsPointUrl(r.lat as number, r.lng as number)} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" /> Open in Google Maps
                      </a>
                    </Button>
                  </div>
                )}
                <button
                  type="button"
                  className="mt-1.5 text-xs font-semibold text-primary hover:underline"
                  onClick={() => (openTrail === r.user_id ? setOpenTrail(null) : pickSalesman(r.user_id))}
                >
                  {openTrail === r.user_id ? "Hide day's places" : `Day's places${r.points_today ? ` (${r.points_today} points today)` : ""}`}
                </button>
                {openTrail === r.user_id && (
                  <DayTrail userId={r.user_id} day={trailDay} setDay={setTrailDay} points={trail} isLoading={trailLoading} />
                )}
              </li>
            );
          })}
        </ul>
        </div>
      )}
      {dataUpdatedAt > 0 && !error && (
        <p className="text-[11px] text-muted-foreground">Updated {istTime(new Date(dataUpdatedAt).toISOString())}; refreshes every minute.</p>
      )}
    </div>
  );
}
