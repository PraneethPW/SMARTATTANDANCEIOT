import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Bus } from "../types";

export default function JourneyMap({
  buses,
  title = "Live bus location",
}: {
  buses: Bus[];
  title?: string;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    layer = useRef<L.LayerGroup | null>(null);
  const [follow, setFollow] = useState(true);
  const markers = useRef(new Map<string, L.Marker>());
  const active = buses.filter(
    (b) =>
      ["ACTIVE", "ARRIVED"].includes(b.trip_status || "") &&
      b.last_latitude != null &&
      b.last_longitude != null,
  );
  const staleCount = active.filter(
    (b) =>
      !b.last_seen_at ||
      Date.now() - new Date(b.last_seen_at).getTime() > 120_000,
  ).length;
  useEffect(() => {
    if (!container.current) return;
    const m = L.map(container.current, { scrollWheelZoom: false }).setView(
      [20.5937, 78.9629],
      5,
    );
    map.current = m;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      markers.current.clear();
    };
  }, []);
  useEffect(() => {
    const m = map.current,
      g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const activeIds = new Set(active.map((b) => b.id));
    for (const [id, marker] of markers.current) {
      if (!activeIds.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }
    const points: L.LatLngTuple[] = [];
    for (const bus of buses) {
      const stops = bus.stops || [];
      const route = stops.map(
        (s) => [Number(s.latitude), Number(s.longitude)] as L.LatLngTuple,
      );
      points.push(...route);
      if (route.length > 1)
        L.polyline(route, {
          color: "#58caff",
          weight: 3,
          dashArray: "7 6",
        }).addTo(g);
      for (const stop of stops) {
        const el = document.createElement("span");
        el.textContent = `${stop.sequence + 1}. ${stop.name}`;
        L.circleMarker([Number(stop.latitude), Number(stop.longitude)], {
          radius: 7,
          color: "#79f3d0",
          fillOpacity: 1,
        })
          .bindTooltip(el)
          .addTo(g);
      }
      if (
        !["ACTIVE", "ARRIVED"].includes(bus.trip_status || "") ||
        bus.last_latitude == null ||
        bus.last_longitude == null
      )
        continue;
      const pos: [number, number] = [
        Number(bus.last_latitude),
        Number(bus.last_longitude),
      ];
      points.push(pos);
      const popup = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = bus.code;
      const p = document.createElement("p");
      const stale =
        !bus.last_seen_at ||
        Date.now() - new Date(bus.last_seen_at).getTime() > 120_000;
      p.textContent = `${bus.route_name} · ${stale ? "Last known GPS — stale" : "Live GPS"} · ${bus.last_seen_at ? new Date(bus.last_seen_at).toLocaleTimeString() : "No timestamp"}`;
      popup.append(strong, p);
      let marker = markers.current.get(bus.id);
      if (!marker) {
        marker = L.marker(pos, {
          icon: L.divIcon({
            className: "gps-bus-marker",
            html: '<span aria-label="Bus">▣</span>',
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          }),
        })
          .bindPopup(popup)
          .addTo(m);
        markers.current.set(bus.id, marker);
      } else marker.setLatLng(pos).setPopupContent(popup);
      marker.getElement()?.classList.toggle("gps-stale", stale);
    }
    if (follow && points.length)
      m.fitBounds(points, { padding: [35, 35], maxZoom: 16 });
  }, [buses, follow]);
  return (
    <section className="dash-card map-card">
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          <span>
            {active.length
              ? `${active.length} bus position${active.length > 1 ? "s" : ""} received during active journeys${staleCount ? " · " + staleCount + " stale" : ""}`
              : "Waiting for GPS from an active journey"}
          </span>
        </div>
        <button
          className="portal-text-button"
          onClick={() => setFollow((v) => !v)}
        >
          {follow ? "Pause following" : "Follow buses"}
        </button>
      </div>
      <div className="journey-map" ref={container} />
      <p className="map-note">
        Dots are configured stops. Dashed lines connect the stop sequence. Bus
        markers use received GPS coordinates; stale positions are labeled.
      </p>
    </section>
  );
}
