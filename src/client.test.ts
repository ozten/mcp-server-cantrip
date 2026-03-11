import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveProject, readProjectContext } from "./client.js";
import { createTools } from "./tools.js";
import { CantripClient } from "./client.js";

const CONFIG_PATH = join(process.cwd(), ".cantrip.json");

function removeConfig() {
  if (existsSync(CONFIG_PATH)) unlinkSync(CONFIG_PATH);
}

function writeConfig(project: string) {
  writeFileSync(CONFIG_PATH, JSON.stringify({ project }), "utf-8");
}

describe("resolveProject", () => {
  beforeEach(removeConfig);
  afterEach(removeConfig);

  it("returns inline slug when provided, even without .cantrip.json", () => {
    assert.equal(resolveProject("bark-brew"), "bark-brew");
  });

  it("falls back to .cantrip.json when no inline slug", () => {
    writeConfig("repairtrack");
    assert.equal(resolveProject(undefined), "repairtrack");
  });

  it("inline slug overrides .cantrip.json", () => {
    writeConfig("repairtrack");
    assert.equal(resolveProject("bark-brew"), "bark-brew");
  });

  it("throws clear error when neither source provides a project", () => {
    assert.throws(
      () => resolveProject(undefined),
      (err: Error) => {
        assert.match(err.message, /No project context/);
        assert.match(err.message, /pass the 'project' slug/);
        return true;
      },
    );
  });
});

describe("tool schemas", () => {
  // Tools that should have the project parameter
  const TOOLS_WITH_PROJECT = new Set([
    "cantrip_snapshot",
    "cantrip_next",
    "cantrip_next_run",
    "cantrip_next_prompt",
    "cantrip_review",
    "cantrip_review_accept",
    "cantrip_review_reject",
    "cantrip_review_resolve",
    "cantrip_review_dismiss",
    "cantrip_history",
    "cantrip_entity_add",
    "cantrip_entity_edit",
    "cantrip_meter_balance",
    "cantrip_meter_history",
  ]);

  // Tools that should NOT have the project parameter
  const TOOLS_WITHOUT_PROJECT = new Set([
    "cantrip_connect",
    "cantrip_status",
    "cantrip_init",
    "cantrip_project",
    "cantrip_meter_tiers",
  ]);

  const client = new CantripClient({ apiKey: "test-key" });
  const tools = createTools(client);

  for (const tool of tools) {
    if (TOOLS_WITH_PROJECT.has(tool.name)) {
      it(`${tool.name} has project parameter`, () => {
        assert.ok("project" in tool.shape, `${tool.name} missing project param`);
      });

      it(`${tool.name} description mentions project override`, () => {
        assert.ok(
          tool.description.includes("Pass `project` to override"),
          `${tool.name} description missing project override hint`,
        );
      });
    }

    if (TOOLS_WITHOUT_PROJECT.has(tool.name)) {
      it(`${tool.name} does NOT have project parameter`, () => {
        assert.ok(!("project" in tool.shape) || tool.name === "cantrip_connect" || tool.name === "cantrip_project",
          `${tool.name} should not have project param added by this change`,
        );
      });
    }
  }
});

describe("tool handlers with project param", () => {
  let lastPost: { command: string; args: string[]; flags: Record<string, string> } | null = null;

  // Create a mock client that captures the post call
  const mockClient = {
    post: async (command: string, args: string[], flags: Record<string, string>) => {
      lastPost = { command, args, flags };
      return { ok: true };
    },
    hasApiKey: true,
  } as unknown as CantripClient;

  const tools = createTools(mockClient);
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  beforeEach(() => {
    lastPost = null;
    removeConfig();
  });
  afterEach(removeConfig);

  it("cantrip_snapshot sends inline project in flags", async () => {
    const tool = toolMap.get("cantrip_snapshot")!;
    await tool.handler({ project: "bark-brew" });
    assert.equal(lastPost!.flags.project, "bark-brew");
  });

  it("cantrip_snapshot uses .cantrip.json fallback", async () => {
    writeConfig("repairtrack");
    const tool = toolMap.get("cantrip_snapshot")!;
    await tool.handler({});
    assert.equal(lastPost!.flags.project, "repairtrack");
  });

  it("cantrip_snapshot throws without project context", async () => {
    const tool = toolMap.get("cantrip_snapshot")!;
    await assert.rejects(
      () => tool.handler({}),
      (err: Error) => {
        assert.match(err.message, /No project context/);
        return true;
      },
    );
  });

  it("stateless multi-project: consecutive calls with different slugs", async () => {
    const tool = toolMap.get("cantrip_snapshot")!;

    await tool.handler({ project: "bark-brew" });
    assert.equal(lastPost!.flags.project, "bark-brew");

    await tool.handler({ project: "repairtrack" });
    assert.equal(lastPost!.flags.project, "repairtrack");
  });

  it("cantrip_entity_add sends inline project in flags", async () => {
    const tool = toolMap.get("cantrip_entity_add")!;
    await tool.handler({ entity_type: "icp", name: "Test", project: "my-proj" });
    assert.equal(lastPost!.flags.project, "my-proj");
    assert.equal(lastPost!.flags.name, "Test");
  });

  it("cantrip_history merges project with other flags", async () => {
    const tool = toolMap.get("cantrip_history")!;
    await tool.handler({ type: "init", limit: 10, project: "my-proj" });
    assert.equal(lastPost!.flags.project, "my-proj");
    assert.equal(lastPost!.flags.type, "init");
    assert.equal(lastPost!.flags.limit, "10");
  });
});
