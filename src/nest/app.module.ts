import { Module } from '@nestjs/common';
import { SquadConfigService } from '../core/config/squad-config.service';
import { RoleRepositoryService } from '../core/roles/role-repository.service';
import { PromptBuilderService } from '../core/prompt/prompt-builder.service';
import { TemplateRendererService } from
  '../core/engine/template-renderer.service';
import { ProcessRunnerService } from '../core/engine/process-runner.service';
import { SquadService } from '../core/mcp/squad.service';

@Module({
  imports: [],
  controllers: [],
  providers: [
    SquadConfigService,
    RoleRepositoryService,
    PromptBuilderService,
    TemplateRendererService,
    ProcessRunnerService,
    SquadService
  ],
  exports: [ SquadService ]
})
export class AppModule {}

