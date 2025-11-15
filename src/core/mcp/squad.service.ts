import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { render } from 'ejs';
import { randomUUID } from 'crypto';
import { IListRolesResponse } from
  '@gs-squad-mcp/core/mcp/contracts';
import { IStartSquadMembersStatelessPayload } from
  '@gs-squad-mcp/core/mcp/contracts';
import { IStartSquadMembersStatelessResponse } from
  '@gs-squad-mcp/core/mcp/contracts';
import { IStartSquadMemberOutputBase } from
  '@gs-squad-mcp/core/mcp/contracts';
import { IStartSquadMembersStatefulPayload } from
  '@gs-squad-mcp/core/mcp/contracts';
import { IStartSquadMembersStatefulResponse } from
  '@gs-squad-mcp/core/mcp/contracts';
import { IStartSquadMemberStatefulOutput } from
  '@gs-squad-mcp/core/mcp/contracts';
import { RoleRepositoryService } from '@gs-squad-mcp/core/roles';
import { PromptBuilderService } from '@gs-squad-mcp/core/prompt';
import { TemplateRendererService } from '@gs-squad-mcp/core/engine';
import { ProcessRunnerService } from '@gs-squad-mcp/core/engine';
import { SquadConfigService } from '@gs-squad-mcp/core/config';
import { SquadTelemetryService } from '../telemetry/squad-telemetry.service';

@Injectable()
export class SquadService {
  constructor(
    private readonly roleRepository: RoleRepositoryService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly templateRenderer: TemplateRendererService,
    private readonly processRunner: ProcessRunnerService,
    private readonly configService: SquadConfigService,
    private readonly telemetry: SquadTelemetryService
  ) {}

  async listRoles(): Promise<IListRolesResponse> {
    const roles = await this.roleRepository.getAllRoles();
    return {
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description
      }))
    };
  }

  async startSquadMembersStateless(
    payload: IStartSquadMembersStatelessPayload
  ): Promise<IStartSquadMembersStatelessResponse> {
    const originatorId = await this.telemetry.ensureSession({
      orchestratorChatId: payload.orchestratorChatId,
      workspaceId: payload.workspaceId
    });
    const label = payload.members.map((m) => m.roleId).join(' + ');
    const squad = await this.telemetry.createSquad(originatorId, label);
    const squadId = squad.squadId;
    const config = this.configService.getConfig();
    const workspaceRoot = process.cwd();

    const requiresSerial = this.requiresSerialExecution(
      config.engine,
      config.executionMode
    );
    const members: IStartSquadMemberOutputBase[] = [];

    if (requiresSerial) {
      for (let index = 0; index < payload.members.length; index += 1) {
        const memberInput = payload.members[index];
        const memberId = this.generateMemberId(squadId, index);
        const result = await this.executeStatelessMember(
          memberInput,
          memberId,
          squadId,
          originatorId,
          config,
          workspaceRoot
        );
        members.push(result);

        // If not last member, delay before next execution
        if (
          index < payload.members.length - 1 &&
          config.sequentialDelayMs > 0
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, config.sequentialDelayMs)
          );
        }
      }
    } else {
      const parallelResults = await Promise.all(
        payload.members.map(async (memberInput, index) => {
          const memberId = this.generateMemberId(squadId, index);
          const res = await this.executeStatelessMember(
          memberInput,
          memberId,
          squadId,
          originatorId,
          config,
          workspaceRoot
        );
          return res;
      })
    );
      members.push(...parallelResults);
    }

    return { squadId, members };
  }

  async startSquadMembersStateful(
    payload: IStartSquadMembersStatefulPayload
  ): Promise<IStartSquadMembersStatefulResponse> {
    const originatorId = await this.telemetry.ensureSession({
      orchestratorChatId: payload.orchestratorChatId,
      workspaceId: payload.workspaceId
    });
    const label = payload.members.map((m) => m.roleId).join(' + ');
    const squad = await this.telemetry.createSquad(originatorId, label);
    const squadId = squad.squadId;
    const config = this.configService.getConfig();
    const workspaceRoot = process.cwd();

    const requiresSerial = this.requiresSerialExecution(
      config.engine,
      config.executionMode
    );
    const members: IStartSquadMemberStatefulOutput[] = [];

    if (requiresSerial) {
      for (let index = 0; index < payload.members.length; index += 1) {
        const memberInput = payload.members[index];
        const memberId = this.generateMemberId(squadId, index);
        const result = await this.executeStatefulMember(
          memberInput,
          memberId,
          squadId,
          originatorId,
          config,
          workspaceRoot
        );
        members.push(result);

        // If not last member, delay before next execution
        if (
          index < payload.members.length - 1 &&
          config.sequentialDelayMs > 0
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, config.sequentialDelayMs)
          );
        }
      }
    } else {
      const parallelResults = await Promise.all(
        payload.members.map(async (memberInput, index) => {
          const memberId = this.generateMemberId(squadId, index);
          const res = await this.executeStatefulMember(
          memberInput,
          memberId,
          squadId,
          originatorId,
          config,
          workspaceRoot
        );
          return res;
      })
    );
      members.push(...parallelResults);
    }

    return { squadId, members };
  }

  /**
   * Escapes a prompt string for safe use in double-quoted shell arguments.
   * Escapes special characters and converts newlines to literal \n.
   */
  private escapePromptForShell(prompt: string): string {
    return prompt
      .replace(/\\/g, '\\\\') // Escape backslashes first
      .replace(/\$/g, '\\$') // Escape dollar signs
      .replace(/`/g, '\\`') // Escape backticks
      .replace(/"/g, '\\"') // Escape double quotes
      .replace(/\n/g, '\\n') // Convert newlines to literal \n
      .replace(/\r/g, ''); // Remove carriage returns
  }

  private async executeStatelessMember(
    memberInput: {
      roleId: string;
      task: string;
      cwd?: string;
    },
    memberId: string,
    squadId: string,
    originatorId: string,
    config: ReturnType<typeof this.configService.getConfig>,
    workspaceRoot: string
  ): Promise<IStartSquadMemberOutputBase> {
    const role = await this.roleRepository.getRoleById(memberInput.roleId);
    if (!role) {
      throw new Error(`Role not found: ${memberInput.roleId}`);
    }

    const rawPrompt = this.promptBuilder.buildPromptStateless(
      role,
      memberInput.task
    );
    const prompt = this.escapePromptForShell(rawPrompt);
    let agentIdForTelemetry: string | null = null;
    try {
      const agent = await this.telemetry.createAgent(
        squadId,
        role.name,
        memberInput.task,
        rawPrompt
      );
      agentIdForTelemetry = agent.agentId;
    } catch {}

    const resolvedCwd = memberInput.cwd
      ? resolve(workspaceRoot, memberInput.cwd)
      : workspaceRoot;

    const templateContent = await readFile(config.runTemplatePath, 'utf-8');
    let renderedCommand: string;
    try {
      // Render the template to get the full command string
      const rendered = render(templateContent, {
        prompt,
        cwd: resolvedCwd,
        roleId: memberInput.roleId,
        task: memberInput.task,
        chatId: undefined // Not used in stateless mode, but needed for template
      });
      renderedCommand = rendered.trim();
    } catch (error) {
      throw new Error(
        `Failed to render template ${config.runTemplatePath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    if (!renderedCommand || renderedCommand.length === 0) {
      throw new Error(
        `Template ${config.runTemplatePath} rendered to empty command`
      );
    }

    const result = await this.processRunner.runProcess(
      renderedCommand,
      [],
      resolvedCwd,
      config.processTimeoutMs
    );

    // Update telemetry
    if (agentIdForTelemetry) {
      const finishedIso = new Date().toISOString();
      const statusNow = this.mapStatus(result.exitCode, result.timedOut);
      try {
        await this.telemetry.updateAgentStatus(
          originatorId,
          agentIdForTelemetry,
          {
            status: statusNow === 'completed' ? 'done' : 'error',
            result: result.stdout,
            error: result.stderr,
            finishedAt: finishedIso
          }
        );
      } catch {}
    }

    return {
      memberId,
      roleId: memberInput.roleId,
      cwd: memberInput.cwd,
      status: this.mapStatus(result.exitCode, result.timedOut),
      rawStdout: result.stdout,
      rawStderr: result.stderr
    };
  }

  private async executeStatefulMember(
    memberInput: {
      roleId: string;
      task: string;
      cwd?: string;
      chatId?: string | null;
    },
    memberId: string,
    squadId: string,
    originatorId: string,
    config: ReturnType<typeof this.configService.getConfig>,
    workspaceRoot: string
  ): Promise<IStartSquadMemberStatefulOutput> {
    const role = await this.roleRepository.getRoleById(memberInput.roleId);
    if (!role) {
      throw new Error(`Role not found: ${memberInput.roleId}`);
    }

    const resolvedCwd = memberInput.cwd
      ? resolve(workspaceRoot, memberInput.cwd)
      : workspaceRoot;

    const hadChatId = !!memberInput.chatId;
    let chatId = memberInput.chatId || null;

    if (!chatId && config.createChatTemplatePath) {
      const createChatTemplate = await readFile(
        config.createChatTemplatePath,
        'utf-8'
      );
      let renderedCreateChatCommand: string;
      try {
        const generatedUuid = randomUUID();
        renderedCreateChatCommand = render(createChatTemplate, {
          roleId: memberInput.roleId,
          cwd: resolvedCwd,
          generatedUuid
        }).trim();
      } catch (error) {
        throw new Error(
          `Failed to render create-chat template ${
            config.createChatTemplatePath
          }: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      if (
        !renderedCreateChatCommand ||
        renderedCreateChatCommand.length === 0
      ) {
        throw new Error(
          `Create-chat template ${
            config.createChatTemplatePath
          } rendered to empty command`
        );
      }

      const createChatResult = await this.processRunner.runProcess(
        renderedCreateChatCommand,
        [],
        resolvedCwd,
        config.processTimeoutMs
      );

      if (createChatResult.exitCode !== 0) {
        const errorMsg =
          createChatResult.stderr || createChatResult.stdout;
        throw new Error(`Failed to create chat: ${errorMsg}`);
      }

      chatId = createChatResult.stdout.trim();
      if (!chatId) {
        throw new Error('Failed to extract chatId from create-chat output');
      }
    }

    const rawPrompt = hadChatId
      ? this.promptBuilder.buildPromptStatefulExistingChat(memberInput.task)
      : this.promptBuilder.buildPromptStatefulNewChat(role, memberInput.task);
    const prompt = this.escapePromptForShell(rawPrompt);
    let agentIdForTelemetry: string | null = null;
    try {
      const agent = await this.telemetry.createAgent(
        squadId,
        role.name,
        memberInput.task,
        rawPrompt
      );
      agentIdForTelemetry = agent.agentId;
    } catch {}

    const runTemplateContent = await readFile(config.runTemplatePath, 'utf-8');
    let renderedRunCommand: string;
    try {
      // Render the template to get the full command string
      renderedRunCommand = render(runTemplateContent, {
        prompt,
        chatId: chatId || undefined,
        cwd: resolvedCwd,
        roleId: memberInput.roleId,
        task: memberInput.task
      }).trim();
    } catch (error) {
      throw new Error(
        `Failed to render template ${config.runTemplatePath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    if (!renderedRunCommand || renderedRunCommand.length === 0) {
      throw new Error(
        `Template ${config.runTemplatePath} rendered to empty command`
      );
    }

    const result = await this.processRunner.runProcess(
      renderedRunCommand,
      [],
      resolvedCwd,
      config.processTimeoutMs
    );

    if (agentIdForTelemetry) {
      const finishedIso = new Date().toISOString();
      const statusNow = this.mapStatus(result.exitCode, result.timedOut);
      try {
        await this.telemetry.updateAgentStatus(
          originatorId,
          agentIdForTelemetry,
          {
            status: statusNow === 'completed' ? 'done' : 'error',
            result: result.stdout,
            error: result.stderr,
            finishedAt: finishedIso
          }
        );
      } catch {}
    }

    return {
      memberId,
      roleId: memberInput.roleId,
      cwd: memberInput.cwd,
      chatId: chatId!,
      status: this.mapStatus(result.exitCode, result.timedOut),
      rawStdout: result.stdout,
      rawStderr: result.stderr
    };
  }

  private generateSquadId(): string {
    return `squad-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMemberId(squadId: string, index: number): string {
    return `${squadId}-m${index}`;
  }

  private mapStatus(
    exitCode: number | null,
    timedOut: boolean
  ): 'completed' | 'error' | 'timeout' {
    if (timedOut) {
      return 'timeout';
    }
    if (exitCode === 0) {
      return 'completed';
    }
    return 'error';
  }

  private requiresSerialExecution(
    engine: 'cursor-agent' | 'claude' | 'codex',
    executionMode?: 'sequential' | 'parallel'
  ): boolean {
    const envOverride = process.env.PROCESS_RUNNER_SERIALIZE;
    if (envOverride === 'true') {
      return true;
    }
    if (envOverride === 'false') {
      return false;
    }
    if (executionMode === 'sequential') {
      return true;
    }
    if (executionMode === 'parallel') {
      return false;
    }
    return engine === 'cursor-agent';
  }
}

