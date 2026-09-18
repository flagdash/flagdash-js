import type { FlagDashConfig, UserContext } from "@flagdashio/sdk";
import type { ReactNode } from "react";

/** Configuration options for the React Native FlagDash client */
export interface ReactNativeConfig extends FlagDashConfig {
  /** Enable AsyncStorage caching for offline support. Defaults to true. */
  enableCache?: boolean;
  /** Enable AppState lifecycle management (pause on background, refresh on foreground). Defaults to true. */
  enableLifecycle?: boolean;
}

/** Props for the FlagDashProvider component */
export interface FlagDashProviderProps {
  /** Your FlagDash API key. The key determines the project and environment. */
  sdkKey: string;
  /** Base URL of your FlagDash instance. Defaults to https://flagdash.io */
  baseUrl?: string;
  /**
   * @deprecated Currently ignored. Provider-level user context is NOT wired
   * into evaluations. Pass evaluation context per call instead, e.g.
   * `useFlag('key', false, { user: { id } })`. Retained for backwards
   * compatibility; will be removed in a future major version.
   */
  user?: UserContext;
  /** Polling interval in ms */
  refreshInterval?: number;
  /** Enable real-time updates via SSE. Requires react-native-sse. Defaults to false. */
  realtime?: boolean;
  /** Enable AsyncStorage caching. Defaults to true. */
  enableCache?: boolean;
  /** Enable AppState lifecycle management. Defaults to true. */
  enableLifecycle?: boolean;
  children: ReactNode;
}
