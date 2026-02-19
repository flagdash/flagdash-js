export { FlagDashProvider, type FlagDashProviderProps } from "./provider";
export {
  useFlag,
  useFlagWithLoading,
  useFlagDetail,
  useConfig,
  useConfigWithLoading,
  useAiConfig,
  useAiConfigs,
  useFlagDash,
  type UseFlagResult,
  type UseFlagDetailResult,
  type UseConfigResult,
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
} from "@flagdash/sdk";
