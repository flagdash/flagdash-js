import { useCallback, useContext, useEffect, useState, useRef } from "react";
import { formatTranslation } from "@flagdashio/sdk";
import type { EvaluationContext, AiConfig, ListAiConfigsOptions, FlagDetail, ExperimentAssignment, ExperimentMetricEvent, TranslationCatalog, TranslationOptions } from "@flagdashio/sdk";
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

  // Stabilize `context`/`defaultValue`: callers pass inline object/array
  // literals, which are a new reference every render. Putting those raw
  // references in the dependency array re-runs the effect on every render —
  // re-subscribing and re-fetching (the context path is uncached) each time.
  // We depend on a serialized context key instead, and read the latest values
  // through refs so the effect body still sees current data.
  const contextKey = context ? JSON.stringify(context) : "";
  const contextRef = useRef(context);
  contextRef.current = context;
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  useEffect(() => {
    if (!isReady) return;

    let cancelled = false;

    const fetchValue = () => {
      client.flag<T>(key, contextRef.current, defaultValueRef.current).then((result) => {
        if (!cancelled) setValue(result);
      });
    };

    fetchValue();
    const unsubscribe = client.on("flags_updated", fetchValue);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, isReady, key, contextKey]);

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

  // See useFlag: stabilize context/defaultValue to avoid a re-subscribe +
  // re-fetch storm when callers pass inline literals.
  const contextKey = context ? JSON.stringify(context) : "";
  const contextRef = useRef(context);
  contextRef.current = context;
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  useEffect(() => {
    if (!isReady) {
      setIsLoading(true);
      return;
    }

    let cancelled = false;

    client.flag<T>(key, contextRef.current, defaultValueRef.current).then((result) => {
      if (!cancelled) {
        setValue(result);
        setIsLoading(false);
      }
    });

    const unsubscribe = client.on("flags_updated", () => {
      client.flag<T>(key, contextRef.current, defaultValueRef.current).then((result) => {
        if (!cancelled) setValue(result);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, isReady, key, contextKey]);

  return { value, isLoading };
}

/** Return value for useFlagDetail */
export interface UseFlagDetailResult<T> {
  value: T;
  reason: string | null;
  variationKey: string | null;
  isLoading: boolean;
}

export interface UseExperimentResult {
  assignment: ExperimentAssignment | null;
  isLoading: boolean;
}

/** Resolve a stable experiment assignment for the supplied user context. */
export function useExperiment(
  key: string,
  context: EvaluationContext
): UseExperimentResult {
  const { client, isReady } = useFlagDashClient();
  const [assignment, setAssignment] = useState<ExperimentAssignment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const contextKey = JSON.stringify(context);
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    if (!isReady) {
      setIsLoading(true);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    client.experiment(key, contextRef.current).then((result) => {
      if (!cancelled) {
        setAssignment(result);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [client, isReady, key, contextKey]);

  return { assignment, isLoading };
}

/** Queue an outcome for the active experiment without blocking the UI. */
export function useExperimentMetric(): (event: ExperimentMetricEvent) => void {
  const { client } = useFlagDashClient();
  return useCallback((event: ExperimentMetricEvent) => client.trackExperimentMetric(event), [client]);
}

/**
 * Evaluate a flag with full detail (value, reason, variation key).
 * Re-evaluates on SSE updates.
 *
 * @param key - The flag key
 * @param defaultValue - Fallback value while loading or if the flag is missing
 * @param context - Optional evaluation context for targeting / A/B testing
 *
 * @example
 * ```tsx
 * const { value, reason, variationKey, isLoading } = useFlagDetail('checkout-flow', 'control', {
 *   user: { id: 'alice', plan: 'pro' },
 * });
 * ```
 */
export function useFlagDetail<T = unknown>(
  key: string,
  defaultValue: T,
  context?: EvaluationContext
): UseFlagDetailResult<T> {
  const { client, isReady } = useFlagDashClient();
  const [detail, setDetail] = useState<FlagDetail<T>>({
    key,
    value: defaultValue,
    reason: "default",
    variationKey: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  // See useFlag: stabilize context/defaultValue against inline-literal churn.
  const contextKey = context ? JSON.stringify(context) : "";
  const contextRef = useRef(context);
  contextRef.current = context;
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  useEffect(() => {
    if (!isReady) {
      setIsLoading(true);
      return;
    }

    let cancelled = false;

    const fetchDetail = () => {
      client.flagDetail<T>(key, contextRef.current, defaultValueRef.current).then((result) => {
        if (!cancelled) {
          setDetail(result);
          setIsLoading(false);
        }
      });
    };

    fetchDetail();

    const unsubscribe = client.on("flags_updated", () => {
      if (!cancelled) fetchDetail();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, isReady, key, contextKey]);

  return {
    value: detail.value,
    reason: detail.reason,
    variationKey: detail.variationKey,
    isLoading,
  };
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

  // Read defaultValue via a ref so an inline object/array default doesn't
  // re-run the effect (and re-subscribe/re-fetch) on every render.
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  useEffect(() => {
    if (!isReady) return;

    let cancelled = false;

    const fetchValue = () => {
      client.config<T>(key, defaultValueRef.current).then((result) => {
        if (!cancelled) setValue(result);
      });
    };

    fetchValue();
    const unsubscribe = client.on("configs_updated", fetchValue);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, isReady, key]);

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

  // See useConfig: read defaultValue via ref to avoid inline-literal churn.
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  useEffect(() => {
    if (!isReady) {
      setIsLoading(true);
      return;
    }

    let cancelled = false;

    client.config<T>(key, defaultValueRef.current).then((result) => {
      if (!cancelled) {
        setValue(result);
        setIsLoading(false);
      }
    });

    const unsubscribe = client.on("configs_updated", () => {
      client.config<T>(key, defaultValueRef.current).then((result) => {
        if (!cancelled) setValue(result);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, isReady, key]);

  return { value, isLoading };
}

export interface UseTranslationResult {
  t: (key: string, options?: Omit<TranslationOptions, "locale">) => string;
  isLoading: boolean;
  error: Error | null;
}

export function useTranslation(locale: string, namespace: string): UseTranslationResult {
  const { client, isReady } = useFlagDashClient();
  const [catalog, setCatalog] = useState<TranslationCatalog | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;
    const load = () => client.translations(locale, namespace).then((value) => {
      if (!cancelled) { setCatalog(value); setError(null); }
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason : new Error("Translation catalog failed to load"));
    });
    void load();
    const unsubscribe = client.on("translation_updated", load);
    return () => { cancelled = true; unsubscribe(); };
  }, [client, isReady, locale, namespace]);

  const t = useCallback((key: string, options?: Omit<TranslationOptions, "locale">) => {
    const localKey = key.startsWith(`${namespace}.`) ? key.slice(namespace.length + 1) : key;
    const pattern = catalog?.messages[localKey];
    return pattern === undefined ? options?.defaultValue ?? key : formatTranslation(pattern, catalog?.sources[localKey] ?? locale, options?.variables);
  }, [catalog, locale, namespace]);

  return { t, isLoading: !catalog && !error, error };
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
