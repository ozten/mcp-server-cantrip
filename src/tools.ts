import { z } from "zod";
import { CantripClient, readProjectContext, resolveProject, writeProjectContext } from "./client.js";

// ── Shared schemas ──────────────────────────────────────────────────

const ENTITY_TYPES = [
  "icp",
  "pain_point",
  "value_prop",
  "experiment",
  "channel",
  "competitor",
  "contact",
] as const;

const entityTypeSchema = z.enum(ENTITY_TYPES).describe(
  "Entity type: icp, pain_point, value_prop, experiment, channel, competitor, contact",
);

const PROJECT_DESC_SUFFIX =
  " Pass `project` to override `.cantrip.json` — useful in cloud-hosted or multi-project contexts.";

const projectSchema = z.string().optional().describe(
  "Project slug — overrides .cantrip.json. Required in environments where cantrip_connect cannot write to the filesystem.",
);

function buildFlags(params: Record<string, unknown>): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      flags[k] = String(v);
    }
  }
  return flags;
}

// ── Tool definitions ────────────────────────────────────────────────

// Raw Zod shape — the v1 SDK wraps it in z.object() for us.
export type ZodRawShape = Record<string, z.ZodTypeAny>;

export interface ToolDef {
  name: string;
  description: string;
  shape: ZodRawShape;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

export function createTools(client: CantripClient): ToolDef[] {
  return [
    // ── Connect ──
    {
      name: "cantrip_connect",
      description:
        "Start here. Connect this workspace to a Cantrip project by writing a .cantrip.json file. " +
        "All subsequent commands will target this project automatically. " +
        "Call without arguments to check the current connection.",
      shape: {
        project: z
          .string()
          .optional()
          .describe("Project name to connect to. Omit to check current connection."),
      },
      handler: async (p) => {
        if (p.project) {
          writeProjectContext(String(p.project));
          return { connected: true, project: p.project, file: ".cantrip.json" };
        }
        const current = readProjectContext();
        if (current) {
          return { connected: true, project: current };
        }
        return {
          connected: false,
          message:
            "No .cantrip.json found. Call cantrip_connect with a project name, " +
            "or cantrip_init to create a new project.",
        };
      },
    },

    // ── Status ──
    {
      name: "cantrip_status",
      description:
        "Check daemon health, authentication, and current project. " +
        "Returns daemon reachability, authenticated identity (user, team), and the active project from .cantrip.json. " +
        "When CANTRIP_API_KEY is missing, returns setup instructions with config examples for common MCP clients.",
      shape: {},
      handler: async () => {
        const project = readProjectContext();
        const apiKeyConfigured = client.hasApiKey;

        if (!apiKeyConfigured) {
          return {
            status: "setup_required",
            api_key_configured: false,
            current_project: project ?? "none",
            message: "CANTRIP_API_KEY is not configured. The user needs to add it to their MCP server config.",
            setup: {
              step_1: "Sign up at https://cantrip.ai and copy your API key",
              step_2: "Add CANTRIP_API_KEY to your MCP server configuration (see examples below)",
              step_3: "Restart your MCP client to pick up the new config",
              examples: {
                claude_desktop: {
                  file: "~/Library/Application Support/Claude/claude_desktop_config.json (macOS) or %APPDATA%/Claude/claude_desktop_config.json (Windows)",
                  config: {
                    mcpServers: {
                      cantrip: {
                        command: "npx",
                        args: ["-y", "mcp-server-cantrip"],
                        env: { CANTRIP_API_KEY: "your-key-here" },
                      },
                    },
                  },
                },
                claude_code: {
                  file: ".mcp.json in project root",
                  config: {
                    mcpServers: {
                      cantrip: {
                        command: "npx",
                        args: ["-y", "mcp-server-cantrip"],
                        env: { CANTRIP_API_KEY: "your-key-here" },
                      },
                    },
                  },
                },
                cursor: {
                  file: ".cursor/mcp.json in project root",
                  config: {
                    mcpServers: {
                      cantrip: {
                        command: "npx",
                        args: ["-y", "mcp-server-cantrip"],
                        env: { CANTRIP_API_KEY: "your-key-here" },
                      },
                    },
                  },
                },
              },
            },
          };
        }

        try {
          const whoami = await client.post("whoami", [], {});
          return {
            status: "ok",
            daemon: "reachable",
            api_key_configured: apiKeyConfigured,
            current_project: project ?? "none",
            identity: whoami,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const daemonUnreachable = message.startsWith("Cannot reach cantrip daemon");
          return {
            status: "error",
            daemon: daemonUnreachable ? "unreachable" : "reachable",
            api_key_configured: apiKeyConfigured,
            current_project: project ?? "none",
            message,
          };
        }
      },
    },

    // ── Init ──
    {
      name: "cantrip_init",
      description:
        "Create a new project and connect this workspace to it. " +
        "Pass 'brief_text' (product brief as text) to auto-extract ICPs, pain points, and value props as inferred entities (costs 5 credits). " +
        "Or pass 'brief_path' (absolute file path) and the file will be read locally. " +
        "Without a brief, the project is created empty (free) and you add entities manually. " +
        "Writes .cantrip.json automatically after creation. " +
        "After creating a project, add a few entities and confirm them with the user before going deeper.",
      shape: {
        name: z.string().describe("Project name"),
        description: z.string().describe("One-line project description"),
        brief_text: z
          .string()
          .optional()
          .describe("Product brief content as text (preferred)"),
        brief_path: z
          .string()
          .optional()
          .describe("Absolute path to a product brief file — will be read locally and sent as text"),
      },
      handler: async (p) => {
        const slug = String(p.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        let briefText = p.brief_text;
        if (!briefText && p.brief_path) {
          const { readFileSync } = await import("fs");
          briefText = readFileSync(String(p.brief_path), "utf-8");
        }
        const flags = buildFlags({
          name: p.name,
          description: p.description,
          brief_text: briefText,
          project: slug,
        });
        const result = await client.post("init", [], flags);
        writeProjectContext(slug);
        return result;
      },
    },

    // ── Project Management ──
    {
      name: "cantrip_project",
      description:
        "Manage projects. Actions:\n" +
        "- list (default): List all projects in the current team.\n" +
        "- update: Update a project's name or description. Uses the connected project unless 'slug' is provided.\n" +
        "- delete: Delete a project and all its data. Uses the connected project unless 'slug' is provided.",
      shape: {
        action: z
          .enum(["list", "update", "delete"])
          .optional()
          .describe("Action to perform (default: list)"),
        slug: z
          .string()
          .optional()
          .describe("Project slug to target. Defaults to the connected project from .cantrip.json."),
        name: z.string().optional().describe("New display name (update only)"),
        description: z.string().optional().describe("New description (update only)"),
      },
      handler: async (p) => {
        const action = (p.action as string) ?? "list";
        const args: string[] = [];
        if (p.slug) args.push(String(p.slug));
        const flags = buildFlags({ name: p.name, description: p.description });
        return client.post(`project ${action}`, args, flags);
      },
    },

    // ── Snapshot ──
    {
      name: "cantrip_snapshot",
      description:
        "Browse project data at three zoom levels. " +
        "No args: project overview with entity counts by type and review state, gaps, and review queue size. " +
        "entity_type only: list all entities of that type (e.g. 'icps', 'pain-points', 'channels'). " +
        "entity_type + entity_id: show full detail for one entity. " +
        "This is the primary tool for listing and inspecting entities." +
        PROJECT_DESC_SUFFIX,
      shape: {
        entity_type: z
          .string()
          .optional()
          .describe("Entity type to drill into (e.g. 'icps', 'pain-points', 'value-props')"),
        entity_id: z.string().optional().describe("Specific entity ID for detail view"),
        project: projectSchema,
      },
      handler: async (p) => {
        let cmd = "snapshot";
        const args: string[] = [];
        if (p.entity_type) cmd += ` ${p.entity_type}`;
        if (p.entity_id) args.push(String(p.entity_id));
        const project = resolveProject(p.project as string | undefined);
        return client.post(cmd, args, { project });
      },
    },

    // ── Review ──
    {
      name: "cantrip_review",
      description:
        "List all items pending review (inferred entities and open escalations)." +
        PROJECT_DESC_SUFFIX,
      shape: {
        project: projectSchema,
      },
      handler: async (p) => {
        const project = resolveProject(p.project as string | undefined);
        return client.post("review", [], { project });
      },
    },
    {
      name: "cantrip_review_accept",
      description:
        "Accept an inferred entity, marking it as verified ground truth." +
        PROJECT_DESC_SUFFIX,
      shape: {
        id: z.string().describe("Entity ID to accept"),
        project: projectSchema,
      },
      handler: async (p) => {
        const project = resolveProject(p.project as string | undefined);
        return client.post("review accept", [String(p.id)], { project });
      },
    },
    {
      name: "cantrip_review_reject",
      description:
        "Reject an inferred entity (soft-delete, kept for history)." +
        PROJECT_DESC_SUFFIX,
      shape: {
        id: z.string().describe("Entity ID to reject"),
        project: projectSchema,
      },
      handler: async (p) => {
        const project = resolveProject(p.project as string | undefined);
        return client.post("review reject", [String(p.id)], { project });
      },
    },
    {
      name: "cantrip_review_accept_all",
      description:
        "Accept all inferred entities at once, marking them as verified ground truth." +
        PROJECT_DESC_SUFFIX,
      shape: {
        project: projectSchema,
      },
      handler: async (p) => {
        const project = resolveProject(p.project as string | undefined);
        return client.post("review accept-all", [], { project });
      },
    },
    {
      name: "cantrip_review_reject_all",
      description:
        "Reject all inferred entities at once (soft-delete, kept for history)." +
        PROJECT_DESC_SUFFIX,
      shape: {
        project: projectSchema,
      },
      handler: async (p) => {
        const project = resolveProject(p.project as string | undefined);
        return client.post("review reject-all", [], { project });
      },
    },
    {
      name: "cantrip_review_resolve",
      description:
        "Resolve an open escalation with a resolution message." +
        PROJECT_DESC_SUFFIX,
      shape: {
        id: z.string().describe("Escalation ID"),
        resolution: z.string().describe("Resolution text explaining the decision"),
        project: projectSchema,
      },
      handler: async (p) => {
        const project = resolveProject(p.project as string | undefined);
        return client.post("review resolve", [String(p.id)], { ...buildFlags({ resolution: p.resolution }), project });
      },
    },
    {
      name: "cantrip_review_dismiss",
      description:
        "Dismiss an inferred entity or open escalation. " +
        "For entities: removes from review queue without accepting or rejecting (kept for history). " +
        "For escalations: closes without resolving." +
        PROJECT_DESC_SUFFIX,
      shape: {
        id: z.string().describe("Entity or escalation ID to dismiss"),
        project: projectSchema,
      },
      handler: async (p) => {
        const project = resolveProject(p.project as string | undefined);
        return client.post("review dismiss", [String(p.id)], { project });
      },
    },

    // ── Next ──
    {
      name: "cantrip_next",
      description:
        "List gap-analysis opportunities — things that would move the project closer to ideal state. " +
        "Each opportunity has a stable UUID that you can pass to cantrip_next_prompt or cantrip_next_run. " +
        "Opportunities persist across calls; re-running gap analysis updates existing opportunities rather than replacing them. " +
        "Review the project snapshot with the user before running opportunities." +
        PROJECT_DESC_SUFFIX,
      shape: {
        project: projectSchema,
      },
      handler: async (p) => {
        const project = resolveProject(p.project as string | undefined);
        return client.post("next", [], { project });
      },
    },
    {
      name: "cantrip_next_prompt",
      description:
        "Generate a context-rich LLM prompt for an opportunity. " +
        "Returns a ready-to-use prompt with all relevant ontology context baked in. Zero credit cost." +
        PROJECT_DESC_SUFFIX,
      shape: {
        id: z.string().describe("Opportunity ID from cantrip_next"),
        project: projectSchema,
      },
      handler: async (p) => {
        const project = resolveProject(p.project as string | undefined);
        return client.post("next prompt", [String(p.id)], { project });
      },
    },
    {
      name: "cantrip_next_run",
      description:
        "Execute an enrichment opportunity with AI. Runs the LLM-powered enrichment inline — " +
        "either updating existing entities' missing fields (targeted) or generating new entities (bulk). " +
        "Returns when complete with a summary of what was created or updated. " +
        "Parallelism: you may run different loop types concurrently (e.g. enrich ICPs + enrich competitors), " +
        "but the daemon blocks concurrent runs of the same loop type for safety." +
        PROJECT_DESC_SUFFIX,
      shape: {
        id: z.string().describe("Opportunity ID from cantrip_next"),
        project: projectSchema,
      },
      handler: async (p) => {
        const project = resolveProject(p.project as string | undefined);
        return client.post("next run", [String(p.id)], { project });
      },
    },

    // ── History ──
    {
      name: "cantrip_history",
      description:
        "Query the append-only audit trail of all actions taken on the project." +
        PROJECT_DESC_SUFFIX,
      shape: {
        type: z
          .string()
          .optional()
          .describe("Filter by event type (e.g. init, entity_created, review_accept)"),
        entity: z.string().optional().describe("Filter by entity type (e.g. icp, pain_point)"),
        since: z.string().optional().describe("Only events after this ISO date"),
        limit: z.number().optional().describe("Max events to return (default: 50)"),
        project: projectSchema,
      },
      handler: async (p) => {
        const project = resolveProject(p.project as string | undefined);
        return client.post("history", [], { ...buildFlags({ type: p.type, entity: p.entity, since: p.since, limit: p.limit }), project });
      },
    },

    // ── Meter ──
    {
      name: "cantrip_meter_balance",
      description:
        "Check remaining credits. Returns available credits, reserved credits (held by in-progress operations), and total balance." +
        PROJECT_DESC_SUFFIX,
      shape: {
        project: projectSchema,
      },
      handler: async (p) => {
        const project = resolveProject(p.project as string | undefined);
        return client.post("meter", ["balance"], { project });
      },
    },
    {
      name: "cantrip_meter_history",
      description:
        "View recent credit transactions. Shows usage debits, purchases, and running balance." +
        PROJECT_DESC_SUFFIX,
      shape: {
        limit: z.number().optional().describe("Maximum entries to return (default: 20)"),
        project: projectSchema,
      },
      handler: async (p) => {
        const project = resolveProject(p.project as string | undefined);
        return client.post("meter", ["history"], { ...buildFlags({ limit: p.limit }), project });
      },
    },
    {
      name: "cantrip_meter_tiers",
      description:
        "View available credit packs. Shows tier name, credits included, and price.",
      shape: {},
      handler: async () => client.post("meter", ["tiers"], {}),
    },

    // ── Entity CRUD ──
    {
      name: "cantrip_entity_add",
      description:
        "Create a new entity. Automatically marked as 'accepted'. " +
        "Fields vary by type:\n" +
        "- icp: name, description, demographics, jobs_to_be_done, willingness_to_pay, current_alternatives, priority, is_beachhead\n" +
        "- pain_point: description, severity (low|medium|high|critical), frequency (rare|occasional|frequent|constant), evidence\n" +
        "- value_prop: framing (required — use instead of 'name'; 'description' is stored in extensions), tagline, evidence\n" +
        "- channel: name, channel_type, lifecycle_stage (exploring|testing|scaling|maintaining|killed), cac, estimated_reach, conversion_rate (note: 'description' maps to 'notes' column)\n" +
        "- experiment: title (required — use instead of 'name'), hypothesis, description, status (proposed|designed|active|completed|analyzed|abandoned), success_metrics, outcome_notes, value_prop_id, channel_id\n" +
        "- competitor: name, description, url, positioning, strengths, weaknesses, pricing_model\n" +
        "- contact: name, email, phone, company, role, source, url, notes\n" +
        "Extra fields (any field not in the schema above) are stored in extensions. " +
        "After adding entities, pause and confirm with the user before adding more." +
        PROJECT_DESC_SUFFIX,
      shape: {
        entity_type: entityTypeSchema,
        name: z.string().optional().describe("Entity name (mapped to 'framing' for value_prop, 'title' for experiment)"),
        description: z.string().optional().describe("Entity description"),
        fields: z
          .record(z.string())
          .optional()
          .describe("Additional fields as key-value pairs (e.g. {severity: 'high', frequency: 'constant'})"),
        project: projectSchema,
      },
      handler: async (p) => {
        const flags: Record<string, string> = {};
        if (p.name) flags.name = String(p.name);
        if (p.description) flags.description = String(p.description);
        if (p.fields && typeof p.fields === "object") {
          for (const [k, v] of Object.entries(p.fields as Record<string, string>)) {
            flags[k] = v;
          }
        }
        flags.project = resolveProject(p.project as string | undefined);
        return client.post(String(p.entity_type), ["add"], flags);
      },
    },
    {
      name: "cantrip_entity_edit",
      description:
        "Edit an existing entity. Fields vary by type (same as cantrip_entity_add). " +
        "Pass well-known fields directly, and any additional fields in the 'fields' object. " +
        "Extra fields are stored in extensions." +
        PROJECT_DESC_SUFFIX,
      shape: {
        entity_type: entityTypeSchema,
        id: z.string().describe("Entity ID to edit"),
        name: z.string().optional().describe("Updated name (mapped to 'framing' for value_prop, 'title' for experiment)"),
        description: z.string().optional().describe("Updated description"),
        fields: z
          .record(z.string())
          .optional()
          .describe("Additional fields to update as key-value pairs"),
        project: projectSchema,
      },
      handler: async (p) => {
        const flags: Record<string, string> = {};
        if (p.name) flags.name = String(p.name);
        if (p.description) flags.description = String(p.description);
        if (p.fields && typeof p.fields === "object") {
          for (const [k, v] of Object.entries(p.fields as Record<string, string>)) {
            flags[k] = v;
          }
        }
        flags.project = resolveProject(p.project as string | undefined);
        return client.post(String(p.entity_type), ["edit", String(p.id)], flags);
      },
    },
    {
      name: "cantrip_entity_delete",
      description:
        "Delete an existing entity by type and ID." +
        PROJECT_DESC_SUFFIX,
      shape: {
        entity_type: entityTypeSchema,
        id: z.string().describe("Entity ID to delete"),
        project: projectSchema,
      },
      handler: async (p) => {
        const project = resolveProject(p.project as string | undefined);
        return client.post(String(p.entity_type), ["delete", String(p.id)], { project });
      },
    },
  ];
}
