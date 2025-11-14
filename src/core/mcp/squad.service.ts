import { Injectable } from '@nestjs/common';
import { IListRolesResponse } from './contracts/list-roles.response';
import { IStartSquadMembersStatelessPayload } from
  './contracts/start-squad-members-stateless.payload';
import { IStartSquadMembersStatelessResponse } from
  './contracts/start-squad-members-stateless.response';
import { IStartSquadMembersStatefulPayload } from
  './contracts/start-squad-members-stateful.payload';
import { IStartSquadMembersStatefulResponse } from
  './contracts/start-squad-members-stateful.response';

@Injectable()
export class SquadService {
  async listRoles(): Promise<IListRolesResponse> {
    // TODO: Implement role listing
    return { roles: [] };
  }

  async startSquadMembersStateless(
    _payload: IStartSquadMembersStatelessPayload
  ): Promise<IStartSquadMembersStatelessResponse> {
    // TODO: Implement stateless squad member execution
    return {
      squadId: '',
      members: []
    };
  }

  async startSquadMembersStateful(
    _payload: IStartSquadMembersStatefulPayload
  ): Promise<IStartSquadMembersStatefulResponse> {
    // TODO: Implement stateful squad member execution
    return {
      squadId: '',
      members: []
    };
  }
}

