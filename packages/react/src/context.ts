import { createContext } from "react";
import type { FlagDashClient } from "@flagdash/sdk";

export interface FlagDashContextValue {
  client: FlagDashClient | null;
  isReady: boolean;
}

export const FlagDashContext = createContext<FlagDashContextValue>({
  client: null,
  isReady: false,
});

export interface FlagDashErrorBoundaryContextValue {
  error: Error | null;
  resetError: () => void;
}

export const FlagDashErrorBoundaryContext =
  createContext<FlagDashErrorBoundaryContextValue>({
    error: null,
    resetError: () => {},
  });
