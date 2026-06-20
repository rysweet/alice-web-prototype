export enum ConnectionStatus {
  Online = "online",
  Offline = "offline",
  Reconnecting = "reconnecting",
}

export interface MessageEnvelope<T = unknown> {
  readonly id: string;
  readonly type: string;
  readonly timestamp: number;
  readonly payload: T;
  readonly correlationId: string | null;
}

export interface MessageCreateOptions {
  readonly id?: string;
  readonly timestamp?: number;
  readonly correlationId?: string | null;
}

export class MessageProtocol {
  private static nextId = 0;

  static create<T>(type: string, payload: T, options: MessageCreateOptions = {}): MessageEnvelope<T> {
    return {
      id: options.id ?? MessageProtocol.createId(),
      type,
      timestamp: options.timestamp ?? Date.now(),
      payload,
      correlationId: options.correlationId ?? null,
    };
  }

  static encode(message: MessageEnvelope): string {
    return JSON.stringify(message);
  }

  static decode(rawMessage: string): MessageEnvelope {
    const parsed = JSON.parse(rawMessage) as unknown;
    if (!MessageProtocol.validate(parsed)) {
      throw new Error("Invalid message payload.");
    }
    return parsed;
  }

  static validate(value: unknown): value is MessageEnvelope {
    if (!value || typeof value !== "object") {
      return false;
    }
    const record = value as Record<string, unknown>;
    return typeof record.id === "string"
      && typeof record.type === "string"
      && typeof record.timestamp === "number"
      && "payload" in record
      && (record.correlationId === null || typeof record.correlationId === "string");
  }

  static acknowledge(message: MessageEnvelope, payload: unknown = { ok: true }): MessageEnvelope {
    return MessageProtocol.create(`${message.type}:ack`, payload, {
      correlationId: message.id,
    });
  }

  private static createId(): string {
    MessageProtocol.nextId += 1;
    return `message-${MessageProtocol.nextId}`;
  }
}

export interface RetryPolicyOptions {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly jitterFactor?: number;
  readonly random?: () => number;
  readonly sleep?: (delayMs: number) => Promise<void>;
  readonly shouldRetry?: (error: unknown, attempt: number) => boolean;
  readonly retryAfterMs?: (error: unknown) => number | null;
}

export class RetryPolicy {
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitterFactor: number;
  private readonly random: () => number;
  private readonly sleep: (delayMs: number) => Promise<void>;
  private readonly shouldRetry: (error: unknown, attempt: number) => boolean;
  private readonly retryAfterMs: (error: unknown) => number | null;

  constructor(options: RetryPolicyOptions = {}) {
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    this.baseDelayMs = Math.max(0, options.baseDelayMs ?? 100);
    this.maxDelayMs = Math.max(this.baseDelayMs, options.maxDelayMs ?? 5_000);
    this.jitterFactor = Math.max(0, options.jitterFactor ?? 0);
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? defaultSleep;
    this.shouldRetry = options.shouldRetry ?? (() => true);
    this.retryAfterMs = options.retryAfterMs ?? (() => null);
  }

  getDelay(attempt: number): number {
    const baseDelay = Math.min(this.baseDelayMs * (2 ** Math.max(0, attempt - 1)), this.maxDelayMs);
    if (this.jitterFactor === 0) {
      return baseDelay;
    }
    const jitter = baseDelay * this.jitterFactor * this.random();
    return Math.min(this.maxDelayMs, Math.round(baseDelay + jitter));
  }

  async execute<T>(operation: (attempt: number) => Promise<T>): Promise<T> {
    let attempt = 1;
    while (true) {
      try {
        return await operation(attempt);
      } catch (error) {
        if (attempt >= this.maxAttempts || !this.shouldRetry(error, attempt)) {
          throw error;
        }
        await this.sleep(this.retryAfterMs(error) ?? this.getDelay(attempt));
        attempt += 1;
      }
    }
  }
}

export class OfflineQueue<T> {
  private readonly items: T[] = [];

  get size(): number {
    return this.items.length;
  }

  enqueue(item: T): number {
    this.items.push(item);
    return this.items.length;
  }

  snapshot(): T[] {
    return [...this.items];
  }

  async flush(processor: (item: T) => Promise<void>): Promise<T[]> {
    const processed: T[] = [];
    while (this.items.length > 0) {
      const nextItem = this.items[0];
      try {
        await processor(nextItem);
        processed.push(nextItem);
        this.items.shift();
      } catch (error) {
        throw error;
      }
    }
    return processed;
  }
}

export interface FetchHeadersLike {
  get?(name: string): string | null;
  [key: string]: unknown;
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly headers?: FetchHeadersLike;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

export interface FetchLike {
  (url: string, init?: RequestInit): Promise<FetchResponseLike>;
}

export interface APIClientOptions {
  readonly serviceName?: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly retryPolicy?: RetryPolicy;
  readonly defaultHeaders?: Record<string, string>;
  readonly timeoutMs?: number;
}

export interface RequestOptions {
  readonly retry?: boolean;
  readonly headers?: Record<string, string>;
  readonly timeoutMs?: number;
}

export interface ExternalServiceAdapter {
  readonly serviceName: string;
  readonly status: ConnectionStatus;
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body: unknown, options?: RequestOptions): Promise<T>;
  request<T>(path: string, init?: RequestInit, options?: RequestOptions): Promise<T>;
}

export interface ExternalServiceErrorOptions {
  readonly serviceName: string;
  readonly method: string;
  readonly url: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly responseBody?: unknown;
  readonly retryAfterMs?: number | null;
  readonly cause?: unknown;
}

export class ExternalServiceError extends Error {
  readonly serviceName: string;
  readonly method: string;
  readonly url: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly responseBody?: unknown;
  readonly retryAfterMs: number | null;
  readonly cause?: unknown;

  constructor(message: string, options: ExternalServiceErrorOptions) {
    super(message);
    this.name = "ExternalServiceError";
    this.serviceName = options.serviceName;
    this.method = options.method;
    this.url = options.url;
    this.status = options.status;
    this.retryable = options.retryable;
    this.responseBody = options.responseBody;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.cause = options.cause;
  }
}

export class HttpError extends ExternalServiceError {
  constructor(status: number, message: string, options: Omit<ExternalServiceErrorOptions, "status">) {
    super(message, { ...options, status });
    this.name = "HttpError";
  }
}

export class APIClient implements ExternalServiceAdapter {
  readonly serviceName: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly retryPolicy: RetryPolicy;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeoutMs: number | null;
  private connectionStatus = ConnectionStatus.Offline;

  constructor(options: APIClientOptions = {}) {
    this.serviceName = options.serviceName ?? "external-service";
    this.baseUrl = options.baseUrl ?? "";
    this.fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
    this.retryPolicy = options.retryPolicy ?? new RetryPolicy({
      shouldRetry: (error) => isRetryableExternalCall(error),
      retryAfterMs: (error) => error instanceof ExternalServiceError ? error.retryAfterMs : null,
    });
    this.defaultHeaders = { ...(options.defaultHeaders ?? {}) };
    this.timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : null;
  }

  get status(): ConnectionStatus {
    return this.connectionStatus;
  }

  async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, { method: "GET" }, { retry: true, ...options });
  }

  async post<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
      },
    }, options);
  }

  async request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
    const runRequest = async (): Promise<T> => {
      const method = init.method ?? "GET";
      const url = this.resolveUrl(path, method);
      const timeout = createTimeout(options.timeoutMs ?? this.timeoutMs);
      let response: FetchResponseLike;
      try {
        response = await this.fetchImpl(url, {
          ...init,
          signal: init.signal ?? timeout.signal,
          headers: {
            ...this.defaultHeaders,
            ...normalizeHeaders(init.headers),
            ...(options.headers ?? {}),
          },
        });
      } catch (error) {
        this.connectionStatus = ConnectionStatus.Offline;
        throw new ExternalServiceError(
          timeout.signal?.aborted ? `Request to ${this.serviceName} timed out.` : `Request to ${this.serviceName} failed.`,
          {
            serviceName: this.serviceName,
            method,
            url,
            retryable: true,
            cause: error,
          },
        );
      } finally {
        timeout.clear();
      }

      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        this.connectionStatus = retryable ? ConnectionStatus.Reconnecting : ConnectionStatus.Offline;
        throw new HttpError(response.status, `Request to ${this.serviceName} failed with status ${response.status}.`, {
          serviceName: this.serviceName,
          method,
          url,
          retryable,
          responseBody: await parseErrorBody(response),
          retryAfterMs: parseRetryAfter(getHeader(response.headers, "retry-after")),
        });
      }

      this.connectionStatus = ConnectionStatus.Online;
      return parseResponse<T>(response);
    };

    if (options.retry === false) {
      return runRequest();
    }

    return this.retryPolicy.execute(() => runRequest());
  }

  private resolveUrl(path: string, method: string): string {
    const baseUrl = parseAbsoluteHttpUrl(this.baseUrl);
    const absoluteUrl = parseAbsoluteHttpUrl(path, baseUrl);
    if (absoluteUrl) {
      if (baseUrl !== null && absoluteUrl.origin === baseUrl.origin) {
        return absoluteUrl.href;
      }
      throw new ExternalServiceError(
        `Absolute URL for ${this.serviceName} must match the configured base URL origin.`,
        {
          serviceName: this.serviceName,
          method,
          url: path,
          retryable: false,
        },
      );
    }
    if (!this.baseUrl) {
      return path;
    }
    const normalizedBase = this.baseUrl.endsWith("/") ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
  }
}

export function createHttpServiceAdapter(options: APIClientOptions = {}): ExternalServiceAdapter {
  return new APIClient(options);
}

export interface WebSocketLike {
  readonly readyState: number;
  onopen?: (() => void) | null;
  onmessage?: ((event: { data: string }) => void) | null;
  onclose?: (() => void) | null;
  onerror?: ((error: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface WebSocketClientOptions {
  readonly url: string;
  readonly socketFactory: (url: string) => WebSocketLike;
  readonly retryPolicy?: RetryPolicy;
}

export class WebSocketClient {
  private socket: WebSocketLike | null = null;
  private readonly listeners = new Set<(message: MessageEnvelope) => void>();
  private readonly outboundQueue = new OfflineQueue<MessageEnvelope>();
  private readonly retryPolicy: RetryPolicy;
  private connectionStatus = ConnectionStatus.Offline;
  private reconnectAttempt = 0;
  private disconnectedManually = false;

  constructor(private readonly options: WebSocketClientOptions) {
    this.retryPolicy = options.retryPolicy ?? new RetryPolicy();
  }

  get status(): ConnectionStatus {
    return this.connectionStatus;
  }

  get queuedMessages(): MessageEnvelope[] {
    return this.outboundQueue.snapshot();
  }

  subscribe(listener: (message: MessageEnvelope) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  connect(): void {
    this.disconnectedManually = false;
    this.socket = this.options.socketFactory(this.options.url);
    this.attachSocket(this.socket);
    if (this.socket.readyState === 1) {
      this.handleOpen();
    } else {
      this.connectionStatus = this.reconnectAttempt > 0 ? ConnectionStatus.Reconnecting : ConnectionStatus.Offline;
    }
  }

  disconnect(code?: number, reason?: string): void {
    this.disconnectedManually = true;
    this.connectionStatus = ConnectionStatus.Offline;
    this.socket?.close(code, reason);
  }

  send<T>(type: string, payload: T, options: MessageCreateOptions = {}): MessageEnvelope<T> {
    const message = MessageProtocol.create(type, payload, options);
    if (this.connectionStatus === ConnectionStatus.Online && this.socket?.readyState === 1) {
      this.socket.send(MessageProtocol.encode(message));
    } else {
      this.outboundQueue.enqueue(message);
    }
    return message;
  }

  nextReconnectDelay(): number {
    return this.retryPolicy.getDelay(Math.max(1, this.reconnectAttempt + 1));
  }

  reconnect(): void {
    this.reconnectAttempt += 1;
    this.connectionStatus = ConnectionStatus.Reconnecting;
    this.connect();
  }

  private attachSocket(socket: WebSocketLike): void {
    socket.onopen = () => this.handleOpen();
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onclose = () => this.handleClose();
    socket.onerror = () => {
      this.connectionStatus = ConnectionStatus.Offline;
    };
  }

  private handleOpen(): void {
    this.connectionStatus = ConnectionStatus.Online;
    this.reconnectAttempt = 0;
    void this.outboundQueue.flush(async (message) => {
      this.socket?.send(MessageProtocol.encode(message));
    }).catch((error: unknown) => {
      console.warn("Failed to flush outbound queue after reconnect.", error);
    });
  }

  private handleClose(): void {
    this.connectionStatus = this.disconnectedManually ? ConnectionStatus.Offline : ConnectionStatus.Reconnecting;
  }

  private handleMessage(rawMessage: string): void {
    const message = MessageProtocol.decode(rawMessage);
    for (const listener of this.listeners) {
      listener(message);
    }
  }
}

async function parseResponse<T>(response: FetchResponseLike): Promise<T> {
  const contentType = getHeader(response.headers, "content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await response.json?.() as T;
  }
  return await response.text?.() as T;
}

async function parseErrorBody(response: FetchResponseLike): Promise<unknown> {
  try {
    return await parseResponse<unknown>(response);
  } catch (error) {
    return {
      unreadable: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function getHeader(headers: FetchHeadersLike | undefined, name: string): string | null {
  if (!headers) {
    return null;
  }
  if (typeof headers.get === "function") {
    return headers.get(name);
  }
  const normalizedName = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === normalizedName);
  return entry ? String(entry[1]) : null;
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, String(value)]));
  }
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]));
}

function parseAbsoluteHttpUrl(value: string, baseUrl: URL | null = null): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    if (!startsWithNetworkPath(value)) {
      return null;
    }
    try {
      const url = new URL(value, baseUrl ?? "https://invalid.local");
      return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch {
      return null;
    }
  }
}

function startsWithNetworkPath(value: string): boolean {
  const normalizedValue = value
    .replace(/[\u0009\u000A\u000D]/g, "")
    .replace(/^[\u0000-\u0020]+/, "");
  return /^[/\\]{2}/.test(normalizedValue);
}

function isRetryableExternalCall(error: unknown): boolean {
  if (error instanceof ExternalServiceError) {
    return error.retryable;
  }
  return true;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000);
  }
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) {
    return null;
  }
  return Math.max(0, retryAt - Date.now());
}

function createTimeout(timeoutMs: number | null): { readonly signal?: AbortSignal; readonly clear: () => void } {
  if (!timeoutMs) {
    return { clear: () => undefined };
  }
  const controller = new AbortController();
  const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

async function defaultSleep(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
