import type {
  FlagDashServerConfig,
  EvaluationContext,
  Flag,
  Config,
  AiConfig,
  ListAiConfigsOptions,
  FlagValues,
  ServerFlagsResponse,
  ServerFlagDetailResponse,
  ServerConfigsResponse,
  Secret,
  SecretResponse,
  FlagDetailResult,
  ExperimentAssignment,
  ExperimentMetricEvent,
  TranslationOptions,
} from "./types";
import { formatTranslation } from "./translation";

const DEFAULT_BASE_URL = "https://flagdash.io";
const DEFAULT_CACHE_TTL = 60_000;
const DEFAULT_TIMEOUT = 5_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Flatten an EvaluationContext into query-string parameters.
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

/**
 * Best-effort deployment region from the host platform's environment, so
 * region-scoped targeting works without any application wiring.
 */
function detectRegion(): string | undefined {
  // Read `process` off globalThis so this package keeps compiling without
  // @types/node as a dependency.
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;

  if (!env) return undefined;

  return (
    env.FLAGDASH_REGION ||
    env.FLY_REGION ||
    env.AWS_REGION ||
    env.AWS_DEFAULT_REGION ||
    env.VERCEL_REGION ||
    env.GOOGLE_CLOUD_REGION ||
    env.RAILWAY_REPLICA_REGION ||
    env.RENDER_REGION ||
    undefined
  );
}

export class FlagDashServerClient {
  private opts: Required<
    Pick<FlagDashServerConfig, "sdkKey" | "baseUrl" | "cacheTTL" | "timeout">
  >;
  private flagCache = new Map<string, CacheEntry<unknown>>();
  private configCache = new Map<string, CacheEntry<unknown>>();
  private translationCache = new Map<string, CacheEntry<{ messages: Record<string, string>; sources: Record<string, string>; locale: string; version: number }>>();
  private aiConfigCache = new Map<string, CacheEntry<unknown>>();
  private allFlagsCache: CacheEntry<FlagValues> | null = null;
  /** Merged into every evaluation's context. Constant for the process. */
  private defaultContext: EvaluationContext;
  private experimentEvents: Array<Record<string, unknown>> = [];
  private experimentFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private experimentFlushInFlight = false;

  constructor(config: FlagDashServerConfig) {
    if (!config.sdkKey) throw new Error("FlagDash: sdkKey is required");

    this.opts = {
      sdkKey: config.sdkKey,
      baseUrl: (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ""),
      cacheTTL: config.cacheTTL ?? DEFAULT_CACHE_TTL,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
    };

    const region =
      config.region ?? (config.autoDetectRegion === false ? undefined : detectRegion());

    this.defaultContext = region ? { region } : {};
  }

  /**
   * Query string for an evaluation, with the process-level defaults (region)
   * merged in. An explicit caller value always wins.
   */
  private contextParams(context?: EvaluationContext): string {
    const merged = { ...this.defaultContext, ...(context ?? {}) };
    return Object.keys(merged).length > 0 ? buildContextParams(merged) : "";
  }

  /** The region being sent with every evaluation, if any. */
  get region(): string | undefined {
    return this.defaultContext.region as string | undefined;
  }

  // ── Flag evaluation ──────────────────────────────────────────────

  /**
   * Evaluate a single flag with optional user context.
   * Context is sent as query parameters on the GET endpoint.
   * Results are cached according to the configured TTL (cache is
   * bypassed when context is provided).
   */
  async flag<T = boolean>(
    key: string,
    context?: EvaluationContext,
    defaultValue?: T
  ): Promise<T> {
    // Context-based evaluation is never cached (user-specific)
    if (context) {
      try {
        const qs = this.contextParams(context);
        const res = await this.request<{ flag: { evaluated_value: T } }>(
          `/server/flags/${encodeURIComponent(key)}${qs ? `?${qs}` : ""}`
        );
        return res.flag.evaluated_value ?? (defaultValue as T);
      } catch {
        return defaultValue as T;
      }
    }

    // Check cache for non-context evaluation
    const cacheKey = `flag:${key}`;
    const cached = this.getCached<T>(this.flagCache, cacheKey);
    if (cached !== undefined) return cached;

    // Fetch all flags and cache individually
    const flags = await this.fetchAllFlags();
    return (flags[key] as T) ?? (defaultValue as T);
  }

  /**
   * Evaluate a single flag with full detail (value, reason, variation key).
   *
   * Always calls the server so targeting, rollout, and A/B variations are
   * evaluated with the provided context. Results are not cached.
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
  ): Promise<FlagDetailResult<T>> {
    try {
      const qs = this.contextParams(context);
      // The server tier wraps its payload in `flag` and names the evaluation
      // fields `evaluated_value` / `evaluation_path` — reading the client
      // tier's flat `value` / `reason` here would silently yield undefined and
      // a permanent "default" reason.
      const res = await this.request<ServerFlagDetailResponse>(
        `/server/flags/${encodeURIComponent(key)}${qs ? `?${qs}` : ""}`
      );
      const flag = res.flag;
      return {
        key: flag.key,
        value: (flag.evaluated_value as T) ?? (defaultValue as T),
        reason: flag.evaluation_path ?? "default",
        variationKey: flag.variation_key ?? null,
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

  /**
   * Evaluate all flags at once. Useful for bootstrapping.
   * When context is provided, returns server-evaluated values.
   */
  async allFlags(context?: EvaluationContext): Promise<FlagValues> {
    if (context) {
      const qs = this.contextParams(context);
      const res = await this.request<ServerFlagsResponse>(
        `/server/flags${qs ? `?${qs}` : ""}`
      );
      return res.evaluated;
    }

    if (this.allFlagsCache && Date.now() < this.allFlagsCache.expiresAt) {
      return { ...this.allFlagsCache.value };
    }

    return this.fetchAllFlags();
  }

  /** Resolve a stable experiment assignment. User-specific results are never cached. */
  async experiment(key: string, context: EvaluationContext): Promise<ExperimentAssignment | null> {
    const qs = this.contextParams(context);
    if (!(context.user?.id || context.user_id || context.unit_id)) return null;

    try {
      const res = await this.request<{
        experiment: {
          key: string;
          status: "testing" | "running" | "paused";
          variant_key: string;
          parameters: Record<string, unknown>;
          reason: "experiment";
        };
      }>(`/experiments/${encodeURIComponent(key)}?${qs}`);

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

  /** Queue an experiment metric in a bounded, non-blocking batch. */
  trackExperimentMetric(event: ExperimentMetricEvent): void {
    const userId = event.context.user?.id ?? event.context.user_id ?? event.context.unit_id;
    if (!userId || this.experimentEvents.length >= 1000) return;
    this.experimentEvents.push({ event_id: event.eventId ?? this.experimentEventId(), experiment_key: event.experimentKey, event_name: event.eventName, user_id: String(userId), value: event.value, properties: event.properties ?? {}, occurred_at: event.occurredAt ?? new Date().toISOString() });
    this.scheduleExperimentFlush();
  }

  async flushExperimentEvents(): Promise<void> {
    if (this.experimentFlushInFlight || this.experimentEvents.length === 0) return;
    this.experimentFlushInFlight = true;
    const batch = this.experimentEvents.splice(0, 100);
    try {
      await this.request("/server/experiment-events/batch", { method: "POST", body: JSON.stringify({ events: batch }) });
    } catch {
      this.experimentEvents = [...batch, ...this.experimentEvents].slice(0, 1000);
    } finally {
      this.experimentFlushInFlight = false;
      if (this.experimentEvents.length > 0) this.scheduleExperimentFlush();
    }
  }

  private scheduleExperimentFlush(): void {
    if (this.experimentFlushTimer) return;
    this.experimentFlushTimer = setTimeout(() => { this.experimentFlushTimer = null; void this.flushExperimentEvents(); }, 1000);
  }

  private experimentEventId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  async close(): Promise<void> {
    if (this.experimentFlushTimer) clearTimeout(this.experimentFlushTimer);
    await this.flushExperimentEvents();
  }

  /**
   * Get a flag with full rule details (server key only).
   */
  async getFlag(key: string): Promise<Flag | null> {
    const cacheKey = `flag-detail:${key}`;
    const cached = this.getCached<Flag>(this.flagCache, cacheKey);
    if (cached !== undefined) return cached;

    try {
      const res = await this.request<{ flag: Flag }>(
        `/server/flags/${encodeURIComponent(key)}`
      );
      this.setCache(this.flagCache, cacheKey, res.flag);
      return res.flag;
    } catch {
      return null;
    }
  }

  /**
   * List all flags with their full details (server key only).
   */
  async listFlags(): Promise<Flag[]> {
    const qs = this.contextParams();
    const res = await this.request<ServerFlagsResponse>(
      `/server/flags${qs ? `?${qs}` : ""}`
    );
    return res.flags;
  }

  // ── Remote config ────────────────────────────────────────────────

  async translation(key: string, options: TranslationOptions): Promise<string> {
    const separator = key.indexOf(".");
    if (separator < 1) return options.defaultValue ?? key;
    const namespace = key.slice(0, separator);
    const messageKey = key.slice(separator + 1);
    const cacheKey = `${options.locale}:${namespace}`;
    try {
      let catalog = this.getCached<{ messages: Record<string, string>; sources: Record<string, string>; locale: string; version: number }>(this.translationCache, cacheKey);
      if (!catalog) {
        const response = await this.request<{ catalog: { messages: Record<string, string>; sources: Record<string, string>; locale: string; version: number } }>(`/server/translations/${encodeURIComponent(options.locale)}/${encodeURIComponent(namespace)}`);
        catalog = response.catalog;
        this.setCache(this.translationCache, cacheKey, catalog);
      }
      const pattern = catalog.messages[messageKey];
      return pattern === undefined ? options.defaultValue ?? key : formatTranslation(pattern, catalog.sources[messageKey] ?? catalog.locale, options.variables);
    } catch {
      return options.defaultValue ?? key;
    }
  }

  /**
   * Get a remote config value by key.
   * Results are cached according to the configured TTL.
   */
  async config<T = unknown>(key: string, defaultValue?: T): Promise<T> {
    const cacheKey = `config:${key}`;
    const cached = this.getCached<T>(this.configCache, cacheKey);
    if (cached !== undefined) return cached;

    try {
      const res = await this.request<{ value: T }>(
        `/configs/${encodeURIComponent(key)}`
      );
      const value = res.value ?? (defaultValue as T);
      this.setCache(this.configCache, cacheKey, value);
      return value;
    } catch {
      return defaultValue as T;
    }
  }

  /**
   * Get a config with full metadata (server key only).
   */
  async getConfig(key: string): Promise<Config | null> {
    try {
      const res = await this.request<{ config: Config }>(
        `/server/configs/${encodeURIComponent(key)}`
      );
      return res.config;
    } catch {
      return null;
    }
  }

  /**
   * List all configs with their full metadata (server key only).
   */
  async listConfigs(): Promise<Config[]> {
    const res = await this.request<ServerConfigsResponse>("/server/configs");
    return res.configs;
  }

  // ── Secrets ─────────────────────────────────────────────────────

  /**
   * Fetch a decrypted secret by key.
   *
   * Deliberately unlike `config()`: the value is **not cached**, no default is
   * substituted, and a failure throws. Returning a stale or default credential
   * is worse than failing loudly — a rotated key must take effect on the next
   * call, and a silent fallback would send the wrong credential to a payment
   * provider or a database.
   *
   * Requires an `sk_` key with the `secrets:read` scope. There is no browser or
   * mobile equivalent: call your own backend for secret-dependent operations.
   *
   * @example
   * ```ts
   * const { value } = await client.getSecret<string>("stripe-secret-key");
   * const stripe = new Stripe(value);
   * ```
   */
  async getSecret<T = unknown>(key: string): Promise<Secret<T>> {
    const res = await this.request<SecretResponse<T>>(
      `/server/secrets/${encodeURIComponent(key)}`,
      { cache: "no-store" }
    );

    if (!res?.secret) {
      throw new Error(`FlagDash: secret '${key}' returned no value`);
    }

    return res.secret;
  }

  /**
   * Convenience wrapper returning just the decrypted value.
   * Throws for the same reasons as {@link getSecret}.
   */
  async secret<T = unknown>(key: string): Promise<T> {
    return (await this.getSecret<T>(key)).value;
  }

  // ── AI Configs ──────────────────────────────────────────────────

  /**
   * Get an AI config file by name.
   * Results are cached according to the configured TTL.
   */
  async aiConfig(fileName: string): Promise<AiConfig | null> {
    const cacheKey = `ai-config:${fileName}`;
    const cached = this.getCached<AiConfig>(this.aiConfigCache, cacheKey);
    if (cached !== undefined) return cached;

    try {
      const res = await this.request<{ ai_config: AiConfig }>(
        `/server/ai-configs/${encodeURIComponent(fileName)}`
      );
      this.setCache(this.aiConfigCache, cacheKey, res.ai_config);
      return res.ai_config;
    } catch {
      return null;
    }
  }

  /**
   * List all AI config files for the current environment.
   * Optionally filter by file type or folder.
   */
  async listAiConfigs(options?: ListAiConfigsOptions): Promise<AiConfig[]> {
    const res = await this.request<{ ai_configs: AiConfig[] }>("/server/ai-configs");
    let configs = res.ai_configs;

    if (options?.fileType) {
      configs = configs.filter((c) => c.file_type === options.fileType);
    }
    if (options?.folder !== undefined) {
      configs = configs.filter((c) => c.folder === options.folder);
    }

    return configs;
  }

  // ── Cache management ─────────────────────────────────────────────

  /**
   * Clear all cached values. Next call will fetch fresh data from the API.
   */
  clearCache() {
    this.flagCache.clear();
    this.configCache.clear();
    this.aiConfigCache.clear();
    this.allFlagsCache = null;
  }

  // ── Internal ─────────────────────────────────────────────────────

  private async fetchAllFlags(): Promise<FlagValues> {
    const qs = this.contextParams();
    const res = await this.request<ServerFlagsResponse>(
      `/server/flags${qs ? `?${qs}` : ""}`
    );
    const flags = res.evaluated;

    // Cache the full set
    this.allFlagsCache = {
      value: flags,
      expiresAt: Date.now() + this.opts.cacheTTL,
    };

    // Cache individual flags
    for (const [key, value] of Object.entries(flags)) {
      this.setCache(this.flagCache, `flag:${key}`, value);
    }

    return flags;
  }

  private getCached<T>(cache: Map<string, CacheEntry<unknown>>, key: string): T | undefined {
    if (this.opts.cacheTTL === 0) return undefined;

    const entry = cache.get(key);
    if (entry && Date.now() < entry.expiresAt) {
      return entry.value as T;
    }

    if (entry) cache.delete(key);
    return undefined;
  }

  private setCache(cache: Map<string, CacheEntry<unknown>>, key: string, value: unknown) {
    if (this.opts.cacheTTL === 0) return;

    cache.set(key, {
      value,
      expiresAt: Date.now() + this.opts.cacheTTL,
    });
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
