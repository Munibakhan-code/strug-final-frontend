// Per-vertical seller analytics overview endpoints. Each returns the unified shape
// the <SellerAnalyticsPanel> renders: { data: { range, currency, summary, timeseries,
// breakdown, top } }. The thunks are module-level (stable references) so they can be
// passed straight into the panel's effect dependency without re-fetch loops.
import client from './client';
import { browserTimeZone } from '../utils/calendarDay.js';

function withAnalyticsTz(params = {}) {
	return { ...params, tz: browserTimeZone() };
}

export const getFoodVendorAnalytics = (range, options = {}) => {
	const params = withAnalyticsTz({ range });
	if (options?.vertical) params.vertical = options.vertical;
	return client.get('/food/vendor/me/analytics/overview', { params }).then(r => r.data);
};

export const getDriverAnalytics = (range) =>
	client.get('/driver-profile/analytics/overview', { params: withAnalyticsTz({ range }) }).then(r => r.data);

// Couriers earn via courier_order deliveries (a separate table from rideshare trips),
// so they get their own overview endpoint. On-demand workers earn via work_job gigs.
export const getCourierAnalytics = (range) =>
	client.get('/courier-order/analytics/overview', { params: withAnalyticsTz({ range }) }).then(r => r.data);

export const getWorkerAnalytics = (range) =>
	client.get('/workers/me/analytics/overview', { params: withAnalyticsTz({ range }) }).then(r => r.data);

export const getSellerProductAnalytics = (range) =>
	client.get('/product-order/seller/analytics/overview', { params: withAnalyticsTz({ range }) }).then(r => r.data);

// Service-provider portals that still run on the service_order table (e.g. automotive).
// Décor buyer/seller flows use the booking engine — prefer getBookingHostAnalytics('decor').
export const getServiceProviderAnalytics = (range) =>
	client.get('/service-order/provider/analytics/overview', { params: withAnalyticsTz({ range }) }).then(r => r.data);

// On-demand Jobs employer portal — a SPEND view (the caller is the hirer). Scoped to the
// caller's own posted jobs, consistent with their job lists on the Jobs dashboard.
export const getEmployerJobAnalytics = (range) =>
	client.get('/work-jobs/hirer/analytics/overview', { params: withAnalyticsTz({ range }) }).then(r => r.data);

// LIVE-streaming-scoped streamer analytics (broadcast activity + subscription earnings).
// Separate from the video-channel CreatorAnalyticsPanel — a pure live streamer with no
// uploaded videos still gets real numbers here (#147).
export const getStreamerLiveAnalytics = (range) =>
	client.get('/live-streamer/me/analytics/overview', { params: withAnalyticsTz({ range }) }).then(r => r.data);

export const getCreatorEarnings = (range) =>
	client.get('/channel/me/earnings/overview', { params: withAnalyticsTz({ range }) }).then(r => r.data);

// One backend endpoint (GET /booking/host/me/analytics/overview) serves every
// booking-engine vertical — pass ?vertical to scope a single host portal. The panel
// needs a STABLE (range)=>Promise fetcher, so we memoise one fetcher per vertical
// rather than building a closure on each render (which would re-fire the effect).
const _bookingHostFetchers = {};
export const getBookingHostAnalytics = (vertical) => {
	const key = vertical || 'all';
	if (!_bookingHostFetchers[key]) {
		_bookingHostFetchers[key] = (range) => {
			const params = withAnalyticsTz({ range });
			if (vertical) params.vertical = vertical;
			return client.get('/booking/host/me/analytics/overview', { params }).then(r => r.data);
		};
	}
	return _bookingHostFetchers[key];
};

// Map of seller-portal nav id -> boolean (has the user registered/applied for that vertical).
// Drives the greyed-vs-active state on the /seller hub. Only mapped verticals return a
// status; everything else is treated as "not applied".
export const getSellerPortalStatus = () =>
	client.get('/seller-portals/me/status').then(r => r.data);
