// src/components/shared-shopping/SharedShopping.jsx
//
// Single shared import surface for the cross-vertical shopping flow.
//
// Every commerce vertical (Books, Groceries, Second Hand, …) consumes the cart,
// checkout, address-capture and order-tracking experience from here instead of
// reaching into Food.jsx directly. The canonical implementations live in Food.jsx
// (full Stripe / PayPal / wallet payment, promo + referral codes, tax + 8% platform
// fee, driver-availability dispatch and live order tracking); this module re-exports
// them under vertical-neutral names so callers aren't coupled to the "Food" naming.
//
// NOTE: keep this a thin re-export barrel. Do NOT reimplement the cart/checkout here —
// that previously shipped placeholder stubs that silently dropped real payment and
// order creation across every vertical.

export {
	FoodAddressCapture as AddressCapture,
	FoodCartPage as CartPage,
	FoodCheckoutPage as CheckoutPage,
	FoodTrackingPage as TrackingPage,
} from "../../pages/Food.jsx";

// Ecommerce-style tracking (polls order status) for marketplace verticals that sell
// physical goods rather than prepared food.
export { EcomTrackingPage } from "../../pages/Ecommerce.jsx";

// Shop catalog mappers + geo constants (Phase 0 foundation — used by Shop, 2nd Hand, …)
export {
  mapListingToProduct,
  mapListingsToProducts,
  mapListingsToLocalShops,
  mapListingPayloadToLocalShops,
  mapProductToSelectedShop,
  productThumbFromListing,
  productImageUrlFromListing,
  storeThumbFromProfile,
  storeImageUrl,
  effectiveUnitPrice,
  enrichProductsWithDistance,
  SHOP_API_GEO_RADIUS_KM,
  SHOP_MAX_BROWSE_DISTANCE_KM,
} from "../../utils/shopMappers.js";

export { distanceLabel, foodStyleEtaMinutes } from "../../utils/geo.js";

export {
  VERTICAL_PRODUCT_TYPE,
  verticalBrowseListingParams,
  readBuyerBrowseCoords,
  mapListingsToVerticalCatalog,
  mapVerticalProductToCartLine,
  pickCheckoutProductTypeId,
  resolveProductTypeIdByName,
  createVerticalPlaceOrderHandler,
  filterListingsByVerticalType,
  listingMatchesVerticalType,
  avatarColorForId,
} from "../../utils/shopVerticalHelpers.js";

export { ShopHeroBanner, ShopLogoAvatar, ShopProductImage } from "../shop/ShopBrandingMedia.jsx";
