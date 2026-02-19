import { Component, type ReactNode } from "react";
import { FlagDashErrorBoundaryContext } from "./context";

export interface FlagDashErrorBoundaryProps {
  /** Fallback UI to render when an error is caught */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: { componentStack?: string | null }) => void;
  children?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Error boundary for FlagDash components.
 * Catches errors thrown by FlagDash hooks (e.g., missing provider)
 * and renders a fallback UI.
 *
 * @example
 * ```tsx
 * <FlagDashErrorBoundary fallback={<Text>Failed to load flags</Text>}>
 *   <MyComponent />
 * </FlagDashErrorBoundary>
 * ```
 */
export class FlagDashErrorBoundary extends Component<
  FlagDashErrorBoundaryProps,
  State
> {
  constructor(props: FlagDashErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, {
      componentStack: errorInfo.componentStack,
    });
  }

  resetError = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { fallback, children } = this.props;

    const contextValue = {
      error,
      resetError: this.resetError,
    };

    if (error) {
      const fallbackContent =
        typeof fallback === "function"
          ? fallback(error, this.resetError)
          : fallback ?? null;

      return (
        <FlagDashErrorBoundaryContext.Provider value={contextValue}>
          {fallbackContent}
        </FlagDashErrorBoundaryContext.Provider>
      );
    }

    return (
      <FlagDashErrorBoundaryContext.Provider value={contextValue}>
        {children}
      </FlagDashErrorBoundaryContext.Provider>
    );
  }
}
