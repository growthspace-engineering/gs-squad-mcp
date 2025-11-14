import { IStartSquadMemberOutputBase } from
  './start-squad-members-stateless.response';

export interface IStartSquadMemberStatefulOutput
  extends IStartSquadMemberOutputBase {
  chatId: string;
}

export interface IStartSquadMembersStatefulResponse {
  squadId: string;
  members: IStartSquadMemberStatefulOutput[];
}

