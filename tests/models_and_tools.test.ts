import { describe, expect, it } from "vitest";
import {
  parseAccountInfo,
  parseCandles,
  parseSymbolInfo,
  parseSymbols,
  parseTick,
  parseTimestamp,
} from "../src/tools.js";

describe("Tools & Models Parsers (TypeScript)", () => {
  it("parses timestamps with Z and ISO offsets", () => {
    const d1 = parseTimestamp("2026-10-19T14:30:00Z");
    expect(d1.getUTCHours()).toBe(14);
    expect(d1.getUTCMinutes()).toBe(30);

    const d2 = parseTimestamp("2026-10-19T09:30:00-05:00");
    expect(d2.getTime()).toBe(d1.getTime());

    const d3 = parseTimestamp(1700000000);
    expect(d3.getTime()).toBe(1700000000000);
  });

  it("parses account info correctly", () => {
    const raw = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            account: {
              login: 1234567,
              balance: 10000.5,
              equity: 10250.0,
              margin: 500.0,
              margin_free: 9750.0,
              profit: 249.5,
              leverage: 100,
              currency: "USD",
              server: "Demo-Server",
            },
          }),
        },
      ],
    };

    const acc = parseAccountInfo(raw);
    expect(acc.login).toBe(1234567);
    expect(acc.balance).toBe(10000.5);
    expect(acc.equity).toBe(10250.0);
    expect(acc.margin).toBe(500.0);
    expect(acc.freeMargin).toBe(9750.0);
    expect(acc.leverage).toBe(100);
    expect(acc.currency).toBe("USD");
  });

  it("parses symbol info with extended fields (stops_level, spread, lotes)", () => {
    const raw = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            symbol: "EURUSD",
            digits: 5,
            point: 0.00001,
            spread: 12,
            stops_level: 25,
            freeze_level: 10,
            volume_min: 0.01,
            volume_max: 100.0,
            volume_step: 0.01,
            contract_size: 100000,
            currency_base: "EUR",
          }),
        },
      ],
    };

    const sym = parseSymbolInfo(raw, "EURUSD");
    expect(sym.name).toBe("EURUSD");
    expect(sym.digits).toBe(5);
    expect(sym.point).toBe(0.00001);
    expect(sym.spread).toBe(12);
    expect(sym.stopsLevel).toBe(25);
    expect(sym.freezeLevel).toBe(10);
    expect(sym.volumeMin).toBe(0.01);
    expect(sym.contractSize).toBe(100000);
    expect(sym.currencyBase).toBe("EUR");
    expect(sym.raw).toBeDefined();
  });

  it("parses tick and validates spreads", () => {
    const raw = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            symbols: [
              {
                symbol: "EURUSD",
                bid: 1.085,
                ask: 1.0852,
                spread: 0.0002,
                time: "2026-10-19T14:30:00Z",
              },
            ],
          }),
        },
      ],
    };

    const tick = parseTick("EURUSD", raw);
    expect(tick.symbol).toBe("EURUSD");
    expect(tick.bid).toBe(1.085);
    expect(tick.ask).toBe(1.0852);
    expect(tick.spread).toBe(0.0002);
  });

  it("parses candles history correctly", () => {
    const raw = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            history: [
              {
                time: "2026-10-19T14:00:00Z",
                open: 1.08,
                high: 1.082,
                low: 1.079,
                close: 1.081,
                tick_volume: 500,
              },
            ],
          }),
        },
      ],
    };

    const candles = parseCandles(raw);
    expect(candles.length).toBe(1);
    expect(candles[0].open).toBe(1.08);
    expect(candles[0].high).toBe(1.082);
    expect(candles[0].volume).toBe(500);
  });
});
