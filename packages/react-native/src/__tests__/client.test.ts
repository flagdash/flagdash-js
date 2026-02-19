import { describe, it, expect, vi, beforeEach } from "vitest";
import { setAsyncStorage } from "../storage";
import { setAppState } from "../lifecycle";

// Mock core FlagDashClient
const mockListeners = new Map<string, Set<Function>>();
const mockClient = {
  flag: vi.fn().mockResolvedValue(true),
  flagDetail: vi.fn().mockResolvedValue({ key: "f", value: true, reason: "default", variationKey: null }),
  allFlags: vi.fn().mockResolvedValue({ "feature-a": true }),
  config: vi.fn().mockResolvedValue("value"),
  allConfigs: vi.fn().mockResolvedValue({ theme: "dark" }),
  aiConfig: vi.fn().mockResolvedValue(null),
  listAiConfigs: vi.fn().mockResolvedValue([]),
  on: vi.fn((event: string, listener: Function) => {
    if (!mockListeners.has(event)) mockListeners.set(event, new Set());
    mockListeners.get(event)!.add(listener);
    return () => mockListeners.get(event)?.delete(listener);
  }),
  destroy: vi.fn(),
  isRealtimeEnabled: false,
  enableRealtime: vi.fn(),
  disableRealtime: vi.fn(),
};

vi.mock("@flagdash/sdk", () => ({
  FlagDashClient: vi.fn(() => mockClient),
}));

// Mock AsyncStorage via injection
const store = new Map<string, string>();
const mockAsyncStorage = {
  getItem: vi.fn(async (key: string) => store.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
  removeItem: vi.fn(async (key: string) => { store.delete(key); }),
  multiRemove: vi.fn(async (keys: string[]) => { keys.forEach((k) => store.delete(k)); }),
};

// Mock AppState via injection
let appStateListeners: Function[] = [];
const mockAppState = {
  currentState: "active" as const,
  addEventListener: vi.fn((_type: string, listener: Function) => {
    appStateListeners.push(listener);
    return { remove: () => { appStateListeners = appStateListeners.filter((l) => l !== listener); } };
  }),
};

function emitClientEvent(event: string, data?: unknown) {
  mockListeners.get(event)?.forEach((l) => l(data));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListeners.clear();
  store.clear();
  appStateListeners = [];
  setAsyncStorage(mockAsyncStorage);
  setAppState(mockAppState);
});

// Import after mocks are set up
import { ReactNativeClient } from "../client";

describe("ReactNativeClient", () => {
  it("creates a core FlagDashClient with correct config", async () => {
    const client = new ReactNativeClient({ sdkKey: "client_abc123", baseUrl: "https://test.io" });

    // Verify the client delegates methods correctly
    const result = await client.flag("test", undefined, false);
    expect(mockClient.flag).toHaveBeenCalledWith("test", undefined, false);
    expect(result).toBe(true);
  });

  it("delegates flag() to core client", async () => {
    const client = new ReactNativeClient({ sdkKey: "client_abc123" });
    const result = await client.flag("my-flag", undefined, false);
    expect(mockClient.flag).toHaveBeenCalledWith("my-flag", undefined, false);
    expect(result).toBe(true);
  });

  it("delegates config() to core client", async () => {
    const client = new ReactNativeClient({ sdkKey: "client_abc123" });
    const result = await client.config("my-config", "default");
    expect(mockClient.config).toHaveBeenCalledWith("my-config", "default");
    expect(result).toBe("value");
  });

  it("persists flags to AsyncStorage on flags_updated", async () => {
    new ReactNativeClient({ sdkKey: "client_abc12345678" });

    // Trigger flags_updated event
    emitClientEvent("flags_updated");

    // Wait for async persistence
    await vi.waitFor(() => {
      const hasFlags = Array.from(store.keys()).some((k) => k.includes("flags"));
      expect(hasFlags).toBe(true);
    });
  });

  it("persists configs to AsyncStorage on configs_updated", async () => {
    new ReactNativeClient({ sdkKey: "client_abc12345678" });

    emitClientEvent("configs_updated");

    await vi.waitFor(() => {
      const hasConfigs = Array.from(store.keys()).some((k) => k.includes("configs"));
      expect(hasConfigs).toBe(true);
    });
  });

  it("skips caching when enableCache is false", async () => {
    new ReactNativeClient({ sdkKey: "client_abc123", enableCache: false });

    emitClientEvent("flags_updated");

    // Give some time for any async ops
    await new Promise((r) => setTimeout(r, 50));
    expect(store.size).toBe(0);
  });

  it("refreshes on foreground when lifecycle is enabled", () => {
    new ReactNativeClient({ sdkKey: "client_abc123" });

    // Simulate background → foreground
    appStateListeners.forEach((l) => l("background"));
    mockClient.allFlags.mockClear();
    mockClient.allConfigs.mockClear();

    appStateListeners.forEach((l) => l("active"));

    expect(mockClient.allFlags).toHaveBeenCalled();
    expect(mockClient.allConfigs).toHaveBeenCalled();
  });

  it("skips lifecycle when enableLifecycle is false", () => {
    new ReactNativeClient({ sdkKey: "client_abc123", enableLifecycle: false });

    expect(appStateListeners).toHaveLength(0);
  });

  it("destroy() cleans up everything", () => {
    const client = new ReactNativeClient({ sdkKey: "client_abc123" });
    const initialListeners = appStateListeners.length;

    client.destroy();

    expect(mockClient.destroy).toHaveBeenCalled();
    expect(appStateListeners.length).toBeLessThan(initialListeners);
  });

  it("loadCache() returns cached data", async () => {
    // sdkKey.slice(0, 16) = "client_abc12345_" (16 chars)
    const sdkKey = "client_abc12345_rest_of_key";
    const prefix = sdkKey.slice(0, 16);
    store.set(`flagdash:${prefix}:flags`, JSON.stringify({ flag: true }));
    store.set(`flagdash:${prefix}:configs`, JSON.stringify({ cfg: "val" }));

    const client = new ReactNativeClient({ sdkKey });
    const { flags, configs } = await client.loadCache();

    expect(flags).toEqual({ flag: true });
    expect(configs).toEqual({ cfg: "val" });
  });

  it("loadCache() returns nulls when cache is empty", async () => {
    const client = new ReactNativeClient({ sdkKey: "client_abc123" });
    const { flags, configs } = await client.loadCache();

    expect(flags).toBeNull();
    expect(configs).toBeNull();
  });
});
