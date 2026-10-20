import { describe, expect, it } from "vitest";
import { MT5Config } from "../src/config.js";
import { ConfigurationError } from "../src/errors.js";

describe("MT5Config (TypeScript)", () => {
  it("uses defaults properly", () => {
    const config = new MT5Config();
    expect(config.url).toBe("http://127.0.0.1:22346/mcp");
    expect(config.apiKey).toBeUndefined();
    expect(config.timeout).toBe(30.0);
    expect(config.protocolVersion).toBe("2024-11-05");
    expect(config.tradingEnabled).toBe(false);
  });

  it("rejects invalid or empty URLs", () => {
    expect(() => new MT5Config({ url: "" })).toThrow(ConfigurationError);
    expect(() => new MT5Config({ url: "ftp://server" })).toThrow(ConfigurationError);
  });

  it("rejects non-positive timeout", () => {
    expect(() => new MT5Config({ timeout: 0 })).toThrow(ConfigurationError);
    expect(() => new MT5Config({ timeout: -5 })).toThrow(ConfigurationError);
  });

  it("masks API key in toString()", () => {
    const config = new MT5Config({ apiKey: "secret-key-123" });
    const str = config.toString();
    expect(str).not.toContain("secret-key-123");
    expect(str).toContain("***");
  });

  it("loads from environment variables", () => {
    process.env.JAV_MT5_URL = "https://mt5.example.com/mcp";
    process.env.JAV_MT5_API_KEY = "env-token";
    process.env.JAV_MT5_TIMEOUT = "12.5";
    process.env.JAV_MT5_TRADING_ENABLED = "true";

    const config = MT5Config.fromEnv();
    expect(config.url).toBe("https://mt5.example.com/mcp");
    expect(config.apiKey).toBe("env-token");
    expect(config.timeout).toBe(12.5);
    expect(config.tradingEnabled).toBe(true);

    delete process.env.JAV_MT5_URL;
    delete process.env.JAV_MT5_API_KEY;
    delete process.env.JAV_MT5_TIMEOUT;
    delete process.env.JAV_MT5_TRADING_ENABLED;
  });
});
