import {
  RideshareIcon, FoodIcon, OnDemandIcon, TempStayIcon, MedicalIcon, ShopIcon, CourierIcon,
} from "./icons.jsx";

/*
 * First-time-in-a-vertical explainer content (Codezero 2026-06-23).
 *
 * navId (activeNav) -> explainer shown the first time a user opens that category.
 * Add a vertical here and AppInner shows its card on first open (gated once-per-category-per-
 * device via localStorage `strug_vertical_onboarded_<navId>`); verticals not listed never show
 * a card. Keep copy to a tagline + ≤3 steps. Lives in its own module (not OnboardingCards.jsx)
 * so that file keeps exporting only components (react-refresh rule).
 */
export const CATEGORY_ONBOARDING = {
  rideshare: {
    icon: RideshareIcon, accent: "#f59e0b", title: "You set the price",
    tagline: "You name the fare when you book, and drivers nearby decide whether to take it. No surge pricing.",
    points: ["Set your price as you request the ride", "Nearby drivers accept or pass", "Pay in-app when your trip ends"],
  },
  food: {
    icon: FoodIcon, accent: "#ef4444", title: "Order from local kitchens",
    tagline: "Order from restaurants and vendors near you and follow your delivery to the door.",
    points: ["Pick a restaurant near you", "Order and pay in-app", "Track delivery in real time"],
  },
  ondemand: {
    icon: OnDemandIcon, accent: "#6366f1", title: "Hire help on demand",
    tagline: "Post the job and your budget, and nearby providers can accept. Nothing starts until you confirm.",
    points: ["Describe the job and your budget", "Nearby providers accept or decline", "You confirm before work begins"],
  },
  tempstay: {
    icon: TempStayIcon, accent: "#9333ea", title: "Book a place to stay",
    tagline: "Find short stays from local hosts, and message them with any questions before you book.",
    points: ["Find a stay near your destination", "Message the host with questions", "Book and pay securely"],
  },
  medical: {
    icon: MedicalIcon, accent: "#06b6d4", title: "Book care near you",
    tagline: "Search by specialty or symptom, filter by insurance and location, and book in-person or online visits.",
    points: ["Search by specialty or symptom", "Filter by insurance, date, and distance", "Book a real opening — not a sample listing"],
  },
  shop: {
    icon: ShopIcon, accent: "#10b981", title: "Shop local stores and sellers",
    tagline: "Browse local shops and independent sellers, then check out securely.",
    points: ["Discover local and online sellers", "Add to cart across shops", "Checkout with buyer protection"],
  },
  courier: {
    icon: CourierIcon, accent: "#10b981", title: "Send a package across town",
    tagline: "Set your pickup and drop-off for an instant price, and a nearby courier handles the delivery.",
    points: ["Set pickup and drop-off", "Get an instant price", "A nearby courier delivers it"],
  },
};
