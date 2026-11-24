'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  SeasonalEvent,
  SeasonalEventsPayload,
  SeasonalEventStatus,
} from '../types/seasonal-events';

const DEFAULT_ENDPOINT = '/api/seasonal-events';
/** Short TTL: event participation and ranks move quickly during live events. */
const DEFAULT_TTL_MS = 30_000;

export type SeasonalEventsFetcher = (
  url: string,
  init: RequestInit,
) => Promise<SeasonalEventsPayload>;

export interface UseSeasonalEventsOptions {
  /** When provided, the hook asks the API for this user's participation/rank. */
  userId?: string | number | null;
  /** API path. Defaults to `/api/seasonal-events`. */
  endpoint?: string;
  /** Cache lifetime in milliseconds. Defaults to 30s. */
  ttlMs?: number;
  /** Injectable fetcher (useful for tests or auth-aware clients). */
  fetcher?: SeasonalEventsFetcher;
  /** Set to false to skip fetching entirely. */
  enabled?: boolean;
}

export interface UseSeasonalEventsResult {
  /** Every event returned by the API (active, upcoming and ended). */
  events: SeasonalEvent[];
  /** Convenience subset of `events` that is currently running. */
  activeEvents: SeasonalEvent[];
  loading: boolean;
  error: string | null;
  /** Epoch ms of the cached response currently displayed, or null. */
  fetchedAt: number | null;
  /** True once the displayed data is older than `ttlMs`. */
  isStale: boolean;
  /** Re-fetch, bypassing the cache. */
  refresh: () => Promise<void>;
  /** Event-specific rank for the requested user, or null. */
  getRank: (eventId: string) => number | null;
}

interface CacheEntry {
  events: SeasonalEvent[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<SeasonalEvent[]>>();

const readCache = (key: string): CacheEntry | undefined => cache.get(key);

/** Clears cached seasonal events. Pass a key to clear a single entry. */
export const clearSeasonalEventsCache = (key?: string): void => {
  if (key) {
    cache.delete(key);
    return;
  }
  cache.clear();
};

const defaultFetcher: SeasonalEventsFetcher = async (url, init) => {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Failed to load seasonal events (${response.status})`);
  }
  return response.json() as Promise<SeasonalEventsPayload>;
};

const normalizeEvents = (payload: SeasonalEventsPayload): SeasonalEvent[] => {
  if (Array.isArray(payload)) return payload;
  if (payload && 'events' in payload && Array.isArray(payload.events)) {
    return payload.events;
  }
  if (payload && 'data' in payload && Array.isArray(payload.data)) {
    return payload.data;
  }
  throw new Error('Unexpected seasonal events response');
};

const buildUrl = (
  endpoint: string,
  userId?: string | number | null,
): string => {
  if (userId === undefined || userId === null || userId === '') return endpoint;
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}userId=${encodeURIComponent(String(userId))}`;
};

const isActive = (event: SeasonalEvent, now: number): boolean => {
  if (event.status) return event.status === 'ACTIVE';
  // Fall back to the event window when the API omits an explicit status.
  const startsAt = Date.parse(event.startsAt);
  const endsAt = Date.parse(event.endsAt);
  if (!Number.isNaN(startsAt) && now < startsAt) return false;
  if (!Number.isNaN(endsAt) && now > endsAt) return false;
  return true;
};

const fetchEvents = async (
  key: string,
  url: string,
  fetcher: SeasonalEventsFetcher,
  force: boolean,
): Promise<SeasonalEvent[]> => {
  if (force) cache.delete(key);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const payload = await fetcher(url, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    const events = normalizeEvents(payload);
    cache.set(key, { events, fetchedAt: Date.now() });
    return events;
  })();

  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  return 'Failed to load seasonal events';
};

/**
 * Fetches active seasonal events with their reward pools plus the current
 * user's participation status and leaderboard rank.
 *
 * Responses are cached in memory for a short TTL (30s by default) and
 * concurrent callers share a single in-flight request.
 */
export const useSeasonalEvents = (
  options: UseSeasonalEventsOptions = {},
): UseSeasonalEventsResult => {
  const {
    userId,
    endpoint = DEFAULT_ENDPOINT,
    ttlMs = DEFAULT_TTL_MS,
    fetcher = defaultFetcher,
    enabled = true,
  } = options;

  const cacheKey = `${endpoint}::${userId ?? 'anonymous'}`;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [events, setEvents] = useState<SeasonalEvent[]>(() => {
    const cached = readCache(cacheKey);
    return cached ? cached.events : [];
  });
  const [fetchedAt, setFetchedAt] = useState<number | null>(() => {
    const cached = readCache(cacheKey);
    return cached ? cached.fetchedAt : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;

      const cached = readCache(cacheKey);
      if (!force && cached && Date.now() - cached.fetchedAt < ttlMs) {
        setEvents(cached.events);
        setFetchedAt(cached.fetchedAt);
        setError(null);
        setLoading(false);
        return;
      }

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const nextEvents = await fetchEvents(
          cacheKey,
          buildUrl(endpoint, userId),
          fetcherRef.current,
          force,
        );
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        setEvents(nextEvents);
        setFetchedAt(readCache(cacheKey)?.fetchedAt ?? Date.now());
        setIsStale(false);
      } catch (err) {
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        setError(toErrorMessage(err));
      } finally {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [cacheKey, enabled, endpoint, ttlMs, userId],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    if (fetchedAt === null) {
      setIsStale(false);
      return;
    }
    const remaining = fetchedAt + ttlMs - Date.now();
    if (remaining <= 0) {
      setIsStale(true);
      return;
    }
    setIsStale(false);
    const timer = setTimeout(() => setIsStale(true), remaining);
    return () => clearTimeout(timer);
  }, [fetchedAt, ttlMs]);

  const refresh = useCallback(async () => {
    clearSeasonalEventsCache(cacheKey);
    await load(true);
  }, [cacheKey, load]);

  const activeEvents = useMemo(() => {
    const now = Date.now();
    return events.filter((event) => isActive(event, now));
  }, [events]);

  const getRank = useCallback(
    (eventId: string): number | null => {
      const event = events.find((candidate) => candidate.id === eventId);
      return event?.participation?.rank ?? null;
    },
    [events],
  );

  return {
    events,
    activeEvents,
    loading,
    error,
    fetchedAt,
    isStale,
    refresh,
    getRank,
  };
};

export type { SeasonalEvent, SeasonalEventStatus };
export default useSeasonalEvents;
