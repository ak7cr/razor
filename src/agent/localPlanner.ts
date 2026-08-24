import { formatInr } from '../catalog/serialize.js';
import type { BuyerSession } from './session.js';

const MAX_ITEMS = 3;
/** Floor for cosine similarity — avoid buying random items on a nonsense query. */
const MIN_SIMILARITY = 0.02;

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
  if (ranked.length === 0 || ranked[0]!.score < MIN_SIMILARITY) {
    session.emitThinking('[offline planner] No products matched the mission semantically.');
    return;
  }
  session.emitThinking(
    `[offline planner] Top semantic match: ${ranked[0]!.product.name} (similarity ${ranked[0]!.score.toFixed(3)}).`,
  );

  const chosen: string[] = [];
  for (const { product, score } of ranked) {
    if (chosen.length >= MAX_ITEMS) break;
    if (product.stock <= 0 || chosen.includes(product.id)) continue;
    if (score < MIN_SIMILARITY) continue;
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
