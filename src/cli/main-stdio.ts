import { NestFactory } from '@nestjs/core';
import { AppModule } from '../nest/app.module';
import { McpCliCommand } from './mcp-cli.command';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: [ 'error', 'warn', 'log' ]
  });

  const cliCommand = app.get(McpCliCommand);
  await cliCommand.run();
}

bootstrap().catch(() => process.exit(1));

