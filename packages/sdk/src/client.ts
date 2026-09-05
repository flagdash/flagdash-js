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
  AiConfigReleaseResult,
  ListAiConfigsOptions,
  FlagDashEvent,
  EventListener,
  FlagDashRequestError,
  ExperimentAssignment,
  ExperimentAssignmentResponse,
  ExperimentMetricEvent,
  TranslationOptions,
  TranslationDetail,
} from "./types";
import { formatTranslation, type TranslationCatalog } from "./translation";

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
  private translationCache = new Map<string, TranslationCatalog>();
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<FlagDashEvent, Set<EventListener>> = new Map();
  private ready = false;
  private experimentEvents: Array<Record<string, unknown>> = [];
  private experimentFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private experimentFlushInFlight = false;

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

    // Initial fetch (flags + configs in parallel).
    //
    // allSettled, not all: these are independent resources and an API key may
    // legitimately be scoped to one and not the other. With Promise.all a 403
    // on /configs rejected the whole chain, so `ready` never fired, SSE and
    // polling never started, and every hook stayed loading forever — even
    // though /flags had returned 200 and its cache was already populated.
    //
    // Becoming ready with partial (or no) data is the right failure mode for a
    // flag SDK: callers get their default values immediately instead of
    // hanging, and the refresh path gets a chance to recover.
    Promise.allSettled([this.refreshFlags(), this.refreshConfigs()]).then(() => {
      this.ready = true;
      this.emit("ready");

      if (this.opts.realtime) {
        // Real-time mode: connect SSE (falls back to polling on failure)
        this.connectSSE();
      } else if (this.opts.refreshInterval && this.opts.refreshInterval > 0) {
        // Polling mode
        this.startPolling();
      }
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

  async translation(key: string, options: TranslationOptions): Promise<string> {
    return (await this.translationDetail(key, options)).value;
  }

  async translations(locale: string, namespace: string): Promise<TranslationCatalog> {
    const cacheKey = `${locale}:${namespace}`;
    const cached = this.translationCache.get(cacheKey);
    if (cached) return cached;
    const response = await this.request<{ catalog: TranslationCatalog }>(`/translations/${encodeURIComponent(locale)}/${encodeURIComponent(namespace)}`);
    this.translationCache.set(cacheKey, response.catalog);
    return response.catalog;
  }

  async translationDetail(key: string, options: TranslationOptions): Promise<TranslationDetail> {
    const separator = key.indexOf(".");
    if (separator < 1) return { value: options.defaultValue ?? key, locale: options.locale, sourceLocale: null, version: 0, reason: "default" };
    const namespace = key.slice(0, separator);
    const messageKey = key.slice(separator + 1);
    const cacheKey = `${options.locale}:${namespace}`;
    try {
      const catalog = await this.translations(options.locale, namespace);
      const pattern = catalog.messages[messageKey];
      if (pattern === undefined) return { value: options.defaultValue ?? key, locale: catalog.locale, sourceLocale: null, version: catalog.version, reason: "default" };
      const sourceLocale = catalog.sources[messageKey] ?? catalog.locale;
      return { value: formatTranslation(pattern, sourceLocale, options.variables), locale: catalog.locale, sourceLocale, version: catalog.version, reason: sourceLocale === catalog.locale ? "translated" : "locale_fallback" };
    } catch {
      return { value: options.defaultValue ?? key, locale: options.locale, sourceLocale: null, version: 0, reason: "default" };
    }
  }

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

  /**
   * Resolve an AI Config Release for a user. The provider request stays in
   * your application; FlagDash only returns the selected configuration.
   */
  async aiConfigRelease(key: string, userId?: string): Promise<AiConfigReleaseResult | null> {
    try {
      const query = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
      const res = await this.request<{ ai_config: AiConfigReleaseResult }>(
        `/ai-config-releases/${encodeURIComponent(key)}${query}`
      );
      return res.ai_config;
    } catch {
      return null;
    }
  }

  /**
   * Resolve a stable experiment assignment for a user.
   * A stable user identity is required; anonymous assignment is deliberately rejected.
   */
  async experiment(key: string, context: EvaluationContext): Promise<ExperimentAssignment | null> {
    const qs = buildContextParams(context);
    if (!qs || !(context.user?.id || context.user_id || context.unit_id)) return null;

    try {
      const res = await this.request<ExperimentAssignmentResponse>(
        `/experiments/${encodeURIComponent(key)}?${qs}`
      );
      return {
        key: res.experiment.key,
        status: res.experiment.status,
        variantKey: res.experiment.variant_key,
        parameters: res.experiment.parameters,
        reason: res.experiment.reason,
      };
    } catch {
      return null;
    }
  }

  /** Queue an experiment outcome without blocking the application's request path. */
  trackExperimentMetric(event: ExperimentMetricEvent): void {
    const userId = event.context.user?.id ?? event.context.user_id ?? event.context.unit_id;
    if (!userId || this.experimentEvents.length >= 1000) return;

    this.experimentEvents.push({
      event_id: event.eventId ?? this.experimentEventId(),
      experiment_key: event.experimentKey,
      event_name: event.eventName,
      user_id: String(userId),
      value: event.value,
      properties: event.properties ?? {},
      occurred_at: event.occurredAt ?? new Date().toISOString(),
    });
    this.scheduleExperimentFlush();
  }

  /** Flush queued events. Useful before process/page shutdown and in tests. */
  async flushExperimentEvents(): Promise<void> {
    if (this.experimentFlushInFlight || this.experimentEvents.length === 0) return;
    this.experimentFlushInFlight = true;
    const batch = this.experimentEvents.splice(0, 100);
    try {
      await this.request("/experiment-events/batch", {
        method: "POST",
        body: JSON.stringify({ events: batch }),
      });
    } catch {
      this.experimentEvents = [...batch, ...this.experimentEvents].slice(0, 1000);
    } finally {
      this.experimentFlushInFlight = false;
      if (this.experimentEvents.length > 0) this.scheduleExperimentFlush();
    }
  }

  private scheduleExperimentFlush(): void {
    if (this.experimentFlushTimer) return;
    this.experimentFlushTimer = setTimeout(() => {
      this.experimentFlushTimer = null;
      void this.flushExperimentEvents();
    }, 1000);
  }

  private experimentEventId(): string {
    const cryptoApi = globalThis.crypto;
    return cryptoApi?.randomUUID?.() ?? `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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

    // NOTE: EventSource cannot set an Authorization header, so the (read-only,
    // client-tier) sdkKey is passed as a query parameter. Query strings can be
    // captured by proxy/server access logs. A future hardening is to exchange
    // the key for a short-lived signed SSE ticket over the header-authenticated
    // HTTP path; that requires a matching server endpoint (not yet available).
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

    es.addEventListener("translation.updated", () => {
      this.translationCache.clear();
      this.emit("translation_updated");
    });

    es.onerror = () => {
      es.close();
      this.eventSource = null;
      this.sseRetryCount++;

      if (this.sseRetryCount <= SSE_MAX_RETRIES) {
        // Exponential backoff with full jitter. Without jitter, every client
        // connected to a server that restarts would retry on the exact same
        // schedule (1s, 2s, 4s…), producing a synchronized reconnect storm.
        // Jitter spreads reconnects uniformly across each backoff window.
        const base = Math.pow(2, this.sseRetryCount - 1) * 1000;
        const delay = Math.round(base * (0.5 + Math.random()));
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
    // Falling back is terminal — either EventSource does not exist here, or SSE
    // exhausted its retries. Record that so `isRealtimeEnabled` stops claiming a
    // live stream, and tell listeners so any "real-time: on" UI can correct
    // itself instead of lying about how fresh its data is.
    if (this.opts.realtime) {
      this.opts.realtime = false;
      this.emit("realtime_changed", false);
    }

    const interval = this.opts.refreshInterval && this.opts.refreshInterval > 0
      ? this.opts.refreshInterval
      : SSE_FALLBACK_POLLING_INTERVAL;

    // Note: do NOT overwrite this.opts.refreshInterval here. Mutating the
    // configured interval would leak the SSE-fallback value into a later
    // disableRealtime()→startPolling(), using the wrong interval.
    this.startPolling(interval);
  }

  // ── Polling ──────────────────────────────────────────────────────

  private startPolling(intervalMs?: number) {
    if (this.pollingTimer) return;

    const interval =
      intervalMs && intervalMs > 0
        ? intervalMs
        : this.opts.refreshInterval && this.opts.refreshInterval > 0
          ? this.opts.refreshInterval
          : SSE_FALLBACK_POLLING_INTERVAL;

    this.pollingTimer = setInterval(() => {
      Promise.allSettled([this.refreshFlags(), this.refreshConfigs()]).catch(() => {
        this.emit("error", new Error("Polling refresh failed"));
      });
    }, interval);
  }

  /**
   * Stop background polling and SSE. Call this when you no longer need live updates.
   */
  destroy() {
    void this.flushExperimentEvents();
    if (this.experimentFlushTimer) clearTimeout(this.experimentFlushTimer);
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
   * Whether the initial flag/config fetch has completed. Until this is true,
   * reads wait on that fetch rather than returning stale defaults.
   */
  get isReady(): boolean {
    return this.ready;
  }

  /**
   * Whether real-time (SSE) mode is currently active.
   *
   * Goes false if SSE is unavailable or gives up and the client degrades to
   * polling, so this reflects how updates are actually arriving — not merely
   * what was requested in the constructor.
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
      Promise.allSettled([this.refreshFlags(), this.refreshConfigs()]).catch(() => {
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
    // Kept in scope so the thrown error can name the resource — "403 Forbidden"
    // alone does not tell an application whether it lost flags or configs.
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
        const error = new Error(
          `FlagDash API error: ${res.status} ${res.statusText} (${path})`
        ) as FlagDashRequestError;
        error.status = res.status;
        error.path = path;
        throw error;
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
