import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FlagDashClient, type FlagDashConfig, type UserContext } from "@flagdash/sdk";
import { FlagDashContext } from "./context";

export interface FlagDashProviderProps {
  /** Your FlagDash Client API key */
  sdkKey: string;
  /** Target environment */
  environment: string;
  /** Base URL of your FlagDash instance */
  baseUrl?: string;
  /** Optional user context for targeting */
  user?: UserContext;
  /** Polling interval in ms */
  refreshInterval?: number;
  children: ReactNode;
}

export function FlagDashProvider({
  sdkKey,
  environment,
  baseUrl,
  user,
  refreshInterval,
  children,
}: FlagDashProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const clientRef = useRef<FlagDashClient | null>(null);

  const config = useMemo<FlagDashConfig>(
    () => ({
      sdkKey,
      environment,
      baseUrl,
      refreshInterval,
    }),
    [sdkKey, environment, baseUrl, refreshInterval]
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
