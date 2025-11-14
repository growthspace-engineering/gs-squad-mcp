import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/nest/app.module';
import { SquadService } from '@gs-squad-mcp/core/mcp';
import { SquadConfigService } from '@gs-squad-mcp/core/config';
import { RoleRepositoryService } from '@gs-squad-mcp/core/roles';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Squad MCP E2E', () => {
  let squadService: SquadService;
  let configService: SquadConfigService;
  let roleRepository: RoleRepositoryService;
  let testAgentsDir: string;
  let testTemplatesDir: string;
  let testWorkspace: string;

  beforeEach(async () => {
    testAgentsDir = join(tmpdir(), `test-agents-${Date.now()}`);
    testTemplatesDir = join(tmpdir(), `test-templates-${Date.now()}`);
    testWorkspace = join(tmpdir(), `test-workspace-${Date.now()}`);

    await mkdir(testAgentsDir, { recursive: true });
    await mkdir(testTemplatesDir, { recursive: true });
    await mkdir(testWorkspace, { recursive: true });

    await writeFile(
      join(testAgentsDir, 'test-role.md'),
      `---
name: Test Role
description: Test role description
---

Test role body content.
`
    );

    await writeFile(
      join(testTemplatesDir, 'run-agent.template'),
      'echo "<%= prompt %>"'
    );

    process.env.AGENTS_DIRECTORY_PATH = testAgentsDir;
    process.env.RUN_TEMPLATE_PATH = join(
      testTemplatesDir,
      'run-agent.template'
    );
    process.env.ENGINE_COMMAND = 'sh';
    process.env.STATE_MODE = 'stateless';
    process.env.PROCESS_TIMEOUT_MS = '5000';

    const module: TestingModule = await Test.createTestingModule({
      imports: [ AppModule ]
    }).compile();

    squadService = module.get<SquadService>(SquadService);
    configService = module.get<SquadConfigService>(SquadConfigService);
    roleRepository = module.get<RoleRepositoryService>(
      RoleRepositoryService
    );
  });

  afterEach(async () => {
    try {
      await rm(testAgentsDir, { recursive: true, force: true });
      await rm(testTemplatesDir, { recursive: true, force: true });
      await rm(testWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    delete process.env.AGENTS_DIRECTORY_PATH;
    delete process.env.RUN_TEMPLATE_PATH;
    delete process.env.ENGINE_COMMAND;
    delete process.env.STATE_MODE;
    delete process.env.PROCESS_TIMEOUT_MS;
  });

  it(
    'should create testing module and call SquadService directly',
    async () => {
      expect(squadService).toBeDefined();
      expect(configService).toBeDefined();
      expect(roleRepository).toBeDefined();
    }
  );

  it('listRoles returns something non-empty', async () => {
    const result = await squadService.listRoles();

    expect(result).toBeDefined();
    expect(result.roles).toBeDefined();
    expect(Array.isArray(result.roles)).toBe(true);
    expect(result.roles.length).toBeGreaterThan(0);
    expect(result.roles[0]).toHaveProperty('id');
    expect(result.roles[0]).toHaveProperty('name');
    expect(result.roles[0]).toHaveProperty(
      'description'
    );
  });

  it('stateless call spawns fake engine and returns output', async () => {
    process.chdir(testWorkspace);

    const result = await squadService.startSquadMembersStateless({
      members: [
        {
          roleId: 'test-role',
          task: 'Test task',
          cwd: testWorkspace
        }
      ]
    });

    expect(result.squadId).toBeDefined();
    expect(result.members).toHaveLength(1);
    expect(result.members[0].roleId).toBe('test-role');
    expect(result.members[0].status).toBeDefined();
    expect([ 'completed', 'error', 'timeout' ]).toContain(
      result.members[0].status
    ); // eslint-disable-line max-len
    expect(result.members[0].rawStdout).toBeDefined();
    expect(result.members[0].rawStderr).toBeDefined();
  });

  it('stateful call creates and reuses chatId', async () => {
    process.chdir(testWorkspace);

    await writeFile(
      join(testTemplatesDir, 'create-chat.template'),
      'echo chat-123'
    );

    process.env.CREATE_CHAT_TEMPLATE_PATH = join(
      testTemplatesDir,
      'create-chat.template'
    ); // eslint-disable-line max-len
    process.env.STATE_MODE = 'stateful';

    // Create new config service with updated env
    const module: TestingModule = await Test.createTestingModule({
      imports: [ AppModule ]
    }).compile();

    const statefulSquadService = module.get<SquadService>(SquadService);

    const result1 = await statefulSquadService.startSquadMembersStateful({
      members: [
        {
          roleId: 'test-role',
          task: 'Initial task'
        }
      ]
    });

    expect(result1.members[0].chatId).toBeDefined();
    expect(result1.members[0].chatId).toBe('chat-123');

    const chatId = result1.members[0].chatId;

    const result2 = await statefulSquadService.startSquadMembersStateful({
      members: [
        {
          roleId: 'test-role',
          task: 'Continue task',
          chatId
        }
      ]
    });

    expect(result2.members[0].chatId).toBe(chatId);
  }, 15000);
});

