import { Test, TestingModule } from '@nestjs/testing';
import { SquadService } from './squad.service';
import { RoleRepositoryService } from '../roles/role-repository.service';
import { IRoleDefinition } from '../roles/role-definition.interface';

describe('SquadService', () => {
  let service: SquadService;
  let roleRepository: RoleRepositoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SquadService,
        {
          provide: RoleRepositoryService,
          useValue: {
            getAllRoles: jest.fn(),
            getRoleById: jest.fn()
          }
        }
      ]
    }).compile();

    service = module.get<SquadService>(SquadService);
    roleRepository = module.get<RoleRepositoryService>(
      RoleRepositoryService
    );
  });

  describe('listRoles', () => {
    it('should return expected shape', async () => {
      const mockRoles: IRoleDefinition[] = [
        {
          id: 'frontend-developer',
          name: 'Frontend Developer',
          description: 'Frontend specialist',
          body: 'Role body'
        },
        {
          id: 'backend-developer',
          name: 'Backend Developer',
          description: 'Backend specialist',
          body: 'Role body'
        }
      ];

      jest.spyOn(roleRepository, 'getAllRoles').mockResolvedValue(mockRoles);

      const result = await service.listRoles();

      expect(result).toEqual({
        roles: [
          {
            id: 'frontend-developer',
            name: 'Frontend Developer',
            description: 'Frontend specialist'
          },
          {
            id: 'backend-developer',
            name: 'Backend Developer',
            description: 'Backend specialist'
          }
        ]
      });
    });

    it('should reflect updated agents', async () => {
      const initialRoles: IRoleDefinition[] = [
        {
          id: 'role1',
          name: 'Role 1',
          description: 'First role',
          body: 'Body'
        }
      ];

      const updatedRoles: IRoleDefinition[] = [
        ...initialRoles,
        {
          id: 'role2',
          name: 'Role 2',
          description: 'Second role',
          body: 'Body'
        }
      ];

      jest
        .spyOn(roleRepository, 'getAllRoles')
        .mockResolvedValueOnce(initialRoles)
        .mockResolvedValueOnce(updatedRoles);

      const result1 = await service.listRoles();
      expect(result1.roles).toHaveLength(1);

      const result2 = await service.listRoles();
      expect(result2.roles).toHaveLength(2);
    });
  });

  describe('startSquadMembersStateless', () => {
    test.todo('single member happy path');
    test.todo('multiple members in one call');
    test.todo('missing role error handling');
    test.todo('status mapping (exitCode/timeouts)');
  });

  describe('startSquadMembersStateful', () => {
    test.todo('new chat returns chatId');
    test.todo('existing chat reuses chatId');
    test.todo('failure in create-chat handled gracefully');
  });
});
