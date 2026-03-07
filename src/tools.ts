import { z } from "zod";
import { postCantrip, readProjectContext, writeProjectContext } from "./client.js";

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

export const tools: ToolDef[] = [
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
      "Check daemon health, API key, and current project. " +
      "Returns daemon reachability, whether an API key is configured, and the active project from .cantrip.json.",
    shape: {},
    handler: async () => {
      const project = readProjectContext();
      const apiKeyConfigured = !!process.env.CANTRIP_API_KEY;
      try {
        const result = await postCantrip("snapshot", [], {});
        return {
          status: "ok",
          daemon: "reachable",
          api_key_configured: apiKeyConfigured,
          current_project: project ?? "none",
          snapshot: result,
        };
      } catch (err) {
        return {
          status: "error",
          daemon: "unreachable",
          api_key_configured: apiKeyConfigured,
          current_project: project ?? "none",
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },

  // ── Init ──
  {
    name: "cantrip_init",
    description:
      "Create a new project and connect this workspace to it. " +
      "Optionally ingests a product brief to extract ICPs, pain points, and value props as inferred entities. " +
      "Writes .cantrip.json automatically after creation. " +
      "After creating a project, add a few entities and confirm them with the user before going deeper.",
    shape: {
      name: z.string().describe("Project name"),
      description: z.string().describe("One-line project description"),
      brief: z
        .string()
        .optional()
        .describe("Absolute path to a product brief file (text or markdown)"),
    },
    handler: async (p) => {
      const slug = String(p.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const flags = buildFlags({
        name: p.name,
        description: p.description,
        brief: p.brief,
        project: slug,
      });
      const result = await postCantrip("init", [], flags);
      writeProjectContext(slug);
      return result;
    },
  },

  // ── Project List ──
  {
    name: "cantrip_project_list",
    description:
      "List all projects in the current team. Returns an array of projects with id, slug, display_name, description, created_at, and updated_at.",
    shape: {},
    handler: async () => {
      return postCantrip("project list", [], {});
    },
  },

  // ── Snapshot ──
  {
    name: "cantrip_snapshot",
    description:
      "Get project state at three levels of detail. " +
      "No args: project overview with counts per entity type by review state, gaps, review queue size. " +
      "entity_type only: list all entities of that type. " +
      "entity_type + entity_id: full detail for one entity. " +
      "This is the single tool for browsing project data — use it instead of listing or showing entities separately.",
    shape: {
      entity_type: z
        .string()
        .optional()
        .describe("Entity type to drill into (e.g. 'icps', 'pain-points', 'value-props')"),
      entity_id: z.string().optional().describe("Specific entity ID for detail view"),
    },
    handler: async (p) => {
      let cmd = "snapshot";
      const args: string[] = [];
      if (p.entity_type) cmd += ` ${p.entity_type}`;
      if (p.entity_id) args.push(String(p.entity_id));
      return postCantrip(cmd, args, {});
    },
  },

  // ── Review ──
  {
    name: "cantrip_review",
    description: "List all items pending review (inferred entities and open escalations)",
    shape: {},
    handler: async () => postCantrip("review", [], {}),
  },
  {
    name: "cantrip_review_accept",
    description: "Accept an inferred entity, marking it as verified ground truth",
    shape: {
      id: z.string().describe("Entity ID to accept"),
    },
    handler: async (p) => postCantrip("review accept", [String(p.id)], {}),
  },
  {
    name: "cantrip_review_reject",
    description: "Reject an inferred entity (soft-delete, kept for history)",
    shape: {
      id: z.string().describe("Entity ID to reject"),
    },
    handler: async (p) => postCantrip("review reject", [String(p.id)], {}),
  },
  {
    name: "cantrip_review_resolve",
    description: "Resolve an open escalation with a resolution message",
    shape: {
      id: z.string().describe("Escalation ID"),
      resolution: z.string().describe("Resolution text explaining the decision"),
    },
    handler: async (p) =>
      postCantrip("review resolve", [String(p.id)], buildFlags({ resolution: p.resolution })),
  },
  {
    name: "cantrip_review_dismiss",
    description: "Dismiss an escalation without resolving it",
    shape: {
      id: z.string().describe("Escalation ID"),
    },
    handler: async (p) => postCantrip("review dismiss", [String(p.id)], {}),
  },

  // ── Next ──
  {
    name: "cantrip_next",
    description:
      "List gap-analysis opportunities — things that would move the project closer to ideal state. " +
      "Each opportunity has an ID you can pass to cantrip_next_prompt or cantrip_next_run. " +
      "Review the project snapshot with the user before running opportunities.",
    shape: {},
    handler: async () => postCantrip("next", [], {}),
  },
  {
    name: "cantrip_next_prompt",
    description:
      "Generate a context-rich LLM prompt for an opportunity. " +
      "Returns a ready-to-use prompt with all relevant ontology context baked in. Zero cost.",
    shape: {
      id: z.string().describe("Opportunity ID from cantrip_next"),
    },
    handler: async (p) => postCantrip("next prompt", [String(p.id)], {}),
  },
  {
    name: "cantrip_next_run",
    description:
      "Not yet available. Use cantrip_next_prompt instead to get a context-rich prompt you can execute yourself.",
    shape: {
      id: z.string().describe("Opportunity ID from cantrip_next"),
    },
    handler: async () => ({
      status: "unavailable",
      message:
        "next_run is not yet available. Use cantrip_next_prompt to get a context-rich prompt you can execute yourself.",
    }),
  },

  // ── History ──
  {
    name: "cantrip_history",
    description: "Query the append-only audit trail of all actions taken on the project",
    shape: {
      type: z
        .string()
        .optional()
        .describe("Filter by event type (e.g. init, entity_created, review_accept)"),
      entity: z.string().optional().describe("Filter by entity type (e.g. icp, pain_point)"),
      since: z.string().optional().describe("Only events after this ISO date"),
      limit: z.number().optional().describe("Max events to return (default: 50)"),
    },
    handler: async (p) =>
      postCantrip("history", [], buildFlags({ type: p.type, entity: p.entity, since: p.since, limit: p.limit })),
  },

  // ── Billing ──
  {
    name: "cantrip_billing_balance",
    description:
      "Check your remaining credit balance. Shows available credits, reserved credits (held by in-progress operations), and total balance.",
    shape: {},
    handler: async () => postCantrip("billing", ["balance"], {}),
  },
  {
    name: "cantrip_billing_history",
    description:
      "View recent credit transactions. Shows purchases, usage debits, and running balance. Use limit to control how many entries to return.",
    shape: {
      limit: z.number().optional().describe("Maximum entries to return (default: 20)"),
    },
    handler: async (p) => postCantrip("billing", ["history"], buildFlags({ limit: p.limit })),
  },
  {
    name: "cantrip_billing_tiers",
    description:
      "View available credit packs and pricing tiers. Shows tier name, price, and credit amount for each pack.",
    shape: {},
    handler: async () => postCantrip("billing", ["tiers"], {}),
  },

  // ── Entity CRUD ──
  {
    name: "cantrip_entity_add",
    description:
      "Create a new entity. Automatically marked as 'accepted'. " +
      "Fields vary by type:\n" +
      "- icp: name, description, demographics, jobs_to_be_done, willingness_to_pay\n" +
      "- pain_point: description, severity, frequency, evidence\n" +
      "- value_prop: framing (use instead of name), tagline, evidence\n" +
      "- channel: name, channel_type, lifecycle_stage, cac\n" +
      "- experiment: title (use instead of name), hypothesis, description\n" +
      "- competitor: name, description, url, positioning, strengths, weaknesses\n" +
      "- contact: name, email, company, role\n" +
      "Extra fields are stored in extensions. " +
      "After adding entities, pause and confirm with the user before adding more.",
    shape: {
      entity_type: entityTypeSchema,
      name: z.string().optional().describe("Entity name (mapped to 'framing' for value_prop, 'title' for experiment)"),
      description: z.string().optional().describe("Entity description"),
      fields: z
        .record(z.string())
        .optional()
        .describe("Additional fields as key-value pairs (e.g. {severity: 'high', frequency: 'constant'})"),
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
      return postCantrip(String(p.entity_type), ["add"], flags);
    },
  },
  {
    name: "cantrip_entity_edit",
    description:
      "Edit an existing entity. Fields vary by type (same as cantrip_entity_add). " +
      "Pass well-known fields directly, and any additional fields in the 'fields' object. " +
      "Extra fields are stored in extensions.",
    shape: {
      entity_type: entityTypeSchema,
      id: z.string().describe("Entity ID to edit"),
      name: z.string().optional().describe("Updated name (mapped to 'framing' for value_prop, 'title' for experiment)"),
      description: z.string().optional().describe("Updated description"),
      fields: z
        .record(z.string())
        .optional()
        .describe("Additional fields to update as key-value pairs"),
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
      return postCantrip(String(p.entity_type), ["edit", String(p.id)], flags);
    },
  },
];
