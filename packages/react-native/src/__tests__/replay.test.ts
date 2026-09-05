import { afterEach, describe, expect, it, vi } from "vitest";

import { ReactNativeInteractionReplay } from "../replay";

describe("ReactNativeInteractionReplay", () => {
  // Braced, not a concise arrow: unstubAllGlobals returns VitestUtils, and an
  // implicit return makes the hook resolve to a value where void is expected.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records interactions without DOM or screen capture and redacts secrets", async () => {
    const requests: Array<{ url: string; body?: BodyInit | null }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, body: init?.body });

      if (url.endsWith("/start")) {
        return new Response(JSON.stringify({ id: "rpl_mobile" }), { status: 201 });
      }

      if (url.endsWith("/presign")) {
        return new Response(JSON.stringify({ upload: { url: "https://storage.test/chunk", headers: {} } }));
      }

      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const replay = new ReactNativeInteractionReplay({
      sdkKey: "client_test",
      baseUrl: "https://flagdash.test",
      metadata: { apiKey: "must-not-leak" },
    });

    expect(await replay.start()).toBe(true);
    replay.interaction({ name: "checkout_tapped", screen: "Checkout", properties: { password: "hidden", item: "book" } });
    replay.screen("Payment");
    replay.breadcrumb("payment requested", { token: "hidden" });
    replay.captureException(new Error("must-not-upload-message"));
    expect(replay.contextHeaders()).toEqual({ "x-flagdash-replay-id": "rpl_mobile" });
    await replay.stop();

    expect(requests.map(request => request.url)).toEqual([
      "https://flagdash.test/api/v1/replay-sessions/start",
      "https://flagdash.test/api/v1/replay-sessions/rpl_mobile/chunks/presign",
      "https://storage.test/chunk",
      "https://flagdash.test/api/v1/replay-sessions/rpl_mobile/complete",
    ]);
    expect(String(requests[0].body)).toContain('"type":"interaction"');
    expect(String(requests[0].body)).not.toContain("must-not-leak");
    const uploaded = new TextDecoder().decode(requests[2].body as Uint8Array);
    expect(uploaded).not.toContain("hidden");
    expect(uploaded).toContain("checkout_tapped");
    expect(uploaded).toContain("screen_viewed");
    expect(uploaded).toContain("breadcrumb");
  });

  it("does not buffer interactions when capture was rejected", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const replay = new ReactNativeInteractionReplay({ sdkKey: "client_test" });

    expect(await replay.start()).toBe(false);
    replay.interaction({ name: "tap", properties: { token: "hidden" } });
    await replay.stop();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
