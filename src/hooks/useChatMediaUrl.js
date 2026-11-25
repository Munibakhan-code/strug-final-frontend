import { useEffect, useState } from 'react';
import { getChatMediaDisplayUrlSync, resolveChatMediaDisplayUrlAsync } from '../utils/chatMedia.js';

export function useChatMediaUrl(url) {
  const [displayUrl, setDisplayUrl] = useState(() => getChatMediaDisplayUrlSync(url));

  useEffect(() => {
    let cancelled = false;
    const immediate = getChatMediaDisplayUrlSync(url);
    setDisplayUrl(immediate);
    if (immediate) return undefined;

    resolveChatMediaDisplayUrlAsync(url).then((next) => {
      if (!cancelled && next) setDisplayUrl(next);
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return displayUrl;
}
