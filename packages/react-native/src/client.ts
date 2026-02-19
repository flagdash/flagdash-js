import { FlagDashClient } from "@flagdash/sdk";
import type { FlagValues, ConfigValues, EvaluationContext, FlagDetail, AiConfig, ListAiConfigsOptions, EventListener, FlagDashEvent } from "@flagdash/sdk";
import type { ReactNativeConfig } from "./types";
import { loadCachedFlags, loadCachedConfigs, saveFlagsToCache, saveConfigsToCache, clearCache } from "./storage";
import { createAppStateListener } from "./lifecycle";

export class ReactNativeClient {
  private client: FlagDashClient;
  private lifecycleListener: { remove: () => void } | null = null;
  private cachePrefix: string;
  private enableCache: boolean;
  private enableLifecycle: boolean;
  private destroyed = false;

  constructor(config: ReactNativeConfig) {
    this.enableCache = config.enableCache !== false;
    this.enableLifecycle = config.enableLifecycle !== false;
    // Use first 8 chars of sdkKey as cache namespace
    this.cachePrefix = config.sdkKey.slice(0, 16);

    this.client = new FlagDashClient({
      sdkKey: config.sdkKey,
      baseUrl: config.baseUrl,
      refreshInterval: config.refreshInterval,
      timeout: config.timeout,
      realtime: config.realtime,
    });

    // Persist flag/config updates to AsyncStorage
    if (this.enableCache) {
      this.client.on("flags_updated", () => {
        if (this.destroyed) return;
        this.client.allFlags().then((flags) => {
          if (!this.destroyed) saveFlagsToCache(this.cachePrefix, flags);
        });
      });

      this.client.on("configs_updated", () => {
        if (this.destroyed) return;
        this.client.allConfigs().then((configs) => {
          if (!this.destroyed) saveConfigsToCache(this.cachePrefix, configs);
        });
      });
    }

    // AppState lifecycle: pause on background, refresh on foreground
    if (this.enableLifecycle) {
      this.lifecycleListener = createAppStateListener({
        onForeground: () => {
          if (this.destroyed) return;
          // Trigger a refresh when coming back to foreground
          this.client.allFlags();
          this.client.allConfigs();
        },
        onBackground: () => {
          // No action needed — polling continues with normal interval
          // Stopping/restarting polling is handled internally by the core client
        },
      });
    }
  }

  /** Load cached flags and configs from AsyncStorage. Call before waiting for network. */
  async loadCache(): Promise<{ flags: FlagValues | null; configs: ConfigValues | null }> {
    if (!this.enableCache) return { flags: null, configs: null };
    const [flags, configs] = await Promise.all([
      loadCachedFlags(this.cachePrefix),
      loadCachedConfigs(this.cachePrefix),
    ]);
    return { flags, configs };
  }

  /** Clear all cached data from AsyncStorage */
  async clearCache(): Promise<void> {
    await clearCache(this.cachePrefix);
  }

  // Delegate core client methods

  flag<T = boolean>(key: string, context?: EvaluationContext, defaultValue?: T): Promise<T> {
    return this.client.flag<T>(key, context, defaultValue);
  }

  flagDetail<T = unknown>(key: string, context?: EvaluationContext, defaultValue?: T): Promise<FlagDetail<T>> {
    return this.client.flagDetail<T>(key, context, defaultValue);
  }

  allFlags(context?: EvaluationContext): Promise<FlagValues> {
    return this.client.allFlags(context);
  }

  config<T = unknown>(key: string, defaultValue?: T): Promise<T> {
    return this.client.config<T>(key, defaultValue);
  }

  allConfigs(): Promise<ConfigValues> {
    return this.client.allConfigs();
  }

  aiConfig(fileName: string, defaultContent?: string): Promise<AiConfig | null> {
    return this.client.aiConfig(fileName, defaultContent);
  }

  listAiConfigs(options?: ListAiConfigsOptions): Promise<AiConfig[]> {
    return this.client.listAiConfigs(options);
  }

  on(event: FlagDashEvent, listener: EventListener): () => void {
    return this.client.on(event, listener);
  }

  get isRealtimeEnabled(): boolean {
    return this.client.isRealtimeEnabled;
  }

  enableRealtime(): void {
    this.client.enableRealtime();
  }

  disableRealtime(): void {
    this.client.disableRealtime();
  }

  destroy(): void {
    this.destroyed = true;
    this.lifecycleListener?.remove();
    this.lifecycleListener = null;
    this.client.destroy();
  }
}
