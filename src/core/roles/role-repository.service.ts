import { Injectable } from '@nestjs/common';
import { IRoleDefinition } from './role-definition.interface';

@Injectable()
export class RoleRepositoryService {
  async getAllRoles(): Promise<IRoleDefinition[]> {
    // TODO: Implement role loading from agents directory
    return [];
  }

  async getRoleById(_roleId: string): Promise<IRoleDefinition | null> {
    // TODO: Implement role lookup by ID
    return null;
  }
}

