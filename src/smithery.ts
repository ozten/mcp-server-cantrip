import { z } from "zod";
import { createCantripServer } from "./server.js";

export const configSchema = z.object({
  cantripApiKey: z.string().describe("Cantrip API key from https://dashboard.cantrip.ai"),
});

export default function createServer({
  config,
}: {
  config: z.infer<typeof configSchema>;
}) {
  return createCantripServer({
    apiKey: config.cantripApiKey,
  }).server;
}
