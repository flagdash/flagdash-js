# @flagdashio/react-native

Official React Native and Expo SDK: feature flags, remote config, AI configs,
translations and experiments — with offline startup and lifecycle-aware live
updates.

## Installation

```bash
npm install @flagdashio/react-native @flagdashio/sdk \
  @react-native-async-storage/async-storage
```

## Quick start

```tsx
import { FlagDashProvider, useFlag } from "@flagdashio/react-native";

export function Root() {
  return (
    <FlagDashProvider sdkKey={process.env.EXPO_PUBLIC_FLAGDASH_SDK_KEY!}>
      <Checkout />
    </FlagDashProvider>
  );
}

function Checkout() {
  const enabled = useFlag("checkout-v2", false, { user: { id: "user_123" } });
  return enabled ? <NewCheckout /> : <LegacyCheckout />;
}
```

Use **one provider at the application root**. It owns the client, its
subscriptions and their cleanup.

## What you get beyond a fetch

| | |
|---|---|
| **Offline startup** | AsyncStorage keeps the last known values, so the first render after a cold start with no network gets real values instead of your defaults. |
| **Lifecycle aware** | Realtime pauses while the app is backgrounded and resumes on foreground, so a backgrounded app is not holding a socket open. |
| **Live updates** | A change in the dashboard re-renders the components that read it. |

## Provider options

```tsx
<FlagDashProvider
  sdkKey={key}
  baseUrl="https://flagdash.io"   // self-hosted? point it here
  refreshInterval={60_000}        // polling fallback, ms
  realtime={true}
  enableCache={true}              // AsyncStorage persistence
  enableLifecycle={true}          // pause/resume on background/foreground
>
```

### `user` is ignored

The provider still accepts a `user` prop for backwards compatibility, but it is
**deprecated and not wired into evaluations**. Passing it there silently changes
nothing. Pass context per call instead:

```tsx
useFlag("checkout-v2", false, { user: { id: userId, plan: "pro" } });
```

**Include a user id** whenever you want a stable answer. Percentage rollouts and
A/B variations hash it, so a context without one re-rolls on every evaluation by
design.

## Feature flags

```tsx
// Just the value.
const enabled = useFlag("checkout-v2", false, context);

// With loading state, for a first paint that should not flash the default.
const { value, isLoading } = useFlagWithLoading("checkout-v2", false, context);

// Why did it resolve that way?
const { value, reason, variationKey } = useFlagDetail("checkout-v2", false, context);
```

`useFlag<T>` is generic — the default's type is the value's type:

```tsx
const copy = useFlag<string>("banner-copy", "control", context);
const limits = useFlag<Record<string, number>>("limits", {}, context);
```

## Remote config

```tsx
const limit = useConfig("rate_limit", 100);
const { value, isLoading } = useConfigWithLoading("rate_limit", 100);
```

## AI configs

Prompts, agents, skills and rules, editable without an app store release.

```tsx
const { config, isLoading } = useAiConfig("support-agent.md");
const { configs } = useAiConfigs({ fileType: "agent" });
```

## Translations

`useTranslation` loads a whole catalogue and hands back a `t` function, rather
than resolving one key at a time:

```tsx
const { t, isLoading, error } = useTranslation("fr", "checkout");

<Text>{t("greeting", { variables: { name: "Alice" } })}</Text>
```

## Reaching the client

```tsx
const { client, isReady } = useFlagDash();
```

`isReady` is what to gate a splash screen on. `client` is the underlying
`ReactNativeClient` for anything the hooks do not cover.

## Interaction replay

```tsx
import { ReactNativeInteractionReplay } from "@flagdashio/react-native";

const replay = new ReactNativeInteractionReplay({ sdkKey: replayKey, release: appVersion });
if (await replay.start()) {
  replay.screen("Checkout");
  replay.interaction({ name: "buy_tapped", screen: "Checkout" });
  replay.breadcrumb("payment requested");
  await replay.stop();
}
```

Records interactions for session replay. Treat what it captures as sensitive and
check it against your privacy policy before enabling it in production.

## Security

Create an environment key under **Dashboard → Project → Environment → API
keys** and grant only the read scopes the app uses. Never embed a `pat_` token
or a write-capable key: anything in an app bundle is readable.

A client key never returns targeting rules, so the app cannot see who else you
are targeting.

## Source

Developed in the FlagDash monorepo and mirrored to
[`flagdash/flagdash-js`](https://github.com/flagdash/flagdash-js/tree/main/packages/react-native),
alongside the browser, Node, React and Vue packages. Install from npm — Git
cannot install a single workspace subdirectory as a standalone package.

## License

MIT
