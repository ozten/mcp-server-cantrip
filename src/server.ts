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

  return server;
}
