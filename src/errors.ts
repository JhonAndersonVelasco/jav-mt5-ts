/**
 * Hierarchy of exceptions for jav-mt5 in TypeScript.
 */

export class JavMT5Error extends Error {
  public readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConfigurationError extends JavMT5Error {}

export class TransportError extends JavMT5Error {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number, details?: Record<string, unknown>) {
    super(message, details);
    this.statusCode = statusCode;
  }
}

export class AuthenticationError extends TransportError {}

export class TimeoutError extends TransportError {}

export class SessionError extends TransportError {}

export class ProtocolError extends JavMT5Error {}

export class ToolError extends JavMT5Error {
  public readonly toolName?: string;
  public readonly code?: number;

  constructor(message: string, toolName?: string, code?: number, details?: Record<string, unknown>) {
    super(message, details);
    this.toolName = toolName;
    this.code = code;
  }
}

export class UnsupportedToolError extends ToolError {}

export class ResponseValidationError extends JavMT5Error {}

export class TradingDisabledError extends JavMT5Error {}

export class AmbiguousExecutionError extends JavMT5Error {
  public readonly orderRef?: string;

  constructor(message: string, orderRef?: string, details?: Record<string, unknown>) {
    super(message, details);
    this.orderRef = orderRef;
  }
}
