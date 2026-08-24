import { randomUUID } from 'node:crypto';
import type { CreatePaymentInput, CreatePaymentResult, PaymentProvider } from './types.js';

export interface MockProviderOptions {
  /** Number of consecutive attempts that should fail before succeeding. */
  failFirstN?: number;
  /** List of failure messages to cycle through while failing. */
  failureMessages?: string[];
}

/**
 * MockPaymentProvider — a deterministic stand-in for Razorpay test mode so the
 * whole demo runs offline. It can be configured to fail a few attempts to
 * demonstrate *graceful failure handling* (a core part of the track's bar).
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly provider = 'mock' as const;
  private failFirstN: number;
  private readonly failureMessages: string[];

  constructor(opts: MockProviderOptions = {}) {
    this.failFirstN = opts.failFirstN ?? 0;
    this.failureMessages = opts.failureMessages ?? [
      'Payment gateway timeout: bank did not respond within 8s.',
      'Transaction declined by the issuing bank (insufficient funds).',
    ];
  }

  /** Used by the demo to reset after a seeded failure. */
  resetFailures(): void {
    this.failFirstN = 0;
  }

  async createOrder(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    // Simulated network latency so the UI feels real.
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 500));

    if (this.failFirstN > 0) {
      this.failFirstN -= 1;
      const msg = this.failureMessages[Math.min(this.failureMessages.length - 1, this.failFirstN)]!;
      throw new PaymentDeclinedError(msg, `MOCK_DECLINE_${randomUUID().slice(0, 8).toUpperCase()}`);
    }

    const paymentId = `pay_mock_${randomUUID().slice(0, 16)}`;
    return {
      provider: 'mock',
      paymentId,
      paymentLinkUrl: `https://demo.volt-and-co.example/pay/${paymentId}`,
      paid: true,
      paidAt: new Date().toISOString(),
    };
  }
}

export class PaymentDeclinedError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'PaymentDeclinedError';
  }
}
