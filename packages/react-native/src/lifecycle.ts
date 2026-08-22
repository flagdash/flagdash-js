type AppStateStatus = "active" | "background" | "inactive" | "unknown" | "extension";

interface AppStateListener {
  remove: () => void;
}

export interface AppStateModule {
  currentState: AppStateStatus;
  addEventListener(
    type: string,
    listener: (state: AppStateStatus) => void
  ): AppStateListener;
}

let _appState: AppStateModule | null = null;
let _resolved = false;

function getAppState(): AppStateModule | null {
  if (_resolved) return _appState;
  _resolved = true;
  try {
    // Attempt dynamic resolve — works in React Native's bundler (Metro)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RN = (Function("try { return require('react-native') } catch(e) { return null }"))();
    _appState = RN?.AppState ?? null;
  } catch {
    _appState = null;
  }
  return _appState;
}

/** Inject a custom AppState implementation (useful for testing) */
export function setAppState(appState: AppStateModule | null): void {
  _appState = appState;
  _resolved = true;
}

export interface AppStateCallbacks {
  onForeground: () => void;
  onBackground: () => void;
}

export function createAppStateListener(
  callbacks: AppStateCallbacks
): { remove: () => void } {
  const appState = getAppState();
  if (!appState) {
    return { remove: () => {} };
  }

  let currentState = appState.currentState;

  const subscription = appState.addEventListener("change", (nextState) => {
    if (currentState !== "active" && nextState === "active") {
      callbacks.onForeground();
    } else if (currentState === "active" && nextState !== "active") {
      callbacks.onBackground();
    }
    currentState = nextState;
  });

  return {
    remove: () => subscription.remove(),
  };
}
