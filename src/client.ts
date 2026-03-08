import type { CantripRequest, CantripResponse } from "./types.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_URL = "https://api.cantrip.ai";
const CONFIG_FILE = ".cantrip.json";

export function getDaemonUrl(): string {
  return process.env.CANTRIP_URL ?? DEFAULT_URL;
}

// ── Project context (.cantrip.json) ────────────────────────────────

export function getConfigPath(): string {
  return join(process.cwd(), CONFIG_FILE);
}

export function readProjectContext(): string | null {
  const path = getConfigPath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return typeof parsed.project === "string" ? parsed.project : null;
  } catch {
    return null;
  }
}

export function writeProjectContext(project: string): void {
  writeFileSync(
    getConfigPath(),
    JSON.stringify({ project }, null, 2) + "\n",
    "utf-8",
  );
}

// ── HTTP client ────────────────────────────────────────────────────

/**
 * POST a command envelope to the cantrip daemon.
 * Automatically injects:
 *  - project from .cantrip.json (if not already in flags)
 *  - Authorization header from CANTRIP_API_KEY
 */
export async function postCantrip(
  command: string,
  args: string[] = [],
  flags: Record<string, string> = {},
): Promise<CantripResponse> {
  const url = `${getDaemonUrl()}/api/cantrip`;

  // Inject project from .cantrip.json if not provided
  if (!flags.project) {
    const project = readProjectContext();
    if (project) flags.project = project;
  }

  const body: CantripRequest = { command, args, flags };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.CANTRIP_API_KEY;
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (err) {
    throw new Error(
      `Cannot reach Cantrip API at ${getDaemonUrl()}. ` +
        `Check your network connection and CANTRIP_API_KEY.\n` +
        `(${err instanceof Error ? err.message : String(err)})`,
    );
  }

  const json = (await res.json()) as CantripResponse;
  if ("error" in json && typeof json.error === "string") {
    throw new Error(`cantrip error: ${json.error}`);
  }
  return json;
}
