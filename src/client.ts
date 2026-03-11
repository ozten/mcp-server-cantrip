import type { CantripRequest, CantripResponse } from "./types.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_URL = "https://api.cantrip.ai";
const CONFIG_FILE = ".cantrip.json";

// ── Config interface ─────────────────────────────────────────────────

export interface CantripClientConfig {
  apiKey: string;
  apiUrl?: string;
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

/**
 * Resolve project context: explicit slug wins, then .cantrip.json fallback.
 * Throws a clear error if neither source provides a project.
 */
export function resolveProject(inlineSlug?: string): string {
  if (inlineSlug) return inlineSlug;

  const fromFile = readProjectContext();
  if (fromFile) return fromFile;

  throw new Error(
    "No project context. Either pass the 'project' slug as a parameter, " +
    "or run cantrip_connect first.",
  );
}

export function writeProjectContext(project: string): void {
  writeFileSync(
    getConfigPath(),
    JSON.stringify({ project }, null, 2) + "\n",
    "utf-8",
  );
}

// ── HTTP client ────────────────────────────────────────────────────

export class CantripClient {
  private apiKey: string;
  private apiUrl: string;

  constructor(config: CantripClientConfig) {
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl ?? DEFAULT_URL;
  }

  get url(): string {
    return this.apiUrl;
  }

  get hasApiKey(): boolean {
    return !!this.apiKey;
  }

  /**
   * POST a command envelope to the cantrip daemon.
   * Automatically injects project from .cantrip.json (if not already in flags).
   */
  async post(
    command: string,
    args: string[] = [],
    flags: Record<string, string> = {},
  ): Promise<CantripResponse> {
    const url = `${this.apiUrl}/api/cantrip`;

    // Inject project from .cantrip.json if not provided
    if (!flags.project) {
      const project = readProjectContext();
      if (project) flags.project = project;
    }

    const body: CantripRequest = { command, args, flags };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    } catch (err) {
      throw new Error(
        `Cannot reach Cantrip API at ${this.apiUrl}. ` +
          `Check your network connection and CANTRIP_API_KEY.\n` +
          `(${err instanceof Error ? err.message : String(err)})`,
      );
    }

    const json = (await res.json()) as CantripResponse;
    if ("error" in json && typeof json.error === "string") {
      let message = json.error;
      if (/insufficient credits/i.test(message)) {
        message += "\n\nPurchase credits at https://cantrip.ai";
      }
      if (/not authenticated/i.test(message) || /unauthorized/i.test(message)) {
        message +=
          "\n\nSet CANTRIP_API_KEY in your MCP server config. Get a key at https://cantrip.ai";
      }
      throw new Error(`cantrip error: ${message}`);
    }
    return json;
  }
}
