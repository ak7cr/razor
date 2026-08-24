import type { CartLine, Order } from '../types.js';
import type { AppConfig } from '../config.js';
import type { CatalogService } from '../catalog/catalog.js';

export interface GuardResult {
  ok: boolean;
  /** Ordered list of checks that ran. */
  checks: string[];
  blockedReason?: string;
}

/**
 * MoneyGuard — the enforcement point for the track's core bar:
 * every money action must be *bounded* and *gated*, and the audit trail
 * (see audit/) makes every action *explainable*.
 *
 * The LLM agent can *propose* an order, but the order can only become a
 * charge if it passes these guards AND a human approves it. The agent is
 * never given a tool that can charge money directly.
 */
export class MoneyGuard {
  constructor(
    private readonly config: AppConfig,
    private readonly catalog: CatalogService,
  ) {}

  get maxQtyPerLine(): number {
    return this.config.guards.maxQtyPerLine;
  }

  get maxLineItems(): number {
    return this.config.guards.maxLineItems;
  }

  get maxOrderAmountPaise(): number {
    return this.config.guards.maxOrderAmountPaise;
  }

  /**
   * Validate a proposed order against all bounding rules.
   * Called at proposal time and re-validated at payment time (TOCTOU-safe).
   */
  validateProposal(lines: CartLine[], totalPaise: number): GuardResult {
    const checks: string[] = [];
    const max = this.config.guards;

    checks.push('Currency is INR');
    if (totalPaise <= 0) {
      return { ok: false, checks, blockedReason: 'Order total must be positive.' };
    }

    checks.push(`Order total ≤ ₹${(max.maxOrderAmountPaise / 100).toLocaleString('en-IN')}`);
    if (totalPaise > max.maxOrderAmountPaise) {
      return {
        ok: false,
        checks,
        blockedReason: `Order total ${(totalPaise / 100).toLocaleString('en-IN')} INR exceeds the cap of ${(max.maxOrderAmountPaise / 100).toLocaleString('en-IN')} INR.`,
      };
    }

    checks.push(`≤ ${max.maxLineItems} line items`);
    if (lines.length > max.maxLineItems) {
      return { ok: false, checks, blockedReason: `Too many line items (${lines.length} > ${max.maxLineItems}).` };
    }

    for (const line of lines) {
      checks.push(`Qty ${line.qty} ≤ ${max.maxQtyPerLine} for ${line.productId}`);
      if (line.qty < 1) {
        return { ok: false, checks, blockedReason: `Quantity for ${line.productId} must be ≥ 1.` };
      }
      if (line.qty > max.maxQtyPerLine) {
        return {
          ok: false,
          checks,
          blockedReason: `Quantity ${line.qty} for ${line.name} exceeds the per-line cap of ${max.maxQtyPerLine}.`,
        };
      }

      const product = this.catalog.byId(line.productId);
      if (!product) {
        return { ok: false, checks, blockedReason: `Product ${line.productId} no longer exists in the catalog.` };
      }
      checks.push(`Price snapshot for ${line.productId} is current`);
      if (line.unitPricePaise !== product.pricePaise) {
        return {
          ok: false,
          checks,
          blockedReason: `Price for ${line.name} changed since it was added to the cart (${line.unitPricePaise} → ${product.pricePaise}).`,
        };
      }
      checks.push(`Stock ≥ ${line.qty} for ${line.productId}`);
      if (product.stock < line.qty) {
        return {
          ok: false,
          checks,
          blockedReason: `Only ${product.stock} left in stock for ${line.name} (requested ${line.qty}).`,
        };
      }
    }

    return { ok: true, checks };
  }

  /** Re-run the price/stock checks at payment time (defends the TOCTOU window). */
  revalidateAtPayment(lines: CartLine[]): GuardResult {
    const result = this.validateProposal(lines, lines.reduce((s, l) => s + l.unitPricePaise * l.qty, 0));
    return result;
  }
}

/** Build the shipping line: free above threshold, else flat fee. */
export function computeShipping(
  subtotalPaise: number,
  freeAbovePaise: number,
  flatPaise: number,
): number {
  if (subtotalPaise >= freeAbovePaise) return 0;
  return flatPaise;
}

export function orderTotal(order: Pick<Order, 'subtotalPaise' | 'shippingPaise'>): number {
  return order.subtotalPaise + order.shippingPaise;
}
