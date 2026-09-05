export { FlagDashProvider, type FlagDashProviderProps } from "./provider";
export {
  useFlag,
  useFlagWithLoading,
  useFlagDetail,
  useExperiment,
  useExperimentMetric,
  useConfig,
  useConfigWithLoading,
  useTranslation,
  useAiConfig,
  useAiConfigs,
  useFlagDash,
  type UseFlagResult,
  type UseFlagDetailResult,
  type UseExperimentResult,
  type UseConfigResult,
  type UseTranslationResult,
  type UseAiConfigResult,
  type UseAiConfigsResult,
} from "./hooks";
export { FlagDashContext, type FlagDashContextValue } from "./context";
export {
  FlagDashErrorBoundary,
  type FlagDashErrorBoundaryProps,
} from "./error-boundary";

// Re-export core types for convenience
export type {
  FlagDashConfig,
  UserContext,
  EvaluationContext,
  FlagValues,
  ConfigValues,
  FlagDetail,
  EvaluationReason,
  AiConfig,
  AiConfigFileType,
  ListAiConfigsOptions,
  ExperimentAssignment,
  ExperimentMetricEvent,
} from "@flagdashio/sdk";
