import { CatalogService } from '../catalog/catalog.js';
import { BuyerSession } from '../agent/session.js';
import { hasLlm, hasRazorpay } from '../config.js';
import { createPaymentProvider, MockPaymentProvider, type PaymentProvider } from '../payments/index.js';
import {
  continueLlmBuyer,
  createRunContext,
  runLlmBuyer,
  type RunContext,
} from '../agent/planner.js';
import { runHeuristicBuyer } from '../agent/heuristic.js';

export interface NewSessionInput {
  id?: string;
  demoFailOnce?: boolean;
  paymentMethods?: string[];
}

/**
 * Owns sessions and their planner contexts. Keeps the express layer thin.
 */
export class SessionManager {
  private readonly catalog = new CatalogService();
  private readonly sessions = new Map<string, BuyerSession>();
  private readonly contexts = new Map<string, RunContext>();
  private sharedProvider: PaymentProvider | null = null;

  createSession(input: NewSessionInput = {}): BuyerSession {
    const payment = this.paymentFor(input.demoFailOnce ?? true);
    const session = new BuyerSession(this.catalog, payment, {
      id: input.id,
      demoFailOnce: input.demoFailOnce ?? true,
      paymentMethods: input.paymentMethods,
    });
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): BuyerSession | undefined {
    return this.sessions.get(id);
  }

  /** Kick off the agent for a mission. Returns false if already running. */
  run(id: string, mission: string): boolean {
    const s = this.sessions.get(id);
    if (!s || s.state === 'running' || s.state === 'paying' || s.state === 'awaiting_approval') return false;
    s.start(mission);
    if (hasLlm()) {
      const ctx = createRunContext(mission);
      this.contexts.set(id, ctx);
      void runLlmBuyer(s, ctx).catch((e) => {
        s.emitThinking(`[planner error] ${(e as Error).message}`);
      });
    } else {
      void runHeuristicBuyer(s, mission).catch((e) => {
        s.emitThinking(`[planner error] ${(e as Error).message}`);
      });
    }
    return true;
  }

  /** After a human denial, let the agent adjust and re-propose. */
  continueAfterDenial(id: string, reason: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    if (hasLlm()) {
      const ctx = this.contexts.get(id);
      if (!ctx) return false;
      void continueLlmBuyer(s, ctx, `The human denied your proposed order: "${reason}". Adjust the cart (drop items, swap products, or reduce quantity) and propose again.`).catch(() => {});
      return true;
    }
    // Heuristic mode: no reasoning loop — just note it and re-propose the cart.
    s.emitThinking('[heuristic planner] Human denied the order. Re-proposing the same cart (deterministic mode can’t adjust).');
    s.proposeOrder('Re-proposed after denial (heuristic mode).');
    return true;
  }

  meta() {
    return {
      hasLlm: hasLlm(),
      hasRazorpay: hasRazorpay(),
      provider: hasRazorpay() ? 'razorpay' : 'mock',
      merchant: this.catalog.merchantInfo(),
    };
  }

  private paymentFor(demoFailOnce: boolean): PaymentProvider {
    if (hasRazorpay()) {
      if (!this.sharedProvider) this.sharedProvider = createPaymentProvider();
      return this.sharedProvider;
    }
    return new MockPaymentProvider({ failFirstN: demoFailOnce ? 1 : 0 });
  }
}
