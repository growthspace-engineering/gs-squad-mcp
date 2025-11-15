#!/usr/bin/env node
/* eslint-disable max-len */

import { render } from 'ink';
import React from 'react';
import { databaseExists, resolveDbPath } from './db.js';
import { TuiApp } from './ui/TuiApp.js';
import { execSync } from 'child_process';
import * as pty from 'node-pty';

function main(): void {
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const interactive = args.has('--interactive');
  const originatorFilterArgIndex = argv.findIndex((a) => a === '--originator');
  const workspaceFilterArgIndex = argv.findIndex((a) => a === '--workspace');
  const originatorFilter =
    originatorFilterArgIndex >= 0 ?
      argv[originatorFilterArgIndex + 1] :
      undefined;
  const workspaceFilter =
    workspaceFilterArgIndex >= 0 ?
      argv[workspaceFilterArgIndex + 1] :
      undefined;

  const dbPath = resolveDbPath();
  if (!databaseExists()) {
    process.stdout.write(
      `No squads DB found at ${dbPath}. Start a few squads, then re-run.\n`
    );
    process.exit(0);
  }

  const enterAltScreen = (): void => {
    try {
      // Enable alternate screen buffer
      process.stdout.write('\x1b[?1049h');
      // Hide cursor
      process.stdout.write('\x1b[?25l');
      // Clear screen and scrollback
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
      // Disable line wrapping
      process.stdout.write('\x1b[?7l');
    } catch {
      // Ignore errors
    }
  };
  const exitAltScreen = (): void => {
    try {
      // Re-enable line wrapping
      process.stdout.write('\x1b[?7h');
      // Show cursor
      process.stdout.write('\x1b[?25h');
      // Restore main buffer
      process.stdout.write('\x1b[?1049l');
      // Clear any remaining output
      process.stdout.write('\x1b[2J\x1b[H');
    } catch {
      // Ignore errors
    }
  };

  if (!interactive) {
    enterAltScreen();
    const ink = render(
      <TuiApp
        mode="view-only"
        filters={{
          originatorId: originatorFilter,
          workspaceId: workspaceFilter
        }}
      />
    );
    let cleanupCalled = false;
    const cleanup = (): void => {
      if (cleanupCalled) return;
      cleanupCalled = true;
      try {
        ink.unmount();
      } catch {
        // Ignore unmount errors
      }
      exitAltScreen();
      process.exit(0);
    };
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
    process.once('exit', exitAltScreen);
    ink.waitUntilExit().then(cleanup).catch(cleanup);
    return;
  }

  const createCmd = process.env.AGENT_CREATE_CHAT_CMD;
  const interactiveCmd = process.env.AGENT_INTERACTIVE_CMD;
  if (!createCmd || !interactiveCmd) {
    process.stderr.write(
      'Interactive mode requires AGENT_CREATE_CHAT_CMD and AGENT_INTERACTIVE_CMD.\n'
    );
    process.exit(1);
  }

  // Create orchestrator chat id
  let orchestratorChatId = '';
  try {
    orchestratorChatId = execSync(createCmd, {
      encoding: 'utf-8',
      stdio: [ 'ignore', 'pipe', 'pipe' ]
    }).trim();
  } catch (err) {
    process.stderr.write('Failed to create orchestrator chat id.\n');
    process.exit(1);
  }

  const shell = process.env.SHELL || 'bash';
  const child = pty.spawn(shell, [ '-lc', interactiveCmd ], {
    name: 'xterm-color',
    cols: process.stdout.columns || 120,
    rows: process.stdout.rows || 30,
    cwd: process.cwd(),
    env: {
      ...process.env,
      ORCHESTRATOR_CHAT_ID: orchestratorChatId
    }
  });

  const ptyAdapter = {
    onData(cb: (data: string) => void): void {
      child.onData(cb);
    },
    write(data: string): void {
      child.write(data);
    }
  };

  enterAltScreen();
  const ink = render(
    <TuiApp
      mode="interactive"
      attachedOriginatorId={orchestratorChatId}
      filters={{
        originatorId: originatorFilter,
        workspaceId: workspaceFilter
      }}
      pty={ptyAdapter}
    />
  );
  let cleanupCalled = false;
  const cleanup = (): void => {
    if (cleanupCalled) return;
    cleanupCalled = true;
    try {
      child.kill();
    } catch {
      // Ignore kill errors
    }
    try {
      ink.unmount();
    } catch {
      // Ignore unmount errors
    }
    exitAltScreen();
    process.exit(0);
  };
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
  process.once('exit', exitAltScreen);
  child.onExit(() => cleanup());
  ink.waitUntilExit().then(cleanup).catch(cleanup);
}

// ESM-friendly entrypoint (no require.main)
main();


