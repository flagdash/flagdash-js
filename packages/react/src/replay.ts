import { useEffect, useRef } from "react";
import { FlagDashSessionReplay, type SessionReplayOptions } from "@flagdashio/sdk/replay";

export function useSessionReplay(options: SessionReplayOptions & { enabled?: boolean }): FlagDashSessionReplay | null {
  const replay = useRef<FlagDashSessionReplay | null>(null);

  useEffect(() => {
    if (options.enabled === false) return;
    const instance = new FlagDashSessionReplay(options);
    replay.current = instance;
    void instance.start();
    return () => { void instance.stop(); replay.current = null; };
  }, [options.sdkKey, options.baseUrl, options.identity, options.enabled]);

  return replay.current;
}

export type { SessionReplayOptions } from "@flagdashio/sdk/replay";
