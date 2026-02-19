import type { FlagValues, ConfigValues } from "@flagdash/sdk";

export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  multiRemove(keys: string[]): Promise<void>;
}

let _asyncStorage: AsyncStorageLike | null = null;
let _resolved = false;

function getAsyncStorage(): AsyncStorageLike | null {
  if (_resolved) return _asyncStorage;
  _resolved = true;
  try {
    // Attempt dynamic resolve — works in React Native's bundler (Metro)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = (Function("try { return require('@react-native-async-storage/async-storage') } catch(e) { return null }"))();
    _asyncStorage = mod?.default ?? mod ?? null;
  } catch {
    _asyncStorage = null;
  }
  return _asyncStorage;
}

/** Inject a custom AsyncStorage implementation (useful for testing or custom backends) */
export function setAsyncStorage(storage: AsyncStorageLike | null): void {
  _asyncStorage = storage;
  _resolved = true;
}

function cacheKey(prefix: string, kind: "flags" | "configs"): string {
  return `flagdash:${prefix}:${kind}`;
}

export async function loadCachedFlags(
  prefix: string
): Promise<FlagValues | null> {
  const storage = getAsyncStorage();
  if (!storage) return null;
  try {
    const raw = await storage.getItem(cacheKey(prefix, "flags"));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function loadCachedConfigs(
  prefix: string
): Promise<ConfigValues | null> {
  const storage = getAsyncStorage();
  if (!storage) return null;
  try {
    const raw = await storage.getItem(cacheKey(prefix, "configs"));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveFlagsToCache(
  prefix: string,
  flags: FlagValues
): Promise<void> {
  const storage = getAsyncStorage();
  if (!storage) return;
  try {
    await storage.setItem(cacheKey(prefix, "flags"), JSON.stringify(flags));
  } catch {
    // Silently ignore write failures
  }
}

export async function saveConfigsToCache(
  prefix: string,
  configs: ConfigValues
): Promise<void> {
  const storage = getAsyncStorage();
  if (!storage) return;
  try {
    await storage.setItem(cacheKey(prefix, "configs"), JSON.stringify(configs));
  } catch {
    // Silently ignore write failures
  }
}

export async function clearCache(prefix: string): Promise<void> {
  const storage = getAsyncStorage();
  if (!storage) return;
  try {
    await storage.multiRemove([
      cacheKey(prefix, "flags"),
      cacheKey(prefix, "configs"),
    ]);
  } catch {
    // Silently ignore
  }
}
