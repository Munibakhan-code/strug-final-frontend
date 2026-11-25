/**
 * Buyer-facing storefront branding — banner/cover hero + store logo.
 * Mirrors Food restaurant cards while using resolved shop mapper URLs.
 */

import {
	shopHeroImageSrc,
	shopLogoImageSrc,
	shopProductImageSrc,
} from '../../utils/shopMediaHelpers.js';

/** Wide storefront hero (banner → cover CSS fallback + optional <img>). */
export function ShopHeroBanner({
	shop,
	height = 160,
	borderRadius = 0,
	gradientOverlay = false,
	children,
	style = {},
}) {
	const heroSrc = shopHeroImageSrc(shop);
	return (
		<div
			style={{
				width: '100%',
				height,
				borderRadius,
				background: shop?.thumb,
				position: 'relative',
				overflow: 'hidden',
				...style,
			}}
		>
			{heroSrc && (
				<img
					loading="lazy"
					decoding="async"
					src={heroSrc}
					alt={shop?.name ?? 'Store'}
					style={{
						position: 'absolute',
						inset: 0,
						width: '100%',
						height: '100%',
						objectFit: 'cover',
					}}
					onError={(e) => {
						e.currentTarget.style.display = 'none';
					}}
				/>
			)}
			{gradientOverlay && (
				// Scrim under the hero photo — stays a dark gradient regardless of theme, since it exists
				// purely to keep white overlay text (shop name, stats) legible against arbitrary storefront
				// photography, not to match the page surface (mirrors Hub.jsx's hero-photo scrim pattern).
				<div
					style={{
						position: 'absolute',
						inset: 0,
						background:
							'linear-gradient(to top, rgba(6,8,16,0.85) 0%, transparent 60%)',
						pointerEvents: 'none',
					}}
				/>
			)}
			{children}
		</div>
	);
}

/** Circular store logo chip (profile_pic_url). */
export function ShopLogoAvatar({ logoUrl, name, size = 48, style = {} }) {
	const src = logoUrl;
	if (!src) return null;
	return (
		<img
			loading="lazy"
			decoding="async"
			src={src}
			alt={name ? `${name} logo` : 'Store logo'}
			style={{
				width: size,
				height: size,
				borderRadius: '50%',
				objectFit: 'cover',
				// Ring stays solid white regardless of theme — it always renders over a hero photo/
				// storefront image (see ShopHeroBanner usages), so it needs to frame the logo against
				// arbitrary photography rather than track the page's neutral surface colors.
				border: '2px solid rgba(255,255,255,0.9)',
				boxShadow: '0 4px 16px var(--color-shadow)',
				flexShrink: 0,
				...style,
			}}
			onError={(e) => {
				e.currentTarget.style.display = 'none';
			}}
		/>
	);
}

/** Product photo — prefers listing.image_url via mapper imageUrl. */
export function ShopProductImage({ product, style = {}, rounded = false, alt }) {
	const src = shopProductImageSrc(product);
	if (src) {
		return (
			<img
				loading="lazy"
				decoding="async"
				src={src}
				alt={alt ?? product?.name ?? 'Product'}
				style={{
					width: '100%',
					height: '100%',
					objectFit: 'cover',
					borderRadius: rounded ? '50%' : undefined,
					...style,
				}}
				onError={(e) => {
					e.currentTarget.style.display = 'none';
				}}
			/>
		);
	}
	return (
		<div
			style={{
				width: '100%',
				height: '100%',
				background: product?.thumb,
				borderRadius: rounded ? '50%' : undefined,
				...style,
			}}
		/>
	);
}
