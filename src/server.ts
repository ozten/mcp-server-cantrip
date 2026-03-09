import { createRequire } from "module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CantripClient, type CantripClientConfig } from "./client.js";
import { createTools } from "./tools.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

export type { CantripClientConfig };

export function createCantripServer(config: CantripClientConfig): McpServer {
  const client = new CantripClient(config);
  const server = new McpServer(
    { name: "mcp-server-cantrip", version },
    {
      instructions: client.hasApiKey
        ? "Cantrip GTM engine. Learn more: https://cantrip.ai/llms.txt"
        : "CANTRIP_API_KEY is not set. No tools will work until the user configures an API key. " +
          "Direct them to https://cantrip.ai to sign up, then add CANTRIP_API_KEY to their MCP server config. " +
          "Run cantrip_status for setup instructions specific to their client. " +
          "Learn more: https://cantrip.ai/llms.txt",
    },
  );

  // Tools that work without an API key (local-only or diagnostic)
  const noKeyRequired = new Set(["cantrip_status", "cantrip_connect"]);

  for (const tool of createTools(client)) {
    server.tool(
      tool.name,
      tool.description,
      tool.shape,
      async (params: Record<string, unknown>) => {
        if (!client.hasApiKey && !noKeyRequired.has(tool.name)) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "CANTRIP_API_KEY is not configured. " +
                  "Run cantrip_status for setup instructions, or direct the user to https://cantrip.ai to get a key.",
              },
            ],
            isError: true,
          };
        }

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
