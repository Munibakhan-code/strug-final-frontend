export const TOAST_THEMES = Object.freeze({
  rideshare: { accent: '#3b82f6', icon: 'car' },
  courier: { accent: '#06b6d4', icon: 'delivery' },
  food: { accent: '#f97316', icon: 'food' },
  ecommerce: { accent: '#8b5cf6', icon: 'bag' },
  booking: { accent: '#14b8a6', icon: 'calendar' },
  work: { accent: '#6366f1', icon: 'work' },
  quotes: { accent: '#6366f1', icon: 'quote' },
  chat: { accent: '#a855f7', icon: 'message' },
  payments: { accent: '#22c55e', icon: 'payment' },
  wallet: { accent: '#22c55e', icon: 'wallet' },
  system: { accent: '#f59e0b', icon: 'shield' },
});

const NAV_BY_VERTICAL = {
  rideshare: 'rideshare', courier: 'ondemand', food: 'sd-food', ecommerce: 'sd-ecommerce',
  booking: 'orders', work: 'sd-work', quotes: 'sd-work', chat: 'messages',
  payments: 'wallet', wallet: 'wallet', system: 'settings',
};

export function resolveToastTheme(vertical, variant = 'info', fallbackAccent = '#2563eb') {
  if (variant === 'error' || variant === 'danger') return { accent: '#ef4444', icon: 'error' };
  if (variant === 'success') return { accent: '#22c55e', icon: 'success' };
  return TOAST_THEMES[vertical] ?? { accent: fallbackAccent, icon: 'bell' };
}

export function toastEntityKey(vertical, entityType, entityId) {
  if (!entityType || entityId == null) return null;
  return `${vertical || 'unknown'}:${entityType}:${entityId}`;
}

export function normalizeToastEvent(payload, { source = 'unified', fallbackAccent } = {}) {
  if (!payload?.title) return null;
  const vertical = source === 'chat' ? 'chat' : (payload.vertical || 'system');
  const channelId = payload.channelId ?? payload.channel_id;
  const stableKey = source === 'chat' && channelId != null
    ? `chat:channel:${channelId}`
    : toastEntityKey(vertical, payload.entity_type ?? payload.entityType, payload.entity_id ?? payload.entityId);
  const variant = payload.variant || (payload.success === false ? 'error' : 'info');
  return {
    ...payload,
    key: payload.key || stableKey || `${source}:${payload.notification_id ?? payload.title}:${payload.body ?? ''}`,
    source,
    vertical,
    title: payload.title,
    body: payload.body || '',
    nav: payload.action_url || payload.nav || NAV_BY_VERTICAL[vertical] || null,
    urgency: payload.urgency || 'ambient',
    variant,
    theme: resolveToastTheme(vertical, variant, fallbackAccent),
  };
}
