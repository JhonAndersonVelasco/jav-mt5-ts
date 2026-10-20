import { ConfigurationError } from "./errors.js";

export interface MT5ConfigOptions {
  url?: string;
  apiKey?: string;
  timeout?: number;
  protocolVersion?: string;
  tradingEnabled?: boolean;
}

export class MT5Config {
  public url: string;
  public apiKey?: string;
  public timeout: number;
  public protocolVersion: string;
  public tradingEnabled: boolean;

  constructor(options: MT5ConfigOptions = {}) {
    this.url = options.url ?? "http://127.0.0.1:22346/mcp";
    this.apiKey = options.apiKey;
    this.timeout = options.timeout ?? 30.0;
    this.protocolVersion = options.protocolVersion ?? "2024-11-05";
    this.tradingEnabled = options.tradingEnabled ?? false;

    this.validate();
  }

  public validate(): void {
    if (!this.url || typeof this.url !== "string") {
      throw new ConfigurationError("Invalid or empty URL");
    }

    const cleanUrl = this.url.trim().toLowerCase();
    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
      throw new ConfigurationError("Invalid or empty URL: scheme must be http:// or https://");
    }

    if (typeof this.timeout !== "number" || isNaN(this.timeout) || this.timeout <= 0) {
      throw new ConfigurationError(`Timeout must be a positive number, got: ${this.timeout}`);
    }
  }

  public toString(): string {
    const maskedKey = this.apiKey ? "***" : undefined;
    return (
      `MT5Config(` +
      `url='${this.url}', ` +
      `apiKey='${maskedKey}', ` +
      `timeout=${this.timeout}, ` +
      `protocolVersion='${this.protocolVersion}', ` +
      `tradingEnabled=${this.tradingEnabled}` +
      `)`
    );
  }

  public static fromEnv(): MT5Config {
    const env = typeof process !== "undefined" ? process.env : {};
    const url = env.JAV_MT5_URL ?? "http://127.0.0.1:22346/mcp";
    const apiKey = env.JAV_MT5_API_KEY || undefined;
    const rawTimeout = env.JAV_MT5_TIMEOUT;
    const protocolVersion = env.JAV_MT5_PROTOCOL_VERSION ?? "2024-11-05";
    const rawTrading = (env.JAV_MT5_TRADING_ENABLED ?? "false").trim().toLowerCase();

    let timeout = 30.0;
    if (rawTimeout !== undefined) {
      timeout = parseFloat(rawTimeout);
      if (isNaN(timeout) || timeout <= 0) {
        throw new ConfigurationError(
          `Invalid JAV_MT5_TIMEOUT: expected positive number, got '${rawTimeout}'`
        );
      }
    }

    const tradingEnabled = ["1", "true", "yes", "on"].includes(rawTrading);

    return new MT5Config({
      url,
      apiKey,
      timeout,
      protocolVersion,
      tradingEnabled,
    });
  }
}
