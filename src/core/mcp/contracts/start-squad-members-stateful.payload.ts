import { IStartSquadMemberInputCommon } from
  './start-squad-members-stateless.payload';

export interface IStartSquadMemberStatefulInput
  extends IStartSquadMemberInputCommon {
  chatId?: string | null;
}

export interface IStartSquadMembersStatefulPayload {
  members: IStartSquadMemberStatefulInput[];
  metadata?: Record<string, unknown>;
}

