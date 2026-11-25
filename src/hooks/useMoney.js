import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtMoney, getUserRegion } from '../utils/regionConfig.js';

/**
 * Location-aware money formatting for React components.
 * Amounts from the API are assumed to be in USD unless `from` is passed.
 *
 * @example
 * const { money } = useMoney();
 * <span>{money(29.99)}</span>           // PK user → "Rs 8,337.22"
 * <span>{money(100, 'CAD')}</span>
 */
export function useMoney() {
  const { i18n } = useTranslation();
  const region = useMemo(() => getUserRegion(), [i18n.language]);

  const money = useCallback(
    (amount, fromCurrency = 'CAD') =>
      fmtMoney(amount, { fromCurrency, locale: i18n.language, currency: region.currency }),
    [i18n.language, region.currency],
  );

  return { money, currency: region.currency, locale: i18n.language };
}
