import React from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function DriveMapFitBounds({ points }) {
  const map = useMap();
  const key = points.filter(Boolean).map((p) => p.join(",")).join("|");

  React.useEffect(() => {
    const invalidate = () => map.invalidateSize();
    const raf = requestAnimationFrame(invalidate);
    window.addEventListener("resize", invalidate);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", invalidate);
    };
  }, [map]);

  React.useEffect(() => {
    const pts = points.filter(Boolean);
    if (!pts.length) return;
    map.invalidateSize();
    if (pts.length === 1) {
      map.setView(pts[0], 14, { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15, animate: true });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const driveBlueIcon = L.divIcon({
  className: "",
  html: '<div style="width:12px;height:12px;border-radius:50%;background:#2563eb;border:2.5px solid #fff;box-shadow:0 0 8px #2563eb80"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});
const driveGreenIcon = L.divIcon({
  className: "",
  html: '<div style="width:12px;height:12px;border-radius:50%;background:#059669;border:2.5px solid #fff;box-shadow:0 0 8px #05966980"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});
const driveYouIcon = L.divIcon({
  className: "",
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 0 0 4px #f59e0b33,0 0 12px #f59e0b99"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

/** Drive dashboard live map — separate chunk so non-drive seller dashboards do not download Leaflet.
 *  Map chrome (dark cartoCDN tiles, container border, route polylines) stays dark regardless of
 *  theme, same as other map surfaces — a light map here would clash with the always-dark tile layer. */
export default function DriverLiveMap({
  driverPos,
  pickupCoords,
  dropoffCoords,
  routeBase = [],
  routeDriver = [],
  height,
  fill = false,
}) {
  return (
    <div
      style={{
        width: "100%",
        height: fill ? "100%" : height,
        borderRadius: fill ? 0 : 14,
        overflow: "hidden",
        border: fill ? "none" : "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <MapContainer
        center={driverPos ? [driverPos.lat, driverPos.lng] : pickupCoords}
        zoom={13}
        style={{ width: "100%", height: "100%" }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        {routeBase.length > 1 && (
          <Polyline positions={routeBase} pathOptions={{ color: "rgba(255,255,255,0.18)", weight: 3, dashArray: "6 10" }} />
        )}
        {routeDriver.length > 1 && (
          <Polyline positions={routeDriver} pathOptions={{ color: "#f59e0b", weight: 4, opacity: 0.9 }} />
        )}
        {pickupCoords && <Marker position={pickupCoords} icon={driveBlueIcon} />}
        {dropoffCoords && <Marker position={dropoffCoords} icon={driveGreenIcon} />}
        {driverPos && <Marker position={[driverPos.lat, driverPos.lng]} icon={driveYouIcon} />}
        <DriveMapFitBounds
          points={[driverPos ? [driverPos.lat, driverPos.lng] : null, pickupCoords, dropoffCoords]}
        />
      </MapContainer>
    </div>
  );
}
