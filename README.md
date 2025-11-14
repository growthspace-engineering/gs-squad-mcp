<p align="center">
  <a href="https://github.com/growthspace-engineering" target="blank"><img src="GS-logo.svg" width="250" alt="GrowthSpace Logo" /></a>
  <h2 align="center">
    @growthspace-engineering/gs-squad-mcp
  </h2>
</p>

<p align="center">
  <a href="https://github.com/growthspace-engineering/gs-squad-mcp/releases">
    <img src="https://img.shields.io/github/v/release/growthspace-engineering/gs-squad-mcp?display_name=tag&label=latest&logo=npm&color=CB3837&style=for-the-badge">
  </a>
</p>

<p align="center">
  <a href="https://github.com/growthspace-engineering/gs-squad-mcp/tags">
    <img src="https://img.shields.io/github/v/tag/growthspace-engineering/gs-squad-mcp?filter=*-beta*&label=beta&logo=npm&color=CB3837&style=flat-square">
  </a>
  <a href="https://github.com/semantic-release/semantic-release"><img src="https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg"></a>
</p>

<p align="center">
  A TypeScript / NestJS MCP that spawns role-specialized CLI agents using stdio
</p>

<hr>

## Overview

Gs Squad MCP allows any IDE or agentic orchestrator to spawn multiple **role-specialized CLI agents** that work together. Each spawned process:

- Runs any CLI agent that supports stdio (Cursor Agent, Claude Code CLI, OpenAI Codex CLI, etc.)
- Works in a specific part of the workspace (backend, client, monorepo subfolder, or entire workspace)
- Has a predefined role brain injected automatically (frontend-dev, backend-dev, QA, architect, etc.)
- Executes a task provided by the orchestrator
- Returns stdout/stderr to the orchestrator
- Optionally works with a persistent chat/session (stateful mode)

The Gs Squad MCP itself **does not orchestrate** the multi-agent logic—it only:
- Lists available roles
- Spawns role-specialized agents using templates
- Returns their outputs
- Handles statefulness

The orchestrator (LLM agent) is responsible for building the workflow.

## Installation

### From GitHub Packages

```bash
npm install @growthspace-engineering/gs-squad-mcp
```

**Note**: This package is published to GitHub Packages, not npmjs.org. You'll need to configure npm to authenticate with GitHub Packages.

### From Source

```bash
git clone https://github.com/growthspace-engineering/gs-squad-mcp.git
cd gs-squad-mcp
npm install
npm run build
```

## Quick Start

### Configuration

Configure the MCP via environment variables:

```bash
# State mode: 'stateless' or 'stateful'
STATE_MODE=stateless

# CLI engine command (e.g., 'cursor-agent', 'claude-code-cli')
ENGINE_COMMAND=cursor-agent

# Template paths
RUN_TEMPLATE_PATH=templates/run-agent.template
CREATE_CHAT_TEMPLATE_PATH=templates/create-chat.template  # Required for stateful mode

# Agents directory
AGENTS_DIRECTORY_PATH=agents

# Process timeout (milliseconds)
PROCESS_TIMEOUT_MS=300000
```

### Running as MCP Server

The MCP server runs in stdio mode:

```bash
gs-squad-mcp
```

Or from source:

```bash
npm run build
node dist/cli/main-stdio.js
```

### MCP Tools

The server exposes two tools:

#### `list_roles`

Returns all available role definitions.

**Response:**
```json
{
  "roles": [
    {
      "id": "frontend-developer",
      "name": "frontend-developer",
      "description": "Frontend development specialist..."
    }
  ]
}
```

#### `start_squad_members`

Spawns one or more role-specialized agents.

**Stateless Mode Payload:**
```json
{
  "members": [
    {
      "roleId": "frontend-developer",
      "task": "Implement a login form component",
      "cwd": "client"
    }
  ]
}
```

**Stateful Mode Payload:**
```json
{
  "members": [
    {
      "roleId": "frontend-developer",
      "task": "Implement a login form component",
      "cwd": "client",
      "chatId": "chat-123"  // Optional: omit to create new chat
    }
  ]
}
```

**Response:**
```json
{
  "squadId": "squad-1234567890-abc",
  "members": [
    {
      "memberId": "squad-1234567890-abc-m0",
      "roleId": "frontend-developer",
      "cwd": "client",
      "status": "completed",
      "rawStdout": "...",
      "rawStderr": "...",
      "chatId": "chat-123"  // Only in stateful mode
    }
  ]
}
```

## Roles

Roles define how an agent behaves. Each role is a Markdown file in the `agents/` folder with:

- **Filename** = `roleId` (e.g., `frontend-developer.md`)
- **Frontmatter** = metadata (`name`, `description`)
- **Body** = the role prompt injected into spawned agents

### Available Roles

The project includes 33+ specialized roles covering:

- **Development**: frontend-developer, backend-architect, mobile-developer, blockchain-developer
- **Architecture**: systems-architect, infrastructure-specialist
- **Quality**: qa-specialist, code-reviewer, unit-test-expert, security-auditor
- **Analysis**: data-scientist, ml-engineer, business-analyst, top-down-analyzer, bottom-up-analyzer
- **Specialized**: debug-specialist, performance-optimizer, legacy-maintainer, dependency-scanner
- **Workflow**: git-workflow-manager, project-manager, changelog-recorder
- **Content**: content-writer, technical-documentation-writer, prompt-engineer
- **Domain-Specific**: academic-researcher, bug-triage-specialist, customer-service-specialist, financial-advisor

See the `agents/` directory for the complete list.

## Templates

Templates define how CLI agents are spawned. They use EJS-like syntax (`<% %>`) and receive variables:

- `prompt` - Combined role prompt + task
- `cwd` - Working directory
- `chatId` - Chat session ID (stateful mode)
- `roleId` - Role identifier
- `task` - Task description

### Example Template

```bash
# templates/run-agent.template
<%= ENGINE_COMMAND %> \
  --prompt "<%= prompt %>" \
  --cwd "<%= cwd %>" \
  <% if (chatId) { %>--chat-id "<%= chatId %>"<% } %>
```

## Modes

### Stateless Mode

- No chat history
- Every call injects the full role prompt + task
- Every run is isolated
- Simpler, no session management

### Stateful Mode

- Each member may have a persistent `chatId`
- On first run → MCP creates a chat + injects role prompt + task
- On follow-up runs → MCP injects task only
- Orchestrator decides when to reuse or replace a `chatId`
- Requires `CREATE_CHAT_TEMPLATE_PATH` configuration

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

### Prerequisites

- Node.js 18+
- npm

### Build

```bash
npm install
npm run build
```

### Development Mode

```bash
npm run start:dev
```

### Testing

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e
```

### Linting

```bash
# Check
npm run lint

# Fix
npm run lint:fix
```

## Architecture

```
src/
├── core/           # Framework-agnostic core logic
│   ├── config/     # Configuration service
│   ├── roles/      # Role repository
│   ├── prompt/     # Prompt building
│   ├── engine/     # Template rendering & process execution
│   └── mcp/        # MCP contracts & squad service
├── nest/           # NestJS module wiring
└── cli/            # CLI entry point (stdio MCP server)
```

## License

ISC

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Support

- **Issues**: [GitHub Issues](https://github.com/growthspace-engineering/gs-squad-mcp/issues)
- **Repository**: [GitHub Repository](https://github.com/growthspace-engineering/gs-squad-mcp)

