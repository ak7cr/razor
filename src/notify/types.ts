/**
 * Notification provider contract — used to send a post-purchase receipt.
 * Mock-first by design (mirrors the payment provider pattern): the demo runs
 * with zero keys, and a real SMTP/email adapter can be added later without
 * touching the session logic.
 */

export interface ReceiptLine {
  name: string;
  qty: number;
  unitPricePaise: number;
}

export interface ReceiptInput {
  orderId: string;
  traceId: string;
  buyerEmail: string;
  lines: ReceiptLine[];
  totalPaise: number;
  currency: 'INR';
  /** Payment reference (mock payment id or Razorpay order id). */
  paymentRef?: string;
  provider: 'mock' | 'razorpay';
  paid: boolean;
}

export interface ReceiptResult {
  provider: 'mock' | 'smtp';
  messageId: string;
  deliveredAt: string;
}

export interface NotificationProvider {
  readonly provider: 'mock' | 'smtp';
  sendReceipt(input: ReceiptInput): Promise<ReceiptResult>;
}
