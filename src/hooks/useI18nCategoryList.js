import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Category filter pills whose labels react to language changes.
 * @param {Array<{ id: string, labelKey: string, color?: string, match?: string|null, [key: string]: unknown }>} defs
 */
export function useI18nCategoryList(defs) {
  const { t } = useTranslation();
  return useMemo(
    () =>
      defs.map((d) => ({
        ...d,
        label: d.labelKey ? t(d.labelKey) : d.label,
      })),
    [t, defs],
  );
}

/** Filter list items by stable category id (defs[].match = English/API category value). */
export function matchesCategory(activeId, itemValue, categories, allId = 'all') {
  if (!activeId || activeId === allId) return true;
  const cat = categories.find((c) => c.id === activeId);
  if (!cat || cat.match == null) return true;
  return itemValue === cat.match;
}
