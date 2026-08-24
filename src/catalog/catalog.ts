import { MERCHANT, PRODUCTS } from './products.js';
import type { Product } from '../types.js';

/**
 * CatalogService — reads the merchant catalog and answers agent queries.
 *
 * The catalog is deliberately exposed in three ways (see serialize.ts):
 *  1. compact structured JSON  → for tool-calling agents
 *  2. llms.txt + agent.json    → for discovery ("can this store be bought from?")
 *  3. JSON-LD product pages    → for crawlers / semantic consumers
 */
export class CatalogService {
  private readonly products: Product[];

  constructor(products: Product[] = PRODUCTS) {
    this.products = products;
  }

  all(): Product[] {
    return this.products;
  }

  byId(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  /** In-stock only — agents must never be shown out-of-stock items as buyable. */
  buyable(): Product[] {
    return this.products.filter((p) => p.stock > 0);
  }

  /**
   * Lightweight lexical search over name, tags, attributes and blurb.
   * Good enough for the heuristic buyer and as a coarse filter for the LLM buyer.
   */
  search(query: string): Product[] {
    const q = query.toLowerCase();
    const terms = q
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const score = (p: Product): number => {
      const name = p.name.toLowerCase();
      const tags = p.tags.join(' ').toLowerCase();
      const meta = `${p.brand} ${p.category} ${p.attributes.map((a) => `${a.key} ${a.value}`).join(' ')}`.toLowerCase();
      const body = `${p.description} ${p.agentBlurb}`.toLowerCase();
      let s = 0;
      for (const t of terms) {
        if (name.includes(t)) s += 3;
        if (tags.includes(t)) s += 2;
        if (meta.includes(t)) s += 2;
        if (body.includes(t)) s += 1;
      }
      return s;
    };

    return this.products
      .map((p) => ({ p, s: score(p) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.p);
  }

  merchantInfo() {
    return MERCHANT;
  }
}
