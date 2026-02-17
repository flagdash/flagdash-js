import type {
  FlagDashManagementConfig,
  ManagedFlag,
  CreateFlagParams,
  UpdateFlagParams,
  FlagEnvironment,
  Variation,
  Schedule,
  CreateScheduleParams,
  ManagedConfig,
  CreateConfigParams,
  UpdateConfigParams,
  ConfigEnvironment,
  ManagedAiConfig,
  CreateAiConfigParams,
  UpdateAiConfigParams,
  WebhookEndpoint,
  CreateWebhookParams,
  UpdateWebhookParams,
  WebhookDelivery,
  ListDeliveriesOptions,
} from "./types";
import { FlagDashApiError } from "./types";

const DEFAULT_TIMEOUT = 10_000;

export class FlagDashManagementClient {
  private opts: Required<
    Pick<FlagDashManagementConfig, "apiKey" | "baseUrl" | "timeout">
  >;

  constructor(config: FlagDashManagementConfig) {
    if (!config.apiKey) throw new Error("FlagDash: apiKey is required");

    this.opts = {
      apiKey: config.apiKey,
      baseUrl: (config.baseUrl ?? "").replace(/\/$/, ""),
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
    };
  }

  // ── Flags ──────────────────────────────────────────────────────

  /** List all flags for a project. */
  async listFlags(projectId: string): Promise<ManagedFlag[]> {
    const res = await this.request<{ flags: ManagedFlag[] }>(
      `/manage/flags?project_id=${enc(projectId)}`
    );
    return res.flags;
  }

  /** Get a single flag by key. */
  async getFlag(key: string, projectId: string): Promise<ManagedFlag> {
    const res = await this.request<{ flag: ManagedFlag }>(
      `/manage/flags/${enc(key)}?project_id=${enc(projectId)}`
    );
    return res.flag;
  }

  /** Create a new feature flag. */
  async createFlag(params: CreateFlagParams): Promise<ManagedFlag> {
    const res = await this.request<{ flag: ManagedFlag }>("/manage/flags", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return res.flag;
  }

  /** Update a feature flag. */
  async updateFlag(
    key: string,
    projectId: string,
    params: UpdateFlagParams
  ): Promise<ManagedFlag> {
    const res = await this.request<{ flag: ManagedFlag }>(
      `/manage/flags/${enc(key)}?project_id=${enc(projectId)}`,
      {
        method: "PUT",
        body: JSON.stringify(params),
      }
    );
    return res.flag;
  }

  /** Delete a feature flag. */
  async deleteFlag(key: string, projectId: string): Promise<void> {
    await this.request(
      `/manage/flags/${enc(key)}?project_id=${enc(projectId)}`,
      { method: "DELETE" }
    );
  }

  /** Toggle a flag on/off in a specific environment. */
  async toggleFlag(
    key: string,
    projectId: string,
    environmentId: string
  ): Promise<FlagEnvironment> {
    const res = await this.request<{ flag_environment: FlagEnvironment }>(
      `/manage/flags/${enc(key)}/toggle?project_id=${enc(projectId)}&environment_id=${enc(environmentId)}`,
      { method: "POST" }
    );
    return res.flag_environment;
  }

  /** Update targeting rules for a flag in an environment. */
  async updateFlagRules(
    key: string,
    projectId: string,
    environmentId: string,
    rules: unknown
  ): Promise<FlagEnvironment> {
    const res = await this.request<{ flag_environment: FlagEnvironment }>(
      `/manage/flags/${enc(key)}/rules?project_id=${enc(projectId)}&environment_id=${enc(environmentId)}`,
      {
        method: "PUT",
        body: JSON.stringify({ rules }),
      }
    );
    return res.flag_environment;
  }

  /** Update rollout percentage for a flag in an environment. */
  async updateFlagRollout(
    key: string,
    projectId: string,
    environmentId: string,
    rolloutPercentage: number
  ): Promise<FlagEnvironment> {
    const res = await this.request<{ flag_environment: FlagEnvironment }>(
      `/manage/flags/${enc(key)}/rollout?project_id=${enc(projectId)}&environment_id=${enc(environmentId)}`,
      {
        method: "PUT",
        body: JSON.stringify({ rollout_percentage: rolloutPercentage }),
      }
    );
    return res.flag_environment;
  }

  /** Set A/B test variations for a flag in an environment. */
  async setFlagVariations(
    key: string,
    projectId: string,
    environmentId: string,
    variations: Omit<Variation, "id" | "sort_order">[]
  ): Promise<Variation[]> {
    const res = await this.request<{ variations: Variation[] }>(
      `/manage/flags/${enc(key)}/variations?project_id=${enc(projectId)}&environment_id=${enc(environmentId)}`,
      {
        method: "PUT",
        body: JSON.stringify({ variations }),
      }
    );
    return res.variations;
  }

  /** Delete all variations for a flag in an environment. */
  async deleteFlagVariations(
    key: string,
    projectId: string,
    environmentId: string
  ): Promise<void> {
    await this.request(
      `/manage/flags/${enc(key)}/variations?project_id=${enc(projectId)}&environment_id=${enc(environmentId)}`,
      { method: "DELETE" }
    );
  }

  /** List schedules for a flag in an environment. */
  async listFlagSchedules(
    key: string,
    projectId: string,
    environmentId: string
  ): Promise<Schedule[]> {
    const res = await this.request<{ schedules: Schedule[] }>(
      `/manage/flags/${enc(key)}/schedules?project_id=${enc(projectId)}&environment_id=${enc(environmentId)}`
    );
    return res.schedules;
  }

  /** Create a schedule for a flag in an environment. */
  async createFlagSchedule(
    key: string,
    projectId: string,
    environmentId: string,
    params: CreateScheduleParams
  ): Promise<Schedule> {
    const res = await this.request<{ schedule: Schedule }>(
      `/manage/flags/${enc(key)}/schedules?project_id=${enc(projectId)}&environment_id=${enc(environmentId)}`,
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    );
    return res.schedule;
  }

  /** Cancel a pending flag schedule. */
  async cancelFlagSchedule(
    key: string,
    scheduleId: string,
    projectId: string
  ): Promise<Schedule> {
    const res = await this.request<{ schedule: Schedule }>(
      `/manage/flags/${enc(key)}/schedules/${enc(scheduleId)}?project_id=${enc(projectId)}`,
      { method: "DELETE" }
    );
    return res.schedule;
  }

  // ── Configs ────────────────────────────────────────────────────

  /** List all configs for a project. */
  async listConfigs(projectId: string): Promise<ManagedConfig[]> {
    const res = await this.request<{ configs: ManagedConfig[] }>(
      `/manage/configs?project_id=${enc(projectId)}`
    );
    return res.configs;
  }

  /** Get a single config by key. */
  async getConfig(key: string, projectId: string): Promise<ManagedConfig> {
    const res = await this.request<{ config: ManagedConfig }>(
      `/manage/configs/${enc(key)}?project_id=${enc(projectId)}`
    );
    return res.config;
  }

  /** Create a new remote config. */
  async createConfig(params: CreateConfigParams): Promise<ManagedConfig> {
    const res = await this.request<{ config: ManagedConfig }>("/manage/configs", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return res.config;
  }

  /** Update a remote config. */
  async updateConfig(
    key: string,
    projectId: string,
    params: UpdateConfigParams
  ): Promise<ManagedConfig> {
    const res = await this.request<{ config: ManagedConfig }>(
      `/manage/configs/${enc(key)}?project_id=${enc(projectId)}`,
      {
        method: "PUT",
        body: JSON.stringify(params),
      }
    );
    return res.config;
  }

  /** Delete a remote config. */
  async deleteConfig(key: string, projectId: string): Promise<void> {
    await this.request(
      `/manage/configs/${enc(key)}?project_id=${enc(projectId)}`,
      { method: "DELETE" }
    );
  }

  /** Update a config value for a specific environment. */
  async updateConfigValue(
    key: string,
    projectId: string,
    environmentId: string,
    value: unknown
  ): Promise<ConfigEnvironment> {
    const res = await this.request<{ config_environment: ConfigEnvironment }>(
      `/manage/configs/${enc(key)}/value?project_id=${enc(projectId)}&environment_id=${enc(environmentId)}`,
      {
        method: "PUT",
        body: JSON.stringify({ value }),
      }
    );
    return res.config_environment;
  }

  // ── AI Configs ─────────────────────────────────────────────────

  /** List all AI config files. Provide environment_id to scope to a single environment. */
  async listAiConfigs(
    projectId: string,
    environmentId?: string
  ): Promise<ManagedAiConfig[]> {
    let path = `/manage/ai-configs?project_id=${enc(projectId)}`;
    if (environmentId) path += `&environment_id=${enc(environmentId)}`;
    const res = await this.request<{ ai_configs: ManagedAiConfig[] }>(path);
    return res.ai_configs;
  }

  /** Get a single AI config file by name. */
  async getAiConfig(
    fileName: string,
    projectId: string,
    environmentId: string
  ): Promise<ManagedAiConfig> {
    const res = await this.request<{ ai_config: ManagedAiConfig }>(
      `/manage/ai-configs/${enc(fileName)}?project_id=${enc(projectId)}&environment_id=${enc(environmentId)}`
    );
    return res.ai_config;
  }

  /** Create a new AI config file. */
  async createAiConfig(params: CreateAiConfigParams): Promise<ManagedAiConfig> {
    const res = await this.request<{ ai_config: ManagedAiConfig }>(
      "/manage/ai-configs",
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    );
    return res.ai_config;
  }

  /** Update an AI config file. */
  async updateAiConfig(
    fileName: string,
    projectId: string,
    environmentId: string,
    params: UpdateAiConfigParams
  ): Promise<ManagedAiConfig> {
    const res = await this.request<{ ai_config: ManagedAiConfig }>(
      `/manage/ai-configs/${enc(fileName)}?project_id=${enc(projectId)}&environment_id=${enc(environmentId)}`,
      {
        method: "PUT",
        body: JSON.stringify(params),
      }
    );
    return res.ai_config;
  }

  /** Delete an AI config file. */
  async deleteAiConfig(
    fileName: string,
    projectId: string,
    environmentId: string
  ): Promise<void> {
    await this.request(
      `/manage/ai-configs/${enc(fileName)}?project_id=${enc(projectId)}&environment_id=${enc(environmentId)}`,
      { method: "DELETE" }
    );
  }

  /** Initialize default AI config files for an environment. */
  async initializeAiConfigs(
    projectId: string,
    environmentId: string
  ): Promise<ManagedAiConfig[]> {
    const res = await this.request<{ ai_configs: ManagedAiConfig[] }>(
      "/manage/ai-configs/initialize",
      {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, environment_id: environmentId }),
      }
    );
    return res.ai_configs;
  }

  // ── Webhooks ───────────────────────────────────────────────────

  /** List all webhook endpoints for a project. */
  async listWebhooks(projectId: string): Promise<WebhookEndpoint[]> {
    const res = await this.request<{ endpoints: WebhookEndpoint[] }>(
      `/manage/webhooks?project_id=${enc(projectId)}`
    );
    return res.endpoints;
  }

  /** Get a single webhook endpoint. */
  async getWebhook(id: string): Promise<WebhookEndpoint> {
    const res = await this.request<{ endpoint: WebhookEndpoint }>(
      `/manage/webhooks/${enc(id)}`
    );
    return res.endpoint;
  }

  /** Create a new webhook endpoint. Returns the signing secret (only shown once). */
  async createWebhook(params: CreateWebhookParams): Promise<WebhookEndpoint> {
    const res = await this.request<{ endpoint: WebhookEndpoint }>(
      "/manage/webhooks",
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    );
    return res.endpoint;
  }

  /** Update a webhook endpoint. */
  async updateWebhook(
    id: string,
    params: UpdateWebhookParams
  ): Promise<WebhookEndpoint> {
    const res = await this.request<{ endpoint: WebhookEndpoint }>(
      `/manage/webhooks/${enc(id)}`,
      {
        method: "PUT",
        body: JSON.stringify(params),
      }
    );
    return res.endpoint;
  }

  /** Delete a webhook endpoint. */
  async deleteWebhook(id: string): Promise<void> {
    await this.request(`/manage/webhooks/${enc(id)}`, { method: "DELETE" });
  }

  /** Regenerate the signing secret for a webhook endpoint. */
  async regenerateWebhookSecret(id: string): Promise<WebhookEndpoint> {
    const res = await this.request<{ endpoint: WebhookEndpoint }>(
      `/manage/webhooks/${enc(id)}/regenerate-secret`,
      { method: "POST" }
    );
    return res.endpoint;
  }

  /** Reactivate a disabled webhook endpoint. */
  async reactivateWebhook(id: string): Promise<WebhookEndpoint> {
    const res = await this.request<{ endpoint: WebhookEndpoint }>(
      `/manage/webhooks/${enc(id)}/reactivate`,
      { method: "POST" }
    );
    return res.endpoint;
  }

  /** List delivery logs for a webhook endpoint. */
  async listWebhookDeliveries(
    id: string,
    options?: ListDeliveriesOptions
  ): Promise<WebhookDelivery[]> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    const res = await this.request<{ deliveries: WebhookDelivery[] }>(
      `/manage/webhooks/${enc(id)}/deliveries?limit=${limit}&offset=${offset}`
    );
    return res.deliveries;
  }

  // ── Internal ───────────────────────────────────────────────────

  private async request<T = void>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.opts.baseUrl}/api/v1${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.opts.timeout);

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          "Content-Type": "application/json",
          ...(init?.headers as Record<string, string>),
        },
      });

      if (!res.ok) {
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          // ignore parse errors
        }
        throw new FlagDashApiError(
          `FlagDash API error: ${res.status} ${res.statusText}`,
          res.status,
          body
        );
      }

      // 204 No Content
      if (res.status === 204) return undefined as T;

      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function enc(value: string): string {
  return encodeURIComponent(value);
}
