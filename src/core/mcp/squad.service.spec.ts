import { Test, TestingModule } from '@nestjs/testing';
import { SquadService } from '@gs-squad-mcp/core/mcp';
import { RoleRepositoryService } from '@gs-squad-mcp/core/roles';
import { PromptBuilderService } from '@gs-squad-mcp/core/prompt';
import { TemplateRendererService } from '@gs-squad-mcp/core/engine';
import { ProcessRunnerService } from '@gs-squad-mcp/core/engine';
import { SquadConfigService } from '@gs-squad-mcp/core/config';
import { IRoleDefinition } from '@gs-squad-mcp/core/roles';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir, rm } from 'fs/promises';

jest.mock('fs/promises');

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SquadService,
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
      engineCommand: 'test-engine',
      runTemplatePath: 'templates/run.template',
      createChatTemplatePath: 'templates/create-chat.template',
      agentsDirectoryPath: 'agents',
      processTimeoutMs: 5000
    });
  });

  afterEach(async () => {
    try {
      await rm(testWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    jest.clearAllMocks();
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
  });
});
