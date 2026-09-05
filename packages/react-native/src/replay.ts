import type { ReactNativeConfig } from "./types";
import { createAppStateListener } from "./lifecycle";

export interface ReplayInteraction {
  name: string;
  category?: "action" | "breadcrumb" | "navigation" | "exception" | "flag" | "experiment" | "request";
  timestamp?: string;
  screen?: string;
  properties?: Record<string, unknown>;
}

export interface InteractionReplayOptions extends Pick<ReactNativeConfig, "sdkKey" | "baseUrl"> {
  identity?: string;
  release?: string;
  metadata?: Record<string, unknown>;
  /** Flush buffered interactions when the application enters the background. */
  enableLifecycle?: boolean;
}

const SENSITIVE_KEY = /(pass(word)?|secret|token|authorization|cookie|session|api[-_]?key|credit|card|cvv|cvc|otp|ssn)/i;

/** Interaction-only replay for React Native. It never captures pixels or a DOM. */
export class ReactNativeInteractionReplay {
  private id?: string;
  private sequence = 0;
  private startedAt = new Date();
  private events: ReplayInteraction[] = [];
  private lifecycle?: { remove: () => void };

  constructor(private readonly options: InteractionReplayOptions) {}

  async start(): Promise<boolean> {
    const response = await this.api("/api/v1/replay-sessions/start", {
      type: "interaction",
      platform: "react-native",
      sdk_name: "@flagdashio/react-native",
      sdk_version: "0.1.0",
      started_at: this.startedAt.toISOString(),
      identity: this.options.identity,
      release: this.options.release,
      metadata: sanitize(this.options.metadata || {}),
    });
    if (!response.ok || response.status === 204) return false;
    this.id = (await response.json()).id;
    if (this.options.enableLifecycle !== false) {
      this.lifecycle = createAppStateListener({ onForeground: () => {}, onBackground: () => { void this.flush(); } });
    }
    return true;
  }

  interaction(event: ReplayInteraction): void {
    if (!this.id || !event.name || this.events.length >= 1_000) return;
    this.events.push({
      name: event.name.slice(0, 100),
      category: event.category || "action",
      timestamp: event.timestamp || new Date().toISOString(),
      screen: event.screen?.slice(0, 200),
      properties: sanitize(event.properties || {}) as Record<string, unknown>,
    });
    if (this.events.length >= 100) void this.flush();
  }

  screen(name: string, properties: Record<string, unknown> = {}): void {
    this.interaction({ name: "screen_viewed", category: "navigation", screen: name, properties });
  }

  breadcrumb(message: string, properties: Record<string, unknown> = {}): void {
    this.interaction({ name: message, category: "breadcrumb", properties });
  }

  captureException(error: unknown, properties: Record<string, unknown> = {}): void {
    this.interaction({
      name: error instanceof Error ? error.name : "Error",
      category: "exception",
      properties,
    });
  }

  contextHeaders(): Record<string, string> {
    return this.id ? { "x-flagdash-replay-id": this.id } : {};
  }

  async flush(): Promise<void> {
    if (!this.id || this.events.length === 0) return;
    const events = this.events.splice(0, 100);
    const body = new TextEncoder().encode(JSON.stringify(events));
    const response = await this.api(`/api/v1/replay-sessions/${this.id}/chunks/presign`, {
      sequence: this.sequence++, byte_size: body.byteLength, event_count: events.length, content_encoding: "identity",
    });
    if (!response.ok) return;
    const { upload } = await response.json();
    const uploaded = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: body as unknown as BodyInit });
    if (!uploaded.ok) throw new Error(`Replay chunk upload failed (${uploaded.status})`);
  }

  async stop(): Promise<void> {
    this.lifecycle?.remove();
    this.lifecycle = undefined;
    await this.flush();
    if (!this.id) return;
    await this.api(`/api/v1/replay-sessions/${this.id}/complete`, {
      ended_at: new Date().toISOString(), duration_ms: Date.now() - this.startedAt.getTime(),
    });
  }

  private api(path: string, body: unknown): Promise<Response> {
    return fetch(`${(this.options.baseUrl || "https://flagdash.io").replace(/\/$/, "")}${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${this.options.sdkKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  }
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[REDACTED]";
  if (Array.isArray(value)) return value.slice(0, 500).map(item => sanitize(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitize(item, depth + 1)]));
  return typeof value === "string" ? value.slice(0, 2_000) : value;
}
