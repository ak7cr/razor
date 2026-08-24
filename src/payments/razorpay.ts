import { randomUUID } from 'node:crypto';
import type { CreatePaymentInput, CreatePaymentResult, PaymentProvider } from './types.js';
import { PaymentDeclinedError } from './mock.js';

const API_BASE = 'https://api.razorpay.com/v1';

interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
  attempts: number;
  notes?: Record<string, string>;
}

interface RazorpayPaymentLinkResponse {
  id: string;
  short_url: string;
  status: string;
}

/**
 * RazorpayPaymentProvider — real integration against Razorpay test-mode APIs
 * using key_id / key_secret from the environment (Basic auth).
 *
 * Flow: create an Order, then create a Payment Link for it. In test mode the
 * payment is not automatically completed (that happens via webhooks in
 * production), so the result is surfaced as "payment link created" — which is
 * exactly what an AI buyer would hand to a human, or auto-complete in a
 * simulated checkout.
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly provider = 'razorpay' as const;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
  ) {}

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader(),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try {
        detail = JSON.parse(text)?.error?.description ?? text;
      } catch {
        /* keep raw text */
      }
      throw new PaymentDeclinedError(`Razorpay API ${res.status}: ${detail}`, `RZP_${res.status}`);
    }
    return JSON.parse(text) as T;
  }

  async createOrder(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const order: RazorpayOrderResponse = await this.post<RazorpayOrderResponse>('/orders', {
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes ?? {},
    });

    let link: RazorpayPaymentLinkResponse | undefined;
    try {
      link = await this.post<RazorpayPaymentLinkResponse>('/payment_links', {
        amount: input.amountPaise,
        currency: input.currency,
        accept_partial: false,
        description: `Volt & Co. order ${input.orderId} (AI-assisted checkout)`,
        notes: input.notes ?? {},
      });
    } catch {
      // Payment link is a nicety — an order alone is still a valid charge object.
      link = undefined;
    }

    return {
      provider: 'razorpay',
      paymentId: `rzp_${randomUUID().slice(0, 16)}`,
      rzpOrderId: order.id,
      paymentLinkUrl: link?.short_url,
      paid: false,
    };
  }
}
