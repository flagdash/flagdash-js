import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordMock, addCustomEventMock } = vi.hoisted(() => {
  const addCustomEventMock = vi.fn();
  const mock = vi.fn((_options: unknown) => vi.fn());
  Object.assign(mock, { addCustomEvent: addCustomEventMock });
  return { recordMock: mock, addCustomEventMock };
});

vi.mock("rrweb", () => ({ record: recordMock }));

import type { FlagDashSessionReplay as SessionReplay } from "../replay";

describe("FlagDashSessionReplay", () => {
  // The module holds "which recorder owns this page", because rrweb's record()
  // is itself a singleton. Reloading the module per test gives each one a fresh
  // page instead of leaking that ownership between them.
  let FlagDashSessionReplay: typeof SessionReplay;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ FlagDashSessionReplay } = await import("../replay"));
    sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "rpl_test", upload: { url: "https://storage.test/chunk", headers: {} } }),
    }));
  });

  it("starts rrweb with hard blocks and unconditional input masking", async () => {
    const replay = new FlagDashSessionReplay({ sdkKey: "sk_test", baseUrl: "https://api.test", sampleRate: 100 });
    expect(await replay.start()).toBe(true);
    expect(recordMock).toHaveBeenCalledOnce();
    const options = recordMock.mock.calls[0][0] as Record<string, any>;
    // Typed values are masked with no way to opt out; page text is not, so a
    // replay is recognisable.
    expect(options.maskAllInputs).toBe(true);
    expect(options.recordCanvas).toBe(false);
    expect(options.blockSelector).toContain("input[type=password]");
    expect(options.blockSelector).toContain(".ph-no-capture");
    expect(options.blockSelector).toContain("[data-flagdash-replay-block]");
    // "*" only routes every text node through maskTextFn; the callback decides.
    expect(options.maskTextSelector).toBe("*");
  });

  describe("text privacy", () => {
    const maskFn = async (options: Partial<Record<string, unknown>> = {}) => {
      const replay = new FlagDashSessionReplay({ sdkKey: "sk_test", baseUrl: "https://api.test", sampleRate: 100, ...options });
      expect(await replay.start()).toBe(true);
      return (recordMock.mock.calls[0][0] as Record<string, any>).maskTextFn as (
        text: string,
        element: HTMLElement | null,
      ) => string;
    };

    it("keeps ordinary page copy so a replay is recognisable", async () => {
      const mask = await maskFn();
      const copy = "Free returns within 30 days on every order";
      expect(mask(copy, document.createElement("p"))).toBe(copy);
    });

    it("redacts credentials, cards and emails wherever they are rendered", async () => {
      const mask = await maskFn();
      const p = document.createElement("p");
      // Our own dashboard renders live API keys as page text, so a value that
      // looks like a credential must go even outside an input.
      // Deliberately not `sk_live_<hex>`: that shape trips GitHub's push
      // protection and blocks the public SDK mirror. The redaction pattern keys
      // off the `sk_` prefix, so this exercises the same branch.
      expect(mask("Key: sk_SYNTHETIC_not_a_real_key_000000", p)).not.toContain("SYNTHETIC");
      expect(mask("Card 4242 4242 4242 4242", p)).not.toContain("4242 4242");
      expect(mask("owner@example.test", p)).not.toContain("@example.test");
      expect(mask("Bearer eyJhbGciOi.eyJzdWIiOjEyMw.QWxhZGRpbjpvc2Vt", p)).not.toContain("eyJhbGciOi");
    });

    it("leaves the words around a redacted value intact", async () => {
      const mask = await maskFn();
      const result = mask("Support reference owner@example.test was created", document.createElement("p"));
      expect(result).toContain("Support reference");
      expect(result).toContain("was created");
    });

    it("does not mistake an order number for a card", async () => {
      const mask = await maskFn();
      // 16 digits but Luhn-invalid: a length rule alone would redact it.
      const copy = "Order 1234567812345678 shipped";
      expect(mask(copy, document.createElement("p"))).toBe(copy);
    });

    it("masks a configured region wholesale, ahead of any pattern check", async () => {
      const mask = await maskFn({ maskedSelectors: [".statement"] });
      const region = document.createElement("div");
      region.className = "statement";
      const line = document.createElement("span");
      region.append(line);
      expect(mask("Closing balance 412.90", line)).not.toContain("412.90");
    });
  });

  describe("session context", () => {
    const startPayload = () => JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);

    it("sends user context under reserved metadata keys and hashes only the id", async () => {
      const replay = new FlagDashSessionReplay({
        sdkKey: "sk_test",
        baseUrl: "https://api.test",
        sampleRate: 100,
        user: {
          userId: "user-42",
          userLabel: "acme-admin",
          accountId: "acct_9",
          plan: "premium",
          attributes: { role: "owner" },
        },
      });
      expect(await replay.start()).toBe(true);

      const body = startPayload();
      // The id travels as `identity`, which the server hashes and discards.
      expect(body.identity).toBe("user-42");
      // Everything else is metadata, stored as sent.
      expect(body.metadata.user_label).toBe("acme-admin");
      expect(body.metadata.account_id).toBe("acct_9");
      expect(body.metadata.plan).toBe("premium");
      expect(body.metadata.role).toBe("owner");
      // Never the raw id: it is not something to retain twice under another name.
      expect(JSON.stringify(body.metadata)).not.toContain("user-42");
    });

    it("collects browser context but never the user agent", async () => {
      const replay = new FlagDashSessionReplay({ sdkKey: "sk_test", baseUrl: "https://api.test", sampleRate: 100 });
      expect(await replay.start()).toBe(true);

      const { metadata } = startPayload();
      expect(metadata.viewport).toMatch(/^\d+x\d+$/);
      expect(metadata.locale).toBeTruthy();
      // The server derives a coarse browser and OS from the request instead, so a
      // client cannot misreport it and no full UA string is ever stored.
      expect(JSON.stringify(metadata)).not.toContain("Mozilla");
    });

    it("lets the caller override collected values", async () => {
      const replay = new FlagDashSessionReplay({
        sdkKey: "sk_test",
        baseUrl: "https://api.test",
        sampleRate: 100,
        metadata: { locale: "cy-GB" },
      });
      expect(await replay.start()).toBe(true);
      expect(startPayload().metadata.locale).toBe("cy-GB");
    });

    it("still honours the deprecated identity option", async () => {
      const replay = new FlagDashSessionReplay({
        sdkKey: "sk_test",
        baseUrl: "https://api.test",
        sampleRate: 100,
        identity: "legacy-user",
      });
      expect(await replay.start()).toBe(true);
      expect(startPayload().identity).toBe("legacy-user");
    });
  });

  it("refuses to install a second recorder on the same page", async () => {
    // rrweb's record() is a module singleton and either recorder's stop removes
    // the observers for both, so React StrictMode's double mount produced a
    // session holding its opening snapshot and nothing else.
    const first = new FlagDashSessionReplay({ sdkKey: "sk_test", baseUrl: "https://api.test", sampleRate: 100 });
    const second = new FlagDashSessionReplay({ sdkKey: "sk_test", baseUrl: "https://api.test", sampleRate: 100 });
    expect(await first.start()).toBe(true);
    expect(await second.start()).toBe(false);
    expect(recordMock).toHaveBeenCalledOnce();

    // Stopping hands the page over, so a replacement can record.
    await first.stop();
    expect(await second.start()).toBe(true);
    expect(recordMock).toHaveBeenCalledTimes(2);
  });

  it("redacts sensitive custom-event properties before rrweb sees them", () => {
    const replay = new FlagDashSessionReplay({ sdkKey: "sk_test" });
    replay.addEvent("checkout", { step: "shipping", password: "never-store-me", nested: { api_key: "secret" } });
    expect(addCustomEventMock).toHaveBeenCalledWith("checkout", {
      step: "shipping", password: "[REDACTED]", nested: { api_key: "[REDACTED]" },
    });
  });

  it("does not initialize when sampling is disabled", async () => {
    const replay = new FlagDashSessionReplay({ sdkKey: "sk_test", sampleRate: 0 });
    expect(await replay.start()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });
});
