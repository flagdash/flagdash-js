import { afterEach, describe, expect, it, vi } from "vitest";
import { FlagDashBackendReplay } from "../replay";

describe("FlagDashBackendReplay", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uploads an ordered sanitized backend timeline", async () => {
    const requests: Array<{ url: string; body?: BodyInit | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input); requests.push({ url, body: init?.body });
      if (url.endsWith("/start")) return new Response(JSON.stringify({ id: "rpl_node" }), { status: 201 });
      if (url.endsWith("/presign")) return new Response(JSON.stringify({ upload: { url: "https://storage.test/chunk", headers: {} } }));
      return new Response(null, { status: 200 });
    }));

    const replay = new FlagDashBackendReplay({ sdkKey: "sk_test", baseUrl: "https://api.test" });
    expect(await replay.start()).toBe(true);
    replay.event({ name: "checkout_started", attributes: { password: "hidden", cartSize: 2 } });
    replay.breadcrumb("payment requested", { token: "hidden" });
    expect(replay.contextHeaders()).toEqual({ "x-flagdash-replay-id": "rpl_node" });
    await replay.stop();

    const uploaded = new TextDecoder().decode(requests.find(request => request.url.includes("storage.test"))?.body as Uint8Array);
    expect(uploaded).toContain("checkout_started");
    expect(uploaded).toContain("payment requested");
    expect(uploaded).not.toContain("hidden");
  });

  it("does not collect when dashboard sampling declines the trace", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const replay = new FlagDashBackendReplay({ sdkKey: "sk_test" });
    expect(await replay.start()).toBe(false);
    replay.event({ name: "ignored" });
    await replay.stop();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
