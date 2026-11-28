import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { groupTrailIntoStops, stopDurationLabel, type TrailPoint } from "@/lib/salesmanTracking";

/**
 * Salesman Location map (Nov 2026), like a delivery app's live tracking: every salesman's last
 * position as a name pin, and for the salesman picked, the day's route — the line he took, a
 * dot at each place he stopped (time there on hover / tap), the start, and where he is now.
 * Today's route follows him as new points arrive (the page reloads every minute).
 * Map: OpenStreetMap tiles through Leaflet (no key, no account).
 */
export type MapSalesman = {
  user_id: string;
  employee_name: string;
  lat: number;
  lng: number;
  recorded_at: string;
  live: boolean;
};

const istTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

function namePin(s: MapSalesman, selected: boolean): L.DivIcon {
  const dot = s.live ? "#10b981" : "#f59e0b";
  const html = `<div data-testid="map-salesman" data-user="${esc(s.user_id)}" style="display:inline-flex;width:max-content;align-items:center;gap:4px;transform:translate(-50%,calc(-100% - 10px));white-space:nowrap;padding:3px 8px 3px 6px;border-radius:999px;background:${selected ? "#1d4ed8" : "#fff"};color:${selected ? "#fff" : "#111827"};box-shadow:0 1px 4px rgba(0,0,0,.35);font:600 12px/1.2 Inter,system-ui,sans-serif;cursor:pointer"><span style="width:9px;height:9px;border-radius:50%;background:${dot};border:2px solid #fff;box-sizing:content-box"></span>${esc(s.employee_name)}</div>`;
  return L.divIcon({ html, className: "", iconSize: [0, 0] });
}

/** The moving "you are here" marker for the salesman being followed. */
const riderIcon = L.divIcon({
  html: `<div data-testid="map-rider" class="ezzy-rider"><span></span></div>`,
  className: "",
  iconSize: [0, 0],
});

const startIcon = L.divIcon({
  html: `<div style="transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:#16a34a;border:3px solid #fff;box-shadow:0 0 0 1px #16a34a"></div>`,
  className: "",
  iconSize: [0, 0],
});

const RIDER_CSS = `
.ezzy-rider{position:relative;transform:translate(-50%,-50%);width:18px;height:18px}
.ezzy-rider span{position:absolute;inset:0;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)}
.ezzy-rider::before{content:"";position:absolute;inset:-10px;border-radius:50%;background:rgba(37,99,235,.25);animation:ezzy-pulse 1.8s ease-out infinite}
@keyframes ezzy-pulse{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.4);opacity:0}}
`;

function fitTo(map: L.Map, pts: L.LatLng[]) {
  if (pts.length === 1) map.setView(pts[0], 16);
  else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17 });
}

/** Glide a marker to its new position (about 1 s), like a delivery app. */
function glide(marker: L.Marker, to: L.LatLng) {
  const from = marker.getLatLng();
  if (from.distanceTo(to) < 1) return;
  const start = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - start) / 1000);
    marker.setLatLng([from.lat + (to.lat - from.lat) * k, from.lng + (to.lng - from.lng) * k]);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function SalesmanLiveMap({
  salesmen,
  selectedUserId,
  trail,
  trailIsToday,
  viewKey,
  onSelect,
  className,
}: {
  salesmen: readonly MapSalesman[];
  selectedUserId: string | null;
  /** The selected salesman's points for the day being looked at, in time order. */
  trail: readonly TrailPoint[];
  trailIsToday: boolean;
  /** Changes when another salesman or day is picked: the map zooms to fit once per key. */
  viewKey: string;
  onSelect: (userId: string) => void;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pinsRef = useRef<L.LayerGroup | null>(null);
  const trailRef = useRef<L.LayerGroup | null>(null);
  const riderRef = useRef<L.Marker | null>(null);
  const riderKeyRef = useRef<string>("");
  const fittedKeyRef = useRef<string>("");
  /** What the map was last zoomed to fit, so a resize can fit it again. */
  const fitTargetRef = useRef<L.LatLng[] | null>(null);
  /** The user dragged or zoomed: leave the view alone from then on. */
  const userMovedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Map once.
  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    if (!document.getElementById("ezzy-rider-css")) {
      const style = document.createElement("style");
      style.id = "ezzy-rider-css";
      style.textContent = RIDER_CSS;
      document.head.appendChild(style);
    }
    const map = L.map(boxRef.current, { zoomControl: true, attributionControl: true }).setView([20.6, 78.9], 5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(map);
    pinsRef.current = L.layerGroup().addTo(map);
    trailRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.on("dragstart", () => {
      userMovedRef.current = true;
    });
    const box = boxRef.current;
    const onWheel = () => {
      userMovedRef.current = true;
    };
    box.addEventListener("wheel", onWheel, { passive: true });
    // The box can change size (sidebar, window, a window tab shown after it was drawn hidden):
    // keep the tiles filling it, and fit the pins / route again until the user moves the map.
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      const target = fitTargetRef.current;
      if (target && !userMovedRef.current && box.clientHeight > 0) fitTo(map, target);
    });
    ro.observe(box);
    return () => {
      ro.disconnect();
      box.removeEventListener("wheel", onWheel);
      map.remove();
      mapRef.current = null;
      riderRef.current = null;
    };
  }, []);

  // Name pins for everyone (the followed salesman gets the moving dot instead when on today's route).
  useEffect(() => {
    const pins = pinsRef.current;
    if (!pins) return;
    pins.clearLayers();
    for (const s of salesmen) {
      const selected = s.user_id === selectedUserId;
      const m = L.marker([s.lat, s.lng], { icon: namePin(s, selected), zIndexOffset: selected ? 1000 : 0, keyboard: false });
      m.on("click", () => onSelectRef.current(s.user_id));
      m.bindTooltip(`${esc(s.employee_name)} · ${s.live ? "Live" : "Last seen"} ${istTime(s.recorded_at)}`, {
        direction: "top",
        offset: [0, -26],
      });
      pins.addLayer(m);
    }
  }, [salesmen, selectedUserId]);

  // The selected salesman's route for the day.
  useEffect(() => {
    const map = mapRef.current;
    const layer = trailRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const pts = trail.map((p) => L.latLng(p.lat, p.lng));
    if (pts.length > 0) {
      L.polyline(pts, { color: "#2563eb", weight: 5, opacity: 0.85 }).addTo(layer);
      const stops = groupTrailIntoStops(trail);
      stops.forEach((s, i) => {
        const last = i === stops.length - 1;
        if (i === 0 || (last && trailIsToday)) return;
        L.circleMarker([s.lat, s.lng], {
          radius: 7,
          color: "#fff",
          weight: 2,
          fillColor: "#f59e0b",
          fillOpacity: 1,
        })
          .bindTooltip(
            `<b>${istTime(s.from)}${s.to !== s.from ? ` – ${istTime(s.to)}` : ""}</b>${stopDurationLabel(s.from, s.to) ? ` · ${stopDurationLabel(s.from, s.to)}` : ""}`,
            { direction: "top" },
          )
          .addTo(layer);
      });
      const first = stops[0];
      if (first) {
        L.marker([first.lat, first.lng], { icon: startIcon, keyboard: false })
          .bindTooltip(`<b>Start ${istTime(first.from)}</b>`, { direction: "top" })
          .addTo(layer);
      }
      const end = trail[trail.length - 1];
      if (trailIsToday) {
        const here = L.latLng(end.lat, end.lng);
        // Same salesman, same day: glide from where he was; otherwise a fresh marker.
        if (!riderRef.current || riderKeyRef.current !== viewKey) {
          riderRef.current = L.marker(here, { icon: riderIcon, zIndexOffset: 2000, keyboard: false });
          riderKeyRef.current = viewKey;
        } else {
          glide(riderRef.current, here);
        }
        riderRef.current.bindTooltip(`<b>Now here</b> · ${istTime(end.recorded_at)}`, { direction: "top" });
        layer.addLayer(riderRef.current);
      } else {
        L.circleMarker([end.lat, end.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#dc2626", fillOpacity: 1 })
          .bindTooltip(`<b>Last ${istTime(end.recorded_at)}</b>`, { direction: "top" })
          .addTo(layer);
      }
    }

    // Zoom to fit once per salesman / day picked, when there is something to show; later
    // refreshes keep the user's own zoom, and today's route pans to keep him in view.
    const all = pts.length > 0 ? pts : selectedUserId ? [] : salesmen.map((s) => L.latLng(s.lat, s.lng));
    if (fittedKeyRef.current !== viewKey && all.length > 0) {
      fittedKeyRef.current = viewKey;
      fitTargetRef.current = all;
      userMovedRef.current = false;
      fitTo(map, all);
    } else if (trailIsToday && pts.length > 0 && !map.getBounds().pad(-0.1).contains(pts[pts.length - 1])) {
      map.panTo(pts[pts.length - 1]);
    }
  }, [trail, trailIsToday, selectedUserId, salesmen, viewKey]);

  return <div ref={boxRef} className={className} data-testid="salesman-live-map" role="region" aria-label="Salesman map" />;
}
