import { cloneElement, isValidElement, useId, useState } from "react";
import { createPortal } from "react-dom";
import {
  createBookingListing,
  updateBookingListing,
  createHotelRoom,
} from "../api/booking";
import { uploadImage } from "../api/shop";
import { mediaUrl } from "../utils/mediaUrl";
import { AddressAutocomplete } from "./shared.jsx";
import { EQUIPMENT_CATEGORY_DEFS } from "../utils/equipmentCategories.js";
import { ImageLightbox } from "./ImageLightbox.jsx";
import { withReservationFoodVendorLink } from "../utils/reservationMenuLink.js";
import { resolveTempStayCategory } from "../utils/tempstayListingHelpers.js";

// ──────────────────────────────────────────────────────────────────────────--
// Generic, vertical-keyed host listing form for the shared Booking Engine.
// ONE component lets a host publish/edit a `booking_listing` for ANY Airbnb-style
// vertical (tempstay, hotel, venue, equipment, vehicle, lesson, event,
// experience, celebrity, artist, reservation). The per-vertical config below
// decides the price unit, fee defaults, which knobs show (deposit/capacity),
// and the small set of vertical-specific attribute fields (stored in
// `attributes` JSON). Pricing is still server-authoritative — this form only
// sets the listing's base price/fees; the engine computes every quote.
// ──────────────────────────────────────────────────────────────────────────--

// price_unit + UI per vertical. `attrs` are extra fields persisted to the
// listing's `attributes` JSON (so the engine schema stays generic).
export const VERTICAL_CONFIG = {
  tempstay: {
    label: "Stay",
    requireLocation: true, // #305 — a physical property must have an address to be published
    priceUnit: "night",
    priceLabel: "Price per night",
    cleaning_fee: 35,
    service_fee_pct: 12,
    capacity: true,
    capacityLabel: "Max guests",
    deposit: false,
    attrs: [
      { key: "bedrooms", label: "Bedrooms", type: "number" },
      { key: "bathrooms", label: "Bathrooms", type: "number" },
      {
        key: "category",
        label: "Stay category",
        type: "select",
        required: true,
        options: [
          { value: "", label: "Select a category…" },
          { value: "Entire Home", label: "Entire Home" },
          { value: "Private Room", label: "Private Room" },
          { value: "Shared Room", label: "Shared Room" },
          { value: "Cabin", label: "Cabin" },
          { value: "Beachfront", label: "Beachfront" },
          { value: "Luxury", label: "Luxury" },
          { value: "Unique", label: "Unique" },
        ],
      },
      { key: "property_type", label: "Property type", type: "text", placeholder: "Apartment, House…" },
      { key: "amenities", label: "Amenities (comma-separated)", type: "text", placeholder: "Wi-Fi, Kitchen, Free parking…" },
      { key: "house_rules", label: "House rules", type: "text", placeholder: "No smoking, quiet hours…" },
      { key: "check_in_time", label: "Check-in time", type: "text", placeholder: "3:00 PM" },
      { key: "check_out_time", label: "Check-out time", type: "text", placeholder: "11:00 AM" },
      { key: "cancellation_policy", label: "Cancellation policy", type: "text", placeholder: "Flexible / Moderate / Strict" },
    ],
  },
  hotel: {
    label: "Hotel",
    requireLocation: true, // #305
    priceUnit: "night",
    priceLabel: "Starting price per night",
    cleaning_fee: 0,
    service_fee_pct: 12,
    // capacity = physical copies of the primary room type, NOT max guests.
    // Nightly bookable cap is that quantity (backend falls back to room_type.quantity
    // when no per-date hotel_room_inventory row exists). HotelRoomTypesManager edits
    // that count; the listing calendar blocks dates. POST .../inventory is optional overrides.
    capacity: true,
    capacityLabel: "Rooms of this type",
    capacityDefault: 1,
    // On edit, physical room count is managed via HotelRoomTypesManager ("Rooms" on the card).
    // That is not per-date inventory — nights stay bookable from quantity unless a date is blocked.
    capacityCreateOnly: true,
    deposit: false,
    attrs: [
      { key: "category", label: "Category", type: "text", placeholder: "Luxury, Boutique, Business…" },
      { key: "star_rating", label: "Star rating (optional)", type: "number", placeholder: "1–5" },
      { key: "amenities", label: "Amenities (comma-separated)", type: "text", placeholder: "Pool, Spa, Gym…" },
      { key: "room_name", label: "Primary room type name", type: "text", placeholder: "Deluxe King, Twin…", createOnly: true },
      { key: "max_guests", label: "Max guests per room", type: "number", placeholder: "2", default: "2", createOnly: true },
      { key: "beds", label: "Beds (optional)", type: "text", placeholder: "1 King Bed", createOnly: true },
    ],
    // After create, hosts add distinct room types via the room manager.
    roomTypes: true,
  },
  venue: {
    label: "Venue",
    requireLocation: true, // #305
    priceUnit: "event",
    priceLabel: "Price per booking",
    cleaning_fee: 0,
    service_fee_pct: 10,
    // capacity on the booking engine = concurrent bookable units (always 1 for a venue).
    // Max attendees live in attributes.max_attendees — never write people count into capacity.
    capacity: false,
    forceCapacity: 1,
    deposit: true,
    attrs: [
      { key: "max_attendees", label: "Max attendees", type: "number", placeholder: "100" },
      // Guest chips filter on category; keep venue_type as legacy alias in the mapper.
      {
        key: "category",
        label: "Category",
        type: "select",
        options: [
          { value: "Wedding", label: "Wedding" },
          { value: "Corporate", label: "Corporate" },
          { value: "Birthday", label: "Birthday" },
          { value: "Concert", label: "Concert" },
          { value: "Outdoor", label: "Outdoor" },
          { value: "Rooftop", label: "Rooftop" },
          { value: "Gallery", label: "Gallery" },
        ],
        default: "Wedding",
      },
      { key: "venue_type", label: "Venue type (optional)", type: "text", placeholder: "Ballroom, Hall, Studio…" },
      { key: "square_feet", label: "Square feet", type: "number" },
      { key: "amenities", label: "Amenities (comma-separated)", type: "text", placeholder: "AV, Bar, Catering kitchen…" },
      { key: "rules", label: "Rules", type: "text", placeholder: "No confetti, end by 11pm…" },
    ],
  },
  equipment: {
    label: "Equipment",
    priceUnit: "day",
    priceLabel: "Price per day",
    cleaning_fee: 0,
    service_fee_pct: 10,
    // capacity = concurrent bookable copies (multi-unit inventory). Not people.
    capacity: true,
    capacityLabel: "Copies available",
    capacityDefault: 1,
    deposit: true,
    requireLocation: true,
    attrs: [
      { key: "brand", label: "Brand", type: "text" },
      { key: "condition", label: "Condition", type: "text", placeholder: "New, Good, Fair" },
      {
        key: "category",
        label: "Category",
        type: "select",
        options: EQUIPMENT_CATEGORY_DEFS.filter((d) => d.match != null).map((d) => ({
          value: d.match,
          label: d.match,
        })),
        default: "Photography",
      },
    ],
  },
  vehicle: {
    label: "Vehicle",
    priceUnit: "day",
    priceLabel: "Price per day",
    cleaning_fee: 0,
    service_fee_pct: 10,
    // capacity on the booking engine = concurrent rentable units (always 1 for a car).
    // Passenger seats live in attributes.seats — never write seat count into capacity.
    capacity: false,
    forceCapacity: 1,
    deposit: true,
    attrs: [
      { key: "seats", label: "Seats", type: "number", placeholder: "5" },
      { key: "make", label: "Make", type: "text", placeholder: "Toyota" },
      { key: "model", label: "Model", type: "text", placeholder: "Camry" },
      { key: "year", label: "Year", type: "number" },
      { key: "transmission", label: "Transmission", type: "text", placeholder: "Automatic" },
    ],
  },
  lesson: {
    label: "Lesson",
    priceUnit: "session",
    priceLabel: "Price per session",
    cleaning_fee: 0,
    service_fee_pct: 10,
    capacity: true,
    capacityLabel: "Max students",
    deposit: false,
    attrs: [
      { key: "subject", label: "Subject", type: "text", placeholder: "Guitar, Math…" },
      { key: "level", label: "Level", type: "text", placeholder: "Beginner, Advanced" },
      { key: "duration_min", label: "Duration (min)", type: "number" },
    ],
  },
  event: {
    label: "Event",
    priceUnit: "event",
    priceLabel: "Ticket price (0 for free)",
    allowZeroPrice: true,
    cleaning_fee: 0,
    service_fee_pct: 8,
    capacity: true,
    capacityRequired: true,
    capacityLabel: "Tickets available",
    deposit: false,
    attrs: [
      {
        key: "category",
        label: "Category",
        type: "select",
        options: [
          { value: "", label: "Select…" },
          { value: "Music", label: "Music" },
          { value: "Sports", label: "Sports" },
          { value: "Arts", label: "Arts" },
          { value: "Food & Drink", label: "Food & Drink" },
          { value: "Comedy", label: "Comedy" },
          { value: "Networking", label: "Networking" },
          { value: "Family", label: "Family" },
          { value: "Nightlife", label: "Nightlife" },
        ],
      },
      { key: "date", label: "Event date", type: "date", required: true },
      { key: "time", label: "Start time", type: "time" },
      { key: "venue_name", label: "Venue name", type: "text" },
    ],
  },
  experience: {
    label: "Experience",
    priceUnit: "session",
    priceLabel: "Price per person",
    cleaning_fee: 0,
    service_fee_pct: 12,
    capacity: true,
    capacityLabel: "Group size",
    deposit: false,
    attrs: [
      { key: "category", label: "Category", type: "text", placeholder: "Food tour, Hike…" },
      { key: "duration_hr", label: "Duration (hours)", type: "number" },
    ],
  },
  celebrity: {
    label: "Cameo",
    priceUnit: "async",
    priceLabel: "Price per video",
    cleaning_fee: 0,
    service_fee_pct: 20,
    capacity: false,
    deposit: false,
    attrs: [
      { key: "turnaround_days", label: "Turnaround (days)", type: "number" },
      { key: "category", label: "Known for", type: "text", placeholder: "Actor, Athlete…" },
    ],
  },
  artist: {
    label: "Artist booking",
    priceUnit: "event",
    priceLabel: "Booking fee",
    cleaning_fee: 0,
    service_fee_pct: 15,
    capacity: false,
    deposit: true,
    attrs: [
      { key: "genre", label: "Genre", type: "text", placeholder: "DJ, Band, Comedian…" },
      { key: "set_length_min", label: "Set length (min)", type: "number" },
    ],
  },
  reservation: {
    label: "Reservation",
    priceUnit: "session",
    priceLabel: "Reservation fee",
    cleaning_fee: 0,
    // Strug takes no platform cut on reservations — a reservation fee is
    // entirely the owner's choice (they set the price field). Default 0. (#202)
    service_fee_pct: 0,
    // BE rejects booking / marks all slots unavailable without capacity or
    // attributes.max_guests — require it here so hosts can't publish unbookable listings.
    capacity: true,
    capacityRequired: true,
    capacityDefault: "6",
    capacityLabel: "Max party size",
    deposit: false,
    attrs: [
      { key: "category", label: "Type", type: "text", placeholder: "Restaurant, Salon…" },
      // Concurrent parties (primary). BE uses attributes.tables — seating_capacity is
      // an optional extra seat budget and must not replace this field.
      { key: "tables", label: "Tables / concurrent parties", type: "number", required: true, default: "10", placeholder: "10" },
      { key: "seating_capacity", label: "Total seats in overlapping turns (optional)", type: "number", placeholder: "40" },
      { key: "turn_time_minutes", label: "Turn time (minutes per table)", type: "number", required: true, default: "90", placeholder: "90" },
      // Optional custom slot grid; blank = engine's default lunch/dinner times.
      { key: "time_slots", label: "Reservation times (comma-separated, optional)", type: "text", placeholder: "12:00, 12:30, 6:00 PM, 7:30 PM" },
      {
        key: "price_level",
        label: "Price level",
        type: "select",
        options: [
          { value: "", label: "Not listed" },
          { value: "$", label: "$" },
          { value: "$$", label: "$$" },
          { value: "$$$", label: "$$$" },
          { value: "$$$$", label: "$$$$" },
        ],
      },
      { key: "hours", label: "Hours", type: "text", placeholder: "Mon–Sun 11:00–22:00" },
      { key: "phone", label: "Phone (optional)", type: "text", placeholder: "+1…" },
      { key: "dress_code", label: "Dress code (optional)", type: "text", placeholder: "Smart casual" },
      { key: "notes", label: "Guest notes (optional)", type: "text", placeholder: "Street parking, valet…" },
    ],
  },
  // Décor is ONE vertical with a `type` discriminator (services/rental/seasonal)
  // that decides which Décor sub-page the listing surfaces in AND its price unit
  // (rentals are per-day date ranges; services/seasonal are flat per-session).
  decor: {
    label: "Décor listing",
    priceUnit: "session",
    priceUnitByType: { services: "session", rental: "day", seasonal: "session" },
    priceLabel: "Price",
    cleaning_fee: 0,
    service_fee_pct: 12,
    capacity: false,
    deposit: true,
    attrs: [
      { key: "type", label: "Listing type", type: "select", required: true,
        options: [
          { value: "services", label: "Service (per session)" },
          { value: "rental", label: "Rental (per day)" },
          { value: "seasonal", label: "Seasonal package" },
        ] },
      // Constrained to the browse filter-chip labels (DECOR_CATEGORIES ∪
      // DECOR_RENTAL_CATS ∪ DECOR_SHOP_CATS in Decor.jsx) so new listings always
      // land under a real category chip instead of free-text that filters to nothing.
      { key: "category", label: "Category", type: "select",
        options: [
          { value: "Interior", label: "Interior" },
          { value: "Event Décor", label: "Event Décor" },
          { value: "Furniture", label: "Furniture" },
          { value: "Lighting", label: "Lighting" },
          { value: "Wall Art", label: "Wall Art" },
          { value: "Rugs", label: "Rugs" },
          { value: "Outdoor", label: "Outdoor" },
          { value: "Accessories", label: "Accessories" },
          { value: "Textiles", label: "Textiles" },
          { value: "Seasonal", label: "Seasonal" },
          { value: "Custom", label: "Custom" },
        ] },
      { key: "season", label: "Season (seasonal only)", type: "select", whenType: "seasonal",
        options: [
          { value: "Christmas", label: "Christmas" },
          { value: "Halloween", label: "Halloween" },
          { value: "Easter", label: "Easter" },
          { value: "Diwali", label: "Diwali" },
          { value: "Other", label: "Other" },
        ] },
      { key: "unit", label: "Unit label", type: "text", placeholder: "per event, per day…" },
      { key: "time_slots", label: "Service times (comma-separated, optional)", type: "text", placeholder: "9:00 AM, 11:00 AM, 2:00 PM", whenType: "services" },
      { key: "provider", label: "Provider / brand name (optional)", type: "text", placeholder: "Studio name shown to buyers" },
      { key: "featured", label: "Featured on browse", type: "select",
        options: [
          { value: "", label: "No" },
          { value: "true", label: "Yes" },
        ] },
    ],
  },
  wedding: {
    label: "Wedding vendor",
    requireLocation: true,
    priceUnit: "event",
    priceLabel: "Price per booking",
    cleaning_fee: 0,
    service_fee_pct: 10,
    // Engine capacity = concurrent bookable units (always 1). Guest count lives in max_attendees.
    capacity: false,
    forceCapacity: 1,
    deposit: true,
    attrs: [
      {
        key: "vendor_type",
        label: "Vendor type",
        type: "select",
        required: true,
        options: [
          { value: "Venue", label: "Venue" },
          { value: "Florist", label: "Florist" },
          { value: "Videography", label: "Videography" },
          { value: "Photography", label: "Photography" },
          { value: "Catering", label: "Catering" },
          { value: "Rental", label: "Rental" },
        ],
        default: "Venue",
      },
      {
        key: "max_attendees",
        label: "Max attendees (venues / catering)",
        type: "number",
        placeholder: "200",
      },
      { key: "unit", label: "Unit label", type: "text", placeholder: "per event, per day…" },
      {
        key: "featured",
        label: "Featured on browse (shown first)",
        type: "select",
        options: [
          { value: "", label: "No" },
          { value: "true", label: "Yes" },
        ],
      },
    ],
  },
};

const ACCENT = "#2563eb";

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};
const inputStyle = {
  width: "100%",
  background: "var(--color-surface-raised)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  padding: "11px 12px",
  color: "var(--color-text-primary)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

function Field({ label, children }) {
  // Associate the label with the control it wraps. A single native form control
  // takes the id directly; AddressAutocomplete forwards it to its inner input via
  // inputId. Anything else (a composite like the Photos picker, or multiple
  // children) becomes a group named by the label.
  const fid = useId();
  const child = isValidElement(children) ? children : null;
  const type = child?.type;
  const isNativeControl = type === "input" || type === "select" || type === "textarea";
  const isAddress = type === AddressAutocomplete;

  if (isNativeControl || isAddress) {
    return (
      <div style={{ marginBottom: 14 }}>
        <label htmlFor={fid} style={labelStyle}>{label}</label>
        {cloneElement(child, isAddress ? { inputId: fid } : { id: fid })}
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 14 }}>
      <label id={fid} style={labelStyle}>{label}</label>
      <div role="group" aria-labelledby={fid}>{children}</div>
    </div>
  );
}

// Pull existing attribute values when editing. `presetAttrs` seeds attribute
// defaults when creating (e.g. the Décor Rentals page opens the form on `rental`).
function initialFromListing(listing, cfg, presetAttrs, vertical) {
  const attrs = listing?.attributes || presetAttrs || {};
  const existingCapacity =
    listing?.capacity != null
      ? String(listing.capacity)
      : attrs.max_guests != null
        ? String(attrs.max_guests)
        : "";
  const base = {
    title: listing?.title ?? "",
    description: listing?.description ?? "",
    location: listing?.location ?? "",
    latitude: listing?.latitude != null ? String(listing.latitude) : "",
    longitude: listing?.longitude != null ? String(listing.longitude) : "",
    price: listing?.price != null ? String(listing.price) : "",
    // New listings: seed capacityDefault when the vertical requires it (equipment copies, reservation party size).
    capacity: existingCapacity || (listing ? "" : String(cfg.capacityDefault ?? "")),
    instant_book: Boolean(listing?.instant_book),
    requires_deposit: Boolean(listing?.requires_deposit),
    deposit_amount: listing?.deposit_amount != null ? String(listing.deposit_amount) : "",
    cleaning_fee: listing?.cleaning_fee != null ? String(listing.cleaning_fee) : String(cfg.cleaning_fee ?? 0),
    service_fee_pct:
      listing?.service_fee_pct != null ? String(listing.service_fee_pct) : String(cfg.service_fee_pct ?? 0),
  };
  for (const a of cfg.attrs) {
    if (attrs[a.key] != null && attrs[a.key] !== "") {
      // Array attrs (amenities, time_slots) render as a comma-separated string.
      base[`attr_${a.key}`] = Array.isArray(attrs[a.key])
        ? attrs[a.key].join(", ")
        : String(attrs[a.key]);
    } else if (vertical === "tempstay" && a.key === "category") {
      const resolved = resolveTempStayCategory(attrs);
      base[`attr_${a.key}`] = resolved || "";
    } else if (a.type === "select") {
      // Never seed a required select to the first real option on edit — host must pick explicitly.
      base[`attr_${a.key}`] = listing ? "" : (a.default ?? "");
    }
    // New listings: seed the field default (e.g. reservation tables/turn time) so
    // required engine config starts valid instead of blank.
    else if (!listing && a.default != null) base[`attr_${a.key}`] = String(a.default);
    else base[`attr_${a.key}`] = "";
  }
  return base;
}

/**
 * BookingListingForm — modal host form for any booking vertical.
 *
 * Props:
 *   vertical   string   one of VERTICAL_CONFIG keys (required)
 *   listing    object?  existing booking_listing to edit (omit to create)
 *   onSaved    fn(listing)  called with the created/updated listing
 *   onClose    fn()     dismiss without saving
 */
export default function BookingListingForm({ vertical, listing, onSaved, onClose, presetAttrs }) {
  const cfg = VERTICAL_CONFIG[vertical];
  const isEdit = Boolean(listing?.booking_listing_id || listing?.id);
  const listingId = listing?.booking_listing_id ?? listing?.id;

  const [form, setForm] = useState(() => initialFromListing(listing, cfg || { attrs: [] }, presetAttrs, vertical));
  const [images, setImages] = useState(() => {
    const imgs = listing?.images;
    if (Array.isArray(imgs)) return imgs;
    if (typeof imgs === "string" && imgs.startsWith("[")) {
      try { return JSON.parse(imgs); } catch { return []; }
    }
    return imgs ? [imgs] : [];
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [lightboxIdx, setLightboxIdx] = useState(null);

  if (!cfg) {
    return null;
  }

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  async function handleImagePick(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setMsg("");
    // Optimistic local previews so the host sees the image immediately (#189), swapped for
    // the uploaded URLs when the upload resolves (failed ones are dropped).
    const previews = files.map((f) => URL.createObjectURL(f));
    setImages((prev) => [...prev, ...previews]);
    try {
      const ups = await Promise.allSettled(files.map((f) => uploadImage(f)));
      const urls = ups
        .filter((r) => r.status === "fulfilled" && r.value?.url)
        .map((r) => r.value.url);
      setImages((prev) => [...prev.filter((u) => !previews.includes(u)), ...urls]);
      if (urls.length < files.length) {
        // Surface the server's reason (e.g. "Image size must be less than 10MB")
        // so a rejected upload isn't silent.
        const firstErr = ups.find((r) => r.status === "rejected");
        const serverMsg = firstErr?.reason?.response?.data?.error;
        setMsg(serverMsg || (urls.length ? "Some images failed to upload." : "Image upload failed."));
      }
    } catch {
      setImages((prev) => prev.filter((u) => !previews.includes(u)));
      setMsg("Image upload failed.");
    } finally {
      previews.forEach((u) => URL.revokeObjectURL(u));
      setUploading(false);
      e.target.value = "";
    }
  }

  function buildPayload() {
    const price = parseFloat(form.price);
    const attributes = {};
    for (const a of cfg.attrs) {
      const raw = form[`attr_${a.key}`];
      if (raw === "" || raw == null) continue;
      if ((a.key === "amenities" || a.key === "time_slots") && typeof raw === "string") {
        // Comma-separated list fields persist as arrays in attributes JSON.
        const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
        if (list.length) attributes[a.key] = list;
      } else {
        attributes[a.key] = a.type === "number" ? Number(raw) : raw;
      }
    }
    // Carry through hidden linkage attrs (e.g. food_vendor_id for reservation menus).
    if (presetAttrs && typeof presetAttrs === "object") {
      for (const [k, v] of Object.entries(presetAttrs)) {
        if (v == null || v === "" || attributes[k] !== undefined) continue;
        attributes[k] = v;
      }
    }
    // Verticals with a `type` discriminator (e.g. décor) derive the price unit
    // from the selected type so rentals charge per-day while services are flat.
    const priceUnit = cfg.priceUnitByType
      ? (cfg.priceUnitByType[form.attr_type] || cfg.priceUnit)
      : cfg.priceUnit;
    if (cfg.capacity && form.capacity !== "") {
      const cap = Number(form.capacity);
      if (Number.isFinite(cap) && cap > 0 && vertical === "reservation") {
        // Dual-write: BE resolveReservationMaxParty reads capacity OR attributes.max_guests.
        attributes.max_guests = cap;
      }
    }
    const payload = {
      vertical,
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      latitude: form.latitude !== "" && Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : null,
      longitude: form.longitude !== "" && Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : null,
      price: Number.isFinite(price) ? price : null,
      price_unit: priceUnit,
      instant_book: form.instant_book,
      cleaning_fee: form.cleaning_fee !== "" ? Number(form.cleaning_fee) : 0,
      service_fee_pct: form.service_fee_pct !== "" ? Number(form.service_fee_pct) : 0,
      images,
      attributes,
    };
    if (cfg.capacity && !(isEdit && cfg.capacityCreateOnly)) {
      if (form.capacity !== "") {
        const cap = Number(form.capacity);
        payload.capacity = Number.isFinite(cap) && cap > 0 ? cap : null;
      } else if (cfg.capacityDefault != null) {
        payload.capacity = Number(cfg.capacityDefault);
      } else {
        payload.capacity = null;
      }
    }
    if (cfg.forceCapacity != null) payload.capacity = cfg.forceCapacity;
    if (cfg.deposit) {
      payload.requires_deposit = form.requires_deposit;
      payload.deposit_amount =
        form.requires_deposit && form.deposit_amount !== "" ? Number(form.deposit_amount) : 0;
    }
    return payload;
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setMsg("A title is required.");
      return;
    }
    const price = parseFloat(form.price);
    const priceOk = cfg.allowZeroPrice
      ? form.price !== "" && Number.isFinite(price) && price >= 0
      : form.price && Number.isFinite(price) && price > 0;
    if (!priceOk) {
      setMsg(`Enter a valid ${cfg.priceLabel.toLowerCase()}.`);
      return;
    }
    if (cfg.capacityRequired) {
      const cap = Number(form.capacity);
      if (form.capacity === "" || !Number.isFinite(cap) || cap < 1) {
        setMsg(`Enter a valid ${String(cfg.capacityLabel || "capacity").toLowerCase()} (at least 1).`);
        return;
      }
    }
    // Required attribute fields (e.g. reservation tables / turn time — the booking
    // engine rejects reservation listings missing concurrent-capacity config).
    for (const a of cfg.attrs) {
      if (!a.required) continue;
      const raw = form[`attr_${a.key}`];
      if (a.type === "select") {
        if (!String(raw ?? "").trim()) {
          setMsg(`Select ${a.label.toLowerCase()}.`);
          return;
        }
        continue;
      }
      if (a.type === "number") {
        const n = Number(raw);
        if (raw === "" || !Number.isFinite(n) || n <= 0) {
          setMsg(`Enter a valid ${a.label.toLowerCase()} (at least 1).`);
          return;
        }
      } else if (!String(raw ?? "").trim()) {
        setMsg(`${a.label} is required.`);
        return;
      }
    }
    // Optional seating budget must fit at least one max-size party.
    if (vertical === "reservation") {
      const seatsRaw = form.attr_seating_capacity;
      if (seatsRaw !== "" && seatsRaw != null) {
        const seats = Number(seatsRaw);
        const maxParty = Number(form.capacity);
        if (Number.isFinite(seats) && seats > 0 && Number.isFinite(maxParty) && seats < maxParty) {
          setMsg("Total seats must be at least the max party size (or leave seats blank to use tables only).");
          return;
        }
      }
    }
    // #305 — a physical property (stay/hotel/venue) can't be published without an address.
    // It stays private to the public listing view; only the area is shown until booked.
    if (cfg.requireLocation && !form.location.trim()) {
      setMsg("An address is required. It stays private — guests only see the general area until they book.");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const payload = buildPayload();
      // Reservation Menu tab reads attributes.food_vendor_id → Food dashboard menu.
      // Auto-link the host's Restaurant vendor when the listing was created without it.
      if (vertical === "reservation") {
        payload.attributes = await withReservationFoodVendorLink(payload.attributes || {});
      }
      let res;
      if (isEdit) {
        // vertical/owner are immutable server-side; the rest are whitelisted.
        const { vertical: _v, ...editable } = payload;
        res = await updateBookingListing(listingId, editable);
      } else {
        res = await createBookingListing(payload);
        const saved = res?.data ?? res;
        // Seed an honest primary room from host-entered name (never invent Queen/WiFi).
        if (vertical === "hotel" && saved?.booking_listing_id) {
          try {
            const roomName = String(form.attr_room_name || "").trim() || "Hotel stay";
            const beds = String(form.attr_beds || "").trim() || undefined;
            await createHotelRoom(saved.booking_listing_id, {
              name: roomName,
              ...(beds ? { beds } : {}),
              max_guests: form.attr_max_guests !== "" ? Number(form.attr_max_guests) : 2,
              // Physical inventory copies — never guest party size.
              quantity: form.capacity !== "" ? Math.max(1, Number(form.capacity) || 1) : 1,
              nightly_price: Number(form.price),
              amenities: Array.isArray(payload.attributes?.amenities) ? payload.attributes.amenities : [],
              images,
            });
          } catch { /* listing still saved; host can add rooms later */ }
        }
      }
      const saved = res?.data ?? res;
      onSaved?.(saved);
    } catch (e) {
      setMsg(e?.response?.data?.message ?? e?.response?.data?.error ?? "Failed to save listing.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(4px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "min(40px, 4vh) 16px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface border border-border"
        style={{
          width: "100%",
          maxWidth: 560,
          margin: "0 auto 40px",
          borderRadius: 18,
          padding: "26px 26px 22px",
          boxShadow: "0 24px 60px var(--color-shadow)",
          maxHeight: "min(92vh, 900px)",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 className="text-text-primary" style={{ margin: 0, fontSize: 21, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {isEdit ? "Edit" : "List your"} {cfg.label}
          </h2>
          <button
            onClick={onClose}
            className="text-text-secondary"
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-text-secondary" style={{ margin: "0 0 18px", fontSize: 13 }}>
          Published to the Strug booking engine. Pricing &amp; availability are enforced on the server.
        </p>
        {vertical === "hotel" && (
          <p
            style={{
              margin: "0 0 16px",
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(14,165,233,0.1)",
              border: "1px solid rgba(14,165,233,0.22)",
              fontSize: 12,
              color: "rgba(186,230,253,0.95)",
              lineHeight: 1.45,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {isEdit
              ? "To add Twin, Suite, or more Deluxe rooms, use the Rooms button on this hotel’s listing card — not Add Room (that creates another hotel)."
              : "This publishes one hotel and seeds your first room type. After save, you’ll manage all room types (Deluxe, Twin, Suite…) under this hotel."}
          </p>
        )}

        <Field label="Title">
          <input style={inputStyle} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder={`Name your ${cfg.label.toLowerCase()}`} />
        </Field>

        <Field label="Description">
          <textarea
            style={{ ...inputStyle, minHeight: 78, resize: "vertical" }}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What makes it great?"
          />
        </Field>

        <Field label={cfg.requireLocation ? "Address *" : "Location"}>
          {/* #201: suggest locations as you type, like the other verticals (Food/Rideshare/etc.) */}
          <AddressAutocomplete
            value={form.location}
            onChange={(val, lat, lng) => setForm((prev) => ({
              ...prev,
              location: val,
              latitude: lat != null && Number.isFinite(Number(lat)) ? String(lat) : "",
              longitude: lng != null && Number.isFinite(Number(lng)) ? String(lng) : "",
            }))}
            onEnter={(val, lat, lng) => setForm((prev) => ({
              ...prev,
              location: val,
              latitude: lat != null && Number.isFinite(Number(lat)) ? String(lat) : prev.latitude,
              longitude: lng != null && Number.isFinite(Number(lng)) ? String(lng) : prev.longitude,
            }))}
            placeholder={cfg.requireLocation ? "Full address (kept private until booked)" : "City, area, or address"}
            useLocation
            wrapStyle={{ width: "100%" }}
            inputStyle={inputStyle}
          />
        </Field>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Field label={`${cfg.priceLabel} (CAD)`}>
              <input style={inputStyle} type="number" min="0" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="0" />
            </Field>
          </div>
          {cfg.capacity && !(isEdit && cfg.capacityCreateOnly) && (
            <div style={{ width: 150 }}>
              <Field label={cfg.capacityRequired ? `${cfg.capacityLabel} *` : cfg.capacityLabel}>
                <input
                  style={inputStyle}
                  type="number"
                  min="1"
                  required={Boolean(cfg.capacityRequired)}
                  value={form.capacity}
                  onChange={(e) => set("capacity", e.target.value)}
                  placeholder={cfg.capacityDefault ? `e.g. ${cfg.capacityDefault}` : "—"}
                />
              </Field>
            </div>
          )}
        </div>

        {/* Vertical-specific attributes */}
        {cfg.attrs.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {cfg.attrs
              .filter((a) => !a.whenType || form.attr_type === a.whenType)
              .filter((a) => !(isEdit && a.createOnly))
              .map((a) => (
              <div key={a.key} style={{ flex: "1 1 calc(50% - 6px)", minWidth: 150 }}>
                <Field label={a.label}>
                  {a.type === "select" ? (
                    <select
                      style={{ ...inputStyle, appearance: "auto", colorScheme: "dark" }}
                      value={form[`attr_${a.key}`]}
                      onChange={(e) => set(`attr_${a.key}`, e.target.value)}
                    >
                      {a.options.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      style={{ ...inputStyle, ...(a.type === "date" || a.type === "time" ? { colorScheme: "dark" } : {}) }}
                      type={a.type === "number" ? "number" : a.type === "date" ? "date" : a.type === "time" ? "time" : "text"}
                      value={form[`attr_${a.key}`]}
                      onChange={(e) => set(`attr_${a.key}`, e.target.value)}
                      placeholder={a.placeholder || ""}
                    />
                  )}
                </Field>
              </div>
            ))}
          </div>
        )}

        {/* Fees */}
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Field label="Cleaning / flat fee (CAD)">
              <input style={inputStyle} type="number" min="0" value={form.cleaning_fee} onChange={(e) => set("cleaning_fee", e.target.value)} placeholder="0" />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Service fee (%)">
              <input style={inputStyle} type="number" min="0" max="100" value={form.service_fee_pct} onChange={(e) => set("service_fee_pct", e.target.value)} placeholder="0" />
            </Field>
          </div>
        </div>

        {/* Deposit (only for verticals that take one) */}
        {cfg.deposit && (
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
            <label className="text-text-primary" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.requires_deposit} onChange={(e) => set("requires_deposit", e.target.checked)} style={{ cursor: "pointer" }} />
              Requires a security deposit
            </label>
            {form.requires_deposit && (
              <div style={{ width: 120 }}>
                <input style={inputStyle} type="number" min="0" value={form.deposit_amount} onChange={(e) => set("deposit_amount", e.target.value)} placeholder="Amount" />
              </div>
            )}
          </div>
        )}

        {/* Instant book */}
        <div style={{ marginBottom: 16 }}>
          <label className="text-text-primary" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={form.instant_book} onChange={(e) => set("instant_book", e.target.checked)} style={{ cursor: "pointer" }} />
            Enable Instant Booking (guests can book immediately without host approval)
          </label>
        </div>

        {/* Photos */}
        <Field label="Photos">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {images.map((img, idx) => (
              <div
                key={idx}
                className="border border-border"
                style={{
                  position: "relative",
                  width: 72,
                  height: 72,
                  borderRadius: 8,
                  overflow: "hidden",
                  cursor: "pointer",
                }}
                onClick={() => setLightboxIdx(idx)}
              >
                <img src={mediaUrl(img)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {/* Kept permanently dark: this control overlays a user-uploaded photo thumbnail
                    of arbitrary color, so a fixed dark chip + white glyph guarantees contrast
                    in both themes (matches the same remove-preview pattern in Social.jsx). */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImages((prev) => prev.filter((_, i) => i !== idx));
                  }}
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.6)",
                    border: "none",
                    color: "#fff",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <label
              className="text-text-secondary"
              style={{
                width: 72,
                height: 72,
                borderRadius: 8,
                border: "1px dashed var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: 24,
              }}
            >
              {uploading ? "…" : "+"}
              <input type="file" accept="image/*" multiple onChange={handleImagePick} style={{ display: "none" }} />
            </label>
          </div>
          {lightboxIdx != null && images[lightboxIdx] && (
            <ImageLightbox images={images.map(mediaUrl)} index={lightboxIdx} onIndexChange={setLightboxIdx} onClose={() => setLightboxIdx(null)} />
          )}
        </Field>

        {msg && (
          <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{msg}</div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button
            onClick={onClose}
            disabled={saving}
            className="border border-border text-text-primary"
            style={{ flex: "0 0 auto", padding: "11px 18px", background: "transparent", borderRadius: 10, fontWeight: 600, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            style={{ flex: 1, padding: "11px 18px", background: ACCENT, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving || uploading ? 0.7 : 1 }}
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : `Publish ${cfg.label.toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
