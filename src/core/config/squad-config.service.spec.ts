import { SquadConfigService } from './squad-config.service';

describe('SquadConfigService', () => {
  let service: SquadConfigService;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should provide default values when env vars are not set', () => {
    delete process.env.STATE_MODE;
    delete process.env.ENGINE_COMMAND;
    delete process.env.RUN_TEMPLATE_PATH;
    delete process.env.CREATE_CHAT_TEMPLATE_PATH;
    delete process.env.AGENTS_DIRECTORY_PATH;
    delete process.env.PROCESS_TIMEOUT_MS;

    service = new SquadConfigService();
    const config = service.getConfig();

    expect(config.stateMode).toBe('stateless');
    expect(config.engineCommand).toBe('cursor-agent');
    expect(config.runTemplatePath).toBe('templates/run-agent.template');
    expect(config.createChatTemplatePath).toBeUndefined();
    expect(config.agentsDirectoryPath).toBe('agents');
    expect(config.processTimeoutMs).toBe(300000);
  });

  it('should override defaults with env vars when provided', () => {
    process.env.STATE_MODE = 'stateful';
    process.env.ENGINE_COMMAND = 'custom-engine';
    process.env.RUN_TEMPLATE_PATH = 'custom/run.template';
    process.env.CREATE_CHAT_TEMPLATE_PATH = 'custom/create-chat.template';
    process.env.AGENTS_DIRECTORY_PATH = 'custom-agents';
    process.env.PROCESS_TIMEOUT_MS = '60000';

    service = new SquadConfigService();
    const config = service.getConfig();

    expect(config.stateMode).toBe('stateful');
    expect(config.engineCommand).toBe('custom-engine');
    expect(config.runTemplatePath).toBe('custom/run.template');
    expect(config.createChatTemplatePath).toBe('custom/create-chat.template');
    expect(config.agentsDirectoryPath).toBe('custom-agents');
    expect(config.processTimeoutMs).toBe(60000);
  });

  it('should throw error for invalid STATE_MODE', () => {
    process.env.STATE_MODE = 'invalid-mode';

    expect(() => {
      service = new SquadConfigService();
    }).toThrow(
      'Invalid STATE_MODE: invalid-mode. Must be \'stateless\' or \'stateful\''
    );
  });

  it(
    'should throw error when stateful mode missing CREATE_CHAT_TEMPLATE_PATH',
    () => {
      process.env.STATE_MODE = 'stateful';
      delete process.env.CREATE_CHAT_TEMPLATE_PATH;

      expect(() => {
        service = new SquadConfigService();
      }).toThrow(
        'CREATE_CHAT_TEMPLATE_PATH is required when STATE_MODE=stateful'
      );
    }
  );

  it('should return a copy of config', () => {
    service = new SquadConfigService();
    const config1 = service.getConfig();
    const config2 = service.getConfig();

    expect(config1).toEqual(config2);
    expect(config1).not.toBe(config2);
  });
});
