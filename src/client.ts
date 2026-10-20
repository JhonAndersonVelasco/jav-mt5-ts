import { MT5Config } from "./config.js";
import {
  AmbiguousExecutionError,
  AuthenticationError,
  ProtocolError,
  SessionError,
  TimeoutError,
  ToolError,
  TradingDisabledError,
  TransportError,
  UnsupportedToolError,
} from "./errors.js";
import {
  AccountInfo,
  Candle,
  ClosePositionRequest,
  MarketOrderRequest,
  OrderResult,
  SymbolInfo,
  Tick,
  Timeframe,
  ToolInfo,
} from "./models.js";
import { Subscription } from "./subscriptions.js";
import {
  parseAccountInfo,
  parseCandles,
  parseOrderResult,
  parseSymbolInfo,
  parseSymbols,
  parseTick,
} from "./tools.js";

export class MT5Client {
  public readonly config: MT5Config;
  private _sessionId?: string;
  private _isInitialized = false;
  private _isClosed = false;
  private _requestCounter = 0;
  private _initPromise?: Promise<void>;
  private _toolsCache?: Map<string, ToolInfo>;

  constructor(config?: MT5Config) {
    this.config = config ?? new MT5Config();
  }

  public get sessionId(): string | undefined {
    return this._sessionId;
  }

  public get isInitialized(): boolean {
    return this._isInitialized;
  }

  public get isClosed(): boolean {
    return this._isClosed;
  }

  public nextRequestId(): number {
    this._requestCounter += 1;
    return this._requestCounter;
  }

  public async initialize(): Promise<void> {
    if (this._isClosed) {
      throw new SessionError("Cannot initialize a closed client");
    }
    if (this._isInitialized) {
      return;
    }
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = (async () => {
      const reqId = this.nextRequestId();
      const payload = {
        jsonrpc: "2.0",
        id: reqId,
        method: "initialize",
        params: {
          protocolVersion: this.config.protocolVersion,
          capabilities: {},
          clientInfo: {
            name: "jav-mt5-ts",
            version: "0.1.0",
          },
        },
      };

      const headers = this.buildHeaders(false);
      let resp: Response;

      try {
        resp = await fetch(this.config.url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.config.timeout * 1000),
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new TimeoutError(`Timeout connecting to MCP server at ${this.config.url}: ${err.message}`);
        }
        throw new TransportError(`Network error connecting to MCP server: ${err}`);
      }

      this.checkHttpStatus(resp, "initialize");

      const sessId = resp.headers.get("mcp-session-id") ?? resp.headers.get("Mcp-Session-Id");
      if (sessId) {
        this._sessionId = sessId;
      }

      await this.parseJsonRpcResponse(resp, reqId);

      // Send notifications/initialized
      const notifyPayload = {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      };

      try {
        const notifyResp = await fetch(this.config.url, {
          method: "POST",
          headers: this.buildHeaders(true),
          body: JSON.stringify(notifyPayload),
          signal: AbortSignal.timeout(this.config.timeout * 1000),
        });
        this.checkHttpStatus(notifyResp, "notifications/initialized");
      } catch {
        // Notification failure is non-fatal
      }

      this._isInitialized = true;
    })();

    try {
      await this._initPromise;
    } finally {
      this._initPromise = undefined;
    }
  }

  public close(): void {
    if (this._isClosed) return;
    this._isClosed = true;
    this._isInitialized = false;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.close();
  }

  private ensureInitialized(): Promise<void> {
    if (this._isClosed) {
      throw new SessionError("Client is closed");
    }
    if (!this._isInitialized) {
      return this.initialize();
    }
    return Promise.resolve();
  }

  private buildHeaders(includeSession: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }
    if (includeSession && this._sessionId) {
      headers["Mcp-Session-Id"] = this._sessionId;
    }
    return headers;
  }

  private checkHttpStatus(resp: Response, method: string): void {
    if (resp.status === 401 || resp.status === 403) {
      throw new AuthenticationError(
        `Authentication failed (${resp.status}) during ${method}`,
        resp.status
      );
    }
    if (resp.status >= 400) {
      throw new TransportError(`HTTP ${resp.status} error during ${method}`, resp.status);
    }
  }

  private async parseJsonRpcResponse(resp: Response, expectedId?: number): Promise<unknown> {
    const contentType = resp.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
      const text = await resp.text();
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        if (line.startsWith("data:")) {
          const raw = line.slice(5).trim();
          try {
            const data = JSON.parse(raw);
            return this.verifyJsonRpcObject(data, expectedId);
          } catch (e: unknown) {
            throw new ProtocolError(`Invalid JSON in SSE data: ${e}`);
          }
        }
      }
      throw new ProtocolError(`No valid JSON-RPC 'data:' event found in SSE stream: ${text.slice(0, 200)}`);
    }

    let respData: unknown;
    try {
      respData = await resp.json();
    } catch (e: unknown) {
      throw new ProtocolError(`Failed to parse JSON response: ${e}`);
    }

    return this.verifyJsonRpcObject(respData, expectedId);
  }

  private verifyJsonRpcObject(data: unknown, expectedId?: number): unknown {
    if (!data || typeof data !== "object") {
      throw new ProtocolError(`Expected JSON-RPC object, got ${typeof data}`);
    }

    const d = data as Record<string, unknown>;

    if (expectedId !== undefined && d.id !== expectedId) {
      throw new ProtocolError(`Mismatched request ID: expected ${expectedId}, got ${d.id}`);
    }

    if ("error" in d) {
      const err = d.error as Record<string, unknown> | undefined;
      const code = typeof err?.code === "number" ? err.code : undefined;
      const msg = typeof err?.message === "string" ? err.message : JSON.stringify(err);
      throw new ToolError(`MCP JSON-RPC Error ${code}: ${msg}`, undefined, code);
    }

    if (!("result" in d)) {
      throw new ProtocolError("JSON-RPC response contains neither 'result' nor 'error'");
    }

    return d.result;
  }

  public async sendRequest(method: string, params: Record<string, unknown> = {}, isTrade = false): Promise<unknown> {
    await this.ensureInitialized();

    const reqId = this.nextRequestId();
    const payload = {
      jsonrpc: "2.0",
      id: reqId,
      method,
      params,
    };

    let resp: Response;
    try {
      resp = await fetch(this.config.url, {
        method: "POST",
        headers: this.buildHeaders(true),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.timeout * 1000),
      });
    } catch (err: unknown) {
      if (isTrade) {
        throw new AmbiguousExecutionError(
          `Timeout or network error executing trading operation ${method} (id=${reqId}). State is ambiguous.`,
          String(reqId)
        );
      }
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new TimeoutError(`Timeout during ${method}: ${err.message}`);
      }
      throw new TransportError(`Network error during ${method}: ${err}`);
    }

    this.checkHttpStatus(resp, method);
    return this.parseJsonRpcResponse(resp, reqId);
  }

  public async listTools(options: { refresh?: boolean } = {}): Promise<ToolInfo[]> {
    if (this._toolsCache && !options.refresh) {
      return Array.from(this._toolsCache.values());
    }

    const raw = await this.sendRequest("tools/list", {});
    const tools: ToolInfo[] = [];

    if (raw && typeof raw === "object") {
      const d = raw as Record<string, unknown>;
      if (Array.isArray(d.tools)) {
        for (const item of d.tools) {
          if (item && typeof item === "object" && "name" in item) {
            const t = item as Record<string, unknown>;
            tools.push({
              name: String(t.name),
              description: t.description ? String(t.description) : undefined,
              inputSchema: (t.inputSchema ?? t.input_schema ?? {}) as Record<string, unknown>,
            });
          }
        }
      }
    }

    this._toolsCache = new Map(tools.map((t) => [t.name, t]));
    return tools;
  }

  public async callTool(name: string, args: Record<string, unknown> = {}, isTrade = false): Promise<unknown> {
    if (this._toolsCache && !this._toolsCache.has(name)) {
      throw new UnsupportedToolError(`Tool '${name}' is not announced by the MCP server`, name);
    }

    const params = { name, arguments: args };
    return this.sendRequest("tools/call", params, isTrade);
  }

  // High-level MT5 operations

  public async getAccountInfo(): Promise<AccountInfo> {
    const raw = await this.callTool("get_trading_account_info", {});
    return parseAccountInfo(raw);
  }

  public async getSymbols(): Promise<SymbolInfo[]> {
    const raw = await this.callTool("get_marketwatch_symbols", {});
    return parseSymbols(raw);
  }

  public async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    if (!symbol || typeof symbol !== "string") {
      throw new Error("symbol must be a non-empty string");
    }
    const cleanSym = symbol.trim().toUpperCase();

    try {
      const raw = await this.callTool("get_symbol_info", { symbol: cleanSym });
      return parseSymbolInfo(raw, cleanSym);
    } catch (e: unknown) {
      if (e instanceof UnsupportedToolError) {
        const raw = await this.callTool("get_marketwatch_symbols", { symbol: cleanSym });
        return parseSymbolInfo(raw, cleanSym);
      }
      throw e;
    }
  }

  public async getTick(symbol: string): Promise<Tick> {
    if (!symbol || typeof symbol !== "string") {
      throw new Error("symbol must be a non-empty string");
    }
    const cleanSym = symbol.trim().toUpperCase();
    const raw = await this.callTool("get_marketwatch_symbols", { symbol: cleanSym });
    return parseTick(cleanSym, raw);
  }

  public async getCandles(
    symbol: string,
    timeframe: Timeframe | string,
    options: { start?: Date; end?: Date; limit?: number } = {}
  ): Promise<Candle[]> {
    if (!symbol || typeof symbol !== "string") {
      throw new Error("symbol must be a non-empty string");
    }
    const cleanSym = symbol.trim().toUpperCase();
    const limit = options.limit ?? 100;
    const now = options.end ?? new Date();
    const dtTo = now.toISOString().slice(0, 19);

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dtFrom = (options.start ?? sevenDaysAgo).toISOString().slice(0, 19);

    const args = {
      symbol: cleanSym,
      period: String(timeframe).toUpperCase(),
      datetime_from: dtFrom,
      datetime_to: dtTo,
      limit,
    };

    const raw = await this.callTool("get_chart_history", args);
    const candles = parseCandles(raw);
    return limit > 0 ? candles.slice(-limit) : candles;
  }

  public async sendMarketOrder(request: MarketOrderRequest): Promise<OrderResult> {
    if (!this.config.tradingEnabled) {
      throw new TradingDisabledError(
        "Trading is disabled in MT5Config. Set tradingEnabled: true to send orders."
      );
    }

    if (!request.symbol || typeof request.symbol !== "string") {
      throw new Error("Symbol must be a non-empty string");
    }
    const action = request.action.toUpperCase();
    if (action !== "BUY" && action !== "SELL") {
      throw new Error(`Action must be 'BUY' or 'SELL', got '${request.action}'`);
    }
    if (typeof request.volume !== "number" || request.volume <= 0 || isNaN(request.volume)) {
      throw new Error(`Volume must be a positive number, got ${request.volume}`);
    }

    const args: Record<string, unknown> = {
      symbol: request.symbol.trim().toUpperCase(),
      action,
      volume: request.volume,
    };
    if (request.sl !== undefined) args.sl = request.sl;
    if (request.tp !== undefined) args.tp = request.tp;
    if (request.comment !== undefined) args.comment = request.comment;

    const raw = await this.callTool("open_market_order", args, true);
    return parseOrderResult(raw);
  }

  public async closePosition(request: ClosePositionRequest): Promise<OrderResult> {
    if (!this.config.tradingEnabled) {
      throw new TradingDisabledError(
        "Trading is disabled in MT5Config. Set tradingEnabled: true to close positions."
      );
    }

    if (typeof request.ticket !== "number" || request.ticket <= 0) {
      throw new Error(`Ticket must be a positive integer, got ${request.ticket}`);
    }

    const args: Record<string, unknown> = { ticket: request.ticket };
    if (request.volume !== undefined) {
      if (typeof request.volume !== "number" || request.volume <= 0) {
        throw new Error(`Volume must be positive, got ${request.volume}`);
      }
      args.volume = request.volume;
    }

    const raw = await this.callTool("close_position", args, true);
    return parseOrderResult(raw);
  }

  public subscribeTicks(
    symbols: string | string[],
    callback: (tick: Tick) => void,
    options: {
      interval?: number;
      deduplicate?: boolean;
      onError?: (err: Error) => void;
    } = {}
  ): Subscription {
    const symList = Array.isArray(symbols) ? symbols : [symbols];
    const intervalMs = (options.interval ?? 0.5) * 1000;
    const deduplicate = options.deduplicate ?? true;
    const lastTicks = new Map<string, string>();
    let timer: NodeJS.Timeout | undefined;

    const poll = async () => {
      for (const sym of symList) {
        try {
          const tick = await this.getTick(sym);
          const key = `${tick.bid}-${tick.ask}-${tick.time.getTime()}`;
          if (deduplicate && lastTicks.get(sym) === key) {
            continue;
          }
          lastTicks.set(sym, key);
          callback(tick);
        } catch (err: unknown) {
          if (options.onError && err instanceof Error) {
            options.onError(err);
          }
        }
      }
    };

    timer = setInterval(poll, intervalMs);
    // Initial immediate poll
    void poll();

    return new Subscription(() => {
      if (timer) clearInterval(timer);
    });
  }

  public subscribeCandles(
    symbol: string,
    timeframe: Timeframe | string,
    callback: (candle: Candle) => void,
    options: {
      interval?: number;
      deduplicate?: boolean;
      onError?: (err: Error) => void;
    } = {}
  ): Subscription {
    const cleanSym = symbol.trim().toUpperCase();
    const intervalMs = (options.interval ?? 2.0) * 1000;
    const deduplicate = options.deduplicate ?? true;
    let lastKey: string | undefined;
    let timer: NodeJS.Timeout | undefined;

    const poll = async () => {
      try {
        const candles = await this.getCandles(cleanSym, timeframe, { limit: 2 });
        if (candles.length > 0) {
          const latest = candles[candles.length - 1];
          const key = `${latest.time.getTime()}-${latest.close}-${latest.volume}`;
          if (deduplicate && lastKey === key) {
            return;
          }
          lastKey = key;
          callback(latest);
        }
      } catch (err: unknown) {
        if (options.onError && err instanceof Error) {
          options.onError(err);
        }
      }
    };

    timer = setInterval(poll, intervalMs);
    void poll();

    return new Subscription(() => {
      if (timer) clearInterval(timer);
    });
  }
}
