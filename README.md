# FlagDash SDKs

Official SDKs for [FlagDash](https://flagdash.io) — Feature Flags, Remote Config & AI Config Management.

## Available SDKs

| SDK | Package | Install | Docs |
|-----|---------|---------|------|
| **JavaScript/TypeScript** | [`@flagdashio/sdk`](packages/sdk/) | `npm install @flagdashio/sdk` | [Docs](https://flagdash.io/docs#sdk-javascript) |
| **React** | [`@flagdashio/react`](packages/react/) | `npm install @flagdashio/react` | [Docs](https://flagdash.io/docs#sdk-react) |
| **Vue** | [`@flagdashio/vue`](packages/vue/) | `npm install @flagdashio/vue` | [Docs](https://flagdash.io/docs#sdk-vue) |
| **React Native** | [`@flagdashio/react-native`](packages/react-native/) | `npm install @flagdashio/react-native` | [Docs](https://flagdash.io/docs#sdk-react-native) |
| **Node.js** | [`@flagdashio/node`](packages/node/) | `npm install @flagdashio/node` | [Docs](https://flagdash.io/docs#sdk-node) |
| **Go** | [`flagdash-go`](flagdash-go/) | `go get github.com/flagdash/flagdash-go` | [Docs](https://flagdash.io/docs#sdk-go) |
| **Python** | [`flagdash`](flagdash-python/) | `pip install flagdash` | [Docs](https://flagdash.io/docs#sdk-python) |
| **Android** | [`io.flagdash:flagdash-android`](flagdash-android/) | Maven Central or tagged JitPack build | [Docs](https://flagdash.io/docs#sdk-android) |
| **Flutter** | [`flagdash`](flagdash-flutter/) | `flutter pub add flagdash` | [Docs](https://flagdash.io/docs#sdk-flutter) |
| **iOS / Swift** | [`FlagDash`](flagdash-swift/) | Swift Package Manager Git tag | [Docs](https://flagdash.io/docs#sdk-swift) |
| **Elixir / Erlang** | [`flagdash`](flagdash-elixir/) | `{:flagdash, "~> 0.1"}` | [Docs](https://flagdash.io/docs#sdk-elixir) |
| **Lua** | [`flagdash`](flagdash-lua/) | `luarocks install flagdash` | [Docs](https://flagdash.io/docs#sdk-lua) |
| **PHP** | [`flagdash/sdk`](flagdash-php/) | `composer require flagdash/sdk` | [Docs](https://flagdash.io/docs#sdk-php) |
| **Ruby** | [`flagdash`](flagdash-ruby/) | `gem install flagdash` | [Docs](https://flagdash.io/docs#sdk-ruby) |
| **Rust** | [`flagdash-sdk`](flagdash-rust/) | `cargo add flagdash-sdk` | [Docs](https://flagdash.io/docs#sdk-rust) |

## SDK Tiers

Each SDK supports one or more API tiers depending on the key type used:

| Tier | Credential | Use Case | SDKs |
|------|------------|----------|------|
| **Client** | Environment `sk_` with read scopes | Browser/mobile apps — evaluated values without targeting rules | JS, React, Vue, React Native, Android, Flutter, Swift |
| **Server** | Environment `sk_` with read scopes | Trusted server apps — full metadata and caching | Node.js, Go, Python, Elixir/Erlang, Lua, PHP, Ruby, Rust |
| **Management** | Write-scoped `sk_` or account `pat_` | Trusted admin tools — CRUD for customer resources | Node.js, Go, Python |

## Quick Start

### JavaScript (Browser)

```typescript
import { FlagDashClient } from "@flagdashio/sdk";

const client = new FlagDashClient({
  sdkKey: "sk_...",
});

const enabled = await client.flag("new-feature", { user: { id: "user_1" } });
```

### React

```tsx
import { FlagDashProvider, useFlag } from "@flagdashio/react";

function App() {
  return (
    <FlagDashProvider sdkKey="sk_...">
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
import { FlagDashServer, FlagDashManagement } from "@flagdashio/node";

// Server client — evaluate flags with caching
const server = FlagDashServer.init({
  sdkKey: "sk_...",
});
const enabled = await server.flag("my-feature", { user: { id: "user_1" } });

// Management client — CRUD operations
const mgmt = FlagDashManagement.init({
  apiKey: "pat_...",
  baseUrl: "https://flagdash.example.com",
});
await mgmt.toggleFlag("my-feature");
```

### Go

```go
import flagdash "github.com/flagdash/flagdash-go"

client, err := flagdash.NewClient(flagdash.Config{
    SDKKey: "sk_...",
})

enabled, err := client.Flag(ctx, "my-feature", flagdash.EvaluationContext{
    UserID: "user_1",
}, false)
```

### Python

```python
from flagdash import FlagDashServerClient

client = FlagDashServerClient(sdk_key="sk_...")

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

Session replay support follows the runtime:

- **Browser DOM replay:** JavaScript, React, and Vue.
- **Explicit mobile interaction timelines:** React Native, Android, and Swift/iOS.
- **Explicit backend timelines:** Node.js, Go, Python, Ruby, PHP, Elixir/Erlang, Lua, and Rust.

Mobile and backend SDKs never capture pixels, native view trees, logs, requests, or input values automatically. Flutter replay is not currently included.

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

All releases are managed from the **private monorepo** (`flagdash/flagdash`). Public repos are read-only mirrors — never push or create releases there directly.

### Publishing to Registries

Publishing is triggered by creating a **GitHub Release** (not just a tag) in the private repo.

| SDK | Tag | Trigger | Registry |
|-----|-----|---------|----------|
| `@flagdashio/sdk` | `sdk-v0.1.0` | GitHub Release | npm |
| `@flagdashio/node` | `node-v0.1.0` | GitHub Release | npm |
| `@flagdashio/react` | `react-v0.1.0` | GitHub Release (after `sdk-v*` succeeds) | npm |
| Go SDK | `go-v0.1.0` | Tag push | GitHub Release |
| Python SDK | `python-v0.1.0` | Tag push | PyPI |

**Steps to publish JS packages:**

1. Go to GitHub → Releases → "Create new release"
2. Click "Choose a tag", type the tag (e.g. `sdk-v0.1.0`), select "Create new tag on publish"
3. Target: `main`
4. Click "Publish release"
5. The `sdk-js-publish.yml` workflow runs automatically

**Order matters for JS:** Publish `sdk-v*` first, then `node-v*` and `react-v*`. The React package depends on `@flagdashio/sdk` being published.

Or use the CLI:
```bash
gh release create sdk-v0.1.0 --target main --title "@flagdashio/sdk v0.1.0" --notes "Initial release"
```

### Syncing to Public Repos

The private repo is not accessible to users. SDK source code is synced to public repos so users can browse the source, file issues, and (for Go) run `go get`.

| Source (private) | Public repo | Purpose |
|-----------------|-------------|---------|
| `sdk/packages/` | [flagdash/flagdash-js](https://github.com/flagdash/flagdash-js) | Source browsing, issues |
| `sdk/flagdash-go/` | [flagdash/flagdash-go](https://github.com/flagdash/flagdash-go) | `go get` + source browsing |
| `sdk/flagdash-python/` | [flagdash/flagdash-python](https://github.com/flagdash/flagdash-python) | Source browsing, issues |

Sync is handled by `sdk-sync-public.yml` and triggers:
- **Automatically** on any SDK tag push (`sdk-v*`, `node-v*`, `react-v*`, `go-v*`, `python-v*`)
- **Manually** via Actions → "SDKs — Sync to Public Repos" → "Run workflow" → select SDK

For Go, the tag `go-v0.1.0` is automatically converted to `v0.1.0` in the public repo (Go module convention).

### Required Secrets

| Secret | Where | Purpose |
|--------|-------|---------|
| `NPM_TOKEN` | Private repo | Publish JS packages to npm |
| `SDK_SYNC_TOKEN` | Private repo | Push to public repos |

**Setting up `NPM_TOKEN`:**

1. Go to [npmjs.com](https://www.npmjs.com) → Access Tokens → Generate New Token
2. Select **Granular Access Token**
3. Check **"Bypass two-factor authentication (2FA)"** — required for CI publishing
4. Packages and scopes: **Read and write**, scoped to `@flagdashio`
5. Organizations: **No access** (not needed)
6. Add the token as `NPM_TOKEN` in GitHub repo → Settings → Secrets

**Setting up `SDK_SYNC_TOKEN`:**

1. Go to GitHub → Settings → Developer settings → Fine-grained personal access tokens
2. Scope to the `flagdash` organization, all repositories
3. Repository permissions: **Contents: Read and write**
4. Add the token as `SDK_SYNC_TOKEN` in GitHub repo → Settings → Secrets

**npm organization:**

The `@flagdashio` scope requires an npm organization. Create it at [npmjs.com/org/create](https://www.npmjs.com/org/create) if it doesn't exist.

### CI Workflows

| Workflow | File | Trigger |
|----------|------|---------|
| JS SDK tests | `sdk-js-test.yml` | Push/PR to `sdk/packages/**` |
| Go SDK tests | `sdk-go-test.yml` | Push/PR to `sdk/flagdash-go/**` |
| Python SDK tests | `sdk-python-test.yml` | Push/PR to `sdk/flagdash-python/**` |
| JS SDK publish | `sdk-js-publish.yml` | GitHub Release (`sdk-v*`, `node-v*`, `react-v*`) |
| Go SDK release | `sdk-go-publish.yml` | Tag push (`go-v*`) |
| Python SDK publish | `sdk-python-publish.yml` | Tag push (`python-v*`) |
| Sync to public repos | `sdk-sync-public.yml` | Any SDK tag push or manual dispatch |

## License

All SDKs are released under the [MIT License](../LICENSE).
