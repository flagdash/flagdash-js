# @flagdashio/sdk

The official FlagDash client SDK for JavaScript and TypeScript. Evaluate feature flags, fetch remote configs, and access AI config files from any JavaScript environment (browser, Node.js, edge runtimes).

## Installation

```bash
npm install @flagdashio/sdk
# or
pnpm add @flagdashio/sdk
# or
yarn add @flagdashio/sdk
```

## Quick Start

```ts
import { FlagDash } from '@flagdashio/sdk';

const client = FlagDash.init({
  sdkKey: 'sk_...',
});

// Evaluate a feature flag
const enabled = await client.flag('new-checkout', undefined, false);

// Fetch a remote config
const pricing = await client.config<{ tier: string }>('pricing');

// Get an AI config file
const agent = await client.aiConfig('agent.md');
```

## Configuration

```ts
const client = FlagDash.init({
  sdkKey: 'sk_...',        // Required. Determines the project AND environment.
  baseUrl: 'https://...',  // Your FlagDash instance. Defaults to https://flagdash.io
  refreshInterval: 30000,  // Poll for updates (ms). Defaults to 0 (no polling).
  timeout: 5000,           // Request timeout (ms). Defaults to 5000.
  realtime: true,          // Live updates over SSE. Defaults to false; falls back to polling.
});
```

There is no `environment` option. The key you issue is scoped to one project and
one environment, so pointing a build at staging means swapping the key, not
passing a different string alongside it.

## Feature Flags

```ts
// Simple boolean flag
const enabled = await client.flag('my-feature');

// With default value
const variant = await client.flag('experiment', undefined, 'control');

// With targeting context
const value = await client.flag('premium-feature', {
  user: { id: 'user_123', plan: 'pro' },
  country: 'US',
});

// All flags at once
const flags = await client.allFlags();
```

## Remote Config

```ts
// One config, with a fallback if it is missing
const settings = await client.config('api-settings', { timeout: 5000 });

// Every config at once
const all = await client.allConfigs();
```

## Translations

```ts
// Keys are `namespace.key`
const greeting = await client.translation('common.welcome', {
  locale: 'de',
  defaultValue: 'Welcome',
  variables: { name: 'Ada' },
});

// Which locale actually answered, and why
const detail = await client.translationDetail('common.welcome', { locale: 'de' });
detail.value;        // "Willkommen, Ada"
detail.locale;       // "de"
detail.sourceLocale; // set when the value fell back to another locale
detail.reason;       // "match" | "fallback" | "default"

// A whole catalog, cached in memory
const catalog = await client.translations('de', 'common');
```

## Experiments

```ts
const context = { user: { id: user.id } };

// null when the context carries no stable identifier to bucket on
const assignment = await client.experiment('checkout-flow-v2', context);
assignment?.variantKey;
assignment?.parameters;

client.trackExperimentMetric({
  experimentKey: 'checkout-flow-v2',
  eventName: 'checkout_completed',
  context,
  value: 42.5,
  properties: { plan: 'pro' },
});

// Metrics buffer in memory and flush in batches. Flush explicitly before a
// controlled shutdown so the last batch is not lost.
await client.flushExperimentEvents();
```

## AI Configs

```ts
// Get a single AI config file
const agent = await client.aiConfig('agent.md');
if (agent) {
  console.log(agent.content); // Markdown content
  console.log(agent.file_type); // 'agent' | 'skill' | 'rule'
  console.log(agent.folder); // string | null
}

// With default content fallback
const skill = await client.aiConfig('missing.md', '# Default');

// List all AI configs
const configs = await client.listAiConfigs();

// Filter by type or folder
const skills = await client.listAiConfigs({ fileType: 'skill' });
const toolConfigs = await client.listAiConfigs({ folder: 'tools' });

// Resolve the released version of a config for one user. Pass the user id so a
// staged rollout returns the version that user is entitled to.
const released = await client.aiConfigRelease('agent.md', user.id);
```

## Events

```ts
client.on('ready', () => console.log('Client initialized'));
client.on('flags_updated', (flags) => console.log('Flags changed', flags));
client.on('ai_config_updated', () => console.log('AI configs changed'));
client.on('error', (err) => console.error('Error:', err));
```

## Realtime updates

Set `realtime: true` at init, or toggle it at runtime. SSE replaces polling while
it is on, and falls back to polling by itself if the stream cannot be opened.

```ts
client.enableRealtime();
client.disableRealtime();
```

## Session replay

Browser DOM replay ships as a separate entry point, so pages that never record
do not pay for it in their bundle.

```ts
import { FlagDashSessionReplay } from '@flagdashio/sdk/replay';

const replay = new FlagDashSessionReplay({
  sdkKey: 'sk_...',        // needs the `replays:write` scope
  release: 'checkout-2026-08',
  sampleRate: 10,          // percent of sessions to record. Defaults to 100.
  blockedSelectors: ['.payment-form', '[data-private]'],

  // Optional. Nothing here is inferred: a field you leave out shows as "n/a"
  // on the replay rather than being hidden, so an absent value is always
  // distinguishable from an unsent one.
  user: {
    userId: user.id,        // hashed on arrival; the raw value is discarded
    userLabel: user.handle, // shown as-is, so keep it non-sensitive
    accountId: user.tenantId,
    plan: user.plan,
    attributes: { role: user.role },
  },
});

await replay.start();

replay.addEvent('checkout_step', { step: 'shipping' });
replay.trackAction('coupon_applied', { code: 'SUMMER' });
replay.trackRender('CartDrawer', { items: 3 });

// Correlate your own backend logs with the recording
replay.getReplayId();
const headers = replay.injectReplayHeaders({ 'Content-Type': 'application/json' });

await replay.stop();
```

`redactSensitiveText` is exported from the same entry point if you need to scrub
a string before attaching it to an event.

## Cleanup

```ts
// Stop polling, close any SSE stream, and remove all listeners
client.destroy();
```

## TypeScript

Full TypeScript support with exported types:

```ts
import type {
  FlagDashConfig,
  EvaluationContext,
  UserContext,
  FlagValues,
  AiConfig,
  AiConfigFileType,
  ListAiConfigsOptions,
} from '@flagdashio/sdk';
```

## License

MIT


