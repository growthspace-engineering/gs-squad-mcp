import { Command, CommandRunner, Option } from 'nest-commander';
import { SquadService } from '../core/mcp';
import { SquadConfigService } from '../core/config';
import * as readline from 'readline';

interface IMcpRequest {
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

interface IMcpResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
  id?: string | number;
}

@Command({
  name: 'mcp',
  description: 'Squad MCP stdio server'
})
export class McpCliCommand extends CommandRunner {
  constructor(
    private readonly squadService: SquadService,
    private readonly configService: SquadConfigService
  ) {
    super();
  }

  // Accept CLI options (nest-commander)
  // Config also parses process.argv (options are optional).
  @Option({
    flags: '--engine <engine>',
    description: 'Engine to use: cursor-agent | claude | codex'
  })
  parseEngine(value: string): string {
    return value;
  }

  @Option({
    flags: '--execution-mode <mode>',
    description:
      'Execution mode when using a custom template: ' +
      'sequential | parallel'
  })
  parseExecutionMode(value: string): string {
    return value;
  }

  @Option({
    flags: '--sequential',
    description:
      'Shorthand to force sequential execution ' +
      'when using a custom template'
  })
  parseSequential(): boolean {
    return true;
  }

  @Option({
    flags: '--state-mode <mode>',
    description: 'State mode: stateless | stateful'
  })
  parseStateMode(value: string): string {
    return value;
  }

  async run(
    _passedParams?: string[],
    _options?: Record<string, unknown>
  ): Promise<void> {
    // Use stderr for readline output to
    // avoid interfering with JSON-RPC on stdout
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: false
    });

    rl.on('line', async (line: string) => {
      try {
        const request: IMcpRequest = JSON.parse(line);
        const response = await this.handleRequest(request);
        // Only send response if it has an id (not a notification)
        if (response.id !== undefined) {
          this.sendResponse(response);
        }
      } catch (error) {
        const errorResponse: IMcpResponse = {
          jsonrpc: '2.0',
          error: {
            code: -32700,
            message:
              error instanceof Error ? error.message : 'Parse error'
          },
          id: undefined // Parse errors should include id if request had one
        };
        // Try to extract id from the original request if possible
        try {
          const request: IMcpRequest = JSON.parse(line);
          if (request.id !== undefined) {
            errorResponse.id = request.id;
            this.sendResponse(errorResponse);
          }
        } catch {
          // If we can't parse, don't send response
        }
      }
    });

    rl.on('close', () => {
      process.exit(0);
    });

    // Keep process alive
    await new Promise(() => {});
  }

  private async handleRequest(
    request: IMcpRequest
  ): Promise<IMcpResponse> {
    const { method, params = {}, id } = request;

    try {
      let result: unknown;

      switch (method) {
        case 'initialize':
          // MCP protocol initialization
          result = {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'gs-squad-mcp',
              version: '1.0.2'
            }
          };
          break;

        case 'tools/list':
          // Return available MCP tools
          result = {
            tools: [
              {
                name: 'list_roles',
                description: 'List all available role definitions',
                inputSchema: {
                  type: 'object',
                  properties: {},
                  required: []
                }
              },
              {
                name: 'start_squad_members',
                description: 'Spawn one or more role-specialized agents',
                inputSchema: {
                  type: 'object',
                  properties: {
                    orchestratorChatId: { type: 'string' },
                    workspaceId: { type: 'string' },
                    members: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          roleId: { type: 'string' },
                          task: { type: 'string' },
                          cwd: { type: 'string' },
                          chatId: { type: 'string' }
                        },
                        required: [ 'roleId', 'task' ]
                      }
                    }
                  },
                  required: [ 'members' ]
                }
              }
            ]
          };
          break;

        case 'tools/call': {
          // MCP protocol tool invocation
          const toolName = (params as { name?: string }).name;
          const toolArguments = 
            (params as { arguments?: Record<string, unknown> })
              .arguments || {};

          switch (toolName) {
            case 'list_roles':
              result = {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(await this.squadService.listRoles())
                  }
                ]
              };
              break;

            case 'start_squad_members': {
              const config = this.configService.getConfig();
              let toolResult: unknown;
              if (config.stateMode === 'stateless') {
                toolResult = await this.squadService.startSquadMembersStateless(
                  toolArguments as unknown as Parameters<
                    typeof this.squadService.startSquadMembersStateless
                  >[0]
                );
              } else {
                toolResult = await this.squadService.startSquadMembersStateful(
                  toolArguments as unknown as Parameters<
                    typeof this.squadService.startSquadMembersStateful
                  >[0]
                );
              }
              result = {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(toolResult)
                  }
                ]
              };
              break;
            }

            default:
              return {
                jsonrpc: '2.0',
                error: {
                  code: -32601,
                  message: `Tool not found: ${toolName}`
                },
                id
              };
          }
          break;
        }

        case 'list_roles':
          result = await this.squadService.listRoles();
          break;

        case 'start_squad_members': {
          const config = this.configService.getConfig();
          if (config.stateMode === 'stateless') {
            result = await this.squadService.startSquadMembersStateless(
              params as unknown as Parameters<
                typeof this.squadService.startSquadMembersStateless
              >[0]
            );
          } else {
            result = await this.squadService.startSquadMembersStateful(
              params as unknown as Parameters<
                typeof this.squadService.startSquadMembersStateful
              >[0]
            );
          }
          break;
        }

        default:
          return {
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: `Method not found: ${method}`
          },
          id
        };
      }

      return { jsonrpc: '2.0', result, id };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message:
            error instanceof Error ? error.message : 'Internal error'
        },
        id
      };
    }
  }

  private sendResponse(response: IMcpResponse): void {
    const json = JSON.stringify(response);
    process.stdout.write(json + '\n');
  }
}

