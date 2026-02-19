import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadCachedFlags,
  loadCachedConfigs,
  saveFlagsToCache,
  saveConfigsToCache,
  clearCache,
  setAsyncStorage,
} from "../storage";

// Mock AsyncStorage as an in-memory store
const store = new Map<string, string>();
const mockAsyncStorage = {
  getItem: vi.fn(async (key: string) => store.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: vi.fn(async (key: string) => {
    store.delete(key);
  }),
  multiRemove: vi.fn(async (keys: string[]) => {
    keys.forEach((k) => store.delete(k));
  }),
};

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  setAsyncStorage(mockAsyncStorage);
});

describe("saveFlagsToCache / loadCachedFlags", () => {
  it("persists and retrieves flags", async () => {
    const flags = { "feature-a": true, "feature-b": "variant-1" };
    await saveFlagsToCache("test-key", flags);

    const loaded = await loadCachedFlags("test-key");
    expect(loaded).toEqual(flags);
  });

  it("returns null when no cached data", async () => {
    const loaded = await loadCachedFlags("nonexistent");
    expect(loaded).toBeNull();
  });

  it("uses namespaced cache keys", async () => {
    await saveFlagsToCache("env-a", { flag: true });
    await saveFlagsToCache("env-b", { flag: false });

    expect(await loadCachedFlags("env-a")).toEqual({ flag: true });
    expect(await loadCachedFlags("env-b")).toEqual({ flag: false });
  });
});

describe("saveConfigsToCache / loadCachedConfigs", () => {
  it("persists and retrieves configs", async () => {
    const configs = { pricing: { basic: 9.99 }, theme: "dark" };
    await saveConfigsToCache("test-key", configs);

    const loaded = await loadCachedConfigs("test-key");
    expect(loaded).toEqual(configs);
  });

  it("returns null when no cached data", async () => {
    const loaded = await loadCachedConfigs("nonexistent");
    expect(loaded).toBeNull();
  });
});

describe("clearCache", () => {
  it("removes both flags and configs for a prefix", async () => {
    await saveFlagsToCache("test-key", { flag: true });
    await saveConfigsToCache("test-key", { config: "value" });

    await clearCache("test-key");

    expect(await loadCachedFlags("test-key")).toBeNull();
    expect(await loadCachedConfigs("test-key")).toBeNull();
  });

  it("does not affect other prefixes", async () => {
    await saveFlagsToCache("keep-me", { flag: true });
    await saveFlagsToCache("delete-me", { flag: false });

    await clearCache("delete-me");

    expect(await loadCachedFlags("keep-me")).toEqual({ flag: true });
    expect(await loadCachedFlags("delete-me")).toBeNull();
  });
});

describe("error handling", () => {
  it("returns null on getItem failure", async () => {
    mockAsyncStorage.getItem.mockRejectedValueOnce(new Error("disk full"));
    const result = await loadCachedFlags("test-key");
    expect(result).toBeNull();
  });

  it("silently ignores setItem failure", async () => {
    mockAsyncStorage.setItem.mockRejectedValueOnce(new Error("disk full"));
    // Should not throw
    await saveFlagsToCache("test-key", { flag: true });
  });
});

describe("no AsyncStorage available", () => {
  it("returns null when AsyncStorage is not installed", async () => {
    setAsyncStorage(null);
    const result = await loadCachedFlags("test-key");
    expect(result).toBeNull();
  });

  it("silently ignores writes when AsyncStorage is not installed", async () => {
    setAsyncStorage(null);
    // Should not throw
    await saveFlagsToCache("test-key", { flag: true });
  });
});
