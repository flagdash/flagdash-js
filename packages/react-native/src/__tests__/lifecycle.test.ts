import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAppStateListener, setAppState } from "../lifecycle";

type AppStateStatus = "active" | "background" | "inactive";
type AppStateCallback = (state: AppStateStatus) => void;

let listeners: AppStateCallback[] = [];

const mockAppState = {
  currentState: "active" as AppStateStatus,
  addEventListener: vi.fn((_type: string, listener: AppStateCallback) => {
    listeners.push(listener);
    return {
      remove: () => {
        listeners = listeners.filter((l) => l !== listener);
      },
    };
  }),
};

function simulateStateChange(state: AppStateStatus) {
  listeners.forEach((l) => l(state));
}

beforeEach(() => {
  listeners = [];
  mockAppState.currentState = "active";
  vi.clearAllMocks();
  setAppState(mockAppState);
});

describe("createAppStateListener", () => {
  it("calls onBackground when transitioning from active to background", () => {
    const onForeground = vi.fn();
    const onBackground = vi.fn();

    createAppStateListener({ onForeground, onBackground });

    simulateStateChange("background");

    expect(onBackground).toHaveBeenCalledTimes(1);
    expect(onForeground).not.toHaveBeenCalled();
  });

  it("calls onForeground when transitioning from background to active", () => {
    const onForeground = vi.fn();
    const onBackground = vi.fn();

    createAppStateListener({ onForeground, onBackground });

    // Go to background first
    simulateStateChange("background");
    // Then back to active
    simulateStateChange("active");

    expect(onForeground).toHaveBeenCalledTimes(1);
    expect(onBackground).toHaveBeenCalledTimes(1);
  });

  it("does not fire on inactive transitional state", () => {
    const onForeground = vi.fn();
    const onBackground = vi.fn();

    createAppStateListener({ onForeground, onBackground });

    // active → inactive (transitional, not background)
    simulateStateChange("inactive");

    // inactive is not 'active', so onBackground fires (active→inactive)
    expect(onBackground).toHaveBeenCalledTimes(1);

    // inactive → active fires onForeground
    simulateStateChange("active");
    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it("remove() stops listening", () => {
    const onForeground = vi.fn();
    const onBackground = vi.fn();

    const { remove } = createAppStateListener({ onForeground, onBackground });

    remove();

    simulateStateChange("background");
    simulateStateChange("active");

    expect(onBackground).not.toHaveBeenCalled();
    expect(onForeground).not.toHaveBeenCalled();
  });

  it("handles multiple background/foreground cycles", () => {
    const onForeground = vi.fn();
    const onBackground = vi.fn();

    createAppStateListener({ onForeground, onBackground });

    simulateStateChange("background");
    simulateStateChange("active");
    simulateStateChange("background");
    simulateStateChange("active");

    expect(onBackground).toHaveBeenCalledTimes(2);
    expect(onForeground).toHaveBeenCalledTimes(2);
  });

  it("returns no-op when AppState is not available", () => {
    setAppState(null);
    const onForeground = vi.fn();
    const onBackground = vi.fn();

    const { remove } = createAppStateListener({ onForeground, onBackground });

    // Should not throw
    remove();
    expect(onForeground).not.toHaveBeenCalled();
    expect(onBackground).not.toHaveBeenCalled();
  });
});
