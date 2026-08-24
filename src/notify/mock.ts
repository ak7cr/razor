import { randomUUID } from 'node:crypto';
import type { NotificationProvider, ReceiptInput, ReceiptResult } from './types.js';

/**
 * MockNotificationProvider — deterministic stand-in for an email service.
 * "Delivers" the receipt (simulated latency) and returns a message id, which
 * the session records in the audit trail. No keys, works offline.
 */
export class MockNotificationProvider implements NotificationProvider {
  readonly provider = 'mock' as const;

  async sendReceipt(_input: ReceiptInput): Promise<ReceiptResult> {
    await new Promise((r) => setTimeout(r, 350 + Math.random() * 250));
    return {
      provider: 'mock',
      messageId: `msg_mock_${randomUUID().slice(0, 14)}`,
      deliveredAt: new Date().toISOString(),
    };
  }
}
