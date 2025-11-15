import { Test, TestingModule } from '@nestjs/testing';
import { RoleRepositoryService } from './role-repository.service';
import { SquadConfigService } from '@gs-squad-mcp/core/config';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('RoleRepositoryService', () => {
  let service: RoleRepositoryService;
  let testAgentsDir: string;

  beforeEach(async () => {
    testAgentsDir = join(tmpdir(), `test-agents-${Date.now()}`);
    await mkdir(testAgentsDir, { recursive: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleRepositoryService,
        {
          provide: SquadConfigService,
          useValue: {
            getConfig: () => ({
              agentsDirectoryPath: testAgentsDir,
              stateMode: 'stateless' as const,
              engine: 'cursor-agent' as const,
              executionMode: undefined,
              runTemplatePath: 'templates/run-cursor-agent.template',
              processTimeoutMs: 300000
            })
          }
        }
      ]
    }).compile();

    service = module.get<RoleRepositoryService>(RoleRepositoryService);
  });

  afterEach(async () => {
    try {
      await rm(testAgentsDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should load roles from agents directory', async () => {
    await writeFile(
      join(testAgentsDir, 'test-role.md'),
      `---
name: Test Role
description: A test role description
---

This is the role body content.
`
    );

    const roles = await service.getAllRoles();
    expect(roles).toHaveLength(1);
    expect(roles[0].id).toBe('test-role');
    expect(roles[0].name).toBe('Test Role');
    expect(roles[0].description).toBe('A test role description');
    expect(roles[0].body).toBe('This is the role body content.');
  });

  it('should parse frontmatter correctly', async () => {
    await writeFile(
      join(testAgentsDir, 'frontend.md'),
      `---
name: Frontend Developer
description: Frontend specialist
---

Role body here.
`
    );

    const role = await service.getRoleById('frontend');
    expect(role).not.toBeNull();
    expect(role!.name).toBe('Frontend Developer');
    expect(role!.description).toBe('Frontend specialist');
    expect(role!.body).toBe('Role body here.');
  });

  it('should fallback to roleId when name is missing', async () => {
    await writeFile(
      join(testAgentsDir, 'backend.md'),
      `---
description: Backend specialist
---

Role body.
`
    );

    const role = await service.getRoleById('backend');
    expect(role).not.toBeNull();
    expect(role!.name).toBe('backend');
    expect(role!.id).toBe('backend');
  });

  it('should return null for unknown role', async () => {
    const role = await service.getRoleById('unknown-role');
    expect(role).toBeNull();
  });

  it('should cache roles after first load', async () => {
    await writeFile(
      join(testAgentsDir, 'role1.md'),
      `---
name: Role 1
description: First role
---

Body 1.
`
    );

    const roles1 = await service.getAllRoles();
    expect(roles1).toHaveLength(1);

    // Add another file - cache should prevent reload
    await writeFile(
      join(testAgentsDir, 'role2.md'),
      `---
name: Role 2
description: Second role
---

Body 2.
`
    );

    const roles2 = await service.getAllRoles();
    expect(roles2).toHaveLength(1); // Still cached
  });
});
