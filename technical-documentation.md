# **Gs Squad MCP – Technical Documentation (v1)**

*A Multi-Agent Spawner for Role-Specialized CLI Processes*

---

# 1. **System Overview**

The Gs Squad MCP is a stateless, workspace-agnostic MCP server that exposes two tools:

* `list_roles`
* `start_squad_members`

Its purpose is to spawn role-specialized CLI agents (Cursor Agent CLI, Claude Code CLI, Codex CLI, etc.) based on:

* A local `agents/` directory containing Markdown role definitions.
* User-configured MCP templates for running agents.
* Optional stateful chat/session templates.

The orchestrator is responsible for multi-agent logic.
The Gs Squad MCP only handles:

* Role parsing
* Prompt construction
* CLI spawning
* Statefulness (chat creation & reuse)
* Returning stdout/stderr and status

---

# 2. **Architecture**

Below is the complete architecture in **SVG diagram form**, clean and self-contained.

## 2.1 High-Level Architecture Diagram (SVG)

```svg
<svg width="860" height="450" xmlns="http://www.w3.org/2000/svg">
  <style>
    .box { fill:#f7f7f7; stroke:#444; stroke-width:1.5; rx:6; ry:6; }
    .header { font-weight:bold; font-size:14px; }
    .text { font-size:12px; }
    .arrow { marker-end:url(#arrowhead); stroke:#333; stroke-width:1.4; }
  </style>

  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" 
      refX="10" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#333"/>
    </marker>
  </defs>

  <!-- Orchestrator -->
  <rect x="40" y="40" width="210" height="120" class="box"/>
  <text x="60" y="65" class="header">Orchestrator (LLM Agent)</text>
  <text x="60" y="90" class="text">- Picks roles</text>
  <text x="60" y="110" class="text">- Defines tasks</text>
  <text x="60" y="130" class="text">- Chooses cwd</text>
  <text x="60" y="150" class="text">- Uses chatId (stateful)</text>

  <!-- Squad MCP -->
  <rect x="320" y="40" width="260" height="330" class="box"/>
  <text x="340" y="65" class="header">Squad MCP</text>

  <text x="340" y="95"  class="text">- Reads agents/*.md</text>
  <text x="340" y="115" class="text">- Loads frontmatter</text>
  <text x="340" y="135" class="text">- Builds role prompts</text>
  <text x="340" y="155" class="text">- Appends reporting rules</text>
  <text x="340" y="175" class="text">- Resolves cwd</text>
  <text x="340" y="195" class="text">- Renders CLI templates</text>
  <text x="340" y="215" class="text">- Creates chatId (stateful)</text>
  <text x="340" y="235" class="text">- Spawns processes</text>
  <text x="340" y="255" class="text">- Returns raw stdio</text>
  <text x="340" y="275" class="text">- Tracks status (exit/timeout)</text>

  <!-- Agents folder -->
  <rect x="340" y="300" width="220" height="70" class="box"/>
  <text x="360" y="325" class="header">agents/ folder</text>
  <text x="360" y="345" class="text">- frontend-developer.md</text>
  <text x="360" y="365" class="text">- backend-developer.md</text>

  <!-- CLI Agents -->
  <rect x="630" y="60" width="190" height="300" class="box"/>
  <text x="650" y="85" class="header">CLI Agent Processes</text>
  <text x="650" y="110" class="text">cursor-agent</text>
  <text x="650" y="130" class="text">claude-code-cli</text>
  <text x="650" y="150" class="text">openai-codex-cli</text>

  <!-- arrows -->
  <line x1="250" y1="100" x2="320" y2="100" class="arrow"/>
  <line x1="580" y1="180" x2="630" y2="180" class="arrow"/>
  <line x1="630" y1="240" x2="580" y2="240" class="arrow"/>

  <text x="255" y="90"  class="text">list_roles</text>
  <text x="255" y="120" class="text">start_squad_members</text>

  <text x="595" y="170" class="text">spawn</text>
  <text x="595" y="260" class="text">stdout/stderr</text>
</svg>
```

---

# 3. **Directory Structure**

This structure is mandatory for the MCP:

```
gs-squad-mcp/
  ├── agents/
  │     ├── frontend-developer.md
  │     ├── backend-developer.md
  │     ├── qa-engineer.md
  │     └── architect.md
  ├── templates/
  │     ├── run-agent.template
  │     └── create-chat.template   (stateful only)
  ├── config.json / env vars
  ├── mcp.json
  └── server.ts
```

---

# 4. **MCP Tools Specification**

## 4.1 `list_roles`

### Description

Enumerates all roles from the `agents/` folder.
Purely declarative — does not expose engine/state/workspace info.

### Input schema

```json
{}
```

### Output schema

```json
{
  "roles": [
    {
      "id": "string",
      "name": "string",
      "description": "string"
    }
  ]
}
```

### Behavior

* Enumerate all `.md` files in `agents/`.
* Parse YAML frontmatter:

  * `name` = frontmatter.name || roleId
  * `description` = frontmatter.description || ""
* Return all roles in any order.

---

## 4.2 `start_squad_members`

### Description

Spawns one or more agents using configured CLI engine + templates.
Blocks until all return.

### Shared Input (both modes)

```json
{
  "members": [
    {
      "roleId": "string",
      "task": "string",
      "cwd": "string (optional)"
    }
  ],
  "metadata": "object (optional)"
}
```

### Stateless Mode Output

```json
{
  "squadId": "string",
  "members": [
    {
      "memberId": "string",
      "roleId": "string",
      "cwd": "string",
      "status": "completed | error | timeout",
      "rawStdout": "string",
      "rawStderr": "string"
    }
  ]
}
```

### Stateful Mode Output

```json
{
  "squadId": "string",
  "members": [
    {
      "memberId": "string",
      "roleId": "string",
      "cwd": "string",
      "chatId": "string",
      "status": "completed | error | timeout",
      "rawStdout": "string",
      "rawStderr": "string"
    }
  ]
}
```

### Stateful Mode Input Additions

```json
{
  "members": [
    {
      "roleId": "string",
      "task": "string",
      "cwd": "string",
      "chatId": "string (optional)"
    }
  ]
}
```

---

# 5. **Statefulness Rules**

### 5.1 Stateless Mode

* No `chatId` anywhere
* Every run injects **role body + task**

### 5.2 Stateful Mode

* If no `chatId`:

  * MCP creates a new chat
  * Injects **role body + initial task**
* If `chatId` provided:

  * Inject only **task**
  * Continue conversation

---

# 6. **Prompt Construction Pipeline**

### Step-by-step (stateless)

```
load roleBody from agents/<roleId>.md
prompt = roleBody
prompt += "\n\n---\n\n# Task\n" + task
prompt += setupReportingFooter
```

### Step-by-step (stateful, new chat)

```
load roleBody
prompt = roleBody
prompt += "\n\n---\n\n# Initial Task\n" + task
prompt += setupReportingFooter
```

### Step-by-step (stateful, reuse chat)

```
prompt = "# Task\n" + task
prompt += setupReportingFooter      (still appended)
```

---

# 7. **Setup & Reporting Rules Footer**

Injected *every time*:

```
---

# Setup & Reporting Rules

If you notice any setup or environment problems that prevent you from completing your task,
you MUST clearly report them as SETUP / ENVIRONMENT ISSUES.

Explain what you observed and suggest specific steps for the human to fix.
Do not pretend the task succeeded.
```

---

# 8. **Template Rendering**

Templates support EJS/Eta-like syntax:

Variables available:

| Variable | Description                    |
| -------- | ------------------------------ |
| `prompt` | Full constructed prompt        |
| `chatId` | Only in stateful mode          |
| `cwd`    | Full resolved path for process |
| `task`   | User task                      |
| `roleId` | Role identifier                |

Example run template:

```
cursor-agent --approve-mcps --model composer-1 --print \
<% if (chatId) { %> --resume <%= chatId %> <% } %> \
agent "<%= prompt %>"
```

---

# 9. **Execution Flow**

## 9.1 Full Process Lifecycle (SVG)

```svg
<svg width="860" height="520" xmlns="http://www.w3.org/2000/svg">
  <style>
    .box { fill:#eef; stroke:#335; stroke-width:1.3; rx:6; ry:6; }
    .step { font-size:13px; }
    .arrow { stroke:#222; stroke-width:1.4; marker-end:url(#ah); }
    .header { font-weight:bold; font-size:14px; }
  </style>
  <defs>
    <marker id="ah" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#222"/>
    </marker>
  </defs>

  <rect x="40" y="40" width="300" height="430" class="box"/>
  <text x="60" y="70" class="header">Squad MCP Internal Flow</text>

  <text x="60" y="110" class="step">1. Receive start_squad_members input</text>
  <text x="60" y="140" class="step">2. For each member:</text>
  <text x="80" y="165" class="step">• Load agents/&lt;roleId&gt;.md</text>
  <text x="80" y="190" class="step">• Construct full prompt</text>
  <text x="80" y="215" class="step">• Append reporting footer</text>
  <text x="80" y="240" class="step">• Resolve CWD</text>
  <text x="80" y="265" class="step">• If stateful: manage chatId</text>
  <text x="80" y="290" class="step">• Render spawn template</text>
  <text x="80" y="315" class="step">• Spawn CLI agent</text>

  <text x="60" y="350" class="step">3. Wait for all processes to exit</text>
  <text x="60" y="380" class="step">4. Capture stdout/stderr</text>
  <text x="60" y="410" class="step">5. Return results + optional chatIds</text>

  <line x1="350" y1="250" x2="430" y2="250" class="arrow"/>
  <text x="360" y="235" class="step">spawn</text>

  <rect x="430" y="220" width="300" height="120" class="box"/>
  <text x="450" y="250" class="header">CLI Agent Process</text>
  <text x="450" y="275" class="step">- Runs prompt</text>
  <text x="450" y="295" class="step">- Uses workspace rules</text>
  <text x="450" y="315" class="step">- Prints output to stdio</text>
</svg>
```

---

# 10. **Status Rules**

| Condition                 | Status        |
| ------------------------- | ------------- |
| Exit code 0               | `"completed"` |
| Exit code non-zero        | `"error"`     |
| Process killed by timeout | `"timeout"`   |

No semantic interpretation is done.
The orchestrator reads `rawStdout` and makes decisions.

---

# 11. **Workspace Resolution**

Given:

* `workspaceRoot` (from IDE)
* `cwd` (optional)

MCP computes:

```ts
const resolvedCwd = cwd
  ? resolve(workspaceRoot, cwd)
  : workspaceRoot;
```

No assumptions about monorepos, multi-repos, or folder names.

---

# 12. **Error Handling**

The MCP only throws *technical* errors:

* Role file missing
* Template missing
* Engine command not found
* Spawn failure
* Permission issues

Business logic errors (invalid setup, broken environment, missing MCP tools) must be:

* Detected by the agent itself
* Reported via the **prompt rules**
* Interpreted by the orchestrator LLM

---

# 13. **Examples**

## 13.1 Stateless Example

Input:

```json
{
  "members": [
    { "roleId": "frontend-developer", "task": "Build search UI", "cwd": "client" }
  ]
}
```

Output:

```json
{
  "squadId": "s-1",
  "members": [
    {
      "memberId": "m-1",
      "roleId": "frontend-developer",
      "cwd": "client",
      "status": "completed",
      "rawStdout": "...",
      "rawStderr": ""
    }
  ]
}
```

## 13.2 Stateful Example

Input:

```json
{
  "members": [
    {
      "roleId": "backend-developer",
      "task": "Improve performance",
      "cwd": "server",
      "chatId": "chat-xyz"
    }
  ]
}
```

Output:

```json
{
  "squadId": "s-44",
  "members": [
    {
      "memberId": "m-99",
      "roleId": "backend-developer",
      "cwd": "server",
      "chatId": "chat-xyz",
      "status": "completed",
      "rawStdout": "...",
      "rawStderr": ""
    }
  ]
}
```

---

# 14. **Configuration Reference**

## Environment variables

| Var                    | Purpose                                          |             |
| ---------------------- | ------------------------------------------------ | ----------- |
| `STATE_MODE=stateless  | stateful`                                        | Select mode |
| `ENGINE_COMMAND`       | CLI binary (`cursor-agent`, `claude-code`, etc.) |             |
| `RUN_TEMPLATE`         | Template for spawning agents                     |             |
| `CREATE_CHAT_TEMPLATE` | (stateful) template for creating new chats       |             |
| `SQUAD_AGENTS_DIR`     | Path to role MD folder                           |             |
| `PROCESS_TIMEOUT_MS`   | Maximum runtime per process                      |             |

## Template variables

| Var      | Description             |
| -------- | ----------------------- |
| `prompt` | Full constructed prompt |
| `chatId` | Stateful only           |
| `cwd`    | Process cwd             |
| `roleId` | Role name               |
| `task`   | Raw task                |

---
