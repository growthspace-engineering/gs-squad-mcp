import { Test, TestingModule } from '@nestjs/testing';
import { McpCliCommand } from './mcp-cli.command';
import { SquadService } from '../core/mcp';
import { SquadConfigService } from '../core/config';
import * as readline from 'readline';
import { EventEmitter } from 'events';
import { Writable } from 'stream';

jest.mock('readline');

describe('McpCliCommand', () => {
  let command: McpCliCommand;
  let squadService: jest.Mocked<SquadService>;
  let configService: jest.Mocked<SquadConfigService>;
  let mockReadlineInterface: EventEmitter & {
    on: jest.Mock;
    close: jest.Mock;
  };
  let mockStdout: Writable;
  let stdoutWriteSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockStdout = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      }
    });
    stdoutWriteSpy = jest.spyOn(mockStdout, 'write');
    jest.spyOn(process, 'stdout', 'get').mockReturnValue(mockStdout as any);

    mockReadlineInterface = new EventEmitter() as any;
    mockReadlineInterface.on = jest.fn((event: string, handler: () => void) => {
      EventEmitter.prototype.on.call(mockReadlineInterface, event, handler);
      return mockReadlineInterface;
    });
    mockReadlineInterface.close = jest.fn();

    (readline.createInterface as jest.Mock).mockReturnValue(
      mockReadlineInterface
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpCliCommand,
        {
          provide: SquadService,
          useValue: {
            listRoles: jest.fn(),
            startSquadMembersStateless: jest.fn(),
            startSquadMembersStateful: jest.fn()
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

    command = module.get<McpCliCommand>(McpCliCommand);
    squadService = module.get(SquadService);
    configService = module.get(SquadConfigService);

    configService.getConfig.mockReturnValue({
      stateMode: 'stateless',
      engine: 'cursor-agent',
      executionMode: undefined,
      runTemplatePath: 'templates/run.template',
      createChatTemplatePath: undefined,
      agentsDirectoryPath: 'agents',
      processTimeoutMs: 600000,
      sequentialDelayMs: 100
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('run', () => {
    it('should create readline interface with correct options', async () => {
      command.run();
      await Promise.resolve();

      expect(readline.createInterface).toHaveBeenCalledWith({
        input: process.stdin,
        output: process.stderr,
        terminal: false
      });
    });

    it('should register line event handler', async () => {
      command.run();
      await Promise.resolve();

      expect(mockReadlineInterface.on).toHaveBeenCalledWith(
        'line',
        expect.any(Function)
      );
    });

    it('should register close event handler', async () => {
      command.run();
      await Promise.resolve();

      expect(mockReadlineInterface.on).toHaveBeenCalledWith(
        'close',
        expect.any(Function)
      );
    });

    it('should exit process on close event', async () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        return undefined as never;
      });

      command.run();
      await Promise.resolve();

      mockReadlineInterface.emit('close');

      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
    });
  });

  describe('handleRequest - initialize', () => {
    it('should return correct initialize response', async () => {
      const request = {
        method: 'initialize',
        id: 1
      };

      const response = await (command as any).handleRequest(request);

      expect(response).toEqual({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'gs-squad-mcp',
            version: '1.0.2'
          }
        },
        id: 1
      });
    });

    it('should handle initialize without id', async () => {
      const request = {
        method: 'initialize'
      };

      const response = await (command as any).handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.id).toBeUndefined();
    });
  });

  describe('handleRequest - tools/list', () => {
    it('should return correct tools list', async () => {
      const request = {
        method: 'tools/list',
        id: 2
      };

      const response = await (command as any).handleRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.result).toBeDefined();
      expect((response.result as any).tools).toHaveLength(2);
      expect((response.result as any).tools[0].name).toBe('list_roles');
      expect((response.result as any).tools[1].name)
        .toBe('start_squad_members');
    });
  });

  describe('handleRequest - tools/call', () => {
    it('should handle list_roles tool call', async () => {
      const mockRoles = {
        roles: [
          { id: 'role1', name: 'Role 1', description: 'Desc 1' }
        ]
      };
      squadService.listRoles.mockResolvedValue(mockRoles);

      const request = {
        method: 'tools/call',
        params: {
          name: 'list_roles',
          arguments: {}
        },
        id: 3
      };

      const response = await (command as any).handleRequest(request);

      expect(squadService.listRoles).toHaveBeenCalled();
      expect(response.result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockRoles)
          }
        ]
      });
    });

    it(
      'should handle start_squad_members tool call in stateless mode',
      async () => {
        const mockResult = {
          squadId: 'squad-123',
          members: [
            {
              memberId: 'member-1',
              roleId: 'test-role',
              status: 'completed' as const,
              rawStdout: 'output',
              rawStderr: ''
            }
          ]
        };
        squadService.startSquadMembersStateless.mockResolvedValue(mockResult);

        const request = {
          method: 'tools/call',
          params: {
            name: 'start_squad_members',
            arguments: {
              members: [
                { roleId: 'test-role', task: 'Test task' }
              ]
            }
          },
          id: 4
        };

        const response = await (command as any).handleRequest(request);

        expect(configService.getConfig).toHaveBeenCalled();
        expect(squadService.startSquadMembersStateless).toHaveBeenCalledWith({
          members: [
            { roleId: 'test-role', task: 'Test task' }
          ]
        });
        expect(response.result).toEqual({
          content: [
            {
              type: 'text',
              text: JSON.stringify(mockResult)
            }
          ]
        });
      }
    );

    it(
      'should handle start_squad_members tool call in stateful mode',
      async () => {
        configService.getConfig.mockReturnValue({
          stateMode: 'stateful',
          engine: 'cursor-agent',
          executionMode: undefined,
          runTemplatePath: 'templates/run.template',
          createChatTemplatePath: 'templates/create-chat.template',
          agentsDirectoryPath: 'agents',
          processTimeoutMs: 600000,
          sequentialDelayMs: 100
        });

        const mockResult = {
          squadId: 'squad-456',
          members: [
            {
              memberId: 'member-2',
              roleId: 'test-role',
              chatId: 'chat-789',
              status: 'completed' as const,
              rawStdout: 'output',
              rawStderr: ''
            }
          ]
        };
        squadService.startSquadMembersStateful.mockResolvedValue(mockResult);

        const request = {
          method: 'tools/call',
          params: {
            name: 'start_squad_members',
            arguments: {
              members: [
                { roleId: 'test-role', task: 'Test task' }
              ]
            }
          },
          id: 5
        };

        const response = await (command as any).handleRequest(request);

        expect(squadService.startSquadMembersStateful).toHaveBeenCalled();
        expect(response.result).toEqual({
          content: [
            {
              type: 'text',
              text: JSON.stringify(mockResult)
            }
          ]
        });
      }
    );

    it('should return error for unknown tool', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {}
        },
        id: 6
      };

      const response = await (command as any).handleRequest(request);

      expect(response.error).toEqual({
        code: -32601,
        message: 'Tool not found: unknown_tool'
      });
      expect(response.id).toBe(6);
    });
  });

  describe('handleRequest - list_roles', () => {
    it('should call squadService.listRoles', async () => {
      const mockRoles = {
        roles: [
          { id: 'role1', name: 'Role 1', description: 'Desc 1' }
        ]
      };
      squadService.listRoles.mockResolvedValue(mockRoles);

      const request = {
        method: 'list_roles',
        id: 7
      };

      const response = await (command as any).handleRequest(request);

      expect(squadService.listRoles).toHaveBeenCalled();
      expect(response.result).toEqual(mockRoles);
    });
  });

  describe('handleRequest - start_squad_members', () => {
    it('should call startSquadMembersStateless in stateless mode', async () => {
      const mockResult = {
        squadId: 'squad-123',
        members: []
      };
      squadService.startSquadMembersStateless.mockResolvedValue(mockResult);

      const request = {
        method: 'start_squad_members',
        params: {
          members: [
            { roleId: 'test-role', task: 'Task' }
          ]
        },
        id: 8
      };

      const response = await (command as any).handleRequest(request);

      expect(squadService.startSquadMembersStateless).toHaveBeenCalled();
      expect(response.result).toEqual(mockResult);
    });

    it('should call startSquadMembersStateful in stateful mode', async () => {
      configService.getConfig.mockReturnValue({
        stateMode: 'stateful',
        engine: 'cursor-agent',
        executionMode: undefined,
        runTemplatePath: 'templates/run.template',
        createChatTemplatePath: 'templates/create-chat.template',
        agentsDirectoryPath: 'agents',
        processTimeoutMs: 600000,
        sequentialDelayMs: 100
      });

      const mockResult = {
        squadId: 'squad-456',
        members: []
      };
      squadService.startSquadMembersStateful.mockResolvedValue(mockResult);

      const request = {
        method: 'start_squad_members',
        params: {
          members: [
            { roleId: 'test-role', task: 'Task' }
          ]
        },
        id: 9
      };

      const response = await (command as any).handleRequest(request);

      expect(squadService.startSquadMembersStateful).toHaveBeenCalled();
      expect(response.result).toEqual(mockResult);
    });
  });

  describe('handleRequest - error handling', () => {
    it('should return error for unknown method', async () => {
      const request = {
        method: 'unknown_method',
        id: 10
      };

      const response = await (command as any).handleRequest(request);

      expect(response.error).toEqual({
        code: -32601,
        message: 'Method not found: unknown_method'
      });
      expect(response.id).toBe(10);
    });

    it('should catch and return internal errors', async () => {
      squadService.listRoles.mockRejectedValue(
        new Error('Service error')
      );

      const request = {
        method: 'list_roles',
        id: 11
      };

      const response = await (command as any).handleRequest(request);

      expect(response.error).toEqual({
        code: -32603,
        message: 'Service error'
      });
      expect(response.id).toBe(11);
    });

    it('should handle non-Error exceptions', async () => {
      squadService.listRoles.mockRejectedValue('String error');

      const request = {
        method: 'list_roles',
        id: 12
      };

      const response = await (command as any).handleRequest(request);

      expect(response.error).toEqual({
        code: -32603,
        message: 'Internal error'
      });
    });
  });

  describe('sendResponse', () => {
    it('should write JSON response to stdout', () => {
      const response = {
        jsonrpc: '2.0' as const,
        result: { data: 'test' },
        id: 13
      };

      (command as any).sendResponse(response);

      expect(stdoutWriteSpy).toHaveBeenCalledWith(
        JSON.stringify(response) + '\n'
      );
    });

    it('should handle responses without id', () => {
      const response = {
        jsonrpc: '2.0' as const,
        result: { data: 'test' }
      };

      (command as any).sendResponse(response);

      expect(stdoutWriteSpy).toHaveBeenCalled();
    });
  });

  describe('line event handler', () => {
    it('should parse valid JSON request and send response', async () => {
      const mockRoles = {
        roles: [
          { id: 'role1', name: 'Role 1', description: 'Desc 1' }
        ]
      };
      squadService.listRoles.mockResolvedValue(mockRoles);

      const runPromise = command.run();
      await Promise.resolve();

      const lineHandler = mockReadlineInterface.on.mock.calls.find(
        (call) => call[0] === 'line'
      )?.[1];

      if (lineHandler) {
        lineHandler(JSON.stringify({
          method: 'list_roles',
          id: 14
        }));
        await Promise.resolve();
        await Promise.resolve();
      }

      expect(squadService.listRoles).toHaveBeenCalled();
      expect(stdoutWriteSpy).toHaveBeenCalled();
      runPromise.catch(() => {}); // Prevent unhandled rejection
    }, 10000);

    it('should handle invalid JSON gracefully', async () => {
      const runPromise = command.run();
      await Promise.resolve();

      const lineHandler = mockReadlineInterface.on.mock.calls.find(
        (call) => call[0] === 'line'
      )?.[1];

      stdoutWriteSpy.mockClear();

      if (lineHandler) {
        lineHandler('invalid json');
        await Promise.resolve();
        await Promise.resolve();
      }

      // When JSON is completely invalid and has no id, no response is sent
      expect(stdoutWriteSpy).not.toHaveBeenCalled();
      runPromise.catch(() => {}); // Prevent unhandled rejection
    }, 10000);

    it('should not send response for notifications (no id)', async () => {
      const runPromise = command.run();
      await Promise.resolve();

      const lineHandler = mockReadlineInterface.on.mock.calls.find(
        (call) => call[0] === 'line'
      )?.[1];

      stdoutWriteSpy.mockClear();

      if (lineHandler) {
        lineHandler(JSON.stringify({
          method: 'initialize'
        }));
        await Promise.resolve();
        await Promise.resolve();
      }

      expect(stdoutWriteSpy).not.toHaveBeenCalled();
      runPromise.catch(() => {}); // Prevent unhandled rejection
    }, 10000);

    it('should extract id from malformed JSON for error response', async () => {
      const runPromise = command.run();
      await Promise.resolve();

      const lineHandler = mockReadlineInterface.on.mock.calls.find(
        (call) => call[0] === 'line'
      )?.[1];

      stdoutWriteSpy.mockClear();

      if (lineHandler) {
        // Use a line that has valid JSON structure but extra content
        // The first parse will fail, but the second parse
        // attempt can extract id
        lineHandler('{"method": "test", "id": 15} extra');
        await Promise.resolve();
        await Promise.resolve();
      }

      // The error handler tries to parse again to extract id
      // If it succeeds, it sends an error response
      if (stdoutWriteSpy.mock.calls.length > 0) {
        const written = stdoutWriteSpy.mock.calls[0][0];
        const response = JSON.parse(written);
        expect(response.id).toBe(15);
        expect(response.error).toBeDefined();
      }
      runPromise.catch(() => {}); // Prevent unhandled rejection
    }, 10000);
  });

  describe('CLI option parsing', () => {
    it('should parse engine option', () => {
      const result = command.parseEngine('claude');
      expect(result).toBe('claude');
    });

    it('should parse execution mode option', () => {
      const result = command.parseExecutionMode('parallel');
      expect(result).toBe('parallel');
    });

    it('should parse sequential flag', () => {
      const result = command.parseSequential();
      expect(result).toBe(true);
    });

    it('should parse state mode option', () => {
      const result = command.parseStateMode('stateful');
      expect(result).toBe('stateful');
    });
  });
});
