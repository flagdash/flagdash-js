import { createContext } from "react";
import type { ReactNativeClient } from "./client";

export interface FlagDashContextValue {
  client: ReactNativeClient | null;
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
