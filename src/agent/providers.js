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
  async _streamGoogle(messages, tools, signal) {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const client = new GoogleGenerativeAI(this.apiKey);

    // If using a Gemini 3 / Thinking model that requires thoughtSignature for tool calls,
    // but the history has tool calls from another provider without thoughtSignature,
    // downgrade to gemini-2.5-flash for this call to prevent 400 Bad Request errors.
    let targetModelId = this.model.id;
    if (targetModelId.startsWith('gemini-3') || targetModelId.includes('thinking')) {
      const hasMissingSig = messages.some(m =>
        m.role === 'assistant' && Array.isArray(m.content) && m.content.some(c => c.type === 'tool_use' && !c.thoughtSignature && !c.thought_signature && !c.thought_signature_bytes)
      );
      if (hasMissingSig) {
        targetModelId = 'gemini-2.5-flash';
      }
    }

    const geminiModel = client.getGenerativeModel({
      model:             targetModelId,
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
          const hasFuncResp = parts.some(p => p.functionResponse);
          history.push({ role: hasFuncResp ? 'function' : 'user', parts });
        }
      } else if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') {
          history.push({ role: 'model', parts: [{ text: msg.content }] });
        } else if (Array.isArray(msg.content)) {
          const parts = [];
          for (const c of msg.content) {
            if (c.type === 'text')     parts.push({ text: c.text });
            if (c.type === 'tool_use') {
              const fcPart = { functionCall: { name: c.name, args: c.input } };
              if (c.thoughtSignature || c.thought_signature) {
                fcPart.thoughtSignature = c.thoughtSignature || c.thought_signature;
              }
              if (c.thought) {
                fcPart.thought = c.thought;
              }
              parts.push(fcPart);
            }
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
    const result   = await chat.sendMessageStream(lastParts, { signal });

    return { stream: result.stream, adapter: 'google', fullResult: result };
  }


  // ── Groq (OpenAI-compatible API, streaming) ───────────────────────────────
  async _streamGroq(messages, tools, signal) {
    // Groq free tier has strict TPM (Tokens Per Minute) limits (8000 TPM across a rolling 60s window).
    // Groq counts Requested Tokens as (Prompt + Tools + max_tokens).
    // Prune prompt down to ~800 tokens and cap max_tokens at 512 so each turn requests <= 1500 tokens, allowing 5+ back-to-back turns within 60s.
    const prunedMessages  = _pruneMessagesForLimit(messages, 800);
    const estPromptTokens = Math.ceil(JSON.stringify(prunedMessages).length / 3.5) + 500;
    const groqMaxTokens   = Math.min(512, Math.max(256, 1800 - estPromptTokens));

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type':  'application/json',
      },
      signal: signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model:      this.model.id,
        max_tokens: groqMaxTokens,
        stream:     true,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: ANNIHILATOR_SYSTEM_PROMPT },
          ...convertToOpenAIMessages(prunedMessages),
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
    const prunedMessages = _pruneMessagesForLimit(messages, 24000);
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
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: ANNIHILATOR_SYSTEM_PROMPT },
          ...convertToOpenAIMessages(prunedMessages),
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
    const prunedMessages = _pruneMessagesForLimit(messages, 3000);
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
          ...convertToOpenAIMessages(prunedMessages),
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

// Helper: Prune conversation history to fit within strict provider TPM/context limits (e.g. Groq 8000 TPM)
function _pruneMessagesForLimit(messages, maxPromptTokens = 1800) {
  let estTokens = Math.ceil(JSON.stringify(messages).length / 3.5) + 500;
  if (estTokens <= maxPromptTokens || messages.length <= 2) return messages;

  const firstMsg = messages[0];
  const tailCount = Math.min(3, messages.length - 1);
  const lastMsgs = messages.slice(-tailCount);
  const middleMsgs = messages.slice(1, -tailCount);

  // Helper to truncate long text or tool_result contents in message objects
  const truncateMsg = (m, maxLen = 250) => {
    if (Array.isArray(m.content)) {
      return {
        ...m,
        content: m.content.map(c => {
          if (c.type === 'tool_result' && typeof c.content === 'string' && c.content.length > maxLen) {
            return { ...c, content: c.content.slice(0, maxLen) + '... [output truncated for token budget]' };
          }
          if (c.type === 'text' && c.text.length > maxLen * 2) {
            return { ...c, text: c.text.slice(0, maxLen * 2) + '... [text truncated for token budget]' };
          }
          return c;
        }),
      };
    } else if (typeof m.content === 'string' && m.content.length > maxLen * 2) {
      return { ...m, content: m.content.slice(0, maxLen * 2) + '... [text truncated for token budget]' };
    }
    return m;
  };

  // Step 1: Truncate large tool_result outputs in middle messages
  const compactedMiddle = middleMsgs.map(m => truncateMsg(m, 150));
  let pruned = [firstMsg, ...compactedMiddle, ...lastMsgs];
  estTokens = Math.ceil(JSON.stringify(pruned).length / 3.5) + 500;

  // Step 2: If STILL over budget, omit middle messages entirely and compact lastMsgs
  if (estTokens > maxPromptTokens) {
    const compactedLast = lastMsgs.map(m => truncateMsg(m, 250));
    pruned = [
      truncateMsg(firstMsg, 350),
      { role: 'assistant', content: 'Note: Earlier conversation history was omitted to fit within provider token budget.' },
      ...compactedLast,
    ];
    estTokens = Math.ceil(JSON.stringify(pruned).length / 3.5) + 500;

    // Step 3: Extreme fallback if single recent turns are massive
    if (estTokens > maxPromptTokens && compactedLast.length > 1) {
      pruned = [
        truncateMsg(firstMsg, 200),
        compactedLast[compactedLast.length - 1],
      ];
    }
  }
  return pruned;
}

// ─── Convert Anthropic-format messages → OpenAI-compatible format ────────────
export function convertToOpenAIMessages(messages) {
  const out = [];
  const toolNameMap = new Map();

  // Step 1: Map all tool_use IDs to their tool names so tool_result messages can include name
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const c of msg.content) {
        if (c.type === 'tool_use' && c.id) {
          toolNameMap.set(c.id, c.name);
        }
      }
    }
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        out.push({ role: 'user', content: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const c of msg.content) {
          if (c.type === 'tool_result') {
            const rawName = c.name || toolNameMap.get(c.tool_use_id) || 'tool_function';
            const toolName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_');
            out.push({
              role:         'tool',
              tool_call_id: c.tool_use_id,
              name:         toolName,
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
            function: { name: (c.name || 'tool_function').replace(/[^a-zA-Z0-9_-]/g, '_'), arguments: JSON.stringify(c.input) },
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
  let usage       = null;

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
      if (parsed.usage) {
        usage = {
          input_tokens:  parsed.usage.prompt_tokens,
          output_tokens: parsed.usage.completion_tokens,
        };
      }
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

  yield { type: 'done', textOutput, toolCalls: resolvedToolCalls, stopReason, usage };
}

// ─── Parse Google Gemini streaming response ───────────────────────────────────
export async function* parseGeminiStream(streamResult) {
  let textOutput  = '';
  const toolCalls = [];
  let stopReason  = 'end_turn';
  let usage       = null;

  const stream = streamResult?.stream || streamResult;
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
    throw new Error('Google Gemini stream is not async iterable. Check API response.');
  }

  for await (const chunk of stream) {
    if (chunk.usageMetadata) {
      usage = {
        input_tokens:  chunk.usageMetadata.promptTokenCount,
        output_tokens: chunk.usageMetadata.candidatesTokenCount,
      };
    }
    const candidate = chunk.candidates?.[0];
    if (!candidate) continue;

    for (const part of candidate.content?.parts || []) {
      if (part.text) {
        textOutput += part.text;
        yield { type: 'text', text: part.text };
      }
      if (part.functionCall) {
        const tc = {
          id:    `gemini_tool_${Date.now()}_${toolCalls.length}`,
          name:  part.functionCall.name,
          input: part.functionCall.args || {},
        };
        if (part.thoughtSignature || part.thought_signature) {
          tc.thoughtSignature = part.thoughtSignature || part.thought_signature;
        }
        if (part.thought) {
          tc.thought = part.thought;
        }
        toolCalls.push(tc);
      }
    }

    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      stopReason = toolCalls.length > 0 ? 'tool_use' : 'end_turn';
    }
  }

  if (toolCalls.length > 0) stopReason = 'tool_use';
  yield { type: 'done', textOutput, toolCalls, stopReason, usage };
}
