import { Injectable, Module } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { SquadConfigService } from '@gs-squad-mcp/core/config';
import { RoleRepositoryService } from '@gs-squad-mcp/core/roles';
import { PromptBuilderService } from '@gs-squad-mcp/core/prompt';
import {
  TemplateRendererService,
  ProcessRunnerService
} from '@gs-squad-mcp/core/engine';
import { SquadService } from '@gs-squad-mcp/core/mcp';
import { McpCliCommand } from '@gs-squad-mcp/cli';
import { AppModule } from './app.module';
import { DbModule } from './db.module';

jest.mock('@gs-squad-mcp/cli', () => {
  @Injectable()
  class MockMcpCliCommand {
    public squadService: SquadService;
    public configService: SquadConfigService;

    constructor(
      squadService: SquadService,
      configService: SquadConfigService
    ) {
      this.squadService = squadService;
      this.configService = configService;
    }

    async run(): Promise<void> {
      // cli entry point is irrelevant for DI-focused tests
    }
  }

  return { McpCliCommand: MockMcpCliCommand };
});

describe('AppModule', () => {
  describe('metadata definition', () => {
    it('should register all expected providers', () => {
      const providers =
        Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) ?? [];

      expect(providers).toHaveLength(7);
      expect(providers).toEqual(
        expect.arrayContaining([
          SquadConfigService,
          RoleRepositoryService,
          PromptBuilderService,
          TemplateRendererService,
          ProcessRunnerService,
          SquadService,
          McpCliCommand
        ])
      );
    });

    it('should export SquadService for downstream modules', () => {
      const exports =
        Reflect.getMetadata(MODULE_METADATA.EXPORTS, AppModule) ?? [];

      expect(exports).toEqual([ SquadService ]);
    });

    it(
      'should keep controllers empty and only import DbModule',
      () => {
        const imports =
          Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) ?? [];
        const controllers =
          Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AppModule) ?? [];

        expect(imports).toHaveLength(1);
        expect(imports).toEqual([ DbModule ]);
        expect(controllers).toHaveLength(0);
      });
    }
  );

  describe('dependency injection', () => {
    let testingModule: TestingModule;

    beforeEach(async () => {
      testingModule = await Test.createTestingModule({
        imports: [ AppModule ]
      }).compile();
    });

    afterEach(async () => {
      if (testingModule) {
        await testingModule.close();
      }
    });

    it('should resolve every registered provider instance', () => {
      expect(
        testingModule.get(SquadConfigService)
      ).toBeInstanceOf(SquadConfigService);
      expect(
        testingModule.get(RoleRepositoryService)
      ).toBeInstanceOf(RoleRepositoryService);
      expect(
        testingModule.get(PromptBuilderService)
      ).toBeInstanceOf(PromptBuilderService);
      expect(
        testingModule.get(TemplateRendererService)
      ).toBeInstanceOf(TemplateRendererService);
      expect(
        testingModule.get(ProcessRunnerService)
      ).toBeInstanceOf(ProcessRunnerService);
      expect(
        testingModule.get(SquadService)
      ).toBeInstanceOf(SquadService);
      expect(
        testingModule.get(McpCliCommand)
      ).toBeInstanceOf(McpCliCommand);
    });

    it(
      [
        'should inject the same SquadService and',
        'config instances into the CLI command'
      ].join(' '),
      () => {
        const cli = testingModule.get(McpCliCommand) as any;
        const squadService = testingModule.get(SquadService);
        const configService = testingModule.get(SquadConfigService);

        expect(cli.squadService).toBe(squadService);
        expect(cli.configService).toBe(configService);
      }
    );

    it(
      'should expose the exported SquadService to importing modules',
      async () => {
        const CONSUMER_TOKEN = 'CONSUMER_TOKEN';

        @Module({
          imports: [ AppModule ],
          providers: [
            {
              provide: CONSUMER_TOKEN,
              useFactory: (squad: SquadService) => squad,
              inject: [ SquadService ]
            }
          ],
          exports: [ CONSUMER_TOKEN ]
        })
        class ConsumerModule {}

        const consumerTestingModule = await Test.createTestingModule({
          imports: [ ConsumerModule ]
        }).compile();

        const consumerVisibleSquad =
          consumerTestingModule.get<SquadService>(CONSUMER_TOKEN);
        expect(consumerVisibleSquad).toBeInstanceOf(SquadService);

        await consumerTestingModule.close();
      }
    );
  });
});
