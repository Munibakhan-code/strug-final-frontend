/** Resolved hero image URL for buyer storefront banners (banner → cover). */
export function shopHeroImageSrc(shop) {
	return shop?.heroUrl || shop?.bannerUrl || shop?.coverUrl || null;
}

/** Resolved store logo URL for avatar chips. */
export function shopLogoImageSrc(shop) {
	return shop?.logoUrl || shop?.img || null;
}

/** Resolved product photo URL (listing.image_url via mapper). */
export function shopProductImageSrc(product) {
	return product?.imageUrl || null;
}
