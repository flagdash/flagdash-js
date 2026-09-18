/** Configuration options for the FlagDash client */
export interface FlagDashConfig {
  /**
   * Your FlagDash API key (`sk_` prefixed). The key determines the project and
   * environment, and its scopes determine what it may read.
   *
   * This client only ever calls the client-tier endpoints, which return
   * evaluated values and never the underlying targeting rules — so an `sk_` key
   * with `flags:read` is safe to ship in a browser bundle.
   */
  sdkKey: string;
  /** Base URL of your FlagDash instance. Defaults to https://flagdash.io */
  baseUrl?: string;
  /** Polling interval in ms for refreshing flag values. Defaults to 0 (no polling). */
  refreshInterval?: number;
  /** Request timeout in ms. Defaults to 5000. */
  timeout?: number;
  /** Enable real-time updates via SSE. Defaults to false. Falls back to polling if SSE fails. */
  realtime?: boolean;
}

/** User context passed when evaluating flags with targeting rules */
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

/** Map of flag keys to their evaluated values */
export type FlagValues = Record<string, boolean | string | number | object>;

/** Response shape from the flag evaluation API */
export interface EvaluateFlagsResponse {
  flags: FlagValues;
}

/** Evaluation reason returned by the server */
export type EvaluationReason =
  | "disabled"
  | "rule_match"
  | "variation"
  | "rollout"
  | "default";

/** Detailed flag evaluation result (single flag with metadata) */
export interface FlagDetail<T = unknown> {
  key: string;
  value: T;
  reason: EvaluationReason;
  variationKey: string | null;
}

/** Raw response shape from the single flag endpoint */
export interface FlagDetailResponse {
  key: string;
  value: unknown;
  reason: EvaluationReason;
  variation_key?: string;
}

/** Map of config keys to their values */
export type ConfigValues = Record<string, unknown>;

export interface TranslationOptions {
  locale: string;
  defaultValue?: string;
  variables?: Record<string, unknown>;
}

export interface TranslationDetail {
  value: string;
  locale: string;
  sourceLocale: string | null;
  version: number;
  reason: "translated" | "locale_fallback" | "default";
}

/** Response shape from the config list API */
export interface ConfigsListResponse {
  configs: Array<{ key: string; value: unknown }>;
}

/** Response shape from the config API */
export interface ConfigResponse {
  key: string;
  value: unknown;
  config_type: string;
}

/** AI config file types */
export type AiConfigFileType = "agent" | "skill" | "rule";

/** A single AI config file */
export interface AiConfig {
  file_name: string;
  file_type: AiConfigFileType;
  content: string;
  folder: string | null;
}

/** Response shape from the AI config list API */
export interface AiConfigListResponse {
  ai_configs: AiConfig[];
}

/** Response shape from the AI config get API */
export interface AiConfigGetResponse {
  ai_config: AiConfig;
}

/** Evaluated AI release returned by the client-tier API. */
export interface AiConfigReleaseResult {
  key: string;
  version: number;
  config: Record<string, unknown>;
  reason: "baseline" | "rollout" | "paused";
  variation_key: string | null;
  rollout_percentage: number;
}

/** Stable assignment returned by the experimentation API. */
export interface ExperimentAssignment {
  key: string;
  status: "testing" | "running" | "paused";
  variantKey: string;
  parameters: Record<string, unknown>;
  reason: "experiment";
}

/** Raw experiment assignment response shape. */
export interface ExperimentAssignmentResponse {
  experiment: {
    key: string;
    status: "testing" | "running" | "paused";
    variant_key: string;
    parameters: Record<string, unknown>;
    reason: "experiment";
  };
}

/** A metric attributed to an experiment using the server's stable assignment. */
export interface ExperimentMetricEvent {
  experimentKey: string;
  eventName: string;
  context: EvaluationContext;
  value?: number;
  properties?: Record<string, unknown>;
  eventId?: string;
  occurredAt?: string;
}

/** Options for listing AI configs */
export interface ListAiConfigsOptions {
  /** Filter by file type */
  fileType?: AiConfigFileType;
  /** Filter by folder */
  folder?: string;
}

/** Events emitted by the FlagDash client */
export type FlagDashEvent =
  | "ready"
  | "error"
  | "flags_updated"
  | "configs_updated"
  | "config_updated"
  | "ai_config_updated"
  | "translation_updated"
  | "realtime_changed";

/** Listener callback signature */
export type EventListener = (data?: unknown) => void;

/**
 * An HTTP failure from the FlagDash API.
 *
 * `status` and `path` let an application tell a scope problem on one resource
 * (403 on `/configs`) apart from a total outage, since the client stays usable
 * for whichever resources did load.
 */
export interface FlagDashRequestError extends Error {
  status?: number;
  path?: string;
}
