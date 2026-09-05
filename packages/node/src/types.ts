// ── Shared config ────────────────────────────────────────────────

/** Configuration options for the FlagDash server SDK */
export interface FlagDashServerConfig {
  /**
   * Your FlagDash API key (`sk_` prefixed), which determines the project and
   * environment. Needs the `flags:read` / `configs:read` / `ai_configs:read`
   * scopes for the resources you read.
   *
   * This client calls the server-tier endpoints, whose responses include
   * targeting rules and variations — keep the key server-side.
   */
  sdkKey: string;
  /** Base URL of your FlagDash instance. Defaults to https://flagdash.io */
  baseUrl?: string;
  /** Cache TTL in ms. Defaults to 60000 (60 seconds). Set to 0 to disable caching. */
  cacheTTL?: number;
  /** Request timeout in ms. Defaults to 5000. */
  timeout?: number;
  /**
   * Deployment region sent as `region` on every evaluation, so targeting rules
   * and segments can roll out region by region without threading it through
   * each call. Overrides auto-detection.
   */
  region?: string;
  /**
   * Auto-detect `region` from the environment when `region` is not set.
   * Defaults to true. Reads, in order: `FLAGDASH_REGION`, `FLY_REGION`,
   * `AWS_REGION`, `AWS_DEFAULT_REGION`, `VERCEL_REGION`, `GOOGLE_CLOUD_REGION`,
   * `RAILWAY_REPLICA_REGION`, `RENDER_REGION`.
   */
  autoDetectRegion?: boolean;
}

/** Configuration options for the FlagDash management client */
export interface FlagDashManagementConfig {
  /**
   * A credential allowed to mutate resources: an `sk_` key holding the
   * `:write` scopes for what you change, or a `pat_` personal access token
   * whose user has the matching role permissions.
   */
  apiKey: string;
  /** Base URL of your FlagDash instance */
  baseUrl?: string;
  /** Request timeout in ms. Defaults to 10000. */
  timeout?: number;
}

// ── Evaluation context ───────────────────────────────────────────

/** User context for server-side flag evaluation */
export interface UserContext {
  id: string;
  email?: string;
  plan?: string;
  [key: string]: unknown;
}

/** Evaluation context sent with flag evaluation requests */
export interface EvaluationContext {
  user?: UserContext;
  [key: string]: unknown;
}

// ── Flags ────────────────────────────────────────────────────────

/** A feature flag with full rule details (server key only) */
export interface Flag {
  id: string;
  key: string;
  name: string;
  description: string;
  flag_type: "boolean" | "string" | "number" | "json";
  enabled: boolean;
  default_value: unknown;
  rules?: TargetingRule[];
  rollout_percentage?: number;
}

/** Targeting rule for advanced flag evaluation */
export interface TargetingRule {
  id: string;
  attribute: string;
  operator: string;
  value: unknown;
  flag_value: unknown;
}

/** Evaluation reason returned by the server */
export type EvaluationReason =
  | "disabled"
  | "rule_match"
  | "variation"
  | "rollout"
  | "default";

/** Detailed flag evaluation result (single flag with metadata) */
export interface FlagDetailResult<T = unknown> {
  key: string;
  value: T;
  reason: EvaluationReason;
  variationKey: string | null;
}

export interface ExperimentAssignment {
  key: string;
  status: "testing" | "running" | "paused";
  variantKey: string;
  parameters: Record<string, unknown>;
  reason: "experiment";
}

export interface ExperimentMetricEvent {
  experimentKey: string;
  eventName: string;
  context: EvaluationContext;
  value?: number;
  properties?: Record<string, unknown>;
  eventId?: string;
  occurredAt?: string;
}

/** Raw response shape from the single-flag detail endpoint */
export interface FlagDetailResponse {
  key: string;
  value: unknown;
  reason: EvaluationReason;
  variation_key?: string;
}

/**
 * Response from the server tier's single-flag endpoint.
 *
 * Unlike the client tier's flat `{ key, value, reason }`, the server tier
 * returns the whole flag alongside the evaluation it performed.
 */
export interface ServerFlagDetailResponse {
  flag: Flag & {
    evaluated_value: unknown;
    evaluation_path: EvaluationReason;
    variation_key?: string | null;
  };
}

/** Map of flag keys to their evaluated values */
export type FlagValues = Record<string, boolean | string | number | object>;

/** Response from the server flags endpoint */
export interface ServerFlagsResponse {
  flags: Flag[];
  evaluated: FlagValues;
}

// ── Configs ──────────────────────────────────────────────────────

/** A remote config with full metadata (server key only) */
export interface Config {
  id: string;
  key: string;
  name: string;
  description: string;
  config_type: "json" | "string" | "number" | "boolean";
  /** The stored value, wrapped as `{ value: … }`. Use `config()` for the bare value. */
  value: unknown;
  /** Whether this config is active in the current environment. */
  is_active: boolean;
  tags: string[];
}

/**
 * An encrypted secret, decrypted for this one response.
 *
 * Secrets are a separate resource from Remote Config: server tier only, never
 * cached by this SDK, and never served to a browser or mobile client.
 */
export interface Secret<T = unknown> {
  key: string;
  format: "string" | "json";
  /** The decrypted value. A `string` secret yields a string; a `json` one an object or array. */
  value: T;
  /** The version this value came from — record it if you log a rotation. */
  version_id: string;
  created_at: string;
  created_by_id: string;
}

/** Response from the server tier's secret endpoint */
export interface SecretResponse<T = unknown> {
  secret: Secret<T>;
}

/** Response from the server tier's configs endpoint */
export interface ServerConfigsResponse {
  configs: Config[];
}

export interface TranslationOptions {
  locale: string;
  defaultValue?: string;
  variables?: Record<string, unknown>;
}

// ── AI Configs ───────────────────────────────────────────────────

/** An AI config file */
export interface AiConfig {
  id: string;
  file_name: string;
  file_type: "agent" | "skill" | "rule";
  content: string;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  folder: string | null;
  created_at: string;
  updated_at: string;
}

/** Options for listing AI configs */
export interface ListAiConfigsOptions {
  /** Filter by file type */
  fileType?: "agent" | "skill" | "rule";
  /** Filter by folder */
  folder?: string;
}

// ── Management Types ─────────────────────────────────────────────

/** A flag as returned by the management API */
export interface ManagedFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  flag_type: "boolean" | "string" | "number" | "json";
  default_value: unknown;
  tags: string[];
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  environments?: FlagEnvironment[];
}

/** A flag environment configuration */
export interface FlagEnvironment {
  id: string;
  environment_id: string;
  enabled: boolean;
  value: unknown;
  rules: unknown;
  rollout_percentage: number;
}

/** Parameters for creating a flag */
export interface CreateFlagParams {
  project_id: string;
  key: string;
  name: string;
  description?: string;
  flag_type?: "boolean" | "string" | "number" | "json";
  tags?: string[];
}

/** Parameters for updating a flag */
export interface UpdateFlagParams {
  name?: string;
  description?: string;
  tags?: string[];
  default_value?: unknown;
}

/** A flag variation for A/B testing */
export interface Variation {
  id?: string;
  key: string;
  name: string;
  value: unknown;
  weight: number;
  sort_order?: number;
}

/** A flag schedule */
export interface Schedule {
  id: string;
  action: string;
  scheduled_at: string;
  status: string;
  payload?: unknown;
  executed_at?: string;
  error_message?: string;
  created_at: string;
}

/** Parameters for creating a schedule */
export interface CreateScheduleParams {
  action: string;
  scheduled_at: string;
  payload?: Record<string, unknown>;
}

/** A config as returned by the management API */
export interface ManagedConfig {
  id: string;
  key: string;
  name: string;
  description: string;
  config_type: "json" | "string" | "number" | "boolean";
  default_value: unknown;
  tags: string[];
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  environments?: ConfigEnvironment[];
}

/** A config environment value */
export interface ConfigEnvironment {
  id: string;
  environment_id: string;
  value: unknown;
  is_active: boolean;
}

/** Parameters for creating a config */
export interface CreateConfigParams {
  project_id: string;
  key: string;
  name: string;
  description?: string;
  config_type?: "json" | "string" | "number" | "boolean";
  default_value?: unknown;
  tags?: string[];
}

/** Parameters for updating a config */
export interface UpdateConfigParams {
  name?: string;
  description?: string;
  tags?: string[];
  default_value?: unknown;
}

/** An AI config as returned by the management API */
export interface ManagedAiConfig extends AiConfig {
  project_id: string;
  environment_id: string;
}

/** Parameters for creating an AI config */
export interface CreateAiConfigParams {
  project_id: string;
  environment_id: string;
  file_name: string;
  file_type: "agent" | "skill" | "rule";
  content: string;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
  folder?: string;
}

/** Parameters for updating an AI config */
export interface UpdateAiConfigParams {
  content?: string;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
  folder?: string;
}

/** A webhook endpoint */
export interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  environment_id: string;
  event_types: string[];
  is_active: boolean;
  consecutive_failures: number;
  disabled_at: string | null;
  disabled_reason: string | null;
  signing_secret: string;
  created_at: string;
  updated_at: string;
}

/** Parameters for creating a webhook */
export interface CreateWebhookParams {
  project_id: string;
  environment_id: string;
  url: string;
  description?: string;
  event_types: string[];
}

/** Parameters for updating a webhook */
export interface UpdateWebhookParams {
  url?: string;
  description?: string;
  event_types?: string[];
}

/** A webhook delivery log entry */
export interface WebhookDelivery {
  id: string;
  event_type: string;
  status: string;
  http_status: number | null;
  error_message: string | null;
  attempt_count: number;
  max_attempts: number;
  completed_at: string | null;
  created_at: string;
}

/** Options for listing webhook deliveries */
export interface ListDeliveriesOptions {
  limit?: number;
  offset?: number;
}

// ── API error ────────────────────────────────────────────────────

/** Error thrown by FlagDash API clients */
export class FlagDashApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "FlagDashApiError";
  }
}
