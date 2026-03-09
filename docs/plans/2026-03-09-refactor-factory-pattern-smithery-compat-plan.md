---
title: "refactor: Factory pattern + Smithery registry compatibility"
type: refactor
status: completed
date: 2026-03-09
---

# refactor: Factory pattern + Smithery registry compatibility

## Overview

Extract server construction into a pure factory function, enabling Smithery registry listing while preserving stdio for existing users. The refactor decouples config from `process.env`, transport from construction, and opens the door to testability and third-party embedding.

## Problem Statement

`src/index.ts` tightly couples three concerns: config resolution (`process.env`), server construction (tool registration), and transport binding (stdio). This makes it impossible to list on Smithery (which needs a factory that accepts config and returns a `Server`) and difficult to test or embed.

Additionally, `src/client.ts` reads `process.env.CANTRIP_API_KEY` and `process.env.CANTRIP_URL` at call time inside `postCantrip()`, and `cantrip_status` in `tools.ts:83` directly reads `process.env.CANTRIP_API_KEY`. These are secondary coupling points.

## Proposed Solution

Three-layer architecture:

```
src/server.ts    — pure factory: config in, McpServer out (no process.env, no transport)
src/index.ts     — stdio entry point: reads env, calls factory, connects transport
src/smithery.ts  — Smithery adapter: exports configSchema + default factory function
```

Plus `smithery.yaml` at project root.

## Technical Approach

### Dependency Strategy: No `@smithery/sdk`

The Smithery adapter is ~10 lines. The `@smithery/sdk` package is types-only but requires `zod ^4` (v3.0+) or pins to `zod >=3.23.8 <4.0.0` (v2.1.0). Either way, adding it creates version management burden for zero runtime value.

**Decision: Write the adapter manually.** The Smithery `ServerModule` contract is:
- `export default function(context: { config, env }) => Server`
- `export const configSchema = z.object({...})`

We can satisfy this without importing anything from Smithery. If the interface ever changes, it's a 10-line fix.

**Dependency bumps required: None.** Stay on current `@modelcontextprotocol/sdk ^1.12.1` and `zod ^3.24.0`. The Smithery build environment will have its own dependency resolution.

### Phase 1: Decouple `client.ts` from `process.env`

**Problem:** `postCantrip()` reads `process.env.CANTRIP_API_KEY` and `process.env.CANTRIP_URL` at call time. Tool handlers import `postCantrip` directly.

**Solution:** Create a `CantripClient` class that closes over config. Make `tools.ts` export a factory function instead of a static array.

#### `src/client.ts` changes

```typescript
// NEW: CantripClient class
export interface CantripClientConfig {
  apiKey: string;
  apiUrl?: string;
}

export class CantripClient {
  private apiKey: string;
  private apiUrl: string;

  constructor(config: CantripClientConfig) {
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl ?? DEFAULT_URL;
  }

  get url(): string { return this.apiUrl; }
  get hasApiKey(): boolean { return !!this.apiKey; }

  async post(
    command: string,
    args: string[] = [],
    flags: Record<string, string> = {},
  ): Promise<CantripResponse> {
    // Same logic as current postCantrip(), but uses this.apiKey and this.apiUrl
    // instead of process.env
  }
}

// KEEP: readProjectContext(), writeProjectContext(), getConfigPath()
// These are filesystem operations, not config-dependent.
// REMOVE: getDaemonUrl() — replaced by client.url
// REMOVE: postCantrip() free function — replaced by client.post()
```

#### `src/tools.ts` changes

```typescript
// BEFORE: export const tools: ToolDef[] = [...]
// AFTER:  export function createTools(client: CantripClient): ToolDef[]

import { CantripClient } from "./client.js";

export function createTools(client: CantripClient): ToolDef[] {
  return [
    {
      name: "cantrip_status",
      // ...
      handler: async () => {
        // BEFORE: const apiKeyConfigured = !!process.env.CANTRIP_API_KEY;
        // AFTER:
        const apiKeyConfigured = client.hasApiKey;
        const whoami = await client.post("whoami", [], {});
        // ...
      },
    },
    {
      name: "cantrip_init",
      // ...
      handler: async (p) => {
        // BEFORE: await postCantrip("init", [], flags);
        // AFTER:
        await client.post("init", [], flags);
        // ...
      },
    },
    // ... all 17 tools updated to use client.post() instead of postCantrip()
  ];
}
```

### Phase 2: Extract factory into `src/server.ts`

```typescript
// src/server.ts
import { createRequire } from "module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CantripClient, type CantripClientConfig } from "./client.js";
import { createTools } from "./tools.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

export type { CantripClientConfig };

export function createCantripServer(config: CantripClientConfig): McpServer {
  const client = new CantripClient(config);
  const server = new McpServer({
    name: "mcp-server-cantrip",
    version,
  });

  for (const tool of createTools(client)) {
    server.tool(
      tool.name,
      tool.description,
      tool.shape,
      async (params: Record<string, unknown>) => {
        try {
          const result = await tool.handler(params);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}
```

**Note on `createRequire` resolution:** `src/server.ts` compiles to `dist/server.js`. The `require("../package.json")` path resolves from `dist/` to the project root — same as the current `index.ts`. No change needed.

### Phase 3: Simplify `src/index.ts` to stdio entry point

```typescript
#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCantripServer } from "./server.js";

const server = createCantripServer({
  apiKey: process.env.CANTRIP_API_KEY ?? "",
  apiUrl: process.env.CANTRIP_URL,
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`mcp-server-cantrip running`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

### Phase 4: Add Smithery adapter + yaml

#### `src/smithery.ts`

```typescript
import { z } from "zod";
import { createCantripServer } from "./server.js";

export const configSchema = z.object({
  cantripApiKey: z.string().describe("Cantrip API key"),
  cantripUrl: z.string().optional().describe("Cantrip API URL (default: https://api.cantrip.ai)"),
});

export default function createServer({
  config,
}: {
  config: z.infer<typeof configSchema>;
}) {
  return createCantripServer({
    apiKey: config.cantripApiKey,
    apiUrl: config.cantripUrl,
  }).server;
}
```

**Key detail:** Returns `.server` (the low-level `Server` instance), not the `McpServer` wrapper. This is what Smithery expects.

#### `smithery.yaml` (project root)

```yaml
startCommand:
  type: stdio
  configSchema:
    type: object
    required:
      - cantripApiKey
    properties:
      cantripApiKey:
        type: string
        description: "Cantrip API key"
      cantripUrl:
        type: string
        description: "Cantrip API URL (default: https://api.cantrip.ai)"
  commandFunction: |
    (config) => ({
      command: 'npx',
      args: ['-y', 'mcp-server-cantrip'],
      env: {
        CANTRIP_API_KEY: config.cantripApiKey,
        CANTRIP_URL: config.cantripUrl ?? ''
      }
    })
```

**Why `startCommand` instead of `runtime: "typescript"`?** The `runtime: "typescript"` path requires `@smithery/sdk` as a dependency and the Smithery build pipeline. The `startCommand` approach works with our existing npm package — Smithery just runs `npx mcp-server-cantrip` with the user's config mapped to env vars. Zero Smithery dependency. If we later want hosted deployment, we add the `runtime: "typescript"` path using `src/smithery.ts`.

### `.gitignore` update

Add `smithery.yaml` is tracked (no change needed — it's not in `.gitignore`).

## System-Wide Impact

- **No breaking changes.** `package.json` `bin` still points to `dist/index.js`. Env vars unchanged. Stdio behavior identical.
- **No new runtime dependencies.** `@smithery/sdk` is NOT added.
- **No dependency version bumps.** Stay on current MCP SDK and zod versions.
- **`src/smithery.ts` in npm package:** It compiles to `dist/smithery.js` and is included in the `dist/` directory which is already in `files`. It imports only from `./server.js` and `zod` — both available at runtime. No Smithery imports.

## Acceptance Criteria

- [x] `npm run build` succeeds
- [ ] `npx mcp-server-cantrip` works identically to current behavior (stdio, env vars)
- [x] `src/server.ts` exports `createCantripServer(config)` with no `process.env` reads
- [x] `src/client.ts` has no `process.env` reads (all in `CantripClient` constructor args)
- [x] `src/tools.ts` has no `process.env` reads (uses injected `CantripClient`)
- [x] `src/smithery.ts` exports `configSchema` and default function
- [x] `smithery.yaml` exists at project root with `startCommand` config
- [x] `createCantripServer` can be imported and called with mock config (testability)
- [x] 19 tools registered (count unchanged — was 19 not 17)

## File Change Summary

| File | Action | Description |
|---|---|---|
| `src/server.ts` | **CREATE** | Factory function + version resolution |
| `src/smithery.ts` | **CREATE** | Smithery adapter (~15 lines) |
| `smithery.yaml` | **CREATE** | Smithery registry config |
| `src/index.ts` | **MODIFY** | Slim down to stdio entry point (~15 lines) |
| `src/client.ts` | **MODIFY** | Extract `CantripClient` class, remove free `postCantrip()` |
| `src/tools.ts` | **MODIFY** | `tools` array becomes `createTools(client)` factory |
| `src/types.ts` | No change | |
| `package.json` | No change | `bin`, `files`, `dependencies` all stay the same |

## Open Questions

**Q1: Should `CantripConfig` include an optional `project` field for non-filesystem contexts?**
In Smithery's hosted environment, `process.cwd()/.cantrip.json` may not exist. Adding `project?: string` to config would let hosted users set context without the filesystem. *Recommendation:* Defer — the `startCommand` approach runs via `npx` which has a normal filesystem. Revisit if we add `runtime: "typescript"` hosted deployment.

**Q2: Should we add a smoke test?**
The project has zero tests. A minimal test that calls `createCantripServer({apiKey: "test"})` and verifies 17 tools are registered would catch regressions. *Recommendation:* Yes, add in a follow-up. Don't block this refactor on it.

## Sources

- [Smithery YAML Config](https://smithery.ai/docs/build/project-config/smithery-yaml)
- [@smithery/sdk on npm](https://www.npmjs.com/package/@smithery/sdk) — v4.3.0 requires zod ^4 (avoided)
- [@smithery/sdk@2.1.0](https://www.npmjs.com/package/@smithery/sdk/v/2.1.0) — requires zod >=3.23.8 <4.0.0 (option if we want types)
- [@modelcontextprotocol/sdk@1.25.1](https://www.npmjs.com/package/@modelcontextprotocol/sdk/v/1.25.1) — accepts zod ^3.25 || ^4.0
