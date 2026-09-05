export interface BackendReplayOptions {
  sdkKey: string;
  baseUrl?: string;
  identity?: string;
  release?: string;
  metadata?: Record<string, unknown>;
}

export interface BackendReplayEvent {
  name: string;
  category?: "action" | "breadcrumb" | "log" | "exception" | "flag" | "experiment" | "request";
  timestamp?: string;
  attributes?: Record<string, unknown>;
}

const SENSITIVE_KEY = /(pass(word)?|secret|token|authorization|cookie|session|api[-_]?key|credit|card|cvv|cvc|otp|ssn)/i;

/** Ordered, interaction-only trace capture for trusted Node.js backends. */
export class FlagDashBackendReplay {
  private id?: string;
  private sequence = 0;
  private readonly startedAt = new Date();
  private events: BackendReplayEvent[] = [];

  constructor(private readonly options: BackendReplayOptions) {}

  async start(): Promise<boolean> {
    const response = await this.api("/api/v1/replay-sessions/start", {
      type: "trace", platform: "node", sdk_name: "@flagdashio/node", sdk_version: "0.2.0",
      started_at: this.startedAt.toISOString(), identity: this.options.identity,
      release: this.options.release, metadata: sanitize(this.options.metadata || {}),
    });
    if (!response.ok || response.status === 204) return false;
    this.id = (await response.json()).id;
    return true;
  }

  event(event: BackendReplayEvent): void {
    if (!this.id || !event.name || this.events.length >= 1_000) return;
    this.events.push({
      name: event.name.slice(0, 100), category: event.category || "action",
      timestamp: event.timestamp || new Date().toISOString(),
      attributes: sanitize(event.attributes || {}) as Record<string, unknown>,
    });
  }

  breadcrumb(message: string, attributes: Record<string, unknown> = {}): void {
    this.event({ name: message, category: "breadcrumb", attributes });
  }

  captureException(error: unknown, attributes: Record<string, unknown> = {}): void {
    const name = error instanceof Error ? error.name : "Error";
    this.event({ name, category: "exception", attributes });
  }

  contextHeaders(): Record<string, string> {
    return this.id ? { "x-flagdash-replay-id": this.id } : {};
  }

  async flush(): Promise<void> {
    if (!this.id || this.events.length === 0) return;
    const events = this.events.splice(0, 100);
    const body = new TextEncoder().encode(JSON.stringify(events));
    const response = await this.api(`/api/v1/replay-sessions/${this.id}/chunks/presign`, {
      sequence: this.sequence++, byte_size: body.byteLength, event_count: events.length,
      content_encoding: "identity",
    });
    if (!response.ok) return;
    const { upload } = await response.json();
    const uploaded = await fetch(upload.url, { method: "PUT", headers: upload.headers, body });
    if (!uploaded.ok) throw new Error(`Replay chunk upload failed (${uploaded.status})`);
    if (this.events.length > 0) await this.flush();
  }

  async stop(): Promise<void> {
    await this.flush();
    if (!this.id) return;
    await this.api(`/api/v1/replay-sessions/${this.id}/complete`, {
      ended_at: new Date().toISOString(), duration_ms: Date.now() - this.startedAt.getTime(),
    });
  }

  private api(path: string, body: unknown): Promise<Response> {
    return fetch(`${(this.options.baseUrl || "https://flagdash.io").replace(/\/$/, "")}${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${this.options.sdkKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[REDACTED]";
  if (Array.isArray(value)) return value.slice(0, 500).map(item => sanitize(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitize(item, depth + 1)]));
  return typeof value === "string" ? value.slice(0, 2_000) : value;
}
