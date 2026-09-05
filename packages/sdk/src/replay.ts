import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";

/**
 * Optional context that makes a recorded session investigable.
 *
 * Every field is optional and every one is your choice to send — FlagDash never
 * infers them. What you send is sanitized (keys matching password/secret/token/
 * card and friends are redacted) and stored on the replay, then shown on the
 * replay workspace. Anything absent renders as "n/a" rather than disappearing,
 * so it is obvious whether a field was never sent or was genuinely empty.
 *
 * `userId` is treated differently from the rest: it is HMAC-hashed server-side
 * with a deployment secret and the raw value is discarded, so sessions from the
 * same person correlate without the id ever being stored. Use `userLabel` if you
 * want something human-readable in the UI — and only put in it what you are
 * comfortable retaining for 30 days.
 */
export interface SessionReplayUser {
  /** Stable identifier. Hashed server-side; the raw value is never stored. */
  userId?: string;
  /** Human-readable label shown in the workspace, e.g. "acme-admin". Stored as sent. */
  userLabel?: string;
  /** Tenant or workspace this session belongs to. */
  accountId?: string;
  /** Billing plan or tier, for spotting whether an issue is plan-specific. */
  plan?: string;
  /** Signup cohort, role, locale — anything else worth filtering on later. */
  attributes?: Record<string, unknown>;
}

export interface SessionReplayOptions {
  sdkKey: string;
  baseUrl?: string;
  /** @deprecated Use `user.userId`. Kept so existing integrations keep working. */
  identity?: string;
  user?: SessionReplayUser;
  release?: string;
  sampleRate?: number;
  blockedSelectors?: string[];
  maskedSelectors?: string[];
  allowedTextSelectors?: string[];
  metadata?: Record<string, unknown>;
  flushIntervalMs?: number;
  /** Capture browser exceptions and repeated-click friction signals. */
  captureFrictionSignals?: boolean;
}

const HARD_BLOCK = [
  "input[type=password]",
  "input[autocomplete*=cc-]",
  "input[autocomplete=one-time-code]",
  "canvas",
  "audio",
  "video",
  "iframe",
  ".ph-no-capture",
  ".rr-block",
  "[data-flagdash-replay-block]",
].join(",");

// Regions whose text is replaced wholesale, as opposed to the hard blocks above
// which are never captured at all.
const MASK_TEXT = ["[data-flagdash-replay-mask]", ".rr-mask", ".ph-mask"];

const SENSITIVE_KEY = /(pass(word)?|secret|token|authorization|cookie|session|api[-_]?key|credit|card|cvv|cvc|otp|ssn)/i;

/**
 * Text patterns redacted wherever they are rendered.
 *
 * Page text is recorded so a replay is recognisable — you can read the labels,
 * headings and copy and tell what someone was doing. That only stays safe if
 * the values that must never be stored are recognised by shape rather than by
 * where they happen to sit: our own dashboard renders live API keys as ordinary
 * page text, so "mask nothing outside inputs" would upload credentials.
 *
 * Typed values are covered separately and unconditionally by maskAllInputs.
 */
const SENSITIVE_TEXT: RegExp[] = [
  // Credential formats with unambiguous prefixes — ours and common vendors'.
  /\b(?:sk|pk|pat|rk|whsec|phc|session)_[A-Za-z0-9_-]{8,}/g,
  /\bey[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  // Email addresses are PII even when displayed rather than typed.
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
  // Any remaining high-entropy run. Long enough that prose, identifiers and
  // our own short resource ids fall through untouched.
  /\b[A-Za-z0-9_-]{32,}\b/g,
];

// Card numbers are matched separately: a Luhn check is what separates a card
// from an order number or a quantity, and a bare digit-length rule would redact
// half the numbers on a normal page.
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;

const luhnValid = (digits: string): boolean => {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = digits.charCodeAt(index) - 48;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
};

const bullets = (length: number): string => "\u2022".repeat(Math.max(1, Math.min(length, 80)));

/**
 * Redact only the sensitive spans of a string, preserving everything around
 * them so the sentence still reads and the layout still holds its shape.
 */
export function redactSensitiveText(value: string): string {
  let result = value.replace(CARD_CANDIDATE, match => {
    const digits = match.replace(/\D/g, "");
    return luhnValid(digits) ? bullets(match.trim().length) : match;
  });
  for (const pattern of SENSITIVE_TEXT) {
    result = result.replace(pattern, match => bullets(match.length));
  }
  return result;
}

/**
 * The one recorder allowed to own this page.
 *
 * rrweb's `record()` is a module singleton: a second call re-points its emit at
 * the newer recorder, and either recorder's stop function removes the observers
 * for both. React StrictMode mounts every effect twice, so two recorders is the
 * *normal* case in development — and the observed result was a session that
 * stored its opening snapshot and then nothing at all, because the discarded
 * recorder tore the observers down after the surviving one installed them.
 *
 * Whichever instance claims this first records; the others decline before they
 * reach the server, so they do not leave abandoned "recording" rows behind.
 */
let pageRecorder: FlagDashSessionReplay | null = null;

export class FlagDashSessionReplay {
  private readonly options: SessionReplayOptions;
  private replayId?: string;
  private events: eventWithTime[] = [];
  private sequence = 0;
  private stopRecording?: () => void;
  private timer?: ReturnType<typeof setInterval>;
  private startedAt = new Date();
  private uploading = Promise.resolve();
  private serverCapture?: { blocked_selectors?: string[]; masked_selectors?: string[]; allowed_text_selectors?: string[] };
  private readonly recentClicks = new Map<string, number[]>();
  private readonly signalCounts: Record<string, number> = {};
  private frictionSignals = true;

  constructor(options: SessionReplayOptions) {
    this.options = options;
  }

  async start(): Promise<boolean> {
    if (typeof window === "undefined" || typeof document === "undefined") return false;
    if (pageRecorder && pageRecorder !== this) return false;
    if (!this.sampled()) return false;
    pageRecorder = this;

    const response = await this.api("/api/v1/replay-sessions/start", {
      type: "browser",
      platform: "web",
      sdk_name: "@flagdashio/sdk/replay",
      sdk_version: "0.1.0",
      started_at: this.startedAt.toISOString(),
      identity: this.options.user?.userId ?? this.options.identity,
      entry_url: window.location.href,
      page_title: document.title,
      release: this.options.release,
      metadata: sanitize(this.sessionContext()),
    });

    if (!response.ok || response.status === 204) {
      if (pageRecorder === this) pageRecorder = null;
      return false;
    }

    const started = await response.json();
    // stop() may have run while the start request was in flight — the common
    // case under StrictMode. Installing observers now would hand them to a
    // session nobody is going to complete.
    if (pageRecorder !== this) {
      // Finalise it with nothing recorded rather than leaving a row stuck in
      // "recording" for the retention window. The list already hides sessions
      // with no events.
      void this.api(`/api/v1/replay-sessions/${started.id}/complete`, {
        ended_at: new Date().toISOString(),
        duration_ms: 0,
      }).catch(() => undefined);
      return false;
    }

    this.replayId = started.id;
    this.serverCapture = started.capture;
    this.frictionSignals = this.options.captureFrictionSignals !== false;
    this.stopRecording = record({
      emit: event => {
        this.events.push(event);
        if (this.estimatedBytes() >= 750_000) void this.flush();
      },
      // Every typed value is masked, always. There is no configuration that
      // turns this off, because an input is where secrets are entered.
      maskAllInputs: true,
      // maskTextSelector stays "*" so maskTextFn is consulted for every text
      // node; the callback, not the selector, decides what is actually hidden.
      maskTextSelector: "*",
      maskTextFn: (value, element) => this.maskText(value, element),
      blockSelector: [HARD_BLOCK, ...(this.serverCapture?.blocked_selectors || []), ...(this.options.blockedSelectors || [])].join(","),
      slimDOMOptions: { script: true, comment: true, headFavicon: true, headWhitespace: true },
      recordCanvas: false,
      collectFonts: false,
    }) || undefined;
    this.timer = setInterval(() => void this.flush(), this.options.flushIntervalMs || 30_000);
    addEventListener("pagehide", this.onPageHide);
    if (this.frictionSignals) this.installFrictionSignals();
    return true;
  }

  async stop(): Promise<void> {
    // Release the page before tearing down, so a replacement recorder can claim
    // it immediately and cannot be stopped by this instance's teardown.
    if (pageRecorder === this) pageRecorder = null;
    this.stopRecording?.();
    this.stopRecording = undefined;
    if (this.timer) clearInterval(this.timer);
    removeEventListener("pagehide", this.onPageHide);
    this.removeFrictionSignals();
    await this.flush();
    await this.uploading;
    if (!this.replayId) return;

    await this.api(`/api/v1/replay-sessions/${this.replayId}/complete`, {
      ended_at: new Date().toISOString(),
      duration_ms: Math.min(Date.now() - this.startedAt.getTime(), 7_200_000),
      exit_url: location.href,
      has_errors: (this.signalCounts.error || 0) > 0,
      metadata: { friction_signals: this.signalCounts },
    });
  }

  /**
   * The server-issued replay id, once a session has been accepted.
   *
   * Undefined before start() resolves, and while consent is pending or the
   * session was not sampled — there is deliberately no id to correlate in those
   * cases, because nothing was recorded.
   */
  getReplayId(): string | undefined {
    return this.replayId;
  }

  /**
   * Assemble the metadata sent with the session.
   *
   * The browser fields are collected because they answer the first questions
   * asked of any bug report — what size was the window, what language, what time
   * was it locally — and none of them identify anyone. The full user agent is
   * deliberately not among them: the server derives a coarse browser and OS from
   * the request instead, so a client cannot claim to be something it is not.
   *
   * Caller-supplied values win over the collected ones: an application that
   * knows better about its own locale should be able to say so.
   */
  private sessionContext(): Record<string, unknown> {
    const user = this.options.user || {};
    const collected: Record<string, unknown> = {};

    try {
      collected.viewport = `${window.innerWidth}x${window.innerHeight}`;
      collected.locale = navigator.language;
      collected.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      // A locked-down environment can throw on any of these. Context is a
      // convenience; losing it must never stop a recording.
    }

    return {
      ...collected,
      ...(user.userLabel ? { user_label: user.userLabel } : {}),
      ...(user.accountId ? { account_id: user.accountId } : {}),
      ...(user.plan ? { plan: user.plan } : {}),
      ...(user.attributes || {}),
      ...(this.options.metadata || {}),
    };
  }

  /** Opaque correlation context for propagating this session across tiers. */
  getReplayContext(): Record<string, string> {
    return this.replayId ? { replay_id: this.replayId } : {};
  }

  /**
   * Add the correlation header to an outgoing request.
   *
   * Opaque id only. The server decides what, if anything, to associate with it —
   * notably the experiment variant, which is computed there so a client cannot
   * claim membership of a variant it was not assigned.
   */
  injectReplayHeaders(headers: Record<string, string> = {}): Record<string, string> {
    if (this.replayId) headers["X-FlagDash-Replay-Id"] = this.replayId;
    return headers;
  }

  addEvent(name: string, properties: Record<string, unknown> = {}): void {
    const signal = properties.signal;
    if (typeof signal === "string") this.signalCounts[signal] = (this.signalCounts[signal] || 0) + 1;
    try {
      record.addCustomEvent(name.slice(0, 100), sanitize(properties));
    } catch {
      // A custom event is diagnostic context, never a reason to fail the host app.
    }
  }

  /** Record a meaningful user action for baseline/candidate difficulty analysis. */
  trackAction(name: string, properties: Record<string, unknown> = {}): void {
    this.addEvent(name, { ...properties, signal: "action" });
  }

  /** Record a request outcome without sending URL query strings or payloads. */
  trackRequest(request: {
    name: string;
    method?: string;
    path?: string;
    status?: number;
    durationMs?: number;
    failed?: boolean;
  }): void {
    const failed = request.failed === true || (request.status !== undefined && request.status >= 400);
    this.addEvent(failed ? "request_failed" : "request_succeeded", {
      signal: "request",
      name: request.name,
      method: request.method,
      path: sanitizePath(request.path),
      status: request.status,
      duration_ms: request.durationMs,
    });
  }

  /** Record that a changed UI element was rendered, visible, or used. */
  trackRender(name: string, properties: Record<string, unknown> = {}): void {
    this.addEvent(name, { ...properties, signal: "render" });
  }

  private readonly onPageHide = () => { void this.stop(); };

  private readonly onWindowError = (event: ErrorEvent) => {
    this.addEvent("exception", {
      signal: "error",
      message: redactSensitiveText(event.message),
      source: sanitizePath(event.filename),
      line: event.lineno,
      column: event.colno,
    });
  };

  private readonly onUnhandledRejection = (event: PromiseRejectionEvent) => {
    this.addEvent("unhandled_rejection", {
      signal: "error",
      message: redactSensitiveText(event.reason instanceof Error ? event.reason.message : String(event.reason || "unknown")),
    });
  };

  private readonly onDocumentClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest("button,a,[role=button],input,select,textarea") : null;
    if (!target) return;
    const key = target.getAttribute("data-testid") || target.id || target.getAttribute("aria-label") || `${target.tagName}.${target.className}`;
    const now = Date.now();
    const recent = (this.recentClicks.get(key) || []).filter(timestamp => now - timestamp < 2_000);
    recent.push(now);
    this.recentClicks.set(key, recent.slice(-5));
    if (recent.length === 2) this.addEvent("retry", { signal: "friction", target: key, attempts: recent.length });
    if (recent.length >= 3) this.addEvent("rage_click", { signal: "friction", target: key, attempts: recent.length });
  };

  private installFrictionSignals(): void {
    addEventListener("error", this.onWindowError);
    addEventListener("unhandledrejection", this.onUnhandledRejection);
    document.addEventListener("click", this.onDocumentClick, true);
  }

  private removeFrictionSignals(): void {
    removeEventListener("error", this.onWindowError);
    removeEventListener("unhandledrejection", this.onUnhandledRejection);
    document.removeEventListener("click", this.onDocumentClick, true);
    this.recentClicks.clear();
  }

  private async flush(): Promise<void> {
    if (!this.replayId || this.events.length === 0) return;
    const events = this.events.splice(0, this.events.length);
    const sequence = this.sequence++;
    this.uploading = this.uploading.then(() => this.upload(events, sequence)).catch(() => undefined);
    await this.uploading;
  }

  private async upload(events: eventWithTime[], sequence: number): Promise<void> {
    const encoded = await encodeBody(JSON.stringify(events));
    const body = encoded.body;
    const manifest = await this.api(`/api/v1/replay-sessions/${this.replayId}/chunks/presign`, {
      sequence,
      byte_size: body.byteLength,
      event_count: events.length,
      content_encoding: encoded.contentEncoding,
    });
    if (!manifest.ok) return;
    const { upload } = await manifest.json();
    const response = await fetch(upload.url, {
      method: "PUT",
      headers: upload.headers,
      body: new Blob([body.buffer as ArrayBuffer]),
    });
    if (!response.ok) throw new Error(`Replay chunk upload failed (${response.status})`);
  }

  private api(path: string, body: unknown): Promise<Response> {
    return fetch(`${(this.options.baseUrl || "https://flagdash.io").replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.options.sdkKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  }

  private sampled(): boolean {
    // The dashboard rate is enforced by the start endpoint. This optional
    // local rate can only reduce it further; by default every consented client
    // asks the server whether this session is sampled.
    const rate = Math.max(0, Math.min(100, this.options.sampleRate ?? 100));
    if (rate === 100) return true;
    if (rate === 0) return false;
    const key = `flagdash-replay-sample:${new Date().toISOString().slice(0, 10)}`;
    const stored = sessionStorage.getItem(key);
    if (stored) return stored === "1";
    const result = crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff * 100 < rate;
    sessionStorage.setItem(key, result ? "1" : "0");
    return result;
  }

  /**
   * Decide what happens to one text node.
   *
   * Order matters: a configured mask region wins over an allow region, and both
   * are decided before the pattern scan, so an explicitly masked block is never
   * partially revealed just because its text looks harmless.
   */
  private maskText(value: string, element: HTMLElement | null): string {
    if (!element) return redactSensitiveText(value);

    const masked = [...MASK_TEXT, ...(this.serverCapture?.masked_selectors || []), ...(this.options.maskedSelectors || [])];
    if (matches(element, masked)) return bullets(value.length);

    const allowed = [...(this.serverCapture?.allowed_text_selectors || []), ...(this.options.allowedTextSelectors || [])];
    if (matches(element, allowed)) return value;

    return redactSensitiveText(value);
  }

  private estimatedBytes(): number {
    return this.events.length * 350;
  }
}

function matches(element: HTMLElement, selectors: string[]): boolean {
  if (selectors.length === 0) return false;
  try {
    return element.closest(selectors.join(",")) !== null;
  } catch {
    // A caller-supplied selector can be invalid. Failing closed here would mask
    // the whole page over one typo, so treat an unusable list as no match and
    // leave the pattern scan as the safety net.
    return false;
  }
}

function sanitizePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    return url.pathname.slice(0, 300);
  } catch {
    return value.split(/[?#]/, 1)[0].slice(0, 300);
  }
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[REDACTED]";
  if (Array.isArray(value)) return value.slice(0, 500).map(item => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitize(item, depth + 1)]));
  }
  if (typeof value === "string") return value.slice(0, 2_000);
  return typeof value === "number" || typeof value === "boolean" || value == null ? value : "[REDACTED]";
}

async function encodeBody(value: string): Promise<{ body: Uint8Array; contentEncoding: "gzip" | "identity" }> {
  if (typeof CompressionStream === "undefined") return { body: new TextEncoder().encode(value), contentEncoding: "identity" };
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream("gzip"));
  return { body: new Uint8Array(await new Response(stream).arrayBuffer()), contentEncoding: "gzip" };
}
