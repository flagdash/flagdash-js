import type {
  FlagDashConfig,
  EvaluationContext,
  FlagValues,
  ConfigValues,
  EvaluateFlagsResponse,
  ConfigsListResponse,
  ConfigResponse,
  FlagDetail,
  FlagDetailResponse,
  AiConfig,
  AiConfigListResponse,
  AiConfigGetResponse,
  ListAiConfigsOptions,
  FlagDashEvent,
  EventListener,
} from "./types";

const DEFAULT_BASE_URL = "https://flagdash.io";
const DEFAULT_TIMEOUT = 5000;
const SSE_MAX_RETRIES = 5;
const SSE_FALLBACK_POLLING_INTERVAL = 30_000;

/**
 * Flatten an EvaluationContext into query-string parameters.
 *
 * Top-level keys are passed as-is.  Nested `user` object keys are promoted
 * to top-level with `user_` prefix (except `id` which becomes `user_id`).
 *
 * Example:
 *   { user: { id: "alice", plan: "pro" }, country: "US" }
 *   → "user_id=alice&user_plan=pro&country=US"
 */
function buildContextParams(context: EvaluationContext): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(context)) {
    if (key === "user" && typeof value === "object" && value !== null) {
      for (const [uKey, uVal] of Object.entries(value as Record<string, unknown>)) {
        const paramKey = uKey === "id" ? "user_id" : `user_${uKey}`;
        parts.push(`${encodeURIComponent(paramKey)}=${encodeURIComponent(String(uVal))}`);
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  return parts.join("&");
}

export class FlagDashClient {
  private opts: Required<
    Pick<FlagDashConfig, "sdkKey" | "baseUrl" | "timeout">
  > &
    Pick<FlagDashConfig, "refreshInterval" | "realtime">;
  private cache: FlagValues = {};
  private configCache: ConfigValues = {};
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<FlagDashEvent, Set<EventListener>> = new Map();
  private ready = false;

  // SSE state
  private eventSource: EventSource | null = null;
  private sseRetryCount = 0;
  private sseRetryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: FlagDashConfig) {
    if (!config.sdkKey) throw new Error("FlagDash: sdkKey is required");

    this.opts = {
      sdkKey: config.sdkKey,
      baseUrl: (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ""),
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      refreshInterval: config.refreshInterval,
      realtime: config.realtime,
    };

    // Initial fetch (flags + configs in parallel)
    Promise.all([this.refreshFlags(), this.refreshConfigs()])
      .then(() => {
        this.ready = true;
        this.emit("ready");

        if (this.opts.realtime) {
          // Real-time mode: connect SSE (falls back to polling on failure)
          this.connectSSE();
        } else if (this.opts.refreshInterval && this.opts.refreshInterval > 0) {
          // Polling mode
          this.startPolling();
        }
      })
      .catch(() => {
        // Error already emitted in refreshFlags/refreshConfigs
      });
  }

  // ── Flag evaluation ──────────────────────────────────────────────

  /**
   * Evaluate a feature flag.
   * Returns the flag value, or `defaultValue` if the flag is not found.
   *
   * When `context` is provided the server evaluates targeting rules and
   * rollout percentage; the context is sent as query parameters on the
   * existing GET endpoint (no POST required).
   */
  async flag<T = boolean>(
    key: string,
    context?: EvaluationContext,
    defaultValue?: T
  ): Promise<T> {
    // If we have a cached value and no user context, return from cache
    if (!context && this.cache[key] !== undefined) {
      return this.cache[key] as T;
    }

    // If context is provided, call the GET endpoint with context query params
    if (context) {
      try {
        const qs = buildContextParams(context);
        const res = await this.request<{ key: string; value: T }>(
          `/flags/${encodeURIComponent(key)}${qs ? `?${qs}` : ""}`
        );
        return res.value ?? (defaultValue as T);
      } catch {
        return (this.cache[key] as T) ?? (defaultValue as T);
      }
    }

    // Wait for initial load if not ready
    if (!this.ready) {
      await this.refreshFlags();
    }

    return (this.cache[key] as T) ?? (defaultValue as T);
  }

  /**
   * Evaluate all flags at once (useful for pre-loading).
   * When `context` is provided the server evaluates targeting rules.
   */
  async allFlags(context?: EvaluationContext): Promise<FlagValues> {
    if (context) {
      const qs = buildContextParams(context);
      const res = await this.request<EvaluateFlagsResponse>(
        `/flags${qs ? `?${qs}` : ""}`
      );
      return res.flags;
    }

    if (!this.ready) {
      await this.refreshFlags();
    }
    return { ...this.cache };
  }

  /**
   * Evaluate a single flag with full detail (value, reason, variation key).
   *
   * Always calls the server so targeting, rollout, and A/B variations are
   * evaluated with the provided context.
   *
   * @example
   * ```ts
   * const detail = await client.flagDetail('checkout-flow', { user: { id: 'alice', plan: 'pro' } });
   * // { key: 'checkout-flow', value: 'variant-b', reason: 'variation', variationKey: 'b' }
   * ```
   */
  async flagDetail<T = unknown>(
    key: string,
    context?: EvaluationContext,
    defaultValue?: T
  ): Promise<FlagDetail<T>> {
    try {
      const qs = context ? buildContextParams(context) : "";
      const res = await this.request<FlagDetailResponse>(
        `/flags/${encodeURIComponent(key)}${qs ? `?${qs}` : ""}`
      );
      return {
        key: res.key,
        value: (res.value as T) ?? (defaultValue as T),
        reason: res.reason ?? "default",
        variationKey: res.variation_key ?? null,
      };
    } catch {
      return {
        key,
        value: defaultValue as T,
        reason: "default",
        variationKey: null,
      };
    }
  }

  // ── Remote config ────────────────────────────────────────────────

  /**
   * Get a remote config value by key.
   * Returns from cache if available, otherwise fetches from the API.
   */
  async config<T = unknown>(key: string, defaultValue?: T): Promise<T> {
    // Return from cache if available
    if (this.configCache[key] !== undefined) {
      return this.configCache[key] as T;
    }

    // Wait for initial load if not ready
    if (!this.ready) {
      await this.refreshConfigs();
    }

    if (this.configCache[key] !== undefined) {
      return this.configCache[key] as T;
    }

    // Fallback: direct API call for a single key
    try {
      const res = await this.request<ConfigResponse>(
        `/configs/${encodeURIComponent(key)}`
      );
      return (res.value as T) ?? (defaultValue as T);
    } catch {
      return defaultValue as T;
    }
  }

  /**
   * Get all remote configs at once (from cache).
   */
  async allConfigs(): Promise<ConfigValues> {
    if (!this.ready) {
      await this.refreshConfigs();
    }
    return { ...this.configCache };
  }

  // ── AI Configs ─────────────────────────────────────────────────

  /**
   * Get an AI config file by name.
   * Returns the file content, or `defaultValue` if the file is not found.
   */
  async aiConfig(fileName: string, defaultValue?: string): Promise<AiConfig | null> {
    try {
      const res = await this.request<AiConfigGetResponse>(
        `/ai-configs/${encodeURIComponent(fileName)}`
      );
      return res.ai_config;
    } catch {
      if (defaultValue !== undefined) {
        return {
          file_name: fileName,
          file_type: "skill",
          content: defaultValue,
          folder: null,
        };
      }
      return null;
    }
  }

  /**
   * List all AI config files for the current environment.
   * Optionally filter by file type or folder.
   */
  async listAiConfigs(options?: ListAiConfigsOptions): Promise<AiConfig[]> {
    try {
      const res = await this.request<AiConfigListResponse>("/ai-configs");
      let configs = res.ai_configs;

      if (options?.fileType) {
        configs = configs.filter((c) => c.file_type === options.fileType);
      }
      if (options?.folder !== undefined) {
        configs = configs.filter((c) => c.folder === options.folder);
      }

      return configs;
    } catch {
      return [];
    }
  }

  // ── Event emitter ────────────────────────────────────────────────

  on(event: FlagDashEvent, listener: EventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  private emit(event: FlagDashEvent, data?: unknown) {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        listener(data);
      } catch {
        // Swallow listener errors
      }
    });
  }

  // ── SSE (real-time) ───────────────────────────────────────────────

  private connectSSE() {
    // Guard: EventSource must be available (browser environment)
    if (typeof EventSource === "undefined") {
      this.fallbackToPolling();
      return;
    }

    const url = `${this.opts.baseUrl}/api/v1/sse?api_key=${encodeURIComponent(this.opts.sdkKey)}`;
    const es = new EventSource(url);

    es.addEventListener("connected", () => {
      // Reset retry count on successful connection
      this.sseRetryCount = 0;
    });

    // Flag events → re-fetch all flags via HTTP
    const flagEvents = [
      "flag.created",
      "flag.updated",
      "flag.toggled",
      "flag.deleted",
      "flag.rollout_updated",
      "flag.rules_updated",
      "flag.variations_updated",
    ];
    for (const eventType of flagEvents) {
      es.addEventListener(eventType, () => {
        this.refreshFlags().catch(() => {
          this.emit("error", new Error("SSE-triggered flag refresh failed"));
        });
      });
    }

    // Config events → re-fetch all configs via HTTP
    const configEvents = [
      "config.created",
      "config.updated",
      "config.deleted",
      "config.toggled",
      "config.value_updated",
    ];
    for (const eventType of configEvents) {
      es.addEventListener(eventType, () => {
        this.refreshConfigs().catch(() => {
          this.emit("error", new Error("SSE-triggered config refresh failed"));
        });
      });
    }

    // AI config events
    const aiConfigEvents = [
      "ai_config.created",
      "ai_config.updated",
      "ai_config.deleted",
    ];
    for (const eventType of aiConfigEvents) {
      es.addEventListener(eventType, () => {
        this.emit("ai_config_updated");
      });
    }

    es.onerror = () => {
      es.close();
      this.eventSource = null;
      this.sseRetryCount++;

      if (this.sseRetryCount <= SSE_MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const delay = Math.pow(2, this.sseRetryCount - 1) * 1000;
        this.sseRetryTimer = setTimeout(() => {
          this.sseRetryTimer = null;
          this.connectSSE();
        }, delay);
      } else {
        // Max retries exceeded → fall back to polling
        this.fallbackToPolling();
      }
    };

    this.eventSource = es;
  }

  private fallbackToPolling() {
    const interval = this.opts.refreshInterval && this.opts.refreshInterval > 0
      ? this.opts.refreshInterval
      : SSE_FALLBACK_POLLING_INTERVAL;

    this.opts.refreshInterval = interval;
    this.startPolling();
  }

  // ── Polling ──────────────────────────────────────────────────────

  private startPolling() {
    if (this.pollingTimer) return;
    this.pollingTimer = setInterval(() => {
      Promise.all([this.refreshFlags(), this.refreshConfigs()]).catch(() => {
        this.emit("error", new Error("Polling refresh failed"));
      });
    }, this.opts.refreshInterval!);
  }

  /**
   * Stop background polling and SSE. Call this when you no longer need live updates.
   */
  destroy() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.sseRetryTimer) {
      clearTimeout(this.sseRetryTimer);
      this.sseRetryTimer = null;
    }
    this.listeners.clear();
  }

  // ── Real-time control ──────────────────────────────────────────

  /**
   * Whether real-time (SSE) mode is currently enabled.
   */
  get isRealtimeEnabled(): boolean {
    return this.opts.realtime === true;
  }

  /**
   * Enable real-time updates via SSE.
   * Connects to the SSE endpoint and receives live flag/config/ai-config changes.
   * Also does an immediate refresh of flags and configs to ensure data is current.
   */
  enableRealtime() {
    if (this.opts.realtime) return; // Already enabled
    this.opts.realtime = true;

    // Stop polling if active (SSE replaces it)
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    // Connect SSE and refresh data
    if (this.ready) {
      this.connectSSE();
      Promise.all([this.refreshFlags(), this.refreshConfigs()]).catch(() => {
        this.emit("error", new Error("Refresh failed after enabling realtime"));
      });
    }

    this.emit("realtime_changed", true);
  }

  /**
   * Disable real-time updates (SSE).
   * Closes the SSE connection. Data remains cached but won't auto-update.
   * Optionally starts polling if a refreshInterval is configured.
   */
  disableRealtime() {
    if (!this.opts.realtime) return; // Already disabled
    this.opts.realtime = false;

    // Close SSE connection
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.sseRetryTimer) {
      clearTimeout(this.sseRetryTimer);
      this.sseRetryTimer = null;
    }
    this.sseRetryCount = 0;

    // Start polling as fallback if configured
    if (this.ready && this.opts.refreshInterval && this.opts.refreshInterval > 0) {
      this.startPolling();
    }

    this.emit("realtime_changed", false);
  }

  // ── Internal ─────────────────────────────────────────────────────

  private async refreshFlags(): Promise<void> {
    try {
      const res = await this.request<EvaluateFlagsResponse>("/flags");
      this.cache = res.flags;
      if (this.ready) {
        this.emit("flags_updated", this.cache);
      }
    } catch (err) {
      this.emit("error", err);
      throw err;
    }
  }

  private async refreshConfigs(): Promise<void> {
    try {
      const res = await this.request<ConfigsListResponse>("/configs");
      const newCache: ConfigValues = {};
      for (const item of res.configs) {
        newCache[item.key] = item.value;
      }
      this.configCache = newCache;
      if (this.ready) {
        this.emit("configs_updated", this.configCache);
        // Also emit legacy event for backwards compatibility
        this.emit("config_updated");
      }
    } catch (err) {
      this.emit("error", err);
      throw err;
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.opts.baseUrl}/api/v1${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.opts.timeout);

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.opts.sdkKey}`,
          "Content-Type": "application/json",
          ...(init?.headers as Record<string, string>),
        },
      });

      if (!res.ok) {
        throw new Error(`FlagDash API error: ${res.status} ${res.statusText}`);
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
