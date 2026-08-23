# Contributing

Thanks for contributing to `mcp-server-base`!

## Prerequisites

- Node 22 (`nvm use` reads `.nvmrc`)
- npm 10+

## Setup

```bash
npm install
npm run typecheck
npm test
npm run build
npm run lint
```

## Development

- Stdio: `npm run dev`
- HTTP (Streamable HTTP): `npm run dev:http` → `http://localhost:3000/mcp` + `/health`
- Inspector: `npm run inspect` or `npx @modelcontextprotocol/inspector node dist/index.js`

## Adding a new Tool

1. Create `src/tools/my.tool.ts`:

```ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
export function registerMyTool(server: McpServer) {
  server.registerTool(
    'my_tool',
    {
      title: 'My Tool',
      description: 'What it does',
      inputSchema: { query: z.string().describe('Search query') },
    },
    async ({ query }) => {
      return { content: [{ type: 'text', text: `Result for ${query}` }] };
    }
  );
}
```

2. Register in `src/tools/index.ts:1` → `registerMyTool(server)`
3. Add test in `tests/server.test.ts:1` (use `InMemoryTransport`)
4. Run `npm run lint && npm run typecheck && npm test`

## Adding Resources / Prompts

- Resources: `server.registerResource(name, uriOrTemplate, config, callback)` — see `src/resources/index.ts:1`
- Prompts: `server.registerPrompt(name, config, callback)` — see `src/prompts/index.ts:1`

## Code Style

- TypeScript strict, ESM (`NodeNext`)
- `eslint` (flat config) + `prettier` — run `npm run format` and `npm run lint`
- `lint-staged` + `husky` run on `git commit`
- Logger must use `console.error` (stderr) — stdout is reserved for STDIO transport

## Tests

- Unit: `tests/server.test.ts` (InMemoryTransport)
- E2E HTTP: `tests/e2e/http.test.ts` (real Express + `StreamableHTTPClientTransport`)
- Coverage: `npm run test:coverage` — threshold 80% lines/functions/branches

## Commit & PR

- Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`
- PR must pass CI (`.github/workflows/ci.yml`): lint, typecheck, test, build
- Branch from `main`, rebase before merge

## Release

- `npm version patch|minor|major` → tag → `git push --tags`
- GitHub Release builds Docker image to GHCR
