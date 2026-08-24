/**
 * Payment provider contract. Two implementations:
 *  - mock      → fully offline demo (can be seeded to fail once, to demo recovery)
 *  - razorpay  → real Razorpay Orders/Payment-Links test-mode API
 */

export type PaymentProviderKind = 'mock' | 'razorpay';

export interface CreatePaymentInput {
  orderId: string;
  receipt: string;
  amountPaise: number;
  currency: 'INR';
  /** Which payment method the buyer chose (UPI, card, …). */
  method: string;
  notes?: Record<string, string>;
}

export interface CreatePaymentResult {
  provider: PaymentProviderKind;
  paymentId: string;
  /** Razorpay order id (real mode). */
  rzpOrderId?: string;
  /** Human-clickable payment link (real mode) or a demo link (mock mode). */
  paymentLinkUrl?: string;
  /** true when the payment is complete (mock mode). Real mode awaits webhook. */
  paid: boolean;
  paidAt?: string;
}

export interface PaymentProvider {
  readonly provider: PaymentProviderKind;
  createOrder(input: CreatePaymentInput): Promise<CreatePaymentResult>;
}
