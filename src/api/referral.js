import client from './client';

// Recruit (Invite & Earn) + legacy apply. Recruit apply is Profile / Recruiter only —
// checkout must use bindCheckoutReferralCode (per-order Referral; never /referral/apply).
// Earnings accrue when recruits **receive** work; share rate is never exposed in the UI.

// The signed-in user's own recruiter code + how many people have used it.
export const getMyReferralCode = () =>
  client.get('/referral/my-code').then((r) => r.data?.data ?? r.data);

// Flat earnings: Recruit (Invite & Earn) at top-level; Friend Referral under data.engines.referral.
export const getReferralEarnings = () =>
  client.get('/referral/earnings').then((r) => r.data?.data ?? r.data);

// Range-aware overview: lifetime/cleared/pending totals + referred_users count.
export const getReferralOverview = (range = '28d') =>
  client.get('/referral/analytics/overview', { params: { range } }).then((r) => r.data?.data ?? r.data);

// Multi-ongoing recruits: public identity + linked_at + GMV + attributed earnings.
// filter: all | period | active · range: 7d|28d|90d|365d|lifetime
export const getMyRecruits = (filter = 'all', range = '28d') =>
  client.get('/referral/my-recruits', { params: { filter, range } }).then((r) => r.data?.data ?? r.data);

// Recruit apply (Profile / Recruiter consent). Do NOT call from checkout.
export const applyReferralCode = (codeOrUsername) =>
  client.post('/referral/apply', { ref_code: codeOrUsername }).then((r) => r.data);

/** First-touch recruiter from a share link (`?ref=`). Distinct from checkout session bind. */
export const RECRUIT_FIRST_TOUCH_KEY = 'recruit_first_touch';

export function stashFirstTouchRecruiter(code) {
  const c = String(code || '').trim();
  if (!c) return;
  try { localStorage.setItem(RECRUIT_FIRST_TOUCH_KEY, c); } catch { /* private mode */ }
}

export function peekFirstTouchRecruiter() {
  try { return String(localStorage.getItem(RECRUIT_FIRST_TOUCH_KEY) || '').trim(); }
  catch { return ''; }
}

export function clearFirstTouchRecruiter() {
  try { localStorage.removeItem(RECRUIT_FIRST_TOUCH_KEY); } catch { /* ignore */ }
}

/**
 * Bind the share-link creator as this user's one recruiter, if they don't have one yet.
 * Checkout `?ref=` still only pre-fills the order; this is the discovery/recruit lock.
 * 409 / "already" means someone else already has credit — we do not steal it.
 */
export async function claimFirstTouchRecruiter(code = peekFirstTouchRecruiter()) {
  const c = String(code || '').trim();
  if (!c) return { claimed: false };
  try {
    await applyReferralCode(c);
    clearFirstTouchRecruiter();
    return { claimed: true };
  } catch (err) {
    const status = err?.response?.status;
    const msg = String(err?.response?.data?.message || '');
    if (status === 409 || /already/i.test(msg)) {
      clearFirstTouchRecruiter();
      return { claimed: false, already: true };
    }
    if (status === 400 || status === 404) {
      clearFirstTouchRecruiter();
      return { claimed: false };
    }
    return { claimed: false, error: err };
  }
}

/**
 * Checkout friend-code bind — Referral for this order only.
 * Does not create a permanent Recruit link (never hits POST /referral/apply).
 * Stores the code in session until per-order Referral settlement ships.
 */
export function bindCheckoutReferralCode(code) {
  const c = String(code || '').trim();
  if (!c) {
    const err = new Error('Enter a referral code');
    err.response = { data: { message: 'Enter a referral code' } };
    throw err;
  }
  try {
    sessionStorage.setItem('checkout_referral_code', c);
  } catch {
    /* private mode / unavailable */
  }
  return { ok: true, code: c };
}

/** Read the session-bound checkout Referral code (if any). */
export function getCheckoutReferralCode() {
  try {
    return String(sessionStorage.getItem('checkout_referral_code') || '').trim();
  } catch {
    return '';
  }
}

/** Clear after a successful order place (optional). */
export function clearCheckoutReferralCode() {
  try {
    sessionStorage.removeItem('checkout_referral_code');
  } catch {
    /* ignore */
  }
}

// Whether the signed-in user already has a recruiter (and which codes they've applied).
export const getMyRecruiter = () =>
  client.get('/referral/my').then((r) => r.data?.data ?? r.data);

// --- Recruiter-initiated invites (consent-preserving) ---
// The recruiter invites a user by username; the invited user must Accept before the link
// (and its revenue-share) is created. Raw responses so callers can surface server messages
// (e.g. the "already has a recruiter" 409).

// Invite a user by username to be recruited by the signed-in user.
export const inviteToRecruit = (username) =>
  client.post('/referral/invite', { username }).then((r) => r.data);

// Pending invites the signed-in user has RECEIVED (people who want to recruit them).
export const getReceivedInvites = () =>
  client.get('/referral/invites').then((r) => r.data?.invites ?? []);

// Invites the signed-in user has SENT as a recruiter (any status).
export const getSentInvites = () =>
  client.get('/referral/sent-invites').then((r) => r.data?.invites ?? []);

export const acceptRecruitInvite = (inviteId) =>
  client.post(`/referral/invites/${inviteId}/accept`).then((r) => r.data);

export const declineRecruitInvite = (inviteId) =>
  client.post(`/referral/invites/${inviteId}/decline`).then((r) => r.data);

export const resendRecruitInvite = (inviteId) =>
  client.post(`/referral/invites/${inviteId}/resend`).then((r) => r.data);
