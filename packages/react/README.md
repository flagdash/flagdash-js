# @flagdash/react

Official React hooks and components for [FlagDash](https://flagdash.com) — feature flags, remote config, and AI config management.

Works with React 18+, Next.js (SSR-safe), and any React framework.

## Installation

```bash
npm install @flagdash/react @flagdash/sdk
# or
pnpm add @flagdash/react @flagdash/sdk
# or
yarn add @flagdash/react @flagdash/sdk
```

## Quick Start

```tsx
import { FlagDashProvider, useFlag, useAiConfig } from '@flagdash/react';

function App() {
  return (
    <FlagDashProvider
      sdkKey="client_pk_..."
      environment="production"
      baseUrl="https://your-flagdash-instance.com"
    >
      <MyComponent />
    </FlagDashProvider>
  );
}

function MyComponent() {
  const showBanner = useFlag('show-banner', false);
  const { content, isLoading } = useAiConfig('agent.md');

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {showBanner && <Banner />}
      <pre>{content}</pre>
    </div>
  );
}
```

## Provider

Wrap your app with `FlagDashProvider`:

```tsx
<FlagDashProvider
  sdkKey="client_pk_..."
  environment="production"
  baseUrl="https://..."
  refreshInterval={30000} // Optional: poll for updates
  user={{ id: 'user_123', plan: 'pro' }} // Optional: targeting context
>
  {children}
</FlagDashProvider>
```

## Hooks

### `useFlag(key, defaultValue, context?)`

Evaluate a feature flag reactively.

```tsx
const enabled = useFlag('my-feature', false);
const variant = useFlag('experiment', 'control');
```

### `useFlagWithLoading(key, defaultValue, context?)`

Same as `useFlag` but includes loading state.

```tsx
const { value, isLoading } = useFlagWithLoading('my-feature', false);
if (isLoading) return <Spinner />;
```

### `useConfig(key, defaultValue?)`

Fetch a remote config value reactively.

```tsx
const pricing = useConfig('pricing-tiers', { basic: 9.99 });
```

### `useConfigWithLoading(key, defaultValue?)`

Same as `useConfig` with loading state.

```tsx
const { value, isLoading } = useConfigWithLoading('pricing-tiers');
```

### `useAiConfig(fileName, defaultContent?)`

Get an AI config file reactively.

```tsx
const { content, fileName, fileType, folder, isLoading } = useAiConfig('agent.md');
```

### `useAiConfigs(options?)`

List AI config files with optional filters.

```tsx
// All configs
const { configs, isLoading } = useAiConfigs();

// Filter by type
const { configs: skills } = useAiConfigs({ fileType: 'skill' });

// Filter by folder
const { configs: tools } = useAiConfigs({ folder: 'tools' });
```

### `useFlagDash()`

Access the raw client and readiness state.

```tsx
const { client, isReady } = useFlagDash();
```

## Error Boundary

Catch errors from FlagDash hooks with `FlagDashErrorBoundary`:

```tsx
import { FlagDashErrorBoundary } from '@flagdash/react';

// With static fallback
<FlagDashErrorBoundary fallback={<div>Failed to load flags</div>}>
  <MyComponent />
</FlagDashErrorBoundary>

// With render function
<FlagDashErrorBoundary
  fallback={(error, reset) => (
    <div>
      <p>Error: {error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  )}
  onError={(error) => console.error('FlagDash error:', error)}
>
  <MyComponent />
</FlagDashErrorBoundary>
```

## Next.js / SSR

All hooks are SSR-safe. During server-side rendering, hooks return their default values and `isLoading: true`. The client only initializes on the client side via `useEffect`.

```tsx
// app/layout.tsx (Next.js App Router)
'use client';

import { FlagDashProvider } from '@flagdash/react';

export default function Layout({ children }) {
  return (
    <FlagDashProvider sdkKey="client_pk_..." environment="production">
      {children}
    </FlagDashProvider>
  );
}
```

## TypeScript

All hooks and components are fully typed:

```ts
import type {
  FlagDashConfig,
  EvaluationContext,
  AiConfig,
  AiConfigFileType,
  UseFlagResult,
  UseConfigResult,
  UseAiConfigResult,
  UseAiConfigsResult,
} from '@flagdash/react';
```

## License

MIT


