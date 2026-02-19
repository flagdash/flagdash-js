# @flagdash/node

Official FlagDash SDK for Node.js. Provides server-side feature flag evaluation, remote config, AI config management, and a full management API.

## Installation

```bash
npm install @flagdash/node
# or
pnpm add @flagdash/node
# or
yarn add @flagdash/node
```

**Requirements:** Node.js 18+ (uses native `fetch`)

## Quick Start

### Server Client (Feature Flags & Config)

Use a **server API key** (`server_sk_...`) to evaluate flags and read configs:

```ts
import { FlagDashServer } from '@flagdash/node';

const client = FlagDashServer.init({
  sdkKey: 'server_sk_...',
  environment: 'production',
  baseUrl: 'https://your-flagdash-instance.com',
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

Use a **management API key** (`management_...`) to create, update, and delete resources:

```ts
import { FlagDashManagement } from '@flagdash/node';

const mgmt = FlagDashManagement.init({
  apiKey: 'management_...',
  baseUrl: 'https://your-flagdash-instance.com',
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
  sdkKey: 'server_sk_...',    // Required: server API key
  environment: 'production',   // Required: environment name
  baseUrl: 'https://...',     // Required: FlagDash instance URL
  cacheTTL: 60000,            // Cache TTL in ms (default: 60s, 0 to disable)
  timeout: 5000,              // Request timeout in ms (default: 5s)
});
```

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

### Cache Management

```ts
// Clear all cached values (next call fetches fresh data)
client.clearCache();
```

## Management Client API

### Configuration

```ts
const mgmt = FlagDashManagement.init({
  apiKey: 'management_...',   // Required: management API key
  baseUrl: 'https://...',     // Required: FlagDash instance URL
  timeout: 10000,             // Request timeout in ms (default: 10s)
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
import { FlagDashApiError } from '@flagdash/node';

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
} from '@flagdash/node';
```

## License

MIT


