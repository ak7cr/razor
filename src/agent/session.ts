import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  AuditEntry,
  Cart,
  CartLine,
  Order,
  SessionEvent,
  SessionEventType,
} from '../types.js';
import { CatalogService } from '../catalog/catalog.js';
import { computeShipping, MoneyGuard } from '../guards/moneyGuards.js';
import { AuditTrail } from '../audit/auditTrail.js';
import { formatInr } from '../catalog/serialize.js';
import { config } from '../config.js';
import type { PaymentProvider } from '../payments/index.js';
import { PaymentDeclinedError } from '../payments/index.js';
import { formatCart, type BuyerSessionApi } from './tools.js';

export type SessionState =
  | 'idle'
  | 'running'
  | 'awaiting_approval'
  | 'paying'
  | 'complete'
  | 'failed';

export interface SessionOptions {
  id?: string;
  demoFailOnce?: boolean;
  paymentMethods?: string[];
}

const DEFAULT_METHODS = ['UPI', 'Card', 'Netbanking'];

/**
 * BuyerSession — the transactional state machine for one AI-buyer visit.
 *
 * Guarantees (the track's bar):
 *  - BOUNDED:   MoneyGuard caps order total, per-line qty and line count.
 *  - GATED:     The agent can only *propose*; a human must approve before any
 *               charge is created. The agent has no tool that charges money.
 *  - EXPLAINABLE: every action lands in an append-only AuditTrail with the
 *               agent's reasoning and the guard checks that ran.
 *  - RESILIENT: a failed payment is retried once with a fallback method and
 *               surfaced honestly in the audit trail (graceful failure).
 *
 * Implements BuyerSessionApi (tools.ts) so the LLM/heuristic planners can act
 * on it without a circular import.
 */
export class BuyerSession extends EventEmitter implements BuyerSessionApi {
  readonly id: string;
  readonly traceId: string;
  readonly catalog: CatalogService;
  readonly audit: AuditTrail;
  readonly guard: MoneyGuard;
  readonly payment: PaymentProvider;
  readonly demoFailOnce: boolean;

  cart: Cart = { lines: [], totalPaise: 0 };
  order: Order | null = null;
  state: SessionState = 'idle';
  mission = '';

  private readonly paymentMethods: string[];

  constructor(
    catalog: CatalogService,
    payment: PaymentProvider,
    opts: SessionOptions = {},
  ) {
    super();
    this.id = opts.id ?? randomUUID().slice(0, 12);
    this.traceId = randomUUID();
    this.catalog = catalog;
    this.payment = payment;
    this.demoFailOnce = opts.demoFailOnce ?? true;
    this.paymentMethods = opts.paymentMethods ?? DEFAULT_METHODS;
    this.guard = new MoneyGuard(config, catalog);
    this.audit = new AuditTrail(this.traceId);
  }

  /* ── pub/sub for SSE ────────────────────────────────────────────────── */

  subscribe(cb: (e: SessionEvent) => void): () => void {
    const handler = (e: SessionEvent) => cb(e);
    this.on('event', handler);
    return () => this.off('event', handler);
  }

  private emitEvent(type: SessionEventType, data?: unknown): void {
    const e: SessionEvent = { type, ts: new Date().toISOString(), data };
    this.emit('event', e);
  }

  /** Exposed so planners can surface a tool's output back into the live trace. */
  emitToolResult(name: string, out: string): void {
    this.emitEvent('agent.tool_result', { name, out });
  }

  /** Exposed for planners to inject narrative lines into the live trace. */
  emitThinking(text: string): void {
    this.emitEvent('agent.thinking', { text });
  }

  /** Exposed for planners to surface the agent's own words. */
  emitMessage(text: string): void {
    this.emitEvent('agent.message', { text });
  }

  /* ── lifecycle ──────────────────────────────────────────────────────── */

  start(mission: string): void {
    this.mission = mission;
    this.state = 'running';
    this.emitEvent('agent.thinking', { text: `Mission accepted: "${mission}"` });
    this.audit.append('agent', 'AGENT_DECISION', 'executed', {
      reasoning: `Session started with mission: ${mission}`,
    });
  }

  private end(state: 'complete' | 'failed'): void {
    this.state = state;
    this.emitEvent('session.ended', {
      state,
      orderId: this.order?.id ?? null,
      paid: this.order?.status === 'paid',
      totalPaise: this.order?.totalPaise ?? this.cart.totalPaise,
    });
  }

  /* ── agent tools (read-only + cart ops) ─────────────────────────────── */

  searchCatalog(query: string): string {
    this.emitEvent('agent.tool_call', { name: 'search_catalog', args: { query } });
    const hits = this.catalog.search(query).slice(0, 6);
    if (hits.length === 0) return `No products matched "${query}".`;
    return hits
      .map(
        (p) =>
          `- ${p.id} | ${p.name} | ${formatInr(p.pricePaise)} (${p.pricePaise} paise) | stock ${p.stock} | ${p.category} | ${p.agentBlurb}`,
      )
      .join('\n');
  }

  getProduct(id: string): string {
    this.emitEvent('agent.tool_call', { name: 'get_product', args: { product_id: id } });
    const p = this.catalog.byId(id);
    if (!p) return `Product ${id} not found.`;
    return [
      `${p.name} (${p.id}) — ${formatInr(p.pricePaise)} / ${p.pricePaise} paise`,
      `Stock: ${p.stock}`,
      `Attributes: ${p.attributes.map((a) => `${a.label}: ${a.value}`).join(', ')}`,
      `Policy: ${p.policy.returnDays}-day returns, ships in ${p.policy.etaDays} days`,
      `Blurb: ${p.agentBlurb}`,
    ].join('\n');
  }

  viewPolicies(): string {
    this.emitEvent('agent.tool_call', { name: 'view_policies', args: {} });
    const m = this.catalog.merchantInfo();
    return [
      `Merchant: ${m.name} — ${m.tagline}`,
      `Currency: ${m.currency}. 100 paise = 1 INR.`,
      `Shipping: free above ${formatInr(m.policies.freeShippingAbovePaise)}, else flat ${formatInr(m.policies.shippingFlatPaise)}.`,
      `Returns: ${m.policies.returnDays} days. ETA: ${m.policies.etaDays} days.`,
      'Buying rules:',
      ' 1. Order totals are bounded by a money guard (max ₹25,000).',
      ' 2. Every order needs HUMAN approval before payment — call propose_order and wait.',
      ' 3. All money actions are written to an audit trail with reasoning.',
      ` Payment methods: ${this.paymentMethods.join(', ')}.`,
    ].join('\n');
  }

  addToCart(productId: string, qty: number, reasoning: string): string {
    this.emitEvent('agent.tool_call', { name: 'add_to_cart', args: { product_id: productId, quantity: qty }, reasoning });
    const p = this.catalog.byId(productId);
    if (!p) return `Unknown product ${productId}.`;
    if (!Number.isInteger(qty) || qty < 1) return 'Quantity must be a positive integer.';
    if (qty > this.guard.maxQtyPerLine) {
      const msg = `Quantity ${qty} exceeds per-line cap of ${this.guard.maxQtyPerLine}.`;
      this.audit.append('agent', 'GUARD_BLOCKED', 'failed', { reasoning, blockedReason: msg, itemIds: [productId] });
      this.emitEvent('guard.blocked', { reason: msg, checks: ['Qty cap'] });
      return msg;
    }
    const existing = this.cart.lines.find((l) => l.productId === productId);
    const newQty = (existing?.qty ?? 0) + qty;
    if (newQty > this.guard.maxQtyPerLine) {
      const msg = `Cart would exceed per-line cap of ${this.guard.maxQtyPerLine} for ${p.name}.`;
      this.audit.append('agent', 'GUARD_BLOCKED', 'failed', { reasoning, blockedReason: msg, itemIds: [productId] });
      this.emitEvent('guard.blocked', { reason: msg });
      return msg;
    }
    if (this.cart.lines.length >= this.guard.maxLineItems && !existing) {
      const msg = `Cart already has the max ${this.guard.maxLineItems} line items.`;
      this.audit.append('agent', 'GUARD_BLOCKED', 'failed', { reasoning, blockedReason: msg });
      this.emitEvent('guard.blocked', { reason: msg });
      return msg;
    }
    if (p.stock < newQty) {
      const msg = `Only ${p.stock} of ${p.name} in stock (requested ${newQty}).`;
      this.audit.append('agent', 'GUARD_BLOCKED', 'failed', { reasoning, blockedReason: msg, itemIds: [productId] });
      this.emitEvent('guard.blocked', { reason: msg });
      return msg;
    }

    if (existing) {
      existing.qty = newQty;
    } else {
      this.cart.lines.push({
        productId: p.id,
        qty,
        unitPricePaise: p.pricePaise,
        name: p.name,
      });
    }
    this.recomputeCart();
    this.audit.append('agent', 'CART_ITEM_ADD', 'executed', {
      reasoning,
      itemIds: [productId],
      amountPaise: p.pricePaise * qty,
      currency: 'INR',
      guardChecks: ['Price snapshot', 'Stock', 'Qty cap', 'Line cap'],
    });
    this.emitEvent('cart.updated', { cart: this.cart });
    return `${p.name} × ${qty} added. ${formatCart(this.cart)}`;
  }

  removeFromCart(productId: string, qty: number, reasoning: string): string {
    this.emitEvent('agent.tool_call', { name: 'remove_from_cart', args: { product_id: productId, quantity: qty }, reasoning });
    const line = this.cart.lines.find((l) => l.productId === productId);
    if (!line) return `${productId} is not in the cart.`;
    line.qty -= qty;
    if (line.qty <= 0) this.cart.lines = this.cart.lines.filter((l) => l.productId !== productId);
    this.recomputeCart();
    this.audit.append('agent', 'CART_ITEM_REMOVE', 'executed', {
      reasoning,
      itemIds: [productId],
      amountPaise: line.unitPricePaise * qty,
      currency: 'INR',
    });
    this.emitEvent('cart.updated', { cart: this.cart });
    return `Removed ${qty} × ${line.name}. ${formatCart(this.cart)}`;
  }

  getCartView(): string {
    this.emitEvent('agent.tool_call', { name: 'get_cart', args: {} });
    return formatCart(this.cart);
  }

  /* ── gated money action: propose ────────────────────────────────────── */

  proposeOrder(reasoning: string): string {
    this.emitEvent('agent.tool_call', { name: 'propose_order', args: {}, reasoning });
    if (this.cart.lines.length === 0) return 'Cannot propose an empty cart.';
    if (this.order && this.order.status === 'pending_approval') {
      return 'An order is already awaiting approval. Wait for the human decision.';
    }

    const subtotal = this.cart.totalPaise;
    const m = this.catalog.merchantInfo();
    const shipping = computeShipping(
      subtotal,
      m.policies.freeShippingAbovePaise,
      m.policies.shippingFlatPaise,
    );
    const total = subtotal + shipping;

    const guard = this.guard.validateProposal(this.cart.lines, total);
    if (!guard.ok) {
      this.audit.append('agent', 'GUARD_BLOCKED', 'failed', {
        reasoning,
        blockedReason: guard.blockedReason,
        guardChecks: guard.checks,
        amountPaise: total,
        currency: 'INR',
      });
      this.emitEvent('guard.blocked', { reason: guard.blockedReason, checks: guard.checks });
      return `Order BLOCKED by money guard: ${guard.blockedReason}`;
    }

    this.order = {
      id: `ord_${randomUUID().slice(0, 10)}`,
      traceId: this.traceId,
      lines: this.cart.lines.map((l) => ({ ...l })),
      subtotalPaise: subtotal,
      shippingPaise: shipping,
      totalPaise: total,
      currency: 'INR',
      status: 'pending_approval',
    };
    this.state = 'awaiting_approval';

    this.audit.append('agent', 'ORDER_PROPOSED', 'pending', {
      reasoning,
      amountPaise: total,
      currency: 'INR',
      itemIds: this.cart.lines.map((l) => l.productId),
      guardChecks: guard.checks,
      detail: JSON.stringify({
        orderId: this.order.id,
        subtotal: subtotal,
        shipping: shipping,
      }),
    });
    this.emitEvent('order.pending_approval', { order: this.order, guardChecks: guard.checks });
    return `Order ${this.order.id} proposed (${formatInr(total)}). Pausing — waiting for human approval.`;
  }

  /* ── human gate ─────────────────────────────────────────────────────── */

  async approveOrder(reasoning = 'Human approved the proposed order.'): Promise<{ ok: boolean; order: Order | null; error?: string }> {
    if (this.state !== 'awaiting_approval' || !this.order) {
      return { ok: false, order: this.order, error: 'No order awaiting approval.' };
    }
    this.order.status = 'approved';
    this.state = 'paying';
    this.audit.append('user', 'ORDER_APPROVED', 'approved', {
      reasoning,
      amountPaise: this.order.totalPaise,
      currency: 'INR',
      itemIds: this.order.lines.map((l) => l.productId),
      detail: `orderId=${this.order.id}`,
    });
    this.emitEvent('order.approved', { order: this.order });

    // Re-validate at payment time — defends the price/stock TOCTOU window.
    const recheck = this.guard.revalidateAtPayment(this.order.lines);
    if (!recheck.ok) {
      this.order.status = 'failed';
      this.audit.append('system', 'GUARD_BLOCKED', 'failed', {
        reasoning: 'Re-validation at payment time failed.',
        blockedReason: recheck.blockedReason,
        guardChecks: recheck.checks,
      });
      this.emitEvent('guard.blocked', { reason: recheck.blockedReason, checks: recheck.checks });
      this.end('failed');
      return { ok: false, order: this.order, error: recheck.blockedReason };
    }

    // Payment with graceful recovery: one retry using a fallback method.
    let method = this.paymentMethods[0] ?? 'UPI';
    let attempt = 0;
    while (true) {
      attempt += 1;
      this.audit.append('system', 'PAYMENT_INITIATED', 'executed', {
        reasoning: `Initiating ${this.payment.provider} payment via ${method}.`,
        amountPaise: this.order.totalPaise,
        currency: 'INR',
        detail: `orderId=${this.order.id} attempt=${attempt}`,
      });
      this.emitEvent('payment.initiated', { provider: this.payment.provider, method, attempt });
      try {
        const res = await this.payment.createOrder({
          orderId: this.order.id,
          receipt: this.order.id,
          amountPaise: this.order.totalPaise,
          currency: 'INR',
          method,
          notes: { traceId: this.traceId, agent: 'ai-buyer' },
        });
        this.order.payment = {
          provider: this.payment.provider,
          paymentId: res.paymentId,
          orderId: res.rzpOrderId,
          paymentLinkUrl: res.paymentLinkUrl,
          paidAt: res.paidAt,
        };
        this.order.status = 'paid';
        this.audit.append('system', 'PAYMENT_SUCCEEDED', 'executed', {
          reasoning: `Payment succeeded via ${method} (attempt ${attempt}).`,
          amountPaise: this.order.totalPaise,
          currency: 'INR',
          guardChecks: recheck.checks,
          detail: `paymentId=${res.paymentId} provider=${this.payment.provider}`,
        });
        this.emitEvent('payment.succeeded', { order: this.order, payment: res, attempt });
        this.audit.append('system', 'ORDER_CONFIRMED', 'executed', {
          reasoning: `Order ${this.order.id} confirmed and paid.`,
          amountPaise: this.order.totalPaise,
          currency: 'INR',
          itemIds: this.order.lines.map((l) => l.productId),
        });
        this.end('complete');
        return { ok: true, order: this.order };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code = err instanceof PaymentDeclinedError ? err.code : undefined;
        this.order.payment = { provider: this.payment.provider, error: message };
        this.audit.append('system', 'PAYMENT_FAILED', 'failed', {
          reasoning: `Payment attempt ${attempt} via ${method} failed.`,
          amountPaise: this.order.totalPaise,
          currency: 'INR',
          detail: `${message}${code ? ` (${code})` : ''}`,
        });
        this.emitEvent('payment.failed', { error: message, code, attempt, method });
        // Graceful recovery: retry once with a different method.
        const canRetry = attempt === 1 && this.paymentMethods.length > 1 && this.demoFailOnce;
        if (canRetry) {
          method = this.paymentMethods[1] ?? 'Card';
          continue;
        }
        this.order.status = 'failed';
        this.end('failed');
        return { ok: false, order: this.order, error: message };
      }
    }
  }

  denyOrder(reason: string): { ok: boolean; message: string } {
    if (this.state !== 'awaiting_approval' || !this.order) {
      return { ok: false, message: 'No order awaiting approval.' };
    }
    this.order.status = 'denied';
    this.audit.append('user', 'ORDER_DENIED', 'denied', {
      reasoning: reason || 'Human denied the order.',
      amountPaise: this.order.totalPaise,
      currency: 'INR',
      itemIds: this.order.lines.map((l) => l.productId),
      detail: `orderId=${this.order.id}`,
    });
    this.emitEvent('order.denied', { order: this.order, reason });
    // Return to running so the agent can adjust (e.g., drop items / change picks).
    this.state = 'running';
    return { ok: true, message: 'Order denied. The agent can now adjust and re-propose.' };
  }

  /* ── helpers ────────────────────────────────────────────────────────── */

  private recomputeCart(): void {
    let total = 0;
    for (const l of this.cart.lines) total += l.unitPricePaise * l.qty;
    this.cart.totalPaise = total;
  }

  /** Public audit snapshot for the UI. */
  auditSnapshot(): AuditEntry[] {
    return this.audit.all();
  }

  /** Cart snapshot typed for the UI. */
  cartSnapshot(): { lines: CartLine[]; totalPaise: number; totalFormatted: string } {
    return {
      lines: this.cart.lines,
      totalPaise: this.cart.totalPaise,
      totalFormatted: formatInr(this.cart.totalPaise),
    };
  }
}
