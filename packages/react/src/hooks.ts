import { useContext, useEffect, useState, useCallback, useRef } from "react";
import type { EvaluationContext, AiConfig, ListAiConfigsOptions } from "@flagdash/sdk";
import { FlagDashContext } from "./context";

function useFlagDashClient() {
  const { client, isReady } = useContext(FlagDashContext);
  if (!client) {
    throw new Error("useFlag/useConfig/useAiConfig must be used within a <FlagDashProvider>");
  }
  return { client, isReady };
}

/** Return value for useFlag with loading state */
export interface UseFlagResult<T> {
  value: T;
  isLoading: boolean;
}

/**
 * Evaluate a feature flag reactively.
 *
 * @param key - The flag key
 * @param defaultValue - Fallback value while loading or if the flag is missing
 * @param context - Optional evaluation context for targeting
 *
 * @example
 * ```tsx
 * const showBanner = useFlag('show-banner', false);
 * const { value, isLoading } = useFlagWithLoading('show-banner', false);
 * ```
 */
export function useFlag<T = boolean>(
  key: string,
  defaultValue: T,
  context?: EvaluationContext
): T {
  const { client, isReady } = useFlagDashClient();
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    if (!isReady) return;

    let cancelled = false;

    client.flag<T>(key, context, defaultValue).then((result) => {
      if (!cancelled) setValue(result);
    });

    const unsubscribe = client.on("flags_updated", () => {
      client.flag<T>(key, context, defaultValue).then((result) => {
        if (!cancelled) setValue(result);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, isReady, key, defaultValue, context]);

  return value;
}

/**
 * Evaluate a feature flag reactively with loading state.
 *
 * @param key - The flag key
 * @param defaultValue - Fallback value while loading or if the flag is missing
 * @param context - Optional evaluation context for targeting
 *
 * @example
 * ```tsx
 * const { value, isLoading } = useFlagWithLoading('show-banner', false);
 * if (isLoading) return <Spinner />;
 * ```
 */
export function useFlagWithLoading<T = boolean>(
  key: string,
  defaultValue: T,
  context?: EvaluationContext
): UseFlagResult<T> {
  const { client, isReady } = useFlagDashClient();
  const [value, setValue] = useState<T>(defaultValue);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isReady) {
      setIsLoading(true);
      return;
    }

    let cancelled = false;

    client.flag<T>(key, context, defaultValue).then((result) => {
      if (!cancelled) {
        setValue(result);
        setIsLoading(false);
      }
    });

    const unsubscribe = client.on("flags_updated", () => {
      client.flag<T>(key, context, defaultValue).then((result) => {
        if (!cancelled) setValue(result);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, isReady, key, defaultValue, context]);

  return { value, isLoading };
}

/** Return value for useConfig with loading state */
export interface UseConfigResult<T> {
  value: T;
  isLoading: boolean;
}

/**
 * Get a remote config value reactively.
 *
 * @param key - The config key
 * @param defaultValue - Fallback value while loading or if the config is missing
 *
 * @example
 * ```tsx
 * const pricing = useConfig('pricing-tiers', { basic: 9.99 });
 * ```
 */
export function useConfig<T = unknown>(key: string, defaultValue?: T): T {
  const { client, isReady } = useFlagDashClient();
  const [value, setValue] = useState<T>(defaultValue as T);

  useEffect(() => {
    if (!isReady) return;

    let cancelled = false;

    client.config<T>(key, defaultValue).then((result) => {
      if (!cancelled) setValue(result);
    });

    return () => {
      cancelled = true;
    };
  }, [client, isReady, key, defaultValue]);

  return value;
}

/**
 * Get a remote config value reactively with loading state.
 *
 * @param key - The config key
 * @param defaultValue - Fallback value while loading or if the config is missing
 *
 * @example
 * ```tsx
 * const { value, isLoading } = useConfigWithLoading('pricing-tiers', { basic: 9.99 });
 * ```
 */
export function useConfigWithLoading<T = unknown>(
  key: string,
  defaultValue?: T
): UseConfigResult<T> {
  const { client, isReady } = useFlagDashClient();
  const [value, setValue] = useState<T>(defaultValue as T);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isReady) {
      setIsLoading(true);
      return;
    }

    let cancelled = false;

    client.config<T>(key, defaultValue).then((result) => {
      if (!cancelled) {
        setValue(result);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [client, isReady, key, defaultValue]);

  return { value, isLoading };
}

/** Return value for useAiConfig */
export interface UseAiConfigResult {
  content: string | null;
  fileName: string;
  fileType: string | null;
  folder: string | null;
  isLoading: boolean;
}

/**
 * Get an AI config file reactively.
 *
 * @param fileName - The AI config file name
 * @param defaultContent - Optional default content while loading or on error
 *
 * @example
 * ```tsx
 * const { content, fileType, isLoading } = useAiConfig('agent.md');
 * ```
 */
export function useAiConfig(
  fileName: string,
  defaultContent?: string
): UseAiConfigResult {
  const { client, isReady } = useFlagDashClient();
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isReady) {
      setIsLoading(true);
      return;
    }

    let cancelled = false;

    client.aiConfig(fileName, defaultContent).then((result) => {
      if (!cancelled) {
        setConfig(result);
        setIsLoading(false);
      }
    });

    const unsubscribe = client.on("ai_config_updated", () => {
      client.aiConfig(fileName, defaultContent).then((result) => {
        if (!cancelled) setConfig(result);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, isReady, fileName, defaultContent]);

  return {
    content: config?.content ?? defaultContent ?? null,
    fileName,
    fileType: config?.file_type ?? null,
    folder: config?.folder ?? null,
    isLoading,
  };
}

/** Return value for useAiConfigs */
export interface UseAiConfigsResult {
  configs: AiConfig[];
  isLoading: boolean;
}

/**
 * List AI config files reactively.
 *
 * @param options - Optional filters (fileType, folder)
 *
 * @example
 * ```tsx
 * const { configs, isLoading } = useAiConfigs({ fileType: 'skill' });
 * ```
 */
export function useAiConfigs(options?: ListAiConfigsOptions): UseAiConfigsResult {
  const { client, isReady } = useFlagDashClient();
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Stabilize options reference to avoid infinite re-renders
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!isReady) {
      setIsLoading(true);
      return;
    }

    let cancelled = false;

    client.listAiConfigs(optionsRef.current).then((result) => {
      if (!cancelled) {
        setConfigs(result);
        setIsLoading(false);
      }
    });

    const unsubscribe = client.on("ai_config_updated", () => {
      client.listAiConfigs(optionsRef.current).then((result) => {
        if (!cancelled) setConfigs(result);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, isReady, options?.fileType, options?.folder]);

  return { configs, isLoading };
}

/**
 * Access the raw FlagDash client and readiness state.
 *
 * @example
 * ```tsx
 * const { client, isReady } = useFlagDash();
 * ```
 */
export function useFlagDash() {
  return useFlagDashClient();
}
