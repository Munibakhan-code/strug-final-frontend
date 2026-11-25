import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getBrowseCategories,
  getLiveSessions,
  getBrowseVods,
  getCategoryVods,
  getCategoryClips,
} from '../../api/live.js';
import { mapApiSessionToStream, mapBrowseCategory, mapCategoryClip, mapCategoryVod } from './liveMappers.js';

const POLL_MS = 30_000;

/** Live browse hub — categories + live sessions from the API. */
export function useLiveBrowse({ categoryId = null, poll = true } = {}) {
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [streams, setStreams] = useState([]);
  const [streamsLoading, setStreamsLoading] = useState(true);
  const [recentVods, setRecentVods] = useState([]);
  const [vodsLoading, setVodsLoading] = useState(true);
  const [browseError, setBrowseError] = useState(null);

  const loadCategories = useCallback(() => {
    setCategoriesLoading(true);
    return getBrowseCategories()
      .then((res) => {
        const rows = Array.isArray(res?.data) ? res.data : [];
        setCategories(rows.map(mapBrowseCategory));
        setBrowseError(null);
      })
      .catch(() => {
        setCategories([]);
        setBrowseError('Could not load live categories. Check your connection and try again.');
      })
      .finally(() => setCategoriesLoading(false));
  }, []);

  // `silent` skips the loading flash so 30s polls don't blank the grid.
  const loadStreams = useCallback((opts = {}) => {
    const silent = !!opts.silent;
    if (!silent) setStreamsLoading(true);
    return getLiveSessions(categoryId ? { category_id: categoryId } : undefined)
      .then((res) => {
        const rows = Array.isArray(res?.data) ? res.data : [];
        setStreams(rows.map(mapApiSessionToStream));
        setBrowseError(null);
      })
      .catch(() => {
        setStreams([]);
        setBrowseError('Could not load live streams. Check your connection and try again.');
      })
      .finally(() => {
        if (!silent) setStreamsLoading(false);
      });
  }, [categoryId]);

  const loadVods = useCallback(() => {
    setVodsLoading(true);
    return getBrowseVods({ limit: 24 })
      .then((res) => {
        const rows = Array.isArray(res?.data) ? res.data : [];
        setRecentVods(rows.map(mapCategoryVod));
        setBrowseError(null);
      })
      .catch(() => {
        setRecentVods([]);
        setBrowseError('Could not load recent broadcasts. Check your connection and try again.');
      })
      .finally(() => setVodsLoading(false));
  }, []);

  useEffect(() => {
    loadCategories();
    loadVods();
  }, [loadCategories, loadVods]);

  useEffect(() => {
    loadStreams();
    if (!poll) return undefined;
    const id = setInterval(() => loadStreams({ silent: true }), POLL_MS);
    return () => clearInterval(id);
  }, [loadStreams, poll]);

  const recommendedCategories = useMemo(
    () => [...categories]
      .sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return (b.live_viewers ?? 0) - (a.live_viewers ?? 0);
      })
      .slice(0, 5),
    [categories],
  );

  return {
    categories,
    recommendedCategories,
    categoriesLoading,
    streams,
    streamsLoading,
    recentVods,
    vodsLoading,
    browseError,
    reloadCategories: loadCategories,
    reloadStreams: loadStreams,
    reloadVods: loadVods,
  };
}

/** Category detail page — live streams + VODs + clips for one category. */
export function useCategoryContent(categoryId) {
  const { streams, streamsLoading, reloadStreams } = useLiveBrowse({
    categoryId,
    poll: true,
  });
  const [vods, setVods] = useState([]);
  const [clips, setClips] = useState([]);
  const [vodsLoading, setVodsLoading] = useState(false);

  useEffect(() => {
    if (!categoryId) {
      setVods([]);
      setClips([]);
      return undefined;
    }
    let active = true;
    setVodsLoading(true);
    Promise.all([
      getCategoryVods(categoryId),
      getCategoryClips(categoryId),
    ])
      .then(([vodRes, clipRes]) => {
        if (!active) return;
        const vodRows = Array.isArray(vodRes?.data) ? vodRes.data : [];
        const clipRows = Array.isArray(clipRes?.data) ? clipRes.data : [];
        setVods(vodRows.map(mapCategoryVod));
        setClips(clipRows.map(mapCategoryClip));
      })
      .catch(() => {
        if (active) {
          setVods([]);
          setClips([]);
        }
      })
      .finally(() => {
        if (active) setVodsLoading(false);
      });
    return () => { active = false; };
  }, [categoryId]);

  return { streams, streamsLoading, vods, clips, vodsLoading, reloadStreams };
}
