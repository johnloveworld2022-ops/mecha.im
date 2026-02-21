const cache = new Map<string, { data: unknown; expires: number }>();
const TTL = 5_000;

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
