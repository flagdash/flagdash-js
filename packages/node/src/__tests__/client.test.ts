import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlagDashServerClient } from '../client';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeClient(overrides: Record<string, unknown> = {}): FlagDashServerClient {
  return new FlagDashServerClient({
    sdkKey: 'server_sk_123',
    baseUrl: 'http://localhost:4000',
    ...overrides,
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('FlagDashServerClient', () => {
  it('throws if sdkKey is missing', () => {
    expect(() => new FlagDashServerClient({ sdkKey: '' })).toThrow(
      'FlagDash: sdkKey is required'
    );
  });

  it('flag() fetches from /server/flags and caches result', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          flags: [{ key: 'my-flag', evaluated_value: true }],
          evaluated: { 'my-flag': true },
        }),
    });

    const client = makeClient();
    const value = await client.flag('my-flag');

    expect(value).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/server/flags');
    expect(url).not.toContain('/evaluate');
  });

  it('flag() returns cached value on subsequent calls', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          flags: [{ key: 'my-flag', evaluated_value: true }],
          evaluated: { 'my-flag': true },
        }),
    });

    const client = makeClient();

    const first = await client.flag('my-flag');
    const second = await client.flag('my-flag');

    expect(first).toBe(true);
    expect(second).toBe(true);
    // Only one fetch should have been made; the second call uses the cache
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('experiment() normalizes a stable assignment response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        experiment: {
          key: 'checkout-flow',
          status: 'running',
          variant_key: 'treatment',
          parameters: { button_color: 'violet' },
          reason: 'experiment',
        },
      }),
    });

    const assignment = await makeClient().experiment('checkout-flow', {
      user: { id: 'user-123' },
    });

    expect(assignment).toEqual({
      key: 'checkout-flow',
      status: 'running',
      variantKey: 'treatment',
      parameters: { button_color: 'violet' },
      reason: 'experiment',
    });
    expect(mockFetch.mock.calls[0][0]).toContain(
      '/experiments/checkout-flow?user_id=user-123'
    );
  });

  it('experiment() does not request an assignment without a stable identity', async () => {
    expect(await makeClient().experiment('checkout-flow', {})).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('buffers and flushes experiment metrics', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ accepted: 1 }) });
    const client = makeClient();
    client.trackExperimentMetric({ experimentKey: 'checkout-flow', eventName: 'checkout_completed', context: { user: { id: 'user-123' } }, eventId: 'evt-fixed' });
    await client.flushExperimentEvents();
    expect(mockFetch.mock.calls[0][0]).toContain('/server/experiment-events/batch');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).events[0].event_id).toBe('evt-fixed');
  });

  it('flag() sends context as GET query params (no POST)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          flags: [{ key: 'my-flag', evaluated_value: true }],
          evaluated: { 'my-flag': true },
        }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ flag: { key: 'my-flag', evaluated_value: false } }),
    });

    const client = makeClient();

    // First call populates cache
    const cached = await client.flag('my-flag');
    expect(cached).toBe(true);

    // Second call with context bypasses cache, uses GET with query params
    const context = { user: { id: 'user_1' } };
    const contextual = await client.flag('my-flag', context);
    expect(contextual).toBe(false);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const secondCall = mockFetch.mock.calls[1];
    expect(secondCall[0]).toContain('/server/flags/my-flag?user_id=user_1');
    // Should NOT be a POST
    expect(secondCall[1]?.method).toBeUndefined();
    expect(secondCall[1]?.body).toBeUndefined();
  });

  it('flag() returns default on error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const client = makeClient();

    // With context, the error is caught internally and the default is returned
    const value = await client.flag('my-flag', { user: { id: 'user_1' } }, false);
    expect(value).toBe(false);
  });

  it('allFlags() with context returns evaluated map from /server/flags', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          flags: [{ key: 'my-flag', evaluated_value: true }],
          evaluated: { 'my-flag': true },
        }),
    });

    const client = makeClient();
    const flags = await client.allFlags({ user: { id: 'user_1' } });

    expect(flags).toEqual({ 'my-flag': true });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/server/flags?user_id=user_1');
  });

  it('config() fetches and returns value', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: { tier: 'pro' } }),
    });

    const client = makeClient();
    const value = await client.config<{ tier: string }>('pricing');

    expect(value).toEqual({ tier: 'pro' });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/configs/pricing');
  });

  it('config() returns default on error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const client = makeClient();
    const value = await client.config('missing', 'fallback');

    expect(value).toBe('fallback');
  });

  it('config() caches results', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: { tier: 'pro' } }),
    });

    const client = makeClient();

    const first = await client.config('pricing');
    const second = await client.config('pricing');

    expect(first).toEqual({ tier: 'pro' });
    expect(second).toEqual({ tier: 'pro' });
    // Only one fetch should have been made
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('getFlag() fetches flag with full details from /server/flags/:key', async () => {
    const flagData = {
      key: 'my-flag',
      name: 'My Flag',
      description: 'A test flag',
      flag_type: 'boolean',
      enabled: true,
      default_value: false,
      evaluated_value: true,
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ flag: flagData }),
    });

    const client = makeClient();
    const flag = await client.getFlag('my-flag');

    expect(flag).toEqual(flagData);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/server/flags/my-flag');
  });

  it('listFlags() fetches all flags from /server/flags', async () => {
    const flagList = [
      { key: 'flag-a', name: 'Flag A', flag_type: 'boolean', enabled: true },
      { key: 'flag-b', name: 'Flag B', flag_type: 'string', enabled: false },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ flags: flagList, evaluated: { 'flag-a': true, 'flag-b': false } }),
    });

    const client = makeClient();
    const flags = await client.listFlags();

    expect(flags).toEqual(flagList);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/server/flags');
  });

  it('clearCache() forces fresh fetch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          flags: [{ key: 'my-flag', evaluated_value: true }],
          evaluated: { 'my-flag': true },
        }),
    });

    const client = makeClient();

    // First call fetches from API
    const first = await client.flag('my-flag');
    expect(first).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Clear the cache
    client.clearCache();

    // Second call should fetch again because cache was cleared
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          flags: [{ key: 'my-flag', evaluated_value: false }],
          evaluated: { 'my-flag': false },
        }),
    });

    const second = await client.flag('my-flag');
    expect(second).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // ── flagDetail tests ─────────────────────────────────────────

  describe('flagDetail()', () => {
    // flagDetail calls the *server* tier, which wraps its payload in `flag` and
    // names the evaluation fields `evaluated_value` / `evaluation_path`. These
    // mocks mirror that shape exactly — mocking the client tier's flat
    // `{ value, reason }` here would let a parsing regression pass unnoticed.
    const serverFlagResponse = (flag: Record<string, unknown>) => ({
      ok: true,
      json: () => Promise.resolve({ flag }),
    });

    it('returns full detail from /server/flags/:key', async () => {
      mockFetch.mockResolvedValue(
        serverFlagResponse({
          key: 'checkout-flow',
          evaluated_value: 'variant-b',
          evaluation_path: 'variation',
          variation_key: 'b',
        })
      );

      const client = makeClient();
      const detail = await client.flagDetail('checkout-flow');

      expect(detail).toEqual({
        key: 'checkout-flow',
        value: 'variant-b',
        reason: 'variation',
        variationKey: 'b',
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/server/flags/checkout-flow');
    });

    it('sends context as query params', async () => {
      mockFetch.mockResolvedValue(
        serverFlagResponse({
          key: 'my-flag',
          evaluated_value: true,
          evaluation_path: 'rollout',
        })
      );

      const client = makeClient();
      const detail = await client.flagDetail('my-flag', {
        user: { id: 'user_1', plan: 'pro' },
      });

      expect(detail).toEqual({
        key: 'my-flag',
        value: true,
        reason: 'rollout',
        variationKey: null,
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/server/flags/my-flag?');
      expect(url).toContain('user_id=user_1');
      expect(url).toContain('user_plan=pro');
    });

    it('returns default detail on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const client = makeClient();
      const detail = await client.flagDetail('my-flag', undefined, false);

      expect(detail).toEqual({
        key: 'my-flag',
        value: false,
        reason: 'default',
        variationKey: null,
      });
    });

    it('handles missing variation_key in response', async () => {
      mockFetch.mockResolvedValue(
        serverFlagResponse({
          key: 'simple-flag',
          evaluated_value: true,
          evaluation_path: 'rollout',
        })
      );

      const client = makeClient();
      const detail = await client.flagDetail('simple-flag');

      expect(detail.variationKey).toBeNull();
      expect(detail.reason).toBe('rollout');
    });

    it('handles disabled flag reason', async () => {
      mockFetch.mockResolvedValue(
        serverFlagResponse({
          key: 'disabled-flag',
          evaluated_value: false,
          evaluation_path: 'disabled',
        })
      );

      const client = makeClient();
      const detail = await client.flagDetail('disabled-flag');

      expect(detail).toEqual({
        key: 'disabled-flag',
        value: false,
        reason: 'disabled',
        variationKey: null,
      });
    });

    it('handles rule_match reason', async () => {
      mockFetch.mockResolvedValue(
        serverFlagResponse({
          key: 'targeted-flag',
          evaluated_value: 'special',
          evaluation_path: 'rule_match',
        })
      );

      const client = makeClient();
      const detail = await client.flagDetail<string>('targeted-flag', {
        user: { id: 'user_1', email: 'vip@example.com' },
      });

      expect(detail.reason).toBe('rule_match');
      expect(detail.value).toBe('special');
    });
  });

  // ── AI Config tests ──────────────────────────────────────────

  describe('aiConfig()', () => {
    it('fetches a single AI config by file name', async () => {
      const aiConfigData = {
        id: 'aic_123',
        file_name: 'agent.md',
        file_type: 'agent',
        content: '# Agent Instructions',
        is_active: true,
        metadata: null,
        folder: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ai_config: aiConfigData }),
      });

      const client = makeClient();
      const result = await client.aiConfig('agent.md');

      expect(result).toEqual(aiConfigData);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/server/ai-configs/agent.md');
    });

    it('returns null on 404', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const client = makeClient();
      const result = await client.aiConfig('nonexistent.md');

      expect(result).toBeNull();
    });

    it('caches AI config results', async () => {
      const aiConfigData = {
        id: 'aic_123',
        file_name: 'agent.md',
        file_type: 'agent',
        content: '# Agent',
        is_active: true,
        metadata: null,
        folder: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ai_config: aiConfigData }),
      });

      const client = makeClient();

      const first = await client.aiConfig('agent.md');
      const second = await client.aiConfig('agent.md');

      expect(first).toEqual(aiConfigData);
      expect(second).toEqual(aiConfigData);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('listAiConfigs()', () => {
    const aiConfigs = [
      { id: 'aic_1', file_name: 'agent.md', file_type: 'agent', content: '# Agent', is_active: true, metadata: null, folder: null, created_at: '', updated_at: '' },
      { id: 'aic_2', file_name: 'code-review.md', file_type: 'skill', content: '# Skill', is_active: true, metadata: null, folder: 'skills', created_at: '', updated_at: '' },
      { id: 'aic_3', file_name: 'security.md', file_type: 'rule', content: '# Rule', is_active: true, metadata: null, folder: 'rules', created_at: '', updated_at: '' },
    ];

    it('lists all AI configs', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ai_configs: aiConfigs }),
      });

      const client = makeClient();
      const result = await client.listAiConfigs();

      expect(result).toEqual(aiConfigs);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/server/ai-configs');
    });

    it('filters by file type', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ai_configs: aiConfigs }),
      });

      const client = makeClient();
      const result = await client.listAiConfigs({ fileType: 'skill' });

      expect(result).toHaveLength(1);
      expect(result[0].file_name).toBe('code-review.md');
    });

    it('filters by folder', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ai_configs: aiConfigs }),
      });

      const client = makeClient();
      const result = await client.listAiConfigs({ folder: 'rules' });

      expect(result).toHaveLength(1);
      expect(result[0].file_name).toBe('security.md');
    });
  });
});
