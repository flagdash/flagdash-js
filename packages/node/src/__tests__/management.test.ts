import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlagDashManagementClient } from '../management';
import { FlagDashApiError } from '../types';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeClient(overrides: Record<string, unknown> = {}): FlagDashManagementClient {
  return new FlagDashManagementClient({
    apiKey: 'management_key_123',
    baseUrl: 'http://localhost:4000',
    ...overrides,
  });
}

function mockResponse(data: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 204 ? 'No Content' : 'OK',
    json: () => Promise.resolve(data),
  });
}

function mock204() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 204,
    statusText: 'No Content',
    json: () => Promise.reject(new Error('No body')),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('FlagDashManagementClient', () => {
  it('throws if apiKey is missing', () => {
    expect(() => new FlagDashManagementClient({ apiKey: '' })).toThrow(
      'FlagDash: apiKey is required'
    );
  });

  it('sends Authorization header', async () => {
    mockResponse({ flags: [] });

    const client = makeClient();
    await client.listFlags('prj_123');

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer management_key_123');
  });

  it('throws FlagDashApiError on non-OK responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ error: 'Forbidden' }),
    });

    const client = makeClient();
    await expect(client.listFlags('prj_123')).rejects.toThrow(FlagDashApiError);
  });

  // ── Flags ──────────────────────────────────────────────────────

  describe('flags', () => {
    it('listFlags()', async () => {
      const flags = [{ id: 'flg_1', key: 'feature-a', name: 'Feature A' }];
      mockResponse({ flags });

      const client = makeClient();
      const result = await client.listFlags('prj_123');

      expect(result).toEqual(flags);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/manage/flags?project_id=prj_123');
    });

    it('getFlag()', async () => {
      const flag = { id: 'flg_1', key: 'feature-a', name: 'Feature A' };
      mockResponse({ flag });

      const client = makeClient();
      const result = await client.getFlag('feature-a', 'prj_123');

      expect(result).toEqual(flag);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/manage/flags/feature-a?project_id=prj_123');
    });

    it('createFlag()', async () => {
      const flag = { id: 'flg_1', key: 'new-flag', name: 'New Flag' };
      mockResponse({ flag }, 201);

      const client = makeClient();
      const result = await client.createFlag({
        project_id: 'prj_123',
        key: 'new-flag',
        name: 'New Flag',
      });

      expect(result).toEqual(flag);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/manage/flags');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toMatchObject({ key: 'new-flag' });
    });

    it('updateFlag()', async () => {
      const flag = { id: 'flg_1', key: 'feature-a', name: 'Updated' };
      mockResponse({ flag });

      const client = makeClient();
      const result = await client.updateFlag('feature-a', 'prj_123', { name: 'Updated' });

      expect(result).toEqual(flag);
      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe('PUT');
    });

    it('deleteFlag()', async () => {
      mock204();

      const client = makeClient();
      await client.deleteFlag('feature-a', 'prj_123');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/manage/flags/feature-a?project_id=prj_123');
      expect(init.method).toBe('DELETE');
    });

    it('toggleFlag()', async () => {
      const flagEnv = { id: 'fe_1', enabled: true, environment_id: 'env_1', feature_flag_id: 'flg_1' };
      mockResponse({ flag_environment: flagEnv });

      const client = makeClient();
      const result = await client.toggleFlag('feature-a', 'prj_123', 'env_1');

      expect(result).toEqual(flagEnv);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/manage/flags/feature-a/toggle');
      expect(url).toContain('project_id=prj_123');
      expect(url).toContain('environment_id=env_1');
      expect(init.method).toBe('POST');
    });

    it('updateFlagRules()', async () => {
      const flagEnv = { id: 'fe_1', rules: { rules: [] } };
      mockResponse({ flag_environment: flagEnv });

      const client = makeClient();
      const rules = { rules: [{ attribute: 'country', operator: 'eq', values: ['US'] }] };
      await client.updateFlagRules('feature-a', 'prj_123', 'env_1', rules);

      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body)).toMatchObject({ rules });
    });

    it('updateFlagRollout()', async () => {
      const flagEnv = { id: 'fe_1', rollout_percentage: 50 };
      mockResponse({ flag_environment: flagEnv });

      const client = makeClient();
      await client.updateFlagRollout('feature-a', 'prj_123', 'env_1', 50);

      const [, init] = mockFetch.mock.calls[0];
      expect(JSON.parse(init.body)).toMatchObject({ rollout_percentage: 50 });
    });

    it('setFlagVariations()', async () => {
      const variations = [
        { id: 'v_1', key: 'control', name: 'Control', value: { value: 'old' }, weight: 50 },
        { id: 'v_2', key: 'variant', name: 'Variant', value: { value: 'new' }, weight: 50 },
      ];
      mockResponse({ variations });

      const client = makeClient();
      const result = await client.setFlagVariations('feature-a', 'prj_123', 'env_1', [
        { key: 'control', name: 'Control', value: { value: 'old' }, weight: 50 },
        { key: 'variant', name: 'Variant', value: { value: 'new' }, weight: 50 },
      ]);

      expect(result).toEqual(variations);
    });

    it('deleteFlagVariations()', async () => {
      mock204();

      const client = makeClient();
      await client.deleteFlagVariations('feature-a', 'prj_123', 'env_1');

      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe('DELETE');
    });

    it('listFlagSchedules()', async () => {
      const schedules = [{ id: 'sch_1', action: 'enable', scheduled_at: '2026-03-01T00:00:00Z', status: 'pending' }];
      mockResponse({ schedules });

      const client = makeClient();
      const result = await client.listFlagSchedules('feature-a', 'prj_123', 'env_1');

      expect(result).toEqual(schedules);
    });

    it('createFlagSchedule()', async () => {
      const schedule = { id: 'sch_1', action: 'enable', scheduled_at: '2026-03-01T00:00:00Z', status: 'pending' };
      mockResponse({ schedule }, 201);

      const client = makeClient();
      const result = await client.createFlagSchedule('feature-a', 'prj_123', 'env_1', {
        action: 'enable',
        scheduled_at: '2026-03-01T00:00:00Z',
      });

      expect(result).toEqual(schedule);
    });

    it('cancelFlagSchedule()', async () => {
      const schedule = { id: 'sch_1', status: 'canceled' };
      mockResponse({ schedule });

      const client = makeClient();
      const result = await client.cancelFlagSchedule('feature-a', 'sch_1', 'prj_123');

      expect(result).toEqual(schedule);
      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe('DELETE');
    });
  });

  // ── Configs ────────────────────────────────────────────────────

  describe('configs', () => {
    it('listConfigs()', async () => {
      const configs = [{ id: 'cfg_1', key: 'api-url', name: 'API URL' }];
      mockResponse({ configs });

      const client = makeClient();
      const result = await client.listConfigs('prj_123');

      expect(result).toEqual(configs);
    });

    it('getConfig()', async () => {
      const config = { id: 'cfg_1', key: 'api-url', name: 'API URL' };
      mockResponse({ config });

      const client = makeClient();
      const result = await client.getConfig('api-url', 'prj_123');

      expect(result).toEqual(config);
    });

    it('createConfig()', async () => {
      const config = { id: 'cfg_1', key: 'api-url', name: 'API URL' };
      mockResponse({ config }, 201);

      const client = makeClient();
      const result = await client.createConfig({
        project_id: 'prj_123',
        key: 'api-url',
        name: 'API URL',
        config_type: 'string',
      });

      expect(result).toEqual(config);
    });

    it('updateConfig()', async () => {
      const config = { id: 'cfg_1', key: 'api-url', name: 'Updated' };
      mockResponse({ config });

      const client = makeClient();
      const result = await client.updateConfig('api-url', 'prj_123', { name: 'Updated' });

      expect(result).toEqual(config);
    });

    it('deleteConfig()', async () => {
      mock204();

      const client = makeClient();
      await client.deleteConfig('api-url', 'prj_123');

      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe('DELETE');
    });

    it('updateConfigValue()', async () => {
      const configEnv = { id: 'ce_1', value: { value: 'https://staging.api.com' } };
      mockResponse({ config_environment: configEnv });

      const client = makeClient();
      const result = await client.updateConfigValue(
        'api-url', 'prj_123', 'env_1', { value: 'https://staging.api.com' }
      );

      expect(result).toEqual(configEnv);
    });
  });

  // ── AI Configs ─────────────────────────────────────────────────

  describe('ai configs', () => {
    it('listAiConfigs() with project only', async () => {
      const aiConfigs = [{ id: 'aic_1', file_name: 'agent.md' }];
      mockResponse({ ai_configs: aiConfigs });

      const client = makeClient();
      const result = await client.listAiConfigs('prj_123');

      expect(result).toEqual(aiConfigs);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('project_id=prj_123');
      expect(url).not.toContain('environment_id');
    });

    it('listAiConfigs() with environment', async () => {
      const aiConfigs = [{ id: 'aic_1', file_name: 'agent.md' }];
      mockResponse({ ai_configs: aiConfigs });

      const client = makeClient();
      await client.listAiConfigs('prj_123', 'env_1');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('environment_id=env_1');
    });

    it('getAiConfig()', async () => {
      const aiConfig = { id: 'aic_1', file_name: 'agent.md', content: '# Agent' };
      mockResponse({ ai_config: aiConfig });

      const client = makeClient();
      const result = await client.getAiConfig('agent.md', 'prj_123', 'env_1');

      expect(result).toEqual(aiConfig);
    });

    it('createAiConfig()', async () => {
      const aiConfig = { id: 'aic_1', file_name: 'agent.md' };
      mockResponse({ ai_config: aiConfig }, 201);

      const client = makeClient();
      const result = await client.createAiConfig({
        project_id: 'prj_123',
        environment_id: 'env_1',
        file_name: 'agent.md',
        file_type: 'agent',
        content: '# Agent Instructions',
      });

      expect(result).toEqual(aiConfig);
      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe('POST');
    });

    it('updateAiConfig()', async () => {
      const aiConfig = { id: 'aic_1', file_name: 'agent.md', content: '# Updated' };
      mockResponse({ ai_config: aiConfig });

      const client = makeClient();
      const result = await client.updateAiConfig('agent.md', 'prj_123', 'env_1', {
        content: '# Updated',
      });

      expect(result).toEqual(aiConfig);
    });

    it('deleteAiConfig()', async () => {
      mock204();

      const client = makeClient();
      await client.deleteAiConfig('agent.md', 'prj_123', 'env_1');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/manage/ai-configs/agent.md');
      expect(init.method).toBe('DELETE');
    });

    it('initializeAiConfigs()', async () => {
      const aiConfigs = [
        { id: 'aic_1', file_name: 'agent.md' },
        { id: 'aic_2', file_name: 'code-review.md' },
      ];
      mockResponse({ ai_configs: aiConfigs }, 201);

      const client = makeClient();
      const result = await client.initializeAiConfigs('prj_123', 'env_1');

      expect(result).toEqual(aiConfigs);
      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe('POST');
    });
  });

  // ── Webhooks ───────────────────────────────────────────────────

  describe('webhooks', () => {
    it('listWebhooks()', async () => {
      const endpoints = [{ id: 'wh_1', url: 'https://example.com/hook' }];
      mockResponse({ endpoints });

      const client = makeClient();
      const result = await client.listWebhooks('prj_123');

      expect(result).toEqual(endpoints);
    });

    it('getWebhook()', async () => {
      const endpoint = { id: 'wh_1', url: 'https://example.com/hook' };
      mockResponse({ endpoint });

      const client = makeClient();
      const result = await client.getWebhook('wh_1');

      expect(result).toEqual(endpoint);
    });

    it('createWebhook()', async () => {
      const endpoint = { id: 'wh_1', url: 'https://example.com/hook', signing_secret: 'whsec_123' };
      mockResponse({ endpoint }, 201);

      const client = makeClient();
      const result = await client.createWebhook({
        project_id: 'prj_123',
        environment_id: 'env_1',
        url: 'https://example.com/hook',
        event_types: ['flag.updated', 'config.updated'],
      });

      expect(result).toEqual(endpoint);
      expect(result.signing_secret).toBe('whsec_123');
    });

    it('updateWebhook()', async () => {
      const endpoint = { id: 'wh_1', url: 'https://example.com/new-hook' };
      mockResponse({ endpoint });

      const client = makeClient();
      const result = await client.updateWebhook('wh_1', { url: 'https://example.com/new-hook' });

      expect(result).toEqual(endpoint);
    });

    it('deleteWebhook()', async () => {
      mock204();

      const client = makeClient();
      await client.deleteWebhook('wh_1');

      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe('DELETE');
    });

    it('regenerateWebhookSecret()', async () => {
      const endpoint = { id: 'wh_1', signing_secret: 'whsec_new' };
      mockResponse({ endpoint });

      const client = makeClient();
      const result = await client.regenerateWebhookSecret('wh_1');

      expect(result.signing_secret).toBe('whsec_new');
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/regenerate-secret');
      expect(init.method).toBe('POST');
    });

    it('reactivateWebhook()', async () => {
      const endpoint = { id: 'wh_1', is_active: true };
      mockResponse({ endpoint });

      const client = makeClient();
      const result = await client.reactivateWebhook('wh_1');

      expect(result.is_active).toBe(true);
    });

    it('listWebhookDeliveries()', async () => {
      const deliveries = [{ id: 'del_1', event_type: 'flag.updated', status: 'delivered' }];
      mockResponse({ deliveries });

      const client = makeClient();
      const result = await client.listWebhookDeliveries('wh_1', { limit: 10, offset: 5 });

      expect(result).toEqual(deliveries);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=5');
    });

    it('listWebhookDeliveries() uses defaults', async () => {
      mockResponse({ deliveries: [] });

      const client = makeClient();
      await client.listWebhookDeliveries('wh_1');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('limit=20');
      expect(url).toContain('offset=0');
    });
  });
});
