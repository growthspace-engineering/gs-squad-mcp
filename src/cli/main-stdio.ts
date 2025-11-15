#!/usr/bin/env node

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { LoggerService } from '@nestjs/common';
import { AppModule } from '../nest/app.module';
import { McpCliCommand } from './mcp-cli.command';

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

