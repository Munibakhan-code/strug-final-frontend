import React, { useEffect, useMemo, useState } from "react";
import LiveTrackingMap from "../components/LiveTrackingMap.jsx";
import { getTrackedTrip } from "../api/driverSafety.js";

// No-login "share my trip" link for a rideshare driver's safety feature (see
// routes/driver-safety-routes.js GET /track/:token). Mirrors PublicTracking.jsx's
// pattern (courier's no-login tracking page) — rendered standalone before any auth
// gating, since whoever the driver shares this with may not have a Strug account.
// Distinct URL prefix (/track-trip/ vs courier's /track/) because the token space is a
// different backend table — the App.jsx gate needs to route to the right page.
const POLL_MS = 4000;

const STATUS_LABEL = {
  ride_started: "Trip in progress",
  driver_arrived: "Driver at pickup",
  pickup_verified: "Trip starting",
};

export default function TripTrack() {
  const token = useMemo(() => {
    const match = window.location.pathname.match(/\/track-trip\/([^/?#]+)/);
    return match ? match[1] : null;
  }, []);

  const [data, setData] = useState(null);
  const [error, setError] = useState(token ? null : "No tracking link provided.");
  const [loading, setLoading] = useState(!!token);

  useEffect(() => {
    if (!token) return undefined;
    let stopped = false;
    const poll = () => {
      getTrackedTrip(token)
        .then((res) => { if (!stopped) { setData(res); setError(null); setLoading(false); } })
        .catch((err) => {
          if (stopped) return;
          setError(err?.response?.data?.message || "This tracking link isn't available.");
          setLoading(false);
        });
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { stopped = true; clearInterval(id); };
  }, [token]);

  const destination = data?.status === "ride_started"
    ? (data?.dropoff_lat != null && data?.dropoff_lng != null ? { lat: data.dropoff_lat, lng: data.dropoff_lng } : null)
    : (data?.pickup_lat != null && data?.pickup_lng != null ? { lat: data.pickup_lat, lng: data.pickup_lng } : null);
  const live = data?.lat != null && data?.lng != null ? { lat: data.lat, lng: data.lng } : null;

  return (
    <div className="bg-bg" style={{ minHeight: "100vh", display: "flex", justifyContent: "center", padding: "40px 16px" }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
          Strug Rides · Live trip tracking
        </p>

        {loading && (
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif" }}>Loading…</p>
        )}

        {!loading && error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "16px 18px" }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#f87171", margin: 0 }}>{error}</p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            <h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(26px,5vw,36px)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
              {STATUS_LABEL[data.status] || "Trip in progress"}
            </h1>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20 }}>
              {data.driver_first_name ? `${data.driver_first_name} is on this trip` : "Tracking this trip"}
            </p>

            {live && destination && (
              <div style={{ marginBottom: 16 }}>
                <LiveTrackingMap live={live} destination={destination} accent="#2563eb" height={280} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
