# @flagdash/sdk Changelog

## 0.1.0

### Features

- Initial release
- `FlagDash.init()` factory for creating client instances
- `flag(key, context?, defaultValue?)` — evaluate feature flags with targeting context
- `allFlags(context?)` — evaluate all flags at once
- `config(key, defaultValue?)` — fetch remote config values
- `aiConfig(fileName, defaultValue?)` — get AI config files by name
- `listAiConfigs(options?)` — list AI config files with optional filters (fileType, folder)
- Event system: `ready`, `error`, `flags_updated`, `config_updated`, `ai_config_updated`
- Automatic polling with configurable `refreshInterval`
- Context query parameter support for server-side evaluation
- Full TypeScript support
