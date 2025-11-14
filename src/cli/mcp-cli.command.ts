import { Command, CommandRunner } from 'nest-commander';
import { SquadService } from '../core/mcp';
import { SquadConfigService } from '../core/config';
import * as readline from 'readline';

interface IMcpRequest {
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

interface IMcpResponse {
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

  async run(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', async (line: string) => {
      try {
        const request: IMcpRequest = JSON.parse(line);
        const response = await this.handleRequest(request);
        this.sendResponse(response);
      } catch (error) {
        const errorResponse: IMcpResponse = {
          error: {
            code: -32700,
            message:
              error instanceof Error ? error.message : 'Parse error'
          }
        };
        this.sendResponse(errorResponse);
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
            error: {
              code: -32601,
              message: `Method not found: ${method}`
            },
            id
          };
      }

      return { result, id };
    } catch (error) {
      return {
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

