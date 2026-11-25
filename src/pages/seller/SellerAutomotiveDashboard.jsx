import React from "react";
import { useViewport } from "../../hooks/useViewport.js";
import { useMoney } from "../../hooks/useMoney.js";
import {
  ProviderTopNav,
  SellerAddBtn,
  SellerStatCards,
  SellerRefCodeSection,
  SellerWalletTab,
  SellerEarningsTab,
  SellerReviewsTab,
  SellerEditProfileTab,
  clickableProps,
} from "../../components/shared.jsx";
import { SellerAnalyticsPanel } from "../../components/sellerAnalytics.jsx";
import { ProfileIcon } from "../../components/icons.jsx";
import i18n from "../../i18n/index.js";
import {
  getVehicles,
  createAutomotiveVehicle,
  updateAutomotiveVehicle,
  deleteDriverVehicle,
  getSellerTestDriveRequests,
  updateTestDriveRequestStatus,
  bulkImportAutomotiveVehicles,
} from "../../api/vehicle";
import {
  createBookingListing,
  getMyBookingListings,
  updateBookingListing,
  deleteBookingListing,
  getBookings,
  acceptBooking,
  declineBooking,
  checkInBooking,
  completeBooking,
  getHostBookingReviews,
  getListingReviews,
} from "../../api/booking";
import { uploadImage } from "../../api/shop";
import { connectSocket } from "../../api/socket";
import { getBookingHostAnalytics } from "../../api/analytics";
import { getVerticalProfile } from "../../api/verticalProfile.js";
import { getWalletBalance, getWalletTransactions } from "../../api/user.js";
import { useAutomotiveGate } from "./useAutomotiveGate.jsx";
import { useTheme } from "../../utils/theme.js";

// Mechanic bookings embed phone/email in `notes` (no dedicated columns) — pull them back out.
function parseMechanicBookingNotes(rawNotes) {
  if (!rawNotes) return { phone: null, email: null, extraNotes: null };
  const lines = rawNotes.split("\n");
  const contactIdx = lines.findIndex((l) => l.startsWith("Contact"));
  if (contactIdx === -1) return { phone: null, email: null, extraNotes: rawNotes.trim() || null };
  const contactLine = lines[contactIdx];
  const emailMatch = contactLine.match(/Email:\s*([^\s·]+)/);
  const phoneMatch = contactLine.match(/Phone:\s*([^·]+?)(?=\s*·|$)/);
  const extraNotes = lines.slice(contactIdx + 1).join("\n").trim();
  return {
    email: emailMatch ? emailMatch[1].trim() : null,
    phone: phoneMatch ? phoneMatch[1].trim() : null,
    extraNotes: extraNotes || null,
  };
}

// Maps booking-engine statuses onto the Requests tab's display labels.
const BOOKING_STATUS_LABELS = {
  requested: "Pending",
  awaiting_host: "Pending",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};

function sdCommon(key, opts) {
  return i18n.t(`sellerDash.common.${key}`, opts);
}

function translateSellerStatus(status) {
  if (status == null || status === "") return "—";
  const norm = String(status).toLowerCase().replace(/_/g, " ").trim();
  const key = {
    pending: "statusPending",
    processing: "statusProcessing",
    preparing: "statusPreparing",
    confirmed: "statusConfirmed",
    shipped: "statusShipped",
    fulfilled: "statusFulfilled",
    delivered: "statusDelivered",
    completed: "statusCompleted",
    rejected: "statusRejected",
    cancelled: "statusCancelled",
    canceled: "statusCancelled",
    ready: "readyForPickup",
    "ready for pickup": "readyForPickup",
    "picked up": "statusPickedUp",
    accepted: "statusAccepted",
    rescheduled: "statusRescheduled",
    inactive: "statusInactive",
    available: "statusAvailable",
    sold: "statusSold",
    leased: "statusLeased",
    "under offer": "statusUnderOffer",
    active: "statusActive",
    unavailable: "statusUnavailable",
    paused: "statusPaused",
    declined: "statusDeclined",
    ongoing: "statusOngoing",
    requested: "statusRequested",
    "awaiting host": "statusAwaitingHost",
    "no show": "statusNoShow",
    "in progress": "statusInProgress",
  }[norm];
  return key ? sdCommon(key) : status;
}

const compressImage = (file, maxWidth, maxHeight, quality) => {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      fn(arg);
    };
    const safetyTimer = setTimeout(
      () => finish(reject, new Error('Timed out processing image')),
      20000
    );

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target.result;
    };
    reader.onerror = () => finish(reject, new Error('Failed to read image file'));

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            finish(resolve, compressedFile);
          } else {
            finish(reject, new Error('Failed to compress image'));
          }
        },
        file.type,
        quality
      );
    };

    img.onerror = () => finish(reject, new Error('Failed to load image'));
    reader.readAsDataURL(file);
  });
};

const BULK_TEMPLATE_COLUMNS = [
  "vehicle_type", "make", "model", "year", "price", "color", "condition",
  "mileage", "fuel", "transmission", "engine", "is_negotiable", "description", "images", "video",
];
const BULK_TEMPLATE_EXAMPLE_ROW = {
  vehicle_type: "Car", make: "Honda", model: "Civic", year: "2019", price: "15000", color: "Blue", condition: "Used",
  mileage: "45000", fuel: "Petrol", transmission: "Automatic", engine: "1.5L Turbo", is_negotiable: "false",
  description: "Well maintained, one owner",
  images: "https://example.com/civic-front.jpg,https://example.com/civic-side.jpg",
  video: "https://example.com/civic-walkaround.mp4",
};
const BULK_CSV_MAX_BYTES = 2 * 1024 * 1024; // matches the backend's multer limit

function csvField(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const BULK_PILL_ICON_PATHS = {
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>,
  video: <><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M22 9l-6 3.5 6 3.5V9z" /></>,
  car: <><path d="M5 17h14M6 17V9l2-4h8l2 4v8" /><circle cx="7.5" cy="17.5" r="1.5" /><circle cx="16.5" cy="17.5" r="1.5" /></>,
  link: <><path d="M9 17H7a5 5 0 010-10h2" /><path d="M15 7h2a5 5 0 010 10h-2" /><path d="M8 12h8" /></>,
};

function bulkPillIcon(type, tint) {
  return (
    <span style={{
      width: 34, height: 34, borderRadius: 9, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: `${tint}1f`, border: `1px solid ${tint}40`,
    }}>
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {BULK_PILL_ICON_PATHS[type]}
      </svg>
    </span>
  );
}

const VEHICLE_TYPE_OPTIONS = [
  "Cars",
  "Motorcycles",
  "Trucks",
  "Vans",
  "Commercial Vehicles",
  "Agricultural Vehicles",
  "Construction Equipment",
  "Bicycles",
  "Boats & Watercraft",
  "Other Vehicles",
];

const VEHICLE_FORM_SECTION_ICON_PATHS = {
  car: <><path d="M5 17h14M6 17V9l2-4h8l2 4v8" /><circle cx="7.5" cy="17.5" r="1.5" /><circle cx="16.5" cy="17.5" r="1.5" /></>,
  tag: <><path d="M20.59 13.41L11 22 2 13 11 4h9.59a1 1 0 011 1v8.41z" /><circle cx="16.5" cy="8.5" r="1" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>,
  doc: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>,
};

const VEHICLE_SPEC_ICON_PATHS = {
  tag: VEHICLE_FORM_SECTION_ICON_PATHS.tag,
  type: <><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  gauge: <><circle cx="12" cy="13" r="8" /><path d="M12 13l4-4" /><path d="M9 4h6" /></>,
  fuel: <><path d="M3 22V6a2 2 0 012-2h6a2 2 0 012 2v16" /><path d="M3 10h9" /><path d="M15 6l3 3v9a1.5 1.5 0 003 0V9a2 2 0 00-.6-1.4L18 5" /></>,
  sliders: <><line x1="4" y1="6" x2="20" y2="6" /><circle cx="9" cy="6" r="2" /><line x1="4" y1="12" x2="20" y2="12" /><circle cx="15" cy="12" r="2" /><line x1="4" y1="18" x2="20" y2="18" /><circle cx="9" cy="18" r="2" /></>,
  gear: VEHICLE_FORM_SECTION_ICON_PATHS.gear,
  droplet: <><path d="M12 2s6 7 6 11a6 6 0 01-12 0c0-4 6-11 6-11z" /></>,
  shieldCheck: <><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" /><path d="M9 12l2 2 4-4" /></>,
  car: VEHICLE_FORM_SECTION_ICON_PATHS.car,
};

function VehicleSpecIcon({ icon }) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {VEHICLE_SPEC_ICON_PATHS[icon]}
    </svg>
  );
}

function VehicleSpecRow({ icon, label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>
        <VehicleSpecIcon icon={icon} />
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

const REQUEST_ROW_ICON_PATHS = {
  person: <><path d="M20 21a8 8 0 10-16 0" /><circle cx="12" cy="7" r="4" /></>,
  phone: <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />,
  email: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  note: <><path d="M14 3v4a1 1 0 001 1h4" /><path d="M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 10-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 005.4-5.4z" />,
  chevron: <polyline points="9 6 15 12 9 18" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  check: <polyline points="20 6 9 17 4 12" />,
  x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
};

function RequestRowIcon({ icon, size = 13, color = "var(--color-text-muted)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {REQUEST_ROW_ICON_PATHS[icon]}
    </svg>
  );
}

function RequestInfoLine({ icon, text, italic }) {
  if (!text) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <RequestRowIcon icon={icon} />
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", margin: 0, fontStyle: italic ? "italic" : "normal", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {text}
      </p>
    </div>
  );
}

function InfoIconCircle({ icon, color, tint, size = 34 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: tint(color, "18", "24"), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <RequestRowIcon icon={icon} size={Math.round(size * 0.42)} color={color} />
    </div>
  );
}

function RequestDetailInfoRow({ icon, label, value, color, tint, last }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: last ? "none" : "1px solid var(--color-border-subtle)" }}>
      <InfoIconCircle icon={icon} color={color} tint={tint} />
      <span style={{ fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", flex: 1 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", textAlign: "right" }}>{value}</span>
    </div>
  );
}

// Short blurb under the status badge on the request-detail modal's photo panel.
const REQUEST_STATUS_SUBTEXT = {
  pending: "Waiting for your response",
  requested: "Waiting for your response",
  awaiting_host: "Waiting for your response",
  confirmed: "Appointment confirmed",
  in_progress: "Service in progress",
  completed: "Service completed successfully",
  declined: "Request declined",
  cancelled: "Booking cancelled",
};

function requestStatusSubtext(status) {
  const norm = String(status || "").toLowerCase().replace(/\s+/g, "_");
  return REQUEST_STATUS_SUBTEXT[norm] || "";
}

function formatPreferredTime(timeStr) {
  if (!timeStr) return "—";
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!match) return timeStr;
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const period = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${period}`;
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function formatListedDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function VehicleFormSectionHeader({ icon, label, accent }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, marginBottom: 4 }}>
      <span style={{
        width: 26, height: 26, borderRadius: 7, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `${accent}1f`, border: `1px solid ${accent}40`,
      }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {VEHICLE_FORM_SECTION_ICON_PATHS[icon]}
        </svg>
      </span>
      <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
        {label}
      </h4>
      <div style={{ flex: 1, height: 1, background: "var(--color-wash-3)" }} />
    </div>
  );
}

const MECHANIC_FORM_ICON_PATHS = {
  wrench: <path d="M14.7 6.3a4 4 0 10-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 005.4-5.4z" />,
  layers: <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>,
  list: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
  gear: VEHICLE_FORM_SECTION_ICON_PATHS.gear,
  dollar: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  person: <><path d="M20 21a8 8 0 10-16 0" /><circle cx="12" cy="7" r="4" /></>,
  doc: VEHICLE_FORM_SECTION_ICON_PATHS.doc,
  checklist: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>,
  camera: <><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></>,
  star: <polygon points="12 2 15 8.5 22 9.5 17 14.2 18.2 21 12 17.6 5.8 21 7 14.2 2 9.5 9 8.5 12 2" />,
  alert: <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  building: <><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="9" y1="9" x2="9" y2="9" /><line x1="9" y1="13" x2="9" y2="13" /><line x1="9" y1="17" x2="9" y2="17" /><line x1="15" y1="9" x2="15" y2="9" /><line x1="15" y1="13" x2="15" y2="13" /><line x1="15" y1="17" x2="15" y2="17" /></>,
  truck: <><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>,
  upload: <><path d="M4 14.9A5 5 0 016 5.3 6 6 0 0117.7 8h.3a4 4 0 011 7.9" /><path d="M12 12v9M9 15l3-3 3 3" /></>,
};

function MechanicFieldHeader({ icon, label, subtitle, accent, required }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
      <span style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0, marginTop: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `${accent}1f`, border: `1px solid ${accent}40`,
      }}>
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {MECHANIC_FORM_ICON_PATHS[icon]}
        </svg>
      </span>
      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
          {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
        </p>
        {subtitle && (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", margin: "2px 0 0" }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

const MECHANIC_SERVICE_CATEGORIES = {
  "Maintenance & Service": ["Oil Change", "Filter Replacement", "Fluid Change", "Brake Maintenance", "Battery Service", "Tune-Up", "Scheduled Maintenance", "Inspection", "General Maintenance"],
  Repairs: ["Engine Repair", "Transmission Repair", "Brake Repair", "Suspension Repair", "Steering Repair", "Exhaust Repair", "Cooling System Repair", "Fuel System Repair", "Clutch Repair", "Differential Repair"],
  "Electrical & Diagnostics": ["Computer Diagnostics", "Battery & Charging System", "Alternator Repair", "Starter Repair", "Wiring & Electrical Repair", "Sensor Replacement", "ECU/ECM Diagnostics", "Lighting & Electrical Accessories"],
  "AC & Heating": ["AC Diagnosis", "AC Recharge", "AC Repair", "Compressor Replacement", "Heater Repair", "Climate Control Repair", "Cabin Filter Replacement"],
  "Tires & Wheels": ["Tire Replacement", "Tire Repair", "Tire Rotation", "Wheel Alignment", "Wheel Balancing", "Flat Tire Service", "Tire Pressure Check", "Wheel/Rim Service"],
  "Detailing & Cleaning": ["Full Vehicle Detailing", "Exterior Detailing", "Interior Detailing", "Ceramic Coating", "Paint Correction", "Waxing & Polishing", "Carpet & Upholstery Cleaning", "Headlight Restoration", "Engine Bay Cleaning"],
  "Body & Exterior": ["Dent Repair", "Scratch Repair", "Paint Repair", "Full Body Paint", "Bumper Repair", "Panel Replacement", "Rust Repair", "Paintless Dent Repair"],
  "Glass & Windows": ["Windshield Replacement", "Windshield Repair", "Window Replacement", "Window Tinting", "Sunroof Repair", "Window Regulator Repair"],
  "Performance & Customization": ["Engine Performance Tuning", "ECU Tuning", "Exhaust Upgrade", "Suspension Upgrade", "Brake Upgrade", "Performance Diagnostics", "Vehicle Accessories", "Custom Modifications"],
  "Inspection & Pre-Purchase": ["Pre-Purchase Inspection", "Used Vehicle Inspection", "Safety Inspection", "Emissions Inspection", "Diagnostic Inspection", "Roadworthiness Inspection"],
  "Commercial & Heavy Vehicle": ["Truck Repair", "Fleet Maintenance", "Trailer Repair", "Diesel Engine Service", "Heavy-Duty Diagnostics", "Hydraulic System Repair", "Commercial Brake Service", "Commercial Tire Service"],
};
const MECHANIC_SERVICE_HIGHLIGHTS = ["Quality Parts Used", "Warranty Included", "Quick Service", "Expert Technicians", "24/7 Support"];
const MECHANIC_ESTIMATED_TIME_OPTIONS = ["15 minutes", "30 minutes", "1 hour", "2 hours", "Half day", "Full day", "Multiple days"];

function SellerAutomotiveDashboard() {
  const { isMobile } = useViewport();
  const { money } = useMoney();
  const [theme] = useTheme();
  const [tab, setTab] = React.useState("Overview");
  // The mechanic wallet is a flat strug_wallet balance (no pending/available split — a
  // payout lands the moment a job completes), so pending_balance is always 0 here.
  const fetchMechanicWallet = React.useCallback(
    () => getWalletBalance().then((res) => {
      const bal = Number(res?.balance) || 0;
      return { available_balance: bal, pending_balance: 0, total_earned: bal };
    }),
    []
  );
  const fetchMechanicWalletTx = React.useCallback(() => getWalletTransactions(), []);

  const [hostReviews, setHostReviews] = React.useState([]);
  const [hostReviewsLoading, setHostReviewsLoading] = React.useState(false);
  const [hostReviewsError, setHostReviewsError] = React.useState(null);
  const [hostAvgReview, setHostAvgReview] = React.useState(null);
  const [hostReviewCount, setHostReviewCount] = React.useState(null);
  const refreshHostReviews = React.useCallback(() => {
    setHostReviewsLoading(true);
    setHostReviewsError(null);
    return getHostBookingReviews({ vertical: "mechanic" })
      .then((data) => {
        const payload = data?.data ?? data ?? {};
        const rows = Array.isArray(payload.reviews) ? payload.reviews : [];
        setHostReviews(
          rows.map((r) => ({
            id: r.review_id ?? r.id ?? r.booking_review_id ?? r.booking_id,
            name: r.guest_name || r.user?.name || r.user?.username || "Guest",
            date: r.created_at ? new Date(r.created_at).toLocaleDateString() : "",
            created_at: r.created_at || null,
            stars: Number(r.rating) || 0,
            rating: Number(r.rating) || 0,
            comment: r.review || r.comment || "",
            text: r.review || r.comment || "",
            listing: r.listing_title || null,
            reply: r.reply || r.seller_reply || r.host_reply || null,
          }))
        );
        const avg = payload.avg_rating != null ? Number(payload.avg_rating) : null;
        const count = payload.review_count != null ? Number(payload.review_count) : rows.length;
        setHostAvgReview(Number.isFinite(avg) && count > 0 ? avg : null);
        setHostReviewCount(Number.isFinite(count) ? count : rows.length);
        setHostReviewsError(null);
      })
      .catch(() => {
        setHostReviews([]);
        setHostAvgReview(null);
        setHostReviewCount(null);
        setHostReviewsError(i18n.t("shared.reviewsLoadErrorHint", { defaultValue: "Check your connection and try again." }));
      })
      .finally(() => setHostReviewsLoading(false));
  }, []);
  React.useEffect(() => {
    refreshHostReviews();
  }, [refreshHostReviews]);
  const isLight = theme === "light";
  const color = isLight ? "#c2410c" : "#f97316";
  const titleColor = color;
  const tint = (hex, darkAlpha, lightAlpha) => `${hex}${isLight ? lightAlpha : darkAlpha}`;
  const vehicleFieldLabelStyle = { fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", marginBottom: 6, display: "block" };
  const vehicleFieldInputStyle = { width: "100%", padding: "12px 14px", background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-primary)", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none" };
  const vehicleFormThreeColGrid = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 };
  const requestFilterSelectStyle = {
    padding: "9px 16px",
    minWidth: 170,
    background: "var(--color-surface-raised)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    color: "var(--color-text-primary)",
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    outline: "none",
    cursor: "pointer",
  };
  const vehicleFilterLabelStyle = {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--color-text-muted)",
    fontFamily: "'DM Sans', sans-serif",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };
  const tabs = [
    "Overview",
    "Requests",
    "Vehicles",
    "Services",
    "Earnings",
    "Analytics",
    "Wallet",
    "Reviews",
    "Edit Profile",
  ];
  const [requests, setRequests] = React.useState([]);
  const [showAddVehicleModal, setShowAddVehicleModal] = React.useState(false);
  const [vehicleForm, setVehicleForm] = React.useState({
    vehicle_type: "",
    price: "",
    is_negotiable: false,
    make: "",
    model: "",
    year: "",
    mileage: "",
    fuel: "",
    transmission: "",
    engine: "",
    color: "",
    condition: "",
    description: "",
  });
  const [vehicleImages, setVehicleImages] = React.useState([]);
  const [vehicleVideo, setVehicleVideo] = React.useState(null);
  const [existingVehicleImages, setExistingVehicleImages] = React.useState([]);
  const [existingVehicleVideo, setExistingVehicleVideo] = React.useState(null);
  const [vehicleImageInputKey, setVehicleImageInputKey] = React.useState(0);
  const [processingImages, setProcessingImages] = React.useState(false);
  const [vehicleFormLoading, setVehicleFormLoading] = React.useState(false);
  const [vehicleFormMsg, setVehicleFormMsg] = React.useState("");
  const [imageObjectUrls, setImageObjectUrls] = React.useState([]);
  const [isDraggingVehicleImages, setIsDraggingVehicleImages] = React.useState(false);
  const [isDraggingVehicleVideo, setIsDraggingVehicleVideo] = React.useState(false);
  const [showAddMechanicServiceModal, setShowAddMechanicServiceModal] = React.useState(false);
  const [mechanicServiceForm, setMechanicServiceForm] = React.useState({
    category: "",
    subcategory: "",
    service_type: "workshop",
    price: "",
    currency: "USD",
    estimated_time: "",
    description: "",
    requirements: "",
    workshop_address: "",
    workshop_city: "",
    workshop_zip: "",
    use_profile_address: false,
  });
  const [mechanicProviderProfile, setMechanicProviderProfile] = React.useState(null);
  const [mechanicProviderProfileLoading, setMechanicProviderProfileLoading] = React.useState(false);
  const [mechanicWhatsIncluded, setMechanicWhatsIncluded] = React.useState([]);
  const [mechanicWhatsIncludedInput, setMechanicWhatsIncludedInput] = React.useState("");
  const [mechanicHighlights, setMechanicHighlights] = React.useState([]);
  const [mechanicImages, setMechanicImages] = React.useState([]);
  const [mechanicImageObjectUrls, setMechanicImageObjectUrls] = React.useState([]);
  const [existingMechanicImages, setExistingMechanicImages] = React.useState([]);
  const [mechanicImageInputKey, setMechanicImageInputKey] = React.useState(0);
  const [isDraggingMechanicImages, setIsDraggingMechanicImages] = React.useState(false);
  const [mechanicFormLoading, setMechanicFormLoading] = React.useState(false);
  const [mechanicFormMsg, setMechanicFormMsg] = React.useState("");
  const [mechanicServices, setMechanicServices] = React.useState([]);
  const [mechanicServicesLoading, setMechanicServicesLoading] = React.useState(true);
  const [mechanicServiceCurrentPage, setMechanicServiceCurrentPage] = React.useState(1);
  const mechanicServiceItemsPerPage = 18;
  const [mechanicSearchQuery, setMechanicSearchQuery] = React.useState("");
  const [mechanicCategoryFilter, setMechanicCategoryFilter] = React.useState("all");
  const [mechanicDateFrom, setMechanicDateFrom] = React.useState("");
  const [mechanicDateTo, setMechanicDateTo] = React.useState("");
  const [mechanicSortBy, setMechanicSortBy] = React.useState("newest");
  const [selectedMechanicService, setSelectedMechanicService] = React.useState(null);
  const [selectedMechanicMediaIndex, setSelectedMechanicMediaIndex] = React.useState(0);
  const [showMechanicServiceDetailModal, setShowMechanicServiceDetailModal] = React.useState(false);
  const [showMechanicDeleteConfirmModal, setShowMechanicDeleteConfirmModal] = React.useState(false);
  const [mechanicDeleteLoading, setMechanicDeleteLoading] = React.useState(false);
  const [editingMechanicServiceId, setEditingMechanicServiceId] = React.useState(null);
  const [vehicles, setVehicles] = React.useState([]);
  const [vehiclesLoading, setVehiclesLoading] = React.useState(true);
  const [showBulkImportModal, setShowBulkImportModal] = React.useState(false);
  const [bulkCsvFile, setBulkCsvFile] = React.useState(null);
  const [bulkImporting, setBulkImporting] = React.useState(false);
  const [bulkProgressRows, setBulkProgressRows] = React.useState([]);
  const [bulkResult, setBulkResult] = React.useState(null);
  const [bulkError, setBulkError] = React.useState("");
  const [isDraggingCsv, setIsDraggingCsv] = React.useState(false);
  const bulkCsvInputRef = React.useRef(null);
  const [selectedVehicle, setSelectedVehicle] = React.useState(null);
  const [showVehicleDetailModal, setShowVehicleDetailModal] = React.useState(false);
  const [showTestDriveModal, setShowTestDriveModal] = React.useState(false);
  const [testDriveModalTab, setTestDriveModalTab] = React.useState("PENDING");
  const [testDriveModalPage, setTestDriveModalPage] = React.useState(1);
  const testDriveItemsPerPage = 10;
  const [showServiceRequestsModal, setShowServiceRequestsModal] = React.useState(false);
  const [serviceRequestsModalTab, setServiceRequestsModalTab] = React.useState("Pending");
  const [serviceRequestsModalPage, setServiceRequestsModalPage] = React.useState(1);
  const serviceRequestsItemsPerPage = 10;
  const [showServiceReviewsModal, setShowServiceReviewsModal] = React.useState(false);
  const [serviceReviews, setServiceReviews] = React.useState({ avg_rating: 0, review_count: 0, reviews: [] });
  const [serviceReviewsLoading, setServiceReviewsLoading] = React.useState(false);
  const [serviceReviewsPage, setServiceReviewsPage] = React.useState(1);
  const serviceReviewsPerPage = 10;
  React.useEffect(() => {
    if (!showServiceReviewsModal || !selectedMechanicService) return;
    let cancelled = false;
    setServiceReviewsLoading(true);
    setServiceReviewsPage(1);
    getListingReviews(selectedMechanicService.booking_listing_id, { limit: 50 }).then((res) => {
      if (cancelled) return;
      setServiceReviews(res?.data ?? { avg_rating: 0, review_count: 0, reviews: [] });
      setServiceReviewsLoading(false);
    });
    return () => { cancelled = true; };
  }, [showServiceReviewsModal, selectedMechanicService]);
  const serviceReviewsTotalPages = Math.max(1, Math.ceil(serviceReviews.reviews.length / serviceReviewsPerPage));
  const serviceReviewsPageCurrent = Math.min(serviceReviewsPage, serviceReviewsTotalPages);
  const serviceReviewsPageItems = serviceReviews.reviews.slice(
    (serviceReviewsPageCurrent - 1) * serviceReviewsPerPage,
    serviceReviewsPageCurrent * serviceReviewsPerPage
  );
  const [requestTypeFilter, setRequestTypeFilter] = React.useState("test_drive");
  const [requestStatusFilter, setRequestStatusFilter] = React.useState("all");
  const [requestSortOrder, setRequestSortOrder] = React.useState("latest");
  const [requestsPage, setRequestsPage] = React.useState(1);
  const requestsPerPage = 10;
  const [showRequestDetailModal, setShowRequestDetailModal] = React.useState(false);
  const [selectedRequestDetail, setSelectedRequestDetail] = React.useState(null);
  const [editingVehicleId, setEditingVehicleId] = React.useState(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = React.useState(false);
  const [vehicleCurrentPage, setVehicleCurrentPage] = React.useState(1);
  const vehicleItemsPerPage = 18;
  const [vehicleSearchQuery, setVehicleSearchQuery] = React.useState("");
  const [vehicleTypeFilter, setVehicleTypeFilter] = React.useState("all");
  const [vehicleDateFrom, setVehicleDateFrom] = React.useState("");
  const [vehicleDateTo, setVehicleDateTo] = React.useState("");
  const [vehicleSortBy, setVehicleSortBy] = React.useState("newest");
  const [selectedMediaIndex, setSelectedMediaIndex] = React.useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = React.useState(false);
  const [showPlayOverlay, setShowPlayOverlay] = React.useState(false);
  const videoRef = React.useRef(null);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [isScrubbing, setIsScrubbing] = React.useState(false);
  const progressBarRef = React.useRef(null);

  const seekToClientX = (clientX) => {
    if (!progressBarRef.current || !videoRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    let percent = (clientX - rect.left) / rect.width;
    percent = Math.min(1, Math.max(0, percent));
    const newTime = percent * duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const selectedVehicleImages = React.useMemo(() => {
    if (!selectedVehicle?.images) return [];
    try {
      const parsed = JSON.parse(selectedVehicle.images);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [selectedVehicle]);

  const selectedVehicleMedia = React.useMemo(() => {
    const media = [];
    if (selectedVehicle?.video_url) media.push({ type: "video", url: selectedVehicle.video_url });
    selectedVehicleImages.forEach((url) => media.push({ type: "image", url }));
    return media;
  }, [selectedVehicle, selectedVehicleImages]);

  const goToMedia = (index) => {
    if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
    setIsVideoPlaying(false);
    setSelectedMediaIndex(index);
  };

  const vehicleTestDriveRequests = requests.filter(
    (r) => r.type === "test_drive" && selectedVehicle && r.vehicle_id === selectedVehicle.vehicle_id
  );
  const TEST_DRIVE_TABS = [
    { status: "PENDING", label: "Pending" },
    { status: "CONFIRMED", label: "Accepted" },
    { status: "CANCELLED", label: "Rejected" },
  ];
  const testDriveTabRequests = vehicleTestDriveRequests.filter((r) => r.status === testDriveModalTab);
  const testDriveTotalPages = Math.max(1, Math.ceil(testDriveTabRequests.length / testDriveItemsPerPage));
  const testDriveCurrentPage = Math.min(testDriveModalPage, testDriveTotalPages);
  const testDrivePageRequests = testDriveTabRequests.slice(
    (testDriveCurrentPage - 1) * testDriveItemsPerPage,
    testDriveCurrentPage * testDriveItemsPerPage
  );

  const serviceListingRequests = requests.filter(
    (r) => r.type === "service" && selectedMechanicService && r.service_listing_id === selectedMechanicService.booking_listing_id
  );
  const SERVICE_REQUEST_TABS = [
    { status: "Pending", label: "Pending" },
    { status: "Confirmed", label: "Confirmed" },
    { status: "In Progress", label: "In Progress" },
    { status: "Completed", label: "Completed" },
    { status: "Declined", label: "Declined" },
  ];
  const serviceRequestsTabItems = serviceListingRequests.filter((r) => r.status === serviceRequestsModalTab);
  const serviceRequestsTotalPages = Math.max(1, Math.ceil(serviceRequestsTabItems.length / serviceRequestsItemsPerPage));
  const serviceRequestsCurrentPage = Math.min(serviceRequestsModalPage, serviceRequestsTotalPages);
  const serviceRequestsPageItems = serviceRequestsTabItems.slice(
    (serviceRequestsCurrentPage - 1) * serviceRequestsItemsPerPage,
    serviceRequestsCurrentPage * serviceRequestsItemsPerPage
  );

  const TEST_DRIVE_STATUS_OPTIONS = ["PENDING", "CONFIRMED", "CANCELLED"];
  const SERVICE_STATUS_OPTIONS = ["PENDING", "CONFIRMED", "IN PROGRESS", "COMPLETED", "DECLINED"];
  const ALL_REQUEST_STATUS_OPTIONS = ["PENDING", "CONFIRMED", "IN PROGRESS", "COMPLETED", "DECLINED", "CANCELLED"];
  const REQUEST_STATUS_OPTIONS =
    requestTypeFilter === "test_drive" ? TEST_DRIVE_STATUS_OPTIONS
      : requestTypeFilter === "service" ? SERVICE_STATUS_OPTIONS
        : ALL_REQUEST_STATUS_OPTIONS;
  const REQUEST_TYPE_TABS = [
    { value: "test_drive", label: "Test Drive Requests" },
    { value: "service", label: "Service / Mechanic Requests" },
  ];

  const changeRequestTypeFilter = (value) => {
    setRequestTypeFilter(value);
    const nextOptions = value === "test_drive" ? TEST_DRIVE_STATUS_OPTIONS : value === "service" ? SERVICE_STATUS_OPTIONS : ALL_REQUEST_STATUS_OPTIONS;
    if (!nextOptions.includes(requestStatusFilter)) setRequestStatusFilter("all");
    setRequestsPage(1);
  };

  // Consumes the deep-link globals App.jsx stashes for a "new mechanic booking" notification
  // click, landing on the Service/Mechanic Requests sub-tab instead of the default Overview.
  React.useEffect(() => {
    const consume = () => {
      const nextTab = window.__automotiveOpenTab;
      const nextRequestType = window.__automotiveOpenRequestType;
      if (nextTab == null && nextRequestType == null) return;
      delete window.__automotiveOpenTab;
      delete window.__automotiveOpenRequestType;
      if (nextTab) setTab(nextTab);
      if (nextRequestType) changeRequestTypeFilter(nextRequestType);
    };
    consume();
    window.addEventListener("strug:open-notification-target", consume);
    return () => window.removeEventListener("strug:open-notification-target", consume);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot consume-on-mount/event
  }, []);

  const testDriveRequestsAll = requests.filter((r) => r.type === "test_drive");
  const serviceRequestsAll = requests.filter((r) => r.type === "service");
  const testDrivePendingCountAll = testDriveRequestsAll.filter((r) => String(r.status).toUpperCase() === "PENDING").length;
  const servicePendingCountAll = serviceRequestsAll.filter((r) => String(r.status).toUpperCase() === "PENDING").length;
  const requestTypeCounts = {
    all: requests.length,
    test_drive: testDriveRequestsAll.length,
    service: serviceRequestsAll.length,
  };

  const activeRequestsCount = testDrivePendingCountAll + servicePendingCountAll;
  const EARNING_STATUS_LABELS = ["Confirmed", "In Progress", "Completed"];
  const now = new Date();
  const revenueMtd = serviceRequestsAll
    .filter((r) => EARNING_STATUS_LABELS.includes(r.status))
    .filter((r) => {
      const d = r.requestedAt ? new Date(r.requestedAt) : null;
      return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, r) => sum + (r.total || 0), 0);

  const filteredRequests = requests
    .filter((r) => requestTypeFilter === "all" || r.type === requestTypeFilter)
    .filter((r) => requestStatusFilter === "all" || String(r.status).toUpperCase() === requestStatusFilter)
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.requestedAt || a.date).getTime() || 0;
      const tb = new Date(b.requestedAt || b.date).getTime() || 0;
      return requestSortOrder === "latest" ? tb - ta : ta - tb;
    });
  const requestsTotalPages = Math.max(1, Math.ceil(filteredRequests.length / requestsPerPage));
  const requestsCurrentPage = Math.min(requestsPage, requestsTotalPages);
  const pageRequests = filteredRequests.slice(
    (requestsCurrentPage - 1) * requestsPerPage,
    requestsCurrentPage * requestsPerPage
  );

  const handleRequestRowClick = (r) => {
    setSelectedRequestDetail(r);
    setShowRequestDetailModal(true);
  };

  const resetVehicleFilters = () => {
    setVehicleSearchQuery("");
    setVehicleTypeFilter("all");
    setVehicleDateFrom("");
    setVehicleDateTo("");
    setVehicleSortBy("newest");
    setVehicleCurrentPage(1);
  };

  const resetMechanicFilters = () => {
    setMechanicSearchQuery("");
    setMechanicCategoryFilter("all");
    setMechanicDateFrom("");
    setMechanicDateTo("");
    setMechanicSortBy("newest");
    setMechanicServiceCurrentPage(1);
  };

  const MECHANIC_SORT_OPTIONS = [
    { value: "newest", label: "Newest First" },
    { value: "oldest", label: "Oldest First" },
    { value: "price_asc", label: "Price: Low to High" },
    { value: "price_desc", label: "Price: High to Low" },
    { value: "name_asc", label: "Name (A-Z)" },
  ];

  const VEHICLE_SORT_OPTIONS = [
    { value: "newest", label: "Newest First" },
    { value: "oldest", label: "Oldest First" },
    { value: "price_asc", label: "Price: Low to High" },
    { value: "price_desc", label: "Price: High to Low" },
    { value: "name_asc", label: "Name (A-Z)" },
  ];
  const vehicleTypeOptions = Array.from(new Set([
    ...VEHICLE_TYPE_OPTIONS,
    ...vehicles.map((v) => v.vehicle_type).filter(Boolean),
  ]));
  const vehicleSearchQueryLower = vehicleSearchQuery.trim().toLowerCase();
  const vehicleDateFromTime = vehicleDateFrom ? new Date(vehicleDateFrom).getTime() : null;
  const vehicleDateToTime = vehicleDateTo ? new Date(`${vehicleDateTo}T23:59:59.999`).getTime() : null;
  const filteredVehicles = vehicles
    .filter((v) => {
      if (!vehicleSearchQueryLower) return true;
      const haystack = `${v.make || ""} ${v.model || ""}`.toLowerCase();
      return haystack.includes(vehicleSearchQueryLower);
    })
    .filter((v) => vehicleTypeFilter === "all" || v.vehicle_type === vehicleTypeFilter)
    .filter((v) => {
      if (!vehicleDateFromTime && !vehicleDateToTime) return true;
      const listedTime = v.created_at ? new Date(v.created_at).getTime() : null;
      if (listedTime == null || Number.isNaN(listedTime)) return false;
      if (vehicleDateFromTime && listedTime < vehicleDateFromTime) return false;
      if (vehicleDateToTime && listedTime > vehicleDateToTime) return false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      switch (vehicleSortBy) {
        case "oldest":
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        case "price_asc":
          return (a.price ?? Infinity) - (b.price ?? Infinity);
        case "price_desc":
          return (b.price ?? -Infinity) - (a.price ?? -Infinity);
        case "name_asc":
          return `${a.make || ""} ${a.model || ""}`.localeCompare(`${b.make || ""} ${b.model || ""}`);
        case "newest":
        default:
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
    });
  const vehicleFiltersActive = vehicleSearchQuery.trim() !== "" || vehicleTypeFilter !== "all" || vehicleDateFrom !== "" || vehicleDateTo !== "";
  const vehicleTotalPages = Math.max(1, Math.ceil(filteredVehicles.length / vehicleItemsPerPage));
  const vehiclePageCurrent = Math.min(vehicleCurrentPage, vehicleTotalPages);
  const vehiclePageItems = filteredVehicles.slice(
    (vehiclePageCurrent - 1) * vehicleItemsPerPage,
    vehiclePageCurrent * vehicleItemsPerPage
  );
  const mechanicCategoryOptions = Array.from(new Set([
    ...Object.keys(MECHANIC_SERVICE_CATEGORIES),
    ...mechanicServices.map((s) => s.attributes?.category).filter(Boolean),
  ]));
  const mechanicSearchQueryLower = mechanicSearchQuery.trim().toLowerCase();
  const mechanicDateFromTime = mechanicDateFrom ? new Date(mechanicDateFrom).getTime() : null;
  const mechanicDateToTime = mechanicDateTo ? new Date(`${mechanicDateTo}T23:59:59.999`).getTime() : null;
  const filteredMechanicServices = mechanicServices
    .filter((s) => {
      if (!mechanicSearchQueryLower) return true;
      const attrs = s.attributes || {};
      const haystack = `${s.title || ""} ${attrs.subcategory || ""} ${attrs.category || ""}`.toLowerCase();
      return haystack.includes(mechanicSearchQueryLower);
    })
    .filter((s) => mechanicCategoryFilter === "all" || s.attributes?.category === mechanicCategoryFilter)
    .filter((s) => {
      if (!mechanicDateFromTime && !mechanicDateToTime) return true;
      const listedTime = s.created_at ? new Date(s.created_at).getTime() : null;
      if (listedTime == null || Number.isNaN(listedTime)) return false;
      if (mechanicDateFromTime && listedTime < mechanicDateFromTime) return false;
      if (mechanicDateToTime && listedTime > mechanicDateToTime) return false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      switch (mechanicSortBy) {
        case "oldest":
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        case "price_asc":
          return (a.price ?? Infinity) - (b.price ?? Infinity);
        case "price_desc":
          return (b.price ?? -Infinity) - (a.price ?? -Infinity);
        case "name_asc":
          return (a.title || "").localeCompare(b.title || "");
        case "newest":
        default:
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
    });
  const mechanicFiltersActive = mechanicSearchQuery.trim() !== "" || mechanicCategoryFilter !== "all" || mechanicDateFrom !== "" || mechanicDateTo !== "";
  const mechanicServiceTotalPages = Math.max(1, Math.ceil(filteredMechanicServices.length / mechanicServiceItemsPerPage));
  const mechanicServicePageCurrent = Math.min(mechanicServiceCurrentPage, mechanicServiceTotalPages);
  const mechanicServicePageItems = filteredMechanicServices.slice(
    (mechanicServicePageCurrent - 1) * mechanicServiceItemsPerPage,
    mechanicServicePageCurrent * mechanicServiceItemsPerPage
  );

  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (!showVehicleDetailModal || !selectedVehicle || !selectedVehicle.video_url) return;

      const isVideoSelected = selectedVehicleMedia[selectedMediaIndex]?.type === "video";

      if (!isVideoSelected) return;
      
      if (e.code === 'Space' || e.code === 'KeyK') {
        e.preventDefault();
        if (videoRef.current) {
          if (isVideoPlaying) {
            videoRef.current.pause();
          } else {
            videoRef.current.play();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showVehicleDetailModal, selectedVehicle, selectedVehicleMedia, selectedMediaIndex, isVideoPlaying]);

  React.useEffect(() => {
    if (!isScrubbing) return;

    const handleMouseMove = (e) => seekToClientX(e.clientX);
    const handleMouseUp = () => setIsScrubbing(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, duration]);
  React.useEffect(() => {
    Promise.all([
      getBookings({ role: "host", vertical: "mechanic" }).then((r) => (Array.isArray(r?.data) ? r.data : [])).catch(() => []),
      getSellerTestDriveRequests().then((r) => (Array.isArray(r?.data) ? r.data : [])).catch(() => []),
    ]).then(([mechanicBookings, testDriveRequests]) => {
      const allRequests = [];

      if (Array.isArray(mechanicBookings) && mechanicBookings.length > 0) {
        mechanicBookings.forEach((b) => {
          const { phone, email, extraNotes } = parseMechanicBookingNotes(b.notes);
          let listingPic = null;
          const rawImages = b.booking_listing?.images;
          if (rawImages) {
            try {
              const parsed = Array.isArray(rawImages) ? rawImages : JSON.parse(rawImages);
              if (Array.isArray(parsed) && parsed.length > 0) listingPic = parsed[0];
            } catch { /* images wasn't valid JSON — leave unset */ }
          }
          allRequests.push({
            _id: b.booking_id,
            service_listing_id: b.booking_listing_id,
            customer: b.guest?.name ?? b.guest?.username ?? sdCommon("customer"),
            service: b.booking_listing?.title ?? "Mechanic Service",
            vehicle: "—",
            vehiclePic: listingPic,
            date: b.start_date ? String(b.start_date).slice(0, 10) : "—",
            preferred_time: b.start_time || null,
            phone_number: phone,
            email,
            notes: extraNotes,
            requestedAt: b.created_at || null,
            status: BOOKING_STATUS_LABELS[b.status] ?? "Pending",
            type: "service",
            total: Number(b.total) || 0,
          });
        });
      }

      if (Array.isArray(testDriveRequests) && testDriveRequests.length > 0) {
        testDriveRequests.forEach((td) => {
          const vehicleInfo = td.vehicle
            ? `${td.vehicle.make || ''} ${td.vehicle.model || ''} ${td.vehicle.year || ''}`.trim() || 'Vehicle'
            : '—';
          const buyerName = td.buyer?.name || td.full_name || sdCommon("customer");
          const preferredDate = td.preferred_date ? new Date(td.preferred_date).toISOString().slice(0, 10) : "—";
          let vehiclePic = td.vehicle?.vehicle_pic_url || null;
          if (!vehiclePic && td.vehicle?.images) {
            try {
              const parsed = JSON.parse(td.vehicle.images);
              if (Array.isArray(parsed) && parsed.length > 0) vehiclePic = parsed[0];
            } catch { /* images wasn't valid JSON — leave unset */ }
          }

          allRequests.push({
            _id: td.test_drive_request_id,
            vehicle_id: td.vehicle_id ?? td.vehicle?.vehicle_id ?? null,
            customer: buyerName,
            service: "Test Drive",
            vehicle: vehicleInfo,
            vehiclePic,
            date: preferredDate,
            requestedAt: td.created_at || null,
            status: td.status || "PENDING",
            type: "test_drive",
            preferred_time: td.preferred_time || "—",
            phone_number: td.phone_number || "—",
            email: td.email || "—",
            notes: td.notes || null,
          });
        });
      }

      allRequests.sort((a, b) => new Date(b.date) - new Date(a.date));
      setRequests(allRequests);
    }).catch(() => { });
  }, []);

  const fetchVehicles = async () => {
    try {
      setVehiclesLoading(true);
      const data = await getVehicles();
      setVehicles(data || []);
    } catch (err) {
      console.error("Failed to fetch vehicles:", err);
      setVehicles([]);
    } finally {
      setVehiclesLoading(false);
    }
  };

  React.useEffect(() => {
    fetchVehicles();
    fetchMechanicServices();
  }, []);

  const fetchMechanicServices = async () => {
    try {
      setMechanicServicesLoading(true);
      const res = await getMyBookingListings({ vertical: "mechanic" });
      const arr = Array.isArray(res) ? res : (res?.data ?? []);
      setMechanicServices(arr);
    } catch (err) {
      console.error("Failed to fetch mechanic services:", err);
      setMechanicServices([]);
    } finally {
      setMechanicServicesLoading(false);
    }
  };

  React.useEffect(() => {
    if (tab === "Services") fetchMechanicServices();
  }, [tab]);

  const resetVehicleForm = () => {
    setVehicleForm({
      vehicle_type: "",
      price: "",
      is_negotiable: false,
      make: "",
      model: "",
      year: "",
      mileage: "",
      fuel: "",
      transmission: "",
      engine: "",
      color: "",
      condition: "",
      description: "",
    });
    imageObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    setVehicleImages([]);
    setVehicleVideo(null);
    setExistingVehicleImages([]);
    setExistingVehicleVideo(null);
    setImageObjectUrls([]);
    setEditingVehicleId(null);
    setVehicleFormMsg("");
    setIsDraggingVehicleImages(false);
    setIsDraggingVehicleVideo(false);
    setVehicleImageInputKey((k) => k + 1);
  };

  const closeVehicleFormModal = () => {
    setShowAddVehicleModal(false);
    resetVehicleForm();
  };

  const resetMechanicServiceForm = () => {
    setMechanicServiceForm({
      category: "",
      subcategory: "",
      service_type: "workshop",
      price: "",
      currency: "USD",
      estimated_time: "",
      description: "",
      requirements: "",
      workshop_address: "",
      workshop_city: "",
      workshop_zip: "",
      use_profile_address: false,
    });
    setMechanicProviderProfile(null);
    setMechanicWhatsIncluded([]);
    setMechanicWhatsIncludedInput("");
    setMechanicHighlights([]);
    mechanicImageObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    setMechanicImages([]);
    setMechanicImageObjectUrls([]);
    setExistingMechanicImages([]);
    setMechanicImageInputKey((k) => k + 1);
    setIsDraggingMechanicImages(false);
    setMechanicFormMsg("");
    setEditingMechanicServiceId(null);
  };

  const closeMechanicServiceModal = () => {
    setShowAddMechanicServiceModal(false);
    resetMechanicServiceForm();
  };

  const splitProfileAddress = (raw) => {
    const parts = String(raw || "").split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return { address: "", city: "" };
    if (parts.length === 1) return { address: "", city: parts[0] };
    const hasStreet = parts.length >= 4 || (parts.length === 3 && /\d/.test(parts[0]));
    if (hasStreet) return { address: parts[0], city: parts[1] || "" };
    return { address: "", city: parts[0] };
  };

  const handleUseProfileAddressToggle = async () => {
    const next = !mechanicServiceForm.use_profile_address;
    if (!next) {
      setMechanicServiceForm((f) => ({ ...f, use_profile_address: false }));
      return;
    }
    setMechanicServiceForm((f) => ({ ...f, use_profile_address: true }));
    let profile = mechanicProviderProfile;
    if (!profile) {
      setMechanicProviderProfileLoading(true);
      try {
        const res = await getVerticalProfile("automotive");
        profile = res?.data ?? null;
        setMechanicProviderProfile(profile);
      } catch {
        profile = null;
      } finally {
        setMechanicProviderProfileLoading(false);
      }
    }
    if (profile?.location) {
      const { address, city } = splitProfileAddress(profile.location);
      setMechanicServiceForm((f) => ({ ...f, workshop_address: address, workshop_city: city || f.workshop_city }));
    } else {
      setMechanicFormMsg("No address is saved on your provider profile yet. Add one under Edit Profile → Location.");
    }
  };

  const acceptMechanicImageFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    if (existingMechanicImages.length + mechanicImages.length + files.length > 5) {
      setMechanicFormMsg(`You can select up to 5 photos total. You currently have ${existingMechanicImages.length + mechanicImages.length} selected.`);
      return;
    }

    const invalidFiles = files.filter((file) => !file.type.startsWith("image/"));
    if (invalidFiles.length > 0) {
      setMechanicFormMsg("Please select only image files (JPG, PNG, GIF, etc.)");
      return;
    }

    const oversizedFiles = files.filter((file) => file.size > 5 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      setMechanicFormMsg("Images must be under 5MB each. Please compress your images and try again.");
      return;
    }

    setMechanicFormMsg("");
    try {
      const compressedFiles = await Promise.all(files.map((file) => compressImage(file, 1920, 1080, 0.8)));
      const newObjectUrls = compressedFiles.map((file) => URL.createObjectURL(file));
      setMechanicImages((p) => [...p, ...compressedFiles]);
      setMechanicImageObjectUrls((p) => [...p, ...newObjectUrls]);
      setMechanicImageInputKey((prev) => prev + 1);
    } catch {
      setMechanicFormMsg("Failed to process images. Please try again.");
    }
  };

  const handleMechanicImagesDrop = (e) => {
    e.preventDefault();
    setIsDraggingMechanicImages(false);
    acceptMechanicImageFiles(e.dataTransfer.files);
  };

  const addMechanicWhatsIncludedItem = () => {
    const value = mechanicWhatsIncludedInput.trim();
    if (!value) return;
    setMechanicWhatsIncluded((p) => [...p, value]);
    setMechanicWhatsIncludedInput("");
  };

  const toggleMechanicHighlight = (highlight) => {
    setMechanicHighlights((p) => (p.includes(highlight) ? p.filter((h) => h !== highlight) : [...p, highlight]));
  };

  const openBulkImportModal = () => {
    setBulkCsvFile(null);
    setBulkError("");
    setBulkResult(null);
    setBulkProgressRows([]);
    setIsDraggingCsv(false);
    setShowBulkImportModal(true);
  };

  const downloadBulkImportTemplate = () => {
    const header = BULK_TEMPLATE_COLUMNS.join(",");
    const example = BULK_TEMPLATE_COLUMNS.map((c) => csvField(BULK_TEMPLATE_EXAMPLE_ROW[c])).join(",");
    const blob = new Blob([`${header}\n${example}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vehicle-bulk-import-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const acceptBulkCsvFile = (file) => {
    if (!file) return;
    const looksLikeCsv = /\.csv$/i.test(file.name) || file.type === "text/csv" || file.type === "application/vnd.ms-excel";
    if (!looksLikeCsv) {
      setBulkError("Please choose a .csv file.");
      return;
    }
    if (file.size > BULK_CSV_MAX_BYTES) {
      setBulkError(`That file is too large — max ${(BULK_CSV_MAX_BYTES / (1024 * 1024)).toFixed(0)}MB.`);
      return;
    }
    setBulkError("");
    setBulkCsvFile(file);
  };

  const handleBulkCsvDrop = (e) => {
    e.preventDefault();
    setIsDraggingCsv(false);
    if (bulkImporting) return;
    acceptBulkCsvFile(e.dataTransfer.files?.[0]);
  };

  const acceptVehicleImageFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    if (vehicleImages.length + existingVehicleImages.length + files.length > 8) {
      setVehicleFormMsg(`You can select up to 8 photos total. You currently have ${vehicleImages.length + existingVehicleImages.length} selected.`);
      return;
    }

    const invalidFiles = files.filter((file) => !file.type.startsWith("image/"));
    if (invalidFiles.length > 0) {
      setVehicleFormMsg("Please select only image files (JPG, PNG, GIF, etc.)");
      return;
    }

    const oversizedFiles = files.filter((file) => file.size > 5 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      setVehicleFormMsg("Images must be under 5MB each. Please compress your images and try again.");
      return;
    }

    setVehicleFormMsg("");
    setProcessingImages(true);
    try {
      const compressedFiles = await Promise.all(
        files.map(async (file) => {
          return await compressImage(file, 1920, 1080, 0.8);
        })
      );
      const newObjectUrls = compressedFiles.map((file) => URL.createObjectURL(file));
      setVehicleImages((p) => [...p, ...compressedFiles]);
      setImageObjectUrls((p) => [...p, ...newObjectUrls]);
      setVehicleImageInputKey((prev) => prev + 1);
    } catch (err) {
      setVehicleFormMsg("Failed to process images. Please try again.");
    } finally {
      setProcessingImages(false);
    }
  };

  const handleVehicleImagesDrop = (e) => {
    e.preventDefault();
    setIsDraggingVehicleImages(false);
    if (processingImages) return;
    acceptVehicleImageFiles(e.dataTransfer.files);
  };

  const acceptVehicleVideoFile = (file) => {
    if (!file) return;
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      setVehicleFormMsg("Video must be under 50MB. Please compress your video and try again.");
      return;
    }
    if (!file.type.startsWith("video/")) {
      setVehicleFormMsg("Please select a valid video file.");
      return;
    }
    setVehicleFormMsg("");
    setVehicleVideo(file);
  };

  const handleVehicleVideoDrop = (e) => {
    e.preventDefault();
    setIsDraggingVehicleVideo(false);
    acceptVehicleVideoFile(e.dataTransfer.files?.[0]);
  };

  const handleBulkImport = async () => {
    if (!bulkCsvFile) {
      setBulkError("Choose a CSV file first.");
      return;
    }
    setBulkError("");
    setBulkResult(null);
    setBulkProgressRows([]);
    setBulkImporting(true);

    const jobId = `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const socket = connectSocket();
    const onProgress = (payload) => {
      if (payload.job_id !== jobId || payload.status === "done") return;
      setBulkProgressRows((prev) => {
        const next = prev.filter((r) => r.row !== payload.row);
        next.push(payload);
        next.sort((a, b) => a.row - b.row);
        return next;
      });
    };
    socket.on("vehicle:bulk-import:progress", onProgress);

    try {
      const formData = new FormData();
      formData.append("csv", bulkCsvFile);
      formData.append("job_id", jobId);
      const res = await bulkImportAutomotiveVehicles(formData);
      setBulkResult(res?.data || null);
      if ((res?.data?.created || 0) > 0) {
        await fetchVehicles();
      }
    } catch (err) {
      setBulkError(err?.response?.data?.message || "Bulk import failed. Please try again.");
    } finally {
      socket.off("vehicle:bulk-import:progress", onProgress);
      setBulkImporting(false);
    }
  };

  React.useEffect(() => {
    return () => {
      imageObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imageObjectUrls]);
  const statusColor = {
    Pending: "#f59e0b",
    pending: "#f59e0b",
    PENDING: "#f59e0b",
    Confirmed: "#60a5fa",
    confirmed: "#60a5fa",
    CONFIRMED: "#60a5fa",
    "In Progress": "#a855f7",
    in_progress: "#a855f7",
    "IN PROGRESS": "#a855f7",
    Completed: "#22c55e",
    completed: "#22c55e",
    COMPLETED: "#22c55e",
    Declined: "#ef4444",
    declined: "#ef4444",
    CANCELLED: "#ef4444",
    Cancelled: "#ef4444",
    cancelled: "#ef4444",
  };
  const _autoGate = useAutomotiveGate({ color });
  if (_autoGate) return _autoGate;
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        background: "var(--color-bg)",
        paddingBottom: 24,
      }}
    >
      <ProviderTopNav
        tabs={tabs}
        active={tab}
        onTab={setTab}
        title={sdCommon("automotiveTitle")}
        subtitle={sdCommon("automotiveSubtitle")}
        titleColor={titleColor}
        accentColor={color}
      >
        <SellerAddBtn label={sdCommon("addVehicle")} color={color} onClick={() => {
          resetVehicleForm();
          setShowAddVehicleModal(true);
        }} />
        <SellerAddBtn label="Add Mechanic Service" color={color} onClick={() => {
          resetMechanicServiceForm();
          setShowAddMechanicServiceModal(true);
        }} />
        {tab === "Vehicles" && (
          <button
            onClick={openBulkImportModal}
            style={{
              padding: "10px 18px",
              background: "var(--color-wash-2)",
              border: "1px solid var(--color-border)",
              borderRadius: 24,
              color: "var(--color-text-primary)",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Bulk Add Vehicles
          </button>
        )}
      </ProviderTopNav>
      {(tab === "Overview" || tab === "Analytics" || tab === "Earnings") && (
        <SellerStatCards
          accentColor={color}
          stats={[{ label: sdCommon("revenueMtd"), value: money(revenueMtd), change: null },
          { label: sdCommon("activeRequests"), value: String(activeRequestsCount), change: null },
          { label: sdCommon("vehiclesListed"), value: String(vehicles.length), change: null },
          { label: sdCommon("servicesListed"), value: String(mechanicServices.length), change: null },
          { label: sdCommon("avgRating"), value: hostAvgReview != null ? String(hostAvgReview) : "—", change: null },
          ]}
        />
      )}
      <div
        style={{
          padding: `${isMobile ? "24px 16px 0 16px" : "24px 40px 0 108px"}`,
        }}
      >
        {tab === "Overview" && (
          <div
            style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}
          >
            <div>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--color-text-secondary)",
                  fontFamily: "'DM Sans', sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 14,
                }}
              >
                Recent Requests
              </p>
              {requests.slice(0, 6).map((r, i) => (
                <div
                  key={i}
                  style={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border-subtle)",
                    borderRadius: 12,
                    padding: "14px 18px",
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 6,
                      marginBottom: 6,
                      background: r.type === "test_drive" ? tint("#60a5fa", "20", "30") : tint(color, "20", "30"),
                      color: r.type === "test_drive" ? "#60a5fa" : color,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {r.type === "test_drive" ? "Test Drive" : "Service Request"}
                  </span>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {r.customer} · {r.service}
                    </p>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: tint(statusColor[r.status] || "#888", "22", "33"),
                        color: statusColor[r.status] || "#888",
                      }}
                    >
                      {translateSellerStatus(r.status)}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-secondary)",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {r.type === "test_drive" && r.vehicle && r.vehicle !== "—" ? `${r.vehicle} · ${r.date}` : r.date}
                  </p>
                </div>
              ))}
            </div>
            <SellerRefCodeSection />
          </div>
        )}
        {tab === "Requests" && (
          <div>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
              <div>
                <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 26, color: "var(--color-text-primary)", margin: 0 }}>
                  Requests
                </h2>
                <p style={{ fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", margin: "4px 0 0" }}>
                  Manage all incoming requests for test drives and mechanic services.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <select
                  value={requestTypeFilter}
                  onChange={(e) => changeRequestTypeFilter(e.target.value)}
                  style={requestFilterSelectStyle}
                >
                  <option value="all">All Types</option>
                  <option value="test_drive">Test Drive</option>
                  <option value="service">Service / Mechanic</option>
                </select>
                <select
                  value={requestStatusFilter}
                  onChange={(e) => { setRequestStatusFilter(e.target.value); setRequestsPage(1); }}
                  style={requestFilterSelectStyle}
                >
                  <option value="all">All Status</option>
                  {REQUEST_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{translateSellerStatus(s)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 24 }}>
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 1px 3px var(--color-shadow)", borderRadius: 16, padding: "18px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: tint("#60a5fa", "22", "33"), border: `1px solid ${tint("#60a5fa", "44", "66")}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <RequestRowIcon icon="calendar" size={20} color="#60a5fa" />
                </div>
                <div>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>Test Drive Requests</p>
                  <p style={{ fontSize: 26, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'Barlow Condensed', sans-serif", margin: "2px 0" }}>{testDriveRequestsAll.length}</p>
                  <p style={{ fontSize: 12, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>{testDrivePendingCountAll} pending</p>
                </div>
              </div>
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 1px 3px var(--color-shadow)", borderRadius: 16, padding: "18px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: tint(color, "22", "33"), border: `1px solid ${tint(color, "44", "66")}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <RequestRowIcon icon="wrench" size={20} color={color} />
                </div>
                <div>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>Service / Mechanic Requests</p>
                  <p style={{ fontSize: 26, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'Barlow Condensed', sans-serif", margin: "2px 0" }}>{serviceRequestsAll.length}</p>
                  <p style={{ fontSize: 12, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>{servicePendingCountAll} pending</p>
                </div>
              </div>
            </div>

            {/* Tabs + Sort */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", gap: 10, overflowX: "auto" }}>
                {REQUEST_TYPE_TABS.map((t) => {
                  const active = requestTypeFilter === t.value;
                  return (
                    <button
                      key={t.value}
                      onClick={() => changeRequestTypeFilter(t.value)}
                      style={{
                        background: active ? tint(color, "14", "22") : "transparent",
                        border: active ? `1px solid ${color}` : "1px solid var(--color-border)",
                        borderRadius: 10,
                        padding: "10px 18px",
                        color: active ? color : "var(--color-text-secondary)",
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: "'DM Sans', sans-serif",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.label} ({requestTypeCounts[t.value]})
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif" }}>Sort by:</span>
                <select
                  value={requestSortOrder}
                  onChange={(e) => setRequestSortOrder(e.target.value)}
                  style={requestFilterSelectStyle}
                >
                  <option value="latest">Latest</option>
                  <option value="oldest">Oldest</option>
                </select>
              </div>
            </div>

            {/* List */}
            {pageRequests.length === 0 ? (
              <div style={{ background: "var(--color-wash-1)", border: "1px solid var(--color-border-subtle)", borderRadius: 16, padding: "40px 24px", textAlign: "center" }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "var(--color-text-muted)", margin: 0 }}>
                  No requests match these filters.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pageRequests.map((r, i) => (
                  <div key={r._id ?? i}>
                    <div
                      onClick={() => handleRequestRowClick(r)}
                      style={{
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        boxShadow: "0 1px 3px var(--color-shadow)",
                        borderRadius: 14,
                        padding: "14px 18px",
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        flexWrap: "wrap",
                        cursor: "pointer",
                      }}
                    >
                      {/* Thumbnail */}
                      <div style={{ width: 64, height: 64, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "var(--color-surface-raised)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {r.vehiclePic ? (
                          <img src={r.vehiclePic} alt={r.vehicle} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <RequestRowIcon icon={r.type === "test_drive" ? "calendar" : "wrench"} size={22} color="var(--color-text-muted)" />
                        )}
                      </div>

                      {/* Type badge + title */}
                      <div style={{ minWidth: 170, flex: "1 1 190px" }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: 6,
                            background: r.type === "test_drive" ? tint("#60a5fa", "20", "30") : tint(color, "20", "30"),
                            color: r.type === "test_drive" ? "#60a5fa" : color,
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          {r.type === "test_drive" ? "Test Drive" : "Service Request"}
                        </span>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", margin: "6px 0 2px" }}>
                          {r.type === "test_drive" ? r.vehicle : r.service}
                        </p>
                        {r.type === "service" && r.vehicle && r.vehicle !== "—" && (
                          <p style={{ fontSize: 12, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                            {r.vehicle}
                          </p>
                        )}
                      </div>

                      {/* Customer info */}
                      <div style={{ minWidth: 170, flex: "1 1 190px", display: "flex", flexDirection: "column", gap: 4 }}>
                        <RequestInfoLine icon="person" text={r.customer} />
                        <RequestInfoLine icon="phone" text={r.phone_number} />
                        <RequestInfoLine icon="email" text={r.email} />
                      </div>

                      {/* Date / time / notes */}
                      <div style={{ minWidth: 170, flex: "1 1 190px", display: "flex", flexDirection: "column", gap: 4 }}>
                        <RequestInfoLine icon="calendar" text={formatListedDate(r.date) || r.date} />
                        <RequestInfoLine icon="clock" text={formatPreferredTime(r.preferred_time)} />
                        {r.notes && <RequestInfoLine icon="note" text={r.notes} italic />}
                      </div>

                      {/* Status + requested on + chevron */}
                      <div style={{ display: "flex", alignItems: "center", gap: 14, marginLeft: "auto" }}>
                        {r.type === "test_drive" && String(r.status).toUpperCase() === "PENDING" && r._id && (
                          <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() =>
                                updateTestDriveRequestStatus(r._id, "CANCELLED")
                                  .then(() => setRequests((p) => p.map((x) => (x._id === r._id ? { ...x, status: "CANCELLED" } : x))))
                                  .catch(() => { })
                              }
                              style={{ padding: "7px 14px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 8, color: "#ef4444", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                            >
                              Reject
                            </button>
                            <button
                              onClick={() =>
                                updateTestDriveRequestStatus(r._id, "CONFIRMED")
                                  .then(() => setRequests((p) => p.map((x) => (x._id === r._id ? { ...x, status: "CONFIRMED" } : x))))
                                  .catch(() => { })
                              }
                              style={{ padding: "7px 14px", background: color, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                            >
                              Accept
                            </button>
                          </div>
                        )}
                        {r.type === "service" && (r.status === "Pending" || r.status === "pending") && r._id && (
                          <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() =>
                                declineBooking(r._id)
                                  .then(() => setRequests((p) => p.map((x) => (x._id === r._id ? { ...x, status: "Declined" } : x))))
                                  .catch(() => { })
                              }
                              style={{ padding: "7px 14px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 8, color: "#ef4444", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                            >
                              Decline
                            </button>
                            <button
                              onClick={() =>
                                acceptBooking(r._id)
                                  .then(() => setRequests((p) => p.map((x) => (x._id === r._id ? { ...x, status: "Confirmed" } : x))))
                                  .catch(() => { })
                              }
                              style={{ padding: "7px 14px", background: color, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                            >
                              Accept
                            </button>
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "4px 10px",
                              borderRadius: 20,
                              background: tint(statusColor[r.status] || "#888", "20", "30"),
                              color: statusColor[r.status] || "#888",
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                            }}
                          >
                            {translateSellerStatus(r.status)}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif" }}>
                            Requested on {formatListedDate(r.requestedAt) || formatListedDate(r.date) || "—"}
                          </span>
                        </div>
                        <RequestRowIcon icon="chevron" size={16} color="var(--color-text-muted)" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {requestsTotalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 24 }}>
                <button
                  onClick={() => setRequestsPage((p) => Math.max(1, p - 1))}
                  disabled={requestsCurrentPage === 1}
                  style={{
                    padding: "8px 16px",
                    background: requestsCurrentPage === 1 ? "var(--color-wash-2)" : color,
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    color: requestsCurrentPage === 1 ? "var(--color-text-muted)" : "#fff",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: requestsCurrentPage === 1 ? "not-allowed" : "pointer",
                  }}
                >
                  Previous
                </button>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "var(--color-text-secondary)" }}>
                  Page {requestsCurrentPage} of {requestsTotalPages}
                </span>
                <button
                  onClick={() => setRequestsPage((p) => Math.min(requestsTotalPages, p + 1))}
                  disabled={requestsCurrentPage === requestsTotalPages}
                  style={{
                    padding: "8px 16px",
                    background: requestsCurrentPage === requestsTotalPages ? "var(--color-wash-2)" : color,
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    color: requestsCurrentPage === requestsTotalPages ? "var(--color-text-muted)" : "#fff",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: requestsCurrentPage === requestsTotalPages ? "not-allowed" : "pointer",
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
        {tab === "Vehicles" && (
          <div>
            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--color-text-secondary)",
                fontFamily: "'DM Sans', sans-serif",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 14,
              }}
            >
              Your Vehicles
            </p>

            {!vehiclesLoading && vehicles.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 14,
                  alignItems: "flex-end",
                  marginBottom: 18,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 220px", minWidth: 200 }}>
                  <label style={vehicleFilterLabelStyle}>Search</label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                      <RequestRowIcon icon="search" size={14} color="var(--color-text-muted)" />
                    </span>
                    <input
                      type="text"
                      value={vehicleSearchQuery}
                      onChange={(e) => { setVehicleSearchQuery(e.target.value); setVehicleCurrentPage(1); }}
                      placeholder="Vehicle name or make..."
                      style={{ ...requestFilterSelectStyle, width: "100%", minWidth: 0, padding: "9px 14px 9px 34px", cursor: "text" }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={vehicleFilterLabelStyle}>Vehicle Type</label>
                  <select
                    value={vehicleTypeFilter}
                    onChange={(e) => { setVehicleTypeFilter(e.target.value); setVehicleCurrentPage(1); }}
                    style={requestFilterSelectStyle}
                  >
                    <option value="all">All Vehicle Types</option>
                    {vehicleTypeOptions.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={vehicleFilterLabelStyle}>Listed From</label>
                  <input
                    type="date"
                    value={vehicleDateFrom}
                    onChange={(e) => { setVehicleDateFrom(e.target.value); setVehicleCurrentPage(1); }}
                    style={{ ...requestFilterSelectStyle, minWidth: 150 }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={vehicleFilterLabelStyle}>Listed To</label>
                  <input
                    type="date"
                    value={vehicleDateTo}
                    onChange={(e) => { setVehicleDateTo(e.target.value); setVehicleCurrentPage(1); }}
                    style={{ ...requestFilterSelectStyle, minWidth: 150 }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={vehicleFilterLabelStyle}>Sort By</label>
                  <select
                    value={vehicleSortBy}
                    onChange={(e) => setVehicleSortBy(e.target.value)}
                    style={requestFilterSelectStyle}
                  >
                    {VEHICLE_SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                {vehicleFiltersActive && (
                  <button
                    onClick={resetVehicleFilters}
                    style={{
                      padding: "9px 16px",
                      background: "none",
                      border: "1px solid var(--color-border)",
                      borderRadius: 10,
                      color: "var(--color-text-secondary)",
                      fontSize: 13,
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            )}

            {vehiclesLoading ? (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "var(--color-text-secondary)" }}>
                Loading vehicles...
              </p>
            ) : vehicles.length === 0 ? (
              <div
                style={{
                  background: "var(--color-wash-1)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: 16,
                  padding: "40px 24px",
                  textAlign: "center",
                }}
              >
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "var(--color-text-muted)", marginBottom: 16 }}>
                  No vehicles listed yet
                </p>
                <button
                  onClick={() => {
                    resetVehicleForm();
                    setShowAddVehicleModal(true);
                  }}
                  style={{
                    padding: "12px 24px",
                    background: color,
                    border: "none",
                    borderRadius: 10,
                    color: "#fff",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Add Your First Vehicle
                </button>
              </div>
            ) : filteredVehicles.length === 0 ? (
              <div
                style={{
                  background: "var(--color-wash-1)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: 16,
                  padding: "40px 24px",
                  textAlign: "center",
                }}
              >
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "var(--color-text-muted)", marginBottom: 16 }}>
                  No vehicles match these filters.
                </p>
                <button
                  onClick={resetVehicleFilters}
                  style={{
                    padding: "12px 24px",
                    background: "var(--color-wash-2)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                    color: "var(--color-text-primary)",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: 16,
                  }}
                >
                  {vehiclePageItems
                    .map((vehicle) => {
                      const images = vehicle.images ? JSON.parse(vehicle.images) : [];
                      const displayImage = images.length > 0 ? images[0] : vehicle.vehicle_pic_url;
                      return (
                    <div
                      key={vehicle.vehicle_id}
                      onClick={() => {
                        setSelectedVehicle(vehicle);
                        setSelectedMediaIndex(0);
                        setShowVehicleDetailModal(true);
                      }}
                      style={{
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-border-subtle)",
                        borderRadius: 14,
                        overflow: "hidden",
                        cursor: "pointer",
                        transition: "transform 0.2s, box-shadow 0.2s",
                      }}
                      {...clickableProps(() => {
                        setSelectedVehicle(vehicle);
                        setSelectedMediaIndex(0);
                        setShowVehicleDetailModal(true);
                      })}
                    >
                      {displayImage ? (
                        <div
                          style={{
                            height: 160,
                            backgroundImage: `url(${displayImage})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            height: 160,
                            background: "linear-gradient(135deg, #1e293b, #0f172a)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <svg
                            width={48}
                            height={48}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="rgba(255,255,255,0.2)"
                            strokeWidth="1.5"
                          >
                            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                            <circle cx="7" cy="17" r="2" />
                            <path d="M9 17h6" />
                            <circle cx="17" cy="17" r="2" />
                          </svg>
                        </div>
                      )}
                      <div style={{ padding: "16px" }}>
                        <p
                          style={{
                            fontFamily: "'Barlow Condensed', sans-serif",
                            fontWeight: 700,
                            fontSize: 18,
                            color: "var(--color-text-primary)",
                            marginBottom: 4,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {vehicle.make} {vehicle.model}
                        </p>
                        <p
                          style={{
                            fontFamily: "'DM Sans', sans-serif",
                            fontSize: 12,
                            color: "var(--color-text-secondary)",
                            marginBottom: 8,
                          }}
                        >
                          {vehicle.year} · {vehicle.vehicle_type || "Vehicle"}
                        </p>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <p
                            style={{
                              fontFamily: "'DM Sans', sans-serif",
                              fontSize: 16,
                              fontWeight: 700,
                              color: color,
                            }}
                          >
                            {vehicle.price != null ? money(vehicle.price) : "—"}
                          </p>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "4px 10px",
                              borderRadius: 6,
                              background: "var(--color-wash-3)",
                              color: "var(--color-text-secondary)",
                              fontFamily: "'DM Sans', sans-serif",
                            }}
                          >
                            {vehicle.condition || "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {vehicleTotalPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 24,
                  }}
                >
                  <button
                    onClick={() => setVehicleCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={vehiclePageCurrent === 1}
                    style={{
                      padding: "8px 16px",
                      background: vehiclePageCurrent === 1 ? "var(--color-wash-2)" : color,
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: vehiclePageCurrent === 1 ? "var(--color-text-muted)" : "#fff",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: vehiclePageCurrent === 1 ? "not-allowed" : "pointer",
                    }}
                  >
                    Previous
                  </button>
                  <span
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Page {vehiclePageCurrent} of {vehicleTotalPages}
                  </span>
                  <button
                    onClick={() => setVehicleCurrentPage((prev) => Math.min(vehicleTotalPages, prev + 1))}
                    disabled={vehiclePageCurrent === vehicleTotalPages}
                    style={{
                      padding: "8px 16px",
                      background: vehiclePageCurrent === vehicleTotalPages ? "var(--color-wash-2)" : color,
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: vehiclePageCurrent === vehicleTotalPages ? "var(--color-text-muted)" : "#fff",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: vehiclePageCurrent === vehicleTotalPages ? "not-allowed" : "pointer",
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
              </>
            )}
          </div>
        )}
        {tab === "Services" && (
          <div>
            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--color-text-secondary)",
                fontFamily: "'DM Sans', sans-serif",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 14,
              }}
            >
              Your Services
            </p>

            {!mechanicServicesLoading && mechanicServices.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 14,
                  alignItems: "flex-end",
                  marginBottom: 18,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 220px", minWidth: 200 }}>
                  <label style={vehicleFilterLabelStyle}>Search</label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                      <RequestRowIcon icon="search" size={14} color="var(--color-text-muted)" />
                    </span>
                    <input
                      type="text"
                      value={mechanicSearchQuery}
                      onChange={(e) => { setMechanicSearchQuery(e.target.value); setMechanicServiceCurrentPage(1); }}
                      placeholder="Service or subcategory..."
                      style={{ ...requestFilterSelectStyle, width: "100%", minWidth: 0, padding: "9px 14px 9px 34px", cursor: "text" }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={vehicleFilterLabelStyle}>Category</label>
                  <select
                    value={mechanicCategoryFilter}
                    onChange={(e) => { setMechanicCategoryFilter(e.target.value); setMechanicServiceCurrentPage(1); }}
                    style={requestFilterSelectStyle}
                  >
                    <option value="all">All Categories</option>
                    {mechanicCategoryOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={vehicleFilterLabelStyle}>Listed From</label>
                  <input
                    type="date"
                    value={mechanicDateFrom}
                    onChange={(e) => { setMechanicDateFrom(e.target.value); setMechanicServiceCurrentPage(1); }}
                    style={{ ...requestFilterSelectStyle, minWidth: 150 }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={vehicleFilterLabelStyle}>Listed To</label>
                  <input
                    type="date"
                    value={mechanicDateTo}
                    onChange={(e) => { setMechanicDateTo(e.target.value); setMechanicServiceCurrentPage(1); }}
                    style={{ ...requestFilterSelectStyle, minWidth: 150 }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={vehicleFilterLabelStyle}>Sort By</label>
                  <select
                    value={mechanicSortBy}
                    onChange={(e) => setMechanicSortBy(e.target.value)}
                    style={requestFilterSelectStyle}
                  >
                    {MECHANIC_SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                {mechanicFiltersActive && (
                  <button
                    onClick={resetMechanicFilters}
                    style={{
                      padding: "9px 16px",
                      background: "none",
                      border: "1px solid var(--color-border)",
                      borderRadius: 10,
                      color: "var(--color-text-secondary)",
                      fontSize: 13,
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            )}

            {mechanicServicesLoading ? (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "var(--color-text-secondary)" }}>
                Loading services...
              </p>
            ) : mechanicServices.length === 0 ? (
              <div
                style={{
                  background: "var(--color-wash-1)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: 16,
                  padding: "40px 24px",
                  textAlign: "center",
                }}
              >
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "var(--color-text-muted)", marginBottom: 16 }}>
                  No services listed yet
                </p>
                <button
                  onClick={() => {
                    resetMechanicServiceForm();
                    setShowAddMechanicServiceModal(true);
                  }}
                  style={{
                    padding: "12px 24px",
                    background: color,
                    border: "none",
                    borderRadius: 10,
                    color: "#fff",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Add Your First Service
                </button>
              </div>
            ) : filteredMechanicServices.length === 0 ? (
              <div
                style={{
                  background: "var(--color-wash-1)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: 16,
                  padding: "40px 24px",
                  textAlign: "center",
                }}
              >
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "var(--color-text-muted)", marginBottom: 16 }}>
                  No services match these filters.
                </p>
                <button
                  onClick={resetMechanicFilters}
                  style={{
                    padding: "12px 24px",
                    background: "var(--color-wash-2)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                    color: "var(--color-text-primary)",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 16,
                }}
              >
                {mechanicServicePageItems.map((svc) => {
                  const attrs = svc.attributes || {};
                  const images = Array.isArray(svc.images) ? svc.images : (svc.images ? JSON.parse(svc.images) : []);
                  const displayImage = images.length > 0 ? images[0] : null;
                  const serviceType = attrs.service_type === "mobile" ? "Mobile Service" : "At My Workshop";
                  return (
                    <div
                      key={svc.booking_listing_id}
                      onClick={() => {
                        setSelectedMechanicService(svc);
                        setSelectedMechanicMediaIndex(0);
                        setShowMechanicServiceDetailModal(true);
                      }}
                      style={{
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-border-subtle)",
                        borderRadius: 14,
                        overflow: "hidden",
                        cursor: "pointer",
                      }}
                      {...clickableProps(() => {
                        setSelectedMechanicService(svc);
                        setSelectedMechanicMediaIndex(0);
                        setShowMechanicServiceDetailModal(true);
                      })}
                    >
                      {displayImage ? (
                        <div
                          style={{
                            height: 140,
                            backgroundImage: `url(${displayImage})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            height: 140,
                            background: "linear-gradient(135deg, #1e293b, #0f172a)",
                          }}
                        />
                      )}
                      <div style={{ padding: "16px" }}>
                        <p
                          style={{
                            fontFamily: "'Barlow Condensed', sans-serif",
                            fontWeight: 700,
                            fontSize: 18,
                            color: "var(--color-text-primary)",
                            marginBottom: 4,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {svc.title || attrs.subcategory || attrs.category || "Service"}
                        </p>
                        <p
                          style={{
                            fontFamily: "'DM Sans', sans-serif",
                            fontSize: 12,
                            color: "var(--color-text-secondary)",
                            marginBottom: 10,
                          }}
                        >
                          {attrs.category}{attrs.subcategory ? ` • ${attrs.subcategory}` : ""}
                        </p>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, color }}>
                            {svc.price != null ? money(svc.price) : "—"}
                          </span>
                          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "var(--color-text-muted)" }}>
                            {serviceType}
                          </span>
                        </div>
                        {svc.location && (
                          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
                            {svc.location}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {mechanicServiceTotalPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 24,
                  }}
                >
                  <button
                    onClick={() => setMechanicServiceCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={mechanicServicePageCurrent === 1}
                    style={{
                      padding: "8px 16px",
                      background: mechanicServicePageCurrent === 1 ? "var(--color-wash-2)" : color,
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: mechanicServicePageCurrent === 1 ? "var(--color-text-muted)" : "#fff",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: mechanicServicePageCurrent === 1 ? "not-allowed" : "pointer",
                    }}
                  >
                    Previous
                  </button>
                  <span
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Page {mechanicServicePageCurrent} of {mechanicServiceTotalPages}
                  </span>
                  <button
                    onClick={() => setMechanicServiceCurrentPage((prev) => Math.min(mechanicServiceTotalPages, prev + 1))}
                    disabled={mechanicServicePageCurrent === mechanicServiceTotalPages}
                    style={{
                      padding: "8px 16px",
                      background: mechanicServicePageCurrent === mechanicServiceTotalPages ? "var(--color-wash-2)" : color,
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: mechanicServicePageCurrent === mechanicServiceTotalPages ? "var(--color-text-muted)" : "#fff",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: mechanicServicePageCurrent === mechanicServiceTotalPages ? "not-allowed" : "pointer",
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
              </>
            )}
          </div>
        )}
        {tab === "Earnings" && (
          <div style={{ maxWidth: 500 }}>
            <div
              style={{
                background: "linear-gradient(165deg, var(--color-wash-2), var(--color-wash-1))",
                border: "1px solid var(--color-border)",
                borderRadius: 16,
                boxShadow: "0 12px 34px rgba(0,0,0,0.3)",
                padding: "20px 24px",
                marginBottom: 16,
              }}
            >
              {[
                [sdCommon("serviceRevenue"), "—"],
                [sdCommon("vehicleSales"), "—"],
                [sdCommon("totalMtd"), "—"],
                [sdCommon("nextPayout"), "—"],
              ].map(([l, v], i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingBottom: 12,
                    marginBottom: 12,
                    borderBottom:
                      i < 3 ? "1px solid var(--color-border-subtle)" : "none",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: i === 2 ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: i === 2 ? 700 : 400,
                    }}
                  >
                    {l}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: i === 2 ? "#22c55e" : "var(--color-text-primary)",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "Analytics" && (
          <SellerAnalyticsPanel
            accentColor={color}
            isMobile={isMobile}
            fetchOverview={getBookingHostAnalytics("mechanic")}
            countLabel="Jobs"
            netLabel="Net earnings"
            topTitle="Top services"
            breakdownTitle="Jobs by status"
            emptyHint="Your service jobs and earnings will appear here as orders come in."
          />
        )}
        {tab === "Wallet" && <SellerWalletTab color={color} fetchWallet={fetchMechanicWallet} fetchTransactions={fetchMechanicWalletTx} />}
        {tab === "Reviews" && (
          <SellerReviewsTab
            color={color}
            reviews={hostReviews}
            loading={hostReviewsLoading}
            error={hostReviewsError}
            onRetry={refreshHostReviews}
            avgRating={hostAvgReview}
            reviewCount={hostReviewCount ?? hostReviews.length}
            emptyHint={i18n.t("shared.completeOrdersForReview")}
          />
        )}
        {tab === "Edit Profile" && (
          <SellerEditProfileTab
            config={{
              profileFields: [
                [sdCommon("specialization"), sdCommon("specializationPlaceholderAuto")],
                [sdCommon("certifications"), sdCommon("certificationsPlaceholderAse")],
                [sdCommon("serviceArea"), sdCommon("serviceAreaPlaceholderSuburbs")],
              ],
            }}
            vertical="automotive"
          />
        )}
      </div>
      
      {/* Bulk Add Vehicles Modal */}
      {showBulkImportModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => { if (!bulkImporting) setShowBulkImportModal(false); }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 16,
              width: isMobile ? "92%" : "680px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                Bulk Add Vehicles
              </h3>
              {!bulkImporting && (
                <button
                  onClick={() => setShowBulkImportModal(false)}
                  style={{ background: "none", border: "none", color: "var(--color-text-secondary)", fontSize: 24, cursor: "pointer", lineHeight: 1 }}
                >
                  ×
                </button>
              )}
            </div>

            {!bulkResult && (
              <>
                <p style={{ fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5, marginTop: 0, marginBottom: 16 }}>
                  Upload a CSV file to add multiple vehicles at once.
                </p>

                {/* Info pills — mirrors the limits actually enforced server-side (8 images,
                    1 video, 50 rows) so this can't silently drift from the real caps. */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
                  gap: 10,
                  marginBottom: 16,
                }}>
                  {[
                    { icon: bulkPillIcon("image", "#f97316"), title: "Max 8 Images", sub: "per vehicle" },
                    { icon: bulkPillIcon("video", "#22c55e"), title: "1 Video", sub: "per vehicle" },
                    { icon: bulkPillIcon("car", "#38bdf8"), title: "Up to 50", sub: "vehicles" },
                    { icon: bulkPillIcon("link", "#a78bfa"), title: "Public URLs", sub: "only" },
                  ].map((pill, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: "var(--color-wash-1)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 10,
                      padding: "10px 12px",
                    }}>
                      {pill.icon}
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", margin: 0, whiteSpace: "nowrap" }}>
                          {pill.title}
                        </p>
                        <p style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                          {pill.sub}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <p style={{ fontSize: 11.5, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5, marginTop: 0, marginBottom: 20 }}>
                  Image/video links must open the file directly — not a YouTube, Google Drive, or Dropbox share page.
                </p>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", margin: 0, marginBottom: 3 }}>
                      CSV Template
                    </p>
                    <p style={{ fontSize: 12, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                      Download the template and follow the format.
                    </p>
                  </div>
                  <button
                    onClick={downloadBulkImportTemplate}
                    disabled={bulkImporting}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                      background: "none", border: "none", padding: 0,
                      color: color, fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12.5, fontWeight: 700,
                      cursor: bulkImporting ? "not-allowed" : "pointer",
                    }}
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v13M6 11l6 6 6-6" /><path d="M4 20h16" />
                    </svg>
                    Download CSV Template
                  </button>
                </div>

                <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: 10, marginBottom: 16 }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: "'DM Sans', sans-serif" }}>
                    <thead>
                      <tr style={{ background: "var(--color-wash-2)" }}>
                        {BULK_TEMPLATE_COLUMNS.map((c) => (
                          <th key={c} style={{
                            textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 700,
                            color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.03em",
                            whiteSpace: "nowrap", borderBottom: "1px solid var(--color-border)",
                          }}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {BULK_TEMPLATE_COLUMNS.map((c) => (
                          <td key={c} style={{
                            padding: "8px 12px", fontSize: 12, color: "var(--color-text-secondary)",
                            whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {BULK_TEMPLATE_EXAMPLE_ROW[c]}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", marginTop: 0, marginBottom: 10 }}>
                  Upload CSV
                </p>

                <div
                  onClick={() => !bulkImporting && bulkCsvInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); if (!bulkImporting) setIsDraggingCsv(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDraggingCsv(false); }}
                  onDrop={handleBulkCsvDrop}
                  style={{
                    border: `1.5px dashed ${isDraggingCsv ? color : "var(--color-border)"}`,
                    borderRadius: 12,
                    padding: "32px 20px",
                    textAlign: "center",
                    background: isDraggingCsv ? `${color}14` : "var(--color-wash-1)",
                    cursor: bulkImporting ? "not-allowed" : "pointer",
                    transition: "background 0.15s, border-color 0.15s",
                    marginBottom: 16,
                  }}
                >
                  <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10 }}>
                    <path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
                  </svg>
                  {bulkCsvFile ? (
                    <>
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", margin: 0, marginBottom: 4 }}>
                        {bulkCsvFile.name}
                      </p>
                      <p style={{ fontSize: 12, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                        {(bulkCsvFile.size / 1024).toFixed(0)} KB — click or drop to replace
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", margin: 0, marginBottom: 12 }}>
                        Drag & drop your CSV file here
                      </p>
                      <p style={{ fontSize: 11.5, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", margin: "0 0 12px" }}>
                        or
                      </p>
                      <span
                        style={{
                          display: "inline-block", padding: "9px 22px",
                          background: color, borderRadius: 8, color: "#fff",
                          fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700,
                        }}
                      >
                        Choose File
                      </span>
                    </>
                  )}
                  <p style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", marginTop: 14, marginBottom: 0 }}>
                    Only CSV files are supported. Maximum file size: {(BULK_CSV_MAX_BYTES / (1024 * 1024)).toFixed(0)}MB.
                  </p>
                </div>
                <input
                  ref={bulkCsvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  disabled={bulkImporting}
                  onChange={(e) => acceptBulkCsvFile(e.target.files?.[0])}
                  style={{ display: "none" }}
                />

                {bulkError && (
                  <p style={{ fontSize: 13, color: "#ef4444", fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>
                    {bulkError}
                  </p>
                )}

                {bulkImporting && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", marginBottom: 8 }}>
                      Importing… {bulkProgressRows.filter((r) => r.status !== "processing").length}
                      {bulkProgressRows[0]?.total ? ` / ${bulkProgressRows[0].total}` : ""} vehicles processed
                    </p>
                    <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                      {bulkProgressRows.map((r) => (
                        <div
                          key={r.row}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            fontSize: 12.5,
                            fontFamily: "'DM Sans', sans-serif",
                            padding: "6px 10px",
                            borderRadius: 6,
                            background: "var(--color-wash-1)",
                          }}
                        >
                          <span style={{ color: "var(--color-text-secondary)" }}>Row {r.row}: {r.label}</span>
                          <span style={{
                            color: r.status === "success" ? "#22c55e"
                              : r.status === "error" ? "#ef4444"
                              : r.status === "skipped" ? "#f59e0b"
                              : "var(--color-text-secondary)",
                            fontWeight: 700,
                          }}>
                            {r.status === "processing" ? "Working…"
                              : r.status === "success" ? "Added"
                              : r.status === "skipped" ? "Duplicate"
                              : "Failed"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setShowBulkImportModal(false)}
                    disabled={bulkImporting}
                    style={{
                      padding: "10px 20px",
                      background: "var(--color-wash-3)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 10,
                      color: "var(--color-text-primary)",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: bulkImporting ? "not-allowed" : "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkImport}
                    disabled={bulkImporting || !bulkCsvFile}
                    style={{
                      padding: "10px 20px",
                      background: bulkImporting || !bulkCsvFile ? "rgba(249,115,22,0.35)" : color,
                      border: "none",
                      borderRadius: 10,
                      color: "#fff",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: bulkImporting || !bulkCsvFile ? "not-allowed" : "pointer",
                    }}
                  >
                    {bulkImporting ? "Importing…" : "Import Vehicles"}
                  </button>
                </div>
              </>
            )}

            {bulkResult && (
              <>
                <p style={{ fontSize: 14, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, marginTop: 0 }}>
                  {bulkResult.created} of {bulkResult.total} vehicle{bulkResult.total === 1 ? "" : "s"} added
                  {bulkResult.skipped > 0 ? ` · ${bulkResult.skipped} duplicate${bulkResult.skipped === 1 ? "" : "s"} skipped` : ""}
                </p>
                <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {(bulkResult.results || []).map((r) => (
                    <div
                      key={r.row}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: "var(--color-wash-1)",
                        border: `1px solid ${r.status === "success" ? "rgba(34,197,94,0.3)" : r.status === "skipped" ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)"}`,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ fontSize: 13, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
                          Row {r.row}: {r.label}
                        </span>
                        <span style={{
                          fontSize: 12.5, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                          color: r.status === "success" ? "#22c55e" : r.status === "skipped" ? "#f59e0b" : "#ef4444",
                        }}>
                          {r.status === "success" ? "Added" : r.status === "skipped" ? "Duplicate" : "Failed"}
                        </span>
                      </div>
                      {(r.status === "error" || r.status === "skipped") && (
                        <p style={{ fontSize: 12, color: r.status === "skipped" ? "#f59e0b" : "#ef4444", fontFamily: "'DM Sans', sans-serif", margin: "4px 0 0" }}>
                          {r.message}
                        </p>
                      )}
                      {r.warnings?.length > 0 && r.warnings.map((w, i) => (
                        <p key={i} style={{ fontSize: 12, color: "#f59e0b", fontFamily: "'DM Sans', sans-serif", margin: "4px 0 0" }}>
                          {w}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button
                    onClick={openBulkImportModal}
                    style={{
                      padding: "10px 20px",
                      background: "var(--color-wash-3)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 10,
                      color: "var(--color-text-primary)",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Import Another File
                  </button>
                  <button
                    onClick={() => setShowBulkImportModal(false)}
                    style={{
                      padding: "10px 20px",
                      background: color,
                      border: "none",
                      borderRadius: 10,
                      color: "#fff",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Vehicle Modal */}
      {showAddVehicleModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={closeVehicleFormModal}
        >
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 16,
              width: isMobile ? "90%" : "680px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 20,
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                    fontFamily: "'DM Sans', sans-serif",
                    margin: 0,
                  }}
                >
                  {editingVehicleId ? "Edit Vehicle" : "Add New Vehicle"}
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--color-text-secondary)",
                    fontFamily: "'DM Sans', sans-serif",
                    margin: "4px 0 0",
                  }}
                >
                  {editingVehicleId ? "Update the details for this listing." : "Fill in the details below to list your vehicle for buyers."}
                </p>
              </div>
              <button
                onClick={closeVehicleFormModal}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-text-secondary)",
                  fontSize: 24,
                  cursor: "pointer",
                  flexShrink: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {vehicleFormMsg && (
              <div
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16,
                  color: "#ef4444",
                  fontSize: 13,
                }}
              >
                {vehicleFormMsg}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Vehicle Information */}
            <VehicleFormSectionHeader icon="car" label="Vehicle Information" accent={color} />
            <div style={vehicleFormThreeColGrid}>
              <div>
                <label style={vehicleFieldLabelStyle}>
                  Vehicle Type <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <select
                  value={vehicleForm.vehicle_type}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_type: e.target.value })}
                  style={vehicleFieldInputStyle}
                >
                  <option value="">Select vehicle type</option>
                  {VEHICLE_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={vehicleFieldLabelStyle}>
                  Make <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  value={vehicleForm.make}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })}
                  placeholder="e.g., Toyota, Ford"
                  style={vehicleFieldInputStyle}
                />
              </div>

              <div>
                <label style={vehicleFieldLabelStyle}>
                  Model <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  value={vehicleForm.model}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                  placeholder="e.g., Camry, F-150"
                  style={vehicleFieldInputStyle}
                />
              </div>
            </div>

            <div style={vehicleFormThreeColGrid}>
              <div>
                <label style={vehicleFieldLabelStyle}>
                  Year <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="number"
                  value={vehicleForm.year}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, year: e.target.value })}
                  placeholder="e.g., 2020"
                  style={vehicleFieldInputStyle}
                />
              </div>
            </div>

            {/* Pricing */}
            <VehicleFormSectionHeader icon="tag" label="Pricing" accent={color} />
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ flex: isMobile ? "1 1 100%" : "1 1 280px" }}>
                <label style={vehicleFieldLabelStyle}>
                  Price <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="number"
                  value={vehicleForm.price}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, price: e.target.value })}
                  placeholder="e.g., 25000"
                  style={vehicleFieldInputStyle}
                />
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", margin: "6px 0 0" }}>
                  Enter the asking price for your vehicle
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={vehicleFieldLabelStyle}>Price Type</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setVehicleForm({ ...vehicleForm, is_negotiable: !vehicleForm.is_negotiable })}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      background: vehicleForm.is_negotiable ? color : "var(--color-wash-3)",
                      border: "none",
                      cursor: "pointer",
                      position: "relative",
                      transition: "background 0.2s",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "#fff",
                        position: "absolute",
                        top: 2,
                        left: vehicleForm.is_negotiable ? 22 : 2,
                        transition: "left 0.2s",
                      }}
                    />
                  </button>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                    {vehicleForm.is_negotiable ? "Negotiable" : "Fixed Price"}
                  </span>
                </div>
              </div>
            </div>

            {/* Specifications */}
            <VehicleFormSectionHeader icon="gear" label="Specifications" accent={color} />
            <div style={vehicleFormThreeColGrid}>
              <div>
                <label style={vehicleFieldLabelStyle}>
                  Mileage {vehicleForm.vehicle_type !== 'Bicycles' ? <span style={{ color: "#ef4444" }}>*</span> : <span style={{ color: "var(--color-text-muted)" }}>(optional)</span>}
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number"
                    value={vehicleForm.mileage}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, mileage: e.target.value })}
                    placeholder="e.g., 50000"
                    style={{ ...vehicleFieldInputStyle, flex: 1 }}
                  />
                  <span
                    style={{
                      padding: "12px 14px",
                      background: "var(--color-wash-2)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: "var(--color-text-secondary)",
                      fontSize: 14,
                      fontFamily: "'DM Sans', sans-serif",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Miles
                  </span>
                </div>
              </div>

              <div>
                <label style={vehicleFieldLabelStyle}>
                  Fuel {vehicleForm.vehicle_type !== 'Bicycles' ? <span style={{ color: "#ef4444" }}>*</span> : <span style={{ color: "var(--color-text-muted)" }}>(optional)</span>}
                </label>
                <select
                  value={vehicleForm.fuel}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, fuel: e.target.value })}
                  style={vehicleFieldInputStyle}
                >
                  <option value="">Select fuel type</option>
                  <option value="Petrol">Petrol</option>
                  <option value="Diesel">Diesel</option>
                  <option value="Electric">Electric</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="CNG">CNG</option>
                  <option value="LPG">LPG</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label style={vehicleFieldLabelStyle}>
                  Transmission {vehicleForm.vehicle_type !== 'Bicycles' ? <span style={{ color: "#ef4444" }}>*</span> : <span style={{ color: "var(--color-text-muted)" }}>(optional)</span>}
                </label>
                <select
                  value={vehicleForm.transmission}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, transmission: e.target.value })}
                  style={vehicleFieldInputStyle}
                >
                  <option value="">Select transmission</option>
                  <option value="Manual">Manual</option>
                  <option value="Automatic">Automatic</option>
                  <option value="Semi-Automatic">Semi-Automatic</option>
                  <option value="CVT">CVT</option>
                  <option value="Hybrid">Hybrid</option>
                </select>
              </div>
            </div>

            <div style={vehicleFormThreeColGrid}>
              <div>
                <label style={vehicleFieldLabelStyle}>
                  Engine {vehicleForm.vehicle_type !== 'Bicycles' ? <span style={{ color: "#ef4444" }}>*</span> : <span style={{ color: "var(--color-text-muted)" }}>(optional)</span>}
                </label>
                <input
                  type="text"
                  value={vehicleForm.engine}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, engine: e.target.value })}
                  placeholder="e.g., 2.0L, V6, Electric Motor"
                  style={vehicleFieldInputStyle}
                />
              </div>

              <div>
                <label style={vehicleFieldLabelStyle}>
                  Color <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  value={vehicleForm.color}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })}
                  placeholder="e.g., White, Black"
                  style={vehicleFieldInputStyle}
                />
              </div>

              <div>
                <label style={vehicleFieldLabelStyle}>
                  Condition <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <select
                  value={vehicleForm.condition}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, condition: e.target.value })}
                  style={vehicleFieldInputStyle}
                >
                  <option value="">Select condition</option>
                  <option value="New">New</option>
                  <option value="Used">Used</option>
                  <option value="Certified Pre-Owned">Certified Pre-Owned</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <VehicleFormSectionHeader icon="doc" label="Description" accent={color} />
            <div>
              <label style={vehicleFieldLabelStyle}>
                Description
              </label>
              <textarea
                value={vehicleForm.description}
                onChange={(e) => setVehicleForm({ ...vehicleForm, description: e.target.value.slice(0, 1000) })}
                placeholder="Tell buyers about the vehicle's condition, maintenance history, upgrades, and anything that makes it stand out."
                maxLength={1000}
                style={{
                  ...vehicleFieldInputStyle,
                  minHeight: 100,
                  resize: "vertical",
                }}
              />
              <div style={{ textAlign: "right", fontSize: 12, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>
                {vehicleForm.description.length} / 1000
              </div>
            </div>

            {/* Media */}
            <VehicleFormSectionHeader icon="image" label="Media" accent={color} />
            <div>
              <label style={vehicleFieldLabelStyle}>
                Images (Max 8) <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
                {vehicleImages.length + existingVehicleImages.length < 8 && (
                  <label
                    htmlFor={`vehicle-images-${vehicleImageInputKey}`}
                    onDragOver={(e) => { e.preventDefault(); if (!processingImages) setIsDraggingVehicleImages(true); }}
                    onDragLeave={() => setIsDraggingVehicleImages(false)}
                    onDrop={handleVehicleImagesDrop}
                    style={{
                      flex: "1 1 200px",
                      minHeight: 96,
                      borderRadius: 10,
                      background: isDraggingVehicleImages ? `${color}14` : "var(--color-wash-1)",
                      border: `1.5px dashed ${isDraggingVehicleImages ? color : "var(--color-border)"}`,
                      color: "var(--color-text-secondary)",
                      cursor: processingImages ? "wait" : "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      gap: 4,
                      padding: 10,
                      opacity: processingImages ? 0.6 : 1,
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                  >
                    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 14.9A5 5 0 016 5.3 6 6 0 0117.7 8h.3a4 4 0 011 7.9" />
                      <path d="M12 12v9M9 15l3-3 3 3" />
                    </svg>
                    <span style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
                      {processingImages
                        ? "Processing…"
                        : (<>Drag &amp; drop images here<br />or <span style={{ color, fontWeight: 600 }}>browse files</span></>)}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif" }}>
                      JPG, PNG up to 5MB each
                    </span>
                  </label>
                )}
                <input
                  id={`vehicle-images-${vehicleImageInputKey}`}
                  key={vehicleImageInputKey}
                  type="file"
                  multiple
                  accept="image/*"
                  disabled={processingImages}
                  style={{ display: "none" }}
                  onChange={(e) => acceptVehicleImageFiles(e.target.files)}
                />

                {/* Existing images */}
                {existingVehicleImages.map((url, i) => (
                  <div key={`existing-${i}`} style={{ position: "relative", width: 96, height: 96, flexShrink: 0 }}>
                    <img src={url} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 10 }} />
                    <button
                      onClick={() => setExistingVehicleImages((p) => p.filter((_, j) => j !== i))}
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -6,
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "rgba(0,0,0,0.7)",
                        border: "none",
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {/* New images */}
                {vehicleImages.map((f, i) => (
                  <div key={`new-${i}`} style={{ position: "relative", width: 96, height: 96, flexShrink: 0 }}>
                    <img src={imageObjectUrls[i]} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 10 }} />
                    <button
                      onClick={() => {
                        URL.revokeObjectURL(imageObjectUrls[i]);
                        setVehicleImages((p) => p.filter((_, j) => j !== i));
                        setImageObjectUrls((p) => p.filter((_, j) => j !== i));
                      }}
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -6,
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "rgba(0,0,0,0.7)",
                        border: "none",
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {vehicleImages.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-text-secondary)" }}>
                  {vehicleImages.length} image(s) selected
                </div>
              )}
            </div>

            <div>
              <label style={vehicleFieldLabelStyle}>Video (Max 1)</label>
              {/* Existing video */}
              {existingVehicleVideo && !vehicleVideo && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <video
                    src={existingVehicleVideo}
                    style={{ width: 120, height: 68, objectFit: "cover", borderRadius: 8 }}
                    controls
                  />
                  <button
                    onClick={() => setExistingVehicleVideo(null)}
                    style={{
                      padding: "6px 12px",
                      background: "rgba(239,68,68,0.2)",
                      border: "1px solid rgba(239,68,68,0.4)",
                      borderRadius: 6,
                      color: "#ef4444",
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
              {/* New video upload */}
              <label
                htmlFor="vehicle-video-input"
                onDragOver={(e) => { e.preventDefault(); setIsDraggingVehicleVideo(true); }}
                onDragLeave={() => setIsDraggingVehicleVideo(false)}
                onDrop={handleVehicleVideoDrop}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "20px 14px",
                  background: isDraggingVehicleVideo ? `${color}14` : "var(--color-wash-1)",
                  border: `1.5px dashed ${isDraggingVehicleVideo ? color : "var(--color-border)"}`,
                  borderRadius: 10,
                  color: "var(--color-text-secondary)",
                  fontSize: 13,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                  textAlign: "center",
                  transition: "background 0.15s, border-color 0.15s",
                }}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="6" width="14" height="12" rx="2" /><path d="M22 9l-6 3.5 6 3.5V9z" />
                </svg>
                <span>Drag &amp; drop video here or <span style={{ color, fontWeight: 600 }}>browse</span></span>
              </label>
              <input
                id="vehicle-video-input"
                type="file"
                accept="video/*"
                style={{ display: "none" }}
                onChange={(e) => acceptVehicleVideoFile(e.target.files?.[0])}
              />
              {vehicleVideo && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-text-secondary)" }}>
                  {vehicleVideo.name}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, paddingTop: 8, borderTop: "1px solid var(--color-border)" }}>
              <button
                type="button"
                onClick={closeVehicleFormModal}
                style={{
                  padding: "12px 22px",
                  background: "var(--color-wash-2)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  color: "var(--color-text-primary)",
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
              onClick={async () => {
                setVehicleFormLoading(true);
                setVehicleFormMsg("");

                const isBicycle = vehicleForm.vehicle_type === 'Bicycles';
                
                const requiredFields = [
                  { key: 'vehicle_type', label: 'Vehicle Type' },
                  { key: 'price', label: 'Price' },
                  { key: 'make', label: 'Make' },
                  { key: 'model', label: 'Model' },
                  { key: 'year', label: 'Year' },
                  { key: 'color', label: 'Color' },
                  { key: 'condition', label: 'Condition' },
                ];

                if (!isBicycle) {
                  requiredFields.push(
                    { key: 'fuel', label: 'Fuel Type' },
                    { key: 'transmission', label: 'Transmission' },
                    { key: 'engine', label: 'Engine' }
                  );
                }

                const missingFields = requiredFields.filter(field => {
                  const value = vehicleForm[field.key];
                  if (value == null || value === '') return true;
                  if (typeof value === 'string' && value.trim() === '') return true;
                  return false;
                });

                if (missingFields.length > 0) {
                  const missingFieldNames = missingFields.map(f => f.label).join(', ');
                  setVehicleFormMsg(`Please fill in the required fields: ${missingFieldNames}`);
                  setVehicleFormLoading(false);
                  return;
                }

                try {
                  const formData = new FormData();
                  formData.append("vehicle_type", vehicleForm.vehicle_type);
                  formData.append("price", vehicleForm.price);
                  formData.append("is_negotiable", vehicleForm.is_negotiable ? "true" : "false");
                  formData.append("make", vehicleForm.make);
                  formData.append("model", vehicleForm.model);
                  formData.append("year", vehicleForm.year);
                  formData.append("mileage", vehicleForm.mileage);
                  formData.append("fuel", vehicleForm.fuel);
                  formData.append("transmission", vehicleForm.transmission);
                  formData.append("engine", vehicleForm.engine);
                  formData.append("color", vehicleForm.color);
                  formData.append("condition", vehicleForm.condition);
                  formData.append("description", vehicleForm.description);

                  vehicleImages.forEach((image) => {
                    formData.append("images", image);
                  });

                  if (editingVehicleId && existingVehicleImages.length > 0) {
                    formData.append("existing_images", JSON.stringify(existingVehicleImages));
                  }

                  if (vehicleVideo) {
                    formData.append("video", vehicleVideo);
                  }

                  if (editingVehicleId && existingVehicleVideo && !vehicleVideo) {
                    formData.append("keep_existing_video", "true");
                  }

                  if (editingVehicleId) {
                    await updateAutomotiveVehicle(editingVehicleId, formData);
                  } else {
                    await createAutomotiveVehicle(formData);
                  }
                  await fetchVehicles();
                  setShowAddVehicleModal(false);
                  resetVehicleForm();
                } catch (err) {
                  setVehicleFormMsg(err?.response?.data?.error || err?.response?.data?.message || (editingVehicleId ? "Failed to update vehicle" : "Failed to add vehicle"));
                } finally {
                  setVehicleFormLoading(false);
                }
              }}
              disabled={vehicleFormLoading || processingImages}
              style={{
                padding: "12px 28px",
                background: (vehicleFormLoading || processingImages) ? "rgba(249,115,22,0.5)" : color,
                border: "none",
                borderRadius: 8,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: (vehicleFormLoading || processingImages) ? "not-allowed" : "pointer",
                opacity: (vehicleFormLoading || processingImages) ? 0.7 : 1,
              }}
            >
              {vehicleFormLoading
                ? (editingVehicleId ? "Updating Vehicle..." : "Adding Vehicle...")
                : processingImages
                ? "Processing images…"
                : (editingVehicleId ? "Update Vehicle" : "Add Vehicle")}
            </button>
            </div>
              </div>
            </div>
          </div>
      )}

      {showAddMechanicServiceModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={closeMechanicServiceModal}
        >
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 16,
              width: isMobile ? "94%" : "920px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 12 }}>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                  {editingMechanicServiceId ? "Edit Mechanic Service" : "Add Mechanic Service"}
                </h3>
                <p style={{ fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", margin: "4px 0 0" }}>
                  {editingMechanicServiceId ? "Update the details for this service." : "Fill in the details below to list your service and reach more customers."}
                </p>
              </div>
              <button
                onClick={closeMechanicServiceModal}
                style={{ background: "none", border: "none", color: "var(--color-text-secondary)", fontSize: 24, cursor: "pointer", flexShrink: 0, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {mechanicFormMsg && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: 12, marginBottom: 16, color: "#ef4444", fontSize: 13 }}>
                {mechanicFormMsg}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.6fr 1fr", gap: 24 }}>
              {/* Left column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                  <div>
                    <MechanicFieldHeader icon="layers" label="Category" subtitle="Select the main service category" accent={color} required />
                    <select
                      value={mechanicServiceForm.category}
                      onChange={(e) => setMechanicServiceForm({ ...mechanicServiceForm, category: e.target.value, subcategory: "" })}
                      style={vehicleFieldInputStyle}
                    >
                      <option value="">Select category</option>
                      {Object.keys(MECHANIC_SERVICE_CATEGORIES).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <MechanicFieldHeader icon="list" label="Subcategory" subtitle="Select the specific service" accent={color} required />
                    <select
                      value={mechanicServiceForm.subcategory}
                      onChange={(e) => setMechanicServiceForm({ ...mechanicServiceForm, subcategory: e.target.value })}
                      disabled={!mechanicServiceForm.category}
                      style={{ ...vehicleFieldInputStyle, opacity: mechanicServiceForm.category ? 1 : 0.6, cursor: mechanicServiceForm.category ? "pointer" : "not-allowed" }}
                    >
                      <option value="">Select subcategory</option>
                      {(MECHANIC_SERVICE_CATEGORIES[mechanicServiceForm.category] || []).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <MechanicFieldHeader icon="gear" label="Service Type" subtitle="How do you provide this service?" accent={color} required />
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                    {[
                      { value: "workshop", icon: "building", title: "At My Workshop", subtitle: "Customers visit my location" },
                      { value: "mobile", icon: "truck", title: "Mobile Service", subtitle: "I come to the customer" },
                    ].map((opt) => {
                      const selected = mechanicServiceForm.service_type === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setMechanicServiceForm({ ...mechanicServiceForm, service_type: opt.value })}
                          style={{
                            display: "flex", alignItems: "center", gap: 10, padding: 14, borderRadius: 10, textAlign: "left",
                            background: selected ? tint(color, "16", "1a") : "var(--color-surface-raised)",
                            border: selected ? `2px solid ${color}` : "1px solid var(--color-border)",
                            cursor: "pointer",
                          }}
                        >
                          <span style={{
                            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: `${color}1f`, border: `1px solid ${color}40`,
                          }}>
                            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              {MECHANIC_FORM_ICON_PATHS[opt.icon]}
                            </svg>
                          </span>
                          <span>
                            <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif" }}>{opt.title}</span>
                            <span style={{ display: "block", fontSize: 11, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", marginTop: 1 }}>{opt.subtitle}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {mechanicServiceForm.service_type === "workshop" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div>
                      <MechanicFieldHeader icon="building" label="Workshop Address" subtitle="Where customers should come" accent={color} required />
                      <input
                        type="text"
                        value={mechanicServiceForm.workshop_address}
                        onChange={(e) => setMechanicServiceForm({ ...mechanicServiceForm, workshop_address: e.target.value })}
                        placeholder="Street address"
                        style={{
                          ...vehicleFieldInputStyle,
                          border: `1px solid ${theme === "light" ? "rgba(10,10,14,0.3)" : "rgba(255,255,255,0.22)"}`,
                        }}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                      <div>
                        <MechanicFieldHeader icon="layers" label="City" accent={color} required />
                        <input
                          type="text"
                          value={mechanicServiceForm.workshop_city}
                          onChange={(e) => setMechanicServiceForm({ ...mechanicServiceForm, workshop_city: e.target.value })}
                          placeholder="City"
                          style={{
                            ...vehicleFieldInputStyle,
                            border: `1px solid ${theme === "light" ? "rgba(10,10,14,0.3)" : "rgba(255,255,255,0.22)"}`,
                          }}
                        />
                      </div>
                      <div>
                        <MechanicFieldHeader icon="list" label="ZIP/Postal Code (Optional)" accent={color} />
                        <input
                          type="text"
                          value={mechanicServiceForm.workshop_zip}
                          onChange={(e) => setMechanicServiceForm({ ...mechanicServiceForm, workshop_zip: e.target.value })}
                          placeholder="ZIP/Postal code"
                          style={{ ...vehicleFieldInputStyle, border: `1px solid ${theme === "light" ? "rgba(10,10,14,0.3)" : "rgba(255,255,255,0.22)"}` }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button
                          type="button"
                          onClick={handleUseProfileAddressToggle}
                          disabled={mechanicProviderProfileLoading}
                          style={{
                            width: 44, height: 24, borderRadius: 12, flexShrink: 0,
                            background: mechanicServiceForm.use_profile_address ? color : (theme === "light" ? "rgba(10,10,14,0.22)" : "var(--color-wash-3)"),
                            border: "none", cursor: mechanicProviderProfileLoading ? "wait" : "pointer", position: "relative", transition: "background 0.2s",
                          }}
                        >
                          <div style={{
                            width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute",
                            top: 2, left: mechanicServiceForm.use_profile_address ? 22 : 2, transition: "left 0.2s",
                          }} />
                        </button>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                          {mechanicProviderProfileLoading ? "Loading profile address..." : "Use my profile address"}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", marginLeft: 54 }}>
                        Fills the address and city from your provider profile. ZIP/postal code isn't saved on your profile yet, so add that manually.
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                  <div>
                    <MechanicFieldHeader icon="dollar" label="Price" subtitle="Set your service pricing" accent={color} required />
                    <input
                      type="number"
                      value={mechanicServiceForm.price}
                      onChange={(e) => setMechanicServiceForm({ ...mechanicServiceForm, price: e.target.value })}
                      placeholder="0.00"
                      style={vehicleFieldInputStyle}
                    />
                  </div>

                  <div>
                    <MechanicFieldHeader icon="clock" label="Estimated Time" subtitle="How long does this take?" accent={color} required />
                    <select
                      value={mechanicServiceForm.estimated_time}
                      onChange={(e) => setMechanicServiceForm({ ...mechanicServiceForm, estimated_time: e.target.value })}
                      style={vehicleFieldInputStyle}
                    >
                      <option value="">Select duration</option>
                      {MECHANIC_ESTIMATED_TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <MechanicFieldHeader icon="doc" label="Service Description" subtitle="Describe what this service includes" accent={color} required />
                  <textarea
                    rows={3}
                    value={mechanicServiceForm.description}
                    onChange={(e) => setMechanicServiceForm({ ...mechanicServiceForm, description: e.target.value })}
                    placeholder="Explain the service, what's included, benefits, etc."
                    style={{ ...vehicleFieldInputStyle, resize: "vertical" }}
                  />
                  <div style={{ textAlign: "right", fontSize: 12, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>
                    {mechanicServiceForm.description.trim() ? mechanicServiceForm.description.trim().split(/\s+/).length : 0} / 1000 words
                  </div>
                </div>

                <div>
                  <MechanicFieldHeader icon="checklist" label="What's Included" subtitle="List what's included in this service" accent={color} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={mechanicWhatsIncludedInput}
                      onChange={(e) => setMechanicWhatsIncludedInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMechanicWhatsIncludedItem(); } }}
                      placeholder="e.g. Oil, Filter, Checkup"
                      style={{ ...vehicleFieldInputStyle, flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={addMechanicWhatsIncludedItem}
                      style={{ padding: "0 18px", background: "var(--color-wash-2)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                    >
                      Add
                    </button>
                  </div>
                  {mechanicWhatsIncluded.length === 0 ? (
                    <p style={{ fontSize: 12, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", margin: "8px 0 0" }}>
                      No items added yet
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {mechanicWhatsIncluded.map((item, i) => (
                        <span key={`${item}-${i}`} style={{
                          display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 20,
                          background: "var(--color-wash-2)", border: "1px solid var(--color-border)",
                          fontSize: 12, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif",
                        }}>
                          {item}
                          <button
                            type="button"
                            onClick={() => setMechanicWhatsIncluded((p) => p.filter((_, j) => j !== i))}
                            style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <MechanicFieldHeader icon="camera" label="Service Images" subtitle="Add photos that represent your service" accent={color} />
                  <label
                    htmlFor={`mechanic-images-${mechanicImageInputKey}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingMechanicImages(true); }}
                    onDragLeave={() => setIsDraggingMechanicImages(false)}
                    onDrop={handleMechanicImagesDrop}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                      minHeight: 130, borderRadius: 10, textAlign: "center", padding: 14, cursor: "pointer",
                      background: isDraggingMechanicImages ? `${color}14` : "var(--color-wash-1)",
                      border: `1.5px dashed ${isDraggingMechanicImages ? color : "var(--color-border)"}`,
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                  >
                    <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {MECHANIC_FORM_ICON_PATHS.upload}
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>
                      Upload Images
                    </span>
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif" }}>
                      Drag and drop or click to browse
                    </span>
                    <span style={{ fontSize: 10, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif" }}>
                      Max 5 images • JPG, PNG • 5MB each
                    </span>
                  </label>
                  <input
                    id={`mechanic-images-${mechanicImageInputKey}`}
                    key={mechanicImageInputKey}
                    type="file"
                    multiple
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => acceptMechanicImageFiles(e.target.files)}
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 10 }}>
                    {Array.from({ length: 5 }).map((_, i) => {
                      const existingUrl = existingMechanicImages[i];
                      const newIdx = i - existingMechanicImages.length;
                      const newUrl = newIdx >= 0 ? mechanicImageObjectUrls[newIdx] : null;
                      const url = existingUrl || newUrl;
                      return (
                        <div key={i} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 8, overflow: "hidden", background: "var(--color-wash-1)", border: "1px dashed var(--color-border)" }}>
                          {url && (
                            <>
                              <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              <button
                                type="button"
                                onClick={() => {
                                  if (existingUrl) {
                                    setExistingMechanicImages((p) => p.filter((_, j) => j !== i));
                                  } else {
                                    URL.revokeObjectURL(mechanicImageObjectUrls[newIdx]);
                                    setMechanicImages((p) => p.filter((_, j) => j !== newIdx));
                                    setMechanicImageObjectUrls((p) => p.filter((_, j) => j !== newIdx));
                                  }
                                }}
                                style={{
                                  position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: "50%",
                                  background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", cursor: "pointer",
                                  fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                                }}
                              >
                                ×
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <MechanicFieldHeader icon="star" label="Service Highlights" subtitle="Select what makes your service special" accent={color} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {MECHANIC_SERVICE_HIGHLIGHTS.map((h) => (
                      <label key={h} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={mechanicHighlights.includes(h)}
                          onChange={() => toggleMechanicHighlight(h)}
                          style={{ width: 15, height: 15, accentColor: color, cursor: "pointer" }}
                        />
                        <span style={{ fontSize: 13, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif" }}>{h}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <MechanicFieldHeader icon="alert" label="Requirements (Optional)" subtitle="Any requirements for this service" accent={color} />
                  <input
                    type="text"
                    value={mechanicServiceForm.requirements}
                    onChange={(e) => setMechanicServiceForm({ ...mechanicServiceForm, requirements: e.target.value })}
                    placeholder="e.g. Vehicle model, Year, Mileage range"
                    style={vehicleFieldInputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, paddingTop: 20, marginTop: 20, borderTop: "1px solid var(--color-border)" }}>
              <button
                type="button"
                onClick={closeMechanicServiceModal}
                style={{
                  padding: "12px 22px", background: "var(--color-wash-2)", border: "1px solid var(--color-border)", borderRadius: 8,
                  color: "var(--color-text-primary)", fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setMechanicFormLoading(true);
                  setMechanicFormMsg("");

                  const requiredFields = [
                    { key: "category", label: "Category" },
                    { key: "subcategory", label: "Subcategory" },
                    { key: "price", label: "Price" },
                    { key: "estimated_time", label: "Estimated Time" },
                    { key: "description", label: "Service Description" },
                    ...(mechanicServiceForm.service_type === "workshop" ? [
                      { key: "workshop_address", label: "Workshop Address" },
                      { key: "workshop_city", label: "City" },
                    ] : []),
                  ];
                  const missingFields = requiredFields.filter((f) => {
                    const value = mechanicServiceForm[f.key];
                    return value == null || String(value).trim() === "";
                  });
                  if (missingFields.length > 0) {
                    setMechanicFormMsg(`Please fill in the required fields: ${missingFields.map((f) => f.label).join(", ")}`);
                    setMechanicFormLoading(false);
                    return;
                  }

                  try {
                    const uploaded = await Promise.all(mechanicImages.map((f) => uploadImage(f)));
                    const imageUrls = uploaded.map((r) => r?.url).filter(Boolean);

                    const isWorkshop = mechanicServiceForm.service_type === "workshop";
                    const workshopLocation = isWorkshop
                      ? [mechanicServiceForm.workshop_address, mechanicServiceForm.workshop_city, mechanicServiceForm.workshop_zip]
                          .map((v) => (v || "").trim())
                          .filter(Boolean)
                          .join(", ")
                      : undefined;

                    const payload = {
                      title: mechanicServiceForm.subcategory || mechanicServiceForm.category,
                      description: mechanicServiceForm.description,
                      price: mechanicServiceForm.price,
                      price_unit: "visit",
                      currency: mechanicServiceForm.currency,
                      location: workshopLocation || undefined,
                      attributes: {
                        category: mechanicServiceForm.category,
                        subcategory: mechanicServiceForm.subcategory,
                        service_type: mechanicServiceForm.service_type,
                        estimated_time: mechanicServiceForm.estimated_time,
                        whats_included: mechanicWhatsIncluded,
                        highlights: mechanicHighlights,
                        tags: mechanicHighlights,
                        requirements: mechanicServiceForm.requirements,
                        ...(isWorkshop ? {
                          workshop_address: mechanicServiceForm.workshop_address,
                          workshop_city: mechanicServiceForm.workshop_city,
                          workshop_zip: mechanicServiceForm.workshop_zip,
                        } : {}),
                      },
                      images: [...existingMechanicImages, ...imageUrls],
                    };

                    if (editingMechanicServiceId) {
                      await updateBookingListing(editingMechanicServiceId, payload);
                    } else {
                      await createBookingListing({ ...payload, vertical: "mechanic" });
                    }
                    setShowAddMechanicServiceModal(false);
                    resetMechanicServiceForm();
                    fetchMechanicServices();
                  } catch (err) {
                    setMechanicFormMsg(err?.response?.data?.error || err?.response?.data?.message || (editingMechanicServiceId ? "Failed to update service" : "Failed to publish service"));
                  } finally {
                    setMechanicFormLoading(false);
                  }
                }}
                disabled={mechanicFormLoading}
                style={{
                  padding: "12px 28px", background: mechanicFormLoading ? `${color}80` : color, border: "none", borderRadius: 8,
                  color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                  cursor: mechanicFormLoading ? "not-allowed" : "pointer", opacity: mechanicFormLoading ? 0.7 : 1,
                }}
              >
                {mechanicFormLoading
                  ? (editingMechanicServiceId ? "Saving..." : "Publishing...")
                  : (editingMechanicServiceId ? "Save Changes" : "Publish Service")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mechanic Service Detail Modal */}
      {showMechanicServiceDetailModal && selectedMechanicService && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(8px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setShowMechanicServiceDetailModal(false)}
        >
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 20,
              maxWidth: 960,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: isMobile ? "24px" : "32px",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowMechanicServiceDetailModal(false)}
              style={{
                position: "absolute",
                top: isMobile ? 16 : 24,
                right: isMobile ? 16 : 24,
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--color-wash-3)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
                fontSize: 18,
                lineHeight: 1,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1,
              }}
            >
              ×
            </button>

            {(() => {
              const svc = selectedMechanicService;
              const attrs = svc.attributes || {};
              const images = Array.isArray(svc.images) ? svc.images : (svc.images ? JSON.parse(svc.images) : []);
              const isWorkshop = attrs.service_type !== "mobile";
              const locationValue = isWorkshop
                ? [attrs.workshop_address, attrs.workshop_city, attrs.workshop_zip].filter(Boolean).join(", ") || svc.location || "—"
                : "Mobile — comes to the customer";

              const activeIdx = Math.min(selectedMechanicMediaIndex, Math.max(images.length - 1, 0));

              return (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "1.15fr 1fr",
                      gap: 28,
                      marginBottom: 20,
                    }}
                  >
                  {/* Media Gallery + Description */}
                  <div>
                    <div
                      style={{
                        position: "relative",
                        paddingBottom: "60%",
                        borderRadius: 14,
                        border: "1px solid var(--color-border)",
                        overflow: "hidden",
                        marginBottom: 12,
                        background: "#000",
                      }}
                    >
                      {images.length > 0 ? (
                        <>
                          <div
                            style={{
                              position: "absolute",
                              top: 12,
                              left: 12,
                              zIndex: 1,
                              padding: "4px 10px",
                              borderRadius: 20,
                              background: "rgba(0,0,0,0.6)",
                              backdropFilter: "blur(6px)",
                              color: "#fff",
                              fontSize: 12,
                              fontWeight: 600,
                              fontFamily: "'DM Sans', sans-serif",
                            }}
                          >
                            {activeIdx + 1} / {images.length}
                          </div>
                          <img
                            src={images[activeIdx]}
                            alt={`Service image ${activeIdx + 1}`}
                            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                          />
                          {images.length > 1 && (
                            <>
                              <button
                                onClick={() => setSelectedMechanicMediaIndex(activeIdx > 0 ? activeIdx - 1 : images.length - 1)}
                                style={{
                                  position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                                  background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)",
                                  borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                                }}
                              >
                                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                              </button>
                              <button
                                onClick={() => setSelectedMechanicMediaIndex(activeIdx < images.length - 1 ? activeIdx + 1 : 0)}
                                style={{
                                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                                  background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)",
                                  borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                                }}
                              >
                                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                              </button>
                            </>
                          )}
                        </>
                      ) : (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                            {MECHANIC_FORM_ICON_PATHS.camera}
                          </svg>
                        </div>
                      )}
                    </div>

                    {images.length > 1 && (
                      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                        {images.map((url, i) => (
                          <button
                            key={i}
                            onClick={() => setSelectedMechanicMediaIndex(i)}
                            style={{
                              position: "relative", width: 60, height: 60, borderRadius: 8,
                              border: activeIdx === i ? `1px solid ${color}` : "1px solid var(--color-border)",
                              overflow: "hidden", cursor: "pointer", padding: 0, background: "transparent", flexShrink: 0,
                            }}
                          >
                            <img src={url} alt={`Thumbnail ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Description */}
                    {svc.description && (
                      <div style={{ marginTop: 16 }}>
                        <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", margin: "0 0 8px" }}>
                          Description
                        </h4>
                        <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", margin: 0, whiteSpace: "pre-wrap" }}>
                          {svc.description}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Info Panel */}
                  <div>
                    <p style={{ fontSize: 12, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                      {attrs.category}{attrs.subcategory ? ` • ${attrs.subcategory}` : ""}
                    </p>
                    <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 26, color: "var(--color-text-primary)", margin: "0 0 4px" }}>
                      {svc.title || attrs.subcategory || attrs.category || "Service"}
                    </h3>
                    {svc.review_count > 0 ? (
                      <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", margin: "0 0 8px" }}>
                        <span style={{ color: "#f59e0b" }}>★</span>
                        {Number(svc.avg_rating ?? 0).toFixed(1)}
                        <span className="text-text-muted">({svc.review_count} review{svc.review_count === 1 ? "" : "s"})</span>
                      </p>
                    ) : (
                      <p className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", margin: "0 0 8px" }}>No reviews yet</p>
                    )}
                    <p style={{ fontSize: 24, fontWeight: 800, color, fontFamily: "'Barlow Condensed', sans-serif", margin: "0 0 16px" }}>
                      {svc.price != null ? money(svc.price) : "—"}
                    </p>

                    <div style={{ borderTop: "1px solid var(--color-border)" }}>
                      <VehicleSpecRow icon="gear" label="Service Type" value={isWorkshop ? "At My Workshop" : "Mobile Service"} />
                      <VehicleSpecRow icon="calendar" label="Estimated Time" value={attrs.estimated_time || "—"} />
                      <VehicleSpecRow icon="tag" label="Location" value={locationValue} />
                    </div>
                  </div>
                  </div>

                  {Array.isArray(attrs.whats_included) && attrs.whats_included.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                        What's Included
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {attrs.whats_included.map((item, i) => (
                          <span key={i} style={{ padding: "6px 12px", background: "var(--color-wash-2)", border: "1px solid var(--color-border)", borderRadius: 20, fontSize: 12, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif" }}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(attrs.highlights) && attrs.highlights.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                        Highlights
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {attrs.highlights.map((item, i) => (
                          <span key={i} style={{ padding: "6px 12px", background: `${color}1f`, border: `1px solid ${color}40`, borderRadius: 8, fontSize: 12, color, fontFamily: "'DM Sans', sans-serif" }}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {attrs.requirements && (
                    <div style={{ marginBottom: 20 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                        Requirements
                      </p>
                      <p style={{ fontSize: 14, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                        {attrs.requirements}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div
                    style={{
                      marginTop: 24,
                      paddingTop: 20,
                      borderTop: "1px solid var(--color-border)",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <button
                      onClick={() => {
                        setMechanicServiceForm({
                          category: attrs.category || "",
                          subcategory: attrs.subcategory || "",
                          service_type: attrs.service_type || "workshop",
                          price: svc.price ?? "",
                          currency: svc.currency || "USD",
                          estimated_time: attrs.estimated_time || "",
                          description: svc.description || "",
                          requirements: attrs.requirements || "",
                          workshop_address: attrs.workshop_address || "",
                          workshop_city: attrs.workshop_city || "",
                          workshop_zip: attrs.workshop_zip || "",
                          use_profile_address: false,
                        });
                        setMechanicWhatsIncluded(Array.isArray(attrs.whats_included) ? attrs.whats_included : []);
                        setMechanicHighlights(Array.isArray(attrs.highlights) ? attrs.highlights : []);
                        setMechanicImages([]);
                        setMechanicImageObjectUrls([]);
                        setExistingMechanicImages(images);
                        setEditingMechanicServiceId(svc.booking_listing_id);
                        setShowMechanicServiceDetailModal(false);
                        setShowAddMechanicServiceModal(true);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 18px",
                        background: "var(--color-wash-2)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 10,
                        color: "var(--color-text-primary)",
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                      Edit Service
                    </button>
                    <button
                      onClick={() => setShowMechanicDeleteConfirmModal(true)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 18px",
                        background: "rgba(239,68,68,0.12)",
                        border: "1px solid rgba(239,68,68,0.35)",
                        borderRadius: 10,
                        color: "#ef4444",
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" /></svg>
                      Delete Service
                    </button>
                    <button
                      onClick={() => {
                        setShowMechanicServiceDetailModal(false);
                        setShowServiceReviewsModal(true);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginLeft: "auto",
                        padding: "10px 18px",
                        background: "var(--color-wash-2)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 10,
                        color: "var(--color-text-primary)",
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                      Reviews
                    </button>
                    <button
                      onClick={() => {
                        setShowMechanicServiceDetailModal(false);
                        setServiceRequestsModalTab("Pending");
                        setServiceRequestsModalPage(1);
                        setShowServiceRequestsModal(true);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 20px",
                        background: color,
                        border: "none",
                        borderRadius: 10,
                        color: "#fff",
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                      Service Requests
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Service Reviews Modal (per-listing, opened from the service detail modal) */}
      {showServiceReviewsModal && selectedMechanicService && (
        <div
          onClick={() => setShowServiceReviewsModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface-raised border border-border"
            style={{ borderRadius: 20, padding: 24, width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, color: "var(--color-text-primary)", margin: 0 }}>Reviews</h3>
                <p className="text-text-muted" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", margin: "2px 0 0" }}>{selectedMechanicService.title || "Service"}</p>
              </div>
              <button onClick={() => setShowServiceReviewsModal(false)} className="text-text-secondary" style={{ background: "none", border: "none", fontSize: 22, lineHeight: 1, cursor: "pointer" }}>&#215;</button>
            </div>
            {serviceReviewsLoading ? (
              <p className="text-text-muted" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", textAlign: "center", padding: "24px 0" }}>Loading…</p>
            ) : serviceReviews.reviews.length === 0 ? (
              <div style={{ textAlign: "center", padding: "36px 0" }}>
                <p className="text-text-muted" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "0.04em", textTransform: "uppercase" }}>No reviews yet</p>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: "var(--color-text-primary)", fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {Number(serviceReviews.avg_rating || 0).toFixed(1)}
                  </span>
                  <span style={{ color: "#f59e0b", fontSize: 16 }}>★</span>
                  <span className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>({serviceReviews.review_count} review{serviceReviews.review_count === 1 ? "" : "s"})</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {serviceReviewsPageItems.map((r) => {
                    const reviewerName = r.user?.name?.trim() || r.user?.username?.trim() || "Anonymous";
                    return (
                      <div key={r.booking_review_id} className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "16px 18px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 30, height: 30, borderRadius: "50%", background: color + "33", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color }}>{reviewerName[0]}</div>
                            <div>
                              <p className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", margin: 0 }}>{reviewerName}</p>
                              <p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", margin: 0 }}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}</p>
                            </div>
                          </div>
                          <span style={{ fontSize: 13, color: "#f59e0b", flexShrink: 0 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                        </div>
                        {r.review && (
                          <p className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5, margin: 0 }}>{r.review}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {serviceReviewsTotalPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 20 }}>
                    <button
                      onClick={() => setServiceReviewsPage((prev) => Math.max(1, prev - 1))}
                      disabled={serviceReviewsPageCurrent === 1}
                      style={{
                        padding: "8px 16px",
                        background: serviceReviewsPageCurrent === 1 ? "var(--color-wash-2)" : color,
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        color: serviceReviewsPageCurrent === 1 ? "var(--color-text-muted)" : "#fff",
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: serviceReviewsPageCurrent === 1 ? "not-allowed" : "pointer",
                      }}
                    >
                      Previous
                    </button>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "var(--color-text-secondary)" }}>
                      Page {serviceReviewsPageCurrent} of {serviceReviewsTotalPages}
                    </span>
                    <button
                      onClick={() => setServiceReviewsPage((prev) => Math.min(serviceReviewsTotalPages, prev + 1))}
                      disabled={serviceReviewsPageCurrent === serviceReviewsTotalPages}
                      style={{
                        padding: "8px 16px",
                        background: serviceReviewsPageCurrent === serviceReviewsTotalPages ? "var(--color-wash-2)" : color,
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        color: serviceReviewsPageCurrent === serviceReviewsTotalPages ? "var(--color-text-muted)" : "#fff",
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: serviceReviewsPageCurrent === serviceReviewsTotalPages ? "not-allowed" : "pointer",
                      }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Mechanic Service Delete Confirm Modal */}
      {showMechanicDeleteConfirmModal && selectedMechanicService && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(8px)",
            zIndex: 1001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setShowMechanicDeleteConfirmModal(false)}
        >
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 20,
              maxWidth: 400,
              width: "100%",
              padding: isMobile ? "24px" : "32px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: 22,
                color: "var(--color-text-primary)",
                margin: "0 0 12px 0",
              }}
            >
              Delete Service
            </h3>
            <p
              style={{
                fontSize: 14,
                color: "var(--color-text-secondary)",
                fontFamily: "'DM Sans', sans-serif",
                margin: "0 0 24px 0",
                lineHeight: 1.5,
              }}
            >
              Are you sure you want to delete this service? This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowMechanicDeleteConfirmModal(false)}
                disabled={mechanicDeleteLoading}
                style={{
                  padding: "10px 20px",
                  background: "var(--color-wash-3)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  color: "var(--color-text-primary)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: mechanicDeleteLoading ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setMechanicDeleteLoading(true);
                  try {
                    await deleteBookingListing(selectedMechanicService.booking_listing_id);
                    await fetchMechanicServices();
                    setShowMechanicDeleteConfirmModal(false);
                    setShowMechanicServiceDetailModal(false);
                  } catch {
                    alert("Failed to delete service");
                  } finally {
                    setMechanicDeleteLoading(false);
                  }
                }}
                disabled={mechanicDeleteLoading}
                style={{
                  padding: "10px 20px",
                  background: "rgba(239,68,68,0.2)",
                  border: "1px solid rgba(239,68,68,0.4)",
                  borderRadius: 10,
                  color: "#ef4444",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: mechanicDeleteLoading ? "not-allowed" : "pointer",
                  opacity: mechanicDeleteLoading ? 0.7 : 1,
                }}
              >
                {mechanicDeleteLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Detail Modal */}
      {showVehicleDetailModal && selectedVehicle && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(8px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setShowVehicleDetailModal(false)}
        >
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 20,
              maxWidth: 960,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: isMobile ? "24px" : "32px",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowVehicleDetailModal(false)}
              style={{
                position: "absolute",
                top: isMobile ? 16 : 24,
                right: isMobile ? 16 : 24,
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--color-wash-3)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
                fontSize: 18,
                lineHeight: 1,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1,
              }}
            >
              ×
            </button>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1.15fr 1fr",
                gap: 28,
              }}
            >
              {/* Media Gallery (video first, then images) */}
              <div>
                <div
                  style={{
                    position: "relative",
                    paddingBottom: "72%",
                    borderRadius: 14,
                    border: "1px solid var(--color-border)",
                    overflow: "hidden",
                    marginBottom: 12,
                    background: "#000",
                  }}
                >
                  {selectedVehicleMedia.length > 0 ? (
                    <>
                      <div
                        style={{
                          position: "absolute",
                          top: 12,
                          left: 12,
                          zIndex: 1,
                          padding: "4px 10px",
                          borderRadius: 20,
                          background: "rgba(0,0,0,0.6)",
                          backdropFilter: "blur(6px)",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 600,
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {selectedMediaIndex + 1} / {selectedVehicleMedia.length}
                      </div>

                      {selectedVehicleMedia[selectedMediaIndex]?.type === "image" && (
                        <img
                          src={selectedVehicleMedia[selectedMediaIndex].url}
                          alt={`Vehicle image ${selectedMediaIndex + 1}`}
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                          }}
                        />
                      )}

                      {selectedVehicleMedia[selectedMediaIndex]?.type === "video" && (
                        <>
                          <video
                            ref={videoRef}
                            onPlay={() => setIsVideoPlaying(true)}
                            onPause={() => setIsVideoPlaying(false)}
                            onTimeUpdate={() => {
                              if (!isScrubbing && videoRef.current) {
                                setCurrentTime(videoRef.current.currentTime);
                              }
                            }}
                            onLoadedMetadata={() => {
                              if (videoRef.current) setDuration(videoRef.current.duration);
                            }}
                            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                          >
                            <source src={selectedVehicleMedia[selectedMediaIndex].url} type="video/mp4" />
                            Your browser does not support the video tag.
                          </video>

                          {/* Center Play/Pause Overlay (on hover) */}
                          <div
                            onMouseEnter={() => setShowPlayOverlay(true)}
                            onMouseLeave={() => setShowPlayOverlay(false)}
                            style={{
                              position: "absolute",
                              inset: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: showPlayOverlay ? "rgba(0,0,0,0.3)" : "transparent",
                              transition: "background 0.2s",
                            }}
                          >
                            {showPlayOverlay && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (videoRef.current) {
                                    if (isVideoPlaying) {
                                      videoRef.current.pause();
                                    } else {
                                      videoRef.current.play();
                                    }
                                  }
                                }}
                                style={{
                                  width: 44,
                                  height: 44,
                                  borderRadius: "50%",
                                  background: color,
                                  border: "none",
                                  color: "#fff",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 14,
                                  margin: 0,
                                  padding: 0,
                                }}
                              >
                                {isVideoPlaying ? (
                                  <div style={{ display: "flex", gap: 3 }}>
                                    <div style={{ width: 4, height: 14, background: "#fff", borderRadius: 1 }} />
                                    <div style={{ width: 4, height: 14, background: "#fff", borderRadius: 1 }} />
                                  </div>
                                ) : (
                                  <div
                                    style={{
                                      width: 0,
                                      height: 0,
                                      borderTop: "8px solid transparent",
                                      borderBottom: "8px solid transparent",
                                      borderLeft: "13px solid #fff",
                                      marginLeft: 3,
                                    }}
                                  />
                                )}
                              </button>
                            )}
                          </div>

                          {/* Video Controls */}
                          <div
                            style={{
                              position: "absolute",
                              bottom: 0,
                              left: 0,
                              right: 0,
                              background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
                              padding: "12px 16px",
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            {/* Progress Bar */}
                            <div
                              ref={progressBarRef}
                              style={{
                                flex: 1,
                                height: 4,
                                background: "rgba(255,255,255,0.3)",
                                borderRadius: 2,
                                cursor: "pointer",
                                position: "relative",
                              }}
                              onMouseDown={(e) => {
                                setIsScrubbing(true);
                                seekToClientX(e.clientX);
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  top: 0,
                                  height: "100%",
                                  width: duration ? `${(currentTime / duration) * 100}%` : "0%",
                                  background: color,
                                  borderRadius: 2,
                                }}
                              />
                              {/* draggable handle */}
                              <div
                                style={{
                                  position: "absolute",
                                  top: "50%",
                                  left: duration ? `${(currentTime / duration) * 100}%` : "0%",
                                  transform: "translate(-50%, -50%)",
                                  width: 12,
                                  height: 12,
                                  borderRadius: "50%",
                                  background: color,
                                  boxShadow: "0 0 0 2px rgba(0,0,0,0.4)",
                                }}
                              />
                            </div>
                            {/* Time */}
                            <span
                              style={{
                                fontSize: 12,
                                color: "#fff",
                                fontFamily: "'DM Sans', sans-serif",
                                minWidth: 80,
                                textAlign: "right",
                              }}
                            >
                              {`${Math.floor(currentTime / 60)}:${String(Math.floor(currentTime % 60)).padStart(2, "0")} / ${duration ? Math.floor(duration / 60) : 0}:${duration ? String(Math.floor(duration % 60)).padStart(2, "0") : "00"}`}
                            </span>
                          </div>
                        </>
                      )}

                      {/* Navigation Arrows */}
                      {selectedVehicleMedia.length > 1 && (
                        <>
                          <button
                            onClick={() => goToMedia(selectedMediaIndex > 0 ? selectedMediaIndex - 1 : selectedVehicleMedia.length - 1)}
                            style={{
                              position: "absolute",
                              left: 10,
                              top: "50%",
                              transform: "translateY(-50%)",
                              background: "rgba(0,0,0,0.6)",
                              backdropFilter: "blur(8px)",
                              border: "1px solid rgba(255,255,255,0.2)",
                              borderRadius: "50%",
                              width: 36,
                              height: 36,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                            }}
                          >
                            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                          </button>
                          <button
                            onClick={() => goToMedia(selectedMediaIndex < selectedVehicleMedia.length - 1 ? selectedMediaIndex + 1 : 0)}
                            style={{
                              position: "absolute",
                              right: 10,
                              top: "50%",
                              transform: "translateY(-50%)",
                              background: "rgba(0,0,0,0.6)",
                              backdropFilter: "blur(8px)",
                              border: "1px solid rgba(255,255,255,0.2)",
                              borderRadius: "50%",
                              width: 36,
                              height: 36,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                            }}
                          >
                            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                        <circle cx="7" cy="17" r="2" />
                        <path d="M9 17h6" />
                        <circle cx="17" cy="17" r="2" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Thumbnails */}
                {selectedVehicleMedia.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      overflowX: "auto",
                      paddingBottom: 4,
                    }}
                  >
                    {selectedVehicleMedia.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => goToMedia(idx)}
                        style={{
                          position: "relative",
                          width: 60,
                          height: 60,
                          borderRadius: 8,
                          border: selectedMediaIndex === idx ? `1px solid ${color}` : "1px solid var(--color-border)",
                          overflow: "hidden",
                          cursor: "pointer",
                          padding: 0,
                          background: "transparent",
                          flexShrink: 0,
                        }}
                      >
                        {item.type === "video" ? (
                          <>
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                background: "rgba(0,0,0,0.5)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                zIndex: 1,
                              }}
                            >
                              <span style={{ fontSize: 18, color: "#fff" }}>▶</span>
                            </div>
                            <video
                              src={item.url}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          </>
                        ) : (
                          <img
                            src={item.url}
                            alt={`Thumbnail ${idx + 1}`}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Description */}
                {selectedVehicle.description && (
                  <div style={{ marginTop: 16 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", margin: "0 0 8px" }}>
                      Description
                    </h4>
                    <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", margin: 0, whiteSpace: "pre-wrap" }}>
                      {selectedVehicle.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Info Panel */}
              <div>
                {formatListedDate(selectedVehicle.created_at) && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 12px",
                      borderRadius: 20,
                      background: "var(--color-wash-2)",
                      border: "1px solid var(--color-border)",
                      marginBottom: 14,
                    }}
                  >
                    <VehicleSpecIcon icon="calendar" />
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif" }}>
                      Listed on {formatListedDate(selectedVehicle.created_at)}
                    </span>
                  </div>
                )}

                <h3
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 700,
                    fontSize: 26,
                    color: "var(--color-text-primary)",
                    margin: 0,
                  }}
                >
                  {selectedVehicle.make} {selectedVehicle.model}
                </h3>
                <p style={{ fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", margin: "4px 0 14px" }}>
                  {selectedVehicle.year || "—"}{selectedVehicle.mileage != null ? ` • ${selectedVehicle.mileage.toLocaleString()} Miles` : ""}
                </p>
                <p style={{ fontSize: 24, fontWeight: 800, color, fontFamily: "'Barlow Condensed', sans-serif", margin: "0 0 16px" }}>
                  {selectedVehicle.price != null ? money(selectedVehicle.price) : "—"}
                </p>

                <div style={{ borderTop: "1px solid var(--color-border)" }}>
                  <VehicleSpecRow icon="tag" label="Make" value={selectedVehicle.make || "—"} />
                  <VehicleSpecRow icon="type" label="Model" value={selectedVehicle.model || "—"} />
                  <VehicleSpecRow icon="calendar" label="Year" value={selectedVehicle.year || "—"} />
                  <VehicleSpecRow icon="gauge" label="Mileage" value={selectedVehicle.mileage != null ? `${selectedVehicle.mileage.toLocaleString()} Miles` : "—"} />
                  <VehicleSpecRow icon="fuel" label="Fuel" value={selectedVehicle.fuel || "—"} />
                  <VehicleSpecRow icon="sliders" label="Transmission" value={selectedVehicle.transmission || "—"} />
                  <VehicleSpecRow icon="gear" label="Engine" value={selectedVehicle.engine || "—"} />
                  <VehicleSpecRow icon="droplet" label="Color" value={selectedVehicle.color || "—"} />
                  <VehicleSpecRow icon="shieldCheck" label="Condition" value={selectedVehicle.condition || "—"} />
                  <VehicleSpecRow icon="car" label="Vehicle Type" value={selectedVehicle.vehicle_type || "—"} />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div
              style={{
                marginTop: 24,
                paddingTop: 20,
                borderTop: "1px solid var(--color-border)",
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  onClick={() => {
                    setVehicleForm({
                      vehicle_type: selectedVehicle.vehicle_type || "",
                      price: selectedVehicle.price || "",
                      is_negotiable: selectedVehicle.is_negotiable || false,
                      make: selectedVehicle.make || "",
                      model: selectedVehicle.model || "",
                      year: selectedVehicle.year || "",
                      mileage: selectedVehicle.mileage || "",
                      fuel: selectedVehicle.fuel || "",
                      transmission: selectedVehicle.transmission || "",
                      engine: selectedVehicle.engine || "",
                      color: selectedVehicle.color || "",
                      condition: selectedVehicle.condition || "",
                      description: selectedVehicle.description || "",
                    });
                    setExistingVehicleImages(selectedVehicle.images ? JSON.parse(selectedVehicle.images) : []);
                    setExistingVehicleVideo(selectedVehicle.video_url || null);
                    setVehicleImages([]);
                    setVehicleVideo(null);
                    setEditingVehicleId(selectedVehicle.vehicle_id);
                    setShowVehicleDetailModal(false);
                    setShowAddVehicleModal(true);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 18px",
                    background: "var(--color-wash-2)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                    color: "var(--color-text-primary)",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                  Edit Listing
                </button>
                <button
                  onClick={() => setShowDeleteConfirmModal(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 18px",
                    background: "rgba(239,68,68,0.12)",
                    border: "1px solid rgba(239,68,68,0.35)",
                    borderRadius: 10,
                    color: "#ef4444",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" /></svg>
                  Delete Listing
                </button>
              </div>
              <button
                onClick={() => {
                  setShowVehicleDetailModal(false);
                  setTestDriveModalTab("PENDING");
                  setTestDriveModalPage(1);
                  setShowTestDriveModal(true);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 20px",
                  background: color,
                  border: "none",
                  borderRadius: 10,
                  color: "#fff",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                Test Drive Requests
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Drive Requests Modal */}
      {showTestDriveModal && selectedVehicle && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setShowTestDriveModal(false)}
        >
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 16,
              width: isMobile ? "100%" : "700px",
              maxHeight: "88vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                padding: "22px 24px 18px",
                borderBottom: "1px solid var(--color-border)",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <button
                  onClick={() => {
                    setShowTestDriveModal(false);
                    setShowVehicleDetailModal(true);
                  }}
                  style={{
                    background: "var(--color-wash-2)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                  </svg>
                </button>
                <div>
                  <h3
                    style={{
                      fontSize: 19,
                      fontWeight: 700,
                      color: "var(--color-text-primary)",
                      fontFamily: "'DM Sans', sans-serif",
                      margin: 0,
                    }}
                  >
                    Test Drive Requests
                  </h3>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--color-text-secondary)",
                      fontFamily: "'DM Sans', sans-serif",
                      margin: "4px 0 0",
                    }}
                  >
                    Manage and respond to test drive requests for this vehicle.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTestDriveModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-text-secondary)",
                  fontSize: 24,
                  cursor: "pointer",
                  flexShrink: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                gap: 4,
                padding: "0 24px",
                borderBottom: "1px solid var(--color-border)",
                flexShrink: 0,
                overflowX: "auto",
              }}
            >
              {TEST_DRIVE_TABS.map((t) => {
                const count = vehicleTestDriveRequests.filter((r) => r.status === t.status).length;
                const active = testDriveModalTab === t.status;
                return (
                  <button
                    key={t.status}
                    onClick={() => {
                      setTestDriveModalTab(t.status);
                      setTestDriveModalPage(1);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
                      padding: "12px 4px",
                      marginRight: 20,
                      color: active ? color : "var(--color-text-secondary)",
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Request list */}
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              {testDriveTabRequests.length === 0 ? (
                <p
                  style={{
                    textAlign: "center",
                    padding: "40px 0",
                    fontSize: 13,
                    color: "var(--color-text-muted)",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  No {TEST_DRIVE_TABS.find((t) => t.status === testDriveModalTab)?.label.toLowerCase()} requests for this vehicle.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {testDrivePageRequests.map((r) => (
                    <div
                      key={r._id}
                      style={{
                        background: "var(--color-surface-raised)",
                        border: "1px solid var(--color-border-subtle)",
                        borderRadius: 14,
                        padding: "16px 18px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                      {/* Avatar */}
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          background: `${color}22`,
                          border: `1px solid ${color}55`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {r.customer ? (
                          <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'DM Sans', sans-serif" }}>
                            {getInitials(r.customer)}
                          </span>
                        ) : (
                          <span style={{ color }}>
                            <ProfileIcon s={18} />
                          </span>
                        )}
                      </div>

                      {/* Name / email / phone */}
                      <div style={{ minWidth: 160, flex: "1 1 180px" }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                          {r.customer}
                        </p>
                        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", margin: "2px 0 0" }}>
                          {r.email}
                        </p>
                        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", margin: "2px 0 0" }}>
                          {r.phone_number}
                        </p>
                      </div>

                      {/* Requested date / preferred time */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 160px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                          </svg>
                          <div>
                            <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif" }}>Requested Date</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif" }}>{formatListedDate(r.date) || r.date}</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                          </svg>
                          <div>
                            <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif" }}>Preferred Time</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif" }}>{formatPreferredTime(r.preferred_time)}</div>
                          </div>
                        </div>
                      </div>

                      {/* Status / actions */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, marginLeft: "auto" }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "4px 10px",
                            borderRadius: 20,
                            background: tint(statusColor[r.status] || "#888", "20", "30"),
                            color: statusColor[r.status] || "#888",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          {translateSellerStatus(r.status)}
                        </span>
                        {r.status === "PENDING" && (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() =>
                                updateTestDriveRequestStatus(r._id, "CONFIRMED")
                                  .then(() =>
                                    setRequests((p) =>
                                      p.map((x) => (x._id === r._id ? { ...x, status: "CONFIRMED" } : x))
                                    )
                                  )
                                  .catch(() => {})
                              }
                              style={{
                                padding: "7px 16px",
                                background: color,
                                border: "none",
                                borderRadius: 8,
                                color: "#fff",
                                fontSize: 12,
                                fontWeight: 700,
                                fontFamily: "'DM Sans', sans-serif",
                                cursor: "pointer",
                              }}
                            >
                              Accept
                            </button>
                            <button
                              onClick={() =>
                                updateTestDriveRequestStatus(r._id, "CANCELLED")
                                  .then(() =>
                                    setRequests((p) =>
                                      p.map((x) => (x._id === r._id ? { ...x, status: "CANCELLED" } : x))
                                    )
                                  )
                                  .catch(() => {})
                              }
                              style={{
                                padding: "7px 16px",
                                background: "var(--color-wash-2)",
                                border: "1px solid var(--color-border)",
                                borderRadius: 8,
                                color: "var(--color-text-primary)",
                                fontSize: 12,
                                fontWeight: 700,
                                fontFamily: "'DM Sans', sans-serif",
                                cursor: "pointer",
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                        <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif" }}>
                          Requested on {formatListedDate(r.requestedAt) || "—"}
                        </span>
                      </div>
                    </div>

                    {/* Notes */}
                    {r.notes && (
                      <div style={{ background: "var(--color-wash-1)", borderRadius: 8, padding: "10px 12px" }}>
                        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", margin: 0, fontStyle: "italic" }}>
                          "{r.notes}"
                        </p>
                      </div>
                    )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "14px 24px",
                borderTop: "1px solid var(--color-border)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                {testDriveTabRequests.length === 0
                  ? "Showing 0 of 0 requests"
                  : `Showing ${(testDriveCurrentPage - 1) * testDriveItemsPerPage + 1}-${Math.min(testDriveCurrentPage * testDriveItemsPerPage, testDriveTabRequests.length)} of ${testDriveTabRequests.length} requests`}
              </p>
              {testDriveTotalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={() => setTestDriveModalPage((p) => Math.max(1, p - 1))}
                    disabled={testDriveCurrentPage === 1}
                    style={{
                      padding: "6px 14px",
                      background: testDriveCurrentPage === 1 ? "var(--color-wash-2)" : color,
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: testDriveCurrentPage === 1 ? "var(--color-text-muted)" : "#fff",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: testDriveCurrentPage === 1 ? "not-allowed" : "pointer",
                    }}
                  >
                    Previous
                  </button>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "var(--color-text-secondary)" }}>
                    Page {testDriveCurrentPage} of {testDriveTotalPages}
                  </span>
                  <button
                    onClick={() => setTestDriveModalPage((p) => Math.min(testDriveTotalPages, p + 1))}
                    disabled={testDriveCurrentPage === testDriveTotalPages}
                    style={{
                      padding: "6px 14px",
                      background: testDriveCurrentPage === testDriveTotalPages ? "var(--color-wash-2)" : color,
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: testDriveCurrentPage === testDriveTotalPages ? "var(--color-text-muted)" : "#fff",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: testDriveCurrentPage === testDriveTotalPages ? "not-allowed" : "pointer",
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Service Requests Modal (per-listing, opened from the service detail modal) */}
      {showServiceRequestsModal && selectedMechanicService && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setShowServiceRequestsModal(false)}
        >
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 16,
              width: isMobile ? "100%" : "700px",
              maxHeight: "88vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                padding: "22px 24px 18px",
                borderBottom: "1px solid var(--color-border)",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <button
                  onClick={() => {
                    setShowServiceRequestsModal(false);
                    setShowMechanicServiceDetailModal(true);
                  }}
                  style={{
                    background: "var(--color-wash-2)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                  </svg>
                </button>
                <div>
                  <h3
                    style={{
                      fontSize: 19,
                      fontWeight: 700,
                      color: "var(--color-text-primary)",
                      fontFamily: "'DM Sans', sans-serif",
                      margin: 0,
                    }}
                  >
                    Service Requests
                  </h3>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--color-text-secondary)",
                      fontFamily: "'DM Sans', sans-serif",
                      margin: "4px 0 0",
                    }}
                  >
                    Manage and respond to requests for {selectedMechanicService.title || "this service"}.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowServiceRequestsModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-text-secondary)",
                  fontSize: 24,
                  cursor: "pointer",
                  flexShrink: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                gap: 4,
                padding: "0 24px",
                borderBottom: "1px solid var(--color-border)",
                flexShrink: 0,
                overflowX: "auto",
              }}
            >
              {SERVICE_REQUEST_TABS.map((t) => {
                const count = serviceListingRequests.filter((r) => r.status === t.status).length;
                const active = serviceRequestsModalTab === t.status;
                return (
                  <button
                    key={t.status}
                    onClick={() => {
                      setServiceRequestsModalTab(t.status);
                      setServiceRequestsModalPage(1);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
                      padding: "12px 4px",
                      marginRight: 20,
                      color: active ? color : "var(--color-text-secondary)",
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Request list */}
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              {serviceRequestsPageItems.length === 0 ? (
                <p
                  style={{
                    textAlign: "center",
                    padding: "40px 0",
                    fontSize: 13,
                    color: "var(--color-text-muted)",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  No {SERVICE_REQUEST_TABS.find((t) => t.status === serviceRequestsModalTab)?.label.toLowerCase()} requests for this service.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {serviceRequestsPageItems.map((r) => (
                    <div
                      key={r._id}
                      style={{
                        background: "var(--color-surface-raised)",
                        border: "1px solid var(--color-border-subtle)",
                        borderRadius: 14,
                        padding: "16px 18px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                        {/* Avatar */}
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: "50%",
                            background: `${color}22`,
                            border: `1px solid ${color}55`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {r.customer ? (
                            <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'DM Sans', sans-serif" }}>
                              {getInitials(r.customer)}
                            </span>
                          ) : (
                            <span style={{ color }}>
                              <ProfileIcon s={18} />
                            </span>
                          )}
                        </div>

                        {/* Name / email / phone */}
                        <div style={{ minWidth: 160, flex: "1 1 180px" }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                            {r.customer}
                          </p>
                          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", margin: "2px 0 0" }}>
                            {r.email}
                          </p>
                          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", margin: "2px 0 0" }}>
                            {r.phone_number}
                          </p>
                        </div>

                        {/* Requested date / preferred time */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 160px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                            </svg>
                            <div>
                              <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif" }}>Requested Date</div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif" }}>{formatListedDate(r.date) || r.date}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                            <div>
                              <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif" }}>Preferred Time</div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif" }}>{formatPreferredTime(r.preferred_time)}</div>
                            </div>
                          </div>
                        </div>

                        {/* Status / actions */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, marginLeft: "auto" }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "4px 10px",
                              borderRadius: 20,
                              background: tint(statusColor[r.status] || "#888", "20", "30"),
                              color: statusColor[r.status] || "#888",
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                            }}
                          >
                            {translateSellerStatus(r.status)}
                          </span>
                          {r.status === "Pending" && (
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                onClick={() =>
                                  acceptBooking(r._id)
                                    .then(() => setRequests((p) => p.map((x) => (x._id === r._id ? { ...x, status: "Confirmed" } : x))))
                                    .catch(() => {})
                                }
                                style={{
                                  padding: "7px 16px",
                                  background: color,
                                  border: "none",
                                  borderRadius: 8,
                                  color: "#fff",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  fontFamily: "'DM Sans', sans-serif",
                                  cursor: "pointer",
                                }}
                              >
                                Accept
                              </button>
                              <button
                                onClick={() =>
                                  declineBooking(r._id)
                                    .then(() => setRequests((p) => p.map((x) => (x._id === r._id ? { ...x, status: "Declined" } : x))))
                                    .catch(() => {})
                                }
                                style={{
                                  padding: "7px 16px",
                                  background: "var(--color-wash-2)",
                                  border: "1px solid var(--color-border)",
                                  borderRadius: 8,
                                  color: "var(--color-text-primary)",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  fontFamily: "'DM Sans', sans-serif",
                                  cursor: "pointer",
                                }}
                              >
                                Decline
                              </button>
                            </div>
                          )}
                          {r.status === "Confirmed" && (
                            <button
                              onClick={() =>
                                checkInBooking(r._id)
                                  .then(() => setRequests((p) => p.map((x) => (x._id === r._id ? { ...x, status: "In Progress" } : x))))
                                  .catch(() => {})
                              }
                              style={{
                                padding: "7px 16px",
                                background: color,
                                border: "none",
                                borderRadius: 8,
                                color: "#fff",
                                fontSize: 12,
                                fontWeight: 700,
                                fontFamily: "'DM Sans', sans-serif",
                                cursor: "pointer",
                              }}
                            >
                              Start
                            </button>
                          )}
                          {r.status === "In Progress" && (
                            <button
                              onClick={() =>
                                completeBooking(r._id)
                                  .then(() => setRequests((p) => p.map((x) => (x._id === r._id ? { ...x, status: "Completed" } : x))))
                                  .catch(() => {})
                              }
                              style={{
                                padding: "7px 16px",
                                background: color,
                                border: "none",
                                borderRadius: 8,
                                color: "#fff",
                                fontSize: 12,
                                fontWeight: 700,
                                fontFamily: "'DM Sans', sans-serif",
                                cursor: "pointer",
                              }}
                            >
                              Complete
                            </button>
                          )}
                          <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif" }}>
                            Requested on {formatListedDate(r.requestedAt) || "—"}
                          </span>
                        </div>
                      </div>

                      {/* Notes */}
                      {r.notes && (
                        <div style={{ background: "var(--color-wash-1)", borderRadius: 8, padding: "10px 12px" }}>
                          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", margin: 0, fontStyle: "italic" }}>
                            "{r.notes}"
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "14px 24px",
                borderTop: "1px solid var(--color-border)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                {serviceRequestsTabItems.length === 0
                  ? "Showing 0 of 0 requests"
                  : `Showing ${(serviceRequestsCurrentPage - 1) * serviceRequestsItemsPerPage + 1}-${Math.min(serviceRequestsCurrentPage * serviceRequestsItemsPerPage, serviceRequestsTabItems.length)} of ${serviceRequestsTabItems.length} requests`}
              </p>
              {serviceRequestsTotalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={() => setServiceRequestsModalPage((p) => Math.max(1, p - 1))}
                    disabled={serviceRequestsCurrentPage === 1}
                    style={{
                      padding: "6px 14px",
                      background: serviceRequestsCurrentPage === 1 ? "var(--color-wash-2)" : color,
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: serviceRequestsCurrentPage === 1 ? "var(--color-text-muted)" : "#fff",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: serviceRequestsCurrentPage === 1 ? "not-allowed" : "pointer",
                    }}
                  >
                    Previous
                  </button>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "var(--color-text-secondary)" }}>
                    Page {serviceRequestsCurrentPage} of {serviceRequestsTotalPages}
                  </span>
                  <button
                    onClick={() => setServiceRequestsModalPage((p) => Math.min(serviceRequestsTotalPages, p + 1))}
                    disabled={serviceRequestsCurrentPage === serviceRequestsTotalPages}
                    style={{
                      padding: "6px 14px",
                      background: serviceRequestsCurrentPage === serviceRequestsTotalPages ? "var(--color-wash-2)" : color,
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: serviceRequestsCurrentPage === serviceRequestsTotalPages ? "var(--color-text-muted)" : "#fff",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: serviceRequestsCurrentPage === serviceRequestsTotalPages ? "not-allowed" : "pointer",
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Test Drive Request Detail Modal (from the Requests tab list) */}
      {showRequestDetailModal && selectedRequestDetail && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setShowRequestDetailModal(false)}
        >
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 20,
              width: isMobile ? "100%" : "640px",
              maxHeight: "88vh",
              overflowY: "auto",
              padding: 28,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
              <div>
                <h3 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                  {selectedRequestDetail.type === "service" ? "Service Request" : "Test Drive Request"}
                </h3>
                <p style={{ fontSize: 14, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", margin: "6px 0 0" }}>
                  {selectedRequestDetail.type === "service" ? selectedRequestDetail.service : selectedRequestDetail.vehicle}
                </p>
              </div>
              <button
                onClick={() => setShowRequestDetailModal(false)}
                style={{ background: "none", border: "none", color: "var(--color-text-secondary)", fontSize: 24, cursor: "pointer", flexShrink: 0, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Photo + info */}
            <div style={{ display: "flex", gap: 16, flexWrap: isMobile ? "wrap" : "nowrap", marginBottom: 16 }}>
              {/* Photo panel with status footer */}
              <div style={{ width: isMobile ? "100%" : 200, flexShrink: 0, borderRadius: 14, overflow: "hidden", background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", display: "flex", flexDirection: "column" }}>
                <div style={{ width: "100%", flex: 1, minHeight: 120, overflow: "hidden", background: "var(--color-surface-raised)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {selectedRequestDetail.vehiclePic ? (
                    <img src={selectedRequestDetail.vehiclePic} alt={selectedRequestDetail.vehicle} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <RequestRowIcon icon={selectedRequestDetail.type === "service" ? "wrench" : "calendar"} size={30} color="var(--color-text-muted)" />
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px", borderTop: "1px solid var(--color-border)", flexShrink: 0, marginTop: "auto" }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: statusColor[selectedRequestDetail.status] || "#888",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <RequestRowIcon
                      icon={/declined|cancelled/i.test(selectedRequestDetail.status || "") ? "x" : "check"}
                      size={14}
                      color="#fff"
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: statusColor[selectedRequestDetail.status] || "#888",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {translateSellerStatus(selectedRequestDetail.status)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {requestStatusSubtext(selectedRequestDetail.status)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Info card */}
              <div style={{ flex: 1, minWidth: 0, background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 14, padding: "0 14px" }}>
                <RequestDetailInfoRow icon="phone" label="Phone" value={selectedRequestDetail.phone_number} color={color} tint={tint} />
                <RequestDetailInfoRow icon="email" label="Email" value={selectedRequestDetail.email} color={color} tint={tint} />
                <RequestDetailInfoRow icon="calendar" label="Date" value={formatListedDate(selectedRequestDetail.date) || selectedRequestDetail.date} color={color} tint={tint} />
                <RequestDetailInfoRow icon="clock" label="Time" value={formatPreferredTime(selectedRequestDetail.preferred_time)} color={color} tint={tint} last={!selectedRequestDetail.notes} />
                {selectedRequestDetail.notes && (
                  <RequestDetailInfoRow icon="note" label="Notes" value={selectedRequestDetail.notes} color={color} tint={tint} last />
                )}
              </div>
            </div>

            {/* Requested on */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
              <InfoIconCircle icon="calendar" color={color} tint={tint} size={30} />
              <div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif" }}>Requested on</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif" }}>
                  {formatListedDate(selectedRequestDetail.requestedAt) || formatListedDate(selectedRequestDetail.date) || "—"}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              {selectedRequestDetail.type === "service" ? (
                <>
                  {(selectedRequestDetail.status === "Pending" || selectedRequestDetail.status === "pending") && (
                    <>
                      <button
                        onClick={() =>
                          declineBooking(selectedRequestDetail._id)
                            .then(() => {
                              setRequests((p) => p.map((x) => (x._id === selectedRequestDetail._id ? { ...x, status: "Declined" } : x)));
                              setSelectedRequestDetail((prev) => (prev ? { ...prev, status: "Declined" } : prev));
                            })
                            .catch(() => { })
                        }
                        style={{ padding: "10px 20px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 10, color: "#ef4444", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                      >
                        Decline
                      </button>
                      <button
                        onClick={() =>
                          acceptBooking(selectedRequestDetail._id)
                            .then(() => {
                              setRequests((p) => p.map((x) => (x._id === selectedRequestDetail._id ? { ...x, status: "Confirmed" } : x)));
                              setSelectedRequestDetail((prev) => (prev ? { ...prev, status: "Confirmed" } : prev));
                            })
                            .catch(() => { })
                        }
                        style={{ padding: "10px 20px", background: color, border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                      >
                        Accept
                      </button>
                    </>
                  )}
                  {(selectedRequestDetail.status === "Confirmed" || selectedRequestDetail.status === "confirmed") && (
                    <button
                      onClick={() =>
                        checkInBooking(selectedRequestDetail._id)
                          .then(() => {
                            setRequests((p) => p.map((x) => (x._id === selectedRequestDetail._id ? { ...x, status: "In Progress" } : x)));
                            setSelectedRequestDetail((prev) => (prev ? { ...prev, status: "In Progress" } : prev));
                          })
                          .catch(() => { })
                      }
                      style={{ padding: "10px 20px", background: color, border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                    >
                      Start
                    </button>
                  )}
                  {(selectedRequestDetail.status === "In Progress" || selectedRequestDetail.status === "in_progress") && (
                    <button
                      onClick={() =>
                        completeBooking(selectedRequestDetail._id)
                          .then(() => {
                            setRequests((p) => p.map((x) => (x._id === selectedRequestDetail._id ? { ...x, status: "Completed" } : x)));
                            setSelectedRequestDetail((prev) => (prev ? { ...prev, status: "Completed" } : prev));
                          })
                          .catch(() => { })
                      }
                      style={{ padding: "10px 20px", background: color, border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                    >
                      Complete
                    </button>
                  )}
                  {!["Pending", "pending", "Confirmed", "confirmed", "In Progress", "in_progress"].includes(selectedRequestDetail.status) && (
                    <button
                      onClick={() => setShowRequestDetailModal(false)}
                      style={{ padding: "10px 20px", background: "var(--color-wash-2)", border: "1px solid var(--color-border)", borderRadius: 10, color: "var(--color-text-primary)", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                    >
                      Close
                    </button>
                  )}
                </>
              ) : String(selectedRequestDetail.status).toUpperCase() === "PENDING" ? (
                <>
                  <button
                    onClick={() =>
                      updateTestDriveRequestStatus(selectedRequestDetail._id, "CANCELLED")
                        .then(() => {
                          setRequests((p) => p.map((x) => (x._id === selectedRequestDetail._id ? { ...x, status: "CANCELLED" } : x)));
                          setSelectedRequestDetail((prev) => (prev ? { ...prev, status: "CANCELLED" } : prev));
                        })
                        .catch(() => { })
                    }
                    style={{ padding: "10px 20px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 10, color: "#ef4444", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                  >
                    Reject
                  </button>
                  <button
                    onClick={() =>
                      updateTestDriveRequestStatus(selectedRequestDetail._id, "CONFIRMED")
                        .then(() => {
                          setRequests((p) => p.map((x) => (x._id === selectedRequestDetail._id ? { ...x, status: "CONFIRMED" } : x)));
                          setSelectedRequestDetail((prev) => (prev ? { ...prev, status: "CONFIRMED" } : prev));
                        })
                        .catch(() => { })
                    }
                    style={{ padding: "10px 20px", background: color, border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                  >
                    Accept
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowRequestDetailModal(false)}
                  style={{ padding: "10px 22px", background: "transparent", border: "1px solid #6366f1", borderRadius: 12, color: "#818cf8", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(8px)",
            zIndex: 1001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setShowDeleteConfirmModal(false)}
        >
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 20,
              maxWidth: 400,
              width: "100%",
              padding: isMobile ? "24px" : "32px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: 22,
                color: "var(--color-text-primary)",
                margin: "0 0 12px 0",
              }}
            >
              Delete Vehicle
            </h3>
            <p
              style={{
                fontSize: 14,
                color: "var(--color-text-secondary)",
                fontFamily: "'DM Sans', sans-serif",
                margin: "0 0 24px 0",
                lineHeight: 1.5,
              }}
            >
              Are you sure you want to delete this vehicle? This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowDeleteConfirmModal(false)}
                style={{
                  padding: "10px 20px",
                  background: "var(--color-wash-3)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  color: "var(--color-text-primary)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteDriverVehicle(selectedVehicle.vehicle_id);
                    await fetchVehicles();
                    setShowDeleteConfirmModal(false);
                    setShowVehicleDetailModal(false);
                  } catch (err) {
                    alert("Failed to delete vehicle");
                  }
                }}
                style={{
                  padding: "10px 20px",
                  background: "rgba(239,68,68,0.2)",
                  border: "1px solid rgba(239,68,68,0.4)",
                  borderRadius: 10,
                  color: "#ef4444",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SellerAutomotiveDashboard;
