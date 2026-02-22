const cache = new Map<string, { data: unknown; expires: number }>();
const TTL = 5_000;
const MAX_SIZE = 1_000;

export function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T): T {
  // Evict expired entries when approaching max size
  if (cache.size >= MAX_SIZE) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expires) cache.delete(k);
    }
    // If still at capacity, evict oldest entry (Map.keys() always yields when size > 0)
    if (cache.size >= MAX_SIZE) {
      cache.delete(cache.keys().next().value!);
    }
  }
  cache.set(key, { data, expires: Date.now() + TTL });
  return data;
}

export function invalidateCache(key?: string): void {
  if (key === undefined) {
    cache.clear();
  } else {
    cache.delete(key);
  }
}
