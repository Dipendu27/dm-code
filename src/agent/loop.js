// DM Code — Agentic Loop (multi-provider)
// Drives the streaming tool-use loop across Anthropic, Google, Groq, Mistral
// Enhanced with: auto-compact, context bar, Ollama fallback, diff preview, session persistence

import {
  ANNIHILATOR_SYSTEM_PROMPT,
  MAX_TOKENS,
  AUTO_COMPACT_THRESHOLD,
  COMPACT_THRESHOLD,
  getModelById,
  MODELS,
} from '../config/constants.js';
import { TOOL_DEFINITIONS, ToolExecutor, isSafeCommand, isDangerous } from '../tools/executor.js';
import {
  printAssistantPrefix,
  printStreamChunk,
  printStreamEnd,
  printToolCall,
  printToolResult,
  printToolError,
  printTokenUsage,
  printWarning,
  printError,
  renderContextBar,
  printCompactNotice,
  printDiff,
  printOllamaFallback,
  printInfo,
  startThinking,
  stopThinking,
  setThinkingMessage,
} from '../ui/renderer.js';
import {
  ProviderClient,
  parseOpenAIStream,
  parseGeminiStream,
  isOllamaAvailable,
  convertToOpenAIMessages,
} from './providers.js';
import { getSelectedModelId, getApiKey } from '../config/settings.js';
import { SessionPersistence } from './session.js';
import { MCPSchemaManager } from './mcp-manager.js';

const MAX_TOOL_ROUNDS = 30;
// Priority: genuinely unlimited free first, quota-based last
const FALLBACK_ORDER = ['google', 'groq', 'mistral', 'anthropic'];

export class AgentLoop {
  constructor({ cwd, onConfirm, autoApprove = false, verbose = false, memoryRef, sessionId }) {
    this.cwd          = cwd;
    this.autoApprove  = autoApprove;
    this.verbose      = verbose;
    this.executor     = new ToolExecutor({ cwd, memory: memoryRef || {}, onConfirm });
    this.memoryRef    = memoryRef || {};
    this.history      = [];
    this.inputTokens  = 0;
    this.outputTokens = 0;
    this.turnCount    = 0;
    this.abortController = null;
    this._compactTriggered = false;
    this._ollamaFallback   = false;

    // MCP schema manager — lazy-load
    this.mcpManager = new MCPSchemaManager();

    // Session persistence
    this.session = new SessionPersistence(sessionId);

    this._updateClient();
  }

  // ── Update provider client when model changes ────────────────────────────────
  _updateClient() {
    const modelId = getSelectedModelId();
    this.modelId  = modelId;
    this.model    = getModelById(modelId);
    this.client   = new ProviderClient(modelId);
  }

  // ── Run one user turn through the agentic loop ───────────────────────────────
  async run(userMessage) {
    // Refresh model in case user switched mid-session
    this._updateClient();

    this.history.push({ role: 'user', content: userMessage });
    this.abortController = new AbortController();
    this.turnCount++;
    let rounds = 0;

    // Prune inactive MCP schemas at the start of each turn
    this.mcpManager.pruneInactive();

    try {
      while (rounds < MAX_TOOL_ROUNDS) {
        rounds++;

        // Check context budget and auto-compact if needed
        await this._checkContextBudget();

        // Show animated spinner while waiting for model response
        startThinking();

        const response = await this._callModelWithFallback();
        if (response === null) {
          stopThinking();
          console.log();
          printWarning('Request cancelled.');
          break;
        }

        const { stopReason, toolCalls, textOutput, usage } = response;

        if (usage) {
          this.inputTokens  += usage.input_tokens  || 0;
          this.outputTokens += usage.output_tokens || 0;
        }

        if (textOutput) {
          printStreamEnd();
        }

        if (!toolCalls || toolCalls.length === 0) {
          // No tools → done
          this.history.push({
            role:    'assistant',
            content: textOutput || '',
          });
          break;
        }

        // Execute tool calls
        const toolResults = [];

        for (const tc of toolCalls) {
          const toolName  = tc.name;
          const toolInput = tc.input;
          const toolUseId = tc.id;

          // Show diff preview before file writes/edits
          if (this._isFileModification(toolName)) {
            const previewResult = await this._previewFileChange(toolName, toolInput);
            if (previewResult) {
              const { approved } = previewResult;
              if (!approved) {
                toolResults.push({
                  type:        'tool_result',
                  tool_use_id: toolUseId,
                  content:     'User rejected this file change after reviewing diff.',
                  is_error:    true,
                });
                printWarning(`Rejected: ${toolName} on ${previewResult.filePath}`);
                continue;
              }
            }
          }

          const needsConfirm = this._needsConfirmation(toolName, toolInput);
          const isReallyDangerous = toolName === 'run_command' && isDangerous(toolInput?.command || '');
          
          if (needsConfirm && (!this.autoApprove || isReallyDangerous)) {
            // Skip double-confirmation for file mutations already confirmed in _previewFileChange
            const alreadyConfirmed = this._isFileModification(toolName);
            if (!alreadyConfirmed) {
              const approved = await this._requestConfirmation(toolName, toolInput);
              if (!approved) {
                toolResults.push({
                  type:        'tool_result',
                  tool_use_id: toolUseId,
                  content:     'User rejected this operation.',
                  is_error:    true,
                });
                printWarning(`Rejected: ${toolName}`);
                continue;
              }
            }
          }

          printToolCall(toolName, toolInput);

          // Auto-backup before file mutations so /undo works
          if (this._isFileModification(toolName)) {
            await this._backupFile(toolName, toolInput);
          }

          const { success, result, error, durationMs } =
            await this.executor.execute(toolName, toolInput);

          if (success) {
            const resultStr = typeof result === 'object'
              ? JSON.stringify(result)
              : String(result ?? '');
            printToolResult(toolName, resultStr, durationMs);
            toolResults.push({
              type:        'tool_result',
              tool_use_id: toolUseId,
              content:     resultStr.length > 20_000
                ? resultStr.slice(0, 20_000) + '\n\n[... truncated — output too large]'
                : resultStr,
            });
          } else {
            printToolError(toolName, error);
            toolResults.push({
              type:        'tool_result',
              tool_use_id: toolUseId,
              content:     `Error: ${error}`,
              is_error:    true,
            });
          }
        }

        // Append turn to history
        this.history.push({
          role:    'assistant',
          content: this._buildAssistantContent(textOutput, toolCalls),
        });
        this.history.push({
          role:    'user',
          content: toolResults,
        });

      }

      // Show task summary if it was a multi-step agentic turn
      const hitRoundLimit = rounds >= MAX_TOOL_ROUNDS;
      if (rounds > 1 && !this.abortController?.signal?.aborted) {
        console.log();
        if (hitRoundLimit) {
          printWarning(`Reached the ${MAX_TOOL_ROUNDS}-step limit — the task may be incomplete. Send a follow-up message to continue.`);
        } else {
          printInfo(`Task completed in ${rounds} steps.`);
        }
      }
    } catch (err) {
      stopThinking();
      if (err.name === 'AbortError') {
        printWarning('Request aborted.');
      } else {
        printError(`API error: ${err.message}`);
        if (this.verbose) console.error(err);
      }
    }

    // Show token usage
    if (this.inputTokens > 0) {
      printTokenUsage(this.inputTokens, this.outputTokens);
    }

    // Show context window usage bar
    const contextLimit = this.model?.contextTokens || 200_000;
    renderContextBar(this.inputTokens + this.outputTokens, contextLimit);

    // Save session state to disk after every turn
    this._saveSession();

    this.abortController = null;
  }

  // ── Call model with cloud provider + Ollama fallback ─────────────────────────
  async _callModelWithFallback() {
    try {
      return await this._callModel();
    } catch (err) {
      if (!this._isRateLimitError(err)) throw err;

      // Rate limit hit — stop spinner and try cloud fallback providers
      stopThinking();
      printWarning(`Rate limit on ${this.model.provider}. Trying fallback providers...`);

      const fallbacks = FALLBACK_ORDER.filter(p => {
        if (p === this.model.provider) return false;
        return !!getApiKey(p);
      });

      for (const fallbackProvider of fallbacks) {
        const fallbackParams = this._buildFallbackParams(fallbackProvider);
        if (!fallbackParams) continue;

        const origClient  = this.client;
        const origModel   = this.model;
        const origModelId = this.modelId;

        try {
          printInfo(`→ Trying ${fallbackProvider}...`);

          this.client  = new ProviderClient(fallbackParams.modelId);
          this.model   = fallbackParams.model;
          this.modelId = fallbackParams.modelId;

          const result = await this._callModel();
          printInfo(`[Used ${fallbackProvider} as fallback — your default model is unchanged]`);
          // Restore original client after successful fallback
          this.client  = origClient;
          this.model   = origModel;
          this.modelId = origModelId;
          return result;
        } catch (fallbackErr) {
          // Always restore original client
          this.client  = origClient;
          this.model   = origModel;
          this.modelId = origModelId;
          // Always continue to next provider, regardless of error type
          const reason = fallbackErr.message?.slice(0, 80) ?? 'unknown error';
          printWarning(`${fallbackProvider} unavailable: ${reason}`);
          continue;
        }
      }

      // Last resort: try Ollama if available
      const ollamaReady = await isOllamaAvailable();
      if (ollamaReady && !this._ollamaFallback) {
        this._ollamaFallback = true;
        printOllamaFallback(err.message);
        try {
          return await this._callOllama();
        } catch (ollamaErr) {
          printWarning(`Ollama fallback also failed: ${ollamaErr.message}`);
        }
      }

      throw new Error('All configured providers are rate-limited. Please wait a few minutes and try again.');
    }
  }

  // ── Build params for a fallback provider ─────────────────────────────────────
  _buildFallbackParams(provider) {
    const recommended = MODELS.find(m => m.provider === provider && m.recommended);
    const fallback    = recommended || MODELS.find(m => m.provider === provider);
    if (!fallback) return null;
    return { modelId: fallback.id, model: fallback };
  }

  // ── Call Ollama directly (uses ProviderClient's OpenAI-compatible path) ───────
  async _callOllama() {
    // Build a temporary Ollama ProviderClient using the OpenAI-compatible endpoint.
    // We reuse parseOpenAIStream so there's no duplicated fetch logic.
    const response = await fetch('http://localhost:11434/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'mistral',
        max_tokens: MAX_TOKENS,
        stream:     true,
        messages: [
          { role: 'system', content: ANNIHILATOR_SYSTEM_PROMPT },
          ...convertToOpenAIMessages(this._buildMessages()),
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    return this._consumeOpenAIStream(response.body);
  }

  // ── Check if error should trigger provider fallback ──────────────────────────
  // Covers: rate limits (429), billing/quota exhaustion (400/402),
  // and various provider-specific error message strings.
  _isRateLimitError(err) {
    const status = err.status ?? err.statusCode ?? err.response?.status;
    const msg    = (err.message ?? '').toLowerCase();

    // HTTP status codes that indicate "can't serve right now, try elsewhere"
    if (status === 429) return true; // standard rate limit
    if (status === 402) return true; // payment required

    // 400 with billing/quota message (Anthropic-specific)
    if (status === 400 && (
      msg.includes('credit balance') ||
      msg.includes('billing') ||
      msg.includes('insufficient_quota') ||
      msg.includes('purchase credits')
    )) return true;

    // Provider-specific message strings (provider-agnostic, catch-all)
    return (
      msg.includes('rate_limit')               ||
      msg.includes('rate limit')               ||
      msg.includes('too many requests')        ||
      msg.includes('quota exceeded')           ||
      msg.includes('quota')                    ||
      msg.includes('resource_exhausted')       ||  // Google gRPC code
      msg.includes('tokens per minute')        ||  // Groq-specific
      msg.includes('requests per minute')      ||  // Groq-specific
      msg.includes('credit balance is too low')||  // Anthropic billing
      msg.includes('insufficient_quota')       ||  // OpenAI-compatible
      msg.includes('plan limits')              ||  // Groq free tier
      (msg.includes('upgrade') && msg.includes('billing')) // Anthropic upgrade prompt
    );
  }

  // ── Check context budget and auto-compact ────────────────────────────────────
  async _checkContextBudget() {
    const contextLimit = this.model?.contextTokens || 200_000;
    const used  = this.inputTokens + this.outputTokens;
    const ratio = used / contextLimit;

    if (ratio > AUTO_COMPACT_THRESHOLD && !this._compactTriggered) {
      this._compactTriggered = true;
      await this.compactHistory('auto: context usage exceeded 70%');
    } else if (ratio > COMPACT_THRESHOLD && this.history.length > 6) {
      printInfo(`Context at ${Math.round(ratio * 100)}% — consider running /compact to free space.`);
    }
  }

  // ── Compact history ───────────────────────────────────────────────────────────
  async compactHistory(reason = 'manual') {
    if (this.history.length < 4) {
      printWarning('Not enough history to compact.');
      return;
    }

    const beforeTokens = this.inputTokens + this.outputTokens;
    const keepCount    = 4;
    const toSummarize  = this.history.slice(0, -keepCount);
    const toKeep       = this.history.slice(-keepCount);

    const summaryParts = [];
    for (const msg of toSummarize) {
      if (msg.role === 'user' && typeof msg.content === 'string') {
        summaryParts.push(`User asked: ${msg.content.slice(0, 100)}`);
      } else if (msg.role === 'assistant' && typeof msg.content === 'string') {
        summaryParts.push(`Assistant: ${msg.content.slice(0, 150)}`);
      } else if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const tools = msg.content.filter(c => c.type === 'tool_use').map(c => c.name);
        if (tools.length) summaryParts.push(`Used tools: ${tools.join(', ')}`);
      }
    }

    const shown = summaryParts.slice(0, 20);
    const omitted = summaryParts.length - shown.length;
    const compactedSummary = [
      '--- SESSION SUMMARY (compacted) ---',
      `Previous ${toSummarize.length} messages summarized:`,
      ...shown,
      ...(omitted > 0 ? [`(+ ${omitted} earlier message(s) omitted from this summary)`] : []),
      '--- END SUMMARY ---',
    ].join('\n');

    this.history = [
      { role: 'user',      content: compactedSummary },
      { role: 'assistant', content: 'Understood. I have the context from the compacted session summary. Ready to continue.' },
      ...toKeep,
    ];

    const estimatedSaved = toSummarize.reduce((acc, m) => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return acc + Math.floor(content.length / 4);
    }, 0);

    const afterTokens = Math.max(0, beforeTokens - estimatedSaved);
    this._compactTriggered = false;
    printCompactNotice(reason, beforeTokens, afterTokens);
  }

  // ── File modification helpers ────────────────────────────────────────────────
  _isFileModification(toolName) {
    return ['write_file', 'edit_file'].includes(toolName);
  }

  // Auto-backup before file mutations so /undo can restore them
  async _backupFile(toolName, toolInput) {
    try {
      const filePath = toolInput.path;
      if (!filePath) return;
      const current = await this.executor.readFile({ path: filePath }).catch(() => null);
      if (current !== null) {
        // Store last backup in memory so /undo can access it
        if (!this._undoStack) this._undoStack = [];
        this._undoStack.push({ path: filePath, content: current });
        // Keep at most 10 undo entries
        if (this._undoStack.length > 10) this._undoStack.shift();
      }
    } catch {
      // Non-fatal — backup failure should never block the tool call
    }
  }

  // Undo the last file write/edit by restoring backup
  async undoLastEdit() {
    if (!this._undoStack || this._undoStack.length === 0) {
      printWarning('Nothing to undo — no file edits made in this session.');
      return false;
    }
    const { path: filePath, content } = this._undoStack.pop();
    try {
      await this.executor.writeFile({ path: filePath, content });
      printInfo(`Restored: ${filePath}`);
      return true;
    } catch (err) {
      printError(`Undo failed: ${err.message}`);
      return false;
    }
  }

  // Preview diff for edit_file (full-file diff, not just snippet)
  async _previewFileChange(toolName, toolInput) {
    try {
      if (toolName === 'edit_file') {
        const { path: filePath, old_string, new_string } = toolInput;
        const currentContent = await this.executor.readFile({ path: filePath }).catch(() => '');
        if (currentContent && old_string) {
          // Show diff of the FULL file (before vs after), not just the snippet
          const newContent = currentContent.replace(old_string, new_string);
          printDiff(currentContent, newContent, filePath);
          if (!this.autoApprove) {
            const approved = await this._requestConfirmation('edit_file', toolInput);
            return { approved, filePath };
          }
          return { approved: true, filePath };
        }
      } else if (toolName === 'write_file') {
        const { path: filePath, content } = toolInput;
        const currentContent = await this.executor.readFile({ path: filePath }).catch(() => null);
        if (currentContent !== null) {
          printDiff(currentContent, content, filePath);
          if (!this.autoApprove) {
            const approved = await this._requestConfirmation('write_file', toolInput);
            return { approved, filePath };
          }
          return { approved: true, filePath };
        }
        // New file — no existing content to diff, skip preview
      }
    } catch {
      // Preview failure is non-fatal — fall through to normal confirm flow
    }
    return null;
  }

  // ── Call the model via the active provider (with retry + exponential backoff) ─
  async _callModel() {
    const messages    = this._buildMessages();
    const MAX_RETRIES = 2; // reduced from 5 — fast-fail to trigger fallback sooner

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const mcpSchemas = this.mcpManager.getActiveSchemas();
        const allTools   = [...TOOL_DEFINITIONS, ...mcpSchemas];

        const { stream, adapter, fullResult } = await this.client.streamMessage({
          messages,
          tools:  allTools,
          signal: this.abortController?.signal,
        });

        switch (adapter) {
          case 'anthropic': return await this._consumeAnthropicStream(stream);
          case 'openai':    return await this._consumeOpenAIStream(stream);
          case 'google':    return await this._consumeGeminiStream(fullResult || stream);
          default:          throw new Error(`Unknown adapter: ${adapter}`);
        }
      } catch (err) {
        if (err.name === 'AbortError') return null;

        // Never retry rate limits or billing errors — let fallback handle them immediately
        if (this._isRateLimitError(err)) {
          throw err;
        }

        const isRetryable = this._isRetryableError(err);
        if (isRetryable && attempt < MAX_RETRIES) {
          const baseDelay = Math.pow(2, attempt) * 1000;
          const jitter    = Math.random() * 500;
          const delay     = Math.min(baseDelay + jitter, 15_000);

          setThinkingMessage(`Connection dropped — retrying (${attempt + 1}/${MAX_RETRIES})…`);
          startThinking();
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        // Human-readable error messages instead of raw JSON
        printError(this._humaniseError(err));
        throw err;
      }
    }

    // Should never reach here — always throws or returns above
    throw new Error('Max retries exceeded.');
  }

  // ── Check if an error is transient and retryable ─────────────────────────────
  // NOTE: Rate limits (429) are explicitly NOT retryable — they trigger fallback instead.
  _isRetryableError(err) {
    const msg = err.message || '';
    if (/5\d{2}|502|503|504|server.?error/i.test(msg))           return true;
    if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch.?failed|network/i.test(msg)) return true;
    if (err.status >= 500)  return true;
    return false;
  }

  // ── Convert raw API errors into clean, human-readable messages ───────────────
  _humaniseError(err) {
    const status = err.status ?? err.statusCode;
    const msg    = (err.message ?? '').toLowerCase();
    const provider = this.model?.providerLabel || this.model?.provider || 'Provider';

    if (status === 429 || msg.includes('rate_limit') || msg.includes('too many requests')) {
      return `${provider} rate limit reached. Switching to next available provider...`;
    }
    if (msg.includes('credit balance') || msg.includes('billing') || msg.includes('insufficient_quota')) {
      return `${provider} account has no remaining credits. Switch provider or add credits.`;
    }
    if (status === 401 || msg.includes('invalid api key') || msg.includes('authentication')) {
      return `${provider} API key is invalid. Run: dmcode keys set ${this.model?.provider || 'provider'} YOUR_KEY`;
    }
    if (status === 404) {
      return `Model not found on ${provider}. Run: dmcode models to see available options.`;
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return `${provider} request timed out. Check your internet connection and try again.`;
    }
    if (err.status >= 500 || /server.?error/i.test(msg)) {
      return `${provider} server error — check provider status page.`;
    }

    // Fallback: show a short version, not the full JSON
    const shortMsg = err.message?.slice(0, 120) ?? 'Unknown error';
    return `${provider} error: ${shortMsg}`;
  }

  // ── Anthropic native stream consumer ─────────────────────────────────────────
  async _consumeAnthropicStream(stream) {
    let textOutput      = '';
    let currentToolId   = null;
    let currentToolName = null;
    let currentInputStr = '';
    const toolCalls     = [];
    let firstText       = true;

    try {
      for await (const event of stream) {
        if (this.abortController?.signal.aborted) {
          stream.controller?.abort?.();
          return null;
        }

        const t = event.type;

        if (t === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            stopThinking();
            currentToolId   = event.content_block.id;
            currentToolName = event.content_block.name;
            currentInputStr = '';
          }
          if (event.content_block.type === 'text' && firstText) {
            stopThinking();
            printAssistantPrefix();
            firstText = false;
          }
        } else if (t === 'content_block_delta') {
          const delta = event.delta;
          if (delta.type === 'text_delta') {
            printStreamChunk(delta.text);
            textOutput += delta.text;
          }
          if (delta.type === 'input_json_delta') {
            currentInputStr += delta.partial_json;
          }
        } else if (t === 'content_block_stop') {
          if (currentToolId) {
            let parsedInput = {};
            try { parsedInput = JSON.parse(currentInputStr || '{}'); } catch {}
            toolCalls.push({ id: currentToolId, name: currentToolName, input: parsedInput });
            currentToolId   = null;
            currentToolName = null;
            currentInputStr = '';
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') throw err;
      return null;
    }

    const finalMessage = await stream.finalMessage().catch(() => null);
    const stopReason   = finalMessage?.stop_reason || 'end_turn';
    const usage        = finalMessage?.usage || null;

    return { stopReason, toolCalls, textOutput, usage };
  }

  // ── OpenAI-compatible stream consumer (Groq + Mistral + Ollama) ──────────────
  async _consumeOpenAIStream(body) {
    let textOutput = '';
    let toolCalls  = [];
    let stopReason = 'end_turn';
    let usage      = null;
    let firstText  = true;

    for await (const event of parseOpenAIStream(body)) {
      if (this.abortController?.signal.aborted) return null;

      if (event.type === 'text') {
        if (firstText) {
          stopThinking();
          printAssistantPrefix();
          firstText = false;
        }
        printStreamChunk(event.text);
        textOutput += event.text;
      } else if (event.type === 'done') {
        toolCalls  = event.toolCalls;
        stopReason = event.stopReason;
        usage      = event.usage || null;
      }
    }

    return { stopReason, toolCalls, textOutput, usage };
  }

  // ── Gemini stream consumer ───────────────────────────────────────────────────
  async _consumeGeminiStream(streamResult) {
    let textOutput = '';
    let toolCalls  = [];
    let stopReason = 'end_turn';
    let usage      = null;
    let firstText  = true;

    for await (const event of parseGeminiStream(streamResult)) {
      if (this.abortController?.signal.aborted) return null;

      if (event.type === 'text') {
        if (firstText) {
          stopThinking();
          printAssistantPrefix();
          firstText = false;
        }
        printStreamChunk(event.text);
        textOutput += event.text;
      } else if (event.type === 'done') {
        toolCalls  = event.toolCalls;
        stopReason = event.stopReason;
        usage      = event.usage || null;
      }
    }

    return { stopReason, toolCalls, textOutput, usage };
  }

  // ── Build messages for API ───────────────────────────────────────────────────
  _buildMessages() {
    const messages = [...this.history];
    // Inject CWD into first user message so the model always knows context
    if (messages.length > 0 && messages[0].role === 'user') {
      const first = messages[0];
      if (typeof first.content === 'string' && !first.content.startsWith('CWD:')) {
        messages[0] = { ...first, content: `CWD: ${this.cwd}\n\n${first.content}` };
      }
    }
    return messages;
  }

  // ── Build assistant content block for history ────────────────────────────────
  _buildAssistantContent(textOutput, toolCalls) {
    const content = [];
    if (textOutput) content.push({ type: 'text', text: textOutput });
    for (const tc of toolCalls) {
      content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
    }
    return content;
  }

  // ── Confirmation logic ───────────────────────────────────────────────────────
  _needsConfirmation(toolName, params) {
    if (['write_file', 'edit_file', 'delete_file', 'move_file'].includes(toolName)) return true;
    if (toolName === 'run_command') {
      return !isSafeCommand(params?.command || '');
    }
    return false;
  }

  async _requestConfirmation(toolName, params) {
    if (this.executor.onConfirm) return this.executor.onConfirm(toolName, params);
    return true;
  }

  // ── Save session state to disk ───────────────────────────────────────────────
  _saveSession() {
    try {
      this.session.save({
        cwd:          this.cwd,
        modelId:      this.modelId,
        history:      this.history,
        memory:       this.memoryRef,
        inputTokens:  this.inputTokens,
        outputTokens: this.outputTokens,
        status:       'active',
      }).catch(() => { /* don't break session on async save failure */ });
    } catch { /* don't break session on save failure */ }
  }

  // ── Restore session from disk ─────────────────────────────────────────────────
  async restoreSession(sessionId) {
    const data = SessionPersistence.restoreById(sessionId);
    if (!data) return false;

    this.history      = data.history      || [];
    this.inputTokens  = data.inputTokens  || 0;
    this.outputTokens = data.outputTokens || 0;
    this.turnCount    = Math.floor(this.history.length / 2);

    if (data.memory && this.memoryRef) {
      Object.assign(this.memoryRef, data.memory);
    }

    printInfo(`Restored session ${sessionId} (${this.turnCount} turns, ${(this.inputTokens + this.outputTokens).toLocaleString('en-US')} tokens)`);
    return true;
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  abort()           { this.abortController?.abort(); }
  resetHistory()    { this.history = []; this.inputTokens = 0; this.outputTokens = 0; this.turnCount = 0; this._compactTriggered = false; this._undoStack = []; }
  setAutoApprove(v) { this.autoApprove = v; }

  markSessionCompleted() { this.session.markCompleted(); }
  getSessionId()         { return this.session.sessionId; }
}
