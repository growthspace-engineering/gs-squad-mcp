import { Injectable } from '@nestjs/common';
import { ISquadConfig, SquadStateMode } from './squad-config.interface';

@Injectable()
export class SquadConfigService {
  private readonly config: ISquadConfig;

  constructor() {
    const stateMode = (process.env.STATE_MODE as SquadStateMode) || 'stateless';
    if (stateMode !== 'stateless' && stateMode !== 'stateful') {
      throw new Error(
        `Invalid STATE_MODE: ${stateMode}. ` +
        'Must be \'stateless\' or \'stateful\''
      );
    }

    const sequentialDelayRaw = parseInt(
      process.env.SEQUENTIAL_DELAY_MS || '100',
      10
    );

    this.config = {
      stateMode,
      engineCommand: process.env.ENGINE_COMMAND || 'cursor-agent',
      runTemplatePath:
        process.env.RUN_TEMPLATE_PATH || 'templates/run-agent.template',
      createChatTemplatePath:
        process.env.CREATE_CHAT_TEMPLATE_PATH || undefined,
      agentsDirectoryPath:
        process.env.AGENTS_DIRECTORY_PATH || 'agents',
      processTimeoutMs: parseInt(
        process.env.PROCESS_TIMEOUT_MS || '300000',
        10
      ),
      sequentialDelayMs: Number.isNaN(sequentialDelayRaw)
        ? 1000
        : Math.max(0, sequentialDelayRaw)
    };

    if (
      this.config.stateMode === 'stateful' &&
      !this.config.createChatTemplatePath
    ) {
      throw new Error(
        'CREATE_CHAT_TEMPLATE_PATH is required when STATE_MODE=stateful'
      );
    }
  }

  getConfig(): ISquadConfig {
    return { ...this.config };
  }
}

