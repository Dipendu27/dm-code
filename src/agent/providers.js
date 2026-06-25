// DM Code — Multi-Provider API Client
// Routes streaming calls to the correct SDK based on selected model/provider

import { getModelById, ANNIHILATOR_SYSTEM_PROMPT, MAX_TOKENS, OLLAMA_BASE_URL } from '../config/constants.js';
import { getApiKey } from '../config/settings.js';

// ─── Streaming result shape returned to loop.js ───────────────────────────────
// { stopReason, toolCalls, textOutput, usage }

// Client cache — reuse SDK instances for connection pooling
const _clientCache = {};

const REQUEST_TIMEOUT_MS = 60_000; // 60s timeout per API call

export class ProviderClient {
  constructor(modelId) {
    this.model  = getModelById(modelId);
    this.apiKey = getApiKey(this.model.provider);
  }

  // ── Main stream call — dispatches per provider ────────────────────────────
  async streamMessage({ messages, tools, signal }) {
    if (!this.apiKey) {
      throw new Error(
        `No API key for ${this.model.providerLabel}.\n` +
        `  Run: dmcode keys set ${this.model.provider} YOUR_KEY\n` +
        `  Or:  export ${this.model.apiKeyEnv}=YOUR_KEY`
      );
    }

    switch (this.model.provider) {
      case 'anthropic': return this._streamAnthropic(messages, tools, signal);
      case 'google':    return this._streamGoogle(messages, tools, signal);
      case 'groq':      return this._streamGroq(messages, tools, signal);
      case 'mistral':   return this._streamMistral(messages, tools, signal);
      default: throw new Error(`Unknown provider: ${this.model.provider}`);
    }
  }

  // ── Anthropic (native SDK, full tool-use + streaming) ─────────────────────
  async _streamAnthropic(messages, tools, signal) {
    const cacheKey = `anthropic_${this.apiKey}`;
    if (!_clientCache[cacheKey]) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      _clientCache[cacheKey] = new Anthropic({ apiKey: this.apiKey, timeout: REQUEST_TIMEOUT_MS });
    }
    const client = _clientCache[cacheKey];

    // Prompt caching — cache the system prompt and recent user messages
    const system = [
      {
        type: 'text',
        text: ANNIHILATOR_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ];

    const cachedMessages = messages.map((m, idx) => {
      // Add cache_control to the last 2 user messages for prompt caching
      if (m.role === 'user' && idx >= messages.length - 2) {
        if (typeof m.content === 'string') {
          return { ...m, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] };
        } else if (Array.isArray(m.content)) {
          const newContent = [...m.content];
          if (newContent.length > 0) {
            newContent[newContent.length - 1] = {
              ...newContent[newContent.length - 1],
              cache_control: { type: 'ephemeral' },
            };
          }
          return { ...m, content: newContent };
        }
      }
      return m;
    });

    const stream = client.messages.stream({
      model:      this.model.id,
      max_tokens: MAX_TOKENS,
      system,
      tools,
      messages: cachedMessages,
    });

    return { stream, adapter: 'anthropic' };
  }

  // ── Google Gemini (via @google/generative-ai SDK) ─────────────────────────
  async _streamGoogle(messages, tools) {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const client = new GoogleGenerativeAI(this.apiKey);

    const geminiModel = client.getGenerativeModel({
      model:             this.model.id,
      systemInstruction: ANNIHILATOR_SYSTEM_PROMPT,
      generationConfig:  { maxOutputTokens: MAX_TOKENS },
    });

    // Convert Anthropic-format tools → Gemini function declarations
    const functionDeclarations = tools.map(t => ({
      name:        t.name,
      description: t.description,
      parameters:  t.input_schema,
    }));

    // Bug fix: Gemini's functionResponse requires the actual function NAME,
    // not the opaque tool_use_id that Anthropic assigns.
    // Build a lookup table from id → name by scanning assistant messages first.
    const toolUseIdToName = new Map();
    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const c of msg.content) {
          if (c.type === 'tool_use') {
            toolUseIdToName.set(c.id, c.name);
          }
        }
      }
    }

    // Convert Anthropic-format messages → Gemini history format
    const history = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          history.push({ role: 'user', parts: [{ text: msg.content }] });
        } else if (Array.isArray(msg.content)) {
          // Tool results — resolve function name from lookup (not tool_use_id)
          const parts = msg.content.map(c => {
            if (c.type === 'tool_result') {
              const fnName = toolUseIdToName.get(c.tool_use_id) || c.tool_use_id;
              return {
                functionResponse: {
                  name:     fnName,
                  response: { output: c.content },
                },
              };
            }
            return { text: typeof c === 'string' ? c : JSON.stringify(c) };
          });
          history.push({ role: 'user', parts });
        }
      } else if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') {
          history.push({ role: 'model', parts: [{ text: msg.content }] });
        } else if (Array.isArray(msg.content)) {
          const parts = [];
          for (const c of msg.content) {
            if (c.type === 'text')     parts.push({ text: c.text });
            if (c.type === 'tool_use') parts.push({ functionCall: { name: c.name, args: c.input } });
          }
          history.push({ role: 'model', parts });
        }
      }
    }

    const lastMsg  = history.pop();
    const chat     = geminiModel.startChat({
      history,
      tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
    });

    // If the last message has functionResponse parts, send them as-is.
    // Otherwise extract the text for sendMessageStream.
    const lastParts = lastMsg?.parts || [{ text: '' }];
    const result   = await chat.sendMessageStream(lastParts);

    return { stream: result.stream, adapter: 'google', fullResult: result };
  }

  // ── Groq (OpenAI-compatible API, streaming) ───────────────────────────────
  async _streamGroq(messages, tools, signal) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type':  'application/json',
      },
      signal: signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model:      this.model.id,
        max_tokens: MAX_TOKENS,
        stream:     true,
        messages: [
          { role: 'system', content: ANNIHILATOR_SYSTEM_PROMPT },
          ...convertToOpenAIMessages(messages),
        ],
        tools: tools.map(t => ({
          type:     'function',
          function: { name: t.name, description: t.description, parameters: t.input_schema },
        })),
        tool_choice: 'auto',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Groq API error ${response.status}: ${err}`);
    }

    return { stream: response.body, adapter: 'openai' };
  }

  // ── Mistral (OpenAI-compatible API, streaming) ────────────────────────────
  async _streamMistral(messages, tools, signal) {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type':  'application/json',
      },
      signal: signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model:      this.model.id,
        max_tokens: MAX_TOKENS,
        stream:     true,
        messages: [
          { role: 'system', content: ANNIHILATOR_SYSTEM_PROMPT },
          ...convertToOpenAIMessages(messages),
        ],
        tools: tools.map(t => ({
          type:     'function',
          function: { name: t.name, description: t.description, parameters: t.input_schema },
        })),
        tool_choice: 'auto',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Mistral API error ${response.status}: ${err}`);
    }

    return { stream: response.body, adapter: 'openai' };
  }

  // ── Ollama Local Fallback (OpenAI-compatible) ─────────────────────────────
  async _streamOllama(messages, tools, signal, model = 'mistral') {
    const response = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS * 2), // longer for local
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        stream:     true,
        messages: [
          { role: 'system', content: ANNIHILATOR_SYSTEM_PROMPT },
          ...convertToOpenAIMessages(messages),
        ],
        ...(tools.length > 0 ? {
          tools: tools.map(t => ({
            type:     'function',
            function: { name: t.name, description: t.description, parameters: t.input_schema },
          })),
          tool_choice: 'auto',
        } : {}),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${err}`);
    }

    return { stream: response.body, adapter: 'openai' };
  }
}

// ── Check if Ollama is available locally ─────────────────────────────────────
export async function isOllamaAvailable() {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Convert Anthropic-format messages → OpenAI-compatible format ────────────
export function convertToOpenAIMessages(messages) {
  const out = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        out.push({ role: 'user', content: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const c of msg.content) {
          if (c.type === 'tool_result') {
            out.push({
              role:         'tool',
              tool_call_id: c.tool_use_id,
              content:      typeof c.content === 'string' ? c.content : JSON.stringify(c.content),
            });
          }
        }
      }
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        out.push({ role: 'assistant', content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const textParts = msg.content.filter(c => c.type === 'text').map(c => c.text).join('');
        const toolCalls = msg.content
          .filter(c => c.type === 'tool_use')
          .map(c => ({
            id:       c.id,
            type:     'function',
            function: { name: c.name, arguments: JSON.stringify(c.input) },
          }));

        const entry = { role: 'assistant' };
        if (textParts)          entry.content    = textParts;
        if (toolCalls.length > 0) entry.tool_calls = toolCalls;
        out.push(entry);
      }
    }
  }

  return out;
}

// ─── Parse a streaming OpenAI SSE response ────────────────────────────────────
export async function* parseOpenAIStream(body) {
  const decoder   = new TextDecoder();
  let buffer      = '';
  let textOutput  = '';
  const toolCalls = {};  // index → { id, name, arguments }
  let stopReason  = 'end_turn';

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const data = line.replace(/^data: /, '').trim();
      if (!data || data === '[DONE]') continue;

      let parsed;
      try { parsed = JSON.parse(data); } catch { continue; }

      const choice = parsed.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta || {};

      if (delta.content) {
        textOutput += delta.content;
        yield { type: 'text', text: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCalls[idx]) {
            toolCalls[idx] = { id: tc.id || `tool_${idx}`, name: '', arguments: '' };
          }
          if (tc.id)                    toolCalls[idx].id = tc.id;
          if (tc.function?.name)        toolCalls[idx].name      += tc.function.name;
          if (tc.function?.arguments)   toolCalls[idx].arguments += tc.function.arguments;
        }
      }

      if (choice.finish_reason) {
        stopReason = choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn';
      }
    }
  }

  const resolvedToolCalls = Object.values(toolCalls).map(tc => {
    let input = {};
    try { input = JSON.parse(tc.arguments || '{}'); } catch {}
    return { id: tc.id, name: tc.name, input };
  });

  yield { type: 'done', textOutput, toolCalls: resolvedToolCalls, stopReason };
}

// ─── Parse Google Gemini streaming response ───────────────────────────────────
export async function* parseGeminiStream(streamResult) {
  let textOutput  = '';
  const toolCalls = [];
  let stopReason  = 'end_turn';

  for await (const chunk of streamResult) {
    const candidate = chunk.candidates?.[0];
    if (!candidate) continue;

    for (const part of candidate.content?.parts || []) {
      if (part.text) {
        textOutput += part.text;
        yield { type: 'text', text: part.text };
      }
      if (part.functionCall) {
        toolCalls.push({
          id:    `gemini_tool_${Date.now()}_${toolCalls.length}`,
          name:  part.functionCall.name,
          input: part.functionCall.args || {},
        });
      }
    }

    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      stopReason = toolCalls.length > 0 ? 'tool_use' : 'end_turn';
    }
  }

  if (toolCalls.length > 0) stopReason = 'tool_use';
  yield { type: 'done', textOutput, toolCalls, stopReason };
}
