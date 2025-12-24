import { Injectable } from '@nestjs/common';
import { ISquadConfig, SquadStateMode } from './squad-config.interface';

@Injectable()
export class SquadConfigService {
  private readonly config: ISquadConfig;

  constructor() {
    const getArgValue = (flagName: string): string | undefined => {
      const argv = process.argv || [];
      for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg.startsWith(`--${flagName}=`)) {
          return arg.slice(flagName.length + 3);
        }
        if (arg === `--${flagName}`) {
          return argv[i + 1];
        }
      }
      return undefined;
    };

    const hasFlag = (flagName: string): boolean => {
      const argv = process.argv || [];
      return argv.includes(`--${flagName}`);
    };

    const stateModeArg =
      getArgValue('state-mode') as SquadStateMode | undefined;
    const stateMode =
      (stateModeArg || (process.env.STATE_MODE as SquadStateMode))
      || 'stateless';
    if (stateMode !== 'stateless' && stateMode !== 'stateful') {
      throw new Error(
        `Invalid STATE_MODE: ${stateMode}. ` +
        'Must be \'stateless\' or \'stateful\''
      );
    }

    // Resolve engine from CLI flag or env, default to cursor-agent
    const engineFromArg = getArgValue('engine') as
      | 'cursor-agent'
      | 'claude'
      | 'codex'
      | undefined;
    const engineEnv = process.env.ENGINE as
      | 'cursor-agent'
      | 'claude'
      | 'codex'
      | undefined;
    const engine = engineFromArg || engineEnv || 'cursor-agent';
    if (!([ 'cursor-agent', 'claude', 'codex' ] as const).includes(engine)) {
      throw new Error(
        'Invalid ENGINE: ' +
        engine +
        '. Must be \'cursor-agent\', \'claude\', or \'codex\''
      );
    }

    // Execution mode (used when custom template provided)
    const execModeArg = getArgValue('execution-mode') as
      | 'sequential'
      | 'parallel'
      | undefined;
    const sequentialFlag = hasFlag('sequential');
    const execModeEnv = process.env.EXECUTION_MODE as
      | 'sequential'
      | 'parallel'
      | undefined;
    const executionMode: 'sequential' | 'parallel' | undefined =
      execModeArg
      || (sequentialFlag ? 'sequential' : undefined)
      || execModeEnv;
    if (
      executionMode &&
      executionMode !== 'sequential' &&
      executionMode !== 'parallel'
    ) {
      throw new Error(
        'Invalid EXECUTION_MODE: ' +
        executionMode +
        '. Must be \'sequential\' or \'parallel\''
      );
    }

    const sequentialDelayRaw = parseInt(
      process.env.SEQUENTIAL_DELAY_MS || '100',
      10
    );

    const providedRunTemplatePath = process.env.RUN_TEMPLATE_PATH;
    const resolvedRunTemplatePath =
      providedRunTemplatePath
      || (engine === 'cursor-agent'
        ? 'templates/run-cursor-agent.template'
        : engine === 'claude'
          ? 'templates/run-claude.template'
          : 'templates/run-codex.template');

    // If user provided a custom template explicitly, require execution mode
    if (providedRunTemplatePath && !executionMode) {
      throw new Error(
        'EXECUTION_MODE is required when providing RUN_TEMPLATE_PATH. ' +
        'Set EXECUTION_MODE=sequential|parallel or pass --execution-mode.'
      );
    }

    this.config = {
      stateMode,
      engine,
      executionMode,
      runTemplatePath: resolvedRunTemplatePath,
      createChatTemplatePath:
        process.env.CREATE_CHAT_TEMPLATE_PATH
        || (stateMode === 'stateful'
          ? (engine === 'cursor-agent'
              ? 'templates/create-chat-cursor-agent.template'
              : engine === 'claude'
                ? 'templates/create-chat-claude.template'
                : 'templates/create-chat-codex.template')
          : undefined),
      agentsDirectoryPath:
        process.env.AGENTS_DIRECTORY_PATH || 'agents',
      processTimeoutMs: parseInt(
        process.env.PROCESS_TIMEOUT_MS || '600000',
        10
      ),
      sequentialDelayMs: Number.isNaN(sequentialDelayRaw)
        ? 1000
        : Math.max(0, sequentialDelayRaw)
    };

    // When stateful, createChatTemplatePath is set (provided or defaulted)
  }

  getConfig(): ISquadConfig {
    return { ...this.config };
  }
}

