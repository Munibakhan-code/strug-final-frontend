import client from './client.js';

export const listEventPlans = () =>
  client.get('/event-concierge/plans').then((r) => r.data);

export const createEventPlan = (data) =>
  client.post('/event-concierge/plans', data).then((r) => r.data);

export const getEventPlan = (id) =>
  client.get(`/event-concierge/plans/${id}`).then((r) => r.data);

export const updateEventPlan = (id, data) =>
  client.patch(`/event-concierge/plans/${id}`, data).then((r) => r.data);

export const deleteEventPlan = (id) =>
  client.delete(`/event-concierge/plans/${id}`).then((r) => r.data);

export const addEventNeed = (planId, data) =>
  client.post(`/event-concierge/plans/${planId}/needs`, data).then((r) => r.data);

export const updateEventNeed = (needId, data) =>
  client.patch(`/event-concierge/needs/${needId}`, data).then((r) => r.data);

export const deleteEventNeed = (needId) =>
  client.delete(`/event-concierge/needs/${needId}`).then((r) => r.data);

export const addEventGuest = (planId, data) =>
  client.post(`/event-concierge/plans/${planId}/guests`, data).then((r) => r.data);

export const bulkAddEventGuests = (planId, namesOrGuests) => {
  const body = Array.isArray(namesOrGuests) && namesOrGuests.length && typeof namesOrGuests[0] === 'object'
    ? { guests: namesOrGuests }
    : { names: namesOrGuests };
  return client.post(`/event-concierge/plans/${planId}/guests/bulk`, body).then((r) => r.data);
};

export const addEventCollaborator = (planId, email) =>
  client.post(`/event-concierge/plans/${planId}/collaborators`, { email }).then((r) => r.data);

export const removeEventCollaborator = (planId, userId) =>
  client.delete(`/event-concierge/plans/${planId}/collaborators/${userId}`).then((r) => r.data);

export const updateEventGuest = (guestId, data) =>
  client.patch(`/event-concierge/guests/${guestId}`, data).then((r) => r.data);

export const deleteEventGuest = (guestId) =>
  client.delete(`/event-concierge/guests/${guestId}`).then((r) => r.data);

export const markGuestsInvited = (planId) =>
  client.post(`/event-concierge/plans/${planId}/guests/mark-invited`).then((r) => r.data);

export const sendGuestInviteEmail = (guestId) =>
  client.post(`/event-concierge/guests/${guestId}/send-invite`).then((r) => r.data);

export const getInvite = (token) =>
  client.get(`/event-concierge/invite/${token}`).then((r) => r.data);

export const submitRsvp = (token, data) =>
  client.post(`/event-concierge/invite/${token}/rsvp`, data).then((r) => r.data);

export const getShareEvent = (shareToken) =>
  client.get(`/event-concierge/share/${shareToken}`).then((r) => r.data);

export const addRegistryItem = (planId, data) =>
  client.post(`/event-concierge/plans/${planId}/registry`, data).then((r) => r.data);

export const removeRegistryItem = (itemId) =>
  client.delete(`/event-concierge/registry/${itemId}`).then((r) => r.data);

export const contributeToRegistry = (itemId, amount, note, access = {}) =>
  client.post(`/event-concierge/registry/${itemId}/contribute`, {
    amount,
    note,
    ...(access.share_token ? { share_token: access.share_token } : {}),
    ...(access.invite_token ? { invite_token: access.invite_token } : {}),
  }).then((r) => r.data);

export const claimRegistryItem = (itemId) =>
  client.post(`/event-concierge/registry/${itemId}/claim`).then((r) => r.data);

// ── Shared Event (v1): cart + one checkout + one timeline ────────────────────

/** Persist the venue / catering / floral selections on the plan. */
export const saveEventCart = (planId, cart) =>
  client.patch(`/event-concierge/plans/${planId}/cart`, cart).then((r) => r.data);

/** Attach a just-paid order to its need. body: { category, kind, ref_id } */
export const linkEventOrder = (planId, body) =>
  client.post(`/event-concierge/plans/${planId}/link-order`, body).then((r) => r.data);

/** Customer-facing status timeline for the venue / catering / floral pieces. */
export const getEventTimeline = (planId) =>
  client.get(`/event-concierge/plans/${planId}/timeline`).then((r) => r.data);

export const attachWeddingBookingToPlan = (bookingId, planId) =>
  client.post("/event-concierge/plans/from-wedding-booking", {
    booking_id: bookingId,
    ...(planId ? { plan_id: planId } : {}),
  }).then((r) => r.data);
