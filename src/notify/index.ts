import { MockNotificationProvider } from './mock.js';
import type { NotificationProvider } from './types.js';

/**
 * Builds the notification provider. Currently always the offline mock;
 * a real SMTP/SendGrid adapter can be added behind the same interface.
 */
export function createNotificationProvider(): NotificationProvider {
  return new MockNotificationProvider();
}

export * from './types.js';
export { MockNotificationProvider } from './mock.js';
