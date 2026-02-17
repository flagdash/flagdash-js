# @flagdash/sdk

The official FlagDash client SDK for JavaScript and TypeScript. Evaluate feature flags, fetch remote configs, and access AI config files from any JavaScript environment (browser, Node.js, edge runtimes).

## Installation

```bash
npm install @flagdash/sdk
# or
pnpm add @flagdash/sdk
# or
yarn add @flagdash/sdk
```

## Quick Start

```ts
import { FlagDash } from '@flagdash/sdk';

const client = FlagDash.init({
  sdkKey: 'client_pk_...',
  environment: 'production',
  baseUrl: 'https://your-flagdash-instance.com',
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
  sdkKey: 'client_pk_...', // Required
  environment: 'production', // Required
  baseUrl: 'https://...', // Your FlagDash instance URL
  refreshInterval: 30000, // Poll for updates (ms), 0 = disabled
  timeout: 5000, // Request timeout (ms)
});
```

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
const config = await client.config('api-settings', { timeout: 5000 });
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
```

## Events

```ts
client.on('ready', () => console.log('Client initialized'));
client.on('flags_updated', (flags) => console.log('Flags changed', flags));
client.on('ai_config_updated', () => console.log('AI configs changed'));
client.on('error', (err) => console.error('Error:', err));
```

## Cleanup

```ts
// Stop polling and remove all listeners
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
} from '@flagdash/sdk';
```

## License

MIT
