import {
  formatTranslation,
  type AiConfig,
  type EvaluationContext,
  type ExperimentAssignment,
  type ExperimentMetricEvent,
  type FlagDetail,
  type ListAiConfigsOptions,
  type TranslationOptions,
} from "@flagdashio/sdk";
import {
  onScopeDispose,
  ref,
  shallowRef,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from "vue";
import { useFlagDash } from "./plugin";

export interface AsyncValue<T> {
  value: Ref<T>;
  isLoading: Ref<boolean>;
  error: Ref<Error | null>;
  refresh(): Promise<void>;
}

function resolve<T>(source: MaybeRefOrGetter<T>): T {
  return typeof source === "function" ? (source as () => T)() : source && typeof source === "object" && "value" in source ? source.value : source;
}

function useAsyncValue<T>(
  initial: T,
  load: () => Promise<T>,
  events: string[] = [],
): AsyncValue<T> {
  const { client, isReady } = useFlagDash();
  const value = shallowRef<T>(initial) as Ref<T>;
  const isLoading = ref(true);
  const error = ref<Error | null>(null);
  let generation = 0;

  const refresh = async () => {
    const current = ++generation;
    if (!isReady.value) {
      isLoading.value = true;
      return;
    }
    try {
      const result = await load();
      if (current === generation) {
        value.value = result;
        error.value = null;
      }
    } catch (reason) {
      if (current === generation) {
        error.value = reason instanceof Error ? reason : new Error(String(reason));
      }
    } finally {
      if (current === generation) isLoading.value = false;
    }
  };

  const stopReady = watch(isReady, () => void refresh(), { immediate: true });
  const unsubscribers = events.map((event) => client.on(event as never, () => void refresh()));
  onScopeDispose(() => {
    generation++;
    stopReady();
    for (const unsubscribe of unsubscribers) unsubscribe();
  });

  return { value, isLoading, error, refresh };
}

export function useFlag<T>(
  key: MaybeRefOrGetter<string>,
  defaultValue: MaybeRefOrGetter<T>,
  context?: MaybeRefOrGetter<EvaluationContext | undefined>,
): AsyncValue<T> {
  const { client } = useFlagDash();
  return useAsyncValue(resolve(defaultValue), () => client.flag(resolve(key), context ? resolve(context) : undefined, resolve(defaultValue)), ["flags_updated"]);
}

export function useFlagDetail<T>(
  key: MaybeRefOrGetter<string>,
  defaultValue: MaybeRefOrGetter<T>,
  context?: MaybeRefOrGetter<EvaluationContext | undefined>,
): AsyncValue<FlagDetail<T>> {
  const { client } = useFlagDash();
  const initial: FlagDetail<T> = { key: resolve(key), value: resolve(defaultValue), reason: "default", variationKey: null };
  return useAsyncValue(initial, () => client.flagDetail(resolve(key), context ? resolve(context) : undefined, resolve(defaultValue)), ["flags_updated"]);
}

export function useConfig<T>(key: MaybeRefOrGetter<string>, defaultValue: MaybeRefOrGetter<T>): AsyncValue<T> {
  const { client } = useFlagDash();
  return useAsyncValue(resolve(defaultValue), () => client.config(resolve(key), resolve(defaultValue)), ["configs_updated", "config_updated"]);
}

export function useAiConfig(fileName: MaybeRefOrGetter<string>): AsyncValue<AiConfig | null> {
  const { client } = useFlagDash();
  return useAsyncValue<AiConfig | null>(null, () => client.aiConfig(resolve(fileName)), ["ai_config_updated"]);
}

export function useAiConfigs(options?: MaybeRefOrGetter<ListAiConfigsOptions | undefined>): AsyncValue<AiConfig[]> {
  const { client } = useFlagDash();
  return useAsyncValue<AiConfig[]>([], () => client.listAiConfigs(options ? resolve(options) : undefined), ["ai_config_updated"]);
}

export function useTranslation(key: MaybeRefOrGetter<string>, options: MaybeRefOrGetter<TranslationOptions>): AsyncValue<string> {
  const { client } = useFlagDash();
  const resolved = () => resolve(options);
  return useAsyncValue(resolved().defaultValue ?? resolve(key), async () => {
    const current = resolved();
    const catalog = await client.translations(current.locale, "default");
    return formatTranslation(
      catalog.messages[resolve(key)] ?? current.defaultValue ?? resolve(key),
      current.locale,
      current.variables,
    );
  }, ["translation_updated"]);
}

export function useExperiment(key: MaybeRefOrGetter<string>, context: MaybeRefOrGetter<EvaluationContext>): AsyncValue<ExperimentAssignment | null> {
  const { client } = useFlagDash();
  return useAsyncValue<ExperimentAssignment | null>(null, () => client.experiment(resolve(key), resolve(context)));
}

export function useExperimentMetric(): (event: ExperimentMetricEvent) => void {
  const { client } = useFlagDash();
  return (event) => client.trackExperimentMetric(event);
}
