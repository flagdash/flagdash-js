# @flagdash/react Changelog

## 0.1.0

### Features

- Initial release
- `FlagDashProvider` — context provider for FlagDash client
- `useFlag(key, defaultValue, context?)` — reactive feature flag evaluation
- `useFlagWithLoading(key, defaultValue, context?)` — flag evaluation with loading state
- `useConfig(key, defaultValue?)` — reactive remote config
- `useConfigWithLoading(key, defaultValue?)` — config with loading state
- `useAiConfig(fileName, defaultContent?)` — reactive AI config file access
- `useAiConfigs(options?)` — list AI config files with filters
- `useFlagDash()` — raw client access
- `FlagDashErrorBoundary` — error boundary with fallback and reset support
- SSR-safe for Next.js and other server-rendering frameworks
- Full TypeScript support
