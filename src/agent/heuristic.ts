import { formatInr } from '../catalog/serialize.js';
import type { BuyerSession } from './session.js';

const STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'from', 'that', 'this', 'buy', 'me', 'please',
  'want', 'need', 'some', 'good', 'a', 'an', 'to', 'of', 'my', 'i', 'would',
  'like', 'under', 'below', 'max', 'maximum', 'budget', 'less', 'than', 'within',
  'rs', 'inr', 'cheap', 'nice', 'great', 'can', 'you', 'get', 'also', 'items',
  'item', 'things', 'something',
]);

/**
 * Deterministic buyer used when no LLM API key is configured — so the whole
 * demo runs offline and judges always see a full, working transaction.
 *
 * This also doubles as a nice "where we chose NOT to use AI" story: the money
 * path is policy-driven and deterministic regardless of which planner is on.
 */
export async function runHeuristicBuyer(session: BuyerSession, mission: string): Promise<void> {
  session.emitThinking('[heuristic planner] Parsing mission for products & budget…');

  const budget = parseBudget(mission);
  if (Number.isFinite(budget)) {
    session.emitThinking(`[heuristic planner] Budget detected: ${formatInr(budget * 100)}.`);
  }

  const keywords = extractKeywords(mission);
  if (keywords.length === 0) {
    session.emitThinking('Could not extract any product keywords from the mission.');
    return;
  }
  session.emitThinking(`[heuristic planner] Keywords: ${keywords.join(', ')}`);

  const added: string[] = [];
  for (const kw of keywords) {
    if (added.length >= 3) break;
    const hits = session.catalog.search(kw).filter((p) => !added.includes(p.id) && p.stock > 0);
    if (hits.length === 0) {
      session.emitThinking(`[heuristic planner] No match for "${kw}".`);
      continue;
    }
    const pick = hits[0]!;
    if (Number.isFinite(budget) && session.cart.totalPaise + pick.pricePaise > budget * 100) {
      session.emitThinking(`[heuristic planner] Skipping ${pick.name} (${formatInr(pick.pricePaise)}) — over budget.`);
      continue;
    }
    const reasoning = `Mission asked for "${kw}". Best match: ${pick.name} (${pick.id}) at ${formatInr(pick.pricePaise)}, ${pick.stock} in stock.`;
    const out = session.addToCart(pick.id, 1, reasoning);
    session.emitToolResult('add_to_cart', out);
    added.push(pick.id);
  }

  if (session.cart.lines.length === 0) {
    session.emitThinking('[heuristic planner] No buyable items matched the mission.');
    return;
  }

  session.emitThinking('[heuristic planner] Cart complete — proposing the order (gated).');
  session.proposeOrder('Cart satisfies the mission. Proposing for human approval.');
}

function extractKeywords(mission: string): string[] {
  const tokens = mission
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return [...new Set(tokens)].slice(0, 4);
}

function parseBudget(mission: string): number {
  const m = mission.match(
    /(?:under|below|max(?:imum)?|budget(?:\s+of)?|less than|within)\s*(?:₹|rs\.?\s*)?([\d,]+)/i,
  );
  if (!m) return Infinity;
  const n = parseInt(m[1]!.replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : Infinity;
}
