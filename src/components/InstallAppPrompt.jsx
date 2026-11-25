import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  isIOSDevice,
  markInstallPromptDismissed,
  markInstallSuccess,
  shouldOfferInstall,
} from '../utils/pwaInstall.js';
import { requestChatPushPermission } from '../hooks/useChatPush.js';

// Chrome/Android fire `beforeinstallprompt` only once per page load and only when the page
// already has an active service worker registration (see main.jsx). We stash the event so the
// banner's own "Install" button can trigger it later, instead of relying on the browser's own
// (easily missed) address-bar affordance. iOS Safari never fires this event — there's no
// programmatic install API there, so we fall back to written "Add to Home Screen" steps.
export function InstallAppPrompt({ offsetBottom = 0 }) {
  const { t } = useTranslation();
  const [deferredEvent, setDeferredEvent] = useState(null);
  const [visible, setVisible] = useState(false);
  const [showIOSSteps, setShowIOSSteps] = useState(false);
  const ios = isIOSDevice();

  useEffect(() => {
    if (!shouldOfferInstall(Date.now())) return undefined;

    function onBeforeInstallPrompt(event) {
      event.preventDefault();
      setDeferredEvent(event);
      setVisible(true);
    }
    function onInstalled() {
      markInstallSuccess();
      setVisible(false);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // iOS has no beforeinstallprompt to wait for — offer the manual steps directly.
    let timer;
    if (ios) {
      timer = window.setTimeout(() => setVisible(true), 1500);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (timer) window.clearTimeout(timer);
    };
  }, [ios]);

  function dismiss() {
    markInstallPromptDismissed(Date.now());
    setVisible(false);
    setShowIOSSteps(false);
  }

  async function install() {
    if (!ios) {
      // Fire from this click (a real user gesture) so browsers that suppress
      // ungestured permission prompts still show it. No-ops if already decided.
      // Skipped on iOS: Safari can't grant push permission until the page is
      // actually added to the home screen, so there's nothing to request yet.
      requestChatPushPermission();
    }
    if (!deferredEvent) {
      if (ios) setShowIOSSteps(true);
      return;
    }
    deferredEvent.prompt();
    const { outcome } = await deferredEvent.userChoice;
    if (outcome === 'accepted') markInstallSuccess();
    else markInstallPromptDismissed(Date.now());
    setDeferredEvent(null);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={t('pwaInstall.title')}
      className="border border-border"
      // Exempts this banner from App.jsx's logged-out "click anywhere -> sign in" preview
      // gate — installing the app (and dismissing this banner) shouldn't require an account.
      data-preview-allow
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: `calc(max(16px, env(safe-area-inset-bottom)) + ${offsetBottom}px)`,
        // Must outrank the logged-out preview footer (App.jsx, zIndex: 4000). The offsetBottom
        // prop is meant to keep them from overlapping at all, but that's height-measurement
        // math (ResizeObserver, footer text wrap) — if it's ever off by a few px, the footer's
        // opaque background must not end up on top and eat the tap.
        zIndex: 4001,
        margin: '0 auto',
        maxWidth: 420,
        background: 'linear-gradient(180deg, var(--color-surface-raised) 0%, var(--color-surface) 100%)',
        borderRadius: 16,
        padding: '16px',
        boxShadow: '0 14px 44px var(--color-shadow)',
        animation: 'fadeUp 0.25s ease both',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <img
          src="/icons/icon-192.png"
          alt=""
          aria-hidden="true"
          width={44}
          height={44}
          style={{ borderRadius: 10, flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, margin: 0 }}>
            {t('pwaInstall.title')}
          </p>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.4, margin: '3px 0 0' }}>
            {t('pwaInstall.body')}
          </p>
        </div>
        <button
          type="button"
          aria-label={t('pwaInstall.dismiss')}
          onClick={dismiss}
          className="text-text-secondary"
          style={{ background: 'none', border: 0, fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {showIOSSteps ? (
        <ol
          className="text-text-secondary"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            lineHeight: 1.6,
            margin: '12px 0 0',
            paddingLeft: 18,
          }}
        >
          <li>{t('pwaInstall.iosStep1')}</li>
          <li>{t('pwaInstall.iosStep2')}</li>
        </ol>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            onClick={install}
            style={{
              flex: 1,
              padding: '10px',
              background: '#2563eb',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('pwaInstall.install')}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="bg-surface-raised border border-border text-text-primary"
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('pwaInstall.notNow')}
          </button>
        </div>
      )}
    </div>
  );
}
