#!/usr/bin/env node

import { createRequire } from "module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tools } from "./tools.js";
import { getDaemonUrl } from "./client.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const server = new McpServer({
  name: "mcp-server-cantrip",
  version,
});

// Register all tools using v1 API: server.tool(name, description, shape, handler)
for (const tool of tools) {
  server.tool(
    tool.name,
    tool.description,
    tool.shape,
    async (params: Record<string, unknown>) => {
      try {
        const result = await tool.handler(params);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
          isError: true,
        };
      }
    },
  );
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `mcp-server-cantrip running (daemon: ${getDaemonUrl()})`,
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
