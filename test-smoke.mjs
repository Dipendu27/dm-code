// DM Code — Smoke Test Suite (37 assertions)
import { ToolExecutor, isSafeCommand, isDangerous } from './src/tools/executor.js';
import { getModelById, MODELS, buildSystemPrompt } from './src/config/constants.js';
import { SessionPersistence } from './src/agent/session.js';
import { MCPSchemaManager } from './src/agent/mcp-manager.js';
import { retryAsync, withTimeout, APIError, FileError } from './src/utils/errors.js';
import { validateFilePath, validateCommand, RateLimiter } from './src/utils/validation.js';

let pass = 0, fail = 0;
function ok(label, cond) {
  if (cond) { console.log('  ✓', label); pass++; }
  else       { console.error('  ✗', label); fail++; }
}

// ── ToolExecutor ────────────────────────────────────────────────────────
const ex = new ToolExecutor({ cwd: process.cwd(), memory: {} });

const pkg = await ex.readFile({ path: 'package.json' });
ok('readFile: returns content', pkg.includes('"dm-code"'));

const lines = await ex.readFile({ path: 'package.json', start_line: 1, end_line: 3 });
ok('readFile: line range', lines.split('\n').length <= 3);

await ex.writeFile({ path: '__test_tmp__.txt', content: 'hello world\nline2\n' });
const written = await ex.readFile({ path: '__test_tmp__.txt' });
ok('writeFile: content correct', written.trim() === 'hello world\nline2');

await ex.editFile({ path: '__test_tmp__.txt', old_string: 'hello world', new_string: 'goodbye world' });
const edited = await ex.readFile({ path: '__test_tmp__.txt' });
ok('editFile: replacement applied', edited.includes('goodbye world'));
ok('editFile: old string gone', !edited.includes('hello world'));

await ex.deleteFile({ path: '__test_tmp__.txt' });
try { await ex.readFile({ path: '__test_tmp__.txt' }); ok('deleteFile: file removed', false); }
catch { ok('deleteFile: file removed', true); }

const listing = await ex.listFiles({ path: '.' });
ok('listFiles: returns entries', listing.includes('package.json'));

const found = await ex.searchFiles({ pattern: 'dm-code', path: '.', glob: '*.json' });
ok('searchFiles: finds pattern', found.includes('package.json'));

await ex.createDirectory({ path: '__test_dir__' });
await ex.writeFile({ path: '__test_dir__/a.txt', content: 'move me' });
await ex.moveFile({ source: '__test_dir__/a.txt', destination: '__test_dir__/b.txt' });
const moved = await ex.readFile({ path: '__test_dir__/b.txt' });
ok('moveFile: content correct', moved.trim() === 'move me');
await ex.deleteFile({ path: '__test_dir__', recursive: true });

await ex.memoryWrite({ key: 'testkey', value: 'testval' });
const mem = await ex.memoryRead({ key: 'testkey' });
ok('memory read/write', mem === 'testval');
const noMem = await ex.memoryRead({ key: 'nonexistent' });
ok('memory_read: missing key message', noMem.includes('no memory stored'));

try { await ex.readFile({ path: '../../../etc/passwd' }); ok('path traversal blocked', false); }
catch (e) { ok('path traversal blocked', e.message.includes('traversal') || e.message.includes('outside')); }

const res = await ex.runCommand({ command: 'node --version' });
ok('runCommand: node --version works', res.exitCode === 0 && res.stdout.startsWith('v'));

ok('isDangerous rm -rf', isDangerous('rm -rf /'));
ok('isSafeCommand node --version', isSafeCommand('node --version'));

await ex.writeFile({ path: '__dup__.txt', content: 'dupe\ndupe\nend' });
try {
  await ex.editFile({ path: '__dup__.txt', old_string: 'dupe', new_string: 'x' });
  ok('editFile: duplicate match throws', false);
} catch(e) { ok('editFile: duplicate match throws', e.message.includes('matches 2')); }
await ex.deleteFile({ path: '__dup__.txt' });

await ex.writeFile({ path: '__miss__.txt', content: 'hello' });
try {
  await ex.editFile({ path: '__miss__.txt', old_string: 'NOPE', new_string: 'x' });
  ok('editFile: missing old_string throws', false);
} catch(e) { ok('editFile: missing old_string throws', e.message.includes('not found')); }
await ex.deleteFile({ path: '__miss__.txt' });

// ── Model registry ────────────────────────────────────────────────────────
ok('MODELS: 11 entries', MODELS.length === 11);
ok('getModelById: valid id', getModelById('gemini-2.0-flash').provider === 'google');
ok('getModelById: unknown falls back', getModelById('nope').id === MODELS[0].id);
ok('system prompt: has Annihilator', buildSystemPrompt().includes('Annihilator'));

// ── Errors ────────────────────────────────────────────────────────────────
const apiErr = new APIError('rate limit hit', 429, 'groq');
ok('APIError.isRateLimit()', apiErr.isRateLimit());
ok('APIError.isRetryable()', apiErr.isRetryable());
const authErr = new APIError('unauthorized', 401, 'anthropic');
ok('APIError.isAuthError()', authErr.isAuthError());

let attempts = 0;
const result = await retryAsync(async () => {
  attempts++;
  if (attempts < 3) throw new Error('transient');
  return 'done';
}, { maxRetries: 3, baseDelayMs: 1 });
ok('retryAsync: retries and succeeds', result === 'done' && attempts === 3);

const fast = await withTimeout(Promise.resolve('fast'), 1000);
ok('withTimeout: resolves normally', fast === 'fast');
try {
  await withTimeout(new Promise(r => setTimeout(r, 2000)), 50, 'timeout!');
  ok('withTimeout: throws on timeout', false);
} catch(e) { ok('withTimeout: throws on timeout', e.message === 'timeout!'); }

// ── Validation ────────────────────────────────────────────────────────────
const vp = validateFilePath('src/repl.js', process.cwd());
ok('validateFilePath: valid path', vp.includes('src'));
try {
  validateFilePath('../../../etc/passwd', process.cwd());
  ok('validateFilePath: traversal throws', false);
} catch { ok('validateFilePath: traversal throws', true); }

const vc = validateCommand('node --version');
ok('validateCommand: safe cmd', vc.safe);
const vc2 = validateCommand('rm -rf /');
ok('validateCommand: dangerous cmd', !vc2.safe && vc2.reasons.length > 0);

const rl = new RateLimiter(3, 1000);
ok('RateLimiter: allows within limit', rl.isAllowed('k') && rl.isAllowed('k') && rl.isAllowed('k'));
ok('RateLimiter: blocks over limit', !rl.isAllowed('k'));

// ── SessionPersistence ───────────────────────────────────────────────────
const sp = new SessionPersistence('test-smoke-' + Date.now());
sp.save({ cwd: process.cwd(), modelId: 'gemini-2.0-flash', history: [{ role:'user', content:'hello' }], status: 'active' });
const restored = sp.restore();
ok('SessionPersistence: save/restore', restored?.history?.[0]?.content === 'hello');
sp.markCompleted();
const completed = sp.restore();
ok('SessionPersistence: markCompleted', completed?.status === 'completed');
await SessionPersistence.deleteSession(sp.sessionId);

// ── MCPSchemaManager ─────────────────────────────────────────────────────
const mcp = new MCPSchemaManager();
mcp.loadManifests([{ name: 'github', description: 'GitHub tools' }]);
mcp.registerSchema('github', [{ name: 'list_repos', description: 'List repos', input_schema: {} }]);
// Must await activateTool — it is async
await mcp.activateTool('github');
const schemas = mcp.getActiveSchemas();
ok('MCPSchemaManager: getActiveSchemas', schemas.length === 1 && schemas[0].name === 'list_repos');
mcp.pruneInactive(0); // TTL=0ms → prune everything
ok('MCPSchemaManager: pruneInactive', mcp.getActiveSchemas().length === 0);

// ── Summary ───────────────────────────────────────────────────────────────
console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
