import { config } from '../config.js';
import { complete, LlmError, type ChatMessage } from './llm.js';
import { dispatchTool, TOOL_DEFS } from './tools.js';
import { runHeuristicBuyer } from './heuristic.js';
import type { BuyerSession } from './session.js';

const SYSTEM_PROMPT = `You are Volt-Go, a capable AI shopping agent working for a customer at "Volt & Co.", an Indian electronics & workspace store.

YOUR JOB
- Fulfil the customer's shopping mission as well as you can.
- Prices are in Indian Rupees, expressed in PAISE (100 paise = 1 INR).

HOW TO WORK
1. Use search_catalog to find products. Prefer in-stock items with a good match.
2. Use view_policies at least once so you know shipping & buying rules.
3. Use get_product when you need full details before deciding.
4. Add chosen items with add_to_cart.
5. When the cart is final, call propose_order and then STOP and wait.

MONEY RULES (non-negotiable)
- add_to_cart does NOT charge anyone. Only propose_order moves toward payment.
- propose_order is gated: a human must approve the charge, and a money guard re-validates bounds (max ₹25,000 total, max 5 per line, price/stock snapshots).
- Never claim a charge succeeded — you only propose.
- If the guard blocks or a human denies, adjust your cart and re-propose.

STYLE
- Be concise. One short line of reasoning before tool calls is plenty.
- Only use tools that move the mission forward; do not call tools for their own sake.
- When you call propose_order, keep it the LAST action.`;

export interface RunContext {
  messages: ChatMessage[];
  turn: number;
}

export function createRunContext(mission: string): RunContext {
  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: mission },
    ],
    turn: 0,
  };
}

const MAX_TURNS = 12;

/**
 * Run the LLM tool-calling loop. Stops early when:
 *  - the agent calls propose_order (human gate engaged), or
 *  - max turns are hit, or
 *  - the LLM errors (we fall back to the deterministic heuristic buyer).
 */
export async function runLlmBuyer(session: BuyerSession, ctx: RunContext): Promise<void> {
  while (ctx.turn < MAX_TURNS) {
    if (session.state === 'awaiting_approval') return;
    if (session.state === 'complete' || session.state === 'failed') return;
    ctx.turn += 1;

    let res;
    try {
      res = await complete({ cfg: config, messages: ctx.messages, tools: TOOL_DEFS });
    } catch (err) {
      const msg = err instanceof LlmError ? err.message : (err as Error).message;
      session.emitThinking(`[LLM unavailable — ${msg}] Falling back to the deterministic heuristic buyer.`);
      session.audit.append('system', 'AGENT_DECISION', 'failed', {
        reasoning: `LLM planner failed (${msg}); switched to heuristic planner.`,
      });
      await runHeuristicBuyer(session, session.mission);
      return;
    }

    if (res.message.content) {
      session.emitMessage(res.message.content);
    }

    if (res.message.tool_calls && res.message.tool_calls.length > 0) {
      ctx.messages.push({
        role: 'assistant',
        content: res.message.content,
        tool_calls: res.message.tool_calls,
      });
      for (const tc of res.message.tool_calls) {
        const name = tc.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          /* malformed args — tool will report back */
        }
        // Distinct reasoning per tool call so each audited action is specific.
        const content = res.message.content;
        const multi = res.message.tool_calls.length > 1;
        const reasoning = content
          ? (multi ? `${content} → ${name}(${tc.function.arguments})` : content)
          : `${name}(${tc.function.arguments})`;
        let out: string;
        try {
          out = await dispatchTool(session, name, args, reasoning);
        } catch (e) {
          out = `Tool error: ${(e as Error).message}`;
        }
        session.emitToolResult(name, out);
        ctx.messages.push({ role: 'tool', tool_call_id: tc.id, content: out });

        if (name === 'propose_order') {
          session.emitThinking('Order proposed — waiting for human approval.');
          return;
        }
      }
      continue;
    }

    // No tool call → the agent chose to stop (or finished reasoning).
    if (res.finishReason === 'stop') {
      if (session.cart.lines.length > 0) {
        session.emitThinking('Agent finished without proposing. Proposing the current cart for approval.');
        session.proposeOrder('Agent completed its reasoning with a non-empty cart; proposing for approval.');
      } else {
        session.emitThinking('Agent finished with an empty cart — nothing to buy.');
      }
      return;
    }
  }
  session.emitThinking(`Reached max turns (${MAX_TURNS}) — stopping.`);
}

/** Continue an existing run after a human denial, feeding the reason back. */
export async function continueLlmBuyer(session: BuyerSession, ctx: RunContext, userText: string): Promise<void> {
  ctx.messages.push({ role: 'user', content: userText });
  await runLlmBuyer(session, ctx);
}
