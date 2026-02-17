export { FlagDashClient } from "./client";
export type {
  FlagDashConfig,
  UserContext,
  EvaluationContext,
  FlagValues,
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
 *   sdkKey: 'client_pk_...',
 *   environment: 'production',
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
