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
  AiConfig,
  AiConfigFileType,
  AiConfigListResponse,
  AiConfigGetResponse,
  ListAiConfigsOptions,
} from "./types";

import { FlagDashClient } from "./client";
import type { FlagDashConfig } from "./types";

/**
 * Create a new FlagDash client instance.
 *
 * @example
 * ```ts
 * import { FlagDash } from '@flagdash/sdk';
 *
 * const client = FlagDash.init({
 *   sdkKey: 'client_...',
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
