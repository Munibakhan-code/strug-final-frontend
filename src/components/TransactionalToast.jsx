import React from 'react';
import { WifiOffIcon } from './icons.jsx';

const DEFAULT_THEME = { accent: '#2563eb' };

// Toasts are pushed from plain .js hooks, which are not JSX-transformed — so a caller passes an icon
// KEY (`icon: 'wifi-off'`) rather than a React element, and this maps it to a component. Callers that
// pass nothing keep the previous neutral mark, so existing toasts are unchanged.
const TOAST_ICONS = { 'wifi-off': WifiOffIcon };

function ToastCard({ toast, onDismiss, onOpen, onAction }) {
  const theme = toast.theme ?? DEFAULT_THEME;
  const ToastIcon = TOAST_ICONS[toast.icon];
  const actions = Array.isArray(toast.actions) ? toast.actions : [];
  const navigable = Boolean(toast.nav) && actions.length === 0;
  const open = () => { if (navigable) onOpen?.(toast.nav, toast); };

  return (
    <div
      data-testid={`toast-${toast.key ?? 'legacy'}`}
      role={navigable ? 'button' : 'status'}
      aria-label={navigable ? `${toast.title}: ${toast.body || ''}` : undefined}
      aria-live="polite"
      aria-atomic="true"
      tabIndex={navigable ? 0 : undefined}
      onClick={open}
      onKeyDown={(event) => {
        if (navigable && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          open();
        }
      }}
      style={{
        width: 'min(380px, calc(100vw - 32px))',
        background: 'linear-gradient(180deg, var(--color-surface-raised) 0%, var(--color-surface) 100%)',
        border: `1px solid ${theme.accent}`,
        borderRadius: 14,
        padding: '14px 16px',
        boxShadow: '0 14px 44px var(--color-shadow)',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        cursor: navigable ? 'pointer' : 'default',
        animation: 'chatToastIn 0.22s ease both',
      }}
    >
      <div aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 10, background: `${theme.accent}22`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.accent, fontSize: 18 }}>
        {ToastIcon ? <ToastIcon s={20} /> : '●'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, margin: 0 }}>{toast.title}</p>
        {toast.body && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.4, margin: '3px 0 0' }}>{toast.body}</p>}
        {toast.error && <p role="alert" style={{ fontSize: 11, color: '#fca5a5', margin: '7px 0 0' }}>{toast.error}</p>}
        {actions.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {actions.map((action, index) => {
              const working = toast.state === 'working' && (!toast.workingAction || toast.workingAction === action.id || index === 0);
              return (
                <button
                  key={action.id ?? action.label}
                  type="button"
                  disabled={toast.state === 'working'}
                  onClick={(event) => { event.stopPropagation(); onAction?.(toast, action); }}
                  style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${action.intent === 'secondary' ? 'var(--color-border)' : theme.accent}`, background: action.intent === 'secondary' ? 'transparent' : theme.accent, color: action.intent === 'secondary' ? 'var(--color-text-primary)' : '#fff', fontSize: 12, fontWeight: 700, cursor: toast.state === 'working' ? 'wait' : 'pointer', opacity: toast.state === 'working' ? 0.65 : 1 }}
                >
                  {working ? `${action.label}ing…` : action.label}
                </button>
              );
            })}
          </div>
        )}
        {navigable && <p style={{ fontSize: 10, color: theme.accent, margin: '7px 0 0' }}>Tap to view</p>}
      </div>
      <button type="button" aria-label="Dismiss" onClick={(event) => { event.stopPropagation(); onDismiss?.(toast.key); }} className="text-text-secondary" style={{ background: 'none', border: 0, fontSize: 18, cursor: 'pointer', padding: 0 }}>×</button>
    </div>
  );
}

export function TransactionalToast({ toast, toasts, onDismiss, onOpen, onAction }) {
  const items = Array.isArray(toasts) ? toasts : (toast ? [toast] : []);
  if (!items.length) return null;
  return (
    <div style={{ position: 'fixed', top: 'max(20px, env(safe-area-inset-top))', right: 16, zIndex: 220, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 'calc(100vh - 110px)', overflow: 'auto' }}>
      {items.map((item, index) => <ToastCard key={item.key ?? index} toast={item} onDismiss={onDismiss} onOpen={onOpen} onAction={onAction} />)}
    </div>
  );
}
