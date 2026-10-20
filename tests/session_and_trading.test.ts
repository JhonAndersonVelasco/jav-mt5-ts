import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MT5Client } from "../src/client.js";
import { MT5Config } from "../src/config.js";
import {
  AmbiguousExecutionError,
  AuthenticationError,
  OrderStatus,
  SessionError,
  TimeoutError,
  TradingDisabledError,
} from "../src/index.js";

describe("MT5Client Session & Trading (TypeScript)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("completes initialize handshake and captures session id", async () => {
    const client = new MT5Client(new MT5Config({ url: "http://127.0.0.1:22346/mcp" }));

    const mockFetch = vi.fn().mockImplementation((url, init) => {
      const body = JSON.parse(init.body);
      if (body.method === "initialize") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id,
              result: { protocolVersion: "2024-11-05" },
            }),
            {
              status: 200,
              headers: { "Mcp-Session-Id": "ts-sess-123", "Content-Type": "application/json" },
            }
          )
        );
      }
      // notification
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    globalThis.fetch = mockFetch;

    await client.initialize();
    expect(client.sessionId).toBe("ts-sess-123");
    expect(client.isInitialized).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("blocks trading operations when tradingEnabled is false", async () => {
    const client = new MT5Client(new MT5Config({ tradingEnabled: false }));

    await expect(
      client.sendMarketOrder({
        symbol: "EURUSD",
        action: "BUY",
        volume: 0.1,
      })
    ).rejects.toThrow(TradingDisabledError);

    await expect(
      client.closePosition({
        ticket: 12345,
      })
    ).rejects.toThrow(TradingDisabledError);
  });

  it("handles trading execution timeout as AmbiguousExecutionError", async () => {
    const client = new MT5Client(new MT5Config({ tradingEnabled: true }));
    (client as any)._isInitialized = true;
    (client as any)._sessionId = "sess-1";

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("TimeoutError"));

    await expect(
      client.sendMarketOrder({
        symbol: "EURUSD",
        action: "BUY",
        volume: 0.5,
      })
    ).rejects.toThrow(AmbiguousExecutionError);
  });

  it("handles close idempotently and rejects subsequent calls", async () => {
    const client = new MT5Client();
    (client as any)._isInitialized = true;
    client.close();
    expect(client.isClosed).toBe(true);

    client.close(); // idempotent
    await expect(client.callTool("test", {})).rejects.toThrow(SessionError);
  });
});
