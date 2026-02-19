import type {
  FlagDashServerConfig,
  EvaluationContext,
  Flag,
  Config,
  AiConfig,
  ListAiConfigsOptions,
  FlagValues,
  ServerFlagsResponse,
  FlagDetailResult,
  FlagDetailResponse,
} from "./types";

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

export class FlagDashServerClient {
  private opts: Required<
    Pick<FlagDashServerConfig, "sdkKey" | "baseUrl" | "cacheTTL" | "timeout">
  >;
  private flagCache = new Map<string, CacheEntry<unknown>>();
  private configCache = new Map<string, CacheEntry<unknown>>();
  private aiConfigCache = new Map<string, CacheEntry<unknown>>();
  private allFlagsCache: CacheEntry<FlagValues> | null = null;

  constructor(config: FlagDashServerConfig) {
    if (!config.sdkKey) throw new Error("FlagDash: sdkKey is required");

    this.opts = {
      sdkKey: config.sdkKey,
      baseUrl: (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ""),
      cacheTTL: config.cacheTTL ?? DEFAULT_CACHE_TTL,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
    };
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
        const qs = buildContextParams(context);
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
      const qs = context ? buildContextParams(context) : "";
      const res = await this.request<FlagDetailResponse>(
        `/server/flags/${encodeURIComponent(key)}${qs ? `?${qs}` : ""}`
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

  /**
   * Evaluate all flags at once. Useful for bootstrapping.
   * When context is provided, returns server-evaluated values.
   */
  async allFlags(context?: EvaluationContext): Promise<FlagValues> {
    if (context) {
      const qs = buildContextParams(context);
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
    const res = await this.request<ServerFlagsResponse>("/server/flags");
    return res.flags;
  }

  // ── Remote config ────────────────────────────────────────────────

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
      return await this.request<Config>(
        `/server/configs/${encodeURIComponent(key)}`
      );
    } catch {
      return null;
    }
  }

  /**
   * List all configs with their full metadata (server key only).
   */
  async listConfigs(): Promise<Config[]> {
    return this.request<Config[]>("/server/configs");
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
    const res = await this.request<ServerFlagsResponse>("/server/flags");
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
