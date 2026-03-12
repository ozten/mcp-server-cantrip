# mcp-server-cantrip

Cantrip helps technical founders find their first customers with structured GTM workflows.

- **Nail your ICP** — define ideal customer profiles, buyer pains, and value props
- **Research competitors** — map the landscape and find where you can win
- **Get next actions** — gap analysis tells you exactly what to work on, then does it for you

Works with **Claude Code** / **Claude Desktop** / **Cursor** — any MCP-compatible agent.

### Quick start

1. Get your API key at [cantrip.ai](https://cantrip.ai) ([settings](https://dashboard.cantrip.ai/settings/api-keys))
2. Add the server:

```bash
claude mcp add cantrip -e CANTRIP_API_KEY=your-api-key -- npx -y mcp-server-cantrip
```

3. Try this prompt:

> "Initialize a Cantrip project for my product: [describe yours in one sentence]"

## Configuration

The Quick start command above covers Claude Code. Verify it worked with `claude mcp list` or the `/mcp` command inside a session.

### Claude Desktop / Cursor / manual JSON

All MCP clients use the same JSON block. Add it to the appropriate config file:

| Client | Config file |
|--------|-------------|
| Claude Code (manual) | `~/.claude.json` |
| Claude Code (project-scoped) | `.mcp.json` in project root |
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor | `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) |

```json
{
  "mcpServers": {
    "cantrip": {
      "command": "npx",
      "args": ["-y", "mcp-server-cantrip"],
      "env": {
        "CANTRIP_API_KEY": "your-api-key"
      }
    }
  }
}
```

> **Note:** The `-y` flag is required — without it, `npx` prompts for confirmation which hangs over stdio.

> **Windows (not WSL):** Use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "mcp-server-cantrip"]`.

> **Project-scoped with teams:** Use `"${CANTRIP_API_KEY}"` in the env value so each developer sets the key in their shell profile.

### Project Context (`.cantrip.json`)

Each project directory contains a `.cantrip.json` file that tells Cantrip which project to target:

```json
{
  "project": "my-saas"
}
```

This file is created automatically by `cantrip_init` (new project) or `cantrip_connect` (existing project). The agent manages it — you don't need to create it manually.

**Multiple projects on the same machine?** Each project directory gets its own `.cantrip.json`. The agent switches context by working in the right directory.

## Examples of How to use Cantrip

After connecting Cantrip, try these prompts in order:

1. "Initialize a Cantrip project for my product: **[one sentence about what you're building]**"
2. "Find my likely ICP and top 3 buyer pains."
3. "Research 5 competitors and tell me where I can win."
4. "Give me a one-week GTM plan."

## Troubleshooting

**Server not found / no tools appear:**
- Run `claude mcp list` (Claude Code) or `/mcp` inside a session to check connection status.
- Make sure the config is in the right file — Claude Code uses `~/.claude.json` or `.mcp.json`, **not** `~/.claude/mcp.json`.

**Server hangs on startup:**
- Ensure you have `-y` in the npx args. Without it, npx waits for interactive confirmation that can never arrive over stdio.

**"Cannot reach Cantrip API" errors:**
- Verify `CANTRIP_API_KEY` is set in the `env` block of your MCP config.
- Check that `https://api.cantrip.ai` is reachable from your network.

**Windows "Connection closed" errors:**
- Use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "mcp-server-cantrip"]`.

## Architecture

```
Agent (Claude, etc.) ── MCP protocol (stdio) ──> mcp-server-cantrip ── HTTPS POST ──> https://api.cantrip.ai
```

The MCP server is a thin translation layer. It converts MCP tool calls into `{command, args, flags}` JSON envelopes and POSTs them to the Cantrip API. Zero business logic — identical contract to the CLI and React UI.

## Tools (17)

### Setup

| Tool | Description |
|------|-------------|
| `cantrip_connect` | Connect workspace to a project (reads/writes `.cantrip.json`) |
| `cantrip_status` | Check if the daemon is running |
| `cantrip_init` | Create a new project and auto-connect |

### Core Commands

| Tool | Description |
|------|-------------|
| `cantrip_snapshot` | Project overview, drill into entity types |
| `cantrip_next` | List gap-analysis opportunities |
| `cantrip_next_prompt` | Generate a context-rich LLM prompt for an opportunity |
| `cantrip_next_run` | Spawn a background agent for an opportunity |
| `cantrip_history` | Query the audit trail |

### Review

| Tool | Description |
|------|-------------|
| `cantrip_review` | List items pending review |
| `cantrip_review_accept` | Accept an inferred entity |
| `cantrip_review_reject` | Reject an inferred entity |
| `cantrip_review_resolve` | Resolve an escalation |
| `cantrip_review_dismiss` | Dismiss an escalation |

### Entity CRUD (generic)

| Tool | Description |
|------|-------------|
| `cantrip_entity_list` | List entities of a type |
| `cantrip_entity_show` | Show entity detail |
| `cantrip_entity_add` | Create a new entity |
| `cantrip_entity_edit` | Edit an existing entity |

Supported entity types: `icp`, `pain_point`, `value_prop`, `experiment`, `channel`, `competitor`, `contact`

## License

MIT
