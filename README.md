# jav-mt5 (Node.js / TypeScript)

[![npm version](https://img.shields.io/npm/v/jav-mt5.svg)](https://www.npmjs.com/package/jav-mt5)
[![Node versions](https://img.shields.io/node/v/jav-mt5.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Cliente asíncrono y fuertemente tipado en **TypeScript / Node.js** para conectar aplicaciones con servidores **Model Context Protocol (MCP)** de **MetaTrader 5**.

Permite acceder a cotizaciones en tiempo real, velas históricas OHLC, datos de cuentas de trading, especificaciones de símbolos (`stops_level`, `spread`, lotes) y ejecución/cierre seguro de órdenes sobre HTTP y Server-Sent Events (SSE).

---

## Características

- 🚀 **100% Asíncrono**: Construido sobre promesas nativas y `fetch` estándar (Node.js 18+).
- 🛡️ **Seguridad por defecto**: `tradingEnabled: false` para evitar envíos involuntarios de órdenes.
- 📦 **Dual ESM & CommonJS**: Compatible con proyectos modernos `import` y `require()`, con tipos completos TypeScript (`.d.ts`).
- ⚡ **Suscripciones en tiempo real**: Streaming de ticks y velas en segundo plano con callbacks y control de parada (`sub.stop()`).
- 📊 **Información completa de símbolos**: `stopsLevel`, `freezeLevel`, `point`, `spread`, límites de lote (`volumeMin`, `volumeMax`, `volumeStep`) y metadatos crudos (`raw`).
- 🧩 **Acceso a herramientas MCP**: `client.callTool(name, args)` para ejecutar cualquier herramienta MCP no estándar.

---

## Instalación

```bash
npm install jav-mt5
```

---

## Guía rápida de uso

### 1. Datos de Mercado (Cuenta, Ticks y Velas)

```typescript
import { MT5Client, MT5Config, Timeframe } from "jav-mt5";

const config = new MT5Config({
  url: "http://127.0.0.1:22346/mcp",
  timeout: 30.0,
});

const client = new MT5Client(config);

// 1. Obtener balance y apalancamiento
const account = await client.getAccountInfo();
console.log(`Balance: ${account.balance} ${account.currency} (1:${account.leverage})`);

// 2. Cotización en tiempo real
const tick = await client.getTick("EURUSD");
console.log(`EURUSD -> Bid: ${tick.bid}, Ask: ${tick.ask}, Spread: ${tick.spread}`);

// 3. Historial de velas (M1, M5, H1, etc.)
const candles = await client.getCandles("EURUSD", Timeframe.M15, { limit: 10 });
for (const c of candles) {
  console.log(`[${c.time.toISOString()}] Open: ${c.open} Close: ${c.close}`);
}

client.close();
```

---

### 2. Especificaciones de Símbolo (`stopsLevel`, `spread`, Lotes)

```typescript
import { MT5Client } from "jav-mt5";

const client = new MT5Client();
const info = await client.getSymbolInfo("EURUSD");

console.log(`Símbolo: ${info.name}`);
console.log(`Dígitos: ${info.digits}, Point: ${info.point}`);
console.log(`Spread actual: ${info.spread}`);
console.log(`Stops Level (mínimo SL/TP): ${info.stopsLevel} puntos`);
console.log(`Lotes -> Mín: ${info.volumeMin}, Máx: ${info.volumeMax}, Paso: ${info.volumeStep}`);
console.log(`Tamaño contrato: ${info.contractSize} ${info.currencyBase}`);
```

---

### 3. Suscripciones en Tiempo Real (Streaming de Ticks y Velas)

```typescript
import { MT5Client, Timeframe, Tick, Candle } from "jav-mt5";

const client = new MT5Client();

// Suscripción a ticks
const subTicks = client.subscribeTicks(["EURUSD", "GBPUSD"], (tick: Tick) => {
  console.log(`⚡ ${tick.symbol}: Bid=${tick.bid} Ask=${tick.ask}`);
}, { interval: 0.5 });

// Suscripción a velas
const subCandles = client.subscribeCandles("EURUSD", Timeframe.M1, (candle: Candle) => {
  console.log(`🕯️ Nueva vela: [${candle.time.toISOString()}] Close=${candle.close}`);
}, { interval: 2.0 });

// Detener cuando sea necesario:
// subTicks.stop();
// subCandles.stop();
```

---

### 4. Envío de Órdenes (Trading Opt-in)

Por seguridad, las órdenes requieren habilitación explícita con `tradingEnabled: true`:

```typescript
import { MT5Client, MT5Config, OrderStatus } from "jav-mt5";

const client = new MT5Client(
  new MT5Config({
    url: "http://127.0.0.1:22346/mcp",
    tradingEnabled: true, // Requerido para enviar órdenes
  })
);

// Abrir orden de mercado
const order = await client.sendMarketOrder({
  symbol: "EURUSD",
  action: "BUY",
  volume: 0.1,
  sl: 1.0800,
  tp: 1.0950,
  comment: "Node.js Bot",
});

console.log(`Estado: ${order.status}, Ticket/ID: ${order.orderId}`);

// Cerrar posición
if (order.orderId) {
  const closeRes = await client.closePosition({
    ticket: Number(order.orderId),
  });
  console.log(`Cierre: ${closeRes.status}`);
}
```

---

## Variables de Entorno

Puedes configurar el cliente directamente desde variables de entorno con `MT5Config.fromEnv()`:

| Variable | Tipo | Default | Descripción |
|---|---|---|---|
| `JAV_MT5_URL` | string | `http://127.0.0.1:22346/mcp` | Endpoint HTTP del servidor MCP |
| `JAV_MT5_API_KEY` | string | `undefined` | Token de autorización Bearer |
| `JAV_MT5_TIMEOUT` | number | `30.0` | Timeout de red en segundos |
| `JAV_MT5_TRADING_ENABLED` | boolean | `false` | Habilitar operaciones de trading |

---

## Jerarquía de Excepciones

```text
JavMT5Error
├── ConfigurationError
├── TransportError
│   ├── AuthenticationError (401 / 403)
│   ├── TimeoutError
│   └── SessionError
├── ProtocolError
├── ToolError
│   └── UnsupportedToolError
├── ResponseValidationError
├── TradingDisabledError
└── AmbiguousExecutionError (Timeout en trading sin reintento ciego)
```

---

## Licencia

Distribuido bajo la [Licencia MIT](LICENSE).
