import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCached, setCached, invalidateCache } from "../src/cache.js";

beforeEach(() => {
  invalidateCache(); // clear all
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getCached / setCached", () => {
  it("returns undefined for unknown keys", () => {
    expect(getCached("unknown")).toBeUndefined();
  });

  it("returns cached value within TTL", () => {
    setCached("key1", { foo: "bar" });
    expect(getCached("key1")).toEqual({ foo: "bar" });
  });

  it("returns undefined after TTL expires", () => {
    setCached("key1", { foo: "bar" });
    vi.advanceTimersByTime(5_001);
    expect(getCached("key1")).toBeUndefined();
  });

  it("returns value just before TTL expires", () => {
    setCached("key1", { foo: "bar" });
    vi.advanceTimersByTime(4_999);
    expect(getCached("key1")).toEqual({ foo: "bar" });
  });

  it("setCached returns the data passed in", () => {
    const data = { id: "abc" };
    const result = setCached("key1", data);
    expect(result).toBe(data);
  });

  it("isolates keys", () => {
    setCached("a", 1);
    setCached("b", 2);
    expect(getCached("a")).toBe(1);
    expect(getCached("b")).toBe(2);
  });
});

describe("invalidateCache", () => {
  it("invalidates a specific key", () => {
    setCached("a", 1);
    setCached("b", 2);
    invalidateCache("a");
    expect(getCached("a")).toBeUndefined();
    expect(getCached("b")).toBe(2);
  });

  it("clears all when called without key", () => {
    setCached("a", 1);
    setCached("b", 2);
    invalidateCache();
    expect(getCached("a")).toBeUndefined();
    expect(getCached("b")).toBeUndefined();
  });

  it("handles invalidating non-existent key gracefully", () => {
    invalidateCache("nonexistent");
    expect(getCached("nonexistent")).toBeUndefined();
  });
});

describe("cache eviction at max size", () => {
  it("evicts expired entries when reaching max size", () => {
    // Fill cache near max
    for (let i = 0; i < 1000; i++) {
      setCached(`key-${i}`, i);
    }
    // Expire all entries
    vi.advanceTimersByTime(5_001);
    // Adding one more should trigger cleanup of expired entries
    setCached("new-key", "value");
    expect(getCached("new-key")).toBe("value");
  });

  it("evicts oldest entry when max size reached and no expired entries", () => {
    for (let i = 0; i < 1000; i++) {
      setCached(`key-${i}`, i);
    }
    // All entries are fresh — oldest (key-0) gets evicted
    setCached("overflow-key", "overflow");
    expect(getCached("overflow-key")).toBe("overflow");
    // key-0 was evicted (oldest)
    expect(getCached("key-0")).toBeUndefined();
    // key-1 should still exist
    expect(getCached("key-1")).toBe(1);
  });
});
