// IStartSquadMemberInputCommon is not used in this file but kept for reference

export interface IStartSquadMemberOutputBase {
  memberId: string;
  roleId: string;
  cwd?: string;
  status: 'completed' | 'error' | 'timeout';
  rawStdout: string;
  rawStderr: string;
}

export interface IStartSquadMembersStatelessResponse {
  squadId: string;
  members: IStartSquadMemberOutputBase[];
}

