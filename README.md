# MCP Server Base — Strong Production Ready (2026)

Modern **Model Context Protocol** server using the latest stack:

- **MCP SDK `1.12+`** — `McpServer` high-level API + `StreamableHTTPServerTransport` (new) & `StdioServerTransport`
- **TypeScript 5.7 ESM** + `NodeNext` module
- **Zod** validation → auto JSON Schema
- **Express 4** for HTTP + CORS + health check
- Dual transport: **STDIO** (Claude Desktop) and **Streamable HTTP** (remote, 2025-03 spec)
- Structured tool/resource/prompt modules
- `tsx` watch, `vitest`, graceful shutdown

---

## 🚀 Quick Start

```bash
npm install
npm run build

# STDIO (for Claude Desktop, Cursor, opencode, etc.)
npm start

# HTTP (Streamable HTTP - latest)
npm run start:http
# → http://localhost:3000/mcp
# → health http://localhost:3000/health
```

### Dev

```bash
npm run dev          # stdio watch
npm run dev:http     # http watch
npm test
npm run typecheck
```

---

## 🔌 Transports

| Transport | Use | Command |
|-----------|-----|---------|
| **STDIO** | Local clients (Claude Desktop) | `node dist/index.js` |
| **Streamable HTTP** | Remote / Docker / Cloud | `node dist/index.js --http` |

Streamable HTTP is the **new standard** replacing SSE (deprecated March 2025).

---

## 🧰 Tools (4)

| Tool | Description | Input |
|------|-------------|-------|
| `echo` | Echo message | `message`, `uppercase?` |
| `calculator` | add/sub/mul/div | `operation`, `a`, `b` |
| `get_time` | Current time | `timezone?` |
| `fetch_url` | Fetch URL | `url`, `maxLength?` |

## 📦 Resources (2)

- `config://server-info` — server metadata (JSON)
- `greeting://{name}` — dynamic greeting template

## 💬 Prompts (2)

- `code-review` — args: `language`, `code`
- `explain-concept` — args: `concept`, `level`

---

## ⚙️ Client Config

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "mcp-server-base": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

### HTTP Client

```ts
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const client = new Client({ name: "my-client", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp")));
const tools = await client.listTools();
```

### Inspector

```bash
npm run inspect
# or
npx @modelcontextprotocol/inspector node dist/index.js
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```

---

## 🐳 Docker

```dockerfile
# See Dockerfile
docker build -t mcp-server-base .
docker run -p 3000:3000 --env TRANSPORT=http mcp-server-base
```

---

## 📁 Structure

```
src/
├── index.ts        # entry: stdio + http dual transport
├── server.ts       # createMcpServer() factory
├── config.ts       # env config
├── types.ts        # Zod schemas
├── utils/logger.ts # stderr logger (stdio-safe)
├── tools/          # registerAllTools()
├── resources/      # registerAllResources()
└── prompts/        # registerAllPrompts()
```

Add a new tool: create `src/tools/my.tool.ts` → export `registerMyTool(server)` → add to `src/tools/index.ts`.

---

## 🔐 Best Practices Included

- Logger uses `console.error` (stderr) so logs don't corrupt stdio stdout
- Zod → JSON Schema via SDK
- Timeout on fetch (10s)
- Graceful SIGINT/SIGTERM
- Health endpoint separate from MCP
- Session isolation per HTTP request (randomUUID)
- Type-safe, strict TS

---

## 📚 MCP Docs

- Spec: https://spec.modelcontextprotocol.io
- SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Inspector: https://github.com/modelcontextprotocol/inspector
