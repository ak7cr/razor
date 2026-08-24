import type { Product } from '../types.js';

const DIM = 256;

/** FNV-1a → [0, mod). */
function hashMod(s: string, mod: number): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % mod;
}

/** Subword features: character n-grams (with boundary markers) + whole words. */
function ngrams(text: string, n = 3): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    const t = `^${w}$`;
    for (let i = 0; i + n <= t.length; i++) out.push(t.slice(i, i + n));
    out.push(w); // whole-word feature (helps short words / brands)
  }
  return out;
}

function normalize(v: Float64Array): Float64Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i]! * v[i]!;
  norm = Math.sqrt(norm);
  if (norm < 1e-9) return v;
  for (let i = 0; i < v.length; i++) v[i] = v[i]! / norm;
  return v;
}

export interface Scored {
  product: Product;
  score: number;
}

/**
 * LocalRetriever — a tiny, dependency-free **subword-embedding model**.
 *
 * It "trains" (fits) on the merchant catalog by hashing character n-grams into
 * fixed-dimension signed vectors, then answers queries by cosine similarity.
 *
 * This is the ML fallback that runs when no cloud LLM is configured: real
 * vector semantics (handles typos, inflections, compound terms) with zero
 * network, zero API key, and fully deterministic output — the right tool for
 * an offline, demo-safe recovery path.
 */
export class LocalRetriever {
  private vectors = new Map<string, Float64Array>();

  fit(products: Product[]): void {
    for (const p of products) {
      const text = [
        p.name,
        p.brand,
        p.category,
        p.description,
        p.agentBlurb,
        ...p.tags,
        ...p.attributes.map((a) => `${a.key} ${a.value}`),
      ].join(' ');
      this.vectors.set(p.id, this.embed(text));
    }
  }

  /** Hash-embed arbitrary text into a unit vector. */
  embed(text: string): Float64Array {
    const v = new Float64Array(DIM);
    for (const g of ngrams(text)) {
      const idx = hashMod(g, DIM);
      const sign = hashMod(g + '\u0001', 2) === 0 ? 1 : -1; // signed hashing
      v[idx] = (v[idx] ?? 0) + sign;
    }
    return normalize(v);
  }

  cosine(a: Float64Array, b: Float64Array): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
    return dot;
  }

  /** Rank products by semantic similarity to the query. */
  search(products: Product[], query: string, topK = 8): Scored[] {
    const qv = this.embed(query);
    return products
      .map((p) => ({
        product: p,
        score: this.vectors.has(p.id) ? this.cosine(this.vectors.get(p.id)!, qv) : 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
