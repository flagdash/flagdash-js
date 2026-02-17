# FlagDash SDKs

Official SDKs for [FlagDash](https://flagdash.com) — Feature Flags, Remote Config & AI Config Management.

## Available SDKs

| SDK | Package | Install | Docs |
|-----|---------|---------|------|
| **JavaScript/TypeScript** | [`@flagdash/sdk`](packages/sdk/) | `npm install @flagdash/sdk` | [Docs](https://flagdash.com/docs#sdk-javascript) |
| **React** | [`@flagdash/react`](packages/react/) | `npm install @flagdash/react` | [Docs](https://flagdash.com/docs#sdk-react) |
| **Node.js** | [`@flagdash/node`](packages/node/) | `npm install @flagdash/node` | [Docs](https://flagdash.com/docs#sdk-node) |
| **Go** | [`flagdash-go`](flagdash-go/) | `go get github.com/flagdash/flagdash-go` | [Docs](https://flagdash.com/docs#sdk-go) |
| **Python** | [`flagdash`](flagdash-python/) | `pip install flagdash` | [Docs](https://flagdash.com/docs#sdk-python) |

## SDK Tiers

Each SDK supports one or more API tiers depending on the key type used:

| Tier | Key Prefix | Use Case | SDKs |
|------|-----------|----------|------|
| **Client** | `client_` | Browser/mobile apps — read-only flags, configs, AI configs | JS, React |
| **Server** | `server_` | Server-side apps — read with full metadata + caching | Node.js, Go, Python |
| **Management** | `management_` | Admin tools — full CRUD for all resources | Node.js, Go, Python |

## Quick Start

### JavaScript (Browser)

```typescript
import { FlagDashClient } from "@flagdash/sdk";

const client = new FlagDashClient({
  sdkKey: "client_pk_...",
  environment: "production",
});

const enabled = await client.flag("new-feature", { user: { id: "user_1" } });
```

### React

```tsx
import { FlagDashProvider, useFlag } from "@flagdash/react";

function App() {
  return (
    <FlagDashProvider sdkKey="client_pk_..." environment="production">
      <MyComponent />
    </FlagDashProvider>
  );
}

function MyComponent() {
  const showBanner = useFlag("show-banner", false);
  return showBanner ? <Banner /> : null;
}
```

### Node.js

```typescript
import { FlagDashServer, FlagDashManagement } from "@flagdash/node";

// Server client — evaluate flags with caching
const server = FlagDashServer.init({
  sdkKey: "server_sk_...",
  environment: "production",
});
const enabled = await server.flag("my-feature", { user: { id: "user_1" } });

// Management client — CRUD operations
const mgmt = FlagDashManagement.init({
  apiKey: "management_...",
  baseUrl: "https://your-instance.flagdash.com",
});
await mgmt.toggleFlag("my-feature");
```

### Go

```go
import flagdash "github.com/flagdash/flagdash-go"

client, err := flagdash.NewClient(flagdash.Config{
    SDKKey:      "server_sk_...",
    Environment: "production",
})

enabled, err := client.Flag(ctx, "my-feature", flagdash.EvaluationContext{
    UserID: "user_1",
}, false)
```

### Python

```python
from flagdash import FlagDashServerClient

client = FlagDashServerClient(
    sdk_key="server_sk_...",
    environment="production",
)

enabled = client.flag("my-feature", context={"user_id": "user_1"}, default=False)
```

## Features

All SDKs support:

- **Feature Flags** — Boolean, string, number, and JSON flags with targeting rules
- **Remote Config** — Key-value configuration management
- **AI Configs** — AI/LLM context file management (agent, skill, rule files)
- **Context-based evaluation** — User targeting, percentage rollouts, A/B testing
- **Caching** — Configurable TTL for server-side SDKs

Management-tier SDKs additionally support:

- **Flag CRUD** — Create, update, delete, toggle, rollout, variations, schedules
- **Config CRUD** — Create, update, delete, update values per environment
- **AI Config CRUD** — Create, update, delete, initialize defaults
- **Webhook CRUD** — Create, update, delete, regenerate secrets, delivery logs

## Local Development

### JavaScript SDKs (monorepo)

```bash
cd sdk
pnpm install
pnpm -r build        # Build all packages
pnpm -r test         # Test all packages
```

### Go SDK

```bash
cd sdk/flagdash-go
go test -race ./...
go build ./...
```

### Python SDK

```bash
cd sdk/flagdash-python
pip install -e ".[dev]"
pytest -v
```

## Release Process

| SDK | Tag Format | Registry |
|-----|-----------|----------|
| `@flagdash/sdk` | GitHub Release | npm |
| `@flagdash/react` | GitHub Release | npm |
| `@flagdash/node` | `node-v*` | npm |
| Go SDK | `go-v*` | GitHub (Go modules) |
| Python SDK | `python-v*` | PyPI |

## License

All SDKs are released under the [MIT License](../LICENSE).
