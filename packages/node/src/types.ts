// ── Shared config ────────────────────────────────────────────────

/** Configuration options for the FlagDash server SDK */
export interface FlagDashServerConfig {
  /** Your FlagDash Server API key (server_ prefixed). The key determines the project and environment. */
  sdkKey: string;
  /** Base URL of your FlagDash instance. Defaults to https://flagdash.io */
  baseUrl?: string;
  /** Cache TTL in ms. Defaults to 60000 (60 seconds). Set to 0 to disable caching. */
  cacheTTL?: number;
  /** Request timeout in ms. Defaults to 5000. */
  timeout?: number;
}

/** Configuration options for the FlagDash management client */
export interface FlagDashManagementConfig {
  /** Your FlagDash Management API key (management_...) */
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

/** Raw response shape from the single-flag detail endpoint */
export interface FlagDetailResponse {
  key: string;
  value: unknown;
  reason: EvaluationReason;
  variation_key?: string;
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
  value: unknown;
  tags: string[];
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
