# @flagdashio/node

Official FlagDash SDK for Node.js. Provides server-side feature flag evaluation, remote config, AI config management, and a full management API.

## Installation

```bash
npm install @flagdashio/node
# or
pnpm add @flagdashio/node
# or
yarn add @flagdashio/node
```

**Requirements:** Node.js 18+ (uses native `fetch`)

## Quick Start

### Server Client (Feature Flags & Config)

Use an `sk_` key with read scopes to evaluate flags and read configs. Server-tier
responses include targeting rules and variations, so keep the key server-side:

```ts
import { FlagDashServer } from '@flagdashio/node';

const client = FlagDashServer.init({
  sdkKey: 'sk_...',
});

// Evaluate a feature flag
const enabled = await client.flag('new-checkout');

// Evaluate with user context (for targeting/rollout)
const showBanner = await client.flag('promo-banner', {
  user: { id: 'user_123', plan: 'pro' },
});

// Get a remote config value
const apiUrl = await client.config<string>('api-base-url', 'https://fallback.api.com');

// Get an AI config file
const agentConfig = await client.aiConfig('agent.md');
```

### Management Client (Full CRUD)

Use a credential allowed to mutate: an `sk_` key holding the `:write` scopes for
what you change, or a `pat_` personal access token whose user has the matching
role permissions.

```ts
import { FlagDashManagement } from '@flagdashio/node';

const mgmt = FlagDashManagement.init({
  apiKey: 'sk_...',
});

// Create a feature flag
const flag = await mgmt.createFlag({
  project_id: 'prj_xxx',
  key: 'new-feature',
  name: 'New Feature',
  flag_type: 'boolean',
});

// Toggle it on in production
await mgmt.toggleFlag('new-feature', 'prj_xxx', 'env_production');

// Set up A/B testing
await mgmt.setFlagVariations('new-feature', 'prj_xxx', 'env_production', [
  { key: 'control', name: 'Control', value: { value: false }, weight: 50 },
  { key: 'variant', name: 'Variant', value: { value: true }, weight: 50 },
]);
```

## Server Client API

### Configuration

```ts
const client = FlagDashServer.init({
  sdkKey: 'sk_...',        // Required. Determines the project AND environment.
  baseUrl: 'https://...',  // Your FlagDash instance. Defaults to https://flagdash.io
  cacheTTL: 60000,         // Cache TTL in ms. Defaults to 60000. 0 disables caching.
  timeout: 5000,           // Request timeout in ms. Defaults to 5000.
  region: 'eu-west-1',     // Sent on every evaluation, for region-scoped targeting.
  autoDetectRegion: true,  // Defaults to true. See below.
});
```

There is no `environment` option. The key is scoped to one project and one
environment, so pointing a deployment at staging means swapping the key.

When `region` is unset and `autoDetectRegion` is left on, the SDK reads the first
of `FLAGDASH_REGION`, `FLY_REGION`, `AWS_REGION`, `AWS_DEFAULT_REGION`,
`VERCEL_REGION`, `GOOGLE_CLOUD_REGION`, `RAILWAY_REPLICA_REGION`, `RENDER_REGION`
— so region-scoped rules work with no application wiring.

### Feature Flags

```ts
// Evaluate a flag (returns the evaluated value, or default)
const value = await client.flag<boolean>('flag-key');
const value = await client.flag('flag-key', context, false);

// Get all evaluated flags at once
const flags = await client.allFlags();
const flags = await client.allFlags({ user: { id: 'user_1' } });

// Get a flag with full metadata (rules, rollout, variations)
const flag = await client.getFlag('flag-key');

// List all flags with full metadata
const allFlags = await client.listFlags();
```

### Remote Config

```ts
// Get a config value with optional default
const value = await client.config<string>('config-key', 'default');

// Get config with full metadata
const config = await client.getConfig('config-key');

// List all configs
const configs = await client.listConfigs();
```

### AI Configs

```ts
// Get a single AI config file by name
const config = await client.aiConfig('agent.md');

// List all AI config files
const configs = await client.listAiConfigs();

// Filter by type or folder
const skills = await client.listAiConfigs({ fileType: 'skill' });
const rules = await client.listAiConfigs({ folder: 'rules' });
```

### Translations

```ts
// Keys are `namespace.key`
const greeting = await client.translation('common.welcome', {
  locale: 'de',
  defaultValue: 'Welcome',
  variables: { name: 'Ada' },
});
```

### Experiments

```ts
const context = { user: { id: user.id } };

// null when the context carries no stable identifier to bucket on
const assignment = await client.experiment('checkout-flow-v2', context);

client.trackExperimentMetric({
  experimentKey: 'checkout-flow-v2',
  eventName: 'checkout_completed',
  context,
  value: 42.5,
});

// Metrics buffer in memory and flush in batches.
await client.flushExperimentEvents();
```

### Session replay

Backend replay records an explicit timeline — the actions you name. It never
captures request bodies, logs, or input values on its own.

```ts
import { FlagDashBackendReplay } from '@flagdashio/node';

const replay = new FlagDashBackendReplay({
  sdkKey: process.env.FLAGDASH_REPLAY_KEY,  // needs `replays:write`
  release: '2026.08',
});

if (await replay.start()) {
  // event() takes one object; category defaults to "action"
  replay.event({ name: 'checkout_started', attributes: { items: 2 } });
  replay.breadcrumb('coupon applied');
  replay.captureException(err, { stage: 'payment' });
}

// Correlate a browser recording with this backend timeline
replay.contextHeaders();

await replay.stop();
```

Attribute keys that look sensitive — `password`, `token`, `authorization`,
`api_key`, `card`, and similar — are redacted before the event is buffered.

### Cache Management

```ts
// Clear all cached values (next call fetches fresh data)
client.clearCache();

// Flush pending experiment metrics and release resources
await client.close();
```

## Management Client API

### Configuration

```ts
const mgmt = FlagDashManagement.init({
  apiKey: 'sk_...',        // Required. An `sk_` key with `:write` scopes, or a `pat_`.
  baseUrl: 'https://...',  // Your FlagDash instance. Defaults to https://flagdash.io
  timeout: 10000,          // Request timeout in ms. Defaults to 10000.
});
```

### Flags

```ts
// CRUD
const flags = await mgmt.listFlags('prj_xxx');
const flag = await mgmt.getFlag('key', 'prj_xxx');
const flag = await mgmt.createFlag({ project_id: 'prj_xxx', key: 'my-flag', name: 'My Flag' });
const flag = await mgmt.updateFlag('key', 'prj_xxx', { name: 'New Name' });
await mgmt.deleteFlag('key', 'prj_xxx');

// Environment operations
const env = await mgmt.toggleFlag('key', 'prj_xxx', 'env_xxx');
const env = await mgmt.updateFlagRules('key', 'prj_xxx', 'env_xxx', rules);
const env = await mgmt.updateFlagRollout('key', 'prj_xxx', 'env_xxx', 50);

// A/B testing
const variations = await mgmt.setFlagVariations('key', 'prj_xxx', 'env_xxx', [...]);
await mgmt.deleteFlagVariations('key', 'prj_xxx', 'env_xxx');

// Schedules
const schedules = await mgmt.listFlagSchedules('key', 'prj_xxx', 'env_xxx');
const schedule = await mgmt.createFlagSchedule('key', 'prj_xxx', 'env_xxx', {
  action: 'enable',
  scheduled_at: '2026-03-01T00:00:00Z',
});
const schedule = await mgmt.cancelFlagSchedule('key', 'sch_xxx', 'prj_xxx');
```

### Configs

```ts
const configs = await mgmt.listConfigs('prj_xxx');
const config = await mgmt.getConfig('key', 'prj_xxx');
const config = await mgmt.createConfig({ project_id: 'prj_xxx', key: 'api-url', name: 'API URL', config_type: 'string' });
const config = await mgmt.updateConfig('key', 'prj_xxx', { name: 'Updated' });
await mgmt.deleteConfig('key', 'prj_xxx');

// Update environment-specific value
const env = await mgmt.updateConfigValue('key', 'prj_xxx', 'env_xxx', { value: 'https://api.example.com' });
```

### AI Configs

```ts
const configs = await mgmt.listAiConfigs('prj_xxx');
const configs = await mgmt.listAiConfigs('prj_xxx', 'env_xxx');
const config = await mgmt.getAiConfig('agent.md', 'prj_xxx', 'env_xxx');
const config = await mgmt.createAiConfig({
  project_id: 'prj_xxx',
  environment_id: 'env_xxx',
  file_name: 'agent.md',
  file_type: 'agent',
  content: '# Agent Instructions\n\nYou are a helpful assistant.',
});
const config = await mgmt.updateAiConfig('agent.md', 'prj_xxx', 'env_xxx', { content: '# Updated' });
await mgmt.deleteAiConfig('agent.md', 'prj_xxx', 'env_xxx');

// Initialize default AI config files
const defaults = await mgmt.initializeAiConfigs('prj_xxx', 'env_xxx');
```

### Webhooks

```ts
const endpoints = await mgmt.listWebhooks('prj_xxx');
const endpoint = await mgmt.getWebhook('wh_xxx');
const endpoint = await mgmt.createWebhook({
  project_id: 'prj_xxx',
  environment_id: 'env_xxx',
  url: 'https://example.com/webhook',
  event_types: ['flag.updated', 'config.updated'],
});
const endpoint = await mgmt.updateWebhook('wh_xxx', { url: 'https://new-url.com/hook' });
await mgmt.deleteWebhook('wh_xxx');

// Secret & lifecycle management
const endpoint = await mgmt.regenerateWebhookSecret('wh_xxx');
const endpoint = await mgmt.reactivateWebhook('wh_xxx');

// Delivery logs
const deliveries = await mgmt.listWebhookDeliveries('wh_xxx', { limit: 50 });
```

## Error Handling

The management client throws `FlagDashApiError` for non-OK HTTP responses:

```ts
import { FlagDashApiError } from '@flagdashio/node';

try {
  await mgmt.getFlag('nonexistent', 'prj_xxx');
} catch (error) {
  if (error instanceof FlagDashApiError) {
    console.error(error.status); // 404
    console.error(error.body);   // { error: "Not found" }
  }
}
```

The server client methods (`flag()`, `config()`, `aiConfig()`) return defaults or `null` on error instead of throwing, making them safe for production use.

## TypeScript

All types are exported and fully documented:

```ts
import type {
  Flag,
  Config,
  AiConfig,
  ManagedFlag,
  ManagedConfig,
  ManagedAiConfig,
  WebhookEndpoint,
  FlagEnvironment,
  Variation,
  Schedule,
} from '@flagdashio/node';
```

## License

MIT


