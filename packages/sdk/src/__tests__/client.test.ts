import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlagDashClient } from '../client';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

/** Create a client and wait until it is ready (initial fetch resolved). */
function createReady(
  overrides: Record<string, unknown> = {}
): Promise<FlagDashClient> {
  return new Promise((resolve) => {
    const client = new FlagDashClient({
      sdkKey: 'client_pk_123',
      environment: 'test',
      baseUrl: 'http://localhost:4000',
      ...overrides,
    } as any);
    client.on('ready', () => resolve(client));
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ flags: { "test-flag": true, "other": "hello" } }),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FlagDashClient', () => {
  it('throws if sdkKey is missing', () => {
    expect(() => new FlagDashClient({ sdkKey: '', environment: 'test' })).toThrow(
      'FlagDash: sdkKey is required'
    );
  });

  it('throws if environment is missing', () => {
    expect(() => new FlagDashClient({ sdkKey: 'client_pk_123', environment: '' })).toThrow(
      'FlagDash: environment is required'
    );
  });

  it('flag() returns cached value after init', async () => {
    const client = await createReady();

    // Verify initial fetch goes to GET /flags (not /flags/evaluate)
    const [initUrl] = mockFetch.mock.calls[0];
    expect(initUrl).toContain('/api/v1/flags');
    expect(initUrl).not.toContain('/evaluate');

    const value = await client.flag('test-flag');
    expect(value).toBe(true);

    // Should not trigger another fetch since the value is cached
    expect(mockFetch).toHaveBeenCalledTimes(1);

    client.destroy();
  });

  it('flag() returns default value when flag not found', async () => {
    const client = await createReady();

    const value = await client.flag('nonexistent', undefined, 'fallback');
    expect(value).toBe('fallback');

    client.destroy();
  });

  it('flag() uses GET with context query params (no POST)', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ flags: { "test-flag": true } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ key: 'test-flag', value: false }),
      });

    const client = await createReady();

    const context = { user: { id: 'user_1', email: 'test@example.com' } };
    const value = await client.flag('test-flag', context);

    expect(value).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const secondCall = mockFetch.mock.calls[1];
    // Should be a GET request with query params, not POST
    expect(secondCall[0]).toContain('/flags/test-flag?');
    expect(secondCall[0]).toContain('user_id=user_1');
    expect(secondCall[0]).toContain('user_email=test%40example.com');
    // Should NOT have method: POST or body
    expect(secondCall[1]?.method).toBeUndefined();
    expect(secondCall[1]?.body).toBeUndefined();

    client.destroy();
  });

  it('allFlags() returns all cached flags', async () => {
    const client = await createReady();

    const flags = await client.allFlags();
    expect(flags).toEqual({ "test-flag": true, "other": "hello" });

    // Should not trigger another fetch since flags are cached
    expect(mockFetch).toHaveBeenCalledTimes(1);

    client.destroy();
  });

  it('allFlags() sends context as query params via GET', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ flags: { "test-flag": true } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ flags: { "test-flag": false } }),
      });

    const client = await createReady();

    const context = { user: { id: 'user_1' }, country: 'US' };
    const flags = await client.allFlags(context);

    expect(flags).toEqual({ "test-flag": false });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const secondCall = mockFetch.mock.calls[1];
    expect(secondCall[0]).toContain('/flags?');
    expect(secondCall[0]).toContain('user_id=user_1');
    expect(secondCall[0]).toContain('country=US');

    client.destroy();
  });

  it('config() fetches and returns value', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ flags: { "test-flag": true } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ key: 'pricing', value: { tier: 'pro' }, config_type: 'json' }),
      });

    const client = await createReady();

    const value = await client.config<{ tier: string }>('pricing');
    expect(value).toEqual({ tier: 'pro' });

    const secondCall = mockFetch.mock.calls[1];
    expect(secondCall[0]).toContain('/configs/pricing');

    client.destroy();
  });

  it('config() returns default on error', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ flags: {} }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

    const client = await createReady();

    const value = await client.config('missing', 'default-val');
    expect(value).toBe('default-val');

    client.destroy();
  });

  it("on('ready') fires after initialization", async () => {
    const readyListener = vi.fn();

    const client = new FlagDashClient({
      sdkKey: 'client_pk_123',
      environment: 'test',
      baseUrl: 'http://localhost:4000',
    });

    client.on('ready', readyListener);

    await vi.waitFor(() => {
      expect(readyListener).toHaveBeenCalledTimes(1);
    });

    client.destroy();
  });

  it("on('error') fires on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const errorListener = vi.fn();

    const client = new FlagDashClient({
      sdkKey: 'client_pk_123',
      environment: 'test',
      baseUrl: 'http://localhost:4000',
    });

    client.on('error', errorListener);

    await vi.waitFor(() => {
      expect(errorListener).toHaveBeenCalled();
    });

    const errorArg = errorListener.mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(Error);
    expect(errorArg.message).toBe('Network error');

    client.destroy();
  });

  it('destroy() stops polling', async () => {
    vi.useFakeTimers();

    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ flags: { "test-flag": true } }),
      })
    );

    const client = new FlagDashClient({
      sdkKey: 'client_pk_123',
      environment: 'test',
      baseUrl: 'http://localhost:4000',
      refreshInterval: 1000,
    });

    // Flush the initial fetch microtasks
    await vi.advanceTimersByTimeAsync(0);

    const callsAfterInit = mockFetch.mock.calls.length;
    expect(callsAfterInit).toBeGreaterThanOrEqual(1);

    // Advance time to trigger polling cycles
    await vi.advanceTimersByTimeAsync(3000);
    const callsAfterPolling = mockFetch.mock.calls.length;
    expect(callsAfterPolling).toBeGreaterThan(callsAfterInit);

    // Destroy the client to stop polling
    client.destroy();
    const callsAfterDestroy = mockFetch.mock.calls.length;

    // Advance time again and verify no more calls are made
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockFetch.mock.calls.length).toBe(callsAfterDestroy);
  });
});

describe('FlagDashClient — AI Configs', () => {
  it('aiConfig() fetches a single AI config by file name', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ flags: {} }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ai_config: {
              file_name: 'agent.md',
              file_type: 'agent',
              content: '# Agent Instructions',
              folder: null,
            },
          }),
      });

    const client = await createReady();

    const result = await client.aiConfig('agent.md');
    expect(result).toEqual({
      file_name: 'agent.md',
      file_type: 'agent',
      content: '# Agent Instructions',
      folder: null,
    });

    const secondCall = mockFetch.mock.calls[1];
    expect(secondCall[0]).toContain('/ai-configs/agent.md');

    client.destroy();
  });

  it('aiConfig() returns null when file not found and no default', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ flags: {} }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

    const client = await createReady();

    const result = await client.aiConfig('nonexistent.md');
    expect(result).toBeNull();

    client.destroy();
  });

  it('aiConfig() returns default content on error when provided', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ flags: {} }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

    const client = await createReady();

    const result = await client.aiConfig('missing.md', '# Default Content');
    expect(result).toEqual({
      file_name: 'missing.md',
      file_type: 'skill',
      content: '# Default Content',
      folder: null,
    });

    client.destroy();
  });

  it('listAiConfigs() returns all AI configs', async () => {
    const configs = [
      { file_name: 'agent.md', file_type: 'agent', content: '# Agent', folder: null },
      { file_name: 'skill-1.md', file_type: 'skill', content: '# Skill', folder: 'tools' },
    ];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ flags: {} }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ai_configs: configs }),
      });

    const client = await createReady();

    const result = await client.listAiConfigs();
    expect(result).toEqual(configs);
    expect(result).toHaveLength(2);

    client.destroy();
  });

  it('listAiConfigs() filters by fileType', async () => {
    const configs = [
      { file_name: 'agent.md', file_type: 'agent', content: '# Agent', folder: null },
      { file_name: 'skill-1.md', file_type: 'skill', content: '# Skill', folder: null },
      { file_name: 'rule-1.md', file_type: 'rule', content: '# Rule', folder: null },
    ];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ flags: {} }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ai_configs: configs }),
      });

    const client = await createReady();

    const result = await client.listAiConfigs({ fileType: 'skill' });
    expect(result).toHaveLength(1);
    expect(result[0].file_name).toBe('skill-1.md');

    client.destroy();
  });

  it('listAiConfigs() filters by folder', async () => {
    const configs = [
      { file_name: 'agent.md', file_type: 'agent', content: '# Agent', folder: null },
      { file_name: 'skill-1.md', file_type: 'skill', content: '# Skill', folder: 'tools' },
    ];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ flags: {} }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ai_configs: configs }),
      });

    const client = await createReady();

    const result = await client.listAiConfigs({ folder: 'tools' });
    expect(result).toHaveLength(1);
    expect(result[0].file_name).toBe('skill-1.md');

    client.destroy();
  });

  it('listAiConfigs() returns empty array on error', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ flags: {} }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

    const client = await createReady();

    const result = await client.listAiConfigs();
    expect(result).toEqual([]);

    client.destroy();
  });
});
