# Squad Dashboard Feature – Implementation Blueprint for `gs-squad-mcp`

## 1. Objectives

Add a **local squad telemetry + TUI dashboard** to `gs-squad-mcp` that:

1. Persists squad activity (sessions, squads, agents) in a **SQLite** DB.
2. Provides a **terminal UI (TUI)** that visualizes all squads created via `StartSquadTeam`:

   * **Row = originator orchestration session** (typically: orchestrator chat/session).
   * **Columns per row = squads** started by that originator, in time order.
   * Each squad shows its **agents**, roles, status, and results/errors.
3. Supports two TUI modes:

   * **Default (view-only):** just a dashboard.
   * **Interactive (`--interactive`):** dashboard + embedded orchestrator CLI in a bottom pane, pinned to that orchestrator’s row.
4. Works across **multiple MCP processes** running in STDIO mode (each tool call may be a separate process).
5. Works on **Node 18/20/22+** (no dependency on Node 22’s experimental `node:sqlite`).

---

## 2. High-Level Architecture

### Components

1. **MCP Server (NestJS + TypeORM + SQLite)**

   * Implements tools:

     * `ListRoles`
     * `StartSquadTeam`
   * `StartSquadTeam` is extended to:

     * Derive a **stable originator ID** per orchestrator.
     * Write `Session`, `Squad`, and `Agent` records to a shared SQLite database.

2. **TUI Dashboard (`gs-squad-dashboard` CLI)**

   * Separate Node CLI app in the same repo.
   * Connects **read-only** to the same SQLite DB file.
   * Polls the DB periodically (e.g. every 500–1000 ms) and renders a dashboard.

   Modes:

   * **View-only (default)**: just dashboard.
   * **Interactive (`--interactive`)**:

     * Calls a “create chat” command to obtain an orchestrator chat id.
     * Launches the orchestrator CLI in a PTY, attached to that chat id.
     * Pins that originator’s row at the top; bottom pane shows the orchestrator terminal.

3. **Shared SQLite Database**

   * Single `.db` file on local filesystem.
   * Updated by MCP, read by TUI.
   * Schema managed via TypeORM migrations.

---

## 3. Configuration & Environment

### 3.1 Database location

**Env var:** `SQUAD_DB_PATH`

**Default resolution:**

* Use `os.homedir()` (or equivalent) to get the user’s home directory.
* Default path:

```text
~/.gs-squad-mcp/squad.db
```

Implementation notes:

* Create directory `~/.gs-squad-mcp` if it doesn’t exist.
* Both **MCP** and **TUI** must use the same resolution logic:

  * `SQUAD_DB_PATH` if set.
  * Else `~/.gs-squad-mcp/squad.db`.

### 3.2 Orchestrator configuration (for interactive TUI mode)

On the **TUI side**, define:

* `AGENT_CREATE_CHAT_CMD`

  * Non-interactive command that starts a new orchestrator chat/session.
  * Prints a **chat ID** (string) to stdout.
* `AGENT_INTERACTIVE_CMD`

  * Command that runs the orchestrator’s **interactive CLI**.
  * TUI will pass the chat ID via:

    * env var: `ORCHESTRATOR_CHAT_ID=<id>`, or
    * argument: `--chat-id <id>` (choose and document one convention).

Interactive mode requires these env vars; otherwise TUI exits with a clear error.

---

## 4. Data Model & TypeORM Entities

### 4.1 Conceptual model

* **Originator session** (row in the dashboard):

  * Represents a single orchestrator context:

    * Ideally: a chat/session in the IDE or CLI.
    * Fallback: workspace directory or similar.

* **Squad**:

  * A single `StartSquadTeam` invocation within one originator session.

* **Agent**:

  * One spawned agent (e.g., a “Frontend Engineer” role) that runs under a squad.

### 4.2 Originator resolution

We want rows to group squads by the **originator** that triggered them.

Define `originatorId` as:

1. `orchestratorChatId` – if provided by the orchestrator.
2. Else `workspaceId` – if provided in the tool args (e.g. project path).
3. Else `process.cwd()` – fallback to the working directory from which the MCP was run.

This is stable across multiple MCP STDIO invocations, because:

* Orchestrator chat id is stable for the conversation.
* Workspace path is stable for a project.
* CWD is stable if the orchestrator consistently runs MCP from the project root.

### 4.3 Entities

#### `SessionEntity` (`sessions` table)

```ts
@Entity('sessions')
export class SessionEntity {
  @PrimaryColumn()
  originatorId: string; // Row key

  @Column({ nullable: true })
  orchestratorChatId?: string; // e.g. IDE chat/session id

  @Column({ nullable: true })
  workspaceId?: string; // project path or logical name

  @Column()
  createdAt: string; // ISO timestamp

  @Column()
  lastActivityAt: string; // ISO timestamp, updated on any squad/agent activity
}
```

#### `SquadEntity` (`squads` table)

```ts
@Entity('squads')
export class SquadEntity {
  @PrimaryColumn()
  squadId: string; // uuid

  @ManyToOne(() => SessionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'originatorId' })
  session: SessionEntity;

  @Column()
  originatorId: string; // FK → sessions.originatorId

  @Column()
  label: string; // e.g. "Frontend Engineer + Backend Engineer"

  @Column()
  createdAt: string; // ISO timestamp
}
```

#### `AgentEntity` (`agents` table)

```ts
export type AgentStatus = 'starting' | 'running' | 'done' | 'error';

@Entity('agents')
export class AgentEntity {
  @PrimaryColumn()
  agentId: string; // uuid

  @ManyToOne(() => SquadEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'squadId' })
  squad: SquadEntity;

  @Column()
  squadId: string; // FK → squads.squadId

  @Column()
  roleName: string;

  @Column('text', { nullable: true })
  prompt?: string;

  @Column()
  status: AgentStatus;

  @Column('text', { nullable: true })
  result?: string;

  @Column('text', { nullable: true })
  error?: string;

  @Column()
  startedAt: string; // ISO

  @Column({ nullable: true })
  finishedAt?: string; // ISO
}
```

---

## 5. NestJS / MCP Integration

### 5.1 TypeORM setup (MCP side)

In `AppModule` or a dedicated DB module:

```ts
TypeOrmModule.forRootAsync({
  useFactory: () => {
    const home = os.homedir();
    const defaultDir = path.join(home, '.gs-squad-mcp');
    const defaultPath = path.join(defaultDir, 'squad.db');
    const dbPath = process.env.SQUAD_DB_PATH ?? defaultPath;

    // ensure defaultDir exists

    return {
      type: 'sqlite',
      database: dbPath,
      entities: [SessionEntity, SquadEntity, AgentEntity],
      synchronize: false,      // prefer migrations once schema is stable
      migrationsRun: true,
      migrations: [/* path(s) */],
    };
  },
});
```

Generate an initial migration for `sessions`, `squads`, `agents`.

### 5.2 `SquadTelemetryService`

Create a dedicated Nest service to encapsulate DB operations:

```ts
@Injectable()
export class SquadTelemetryService {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessionRepo: Repository<SessionEntity>,
    @InjectRepository(SquadEntity)
    private readonly squadRepo: Repository<SquadEntity>,
    @InjectRepository(AgentEntity)
    private readonly agentRepo: Repository<AgentEntity>,
  ) {}

  async ensureSession(args: {
    orchestratorChatId?: string;
    workspaceId?: string;
  }): Promise<string /* originatorId */> {
    const originatorId =
      args.orchestratorChatId ??
      args.workspaceId ??
      process.cwd();

    const now = new Date().toISOString();

    let session = await this.sessionRepo.findOne({ where: { originatorId } });

    if (!session) {
      session = this.sessionRepo.create({
        originatorId,
        orchestratorChatId: args.orchestratorChatId,
        workspaceId: args.workspaceId ?? process.cwd(),
        createdAt: now,
        lastActivityAt: now,
      });
    } else {
      session.lastActivityAt = now;
      // optional: fill orchestratorChatId/workspaceId if they became available later
      if (args.orchestratorChatId && !session.orchestratorChatId) {
        session.orchestratorChatId = args.orchestratorChatId;
      }
      if (args.workspaceId && !session.workspaceId) {
        session.workspaceId = args.workspaceId;
      }
    }

    await this.sessionRepo.save(session);
    return originatorId;
  }

  async createSquad(originatorId: string, label: string): Promise<SquadEntity> {
    const squad = this.squadRepo.create({
      squadId: crypto.randomUUID(),
      originatorId,
      createdAt: new Date().toISOString(),
      label,
    });
    await this.squadRepo.save(squad);
    await this.touchSession(originatorId);
    return squad;
  }

  async createAgent(
    squadId: string,
    roleName: string,
    prompt: string,
  ): Promise<AgentEntity> {
    const agent = this.agentRepo.create({
      agentId: crypto.randomUUID(),
      squadId,
      roleName,
      prompt,
      status: 'starting',
      startedAt: new Date().toISOString(),
    });
    await this.agentRepo.save(agent);
    return agent;
  }

  async updateAgentStatus(
    originatorId: string,
    agentId: string,
    patch: Partial<
      Pick<AgentEntity, 'status' | 'result' | 'error' | 'finishedAt'>
    >,
  ): Promise<void> {
    await this.agentRepo.update(agentId, patch);
    await this.touchSession(originatorId);
  }

  private async touchSession(originatorId: string): Promise<void> {
    await this.sessionRepo.update(originatorId, {
      lastActivityAt: new Date().toISOString(),
    });
  }
}
```

### 5.3 `StartSquadTeam` tool integration

Assume `StartSquadTeam` args now include originator context:

```ts
interface StartSquadTeamArgs {
  orchestratorChatId?: string;
  workspaceId?: string;
  roles: {
    name: string;
    prompt: string;
  }[];
}
```

Implementation sketch:

```ts
async function startSquadTeamTool(args: StartSquadTeamArgs) {
  const originatorId = await squadTelemetry.ensureSession({
    orchestratorChatId: args.orchestratorChatId,
    workspaceId: args.workspaceId,
  });

  const label = args.roles.map(r => r.name).join(' + ');
  const squad = await squadTelemetry.createSquad(originatorId, label);

  const agentPromises = args.roles.map(async role => {
    const agent = await squadTelemetry.createAgent(
      squad.squadId,
      role.name,
      role.prompt,
    );

    // spawn actual agent process (existing logic)
    const { stdout, stderr, exitCode } = await runAgentProcess(role, args);

    const now = new Date().toISOString();
    if (exitCode === 0) {
      await squadTelemetry.updateAgentStatus(originatorId, agent.agentId, {
        status: 'done',
        result: stdout,
        finishedAt: now,
      });
    } else {
      await squadTelemetry.updateAgentStatus(originatorId, agent.agentId, {
        status: 'error',
        error: stderr || `Exit code ${exitCode}`,
        finishedAt: now,
      });
    }

    return { role: role.name, result: stdout, error: stderr, exitCode };
  });

  const agentsResults = await Promise.all(agentPromises);

  // existing return shape (or improved) back to orchestrator:
  return {
    originatorId,
    squadId: squad.squadId,
    label,
    agents: agentsResults,
  };
}
```

---

## 6. TUI Dashboard (`gs-squad-dashboard`)

### 6.1 Structure

Create a separate package/folder in the repo:

```text
packages/gs-squad-dashboard/
  src/
    cli.ts
    db.ts
    model.ts
    ui/
      TuiApp.tsx
      layout.tsx
```

### 6.2 Dependencies (TUI)

* **SQLite client:** `better-sqlite3` (recommended: fast & synchronous for CLI).
* **TUI UI:** `ink` or `blessed` (Ink recommended for React DX).
* **PTY:** `node-pty` (for interactive mode).

### 6.3 DB access (read-only)

`db.ts`:

* Resolve `SQUAD_DB_PATH` exactly like the MCP.
* Open SQLite DB via `better-sqlite3` in read-only mode.
* Expose a function to read full state:

```ts
export interface SessionDTO {
  originatorId: string;
  orchestratorChatId?: string;
  workspaceId?: string;
  createdAt: string;
  lastActivityAt: string;
}

export interface SquadDTO { /* squadId, originatorId, label, createdAt */ }
export interface AgentDTO { /* agentId, squadId, roleName, status, ... */ }

export function loadFullState(): {
  sessions: SessionDTO[];
  squads: SquadDTO[];
  agents: AgentDTO[];
} {
  // SELECT * FROM sessions ...
  // SELECT * FROM squads ...
  // SELECT * FROM agents ...
}
```

### 6.4 Polling strategy

Inside the Ink app:

* Maintain `lastSeenMaxLastActivity: string | null`.
* Use a timer (e.g. `setInterval`) every 500–1000 ms:

  1. `SELECT MAX(lastActivityAt) FROM sessions;`
  2. If `maxLastActivity !== lastSeenMaxLastActivity`:

     * Update `lastSeenMaxLastActivity`.
     * Call `loadFullState()`.
     * Build in-memory model:

       * Map `originatorId -> { session, squads, agents }`.

This keeps DB reads cheap and only runs heavy queries when something changes.

### 6.5 Row/column mapping in UI

* **Row = originator session** (`originatorId`).

* Display row label:

  * If `orchestratorChatId` present:

    * Something like: `Chat: <orchestratorChatId>` (truncate for width).
  * Else:

    * `Workspace: <workspaceId or originatorId>`.

* **Columns per row = squads** for that `originatorId`, sorted by `createdAt`.

* Each squad shows:

  * Squad label (e.g. “Frontend + Backend”).
  * For each agent:

    * Role
    * Status:

      * `starting` / `running` → show spinner icon.
      * `done` → ✅ and truncated `result`.
      * `error` → ❌ and truncated `error`.

### 6.6 CLI modes

`cli.ts`:

* Options:

  * `--interactive` (boolean).

#### Default (view-only) mode

Command:

```bash
gs-squad-dashboard
```

Behavior:

* Resolve DB path.
* If DB doesn’t exist or has no sessions, show a friendly “no squads yet” state.
* Start Ink with `<TuiApp mode="view-only" />`.
* No PTY spawned.

#### Interactive mode

Command:

```bash
gs-squad-dashboard --interactive
```

Behavior:

1. Validate env:

   * Require `AGENT_CREATE_CHAT_CMD` and `AGENT_INTERACTIVE_CMD`.
   * If missing, print error and exit.

2. Run `AGENT_CREATE_CHAT_CMD`:

   * Capture stdout → `orchestratorChatId`.
   * Set `attachedOriginatorId = orchestratorChatId`.

3. Launch orchestrator PTY:

   ```ts
   const pty = spawnPty(
     process.env.AGENT_INTERACTIVE_CMD!,
     [], // or inject args
     {
       name: 'xterm-color',
       cols: 120,
       rows: 30,
       cwd: process.cwd(),
       env: {
         ...process.env,
         ORCHESTRATOR_CHAT_ID: orchestratorChatId,
       },
     },
   );
   ```

4. Start Ink with:

   ```tsx
   <TuiApp
     mode="interactive"
     attachedOriginatorId={attachedOriginatorId}
     pty={pty}
   />
   ```

5. `TuiApp`:

   * Dashboard:

     * Rows sorted by:

       * First: `originatorId === attachedOriginatorId`.
       * Then: `lastActivityAt DESC`.
   * Bottom pane:

     * Streams PTY `onData` output.
     * `useInput` to forward keystrokes → `pty.write(...)`.

---

## 7. Orchestrator Responsibilities

To get the best grouping:

* When calling `StartSquadTeam`, orchestrator should pass:

  * `orchestratorChatId`: its conversation/session ID.
  * `workspaceId`: project path or logical workspace identifier (optional but recommended).

Example tool call arguments:

```json
{
  "orchestratorChatId": "chat-42",
  "workspaceId": "/Users/neil/projects/achievibit",
  "roles": [
    { "name": "Frontend Engineer", "prompt": "..." },
    { "name": "Backend Engineer", "prompt": "..." }
  ]
}
```

If this is not possible:

* MCP will still group rows by:

  * `workspaceId` if passed, or
  * `process.cwd()` as last-resort fallback.

TUI doesn’t care where the ID comes from; it just uses `originatorId` and labels the row based on available metadata.

---

## 8. Implementation Phases

### Phase 1 – Telemetry Persistence (MCP)

* [ ] Add `sessions`, `squads`, `agents` entities.
* [ ] Configure SQLite via TypeORM with `SQUAD_DB_PATH` + homedir default.
* [ ] Create migrations for initial schema.
* [ ] Implement `SquadTelemetryService`.
* [ ] Extend `StartSquadTeam` to:

  * Accept `orchestratorChatId` / `workspaceId`.
  * Call `SquadTelemetryService` to write telemetry.

### Phase 2 – Basic TUI (View-only)

* [ ] Create `gs-squad-dashboard` package.
* [ ] Implement `db.ts` (read-only client with `better-sqlite3`).
* [ ] Implement polling + state building logic.
* [ ] Implement Ink UI:

  * Rows = originators.
  * Columns = squads.
  * Show basic status per agent.

### Phase 3 – Interactive Mode

* [ ] Add `--interactive` flag parsing.
* [ ] Wire `AGENT_CREATE_CHAT_CMD` & `AGENT_INTERACTIVE_CMD`.
* [ ] Add PTY spawning with `node-pty`.
* [ ] Extend Ink layout to add bottom orchestrator pane.
* [ ] Pin `attachedOriginatorId` row at the top.

### Phase 4 – Polish & Docs

* [ ] Document:

  * `SQUAD_DB_PATH`
  * `AGENT_CREATE_CHAT_CMD`
  * `AGENT_INTERACTIVE_CMD`
  * Tool args: `orchestratorChatId`, `workspaceId`
* [ ] Add empty-state UX (“No squads recorded yet.”).
* [ ] Optional filters/flags:

  * `--originator <id>`
  * `--workspace <path>`
