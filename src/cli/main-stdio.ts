#!/usr/bin/env node

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { LoggerService } from '@nestjs/common';
import { AppModule } from '../nest/app.module';
import { McpCliCommand } from './mcp-cli.command';
import { spawn } from 'child_process';
import * as path from 'path';

/**
 * Custom logger that writes all logs to stderr instead of stdout.
 * This is required for stdio-based MCP communication where only
 * JSON-RPC messages should go to stdout.
 */
class StderrLogger implements LoggerService {
  log(message: string): void {
    process.stderr.write(`[LOG] ${message}\n`);
  }

  error(message: string, trace?: string): void {
    process.stderr.write(`[ERROR] ${message}\n`);
    if (trace) {
      process.stderr.write(`[TRACE] ${trace}\n`);
    }
  }

  warn(message: string): void {
    process.stderr.write(`[WARN] ${message}\n`);
  }

  debug(message: string): void {
    process.stderr.write(`[DEBUG] ${message}\n`);
  }

  verbose(message: string): void {
    process.stderr.write(`[VERBOSE] ${message}\n`);
  }
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new StderrLogger()
  });

  // If invoked as "gs-squad-mcp dashboard" (or with --dashboard),
  // initialize DB via Nest + TypeORM,
  // then spawn the dashboard TUI process and exit when it exits.
  const argv = process.argv.slice(2);
  const wantsDashboard =
    argv.includes('dashboard') || argv.includes('--dashboard');
  if (wantsDashboard) {
    const projectRoot = path.resolve(__dirname, '../../');
    const dashboardEntry = path.join(
      projectRoot,
      'packages/gs-squad-dashboard/dist/cli.js'
    );
    const child = spawn(process.execPath, [ dashboardEntry ], {
      stdio: 'inherit',
      env: { ...process.env }
    });
    child.on('exit', async (code) => {
      try {
        await app.close();
      } finally {
        process.exit(code ?? 0);
      }
    });
    return;
  }

  const cliCommand = app.get(McpCliCommand);
  await cliCommand.run();
}

// Only execute bootstrap if this file is run directly (not imported)
if (require.main === module) {
  bootstrap().catch((error) => {
    process.stderr.write(
      `[FATAL] Failed to start MCP server: ${
        error instanceof Error ? error.message : String(error)
      }\n`
    );
    if (error instanceof Error && error.stack) {
      process.stderr.write(`[STACK] ${error.stack}\n`);
    }
    process.exit(1);
  });
}

