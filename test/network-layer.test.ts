import { describe, expect, it, vi } from "vitest";
import {
  APIClient,
  ConnectionStatus,
  MessageProtocol,
  OfflineQueue,
  RetryPolicy,
  WebSocketClient,
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
    const fetchImpl: FetchLike = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          ok: false,
          status: 503,
          headers: { get: () => "application/json" },
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
      baseUrl: "https://alice.example.test/api",
      fetchImpl,
      retryPolicy: new RetryPolicy({
        maxAttempts: 2,
        sleep: async () => undefined,
        shouldRetry: () => true,
      }),
    });

    const response = await client.get<{ projectId: string; revision: number }>("/projects/starter");

    expect(response).toEqual({ projectId: "starter", revision: 2 });
    expect(client.status).toBe(ConnectionStatus.Online);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
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
