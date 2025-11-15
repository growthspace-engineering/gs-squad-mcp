export type SquadStateMode = 'stateless' | 'stateful';

export interface ISquadConfig {
  stateMode: SquadStateMode;
  engineCommand: string;
  runTemplatePath: string;
  createChatTemplatePath?: string;
  agentsDirectoryPath: string;
  processTimeoutMs: number;
  sequentialDelayMs: number;
}

