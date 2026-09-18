import { mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

const start = vi.fn().mockResolvedValue(true);
const stop = vi.fn().mockResolvedValue(undefined);
vi.mock("@flagdashio/sdk/replay", () => ({
  FlagDashSessionReplay: class { start = start; stop = stop; },
}));

import { useSessionReplay } from "../replay";

describe("useSessionReplay", () => {
  afterEach(() => { start.mockClear(); stop.mockClear(); });

  it("owns the browser recorder for the component lifecycle", async () => {
    const component = defineComponent({ setup() { return { replay: useSessionReplay({ sdkKey: "sk_test" }) }; }, template: "<div />" });
    const wrapper = mount(component);
    await nextTick();
    expect(start).toHaveBeenCalledOnce();
    wrapper.unmount();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("does not start when disabled", async () => {
    const component = defineComponent({ setup() { useSessionReplay({ sdkKey: "sk_test", enabled: false }); }, template: "<div />" });
    const wrapper = mount(component);
    await nextTick();
    expect(start).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
