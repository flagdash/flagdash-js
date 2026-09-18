import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { FlagDashContext } from "../context";
import {
  useFlag,
  useFlagWithLoading,
  useFlagDetail,
  useConfig,
  useConfigWithLoading,
  useAiConfig,
  useAiConfigs,
  useFlagDash,
} from "../hooks";

// Mock ReactNativeClient
function createMockClient(overrides: Record<string, any> = {}) {
  const listeners = new Map<string, Set<Function>>();

  return {
    flag: vi.fn().mockResolvedValue(true),
    flagDetail: vi.fn().mockResolvedValue({
      key: "test",
      value: true,
      reason: "default",
      variationKey: null,
    }),
    config: vi.fn().mockResolvedValue({ tier: "pro" }),
    aiConfig: vi.fn().mockResolvedValue({
      file_name: "agent.md",
      file_type: "agent",
      content: "# Agent",
      folder: null,
    }),
    listAiConfigs: vi.fn().mockResolvedValue([
      { file_name: "agent.md", file_type: "agent", content: "# Agent", folder: null },
      { file_name: "skill.md", file_type: "skill", content: "# Skill", folder: "tools" },
    ]),
    allFlags: vi.fn().mockResolvedValue({}),
    allConfigs: vi.fn().mockResolvedValue({}),
    on: vi.fn((event: string, listener: Function) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
      return () => listeners.get(event)?.delete(listener);
    }),
    destroy: vi.fn(),
    _emit: (event: string, data?: unknown) => {
      listeners.get(event)?.forEach((l) => l(data));
    },
    ...overrides,
  };
}

function createWrapper(client: any, isReady = true) {
  return ({ children }: { children: ReactNode }) =>
    createElement(
      FlagDashContext.Provider,
      { value: { client, isReady } },
      children
    );
}

describe("useFlag", () => {
  it("returns default value initially", () => {
    const client = createMockClient();
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useFlag("my-flag", false), { wrapper });
    expect(result.current).toBe(false);
  });

  it("resolves to flag value after ready", async () => {
    const client = createMockClient({ flag: vi.fn().mockResolvedValue(true) });
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useFlag("my-flag", false), { wrapper });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("re-evaluates on flags_updated event", async () => {
    const client = createMockClient({
      flag: vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
    });
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useFlag("my-flag", false), { wrapper });

    await waitFor(() => expect(result.current).toBe(true));

    act(() => {
      client._emit("flags_updated");
    });

    await waitFor(() => expect(result.current).toBe(false));
  });

  it("throws without provider", () => {
    expect(() => {
      renderHook(() => useFlag("my-flag", false));
    }).toThrow("useFlag/useConfig/useAiConfig must be used within a <FlagDashProvider>");
  });
});

describe("useFlagWithLoading", () => {
  it("starts with isLoading true", () => {
    const client = createMockClient();
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useFlagWithLoading("my-flag", false), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.value).toBe(false);
  });

  it("resolves with isLoading false and correct value", async () => {
    const client = createMockClient({ flag: vi.fn().mockResolvedValue(true) });
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useFlagWithLoading("my-flag", false), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.value).toBe(true);
    });
  });

  it("stays loading when client is not ready", () => {
    const client = createMockClient();
    const wrapper = createWrapper(client, false);

    const { result } = renderHook(() => useFlagWithLoading("my-flag", false), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });
});

describe("useFlagDetail", () => {
  it("returns default detail initially", () => {
    const client = createMockClient();
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useFlagDetail("my-flag", "control"), { wrapper });
    expect(result.current.value).toBe("control");
    expect(result.current.isLoading).toBe(true);
  });

  it("resolves with flag detail after ready", async () => {
    const client = createMockClient({
      flagDetail: vi.fn().mockResolvedValue({
        key: "my-flag",
        value: "variant-a",
        reason: "variation",
        variationKey: "var-a",
      }),
    });
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useFlagDetail("my-flag", "control"), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.value).toBe("variant-a");
      expect(result.current.reason).toBe("variation");
      expect(result.current.variationKey).toBe("var-a");
    });
  });
});

describe("useConfig", () => {
  it("returns default value initially", () => {
    const client = createMockClient();
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useConfig("pricing", { basic: 9.99 }), { wrapper });
    expect(result.current).toEqual({ basic: 9.99 });
  });

  it("resolves to config value after ready", async () => {
    const client = createMockClient({
      config: vi.fn().mockResolvedValue({ tier: "pro" }),
    });
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useConfig("pricing", null), { wrapper });

    await waitFor(() => {
      expect(result.current).toEqual({ tier: "pro" });
    });
  });
});

describe("useConfigWithLoading", () => {
  it("starts with isLoading true", () => {
    const client = createMockClient();
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useConfigWithLoading("pricing"), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });

  it("resolves with isLoading false", async () => {
    const client = createMockClient({
      config: vi.fn().mockResolvedValue({ tier: "pro" }),
    });
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useConfigWithLoading("pricing"), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.value).toEqual({ tier: "pro" });
    });
  });
});

describe("useAiConfig", () => {
  it("starts with isLoading true and null content", () => {
    const client = createMockClient();
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useAiConfig("agent.md"), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.content).toBeNull();
    expect(result.current.fileName).toBe("agent.md");
  });

  it("resolves with AI config data", async () => {
    const client = createMockClient({
      aiConfig: vi.fn().mockResolvedValue({
        file_name: "agent.md",
        file_type: "agent",
        content: "# My Agent",
        folder: null,
      }),
    });
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useAiConfig("agent.md"), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.content).toBe("# My Agent");
      expect(result.current.fileType).toBe("agent");
      expect(result.current.folder).toBeNull();
    });
  });

  it("uses default content when provided", () => {
    const client = createMockClient();
    const wrapper = createWrapper(client);

    const { result } = renderHook(
      () => useAiConfig("agent.md", "# Default"),
      { wrapper }
    );
    expect(result.current.content).toBe("# Default");
  });

  it("re-fetches on ai_config_updated event", async () => {
    const client = createMockClient({
      aiConfig: vi.fn()
        .mockResolvedValueOnce({
          file_name: "agent.md",
          file_type: "agent",
          content: "# V1",
          folder: null,
        })
        .mockResolvedValueOnce({
          file_name: "agent.md",
          file_type: "agent",
          content: "# V2",
          folder: null,
        }),
    });
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useAiConfig("agent.md"), { wrapper });

    await waitFor(() => expect(result.current.content).toBe("# V1"));

    act(() => {
      client._emit("ai_config_updated");
    });

    await waitFor(() => expect(result.current.content).toBe("# V2"));
  });
});

describe("useAiConfigs", () => {
  it("starts with isLoading true and empty configs", () => {
    const client = createMockClient();
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useAiConfigs(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.configs).toEqual([]);
  });

  it("resolves with list of configs", async () => {
    const configs = [
      { file_name: "agent.md", file_type: "agent", content: "# Agent", folder: null },
      { file_name: "skill.md", file_type: "skill", content: "# Skill", folder: "tools" },
    ];
    const client = createMockClient({
      listAiConfigs: vi.fn().mockResolvedValue(configs),
    });
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useAiConfigs(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.configs).toHaveLength(2);
    });
  });

  it("passes options to client", async () => {
    const client = createMockClient({
      listAiConfigs: vi.fn().mockResolvedValue([]),
    });
    const wrapper = createWrapper(client);

    renderHook(() => useAiConfigs({ fileType: "skill" }), { wrapper });

    await waitFor(() => {
      expect(client.listAiConfigs).toHaveBeenCalledWith({ fileType: "skill" });
    });
  });

  it("re-fetches on ai_config_updated event", async () => {
    const client = createMockClient({
      listAiConfigs: vi.fn()
        .mockResolvedValueOnce([{ file_name: "a.md", file_type: "agent", content: "#", folder: null }])
        .mockResolvedValueOnce([
          { file_name: "a.md", file_type: "agent", content: "#", folder: null },
          { file_name: "b.md", file_type: "skill", content: "#", folder: null },
        ]),
    });
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useAiConfigs(), { wrapper });

    await waitFor(() => expect(result.current.configs).toHaveLength(1));

    act(() => {
      client._emit("ai_config_updated");
    });

    await waitFor(() => expect(result.current.configs).toHaveLength(2));
  });
});

describe("useFlagDash", () => {
  it("returns client and isReady", () => {
    const client = createMockClient();
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useFlagDash(), { wrapper });
    expect(result.current.client).toBe(client);
    expect(result.current.isReady).toBe(true);
  });
});
