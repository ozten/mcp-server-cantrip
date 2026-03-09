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
  console.error("mcp-server-cantrip running");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
