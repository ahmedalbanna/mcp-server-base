/**
 * Plugin SDK for v2.2 Ecosystem (Phase 5 next)
 * Allows external integrations to register tools/resources/prompts via a simple interface
 *
 * Usage:
 *   import { definePlugin, registerPlugin } from './plugin/index.js';
 *   const slackPlugin = definePlugin({ name: 'slack', version: '1.0.0', register: (server) => { ... } });
 *   registerPlugin(server, slackPlugin);
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../utils/logger.js';

export type Plugin = {
  name: string;
  version: string;
  description?: string;
  author?: string;
  // Called when plugin is registered on server
  register: (server: McpServer) => void | Promise<void>;
  // Optional metadata
  tools?: string[];
  resources?: string[];
  prompts?: string[];
};

const registeredPlugins = new Map<string, Plugin>();

export function definePlugin(plugin: Plugin): Plugin {
  return plugin;
}

export function registerPlugin(server: McpServer, plugin: Plugin): void {
  if (registeredPlugins.has(plugin.name)) {
    logger.warn(`Plugin ${plugin.name} already registered, skipping`);
    return;
  }
  try {
    plugin.register(server);
    registeredPlugins.set(plugin.name, plugin);
    logger.info(`Plugin registered: ${plugin.name}@${plugin.version}`, {
      tools: plugin.tools,
      resources: plugin.resources,
    });
    // Notify clients that capabilities changed
    try {
      server.sendToolListChanged();
      server.sendResourceListChanged();
      server.sendPromptListChanged();
    } catch {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Tolerate duplicate tool/resource registrations (e.g., re-registering on same server)
    if (msg.includes('already registered')) {
      registeredPlugins.set(plugin.name, plugin);
      logger.warn(`Plugin ${plugin.name} partially skipped (some capabilities already registered)`);
      return;
    }
    logger.error(`Failed to register plugin ${plugin.name}`, { error: msg });
    throw err;
  }
}

export function getRegisteredPlugins(): Plugin[] {
  return [...registeredPlugins.values()];
}

export function clearPlugins(): void {
  registeredPlugins.clear();
}

export function getPlugin(name: string): Plugin | undefined {
  return registeredPlugins.get(name);
}
