import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolveSquadDbPath } from '../shared/squad-db-path';
import { SessionEntity } from './entities/session.entity';
import { SquadEntity } from './entities/squad.entity';
import { AgentEntity } from './entities/agent.entity';
import {
  SquadTelemetryService
} from '../core/telemetry/squad-telemetry.service';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        return {
          type: 'better-sqlite3' as const,
          database: resolveSquadDbPath(),
          entities: [ SessionEntity, SquadEntity, AgentEntity ],
          synchronize: true,
          migrationsRun: false,
          migrations: [],
          // Explicitly set database to read-write mode
          readonly: false,
          fileMustExist: false
        };
      }
    }),
    TypeOrmModule.forFeature([ SessionEntity, SquadEntity, AgentEntity ])
  ],
  providers: [ SquadTelemetryService ],
  exports: [ SquadTelemetryService ]
})
export class DbModule {}


