export { FlagDashServerClient } from "./client";
export { FlagDashManagementClient } from "./management";
export { FlagDashApiError } from "./types";
export type {
  FlagDashServerConfig,
  FlagDashManagementConfig,
  UserContext,
  EvaluationContext,
  EvaluationReason,
  FlagDetailResult,
  FlagDetailResponse,
  Flag,
  Config,
  AiConfig,
  ListAiConfigsOptions,
  TargetingRule,
  FlagValues,
  ServerFlagsResponse,
  ManagedFlag,
  FlagEnvironment,
  CreateFlagParams,
  UpdateFlagParams,
  Variation,
  Schedule,
  CreateScheduleParams,
  ManagedConfig,
  ConfigEnvironment,
  CreateConfigParams,
  UpdateConfigParams,
  ManagedAiConfig,
  CreateAiConfigParams,
  UpdateAiConfigParams,
  WebhookEndpoint,
  CreateWebhookParams,
  UpdateWebhookParams,
  WebhookDelivery,
  ListDeliveriesOptions,
} from "./types";

import { FlagDashServerClient } from "./client";
import { FlagDashManagementClient } from "./management";
import type { FlagDashServerConfig, FlagDashManagementConfig } from "./types";

/**
 * Create a new FlagDash server client instance.
 *
 * @example
 * ```ts
 * import { FlagDashServer } from '@flagdash/node';
 *
 * const client = FlagDashServer.init({
 *   sdkKey: 'server_...',
 * });
 *
 * const enabled = await client.flag('my-feature', { user: { id: 'user_1' } });
 * const aiConfig = await client.aiConfig('agent.md');
 * ```
 */
export const FlagDashServer = {
  init(config: FlagDashServerConfig): FlagDashServerClient {
    return new FlagDashServerClient(config);
  },
};

/**
 * Create a new FlagDash management client instance.
 *
 * @example
 * ```ts
 * import { FlagDashManagement } from '@flagdash/node';
 *
 * const client = FlagDashManagement.init({
 *   apiKey: 'management_...',
 *   baseUrl: 'https://your-flagdash-instance.com',
 * });
 *
 * const flags = await client.listFlags('prj_xxx');
 * ```
 */
export const FlagDashManagement = {
  init(config: FlagDashManagementConfig): FlagDashManagementClient {
    return new FlagDashManagementClient(config);
  },
};

export default FlagDashServer;
