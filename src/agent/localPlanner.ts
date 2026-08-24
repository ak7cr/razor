import { formatInr } from '../catalog/serialize.js';
import type { BuyerSession } from './session.js';

const MAX_ITEMS = 2;
/**
 * Similarity floors for the local subword-embedding model.
 * Empirically valid product queries score ≥ ~0.43, nonsense/synonym-only
 * queries ~0.25. We keep a candidate only if it is at least MIN_SIMILARITY AND
 * within 82% of the top match — true multi-item missions ("mouse + desk mat")
 * are kept, while loosely-related items are dropped, and weak queries fail
 * honestly.
 */
const MIN_SIMILARITY = 0.3;
const TOP_RELATIVE_CUTOFF = 0.82;

/**
 * runLocalBuyer — the offline fallback planner.
 *
 * Instead of hand-written keyword rules, it is driven by the LocalRetriever
 * (src/ml/embedding.ts): a real, dependency-free subword-embedding model that
 * is *trained on the merchant catalog*. Queries are matched by vector cosine
 * similarity, so typos, inflections and compound terms still retrieve the
 * right products — no network, no API key, fully deterministic.
 */
export async function runLocalBuyer(session: BuyerSession, mission: string): Promise<void> {
  session.emitThinking('[offline planner] Local semantic model active (no cloud LLM configured).');

  const budget = parseBudget(mission);
  if (Number.isFinite(budget)) {
    session.emitThinking(`[offline planner] Budget detected: ${formatInr(budget * 100)}.`);
  }

  const ranked = session.catalog.searchScored(mission);
  const top = ranked[0];
  if (!top || top.score < MIN_SIMILARITY) {
    session.emitThinking('[offline planner] No products matched the mission semantically.');
    return;
  }
  const cutoff = Math.max(MIN_SIMILARITY, top.score * TOP_RELATIVE_CUTOFF);
  const candidates = ranked.filter((s) => s.score >= cutoff);
  session.emitThinking(
    `[offline planner] Top semantic match: ${top.product.name} (similarity ${top.score.toFixed(3)}); keeping ${candidates.length} candidate(s) above the cutoff.`,
  );

  const chosen: string[] = [];
  for (const { product, score } of candidates) {
    if (chosen.length >= MAX_ITEMS) break;
    if (product.stock <= 0 || chosen.includes(product.id)) continue;
    if (Number.isFinite(budget) && session.cart.totalPaise + product.pricePaise > budget * 100) {
      session.emitThinking(`[offline planner] Skipping ${product.name} (${formatInr(product.pricePaise)}) — over budget.`);
      continue;
    }
    const reasoning = `Semantic match for the mission (similarity ${score.toFixed(2)}): ${product.name} (${product.id}) at ${formatInr(product.pricePaise)}.`;
    const out = session.addToCart(product.id, 1, reasoning);
    session.emitToolResult('add_to_cart', out);
    chosen.push(product.id);
  }

  if (session.cart.lines.length === 0) {
    session.emitThinking('[offline planner] No buyable items matched the mission.');
    return;
  }

  session.emitThinking('[offline planner] Cart complete — proposing the gated order.');
  session.proposeOrder('Cart satisfies the mission (local semantic retrieval). Proposing for human approval.');
}

function parseBudget(mission: string): number {
  const m = mission.match(
    /(?:under|below|max(?:imum)?|budget(?:\s+of)?|less than|within|around)\s*(?:₹|rs\.?\s*)?([\d,]+)/i,
  );
  if (!m) return Infinity;
  const n = parseInt(m[1]!.replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : Infinity;
}
