/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
	shopHeroImageSrc,
	shopLogoImageSrc,
	shopProductImageSrc,
} from './shopMediaHelpers.js';

describe('shopMediaHelpers', () => {
	const shop = {
		heroUrl: 'https://cdn.example.com/banner.jpg',
		bannerUrl: 'https://cdn.example.com/banner.jpg',
		coverUrl: 'https://cdn.example.com/cover.jpg',
		logoUrl: 'https://cdn.example.com/logo.jpg',
		img: 'https://cdn.example.com/logo.jpg',
		thumb: 'linear-gradient(#1e3a8a,#2563eb)',
	};

	it('shopHeroImageSrc prefers heroUrl then banner then cover', () => {
		expect(shopHeroImageSrc(shop)).toBe(shop.heroUrl);
		expect(shopHeroImageSrc({ coverUrl: shop.coverUrl })).toBe(shop.coverUrl);
		expect(shopHeroImageSrc({})).toBeNull();
	});

	it('shopLogoImageSrc resolves logo fields', () => {
		expect(shopLogoImageSrc(shop)).toBe(shop.logoUrl);
		expect(shopLogoImageSrc({ img: shop.img })).toBe(shop.img);
		expect(shopLogoImageSrc(null)).toBeNull();
	});

	it('shopProductImageSrc returns imageUrl when set', () => {
		expect(
			shopProductImageSrc({ imageUrl: 'https://cdn.example.com/hoodie.jpg' }),
		).toContain('hoodie.jpg');
		expect(shopProductImageSrc({ thumb: 'gradient' })).toBeNull();
	});
});
