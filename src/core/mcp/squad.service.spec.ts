describe('SquadService', () => {
  describe('listRoles', () => {
    test.todo('should return expected shape');
    test.todo('should reflect updated agents');
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

