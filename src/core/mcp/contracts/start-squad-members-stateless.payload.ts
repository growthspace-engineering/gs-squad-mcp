export interface IStartSquadMemberInputCommon {
  roleId: string;
  task: string;
  cwd?: string;
}

export interface IStartSquadMembersStatelessPayload {
  members: IStartSquadMemberInputCommon[];
  metadata?: Record<string, unknown>;
  orchestratorChatId?: string;
  workspaceId?: string;
}

