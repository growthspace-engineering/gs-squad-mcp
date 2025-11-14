import { Injectable } from '@nestjs/common';
import { readdir, readFile } from 'fs/promises';
import { join, basename, extname } from 'path';
import matter from 'gray-matter';
import { IRoleDefinition } from '@gs-squad-mcp/core/roles';
import { SquadConfigService } from '@gs-squad-mcp/core/config';

@Injectable()
export class RoleRepositoryService {
  private rolesCache: Map<string, IRoleDefinition> | null = null;

  constructor(private readonly configService: SquadConfigService) {}

  async getAllRoles(): Promise<IRoleDefinition[]> {
    if (this.rolesCache === null) {
      await this.loadRoles();
    }
    return Array.from(this.rolesCache!.values());
  }

  async getRoleById(roleId: string): Promise<IRoleDefinition | null> {
    if (this.rolesCache === null) {
      await this.loadRoles();
    }
    return this.rolesCache!.get(roleId) || null;
  }

  private async loadRoles(): Promise<void> {
    const config = this.configService.getConfig();
    const agentsPath = config.agentsDirectoryPath;
    const rolesMap = new Map<string, IRoleDefinition>();

    try {
      const files = await readdir(agentsPath);
      const markdownFiles = files.filter(
        (file) => extname(file) === '.md'
      );

      for (const file of markdownFiles) {
        const filePath = join(agentsPath, file);
        const roleId = basename(file, '.md');
        const content = await readFile(filePath, 'utf-8');
        const parsed = matter(content);

        const role: IRoleDefinition = {
          id: roleId,
          name: parsed.data.name || roleId,
          description: parsed.data.description || '',
          body: parsed.content.trim()
        };

        rolesMap.set(roleId, role);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to load roles from ${agentsPath}: ${errorMessage}`
      );
    }

    this.rolesCache = rolesMap;
  }
}

