# Changelog

## 0.2.0 (2026-02-17)

### Added

- **AI Configs** support in server client: `aiConfig(fileName)` and `listAiConfigs(options?)` for reading AI/LLM context files (agents, skills, rules)
- **Management Client** (`FlagDashManagementClient`) with full CRUD for:
  - Feature flags (create, update, delete, toggle, rules, rollout, variations, schedules)
  - Remote configs (create, update, delete, environment-specific values)
  - AI configs (create, update, delete, initialize defaults)
  - Webhooks (create, update, delete, regenerate secret, reactivate, delivery logs)
- `FlagDashApiError` class for structured error handling from management API
- `FlagDashManagement.init()` factory function
- Full TypeScript types for all management resources
- Comprehensive test suite for management client
- Package metadata: repository, homepage, author, keywords

### Changed

- Bumped version from 0.1.0 to 0.2.0
- AI config cache added to `clearCache()` method

## 0.1.0

### Added

- Initial release
- `FlagDashServerClient` for server-side flag evaluation with caching
- `flag()`, `allFlags()`, `getFlag()`, `listFlags()` for feature flags
- `config()`, `getConfig()`, `listConfigs()` for remote config
- Context-based evaluation via query parameters
- Configurable cache TTL and request timeout
- `FlagDashServer.init()` factory function
- Full TypeScript types
