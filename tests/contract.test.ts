import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MT5Client, MT5Config, OrderStatus, Timeframe } from "../src/index.js";

describe("Contract Integration Fixtures (TypeScript)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executes the full MT5 MCP contract workflow end-to-end", async () => {
    const client = new MT5Client(
      new MT5Config({
        url: "http://127.0.0.1:22346/mcp",
        apiKey: "demo-key",
        tradingEnabled: true,
      })
    );

    const mockFetch = vi.fn().mockImplementation((url, init) => {
      const body = JSON.parse(init.body);
      const reqId = body.id;

      if (body.method === "initialize") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: reqId,
              result: {
                protocolVersion: "2024-11-05",
                capabilities: { tools: {} },
                serverInfo: { name: "mcp-mt5", version: "1.0.0" },
              },
            }),
            {
              status: 200,
              headers: { "Mcp-Session-Id": "sess-contract-ts", "Content-Type": "application/json" },
            }
          )
        );
      }

      if (body.method === "notifications/initialized") {
        return Promise.resolve(new Response("{}", { status: 200 }));
      }

      if (body.method === "tools/list") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: reqId,
              result: {
                tools: [
                  { name: "get_trading_account_info" },
                  { name: "get_marketwatch_symbols" },
                  { name: "get_chart_history" },
                  { name: "open_market_order" },
                ],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (body.method === "tools/call") {
        const toolName = body.params.name;
        if (toolName === "get_trading_account_info") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: reqId,
                result: {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        account: { login: 999123, balance: 25000, leverage: 200, currency: "USD" },
                      }),
                    },
                  ],
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }

        if (toolName === "get_marketwatch_symbols") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: reqId,
                result: {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        symbols: [
                          {
                            symbol: "EURUSD",
                            bid: 1.0851,
                            ask: 1.0853,
                            spread: 0.0002,
                            time: "2026-10-19T14:30:00Z",
                          },
                        ],
                      }),
                    },
                  ],
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }

        if (toolName === "get_chart_history") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: reqId,
                result: {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        history: [
                          {
                            time: "2026-10-19T14:29:00Z",
                            open: 1.085,
                            high: 1.0855,
                            low: 1.0848,
                            close: 1.0852,
                            volume: 100,
                          },
                        ],
                      }),
                    },
                  ],
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }

        if (toolName === "open_market_order") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: reqId,
                result: {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        order: {
                          ticket: 778899,
                          status: "filled",
                          volume: 0.1,
                          price: 1.0853,
                        },
                      }),
                    },
                  ],
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
      }

      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    globalThis.fetch = mockFetch;

    // 1. Initialize
    await client.initialize();
    expect(client.sessionId).toBe("sess-contract-ts");

    // 2. List tools
    const tools = await client.listTools();
    expect(tools.length).toBe(4);

    // 3. Account
    const acc = await client.getAccountInfo();
    expect(acc.login).toBe(999123);
    expect(acc.balance).toBe(25000);

    // 4. Tick
    const tick = await client.getTick("EURUSD");
    expect(tick.symbol).toBe("EURUSD");
    expect(tick.bid).toBe(1.0851);
    expect(tick.ask).toBe(1.0853);

    // 5. Candles
    const candles = await client.getCandles("EURUSD", Timeframe.M1, { limit: 1 });
    expect(candles.length).toBe(1);
    expect(candles[0].close).toBe(1.0852);

    // 6. Order
    const orderRes = await client.sendMarketOrder({
      symbol: "EURUSD",
      action: "BUY",
      volume: 0.1,
    });
    expect(orderRes.status).toBe(OrderStatus.FILLED);
    expect(orderRes.orderId).toBe("778899");
    expect(orderRes.price).toBe(1.0853);
  });
});
