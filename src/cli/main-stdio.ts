import { NestFactory } from '@nestjs/core';
import { AppModule } from '../nest/app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: [ 'error', 'warn', 'log' ]
  });

  // TODO: Implement MCP stdio command handler
  await app.close();
}

bootstrap().catch(() => process.exit(1));

