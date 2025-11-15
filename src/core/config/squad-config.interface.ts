export type SquadStateMode = 'stateless' | 'stateful';

export interface ISquadConfig {
  stateMode: SquadStateMode;
  engine: 'cursor-agent' | 'claude' | 'codex';
  executionMode?: 'sequential' | 'parallel';
  runTemplatePath: string;
  createChatTemplatePath?: string;
  agentsDirectoryPath: string;
  processTimeoutMs: number;
  sequentialDelayMs: number;
}

