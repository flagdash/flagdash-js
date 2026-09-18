import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFlagDash, useFlag, useFlagDash } from "../index";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("FlagDash Vue plugin", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/flags")) return json({ flags: { "checkout-v2": true } });
      if (url.endsWith("/configs")) return json({ configs: [] });
      if (url.includes("/flags/checkout-v2")) {
        return json({ key: "checkout-v2", value: true, reason: "default" });
      }
      return json({ error: "not found" }, 404);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("provides the client and resolves a reactive flag", async () => {
    const plugin = createFlagDash({ sdkKey: "sk_test" });
    const component = defineComponent({
      setup() {
        const context = useFlagDash();
        const flag = useFlag("checkout-v2", false);
        return () => h("output", {
          "data-ready": String(context.isReady.value),
          "data-loading": String(flag.isLoading.value),
        }, String(flag.value.value));
      },
    });

    const wrapper = mount(component, { global: { plugins: [plugin] } });
    await flushPromises();
    await flushPromises();

    expect(wrapper.get("output").attributes("data-ready")).toBe("true");
    expect(wrapper.get("output").attributes("data-loading")).toBe("false");
    expect(wrapper.text()).toBe("true");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/flags"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer sk_test" }) }),
    );

    wrapper.unmount();
    plugin.destroy();
  });

  it("throws a useful error when the plugin was not installed", () => {
    const component = defineComponent({
      setup() {
        useFlagDash();
        return () => h("div");
      },
    });

    expect(() => mount(component)).toThrow("app.use(createFlagDash(config))");
  });
});
