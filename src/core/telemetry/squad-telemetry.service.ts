import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionEntity } from '../../nest/entities/session.entity';
import { SquadEntity } from '../../nest/entities/squad.entity';
import { AgentEntity } from '../../nest/entities/agent.entity';
import * as crypto from 'crypto';

@Injectable()
export class SquadTelemetryService {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessionRepo: Repository<SessionEntity>,
    @InjectRepository(SquadEntity)
    private readonly squadRepo: Repository<SquadEntity>,
    @InjectRepository(AgentEntity)
    private readonly agentRepo: Repository<AgentEntity>
  ) {}

  async ensureSession(args: {
    orchestratorChatId?: string;
    workspaceId?: string;
  }): Promise<string> {
    const originatorId =
      args.orchestratorChatId ?? args.workspaceId ?? process.cwd();

    const nowIso = new Date().toISOString();
    let session = await this.sessionRepo.findOne({
      where: { originatorId }
    });

    if (!session) {
      session = this.sessionRepo.create({
        originatorId,
        orchestratorChatId: args.orchestratorChatId,
        workspaceId: args.workspaceId ?? process.cwd(),
        createdAt: nowIso,
        lastActivityAt: nowIso
      });
    } else {
      session.lastActivityAt = nowIso;
      if (args.orchestratorChatId && !session.orchestratorChatId) {
        session.orchestratorChatId = args.orchestratorChatId;
      }
      if (args.workspaceId && !session.workspaceId) {
        session.workspaceId = args.workspaceId;
      }
    }

    await this.sessionRepo.save(session);
    return originatorId;
  }

  async createSquad(
    originatorId: string,
    label: string
  ): Promise<SquadEntity> {
    const squad = this.squadRepo.create({
      squadId: crypto.randomUUID(),
      originatorId,
      createdAt: new Date().toISOString(),
      label
    });
    await this.squadRepo.save(squad);
    await this.touchSession(originatorId);
    return squad;
  }

  async createAgent(
    squadId: string,
    roleName: string,
    task: string | undefined,
    prompt: string | undefined
  ): Promise<AgentEntity> {
    const agent = this.agentRepo.create({
      agentId: crypto.randomUUID(),
      squadId,
      roleName,
      task,
      prompt,
      status: 'starting',
      startedAt: new Date().toISOString()
    });
    await this.agentRepo.save(agent);
    return agent;
  }

  async updateAgentStatus(
    originatorId: string,
    agentId: string,
    patch: Partial<
      Pick<AgentEntity, 'status' | 'result' | 'error' | 'finishedAt'>
    >
  ): Promise<void> {
    await this.agentRepo.update(agentId, patch);
    await this.touchSession(originatorId);
  }

  private async touchSession(originatorId: string): Promise<void> {
    await this.sessionRepo.update(originatorId, {
      lastActivityAt: new Date().toISOString()
    });
  }
}





