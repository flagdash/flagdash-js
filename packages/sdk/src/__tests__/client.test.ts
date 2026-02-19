import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlagDashClient } from '../client';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

/** Minimal mock for EventSource */
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onerror: (() => void) | null = null;
  private eventListeners: Map<string, Set<() => void>> = new Map();
  readyState = 0; // CONNECTING

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, handler: () => void) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  /** Simulate a server-sent event */
  simulateEvent(event: string) {
    this.eventListeners.get(event)?.forEach((h) => h());
  }

  close() {
    this.readyState = 2; // CLOSED
  }

  static reset() {
    MockEventSource.instances = [];
  }
}

/**
 * URL-based fetch mock factory.
 * Routes responses by URL path so tests aren't sensitive to call order
 * (the constructor does Promise.all([refreshFlags, refreshConfigs])).
 */
function createFetchMock(overrides: Record<string, () => Promise<any>> = {}) {
  const defaults: Record<string, () => Promise<any>> = {
    '/flags': () => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ flags: { "test-flag": true, "other": "hello" } }),
    }),
    '/configs': () => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ configs: [] }),
    }),
  };

  const handlers = { ...defaults, ...overrides };
  // Sort by path length descending so more specific paths match first
  // (e.g. /configs/pricing before /configs)
  const sortedPaths = Object.keys(handlers).sort((a, b) => b.length - a.length);

  return (url: string) => {
    for (const path of sortedPaths) {
      if (url.includes(path)) return handlers[path]();
    }
    return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
  };
}

/** Create a client and wait until it is ready (initial fetch resolved). */
function createReady(
  overrides: Record<string, unknown> = {}
): Promise<FlagDashClient> {
  return new Promise((resolve) => {
    const client = new FlagDashClient({
      sdkKey: 'client_pk_123',
      baseUrl: 'http://localhost:4000',
      ...overrides,
    } as any);
    client.on('ready', () => resolve(client));
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(createFetchMock());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FlagDashClient', () => {
  it('throws if sdkKey is missing', () => {
    expect(() => new FlagDashClient({ sdkKey: '' })).toThrow(
      'FlagDash: sdkKey is required'
    );
  });

  it('flag() returns cached value after init', async () => {
    const client = await createReady();

    // Verify initial fetch goes to GET /flags (not /flags/evaluate)
    const flagsCalls = mockFetch.mock.calls.filter(([url]: [string]) => url.includes('/flags'));
    expect(flagsCalls.length).toBeGreaterThanOrEqual(1);
    expect(flagsCalls[0][0]).not.toContain('/evaluate');

    const value = await client.flag('test-flag');
    expect(value).toBe(true);

    client.destroy();
  });

  it('flag() returns default value when flag not found', async () => {
    const client = await createReady();

    const value = await client.flag('nonexistent', undefined, 'fallback');
    expect(value).toBe('fallback');

    client.destroy();
  });

  it('flag() uses GET with context query params (no POST)', async () => {
    // After init, the next call to /flags/test-flag should return the context-evaluated value
    let callCount = 0;
    mockFetch.mockImplementation(createFetchMock({
      '/flags/test-flag': () => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ key: 'test-flag', value: false }),
        });
      },
    }));

    const client = await createReady();

    const context = { user: { id: 'user_1', email: 'test@example.com' } };
    const value = await client.flag('test-flag', context);

    expect(value).toBe(false);
    expect(callCount).toBe(1);

    const flagDetailCall = mockFetch.mock.calls.find(([url]: [string]) => url.includes('/flags/test-flag'));
    expect(flagDetailCall).toBeDefined();
    expect(flagDetailCall![0]).toContain('user_id=user_1');
    expect(flagDetailCall![0]).toContain('user_email=test%40example.com');
    // Should NOT have method: POST or body
    expect(flagDetailCall![1]?.method).toBeUndefined();
    expect(flagDetailCall![1]?.body).toBeUndefined();

    client.destroy();
  });

  it('allFlags() returns all cached flags', async () => {
    const client = await createReady();

    const flags = await client.allFlags();
    expect(flags).toEqual({ "test-flag": true, "other": "hello" });

    client.destroy();
  });

  it('allFlags() sends context as query params via GET', async () => {
    // After init (which caches flags), calling allFlags with context re-fetches
    mockFetch.mockImplementation(createFetchMock({
      // Override /flags to return different result when context params are present
      '/flags': (url?: string) => {
        // The mock receives the url but our factory doesn't pass it through to the handler,
        // so we use a simpler approach
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ flags: { "test-flag": false } }),
        });
      },
    }));

    const client = await createReady();

    const context = { user: { id: 'user_1' }, country: 'US' };
    const flags = await client.allFlags(context);

    expect(flags).toEqual({ "test-flag": false });

    const contextCall = mockFetch.mock.calls.find(
      ([url]: [string]) => url.includes('/flags?') && url.includes('user_id=user_1')
    );
    expect(contextCall).toBeDefined();
    expect(contextCall![0]).toContain('country=US');

    client.destroy();
  });

  it('config() fetches and returns value', async () => {
    mockFetch.mockImplementation(createFetchMock({
      '/configs/pricing': () => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ key: 'pricing', value: { tier: 'pro' }, config_type: 'json' }),
      }),
    }));

    const client = await createReady();

    const value = await client.config<{ tier: string }>('pricing');
    expect(value).toEqual({ tier: 'pro' });

    const configCall = mockFetch.mock.calls.find(([url]: [string]) => url.includes('/configs/pricing'));
    expect(configCall).toBeDefined();

    client.destroy();
  });

  it('config() returns default on error', async () => {
    mockFetch.mockImplementation(createFetchMock({
      '/configs/missing': () => Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      }),
    }));

    const client = await createReady();

    const value = await client.config('missing', 'default-val');
    expect(value).toBe('default-val');

    client.destroy();
  });

  it("on('ready') fires after initialization", async () => {
    const readyListener = vi.fn();

    const client = new FlagDashClient({
      sdkKey: 'client_pk_123',
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

    mockFetch.mockImplementation(createFetchMock());

    const client = new FlagDashClient({
      sdkKey: 'client_pk_123',
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
    mockFetch.mockImplementation(createFetchMock({
      '/ai-configs/agent.md': () => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          ai_config: {
            file_name: 'agent.md',
            file_type: 'agent',
            content: '# Agent Instructions',
            folder: null,
          },
        }),
      }),
    }));

    const client = await createReady();

    const result = await client.aiConfig('agent.md');
    expect(result).toEqual({
      file_name: 'agent.md',
      file_type: 'agent',
      content: '# Agent Instructions',
      folder: null,
    });

    const aiCall = mockFetch.mock.calls.find(([url]: [string]) => url.includes('/ai-configs/agent.md'));
    expect(aiCall).toBeDefined();

    client.destroy();
  });

  it('aiConfig() returns null when file not found and no default', async () => {
    mockFetch.mockImplementation(createFetchMock({
      '/ai-configs/nonexistent.md': () => Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }),
    }));

    const client = await createReady();

    const result = await client.aiConfig('nonexistent.md');
    expect(result).toBeNull();

    client.destroy();
  });

  it('aiConfig() returns default content on error when provided', async () => {
    mockFetch.mockImplementation(createFetchMock({
      '/ai-configs/missing.md': () => Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }),
    }));

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

    mockFetch.mockImplementation(createFetchMock({
      '/ai-configs': () => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ai_configs: configs }),
      }),
    }));

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

    mockFetch.mockImplementation(createFetchMock({
      '/ai-configs': () => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ai_configs: configs }),
      }),
    }));

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

    mockFetch.mockImplementation(createFetchMock({
      '/ai-configs': () => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ai_configs: configs }),
      }),
    }));

    const client = await createReady();

    const result = await client.listAiConfigs({ folder: 'tools' });
    expect(result).toHaveLength(1);
    expect(result[0].file_name).toBe('skill-1.md');

    client.destroy();
  });

  it('listAiConfigs() returns empty array on error', async () => {
    mockFetch.mockImplementation(createFetchMock({
      '/ai-configs': () => Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      }),
    }));

    const client = await createReady();

    const result = await client.listAiConfigs();
    expect(result).toEqual([]);

    client.destroy();
  });
});

describe('FlagDashClient — SSE (real-time)', () => {
  beforeEach(() => {
    MockEventSource.reset();
    (globalThis as any).EventSource = MockEventSource;
  });

  afterEach(() => {
    delete (globalThis as any).EventSource;
  });

  it('creates EventSource when realtime: true', async () => {
    const client = await createReady({ realtime: true });

    expect(MockEventSource.instances).toHaveLength(1);
    const es = MockEventSource.instances[0];
    expect(es.url).toContain('/api/v1/sse?api_key=');
    expect(es.url).toContain('client_pk_123');

    client.destroy();
  });

  it('does not create EventSource when realtime: false', async () => {
    const client = await createReady({ realtime: false });

    expect(MockEventSource.instances).toHaveLength(0);

    client.destroy();
  });

  it('does not create EventSource when realtime is undefined', async () => {
    const client = await createReady();

    expect(MockEventSource.instances).toHaveLength(0);

    client.destroy();
  });

  it('refreshes flags when receiving a flag event via SSE', async () => {
    const client = await createReady({ realtime: true });

    const callsBefore = mockFetch.mock.calls.length;
    const es = MockEventSource.instances[0];

    // Simulate a flag.toggled event from the server
    es.simulateEvent('flag.toggled');

    // Wait for the async refresh to trigger
    await vi.waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    client.destroy();
  });

  it('emits config_updated when receiving a config event via SSE', async () => {
    const client = await createReady({ realtime: true });

    const listener = vi.fn();
    client.on('config_updated', listener);

    const es = MockEventSource.instances[0];
    es.simulateEvent('config.updated');

    // Wait for async config refresh to complete and emit
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1);
    });

    client.destroy();
  });

  it('emits ai_config_updated when receiving an ai_config event via SSE', async () => {
    const client = await createReady({ realtime: true });

    const listener = vi.fn();
    client.on('ai_config_updated', listener);

    const es = MockEventSource.instances[0];
    es.simulateEvent('ai_config.created');

    expect(listener).toHaveBeenCalledTimes(1);

    client.destroy();
  });

  it('destroy() closes the EventSource', async () => {
    const client = await createReady({ realtime: true });

    const es = MockEventSource.instances[0];
    expect(es.readyState).not.toBe(2);

    client.destroy();

    expect(es.readyState).toBe(2); // CLOSED
  });

  it('falls back to polling when EventSource is not available', async () => {
    vi.useFakeTimers();
    delete (globalThis as any).EventSource;

    mockFetch.mockImplementation(createFetchMock());

    const client = new FlagDashClient({
      sdkKey: 'client_pk_123',
      baseUrl: 'http://localhost:4000',
      realtime: true,
    } as any);

    // Flush the initial fetch
    await vi.advanceTimersByTimeAsync(0);
    const callsAfterInit = mockFetch.mock.calls.length;

    // Should fall back to polling (30s default fallback interval)
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockFetch.mock.calls.length).toBeGreaterThan(callsAfterInit);

    client.destroy();
  });

  it('retries SSE with exponential backoff on error', async () => {
    vi.useFakeTimers();
    MockEventSource.reset();

    mockFetch.mockImplementation(createFetchMock());

    const client = new FlagDashClient({
      sdkKey: 'client_pk_123',
      baseUrl: 'http://localhost:4000',
      realtime: true,
    } as any);

    // Flush initial fetch
    await vi.advanceTimersByTimeAsync(0);
    expect(MockEventSource.instances).toHaveLength(1);

    // Simulate SSE error
    const es1 = MockEventSource.instances[0];
    es1.onerror?.();

    // After 1s backoff, should retry
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockEventSource.instances).toHaveLength(2);

    // Simulate another error
    const es2 = MockEventSource.instances[1];
    es2.onerror?.();

    // After 2s backoff, should retry again
    await vi.advanceTimersByTimeAsync(2000);
    expect(MockEventSource.instances).toHaveLength(3);

    client.destroy();
  });
});
