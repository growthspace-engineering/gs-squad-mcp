import { Module } from '@nestjs/common';
import { SquadConfigService } from '../core/config';
import { RoleRepositoryService } from '../core/roles';
import { PromptBuilderService } from '../core/prompt';
import { TemplateRendererService } from '../core/engine';
import { ProcessRunnerService } from '../core/engine';
import { SquadService } from '../core/mcp';
import { McpCliCommand } from '../cli';

@Module({
  imports: [],
  controllers: [],
  providers: [
    SquadConfigService,
    RoleRepositoryService,
    PromptBuilderService,
    TemplateRendererService,
    ProcessRunnerService,
    SquadService,
    McpCliCommand
  ],
  exports: [ SquadService ]
})
export class AppModule {}

