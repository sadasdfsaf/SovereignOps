export interface RateLimitSubject {
  workspaceId: string;
  deviceId: string;
}

export interface RateLimitTakeInput extends RateLimitSubject {
  cost?: number;
  nowMs?: number;
}

export interface RateLimitDecision extends RateLimitSubject {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterMs: number;
}

export interface RateLimiter {
  take(input: RateLimitTakeInput): RateLimitDecision;
}

export interface TokenWindowRateLimiterOptions {
  capacity: number;
  windowMs: number;
  now?: () => number;
}

interface TokenWindow {
  resetAtMs: number;
  tokens: number;
}

export class InMemoryTokenWindowRateLimiter implements RateLimiter {
  private readonly capacity: number;
  private readonly now: () => number;
  private readonly windowMs: number;
  private readonly windows = new Map<string, TokenWindow>();

  constructor(options: TokenWindowRateLimiterOptions) {
    assertPositiveInteger(options.capacity, "capacity");
    assertPositiveInteger(options.windowMs, "windowMs");

    this.capacity = options.capacity;
    this.windowMs = options.windowMs;
    this.now = options.now ?? Date.now;
  }

  take(input: RateLimitTakeInput): RateLimitDecision {
    const cost = input.cost ?? 1;
    assertPositiveInteger(cost, "cost");

    const nowMs = input.nowMs ?? this.now();
    if (!Number.isFinite(nowMs) || nowMs < 0) {
      throw new Error("nowMs must be a non-negative finite number");
    }

    const key = subjectKey(input);
    const window = this.currentWindow(key, nowMs);
    const allowed = window.tokens >= cost;

    if (allowed) {
      window.tokens -= cost;
    }

    this.windows.set(key, window);

    return {
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      allowed,
      limit: this.capacity,
      remaining: Math.max(0, window.tokens),
      resetAtMs: window.resetAtMs,
      retryAfterMs: allowed ? 0 : Math.max(0, window.resetAtMs - nowMs),
    };
  }

  reset(subject?: RateLimitSubject): void {
    if (subject === undefined) {
      this.windows.clear();
      return;
    }

    this.windows.delete(subjectKey(subject));
  }

  private currentWindow(key: string, nowMs: number): TokenWindow {
    const existing = this.windows.get(key);
    if (existing && nowMs < existing.resetAtMs) {
      return existing;
    }

    const windowStartMs = Math.floor(nowMs / this.windowMs) * this.windowMs;
    return {
      resetAtMs: windowStartMs + this.windowMs,
      tokens: this.capacity,
    };
  }
}

function subjectKey(subject: RateLimitSubject): string {
  return JSON.stringify([subject.workspaceId, subject.deviceId]);
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}
