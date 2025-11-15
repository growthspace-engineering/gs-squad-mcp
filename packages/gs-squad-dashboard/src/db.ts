import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

export interface SessionDTO {
  originatorId: string;
  orchestratorChatId?: string;
  workspaceId?: string;
  createdAt: string;
  lastActivityAt: string;
}

export interface SquadDTO {
  squadId: string;
  originatorId: string;
  label: string;
  createdAt: string;
}

export interface AgentDTO {
  agentId: string;
  squadId: string;
  roleName: string;
  task?: string;
  prompt?: string;
  status: 'starting' | 'running' | 'done' | 'error';
  result?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export function resolveDbPath(): string {
  const dir = path.join(os.homedir(), '.gs-squad-mcp');
  const defaultPath = path.join(dir, 'squad.db');
  return process.env.SQUAD_DB_PATH ?? defaultPath;
}

export function databaseExists(): boolean {
  const dbPath = resolveDbPath();
  return fs.existsSync(dbPath);
}

export function loadFullState(): {
  sessions: SessionDTO[];
  squads: SquadDTO[];
  agents: AgentDTO[];
  maxLastActivityAt: string | null;
} {
  const dbPath = resolveDbPath();
  const db = new Database(dbPath, { readonly: true });
  const sessions = db.prepare('SELECT * FROM sessions').all() as SessionDTO[];
  const squads = db.prepare('SELECT * FROM squads').all() as SquadDTO[];
  const agents = db.prepare('SELECT * FROM agents').all() as AgentDTO[];
  const maxRow = db
    .prepare('SELECT MAX(lastActivityAt) AS maxLastActivityAt FROM sessions')
    .get() as { maxLastActivityAt: string | null };
  db.close();
  return {
    sessions,
    squads,
    agents,
    maxLastActivityAt: maxRow?.maxLastActivityAt ?? null
  };
}





