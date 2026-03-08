# mcp-server-cantrip

## What This Is

MCP server for the Cantrip GTM engine. Thin translation layer: MCP tool calls -> `{command, args, flags}` HTTP POST -> cantrip daemon. Zero business logic.

## Tech Stack

- TypeScript, Node.js
- `@modelcontextprotocol/sdk` v1.x (stdio transport)
- `zod` for parameter schemas

## Structure

```
src/
  index.ts    # Entry point, MCP server setup, tool registration loop
  client.ts   # HTTP client — postCantrip() + .cantrip.json context
  tools.ts    # All 17 tool definitions (shape + handler)
  types.ts    # CantripRequest/CantripResponse types
```

## Identity Model

- `CANTRIP_API_KEY` — env var in MCP server config. Sent as `Authorization: Bearer` header. Identifies user → resolves team server-side.
- `.cantrip.json` — per-project file in the working directory. Contains `{"project": "my-saas"}`. Read automatically on every request. Written by `cantrip_init` and `cantrip_connect`.

Agents never pass team or project as tool parameters. Context is ambient.

## Key Principle

Every tool handler is ~5 lines: validate params -> build `{command, args, flags}` -> POST to daemon -> return JSON. If you're adding business logic here, it belongs in the daemon instead.

## Adding a New Tool

1. Add a `ToolDef` entry in `tools.ts`
2. Define the `shape` (raw Zod fields, NOT wrapped in `z.object()`)
3. Implement `handler` that calls `postCantrip(command, args, flags)`
4. The registration loop in `index.ts` picks it up automatically

## Quality Gates

```bash
npm run build   # TypeScript compilation
```

## Environment

- `CANTRIP_API_KEY` — API key (sent as Bearer token)
- `CANTRIP_URL` — API URL (default: https://api.cantrip.ai)
