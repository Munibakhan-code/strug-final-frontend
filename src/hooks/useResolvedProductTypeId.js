import { useEffect, useState } from 'react';
import { getProductTypes } from '../api/shop.js';
import { resolveProductTypeIdByName } from '../utils/shopVerticalHelpers.js';

/**
 * Resolve product_type_id by canonical type name (ids differ per environment).
 * Prefer cart/listing product_type_id via pickCheckoutProductTypeId when available.
 */
export function useResolvedProductTypeId(typeName) {
  const [typeId, setTypeId] = useState(null);

  useEffect(() => {
    if (!typeName) {
      setTypeId(null);
      return undefined;
    }
    let cancelled = false;
    getProductTypes()
      .then((rows) => {
        if (cancelled) return;
        setTypeId(resolveProductTypeIdByName(rows, typeName));
      })
      .catch(() => {
        if (!cancelled) setTypeId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [typeName]);

  return typeId;
}
