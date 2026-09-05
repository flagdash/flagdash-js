# @flagdashio/vue

Official Vue 3 bindings for FlagDash: feature flags, remote config, AI configs,
translations and experiments, with live updates.

Composables re-evaluate on their own when a flag changes in the dashboard —
nothing to poll, nothing to reload.

## Installation

```bash
npm install @flagdashio/vue
```

Requires Vue 3.3+.

## Setup

```ts
import { createApp } from "vue";
import { createFlagDash } from "@flagdashio/vue";
import App from "./App.vue";

const flagdash = createFlagDash({
  sdkKey: import.meta.env.VITE_FLAGDASH_SDK_KEY,
  realtime: true,
});

createApp(App).use(flagdash).mount("#app");
```

## The composable shape

Every value composable returns the same `AsyncValue<T>`:

```ts
{
  value: Ref<T>;            // the flag value, starting at your default
  isLoading: Ref<boolean>;
  error: Ref<Error | null>;
  refresh(): Promise<void>;
}
```

In `<script setup>` you unwrap refs as usual; in a template, remember these are
plain objects holding refs, so it is `checkout.value.value`.

## Feature flags

```vue
<script setup lang="ts">
import { useFlag, useFlagDetail } from "@flagdashio/vue";

const checkout = useFlag("checkout-v2", false, {
  user: { id: "user_123", plan: "pro" },
});

// Why did it resolve that way?
const detail = useFlagDetail("checkout-v2", false, { user: { id: "user_123" } });
</script>

<template>
  <p v-if="checkout.isLoading.value">Loading…</p>
  <CheckoutV2 v-else-if="checkout.value.value" />
  <CheckoutV1 v-else />
</template>
```

Key, default and context all accept a ref, a getter or a plain value — pass a
ref and the flag re-evaluates when it changes:

```ts
const userId = ref("alice");
const banner = useFlag("beta-banner", false, () => ({ user: { id: userId.value } }));

userId.value = "bob";  // re-evaluates
```

**Give the context a user id** whenever you want a stable answer. Percentage
rollouts and A/B variations hash it, so a context without one re-rolls on every
evaluation by design.

## Remote config

```ts
const limit = useConfig("rate_limit", 100);
```

## AI configs

Prompts, agents, skills and rules, editable without a deploy.

```ts
const agent = useAiConfig("support-agent.md");
const files = useAiConfigs();
```

## Translations

```ts
const greeting = useTranslation("checkout.greeting", "fr", "Hello", {
  name: "Alice",
});
```

The key is `namespace.message`; `{placeholders}` come from the variables object.

## Experiments

```vue
<script setup lang="ts">
import { useExperiment, useExperimentMetric } from "@flagdashio/vue";

const experiment = useExperiment("checkout-redesign", { user: { id: "user_123" } });
const track = useExperimentMetric();

function onPurchase() {
  track({
    experimentKey: "checkout-redesign",
    eventName: "purchase",
    userId: "user_123",
    value: 42.5,
  });
}
</script>
```

## Reaching the client directly

```ts
import { useFlagDash } from "@flagdashio/vue";

const { client, isReady, error } = useFlagDash();
```

`isReady` and `error` are refs tracking the underlying client, which is useful
for a global loading state or an error banner. `client` is the full
`@flagdashio/sdk` instance if you need something the composables do not cover.

## Security

Ship an **environment-scoped client key with read scopes only**. Never put a
`pat_` token, or any key with write scopes, in a browser bundle — anything in
the bundle is readable by anyone who loads the page.

A client key never returns targeting rules, so the browser cannot see who else
you are targeting.

## License

MIT
## Session replay

```ts
import { useSessionReplay } from "@flagdashio/vue/replay";

useSessionReplay({ sdkKey: import.meta.env.VITE_FLAGDASH_REPLAY_KEY });
```

The composable starts the privacy-masked browser recorder on mount and stops it on unmount. Use a key scoped only to `replays:write`; capture must also be enabled for the environment in Dashboard → Session Replay.
