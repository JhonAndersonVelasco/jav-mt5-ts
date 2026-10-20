import { ResponseValidationError } from "./errors.js";
import {
  AccountInfo,
  Candle,
  OrderStatus,
  OrderResult,
  SymbolInfo,
  Tick,
} from "./models.js";

export function parseTimestamp(value: string | number): Date {
  if (typeof value === "number") {
    // If timestamp is in seconds (10 digits), convert to ms
    return new Date(value < 1e11 ? value * 1000 : value);
  }

  if (typeof value !== "string") {
    throw new ResponseValidationError(`Expected timestamp string or number, got: ${typeof value}`);
  }

  let cleanStr = value.trim();
  if (cleanStr.endsWith("Z")) {
    cleanStr = `${cleanStr.slice(0, -1)}+00:00`;
  }

  const dt = new Date(cleanStr);
  if (isNaN(dt.getTime())) {
    // Fallback for space separated formats
    const fallback = new Date(cleanStr.replace(" ", "T") + "Z");
    if (!isNaN(fallback.getTime())) {
      return fallback;
    }
    throw new ResponseValidationError(`Unable to parse timestamp: '${value}'`);
  }

  return dt;
}

export function extractContentData(mcpResponse: unknown): unknown {
  if (!mcpResponse || typeof mcpResponse !== "object") {
    return mcpResponse;
  }

  const obj = mcpResponse as Record<string, unknown>;

  if ("structuredContent" in obj) {
    return obj.structuredContent;
  }

  if (Array.isArray(obj.content) && obj.content.length > 0) {
    const first = obj.content[0];
    if (first && typeof first === "object" && "text" in first && typeof first.text === "string") {
      try {
        return JSON.parse(first.text);
      } catch {
        return first.text;
      }
    }
  }

  return mcpResponse;
}

export function parseAccountInfo(rawResponse: unknown): AccountInfo {
  const data = extractContentData(rawResponse);
  let acc: Record<string, unknown>;

  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    acc = (typeof d.account === "object" && d.account !== null ? d.account : d) as Record<string, unknown>;
  } else {
    throw new ResponseValidationError(`Unexpected account info structure: ${JSON.stringify(data)}`);
  }

  try {
    return {
      login: acc.login !== undefined ? Number(acc.login) : undefined,
      balance: Number(acc.balance ?? 0),
      equity: Number(acc.equity ?? acc.balance ?? 0),
      margin: Number(acc.margin ?? 0),
      freeMargin: Number(acc.margin_free ?? acc.free_margin ?? 0),
      profit: Number(acc.profit ?? 0),
      leverage: Number(acc.leverage ?? 0),
      currency: String(acc.currency ?? "USD"),
      server: acc.server ? String(acc.server) : acc.company ? String(acc.company) : undefined,
    };
  } catch (err: unknown) {
    throw new ResponseValidationError(`Failed to parse AccountInfo: ${err}`);
  }
}

function dictToSymbolInfo(item: Record<string, unknown>): SymbolInfo {
  const name = String(item.symbol ?? item.name ?? "").trim().toUpperCase();
  const digits = Number(item.digits ?? 5);

  return {
    name,
    path: item.path ? String(item.path) : undefined,
    description: item.description ? String(item.description) : undefined,
    digits,
    point: item.point !== undefined ? Number(item.point) : undefined,
    spread: item.spread !== undefined ? Number(item.spread) : undefined,
    stopsLevel: item.stops_level !== undefined ? Number(item.stops_level) : undefined,
    freezeLevel: item.freeze_level !== undefined ? Number(item.freeze_level) : undefined,
    volumeMin: item.volume_min !== undefined ? Number(item.volume_min) : undefined,
    volumeMax: item.volume_max !== undefined ? Number(item.volume_max) : undefined,
    volumeStep: item.volume_step !== undefined ? Number(item.volume_step) : undefined,
    contractSize: item.contract_size !== undefined ? Number(item.contract_size) : undefined,
    tradeMode: item.trade_mode !== undefined ? (item.trade_mode as number | string) : undefined,
    currencyBase: item.currency_base ? String(item.currency_base) : undefined,
    currencyProfit: item.currency_profit ? String(item.currency_profit) : undefined,
    currencyMargin: item.currency_margin ? String(item.currency_margin) : undefined,
    bid: item.bid !== undefined ? Number(item.bid) : undefined,
    ask: item.ask !== undefined ? Number(item.ask) : undefined,
    raw: { ...item },
  };
}

export function parseSymbols(rawResponse: unknown): SymbolInfo[] {
  const data = extractContentData(rawResponse);
  let symbolsRaw: unknown[] = [];

  if (Array.isArray(data)) {
    symbolsRaw = data;
  } else if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.symbols)) {
      symbolsRaw = d.symbols;
    }
  }

  const result: SymbolInfo[] = [];
  for (const item of symbolsRaw) {
    if (item && typeof item === "object") {
      const sym = dictToSymbolInfo(item as Record<string, unknown>);
      if (sym.name) {
        result.push(sym);
      }
    }
  }

  return result;
}

export function parseSymbolInfo(rawResponse: unknown, symbol?: string): SymbolInfo {
  const data = extractContentData(rawResponse);
  let items: unknown[] = [];

  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.symbols)) {
      items = d.symbols;
    } else if (d.symbol || d.name) {
      return dictToSymbolInfo(d);
    } else if (d.properties && typeof d.properties === "object") {
      return dictToSymbolInfo(d.properties as Record<string, unknown>);
    } else {
      items = [d];
    }
  } else {
    throw new ResponseValidationError(`Unexpected symbol info structure: ${JSON.stringify(data)}`);
  }

  const target = symbol ? symbol.trim().toUpperCase() : undefined;
  for (const item of items) {
    if (item && typeof item === "object") {
      const d = item as Record<string, unknown>;
      const name = String(d.symbol ?? d.name ?? "").trim().toUpperCase();
      if (!target || name === target) {
        return dictToSymbolInfo(d);
      }
    }
  }

  if (items.length > 0 && typeof items[0] === "object" && items[0] !== null) {
    return dictToSymbolInfo(items[0] as Record<string, unknown>);
  }

  throw new ResponseValidationError(`Symbol '${symbol}' not found in response`);
}

export function parseTick(symbol: string, rawResponse: unknown): Tick {
  const data = extractContentData(rawResponse);
  let candidates: unknown[] = [];

  if (Array.isArray(data)) {
    candidates = data;
  } else if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.symbols)) {
      candidates = d.symbols;
    } else if (d.symbol === symbol || (d.bid !== undefined && d.ask !== undefined)) {
      candidates = [d];
    }
  }

  const targetSym = symbol.trim().toUpperCase();
  let matched: Record<string, unknown> | null = null;

  for (const item of candidates) {
    if (item && typeof item === "object") {
      const d = item as Record<string, unknown>;
      const name = String(d.symbol ?? d.name ?? "").trim().toUpperCase();
      if (name === targetSym) {
        matched = d;
        break;
      }
    }
  }

  if (!matched && candidates.length === 1 && typeof candidates[0] === "object" && candidates[0] !== null) {
    const single = candidates[0] as Record<string, unknown>;
    const name = String(single.symbol ?? single.name ?? "").trim().toUpperCase();
    if (!name || name === targetSym) {
      matched = single;
    }
  }

  if (!matched) {
    throw new ResponseValidationError(`Symbol '${symbol}' not found in response data`);
  }

  const bid = Number(matched.bid ?? 0);
  const ask = Number(matched.ask ?? 0);

  if (isNaN(bid) || !isFinite(bid) || bid <= 0) {
    throw new ResponseValidationError(`Invalid bid price: ${bid}`);
  }
  if (isNaN(ask) || !isFinite(ask) || ask <= 0) {
    throw new ResponseValidationError(`Invalid ask price: ${ask}`);
  }
  if (ask < bid) {
    throw new ResponseValidationError(`Invalid spread: ask (${ask}) cannot be lower than bid (${bid})`);
  }

  const rawTime = (matched.time ?? new Date().toISOString()) as string | number;
  const time = parseTimestamp(rawTime);

  return {
    symbol,
    bid,
    ask,
    time,
    last: matched.last !== undefined ? Number(matched.last) : undefined,
    volume: matched.volume !== undefined ? Number(matched.volume) : undefined,
    spread: matched.spread !== undefined ? Number(matched.spread) : undefined,
  };
}

export function parseCandles(rawResponse: unknown): Candle[] {
  const data = extractContentData(rawResponse);
  let candlesRaw: unknown[] = [];

  if (Array.isArray(data)) {
    candlesRaw = data;
  } else if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.history)) {
      candlesRaw = d.history;
    } else if (Array.isArray(d.candles)) {
      candlesRaw = d.candles;
    }
  }

  const result: Candle[] = [];
  for (const item of candlesRaw) {
    if (!item || typeof item !== "object") continue;
    const d = item as Record<string, unknown>;

    try {
      const time = parseTimestamp(d.time as string | number);
      const open = Number(d.open);
      const high = Number(d.high);
      const low = Number(d.low);
      const close = Number(d.close);
      const volume = Number(d.tick_volume ?? d.volume ?? 0);

      if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
        continue;
      }

      result.push({ time, open, high, low, close, volume });
    } catch {
      continue;
    }
  }

  return result;
}

export function parseOrderResult(rawResponse: unknown): OrderResult {
  const data = extractContentData(rawResponse);
  if (!data || typeof data !== "object") {
    return {
      status: OrderStatus.UNKNOWN,
      volume: 0,
      comment: `Non-object response: ${JSON.stringify(data)}`,
      rawResponse: { raw: data },
    };
  }

  const d = data as Record<string, unknown>;
  let orderInfo = d;
  if (d.order && typeof d.order === "object") {
    orderInfo = d.order as Record<string, unknown>;
  } else if (d.result && typeof d.result === "object") {
    orderInfo = d.result as Record<string, unknown>;
  }

  const rawStatus = String(
    orderInfo.status ?? orderInfo.retcode_desc ?? orderInfo.state ?? ""
  ).trim().toLowerCase();

  const orderId = String(
    orderInfo.ticket ?? orderInfo.deal ?? (typeof orderInfo.order !== "object" ? orderInfo.order ?? "" : "")
  );

  const volume = Number(orderInfo.volume ?? 0);
  const price = orderInfo.price !== undefined ? Number(orderInfo.price) : undefined;
  const comment = orderInfo.comment ? String(orderInfo.comment) : orderInfo.retcode_desc ? String(orderInfo.retcode_desc) : undefined;

  let status = OrderStatus.UNKNOWN;
  if (rawStatus.includes("done") || rawStatus.includes("filled") || rawStatus.includes("executed")) {
    status = OrderStatus.FILLED;
  } else if (rawStatus.includes("partial")) {
    status = OrderStatus.PARTIALLY_FILLED;
  } else if (rawStatus.includes("placed") || rawStatus.includes("pending") || rawStatus.includes("queued")) {
    status = OrderStatus.PENDING;
  } else if (
    rawStatus.includes("reject") ||
    rawStatus.includes("error") ||
    rawStatus.includes("fail") ||
    rawStatus.includes("invalid")
  ) {
    status = OrderStatus.REJECTED;
  }

  return {
    status,
    orderId: orderId || undefined,
    volume,
    price,
    comment,
    rawResponse: d,
  };
}
