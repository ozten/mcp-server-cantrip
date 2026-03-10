# mcp-server-cantrip

MCP (Model Context Protocol) server for [Cantrip](https://cantrip.ai) — the AI-powered GTM engine for solo founders.

This server lets any MCP-compatible agent (Claude, Cursor, etc.) interact with Cantrip's project management, gap analysis, and entity CRUD through the standard MCP tool protocol.

## Architecture

```
Agent (Claude, etc.) ── MCP protocol (stdio) ──> mcp-server-cantrip ── HTTP POST ──> cantrip daemon
```

The MCP server is a thin translation layer. It converts MCP tool calls into `{command, args, flags}` JSON envelopes and POSTs them to the cantrip daemon. Zero business logic — identical contract to the CLI and React UI.

## Installation

```bash
npm install -g mcp-server-cantrip
```

Or run directly (used by the configs below):

```bash
npx -y mcp-server-cantrip
```

## Configuration

### Claude Code (recommended: CLI one-liner)

```bash
claude mcp add cantrip -- npx -y mcp-server-cantrip
```

This registers the server in `~/.claude.json` with local scope. Verify with:

```bash
claude mcp list
```

Or check status inside Claude Code with the `/mcp` command.

#### Claude Code (manual JSON)

If you prefer editing config directly, add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "cantrip": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-server-cantrip"]
    }
  }
}
```

> **Important:** The `-y` flag is required. Without it, `npx` prompts for install confirmation which hangs because stdio is consumed by the MCP protocol.

#### Claude Code (project-scoped, shared with team)

Add a `.mcp.json` file to your project root:

```json
{
  "mcpServers": {
    "cantrip": {
      "command": "npx",
      "args": ["-y", "mcp-server-cantrip"]
    }
  }
}
```

### Claude Desktop

**macOS:** Edit `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** Edit `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cantrip": {
      "command": "npx",
      "args": ["-y", "mcp-server-cantrip"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project or `~/.cursor/mcp.json` globally:

```json
{
  "mcpServers": {
    "cantrip": {
      "command": "npx",
      "args": ["-y", "mcp-server-cantrip"]
    }
  }
}
```

### Windows Note

On native Windows (not WSL), wrap the command with `cmd /c`:

```json
{
  "mcpServers": {
    "cantrip": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "mcp-server-cantrip"]
    }
  }
}
```

### Project Context (`.cantrip.json`)

Each project directory contains a `.cantrip.json` file that tells Cantrip which project to target:

```json
{
  "project": "my-saas"
}
```

This file is created automatically by `cantrip_init` (new project) or `cantrip_connect` (existing project). The agent manages it — you don't need to create it manually.

**Multiple projects on the same machine?** Each project directory gets its own `.cantrip.json`. The agent switches context by working in the right directory.

## Troubleshooting

**Server not found / no tools appear:**
- Run `claude mcp list` (Claude Code) or `/mcp` inside a session to check connection status.
- Make sure the config is in the right file — Claude Code uses `~/.claude.json` or `.mcp.json`, **not** `~/.claude/mcp.json`.

**Server hangs on startup:**
- Ensure you have `-y` in the npx args. Without it, npx waits for interactive confirmation that can never arrive over stdio.

**"Cannot reach Cantrip API" errors:**
- Check that `https://api.cantrip.ai` is reachable from your network.

**Windows "Connection closed" errors:**
- Use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "mcp-server-cantrip"]`.

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
