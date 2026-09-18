import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FlagDashContext } from "./context";
import { ReactNativeClient } from "./client";
import type { FlagDashProviderProps } from "./types";

export function FlagDashProvider({
  sdkKey,
  baseUrl,
  user,
  refreshInterval,
  realtime,
  enableCache,
  enableLifecycle,
  children,
}: FlagDashProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const clientRef = useRef<ReactNativeClient | null>(null);

  const config = useMemo(
    () => ({
      sdkKey,
      baseUrl,
      refreshInterval,
      realtime,
      enableCache,
      enableLifecycle,
    }),
    [sdkKey, baseUrl, refreshInterval, realtime, enableCache, enableLifecycle]
  );

  useEffect(() => {
    const client = new ReactNativeClient(config);
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
