/** Sidebar / bottom-nav label — feed & rideshare use dedicated nav keys. */
export function sidebarNavLabel(id, fallback, t) {
  if (id === 'more') return t('nav.more', { defaultValue: fallback || 'More' });
  if (id === 'feed') return t('nav.feed', { defaultValue: t('feed.title', { defaultValue: fallback }) });
  if (id === 'rideshare') return t('nav.rideshare', { defaultValue: t('rideshare.title', { defaultValue: fallback }) });
  if (id === 'ondemand') return t('nav.ondemand', { defaultValue: t('ondemand.title', { defaultValue: fallback }) });
  return t(`nav.${id}`, { defaultValue: fallback });
}
