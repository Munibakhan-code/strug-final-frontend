import { useCallback, useEffect, useMemo, useState } from 'react';

export function useToastQueue({ maxVisible = 3, timeoutMs = 6500 } = {}) {
  const [items, setItems] = useState([]);

  const enqueue = useCallback((toast) => {
    if (!toast?.key || !toast?.title) return;
    setItems((current) => current.some((item) => item.key === toast.key)
      ? current
      : [...current, { state: 'idle', ...toast }]);
  }, []);

  const dismiss = useCallback((key) => {
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const replace = useCallback((key, patch) => {
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }, []);

  const setActionState = useCallback((key, state, error = null) => {
    replace(key, { state, error });
  }, [replace]);

  useEffect(() => {
    const timers = items
      .filter((item) => !item.persistent && item.state !== 'working')
      .map((item) => setTimeout(() => dismiss(item.key), item.timeoutMs ?? timeoutMs));
    return () => timers.forEach(clearTimeout);
  }, [items, dismiss, timeoutMs]);

  const visible = useMemo(() => items.slice(0, maxVisible), [items, maxVisible]);
  return { items, visible, enqueue, dismiss, replace, setActionState };
}
