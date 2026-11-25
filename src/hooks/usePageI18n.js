import { useTranslation } from 'react-i18next';

/**
 * Standard i18n for marketplace pages — title from nav.*, search from pages.* or module namespace.
 * @param {string} pageKey — matches nav key (e.g. "events", "wedding", "ondemand")
 * @param {string} [moduleKey] — optional existing namespace (e.g. "events" uses events.searchPlaceholder)
 */
export function usePageI18n(pageKey, moduleKey) {
  const { t, i18n } = useTranslation();
  const mod = moduleKey ?? pageKey;
  const title = t(`nav.${pageKey}`, { defaultValue: pageKey });
  const landingTitle =
    t(`${mod}.landingTitle`, { defaultValue: '' }) ||
    t(`${mod}.title`, { defaultValue: '' }) ||
    title;
  const searchPlaceholder =
    t(`${mod}.searchPlaceholder`, { defaultValue: '' }) ||
    t(`pages.${pageKey}.searchPlaceholder`, { defaultValue: '' }) ||
    t('pages.defaultSearch', { page: title });
  return { t, i18n, title, landingTitle, searchPlaceholder, pageKey };
}
