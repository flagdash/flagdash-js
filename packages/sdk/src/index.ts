export { FlagDashClient } from "./client";
export type {
  FlagDashConfig,
  UserContext,
  EvaluationContext,
  FlagValues,
  ConfigValues,
  FlagDetail,
  EvaluationReason,
  FlagDashEvent,
  EventListener,
  FlagDashRequestError,
  AiConfig,
  AiConfigFileType,
  AiConfigListResponse,
  AiConfigGetResponse,
  AiConfigReleaseResult,
  ExperimentAssignment,
  ExperimentMetricEvent,
  ListAiConfigsOptions,
  TranslationOptions,
  TranslationDetail,
} from "./types";
export { formatTranslation } from "./translation";
export type { TranslationCatalog } from "./translation";

import { FlagDashClient } from "./client";
import type { FlagDashConfig } from "./types";

/**
 * Create a new FlagDash client instance.
 *
 * @example
 * ```ts
 * import { FlagDash } from '@flagdashio/sdk';
 *
 * const client = FlagDash.init({
 *   sdkKey: 'sk_...',
 * });
 *
 * const enabled = await client.flag('my-feature');
 * ```
 */
export const FlagDash = {
  init(config: FlagDashConfig): FlagDashClient {
    return new FlagDashClient(config);
  },
};

export default FlagDash;
