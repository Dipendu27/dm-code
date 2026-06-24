// DM Code — Agentic Loop (multi-provider)
// Drives the streaming tool-use loop across Anthropic, Google, Groq, Mistral
// Enhanced with: auto-compact, context bar, Ollama fallback, diff preview, session persistence

import {
  ANNIHILATOR_SYSTEM_PROMPT,
  MAX_TOKENS,
  AUTO_COMPACT_THRESHOLD,
  COMPACT_THRESHOLD,
  getModelById,
} from '../config/constants.js';
import { TOOL_DEFINITIONS, ToolExecutor, isSafeCommand } from '../tools/executor.js';
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
} from '../ui/renderer.js';
import {
  ProviderClient,
  parseOpenAIStream,
  parseGeminiStream,
  isOllamaAvailable,
  convertToOpenAIMessages,
} from './providers.js';
import { getSelectedModelId } from '../config/settings.js';
import { SessionPersistence } from './session.js';
import { MCPSchemaManager } from './mcp-manager.js';

const MAX_TOOL_ROUNDS = 30;

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

    // Fix 4: MCP schema manager — lazy-load
    this.mcpManager = new MCPSchemaManager();

    // Fix 5: Session persistence
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

    // Fix 4: Prune inactive MCP schemas at the start of each turn
    this.mcpManager.pruneInactive();

    try {
      while (rounds < MAX_TOOL_ROUNDS) {
        rounds++;

        // Fix 1: Check context budget and auto-compact if needed
        await this._checkContextBudget();

        const response = await this._callModelWithFallback();
        if (response === null) {
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

          // Fix 3: Show diff preview before file writes/edits
          if (this._isFileModification(toolName)) {
            const previewResult = await this._previewFileChange(toolName, toolInput);
            if (previewResult) {
              const { approved, oldContent, newContent, filePath } = previewResult;
              if (!approved) {
                toolResults.push({
                  type:        'tool_result',
                  tool_use_id: toolUseId,
                  content:     'User rejected this file change after reviewing diff.',
                  is_error:    true,
                });
                printWarning(`Rejected: ${toolName} on ${filePath}`);
                continue;
              }
            }
          }

          const needsConfirm = this._needsConfirmation(toolName, toolInput);
          if (needsConfirm && !this.autoApprove) {
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

          printToolCall(toolName, toolInput);

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

        if (stopReason === 'end_turn') break;
      }
    } catch (err) {
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

    // Fix 2: Show context window usage bar
    const contextLimit = this.model?.contextTokens || 200_000;
    renderContextBar(this.inputTokens + this.outputTokens, contextLimit);

    // Fix 5: Save session state to disk after every turn
    this._saveSession();

    this.abortController = null;
  }

  // ── Call model with Ollama fallback (Fix 1) ──────────────────────────────────
  async _callModelWithFallback() {
    try {
      return await this._callModel();
    } catch (err) {
      // Check if this is a rate limit error and Ollama is available
      if (this._isRateLimitError(err)) {
        const ollamaReady = await isOllamaAvailable();
        if (ollamaReady && !this._ollamaFallback) {
          this._ollamaFallback = true;
          printOllamaFallback(err.message);

          // Route through Ollama
          try {
            return await this._callOllama();
          } catch (ollamaErr) {
            printWarning(`Ollama fallback also failed: ${ollamaErr.message}`);
            throw err;  // throw original error
          }
        }
      }
      throw err;
    }
  }

  // ── Call Ollama directly ─────────────────────────────────────────────────────
  async _callOllama() {
    const messages = this._buildMessages();

    // Create a temporary Ollama-only client
    const response = await fetch('http://localhost:11434/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mistral',
        max_tokens: MAX_TOKENS,
        stream: true,
        messages: [
          { role: 'system', content: ANNIHILATOR_SYSTEM_PROMPT },
          ...this._convertHistoryToOpenAI(messages),
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    return this._consumeOpenAIStream(response.body);
  }

  // ── Check if error is a rate limit ──────────────────────────────────────────
  _isRateLimitError(err) {
    const msg = err.message || '';
    return /429|rate.?limit/i.test(msg) || err.status === 429;
  }

  // ── Check context budget and auto-compact (Fix 1 & 2) ──────────────────────
  async _checkContextBudget() {
    const contextLimit = this.model?.contextTokens || 200_000;
    const used = this.inputTokens + this.outputTokens;
    const ratio = used / contextLimit;

    // Auto-compact at 70% (Fix 1) — aggressive compact to save budget
    if (ratio > AUTO_COMPACT_THRESHOLD && !this._compactTriggered) {
      this._compactTriggered = true;
      await this.compactHistory('auto: context usage exceeded 70%');
    }
    // Notify at 50% (Fix 2)
    else if (ratio > COMPACT_THRESHOLD && this.history.length > 6) {
      printInfo(`Context at ${Math.round(ratio * 100)}% — consider running /compact to free space.`);
    }
  }

  // ── Compact history — summarize and condense (Fix 2) ─────────────────────────
  async compactHistory(reason = 'manual') {
    if (this.history.length < 4) {
      printWarning('Not enough history to compact.');
      return;
    }

    const beforeTokens = this.inputTokens + this.outputTokens;

    // Keep the last 2 exchanges (4 messages) and summarize everything before
    const keepCount = 4;
    const toSummarize = this.history.slice(0, -keepCount);
    const toKeep = this.history.slice(-keepCount);

    // Build a compact summary of older messages
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

    const compactedSummary = [
      '--- SESSION SUMMARY (compacted) ---',
      `Previous ${toSummarize.length} messages summarized:`,
      ...summaryParts.slice(0, 20),
      '--- END SUMMARY ---',
    ].join('\n');

    // Replace history with summary + recent messages
    this.history = [
      { role: 'user', content: compactedSummary },
      { role: 'assistant', content: 'Understood. I have the context from the compacted session summary. Ready to continue.' },
      ...toKeep,
    ];

    // Estimate token savings (rough: ~4 chars per token)
    const estimatedSaved = toSummarize.reduce((acc, m) => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return acc + Math.floor(content.length / 4);
    }, 0);

    const afterTokens = Math.max(0, beforeTokens - estimatedSaved);
    this._compactTriggered = false;

    printCompactNotice(reason, beforeTokens, afterTokens);
  }

  // ── Fix 3: Preview file changes before writing ──────────────────────────────
  _isFileModification(toolName) {
    return ['write_file', 'edit_file'].includes(toolName);
  }

  async _previewFileChange(toolName, toolInput) {
    try {
      if (toolName === 'edit_file') {
        // Read current file content for diff
        const { path: filePath, old_string, new_string } = toolInput;
        const currentContent = await this.executor.readFile({ path: filePath }).catch(() => '');
        if (currentContent && old_string) {
          const newContent = currentContent.replace(old_string, new_string);
          printDiff(old_string, new_string, filePath);

          // If not auto-approve, ask for confirmation here
          if (!this.autoApprove) {
            const approved = await this._requestConfirmation('edit_file', toolInput);
            return { approved, oldContent: old_string, newContent: new_string, filePath };
          }
          return { approved: true, oldContent: old_string, newContent: new_string, filePath };
        }
      } else if (toolName === 'write_file') {
        const { path: filePath, content } = toolInput;
        // Try to read existing file for diff
        const currentContent = await this.executor.readFile({ path: filePath }).catch(() => null);
        if (currentContent !== null) {
          printDiff(currentContent, content, filePath);
          if (!this.autoApprove) {
            const approved = await this._requestConfirmation('write_file', toolInput);
            return { approved, oldContent: currentContent, newContent: content, filePath };
          }
          return { approved: true, oldContent: currentContent, newContent: content, filePath };
        }
        // New file — no diff to show
      }
    } catch {
      // If preview fails, allow the normal confirmation flow
    }
    return null;
  }

  // ── Call the model via the active provider (with retry) ──────────────────────
  async _callModel() {
    const messages = this._buildMessages();
    const MAX_RETRIES = 5;  // Increased from 3 (Fix 5: better retry)

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Fix 4: Only include active MCP schemas
        const mcpSchemas = this.mcpManager.getActiveSchemas();
        const allTools = [...TOOL_DEFINITIONS, ...mcpSchemas];

        const { stream, adapter, fullResult } = await this.client.streamMessage({
          messages,
          tools: allTools,
        });

        // Route to the right streaming parser
        switch (adapter) {
          case 'anthropic': return await this._consumeAnthropicStream(stream);
          case 'openai':    return await this._consumeOpenAIStream(stream);
          case 'google':    return await this._consumeGeminiStream(fullResult || stream);
          default:          throw new Error(`Unknown adapter: ${adapter}`);
        }
      } catch (err) {
        const isRetryable = this._isRetryableError(err);
        if (isRetryable && attempt < MAX_RETRIES) {
          // Fix 5: Exponential backoff with jitter, capped at 30s
          const baseDelay = Math.pow(2, attempt) * 1000;
          const jitter = Math.random() * 500;
          const delay = Math.min(baseDelay + jitter, 30_000);
          
          // Fix 6.4/6.5: Connection drops mid-thinking and retry indicator clears
          process.stdout.write(
            `\n\x1b[33m  ⚠ Connection dropped — retrying in ${Math.round(delay / 1000)}s...\x1b[0m\n`
          );
          
          await new Promise(r => setTimeout(r, delay));
          
          // Clear the retry message
          process.stdout.write('\x1b[1A\x1b[2K\x1b[1A\x1b[2K');
          continue;
        }

        // Fix 9: Better error messages for rate limits vs server errors
        if (/429|rate.?limit/i.test(err.message) || err.status === 429) {
          printError(`Rate limit hit. Check your plan limits or try a different model.`);
        } else if (/5\d{2}|server.?error/i.test(err.message) || (err.status >= 500)) {
          printError(`Server error — check https://status.anthropic.com or provider status page.`);
        }
        throw err;
      }
    }
  }

  // ── Check if an error is transient and retryable ────────────────────────────
  _isRetryableError(err) {
    const msg = err.message || '';
    // Rate limits, server errors, network issues
    if (/429|rate.?limit/i.test(msg)) return true;
    if (/5\d{2}|502|503|504|server.?error/i.test(msg)) return true;
    if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch.?failed|network/i.test(msg)) return true;
    if (err.status >= 500) return true;
    if (err.status === 429) return true;
    return false;
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
            currentToolId   = event.content_block.id;
            currentToolName = event.content_block.name;
            currentInputStr = '';
          }
          if (event.content_block.type === 'text' && firstText) {
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
    let textOutput  = '';
    let toolCalls   = [];
    let stopReason  = 'end_turn';
    let firstText   = true;

    for await (const event of parseOpenAIStream(body)) {
      if (this.abortController?.signal.aborted) return null;

      if (event.type === 'text') {
        if (firstText) {
          printAssistantPrefix();
          firstText = false;
        }
        printStreamChunk(event.text);
        textOutput += event.text;
      } else if (event.type === 'done') {
        toolCalls  = event.toolCalls;
        stopReason = event.stopReason;
      }
    }

    return { stopReason, toolCalls, textOutput, usage: null };
  }

  // ── Gemini stream consumer ───────────────────────────────────────────────────
  async _consumeGeminiStream(streamResult) {
    let textOutput  = '';
    let toolCalls   = [];
    let stopReason  = 'end_turn';
    let firstText   = true;

    for await (const event of parseGeminiStream(streamResult)) {
      if (this.abortController?.signal.aborted) return null;

      if (event.type === 'text') {
        if (firstText) {
          printAssistantPrefix();
          firstText = false;
        }
        printStreamChunk(event.text);
        textOutput += event.text;
      } else if (event.type === 'done') {
        toolCalls  = event.toolCalls;
        stopReason = event.stopReason;
      }
    }

    return { stopReason, toolCalls, textOutput, usage: null };
  }

  // ── Build messages for API ───────────────────────────────────────────────────
  _buildMessages() {
    const messages = [...this.history];
    // Inject CWD into first user message
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

  // ── Convert history to OpenAI format (for Ollama fallback) ──────────────────
  _convertHistoryToOpenAI(messages) {
    return convertToOpenAIMessages(messages);
  }

  // ── Confirmation logic ───────────────────────────────────────────────────────
  _needsConfirmation(toolName, params) {
    // File mutations always need confirmation
    if (['write_file', 'edit_file', 'delete_file', 'move_file'].includes(toolName)) return true;
    // Commands: safe read-only commands skip confirmation, everything else requires it
    if (toolName === 'run_command') {
      const cmd = params?.command || '';
      return !isSafeCommand(cmd);
    }
    return false;
  }

  async _requestConfirmation(toolName, params) {
    if (this.executor.onConfirm) return this.executor.onConfirm(toolName, params);
    return true;
  }

  // ── Fix 5: Save session state to disk ───────────────────────────────────────
  _saveSession() {
    try {
      this.session.save({
        cwd: this.cwd,
        modelId: this.modelId,
        history: this.history,
        memory: this.memoryRef,
        inputTokens: this.inputTokens,
        outputTokens: this.outputTokens,
        status: 'active',
      });
    } catch { /* don't break session on save failure */ }
  }

  // ── Fix 5: Restore session from disk ─────────────────────────────────────────
  async restoreSession(sessionId) {
    const data = SessionPersistence.restoreById(sessionId);
    if (!data) return false;

    this.history      = data.history || [];
    this.inputTokens  = data.inputTokens || 0;
    this.outputTokens = data.outputTokens || 0;
    this.turnCount    = Math.floor(this.history.length / 2);

    if (data.memory && this.memoryRef) {
      Object.assign(this.memoryRef, data.memory);
    }

    printInfo(`Restored session ${sessionId} (${this.turnCount} turns, ${(this.inputTokens + this.outputTokens).toLocaleString()} tokens)`);
    return true;
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  abort()          { this.abortController?.abort(); }
  resetHistory()   { this.history = []; this.inputTokens = 0; this.outputTokens = 0; this.turnCount = 0; this._compactTriggered = false; }
  setAutoApprove(v) { this.autoApprove = v; }

  // Mark session as completed on clean exit
  markSessionCompleted() {
    this.session.markCompleted();
  }

  // Get session ID for display
  getSessionId() {
    return this.session.sessionId;
  }
}
