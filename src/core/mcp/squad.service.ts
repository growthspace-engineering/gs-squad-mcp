import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
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

@Injectable()
export class SquadService {
  constructor(
    private readonly roleRepository: RoleRepositoryService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly templateRenderer: TemplateRendererService,
    private readonly processRunner: ProcessRunnerService,
    private readonly configService: SquadConfigService
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
    const squadId = this.generateSquadId();
    const config = this.configService.getConfig();
    const workspaceRoot = process.cwd();

    const members = await Promise.all(
      payload.members.map(async (memberInput, index) => {
        const memberId = this.generateMemberId(squadId, index);
        return this.executeStatelessMember(
          memberInput,
          memberId,
          config,
          workspaceRoot
        );
      })
    );

    return { squadId, members };
  }

  async startSquadMembersStateful(
    payload: IStartSquadMembersStatefulPayload
  ): Promise<IStartSquadMembersStatefulResponse> {
    const squadId = this.generateSquadId();
    const config = this.configService.getConfig();
    const workspaceRoot = process.cwd();

    const members = await Promise.all(
      payload.members.map(async (memberInput, index) => {
        const memberId = this.generateMemberId(squadId, index);
        return this.executeStatefulMember(
          memberInput,
          memberId,
          config,
          workspaceRoot
        );
      })
    );

    return { squadId, members };
  }

  private async executeStatelessMember(
    memberInput: {
      roleId: string;
      task: string;
      cwd?: string;
    },
    memberId: string,
    config: ReturnType<typeof this.configService.getConfig>,
    workspaceRoot: string
  ): Promise<IStartSquadMemberOutputBase> {
    const role = await this.roleRepository.getRoleById(memberInput.roleId);
    if (!role) {
      throw new Error(`Role not found: ${memberInput.roleId}`);
    }

    const prompt = this.promptBuilder.buildPromptStateless(
      role,
      memberInput.task
    );

    const resolvedCwd = memberInput.cwd
      ? resolve(workspaceRoot, memberInput.cwd)
      : workspaceRoot;

    const templateContent = await readFile(config.runTemplatePath, 'utf-8');
    const args = this.templateRenderer.render(templateContent, {
      prompt,
      cwd: resolvedCwd,
      roleId: memberInput.roleId,
      task: memberInput.task
    });

    const result = await this.processRunner.runProcess(
      config.engineCommand,
      args,
      resolvedCwd,
      config.processTimeoutMs
    );

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
      const createChatArgs = this.templateRenderer.render(
        createChatTemplate,
        {
          roleId: memberInput.roleId,
          cwd: resolvedCwd
        }
      );

      const createChatResult = await this.processRunner.runProcess(
        config.engineCommand,
        createChatArgs,
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

    const prompt = hadChatId
      ? this.promptBuilder.buildPromptStatefulExistingChat(memberInput.task)
      : this.promptBuilder.buildPromptStatefulNewChat(role, memberInput.task);

    const runTemplateContent = await readFile(config.runTemplatePath, 'utf-8');
    const runArgs = this.templateRenderer.render(runTemplateContent, {
      prompt,
      chatId: chatId || undefined,
      cwd: resolvedCwd,
      roleId: memberInput.roleId,
      task: memberInput.task
    });

    const result = await this.processRunner.runProcess(
      config.engineCommand,
      runArgs,
      resolvedCwd,
      config.processTimeoutMs
    );

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
}

