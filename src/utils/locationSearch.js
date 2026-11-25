// Geocoding fallback host. Defaults to Komoot's public Photon *demo* server (no SLA / "no
// production use") — set VITE_PHOTON_BASE_URL to a self-hosted instance before prod.
const PHOTON_BASE_URL = import.meta.env.VITE_PHOTON_BASE_URL || 'https://photon.komoot.io';

export function formatCoords(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return '';
  return `${nLat.toFixed(5)}, ${nLng.toFixed(5)}`;
}

function uniqueParts(parts) {
  const seen = new Set();
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function labelFromPhotonFeature(feature) {
  const props = feature?.properties || {};
  const street = uniqueParts([props.housenumber, props.street]).join(' ');
  return uniqueParts([
    props.name,
    street,
    props.locality,
    props.city,
    props.county,
    props.state,
    props.country,
  ]).join(', ');
}

function locationFromPhotonFeature(feature) {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    label: labelFromPhotonFeature(feature) || formatCoords(lat, lng),
    lat,
    lng,
  };
}

function parseCoords(value) {
  const match = String(value || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { label: formatCoords(lat, lng), lat, lng };
}

export async function searchLocations(query, { signal, limit = 5 } = {}) {
  const raw = String(query || '').trim();
  if (raw.length < 3) return [];
  const coords = parseCoords(raw);
  if (coords) return [coords];

  const url = new URL('/api/', PHOTON_BASE_URL);
  url.searchParams.set('q', raw);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('lang', 'en');

  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || [])
    .map(locationFromPhotonFeature)
    .filter(Boolean);
}

export async function reverseGeocodeCoords(lat, lng, { signal } = {}) {
  const fallback = formatCoords(lat, lng);
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return fallback;

  const url = new URL('/reverse', PHOTON_BASE_URL);
  url.searchParams.set('lat', String(nLat));
  url.searchParams.set('lon', String(nLng));
  url.searchParams.set('lang', 'en');

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return fallback;
    const data = await res.json();
    const loc = locationFromPhotonFeature(data.features?.[0]);
    return loc?.label || fallback;
  } catch {
    return fallback;
  }
}

export async function geocodeAddressFallback(address, { signal } = {}) {
  const matches = await searchLocations(address, { signal, limit: 1 });
  return matches[0] || null;
}
