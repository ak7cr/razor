import { config } from '../config.js';
import { MockPaymentProvider } from './mock.js';
import { RazorpayPaymentProvider } from './razorpay.js';
import type { PaymentProvider } from './types.js';

/**
 * Builds the payment provider based on configuration:
 * real Razorpay test mode when keys are present, otherwise the offline mock.
 */
export function createPaymentProvider(): PaymentProvider {
  if (config.razorpay.keyId && config.razorpay.keySecret) {
    console.log('[payments] using REAL Razorpay test-mode API');
    return new RazorpayPaymentProvider(config.razorpay.keyId, config.razorpay.keySecret);
  }
  console.log('[payments] using MOCK provider (set RAZORPAY_KEY_ID/SECRET for real test mode)');
  return new MockPaymentProvider({ failFirstN: 1 });
}

export * from './types.js';
export { MockPaymentProvider, PaymentDeclinedError } from './mock.js';
export { RazorpayPaymentProvider } from './razorpay.js';
