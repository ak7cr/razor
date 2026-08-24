/**
 * Shared domain types for the AI Buyer demo.
 *
 * The key idea (Track 01 — "make a merchant transactable by an AI buyer end to end"):
 * every money action in the system is *bounded*, *gated*, and *explainable*, and is
 * written to an append-only audit trail.
 */

/* ── Catalog ──────────────────────────────────────────────────────────── */

export interface ProductAttribute {
  key: string;
  label: string;
  value: string;
}

/** A merchant product, in a form an AI agent can consume directly. */
export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  /** Price in paise (Razorpay convention). */
  pricePaise: number;
  currency: 'INR';
  stock: number;
  /** Free-form tags the agent can use for matching. */
  tags: string[];
  attributes: ProductAttribute[];
  /** Shipping + return policies, expressed as agent-readable facts. */
  policy: {
    freeShippingAbovePaise: number;
    returnDays: number;
    etaDays: number;
  };
  /** A short "sellable" blurb optimised for agents, not humans. */
  agentBlurb: string;
}

/* ── Money actions & audit trail ──────────────────────────────────────── */

export type MoneyActionType =
  | 'CART_ITEM_ADD'
  | 'CART_ITEM_REMOVE'
  | 'ORDER_PROPOSED'
  | 'ORDER_APPROVED'
  | 'ORDER_DENIED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'ORDER_CONFIRMED'
  | 'RECEIPT_EMAILED'
  | 'AGENT_DECISION'
  | 'GUARD_BLOCKED';

export type MoneyActionStatus = 'pending' | 'approved' | 'denied' | 'executed' | 'failed';

/**
 * A single, self-describing record of one money action (or guard decision).
 * The audit trail is a sequence of these; each one carries the reasoning so an
 * external reviewer can replay *why* a charge happened.
 */
export interface AuditEntry {
  /** Human-ordered sequence id in this session. */
  seq: number;
  traceId: string;
  ts: string; // ISO timestamp
  actor: 'agent' | 'user' | 'system';
  type: MoneyActionType;
  status: MoneyActionStatus;
  /** What changed, in money terms. */
  amountPaise?: number;
  currency?: 'INR';
  /** Item ids involved, if any. */
  itemIds?: string[];
  /** Free-text justification produced by the agent (explainability). */
  reasoning: string;
  /** The guard checks that were applied and passed. */
  guardChecks?: string[];
  /** Extra context (order id, payment id, error message, …). */
  detail?: string;
  /** When the guard blocked something, why. */
  blockedReason?: string;
}

/* ── Cart & order ─────────────────────────────────────────────────────── */

export interface CartLine {
  productId: string;
  qty: number;
  /** Unit price snapshot at add time — price changes never silently hit a cart. */
  unitPricePaise: number;
  name: string;
}

export interface Cart {
  lines: CartLine[];
  totalPaise: number;
}

export interface Order {
  id: string;
  traceId: string;
  lines: CartLine[];
  subtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  currency: 'INR';
  status:
    | 'pending_approval'
    | 'approved'
    | 'paid'
    | 'payment_initiated'
    | 'denied'
    | 'failed';
  payment?: {
    provider: 'mock' | 'razorpay';
    paymentId?: string;
    orderId?: string;
    paymentLinkUrl?: string;
    paidAt?: string;
    error?: string;
  };
}

/* ── Agent session events (SSE to the UI) ─────────────────────────────── */

export type SessionEventType =
  | 'agent.thinking'
  | 'agent.tool_call'
  | 'agent.tool_result'
  | 'agent.message'
  | 'cart.updated'
  | 'order.pending_approval'
  | 'order.approved'
  | 'order.denied'
  | 'payment.initiated'
  | 'payment.link_created'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'receipt.sent'
  | 'guard.blocked'
  | 'audit.appended'
  | 'session.ended';

export interface SessionEvent {
  type: SessionEventType;
  ts: string;
  /** Optional payload rendered by the UI. */
  data?: unknown;
}
