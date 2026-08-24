import { MERCHANT } from './products.js';
import type { Product } from '../types.js';

/**
 * Serializers that make the merchant *agent-readable* — this is the
 * "sellable to AI buyers" half of the track.
 */

/** Compact, structured catalog — the primary payload for tool-calling agents. */
export function compactCatalog(products: Product[]) {
  return {
    merchant: {
      name: MERCHANT.name,
      tagline: MERCHANT.tagline,
      domain: MERCHANT.domain,
      currency: MERCHANT.currency,
      policies: MERCHANT.policies,
    },
    schema:
      'Product = { id, name, brand, category, description, pricePaise (1 INR = 100 paise), currency, stock, tags[], attributes[], policy{returnDays, etaDays}, agentBlurb }',
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      description: p.description,
      pricePaise: p.pricePaise,
      priceFormatted: formatInr(p.pricePaise),
      currency: p.currency,
      stock: p.stock,
      tags: p.tags,
      attributes: p.attributes,
      policy: p.policy,
      agentBlurb: p.agentBlurb,
    })),
  };
}

/**
 * llms.txt for the store — lets an AI agent discover, in prose, that this
 * merchant exists, what it sells and how to buy from it.
 */
export function llmsTxt(products: Product[]): string {
  const lines: string[] = [];
  lines.push(`# ${MERCHANT.name}`);
  lines.push(`> ${MERCHANT.tagline}`);
  lines.push('');
  lines.push(`Domain: ${MERCHANT.domain}`);
  lines.push(`Currency: ${MERCHANT.currency}`);
  lines.push(
    `Shipping: free above ${formatInr(MERCHANT.policies.freeShippingAbovePaise)}, else flat ${formatInr(MERCHANT.policies.shippingFlatPaise)}.`,
  );
  lines.push(`Returns: within ${MERCHANT.policies.returnDays} days. Delivery ETA: ${MERCHANT.policies.etaDays} days.`);
  lines.push('');
  lines.push('This store is buyable by AI agents. To buy:');
  lines.push('1. GET /api/catalog/agent  → the structured product catalog.');
  lines.push('2. Choose product ids and quantities.');
  lines.push('3. Call the merchant checkout (POST /api/orders) to create a payment.');
  lines.push('4. Every charge is gated by human approval and logged to an audit trail.');
  lines.push('');
  lines.push('## Products');
  for (const p of products) {
    lines.push(
      `- [${p.name}](${MERCHANT.domain}/products/${p.id}.jsonld) — ${p.agentBlurb} (${formatInr(p.pricePaise)}, ${p.stock} in stock)`,
    );
  }
  lines.push('');
  lines.push(`## Agent manifest`);
  lines.push(`- ${MERCHANT.domain}/agent.json — capability + policy manifest for AI buyers.`);
  lines.push(`- ${MERCHANT.domain}/api/catalog/agent — machine-readable catalog.`);
  return lines.join('\n');
}

/** Schema.org Product (JSON-LD) for a single product page. */
export function productJsonLd(p: Product): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${MERCHANT.domain}/products/${p.id}`,
    name: p.name,
    brand: { '@type': 'Brand', name: p.brand },
    category: p.category,
    description: p.description,
    sku: p.id,
    offers: {
      '@type': 'Offer',
      priceCurrency: p.currency,
      price: (p.pricePaise / 100).toFixed(2),
      availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        deliveryTime: { '@type': 'QuantitativeValue', value: p.policy.etaDays, unitCode: 'DAY' },
      },
    },
    additionalProperty: p.attributes.map((a) => ({
      '@type': 'PropertyValue',
      name: a.label,
      value: a.value,
    })),
  };
}

/**
 * agent.json — a tiny, self-describing manifest an AI buyer can fetch to learn
 * the store's capabilities and buying policies in one round-trip.
 */
export function agentManifest(): Record<string, unknown> {
  return {
    name: MERCHANT.name,
    about: MERCHANT.tagline,
    currency: MERCHANT.currency,
    isBuyableByAgents: true,
    endpoints: {
      catalog: { method: 'GET', path: '/api/catalog/agent', mediaType: 'application/json' },
      productPage: { method: 'GET', path: '/api/catalog/products/:id', mediaType: 'application/ld+json' },
      createOrder: { method: 'POST', path: '/api/orders', note: 'Requires human approval; amount is bounded; audited.' },
    },
    policies: MERCHANT.policies,
    buyingRules: [
      'Prices are in INR (paise). 100 paise = 1 INR.',
      'Every order must be approved by a human before payment is initiated.',
      'Order totals are bounded by a maximum amount; over-limit orders are rejected by the money guard.',
      'Quantity per line item is capped.',
      'All money actions are written to an append-only audit trail with reasoning.',
    ],
  };
}

export function formatInr(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}
