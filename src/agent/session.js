// DM Code — Session Persistence
// Saves session state to disk after every turn, enables crash recovery and resume

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const SESSION_DIR = path.join(os.homedir(), '.dmcode', 'sessions');

export class SessionPersistence {
  constructor(sessionId) {
    this.sessionId = sessionId || crypto.randomUUID().slice(0, 8);
    this.file = path.join(SESSION_DIR, `${this.sessionId}.json`);
    // Ensure session directory exists
    fsSync.mkdirSync(SESSION_DIR, { recursive: true });
  }

  // Save session state after every turn
  save(state) {
    try {
      const data = {
        id: this.sessionId,
        savedAt: Date.now(),
        savedAtISO: new Date().toISOString(),
        cwd: state.cwd || process.cwd(),
        modelId: state.modelId || '',
        history: state.history || [],
        memory: state.memory || {},
        inputTokens: state.inputTokens || 0,
        outputTokens: state.outputTokens || 0,
        status: state.status || 'active',  // active | completed | crashed
      };
      fsSync.writeFileSync(this.file, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Silently ignore write errors — don't break the session
    }
  }

  // Restore a saved session
  restore() {
    try {
      if (!fsSync.existsSync(this.file)) return null;
      const raw = fsSync.readFileSync(this.file, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // Mark session as completed on clean exit
  markCompleted() {
    try {
      const data = this.restore();
      if (data) {
        data.status = 'completed';
        fsSync.writeFileSync(this.file, JSON.stringify(data, null, 2), 'utf-8');
      }
    } catch { /* ignore */ }
  }

  // List all saved sessions
  static async listSessions() {
    try {
      await fs.mkdir(SESSION_DIR, { recursive: true });
      const files = await fs.readdir(SESSION_DIR);
      const sessions = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(SESSION_DIR, file), 'utf-8');
          const data = JSON.parse(raw);
          sessions.push({
            id: data.id,
            cwd: data.cwd,
            modelId: data.modelId,
            savedAt: data.savedAt,
            savedAtISO: data.savedAtISO,
            status: data.status || 'active',
            turns: Math.floor((data.history || []).length / 2),
            tokens: (data.inputTokens || 0) + (data.outputTokens || 0),
          });
        } catch { /* skip corrupt files */ }
      }

      // Sort by most recent first
      sessions.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      return sessions;
    } catch {
      return [];
    }
  }

  // Find sessions that crashed (status === 'active' means unclean exit)
  static async findCrashedSessions() {
    const sessions = await SessionPersistence.listSessions();
    return sessions.filter(s => s.status === 'active');
  }

  // Restore a specific session by ID
  static restoreById(sessionId) {
    const sp = new SessionPersistence(sessionId);
    return sp.restore();
  }

  // Delete a session
  static async deleteSession(sessionId) {
    const file = path.join(SESSION_DIR, `${sessionId}.json`);
    try {
      await fs.unlink(file);
      return true;
    } catch {
      return false;
    }
  }

  // Clean up old sessions (older than 30 days)
  static async cleanupOldSessions(maxAgeDays = 30) {
    const sessions = await SessionPersistence.listSessions();
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let cleaned = 0;
    for (const s of sessions) {
      if (s.savedAt && s.savedAt < cutoff && s.status === 'completed') {
        await SessionPersistence.deleteSession(s.id);
        cleaned++;
      }
    }
    return cleaned;
  }
}
