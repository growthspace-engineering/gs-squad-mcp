# **GsSquad MCP – Product Definition Document (v1)**

*A Multi-Agent Orchestration MCP for spawning role-specialized CLI agents*

---

# 1. **Purpose & Vision**

The **Gs Squad MCP** allows any IDE or agentic orchestrator (e.g., Cursor, Claude MCP host, custom orchestrator) to spawn multiple **role-specialized CLI agents** that work together as a “squad.”

Each spawned process:

* Runs **any CLI agent that supports stdio** (Cursor Agent, Claude Code CLI, OpenAI Codex CLI, etc.)
* Works in a **specific part of the user’s workspace** (backend, client, monorepo subfolder, or entire workspace)
* Has a **predefined role brain** injected automatically (frontend-dev, backend-dev, QA, architect, etc.)
* Executes a **task** provided by the orchestrator
* Returns **stdout/stderr** to the orchestrator
* Optionally works with a **persistent chat/session** (stateful mode)

The Gs Squad MCP itself **does not orchestrate the multi-agent logic**.
It only:

* Lists available roles
* Spawns role-specialized agents using templates
* Returns their outputs
* Handles statefulness

The orchestrator (LLM agent) is responsible for building the workflow.

---

# 2. **Core Concepts**

### **2.1 Roles**

Roles define *how* an agent behaves (developer, reviewer, QA tester, architect, etc.).

Each role is defined by a Markdown file inside the Gs Squad MCP’s internal `agents/` folder.

* Filename = `roleId`
* Frontmatter = metadata (`name`, `description`)
* Body = the actual **role prompt** injected into spawned agents

Example:

```
agents/frontend-developer.md
agents/backend-developer.md
agents/qa-engineer.md
...
```

### **2.2 Stateless vs Stateful Modes**

Configured at MCP startup (via env/config).
**This choice affects the tool schema**—the orchestrator sees only one mode.

#### **Stateless mode**

* No chat history
* Every call injects the **full role prompt + task**
* Every run is isolated

#### **Stateful mode**

* Each member may have a persistent `chatId`
* On **first run** → MCP creates a chat + injects role prompt + task
* On **follow-up runs** → MCP injects **task only**
* Orchestrator decides when to reuse or replace a chatId

### **2.3 Workspace Handling**

The workspace structure is **not known to the MCP**.

* The **IDE/orchestrator** knows the workspace root (the directory the user opened).
* For each spawned member, the orchestrator may pass a `cwd`:

  * `"client"`, `"backend"`, `"apps/api"`, etc.
  * or no `cwd` → agent sees the entire workspace
* MCP simply resolves `cwd` relative to the workspace root and spawns the CLI there.

### **2.4 Engine Selection & Templates**

The user configures:

* Which CLI engine to spawn (Cursor Agent / Claude Code CLI / etc.)
* Argument templates for spawning an agent
* Optional create-chat template (stateful only)

Templates use `<% %>` rendering and receive variables:

* `prompt` (combined role + task)
* `cwd`
* `chatId` (stateful)
* `STATE_MODE` (internal)
* Any other environment-defined values

The orchestrator **never** decides engine, flags, or templates.

---

# 3. **Capabilities Exposed to the Orchestrator**

The Squad MCP exposes **two tools**:

---

## 3.1 `list_roles`

### Purpose

List all available roles sourced from the MCP’s `agents/` folder.

### Request

No inputs:

```json
{}
```

### Response

Each role includes:

* `id` (from filename)
* `name` (frontmatter or fallback to id)
* `description` (frontmatter or empty string)

Example:

```json
{
  "roles": [
    {
      "id": "frontend-developer",
      "name": "frontend-developer",
      "description": "Frontend development specialist..."
    },
    {
      "id": "backend-developer",
      "name": "backend-developer",
      "description": "Backend development specialist..."
    },
    {
      "id": "qa-engineer",
      "name": "qa-engineer",
      "description": "Quality assurance engineer..."
    }
  ]
}
```

Notes:

* No engine details
* No state information
* No workspace information
* The orchestrator discovers everything it needs by reading the workspace itself

---

## 3.2 `start_squad_members`

### Purpose

Spawn **one or more agents** with assigned roles + tasks, run them to completion, and return their results.

### Shared Concepts

Both modes return:

* A `squadId` (opaque)
* A list of `members`, each containing:

  * `memberId`
  * `roleId`
  * `cwd` (resolved)
  * `status`:

    * `"completed"` (exit code 0)
    * `"error"` (exit code non-zero)
    * `"timeout"` (exceeded configured duration)
  * `rawStdout`
  * `rawStderr`
* In **stateful mode**, each member also has a `chatId`.

---

## 3.2a **Stateless Mode Schema**

Configured via `STATE_MODE=stateless`.

### Request

```json
{
  "members": [
    {
      "roleId": "frontend-developer",
      "task": "Build signup form",
      "cwd": "client"
    },
    {
      "roleId": "backend-developer",
      "task": "Build signup API",
      "cwd": "backend"
    }
  ],
  "metadata": { ...optional... }
}
```

### Internal Behavior

For each member:

* Load `agents/<roleId>.md`
* Inject **role prompt + task** into template
* Spawn CLI agent at the given `cwd`

### Response

```json
{
  "squadId": "squad-20241114-001",
  "members": [
    {
      "memberId": "m1",
      "roleId": "frontend-developer",
      "cwd": "client",
      "status": "completed",
      "rawStdout": "...",
      "rawStderr": ""
    },
    {
      "memberId": "m2",
      "roleId": "backend-developer",
      "cwd": "backend",
      "status": "completed",
      "rawStdout": "...",
      "rawStderr": ""
    }
  ]
}
```

---

## 3.2b **Stateful Mode Schema**

Configured via `STATE_MODE=stateful`.

### Request

```json
{
  "members": [
    {
      "roleId": "backend-developer",
      "task": "Update signup endpoint",
      "cwd": "backend",
      "chatId": "backend-chat-123"
    },
    {
      "roleId": "frontend-developer",
      "task": "Adjust validation",
      "cwd": "client"
    }
  ]
}
```

### Internal Behavior

For each member:

* If `chatId` is provided:

  * Do **not** inject role body again
  * Only inject task, continue the chat
* If `chatId` is missing:

  * Create new chat via template
  * Inject role prompt + task
  * Return new `chatId`

### Response

```json
{
  "squadId": "squad-20241114-002",
  "members": [
    {
      "memberId": "m1",
      "roleId": "backend-developer",
      "cwd": "backend",
      "chatId": "backend-chat-123",
      "status": "completed",
      "rawStdout": "...",
      "rawStderr": ""
    },
    {
      "memberId": "m2",
      "roleId": "frontend-developer",
      "cwd": "client",
      "chatId": "client-chat-789",
      "status": "completed",
      "rawStdout": "...",
      "rawStderr": ""
    }
  ]
}
```

---

# 4. **Prompt Construction Rules**

### **4.1 Role injection**

#### Stateless mode

Injected **every time**, for every member:

```
# Role

<roleBody>

---

# Task

<task>
```

#### Stateful mode — new chat only

```
# Role

<roleBody>

---

# Initial Task

<task>
```

#### Stateful mode — chat reuse

```
# Task

<task>
```

---

### **4.2 Setup & Reporting Rules**

(Always injected after role + task)

This small footer instructs the agent how to signal environment problems:

```
---

# Setup & Reporting Rules

If you notice any setup or environment problems that prevent you from doing the task correctly,
you MUST report them clearly as SETUP / ENVIRONMENT ISSUES.

Explain what you observed and suggest specific fixes for the human.
Do NOT fabricate a successful implementation if the environment blocks you.
```

The orchestrator LLM interprets these signals from the output text.

---

# 5. **What the MCP Does NOT Do**

This is important for clarity:

❌ Does **not** decide which roles to use
❌ Does **not** decide workspace layout
❌ Does **not** parse or interpret agent output
❌ Does **not** auto-detect setup problems
❌ Does **not** coordinate multi-step workflows
❌ Does **not** handle partial successes or retry logic
❌ Does **not** expose engine, statefulness, or template details to the orchestrator

The MCP stays intentionally simple.

---

# 6. **What the Orchestrator Does**

The orchestrator (LLM agent) must:

* Pick roles
* Define tasks
* Pick cwd per member (backend, client, root, monorepo subfolder)
* Read rawStdout/rawStderr
* Detect setup issues from natural language cues
* Communicate issues to the human
* Retry members when needed
* Coordinate sequential or parallel steps
* Use chatIds in stateful mode

---

# 7. **Audience**

### For the **User**

You:

* set up your workspace normally,
* configure MCPs/rules where needed,
* pick the CLI engine via MCP config,
* add/edit role definitions inside the `agents/` folder,
* and then let the orchestrator assemble squads on demand.

### For the **Orchestrator Developer**

You:

* rely on `list_roles` + `start_squad_members`,
* reuse `chatId`s if stateful,
* pass `cwd` according to workspace knowledge,
* reason about raw text agent outputs,
* handle retries and workflows.

### For the **MCP Implementer**

You:

* read env/config for engine + templates
* expose role files via `list_roles`
* load role bodies + inject them into prompts
* run CLI agents with correct cwd + env
* return stdout/stderr + status
* manage chat creation in stateful mode

---

# 8. **v1 Deliverables**

* Role-based agent spawning via templates
* Stateless/stateful modes (exclusive)
* Role files in `agents/`
* Prompt construction with footer rules
* Zero parsing, full `rawStdout` passthrough
* Simple, stable tool schemas
* Workspace-agnostic behavior
* Blocking execution (wait for agents to finish)
* Multi-member spawning in one call
* Chat reuse in stateful mode
