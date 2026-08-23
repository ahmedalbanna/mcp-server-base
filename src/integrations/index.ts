/**
 * Integrations barrel (v2.2)
 * Export all plugins for easy import:
 *   import { slackPlugin, notionPlugin, linearPlugin } from './integrations/index.js';
 *   import { registerPlugin } from './plugin/index.js';
 *   registerPlugin(server, slackPlugin);
 */
export { slackPlugin } from './slack.js';
export { notionPlugin } from './notion.js';
export { linearPlugin } from './linear.js';

import { slackPlugin } from './slack.js';
import { notionPlugin } from './notion.js';
import { linearPlugin } from './linear.js';
import type { Plugin } from '../plugin/index.js';

export const allPlugins: Plugin[] = [slackPlugin, notionPlugin, linearPlugin];
