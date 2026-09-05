# @flagdashio/react

Official React hooks and components for [FlagDash](https://flagdash.io) — feature flags, remote config, and AI config management.

Works with React 18+, Next.js (SSR-safe), and any React framework.

## Installation

```bash
npm install @flagdashio/react @flagdashio/sdk
# or
pnpm add @flagdashio/react @flagdashio/sdk
# or
yarn add @flagdashio/react @flagdashio/sdk
```

## Quick Start

```tsx
import { FlagDashProvider, useFlag, useAiConfig } from '@flagdashio/react';

function App() {
  return (
    <FlagDashProvider sdkKey="sk_...">
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
  sdkKey="sk_..."         // Required. Determines the project AND environment.
  baseUrl="https://..."   // Defaults to https://flagdash.io
  refreshInterval={30000} // Optional: poll for updates (ms)
  realtime                // Optional: live updates over SSE, falls back to polling
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

### `useFlagDetail(key, defaultValue, context?)`

The value plus why it was chosen — useful when you need the variation behind an
A/B assignment, not just the result.

```tsx
const { value, reason, variationKey, isLoading } = useFlagDetail(
  'checkout-flow',
  'control',
  { user: { id: 'alice', plan: 'pro' } },
);
```

### `useExperiment(key, context)`

```tsx
const { assignment, isLoading } = useExperiment('checkout-flow-v2', {
  user: { id: user.id },
});

assignment?.variantKey;
assignment?.parameters;
```

`assignment` is `null` when the context carries no stable identifier to bucket on.

### `useExperimentMetric()`

Returns a stable function for recording experiment outcomes.

```tsx
const track = useExperimentMetric();

track({
  experimentKey: 'checkout-flow-v2',
  eventName: 'checkout_completed',
  context: { user: { id: user.id } },
  value: 42.5,
});
```

### `useTranslation(locale, namespace)`

```tsx
const { t, isLoading, error } = useTranslation('de', 'common');

t('welcome', { defaultValue: 'Welcome', variables: { name: 'Ada' } });
```

Note `t` takes the key *within* the namespace, so `common.welcome` is
`useTranslation('de', 'common')` then `t('welcome')`.

### `useFlagDash()`

Access the raw client and readiness state.

```tsx
const { client, isReady } = useFlagDash();
```

## Session replay

The replay hook lives behind a subpath export, so apps that never record do not
pull rrweb into their bundle.

```tsx
import { useSessionReplay } from '@flagdashio/react/replay';

function App() {
  const replay = useSessionReplay({
    sdkKey: 'sk_...',        // needs the `replays:write` scope
    release: 'checkout-2026-08',
    sampleRate: 10,
    blockedSelectors: ['.payment-form', '[data-private]'],
    enabled: user.hasConsented, // skips recording entirely when false
  });

  // null until recording has started
  replay?.addEvent('checkout_step', { step: 'shipping' });
}
```

It starts on mount and stops on unmount. Every option from
`FlagDashSessionReplay` is accepted; see the
[`@flagdashio/sdk` README](../sdk/README.md#session-replay) for the full list.

## Error Boundary

Catch errors from FlagDash hooks with `FlagDashErrorBoundary`:

```tsx
import { FlagDashErrorBoundary } from '@flagdashio/react';

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

import { FlagDashProvider } from '@flagdashio/react';

export default function Layout({ children }) {
  return (
    <FlagDashProvider sdkKey="sk_...">
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
} from '@flagdashio/react';
```

## License

MIT


