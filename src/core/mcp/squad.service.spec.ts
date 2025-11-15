import { Test, TestingModule } from '@nestjs/testing';
import { SquadService } from '@gs-squad-mcp/core/mcp';
import { RoleRepositoryService } from '@gs-squad-mcp/core/roles';
import { PromptBuilderService } from '@gs-squad-mcp/core/prompt';
import { TemplateRendererService } from '@gs-squad-mcp/core/engine';
import { ProcessRunnerService } from '@gs-squad-mcp/core/engine';
import { SquadConfigService } from '@gs-squad-mcp/core/config';
import { IRoleDefinition } from '@gs-squad-mcp/core/roles';
import { SquadTelemetryService } from '../telemetry/squad-telemetry.service';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir, rm } from 'fs/promises';
import { render as ejsRender } from 'ejs';

jest.mock('fs/promises');

function defaultEjsRenderer(
  template: string,
  data: Record<string, unknown>
): string {
  return template.replace(
    /<%=\s*([\w.]+)\s*%>/g,
    (_match, key: string) => {
      const value = (data as Record<string, unknown>)[key];
      return value === undefined || value === null
        ? ''
        : String(value);
    }
  );
}

jest.mock('ejs', () => ({
  render: jest.fn(defaultEjsRenderer)
}));

const mockEjsRender = ejsRender as jest.MockedFunction<typeof ejsRender>;

describe('SquadService', () => {
  let service: SquadService;
  let roleRepository: jest.Mocked<RoleRepositoryService>;
  let promptBuilder: jest.Mocked<PromptBuilderService>;
  let templateRenderer: jest.Mocked<TemplateRendererService>;
  let processRunner: jest.Mocked<ProcessRunnerService>;
  let configService: jest.Mocked<SquadConfigService>;
  let testWorkspace: string;

  beforeEach(async () => {
    testWorkspace = join(tmpdir(), `test-workspace-${Date.now()}`);
    await mkdir(testWorkspace, { recursive: true });
    jest.spyOn(process, 'cwd').mockReturnValue(testWorkspace);
    mockEjsRender.mockClear();
    mockEjsRender.mockImplementation(defaultEjsRenderer);

    const mockTelemetry: jest.Mocked<SquadTelemetryService> = {
      ensureSession: jest.fn().mockResolvedValue('originator-1'),
      createSquad: jest.fn().mockResolvedValue({
        squadId: 'squad-test',
        originatorId: 'originator-1',
        label: 'test-squad',
        createdAt: new Date().toISOString()
      }),
      createAgent: jest.fn().mockResolvedValue({
        agentId: 'agent-1',
        squadId: 'squad-test',
        roleName: 'Test Role',
        status: 'starting',
        startedAt: new Date().toISOString()
      } as any),
      updateAgentStatus: jest.fn().mockResolvedValue(undefined)
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SquadService,
          useFactory: (
            rr: RoleRepositoryService,
            pb: PromptBuilderService,
            tr: TemplateRendererService,
            pr: ProcessRunnerService,
            sc: SquadConfigService
          ) => new SquadService(rr, pb, tr, pr, sc, mockTelemetry),
          inject: [
            RoleRepositoryService,
            PromptBuilderService,
            TemplateRendererService,
            ProcessRunnerService,
            SquadConfigService
          ]
        },
        {
          provide: RoleRepositoryService,
          useValue: {
            getAllRoles: jest.fn(),
            getRoleById: jest.fn()
          }
        },
        {
          provide: PromptBuilderService,
          useValue: {
            buildPromptStateless: jest.fn(),
            buildPromptStatefulNewChat: jest.fn(),
            buildPromptStatefulExistingChat: jest.fn()
          }
        },
        {
          provide: TemplateRendererService,
          useValue: {
            render: jest.fn()
          }
        },
        {
          provide: ProcessRunnerService,
          useValue: {
            runProcess: jest.fn()
          }
        },
        {
          provide: SquadConfigService,
          useValue: {
            getConfig: jest.fn()
          }
        }
      ]
    }).compile();

    service = module.get<SquadService>(SquadService);
    roleRepository = module.get(RoleRepositoryService);
    promptBuilder = module.get(PromptBuilderService);
    templateRenderer = module.get(TemplateRendererService);
    processRunner = module.get(ProcessRunnerService);
    configService = module.get(SquadConfigService);

    configService.getConfig.mockReturnValue({
      stateMode: 'stateless',
      engine: 'claude',
      executionMode: undefined,
      runTemplatePath: 'templates/run.template',
      createChatTemplatePath: 'templates/create-chat.template',
      agentsDirectoryPath: 'agents',
      processTimeoutMs: 5000,
      sequentialDelayMs: 0
    });
  });

  afterEach(async () => {
    try {
      await rm(testWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    jest.clearAllMocks();
    delete process.env.PROCESS_RUNNER_SERIALIZE;
  });

  describe('listRoles', () => {
    it('should return expected shape', async () => {
      const mockRoles: IRoleDefinition[] = [
        {
          id: 'frontend-developer',
          name: 'Frontend Developer',
          description: 'Frontend specialist',
          body: 'Role body'
        },
        {
          id: 'backend-developer',
          name: 'Backend Developer',
          description: 'Backend specialist',
          body: 'Role body'
        }
      ];

      roleRepository.getAllRoles.mockResolvedValue(mockRoles);

      const result = await service.listRoles();

      expect(result).toEqual({
        roles: [
          {
            id: 'frontend-developer',
            name: 'Frontend Developer',
            description: 'Frontend specialist'
          },
          {
            id: 'backend-developer',
            name: 'Backend Developer',
            description: 'Backend specialist'
          }
        ]
      });
    });

    it('should reflect updated agents', async () => {
      const initialRoles: IRoleDefinition[] = [
        {
          id: 'role1',
          name: 'Role 1',
          description: 'First role',
          body: 'Body'
        }
      ];

      const updatedRoles: IRoleDefinition[] = [
        ...initialRoles,
        {
          id: 'role2',
          name: 'Role 2',
          description: 'Second role',
          body: 'Body'
        }
      ];

      roleRepository.getAllRoles
        .mockResolvedValueOnce(initialRoles)
        .mockResolvedValueOnce(updatedRoles);

      const result1 = await service.listRoles();
      expect(result1.roles).toHaveLength(1);

      const result2 = await service.listRoles();
      expect(result2.roles).toHaveLength(2);
    });
  });

  describe('startSquadMembersStateless', () => {
    const mockRole: IRoleDefinition = {
      id: 'test-role',
      name: 'Test Role',
      description: 'Test description',
      body: 'Role body content'
    };

    beforeEach(() => {
      (readFile as jest.Mock).mockResolvedValue('--flag <%= prompt %>');
      roleRepository.getRoleById.mockResolvedValue(mockRole);
      promptBuilder.buildPromptStateless.mockReturnValue('Built prompt');
      templateRenderer.render.mockReturnValue([ '--flag', 'Built prompt' ]);
      processRunner.runProcess.mockResolvedValue({
        exitCode: 0,
        stdout: 'output',
        stderr: '',
        timedOut: false
      });
    });

    it('single member happy path', async () => {
      const payload = {
        members: [
          {
            roleId: 'test-role',
            task: 'Do something',
            cwd: 'subdir'
          }
        ]
      };

      const result = await service.startSquadMembersStateless(payload);

      expect(result.squadId).toMatch(/^squad-/);
      expect(result.members).toHaveLength(1);
      expect(result.members[0].roleId).toBe('test-role');
      expect(result.members[0].status).toBe('completed');
      expect(result.members[0].rawStdout).toBe('output');
      expect(roleRepository.getRoleById).toHaveBeenCalledWith('test-role');
      expect(promptBuilder.buildPromptStateless).toHaveBeenCalledWith(
        mockRole,
        'Do something'
      );
    });

    it('multiple members in one call', async () => {
      const payload = {
        members: [
          { roleId: 'test-role', task: 'Task 1' },
          { roleId: 'test-role', task: 'Task 2' }
        ]
      };

      const result = await service.startSquadMembersStateless(payload);

      expect(result.members).toHaveLength(2);
      expect(result.members[0].memberId).not.toBe(result.members[1].memberId);
      expect(result.members[0].memberId).toContain(result.squadId);
      expect(result.members[1].memberId).toContain(result.squadId);
    });

    it('serializes members when engine uses cursor-agent', async () => {
    configService.getConfig.mockReturnValue({
        stateMode: 'stateless',
      engine: 'cursor-agent',
      executionMode: undefined,
        runTemplatePath: 'templates/run.template',
        createChatTemplatePath: 'templates/create-chat.template',
        agentsDirectoryPath: 'agents',
        processTimeoutMs: 5000,
        sequentialDelayMs: 10
      });

      let concurrentExecutions = 0;
      let maxConcurrentExecutions = 0;
      processRunner.runProcess.mockImplementation(async () => {
        concurrentExecutions += 1;
        maxConcurrentExecutions = Math.max(
          maxConcurrentExecutions,
          concurrentExecutions
        );
        await new Promise((resolve) => setTimeout(resolve, 5));
        concurrentExecutions -= 1;
        return {
          exitCode: 0,
          stdout: 'output',
          stderr: '',
          timedOut: false
        };
      });

      const payload = {
        members: [
          { roleId: 'test-role', task: 'Task 1' },
          { roleId: 'test-role', task: 'Task 2' },
          { roleId: 'test-role', task: 'Task 3' }
        ]
      };

      await service.startSquadMembersStateless(payload);

      expect(processRunner.runProcess).toHaveBeenCalledTimes(3);
      expect(maxConcurrentExecutions).toBe(1);
      expect(concurrentExecutions).toBe(0);
    });

    it('missing role error handling', async () => {
      roleRepository.getRoleById.mockResolvedValue(null);

      const payload = {
        members: [
          {
            roleId: 'nonexistent-role',
            task: 'Task'
          }
        ]
      };

      await expect(
        service.startSquadMembersStateless(payload)
      ).rejects.toThrow('Role not found: nonexistent-role');
    });

    it('status mapping (exitCode/timeouts)', async () => {
      const payload = {
        members: [
          { roleId: 'test-role', task: 'Task' }
        ]
      };

      // Test completed status
      processRunner.runProcess.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'success',
        stderr: '',
        timedOut: false
      });

      const result1 = await service.startSquadMembersStateless(payload);
      expect(result1.members[0].status).toBe('completed');

      // Test error status
      processRunner.runProcess.mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'error',
        timedOut: false
      });

      const result2 = await service.startSquadMembersStateless(payload);
      expect(result2.members[0].status).toBe('error');

      // Test timeout status
      processRunner.runProcess.mockResolvedValueOnce({
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: true
      });

      const result3 =
        await service.startSquadMembersStateless(payload);
      expect(result3.members[0].status).toBe('timeout');
    });

    it('escapes prompts with shell metacharacters', async () => {
      const payload = {
        members: [
          { roleId: 'test-role', task: 'Dangerous task' }
        ]
      };
      const rawPrompt = 'line1\r\nline2\\path$VAR`"';
      promptBuilder.buildPromptStateless.mockReturnValue(rawPrompt);
      (readFile as jest.Mock).mockResolvedValue('<%= prompt %>');

      await service.startSquadMembersStateless(payload);

      const executedCommand =
        processRunner.runProcess.mock.calls[0][0];
      expect(executedCommand).toContain('\\n');
      expect(executedCommand).toContain('\\\\path');
      expect(executedCommand).toContain('\\$VAR');
      expect(executedCommand).toContain('\\`');
      expect(executedCommand).toContain('\\"');
      expect(executedCommand).not.toContain('\r');
    });

    it('throws when run template rendering fails', async () => {
      mockEjsRender.mockImplementationOnce(() => {
        throw new Error('render blew up');
      });

      await expect(
        service.startSquadMembersStateless({
          members: [
            { roleId: 'test-role', task: 'Task' }
          ]
        })
      ).rejects.toThrow(
        'Failed to render template templates/run.template: render blew up'
      );
    });

    it('throws when run template renders to empty command', async () => {
      mockEjsRender.mockReturnValueOnce('   ');

      await expect(
        service.startSquadMembersStateless({
          members: [
            { roleId: 'test-role', task: 'Task' }
          ]
        })
      ).rejects.toThrow(
        'Template templates/run.template rendered to empty command'
      );
    });

    it(
      'forces sequential execution when PROCESS_RUNNER_SERIALIZE=true',
      async () => {
        process.env.PROCESS_RUNNER_SERIALIZE = 'true';
        const payload = {
          members: [
            { roleId: 'test-role', task: 'Task 1' },
            { roleId: 'test-role', task: 'Task 2' },
            { roleId: 'test-role', task: 'Task 3' }
          ]
        };

        let concurrentExecutions = 0;
        let maxConcurrentExecutions = 0;
        processRunner.runProcess.mockImplementation(async () => {
          concurrentExecutions += 1;
          maxConcurrentExecutions = Math.max(
            maxConcurrentExecutions,
            concurrentExecutions
          );
          await new Promise((resolve) => setTimeout(resolve, 5));
          concurrentExecutions -= 1;
          return {
            exitCode: 0,
            stdout: 'output',
            stderr: '',
            timedOut: false
          };
        });

        await service.startSquadMembersStateless(payload);

        expect(maxConcurrentExecutions).toBe(1);
      }
    );

    it(
      'forces parallel execution when PROCESS_RUNNER_SERIALIZE=false',
      async () => {
        process.env.PROCESS_RUNNER_SERIALIZE = 'false';
        configService.getConfig.mockReturnValue({
          stateMode: 'stateless',
          engine: 'cursor-agent',
          executionMode: undefined,
          runTemplatePath: 'templates/run.template',
          createChatTemplatePath: 'templates/create-chat.template',
          agentsDirectoryPath: 'agents',
          processTimeoutMs: 5000,
          sequentialDelayMs: 0
        });

        let concurrentExecutions = 0;
        let maxConcurrentExecutions = 0;
        processRunner.runProcess.mockImplementation(async () => {
          concurrentExecutions += 1;
          maxConcurrentExecutions = Math.max(
            maxConcurrentExecutions,
            concurrentExecutions
          );
          await new Promise((resolve) => setTimeout(resolve, 5));
          concurrentExecutions -= 1;
          return {
            exitCode: 0,
            stdout: 'output',
            stderr: '',
            timedOut: false
          };
        });

        await service.startSquadMembersStateless({
          members: [
            { roleId: 'test-role', task: 'Task 1' },
            { roleId: 'test-role', task: 'Task 2' },
            { roleId: 'test-role', task: 'Task 3' }
          ]
        });

        expect(maxConcurrentExecutions).toBeGreaterThan(1);
      }
    );

    it('propagates process runner errors', async () => {
      processRunner.runProcess.mockRejectedValue(
        new Error('process failed')
      );

      await expect(
        service.startSquadMembersStateless({
          members: [
            { roleId: 'test-role', task: 'Task' }
          ]
        })
      ).rejects.toThrow('process failed');
    });

    it('prefers timeout status even if exit code is zero', async () => {
      processRunner.runProcess.mockResolvedValueOnce({
        exitCode: 0,
        stdout: '',
        stderr: '',
        timedOut: true
      });

      const result = await service.startSquadMembersStateless({
        members: [
          { roleId: 'test-role', task: 'Task' }
        ]
      });

      expect(result.members[0].status).toBe('timeout');
    });
  });

  describe('startSquadMembersStateful', () => {
    const mockRole: IRoleDefinition = {
      id: 'test-role',
      name: 'Test Role',
      description: 'Test description',
      body: 'Role body content'
    };

    beforeEach(() => {
      (readFile as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('create-chat')) {
          return Promise.resolve('create-chat-template');
        }
        return Promise.resolve('--flag <%= prompt %>');
      });
      roleRepository.getRoleById.mockResolvedValue(mockRole);
      promptBuilder.buildPromptStatefulNewChat.mockReturnValue(
        'New chat prompt'
      );
      promptBuilder.buildPromptStatefulExistingChat.mockReturnValue(
        'Existing chat prompt'
      );
      templateRenderer.render.mockReturnValue([ '--flag', 'prompt' ]);
    });

    it('new chat returns chatId', async () => {
      processRunner.runProcess
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'chat-123\n',
          stderr: '',
          timedOut: false
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'task output',
          stderr: '',
          timedOut: false
        });

      const payload = {
        members: [
          {
            roleId: 'test-role',
            task: 'Initial task'
          }
        ]
      };

      const result = await service.startSquadMembersStateful(payload);

      expect(result.members[0].chatId).toBe('chat-123');
      expect(promptBuilder.buildPromptStatefulNewChat).toHaveBeenCalled();
      expect(processRunner.runProcess).toHaveBeenCalledTimes(2);
    });

    it('errors when create-chat template renders empty command', async () => {
      mockEjsRender.mockReturnValueOnce('   ');

      await expect(
        service.startSquadMembersStateful({
          members: [
            { roleId: 'test-role', task: 'Task' }
          ]
        })
      ).rejects.toThrow([
        'Create-chat template templates/create-chat.template',
        'rendered to empty command'
      ].join(' '));
    });

    it('existing chat reuses chatId', async () => {
      processRunner.runProcess.mockResolvedValue({
        exitCode: 0,
        stdout: 'task output',
        stderr: '',
        timedOut: false
      });

      const payload = {
        members: [
          {
            roleId: 'test-role',
            task: 'Continue task',
            chatId: 'existing-chat-456'
          }
        ]
      };

      const result = await service.startSquadMembersStateful(payload);

      expect(result.members[0].chatId).toBe('existing-chat-456');
      expect(
        promptBuilder.buildPromptStatefulExistingChat
      ).toHaveBeenCalled(); // eslint-disable-line max-len
      expect(processRunner.runProcess).toHaveBeenCalledTimes(1);
    });

    it('failure in create-chat handled gracefully', async () => {
      processRunner.runProcess.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'Failed to create chat',
        timedOut: false
      });

      const payload = {
        members: [
          {
            roleId: 'test-role',
            task: 'Task'
          }
        ]
      };

      await expect(
        service.startSquadMembersStateful(payload)
      ).rejects.toThrow('Failed to create chat');
    });

    it('role not found throws error', async () => {
      roleRepository.getRoleById.mockResolvedValue(null);

      const payload = {
        members: [
          {
            roleId: 'nonexistent-role',
            task: 'Task'
          }
        ]
      };

      await expect(
        service.startSquadMembersStateful(payload)
      ).rejects.toThrow('Role not found: nonexistent-role');
    });

    it('empty chatId from create-chat throws error', async () => {
      processRunner.runProcess.mockResolvedValueOnce({
        exitCode: 0,
        stdout: '   \n\t  ',
        stderr: '',
        timedOut: false
      });

      const payload = {
        members: [
          {
            roleId: 'test-role',
            task: 'Task'
          }
        ]
      };

      await expect(
        service.startSquadMembersStateful(payload)
      ).rejects.toThrow(
        'Failed to extract chatId from create-chat output'
      );
    });

    it('throws when create-chat template rendering fails', async () => {
      mockEjsRender.mockImplementationOnce(() => {
        throw new Error('bad template');
      });

      await expect(
        service.startSquadMembersStateful({
          members: [
            { roleId: 'test-role', task: 'Task' }
          ]
        })
      ).rejects.toThrow([
        'Failed to render create-chat template',
        'templates/create-chat.template: bad template'
      ].join(' '));
    });

    it('throws when run template renders empty string', async () => {
      processRunner.runProcess
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'chat-1',
          stderr: '',
          timedOut: false
        });
      mockEjsRender
        .mockImplementationOnce(defaultEjsRenderer)
        .mockReturnValueOnce('   ');

      await expect(
        service.startSquadMembersStateful({
          members: [
            { roleId: 'test-role', task: 'Task' }
          ]
        })
      ).rejects.toThrow(
        'Template templates/run.template rendered to empty command'
      );
    });

    it('treats empty chatId input as request for new chat', async () => {
      processRunner.runProcess
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'chat-xyz',
          stderr: '',
          timedOut: false
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'result',
          stderr: '',
          timedOut: false
        });

      const result = await service.startSquadMembersStateful({
        members: [
          { roleId: 'test-role', task: 'Task', chatId: '' }
        ]
      });

      expect(result.members[0].chatId).toBe('chat-xyz');
      expect(processRunner.runProcess).toHaveBeenCalledTimes(2);
      expect(
        promptBuilder.buildPromptStatefulNewChat
      ).toHaveBeenCalled();
      expect(
        promptBuilder.buildPromptStatefulExistingChat
      ).not.toHaveBeenCalled();
    });

    it('throws when run template rendering fails', async () => {
      processRunner.runProcess.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'chat-1',
        stderr: '',
        timedOut: false
      });
      mockEjsRender
        .mockImplementationOnce(defaultEjsRenderer)
        .mockImplementationOnce(() => {
          throw new Error('render boom');
        });

      await expect(
        service.startSquadMembersStateful({
          members: [
            { roleId: 'test-role', task: 'Task' }
          ]
        })
      ).rejects.toThrow(
        'Failed to render template templates/run.template: render boom'
      );
    });

    it('propagates errors from run command execution', async () => {
      processRunner.runProcess
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'chat-abc',
          stderr: '',
          timedOut: false
        })
        .mockRejectedValueOnce(new Error('run failed'));

      await expect(
        service.startSquadMembersStateful({
          members: [
            { roleId: 'test-role', task: 'Task' }
          ]
        })
      ).rejects.toThrow('run failed');
    });

    it(
      'sets timeout status even when exit code indicates success',
      async () => {
        processRunner.runProcess
          .mockResolvedValueOnce({
            exitCode: 0,
            stdout: 'chat-abc',
            stderr: '',
            timedOut: false
          })
          .mockResolvedValueOnce({
            exitCode: 0,
            stdout: 'output',
            stderr: '',
            timedOut: true
          });

        const result = await service.startSquadMembersStateful({
          members: [
            { roleId: 'test-role', task: 'Task' }
          ]
        });

        expect(result.members[0].status).toBe('timeout');
      }
    );

    it(
      'serializes stateful members when executionMode requests sequential',
      async () => {
        configService.getConfig.mockReturnValue({
          stateMode: 'stateful',
          engine: 'claude',
          executionMode: 'sequential',
          runTemplatePath: 'templates/run.template',
          createChatTemplatePath: 'templates/create-chat.template',
          agentsDirectoryPath: 'agents',
          processTimeoutMs: 5000,
          sequentialDelayMs: 1
        });
        processRunner.runProcess.mockResolvedValue({
          exitCode: 0,
          stdout: 'chat-abc',
          stderr: '',
          timedOut: false
        });

        let concurrentExecutions = 0;
        let maxConcurrentExecutions = 0;
        processRunner.runProcess.mockImplementation(async () => {
          concurrentExecutions += 1;
          maxConcurrentExecutions = Math.max(
            maxConcurrentExecutions,
            concurrentExecutions
          );
          await new Promise((resolve) => setTimeout(resolve, 2));
          concurrentExecutions -= 1;
          return {
            exitCode: 0,
            stdout: 'chat-abc',
            stderr: '',
            timedOut: false
          };
        });

        await service.startSquadMembersStateful({
          members: [
            { roleId: 'test-role', task: 'Task 1' },
            { roleId: 'test-role', task: 'Task 2' }
          ]
        });

        expect(maxConcurrentExecutions).toBe(1);
      }
    );

    it(
      'runs stateful members in parallel when executionMode=parallel',
      async () => {
        configService.getConfig.mockReturnValue({
          stateMode: 'stateful',
          engine: 'cursor-agent',
          executionMode: 'parallel',
          runTemplatePath: 'templates/run.template',
          createChatTemplatePath: 'templates/create-chat.template',
          agentsDirectoryPath: 'agents',
          processTimeoutMs: 5000,
          sequentialDelayMs: 5
        });
        processRunner.runProcess.mockResolvedValue({
          exitCode: 0,
          stdout: 'chat-abc',
          stderr: '',
          timedOut: false
        });

        let concurrentExecutions = 0;
        let maxConcurrentExecutions = 0;
        processRunner.runProcess.mockImplementation(async () => {
          concurrentExecutions += 1;
          maxConcurrentExecutions = Math.max(
            maxConcurrentExecutions,
            concurrentExecutions
          );
          await new Promise((resolve) => setTimeout(resolve, 2));
          concurrentExecutions -= 1;
          return {
            exitCode: 0,
            stdout: 'chat-abc',
            stderr: '',
            timedOut: false
          };
        });

        await service.startSquadMembersStateful({
          members: [
            { roleId: 'test-role', task: 'Task 1' },
            { roleId: 'test-role', task: 'Task 2' },
            { roleId: 'test-role', task: 'Task 3' }
          ]
        });

        expect(maxConcurrentExecutions).toBeGreaterThan(1);
      }
    );
  });

  describe('escapePromptForShell', () => {
    it('handles various whitespace and control characters', () => {
      const rawPrompt = 'line1\r\nline2\\path$VAR`"';
      const escaped = (
        service as unknown as { escapePromptForShell(prompt: string): string }
      ).escapePromptForShell(rawPrompt);

      expect(escaped).toBe(
        String.raw`line1\nline2\\path\$VAR\`\"`
      );
    });
  });
});
