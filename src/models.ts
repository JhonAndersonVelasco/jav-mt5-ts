export enum Timeframe {
  M1 = "M1",
  M2 = "M2",
  M3 = "M3",
  M4 = "M4",
  M5 = "M5",
  M6 = "M6",
  M10 = "M10",
  M12 = "M12",
  M15 = "M15",
  M20 = "M20",
  M30 = "M30",
  H1 = "H1",
  H2 = "H2",
  H3 = "H3",
  H4 = "H4",
  H6 = "H6",
  H8 = "H8",
  H12 = "H12",
  D1 = "D1",
  W1 = "W1",
  MN1 = "MN1",
}

export enum OrderStatus {
  FILLED = "filled",
  PARTIALLY_FILLED = "partially_filled",
  PENDING = "pending",
  REJECTED = "rejected",
  UNKNOWN = "unknown",
}

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface Tick {
  symbol: string;
  bid: number;
  ask: number;
  time: Date;
  last?: number;
  volume?: number;
  spread?: number;
}

export interface Candle {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AccountInfo {
  login?: number;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  profit: number;
  leverage: number;
  currency: string;
  server?: string;
}

export interface SymbolInfo {
  name: string;
  path?: string;
  description?: string;
  digits: number;
  point?: number;
  spread?: number;
  stopsLevel?: number;
  freezeLevel?: number;
  volumeMin?: number;
  volumeMax?: number;
  volumeStep?: number;
  contractSize?: number;
  tradeMode?: number | string;
  currencyBase?: string;
  currencyProfit?: string;
  currencyMargin?: string;
  bid?: number;
  ask?: number;
  raw?: Record<string, unknown>;
}

export interface MarketOrderRequest {
  symbol: string;
  action: "BUY" | "SELL";
  volume: number;
  sl?: number;
  tp?: number;
  comment?: string;
}

export interface ClosePositionRequest {
  ticket: number;
  volume?: number;
}

export interface OrderResult {
  status: OrderStatus;
  orderId?: string;
  volume: number;
  price?: number;
  comment?: string;
  rawResponse?: Record<string, unknown>;
}
