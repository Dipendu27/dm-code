// DM Code — MCP Schema Manager
// Lazy-loads MCP tool schemas to prevent token inflation from unused connectors

export class MCPSchemaManager {
  constructor() {
    this.manifests = new Map();        // name → { name, description }
    this.schemas = new Map();          // name → full schema (tool definitions)
    this.activeInSession = new Set();  // connectors used in this session
    this.lastUsed = new Map();         // name → timestamp of last use
  }

  // Called at session start — lightweight, just name + description
  loadManifest(name, description) {
    this.manifests.set(name, { name, description });
  }

  // Load multiple manifests at once
  loadManifests(connectors) {
    for (const { name, description } of connectors) {
      this.loadManifest(name, description);
    }
  }

  // Called lazily on first tool use from a connector
  async activateTool(connectorName) {
    if (!this.schemas.has(connectorName)) {
      const schema = await this._fetchSchema(connectorName);
      if (schema) {
        this.schemas.set(connectorName, schema);
      }
    }
    // Set lastUsed AFTER the async fetch completes — prevents pruneInactive
    // from racing and removing a connector that is mid-activation.
    this.lastUsed.set(connectorName, Date.now());
    this.activeInSession.add(connectorName);
  }

  // Prune connectors inactive for longer than ttlMs (default: 10 minutes)
  pruneInactive(ttlMs = 10 * 60 * 1000) {
    const now = Date.now();
    for (const [name, ts] of this.lastUsed) {
      if (now - ts >= ttlMs) {
        this.activeInSession.delete(name);
        // Keep the schema cached — just don't inject it
      }
    }
  }

  // Get only the schemas for active connectors (for API call injection)
  getActiveSchemas() {
    return [...this.activeInSession]
      .map(name => this.schemas.get(name))
      .filter(Boolean)
      .flat();
  }

  // Get a lightweight summary of all available connectors (for display)
  getManifestSummary() {
    return [...this.manifests.values()].map(m => ({
      name: m.name,
      description: m.description,
      active: this.activeInSession.has(m.name),
      lastUsed: this.lastUsed.get(m.name) || null,
    }));
  }

  // Check if a tool belongs to an MCP connector and activate it
  checkAndActivate(toolName) {
    for (const [connectorName, schema] of this.schemas) {
      if (Array.isArray(schema)) {
        const found = schema.find(t => t.name === toolName);
        if (found) {
          this.lastUsed.set(connectorName, Date.now());
          this.activeInSession.add(connectorName);
          return true;
        }
      }
    }
    return false;
  }

  // Reset all state
  reset() {
    this.activeInSession.clear();
    this.lastUsed.clear();
  }

  // Internal: fetch full schema for a connector
  // Override this in production to connect to actual MCP servers
  async _fetchSchema(connectorName) {
    const manifest = this.manifests.get(connectorName);
    if (!manifest) return null;

    // In a real implementation, this would call the MCP server.
    // For now, return null — schemas are registered externally via registerSchema().
    return null;
  }

  // Register a full schema for a connector (used by external integrations)
  registerSchema(connectorName, toolDefinitions) {
    this.schemas.set(connectorName, toolDefinitions);
  }

  // Get count of active vs total connectors
  getStats() {
    return {
      total: this.manifests.size,
      active: this.activeInSession.size,
      cached: this.schemas.size,
    };
  }
}
