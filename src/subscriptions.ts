/**
 * Manages active polling or stream subscriptions in TypeScript.
 */

export class Subscription {
  private _isActive = true;
  private readonly _cleanup: () => void;

  constructor(cleanup: () => void) {
    this._cleanup = cleanup;
  }

  public get isActive(): boolean {
    return this._isActive;
  }

  public stop(): void {
    if (!this._isActive) return;
    this._isActive = false;
    try {
      this._cleanup();
    } catch {
      // ignore cleanup errors
    }
  }

  public [Symbol.dispose](): void {
    this.stop();
  }
}
