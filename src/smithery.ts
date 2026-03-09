import { z } from "zod";
import { createCantripServer } from "./server.js";

export const configSchema = z.object({
  cantripApiKey: z.string().describe("Cantrip API key"),
  cantripUrl: z
    .string()
    .optional()
    .describe("Cantrip API URL (default: https://api.cantrip.ai)"),
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
