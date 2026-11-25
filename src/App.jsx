import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { motion as Motion, MotionConfig, useDragControls } from "framer-motion";
import { SplitModeContext } from "./contexts/SplitModeContext.js";
import { BreadcrumbProvider } from "./contexts/BreadcrumbProvider.jsx";
import Breadcrumbs from "./components/Breadcrumbs.jsx";
import { useTranslation, I18nextProvider } from "react-i18next";
import i18n, { LANGUAGES, RTL_LANGUAGES, LANGUAGE_FLAG_ISO2, stripeLocaleFromI18n } from "./i18n/index.js";
import { sidebarNavLabel } from "./utils/navLabel.js";
import { getRecentVerticals, pushRecentVertical, getPinMode, setPinMode, getManualPins, toggleManualPin, getSidebarPinnedIds, isPinnable } from "./utils/recentVerticals.js";
import { LanguagePrompt } from "./components/LanguagePrompt.jsx";
import { InstallAppPrompt } from "./components/InstallAppPrompt.jsx";
import { detectLocale } from "./api/locale.js";
import {
  applyLanguage,
  applyLocaleHints,
  hasExplicitLanguageChoice,
  hasSeenLanguagePrompt,
  syncLanguageFromUser,
  getSupportedLanguageCode,
} from "./utils/languagePrefs.js";
import { getUser, setUser, getToken, setToken, isAuthenticated, clearAuth, setSessionOwner, userIdFromAccessToken, claimsFromAccessToken } from "./store/auth";
import {
  ensureValidAccessToken,
  scheduleProactiveSessionRefresh,
  clearProactiveSessionRefresh,
  installSessionRefreshOnVisibility,
  uninstallSessionRefreshOnVisibility,
} from "./utils/sessionRefresh.js";
import { getLocationItem, setLocationItem } from "./utils/userLocation.js";
import { COUNTRY_OPTIONS, currencyForCountry, refreshExchangeRates, flagUrlByIso2 } from "./utils/regionConfig.js";
import CountrySelect from "./components/CountrySelect.jsx";
import { useDialog } from "./components/ConfirmDialog.jsx";
import { setupProfile, establishRefreshCookie, restoreSession } from "./api/auth";
import {
  switchToAccount,
  beginAddAnotherAccount,
  signOutCurrentAccount,
  signOutAllAccounts,
} from "./api/accountSwitch.js";
import {
  listSavedAccounts,
  rememberActiveAccount,
  isAccessTokenExpired,
  setAddingAccountFlag,
} from "./store/savedAccounts.js";
import { updateUser, bindCheckoutReferralCode, markWelcomeSeen } from "./api/user";
import { stashFirstTouchRecruiter, claimFirstTouchRecruiter } from "./api/referral";
import { updateProfilePhoto, getMyProfile, acceptTerms } from "./api/social";
// `@stripe/stripe-js` INJECTS js.stripe.com as an import side-effect — merely importing it
// loads ~1 MB of Stripe, which is why the deferral below never actually deferred anything
// (measured: js.stripe.com at 488ms on /videos, long before any interaction or fallback timer).
// The `/pure` entry point is Stripe's supported no-side-effect build: the script is only
// fetched when loadStripe() is actually called. (#465)
import { loadStripe } from "@stripe/stripe-js/pure";
import { Elements } from "@stripe/react-stripe-js";
import {
  PayPalScriptProvider,
  usePayPalScriptReducer,
  SCRIPT_LOADING_STATE,
} from "@paypal/react-paypal-js";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { loadGoogleMaps } from "./utils/googleMaps.js";
import { routeNeedsHeavySdks, setActiveRoute, subscribeActiveRoute, getActiveRoute } from "./utils/sdkPreload.js";
import { disconnectSocket } from "./api/socket.js";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { useChatbot } from "./hooks/useChatbot.js";
import { isSafeHttpUrl } from "./utils/safeUrl.js";
import { useChatUnread } from "./hooks/useChatUnread.js";
import { useChatToast } from "./hooks/useChatToast.js";
import { useChatPush } from "./hooks/useChatPush.js";
import { Tooltip } from "./components/Tooltip.jsx";
import QuickReplyPopup from "./components/QuickReplyPopup.jsx";
import UploadProgressWidget from "./components/UploadProgressWidget.jsx";
import GlobalMiniPlayer from "./components/GlobalMiniPlayer.jsx";
import VerticalEdgeDrawer from "./components/VerticalEdgeDrawer.jsx";
import { aiFabTranslateY } from "./utils/verticalEdgeDrawerConfig.js";
import { useTransactionalToast } from "./hooks/useTransactionalToast.js";
import { useDriverOnlineReminder } from "./hooks/useDriverOnlineReminder.js";
import { TransactionalToast } from "./components/TransactionalToast.jsx";
import AvatarResetNotice from "./components/AvatarResetNotice.jsx";
import { useNotifications } from "./hooks/useNotifications.js";
import NotificationBell from "./components/NotificationBell.jsx";
import NotificationPanel from "./components/NotificationPanel.jsx";
import { useIncomingOffers } from "./hooks/useIncomingOffers.js";
import { buildOfferToast } from "./utils/offerToast.js";
import BugReportModal from "./components/BugReportModal.jsx";
import { CommandPalette, ShortcutsHelp } from "./components/CommandPalette.jsx";
import MyReportsModal from "./components/MyReportsModal.jsx";
import DevLogin from "./components/DevLogin.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import PublicTracking from "./pages/PublicTracking.jsx";
import TripTrack from "./pages/TripTrack.jsx";
import VideoEmbedPage from "./pages/VideoEmbed.jsx";
import { isLocalDevLoginEnabled } from "./utils/devLogin.js";
import { ComingSoonPage as HiddenVerticalPage } from "./components/ComingSoon.jsx";
import { SafeImage } from "./components/SafeImage.jsx";
import { peekNavReturn, clearNavReturn } from "./api/chat.js";
import { clearWorkHirePreset } from "./utils/workHirePreset.js";
import { VIDEOS_MOBILE_DOCK_BOTTOM } from "./utils/videosMobileChrome.js";

// Each vertical's accent tints its sidebar/active-nav state and its tile on the home
// "Browse by category" grid (PageCard in Hub.jsx), where all ~55 tiles render together —
// so exact hex repeats there read as visually identical categories. Previously several
// hexes were reused by 4-8 verticals at once (e.g. #10b981 alone covered shop, lessons,
// courier, proservices, bookartist, medical, raise, and learn); reassigned below so no
// color is shared by more than 2-3 verticals. A few small, semantically-fine pairs were
// left alone (home/dashboard, tempstay/hotel, discounts/live, favourites/wedding,
// decor/celebrity, and artists/portfolio/influencer).
const PAGE_COLORS = {
  home: "#2563eb",
  insurance: "#0ea5e9",
  mortgage: "#14b8a6",
  rideshare: "#4f46e5",
  shop: "#10b981",
  food: "#ef4444",
  dating: "#e11d48",
  feed: "#ec4899",
  videos: "#7c3aed",
  refcodes: "#d97706",
  social: "#0891b2",
  messages: "#059669",
  ondemand: "#6366f1",
  ai: "#8b5cf6",
  wallet: "#16a34a",
  tempstay: "#9333ea",
  discounts: "#dc2626",
  favourites: "#db2777",
  lessons: "#0d9488",
  preconstruct: "#0f766e",
  events: "#f97316",
  concierge: "#818cf8",
  venues: "#b91c1c",
  groceries: "#f59e0b",
  equipment: "#1d4ed8",
  floral: "#be185d",
  realestate: "#047857",
  decor: "#a855f7",
  automotive: "#b45309",
  vehicles: "#fb923c",
  hotel: "#9333ea",
  courier: "#0284c7",
  pinboard: "#f87171",
  experiences: "#d946ef",
  wedding: "#db2777",
  proservices: "#6d28d9",
  digservices: "#a78bfa",
  jobs: "#2563eb",
  artists: "#06b6d4",
  secondhand: "#84cc16",
  reservations: "#3b82f6",
  celebrity: "#a855f7",
  community: "#65a30d",
  live: "#dc2626",
  portfolio: "#06b6d4",
  influencer: "#06b6d4",
  bookartist: "#f43f5e",
  books: "#eab308",
  medical: "#22c55e",
  catering: "#f472b6",
  raise: "#c026d3",
  meet: "#0891b2",
  digproducts: "#34d399",
  learn: "#fbbf24",
  dashboard: "#2563eb",
  orders: "#ea580c",
  settings: "#64748b",
  provider: "#2f9e44", // the /provider portal hub — forest green (tints its sidebar chevron + chrome)
};

const _bp = {
  isMobile: typeof window !== "undefined" && window.innerWidth < 768,
  isTablet:
    typeof window !== "undefined" &&
    window.innerWidth >= 768 &&
    window.innerWidth < 1024,
};

const _IcoInsurance = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
const _IcoMortgage = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
    <path d="M9 21V12h6v9" />
    <path d="M9 9h6" />
  </svg>
);

// A failed dynamic import (a transient network blip, Firefox's stricter module-script
// caching / tracking protection, or a stale chunk hash right after a deploy) otherwise
// throws straight to the single global ErrorBoundary and white-screens the WHOLE app —
// the "log in on Firefox → platform crashes completely" bug report (#68). lazyWithRetry
// retries the import a couple of times, and on persistent failure forces one reload to
// fetch a fresh manifest, only giving up (showing the recovery screen) if a reload was
// just attempted — so it never loops.
function retryImport(factory, retries = 2, delayMs = 300) {
  return factory().catch((err) => {
    if (retries <= 0) throw err;
    return new Promise((res) => setTimeout(res, delayMs)).then(() =>
      retryImport(factory, retries - 1, delayMs * 2),
    );
  });
}
function lazyWithRetry(factory) {
  return React.lazy(() =>
    retryImport(factory).catch((err) => {
      const KEY = "strug:chunk-reload-at";
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        // A plain reload() can be served the very same cached index.html that named the
        // dead chunk, so the retry fetches the dead chunk again and we fall through to the
        // throw below — the whole app then white-screens on any deep link loaded during the
        // cache window after a deploy (#413). Navigating to a one-shot cache-busting URL
        // forces a fresh document, which carries the current chunk hashes.
        const url = new URL(window.location.href);
        url.searchParams.set("_cb", String(Date.now()));
        window.location.replace(url.toString());
        return new Promise(() => {}); // hold the Suspense fallback until the reload lands
      }
      throw err; // already reloaded recently — let the ErrorBoundary show its recovery UI
    }),
  );
}

const ReactMarkdown = lazyWithRetry(() =>
  Promise.all([import("react-markdown"), import("remark-gfm")]).then(([md, gfm]) => ({
    default: function AiMarkdown(props) {
      return React.createElement(md.default, { ...props, remarkPlugins: [gfm.default] });
    },
  })),
);

const FeedPage = lazyWithRetry(() =>
  import("./pages/Feed.jsx").then((m) => ({ default: m.FeedPage })),
);
const StrugAIPage = lazyWithRetry(() =>
  import("./pages/AI.jsx").then((m) => ({ default: m.StrugAIPage })),
);
const SavedRefCodesPage = lazyWithRetry(() =>
  import("./pages/Account.jsx").then((m) => ({ default: m.SavedRefCodesPage })),
);
const WalletEarningsPage = lazyWithRetry(() =>
  import("./pages/Account.jsx").then((m) => ({
    default: m.WalletEarningsPage,
  })),
);
const MessagesPage = lazyWithRetry(() =>
  import("./pages/Messages.jsx").then((m) => ({ default: m.MessagesPage })),
);
const UserDashboardPage = lazyWithRetry(() =>
  import("./pages/Account.jsx").then((m) => ({ default: m.UserDashboardPage })),
);
const OrdersHistoryPage = lazyWithRetry(() =>
  import("./pages/Account.jsx").then((m) => ({ default: m.OrdersHistoryPage })),
);
// #429: the legal documents (Terms / Privacy / Cookies).
const LegalPage = lazyWithRetry(() => import("./pages/Legal.jsx"));
const UserSettingsPage = lazyWithRetry(() =>
  import("./pages/Account.jsx").then((m) => ({ default: m.UserSettingsPage })),
);
const HelpCenterPage = lazyWithRetry(() =>
  import("./pages/Account.jsx").then((m) => ({ default: m.HelpCenterPage })),
);
const SellerDriveDashboard = lazyWithRetry(() =>
  import("./pages/seller/SellerDriveDashboard.jsx"),
);
const OnDemandWorker = lazyWithRetry(() => import("./pages/OnDemandWorker.jsx"));
const OnDemandHire = lazyWithRetry(() => import("./pages/OnDemandHire.jsx"));
const QuotesPage = lazyWithRetry(() => import("./pages/Quotes.jsx"));
const QuoteProviderDashboard = lazyWithRetry(() => import("./pages/QuoteProviderDashboard.jsx"));
const RecruiterPage = lazyWithRetry(() => import("./pages/Recruiter.jsx"));
const JobsPage = lazyWithRetry(() => import("./pages/Jobs.jsx"));
const EmployerPage = lazyWithRetry(() => import("./pages/EmployerDashboard.jsx"));
const SellerEcommerceDashboard = lazyWithRetry(() =>
  import("./pages/seller/SellerEcommerceDashboard.jsx"),
);
const SellerFoodDashboard = lazyWithRetry(() =>
  import("./pages/seller/SellerFoodDashboard.jsx"),
);
const SellerHostingDashboard = lazyWithRetry(() =>
  import("./pages/seller/SellerHostingDashboard.jsx"),
);
const SellerServicesDashboard = lazyWithRetry(() =>
  import("./pages/seller/SellerServicesDashboard.jsx"),
);
const SellerCreatorDashboard = lazyWithRetry(() =>
  import("./pages/seller/SellerCreatorDashboard.jsx"),
);
const SellerDecorDashboard = lazyWithRetry(() =>
  import("./pages/seller/SellerDecorDashboard.jsx"),
);
const SellerWeddingDashboard = lazyWithRetry(() =>
  import("./pages/SellerDashboards.jsx").then((m) => ({
    default: m.SellerWeddingDashboard,
  })),
);
const SellerAutomotiveDashboard = lazyWithRetry(() =>
  import("./pages/seller/SellerAutomotiveDashboard.jsx"),
);
const SellerCelebrityDashboard = lazyWithRetry(() =>
  import("./pages/seller/SellerCelebrityDashboard.jsx"),
);
const SellerInfluencerDashboard = lazyWithRetry(() =>
  import("./pages/seller/SellerInfluencerDashboard.jsx"),
);
const SellerJobsDashboard = lazyWithRetry(() =>
  import("./pages/seller/SellerJobsDashboard.jsx"),
);
const SellerStreamDashboard = lazyWithRetry(() =>
  import("./pages/seller/SellerStreamDashboard.jsx"),
);
const UserProfilePage = lazyWithRetry(() =>
  import("./pages/UserProfile.jsx").then((m) => ({
    default: m.UserProfilePage,
  })),
);
const SpotlightOverlay = lazyWithRetry(() =>
  import("./pages/Hub.jsx").then((m) => ({ default: m.SpotlightOverlay })),
);
const NavHubPage = lazyWithRetry(() =>
  import("./pages/Hub.jsx").then((m) => ({ default: m.NavHubPage })),
);
// OnDemandPage (old bidding flow) replaced by OnDemandHire (rideshare-style booking). M9 removes the old file.
const VideosPage = lazyWithRetry(() =>
  import("./pages/Videos.jsx").then((m) => ({ default: m.VideosPage })),
);
const FoodPage = lazyWithRetry(() =>
  import("./pages/Food.jsx").then((m) => ({ default: m.FoodPage })),
);
const DatingPage = lazyWithRetry(() =>
  import("./pages/Dating.jsx").then((m) => ({ default: m.DatingPage })),
);
const EcommercePage = lazyWithRetry(() =>
  import("./pages/Ecommerce.jsx").then((m) => ({ default: m.EcommercePage })),
);
const LessonsPage = lazyWithRetry(() =>
  import("./pages/Lessons.jsx").then((m) => ({ default: m.LessonsPage })),
);
const PreconstructPage = lazyWithRetry(() =>
  import("./pages/Preconstruct.jsx").then((m) => ({
    default: m.PreconstructPage,
  })),
);
const EventsPage = lazyWithRetry(() =>
  import("./pages/Events.jsx").then((m) => ({ default: m.EventsPage })),
);
const EventConciergePage = lazyWithRetry(() =>
  import("./pages/EventConcierge.jsx").then((m) => ({
    default: m.EventConciergePage,
  })),
);
const EventPlanPage = lazyWithRetry(() =>
  import("./pages/EventPlan.jsx").then((m) => ({ default: m.EventPlanPage })),
);
const GroceriesPage = lazyWithRetry(() =>
  import("./pages/Groceries.jsx").then((m) => ({ default: m.GroceriesPage })),
);
const FavouritesPage = lazyWithRetry(() =>
  import("./pages/Favourites.jsx").then((m) => ({ default: m.FavouritesPage })),
);
const PinBoardPage = lazyWithRetry(() =>
  import("./pages/PinBoard.jsx").then((m) => ({ default: m.PinBoardPage })),
);
const RidesharePage = lazyWithRetry(() =>
  import("./pages/Rideshare.jsx").then((m) => ({ default: m.RidesharePage })),
);
const LearnPage = lazyWithRetry(() =>
  import("./pages/Learn.jsx").then((m) => ({ default: m.LearnPage })),
);
const PortfolioPage = lazyWithRetry(() =>
  import("./pages/Portfolio.jsx").then((m) => ({ default: m.PortfolioPage })),
);
const VehicleRentalPage = lazyWithRetry(() =>
  import("./pages/VehicleRental.jsx").then((m) => ({
    default: m.VehicleRentalPage,
  })),
);
const AutomotivePage = lazyWithRetry(() =>
  import("./pages/Automotive.jsx").then((m) => ({ default: m.AutomotivePage })),
);
const DecorPage = lazyWithRetry(() =>
  import("./pages/Decor.jsx").then((m) => ({ default: m.DecorPage })),
);
const RealEstatePage = lazyWithRetry(() =>
  import("./pages/RealEstate.jsx").then((m) => ({ default: m.RealEstatePage })),
);
const FloralPage = lazyWithRetry(() =>
  import("./pages/Floral.jsx").then((m) => ({ default: m.FloralPage })),
);
const EquipmentPage = lazyWithRetry(() =>
  import("./pages/Equipment.jsx").then((m) => ({ default: m.EquipmentPage })),
);
const VenuesPage = lazyWithRetry(() =>
  import("./pages/Venues.jsx").then((m) => ({ default: m.VenuesPage })),
);
const TempStayPage = lazyWithRetry(() =>
  import("./pages/TempStay.jsx").then((m) => ({ default: m.TempStayPage })),
);
const DiscountsPage = lazyWithRetry(() =>
  import("./pages/Discounts.jsx").then((m) => ({ default: m.DiscountsPage })),
);
const CateringPage = lazyWithRetry(() =>
  import("./pages/Catering.jsx").then((m) => ({ default: m.CateringPage })),
);
const SecondHandPage = lazyWithRetry(() =>
  import("./pages/SecondHand.jsx").then((m) => ({ default: m.SecondHandPage })),
);
const MeetPage = lazyWithRetry(() =>
  import("./pages/Meet.jsx").then((m) => ({ default: m.MeetPage })),
);
const BooksPage = lazyWithRetry(() =>
  import("./pages/Books.jsx").then((m) => ({ default: m.BooksPage })),
);
const ArtistCornerPage = lazyWithRetry(() =>
  import("./pages/ArtistCorner.jsx").then((m) => ({
    default: m.ArtistCornerPage,
  })),
);
const DigitalServicesPage = lazyWithRetry(() =>
  import("./pages/DigitalServices.jsx").then((m) => ({
    default: m.DigitalServicesPage,
  })),
);
const MedicalPage = lazyWithRetry(() =>
  import("./pages/Medical.jsx").then((m) => ({ default: m.MedicalPage })),
);
const InfluencerPage = lazyWithRetry(() =>
  import("./pages/Influencer.jsx").then((m) => ({ default: m.InfluencerPage })),
);
const BookArtistPage = lazyWithRetry(() =>
  import("./pages/BookArtistLauncher.jsx").then((m) => ({ default: m.BookArtistPage })),
);
const HotelPage = lazyWithRetry(() =>
  import("./pages/Hotel.jsx").then((m) => ({ default: m.HotelPage })),
);
const CourierPage = lazyWithRetry(() =>
  import("./pages/Courier.jsx").then((m) => ({ default: m.CourierPage })),
);
const RaisePage = lazyWithRetry(() =>
  import("./pages/Raise.jsx").then((m) => ({ default: m.RaisePage })),
);
const ReservationsPage = lazyWithRetry(() =>
  import("./pages/Reservations.jsx").then((m) => ({
    default: m.ReservationsPage,
  })),
);
const CelebrityPage = lazyWithRetry(() =>
  import("./pages/Celebrity.jsx").then((m) => ({ default: m.CelebrityPage })),
);
const ExperiencesPage = lazyWithRetry(() =>
  import("./pages/Experiences.jsx").then((m) => ({
    default: m.ExperiencesPage,
  })),
);
const WeddingPage = lazyWithRetry(() =>
  import("./pages/Wedding.jsx").then((m) => ({ default: m.WeddingPage })),
);
const ProServicesPage = lazyWithRetry(() =>
  import("./pages/ProServices.jsx").then((m) => ({
    default: m.ProServicesPage,
  })),
);
const DigitalProductsPage = lazyWithRetry(() =>
  import("./pages/DigitalProducts.jsx").then((m) => ({
    default: m.DigitalProductsPage,
  })),
);
const SocialPage = lazyWithRetry(() =>
  import("./pages/Social.jsx").then((m) => ({ default: m.SocialPage })),
);
const CommunityPage = lazyWithRetry(() =>
  import("./pages/Community.jsx").then((m) => ({ default: m.CommunityPage })),
);
const LivePage = lazyWithRetry(() =>
  import("./pages/Live.jsx").then((m) => ({ default: m.LivePage })),
);
const AdminDashboard = lazyWithRetry(() =>
  import("./pages/Admin.jsx")
);
const NAV_ITEMS = [
  { id: "home", label: "Home", icon: HomeIcon, sectionHeader: "core" },
  {
    id: "become",
    label: "Provider Hub",
    icon: EarnIcon,
    keywords: ["become", "earn", "sell", "provider", "seller", "creator", "make money"],
  },
  {
    id: "ondemand",
    label: "Work",
    icon: OnDemandIcon,
    keywords: ["on demand", "gigs", "freelance"],
  },
  {
    id: "rideshare",
    label: "Ride",
    icon: RideshareIcon,
    keywords: ["rideshare", "ride share"],
  },
  { id: "videos", label: "Videos", icon: VideoIcon },
  {
    id: "feed",
    label: "Social",
    icon: FeedIcon,
    keywords: ["feed", "social feed", "photos"],
  },
  {
    id: "social",
    label: "Town Hall",
    icon: SocialIcon,
    keywords: ["social", "town hall"],
  },
  { id: "food", label: "Food", icon: FoodIcon },
  {
    id: "shop",
    label: "Shop",
    icon: ShopIcon,
    sectionHeader: "commerceServices",
  },
  { id: "live", label: "Live", icon: LiveIcon },
  {
    id: "tempstay",
    label: "Temp Stay",
    icon: TempStayIcon,
    keywords: ["temporary stay", "short term rental"],
  },
  {
    id: "jobs",
    label: "Jobs",
    icon: JobsIcon,
    keywords: ["jobs", "careers", "hiring", "job board", "vacancies"],
  },
  { id: "community", label: "Community", icon: CommunityIcon },
  {
    id: "reservations",
    label: "Bookings",
    icon: ReservationsIcon,
    keywords: ["reservations", "restaurant booking", "table booking"],
  },
  { id: "groceries", label: "Groceries", icon: GroceriesIcon },
  { id: "lessons", label: "Lessons", icon: LessonsIcon },
  {
    id: "preconstruct",
    label: "Construct",
    icon: PreconstructIcon,
    keywords: ["preconstruction", "pre construction", "construction"],
  },

  // Event Planning cluster — Concierge sits with the verticals it orchestrates
  {
    id: "events",
    label: "Events",
    icon: EventsIcon,
    sectionHeader: "eventPlanning",
  },
  {
    id: "concierge",
    label: "Event Concierge",
    icon: ConciergeIcon,
    keywords: ["concierge", "event planner", "plan event", "wedding planner", "invitations", "rsvp", "registry", "gift registry"],
  },
  { id: "venues", label: "Venues", icon: VenuesIcon },
  { id: "floral", label: "Floral", icon: FloralIcon },
  { id: "decor", label: "Décor", icon: DecorIcon },
  { id: "catering", label: "Catering", icon: CateringIcon },
  { id: "wedding", label: "Wedding", icon: WeddingIcon },
  { id: "equipment", label: "Equipment", icon: EquipmentIcon },

  {
    id: "realestate",
    label: "Real Estate",
    icon: RealEstateIcon,
    sectionHeader: "placesStay",
  },
  { id: "automotive", label: "Automotive", icon: AutomotiveIcon },
  { id: "vehicles", label: "Vehicles", icon: VehiclesIcon },
  { id: "hotel", label: "Hotels", icon: HotelIcon },
  { id: "courier", label: "Courier", icon: CourierIcon },
  { id: "insurance", label: "Insurance", icon: _IcoInsurance },
  { id: "mortgage", label: "Mortgage", icon: _IcoMortgage },
  {
    id: "dating",
    label: "Dating",
    icon: DatingIcon,
    keywords: ["date", "dating", "blind date", "match", "relationship"],
    dividerAfter: true,
  },

  {
    id: "pinboard",
    label: "Pin Board",
    icon: PinBoardIcon,
    sectionHeader: "contentCreative",
  },
  { id: "favourites", label: "Favourites", icon: FavouritesIcon },
  { id: "experiences", label: "Experiences", icon: ExperiencesIcon },
  {
    id: "proservices",
    label: "Professional Services",
    icon: ProServicesIcon,
    keywords: ["pro services", "professional services"],
  },
  {
    id: "digservices",
    label: "Digital Services",
    icon: DigServicesIcon,
    keywords: ["digital services"],
  },
  {
    id: "employer",
    label: "Employer",
    icon: EmployerIcon,
    keywords: ["employer", "post a job", "recruit", "hire", "applicants"],
  },
  { id: "artists", label: "Artists", icon: ArtistsIcon },
  {
    id: "secondhand",
    label: "2nd Hand",
    icon: SecondHandIcon,
    keywords: ["second hand", "secondhand", "used items"],
  },
  {
    id: "celebrity",
    label: "Celebrity",
    icon: CelebrityIcon,
    dividerAfter: true,
  },

  {
    id: "discounts",
    label: "Discounts",
    icon: DiscountsIcon,
    sectionHeader: "socialCommunity",
  },
  { id: "portfolio", label: "Portfolio", icon: PortfolioIcon },
  { id: "influencer", label: "Influencer", icon: InfluencerIcon },
  {
    id: "bookartist",
    label: "Book Artist",
    icon: BookArtistIcon,
    keywords: ["book an artist", "hire artist"],
  },
  { id: "books", label: "Books", icon: BooksIcon },
  { id: "medical", label: "Medical", icon: MedicalIcon },
  { id: "raise", label: "Raise", icon: RaiseIcon },
  { id: "meet", label: "Meet", icon: MeetIcon },
  {
    id: "digproducts",
    label: "Digital Products",
    icon: DigProductsIcon,
    keywords: ["digital products"],
  },
  { id: "learn", label: "Learn", icon: LearnIcon },

  {
    id: "refcodes",
    label: "Saved Ref Code",
    icon: RefCodeIcon,
    sectionHeader: "account",
  },
  { id: "wallet", label: "Wallet & Earnings", icon: WalletEarningsIcon },
  { id: "messages", label: "Messages", icon: MessagesIcon },
  { id: "dashboard", label: "Dashboard", icon: DashboardIcon },
  { id: "orders", label: "Order History", icon: OrdersIcon },
  { id: "settings", label: "Settings", icon: UserSettingsIcon },
  { id: "help", label: "Help Center", icon: HelpCenterIcon },
];

const NAV_ITEM_IMAGES = {
  ondemand: "/img/Work.jpg",
  videos: "/img/Videos.jpg",
  shop: "/img/Shop.jpg",
  food: "/img/Food.jpg",
  dating: "/img/Meet.jpg",
  lessons: "/img/Lessons.jpg",
  preconstruct: "/img/Construction.jpg",
  tempstay: "/img/Temp Stay.JPG",
  jobs: "/img/Jobs.jpg",
  events: "/img/Events.jpg",
  concierge: "/img/Events.jpg",
  venues: "/img/Venues.jpg",
  groceries: "/img/Groceries.jpg",
  equipment: "/img/Equipment.jpg",
  floral: "/img/Floral.jpg",
  realestate: "/img/Real Estate.jpg",
  decor: "/img/Decor.jpg",

  automotive: "/img/Automotive.jpg",
  vehicles: "/img/Vehicle Rental.jpg",
  rideshare: "/img/Ride.jpg",
  hotel: "/img/Hotel.jpg",
  courier: "/img/Courier.jpg",
  pinboard: "/img/Pin Board.jpg",
  favourites: "/img/Favourites.jpg",
  experiences: "/img/Experiences.jpg",
  wedding: "/img/Wedding.jpg",
  proservices: "/img/Prof Serv.jpg",
  digservices: "/img/Dig Services.jpg",
  artists: "/img/Artist.jpg",
  secondhand: "/img/Second Hand.jpg",
  reservations: "/img/Bookings.jpg",
  celebrity: "/img/Celebrity.jpg",
  social: "/img/Town Hall.jpg",
  feed: "/img/Social.jpg",
  community: "/img/Community.jpg",
  live: "/img/Live.jpg",
  discounts: "/img/Discounts.jpg",
  portfolio: "/img/Portfolio.jpg",
  influencer: "/img/Influencers.jpg",
  bookartist: "/img/Book An Artist.jpg",
  books: "/img/Books.jpg",
  medical: "/img/Medical.jpg",
  catering: "/img/Catering.jpg",
  raise: "/img/Raise.jpg",
  meet: "/img/Meet.jpg",
  learn: "/img/Learn.jpg",
  insurance: "/img/Insurance.jpg",
  mortgage: "/img/Mortgage.jpg",
  settings: "/img/Settings.jpg",
};

NAV_ITEMS.forEach((item) => {
  if (NAV_ITEM_IMAGES[item.id]) {
    item.image = NAV_ITEM_IMAGES[item.id];
  }
});

// Verticals temporarily hidden from all nav surfaces (hub, mobile sheet,
// spotlight). They stay in ALL_NAV_IDS so deep links still resolve, but render
// the shared ComingSoonPage instead of the real page. To re-enable, remove the
// id here and from HIDDEN_VERTICALS copy in components/ComingSoon.jsx.
const HIDDEN_VERTICALS = new Set(["learn", "portfolio", "lessons"]);
// Jobs Phase 0 (LOCKED): home shows Jobs only. Employer stays routable for deep
// links (Jobs → Hiring, Become / sd-jobs) but is not a second hub tile.
const HUB_DEEPLINK_ONLY = new Set(["employer"]);
const VISIBLE_NAV_ITEMS = NAV_ITEMS.filter(
  (n) => !HIDDEN_VERTICALS.has(n.id) && !HUB_DEEPLINK_ONLY.has(n.id),
);

// The curated set pinned to the desktop icon rail (SidebarScrollNav) — a subset of
// NAV_ITEMS plus a couple of rail-only ids ("rideshare", "ai") that don't have a
// browse-by-category home in NAV_ITEMS. Named so the "recent verticals" lookup below
// can resolve icons/labels for rail-only ids too.
const SIDEBAR_ITEMS = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "rideshare", label: "Ride", icon: RideshareIcon },
  { id: "videos", label: "Videos", icon: VideoIcon },
  { id: "feed", label: "Social", icon: FeedIcon },
  { id: "social", label: "Town Hall", icon: SocialIcon },
  { id: "food", label: "Food", icon: FoodIcon },
  { id: "shop", label: "Shop", icon: ShopIcon },
  { id: "live", label: "Live", icon: LiveIcon },
  { id: "tempstay", label: "Temp Stay", icon: TempStayIcon },
  { id: "refcodes", label: "Ref Code", icon: RefCodeIcon },
  { id: "messages", label: "Messages", icon: MessagesIcon },
  { id: "ondemand", label: "Work", icon: OnDemandIcon },
  { id: "ai", label: "AI", icon: AISparkleIcon },
  { id: "wallet", label: "Wallet", icon: WalletEarningsIcon },
  { id: "discounts", label: "Discounts", icon: DiscountsIcon },
  { id: "favourites", label: "Saves", icon: FavouritesIcon },
  { id: "dating", label: "Dating", icon: DatingIcon },
];

const NAV_ICON_BY_ID = Object.fromEntries(
  [...NAV_ITEMS, ...SIDEBAR_ITEMS].map((n) => [n.id, n.icon]),
);
const NAV_LABEL_BY_ID = Object.fromEntries(
  [...NAV_ITEMS, ...SIDEBAR_ITEMS].map((n) => [n.id, n.label]),
);

// Split-view library: the right pane opens on a browsable shelf of every
// vertical, grouped by the same sections the sidebar uses. Derived from
// NAV_ITEMS so a new vertical shows up here automatically.
const SPLIT_SECTION_TITLES = {
  core: "Essentials",
  commerceServices: "Commerce & Services",
  eventPlanning: "Event Planning",
  placesStay: "Places & Travel",
  contentCreative: "Content & Creative",
  socialCommunity: "Social & Community",
  account: "Your Account",
};

const SPLIT_SECTIONS = (() => {
  const sections = [];
  let current = null;
  for (const item of NAV_ITEMS) {
    if (item.sectionHeader) {
      current = {
        key: item.sectionHeader,
        title: SPLIT_SECTION_TITLES[item.sectionHeader] || item.sectionHeader,
        pages: [],
      };
      sections.push(current);
    }
    if (!current || HIDDEN_VERTICALS.has(item.id) || HUB_DEEPLINK_ONLY.has(item.id)) continue;
    current.pages.push({ id: item.id, label: item.label, image: item.image });
  }
  return sections.filter((s) => s.pages.length > 0);
})();

import {
  StrugLogo,
  ProfileIcon,
  HomeIcon,
  AISparkleIcon,
  FullscreenEnterIcon,
  FullscreenExitIcon,
  VideoIcon,
  MoreIcon,
  SearchIcon,
  OnDemandIcon,
  SocialIcon,
  CommunityIcon,
  LiveIcon,
  FeedIcon,
  PinBoardIcon,
  FavouritesIcon,
  FoodIcon,
  DatingIcon,
  GroceriesIcon,
  CateringIcon,
  RealEstateIcon,
  TempStayIcon,
  VenuesIcon,
  ExperiencesIcon,
  ShopIcon,
  SecondHandIcon,
  FloralIcon,
  DigProductsIcon,
  ProServicesIcon,
  DigServicesIcon,
  MedicalIcon,
  LessonsIcon,
  LearnIcon,
  ArtistsIcon,
  PortfolioIcon,
  BooksIcon,
  HotelIcon,
  CourierIcon,
  BookArtistIcon,
  InfluencerIcon,
  EventsIcon,
  ConciergeIcon,
  WeddingIcon,
  ReservationsIcon,
  MeetIcon,
  CelebrityIcon,
  EquipmentIcon,
  AutomotiveIcon,
  VehiclesIcon,
  RideshareIcon,
  DecorIcon,
  PreconstructIcon,
  RaiseIcon,
  DiscountsIcon,
  RefCodeIcon,
  WalletEarningsIcon,
  MessagesIcon,
  DashboardIcon,
  OrdersIcon,
  UserSettingsIcon,
  HelpCenterIcon,
  EarnIcon,
  JobsIcon,
  EmployerIcon,
} from "./components/icons.jsx";
import { WelcomeModal, BecomeHub, SellerHub, GuidedTour, CategoryOnboardCard } from "./components/OnboardingCards.jsx";
import { CATEGORY_ONBOARDING } from "./components/categoryOnboarding.js";

const _IcoDrive = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4l3 3" />
  </svg>
);
const _IcoShop = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 01-8 0" />
  </svg>
);
const _IcoWrench = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
);
const _IcoPlay = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);
const _IcoStream = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 10l-4 4 4 4" />
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);
const _IcoCourier = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="1" y="3" width="15" height="13" />
    <path d="M16 8h4l3 3v5h-7V8z" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
);
const _IcoFood = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 8h1a4 4 0 010 8h-1" />
    <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />
    <line x1="6" y1="1" x2="6" y2="4" />
    <line x1="10" y1="1" x2="10" y2="4" />
    <line x1="14" y1="1" x2="14" y2="4" />
  </svg>
);
const _IcoGrocery = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
  </svg>
);
const _IcoCatering = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 11l19-9-9 19-2-8-8-2z" />
  </svg>
);
const _IcoLesson = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
    <path d="M6 12v5c3.33 2 8.67 2 12 0v-5" />
  </svg>
);
const _IcoRealty = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
    <path d="M9 21V12h6v9" />
  </svg>
);
const _IcoConstruct = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 00-4 0v2M8 21V11M16 21V11" />
  </svg>
);
const _IcoHost = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
    <path d="M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0" />
  </svg>
);
const _IcoCar = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v9a2 2 0 01-2 2h-2" />
    <circle cx="9" cy="17" r="2" />
    <circle cx="17" cy="17" r="2" />
  </svg>
);
const _IcoEvent = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const _IcoHotel = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 22V8l9-5 9 5v14" />
    <path d="M9 22V12h6v10" />
    <path d="M9 9h.01M15 9h.01" />
  </svg>
);
const _IcoVenue = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
const _IcoEquip = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
);
const _IcoFloral = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22V12M12 12C12 12 7 9 7 5a5 5 0 0110 0c0 4-5 7-5 7z" />
    <path d="M12 12c0 0-5 3-8 1a4 4 0 015.66-5.66C11 9 12 12 12 12z" />
    <path d="M12 12c0 0 5 3 8 1a4 4 0 00-5.66-5.66C13 9 12 12 12 12z" />
  </svg>
);
const _IcoDecor = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);
const _IcoAuto = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);
const _IcoExp = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polygon points="10 8 16 12 10 16 10 8" />
  </svg>
);
const _IcoWed = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
  </svg>
);
const _IcoProf = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
    <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
  </svg>
);
const _IcoFreel = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" />
    <path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32" />
  </svg>
);
const _IcoCeleb = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);
const _IcoPalette = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </svg>
);
const _IcoBook = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
  </svg>
);
const _IcoDoc = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.91a16 16 0 006.16 6.16l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
  </svg>
);
const _IcoJob = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 00-4 0v2M12 12v4M10 14h4" />
  </svg>
);
const _IcoMeal = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2" />
    <path d="M7 2v20M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
  </svg>
);
const _IcoInflu = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87" />
    <path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);
const _IcoDisc = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    <line x1="9" y1="3" x2="9.01" y2="3" />
    <line x1="14" y1="21" x2="14.01" y2="21" />
  </svg>
);
const _IcoUsed = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
);
const _IcoBooking = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
  </svg>
);
const _IcoLearn2 = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
    <path d="M6 12v5c3.33 2 8.67 2 12 0v-5" />
  </svg>
);

// Compass — "Take the tour" entry in the profile menu (replay the walkthrough).
const _IcoTour = ({ s = 20 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <polygon points="16 8 10.5 10.5 8 16 13.5 13.5" />
  </svg>
);

const MORE_ITEMS = [
  {
    label: "Strug Drive",
    desc: "Rideshare, delivery & carpooling",
    icon: _IcoDrive,
    navId: "sd-drive",
  },
  {
    label: "Sell on Strug",
    desc: "Ecommerce & shop vendors",
    icon: _IcoShop,
    navId: "sd-ecommerce",
  },
  {
    label: "Provide a Service",
    desc: "List services clients browse and book",
    icon: _IcoWrench,
    navId: "sd-services",
  },
  {
    label: "Become a Worker",
    desc: "Get hired for on-demand gigs nearby",
    icon: _IcoWrench,
    navId: "sd-work",
  },
  {
    label: "Post jobs / Hire",
    desc: "Company profile, job postings & applicant pipeline",
    icon: _IcoJob,
    navId: "sd-jobs",
  },
  {
    label: "Become a Creator",
    desc: "Long form video content",
    icon: _IcoPlay,
    navId: "sd-creator",
  },
  {
    label: "Become a Streamer",
    desc: "Live streaming to your audience",
    icon: _IcoStream,
    navId: "sd-streamer",
  },
  {
    label: "Become a Courier",
    desc: "Deliver packages and orders",
    icon: _IcoCourier,
    navId: "sd-courier",
  },
  {
    label: "Sell Food",
    desc: "Restaurants and other food vendors",
    icon: _IcoFood,
    navId: "sd-food",
  },
  {
    label: "Sell Groceries",
    desc: "List your grocery store or produce",
    icon: _IcoGrocery,
    navId: "sd-groceries",
  },
  {
    label: "Provide Catering",
    desc: "Events, corporate, and private catering",
    icon: _IcoCatering,
    navId: "sd-catering",
  },
  {
    label: "Real Estate Agent",
    desc: "For agents and brokers",
    icon: _IcoRealty,
    navId: "sd-realestate",
  },
  {
    label: "Precon. Developer",
    desc: "For construction developers",
    icon: _IcoConstruct,
    navId: "sd-precon",
  },
  {
    label: "Host",
    desc: "Host your property",
    icon: _IcoHost,
    navId: "sd-host",
  },
  {
    label: "Vehicle Provider",
    desc: "Rent out your vehicles",
    icon: _IcoCar,
    navId: "sd-vehicle",
  },
  {
    label: "Events & Occasions",
    desc: "List and manage events",
    icon: _IcoEvent,
    navId: "sd-events",
  },
  {
    label: "Hotel Provider",
    desc: "List your hotel or B&B",
    icon: _IcoHotel,
    navId: "sd-hotel",
  },
  {
    label: "Venue Provider",
    desc: "Rent out your venue",
    icon: _IcoVenue,
    navId: "sd-venue",
  },
  {
    label: "Rent Equipment",
    desc: "List tools and equipment for hire",
    icon: _IcoEquip,
    navId: "sd-equipment",
  },
  {
    label: "Sell Flowers",
    desc: "Floral arrangements and bouquets",
    icon: _IcoFloral,
    navId: "sd-flowers",
  },
  {
    label: "Décor Provider",
    desc: "Interior and event décor",
    icon: _IcoDecor,
    navId: "sd-decor",
  },
  {
    label: "Automotive Provider",
    desc: "Auto services and repairs",
    icon: _IcoAuto,
    navId: "sd-automotive",
  },
  {
    label: "Experience Provider",
    desc: "Unique activities and experiences",
    icon: _IcoExp,
    navId: "sd-experiences",
  },
  {
    label: "Wedding Services",
    desc: "Photography, planning, and more",
    icon: _IcoWed,
    navId: "sd-wedding",
  },
  {
    label: "Professionals Portal",
    desc: "Lawyers, accountants, consultants",
    icon: _IcoProf,
    navId: "sd-proservices",
  },
  {
    label: "Freelancer",
    desc: "Offer your skills on your own terms",
    icon: _IcoFreel,
    navId: "sd-freelancer",
  },
  {
    label: "Sell Used Products",
    desc: "List pre-owned items for sale",
    icon: _IcoUsed,
    navId: "sd-usedproducts",
  },
  {
    label: "Restaurant Bookings",
    desc: "Manage table reservations",
    icon: _IcoBooking,
    navId: "sd-restbookings",
  },
  {
    label: "Celebrity / Talent",
    desc: "Bookings and appearances",
    icon: _IcoCeleb,
    navId: "sd-celebrity",
  },
  {
    label: "List Discounts",
    desc: "Promote deals and offers",
    icon: _IcoDisc,
    navId: "sd-listdiscounts",
  },
  {
    label: "Influencers Portal",
    desc: "Brand partnerships and campaigns",
    icon: _IcoInflu,
    navId: "sd-influencer",
  },
  {
    label: "Starving Artist",
    desc: "Sell your original artwork",
    icon: _IcoPalette,
    navId: "sd-artist",
  },
  {
    label: "Authors",
    desc: "Publish and sell your books",
    icon: _IcoBook,
    navId: "sd-authors",
  },
  {
    label: "Doctors Portal",
    desc: "Medical consultations and services",
    icon: _IcoDoc,
    navId: "sd-doctors",
  },
  {
    label: "Sell Digital Products",
    desc: "Software, templates, and downloads",
    icon: _IcoJob,
    navId: "sd-digproducts",
  },
  {
    label: "Become an Insurance Provider",
    desc: "Offer insurance products and plans",
    icon: _IcoInsurance,
    navId: "sd-insurance",
  },
  {
    label: "Become a Mortgage Provider",
    desc: "Connect buyers with mortgage solutions",
    icon: _IcoMortgage,
    navId: "sd-mortgage",
  },
];

// The "More" flyout used to list every become-a-provider dashboard; that's now the dedicated
// /provider hub (reached via the "Become a Provider" sidebar button). Per Codezero the flyout
// items are removed — but the flyout component + MORE_ITEMS stay (MORE_ITEMS still backs is404
// nav-recognition for the sd-* dashboards), so the flyout can showcase new "extra pages" later.
// Add entries here to populate it again.
const MORE_FLYOUT_ITEMS = [];

const MORE_NAV_I18N = {
  "sd-drive": "strugDrive",
  "sd-ecommerce": "sellOnStrug",
  "sd-services": "services",
  "sd-work": "work",
  "sd-creator": "creator",
  "sd-streamer": "streamer",
  "sd-courier": "courier",
  "sd-food": "sellFood",
  "sd-groceries": "sellGroceries",
  "sd-catering": "catering",
  "sd-instructor": "instructor",
  "sd-realestate": "realEstate",
  "sd-precon": "precon",
  "sd-host": "host",
  "sd-vehicle": "vehicle",
  "sd-events": "events",
  "sd-hotel": "hotel",
  "sd-venue": "venue",
  "sd-equipment": "equipment",
  "sd-flowers": "sellFlowers",
  "sd-decor": "decor",
  "sd-automotive": "automotive",
  "sd-experiences": "experiences",
  "sd-wedding": "wedding",
  "sd-proservices": "professionals",
  "sd-freelancer": "freelancer",
  "sd-usedproducts": "sellUsed",
  "sd-restbookings": "restaurantBookings",
  "sd-celebrity": "celebrity",
  "sd-listdiscounts": "listDiscounts",
  "sd-influencer": "influencer",
  "sd-artist": "artist",
  "sd-authors": "authors",
  "sd-doctors": "doctors",
  "sd-digproducts": "digitalProducts",
  "sd-jobs": "jobs",
  "sd-mealkit": "mealKit",
  "sd-insurance": "insurance",
  "sd-mortgage": "mortgage",
};

function moreItemLabel(t, item) {
  const fly = t(`providerFlyout.${item.navId}.title`, { defaultValue: "" });
  if (fly) return fly;
  const key = MORE_NAV_I18N[item.navId];
  return key
    ? t(`sellerDash.${key}.title`, { defaultValue: item.label })
    : item.label;
}

function moreItemDesc(t, item) {
  const fly = t(`providerFlyout.${item.navId}.desc`, { defaultValue: "" });
  if (fly) return fly;
  const key = MORE_NAV_I18N[item.navId];
  return key
    ? t(`sellerDash.${key}.subtitle`, { defaultValue: item.desc })
    : item.desc;
}

function navC(_t, id, fallback) {
  return i18n.t(`nav.${id}`, { defaultValue: fallback });
}

function sdC(_t, key, fallback) {
  return i18n.t(`sellerDash.common.${key}`, { defaultValue: fallback });
}

function MoreFlyout({ onClose, onNavigate }) {
  const { t } = useTranslation();
  const scrollRef = useRef(null);
  const [atBottom, setAtBottom] = useState(false);
  const [becomeSearch, setBecomeSearch] = useState("");

  function checkBottom() {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 10);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkBottom();
    el.addEventListener("scroll", checkBottom, { passive: true });
    return () => el.removeEventListener("scroll", checkBottom);
  }, []);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 92,
          right: 0,
          bottom: 0,
          zIndex: 29,
        }}
      />
      <div
        className="bg-surface border border-border"
        style={{
          position: "fixed",
          left: 92,
          top: 12,
          bottom: 14,
          zIndex: 30,
          width: 280,
          borderRadius: 16,
          boxShadow: "8px 0 40px rgba(0,0,0,0.7)",
          display: "flex",
          flexDirection: "column",
          animation: "flyoutIn 0.15s ease both",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 20px 10px",
            flexShrink: 0,
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <h2
            className="text-text-primary"
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: 20,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 2,
            }}
          >
            {t("app.becomeProvider")}
          </h2>
          <p
            className="text-text-secondary"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 11,
              marginBottom: 10,
            }}
          >
            {t("app.becomeProviderSub")}
          </p>
          {/* Search only matters when the flyout has items; hidden while it's empty. */}
          {MORE_FLYOUT_ITEMS.length > 0 && (
          <div style={{ position: "relative" }}>
            <svg
              width={13}
              height={13}
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
              }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={becomeSearch}
              onChange={(e) => setBecomeSearch(e.target.value)}
              placeholder={t("app.searchProvider")}
              className="bg-surface-raised border border-border text-text-primary"
              style={{
                width: "100%",
                padding: "8px 10px 8px 30px",
                borderRadius: 8,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                outline: "none",
              }}
            />
          </div>
          )}
        </div>

        <div
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          <div ref={scrollRef} style={{ height: "100%", overflowY: "auto" }}>
            <div style={{ padding: "0 8px 8px" }}>
              {(() => {
                const filtered = MORE_FLYOUT_ITEMS.filter(
                  (item) =>
                    !becomeSearch.trim() ||
                    moreItemLabel(t, item)
                      .toLowerCase()
                      .includes(becomeSearch.toLowerCase()) ||
                    moreItemDesc(t, item)
                      .toLowerCase()
                      .includes(becomeSearch.toLowerCase()),
                );
                if (filtered.length === 0)
                  return (
                    <div style={{ padding: "28px 16px", textAlign: "center" }}>
                      <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
                        Looking to earn on Strug? Browse every way to become a provider.
                      </p>
                      <button
                        onClick={() => { onNavigate?.("provider"); onClose(); }}
                        style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: PAGE_COLORS.provider, background: "rgba(47,158,68,0.10)", border: "1px solid rgba(47,158,68,0.32)", borderRadius: 20, padding: "8px 16px" }}
                      >
                        Become a Provider <span style={{ fontSize: 15 }}>→</span>
                      </button>
                    </div>
                  );
                return filtered.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 14,
                        padding: "10px 12px",
                        borderRadius: 10,
                        cursor: "pointer",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(255,255,255,0.05)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                      onClick={() => {
                        if (item.navId && onNavigate) {
                          onNavigate(item.navId);
                          onClose();
                        }
                      }}
                    >
                      <div
                        className="text-text-secondary"
                        style={{
                          flexShrink: 0,
                          marginTop: 1,
                        }}
                      >
                        <Icon s={20} />
                      </div>
                      <div>
                        <p
                          className="text-text-primary"
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            fontFamily: "'DM Sans', sans-serif",
                            marginBottom: 2,
                          }}
                        >
                          {moreItemLabel(t, item)}
                        </p>
                        <p
                          className="text-text-secondary"
                          style={{
                            fontSize: 11,
                            fontFamily: "'DM Sans', sans-serif",
                            lineHeight: 1.4,
                          }}
                        >
                          {moreItemDesc(t, item)}
                        </p>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {!atBottom && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 56,
                background:
                  "linear-gradient(to bottom, transparent, rgba(19,21,28,0.97))",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingBottom: 10,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  animation: "moreFlyoutChevron 1.5s ease-in-out infinite",
                }}
              >
                <svg width={18} height={10} viewBox="0 0 18 10" fill="none">
                  <path
                    d="M2 2L9 8L16 2"
                    stroke="rgba(255,255,255,0.38)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// #429
const _IcoLegal = ({ s: sz = 18 }) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

function ProfileFlyout({ user, onClose, onNavigate, onTour }) {
  const { isMobile } = _bp;
  const { t } = useTranslation();
  const [busy, setBusy] = React.useState(false);
  const [accountRows, setAccountRows] = React.useState([]);
  const [signOutDialog, { confirm: confirmSignOut }] = useDialog();

  React.useEffect(() => {
    rememberActiveAccount();
    const uid = user?.user_id ?? user?.id;
    const vault = listSavedAccounts();
    const rows = [];
    if (uid != null && uid !== "") {
      const fromVault = vault.find((a) => String(a.userId) === String(uid));
      rows.push({
        userId: uid,
        name: user?.name ?? fromVault?.name ?? null,
        email: user?.email ?? fromVault?.email ?? null,
        username: user?.username ?? fromVault?.username ?? null,
        profile_pic_url: user?.profile_pic_url ?? fromVault?.profile_pic_url ?? null,
        isCurrent: true,
        expired: false,
      });
    }
    for (const a of vault) {
      if (uid != null && String(a.userId) === String(uid)) continue;
      rows.push({
        ...a,
        isCurrent: false,
        expired: isAccessTokenExpired(a.accessToken),
      });
    }
    setAccountRows(rows);
  }, [user]);

  const items = [
    {
      label: t("app.profileFlyout.settings"),
      desc: t("app.profileFlyout.settingsDesc"),
      nav: "settings",
      Icon: UserSettingsIcon,
    },
    {
      label: t("app.profileFlyout.tour", { defaultValue: "Take the tour" }),
      desc: t("app.profileFlyout.tourDesc", { defaultValue: "Replay the guided walkthrough" }),
      action: onTour,
      Icon: _IcoTour,
    },
    {
      label: t("app.profileFlyout.learn"),
      desc: t("app.profileFlyout.learnDesc"),
      nav: "learn",
      Icon: _IcoLearn2,
    },
    {
      label: t("app.profileFlyout.help"),
      desc: t("app.profileFlyout.helpDesc"),
      nav: "help",
      Icon: HelpCenterIcon,
    },
    // #429: the legal documents had nowhere on the platform to live. This is the entry point for
    // someone who wants to READ them; the signup flow links straight at /terms.
    {
      label: t("app.profileFlyout.legal", { defaultValue: "Legal" }),
      desc: t("app.profileFlyout.legalDesc", { defaultValue: "Terms, Privacy, Cookies & Image credits" }),
      nav: "legal",
      Icon: _IcoLegal,
    },
  ];

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const accountTitle = (a) =>
    a.name || (a.username ? `@${a.username}` : null) || a.email || t("app.profileFlyout.accountFallback", { defaultValue: "Account" });
  const accountSub = (a) => {
    if (a.expired) return t("app.profileFlyout.signedOutTap", { defaultValue: "Signed out — tap to sign in" });
    if (a.isCurrent) return t("app.profileFlyout.currentAccount", { defaultValue: "Signed in" });
    return a.email || (a.username ? `@${a.username}` : t("app.profileFlyout.switchToAccount", { defaultValue: "Switch to this account" }));
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 49 }}
      />
      <div
        className="bg-surface-glass border border-border text-text-primary"
        style={{
          position: "fixed",
          ...(isMobile
            ? { left: 0, right: 0, bottom: 62 }
            : { left: 92, bottom: 56, width: 280 }),
          zIndex: 50,
          backdropFilter: "blur(24px)",
          borderRadius: isMobile ? "16px 16px 0 0" : 16,
          boxShadow: "0 8px 48px rgba(0,0,0,0.7)",
          overflow: "hidden",
          animation: "fadeUp 0.18s ease both",
          maxHeight: isMobile ? "min(78vh, 560px)" : "min(72vh, 520px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <button
          onClick={() => { delete window.__profileTargetId; onNavigate("profile"); }}
          style={{
            padding: "14px 16px",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            background: "transparent",
            cursor: "pointer",
            textAlign: "left",
            transition: "background 0.12s",
            flexShrink: 0,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "rgba(255,255,255,0.05)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "rgba(37,99,235,0.25)",
              border: "1.5px solid rgba(37,99,235,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            {/* #457: display:none on error left an EMPTY disc — the ProfileIcon sits in the else
                branch and never rendered. SafeImage swaps in the fallback node on failure. */}
            <SafeImage
              src={user?.profile_pic_url}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                objectFit: "cover",
              }}
              fallback={<ProfileIcon s={18} />}
            />
          </div>
          <div style={{ flex: 1 }}>
            <p
              className="text-text-primary"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 13,
                marginBottom: 1,
              }}
            >
              {t("app.myAccount")}
            </p>
            <p
              className="text-text-secondary"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
              }}
            >
              {t("app.viewProfile")}
            </p>
          </div>
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="2.5"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Multi-account switcher (Gmail / X style) */}
        <div
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            padding: "8px 0",
            overflowY: "auto",
            flexShrink: 1,
            minHeight: 0,
          }}
        >
          <p
            className="text-text-secondary"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "2px 14px 6px",
            }}
          >
            {t("app.profileFlyout.accounts", { defaultValue: "Accounts" })}
          </p>
          {accountRows.map((a) => (
            <button
              key={String(a.userId)}
              type="button"
              disabled={busy || a.isCurrent}
              onClick={() => run(() => switchToAccount(a.userId))}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 14px",
                background: a.isCurrent ? "rgba(37,99,235,0.12)" : "transparent",
                border: "none",
                cursor: a.isCurrent || busy ? "default" : "pointer",
                textAlign: "left",
                opacity: a.expired ? 0.72 : 1,
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => {
                if (!a.isCurrent && !busy) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = a.isCurrent ? "rgba(37,99,235,0.12)" : "transparent";
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.06)",
                  border: a.isCurrent ? "1.5px solid rgba(37,99,235,0.65)" : "1px solid rgba(255,255,255,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                <SafeImage
                  src={a.profile_pic_url}
                  alt=""
                  style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
                  fallback={<ProfileIcon s={14} />}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  className="text-text-primary"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {accountTitle(a)}
                </p>
                <p
                  className="text-text-secondary"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 11,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {accountSub(a)}
                </p>
              </div>
              {a.isCurrent ? (
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => beginAddAnotherAccount())}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 14px",
              background: "transparent",
              border: "none",
              cursor: busy ? "default" : "pointer",
              textAlign: "left",
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) => {
              if (!busy) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "1.5px dashed rgba(255,255,255,0.28)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: "rgba(255,255,255,0.55)",
                fontSize: 18,
                fontWeight: 500,
                lineHeight: 1,
              }}
              aria-hidden
            >
              +
            </div>
            <div>
              <p
                className="text-text-primary"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 1,
                }}
              >
                {t("app.profileFlyout.addAccount", { defaultValue: "Add another account" })}
              </p>
              <p
                className="text-text-secondary"
                style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}
              >
                {t("app.profileFlyout.addAccountDesc", { defaultValue: "Sign in without losing this one" })}
              </p>
            </div>
          </button>
        </div>

        <div style={{ padding: "6px 0", overflowY: "auto", flex: 1, minHeight: 0 }}>
          {items.map(({ label, desc, nav, Icon: ItemIcon, action }) => (
            <button
              key={label}
              onClick={() => (action ? (onClose?.(), action()) : onNavigate(nav))}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "9px 14px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.06)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <div className="text-text-secondary" style={{ flexShrink: 0 }}>
                {ItemIcon ? React.createElement(ItemIcon, { s: 16 }) : null}
              </div>
              <div>
                <p
                  className="text-text-primary"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 1,
                  }}
                >
                  {label}
                </p>
                <p
                  className="text-text-secondary"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 11,
                  }}
                >
                  {desc}
                </p>
              </div>
            </button>
          ))}
        </div>
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.07)",
            padding: "6px 0",
            flexShrink: 0,
          }}
        >
          <button
            disabled={busy}
            onClick={async () => {
              const ok = await confirmSignOut({
                title: t("app.signOut"),
                message: t("app.signOutConfirm", { defaultValue: "You'll need to sign in again to access your account." }),
                confirmLabel: t("app.signOut"),
                cancelLabel: t("common.cancel"),
              });
              if (!ok) return;
              run(() => signOutCurrentAccount());
            }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "9px 14px",
              background: "transparent",
              border: "none",
              cursor: busy ? "default" : "pointer",
              textAlign: "left",
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(239,68,68,0.07)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <div style={{ color: "rgba(239,68,68,0.65)", flexShrink: 0 }}>
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </div>
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(239,68,68,0.65)",
              }}
            >
              {t("app.signOut")}
            </p>
          </button>
          {accountRows.length > 1 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => signOutAllAccounts())}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "6px 14px 10px",
                background: "transparent",
                border: "none",
                cursor: busy ? "default" : "pointer",
                textAlign: "left",
              }}
            >
              <p
                className="text-text-secondary"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 11,
                  fontWeight: 500,
                  paddingLeft: 28,
                }}
              >
                {t("app.profileFlyout.signOutAll", { defaultValue: "Sign out of all accounts" })}
              </p>
            </button>
          ) : null}
        </div>
      </div>
      {/* Rendered outside the panel div, whose backdropFilter establishes a containing
          block for position:fixed descendants (same effect as a transform) — nested
          there, the confirm dialog would be clipped to the flyout instead of centering
          on the viewport. Stop propagation so a tap on its backdrop doesn't also bubble
          into this flyout's own onClose overlay. */}
      <div onClick={(e) => e.stopPropagation()}>{signOutDialog}</div>
    </>
  );
}

function AIFloatPanel({
  onClose,
  closing = false,
  verticalSlug = "home",
  verticalName = "Home",
  color = "#2563eb",
}) {
  const { messages, isLoading, error, sendMessage } = useChatbot(verticalSlug);
  const [input, setInput] = React.useState("");
  const bottomRef = React.useRef(null);
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const send = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput("");
  };

  return (
    <div
      className="bg-surface-glass"
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        bottom: 0,
        width: 380,
        backdropFilter: "blur(24px)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        boxShadow: "-8px 0 48px rgba(0,0,0,0.6)",
        animation: closing
          ? "slideOutRight 0.21s ease both"
          : "slideInRight 0.22s ease both",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: `linear-gradient(135deg, ${color}, #7c3aed)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: "#fff",
            }}
          >
            <AISparkleIcon s={16} />
          </div>
          <div>
            <p
              className="text-text-primary"
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Strug AI — {verticalName}
            </p>
            <p
              className="text-text-secondary"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
              }}
            >
              Your intelligent assistant
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="bg-surface-raised text-text-secondary"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.14)";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.07)";
            e.currentTarget.style.color = "rgba(255,255,255,0.55)";
          }}
        >
          <svg
            width={13}
            height={13}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.length === 0 && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              className="bg-surface-raised text-text-primary"
              style={{
                maxWidth: "84%",
                padding: "10px 13px",
                borderRadius: "14px 14px 14px 4px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                lineHeight: 1.55,
              }}
            >
              Hi! I’m Strug AI. How can I help you with {verticalName} today?
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "84%",
                padding: "10px 13px",
                borderRadius:
                  m.role === "user"
                    ? "14px 14px 4px 14px"
                    : "14px 14px 14px 4px",
                background:
                  m.role === "user"
                    ? `linear-gradient(135deg, ${color}, #1d4ed8)`
                    : "rgba(255,255,255,0.07)",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                color: "#fff",
                lineHeight: 1.55,
              }}
            >
              {m.role === "assistant" ? (
                <div className="ai-markdown-content">
                  <Suspense fallback={m.content}>
                    <ReactMarkdown
                      components={{
                        a: ({ href, children }) => (
                          isSafeHttpUrl(href) ? (
                            <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                          ) : (
                            <span>{children}</span>
                          )
                        ),
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </Suspense>
                </div>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              className="bg-surface-raised text-text-secondary"
              style={{
                padding: "10px 13px",
                borderRadius: "14px 14px 14px 4px",
                fontSize: 13,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              ···
            </div>
          </div>
        )}
        {error && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#fca5a5",
              fontSize: 12,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div
        style={{
          padding: "12px 14px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask me anything…"
          disabled={isLoading}
          className="bg-surface-raised border border-border text-text-primary"
          style={{
            flex: 1,
            borderRadius: 10,
            padding: "10px 13px",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            outline: "none",
            opacity: isLoading ? 0.6 : 1,
          }}
        />
        <button
          onClick={send}
          disabled={isLoading}
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${color}, #1d4ed8)`,
            border: "none",
            cursor: isLoading ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            flexShrink: 0,
            transition: "opacity 0.15s",
            opacity: isLoading ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isLoading) e.currentTarget.style.opacity = "0.82";
          }}
          onMouseLeave={(e) =>
            (e.currentTarget.style.opacity = isLoading ? "0.5" : "1")
          }
        >
          <svg
            width={15}
            height={15}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function MoreLabel() {
  const { t } = useTranslation();
  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 400,
      }}
    >
      {t("nav.more")}
    </span>
  );
}

function SignInLabel() {
  const { t } = useTranslation();
  return (
    <span
      style={{
        fontSize: 9.5,
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 600,
        lineHeight: 1.2,
        textAlign: "center",
      }}
    >
      {t("app.signIn")}
    </span>
  );
}

// Shared button body for both the pinned row and the scrolling list in SidebarScrollNav —
// factored out so pinning doesn't mean maintaining two copies of this styling.
function SidebarNavButton({ id, Icon: IconComp, label, unreadCount, active, color, onClick, t, showPin = false, pinned = false, onTogglePin }) {
  // #eslint: this project's config lacks eslint-plugin-react, so no-unused-vars can't see a
  // destructured-param JSX tag (<Icon .../>) as a use of `Icon` — false-positives "defined but
  // never used". Assigning to a local const before the JSX (the pattern used everywhere else in
  // this file, e.g. `const Icon = item.icon`) works around it.
  const Icon = IconComp;
  // Manual-pin mode surfaces a tiny corner toggle. Unpinned toggles only appear on hover
  // (kept out of the way on a 72px rail); a pinned toggle stays lit so the state is legible.
  const [hover, setHover] = useState(false);
  const showPinBtn = showPin && (pinned || hover);
  return (
    <Motion.button
      data-nav-id={id}
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      style={{
        width: "100%",
        padding: "9px 4px",
        borderRadius: 10,
        background: active ? `${color}22` : "transparent",
        border: "none",
        color: active ? color : "var(--color-text-secondary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        cursor: "pointer",
        transition: "background 0.15s, color 0.15s",
        flexShrink: 0,
        position: "relative",
      }}
      onMouseEnter={(e) => {
        setHover(true);
        if (!active) {
          e.currentTarget.style.background = `${color}18`;
          e.currentTarget.style.color = color;
        }
      }}
      onMouseLeave={(e) => {
        setHover(false);
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--color-text-secondary)";
        }
      }}
    >
      {showPinBtn && (
        <span
          role="button"
          tabIndex={0}
          aria-label={pinned ? "Unpin from sidebar" : "Pin to sidebar"}
          title={pinned ? "Unpin" : "Pin"}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onTogglePin?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              e.preventDefault();
              onTogglePin?.();
            }
          }}
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            width: 16,
            height: 16,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: pinned ? (color || "#2563eb") : "rgba(255,255,255,0.14)",
            color: pinned ? "#fff" : "rgba(255,255,255,0.7)",
            zIndex: 3,
            cursor: "pointer",
          }}
        >
          <svg width={10} height={10} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            {/* Angled thumbtack / pushpin (straight-edged), not a map-pin teardrop. */}
            <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z" />
          </svg>
        </span>
      )}
      {active && (
        <Motion.div
          layoutId="sidebar-active-indicator"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
          style={{
            position: "absolute",
            left: 0,
            top: "20%",
            bottom: "20%",
            width: 3,
            borderRadius: "0 3px 3px 0",
            background: color,
          }}
        />
      )}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon s={22} />
        {unreadCount > 0 && (
          <span style={{ position: "absolute", top: -8, right: -12, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 999, background: "#ef4444", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 800, lineHeight: "17px", textAlign: "center", boxShadow: "0 0 0 2px var(--color-surface-glass)" }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>
      <span
        style={{
          fontSize: 9.5,
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: active ? 700 : 400,
          lineHeight: 1.2,
          textAlign: "center",
        }}
      >
        {sidebarNavLabel(id, label, t)}
      </span>
    </Motion.button>
  );
}

function SidebarScrollNav({
  items,
  activeNav,
  setActiveNav,
  externalNavRef,
  showFade = false,
  showFadeTop = false,
  fadeColor = "var(--color-surface-glass)",
  scrollHintColor = "#2563eb",
}) {
  const { t } = useTranslation();
  const internalRef = useRef(null);
  const navRef = externalNavRef || internalRef;
  // #421: pulse the provider hub until the user has opened it once. Per-ACCOUNT, not per-device:
  // the key is in PER_USER_KEYS, so switching accounts on a shared browser doesn't hide the cue
  // from someone who has never seen it (the account-bleed class of bug #50/#416).
  const [providerSeen, setProviderSeen] = useState(() => {
    try { return !!localStorage.getItem("strug_provider_seen"); } catch { return true; }
  });
  const markProviderSeen = useCallback(() => {
    try { localStorage.setItem("strug_provider_seen", "1"); } catch { /* ignore */ }
    setProviderSeen(true);
  }, []);
  useEffect(() => {
  if (window.location.pathname === '/admin') {
    setActiveNav('admin');
  }
  // Mount-only deep-link into admin; setActiveNav is stable from the page shell.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot on mount
}, []);

  // Pinned row can run in two modes (see utils/recentVerticals.js):
  //   "recent" — auto top-3 recently-visited verticals (default; `pinnedIds` prop = recents,
  //              so navigation re-renders this component and keeps the row fresh).
  //   "manual" — the user hand-picks up to MAX_PINS via the per-item hover pin toggle.
  const [pinMode, setPinModeState] = useState(() => getPinMode());
  const [manualPins, setManualPins] = useState(() => getManualPins());
  // getSidebarPinnedIds() reads localStorage (mode + manual pins or recents). It's recomputed
  // every render; re-renders are triggered by the `pinMode`/`manualPins` state below and by the
  // `pinnedIds` prop (recents) changing on navigation, so the row always reflects current state.
  // (manualPins/pinMode are also read directly for the per-item pin toggles.)
  // Cap the pinned row at 2 normally, 3 on taller screens (the rail is vertical,
  // so vertical room is what matters). Re-read each render; the parent re-renders
  // on resize so this stays current.
  const maxPins = (typeof window !== "undefined" && window.innerHeight >= 900) ? 3 : 2;
  const shownIds = getSidebarPinnedIds(maxPins);
  const pinnedItems = shownIds
    .map((id) => ({ id, icon: NAV_ICON_BY_ID[id], label: NAV_LABEL_BY_ID[id] || id }))
    .filter((p) => Boolean(p.icon));
  const toggleMode = () => {
    const next = pinMode === "manual" ? "recent" : "manual";
    setPinMode(next);
    setPinModeState(next);
  };
  const handleTogglePin = (id) => setManualPins(toggleManualPin(id, maxPins));

  return (
    // #463: column — the vertical list scrolls, the provider chip below it does not.
    <div style={{ flex: 1, minHeight: 0, width: "100%", display: "flex", flexDirection: "column" }}>
    {(pinnedItems.length > 0 || pinMode === "manual") && (
      <div style={{ width: "100%", flexShrink: 0, paddingBottom: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        {/* Header doubles as the mode toggle. On a 72px rail there's no room for a separate
            control, so the label itself is the button: it reads the active mode and flips it. */}
        <button
          type="button"
          onClick={toggleMode}
          title={pinMode === "manual" ? "Switch to recent" : "Switch to manual pins"}
          aria-label={pinMode === "manual" ? "Switch to recent" : "Switch to manual pins"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            width: "100%",
            padding: "2px 0",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: 8.5,
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textAlign: "center",
            color: pinMode === "manual" ? "#2563eb" : "rgba(255,255,255,0.32)",
          }}
        >
          <span style={{ color: pinMode === "manual" ? "#2563eb" : "rgba(255,255,255,0.4)", display: "inline-flex" }}>
            <PinBoardIcon s={9} />
          </span>
          {pinMode === "manual"
            ? t("app.pinned", { defaultValue: "Pinned" })
            : t("app.recent", { defaultValue: "Recent" })}
        </button>
        {pinnedItems.map((item) => (
          <SidebarNavButton
            key={`pin-${item.id}`}
            id={item.id}
            Icon={item.icon}
            label={item.label}
            active={activeNav === item.id}
            color={PAGE_COLORS[item.id] || "#2563eb"}
            onClick={() => setActiveNav(item.id)}
            showPin={pinMode === "manual" && isPinnable(item.id)}
            pinned={manualPins.includes(item.id)}
            onTogglePin={() => handleTogglePin(item.id)}
            t={t}
          />
        ))}
        {pinMode === "manual" && pinnedItems.length === 0 && (
          <div
            className="text-text-muted"
            style={{
              fontSize: 8,
              fontFamily: "'DM Sans', sans-serif",
              lineHeight: 1.3,
              textAlign: "center",
              padding: "0 6px",
            }}
          >
            {t("app.pinnedHint", { defaultValue: "Tap a pin to add" })}
          </div>
        )}
        <div className="bg-border" style={{ width: "100%", height: 1, marginTop: 6 }} />
      </div>
    )}
    <div
      style={{
        flex: 1,
        position: "relative",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {showFadeTop && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 40,
            background: `linear-gradient(to top, transparent, ${fadeColor})`,
            pointerEvents: "none",
            zIndex: 2,
            borderRadius: "8px 8px 0 0",
          }}
        />
      )}
      {showFade && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 40,
            background: `linear-gradient(to bottom, transparent, ${fadeColor})`,
            pointerEvents: "none",
            zIndex: 2,
            borderRadius: "0 0 8px 8px",
          }}
        />
      )}
      <nav
        ref={navRef}
        className="sidebar-nav"
        style={{
          height: "100%",
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          width: "100%",
          paddingTop: 2,
          paddingBottom: 6,
        }}
      >
        {items.map((item) => (
          <SidebarNavButton
            key={item.id}
            id={item.id}
            Icon={item.icon}
            label={item.label}
            unreadCount={item.unreadCount}
            active={activeNav === item.id}
            color={PAGE_COLORS[item.id] || "#2563eb"}
            onClick={() => setActiveNav(item.id)}
            showPin={pinMode === "manual" && isPinnable(item.id)}
            pinned={manualPins.includes(item.id)}
            onTogglePin={() => handleTogglePin(item.id)}
            t={t}
          />
        ))}

      </nav>
      </div>

      {/* "There's more nav below" hint. It belongs to the SCROLLING list, so it renders here —
          directly under the list and ABOVE the divider + Provider chip. It used to be rendered by
          AppInner after this whole component, which put it *below* Provider, where it read as a
          chevron pointing at the Split/Alerts buttons rather than at the nav it describes. */}
      {showFade && (
        <div style={{ display: "flex", justifyContent: "center", flexShrink: 0, pointerEvents: "none", marginTop: 2 }}>
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke={scrollHintColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              animation: "sidebarChevronBounce 1s ease-in-out infinite",
              filter: `drop-shadow(0 0 5px ${scrollHintColor})`,
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      )}

      {/* Entry to the /provider portal hub — the money entry point (it's how a user starts
          earning). #463: it used to sit at the bottom of the SCROLLING vertical list, styled
          like every other rail item (dim white, transparent), standing out only via a
          first-visit pulse that disappears forever once dismissed. On a normal viewport the
          list overflows, so it was literally off-screen — no amount of colour helps an item
          you have to scroll to find. It now lives outside the scroll area (always visible)
          and reads as its own object: a filled green chip under a divider. The #421
          first-visit pulse still rides on top for brand-new accounts. */}
      <div style={{ width: "100%", flexShrink: 0, paddingTop: 6 }}>
        <div className="bg-border" style={{ width: "100%", height: 1, marginBottom: 8 }} />
        {(() => {
          const active = activeNav === "provider";
          const color = PAGE_COLORS.provider;
          const glow = !providerSeen && !active;
          const idleBg = `${color}1f`;
          return (
            <button
              data-nav-id="provider"
              className={glow ? "provider-glow" : undefined}
              onClick={() => { markProviderSeen(); setActiveNav("provider"); }}
              title={t("app.becomeProvider", { defaultValue: "Become a Provider" })}
              style={{
                width: "100%", padding: "9px 4px", borderRadius: 10,
                background: active ? `${color}33` : idleBg,
                border: `1px solid ${active ? color : `${color}59`}`,
                color: color,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                cursor: "pointer", transition: "background 0.15s, border-color 0.15s", flexShrink: 0, position: "relative",
              }}
              onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = `${color}2e`; e.currentTarget.style.borderColor = color; } }}
              onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = idleBg; e.currentTarget.style.borderColor = `${color}59`; } }}
            >
              {active && <div style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: 3, borderRadius: "0 3px 3px 0", background: color }} />}
              <EarnIcon s={22} />
              <span style={{ fontSize: 9.5, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, lineHeight: 1.2, textAlign: "center" }}>
                {sidebarNavLabel("provider", "Provider", t)}
              </span>
            </button>
          );
        })()}
      </div>
    </div>
  );
}

function PageExternalScrollbar({ el: elProp, accent = "#2563eb" }) {
  const elRef = useRef(elProp);
  useEffect(() => {
    elRef.current = elProp;
  }, [elProp]);
  const el = elProp;
  const trackRef = useRef(null);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartScrollTop = useRef(0);
  const [canScroll, setCanScroll] = useState(false);
  const [thumbTop, setThumbTop] = useState(0);
  const THUMB_H = 66;
  const BTN_H = 30;

  function getTrackH() {
    if (trackRef.current) return trackRef.current.clientHeight;
    return window.innerHeight - BTN_H * 2;
  }

  function update() {
    if (!el) return;
    const scrollable = el.scrollHeight > el.clientHeight + 8;
    setCanScroll(scrollable);
    if (scrollable) {
      const trackH = getTrackH();
      const maxScroll = el.scrollHeight - el.clientHeight;
      const movableTrack = Math.max(0, trackH - THUMB_H);
      setThumbTop(Math.max(0, Math.min(movableTrack, (el.scrollTop / maxScroll) * movableTrack)));
    } else {
      setThumbTop(0);
    }
  }

  useEffect(() => {
    if (!el) {
      const t = setTimeout(() => {
        setCanScroll(false);
        setThumbTop(0);
      }, 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(update, 0);
    let updateTimer;
    const scheduleUpdate = () => {
      clearTimeout(updateTimer);
      updateTimer = setTimeout(update, 0);
    };
    el.addEventListener("scroll", update, { passive: true });
    el.addEventListener("load", scheduleUpdate, true);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const observer = typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(scheduleUpdate);
    observer?.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
    return () => {
      clearTimeout(t);
      clearTimeout(updateTimer);
      el.removeEventListener("scroll", update);
      el.removeEventListener("load", scheduleUpdate, true);
      ro.disconnect();
      observer?.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- update is redefined each render; el is the trigger
  }, [el]);

  function onThumbMouseDown(e) {
    e.preventDefault();
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartScrollTop.current = el?.scrollTop || 0;
    function onMove(ev) {
      if (!isDragging.current || !el) return;
      const trackH = getTrackH();
      const dy = ev.clientY - dragStartY.current;
      const ratio = dy / (trackH - THUMB_H);
      el.scrollTop =
        dragStartScrollTop.current +
        ratio * (el.scrollHeight - el.clientHeight);
    }
    function onUp() {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onTrackClick(e) {
    if (!elRef.current) return;
    const trackH = getTrackH();
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / trackH));
    elRef.current.scrollTop =
      ratio * (elRef.current.scrollHeight - elRef.current.clientHeight);
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        bottom: 0,
        width: 8,
        display: canScroll ? "flex" : "none",
        flexDirection: "column",
        alignItems: "center",
        zIndex: 46,
        pointerEvents: "auto",
      }}
    >
      <div
        ref={trackRef}
        onClick={onTrackClick}
        style={{
          flex: 1,
          width: 8,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 999,
          position: "relative",
          cursor: "pointer",
        }}
      >
        <div
          onMouseDown={onThumbMouseDown}
          style={{
            position: "absolute",
            top: thumbTop,
            height: THUMB_H,
            width: "100%",
            borderRadius: 999,
            background: accent,
            boxShadow: `0 0 8px ${accent}99, 0 0 18px ${accent}50`,
            cursor: "grab",
          }}
        />
      </div>
    </div>
  );
}

const MoreGridIcon = ({ s = 24 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
  </svg>
);

function BugIcon({ s = 16, stroke = "currentColor" }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m8 2 1.88 1.88" /><path d="M14.12 3.88 16 2" />
      <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
      <path d="M12 20v-9" /><path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
      <path d="M6 13H2" /><path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
      <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" /><path d="M22 13h-4" /><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </svg>
  );
}

// Shared tile for both the pinned row and the regular section grids in MobileNavSheet.
function MobileNavTile({ item, active, color, onClick, t }) {
  const Icon = item.icon;
  return (
    <Motion.button
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      style={{
        background: active ? `${color}18` : "var(--color-surface-raised)",
        border: `1px solid ${active ? color + "40" : "var(--color-border-subtle)"}`,
        borderRadius: 12,
        padding: "10px 4px 8px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        transition: "background 0.15s",
      }}
    >
      <div style={{ color: active ? color : "var(--color-text-secondary)" }}>
        <Icon s={20} />
      </div>
      <span
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 10,
          fontWeight: active ? 700 : 500,
          color: active ? color : "var(--color-text-secondary)",
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {sidebarNavLabel(item.id, item.label, t)}
      </span>
    </Motion.button>
  );
}

function MobileNavSheet({
  onClose,
  closing,
  onNavigate,
  activeNav,
  pinnedIds = [],
  isFullscreen,
  onToggleFullscreen,
  onOpenLangPicker,
  onReportBug,
}) {
  const { t } = useTranslation();
  const dragControls = useDragControls();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutDialog, { confirm: confirmSignOut }] = useDialog();
  const sections = [];
  let cur = null;
  VISIBLE_NAV_ITEMS.forEach((item) => {
    if (item.sectionHeader) {
      cur = { titleKey: item.sectionHeader, items: [item] };
      sections.push(cur);
    } else if (cur) cur.items.push(item);
  });
  // Same recent-verticals list as the desktop rail's pinned row and the home page's
  // "Jump back in" row (see utils/recentVerticals.js) — one row's worth (the grid below is
  // 4 columns) so it doesn't need its own slice like the narrower desktop rail does.
  const pinnedItems = pinnedIds
    .map((id) => ({ id, icon: NAV_ICON_BY_ID[id], label: NAV_LABEL_BY_ID[id] || id }))
    .filter((p) => Boolean(p.icon));
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
      }}
    >
      <Motion.div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface"
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 80 || info.velocity.y > 500) onClose();
        }}
        initial={{ y: "100%" }}
        animate={{ y: closing ? "100%" : 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 38 }}
        style={{
          position: "absolute",
          bottom: 62,
          left: 0,
          right: 0,
          maxHeight: "78vh",
          borderRadius: "20px 20px 0 0",
          borderTop: "1px solid var(--color-border)",
          overflowY: "auto",
        }}
      >
        <div
          onPointerDown={(e) => dragControls.start(e)}
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "10px 0 2px",
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <div
            className="bg-border"
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            padding: "10px 16px 12px",
            borderBottom: "1px solid var(--color-border-subtle)",
          }}
        >
          <button
            onClick={onToggleFullscreen}
            className="bg-surface-raised border border-border text-text-secondary"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderRadius: 10,
              padding: "9px 12px",
              cursor: "pointer",
            }}
          >
            {isFullscreen ? (
              <FullscreenExitIcon s={15} />
            ) : (
              <FullscreenEnterIcon s={15} />
            )}
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {isFullscreen ? t("app.exitFullscreen") : t("app.fullscreen")}
            </span>
          </button>
          <button
            onClick={() => {
              onOpenLangPicker();
              onClose();
            }}
            className="bg-surface-raised border border-border text-text-secondary"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderRadius: 10,
              padding: "9px 12px",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 15 }}></span>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {t("account.language")}
            </span>
          </button>
          <button
            onClick={() => {
              onReportBug?.();
              onClose();
            }}
            className="bg-surface-raised border border-border text-text-secondary"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderRadius: 10,
              padding: "9px 12px",
              cursor: "pointer",
            }}
          >
            <BugIcon s={15} />
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {t("app.report")}
            </span>
          </button>
        </div>
        {pinnedItems.length > 0 && (
          <div style={{ padding: "12px 16px 4px" }}>
            <p
              className="text-text-muted"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                marginBottom: 10,
              }}
            >
              {t("app.pinned", { defaultValue: "Pinned" })}
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 8,
                marginBottom: 8,
              }}
            >
              {pinnedItems.map((item) => (
                <MobileNavTile
                  key={`pin-${item.id}`}
                  item={item}
                  active={activeNav === item.id}
                  color={PAGE_COLORS[item.id] || "#2563eb"}
                  onClick={() => { onNavigate(item.id); onClose(); }}
                  t={t}
                />
              ))}
            </div>
          </div>
        )}
        {sections.map((sec) => (
          <div key={sec.titleKey} style={{ padding: "12px 16px 4px" }}>
            <p
              className="text-text-muted"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                marginBottom: 10,
              }}
            >
              {t(`navSections.${sec.titleKey}`)}
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 8,
                marginBottom: 8,
              }}
            >
              {sec.items.map((item) => (
                <MobileNavTile
                  key={item.id}
                  item={item}
                  active={activeNav === item.id}
                  color={PAGE_COLORS[item.id] || "#2563eb"}
                  onClick={() => { onNavigate(item.id); onClose(); }}
                  t={t}
                />
              ))}
            </div>
          </div>
        ))}

        <div
          style={{
            margin: "8px 16px 0",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            paddingTop: 12,
          }}
        >
          <p
            className="text-text-muted"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              marginBottom: 8,
            }}
          >
            {t("app.becomeProvider")}
          </p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Featured entry to the polished /provider hub (status + per-portal colours),
                above the flat dashboard list — the mobile parallel to the sidebar button. */}
            <button
              onClick={() => { onNavigate("provider"); onClose(); }}
              style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(47,158,68,0.10)", border: "1px solid rgba(47,158,68,0.32)", borderRadius: 10, padding: "11px 10px", cursor: "pointer", textAlign: "left", width: "100%", marginBottom: 8 }}
            >
              <div style={{ color: PAGE_COLORS.provider, flexShrink: 0 }}><EarnIcon s={18} /></div>
              <div style={{ flex: 1 }}>
                <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, marginBottom: 1 }}>See all your portals</p>
                <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, lineHeight: 1.4 }}>Your provider hub — active &amp; available</p>
              </div>
              <span style={{ color: PAGE_COLORS.provider, fontWeight: 700, fontSize: 15 }}>→</span>
            </button>
            {MORE_FLYOUT_ITEMS.map((item, i) => {
              const Icon = item.icon;
              return (
                <button
                  key={i}
                  onClick={() => {
                    onNavigate(item.navId);
                    onClose();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: "transparent",
                    border: "none",
                    padding: "9px 6px",
                    borderRadius: 10,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    transition: "background 0.12s",
                  }}
                  onTouchStart={(e) =>
                    (e.currentTarget.style.background =
                      "var(--color-surface-raised)")
                  }
                  onTouchEnd={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <div
                    className="text-text-secondary"
                    style={{ flexShrink: 0 }}
                  >
                    <Icon s={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p
                      className="text-text-primary"
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 13,
                        fontWeight: 600,
                        marginBottom: 1,
                      }}
                    >
                      {moreItemLabel(t, item)}
                    </p>
                    <p
                      className="text-text-secondary"
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 11,
                        lineHeight: 1.4,
                      }}
                    >
                      {moreItemDesc(t, item)}
                    </p>
                  </div>
                  <svg
                    width={12}
                    height={12}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-text-muted)"
                    strokeWidth="2.5"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>
        <div
          style={{
            margin: "8px 16px 0",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            paddingTop: 6,
          }}
        >
          <button
            disabled={signingOut}
            onClick={async () => {
              if (signingOut) return;
              const ok = await confirmSignOut({
                title: t("app.signOut"),
                message: t("app.signOutConfirm", { defaultValue: "You'll need to sign in again to access your account." }),
                confirmLabel: t("app.signOut"),
                cancelLabel: t("common.cancel"),
              });
              if (!ok) return;
              setSigningOut(true);
              try {
                await signOutCurrentAccount();
              } finally {
                setSigningOut(false);
              }
            }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "9px 6px",
              background: "transparent",
              border: "none",
              cursor: signingOut ? "default" : "pointer",
              textAlign: "left",
              borderRadius: 10,
              transition: "background 0.12s",
            }}
            onTouchStart={(e) =>
              (e.currentTarget.style.background = "rgba(239,68,68,0.07)")
            }
            onTouchEnd={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <div style={{ color: "rgba(239,68,68,0.65)", flexShrink: 0 }}>
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </div>
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(239,68,68,0.65)",
              }}
            >
              {t("app.signOut")}
            </p>
          </button>
        </div>
        <div style={{ height: 24 }} />
      </Motion.div>
      {/* Rendered outside Motion.div: framer-motion's drag transform makes that element
          a containing block for position:fixed children, which would trap the dialog
          inside the sheet instead of centering it on the viewport. Stop propagation so a
          tap on the confirm dialog's own backdrop doesn't also bubble into this sheet's
          outer onClick={onClose}. */}
      <div onClick={(e) => e.stopPropagation()}>{signOutDialog}</div>
    </div>
  );
}

function ProfileSetupWizard({ onClose }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState(() => {
    // Pre-fill from the geo-IP hint so most users just confirm. Match the full-name list.
    try {
      const name = localStorage.getItem("strug_country_name");
      if (name && COUNTRY_OPTIONS.includes(name)) return name;
    } catch { /* ignore */ }
    return "";
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const photoInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [handleError, setHandleError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const validateHandle = (v) => {
    if (v.length < 3) return t("app.profileSetup.handleMin");
    if (v.length > 30) return t("app.profileSetup.handleMax");
    if (!/^[a-z0-9._]+$/.test(v))
      return t("app.profileSetup.handlePattern");
    return "";
  };

  const handleNext = () => {
    const err = validateHandle(handle);
    if (err) {
      setHandleError(err);
      return;
    }
    setStep(2);
  };

  const handleNext2 = () => {
    if (!displayName.trim() || !country || !agreedTerms) return;
    setStep(3);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setSubmitError("");
    try {
      await setupProfile(
        handle.trim(),
        displayName.trim(),
        bio.trim() || undefined,
      );
      // Record the Terms & Privacy acceptance the user gave via the signup checkbox (#compliance).
      // Idempotent and non-blocking: never trap the user on a compliance write.
      await acceptTerms().catch(() => {});
      const userId = getUser()?.user_id;
      if (userId && (country || city.trim())) {
        const patch = {};
        if (country) patch.country = country;
        if (city.trim()) patch.city = city.trim();
        await updateUser(userId, patch).catch(() => {});
        // Reflect locally so resolveUserCurrency() picks the new display currency right away.
        const u = getUser();
        if (u) setUser({ ...u, ...patch });
      }
      if (photoFile) {
        await updateProfilePhoto(photoFile).catch(() => {});
      }
      onClose();
    } catch (e) {
      // If the profile already exists (created earlier, on another device, or a race), the user
      // is otherwise trapped: the wizard keeps re-appearing and every submit 400s "you already
      // have a profile" (#476). Recover by adopting the existing profile and closing instead of
      // dead-ending on an error.
      const msg = e?.response?.data?.message || "";
      if (e?.response?.status === 400 && /already have a (social )?profile/i.test(msg)) {
        try {
          const existing = (await getMyProfile())?.data ?? null;
          if (existing?.profile_id) {
            const u = getUser();
            if (u) setUser({ ...u, profile_id: existing.profile_id, ...(existing.handle ? { username: existing.handle } : {}) });
            onClose();
            return;
          }
        } catch { /* fall through to the error message */ }
      }
      setSubmitError(
        e?.response?.data?.message || t("app.profileSetup.submitError"),
      );
    } finally {
      setLoading(false);
    }
  };

  const stepTitles = [
    t("app.profileSetup.step1Title"),
    t("app.profileSetup.step2Title"),
    t("app.profileSetup.step3Title"),
  ];
  const stepSubs = [
    t("app.profileSetup.step1Sub"),
    t("app.profileSetup.step2Sub"),
    t("app.profileSetup.step3Sub"),
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        className="bg-surface border border-border"
        style={{
          width: "100%",
          maxWidth: 440,
          borderRadius: 20,
          boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
          padding: "36px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 2,
                  background: step >= s ? "#2563eb" : "rgba(255,255,255,0.1)",
                  transition: "background 0.3s",
                }}
              />
            ))}
          </div>
          <h2
            className="text-text-primary"
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: 26,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              margin: "0 0 6px",
            }}
          >
            {stepTitles[step - 1]}
          </h2>
          <p
            className="text-text-secondary"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              margin: 0,
            }}
          >
            {stepSubs[step - 1]}
          </p>
        </div>

        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ position: "relative" }}>
              <span
                className="text-text-muted"
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                }}
              >
                @
              </span>
              <input
                value={handle}
                onChange={(e) => {
                  setHandle(
                    e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ""),
                  );
                  setHandleError("");
                }}
                placeholder={t("app.profileSetup.handlePlaceholder")}
                maxLength={30}
                className="text-text-primary"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${handleError ? "#ef4444" : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 12,
                  padding: "13px 14px 13px 30px",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 15,
                  outline: "none",
                  caretColor: "#2563eb",
                }}
                onFocus={(e) => {
                  if (!handleError)
                    e.target.style.borderColor = "rgba(37,99,235,0.5)";
                }}
                onBlur={(e) => {
                  if (!handleError)
                    e.target.style.borderColor = "rgba(255,255,255,0.12)";
                }}
              />
            </div>
            {handleError && (
              <p
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  color: "#ef4444",
                  margin: 0,
                }}
              >
                {handleError}
              </p>
            )}
            <button
              onClick={handleNext}
              style={{
                marginTop: 8,
                width: "100%",
                padding: "14px 0",
                background: "#2563eb",
                border: "none",
                borderRadius: 12,
                color: "#fff",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              {t("app.profileSetup.continue")}
            </button>
            <button
              onClick={onClose}
              className="text-text-muted"
              style={{
                width: "100%",
                padding: "10px 0",
                background: "none",
                border: "none",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {t("app.profileSetup.skip")}
            </button>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("app.profileSetup.displayName")}
              maxLength={60}
              className="border border-border text-text-primary"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "rgba(255,255,255,0.05)",
                borderRadius: 12,
                padding: "13px 14px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 15,
                outline: "none",
                caretColor: "#2563eb",
              }}
              onFocus={(e) =>
                (e.target.style.borderColor = "rgba(37,99,235,0.5)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "rgba(255,255,255,0.12)")
              }
            />
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t("app.profileSetup.shortBio")}
              maxLength={160}
              rows={3}
              className="border border-border text-text-primary"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "rgba(255,255,255,0.05)",
                borderRadius: 12,
                padding: "13px 14px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                outline: "none",
                resize: "none",
                caretColor: "#2563eb",
              }}
              onFocus={(e) =>
                (e.target.style.borderColor = "rgba(37,99,235,0.5)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "rgba(255,255,255,0.12)")
              }
            />
            <CountrySelect
              value={country}
              onChange={setCountry}
              placeholder="Country (required) — sets your currency"
              invalid
            />
            {country && currencyForCountry(country) && (
              <p
                className="text-text-secondary"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  margin: "-4px 0 0",
                }}
              >
                Prices shown in {currencyForCountry(country)}. You're charged in CAD.
              </p>
            )}
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City / Location (optional) — e.g. Toronto, Vancouver"
              maxLength={80}
              className="border border-border text-text-primary"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "rgba(255,255,255,0.05)",
                borderRadius: 12,
                padding: "13px 14px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                outline: "none",
                caretColor: "#2563eb",
              }}
              onFocus={(e) =>
                (e.target.style.borderColor = "rgba(37,99,235,0.5)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "rgba(255,255,255,0.12)")
              }
            />
            {/* #429 / signup T&C: users were shown a passive "you agree" line with no way to
                actually accept, so acceptance was never recorded (60+ support tickets). This is an
                explicit, required checkbox — the real accept action — gating account creation.
                The acceptance is persisted in handleSubmit via acceptTerms(). */}
            <label
              className="text-text-secondary"
              style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "6px 2px 0", cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, accentColor: "#2563eb", flexShrink: 0, cursor: "pointer" }}
              />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, lineHeight: 1.55 }}>
                I have read and agree to the{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa", textDecoration: "none" }}>Terms of Service</a>{" "}
                and{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa", textDecoration: "none" }}>Privacy Policy</a>.
              </span>
            </label>
            <button
              onClick={handleNext2}
              disabled={!displayName.trim() || !country || !agreedTerms}
              style={{
                marginTop: 8,
                width: "100%",
                padding: "14px 0",
                background:
                  displayName.trim() && country && agreedTerms
                    ? "#2563eb"
                    : "rgba(37,99,235,0.35)",
                border: "none",
                borderRadius: 12,
                color: "#fff",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 15,
                cursor: displayName.trim() && country && agreedTerms ? "pointer" : "default",
              }}
            >
              Continue →
            </button>
            <button
              onClick={() => setStep(1)}
              className="text-text-muted"
              style={{
                width: "100%",
                padding: "10px 0",
                background: "none",
                border: "none",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              ← Back
            </button>
          </div>
        )}

        {step === 3 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              alignItems: "center",
            }}
          >
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              style={{ display: "none" }}
            />
            <div
              onClick={() => photoInputRef.current?.click()}
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                background: photoPreview
                  ? "transparent"
                  : "rgba(37,99,235,0.15)",
                border: "2px dashed rgba(37,99,235,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                overflow: "hidden",
                flexShrink: 0,
                transition: "border-color 0.2s",
              }}
            >
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Preview"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    color: "rgba(37,99,235,0.8)",
                    textAlign: "center",
                    lineHeight: 1.3,
                  }}
                >
                  Tap to
                  <br />
                  add photo
                </span>
              )}
            </div>
            {photoPreview && (
              <button
                onClick={() => photoInputRef.current?.click()}
                className="text-text-secondary"
                style={{
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 8,
                  padding: "6px 14px",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Change Photo
              </button>
            )}
            {submitError && (
              <p
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  color: "#ef4444",
                  margin: 0,
                  alignSelf: "flex-start",
                }}
              >
                {submitError}
              </p>
            )}
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{
                marginTop: 4,
                width: "100%",
                padding: "14px 0",
                background: "#2563eb",
                border: "none",
                borderRadius: 12,
                color: "#fff",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 15,
                cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading
                ? "Setting up…"
                : photoFile
                  ? "Finish Setup"
                  : "Finish Setup"}
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="text-text-muted"
              style={{
                width: "100%",
                padding: "10px 0",
                background: "none",
                border: "none",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                cursor: loading ? "default" : "pointer",
              }}
            >
              Continue without photo →
            </button>
            <button
              onClick={() => setStep(2)}
              style={{
                width: "100%",
                padding: "10px 0",
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.2)",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// One-time location ask for established accounts that predate the country field. Sets the
// display currency by country; city is optional. "Charged in CAD" stays true (display-only).
function LocationPromptModal({ onDone }) {
  const [country, setCountry] = useState(() => {
    try {
      const name = localStorage.getItem("strug_country_name");
      if (name && COUNTRY_OPTIONS.includes(name)) return name;
    } catch { /* ignore */ }
    return "";
  });
  const [city, setCity] = useState(() => getUser()?.city || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!country) return;
    setSaving(true);
    const patch = { country };
    if (city.trim()) patch.city = city.trim();
    try {
      const userId = getUser()?.user_id;
      if (userId) await updateUser(userId, patch);
    } catch { /* offline — still reflect locally so currency updates and we don't re-prompt */ }
    const u = getUser();
    if (u) {
      const updated = { ...u, ...patch };
      setUser(updated);
      window.dispatchEvent(new CustomEvent("strug:user-updated", { detail: updated }));
    }
    onDone();
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: "13px 14px",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 15,
    outline: "none",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 210,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        className="bg-surface border border-border"
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 20,
          boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
          padding: "32px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <h2
          className="text-text-primary"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: 24,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Where are you?
        </h2>
        <p
          className="text-text-secondary"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            margin: 0,
          }}
        >
          Pick your country so we can show prices in your local currency.
        </p>
        <CountrySelect value={country} onChange={setCountry} invalid />
        {country && currencyForCountry(country) && (
          <p
            className="text-text-secondary"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              margin: "-6px 0 0",
            }}
          >
            Prices shown in {currencyForCountry(country)}. You're charged in CAD.
          </p>
        )}
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City (optional)"
          maxLength={80}
          className="border border-border text-text-primary"
          style={inputStyle}
        />
        <button
          onClick={save}
          disabled={!country || saving}
          style={{
            marginTop: 4,
            width: "100%",
            padding: "14px 0",
            background: country && !saving ? "#2563eb" : "rgba(37,99,235,0.35)",
            border: "none",
            borderRadius: 12,
            color: "#fff",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: 15,
            cursor: country && !saving ? "pointer" : "default",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── URL ↔ nav-id mapping ───────────────────────────────
// Slug is the URL path segment; nav-id is the internal activeNav value.
// Add entries here only when slug ≠ nav-id.
const SLUG_TO_NAV = {
  "":          "home",
  // #429: the legal documents live on one page but each has its own URL, so a signup flow can
  // link straight at the Terms rather than at a tabbed page the user then has to hunt through.
  "terms":     "legal",
  "privacy":   "legal",
  "cookies":   "legal",
  "cookie":    "legal",
  "credits":   "legal",   // #482 image attribution for seeded demo profiles
  "ride":      "rideshare",
  "ref":       "refcodes",
  "townhall":  "social",
  "town-hall": "social",
  "saved":     "favourites",
  "ondemand":  "ondemand",
  "realestate":"realestate",
  "proservices":"proservices",
  "digservices":"digservices",
  "jobs":      "jobs",
  "employer":  "employer",
  "digproducts":"digproducts",
  "secondhand":"secondhand",
  "bookartist":"bookartist",
  "tempstay":  "tempstay",
  "preconstruct":"preconstruct",
  "pinboard":  "pinboard",
};
const NAV_TO_SLUG = Object.fromEntries(Object.entries(SLUG_TO_NAV).map(([s, n]) => [n, s]));
// #429: legal has several inbound aliases (/terms, /privacy, /cookies); inverting the map above
// would pick whichever came last. The canonical URL for the nav id is /legal.
NAV_TO_SLUG.legal = "legal";

function navIdToSlug(id) {
  if (id === "home") return "/";
  // Provider/creator portals get pretty nested URLs: sd-food -> /provider/food. The internal
  // nav ID stays "sd-food" (all dispatch branches + data-nav-id keep working); only the URL
  // representation changes. Old "/sd-food" and "/seller/food" links still resolve.
  if (id.startsWith("sd-")) return "/provider/" + id.slice(3);
  return "/" + (NAV_TO_SLUG[id] ?? id);
}

function slugToNavId(pathname) {
  const segs = pathname.replace(/^\//, "").split("/");
  const slug = (segs[0] || "").toLowerCase();
  // /provider/food -> sd-food (the provider hub at /provider is its own "provider" nav id).
  // "/seller" and "/seller/x" are kept as legacy aliases (that route shipped earlier today).
  if ((slug === "provider" || slug === "seller") && segs[1]) return "sd-" + segs[1].toLowerCase();
  if (slug === "seller") return "provider";
  return SLUG_TO_NAV[slug] ?? slug;
}

// Deep-link vertical slug -> nav id, for /listing/:vertical/:id share URLs.
const LISTING_VERTICAL_NAV = {
  food: "food", shop: "shop", host: "tempstay", services: "proservices",
  rideshare: "rideshare", event: "events", events: "events", realestate: "realestate",
  auto: "automotive", catering: "catering", medical: "medical",
  decor: "decor", learn: "learn", wedding: "wedding", digital: "digproducts",
  influencer: "influencer", jobs: "jobs", books: "books", hotel: "hotel",
  venue: "venues",
  equipment: "equipment",
  floral: "floral",
  discounts: "discounts",
};

// Resolve ANY app URL (deep-link or plain nav slug) to the nav id whose page should render.
// This is the single source of truth used by BOTH the first-mount bootstrap AND the browser
// back/forward (popstate) handler — previously popstate only understood plain slugs, so hitting
// Back onto a /listing/... , /v/... , /post/... , /community/... URL resolved to "home" (#186:
// "clicking Back ANYWHERE takes you to the home dashboard"). Detail pages then restore their own
// sub-view from window.location on mount / via their own popstate listeners.
function resolveNavFromPath(pathname) {
  if (pathname.startsWith("/@")) return "profile";
  if (/^\/v\/[^/]+/.test(pathname)) return "videos";
  if (/^\/c\/[^/]+/.test(pathname)) return "videos";   // /c/:handleOrId video-channel deep link
  if (/^\/post\/[^/]+/.test(pathname)) return "feed";
  if (/^\/live\/@[^/]+/.test(pathname)) return "live";
  if (/^\/townhall\/[^/]+/.test(pathname)) return "social";
  if (/^\/legal(\/|$)/.test(pathname)) return "legal";   // #429: /legal, /legal/privacy, ...
  if (/^\/community\/[^/]+/.test(pathname)) return "community"; // covers /community/post/:id too
  if (/^\/s\/[^/]+/.test(pathname)) return "community";          // /s/:handle community deep link (#261)
  if (/^\/discounts(\/|$)/.test(pathname)) return "discounts";
  if (/^\/jobs(\/|$)/.test(pathname)) return "jobs";
  if (/^\/company\/\d+(\/|$)/.test(pathname)) return "jobs";
  if (/^\/listing\/[^/]+\/[^/]+/.test(pathname)) {
    const navId = LISTING_VERTICAL_NAV[pathname.split("/")[2]];
    if (navId) return navId;
  }
  // Event Concierge public invite / share pages
  if (/^\/invite\/[^/]+/.test(pathname)) return "concierge";
  if (/^\/event-share\/[^/]+/.test(pathname)) return "concierge";
  if (/^\/concierge(\/|$)/.test(pathname)) return "concierge";
  const id = slugToNavId(pathname);
  return ALL_NAV_IDS.has(id) ? id : "home";
}

// The set of all valid nav IDs — used to validate deep-link paths

const ALL_NAV_IDS = new Set([
  "legal",
  "home","shop","food","dating","rideshare","feed","videos","live","social","tempstay","community",
  "reservations","groceries","lessons","preconstruct","events","concierge","event-plan","venues","equipment","floral","realestate",
  "decor","automotive","vehicles","hotel","courier","insurance","mortgage","pinboard",
  "favourites","experiences","wedding","proservices","digservices","jobs","employer","artists","secondhand",
  "celebrity","discounts","portfolio","influencer","bookartist","books","medical","catering",
  "raise","meet","digproducts","learn","refcodes","wallet","messages","dashboard","orders",
  "settings","help","ai","ondemand","profile","feed","live","community","become","provider",
  // Reporter's view of their own bug reports + the board's follow-up questions. Deliberately
  // not a sidebar item — it's reached from the notification bell and the bug-report modal.
  "my-reports",
  // Seller/creator dashboards reached via the "Become a Provider" flyout — each has
  // its own activeNav branch and a matching "/<id>" URL, so they must be recognised
  // here or a direct visit / page refresh falls back to home. Keep in sync with the
  // `activeNav === "sd-*"` render branches below.
  "sd-artist","sd-authors","sd-automotive","sd-catering","sd-celebrity","sd-courier",
  "sd-creator","sd-decor","sd-digproducts","sd-doctors","sd-drive","sd-ecommerce",
  "sd-equipment","sd-events","sd-experiences","sd-flowers","sd-food","sd-freelancer",
  "sd-groceries","sd-host","sd-hotel","sd-influencer","sd-instructor","sd-insurance",
  "sd-jobs","sd-listdiscounts","sd-mealkit","sd-mortgage","sd-precon","sd-proservices",
  "sd-realestate","sd-restbookings","sd-services","sd-streamer","sd-usedproducts",
  "sd-vehicle","sd-venue","sd-venues","sd-wedding","sd-work",
]);

// Surfaces that require a signed-in session. Used by previewMode to bounce guests off
// private nav without touching public routes (/v/, /@handle, feed, marketplace browse).
const PREVIEW_PRIVATE_NAV = new Set([
  "messages", "settings", "wallet", "orders", "dashboard", "help", "refcodes",
  "provider", "my-reports",
]);

// ── Native Login Modal ─────────────────────────────────
// ── App ────────────────────────────────────────────────
function AppInner() {
  const { t } = useTranslation();
  // Resolve initial nav from URL pathname on first mount
  const [activeNav, setActiveNav] = useState(() => {
    const pathname = window.location.pathname;
    if (pathname.startsWith("/@")) {
      const handle = pathname.slice(2).split("/")[0];
      if (handle) window.__pendingHandle = handle; // set synchronously — before UserProfile mounts
      return "profile";
    }
    return resolveNavFromPath(pathname);
  });
  // Sticky return target (e.g. Event Concierge → Book on venues). Messages keeps its own chip.
  const [contextNavReturn, setContextNavReturn] = useState(() => peekNavReturn());
  useEffect(() => {
    const sync = () => setContextNavReturn(peekNavReturn());
    sync();
    window.addEventListener("strug:nav-return", sync);
    return () => window.removeEventListener("strug:nav-return", sync);
  }, [activeNav]);
  // Key that forces <UserProfilePage> remount when navigating back to a /@handle URL
  const [profileKey, setProfileKey] = useState(0);
  // Last few verticals visited (most-recent-first) — powers the sidebar's pinned row and
  // the home page's "Jump back in" row from the same source. See utils/recentVerticals.js.
  const [recentVerticals, setRecentVerticals] = useState(() => getRecentVerticals());
  // True while an immersive full-screen media player is active (shorts player,
  // feed fullscreen video) — used to hide the mobile bottom nav. Set via the
  // global "strug:immersive-media" event dispatched by those players.
  const [immersiveMedia, setImmersiveMedia] = useState(false);
  // Narrower than immersiveMedia: hides the breadcrumb strip and gives its 36px back to the page,
  // while the bottom nav and sidebar stay. The video watch page wants the space at the top; it
  // does not want to take the whole screen over the way the shorts player does.
  const [breadcrumbSuppressed, setBreadcrumbSuppressed] = useState(false);
  // True while a chat is open in Messages — lets the floating bell hide itself there.
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  // Initial deep-link IDs — parsed once from the URL on first load.
  // For /v/, capture only the leading token before the first '-' (the public_id or a
  // legacy numeric id); the trailing slug is decorative and ignored on resolve.
  const initialVideoIdRef          = useRef(window.location.pathname.match(/^\/v\/([^/-]+)/)?.[1] ?? null);
  const initialPostIdRef           = useRef(window.location.pathname.match(/^\/post\/([^/]+)/)?.[1] ?? null);
  const initialTownHallPostIdRef   = useRef(window.location.pathname.match(/^\/townhall\/([^/]+)/)?.[1] ?? null);
  const initialCommunityPostIdRef  = useRef(window.location.pathname.match(/^\/community\/post\/([^/]+)/)?.[1] ?? null);
  const initialCommunityIdRef      = useRef(/^\/community\/(?!post\/)/.test(window.location.pathname) ? window.location.pathname.match(/^\/community\/([^/]+)/)?.[1] ?? null : null);
  const initialCommunityHandleRef  = useRef(window.location.pathname.match(/^\/s\/([^/]+)/)?.[1] ?? null);
  const initialListingIdRef        = useRef(window.location.pathname.match(/^\/listing\/[^/]+\/([^/-]+)/)?.[1] ?? null);
  const initialJobIdRef            = useRef(window.location.pathname.match(/^\/jobs\/(\d+)/)?.[1] ?? null);
  const initialAgentIdRef          = useRef(window.location.pathname.match(/^\/company\/(\d+)/)?.[1] ?? null);
  const sidebarNavRef = useRef(null);
  const contentWrapperRef = useRef(null);
  const [pageScrollEl, setPageScrollEl] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiPanelClosing, setAiPanelClosing] = useState(false);
  function openAiPanel() {
    setAiPanelOpen(true);
    setAiPanelClosing(false);
  }
  function closeAiPanel() {
    setAiPanelClosing(true);
    setTimeout(() => {
      setAiPanelOpen(false);
      setAiPanelClosing(false);
    }, 210);
  }
  const [mobileAllOpen, setMobileAllOpen] = useState(false);
  const [mobileAllClosing, setMobileAllClosing] = useState(false);
  function openMobileAll() {
    setMobileAllOpen(true);
    setMobileAllClosing(false);
  }
  function closeMobileAll() {
    setMobileAllClosing(true);
    // 260ms — the sheet's spring transition (stiffness 420 / damping 38) settles a bit
    // slower than the old 210ms CSS ease-out did.
    setTimeout(() => {
      setMobileAllOpen(false);
      setMobileAllClosing(false);
    }, 260);
  }
  const [autoSubNav, setAutoSubNav] = useState(null);
  const [decorSubNav, setDecorSubNav] = useState(null);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("strug:view-change"));
  }, [decorSubNav]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("strug:view-change"));
  }, [autoSubNav]);
  const [showMore, setShowMore] = useState(false);
  const [sidebarScrollHint, setSidebarScrollHint] = useState(false);
  const [sidebarScrolledDown, setSidebarScrolledDown] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [, setShowThemePicker] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);
  const [showMyReports, setShowMyReports] = useState(false);
  const [userTheme] = useState(() => localStorage.getItem("strug_theme") || null);
  const [logoSpinning, setLogoSpinning] = useState(false);
  const [logoSpinReverse, setLogoSpinReverse] = useState(false);
  const [logoHoverActive, setLogoHoverActive] = useState(false);
  const [logoSearchMode, setLogoSearchMode] = useState(false);
  const logoHoverTimers = React.useRef([]);
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);

  // Global keyboard entry points: ⌘/Ctrl+K toggles the command palette; `?` opens the
  // shortcuts sheet — but never while typing in a field, so it doesn't hijack input.
  useEffect(() => {
    const isTyping = (el) => {
      const tag = el?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable;
    };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "?" && !isTyping(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShortcutsHelpOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [langPromptOpen, setLangPromptOpen] = useState(false);
  const [langPromptSuggestion, setLangPromptSuggestion] = useState({ code: "en", countryName: null });
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );
  const [currentUser, setCurrentUser] = useState(() => getUser());
  const [userLocation, setUserLocation] = useState(null);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [authBooted, setAuthBooted] = useState(false);
  // Videos owns several full-page states under the same `/videos` URL. Track whether its actual
  // browse home is visible so the mobile breadcrumb home icon never leaks into Library/Explore,
  // channel, playlist, upload, or watch surfaces.
  const [videosBrowseHomeVisible, setVideosBrowseHomeVisible] = useState(true);
  useEffect(() => {
    const sync = (event) => setVideosBrowseHomeVisible(event.detail === true);
    window.addEventListener("strug:videos-browse-home", sync);
    return () => window.removeEventListener("strug:videos-browse-home", sync);
  }, []);
  // Established accounts predate the country field — ask once so we can show local currency.
  // The new-user setup wizard already collects country, so only prompt accounts past it
  // (have a profile_id) with no country yet. "Not now" defers to the next session.
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  useEffect(() => {
    if (!authBooted || !currentUser || showSetupWizard) return;
    if (
      currentUser.profile_id &&
      !currentUser.country &&
      !sessionStorage.getItem("strug_location_prompt_deferred")
    ) {
      setShowLocationPrompt(true);
    }
  }, [authBooted, currentUser, showSetupWizard]);
  // Pull live FX rates once on startup so displayed local-currency figures track the market.
  // Self-throttles via a 12h cache; failure is silent (static/cached rates remain). Display
  // only — charges always settle in CAD, so a missed refresh never affects what users pay.
  useEffect(() => {
    refreshExchangeRates();
  }, []);
  // One-time "Welcome to Strug" hub for new users (orients them + surfaces the "Earn" hub).
  // Gated by the SERVER-SIDE per-account `has_seen_welcome` flag — not localStorage — so it
  // shows exactly once per account on any device, and only to genuinely new accounts
  // (existing accounts were backfilled as already-seen). This supersedes the interim
  // per-device `strug_new_user` gate and fixes it firing for existing users (bug #95) and
  // re-firing on every new device/login (bug #98). localStorage is kept only as a same-device
  // fast-path so it doesn't flash again before the server write lands. A missing flag (older
  // cached session / a drifted env) is treated as already-seen so we never nag. Never shown
  // over the setup wizard.
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (!authBooted || !currentUser || showSetupWizard) return;
    if (currentUser.has_seen_welcome === false && !localStorage.getItem("strug_welcome_seen")) {
      setShowWelcome(true);
    }
  }, [authBooted, currentUser, showSetupWizard]);
  const dismissWelcome = useCallback(() => {
    localStorage.setItem("strug_welcome_seen", "1");
    localStorage.removeItem("strug_new_user"); // consume the new-user flag
    setShowWelcome(false);
    // Persist server-side so it never re-shows on another device. Optimistically update the
    // cached user so the effect above doesn't re-trigger this session. Best-effort.
    setCurrentUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, has_seen_welcome: true };
      setUser(next);
      return next;
    });
    // On a NEW device the localStorage fast-path is absent, so this server write is the ONLY
    // thing standing between an onboarded account and the welcome + "take a tour" prompt (#416).
    // It used to be fire-and-forget against a route that swallowed its own failures, so a lost
    // write was invisible here and only surfaced on the next device. If it fails, drop the
    // per-device flag so the next load retries — rather than leaving the account permanently
    // flagged as never-onboarded.
    markWelcomeSeen().catch(() => {
      localStorage.removeItem("strug_welcome_seen");
    });
  }, []);
  // First-time-in-a-vertical explainer (Codezero 2026-06-23). The first time a user opens a
  // category with an entry in CATEGORY_ONBOARDING (e.g. rideshare), show a short "how this works"
  // card. Gated once-per-category-per-DEVICE via localStorage (lighter than the account-level
  // welcome flag — a per-category server flag can come later if cross-device is needed). Shown to
  // anonymous visitors too — many first-time category views (esp. after a marketing push) are
  // logged-out — but never stacked over the welcome modal or setup wizard.
  const [onboardVertical, setOnboardVertical] = useState(null);
  useEffect(() => {
    if (!authBooted || showWelcome || showSetupWizard) return;
    if (localStorage.getItem("strug_vertical_onboarding_off")) return; // global opt-out (off by default)
    if (!CATEGORY_ONBOARDING[activeNav]) return;
    if (localStorage.getItem("strug_vertical_onboarded_" + activeNav)) return;
    setOnboardVertical(activeNav);
  }, [activeNav, authBooted, showWelcome, showSetupWizard]);
  // "Got it" / "Skip" / dismiss: mark just this category seen.
  const dismissCategoryOnboard = useCallback(() => {
    setOnboardVertical((v) => {
      if (v) localStorage.setItem("strug_vertical_onboarded_" + v, "1");
      return null;
    });
  }, []);
  // "Don't show these tips again": suppress the card for every vertical from now on.
  const disableAllCategoryOnboard = useCallback(() => {
    localStorage.setItem("strug_vertical_onboarding_off", "1");
    setOnboardVertical(null);
  }, []);

  // Guided platform walkthrough — launched from the Welcome CTA and re-runnable
  // any time from the profile menu ("Take the tour").
  const [showTour, setShowTour] = useState(false);
  const [splitMode, setSplitMode] = React.useState(false);
  const [rightNav, setRightNav] = React.useState(null);
  const [splitQuery, setSplitQuery] = React.useState("");

  const LOGIN_URL =
    import.meta.env.VITE_LOGIN_URL ?? "https://strug.ca/en/login";
  const devLocalLogin = isLocalDevLoginEnabled();

  // #333/#154 platform preview: a logged-out visitor browses read-only instead of being
  // bounced straight to sign-in, and any interaction sends them to sign-in. Strictly gated
  // on being logged out — authenticated users hit none of this and behave exactly as before.
  const previewMode = authBooted && !currentUser && !devLocalLogin;
  // The preview sign-in footer is fixed to the bottom of the screen at a very high z-index
  // (it must sit above everything else the preview gate touches). InstallAppPrompt is also
  // fixed to the bottom — without this, it rendered underneath the footer on mobile instead
  // of stacking above it. Measure the footer's real height (it wraps to two lines on narrow
  // screens) and feed it to InstallAppPrompt as extra bottom offset.
  const previewFooterRef = useRef(null);
  const [previewFooterHeight, setPreviewFooterHeight] = useState(0);
  useEffect(() => {
    if (!previewMode) { setPreviewFooterHeight(0); return undefined; }
    const el = previewFooterRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setPreviewFooterHeight(entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, [previewMode]);
  const requireAuth = useCallback(async () => {
    await ensureValidAccessToken();
    if (isAuthenticated()) return;
    try { sessionStorage.setItem("strug_return_to", window.location.pathname + window.location.search); } catch { /* ignore */ }
    window.location.href = LOGIN_URL;
  }, [LOGIN_URL]);

  // Preview must not sit on account-private surfaces (messages/settings/wallet/…).
  // Public deep-links (/v/, /@handle, feed, social, marketplace browse) stay as-is.
  useEffect(() => {
    if (!previewMode) return;
    if (!PREVIEW_PRIVATE_NAV.has(activeNav)) return;
    setActiveNav("home");
    try {
      window.history.replaceState({ nav: "home" }, "", "/");
    } catch { /* history is not critical here */ }
  }, [previewMode, activeNav]);

  useEffect(() => {
    let cancelled = false;

    async function bootAuth() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      const user = params.get("user");
      const handoff = params.get("handoff");
      const refParam = params.get("ref");

      if (refParam) {
        localStorage.setItem("checkout_referral_pending", refParam);
        localStorage.setItem("ref_code_pending", refParam); // legacy key cleared on bind
        // Share-link discovery: lock this creator as recruiter on first login (one recruiter forever).
        stashFirstTouchRecruiter(refParam);
      }

      if (token && token !== "undefined") {
        // Identity comes from the signed access token only. The companion `user` query param is
        // attacker-controlled and must not set session owner / UI identity by itself.
        const tokenUserId = userIdFromAccessToken(token);
        if (tokenUserId == null) {
          // Malformed token in the URL — strip it and continue as a guest / cookie restore.
          const resolvedNav = slugToNavId(window.location.pathname);
          const resolvedSlug = navIdToSlug(ALL_NAV_IDS.has(resolvedNav) ? resolvedNav : "home");
          window.history.replaceState({ nav: resolvedNav }, "", resolvedSlug);
        } else {
          setToken(token);
          let parsedUser = null;
          if (user && user !== "undefined") {
            try { parsedUser = JSON.parse(user); }
            catch { parsedUser = null; }
          }
          const parsedId = parsedUser?.user_id ?? parsedUser?.id ?? null;
          if (parsedUser && parsedId != null && String(parsedId) === String(tokenUserId)) {
            setUser(parsedUser);
          } else {
            const claims = claimsFromAccessToken(token);
            setUser(claims || { user_id: tokenUserId });
          }
          setSessionOwner({ user_id: tokenUserId });
          // Strip token/user from the URL immediately so they never linger in history/Referer.
          const resolvedNav = slugToNavId(window.location.pathname);
          const resolvedSlug = navIdToSlug(ALL_NAV_IDS.has(resolvedNav) ? resolvedNav : "home");
          window.history.replaceState({ nav: resolvedNav }, "", resolvedSlug);
          await establishRefreshCookie(handoff);
          rememberActiveAccount();
          setAddingAccountFlag(false);
        }
      }

      const pathname = window.location.pathname;
      if (pathname.startsWith("/@")) {
        setActiveNav("profile");
      }

      const applyRefIfNeeded = () => {
        // Dual-engine: ?ref= still pre-fills per-order Referral (checkout). Separately, a
        // share-link first touch claims Recruit so the creator who brought them in keeps credit
        // — the follower cannot later assign someone else on their profile.
        const pendingRef =
          localStorage.getItem("checkout_referral_pending") ||
          localStorage.getItem("ref_code_pending");
        if (pendingRef && getUser()) {
          try {
            bindCheckoutReferralCode(pendingRef);
          } catch {
            /* ignore empty / storage errors */
          }
          localStorage.removeItem("checkout_referral_pending");
          localStorage.removeItem("ref_code_pending");
        }
        if (getUser()) {
          claimFirstTouchRecruiter().catch(() => { /* retry on next boot */ });
        }
      };

      // A missing cached `profile_id` is NOT proof the user has no profile — it can be stale (a
      // profile made on another device, an auth race, or a setup response we failed to persist).
      // Trusting it blindly trapped users who DO have a profile in a create loop: the wizard shows,
      // setup 400s "you already have a profile", repeat (#476). GET /social-profile/me no longer
      // auto-provisions, so confirm against it first and only surface the wizard when the server
      // genuinely has no profile. Fire-and-forget so auth boot isn't blocked on this request.
      const maybeSetupWizard = async (u) => {
        if (!u || u.profile_id) return;
        try {
          const existing = (await getMyProfile())?.data ?? null;
          if (existing?.profile_id) {
            const merged = {
              ...u,
              profile_id: existing.profile_id,
              ...(existing.created_at ? { social_created_at: existing.created_at } : {}),
              ...(existing.handle ? { username: existing.handle } : {}),
            };
            setUser(merged);
            setCurrentUser(merged);
            rememberActiveAccount();
            return;
          }
        } catch (err) {
          const status = err?.response?.status;
          if (status !== 404) return;
        }
        localStorage.setItem("strug_new_user", "1");
        setShowSetupWizard(true);
      };

      if (getToken() && getUser()) {
        if (cancelled) return;
        const u = getUser();
        setCurrentUser(u);
        rememberActiveAccount();
        setAddingAccountFlag(false);
        maybeSetupWizard(u);
        applyRefIfNeeded();
        // Restore invite/share (or other) path after sign-in for contribute / browse
        try {
          const returnTo = sessionStorage.getItem("strug_return_to");
          if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
            sessionStorage.removeItem("strug_return_to");
            const nav = resolveNavFromPath(returnTo.split("?")[0]);
            window.history.replaceState({ nav }, "", returnTo);
            setActiveNav(ALL_NAV_IDS.has(nav) ? nav : "home");
          }
        } catch { /* ignore */ }
        setAuthBooted(true);
        return;
      }

      if (devLocalLogin) {
        if (getToken()) clearAuth();
        setAuthBooted(true);
        return;
      }

      const restoredUser = await restoreSession().catch(() => null);
      if (cancelled) return;

      if (restoredUser) {
        setCurrentUser(restoredUser);
        rememberActiveAccount();
        setAddingAccountFlag(false);
        maybeSetupWizard(restoredUser);
        applyRefIfNeeded();
        try {
          const returnTo = sessionStorage.getItem("strug_return_to");
          if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
            sessionStorage.removeItem("strug_return_to");
            const nav = resolveNavFromPath(returnTo.split("?")[0]);
            window.history.replaceState({ nav }, "", returnTo);
            setActiveNav(ALL_NAV_IDS.has(nav) ? nav : "home");
          }
        } catch { /* ignore */ }
      } else if (getToken() && !getUser()) {
        clearAuth();
      }

      setAuthBooted(true);
    }

    bootAuth();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot boot; devLocalLogin is fixed for the session
  }, []);

  // Silently renew access tokens before the 1h JWT expires (IG-style stay-logged-in).
  useEffect(() => {
    if (!authBooted || devLocalLogin) return;
    if (!currentUser) {
      clearProactiveSessionRefresh();
      return;
    }
    scheduleProactiveSessionRefresh();
    installSessionRefreshOnVisibility();
    return () => {
      clearProactiveSessionRefresh();
      uninstallSessionRefreshOnVisibility();
    };
  }, [authBooted, devLocalLogin, currentUser?.user_id, currentUser?.id]);

  // Logged-out visitors now enter read-only preview (see previewMode) instead of an
  // immediate bounce to sign-in. We deliberately do NOT force a surface here so existing
  // public deep-links (/v/, /@handle, /community/…) keep resolving; the preview click gate
  // below routes every interaction to sign-in, and navigateTo still gates private pages.

  // Preview interaction gate: while previewing, a click on any interactive control sends
  // the visitor to sign-in ("click anywhere → sign in"). Passive looking/scrolling is
  // untouched. Elements marked [data-preview-allow] (the sign-in button) are exempt.
  useEffect(() => {
    if (!previewMode) return;
    const onClick = (e) => {
      const path = window.location.pathname || "";
      // Public event invitations / registry share — guests must RSVP & browse without sign-in
      if (/^\/invite\//i.test(path) || /^\/event-share\//i.test(path)) return;
      const t = e.target;
      if (t.closest && t.closest("[data-preview-allow]")) return;
      const interactive = t.closest && t.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]');
      if (!interactive) return;
      e.preventDefault();
      e.stopPropagation();
      requireAuth();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [previewMode, requireAuth]);

  const activeNavRef = useRef(activeNav);
  useEffect(() => {
    activeNavRef.current = activeNav;
  }, [activeNav]);

  // A direct /my-reports URL (an old email link, a bookmark, a hard refresh with the modal open)
  // resolves to the "my-reports" nav id via the normal path→nav bootstrap, but there is no page
  // behind it any more — it's a modal. Catch that and turn it into: open the modal, sit on home.
  // Without this the ternary chain falls through and renders nothing at all.
  useEffect(() => {
    if (activeNav !== "my-reports") return;
    setShowMyReports(true);
    setActiveNav("home");
    try {
      window.history.replaceState({ nav: "home" }, "", "/");
    } catch { /* history is not critical here */ }
  }, [activeNav]);

  const navigateTo = useCallback(
    async (id) => {
      // Alias: sd-shop → sd-ecommerce (legacy nav ID exposed in some links)
      if (id === "sd-shop") id = "sd-ecommerce";
      // "my-reports" is a MODAL, not a page — it's the other half of the Report-a-problem
      // conversation, so it lives on the same surface rather than yanking the user off whatever
      // they were doing. It's still a nav id because that's what a notification's `action_url`
      // resolves through (the panel feeds it straight to navigateTo), so intercept it here:
      // open the modal and leave the current page — and the URL — exactly where they were.
      if (id === "my-reports") {
        await ensureValidAccessToken();
        if (!isAuthenticated()) { await requireAuth(); return; }
        setShowBugReport(false);
        setShowMyReports(true);
        return;
      }
      if (id !== "home") {
        await ensureValidAccessToken();
        if (!isAuthenticated()) {
        if (devLocalLogin) {
          setCurrentUser(null);
        } else {
          try { sessionStorage.setItem("strug_return_to", window.location.pathname + window.location.search); } catch { /* ignore */ }
          window.location.href = LOGIN_URL;
        }
        return;
        }
      }
      // The initial* deep-link refs are cold-load seeds (a page consumes them on first mount to
      // open a shared detail). Once the user navigates, they're spent — clear them so returning to
      // a vertical later doesn't re-open the originally deep-linked detail (#111: "leave the video
      // category, come back and it takes you to a specific video"). Back/forward restore instead
      // reads window.location in each page's own popstate listener, so this doesn't break history.
      initialVideoIdRef.current = null;
      initialListingIdRef.current = null;
      initialPostIdRef.current = null;
      initialTownHallPostIdRef.current = null;
      initialCommunityPostIdRef.current = null;
      initialCommunityIdRef.current = null;
      initialCommunityHandleRef.current = null;
      const prev = activeNavRef.current;
      if (prev === "ondemand" && id !== "ondemand") {
        clearWorkHirePreset();
      }
      if (prev !== id)
        window.dispatchEvent(
          new CustomEvent("strug:will-nav", { detail: { from: prev, to: id } }),
        );
      if (
        id === "messages" &&
        !window.__navReturn &&
        (prev === "sd-drive" || prev === "sd-courier")
      ) {
        window.__navReturn = { id: prev, label: "Back to dashboard" };
      }
      if (id === "decor" && (window.__pendingListingId || window.__forceDecorSubNav)) {
        setDecorSubNav(window.__forceDecorSubNav || "services");
        try { delete window.__forceDecorSubNav; } catch { /* ignore */ }
      }
      // Order History's back button used to hardcode "groceries" regardless of where the user
      // actually came from (Food, Rideshare, etc.). Remember the originating nav id here so it
      // can return there instead — read/cleared by Account.jsx's goBackFromOrders.
      if (id === "orders" && prev !== "orders") {
        window.__ordersReturnNav = prev;
      }
      // Profile always remounts so stale state from a previous user's profile is cleared
      if (id === "profile") setProfileKey(k => k + 1);
      setActiveNav(id);
      setRecentVerticals(pushRecentVertical(id));
      // Sync URL — don't push if already on the right path
      const slug = navIdToSlug(id);
      if (window.location.pathname !== slug) {
        window.history.pushState({ nav: id }, "", slug);
      }
      // After URL sync so Concierge page sees /concierge (not leftover /invite/…)
      if (id === "concierge") {
        try { window.dispatchEvent(new Event("strug:concierge-open")); } catch { /* ignore */ }
      }
    },
    [LOGIN_URL, devLocalLogin, requireAuth],
  );

  // Resolved icon/label for the recent-verticals row on the home page — the sidebar
  // resolves its own pinned row directly from the module-level NAV_ICON_BY_ID/NAV_LABEL_BY_ID
  // maps, but Hub.jsx lives in a different file, so it needs plain data instead.
  const recentNavItems = useMemo(
    () =>
      recentVerticals
        .map((id) => ({ id, label: NAV_LABEL_BY_ID[id] || id, icon: NAV_ICON_BY_ID[id] }))
        .filter((item) => Boolean(item.icon)),
    [recentVerticals],
  );

  // All four of these are gated on `authBooted`. They used to read getUser() once inside a
  // mount effect with stable deps: on a hard reload sessionStorage is still empty (restoreSession
  // resolves later), so they saw null, bailed, and never re-ran — no socket, no push, no toasts,
  // for the entire session. FeedPage already worked around this via its `authReady` prop.
  useChatPush(authBooted);
  const chatUnreadTotal = useChatUnread(authBooted);
  // Board #467: reply to a DM in place instead of leaving the current section. The chat toast
  // now opens this compact popup; "Open full chat" inside it still jumps to the Messages page.
  const [quickReplyChannel, setQuickReplyChannel] = useState(null);
  const chatToast = useChatToast({
    activeNav,
    authReady: authBooted,
    onOpenChat: (payload) => {
      const cid = payload && typeof payload === "object" ? payload.channelId : payload;
      if (cid == null) return;
      setQuickReplyChannel(
        payload && typeof payload === "object" ? payload : { channelId: cid },
      );
    },
  });
  const txnToast = useTransactionalToast(authBooted, {
    externalChatToast: chatToast.toast,
    onOpenChat: chatToast.openChat,
    fallbackAccent: userTheme || PAGE_COLORS[activeNav] || '#2563eb',
  }); // unified themed popup queue — already covers the notification:new catch-all
  useDriverOnlineReminder(authBooted, { push: txnToast.push });
  // Epic 10: one global notification store for every vertical. Gated on `authBooted`, NOT on a
  // one-shot getUser() — on a hard reload sessionStorage is empty until restoreSession() resolves,
  // and the hooks above bail permanently when they hit that (they never re-run). Don't copy them.
  // Also require `currentUser`: under dev-login (VITE_DEV_LOGIN) `authBooted` flips true *before*
  // sign-in, so gating on it alone left the hook's mount effect running once with no user id and
  // never retrying. `currentUser` going null→set on login re-runs it with the id populated.
  const notifs = useNotifications(authBooted && !!currentUser);
  // Epic 10 claim card: actionable offers (ride/work/courier/delivery) surface a global popup
  // on ANY page — the answer to "a driver can't know a ride is coming unless they're on the
  // dashboard." Suppressed on the offer's own dashboard (that page shows its own card).
  const incomingOffers = useIncomingOffers(authBooted, { activeNav, navigateTo });
  const offerToastKeyRef = useRef(null);
  useEffect(() => {
    const offer = incomingOffers.offer;
    if (!offer) {
      if (offerToastKeyRef.current) txnToast.dismiss(offerToastKeyRef.current);
      offerToastKeyRef.current = null;
      return;
    }
    const toast = buildOfferToast(offer, incomingOffers);
    if (offerToastKeyRef.current && offerToastKeyRef.current !== toast.key) {
      txnToast.dismiss(offerToastKeyRef.current);
    }
    offerToastKeyRef.current = toast.key;
    txnToast.push(toast);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- offer + toast methods; full incomingOffers/txnToast objects churn every render
  }, [incomingOffers.offer, incomingOffers.accept, incomingOffers.decline, incomingOffers.view, txnToast.push, txnToast.dismiss]);

  // Handle browser back / forward
  useEffect(() => {
    const onPop = (e) => {
      const pathname = window.location.pathname;
      // /@handle back/forward — re-resolve the handle and force profile remount
      if (pathname.startsWith("/@")) {
        const handle = pathname.slice(2).split("/")[0];
        if (handle) {
          window.__pendingHandle = handle;
          delete window.__profileTargetId;
          setProfileKey(k => k + 1);
          setActiveNav("profile");
        }
        return;
      }
      // /live/@handle(/sessionId) — ensure LivePage is mounted; it self-syncs open/close
      // from the URL via its own popstate listener.
      if (/^\/live\/@[^/]+/.test(pathname)) {
        setActiveNav("live");
        return;
      }
      // Resolve from the FULL URL (deep links included), not a bare slug — otherwise Back onto a
      // /listing/... or /v/... entry (whose pushed state may be empty) fell through to "home" (#186).
      // e.state.nav is honoured first (fast path for plain nav pushes), else parse the path. The
      // destination page restores its own open sub-view from window.location via its popstate listener.
      const id = e.state?.nav ?? resolveNavFromPath(pathname);
      const resolved = ALL_NAV_IDS.has(id) ? id : resolveNavFromPath(pathname);
      setActiveNav(resolved);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    window.__nav = (id) => navigateTo(id);
    return () => {
      delete window.__nav;
    };
  }, [navigateTo]);

  // Cross-section persistent mini-player (bug #471 / #473 item 2). When the user leaves the Videos
  // section while a long-form video is open+playing, keep it playing in a corner mini; returning to
  // Videos hands playback back to the full watch page. The snapshot is published by VideoWatchPage to
  // window.__strugActiveVideo (kept fresh, cleared on explicit close), so leaving a *playing* video
  // spawns the mini but closing one first does not. Watching activeNav here catches both button-nav
  // (navigateTo) and browser Back/Forward (popstate → setActiveNav).
  const [globalMini, setGlobalMini] = useState(null);
  const prevNavForMiniRef = useRef(activeNav);
  useEffect(() => {
    const prev = prevNavForMiniRef.current;
    prevNavForMiniRef.current = activeNav;
    if (activeNav === "videos") {
      // Back on the Videos section — the full watch page owns playback again.
      setGlobalMini(null);
      return;
    }
    if (prev === "videos") {
      const a = typeof window !== "undefined" ? window.__strugActiveVideo : null;
      if (a?.video?.processed_video_url) {
        setGlobalMini({ video: a.video, startTime: a.time || 0 });
      }
    }
  }, [activeNav]);
  // Restore from the mini → reopen the full watch page at the mini's current timestamp, using the
  // existing per-video resume seed + the VideosPage open-handoff (window.__videosOpenVideoId).
  const expandMini = useCallback((currentTime) => {
    const g = globalMini;
    setGlobalMini(null);
    if (!g?.video?.videoId) { navigateTo("videos"); return; }
    try { sessionStorage.setItem(`strug_resume_${g.video.videoId}`, Math.floor(currentTime || g.startTime || 0)); } catch { /* noop */ }
    window.__videosOpenVideoId = g.video.videoId;
    navigateTo("videos");
  }, [globalMini, navigateTo]);
  const closeMini = useCallback((currentTime) => {
    const g = globalMini;
    if (g?.video?.videoId && currentTime > 5) {
      try { sessionStorage.setItem(`strug_resume_${g.video.videoId}`, Math.floor(currentTime)); } catch { /* noop */ }
    }
    try { window.__strugActiveVideo = null; } catch { /* noop */ }
    setGlobalMini(null);
  }, [globalMini]);

  useEffect(() => {
    const handleLogout = () => {
      clearAuth();
      disconnectSocket();
      setCurrentUser(null);
      setActiveNav("home");
    };
    window.addEventListener("strug:logout", handleLogout);
    return () => window.removeEventListener("strug:logout", handleLogout);
  }, []);

  const [hideProfileBtn, setHideProfileBtn] = useState(false);
  useEffect(() => {
    const h = (e) => setHideProfileBtn(!!e.detail?.hidden);
    window.addEventListener("strug:hide-profile", h);
    return () => window.removeEventListener("strug:hide-profile", h);
  }, []);

  useEffect(() => {
    const handleUserUpdated = (e) => {
      // Merge the patch (e.g. { profile_pic_url }) onto the existing user so we
      // don't wipe user_id/username/profile_id. Persist so it survives reloads.
      setCurrentUser((prev) => {
        const base = prev ?? getUser() ?? {};
        const next = e.detail ? { ...base, ...e.detail } : getUser();
        if (next) setUser(next);
        return next;
      });
    };
    window.addEventListener("strug:user-updated", handleUserUpdated);
    return () =>
      window.removeEventListener("strug:user-updated", handleUserUpdated);
  }, []);

  // Hydrate the signed-in user's avatar from their social profile. The auth
  // user object (from login) doesn't carry profile_pic_url — it lives on the
  // social profile — so fetch it once on boot so the sidebar + account menu
  // show the real photo, not the placeholder icon.
  useEffect(() => {
    if (!authBooted || !currentUser || currentUser.profile_pic_url) return;
    let cancelled = false;
    getMyProfile()
      .then((d) => {
        const p = d?.data ?? d;
        const url = p?.profile_pic_url;
        if (cancelled || !url) return;
        setCurrentUser((prev) => {
          const next = { ...(prev ?? {}), profile_pic_url: url };
          if (p?.display_name && !next.name) next.name = p.display_name;
          setUser(next);
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authBooted, currentUser]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    // Less-obtrusive location (bug #190-adjacent): seed from the cached last-known
    // location so a reload never re-prompts or flickers, and only ever trigger the
    // browser permission prompt when (a) already granted → silent refresh, or
    // (b) on the user's first interaction — never on page load. A prior denial is
    // respected (we don't keep asking).
    try {
      const cached = JSON.parse(getLocationItem("strug_user_location") || "null");
      if (cached?.lat != null) setUserLocation(cached);
    } catch { /* ignore */ }
    const fetchPos = () =>
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, long: pos.coords.longitude };
          setUserLocation(loc);
          try { setLocationItem("strug_user_location", JSON.stringify(loc)); } catch { /* ignore */ }
        },
        () => {},
        { timeout: 8000, maximumAge: 600000 },
      );
    let cleanup = () => {};
    const deferToGesture = () => {
      const onGesture = () => { window.removeEventListener("pointerdown", onGesture); fetchPos(); };
      window.addEventListener("pointerdown", onGesture, { once: true });
      cleanup = () => window.removeEventListener("pointerdown", onGesture);
    };
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
          if (status.state === "granted") fetchPos();      // already allowed → silent, no prompt
          else if (status.state !== "denied") deferToGesture(); // ask at most once, on interaction
        })
        .catch(() => deferToGesture());
    } else {
      deferToGesture();
    }
    return () => cleanup();
  }, []);

  // Publish the active route so the <Elements> wrapper above us can decide whether Stripe is
  // worth loading here (#465).
  useEffect(() => { setActiveRoute(activeNav); }, [activeNav]);

  // Route-change focus management: when the active page changes, move keyboard /
  // screen-reader focus to the new page's first heading (falling back to the #main
  // container) so AT users are told they landed on a new page instead of being left
  // on a control that no longer exists. `preventScroll` avoids a jump.
  //
  // We compare against the *previous* activeNav rather than a "mounted" flag so this
  // never fires on the initial load (nothing to announce yet, and it must not steal
  // focus from the skip-to-content link) nor on React's StrictMode double-invoke —
  // only on a genuine route change. Sub-page state (e.g. opening a video in the
  // player) doesn't touch activeNav, so playback is never disrupted.
  //
  // #main lives inside the <React.Suspense> boundary below, so a lazy route chunk
  // unmounts it (replaced by the fallback) until the chunk resolves — hence we poll a
  // few frames for it to reappear instead of assuming it's there on the next frame.
  const prevNavForFocusRef = useRef(activeNav);
  useEffect(() => {
    if (prevNavForFocusRef.current === activeNav) return;
    prevNavForFocusRef.current = activeNav;
    let frames = 0;
    let raf = 0;
    const tryFocus = () => {
      const main = contentWrapperRef.current;
      if (!main) {
        if (++frames < 40) raf = requestAnimationFrame(tryFocus); // ~650ms cap
        return;
      }
      // If the new page has already placed focus somewhere inside itself (e.g. an
      // auto-focused search field), leave it — don't yank it back to the heading.
      const active = document.activeElement;
      if (active && active !== main && main.contains(active)) return;
      const heading = main.querySelector("h1, h2");
      const target = heading || main;
      // #main already carries tabIndex=-1; a heading needs it to be programmatically
      // focusable without becoming a tab stop.
      if (target !== main) target.setAttribute("tabindex", "-1");
      try {
        target.focus({ preventScroll: true });
      } catch {
        target.focus();
      }
    };
    raf = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(raf);
  }, [activeNav]);

  useEffect(() => {
    // Defer the Google Maps JS API (+ Places) off the initial load path — it was
    // ~8 requests fired on every app boot, even on pages with no map. Load on the
    // first user interaction (ready well before any address/map UI), with an idle
    // fallback so it's available even without interaction. `loadGoogleMaps` is
    // idempotent, and address/map components also request it on demand.
    //
    // #465: that fallback timer meant Maps (~1.3 MB decoded over 6 requests) loaded on every
    // route regardless — including Videos and Social, which have no map. Skip the preload on
    // those; if the user navigates to a route with a map, this effect re-runs and preloads it
    // then, and every map/address component still calls loadGoogleMaps() on demand anyway.
    if (!routeNeedsHeavySdks(activeNav)) return;
    let done = false;
    const events = ["pointerdown", "keydown", "touchstart"];
    const load = () => {
      if (done) return;
      done = true;
      loadGoogleMaps();
      events.forEach((e) => window.removeEventListener(e, load));
    };
    events.forEach((e) =>
      window.addEventListener(e, load, { once: true, passive: true }),
    );
    const t = setTimeout(load, 5000);
    return () => {
      clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, load));
    };
  }, [activeNav]);

  useEffect(() => {
    const updateDir = () => {
      document.documentElement.dir = RTL_LANGUAGES.has(i18n.language)
        ? "rtl"
        : "ltr";
    };
    updateDir();
    i18n.on("languageChanged", updateDir);

    const user = getUser();
    if (user) syncLanguageFromUser(user);

    return () => i18n.off("languageChanged", updateDir);
  }, []);

  useEffect(() => {
    if (!authBooted || !currentUser) return;
    if (hasExplicitLanguageChoice() || hasSeenLanguagePrompt()) return;

    detectLocale()
      .then((data) => {
        applyLocaleHints({
          currency: data?.currency,
          country: data?.country,
          countryName: data?.countryName,
        });
        const suggested = data?.suggestedLanguage || data?.language || navigator.language?.split("-")[0] || "en";
        // Don't prompt when the best match is English — the UI is already English,
        // so there's nothing to switch to. (getSupportedLanguageCode falls back to 'en'.)
        if (getSupportedLanguageCode(suggested) === "en") return;
        setLangPromptSuggestion({
          code: suggested,
          countryName: data?.countryName || null,
        });
        setLangPromptOpen(true);
      })
      .catch(() => {
        const nav = navigator.language?.split("-")[0];
        if (nav && getSupportedLanguageCode(nav) !== "en") {
          setLangPromptSuggestion({ code: nav, countryName: null });
          setLangPromptOpen(true);
        }
      });
  }, [authBooted, currentUser]);
  const toggleFullscreen = () => {
    const el = document.documentElement;
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (!isFs) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (req) {
        // Only reflect fullscreen state when the request actually succeeds — the
        // "fullscreenchange" listener also syncs it. iOS Safari has no Fullscreen
        // API (req undefined), so we must NOT flip the icon optimistically there.
        const result = req.call(el);
        if (result && typeof result.then === "function") {
          result.then(() => setIsFullscreen(true)).catch(() => {});
        } else {
          setIsFullscreen(true);
        }
      }
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
      if (exit) {
        const result = exit.call(document);
        if (result && typeof result.then === "function") {
          result.then(() => setIsFullscreen(false)).catch(() => {});
        } else {
          setIsFullscreen(false);
        }
      }
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, []);

  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Immersive media players (shorts, feed fullscreen video) dispatch this event
  // to hide/show the mobile bottom nav while they're active.
  useEffect(() => {
    const handler = e => setImmersiveMedia(!!e.detail);
    window.addEventListener("strug:immersive-media", handler);
    return () => window.removeEventListener("strug:immersive-media", handler);
  }, []);

  // A page that wants the breadcrumb's strip for itself says so the same way.
  useEffect(() => {
    const handler = e => setBreadcrumbSuppressed(!!e.detail);
    window.addEventListener("strug:hide-breadcrumb", handler);
    return () => window.removeEventListener("strug:hide-breadcrumb", handler);
  }, []);

  useEffect(() => {
    const handler = e => setMobileChatOpen(!!e.detail?.open);
    window.addEventListener("strug:chat-open-changed", handler);
    return () => window.removeEventListener("strug:chat-open-changed", handler);
  }, []);

  useEffect(() => {
    const timers = new Set();
    let scanTimer;
    // Find the page's single scroll container (largest scrollable overflow:auto element) so the
    // desktop scrollbar can track it. Pages hide native scrollbars globally, so if this misses,
    // the page has NO visible scrollbar even though it scrolls (#138/#149). Re-run the scan at
    // several delays and whenever the page DOM changes — the first scan often fired during the
    // skeleton phase or before async content loaded, leaving pages scrollbar-less.
    const scan = () => {
      const root = contentWrapperRef.current;
      if (!root) return;
      const isShown = (el) => {
        let p = el;
        while (p && p !== root.parentElement) {
          const st = window.getComputedStyle(p);
          if (st.display === "none" || st.visibility === "hidden") return false;
          p = p.parentElement;
        }
        return true;
      };
      const consider = (el, state) => {
        if (!isShown(el)) return;
        // Collapsed watch chrome (0×0 mini-player wrapper) still has overflow:auto + huge
        // scrollHeight — skip anything too short to be the real page scroller.
        if (el.clientHeight < 48) return;
        const s = window.getComputedStyle(el);
        if (s.overflowY !== "auto" && s.overflowY !== "scroll") return;
        const delta = el.scrollHeight - el.clientHeight;
        if (delta <= state.bestDelta) return;
        state.best = el;
        state.bestDelta = delta;
      };
      const state = { best: null, bestDelta: 8 };
      // Prefer explicit page scrollers (Videos browse/watch). Falling back to "largest
      // overflow:auto" used to latch onto a display:none browse pane after opening a video,
      // which left the laptop with no visible scrollbar (#138/#149 — ongoing Videos miss).
      root.querySelectorAll("[data-strug-page-scroll]").forEach((el) => consider(el, state));
      if (!state.best) {
        root.querySelectorAll("*").forEach((el) => consider(el, state));
      }
      setPageScrollEl((prev) => (prev === state.best ? prev : state.best || null));
    };
    const scheduleScan = (delay = 80) => {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(() => {
        scanTimer = undefined;
        scan();
      }, delay);
    };
    const discover = () => {
      [0, 300, 700, 1300, 2200].forEach((d) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          scan();
        }, d);
        timers.add(timer);
      });
    };
    // Debounce resize — scan walks the DOM, and resize can fire dozens of times while dragging.
    let resizeT;
    const onResize = () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(scan, 150);
    };
    const observerRoot = document.getElementById("root") || document.body;
    const observer = typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => scheduleScan());
    // Observe the stable application shell instead of the page ref. Suspense can mount the
    // page after this effect first runs, and observing the shell guarantees that the first
    // real scroll container is discovered when that happens without watching unrelated portals.
    observer?.observe(observerRoot, { childList: true, subtree: true });
    discover();
    window.addEventListener("strug:view-change", discover);
    window.addEventListener("resize", onResize);
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
      clearTimeout(scanTimer);
      clearTimeout(resizeT);
      window.removeEventListener("strug:view-change", discover);
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
    };
  }, [activeNav]);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;

  // Keep viewport hook in sync with split mode so all pages get correct breakpoints.
  // MUST stay below the isMobile declaration above — referencing it earlier in the
  // component body reads isMobile in its temporal dead zone and crashes render (#905 regression).

  useEffect(() => {
    _bp.isMobile = isMobile;
    _bp.isTablet = isTablet;
  }, [isMobile, isTablet]);
  const SPLIT_PAGES = SPLIT_SECTIONS.flatMap(s => s.pages);
  const splitRightLabel = SPLIT_PAGES.find(p => p.id === rightNav)?.label ?? rightNav;
  const splitLibrarySections = React.useMemo(() => {
    const q = splitQuery.trim().toLowerCase();
    if (!q) return SPLIT_SECTIONS;
    return SPLIT_SECTIONS
      .map((s) => ({ ...s, pages: s.pages.filter((p) => p.label.toLowerCase().includes(q)) }))
      .filter((s) => s.pages.length > 0);
  }, [splitQuery]);

  const FLYOUT_NAVS = new Set([
    "profile",
    "settings",
    "orders",
    "dashboard",
    "messages",
    "help",
    "insurance",
    "mortgage",
    "ai",
    "provider", // the /provider portal hub — render the full app chrome (sidebar) like any page
    "recruiter", // profile sub-page — needs the full app chrome (sidebar/header) like wallet/orders
  ]);
  const is404 =
    !NAV_ITEMS.some((n) => n.id === activeNav) &&
    !MORE_ITEMS.some((m) => m.navId === activeNav) &&
    !FLYOUT_NAVS.has(activeNav);

  const pageAccent = userTheme || (PAGE_COLORS[activeNav] ?? "#2563eb");

  // Home > current vertical. Deep pages append their own sub-trail (settings
  // tab, seller-dashboard tab, ...) via usePageBreadcrumb — see Breadcrumbs.jsx.
  // A single-segment trail (i.e. activeNav === "home") renders nothing.
  // sd-* (seller/provider dashboards) aren't in NAV_ITEMS/SIDEBAR_ITEMS — they're reached via
  // the Provider Hub — so they need MORE_ITEMS + moreItemLabel for a real title instead of the
  // raw "sd-food" id.
  const verticalLabel =
    activeNav === "home"
      ? null
      : activeNav.startsWith("sd-")
        ? moreItemLabel(t, MORE_ITEMS.find((m) => m.navId === activeNav) || { navId: activeNav, label: activeNav })
        : sidebarNavLabel(activeNav, NAV_LABEL_BY_ID[activeNav] || (activeNav === "recruiter" ? "Affiliate" : activeNav), t);
  const mobileVideosHomeCrumb = isMobile && activeNav === "videos" && videosBrowseHomeVisible;
  const navigateBreadcrumbHome = () => navigateTo("home");
  const breadcrumbTrail = is404
    ? []
    : [
        {
          label: mobileVideosHomeCrumb ? (
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 11 9-8 9 8" />
              <path d="M5 10v10h14V10" />
              <path d="M9 20v-6h6v6" />
            </svg>
          ) : sidebarNavLabel("home", "Home", t),
          onClick: navigateBreadcrumbHome,
          ...(mobileVideosHomeCrumb ? {
            iconOnly: true,
            ariaLabel: t("common.goToHome", { defaultValue: "Go to Strug Home" }),
            title: t("common.goToHome", { defaultValue: "Go to Strug Home" }),
          } : {}),
        },
        ...(verticalLabel ? [{ label: verticalLabel }] : []),
      ];
  const breadcrumbVisible = !is404 && !immersiveMedia && !breadcrumbSuppressed && breadcrumbTrail.length >= 2;

  useEffect(() => {
    const el = sidebarNavRef.current;
    if (!el) return;
    const update = () => {
      setSidebarScrollHint(
        el.scrollHeight > el.clientHeight + 4 &&
          el.scrollTop < el.scrollHeight - el.clientHeight - 4,
      );
      setSidebarScrolledDown(el.scrollTop > 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  if (devLocalLogin && !currentUser) {
    if (!authBooted) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--color-bg)",
            color: "var(--color-text-secondary)",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Loading…
        </div>
      );
    }
    return (
      <DevLogin
        onSuccess={(user) => {
          setCurrentUser(user);
          // Keep /c/:handle, /v/:id, /videos, etc. Local login used to always replaceState
          // to `/`, so a channel deep link bounced to home after Sign in.
          const path = window.location.pathname || "/";
          const nav = resolveNavFromPath(path);
          if (path !== "/") {
            window.history.replaceState({ nav }, "", path + window.location.search);
            setActiveNav(ALL_NAV_IDS.has(nav) ? nav : "home");
            return;
          }
          window.history.replaceState({ nav: "home" }, "", navIdToSlug("home"));
          setActiveNav("home");
        }}
      />
    );
  }

  // Logged out: render the read-only preview shell (previewMode) rather than a blank bounce.
  // devLocalLogin already returned above; if for any reason preview isn't active, keep the
  // old blank-guard so we never render a half-authenticated tree.
  if (authBooted && !currentUser && !previewMode) {
    return null;
  }

  const renderNavPage = (
    navId,
    onNav = navigateTo,
    initialVideoId = null,
    initialListingId = null,
    initialJobId = null,
    initialAgentId = null,
  ) => (
    HIDDEN_VERTICALS.has(navId) ? (
              <HiddenVerticalPage navId={navId} />
            ) : navId === "ondemand" ? (
              <OnDemandHire
                onNavigate={onNav}
                userLocation={userLocation}
              />
            ) : navId === "videos" ? (
              <VideosPage initialVideoId={initialVideoId} />
            ) : navId === "shop" ? (
              <EcommercePage initialListingId={initialListingId} />
            ) : navId === "food" ? (
              <FoodPage userLocation={userLocation} initialListingId={initialListingId} onNavigate={onNav} />
            ) : navId === "dating" ? (
              <DatingPage onNavigate={onNav} />
            ) : navId === "lessons" ? (
              <LessonsPage />
            ) : navId === "preconstruct" ? (
              <PreconstructPage />
            ) : navId === "tempstay" ? (
              <TempStayPage onNavigate={onNav} initialListingId={initialListingId} />
            ) : navId === "events" ? (
              <EventsPage initialListingId={initialListingId} />
            ) : navId === "concierge" ? (
              <EventConciergePage onNavigate={onNav} />
            ) : navId === "event-plan" ? (
              <EventPlanPage />
            ) : navId === "venues" ? (
              <VenuesPage initialListingId={initialListingId} />
            ) : navId === "groceries" ? (
              <GroceriesPage userLocation={userLocation} />
            ) : navId === "equipment" ? (
              <EquipmentPage initialListingId={initialListingId} />
            ) : navId === "floral" ? (
              <FloralPage userLocation={userLocation} initialListingId={initialListingId} />
            ) : navId === "realestate" ? (
              <RealEstatePage />
            ) : navId === "decor" ? (
              <DecorPage
                subSection={decorSubNav}
                setSubSection={setDecorSubNav}
              />
            ) : navId === "automotive" ? (
              <AutomotivePage
                subSection={autoSubNav}
                setSubSection={setAutoSubNav}
              />
            ) : navId === "vehicles" ? (
              <VehicleRentalPage />
            ) : navId === "rideshare" ? (
              <RidesharePage userLocation={userLocation} onNavigate={onNav} />
            ) : navId === "learn" ? (
              <LearnPage />
            ) : navId === "portfolio" ? (
              <PortfolioPage />
            ) : navId === "catering" ? (
              <CateringPage userLocation={userLocation} />
            ) : navId === "secondhand" ? (
              <SecondHandPage />
            ) : navId === "meet" ? (
              <MeetPage />
            ) : navId === "discounts" ? (
              <DiscountsPage />
            ) : navId === "books" ? (
              <BooksPage onNavigate={onNav} />
            ) : navId === "artists" ? (
              <ArtistCornerPage onNavigate={onNav} />
            ) : navId === "digservices" ? (
              <DigitalServicesPage onNavigate={onNav} />
            ) : navId === "medical" ? (
              <MedicalPage />
            ) : navId === "influencer" ? (
              <InfluencerPage onNavigate={onNav} />
            ) : navId === "raise" ? (
              <RaisePage />
            ) : navId === "reservations" ? (
              <ReservationsPage onNavigate={onNav} />
            ) : navId === "celebrity" ? (
              <CelebrityPage onNavigate={onNav} />
            ) : navId === "experiences" ? (
              <ExperiencesPage />
            ) : navId === "wedding" ? (
              <WeddingPage />
            ) : navId === "proservices" ? (
              <ProServicesPage onNavigate={onNav} />
            ) : navId === "digproducts" ? (
              <DigitalProductsPage onNavigate={onNav} />
            ) : navId === "social" ? (
              <SocialPage initialTownHallPostId={initialTownHallPostIdRef.current} />
            ) : navId === "feed" ? (
              <FeedPage initialPostId={initialPostIdRef.current} authReady={authBooted} />
            ) : navId === "community" ? (
              <CommunityPage initialCommunityId={initialCommunityIdRef.current} initialCommunityPostId={initialCommunityPostIdRef.current} initialCommunityHandle={initialCommunityHandleRef.current} />
            ) : navId === "live" ? (
              <LivePage />
            ) : navId === "pinboard" ? (
              <PinBoardPage />
            ) : navId === "favourites" ? (
              <FavouritesPage />
            ) : navId === "bookartist" ? (
              <BookArtistPage onNavigate={onNav} />
            ) : navId === "hotel" ? (
              <HotelPage />
            ) : navId === "courier" ? (
              <CourierPage />
            ) : navId === "refcodes" ? (
              <SavedRefCodesPage />
            ) : navId === "wallet" ? (
              <WalletEarningsPage />
            ) : navId === "messages" ? (
              <MessagesPage />
            ) : navId === "dashboard" ? (
              <UserDashboardPage onNavigate={onNav} />
            ) : navId === "orders" ? (
              <OrdersHistoryPage />
            ) : navId === "profile" ? (
              <UserProfilePage key={profileKey} onNavigate={onNav} />
            ) : navId === "legal" ? (
              <LegalPage />
            ) : navId === "settings" ? (
              <UserSettingsPage />
            ) : navId === "help" ? (
              <HelpCenterPage />
            ) : navId === "admin" ? (
              <AdminDashboard />
            ) : navId === "insurance" ? (
              <QuotesPage vertical="insurance" />
            ) : navId === "mortgage" ? (
              <QuotesPage vertical="mortgage" />
            ) : navId === "recruiter" ? (
              <RecruiterPage onNavigate={onNav} />
            ) : navId === "jobs" ? (
              <JobsPage onNavigate={onNav} initialJobId={initialJobId} initialAgentId={initialAgentId} />
            ) : navId === "employer" ? (
              <EmployerPage onNavigate={onNav} />
            ) : navId === "sd-work" ? (
              <OnDemandWorker
                config={{
                  title: t("ondemand.worker.title"),
                  color: "#2563eb",
                  backNav: (typeof window !== "undefined" && window.__navReturn?.id === "bookartist")
                    ? "bookartist"
                    : "ondemand",
                  backLabel: (typeof window !== "undefined" && window.__navReturn?.id === "bookartist")
                    ? (window.__navReturn.label || "Back to Book Artist")
                    : navC(t, "ondemand", "Work"),
                }}
                onNavigate={onNav}
              />
            ) : (navId === "sd-drive" || navId === "sd-courier") ? (
              // One driver identity, one dashboard — sd-courier is kept only as an alias so
              // existing deep links / notification actionUrls still land somewhere valid.
              // Which job types (rides/food/shop/courier) a driver sees is now decided by their
              // own preferences inside the dashboard, not by which nav id they arrived through.
              <SellerDriveDashboard
                config={{
                  title: t("sellerDash.strugDrive.title"),
                  subtitle: t("sellerDash.strugDrive.subtitle"),
                  color: "#2563eb",
                  stat2: "12",
                  stat2Label: sdC(t, "tripsToday", "Trips Today"),
                  tripLabel: sdC(t, "tripsLabel", "Trips"),
                  rounded: true,
                  backNav: "rideshare",
                  backLabel: sdC(t, "backRideshare", "Rideshare"),
                  // Onboarding-only: which capability flag "Apply" grants and which gate copy
                  // shows for someone who hasn't been approved yet. Purely about the apply
                  // flow — the dashboard itself no longer branches on this once approved.
                  applyFlagKey: navId === "sd-courier" ? "is_courier" : "is_driver",
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-ecommerce" ? (
              <SellerEcommerceDashboard
                config={{
                  title: t("sellerDash.sellOnStrug.title"),
                  subtitle: t("sellerDash.sellOnStrug.subtitle"),
                  color: "#2563eb",
                  addLabel: sdC(t, "addProduct", "Add Product"),
                  productLabel: sdC(t, "productsPlural", "products"),
                  itemLabel: sdC(t, "productLabel", "Product"),
                  rounded: true,
                  backNav: "shop",
                  backLabel: navC(t, "shop", "Shop"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-flowers" ? (
              <SellerFoodDashboard
                config={{
                  title: t("sellerDash.sellFlowers.title"),
                  subtitle: t("sellerDash.sellFlowers.subtitle"),
                  color: "#ec4899",
                  menuLabel: sdC(t, "menuInventory", "Inventory"),
                  addLabel: sdC(t, "addArrangement", "Add Arrangement"),
                  productLabel: sdC(t, "arrangementsPlural", "arrangements"),
                  itemLabel: sdC(t, "bouquet", "Bouquet"),
                  stat2: "142",
                  stat3: "380",
                  stat3Label: sdC(t, "itemsSold", "Items Sold"),
                  activeLabel: sdC(t, "activeSkus", "Active SKUs"),
                  providerFlag: "is_seller",
                  gateTitle: t("sellerDash.common.becomeFlorist"),
                  gateDesc: t("sellerDash.common.floristGateDesc"),
                  gateApplyLabel: t("sellerDash.common.registerStore"),
                  hideReservations: true,
                  rounded: true,
                  backNav: "floral",
                  backLabel: navC(t, "floral", "Floral"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-usedproducts" ? (
              <SellerEcommerceDashboard
                config={{
                  title: t("sellerDash.sellUsed.title"),
                  subtitle: t("sellerDash.sellUsed.subtitle"),
                  color: "#a78bfa",
                  addLabel: sdC(t, "addListing", "Add Listing"),
                  productLabel: sdC(t, "listingsPlural", "listings"),
                  itemLabel: sdC(t, "genericItem", "Item"),
                  stat2: "94",
                  stat3: "120",
                  stat3Label: sdC(t, "itemsSold", "Items Sold"),
                  providerFlag: "is_seller",
                  rounded: true,
                  backNav: "secondhand",
                  backLabel: navC(t, "secondhand", "2nd Hand"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-listdiscounts" ? (
              <SellerEcommerceDashboard
                config={{
                  title: t("sellerDash.listDiscounts.title"),
                  subtitle: t("sellerDash.listDiscounts.subtitle"),
                  color: "#f59e0b",
                  addLabel: sdC(t, "addDiscount", "Add Discount"),
                  productLabel: sdC(t, "discountListingsPlural", "discount listings"),
                  itemLabel: sdC(t, "discountedItem", "Discounted Item"),
                  providerFlag: "is_seller",
                  rounded: true,
                  backNav: "discounts",
                  backLabel: navC(t, "discounts", "Discounts"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-authors" ? (
              <SellerEcommerceDashboard
                config={{
                  title: t("sellerDash.authors.title"),
                  subtitle: t("sellerDash.authors.subtitle"),
                  color: "#10b981",
                  addLabel: sdC(t, "addBook", "Add Book"),
                  productLabel: sdC(t, "booksPlural", "books"),
                  itemLabel: sdC(t, "bookItem", "Book"),
                  stat3Label: sdC(t, "copiesSold", "Copies Sold"),
                  showChat: true,
                  providerFlag: "is_creator",
                  gateTitle: t("sellerDash.common.becomeAuthor"),
                  gateDesc: t("sellerDash.common.authorGateDesc"),
                  rounded: true,
                  backNav: "books",
                  backLabel: navC(t, "books", "Books"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-digproducts" ? (
              <SellerEcommerceDashboard
                config={{
                  title: t("sellerDash.digitalProducts.title"),
                  subtitle: t("sellerDash.digitalProducts.subtitle"),
                  color: "#6366f1",
                  addLabel: sdC(t, "addProduct", "Add Product"),
                  productLabel: sdC(t, "digitalProductsPlural", "digital products"),
                  itemLabel: sdC(t, "digitalProduct", "Digital Product"),
                  stat3Label: sdC(t, "downloads", "Downloads"),
                  showChat: true,
                  providerFlag: "is_creator",
                  rounded: true,
                  backNav: "digproducts",
                  backLabel: sdC(t, "backDigitalProducts", "Digital Products"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-food" ? (
              <SellerFoodDashboard
                config={{
                  title: t("sellerDash.sellFood.title"),
                  subtitle: t("sellerDash.sellFood.subtitle"),
                  color: "#f97316",
                  menuLabel: sdC(t, "tabMenu", "Menu"),
                  addLabel: sdC(t, "addItemBtn", "Add Item"),
                  itemLabel: sdC(t, "dish", "Dish"),
                  rounded: true,
                  backNav: "food",
                  backLabel: navC(t, "food", "Food"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-groceries" ? (
              <SellerFoodDashboard
                config={{
                  title: t("sellerDash.sellGroceries.title"),
                  subtitle: t("sellerDash.sellGroceries.subtitle"),
                  color: "#22c55e",
                  menuLabel: sdC(t, "menuInventory", "Inventory"),
                  addLabel: sdC(t, "addProduct", "Add Product"),
                  itemLabel: sdC(t, "groceryItem", "Grocery Item"),
                  activeLabel: sdC(t, "activeSkus", "Active SKUs"),
                  hideReservations: true,
                  rounded: true,
                  backNav: "groceries",
                  backLabel: navC(t, "groceries", "Groceries"),
                  gateTitle: t("sellerDash.common.registerGroceryStore"),
                  gateDesc: t("sellerDash.common.groceryGateDesc"),
                  gateApplyLabel: t("sellerDash.common.registerStore"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-catering" ? (
              <SellerFoodDashboard
                config={{
                  title: t("sellerDash.catering.title"),
                  subtitle: t("sellerDash.catering.subtitle"),
                  color: "#ef4444",
                  menuLabel: sdC(t, "tabMenu", "Menu"),
                  addLabel: sdC(t, "addPackage", "Add Package"),
                  itemLabel: sdC(t, "cateringPackage", "Catering Package"),
                  activeLabel: sdC(t, "activePackages", "Active Packages"),
                  hideReservations: true,
                  rounded: true,
                  backNav: "catering",
                  backLabel: navC(t, "catering", "Catering"),
                  gateTitle: "Register as a Caterer",
                  gateDesc: "List your catering packages and start receiving event bookings on Strug.",
                  gateApplyLabel: "Apply as Caterer",
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-restbookings" ? (
              <SellerFoodDashboard
                config={{
                  title: t("sellerDash.restaurantBookings.title"),
                  subtitle: t("sellerDash.restaurantBookings.subtitle"),
                  color: "#f59e0b",
                  menuLabel: sdC(t, "tabMenu", "Menu"),
                  addLabel: sdC(t, "addItemBtn", "Add Item"),
                  itemLabel: sdC(t, "dish", "Dish"),
                  activeLabel: sdC(t, "tablesLabel", "Tables"),
                  rounded: true,
                  backNav: "reservations",
                  backLabel: navC(t, "reservations", "Bookings"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-mealkit" ? (
              <SellerFoodDashboard
                config={{
                  title: t("sellerDash.mealKit.title"),
                  subtitle: t("sellerDash.mealKit.subtitle"),
                  color: "#84cc16",
                  menuLabel: sdC(t, "menuKits", "Kits"),
                  addLabel: sdC(t, "addKit", "Add Kit"),
                  itemLabel: sdC(t, "mealKit", "Meal Kit"),
                  activeLabel: sdC(t, "activeKits", "Active Kits"),
                  hideReservations: true,
                  rounded: true,
                  backNav: "food",
                  backLabel: navC(t, "food", "Food"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-insurance" ? (
              <QuoteProviderDashboard vertical="insurance" onNavigate={onNav} />
            ) : navId === "sd-mortgage" ? (
              <QuoteProviderDashboard vertical="mortgage" onNavigate={onNav} />
            ) : navId === "sd-host" ? (
              <SellerHostingDashboard
                config={{
                  title: t("sellerDash.host.title"),
                  subtitle: t("sellerDash.host.subtitle"),
                  vertical: "tempstay",
                  color: "#8b5cf6",
                  addLabel: sdC(t, "addListing", "Add Listing"),
                  listingLabel: sdC(t, "propertyLabel", "Property"),
                  listingEmoji: "\u{1F3E0}",
                  bookingLabel: sdC(t, "bookingsPlural", "bookings"),
                  listingCountLabel: sdC(t, "activeProperties", "Active Properties"),
                  bookingCountLabel: sdC(t, "totalBookings", "Total Bookings"),
                  rounded: true,
                  backNav: "tempstay",
                  backLabel: navC(t, "tempstay", "Temp Stay"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-vehicle" ? (
              <SellerHostingDashboard
                config={{
                  title: t("sellerDash.vehicle.title"),
                  subtitle: t("sellerDash.vehicle.subtitle"),
                  vertical: "vehicle",
                  color: "#f97316",
                  addLabel: sdC(t, "addVehicle", "Add Vehicle"),
                  listingLabel: sdC(t, "vehicleLabel", "Vehicle"),
                  listingEmoji: "\u{1F697}",
                  bookingLabel: sdC(t, "rentalsPlural", "rentals"),
                  listingCountLabel: sdC(t, "listedVehicles", "Listed Vehicles"),
                  bookingCountLabel: sdC(t, "totalRentals", "Total Rentals"),
                  providerFlag: "is_vehicle_provider",
                  gateTitle: t("sellerDash.common.becomeVehicleProvider"),
                  gateDesc: t("sellerDash.common.vehicleGateDesc"),
                  gateApplyLabel: t("sellerDash.common.applyAsProvider"),
                  rounded: true,
                  backNav: "vehicles",
                  backLabel: sdC(t, "backVehicles", "Vehicles"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-events" ? (
              <SellerHostingDashboard
                config={{
                  title: t("sellerDash.events.title"),
                  subtitle: t("sellerDash.events.subtitle"),
                  color: "#ec4899",
                  // Without this, listings default to the "tempstay" namespace and
                  // never appear on the Events page (which reads vertical: 'event').
                  vertical: "event",
                  addLabel: sdC(t, "addEvent", "Add Event"),
                  listingLabel: sdC(t, "eventLabel", "Event"),
                  listingEmoji: "\u{1F389}",
                  bookingLabel: sdC(t, "bookingsPlural", "bookings"),
                  listingCountLabel: sdC(t, "activeEvents", "Active Events"),
                  bookingCountLabel: sdC(t, "ticketsSold", "Tickets Sold"),
                  providerFlag: "is_event_host",
                  gateTitle: t("sellerDash.common.becomeEventOrganizer"),
                  gateDesc: t("sellerDash.common.eventGateDesc"),
                  gateApplyLabel: t("sellerDash.common.applyAsOrganizer"),
                  rounded: true,
                  backNav: "events",
                  backLabel: navC(t, "events", "Events"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-hotel" ? (
              <SellerHostingDashboard
                config={{
                  title: t("sellerDash.hotel.title"),
                  subtitle: t("sellerDash.hotel.subtitle"),
                  vertical: "hotel",
                  color: "#0ea5e9",
                  addLabel: sdC(t, "addRoom", "Add Room"),
                  listingLabel: sdC(t, "roomLabel", "Room"),
                  listingEmoji: "\u{1F6CC}",
                  bookingLabel: sdC(t, "reservationsPlural", "reservations"),
                  listingCountLabel: sdC(t, "totalRooms", "Total Rooms"),
                  bookingCountLabel: sdC(t, "reservationsPlural", "Reservations"),
                  providerFlag: "is_hotel_owner",
                  rounded: true,
                  backNav: "tempstay",
                  backLabel: navC(t, "tempstay", "Temp Stay"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-venue" || navId === "sd-venues" ? (
              <SellerHostingDashboard
                config={{
                  title: t("sellerDash.venue.title"),
                  subtitle: t("sellerDash.venue.subtitle"),
                  vertical: "venue",
                  color: "#a78bfa",
                  addLabel: sdC(t, "addVenue", "Add Venue"),
                  listingLabel: sdC(t, "venueLabel", "Venue"),
                  listingEmoji: "\u{1F3DB}",
                  bookingLabel: sdC(t, "bookingsPlural", "bookings"),
                  listingCountLabel: sdC(t, "activeVenues", "Active Venues"),
                  bookingCountLabel: sdC(t, "totalBookings", "Total Bookings"),
                  providerFlag: "is_venue_owner",
                  gateTitle: t("sellerDash.common.becomeVenueOwner"),
                  gateDesc: t("sellerDash.common.venueGateDesc"),
                  gateApplyLabel: t("sellerDash.common.applyAsOwner"),
                  rounded: true,
                  backNav: "venues",
                  backLabel: navC(t, "venues", "Venues"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-equipment" ? (
              <SellerHostingDashboard
                config={{
                  title: t("sellerDash.equipment.title"),
                  subtitle: t("sellerDash.equipment.subtitle"),
                  vertical: "equipment",
                  color: "#f59e0b",
                  addLabel: sdC(t, "addEquipment", "Add Equipment"),
                  listingLabel: sdC(t, "equipmentLabel", "Equipment"),
                  listingEmoji: "\u{1F527}",
                  bookingLabel: sdC(t, "rentalsPlural", "rentals"),
                  listingCountLabel: sdC(t, "listedItems", "Listed Items"),
                  bookingCountLabel: sdC(t, "totalRentals", "Total Rentals"),
                  providerFlag: "is_equipment_owner",
                  gateTitle: t("sellerDash.common.becomeEquipmentProvider"),
                  gateDesc: t("sellerDash.common.equipmentGateDesc"),
                  gateApplyLabel: t("sellerDash.common.applyAsProvider"),
                  rounded: true,
                  backNav: "equipment",
                  backLabel: navC(t, "equipment", "Equipment"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-realestate" ? (
              <SellerHostingDashboard
                config={{
                  title: t("sellerDash.realEstate.title"),
                  subtitle: t("sellerDash.realEstate.subtitle"),
                  color: "#10b981",
                  addLabel: sdC(t, "addProperty", "Add Property"),
                  listingLabel: sdC(t, "propertyLabel", "Property"),
                  listingEmoji: "\u{1F3E1}",
                  bookingLabel: sdC(t, "viewingsPlural", "viewings"),
                  listingCountLabel: sdC(t, "activeListings", "Active Listings"),
                  bookingCountLabel: sdC(t, "viewingsBooked", "Viewings Booked"),
                  providerFlag: "is_realtor",
                  gateTitle: t("sellerDash.common.becomeRealEstateAgent"),
                  gateDesc: t("sellerDash.common.realEstateGateDesc"),
                  gateApplyLabel: t("sellerDash.common.applyAsAgent"),
                  rounded: true,
                  backNav: "realestate",
                  backLabel: navC(t, "realestate", "Real Estate"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-precon" ? (
              <SellerHostingDashboard
                config={{
                  title: t("sellerDash.precon.title"),
                  subtitle: t("sellerDash.precon.subtitle"),
                  color: "#6366f1",
                  addLabel: sdC(t, "addDevelopment", "Add Development"),
                  listingLabel: sdC(t, "developmentLabel", "Development"),
                  listingEmoji: "\u{1F3D7}",
                  bookingLabel: sdC(t, "inquiriesPlural", "inquiries"),
                  listingCountLabel: sdC(t, "activeProjects", "Active Projects"),
                  bookingCountLabel: sdC(t, "totalInquiries", "Total Inquiries"),
                  providerFlag: "is_precon_developer",
                  gateTitle: t("sellerDash.common.becomeDeveloper"),
                  gateDesc: t("sellerDash.common.developerGateDesc"),
                  gateApplyLabel: t("sellerDash.common.applyAsDeveloper"),
                  rounded: true,
                  backNav: "preconstruct",
                  backLabel: navC(t, "preconstruct", "Construct"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-experiences" ? (
              <SellerHostingDashboard
                config={{
                  title: t("sellerDash.experiences.title"),
                  subtitle: t("sellerDash.experiences.subtitle"),
                  vertical: "experience",
                  color: "#ef4444",
                  addLabel: sdC(t, "addExperience", "Add Experience"),
                  listingLabel: sdC(t, "experienceLabel", "Experience"),
                  listingEmoji: "\u{1F3AD}",
                  bookingLabel: sdC(t, "bookingsPlural", "bookings"),
                  listingCountLabel: sdC(t, "activeExperiences", "Active Experiences"),
                  bookingCountLabel: sdC(t, "totalBookings", "Total Bookings"),
                  providerFlag: "is_experience_provider",
                  // Own gate copy — otherwise it falls back to "Become a Host".
                  gateTitle: sdC(t, "becomeExperienceHost", "Become an Experience Host"),
                  gateDesc: sdC(t, "experienceGateDesc", "Register to list experiences and receive bookings."),
                  gateApplyLabel: sdC(t, "applyAsExperienceHost", "Apply to Host Experiences"),
                  rounded: true,
                  backNav: "experiences",
                  backLabel: navC(t, "experiences", "Experiences"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-celebrity" ? (
              <SellerCelebrityDashboard onNavigate={onNav} />
            ) : navId === "sd-services" ? (
              <SellerServicesDashboard
                config={{
                  title: t("sellerDash.services.title"),
                  subtitle: t("sellerDash.services.subtitle"),
                  color: "#06b6d4",
                  serviceLabel: sdC(t, "serviceLabelGeneric", "Service"),
                  serviceEmoji: "\u{2699}\uFE0F",
                  addLabel: sdC(t, "addService", "Add Service"),
                  rounded: true,
                  backNav: "ondemand",
                  backLabel: navC(t, "ondemand", "Work"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-instructor" ? (
              <SellerServicesDashboard
                config={{
                  title: t("sellerDash.instructor.title"),
                  subtitle: t("sellerDash.instructor.subtitle"),
                  color: "#8b5cf6",
                  serviceLabel: sdC(t, "lessonLabel", "Lesson"),
                  serviceEmoji: "\u{1F4DA}",
                  addLabel: sdC(t, "addLesson", "Add Lesson"),
                  stat1Label: sdC(t, "totalLessons", "Total Lessons"),
                  providerFlag: "is_instructor",
                  rounded: true,
                  backNav: "learn",
                  backLabel: navC(t, "learn", "Learn"),
                  useLessonOrders: true,
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-proservices" ? (
              <SellerServicesDashboard
                config={{
                  title: t("sellerDash.professionals.title"),
                  subtitle: t("sellerDash.professionals.subtitle"),
                  color: "#0ea5e9",
                  serviceLabel: sdC(t, "serviceLabelGeneric", "Service"),
                  serviceEmoji: "\u{1F4BC}",
                  addLabel: sdC(t, "addService", "Add Service"),
                  showChat: true,
                  providerFlag: "is_professional",
                  rounded: true,
                  backNav: "proservices",
                  backLabel: sdC(t, "backProServices", "Pro Services"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-freelancer" ? (
              <SellerServicesDashboard
                config={{
                  title: t("sellerDash.freelancer.title"),
                  subtitle: t("sellerDash.freelancer.subtitle"),
                  color: "#10b981",
                  serviceLabel: sdC(t, "gigLabel", "Gig"),
                  serviceEmoji: "\u{1F4BB}",
                  addLabel: sdC(t, "Create Service", "Create Service"),
                  stat1Label: sdC(t, "totalGigs", "Total Gigs"),
                  showChat: true,
                  providerFlag: "is_freelancer",
                  rounded: true,
                  backNav: "digservices",
                  backLabel: sdC(t, "backDigitalServices", "Digital Services"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-artist" ? (
              <SellerServicesDashboard
                config={{
                  title: t("sellerDash.artist.title"),
                  subtitle: t("sellerDash.artist.subtitle"),
                  color: "#ec4899",
                  serviceLabel: sdC(t, "commissionLabel", "Commission"),
                  serviceEmoji: "\u{1F3A8}",
                  addLabel: sdC(t, "addListing", "Add Listing"),
                  stat1Label: sdC(t, "listingsStat", "Listings"),
                  showChat: true,
                  providerFlag: "is_artist",
                  rounded: true,
                  backNav: "artists",
                  backLabel: navC(t, "artists", "Artists"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-doctors" ? (
              <SellerServicesDashboard
                config={{
                  title: t("sellerDash.doctors.title"),
                  subtitle: t("sellerDash.doctors.subtitle"),
                  color: "#22c55e",
                  serviceLabel: sdC(t, "appointmentLabel", "Appointment"),
                  serviceEmoji: "\u{1FA7A}",
                  addLabel: sdC(t, "addService", "Add Service"),
                  stat1Label: sdC(t, "serviceTypes", "Service Types"),
                  providerFlag: "is_doctor",
                  portalKey: "sd-doctors",
                  gateTitle: t("sellerDash.common.becomeMedicalProvider"),
                  gateDesc: t("sellerDash.common.medicalGateDesc"),
                  gateApplyLabel: t("sellerDash.common.applyAsProvider"),
                  rounded: true,
                  backNav: "medical",
                  backLabel: navC(t, "medical", "Medical"),
                  useAppointments: false,
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-wedding" ? (
              <SellerWeddingDashboard onNavigate={onNav} />
            ) : navId === "sd-creator" ? (
              <SellerCreatorDashboard
                config={{
                  title: t("sellerDash.creator.title", { defaultValue: "Creator Studio" }),
                  subtitle: t("sellerDash.creator.subtitle", { defaultValue: "Grow your channel, track your audience, and manage your content" }),
                  color: "#ef4444",
                  gateTitle: "Start your channel",
                  gateBenefits: [
                    "Upload videos & shorts to your own channel",
                    "Pro analytics — views, watch time, retention",
                    "Build subscribers and grow your audience",
                  ],
                  followersLabel: sdC(t, "subscribers", "Subscribers"),
                  viewsLabel: sdC(t, "totalViews", "Total Views"),
                  contentLabel: sdC(t, "videoLabel", "Video"),
                  contentEmoji: "\u{1F3AC}",
                  addLabel: sdC(t, "uploadVideoTitle", "Upload Video"),
                  rounded: true,
                  backNav: "videos",
                  backLabel: navC(t, "videos", "Videos"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-streamer" ? (
              <SellerStreamDashboard
                config={{
                  title: t("sellerDash.stream.title"),
                  subtitle: t("sellerDash.stream.subtitle"),
                  color: "#9333ea",
                  backNav: "live",
                  backLabel: navC(t, "live", "Live"),
                }}
                onNavigate={onNav}
              />
            ) : navId === "sd-decor" ? (
              <SellerDecorDashboard onNavigate={onNav} />
            ) : navId === "sd-automotive" ? (
              <SellerAutomotiveDashboard onNavigate={onNav} />
            ) : navId === "sd-influencer" ? (
              <SellerInfluencerDashboard onNavigate={onNav} />
            ) : navId === "sd-jobs" ? (
              <SellerJobsDashboard onNavigate={onNav} />
            ) : navId === "ai" ? (
              <StrugAIPage
                onClose={() => onNav("home")}
                isMobile={isMobile}
              />
            ) : navId === "home" ? (
              <NavHubPage
                onNavigate={onNav}
                onOpenSpotlight={() => setSpotlightOpen(true)}
                navItems={VISIBLE_NAV_ITEMS}
                pageColors={PAGE_COLORS}
                recentItems={recentNavItems}
              />
            ) : navId === "become" ? (
              <BecomeHub onNavigate={onNav} />
            ) : navId === "provider" ? (
              <SellerHub onNavigate={onNav} pageColors={PAGE_COLORS} />
            ) : NAV_ITEMS.some((n) => n.id === navId) ? (
              <PagePlaceholder
                id={navId}
                label={t(`nav.${navId}`, {
                  defaultValue:
                    NAV_ITEMS.find((n) => n.id === navId)?.label ?? navId,
                })}
              />
            ) : (
              <NotFoundPage onGoHome={() => onNav("home")} />
            )
  );


  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        background: "var(--color-bg)",
        overflow: "hidden",
        fontFamily: "'DM Sans', sans-serif",
        position: "relative",
      }}
    >
      {/* First tab stop: lets keyboard users jump past the sidebar straight to the page.
          Uses onClick focus rather than hash navigation so the app's custom router is untouched. */}
      <a
        href="#main"
        className="skip-to-content"
        onClick={(e) => {
          e.preventDefault();
          const m = document.getElementById("main");
          if (m) { m.focus(); m.scrollIntoView(); }
        }}
      >
        Skip to content
      </a>
      {previewMode && (
        <div ref={previewFooterRef} data-preview-allow style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap", padding: "12px 20px", background: "rgba(10,10,14,0.96)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(37,99,235,0.35)", boxShadow: "0 -8px 30px rgba(0,0,0,0.5)" }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.75)" }}>You're previewing Strug. Sign in to post, interact, and use every feature.</span>
          <button data-preview-allow onClick={requireAuth} style={{ background: "#2563eb", border: "none", borderRadius: 10, padding: "9px 22px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Sign in</button>
        </div>
      )}
      {contextNavReturn && contextNavReturn.id && contextNavReturn.id !== activeNav && activeNav !== "messages" && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 3500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: "10px 16px",
            background: "rgba(10,10,14,0.94)",
            backdropFilter: "blur(10px)",
            borderBottom: "1px solid rgba(249,115,22,0.35)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              const target = peekNavReturn() || contextNavReturn;
              clearNavReturn();
              setContextNavReturn(null);
              if (target?.id) navigateTo(target.id);
            }}
            style={{
              background: "rgba(249,115,22,0.15)",
              border: "1px solid rgba(249,115,22,0.45)",
              borderRadius: 10,
              padding: "8px 16px",
              color: "#fb923c",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ← {contextNavReturn.label || "Back"}
          </button>
          <button
            type="button"
            onClick={() => {
              clearNavReturn();
              setContextNavReturn(null);
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.45)",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      <style>{`
        /* #421: the provider hub is the money-making entry point but reads as just another
           sidebar row, so first-time users walk past it. Pulse it until they have actually
           opened it once — a permanent glow would just become noise. */
        @keyframes providerPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(47,158,68,0.42), inset 0 0 12px -6px rgba(47,158,68,0.5); }
          50%     { box-shadow: 0 0 14px 3px rgba(47,158,68,0.55), inset 0 0 16px -4px rgba(47,158,68,0.75); }
        }
        .provider-glow { animation: providerPulse 2.1s ease-in-out infinite; border-radius: 10px; }
        .provider-glow span { color: #2f9e44 !important; font-weight: 700 !important; }
        @media (prefers-reduced-motion: reduce) {
          .provider-glow { animation: none; box-shadow: 0 0 10px 2px rgba(47,158,68,0.45); }
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        button { cursor: pointer; }
        /* Hide native scrollbars globally; a scroll container that wants a visible bar opts in
           via the .styled-scrollbar class (defined just below). This pair was briefly flipped to
           a visible global scrollbar-width:thin + webkit width:10px, which painted a NATIVE bar on
           every overflow container ON TOP OF the custom styled bar on the main feed/content
           scrollers -- i.e. the "two scrollbars" regression. Restoring the hide-all default leaves
           exactly one bar (the styled one) wherever a container opts in. Horizontal chip-rows
           (nav, .sidebar-nav, .ecom-cat-scroll, ...) already hide via their own rules below. */
        ::-webkit-scrollbar { display: none; }
        * { scrollbar-width: none; }
        /* Slightly slimmer variant for explicitly opted-in containers */
        .styled-scrollbar { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent; }
        .styled-scrollbar::-webkit-scrollbar { display: block; width: 8px; height: 8px; }
        .styled-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .styled-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        .styled-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.28); }
        @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideOutRight { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
        @keyframes chatToastIn { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pkPing {
          0%        { transform: scale(1);   opacity: 0.7; }
          80%, 100% { transform: scale(2.6); opacity: 0; }
        }
        @keyframes storyProgress {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes fadeOut {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(-10px); }
        }
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-4px); }
        }
        @keyframes moreFlyoutChevron {
          0%, 100% { transform: translateY(0); opacity: 0.38; }
          50%       { transform: translateY(5px); opacity: 0.75; }
        }
        @keyframes flyoutIn {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes aiPanelIn {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes shimmerSweep {
          from { transform: translateX(-200%); }
          to   { transform: translateX(200%); }
        }
        @keyframes textShimmer {
          0%   { background-position: -300% center; }
          100% { background-position: 300% center; }
        }
        @keyframes pulseLive {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.6); }
          60%      { box-shadow: 0 0 0 5px rgba(220,38,38,0); }
        }
        @keyframes pageEnter {
          from { opacity: 0; transform: translateY(10px) scale(0.99); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes scrollBounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50%      { transform: translateY(3px); opacity: 0.8; }
        }
        @keyframes orb1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(70px, 50px) scale(1.06); }
          66%      { transform: translate(-40px, 80px) scale(0.94); }
        }
        @keyframes orb2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(-60px, -40px) scale(1.1); }
          66%      { transform: translate(50px, -60px) scale(0.9); }
        }
        @keyframes orb3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(40px, -50px) scale(1.08); }
        }
        @keyframes orb4 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          40%      { transform: translate(-30px, 60px) scale(0.95); }
          80%      { transform: translate(50px, 20px) scale(1.05); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        @property --a {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes rotateBorder {
          to { --a: 360deg; }
        }
        .split-card {
          transition: transform 0.16s ease, filter 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
        }
        .split-card:hover {
          transform: translateY(-3px);
          filter: brightness(1.16);
          box-shadow: 0 10px 26px rgba(0,0,0,0.5);
        }
        .split-card:active { transform: translateY(-1px); }
        .split-search {
          width: 100%;
          height: 34px;
          box-sizing: border-box;
          padding: 0 12px;
          border-radius: 10px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: #fff;
          font-size: 13px;
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: border-color 0.16s ease, background 0.16s ease;
        }
        .split-search::placeholder { color: rgba(255,255,255,0.35); }
        .split-search:focus {
          border-color: rgba(255,255,255,0.28);
          background: rgba(255,255,255,0.09);
        }
        .split-library::-webkit-scrollbar { width: 8px; }
        .split-library::-webkit-scrollbar-track { background: transparent; }
        .split-library::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.14);
          border-radius: 4px;
        }
        .split-library::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.26); }
        .search-wrap {
          position: relative;
          border-radius: 14px;
        }
        .search-wrap::before {
          content: '';
          position: absolute;
          inset: -1.5px;
          padding: 1.5px;
          border-radius: 15px;
          background: conic-gradient(
            from var(--a),
            rgba(96,165,250,0) 0deg,
            rgba(96,165,250,0) 84deg,
            rgba(96,165,250,0.26) 90deg,
            rgba(96,165,250,0) 96deg,
            rgba(96,165,250,0) 264deg,
            rgba(96,165,250,0.26) 270deg,
            rgba(96,165,250,0) 276deg,
            rgba(96,165,250,0) 360deg
          );
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          animation: rotateBorder 10s linear infinite;
          z-index: 0;
        }
        .search-inner {
          position: relative;
          z-index: 1;
          border-radius: 13px;
          overflow: hidden;
          transition: box-shadow 0.2s ease;
        }
        .search-wrap:hover::before { filter: brightness(2.8); }
        .search-wrap:hover .search-inner {
          box-shadow: inset 0 0 0 1px rgba(96,165,250,0.45),
                      0 0 28px rgba(37,99,235,0.3);
        }
        .search-wrap:active::before { filter: brightness(4.5); animation-play-state: paused; }
        .search-wrap:active .search-inner {
          box-shadow: inset 0 0 0 2px rgba(96,165,250,0.7),
                      0 0 48px rgba(37,99,235,0.55),
                      0 0 80px rgba(96,165,250,0.15);
          background: rgba(18,16,28,0.95) !important;
        }
        .od-search-wrap { position: relative; border-radius: 14px; }
        .od-search-wrap::before {
          content: ''; position: absolute; inset: -1.5px; border-radius: 15px;
          padding: 1.5px;
          background: conic-gradient(from var(--a), rgba(96,165,250,0) 0deg, rgba(96,165,250,0) 84deg, rgba(96,165,250,0.26) 90deg, rgba(96,165,250,0) 96deg, rgba(96,165,250,0) 264deg, rgba(96,165,250,0.26) 270deg, rgba(96,165,250,0) 276deg, rgba(96,165,250,0) 360deg);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); mask-composite: exclude;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor;
          animation: rotateBorder 10s linear infinite; z-index: 0; pointer-events: none;
        }
        .od-search-inner { position: relative; z-index: 1; border-radius: 13px; overflow: hidden; }
        .od-search-inner input,
        .od-search-input {
          outline: none;
          border: none;
          box-shadow: none;
        }
        .od-search-inner input:focus,
        .od-search-inner input:focus-visible,
        .od-search-inner input:active,
        .od-search-input:focus,
        .od-search-input:focus-visible,
        .od-search-input:active {
          outline: none !important;
          border: none !important;
          box-shadow: none !important;
        }
        .od-search-wrap:focus-within .od-search-inner {
          box-shadow: none;
        }
        nav::-webkit-scrollbar { display: none; }
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(1.5); }
        }
        @keyframes colScrollUp {
          0%   { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        @keyframes colScrollDown {
          0%   { transform: translateY(-50%); }
          100% { transform: translateY(0); }
        }
        .pin-col-up   { animation: colScrollUp   var(--spd, 30s) linear infinite; }
        .pin-col-down { animation: colScrollDown var(--spd, 35s) linear infinite; }
        .pin-col-up:hover, .pin-col-down:hover { animation-play-state: paused; }
        @keyframes shimmer {
          0%   { background-position: -600px 0; }
          100% { background-position:  600px 0; }
        }
        /* Sidebar: keep the nav rail scrollable (wheel/trackpad/drag) but never show a
           visible scrollbar, on any breakpoint — matches the global no-scrollbar look. */
        .sidebar-nav::-webkit-scrollbar { display: none; }
        .sidebar-nav { scrollbar-width: none; }
        /* ── Responsive overrides ── */
        @media (max-width: 767px) {
          /* Sidebar clearance: removed on mobile (sidebar is hidden) */
          /* Grid overrides for cards that use auto-fill */
          .resp-grid { grid-template-columns: repeat(2,1fr) !important; }
          /* Typography scale-down */
          h1 { font-size: clamp(22px,6vw,42px) !important; }
          /* Watch page title must stay YouTube-sized; the rule above is for landing heroes. */
          h1.watch-video-title {
            font-size: 18px !important;
            font-weight: 600 !important;
            line-height: 1.25 !important;
          }
          /* Prevent horizontal scroll on narrow content */
          body { overflow-x: hidden; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .resp-grid { grid-template-columns: repeat(3,1fr) !important; }
        }
        .skel {
          background: linear-gradient(90deg,
            rgba(255,255,255,0.04) 0%,
            rgba(255,255,255,0.09) 50%,
            rgba(255,255,255,0.04) 100%);
          background-size: 600px 100%;
          animation: shimmer 1.5s ease-in-out infinite;
          border-radius: 8px;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        @keyframes cartShake {
          0%, 100% { transform: rotate(0deg) scale(1); }
          20%      { transform: rotate(-8deg) scale(1.08); }
          40%      { transform: rotate(8deg)  scale(1.08); }
          60%      { transform: rotate(-5deg) scale(1.04); }
          80%      { transform: rotate(5deg)  scale(1.04); }
        }
        @keyframes cardSlideNext {
          from { opacity: 0; transform: translateY(32px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cardSlidePrev {
          from { opacity: 0; transform: translateY(-32px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sidebarChevronBounce {
          0%, 100% { transform: translateY(0); opacity: 0.9; }
          50% { transform: translateY(4px); opacity: 1; }
        }
        @keyframes sidebarChevronBounce2 {
          0%, 100% { transform: translateY(0); opacity: 0.45; }
          50% { transform: translateY(4px); opacity: 0.7; }
        }
        @keyframes sidebarChevronBounceUp {
          0%, 100% { transform: translateY(0); opacity: 0.9; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes socialLikePop {
          0% { transform: scale(1); }
          30% { transform: scale(1.45); }
          60% { transform: scale(0.88); }
          100% { transform: scale(1); }
        }
        @keyframes socialSavePop {
          0% { transform: scale(1) translateY(0); }
          35% { transform: scale(1.38) translateY(-3px); }
          65% { transform: scale(0.9) translateY(0); }
          100% { transform: scale(1); }
        }
        @keyframes socialRepostSpin {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(200deg) scale(1.2); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes socialTap {
          0% { transform: scale(1); }
          35% { transform: scale(0.78); }
          100% { transform: scale(1); }
        }
        @keyframes heartBurstCenter {
          0%   { transform: scale(0); opacity: 0; }
          25%  { transform: scale(1.35); opacity: 1; }
          55%  { transform: scale(0.88); opacity: 1; }
          75%  { transform: scale(1.06); opacity: 1; }
          100% { transform: scale(0.65); opacity: 0; }
        }
        @keyframes heartBurstRipple {
          0%   { transform: scale(0.2); opacity: 0.7; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes heartBurstFloat {
          0%   { transform: translate(-50%,-50%) scale(0); opacity: 0; }
          20%  { opacity: 1; }
          60%  { transform: translate(-50%, calc(-50% - 30px)) scale(1.1); opacity: 0.9; }
          100% { transform: translate(-50%, calc(-50% - 65px)) scale(0.5); opacity: 0; }
        }
        .ecom-cat-scroll::-webkit-scrollbar { display: none; }
        .ecom-cat-scroll { scrollbar-width: none; }
        .seller-tab-scroll::-webkit-scrollbar { display: none; }
        .seller-tab-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .videos-scroll::-webkit-scrollbar { display: none; }
        .videos-scroll { scrollbar-width: none; }
        @keyframes hintScrollRight {
          0%, 100% { transform: translateX(0); opacity: 0.7; }
          50% { transform: translateX(5px); opacity: 1; }
        }
        @keyframes hintScrollLeft {
          0%, 100% { transform: translateX(0); opacity: 0.7; }
          50% { transform: translateX(-5px); opacity: 1; }
        }
        @keyframes logoSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes logoSpinReverse {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
        @keyframes spotlightIn {
          from { opacity: 0; transform: translateY(-10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes spotlightBgIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        /* ── Google Places autocomplete dark theme ── */
        .pac-container {
          background: #1a1b23;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
          margin-top: 6px;
          font-family: 'DM Sans', sans-serif;
          overflow: hidden;
          z-index: 1000000 !important;
        }
        .pac-container::after { display: none !important; }
        .pac-item {
          background: transparent;
          border-top: 1px solid rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.85);
          padding: 10px 14px;
          cursor: pointer;
          font-size: 14px;
          line-height: 1.4;
        }
        .pac-item:first-child { border-top: none; }
        .pac-item:hover, .pac-item-selected {
          background: rgba(255,255,255,0.07);
        }
        .pac-item-query {
          color: #fff;
          font-size: 14px;
          font-weight: 600;
        }
        .pac-matched { color: #60a5fa; }
        .pac-icon {
          filter: invert(1) opacity(0.4);
          margin-right: 10px;
        }
        .pac-logo::after { display: none !important; }
        /* .scroll-area is the main vertical content scroller on many pages — it must keep a
           visible scrollbar (it used to hide it, which is what made pages feel un-navigable),
           so it inherits the global thin themed bar above rather than opting out. */
      `}</style>

      {!is404 && (
        <aside
          className="bg-surface-glass border border-border"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            bottom: 52,
            width: 72,
            backdropFilter: "blur(8px)",
            borderRadius: 16,
            display: (isMobile || immersiveMedia) ? "none" : "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "10px 6px",
            zIndex: 60,
            boxShadow: "4px 0 24px var(--color-shadow)",
          }}
        >
          {/* Logo badge intentionally keeps its own dark gradient in both themes — a small
              fixed brand mark, not a themed surface (same reasoning as Hub.jsx's hero photo). */}
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              background: logoSearchMode
                ? `${pageAccent}22`
                : "linear-gradient(145deg, #252530, #18181f)",
              border: logoSearchMode
                ? `1.5px solid ${pageAccent}80`
                : "1.5px solid rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 10,
              flexShrink: 0,
              boxShadow: "0 2px 10px rgba(0,0,0,0.6)",
              cursor: "pointer",
              color: "#fff",
              animation: logoSpinning
                ? "logoSpin 0.38s ease-in-out"
                : logoSpinReverse
                  ? "logoSpinReverse 0.38s ease-in-out"
                  : "none",
              transition: "background 0.2s, border-color 0.2s",
            }}
            onClick={() => {
              if (spotlightOpen) {
                setSpotlightOpen(false);
                setLogoSpinReverse(true);
                setTimeout(() => setLogoSearchMode(false), 175);
                setTimeout(() => setLogoSpinReverse(false), 380);
                return;
              }
              if (logoHoverActive) {
                setLogoHoverActive(false);
                setSpotlightOpen(true);
                return;
              }
              setLogoSpinning(true);
              setTimeout(() => setLogoSearchMode(true), 175);
              setTimeout(() => {
                setLogoSpinning(false);
                setSpotlightOpen(true);
              }, 380);
            }}
            onMouseEnter={() => {
              if (
                !logoSpinning &&
                !logoSpinReverse &&
                !spotlightOpen &&
                !logoSearchMode
              ) {
                setLogoSpinning(true);
                logoHoverTimers.current.push(
                  setTimeout(() => {
                    setLogoSearchMode(true);
                    setLogoHoverActive(true);
                  }, 175),
                );
                logoHoverTimers.current.push(
                  setTimeout(() => setLogoSpinning(false), 380),
                );
              }
            }}
            onMouseLeave={() => {
              logoHoverTimers.current.forEach(clearTimeout);
              logoHoverTimers.current = [];
              if (logoHoverActive && !spotlightOpen) {
                setLogoHoverActive(false);
                setLogoSpinReverse(true);
                setTimeout(() => setLogoSearchMode(false), 175);
                setTimeout(() => setLogoSpinReverse(false), 380);
              } else if (logoSpinning && !spotlightOpen) {
                setLogoSpinning(false);
              }
            }}
          >
            <div
              style={{
                position: "relative",
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: logoSearchMode ? 0 : 1,
                  transition: "opacity 0.22s ease",
                }}
              >
                <StrugLogo s={28} />
              </div>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: logoSearchMode ? 1 : 0,
                  transition: "opacity 0.22s ease",
                  color: pageAccent,
                }}
              >
                <SearchIcon s={18} />
              </div>
            </div>
          </div>

          {sidebarScrolledDown && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginTop: 2,
                marginBottom: 2,
                pointerEvents: "none",
              }}
            >
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke={pageAccent}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  animation: "sidebarChevronBounceUp 1s ease-in-out infinite",
                  filter: `drop-shadow(0 0 5px ${pageAccent})`,
                }}
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </div>
          )}

          <SidebarScrollNav
            items={SIDEBAR_ITEMS.map((item) =>
              item.id === "messages" ? { ...item, unreadCount: chatUnreadTotal } : item,
            )}
            pinnedIds={recentVerticals}
            activeNav={activeNav}
            setActiveNav={navigateTo}
            externalNavRef={sidebarNavRef}
            showFade={sidebarScrollHint}
            showFadeTop={sidebarScrolledDown}
            scrollHintColor={pageAccent}
          />

          {/* ARCHIVED 2026-06-25: the desktop sidebar "More" button is no longer needed —
              its flyout (MoreFlyout) was already emptied (MORE_FLYOUT_ITEMS = []) and the
              provider/become hubs now own the "Become a Provider" entry points. Kept here
              (commented) for possible future use. The MOBILE bottom-nav "More" (MobileNavSheet)
              is untouched, and MORE_ITEMS / showMore / MoreFlyout all remain wired so is404
              nav recognition for sd-* dashboards is unaffected. To restore, uncomment.
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              width: "100%",
              paddingBottom: 2,
            }}
          >
            <button
              onClick={() => setShowMore((v) => !v)}
              style={{
                width: "100%",
                padding: "8px 4px",
                borderRadius: 10,
                background: showMore ? "rgba(37,99,235,0.18)" : "transparent",
                border: "none",
                color: showMore ? "#60a5fa" : "rgba(255,255,255,0.55)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!showMore) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.color = "rgba(255,255,255,0.8)";
                }
              }}
              onMouseLeave={(e) => {
                if (!showMore) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "rgba(255,255,255,0.45)";
                }
              }}
            >
              <MoreIcon s={20} />
              <MoreLabel />
            </button>
          </div>
          */}

          {!isMobile && (
            <div style={{ display: "flex", justifyContent: "center", width: "100%", paddingBottom: 2 }}>
              <button
                title={splitMode ? "Exit split view" : "Split view"}
                onClick={() => { setSplitMode(v => { if (!v) setRightNav(null); return !v; }); }}
                style={{
                  width: "100%",
                  padding: "8px 4px",
                  borderRadius: 10,
                  background: splitMode ? "rgba(37,99,235,0.18)" : "transparent",
                  border: "none",
                  color: splitMode ? "#60a5fa" : "var(--color-text-secondary)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!splitMode) {
                    e.currentTarget.style.background = "var(--color-border)";
                    e.currentTarget.style.color = "var(--color-text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!splitMode) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--color-text-secondary)";
                  }
                }}
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="8" height="18" rx="1"/>
                  <rect x="13" y="3" width="8" height="18" rx="1"/>
                </svg>
                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.2 }}>Split</span>
              </button>
            </div>
          )}

          {/* Epic 10: global notification bell. Pinned here — between the split toggle and the
              avatar — rather than inside SidebarScrollNav, because that list scrolls and an
              unread badge that can scroll out of view is worthless. */}
          {isAuthenticated() && (
            <div style={{ width: "100%", padding: "0 6px", marginBottom: 2 }}>
              <NotificationBell
                variant="rail"
                unread={notifs.unread}
                open={notifs.open}
                onClick={notifs.toggle}
                label={t("nav.notifications", { defaultValue: "Alerts" })}
              />
            </div>
          )}

          <div
            style={{
              position: "relative",
              display: "flex",
              justifyContent: "center",
              width: "100%",
              paddingBottom: 4,
            }}
          >
            {isAuthenticated() ? (
              <button
                className="text-text-primary"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: showProfileMenu
                    ? "rgba(37,99,235,0.25)"
                    : "var(--color-surface-raised)",
                  border: showProfileMenu
                    ? "1.5px solid rgba(37,99,235,0.5)"
                    : "1.5px solid var(--color-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  overflow: "hidden",
                  transition: "background 0.15s, border-color 0.15s",
                  cursor: "pointer",
                }}
                onClick={() => setShowProfileMenu((v) => !v)}
                onMouseEnter={(e) => {
                  if (!showProfileMenu)
                    e.currentTarget.style.background = "var(--color-border)";
                }}
                onMouseLeave={(e) => {
                  if (!showProfileMenu)
                    e.currentTarget.style.background = "var(--color-surface-raised)";
                }}
              >
                {/* #457: see above — a 404'd photo must fall back to the icon, not an empty disc. */}
                <SafeImage
                  src={currentUser?.profile_pic_url}
                  alt=""
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                  fallback={<ProfileIcon s={22} />}
                />
              </button>
            ) : (
              <button
                onClick={() => {
                  if (devLocalLogin) setCurrentUser(null);
                  else window.location.href = LOGIN_URL;
                }}
                style={{
                  width: "100%",
                  padding: "8px 4px",
                  borderRadius: 10,
                  background: "rgba(37,99,235,0.14)",
                  border: "none",
                  color: "#60a5fa",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(37,99,235,0.26)";
                  e.currentTarget.style.color = "#93c5fd";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(37,99,235,0.14)";
                  e.currentTarget.style.color = "#60a5fa";
                }}
              >
                <ProfileIcon s={20} />
                <SignInLabel />
              </button>
            )}
          </div>
        </aside>
      )}

      {isMobile && !is404 && activeNav === "home" && (
        <div
          style={{
            position: "fixed",
            top: 12,
            left: 12,
            display: "flex",
            gap: 6,
            zIndex: 55,
          }}
        >
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? t("app.exitFullscreen") : t("app.enterFullscreen")}
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              padding: 0,
              background: "rgba(17,18,26,0.85)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {isFullscreen ? (
              <FullscreenExitIcon s={14} />
            ) : (
              <FullscreenEnterIcon s={14} />
            )}
          </button>
          <button
            onClick={() => setLangPickerOpen((v) => !v)}
            title={t("app.selectLanguage")}
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              padding: 0,
              background: langPickerOpen
                ? "rgba(37,99,235,0.25)"
                : "rgba(17,18,26,0.85)",
              backdropFilter: "blur(12px)",
              border: langPickerOpen
                ? "1px solid rgba(37,99,235,0.45)"
                : "1px solid rgba(255,255,255,0.12)",
              color: langPickerOpen ? "#60a5fa" : "rgba(255,255,255,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
              fontSize: 15,
              lineHeight: 1,
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          </button>
          <button
            onClick={() => { setShowThemePicker(false); setShowBugReport((v) => !v); }}
            title={t("app.reportProblem")}
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              padding: 0,
              background: showBugReport ? "rgba(37,99,235,0.25)" : "rgba(17,18,26,0.85)",
              backdropFilter: "blur(12px)",
              border: showBugReport ? "1px solid rgba(37,99,235,0.45)" : "1px solid rgba(255,255,255,0.12)",
              color: showBugReport ? "#60a5fa" : "rgba(255,255,255,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <BugIcon s={15} />
          </button>
        </div>
      )}
      {!isMobile && !is404 && (
        <div
          style={{
            position: "fixed",
            bottom: 14,
            left: 12,
            width: 72,
            display: "flex",
            justifyContent: "center",
            gap: 6,
            zIndex: 50,
          }}
        >
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? t("app.exitFullscreen") : t("app.enterFullscreen")}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              padding: 0,
              border: "none",
              background: "rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.14)";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.07)";
              e.currentTarget.style.color = "rgba(255,255,255,0.5)";
            }}
          >
            {isFullscreen ? (
              <FullscreenExitIcon s={13} />
            ) : (
              <FullscreenEnterIcon s={13} />
            )}
          </button>
          <button
            onClick={() => setLangPickerOpen((v) => !v)}
            title={t("app.selectLanguage")}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              padding: 0,
              border: "none",
              background: langPickerOpen
                ? "rgba(37,99,235,0.25)"
                : "rgba(255,255,255,0.07)",
              color: langPickerOpen ? "#60a5fa" : "rgba(255,255,255,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
              fontSize: 13,
              lineHeight: 1,
            }}
            onMouseEnter={(e) => {
              if (!langPickerOpen) {
                e.currentTarget.style.background = "rgba(255,255,255,0.14)";
                e.currentTarget.style.color = "#fff";              }
            }}
            onMouseLeave={(e) => {
              if (!langPickerOpen) {
                e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                e.currentTarget.style.color = "rgba(255,255,255,0.5)";
              }
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          </button>
          <button
            onClick={() => { setShowThemePicker(false); setShowBugReport((v) => !v); }}
            title={t("app.reportProblem")}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              padding: 0,
              border: "none",
              background: showBugReport ? "rgba(37,99,235,0.25)" : "rgba(255,255,255,0.07)",
              color: showBugReport ? "#60a5fa" : "rgba(255,255,255,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!showBugReport) {
                e.currentTarget.style.background = "rgba(255,255,255,0.14)";
                e.currentTarget.style.color = "#fff";
              }
            }}
            onMouseLeave={(e) => {
              if (!showBugReport) {
                e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                e.currentTarget.style.color = "rgba(255,255,255,0.5)";
              }
            }}
          >
            <BugIcon s={13} />
          </button>
        </div>
      )}

      {showProfileMenu && (
        <ProfileFlyout
          user={currentUser}
          onClose={() => setShowProfileMenu(false)}
          onNavigate={(nav) => {
            navigateTo(nav);
            setShowProfileMenu(false);
          }}
          onTour={() => setShowTour(true)}
        />
      )}
      {showMore && (
        <MoreFlyout
          onClose={() => setShowMore(false)}
          onNavigate={(nav) => {
            navigateTo(nav);
            setShowMore(false);
          }}
        />
      )}
      {langPickerOpen && (
        <LanguagePicker onClose={() => setLangPickerOpen(false)} />
      )}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={VISIBLE_NAV_ITEMS}
        onNavigate={navigateTo}
        labelFor={(it) => t(`nav.${it.id}`, { defaultValue: it.label })}
      />
      <ShortcutsHelp open={shortcutsHelpOpen} onClose={() => setShortcutsHelpOpen(false)} />
      {/* Global background-upload progress (#382/#383) — persists across navigation. */}
      <UploadProgressWidget />
      {langPromptOpen && (
        <LanguagePrompt
          suggestedCode={langPromptSuggestion.code}
          countryName={langPromptSuggestion.countryName}
          onChooseOther={() => setLangPickerOpen(true)}
          onClose={() => setLangPromptOpen(false)}
        />
      )}
      <InstallAppPrompt
        offsetBottom={
          previewMode
            ? previewFooterHeight
            // Logged-in mobile users always have the persistent bottom tab nav (see the
            // `height: 62` bar below) — without this offset the banner's default bottom
            // gap sits inside that nav's footprint and gets tucked behind it.
            : isMobile && !is404 && !immersiveMedia
            ? 62
            : 0
        }
      />

      {isMobile && (mobileAllOpen || mobileAllClosing) && (
        <MobileNavSheet
          closing={mobileAllClosing}
          onClose={closeMobileAll}
          onNavigate={navigateTo}
          activeNav={activeNav}
          pinnedIds={recentVerticals}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onOpenLangPicker={() => setLangPickerOpen(true)}
          onReportBug={() => { setShowThemePicker(false); setShowBugReport(true); }}
        />
      )}

      {/* #417: Messages has no place in the mobile bottom nav, so it was effectively buried
          behind "More". This mirrors the Town Hall "create a post" FAB (54px, same blue, same
          shadow) and carries the real unread count — chatUnreadTotal is the same socket-backed
          value the desktop sidebar badge uses, so it can't drift from it.
          Sits above the 62px nav bar. On Town Hall the draggable compose FAB occupies
          bottom 140-194 (measured, not the 78 its default style suggests), so this stacks
          clear above it. Hidden on Messages itself. */}
      {/* #455: On-Demand is a full-bleed 4-column category grid inside a bottom sheet, and this
          button lands squarely on the last column's label — "Security & Surveillance" was rendered
          with a disc through the middle of it. Padding fixes the bottom row but cannot fix an
          overlay sitting on top of mid-grid content. On-Demand is a focused hiring flow, so the
          messages shortcut is not worth obscuring the content the user came for; it's one tap away
          in the nav bar directly below. Same reasoning as hiding it on Messages itself. */}
      {isMobile && !is404 && !immersiveMedia && activeNav !== "messages" && activeNav !== "ondemand" && activeNav !== "sd-drive" && activeNav !== "sd-courier" && (
        <button
          onClick={() => navigateTo("messages")}
          aria-label={chatUnreadTotal > 0 ? `Messages, ${chatUnreadTotal} unread` : "Messages"}
          className="bg-surface-glass border border-border text-text-primary"
          style={{
            position: "fixed",
            // Videos owns a labelled tab bar, and 78 lands on its Home/Profile labels. The shared
            // dock line is where the Videos mini-player parks too, so the two cannot collide.
            bottom: activeNav === "social" ? 206 : activeNav === "videos" ? VIDEOS_MOBILE_DOCK_BOTTOM : 78,
            right: 20,
            width: 54,
            height: 54,
            borderRadius: "50%",
            // #458: this was a solid #2563eb disc with a heavy blue glow — it shouted over every
            // page you navigated to. Same glass treatment the Notifications button already uses, so
            // it reads as chrome rather than competing with the content. The unread badge keeps the
            // blue, which is where the attention actually belongs.
            // #473: the glass made the icon itself hard to see — the button set no `color`, so the
            // currentColor stroke rendered faint. Give it an explicit white icon on a slightly more
            // solid backdrop so the bubble reads clearly, without going back to the shouty blue disc.
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 18px var(--color-shadow)",
            zIndex: 50,
            cursor: "pointer",
          }}
        >
          <MessagesIcon s={24} />
          {chatUnreadTotal > 0 && (
            <span
              style={{
                position: "absolute", top: -2, right: -2, minWidth: 20, height: 20,
                padding: "0 5px", borderRadius: 999, background: "#ef4444", color: "#fff",
                fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 800,
                lineHeight: "20px", textAlign: "center", boxShadow: "0 0 0 2px var(--color-bg)",
              }}
            >
              {chatUnreadTotal > 99 ? "99+" : chatUnreadTotal}
            </span>
          )}
        </button>
      )}

      {/* sd-drive/sd-courier render their own fixed-bottom driver nav (DriverBottomNav in
          SellerDriveDashboard) — showing this global one too stacked two full-width nav bars
          on top of each other on mobile. */}
      {isMobile && !is404 && !immersiveMedia && activeNav !== "videos" && activeNav !== "sd-drive" && activeNav !== "sd-courier" && (
        <div
          className="bg-surface-glass"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: 62,
            backdropFilter: "blur(16px)",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            zIndex: 60,
            paddingBottom: "env(safe-area-inset-bottom,0)",
          }}
        >
          {(activeNav === "automotive"
            ? [
                { id: "home", Icon: HomeIcon },
                { id: "automotive", Icon: AutomotiveIcon },
                { id: "rideshare", Icon: RideshareIcon },
                { id: "videos", Icon: VideoIcon },
                { id: "more", Icon: MoreGridIcon },
              ]
            : [
                { id: "home", Icon: HomeIcon },
                { id: "feed", Icon: FeedIcon },
                { id: "rideshare", Icon: RideshareIcon },
                { id: "videos", Icon: VideoIcon },
                { id: "more", Icon: MoreGridIcon },
              ]
          ).map(({ id, Icon: TabIcon }) => {
            const label = sidebarNavLabel(id, id === "more" ? "More" : id.charAt(0).toUpperCase() + id.slice(1), t);
            const active =
              id === "more"
                ? mobileAllOpen || mobileAllClosing
                : activeNav === id;
            const color =
              id === "more" ? "#2563eb" : PAGE_COLORS[id] || "#2563eb";
            return (
              <button
                key={id}
                onClick={() => {
                  if (id === "more") {
                    mobileAllOpen || mobileAllClosing
                      ? closeMobileAll()
                      : openMobileAll();
                  } else {
                    navigateTo(id);
                    if (mobileAllOpen) closeMobileAll();
                  }
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  background: "none",
                  border: "none",
                  color: active ? color : "var(--color-text-muted)",
                  cursor: "pointer",
                  padding: "6px 16px",
                  flex: 1,
                  transition: "color 0.15s",
                }}
              >
                <div style={{ position: "relative" }}>
                  {TabIcon ? React.createElement(TabIcon, { s: 22 }) : null}
                </div>
                <span
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 10,
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {isMobile &&
        !is404 &&
        !hideProfileBtn &&
        activeNav === "home" &&
        (isAuthenticated() ? (
          <button
            onClick={() => {
              setShowProfileMenu((v) => !v);
              if (mobileAllOpen) closeMobileAll();
            }}
            style={{
              position: "fixed",
              top: 12,
              right: 12,
              zIndex: 55,
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: showProfileMenu
                ? "rgba(37,99,235,0.25)"
                : "rgba(17,18,26,0.85)",
              backdropFilter: "blur(12px)",
              border: showProfileMenu
                ? "1.5px solid rgba(37,99,235,0.5)"
                : "1.5px solid rgba(255,255,255,0.15)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "background 0.15s, border-color 0.15s",
              overflow: "hidden",
              padding: 0,
            }}
          >
            {/* #374: show the signed-in user's profile photo (clickable → profile
                menu), not a generic icon — mirrors the sidebar avatar + #373. */}
            {/* #457: see above — a 404'd photo must fall back to the icon, not an empty disc. */}
            <SafeImage
              src={currentUser?.profile_pic_url}
              alt=""
              style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
              fallback={<ProfileIcon s={20} />}
            />
          </button>
        ) : (
          <button
            onClick={() => {
              if (devLocalLogin) setCurrentUser(null);
              else window.location.href = LOGIN_URL;
            }}
            style={{
              position: "fixed",
              top: 12,
              right: 12,
              zIndex: 55,
              height: 34,
              borderRadius: 20,
              padding: "0 14px",
              background: "rgba(37,99,235,0.85)",
              backdropFilter: "blur(12px)",
              border: "1.5px solid rgba(37,99,235,0.6)",
              color: "#fff",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            Sign In
          </button>
        ))}

      {!isMobile &&
        !is404 &&
        (() => {
          const scrollbarActive =
            !aiPanelOpen &&
            !!pageScrollEl &&
            pageScrollEl.scrollHeight > pageScrollEl.clientHeight + 8;
          const aiRight = scrollbarActive ? 8 : 0;
          return (
            <button
              onClick={() => (aiPanelOpen ? closeAiPanel() : openAiPanel())}
              title={aiPanelOpen ? "Close AI" : "Open Strug AI"}
              style={{
                position: "fixed",
                right: aiRight,
                top: "50%",
                // Nudged 20px below dead centre: the Videos edge tabs stack two above and two
                // below this fab, and Creator's Choice ended up flush against its top edge while
                // Subs sat 38px clear. The offset splits that space evenly between the two.
                transform: aiFabTranslateY(),
                zIndex: 45,
                width: 36,
                height: 80,
                borderRadius: "10px 0 0 10px",
                background: aiPanelOpen
                  ? "linear-gradient(160deg, #7c3aed, #2563eb)"
                  : "linear-gradient(160deg, #2563eb, #7c3aed)",
                border: "none",
                cursor: "pointer",
                color: "#fff",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                boxShadow: aiPanelOpen
                  ? "-4px 0 28px rgba(124,58,237,0.5)"
                  : "-4px 0 20px rgba(37,99,235,0.35)",
                transition:
                  "right 0.2s, transform 0.12s, box-shadow 0.15s, background 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = aiFabTranslateY(1.08);
                e.currentTarget.style.boxShadow =
                  "-6px 0 28px rgba(37,99,235,0.6)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = aiFabTranslateY();
                e.currentTarget.style.boxShadow =
                  "-4px 0 20px rgba(37,99,235,0.35)";
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = aiFabTranslateY(0.93);
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = aiFabTranslateY(1.08);
              }}
            >
              <AISparkleIcon s={16} sw={2.4} />
            </button>
          );
        })()}

      {!isMobile && !is404 && (
        <VerticalEdgeDrawer
          activeNav={activeNav}
          navigateTo={navigateTo}
          onRequireAuth={requireAuth}
          is404={is404}
          aiPanelOpen={aiPanelOpen}
          pageScrollEl={pageScrollEl}
        />
      )}

      {globalMini && (
        <GlobalMiniPlayer
          video={globalMini.video}
          startTime={globalMini.startTime}
          isMobile={isMobile}
          onExpand={expandMini}
          onClose={closeMini}
        />
      )}
      <QuickReplyPopup
        channel={quickReplyChannel}
        onClose={() => setQuickReplyChannel(null)}
        onOpenFull={(channelId) => {
          if (channelId != null) window.__openChatChannelId = Number(channelId);
          setQuickReplyChannel(null);
          navigateTo("messages");
        }}
      />
      <TransactionalToast toasts={txnToast.toasts} onDismiss={txnToast.dismiss} onOpen={txnToast.open} onAction={txnToast.act} />
      <AvatarResetNotice authReady={authBooted} onReupload={() => setActiveNav("profile")} />

      {/* Epic 10 — mobile bell. Mirrors the Messages FAB in the bottom-LEFT corner. NOT gated on
          activeNav === "home"; a driver on their dashboard needs to see an incoming ride.
          Hidden while a chat is open — otherwise it sits on top of the composer. */}
      {isMobile && !is404 && !immersiveMedia && isAuthenticated() && !(activeNav === "messages" && mobileChatOpen) && (
        <NotificationBell
          variant="floating"
          unread={notifs.unread}
          open={notifs.open}
          onClick={notifs.toggle}
          bottom={activeNav === "social" ? 206 : activeNav === "messages" ? 85 : activeNav === "videos" ? VIDEOS_MOBILE_DOCK_BOTTOM : 78}
        />
      )}

      {notifs.open && (
        <NotificationPanel
          items={notifs.items}
          loading={notifs.loading}
          onClose={notifs.close}
          onMarkRead={notifs.markRead}
          onMarkAllRead={notifs.markAllRead}
          onDismiss={notifs.dismiss}
          onNavigate={(nav, target) => {
            // #472: a deep-linkable notification passes a target; stash it in the global the
            // destination page reads on mount (mirrors the "View profile" pattern), then nav.
            // navigateTo clears the initial*Refs but leaves these globals alone. The event covers
            // the case where the target page is already mounted (nav is a no-op, no remount).
            if (target) {
              if (target.profileUserId != null) window.__profileTargetId = target.profileUserId;
              if (target.feedPostId != null) window.__feedOpenPostId = target.feedPostId;
              if (target.townHallPostId != null) window.__townHallOpenPostId = target.townHallPostId;
              if (target.videoId != null) window.__videosOpenVideoId = target.videoId;
              if (target.foodOrderId != null) window.__foodTrackOrderId = target.foodOrderId;
              if (target.walletTxnId != null) window.__walletTxnId = target.walletTxnId;
              if (target.jobApplicationId != null) window.__jobApplicationChatId = target.jobApplicationId;
              if (target.automotiveTab != null) window.__automotiveOpenTab = target.automotiveTab;
              if (target.automotiveRequestType != null) window.__automotiveOpenRequestType = target.automotiveRequestType;
            }
            navigateTo(nav);
            if (target) window.dispatchEvent(new CustomEvent("strug:open-notification-target"));
          }}
        />
      )}

      {(aiPanelOpen || aiPanelClosing) && (
        <AIFloatPanel
          closing={aiPanelClosing}
          onClose={closeAiPanel}
          verticalSlug={activeNav}
          verticalName={activeNav.charAt(0).toUpperCase() + activeNav.slice(1)}
          color={PAGE_COLORS[activeNav] || "#2563eb"}
        />
      )}

      {!isMobile && !aiPanelOpen && (
        <PageExternalScrollbar el={pageScrollEl} accent={pageAccent} />
      )}

      <BreadcrumbProvider>
      {breadcrumbVisible && (
        <Breadcrumbs
          trail={breadcrumbTrail}
          accent={pageAccent}
          style={{
            position: "absolute",
            top: isMobile && !is404 ? "calc(env(safe-area-inset-top, 0px) + 12px)" : 14,
            // The floating sidebar <aside> (left:12, width:72, zIndex:60) sits above this strip
            // and would otherwise cover the "Home" segment on desktop — breadcrumbVisible is
            // false whenever is404/immersiveMedia hide that sidebar, so it's safe to always clear
            // it here rather than re-deriving the aside's own visibility condition.
            left: isMobile ? 0 : 96,
            right: splitMode && !isMobile ? "50vw" : 0,
            zIndex: 40,
          }}
        />
      )}
      <SplitModeContext.Provider value={splitMode && !isMobile}>
      <React.Suspense
        fallback={
          <div
            style={{ position: "absolute", inset: 0, background: "var(--color-bg)" }}
          />
        }
      >
        <div
          ref={contentWrapperRef}
          id="main"
          role="main"
          tabIndex={-1}
          style={{
            outline: "none",
            position: "absolute",
            // Mobile reserves a 56px top strip for the home toolbar/status bar. The provider &
            // become hubs render nothing there, so they'd show an empty gap — use the real
            // safe-area inset instead (≈0 in a browser, the status-bar height in an installed app).
            // Event Concierge return banner is ~44px fixed at top — offset content so it isn't covered.
            top: (contextNavReturn && contextNavReturn.id && contextNavReturn.id !== activeNav && activeNav !== "messages")
              ? 48
              : breadcrumbVisible
              ? `calc(${isMobile && !is404 ? "env(safe-area-inset-top, 0px)" : "0px"} + 52px)`
              : (isMobile && !is404 ? "env(safe-area-inset-top, 0px)" : 0),
            // sd-drive/sd-courier own their bottom nav + clearance padding directly (see the
            // matching exclusion on the global bottom nav above) — reserving 62px here too would
            // leave a blank gap now that the global bar no longer renders under them.
            bottom: isMobile && !is404 && activeNav !== "sd-drive" && activeNav !== "sd-courier" ? 62 : 0,
            left: 0,
            right: splitMode && !isMobile ? "50vw" : 0,
            transition: "right 0.25s ease",
            transform: splitMode && !isMobile ? "translateZ(0)" : undefined,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            key={activeNav}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              animation: "pageEnter 0.32s cubic-bezier(0.16, 1, 0.3, 1) both",
            }}
          >
            <ErrorBoundary resetKey={activeNav} compact>
              {renderNavPage(activeNav, navigateTo, initialVideoIdRef.current, initialListingIdRef.current, initialJobIdRef.current, initialAgentIdRef.current)}
            </ErrorBoundary>
          </div>
        </div>

        {spotlightOpen && (
          <SpotlightOverlay
            onNavigate={(id) => {
              setActiveNav(id);
              setSpotlightOpen(false);
              setLogoSpinReverse(true);
              setTimeout(() => setLogoSearchMode(false), 175);
              setTimeout(() => setLogoSpinReverse(false), 380);
            }}
            onClose={() => {
              setSpotlightOpen(false);
              setLogoSpinReverse(true);
              setTimeout(() => setLogoSearchMode(false), 175);
              setTimeout(() => setLogoSpinReverse(false), 380);
            }}
            navItems={VISIBLE_NAV_ITEMS}
          />
        )}
        {showSetupWizard && (
          <ProfileSetupWizard onClose={() => setShowSetupWizard(false)} />
        )}
        {showLocationPrompt && !showSetupWizard && (
          <LocationPromptModal
            onDone={() => {
              sessionStorage.setItem("strug_location_prompt_deferred", "1");
              setShowLocationPrompt(false);
            }}
          />
        )}

        {showWelcome && (
          <WelcomeModal
            onClose={dismissWelcome}
            onNavigate={(id) => {
              dismissWelcome();
              navigateTo(id);
            }}
            onTour={() => {
              dismissWelcome();
              setShowTour(true);
            }}
            onEarn={() => {
              dismissWelcome();
              navigateTo("become");
            }}
          />
        )}

        {showTour && (
          <GuidedTour
            onClose={() => setShowTour(false)}
            onFinish={() => {
              setShowTour(false);
              navigateTo("become");
            }}
          />
        )}

        {onboardVertical && !showWelcome && !showTour && (
          <CategoryOnboardCard
            vertical={onboardVertical}
            accent={PAGE_COLORS[onboardVertical]}
            onClose={dismissCategoryOnboard}
            onDisableAll={disableAllCategoryOnboard}
          />
        )}

        {/* Bug report modal — available on mobile + desktop; triggered from the
            fullscreen / language cluster and the mobile "More" sheet. */}
        {showBugReport && (
          <BugReportModal
            accent={pageAccent}
            isMobile={isMobile}
            onClose={() => setShowBugReport(false)}
            // Which SPA page the reporter was on when they hit "report a problem" — the
            // most-asked triage question, answered without anyone having to ask it.
            navId={activeNav}
            onViewReports={() => navigateTo("my-reports")}
          />
        )}

        {/* The other half of the same conversation: where a reporter reads the team's follow-up
            question and answers it. Opened by the notification bell (action_url:'my-reports'),
            by the bug-report modal, and by a direct /my-reports link. */}
        {showMyReports && (
          <MyReportsModal
            accent={pageAccent}
            isMobile={isMobile}
            onClose={() => setShowMyReports(false)}
            onReportBug={() => setShowBugReport(true)}
          />
        )}

        {splitMode && !isMobile && (
          <div className="bg-bg" style={{
            position: "fixed",
            top: 0, right: 0,
            width: "50vw",
            height: "100vh",
            borderLeft: "1px solid rgba(255,255,255,0.1)",
            zIndex: 45,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "'DM Sans', sans-serif",
            transform: "translateZ(0)",
          }}>
            <div className="bg-surface-glass" style={{
              height: 44,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              padding: "0 10px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              gap: 8,
            }}>
              {rightNav ? (
                <Tooltip text="Back to the library"><button
                  onClick={() => setRightNav(null)}
                  className="bg-surface-raised border border-border text-text-secondary"
                  style={{
                    height: 30,
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0 12px",
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    flexShrink: 0,
                  }}
                >
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Library
                </button></Tooltip>
              ) : null}
              <span style={{
                flex: 1,
                minWidth: 0,
                fontSize: 13,
                fontWeight: 700,
                color: rightNav ? (PAGE_COLORS[rightNav] || "#fff") : "rgba(255,255,255,0.85)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {rightNav ? splitRightLabel : "Browse verticals"}
              </span>
              <Tooltip text="Close split view"><button
                aria-label="Close split view"
                onClick={() => { setSplitMode(false); setRightNav(null); }}
                className="bg-surface-raised border border-border text-text-secondary"
                style={{
                  width: 28, height: 28,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                ×
              </button></Tooltip>
            </div>
            {rightNav ? (
              <ErrorBoundary resetKey={rightNav} compact>
              <div key={rightNav} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "auto", animation: "pageEnter 0.32s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
                {renderNavPage(rightNav, setRightNav)}
              </div>
              </ErrorBoundary>
            ) : (
              /* Media library: every vertical, grouped by the sidebar's own sections.
                 Posters in a fluid grid, one vertical scroll, search to jump. */
              <div
                className="split-library"
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  overflowX: "hidden",
                  padding: "0 16px 24px",
                  animation: "pageEnter 0.32s cubic-bezier(0.16, 1, 0.3, 1) both",
                }}
              >
                <div style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 3,
                  paddingTop: 14,
                  paddingBottom: 10,
                  background: "linear-gradient(#0a0a0e 78%, rgba(10,10,14,0))",
                }}>
                  <input
                    className="split-search"
                    value={splitQuery}
                    onChange={(e) => setSplitQuery(e.target.value)}
                    placeholder={"Search verticals\u2026"}
                    aria-label="Search verticals"
                  />
                </div>

                {splitLibrarySections.length === 0 ? (
                  <div className="text-text-secondary" style={{
                    padding: "40px 0",
                    textAlign: "center",
                    fontSize: 13,
                  }}>
                    No vertical matches &ldquo;{splitQuery}&rdquo;.
                  </div>
                ) : splitLibrarySections.map((section, si) => (
                  <div key={section.title} style={{ marginBottom: 22 }}>
                    <div style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      padding: "0 2px 10px",
                    }}>
                      <span className="text-text-primary" style={{
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: 0.7,
                        fontSize: 18,
                      }}>
                        {section.title}
                      </span>
                      <span className="text-text-muted" style={{ fontSize: 11, fontWeight: 700 }}>
                        {section.pages.length}
                      </span>
                      <span className="bg-border-subtle" style={{ flex: 1, height: 1 }} />
                    </div>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(136px, 1fr))",
                      gap: 10,
                    }}>
                      {section.pages.map((p, pi) => {
                        const color = PAGE_COLORS[p.id] || "#2563eb";
                        const Icon = NAV_ICON_BY_ID[p.id];
                        return (
                          <button
                            key={p.id}
                            onClick={() => setRightNav(p.id)}
                            className="split-card"
                            title={p.label}
                            style={{
                              position: "relative",
                              height: 98,
                              borderRadius: 12,
                              overflow: "hidden",
                              padding: 0,
                              cursor: "pointer",
                              textAlign: "left",
                              color: "#fff",
                              border: `1px solid ${color}3a`,
                              background: `linear-gradient(150deg, ${color}30 0%, rgba(255,255,255,0.04) 100%)`,
                              fontFamily: "'DM Sans', sans-serif",
                              animation: `fadeUp 0.28s ease ${Math.min(si * 40 + pi * 25, 320)}ms both`,
                            }}
                          >
                            {p.image ? (
                              <SafeImage
                                src={p.image}
                                alt=""
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                }}
                              />
                            ) : null}
                            <div style={{
                              position: "absolute",
                              inset: 0,
                              background: `linear-gradient(to top, rgba(6,7,10,0.94) 26%, rgba(6,7,10,0.35) 70%, ${color}33 100%)`,
                            }} />
                            <div style={{
                              position: "relative",
                              height: "100%",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              padding: 9,
                            }}>
                              <div style={{
                                width: 26,
                                height: 26,
                                borderRadius: 8,
                                background: "rgba(0,0,0,0.45)",
                                border: `1px solid ${color}70`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#fff",
                                backdropFilter: "blur(4px)",
                              }}>
                                {Icon ? <Icon s={14} /> : null}
                              </div>
                              <div style={{
                                fontSize: 12.5,
                                fontWeight: 700,
                                lineHeight: 1.2,
                                textShadow: "0 1px 8px rgba(0,0,0,0.8)",
                              }}>
                                {p.label}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </React.Suspense>
      </SplitModeContext.Provider>
      </BreadcrumbProvider>
    </div>
  );
}

import {
  ShinyText,
} from "./components/skeletons.jsx";

function PagePlaceholder({ label }) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg)",
        animation: "fadeUp 0.3s ease both",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#2563eb",
            fontFamily: "'DM Sans', sans-serif",
            marginBottom: 12,
          }}
        >
          <ShinyText speed={3}>{t("app.comingSoon")}</ShinyText>
        </p>
        <h2
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: "clamp(32px, 4vw, 56px)",
            color: "var(--color-text-primary)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </h2>
        <p
          style={{
            marginTop: 12,
            fontSize: 14,
            color: "var(--color-text-secondary)",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {t("app.pageBuilding")}
        </p>
      </div>
    </div>
  );
}

function NotFoundPage({ onGoHome }) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            width: 700,
            height: 700,
            borderRadius: "50%",
            top: "-15%",
            left: "10%",
            background:
              "radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 65%)",
            filter: "blur(48px)",
            animation: "orb1 14s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 550,
            height: 550,
            borderRadius: "50%",
            bottom: "-5%",
            right: "5%",
            background:
              "radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 65%)",
            filter: "blur(56px)",
            animation: "orb2 17s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 420,
            height: 420,
            borderRadius: "50%",
            top: "20%",
            right: "25%",
            background:
              "radial-gradient(circle, rgba(96,165,250,0.1) 0%, transparent 65%)",
            filter: "blur(40px)",
            animation: "orb3 11s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 360,
            height: 360,
            borderRadius: "50%",
            bottom: "20%",
            left: "20%",
            background:
              "radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 65%)",
            filter: "blur(44px)",
            animation: "orb4 13s ease-in-out infinite",
          }}
        />
      </div>

      <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#2563eb",
            fontFamily: "'DM Sans', sans-serif",
            marginBottom: 14,
            animation: "fadeUp 0.4s ease both",
          }}
        >
          {t("app.notFoundTag")}
        </p>
        <h1
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: "clamp(40px, 5vw, 72px)",
            color: "var(--color-text-primary)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: 16,
            animation: "fadeUp 0.4s ease 60ms both",
          }}
        >
          {t("app.notFoundTitle")}
        </h1>
        <p
          style={{
            fontSize: 15,
            color: "var(--color-text-muted)",
            fontFamily: "'DM Sans', sans-serif",
            maxWidth: 360,
            margin: "0 auto 28px",
            lineHeight: 1.6,
            animation: "fadeUp 0.4s ease 100ms both",
          }}
        >
          {t("app.notFoundBody")}
        </p>
        <button
          onClick={onGoHome}
          style={{
            padding: "12px 28px",
            background: "#2563eb",
            border: "none",
            borderRadius: 10,
            color: "#fff",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            transition: "background 0.15s, transform 0.12s",
            animation: "fadeUp 0.4s ease 140ms both",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#1d4ed8";
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#2563eb";
            e.currentTarget.style.transform = "translateY(0)";
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = "translateY(0) scale(0.97)";
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
        >
          {t("app.goHome")}
        </button>
      </div>
    </div>
  );
}

function LanguagePicker({ onClose }) {
  const { isMobile } = _bp;
  const { t } = useTranslation();
  const [search, setSearch] = React.useState("");
  const [currentLang, setCurrentLang] = React.useState(i18n.language);
  const scrollRef = useRef(null);
  const [atBottom, setAtBottom] = useState(false);

  const filtered = LANGUAGES.filter(
    (l) =>
      l.english.toLowerCase().includes(search.toLowerCase()) ||
      l.native.toLowerCase().includes(search.toLowerCase()) ||
      l.code.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelect = (code) => {
    applyLanguage(code).then(() => {
      setCurrentLang(code);
      onClose();
    });
  };

  function checkBottom() {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 10);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkBottom();
    el.addEventListener("scroll", checkBottom, { passive: true });
    return () => el.removeEventListener("scroll", checkBottom);
  }, [filtered.length]);

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 54 }}
      />
      <div
        style={{
          position: "fixed",
          ...(isMobile
            ? { top: 58, left: 12, right: 12, bottom: 70 }
            : { top: 12, bottom: 14, left: 92, width: 280 }),
          zIndex: 60,
          background: "rgba(17,18,22,0.98)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "flyoutIn 0.15s ease both",
        }}
      >
        <div
          style={{
            padding: "20px 16px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: 22,
              color: "#fff",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            {t("language.selectLanguage")}
          </h2>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(255,255,255,0.05)",
              borderRadius: 8,
              padding: "7px 10px",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <circle cx={11} cy={11} r={8} />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              autoFocus
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setTimeout(checkBottom, 50);
              }}
              placeholder={t("language.searchLanguages")}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                color: "#fff",
                fontSize: 13,
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.55)",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          <div ref={scrollRef} style={{ height: "100%", overflowY: "auto" }}>
            {filtered.map((lang) => {
              const isActive =
                currentLang === lang.code ||
                currentLang.startsWith(lang.code + "-");
              const isRTL = RTL_LANGUAGES.has(lang.code);
              return (
                <button
                  key={lang.code}
                  onClick={() => handleSelect(lang.code)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 16px",
                    background: isActive
                      ? "rgba(37,99,235,0.2)"
                      : "transparent",
                    border: "none",
                    borderLeft: `2px solid ${isActive ? "#2563eb" : "transparent"}`,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      e.currentTarget.style.background =
                        "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    {flagUrlByIso2(LANGUAGE_FLAG_ISO2[lang.code]) && (
                      <img
                        src={flagUrlByIso2(LANGUAGE_FLAG_ISO2[lang.code])}
                        srcSet={`${flagUrlByIso2(LANGUAGE_FLAG_ISO2[lang.code])} 1x, ${flagUrlByIso2(LANGUAGE_FLAG_ISO2[lang.code]).replace("/w40/", "/w80/")} 2x`}
                        alt=""
                        loading="lazy"
                        style={{ height: 16, width: "auto", borderRadius: 2, flexShrink: 0, display: "block" }}
                      />
                    )}
                    <div style={{ minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? "#fff" : "rgba(255,255,255,0.75)",
                        display: "block",
                      }}
                    >
                      {lang.english}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "'DM Sans', sans-serif",
                        color: "rgba(255,255,255,0.55)",
                        direction: isRTL ? "rtl" : "ltr",
                      }}
                    >
                      {lang.native}
                    </span>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    {isRTL && (
                      <span
                        style={{
                          fontSize: 9,
                          padding: "1px 5px",
                          borderRadius: 4,
                          background: "rgba(124,58,237,0.2)",
                          color: "#a78bfa",
                          fontFamily: "'DM Sans', sans-serif",
                          fontWeight: 600,
                        }}
                      >
                        RTL
                      </span>
                    )}
                    {isActive && (
                      <svg
                        width={14}
                        height={14}
                        viewBox="0 0 14 14"
                        fill="none"
                      >
                        <path
                          d="M2 7l4 4 6-7"
                          stroke="#2563eb"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p
                style={{
                  textAlign: "center",
                  padding: "24px 16px",
                  color: "rgba(255,255,255,0.3)",
                  fontSize: 13,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {t("common.noResults")}
              </p>
            )}
          </div>

          {!atBottom && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 56,
                background:
                  "linear-gradient(to bottom, transparent, rgba(17,18,22,0.97))",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingBottom: 10,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  animation: "moreFlyoutChevron 1.5s ease-in-out infinite",
                }}
              >
                <svg width={18} height={10} viewBox="0 0 18 10" fill="none">
                  <path
                    d="M2 2L9 8L16 2"
                    stroke="rgba(255,255,255,0.38)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Lazily trigger a chunk of off-critical-path work on the first user interaction,
// with an idle-time fallback so it still runs even if the user never interacts
// (e.g. a deep-linked checkout). Returns a cleanup function.
function onFirstInteraction(fn, fallbackMs = 5000) {
  let done = false;
  const events = ["pointerdown", "keydown", "touchstart"];
  const run = () => {
    if (done) return;
    done = true;
    events.forEach((e) => window.removeEventListener(e, run));
    fn();
  };
  events.forEach((e) =>
    window.addEventListener(e, run, { once: true, passive: true }),
  );
  const t = setTimeout(run, fallbackMs);
  return () => {
    clearTimeout(t);
    events.forEach((e) => window.removeEventListener(e, run));
  };
}

function StripeElementsWrapper({ children }) {
  const { i18n: i18nInstance } = useTranslation();
  // Defer Stripe.js (a large script + fingerprint iframes/beacons) off the initial
  // load path. `<Elements>` accepts a null `stripe` and picks it up once it
  // resolves, so checkout pages keep working — Stripe is loaded well before the
  // user reaches one. Every checkout consumer already guards on `useStripe()` null.
  //
  // #465: deferring alone wasn't enough. The fallback timer fired on EVERY route, so a user
  // watching videos still paid ~1 MB of Stripe parse/compile on their phone for a page with no
  // checkout. Now the deferred load is armed only once the user is on a route that could
  // actually take a payment (see sdkPreload — a deny-list, so payment routes can't be starved).
  const [stripe, setStripe] = useState(null);
  const options = useMemo(
    () => ({ locale: stripeLocaleFromI18n(i18nInstance.language) }),
    [i18nInstance.language],
  );
  useEffect(() => {
    const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!key) return;
    let disarm = null;
    const unsubscribe = subscribeActiveRoute((navId) => {
      if (disarm || !routeNeedsHeavySdks(navId)) return;
      disarm = onFirstInteraction(() => setStripe(loadStripe(key)));
    });
    return () => {
      unsubscribe();
      if (disarm) disarm();
    };
  }, []);
  return (
    <Elements stripe={stripe} options={options}>
      {children}
    </Elements>
  );
}

// PayPal's SDK is rendered with `deferLoading`, so the script isn't fetched on
// boot. This kicks off the (still lazy) load on first interaction so the buttons
// are ready by the time a checkout mounts.
function PayPalDeferredLoader() {
  const [{ isInitial }, dispatch] = usePayPalScriptReducer();
  const [navId, setNavId] = useState(() => getActiveRoute());
  useEffect(() => subscribeActiveRoute(setNavId), []);
  useEffect(() => {
    if (!isInitial) return;
    if (!routeNeedsHeavySdks(navId)) return undefined;
    return onFirstInteraction(() =>
      dispatch({
        type: "setLoadingStatus",
        value: SCRIPT_LOADING_STATE.PENDING,
      }),
    );
  }, [isInitial, dispatch, navId]);
  return null;
}

export default function App() {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/reset-password")) {
    return <ResetPassword />;
  }
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/track/")) {
    return <PublicTracking />;
  }
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/track-trip/")) {
    return <TripTrack />;
  }
  // YouTube-style embed player: no app chrome; corner Strug mark links to the full watch page.
  const embedMatch = typeof window !== "undefined"
    ? window.location.pathname.match(/^\/embed\/v\/([^/]+)/)
    : null;
  if (embedMatch) {
    return <VideoEmbedPage videoId={decodeURIComponent(embedMatch[1])} />;
  }

  const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
  const appContent = (
    <I18nextProvider i18n={i18n}>
      {/* Makes every Motion.* animation honor the OS-level reduced-motion setting, same
          spirit as the existing @media (prefers-reduced-motion) rules further down. */}
      <MotionConfig reducedMotion="user">
        <StripeElementsWrapper>
          <AppInner />
        </StripeElementsWrapper>
      </MotionConfig>
    </I18nextProvider>
  );

  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID}>
      {paypalClientId ? (
        <PayPalScriptProvider
          deferLoading={true}
          options={{
            "client-id": paypalClientId,
            // Must match backend PayPal orders (payment-routes uses CAD). USD here breaks sandbox checkout.
            currency: import.meta.env.VITE_PAYPAL_CURRENCY ?? "CAD",
            intent: "capture",
          }}
        >
          <PayPalDeferredLoader />
          {appContent}
        </PayPalScriptProvider>
      ) : (
        appContent
      )}
    </GoogleOAuthProvider>
  );
}
