/** Configuration options for the FlagDash client */
export interface FlagDashConfig {
  /** Your FlagDash API key (client_pk_... or server_sk_...) */
  sdkKey: string;
  /** Target environment name (e.g. "production", "staging") */
  environment: string;
  /** Base URL of your FlagDash instance. Defaults to the hosted service. */
  baseUrl?: string;
  /** Polling interval in ms for refreshing flag values. Defaults to 0 (no polling). */
  refreshInterval?: number;
  /** Request timeout in ms. Defaults to 5000. */
  timeout?: number;
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
  | "config_updated"
  | "ai_config_updated";

/** Listener callback signature */
export type EventListener = (data?: unknown) => void;
