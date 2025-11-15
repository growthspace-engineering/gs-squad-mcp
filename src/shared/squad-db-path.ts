import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function resolveSquadDbPath(): string {
  const homeDir = os.homedir();
  const defaultDir = path.join(homeDir, '.gs-squad-mcp');
  const defaultPath = path.join(defaultDir, 'squad.db');
  const dbPath = process.env.SQUAD_DB_PATH ?? defaultPath;

  try {
    const dirToEnsure = path.dirname(dbPath);
    if (!fs.existsSync(dirToEnsure)) {
      fs.mkdirSync(dirToEnsure, { recursive: true });
    }
  } catch {
    // Best effort. DB open will fail loudly if path is invalid.
  }

  return dbPath;
}




