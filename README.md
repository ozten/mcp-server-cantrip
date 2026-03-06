# mcp-server-cantrip

MCP (Model Context Protocol) server for [Cantrip](https://cantrip.ai) — the AI-powered GTM engine for solo founders.

This server lets any MCP-compatible agent (Claude, Cursor, etc.) interact with Cantrip's project management, gap analysis, and entity CRUD through the standard MCP tool protocol.

## Architecture

```
Agent (Claude, etc.) ── MCP protocol (stdio) ──> mcp-server-cantrip ── HTTP POST ──> cantrip daemon
```

The MCP server is a thin translation layer. It converts MCP tool calls into `{command, args, flags}` JSON envelopes and POSTs them to the cantrip daemon. Zero business logic — identical contract to the CLI and React UI.

## Prerequisites

The cantrip daemon must be running:

```bash
cantrip serve
# Listening on 127.0.0.1:9876
```

## Installation

```bash
npm install -g mcp-server-cantrip
```

Or run directly:

```bash
npx mcp-server-cantrip
```

## Configuration

### Claude Desktop

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cantrip": {
      "command": "npx",
      "args": ["mcp-server-cantrip"],
      "env": {
        "CANTRIP_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Claude Code

Add to `~/.claude/mcp.json` globally:

```json
{
  "mcpServers": {
    "cantrip": {
      "command": "npx",
      "args": ["mcp-server-cantrip"],
      "env": {
        "CANTRIP_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CANTRIP_API_KEY` | *(none)* | Your Cantrip API key |
| `CANTRIP_URL` | `http://127.0.0.1:9876` | Cantrip daemon URL |

### Project Context (`.cantrip.json`)

Each project directory contains a `.cantrip.json` file that tells Cantrip which project to target:

```json
{
  "project": "my-saas"
}
```

This file is created automatically by `cantrip_init` (new project) or `cantrip_connect` (existing project). The agent manages it — you don't need to create it manually.

**Multiple projects on the same machine?** Each project directory gets its own `.cantrip.json`. The agent switches context by working in the right directory.

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

## Development

```bash
git clone https://github.com/pact-sh/mcp-server-cantrip.git
cd mcp-server-cantrip
npm install
npm run build
npm start
```

## License

MIT
