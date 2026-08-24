import type { ToolDef } from './llm.js';
import type { Cart } from '../types.js';
import { formatInr } from '../catalog/serialize.js';

/**
 * The surface an AI buyer agent can act on. Implemented by BuyerSession
 * (see session.ts). Money is deliberately NOT directly reachable: the agent can
 * build a cart and *propose* an order, but charging requires a human approval
 * gate + the money guard. This interface keeps tools.ts free of a circular
 * import with session.ts.
 */
export interface BuyerSessionApi {
  searchCatalog(query: string): string;
  getProduct(id: string): string;
  viewPolicies(): string;
  addToCart(productId: string, qty: number, reasoning: string): string;
  removeFromCart(productId: string, qty: number, reasoning: string): string;
  getCartView(): string;
  proposeOrder(reasoning: string): string;
  cart: Cart;
}

/** Tool definitions exposed to the LLM. */
export const TOOL_DEFS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'search_catalog',
      description:
        'Search the merchant catalog by keywords (category, product type, brand, feature). Returns matching buyable products with id, name, price and stock. Use before choosing items.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Search keywords, e.g. "mechanical keyboard" or "audio under 3000"' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product',
      description: 'Get full structured details (attributes, policy, blurb) for a single product id.',
      parameters: {
        type: 'object',
        properties: { product_id: { type: 'string', description: 'Product id from search_catalog.' } },
        required: ['product_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'view_policies',
      description: 'View merchant shipping, returns, currency and buying rules. Call at least once before proposing an order.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_to_cart',
      description:
        'Add a product to the draft cart. NOT a charge — nothing is billed until the order is proposed and a human approves it. Quantity is capped by the money guard.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string' },
          quantity: { type: 'integer', description: 'How many units (1–5).' },
        },
        required: ['product_id', 'quantity'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_from_cart',
      description: 'Remove a product (or reduce quantity) from the draft cart.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string' },
          quantity: { type: 'integer', description: 'Units to remove. Removes the line if it reaches 0.' },
        },
        required: ['product_id', 'quantity'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cart',
      description: 'Return the current draft cart contents and total.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_order',
      description:
        'Propose the current cart as a final order for payment. This is the ONLY way to move toward charging money. It is gated: a human must approve, and the money guard re-validates. After calling this, pause and wait for approval.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

export const TOOL_NAMES = TOOL_DEFS.map((t) => t.function.name);

/** Formats a cart for an LLM (prices in paise + formatted INR). */
export function formatCart(cart: Cart): string {
  if (cart.lines.length === 0) return 'Cart is empty.';
  const rows = cart.lines
    .map((l) => `- ${l.qty} × ${l.name} (${l.productId}) @ ${l.unitPricePaise} paise = ${l.qty * l.unitPricePaise} paise (${formatInr(l.qty * l.unitPricePaise)})`)
    .join('\n');
  return `${rows}\nSubtotal: ${cart.totalPaise} paise (${formatInr(cart.totalPaise)})`;
}

/**
 * Dispatch a parsed tool call onto the session. This is the single choke point
 * through which the LLM can act — and it deliberately exposes no tool that can
 * charge money. The furthest a tool can go is `propose_order` (gated).
 */
export async function dispatchTool(
  session: BuyerSessionApi,
  name: string,
  args: Record<string, unknown>,
  reasoning: string,
): Promise<string> {
  switch (name) {
    case 'search_catalog':
      return session.searchCatalog(String(args.query ?? ''));
    case 'get_product':
      return session.getProduct(String(args.product_id ?? ''));
    case 'view_policies':
      return session.viewPolicies();
    case 'add_to_cart':
      return session.addToCart(String(args.product_id ?? ''), Number(args.quantity) || 1, reasoning);
    case 'remove_from_cart':
      return session.removeFromCart(String(args.product_id ?? ''), Number(args.quantity) || 1, reasoning);
    case 'get_cart':
      return session.getCartView();
    case 'propose_order':
      return session.proposeOrder(reasoning);
    default:
      return `Unknown tool: ${name}. Available: ${TOOL_NAMES.join(', ')}`;
  }
}
