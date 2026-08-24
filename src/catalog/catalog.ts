import { MERCHANT, PRODUCTS } from './products.js';
import type { Product } from '../types.js';
import { LocalRetriever, type Scored } from '../ml/embedding.js';

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
  private readonly retriever = new LocalRetriever();

  constructor(products: Product[] = PRODUCTS) {
    this.products = products;
    this.retriever.fit(products);
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
   * Semantic search over the catalog using the local embedding model.
   * Ranks by vector cosine similarity (handles typos, inflections, compounds).
   */
  searchScored(query: string, topK = 8): Scored[] {
    return this.retriever.search(this.products, query, topK);
  }

  /** Ranked products — convenience wrapper for tools + the offline planner. */
  search(query: string): Product[] {
    return this.searchScored(query).map((s) => s.product);
  }

  merchantInfo() {
    return MERCHANT;
  }
}
