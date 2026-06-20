import { describe, expect, it, vi } from "vitest";
import {
  APIClient,
  ConnectionStatus,
  ExternalServiceError,
  HttpError,
  MessageProtocol,
  OfflineQueue,
  RetryPolicy,
  WebSocketClient,
  createHttpServiceAdapter,
  type ExternalServiceAdapter,
  type FetchLike,
  type WebSocketLike,
} from "../src/network-layer.js";

class FakeSocket implements WebSocketLike {
  readonly sent: string[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  closeCode: number | undefined;
  closeReason: string | undefined;

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  fail(error: unknown): void {
    this.onerror?.(error);
  }
}

describe("network-layer", () => {
  it("creates, validates, encodes, decodes, and acknowledges messages", () => {
    const message = MessageProtocol.create("collaboration:update", { selection: [1, 4] }, {
      id: "message-1",
      timestamp: 42,
      correlationId: "parent-1",
    });
    const encoded = MessageProtocol.encode(message);
    const decoded = MessageProtocol.decode(encoded);
    const acknowledgement = MessageProtocol.acknowledge(message, { ok: true });

    expect(MessageProtocol.validate(decoded)).toBe(true);
    expect(decoded).toEqual(message);
    expect(acknowledgement.type).toBe("collaboration:update:ack");
    expect(acknowledgement.correlationId).toBe("message-1");
    expect(() => MessageProtocol.decode('{"type":"broken"}')).toThrow("Invalid message payload");
  });

  it("applies exponential retry backoff with optional jitter", async () => {
    const delays: number[] = [];
    const policy = new RetryPolicy({
      maxAttempts: 4,
      baseDelayMs: 50,
      maxDelayMs: 180,
      jitterFactor: 0.2,
      random: () => 0.5,
      sleep: async (delay) => {
        delays.push(delay);
      },
    });
    let attempts = 0;

    const result = await policy.execute(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error(`attempt-${attempts}`);
      }
      return "connected";
    });

    expect(result).toBe("connected");
    expect(policy.getDelay(1)).toBe(55);
    expect(policy.getDelay(2)).toBe(110);
    expect(policy.getDelay(4)).toBe(180);
    expect(delays).toEqual([55, 110]);
  });

  it("retries API requests and tracks connection status", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const fetchImpl: FetchLike = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          ok: false,
          status: 503,
          headers: {
            get: (name: string) => name.toLowerCase() === "retry-after" ? "2" : "application/json",
          },
          json: async () => ({ error: "temporary" }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ projectId: "starter", revision: attempts }),
      };
    });
    const client = new APIClient({
      serviceName: "project-api",
      baseUrl: "https://alice.example.test/api",
      fetchImpl,
      retryPolicy: new RetryPolicy({
        maxAttempts: 2,
        sleep: async (delayMs) => {
          delays.push(delayMs);
        },
        shouldRetry: () => true,
        retryAfterMs: (error) => error instanceof ExternalServiceError ? error.retryAfterMs : null,
      }),
    });

    const response = await client.get<{ projectId: string; revision: number }>("/projects/starter");

    expect(response).toEqual({ projectId: "starter", revision: 2 });
    expect(client.status).toBe(ConnectionStatus.Online);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([2_000]);
  });

  it("rejects cross-origin absolute API URLs before sending default headers", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ ok: true }),
    }));
    const client = new APIClient({
      serviceName: "project-api",
      baseUrl: "https://alice.example.test/api",
      defaultHeaders: {
        authorization: "Bearer internal-token",
      },
      fetchImpl,
    });

    await expect(client.get("https://attacker.example.test/collect")).rejects.toMatchObject({
      name: "ExternalServiceError",
      serviceName: "project-api",
      method: "GET",
      url: "https://attacker.example.test/collect",
      retryable: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects disguised absolute API URLs when baseUrl is not configured", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ ok: true }),
    }));
    const client = new APIClient({
      serviceName: "project-api",
      defaultHeaders: {
        authorization: "Bearer internal-token",
      },
      fetchImpl,
    });

    for (const path of [
      " https://attacker.example.test/collect",
      "//attacker.example.test/collect",
      "\\\\attacker.example.test/collect",
      "/\\attacker.example.test/collect",
      "/\n/attacker.example.test/collect",
      "/\t/attacker.example.test/collect",
      "\u0000//attacker.example.test/collect",
    ]) {
      await expect(client.get(path)).rejects.toMatchObject({
        name: "ExternalServiceError",
        serviceName: "project-api",
        method: "GET",
        url: path,
        retryable: false,
      });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("allows same-origin absolute API URLs and preserves default header behavior", async () => {
    const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
    const fetchImpl: FetchLike = vi.fn(async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ ok: true }),
      };
    });
    const client = new APIClient({
      serviceName: "project-api",
      baseUrl: "https://alice.example.test/api",
      defaultHeaders: {
        authorization: "Bearer internal-token",
      },
      fetchImpl,
    });

    const response = await client.get<{ ok: boolean }>("https://alice.example.test/status", {
      headers: {
        "x-request-id": "request-1",
      },
    });

    expect(response).toEqual({ ok: true });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://alice.example.test/status");
    expect(requests[0].init?.headers).toMatchObject({
      authorization: "Bearer internal-token",
      "x-request-id": "request-1",
    });
  });

  it("surfaces structured HTTP errors for external service calls", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => ({
      ok: false,
      status: 429,
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === "content-type") {
            return "application/json";
          }
          if (name.toLowerCase() === "retry-after") {
            return "1";
          }
          return null;
        },
      },
      json: async () => ({ error: "quota exceeded" }),
    }));
    const client = new APIClient({
      serviceName: "gallery-api",
      baseUrl: "https://alice.example.test/api",
      fetchImpl,
      retryPolicy: new RetryPolicy({ maxAttempts: 1 }),
    });

    await expect(client.get("/models")).rejects.toMatchObject({
      name: "HttpError",
      serviceName: "gallery-api",
      method: "GET",
      url: "https://alice.example.test/api/models",
      status: 429,
      retryable: true,
      retryAfterMs: 1_000,
      responseBody: { error: "quota exceeded" },
    });
    expect(client.status).toBe(ConnectionStatus.Reconnecting);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-retryable HTTP errors by default", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => ({
      ok: false,
      status: 404,
      headers: { get: () => "text/plain" },
      text: async () => "missing",
    }));
    const client = new APIClient({
      serviceName: "asset-api",
      baseUrl: "https://alice.example.test/api",
      fetchImpl,
    });

    await expect(client.get("/assets/missing")).rejects.toBeInstanceOf(HttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(client.status).toBe(ConnectionStatus.Offline);
  });

  it("wraps transport failures through the service adapter contract", async () => {
    const transportError = new Error("dns failure");
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw transportError;
    });
    const adapter: ExternalServiceAdapter = createHttpServiceAdapter({
      serviceName: "asset-catalog",
      baseUrl: "https://assets.example.test",
      fetchImpl,
      retryPolicy: new RetryPolicy({ maxAttempts: 1 }),
    });

    await expect(adapter.get("/models")).rejects.toMatchObject({
      name: "ExternalServiceError",
      serviceName: "asset-catalog",
      method: "GET",
      url: "https://assets.example.test/models",
      retryable: true,
      cause: transportError,
    });
    expect(adapter.status).toBe(ConnectionStatus.Offline);
  });

  it("times out stalled external service calls", async () => {
    const fetchImpl: FetchLike = vi.fn((_, init) => new Promise<never>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new Error("aborted"));
      });
    }));
    const adapter = createHttpServiceAdapter({
      serviceName: "slow-service",
      baseUrl: "https://slow.example.test",
      fetchImpl,
      timeoutMs: 1,
      retryPolicy: new RetryPolicy({ maxAttempts: 1 }),
    });

    await expect(adapter.get("/status")).rejects.toMatchObject({
      name: "ExternalServiceError",
      serviceName: "slow-service",
      message: "Request to slow-service timed out.",
      retryable: true,
    });
  });

  it("keeps offline queue entries when synchronization fails", async () => {
    const queue = new OfflineQueue<number>();
    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);
    const processed: number[] = [];

    await expect(queue.flush(async (item) => {
      processed.push(item);
      if (item === 2) {
        throw new Error("offline");
      }
    })).rejects.toThrow("offline");

    expect(processed).toEqual([1, 2]);
    expect(queue.snapshot()).toEqual([2, 3]);
  });

  it("queues websocket messages while offline, flushes on connect, and streams decoded events", () => {
    const sockets: FakeSocket[] = [];
    const client = new WebSocketClient({
      url: "wss://alice.example.test/collaboration",
      socketFactory: (url) => {
        expect(url).toContain("collaboration");
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      retryPolicy: new RetryPolicy({ baseDelayMs: 25, maxDelayMs: 100 }),
    });
    const receivedTypes: string[] = [];
    client.subscribe((message) => {
      receivedTypes.push(message.type);
    });

    const queued = client.send("presence:update", { selected: "hero" }, { id: "queued-1", timestamp: 1 });
    client.connect();
    sockets[0].open();
    sockets[0].receive({ id: "incoming-1", type: "state:patch", timestamp: 2, payload: { op: "set" }, correlationId: null });
    sockets[0].close();
    expect(client.status).toBe(ConnectionStatus.Reconnecting);
    expect(client.nextReconnectDelay()).toBe(25);

    client.reconnect();
    sockets[1].open();
    const liveMessage = client.send("presence:update", { selected: "camera" }, { id: "live-1", timestamp: 3 });
    sockets[1].fail(new Error("network"));
    client.disconnect(1000, "done");

    expect(queued.id).toBe("queued-1");
    expect(liveMessage.id).toBe("live-1");
    expect(sockets[0].sent).toEqual([
      JSON.stringify({ id: "queued-1", type: "presence:update", timestamp: 1, payload: { selected: "hero" }, correlationId: null }),
    ]);
    expect(sockets[1].sent).toContain(
      JSON.stringify({ id: "live-1", type: "presence:update", timestamp: 3, payload: { selected: "camera" }, correlationId: null }),
    );
    expect(receivedTypes).toEqual(["state:patch"]);
    expect(client.status).toBe(ConnectionStatus.Offline);
    expect(sockets[1].closeCode).toBe(1000);
    expect(sockets[1].closeReason).toBe("done");
  });

  it("warns when queued websocket messages fail to flush on connect", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      class ThrowingSocket extends FakeSocket {
        send(_data: string): void {
          throw new Error("flush failed");
        }
      }

      const sockets: ThrowingSocket[] = [];
      const client = new WebSocketClient({
        url: "wss://alice.example.test/collaboration",
        socketFactory: () => {
          const socket = new ThrowingSocket();
          sockets.push(socket);
          return socket;
        },
        retryPolicy: new RetryPolicy({ baseDelayMs: 25, maxDelayMs: 100 }),
      });

      client.send("presence:update", { selected: "hero" }, { id: "queued-1", timestamp: 1 });
      client.connect();
      sockets[0].open();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(warn).toHaveBeenCalledWith(
        "Failed to flush outbound queue after reconnect.",
        expect.any(Error),
      );
    } finally {
      warn.mockRestore();
    }
  });
});
