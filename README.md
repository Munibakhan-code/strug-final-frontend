# Strug — Final Frontend

The **live Strug app**: the logged-in social / video / verticals experience (feed,
videos, live, messaging, and the many marketplace verticals — food, ecommerce,
rideshare, real estate, etc.). Built with **React + Vite**, inline-style theming, and
**react-i18next** internationalization (57 languages).

> Sibling repo `strug_frontend-main` is the public strug.ca marketing/auth site. This
> repo is the authenticated product app.

## Commands

```bash
npm install
npm run dev       # Vite dev server — http://localhost:5173
npm run build     # production build
npm test          # vitest (unit + component)
npm run test:e2e  # playwright, against staging
npm run lint      # ESLint — fails on errors only (warnings are reported, not blocking)
npm run preview   # preview a production build
```

## Architecture (short version — see CLAUDE.md for the detail)

- **Navigation:** `AppInner` (in `src/App.jsx`) holds `activeNav` state and renders the
  active page. Pages are now lazy-loaded (`React.lazy`) and most have been extracted
  into `src/pages/`. `App.jsx` is mainly the navigation shell + lazy route wiring.
- **Pages:** `src/pages/*.jsx` (one per vertical/screen). API clients in `src/api/`.
- **Shared UI:** `src/components/` — `icons.jsx`, `skeletons.jsx`, `shared.jsx`;
  the page-load skeleton hook is `src/hooks/usePageLoad.js`.
- **Styling:** Tailwind CSS for new UI code (see `CLAUDE.md`); existing screens are
  mostly pre-Tailwind inline style objects. Dark theme, accent blue `#2563eb`.
- **i18n:** `src/i18n/` — keys defined in `locales/en.json` (source of truth); other
  locales are English stubs until translated. RTL handled for ar/he/fa/ur/ps.
- **Error boundary:** `src/ErrorBoundary.jsx` (class component) wraps the app in `main.jsx`.
  It reports the crash through `src/utils/observability.js` — a render crash on a routed page
  used to render the fallback and leave no trace anywhere.
- **Crash reporting:** `src/utils/observability.js`. Completely inert without
  `VITE_SENTRY_DSN`, so dev and the test suite are unaffected. Every URL query value is
  redacted before send (the session handoff uses `?token=`), console breadcrumbs are dropped,
  and the viewer is identified by account id only. See `.env.example`.

## Environment

Config is read from Vite env vars (`VITE_*`) in `.env` / `.env.local` — **gitignored**,
never commit real keys (PayPal/Stripe/Google Maps/OAuth client IDs, API + socket URLs).

## Linting

`npm run lint` fails on **errors only**. Warnings are still printed so we can clean them up over
time, but they do not fail CI. Errors are the defect-class rules — `no-undef` among them, which
catches an identifier referenced but never imported. Two such bugs shipped to production before
lint ran in CI: `CardElement` in `Raise.jsx` (card donations threw on submit) and `DIGPROD_CATS`
in `DigitalProducts.jsx` (the page rendered blank).

`src/test/stripeElementBindings.test.js` guards the Stripe half of that class specifically:
every element passed to `elements.getElement(...)` must be imported in that file.


## Node and npm versions

CI runs **Node 20 / npm 10**. `.nvmrc` and the `engines` field record that.

**Regenerating the lockfile:** npm 11 resolves transitive dependencies differently from npm 10
and omits nested entries that `npm ci` on npm 10 still requires, so a lockfile written by
npm 11 fails CI at the install step ("Missing: <pkg> from lock file"). If `npm -v` shows 11,
regenerate with the version CI uses:

```bash
npx npm@10.8.2 install --package-lock-only
```

## Adding a test

Every test file must be listed in exactly one vertical in `test/verticals.manifest.json`, or
`npm run guard:verify-manifest` fails CI. Cross-cutting tests go in `core`, which has
`always: true`; page-specific tests go in that page’s vertical alongside a `watch` glob for it.

## Notes

- An ongoing refactor is splitting the historically-monolithic `App.jsx` into
  per-page modules; status + the page-move safety protocol live in `CLAUDE.md`.
- Screenshots, `*.mp4`, debug `.cjs`/`.py` scripts, and `scripts/` are gitignored
  (development/testing artifacts).
