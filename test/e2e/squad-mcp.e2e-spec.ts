import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/nest/app.module';
import { SquadService } from '@gs-squad-mcp/core/mcp';
import { SquadConfigService } from '@gs-squad-mcp/core/config';
import { RoleRepositoryService } from '@gs-squad-mcp/core/roles';
import {
  TemplateRendererService,
  ProcessRunnerService
} from '@gs-squad-mcp/core/engine';
import { McpCliCommand } from '@gs-squad-mcp/cli';
import { mkdir, writeFile, rm, access, realpath } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import readline from 'readline';

const originalCwd = process.cwd();

describe('Squad MCP E2E', () => {
  let squadService: SquadService;
  let configService: SquadConfigService;
  let roleRepository: RoleRepositoryService;
  let mcpCliCommand: McpCliCommand;
  let templateRenderer: TemplateRendererService;
  let testAgentsDir: string;
  let testTemplatesDir: string;
  let testWorkspace: string;
  let runTemplatePath: string;
  let testingModules: TestingModule[] = [];

  interface ICliHarness {
    emitLine(line: string): Promise<void>;
    triggerClose(): void;
    stdoutSpy: jest.SpyInstance;
    exitSpy: jest.SpyInstance;
    restore(): void;
  }

  const setupCliHarness = async (
    command: McpCliCommand
  ): Promise<ICliHarness> => {
    const handlers: Record<string, (...args: unknown[]) => unknown> = {};
    const mockReadline = {
      on: jest.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        handlers[event] = handler;
        return mockReadline;
      }),
      close: jest.fn()
    } as unknown as readline.Interface & {
      on: jest.Mock;
      close: jest.Mock;
    };

    const originalCreateInterface = readline.createInterface;
    const createInterfaceMock: jest.MockedFunction<
      typeof originalCreateInterface
    > = jest.fn().mockReturnValue(mockReadline);
    (readline as unknown as {
      createInterface: typeof originalCreateInterface;
    }).createInterface = createInterfaceMock;
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    const runPromise = command.run();
    void runPromise;
    await Promise.resolve();

    return {
      emitLine: async (line: string) => {
        const handler = handlers.line;
        if (!handler) {
          throw new Error('Line handler not registered');
        }
        const result = handler(line);
        await Promise.resolve(result);
      },
      triggerClose: () => {
        const handler = handlers.close;
        if (handler) {
          handler();
        }
      },
      stdoutSpy,
      exitSpy,
      restore: () => {
        (readline as unknown as {
          createInterface: typeof originalCreateInterface;
        }).createInterface = originalCreateInterface;
        stdoutSpy.mockRestore();
        exitSpy.mockRestore();
      }
    };
  };

  const emitJsonRpcLine = async (
    harness: ICliHarness,
    payload: Record<string, unknown>
  ): Promise<void> => {
    await harness.emitLine(JSON.stringify(payload));
  };

  const readLastResponse = (stdoutSpy: jest.SpyInstance) => {
    const calls = stdoutSpy.mock.calls;
    if (calls.length === 0) {
      throw new Error('No stdout writes recorded');
    }
    return JSON.parse(calls[calls.length - 1][0] as string);
  };
  const defaultRenderPrompt = 'Render template coverage prompt';

  const buildTemplateContext = (
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> => ({
    prompt: defaultRenderPrompt,
    cwd: testWorkspace,
    roleId: 'test-role',
    task: 'Template renderer edge cases',
    chatId: undefined,
    ...overrides
  });

  const writeRunTemplate = async (content: string) => {
    if (!runTemplatePath) {
      throw new Error('runTemplatePath not initialized');
    }
    await writeFile(runTemplatePath, content);
  };

  const renderRunTemplate = async (
    templateBody: string,
    overrides: Record<string, unknown> = {}
  ): Promise<string[]> => {
    await writeRunTemplate(templateBody);
    return templateRenderer.render(
      templateBody,
      buildTemplateContext(overrides)
    );
  };

  const rebuildTestingModule = async (): Promise<TestingModule> => {
    const moduleRef = await Test.createTestingModule({
      imports: [ AppModule ]
    }).compile();

    testingModules.push(moduleRef);
    squadService = moduleRef.get<SquadService>(SquadService);
    configService = moduleRef.get<SquadConfigService>(SquadConfigService);
    roleRepository = moduleRef.get<RoleRepositoryService>(
      RoleRepositoryService
    );
    mcpCliCommand = moduleRef.get<McpCliCommand>(McpCliCommand);
    templateRenderer = moduleRef.get<TemplateRendererService>(
      TemplateRendererService
    );
    return moduleRef;
  };

  interface IStatefulSetupOptions {
    createChatTemplateContent?: string;
    runTemplateContent?: string;
    executionMode?: 'sequential' | 'parallel';
    sequentialDelayMs?: number;
  }

  const writeCreateChatTemplate = async (
    content: string
  ): Promise<string> => {
    const uniqueSuffix = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const templatePath = join(
      testTemplatesDir,
      `create-chat-${uniqueSuffix}.template`
    );
    await writeFile(templatePath, content);
    return templatePath;
  };

  const setupStatefulSquadService = async (
    options: IStatefulSetupOptions = {}
  ): Promise<{
    moduleRef: TestingModule;
    service: SquadService;
    createChatTemplatePath: string;
  }> => {
    if (options.runTemplateContent) {
      await writeRunTemplate(options.runTemplateContent);
    }

    const createChatTemplatePath = await writeCreateChatTemplate(
      options.createChatTemplateContent ||
        'printf "chat-<%= generatedUuid %>"'
    );

    process.env.CREATE_CHAT_TEMPLATE_PATH = createChatTemplatePath;
    process.env.STATE_MODE = 'stateful';
    process.env.EXECUTION_MODE =
      options.executionMode ||
      process.env.EXECUTION_MODE ||
      'parallel';

    if (options.sequentialDelayMs !== undefined) {
      process.env.SEQUENTIAL_DELAY_MS = options.sequentialDelayMs.toString();
    }

    const moduleRef = await rebuildTestingModule();
    const service = moduleRef.get<SquadService>(SquadService);

    return { moduleRef, service, createChatTemplatePath };
  };

  beforeEach(async () => {
    testingModules = [];
    testAgentsDir = join(tmpdir(), `test-agents-${Date.now()}`);
    testTemplatesDir = join(tmpdir(), `test-templates-${Date.now()}`);
    testWorkspace = join(tmpdir(), `test-workspace-${Date.now()}`);
    runTemplatePath = join(testTemplatesDir, 'run-agent.template');

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

    await writeRunTemplate('echo "<%= prompt %>"');

    process.env.AGENTS_DIRECTORY_PATH = testAgentsDir;
    process.env.RUN_TEMPLATE_PATH = runTemplatePath;
    process.env.EXECUTION_MODE = 'parallel';
    process.env.STATE_MODE = 'stateless';
    process.env.PROCESS_TIMEOUT_MS = '5000';
    process.env.SEQUENTIAL_DELAY_MS = '0';

    await rebuildTestingModule();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await Promise.all(
      testingModules.map(async (moduleRef) => {
        await moduleRef.close();
      })
    );
    testingModules = [];

    try {
      await rm(testAgentsDir, { recursive: true, force: true });
      await rm(testTemplatesDir, { recursive: true, force: true });
      await rm(testWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    delete process.env.AGENTS_DIRECTORY_PATH;
    delete process.env.RUN_TEMPLATE_PATH;
    delete process.env.EXECUTION_MODE;
    delete process.env.STATE_MODE;
    delete process.env.PROCESS_TIMEOUT_MS;
    delete process.env.SEQUENTIAL_DELAY_MS;
    delete process.env.PROCESS_RUNNER_SERIALIZE;
    delete process.env.CREATE_CHAT_TEMPLATE_PATH;
    delete process.env.PROCESS_RUNNER_DEBUG;
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

  it(
    'stateless sequential execution honors configured delay between members',
    async () => {
      const delayMs = 250;
      process.env.EXECUTION_MODE = 'sequential';
      process.env.SEQUENTIAL_DELAY_MS = delayMs.toString();
      await rebuildTestingModule();
      await writeRunTemplate('node -e "console.log(\'fast\')"');
      process.chdir(testWorkspace);

      const start = Date.now();
      const result = await squadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'test-role',
            task: 'First sequential task'
          },
          {
            roleId: 'test-role',
            task: 'Second sequential task'
          }
        ]
      });
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(Math.max(0, delayMs - 20));
      expect(result.members).toHaveLength(2);
      result.members.forEach((member) => {
        expect(member.status).toBe('completed');
      });
    }
  );

  it('stateless members run in parallel by default', async () => {
    await writeRunTemplate(
      'node -e "setTimeout(() => { console.log(\'done\'); }, 300)"'
    );
    process.chdir(testWorkspace);

    const start = Date.now();
    const result = await squadService.startSquadMembersStateless({
      members: [
        {
          roleId: 'test-role',
          task: 'Parallel task A'
        },
        {
          roleId: 'test-role',
          task: 'Parallel task B'
        }
      ]
    });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(520);
    expect(duration).toBeGreaterThanOrEqual(250);
    expect(result.members).toHaveLength(2);
    result.members.forEach((member) => {
      expect(member.status).toBe('completed');
    });
  });

  it(
    'env override forces serialization regardless of configured execution mode',
    async () => {
      await writeRunTemplate(
        'node -e "setTimeout(() => { console.log(\'serialized\'); }, 200)"'
      );
      process.chdir(testWorkspace);
      process.env.PROCESS_RUNNER_SERIALIZE = 'true';

      const start = Date.now();
      const result = await squadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'test-role',
            task: 'First forced-serial task'
          },
          {
            roleId: 'test-role',
            task: 'Second forced-serial task'
          }
        ]
      });
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(350);
      expect(result.members).toHaveLength(2);
      result.members.forEach((member) => {
        expect(member.status).toBe('completed');
      });
    }
  );

  it('resolves relative cwd paths under the workspace root', async () => {
    await writeRunTemplate('pwd');
    const nestedDir = join(testWorkspace, 'nested', 'dir');
    await mkdir(nestedDir, { recursive: true });
    process.chdir(testWorkspace);

    const result = await squadService.startSquadMembersStateless({
      members: [
        {
          roleId: 'test-role',
          task: 'Report CWD',
          cwd: './nested/dir'
        }
      ]
    });

    const resolvedNestedDir = await realpath(nestedDir);

    expect(result.members[0].cwd).toBe('./nested/dir');
    expect(result.members[0].rawStdout.trim()).toBe(resolvedNestedDir);
    expect(result.members[0].status).toBe('completed');
  });

  it('validates missing roles before stateless execution', async () => {
    process.chdir(testWorkspace);

    await expect(
      squadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'missing-role',
            task: 'Should not run'
          }
        ]
      })
    ).rejects.toThrow('Role not found: missing-role');
  });

  it('escapes prompts with special characters before templating', async () => {
    await writeRunTemplate(
      'node -e "process.stdout.write(process.argv[1])" "<%- prompt %>"'
    );
    process.chdir(testWorkspace);
    const specialTask =
      'Use $HOME and "$(echo hi)" and `danger`\nSecond line';

    const result = await squadService.startSquadMembersStateless({
      members: [
        {
          roleId: 'test-role',
          task: specialTask
        }
      ]
    });

    const stdout = result.members[0].rawStdout;
    const normalizedTask = specialTask.replace(/\n/g, '\\n');

    expect(stdout).toContain('$HOME');
    expect(stdout).toContain('"$(echo hi)"');
    expect(stdout).toContain('`danger`');
    expect(stdout).toContain(normalizedTask);
    expect(stdout).toContain('\\nSecond line');
    expect(result.members[0].status).toBe('completed');
  });

  it('surfacing run template render errors for stateless members', async () => {
    await writeRunTemplate('echo "<%= missing.prop %>"');
    process.chdir(testWorkspace);

    await expect(
      squadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'test-role',
            task: 'Render should fail'
          }
        ]
      })
    ).rejects.toThrow(
      new RegExp(`Failed to render template ${runTemplatePath.replace(
        /[-/\\^$*+?.()|[\]{}]/g,
        '\\$&'
      )}`)
    );
  });

  it('throws when the run template renders an empty command', async () => {
    await writeRunTemplate('   ');
    process.chdir(testWorkspace);

    await expect(
      squadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'test-role',
            task: 'Empty template should fail'
          }
        ]
      })
    ).rejects.toThrow('rendered to empty command');
  });

  it(
    'marks member as timeout when process exceeds configured limit',
    async () => {
      process.env.PROCESS_TIMEOUT_MS = '200';
      await rebuildTestingModule();
      await writeRunTemplate(
        'node -e "setTimeout(() => { console.log(\'slow\'); }, 1000)"'
      );
      process.chdir(testWorkspace);

      const result = await squadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'test-role',
            task: 'Should timeout'
          }
        ]
      });

      expect(result.members[0].status).toBe('timeout');
    }
  );

  it(
    'captures stderr when the run command exits with non-zero code',
    async () => {
      await writeRunTemplate(
        'node -e "console.error(\'boom\'); process.exit(2)"'
      );
      process.chdir(testWorkspace);

      const result = await squadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'test-role',
            task: 'Should fail with non-zero exit'
          }
        ]
      });

      expect(result.members[0].status).toBe('error');
      expect(result.members[0].rawStderr).toContain('boom');
    }
  );

  describe('ProcessRunnerService behaviors', () => {
    beforeEach(() => {
      process.chdir(testWorkspace);
    });

    const startStatelessMember = async (
      overrides: Partial<{
        task: string;
        cwd: string;
      }> = {}
    ) => {
      const result = await squadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'test-role',
            task: overrides.task ?? 'Process runner scenario',
            cwd: overrides.cwd ?? testWorkspace
          }
        ]
      });

      return result.members[0];
    };

    it('executes commands with explicit arguments', async () => {
      await writeRunTemplate([
        'node -e "console.log(process.argv.slice(1).join(\',\'))"',
        'first second "third arg"'
      ].join(' '));

      const member = await startStatelessMember();

      expect(member.status).toBe('completed');
      expect(member.rawStdout.trim()).toBe('first,second,third arg');
      expect(member.rawStderr).toBe('');
    });

    it('logs debug output when PROCESS_RUNNER_DEBUG is enabled', async () => {
      await writeRunTemplate('echo "debug run"');
      const originalDebug = process.env.PROCESS_RUNNER_DEBUG;
      process.env.PROCESS_RUNNER_DEBUG = 'true';
      const consoleSpy = jest
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      try {
        await startStatelessMember();
        const debugCall = consoleSpy.mock.calls.find(
          ([ message ]) =>
            typeof message === 'string' &&
            message.includes('[ProcessRunner] spawn command=')
        );

        expect(debugCall).toBeDefined();
        expect(debugCall?.[0]).toContain('command="echo "debug run""');
        expect(debugCall?.[0]).toContain(`cwd="${testWorkspace}"`);
      } finally {
        consoleSpy.mockRestore();
        if (originalDebug === undefined) {
          delete process.env.PROCESS_RUNNER_DEBUG;
        } else {
          process.env.PROCESS_RUNNER_DEBUG = originalDebug;
        }
      }
    });

    it('collects stdout and stderr output separately', async () => {
      await writeRunTemplate(
        'node -e "console.log(\'stdout\'); console.error(\'stderr\');"'
      );

      const member = await startStatelessMember();

      expect(member.status).toBe('completed');
      expect(member.rawStdout.trim()).toBe('stdout');
      expect(member.rawStderr.trim()).toBe('stderr');
    });

    it('terminates commands that exceed the configured timeout', async () => {
      process.env.PROCESS_TIMEOUT_MS = '100';
      await rebuildTestingModule();
      await writeRunTemplate([
        'node -e "console.log(\'begin\');',
        'setTimeout(() => console.log(\'finished\'), 1000);"'
      ].join(' '));

      const member = await startStatelessMember();

      expect(member.status).toBe('timeout');
      expect(member.rawStdout).toContain('begin');
      expect(member.rawStdout).not.toContain('finished');
    }, 10000);

    it('handles child process error events as member errors', async () => {
      await writeRunTemplate('echo "should not run"');
      const member = await startStatelessMember({
        cwd: './missing-dir'
      });

      expect(member.status).toBe('error');
      expect(member.rawStdout).toBe('');
      expect(member.rawStderr).toBe('');
    });

    it('reports non-zero exit codes even when stdout is present', async () => {
      await writeRunTemplate(
        'node -e "console.log(\'partial\'); process.exit(5);"'
      );

      const member = await startStatelessMember();

      expect(member.status).toBe('error');
      expect(member.rawStdout.trim()).toBe('partial');
    });

    it('closes stdin so commands waiting for EOF can complete', async () => {
      await writeRunTemplate([
        'node -e "process.stdin.resume();',
        'process.stdin.on(\'end\',',
        '()=>{console.log(\'stdin closed\');process.exit(0);}); ',
        'setTimeout(',
        '()=>{console.error(\'stdin stuck\');process.exit(1);},',
        '1000);"'
      ].join(''));

      const member = await startStatelessMember();

      expect(member.status).toBe('completed');
      expect(member.rawStdout).toContain('stdin closed');
      expect(member.rawStderr).toBe('');
    });

    it('captures large stdout output without truncation', async () => {
      const largeSize = 200000;
      await writeRunTemplate(
        `node -e "process.stdout.write('A'.repeat(${largeSize}));"`
      );

      const member = await startStatelessMember();

      expect(member.status).toBe('completed');
      expect(member.rawStdout.length).toBe(largeSize);
      expect(member.rawStderr).toBe('');
    });
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

    const statefulModule = await rebuildTestingModule();
    const statefulSquadService = statefulModule.get<SquadService>(SquadService);

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

  describe('SquadService stateful execution edge cases', () => {
    it(
      'stateful member creates chat with UUID substitution',
      async () => {
        process.chdir(testWorkspace);

        const { service } = await setupStatefulSquadService({
          createChatTemplateContent:
            'printf "chat-<%= generatedUuid %>"'
        });

        const result = await service.startSquadMembersStateful({
          members: [
            {
              roleId: 'test-role',
              task: 'Generate chat handle'
            }
          ]
        });

        expect(result.members).toHaveLength(1);
        expect(result.members[0].chatId).toMatch(
          /^chat-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );
      },
      15000
    );

    it(
      'stateful create-chat render failure surfaces template error',
      async () => {
        process.chdir(testWorkspace);

        const {
          service,
          createChatTemplatePath
        } = await setupStatefulSquadService({
          createChatTemplateContent: 'printf "<%= invalid.prop %>"'
        });

        await expect(
          service.startSquadMembersStateful({
            members: [
              {
                roleId: 'test-role',
                task: 'Trigger create-chat render failure'
              }
            ]
          })
        ).rejects.toThrow(
          `Failed to render create-chat template ${
            createChatTemplatePath
          }`
        );
      },
      15000
    );

    it(
      'stateful create-chat empty output rejects cleanly',
      async () => {
        process.chdir(testWorkspace);

        const { service } = await setupStatefulSquadService({
          createChatTemplateContent: 'node -e "process.exit(0)"'
        });

        await expect(
          service.startSquadMembersStateful({
            members: [
              {
                roleId: 'test-role',
                task: 'Expect missing chat output'
              }
            ]
          })
        ).rejects.toThrow(
          'Failed to extract chatId from create-chat output'
        );
      },
      15000
    );

    it(
      'stateful create-chat process failure propagates stderr',
      async () => {
        process.chdir(testWorkspace);

        const { service } = await setupStatefulSquadService({
          createChatTemplateContent:
            [
              'node -e "process.stderr.write(\'creation failed\');',
              'process.exit(1)"'
            ].join(' ')
        });

        await expect(
          service.startSquadMembersStateful({
            members: [
              {
                roleId: 'test-role',
                task: 'Expect chat creation failure'
              }
            ]
          })
        ).rejects.toThrow('Failed to create chat: creation failed');
      },
      15000
    );

    it(
      'stateful create-chat handles stdout without newline terminators',
      async () => {
        process.chdir(testWorkspace);

        const { service } = await setupStatefulSquadService({
          createChatTemplateContent:
            'node -e "process.stdout.write(\'chat-inline\')"'
        });

        const result = await service.startSquadMembersStateful({
          members: [
            {
              roleId: 'test-role',
              task: 'Inline chat id'
            }
          ]
        });

        expect(result.members[0].chatId).toBe('chat-inline');
        expect(result.members[0].status).toBeDefined();
      },
      15000
    );

    it(
      'stateful existing chat skips create-chat execution',
      async () => {
        process.chdir(testWorkspace);
        const sentinelFileName = 'create-chat-triggered.txt';
        const sentinelPath = join(testWorkspace, sentinelFileName);

        const { service } = await setupStatefulSquadService({
          createChatTemplateContent:
            `node -e "require('fs').writeFileSync('${sentinelFileName}','ran')"`
        });

        const chatId = 'chat-provided';
        const result = await service.startSquadMembersStateful({
          members: [
            {
              roleId: 'test-role',
              task: 'Reuse chat',
              chatId
            }
          ]
        });

        await expect(access(sentinelPath)).rejects.toMatchObject({
          code: 'ENOENT'
        });
        expect(result.members[0].chatId).toBe(chatId);
      },
      15000
    );

    it(
      'stateful run template error bubbles descriptive message',
      async () => {
        process.chdir(testWorkspace);

        const { service } = await setupStatefulSquadService({
          runTemplateContent: 'printf "<%= missing.stateful %>"'
        });

        const escapedPath = runTemplatePath.replace(
          /[-/\\^$*+?.()|[\]{}]/g,
          '\\$&'
        );

        await expect(
          service.startSquadMembersStateful({
            members: [
              {
                roleId: 'test-role',
                task: 'Trigger run template error'
              }
            ]
          })
        ).rejects.toThrow(
          new RegExp(`Failed to render template ${escapedPath}`)
        );
      },
      15000
    );

    it(
      'stateful run template empty output rejects early',
      async () => {
        process.chdir(testWorkspace);

        const { service } = await setupStatefulSquadService({
          runTemplateContent: '   '
        });

        await expect(
          service.startSquadMembersStateful({
            members: [
              {
                roleId: 'test-role',
                task: 'Empty run command'
              }
            ]
          })
        ).rejects.toThrow(
          `Template ${runTemplatePath} rendered to empty command`
        );
      },
      15000
    );

    it(
      'stateful sequential execution honors configured delay',
      async () => {
        process.chdir(testWorkspace);
        const delayMs = 300;

        const { service } = await setupStatefulSquadService({
          executionMode: 'sequential',
          sequentialDelayMs: delayMs
        });

        const start = Date.now();
        const result = await service.startSquadMembersStateful({
          members: [
            {
              roleId: 'test-role',
              task: 'First sequential stateful task'
            },
            {
              roleId: 'test-role',
              task: 'Second sequential stateful task'
            }
          ]
        });
        const elapsed = Date.now() - start;

        expect(result.members).toHaveLength(2);
        expect(
          result.members.every((member) => member.status === 'completed')
        ).toBe(true);
        expect(elapsed).toBeGreaterThanOrEqual(delayMs);
      },
      20000
    );

    it(
      'stateful process runner errors bubble to caller',
      async () => {
        process.chdir(testWorkspace);

        const { moduleRef, service } = await setupStatefulSquadService();
        const processRunner = moduleRef.get<ProcessRunnerService>(
          ProcessRunnerService
        );
        const spy = jest
          .spyOn(processRunner, 'runProcess')
          .mockRejectedValue(new Error('spawn failure'));

        try {
          await expect(
            service.startSquadMembersStateful({
              members: [
                {
                  roleId: 'test-role',
                  task: 'Surface runner error',
                  chatId: 'pre-existing-chat'
                }
              ]
            })
          ).rejects.toThrow('spawn failure');
        } finally {
          spy.mockRestore();
        }
      },
      15000
    );
  });

  describe('SquadService stateless execution', () => {
    it(
      'should execute members sequentially when EXECUTION_MODE is sequential',
      async () => {
        process.chdir(testWorkspace);
        process.env.EXECUTION_MODE = 'sequential';
        process.env.SEQUENTIAL_DELAY_MS = '10';

        const module: TestingModule = await Test.createTestingModule({
          imports: [ AppModule ]
        }).compile();

        const sequentialSquadService = module.get<SquadService>(SquadService);

        const result = await sequentialSquadService.startSquadMembersStateless({
          members: [
            {
              roleId: 'test-role',
              task: 'Task 1'
            },
            {
              roleId: 'test-role',
              task: 'Task 2'
            }
          ]
        });

        expect(result.members).toHaveLength(2);
        expect(result.members[0].status).toBeDefined();
        expect(result.members[1].status).toBeDefined();
      }
    );

    it('should execute members in parallel by default', async () => {
      process.chdir(testWorkspace);
      process.env.EXECUTION_MODE = 'parallel';
      delete process.env.PROCESS_RUNNER_SERIALIZE;

      const module: TestingModule = await Test.createTestingModule({
        imports: [ AppModule ]
      }).compile();

      const parallelSquadService = module.get<SquadService>(SquadService);

      const result = await parallelSquadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'test-role',
            task: 'Task 1'
          },
          {
            roleId: 'test-role',
            task: 'Task 2'
          }
        ]
      });

      expect(result.members).toHaveLength(2);
      expect(result.members[0].status).toBeDefined();
      expect(result.members[1].status).toBeDefined();
    });

    it(
      'should force serialization when PROCESS_RUNNER_SERIALIZE is true',
      async () => {
        process.chdir(testWorkspace);
        process.env.EXECUTION_MODE = 'parallel';
        process.env.PROCESS_RUNNER_SERIALIZE = 'true';

        const module: TestingModule = await Test.createTestingModule({
          imports: [ AppModule ]
        }).compile();

        const serializedSquadService = module.get<SquadService>(SquadService);

        const result = await serializedSquadService.startSquadMembersStateless({
          members: [
            {
              roleId: 'test-role',
              task: 'Task 1'
            },
            {
              roleId: 'test-role',
              task: 'Task 2'
            }
          ]
        });

        expect(result.members).toHaveLength(2);
      }
    );

    it('should resolve relative cwd correctly', async () => {
      process.chdir(testWorkspace);
      const subdir = join(testWorkspace, 'subdir');
      await mkdir(subdir, { recursive: true });

      await writeFile(
        join(testTemplatesDir, 'run-agent.template'),
        'pwd > <%= cwd %>/pwd.txt'
      );

      const result = await squadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'test-role',
            task: 'Test task',
            cwd: 'subdir'
          }
        ]
      });

      expect(result.members[0].status).toBeDefined();
    });

    it('should throw error when role is not found', async () => {
      process.chdir(testWorkspace);

      await expect(
        squadService.startSquadMembersStateless({
          members: [
            {
              roleId: 'non-existent-role',
              task: 'Test task'
            }
          ]
        })
      ).rejects.toThrow('Role not found: non-existent-role');
    });

    it('should escape special characters in prompt', async () => {
      process.chdir(testWorkspace);

      await writeFile(
        join(testTemplatesDir, 'run-agent.template'),
        'echo "<%= prompt %>"'
      );

      const result = await squadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'test-role',
            task: 'Test with $special `chars` and "quotes"'
          }
        ]
      });

      expect(result.members[0].status).toBeDefined();
      expect([ 'completed', 'error', 'timeout' ]).toContain(
        result.members[0].status
      );
    });

    it('should throw error when template rendering fails', async () => {
      process.chdir(testWorkspace);

      await writeFile(
        join(testTemplatesDir, 'run-agent.template'),
        '<%= invalid.syntax.here %>'
      );

      await expect(
        squadService.startSquadMembersStateless({
          members: [
            {
              roleId: 'test-role',
              task: 'Test task'
            }
          ]
        })
      ).rejects.toThrow();
    });

    it('should throw error when template renders to empty string', async () => {
      process.chdir(testWorkspace);

      await writeFile(
        join(testTemplatesDir, 'run-agent.template'),
        '   '
      );

      await expect(
        squadService.startSquadMembersStateless({
          members: [
            {
              roleId: 'test-role',
              task: 'Test task'
            }
          ]
        })
      ).rejects.toThrow('rendered to empty command');
    });

    it('should handle process timeout correctly', async () => {
      process.chdir(testWorkspace);
      process.env.PROCESS_TIMEOUT_MS = '100';

      await writeFile(
        join(testTemplatesDir, 'run-agent.template'),
        'sleep 1'
      );

      const module: TestingModule = await Test.createTestingModule({
        imports: [ AppModule ]
      }).compile();

      const timeoutSquadService = module.get<SquadService>(SquadService);

      const result = await timeoutSquadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'test-role',
            task: 'Test task'
          }
        ]
      });

      expect(result.members[0].status).toBe('timeout');
    }, 5000);

    it('should handle non-zero exit code correctly', async () => {
      process.chdir(testWorkspace);

      await writeFile(
        join(testTemplatesDir, 'run-agent.template'),
        'exit 2'
      );

      const result = await squadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'test-role',
            task: 'Test task'
          }
        ]
      });

      expect(result.members[0].status).toBe('error');
    });
  });

  describe('SquadService stateful execution', () => {
    it('should create chat with UUID substitution', async () => {
      process.chdir(testWorkspace);

      await writeFile(
        join(testTemplatesDir, 'create-chat.template'),
        'echo "chat-<%= generatedUuid %>"'
      );

      await writeFile(
        join(testTemplatesDir, 'run-agent.template'),
        'echo "<%= prompt %>"'
      );

      process.env.CREATE_CHAT_TEMPLATE_PATH = join(
        testTemplatesDir,
        'create-chat.template'
      );
      process.env.STATE_MODE = 'stateful';

      const module: TestingModule = await Test.createTestingModule({
        imports: [ AppModule ]
      }).compile();

      const statefulSquadService = module.get<SquadService>(SquadService);

      const result = await statefulSquadService.startSquadMembersStateful({
        members: [
          {
            roleId: 'test-role',
            task: 'Initial task'
          }
        ]
      });

      expect(result.members[0].chatId).toBeDefined();
      expect(result.members[0].chatId).toMatch(/^chat-/);
    });

    it(
      'should throw error when create-chat template rendering fails',
      async () => {
        process.chdir(testWorkspace);

        await writeFile(
          join(testTemplatesDir, 'create-chat.template'),
          '<%= invalid.syntax %>'
        );

        process.env.CREATE_CHAT_TEMPLATE_PATH = join(
          testTemplatesDir,
          'create-chat.template'
        );
        process.env.STATE_MODE = 'stateful';

        const module: TestingModule = await Test.createTestingModule({
          imports: [ AppModule ]
        }).compile();

        const statefulSquadService = module.get<SquadService>(SquadService);

        await expect(
          statefulSquadService.startSquadMembersStateful({
            members: [
              {
                roleId: 'test-role',
                task: 'Test task'
              }
            ]
          })
        ).rejects.toThrow();
      }
    );

    it(
      'should throw error when create-chat renders to empty string',
      async () => {
        process.chdir(testWorkspace);

        await writeFile(
          join(testTemplatesDir, 'create-chat.template'),
          '   '
        );

        process.env.CREATE_CHAT_TEMPLATE_PATH = join(
          testTemplatesDir,
          'create-chat.template'
        );
        process.env.STATE_MODE = 'stateful';

        const module: TestingModule = await Test.createTestingModule({
          imports: [ AppModule ]
        }).compile();

        const statefulSquadService = module.get<SquadService>(SquadService);

        await expect(
          statefulSquadService.startSquadMembersStateful({
            members: [
              {
                roleId: 'test-role',
                task: 'Test task'
              }
            ]
          })
        ).rejects.toThrow('rendered to empty command');
      }
    );

    it('should throw error when create-chat process fails', async () => {
      process.chdir(testWorkspace);

      await writeFile(
        join(testTemplatesDir, 'create-chat.template'),
        '>&2 echo "create-chat failed"; exit 2'
      );

      process.env.CREATE_CHAT_TEMPLATE_PATH = join(
        testTemplatesDir,
        'create-chat.template'
      );
      process.env.STATE_MODE = 'stateful';

      const module: TestingModule = await Test.createTestingModule({
        imports: [ AppModule ]
      }).compile();

      const statefulSquadService = module.get<SquadService>(SquadService);

      await expect(
        statefulSquadService.startSquadMembersStateful({
          members: [
            {
              roleId: 'test-role',
              task: 'Test task'
            }
          ]
        })
      ).rejects.toThrow('Failed to create chat');
    });

    it('should handle create-chat output without newline', async () => {
      process.chdir(testWorkspace);

      await writeFile(
        join(testTemplatesDir, 'create-chat.template'),
        'printf "chat-123"'
      );

      await writeFile(
        join(testTemplatesDir, 'run-agent.template'),
        'echo "<%= prompt %>"'
      );

      process.env.CREATE_CHAT_TEMPLATE_PATH = join(
        testTemplatesDir,
        'create-chat.template'
      );
      process.env.STATE_MODE = 'stateful';

      const module: TestingModule = await Test.createTestingModule({
        imports: [ AppModule ]
      }).compile();

      const statefulSquadService = module.get<SquadService>(SquadService);

      const result = await statefulSquadService.startSquadMembersStateful({
        members: [
          {
            roleId: 'test-role',
            task: 'Test task'
          }
        ]
      });

      expect(result.members[0].chatId).toBe('chat-123');
    });

    it('should skip chat creation when chatId is provided', async () => {
      process.chdir(testWorkspace);

      await writeFile(
        join(testTemplatesDir, 'run-agent.template'),
        'echo "<%= prompt %>"'
      );

      process.env.STATE_MODE = 'stateful';

      const module: TestingModule = await Test.createTestingModule({
        imports: [ AppModule ]
      }).compile();

      const statefulSquadService = module.get<SquadService>(SquadService);

      const result = await statefulSquadService.startSquadMembersStateful({
        members: [
          {
            roleId: 'test-role',
            task: 'Continue task',
            chatId: 'existing-chat-123'
          }
        ]
      });

      expect(result.members[0].chatId).toBe('existing-chat-123');
    });

    it(
      'should throw error when stateful run template rendering fails',
      async () => {
        process.chdir(testWorkspace);

        await writeFile(
          join(testTemplatesDir, 'create-chat.template'),
          'echo chat-123'
        );

        await writeFile(
          join(testTemplatesDir, 'run-agent.template'),
          '<%= invalid.syntax %>'
        );

        process.env.CREATE_CHAT_TEMPLATE_PATH = join(
          testTemplatesDir,
          'create-chat.template'
        );
        process.env.STATE_MODE = 'stateful';

        const module: TestingModule = await Test.createTestingModule({
          imports: [ AppModule ]
        }).compile();

        const statefulSquadService = module.get<SquadService>(SquadService);

        await expect(
          statefulSquadService.startSquadMembersStateful({
            members: [
              {
                roleId: 'test-role',
                task: 'Test task'
              }
            ]
          })
        ).rejects.toThrow();
      }
    );

    it(
      'should throw error when stateful run template renders to empty',
      async () => {
        process.chdir(testWorkspace);

        await writeFile(
          join(testTemplatesDir, 'create-chat.template'),
          'echo chat-123'
        );

        await writeFile(
          join(testTemplatesDir, 'run-agent.template'),
          '   '
        );

        process.env.CREATE_CHAT_TEMPLATE_PATH = join(
          testTemplatesDir,
          'create-chat.template'
        );
        process.env.STATE_MODE = 'stateful';

        const module: TestingModule = await Test.createTestingModule({
          imports: [ AppModule ]
        }).compile();

        const statefulSquadService = module.get<SquadService>(SquadService);

        await expect(
          statefulSquadService.startSquadMembersStateful({
            members: [
              {
                roleId: 'test-role',
                task: 'Test task'
              }
            ]
          })
        ).rejects.toThrow('rendered to empty command');
      }
    );

    it('should execute stateful members sequentially with delay', async () => {
      process.chdir(testWorkspace);

      await writeFile(
        join(testTemplatesDir, 'create-chat.template'),
        'echo chat-123'
      );

      await writeFile(
        join(testTemplatesDir, 'run-agent.template'),
        'echo "<%= prompt %>"'
      );

      process.env.CREATE_CHAT_TEMPLATE_PATH = join(
        testTemplatesDir,
        'create-chat.template'
      );
      process.env.STATE_MODE = 'stateful';
      process.env.EXECUTION_MODE = 'sequential';
      process.env.SEQUENTIAL_DELAY_MS = '10';

      const module: TestingModule = await Test.createTestingModule({
        imports: [ AppModule ]
      }).compile();

      const statefulSquadService = module.get<SquadService>(SquadService);

      const result = await statefulSquadService.startSquadMembersStateful({
        members: [
          {
            roleId: 'test-role',
            task: 'Task 1'
          },
          {
            roleId: 'test-role',
            task: 'Task 2'
          }
        ]
      });

      expect(result.members).toHaveLength(2);
      expect(result.members[0].chatId).toBeDefined();
      expect(result.members[1].chatId).toBeDefined();
    });
  });

  describe('ProcessRunnerService edge cases', () => {
    it('should handle commands with arguments', async () => {
      process.chdir(testWorkspace);

      await writeFile(
        join(testTemplatesDir, 'run-agent.template'),
        'sh -c "echo hello world"'
      );

      const result = await squadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'test-role',
            task: 'Test task'
          }
        ]
      });

      expect(result.members[0].status).toBeDefined();
    });

    it('should collect both stdout and stderr', async () => {
      process.chdir(testWorkspace);

      await writeFile(
        join(testTemplatesDir, 'run-agent.template'),
        'sh -c "echo stdout; echo stderr >&2"'
      );

      const result = await squadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'test-role',
            task: 'Test task'
          }
        ]
      });

      expect(result.members[0].rawStdout).toBeDefined();
      expect(result.members[0].rawStderr).toBeDefined();
    });

    it('should handle process errors gracefully', async () => {
      process.chdir(testWorkspace);

      await writeFile(
        join(testTemplatesDir, 'run-agent.template'),
        'sh -c "exit 1"'
      );

      const result = await squadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'test-role',
            task: 'Test task'
          }
        ]
      });

      expect(result.members[0].status).toBe('error');
    });

    it('should handle large output', async () => {
      process.chdir(testWorkspace);

      await writeRunTemplate(
        'sh -c "for i in $(seq 1 100); do echo line $i; done"'
      );

      const result = await squadService.startSquadMembersStateless({
        members: [
          {
            roleId: 'test-role',
            task: 'Test task'
          }
        ]
      });

      expect(result.members[0].rawStdout).toBeDefined();
      // Check that we got some output (may be empty if
      // command fails, but should be defined)
      expect(typeof result.members[0].rawStdout).toBe('string');
    });
  });

  describe('TemplateRendererService edge cases', () => {
    it('splits args for a basic rendered template', async () => {
      const template = [
        'cursor-agent',
        '--role <%= roleId %>',
        '--cwd "<%= cwd %>"',
        '"<%= prompt %>"'
      ].join(' ');

      const args = await renderRunTemplate(template);

      expect(args).toEqual([
        'cursor-agent',
        '--role',
        'test-role',
        '--cwd',
        testWorkspace,
        defaultRenderPrompt
      ]);
    });

    it('preserves quoted argument content', async () => {
      const template = 'cursor-agent "<%= prompt %>" --flag <%= roleId %>';
      const promptWithWhitespace = 'line 1   line 2\tand spaces';

      const args = await renderRunTemplate(template, {
        prompt: promptWithWhitespace
      });

      expect(args).toEqual([
        'cursor-agent',
        promptWithWhitespace,
        '--flag',
        'test-role'
      ]);
    });

    it('handles single quotes and nested quoting', async () => {
      const template =
        'cursor-agent "<%= doubleWrapped %>" --json ' +
        '\'<%= singleWrapped %>\'';

      const args = await renderRunTemplate(template, {
        doubleWrapped: 'value with \'single quotes\' inside',
        singleWrapped: 'value with "double quotes" inside'
      });

      expect(args).toEqual([
        'cursor-agent',
        'value with &#39;single quotes&#39; inside',
        '--json',
        'value with &#34;double quotes&#34; inside'
      ]);
    });

    it('trims trailing whitespace from the template output', async () => {
      const args = await renderRunTemplate('cursor-agent <%= roleId %>   ');

      expect(args).toEqual([ 'cursor-agent', 'test-role' ]);
    });

    it('removes empty args produced by template gaps', async () => {
      const template =
        'cursor-agent <%= optionalOne %> <%= optionalTwo %> tail';

      const args = await renderRunTemplate(template, {
        optionalOne: '',
        optionalTwo: '   '
      });

      expect(args).toEqual([ 'cursor-agent', 'tail' ]);
      expect(args.every((arg) => arg.length > 0)).toBe(true);
    });

    it('surfaces template failures with a helpful snippet', async () => {
      const brokenTemplate =
        'cursor-agent <% if (chatId) { %> --resume <%= chatId %>';

      let thrownError: Error | undefined;
      try {
        await renderRunTemplate(brokenTemplate);
      } catch (error) {
        thrownError = error as Error;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError?.message).toContain('Template rendering failed');
      expect(thrownError?.message).toContain(
        'Template: cursor-agent <% if (chatId)'
      );
    });

    it('injects stateful context like chatId when present', async () => {
      const template =
        '--engine codex <% if (chatId) { %> --resume <%= chatId %> <% } %>' +
        ' --task "<%= task %>" "<%= prompt %>"';

      const args = await renderRunTemplate(template, {
        chatId: 'chat-abc123',
        task: 'Continue session',
        prompt: 'Stateful prompt text'
      });

      expect(args).toEqual([
        '--engine',
        'codex',
        '--resume',
        'chat-abc123',
        '--task',
        'Continue session',
        'Stateful prompt text'
      ]);
    });

    it('splits unicode and newline sequences correctly', async () => {
      const template =
        'cursor-agent "<%= prompt %>" --emoji <%= emoji %>\n' +
        '--details "<%= details %>"';

      const args = await renderRunTemplate(template, {
        prompt: 'Line1\nLine2',
        emoji: '🚀',
        details: 'Привет мир'
      });

      expect(args).toEqual([
        'cursor-agent',
        'Line1\nLine2',
        '--emoji',
        '🚀',
        '--details',
        'Привет мир'
      ]);
      expect(args[1]).toContain('\n');
    });
  });

  describe('MCP CLI stdio integration', () => {
    it('performs initialize handshake over stdio', async () => {
      const harness = await setupCliHarness(mcpCliCommand);
      try {
        await emitJsonRpcLine(harness, {
          method: 'initialize',
          id: 'init-handshake'
        });

        const response = readLastResponse(harness.stdoutSpy) as any;
        expect(response.id).toBe('init-handshake');
        expect(response.result.serverInfo.name).toBe('gs-squad-mcp');
        expect(response.result.protocolVersion).toBe('2024-11-05');
      } finally {
        harness.triggerClose();
        harness.restore();
      }
    });

    it('responds with available tools for tools/list requests', async () => {
      const harness = await setupCliHarness(mcpCliCommand);
      try {
        await emitJsonRpcLine(harness, {
          method: 'tools/list',
          id: 'list-tools'
        });

        const response = readLastResponse(harness.stdoutSpy) as any;
        expect(response.result.tools).toHaveLength(2);
        const toolNames = (response.result.tools as Array<{ name: string }>)
          .map((tool) => tool.name);
        expect(toolNames).toEqual(
          expect.arrayContaining([ 'list_roles', 'start_squad_members' ])
        );
      } finally {
        harness.triggerClose();
        harness.restore();
      }
    });

    it('serializes list_roles results via tools/call', async () => {
      const harness = await setupCliHarness(mcpCliCommand);
      try {
        await emitJsonRpcLine(harness, {
          method: 'tools/call',
          params: {
            name: 'list_roles',
            arguments: {}
          },
          id: 'tools-call-list-roles'
        });

        const response = readLastResponse(harness.stdoutSpy) as any;
        const content = response.result.content as Array<{
          type: string;
          text: string;
        }>;
        expect(content[0].type).toBe('text');
        const parsed = JSON.parse(content[0].text);
        expect(parsed.roles.length).toBeGreaterThan(0);
        expect(parsed.roles[0]).toHaveProperty('id', 'test-role');
      } finally {
        harness.triggerClose();
        harness.restore();
      }
    });

    it(
      'executes start_squad_members via tools/call in stateless mode',
      async () => {
        const harness = await setupCliHarness(mcpCliCommand);
        try {
          await emitJsonRpcLine(harness, {
            method: 'tools/call',
            params: {
              name: 'start_squad_members',
              arguments: {
                members: [
                  {
                    roleId: 'test-role',
                    task: 'Stdio stateless task',
                    cwd: testWorkspace
                  }
                ]
              }
            },
            id: 'tools-call-stateless'
          });

          const response = readLastResponse(harness.stdoutSpy) as any;
          const payload = JSON.parse(response.result.content[0].text);
          expect(payload.members).toHaveLength(1);
          expect(payload.members[0].roleId).toBe('test-role');
          expect([ 'completed', 'error', 'timeout' ])
            .toContain(payload.members[0].status);
        } finally {
          harness.triggerClose();
          harness.restore();
        }
      },
      15000
    );

    it(
      'executes start_squad_members via tools/call in stateful mode',
      async () => {
        const createChatTemplatePath = join(
          testTemplatesDir,
          'create-chat-cli.template'
        );
        await writeFile(createChatTemplatePath, 'echo cli-chat-456');
        process.env.STATE_MODE = 'stateful';
        process.env.CREATE_CHAT_TEMPLATE_PATH = createChatTemplatePath;

        const statefulModule = await rebuildTestingModule();
        const statefulCommand = statefulModule.get<McpCliCommand>(
          McpCliCommand
        );
        const harness = await setupCliHarness(statefulCommand);
        try {
          await emitJsonRpcLine(harness, {
            method: 'tools/call',
            params: {
              name: 'start_squad_members',
              arguments: {
                members: [
                  {
                    roleId: 'test-role',
                    task: 'Stateful stdio task',
                    cwd: testWorkspace
                  }
                ]
              }
            },
            id: 'tools-call-stateful'
          });

          const response = readLastResponse(harness.stdoutSpy) as any;
          const payload = JSON.parse(response.result.content[0].text);
          expect(payload.members[0].roleId).toBe('test-role');
          expect(payload.members[0].chatId).toBeDefined();
          expect(payload.members[0].chatId).toBe('cli-chat-456');
        } finally {
          harness.triggerClose();
          harness.restore();
        }
      },
      15000
    );

    it('supports direct start_squad_members method invocation', async () => {
      const harness = await setupCliHarness(mcpCliCommand);
      try {
        await emitJsonRpcLine(harness, {
          method: 'start_squad_members',
          params: {
            members: [
              {
                roleId: 'test-role',
                task: 'Direct start task',
                cwd: testWorkspace
              }
            ]
          },
          id: 'direct-start'
        });

        const response = readLastResponse(harness.stdoutSpy) as any;
        expect(response.result.members).toHaveLength(1);
        expect(response.result.members[0].roleId).toBe('test-role');
      } finally {
        harness.triggerClose();
        harness.restore();
      }
    });

    it('returns errors for unknown tools and methods', async () => {
      const harness = await setupCliHarness(mcpCliCommand);
      try {
        await emitJsonRpcLine(harness, {
          method: 'tools/call',
          params: {
            name: 'missing_tool',
            arguments: {}
          },
          id: 'unknown-tool'
        });

        expect(harness.stdoutSpy).toHaveBeenCalledTimes(1);
        const toolResponse = JSON.parse(
          harness.stdoutSpy.mock.calls[0][0] as string
        );
        expect(toolResponse.error).toEqual({
          code: -32601,
          message: 'Tool not found: missing_tool'
        });

        await emitJsonRpcLine(harness, {
          method: 'unknown_method',
          id: 'unknown-method'
        });

        expect(harness.stdoutSpy).toHaveBeenCalledTimes(2);
        const methodResponse = JSON.parse(
          harness.stdoutSpy.mock.calls[1][0] as string
        );
        expect(methodResponse.error).toEqual({
          code: -32601,
          message: 'Method not found: unknown_method'
        });
      } finally {
        harness.triggerClose();
        harness.restore();
      }
    });

    it('propagates parse errors and preserves request id', async () => {
      const harness = await setupCliHarness(mcpCliCommand);
      const originalParse = JSON.parse;
      let callCount = 0;
      const parseSpy = jest
        .spyOn(JSON, 'parse')
        .mockImplementation((
          text: string,
          reviver?: (key: string, value: unknown) => unknown) => {
            callCount += 1;
            if (callCount === 1) {
              throw new Error('Unexpected token');
            }
            return originalParse(text, reviver as any);
          }
        );

      try {
        await harness.emitLine('{"method":"list_roles","id":"parse-recover"}');

        const response = readLastResponse(harness.stdoutSpy) as any;
        expect(response.id).toBe('parse-recover');
        expect(response.error.code).toBe(-32700);
        expect(response.error.message).toBe('Unexpected token');
      } finally {
        parseSpy.mockRestore();
        harness.triggerClose();
        harness.restore();
      }
    });

    it('ignores notifications that omit an id', async () => {
      const harness = await setupCliHarness(mcpCliCommand);
      try {
        await emitJsonRpcLine(harness, {
          method: 'initialize'
        });

        expect(harness.stdoutSpy).not.toHaveBeenCalled();
      } finally {
        harness.triggerClose();
        harness.restore();
      }
    });

    it('surfaces internal errors from SquadService executions', async () => {
      const harness = await setupCliHarness(mcpCliCommand);
      try {
        await emitJsonRpcLine(harness, {
          method: 'start_squad_members',
          params: {
            members: [
              {
                roleId: 'missing-role',
                task: 'Should fail'
              }
            ]
          },
          id: 'internal-error'
        });

        const response = readLastResponse(harness.stdoutSpy) as any;
        expect(response.error.code).toBe(-32603);
        expect(response.error.message).toMatch(/Role not found/);
      } finally {
        harness.triggerClose();
        harness.restore();
      }
    });

    it('exits gracefully when readline closes', async () => {
      const harness = await setupCliHarness(mcpCliCommand);
      try {
        harness.triggerClose();
        expect(harness.exitSpy).toHaveBeenCalledWith(0);
      } finally {
        harness.restore();
      }
    });
  });
});
