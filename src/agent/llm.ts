import type { AppConfig } from '../config.js';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface CompletionResult {
  message: ChatMessage;
  finishReason: string;
}

export interface CompleteOptions {
  cfg: AppConfig;
  messages: ChatMessage[];
  tools?: ToolDef[];
  maxTokens?: number;
}

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/**
 * Minimal OpenAI-compatible chat-completions client (native fetch, no SDK).
 * Any provider exposing POST /chat/completions works: OpenAI, OpenRouter,
 * Together, Groq, Ollama (OpenAI mode), a local proxy, etc.
 */
export async function complete(opts: CompleteOptions): Promise<CompletionResult> {
  const { cfg, messages, tools, maxTokens = 1200 } = opts;
  const url = `${cfg.llm.baseUrl}/chat/completions`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.llm.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.llm.model,
        messages,
        tools,
        tool_choice: tools && tools.length ? 'auto' : undefined,
        max_tokens: maxTokens,
        temperature: 0.4,
      }),
    });
  } catch (e) {
    throw new LlmError(`Could not reach ${url}: ${(e as Error).message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new LlmError(`LLM API ${res.status}: ${text.slice(0, 300)}`, res.status);
  }

  const body = (await res.json()) as {
    choices?: Array<{
      message: ChatMessage;
      finish_reason: string;
    }>;
  };
  const choice = body.choices?.[0];
  if (!choice) throw new LlmError('LLM API returned no choices.');

  return {
    message: {
      role: 'assistant',
      content: choice.message.content,
      tool_calls: choice.message.tool_calls,
    },
    finishReason: choice.finish_reason,
  };
}
