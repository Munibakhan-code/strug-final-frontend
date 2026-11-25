import i18n from '../i18n/index.js';

export function timeAgo(dateStr) {
  if (dateStr == null || dateStr === "") return i18n.t('common.justNow');
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return i18n.t('common.justNow');
  const diff = Date.now() - t;
  if (!Number.isFinite(diff)) return i18n.t('common.justNow');
  const m = Math.floor(diff / 60000);
  if (m < 1) return i18n.t('common.justNow');
  if (m < 60) return i18n.t('common.timeAgoMinutes', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return i18n.t('common.timeAgoHours', { count: h });
  const d = Math.floor(h / 24);
  return i18n.t('common.timeAgoDays', { count: d });
}
