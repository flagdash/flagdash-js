import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FlagDashClient, type FlagDashConfig, type UserContext } from "@flagdash/sdk";
import { FlagDashContext } from "./context";

export interface FlagDashProviderProps {
  /** Your FlagDash API key. The key determines the project and environment. */
  sdkKey: string;
  /** Base URL of your FlagDash instance. Defaults to https://flagdash.io */
  baseUrl?: string;
  /** Optional user context for targeting */
  user?: UserContext;
  /** Polling interval in ms */
  refreshInterval?: number;
  /** Enable real-time updates via SSE. Defaults to false. Falls back to polling if SSE fails. */
  realtime?: boolean;
  children: ReactNode;
}

export function FlagDashProvider({
  sdkKey,
  baseUrl,
  user,
  refreshInterval,
  realtime,
  children,
}: FlagDashProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const clientRef = useRef<FlagDashClient | null>(null);

  const config = useMemo<FlagDashConfig>(
    () => ({
      sdkKey,
      baseUrl,
      refreshInterval,
      realtime,
    }),
    [sdkKey, baseUrl, refreshInterval, realtime]
  );

  useEffect(() => {
    const client = new FlagDashClient(config);
    clientRef.current = client;

    const unsubscribe = client.on("ready", () => {
      setIsReady(true);
    });

    return () => {
      unsubscribe();
      client.destroy();
      clientRef.current = null;
      setIsReady(false);
    };
  }, [config]);

  const contextValue = useMemo(
    () => ({ client: clientRef.current, isReady }),
    [isReady]
  );

  return (
    <FlagDashContext.Provider value={contextValue}>
      {children}
    </FlagDashContext.Provider>
  );
}
