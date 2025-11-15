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
    delete process.env.ENGINE;
    delete process.env.RUN_TEMPLATE_PATH;
    delete process.env.CREATE_CHAT_TEMPLATE_PATH;
    delete process.env.AGENTS_DIRECTORY_PATH;
    delete process.env.PROCESS_TIMEOUT_MS;
    delete process.env.SEQUENTIAL_DELAY_MS;

    service = new SquadConfigService();
    const config = service.getConfig();

    expect(config.stateMode).toBe('stateless');
    expect(config.engine).toBe('cursor-agent');
    expect(config.runTemplatePath).toBe('templates/run-cursor-agent.template');
    expect(config.createChatTemplatePath).toBeUndefined();
    expect(config.agentsDirectoryPath).toBe('agents');
    expect(config.processTimeoutMs).toBe(300000);
    expect(config.sequentialDelayMs).toBe(100);
  });

  it('should override defaults with env vars when provided', () => {
    process.env.STATE_MODE = 'stateful';
    process.env.ENGINE = 'claude';
    process.env.RUN_TEMPLATE_PATH = 'custom/run.template';
    process.env.CREATE_CHAT_TEMPLATE_PATH = 'custom/create-chat.template';
    process.env.AGENTS_DIRECTORY_PATH = 'custom-agents';
    process.env.PROCESS_TIMEOUT_MS = '60000';
    process.env.SEQUENTIAL_DELAY_MS = '250';
    process.env.EXECUTION_MODE = 'parallel';

    service = new SquadConfigService();
    const config = service.getConfig();

    expect(config.stateMode).toBe('stateful');
    expect(config.engine).toBe('claude');
    expect(config.runTemplatePath).toBe('custom/run.template');
    expect(config.createChatTemplatePath).toBe('custom/create-chat.template');
    expect(config.agentsDirectoryPath).toBe('custom-agents');
    expect(config.processTimeoutMs).toBe(60000);
    expect(config.sequentialDelayMs).toBe(250);
  });

  it('should throw error for invalid STATE_MODE', () => {
    process.env.STATE_MODE = 'invalid-mode';

    expect(() => {
      service = new SquadConfigService();
    }).toThrow(
      'Invalid STATE_MODE: invalid-mode. Must be \'stateless\' or \'stateful\''
    );
  });

  it('should auto-select default create-chat template in stateful mode', () => {
    process.env.STATE_MODE = 'stateful';
    delete process.env.CREATE_CHAT_TEMPLATE_PATH;
    delete process.env.ENGINE;

    service = new SquadConfigService();
    const config = service.getConfig();
    expect(config.createChatTemplatePath)
      .toBe('templates/create-chat-cursor-agent.template');
  });

  it('should return a copy of config', () => {
    service = new SquadConfigService();
    const config1 = service.getConfig();
    const config2 = service.getConfig();

    expect(config1).toEqual(config2);
    expect(config1).not.toBe(config2);
  });
});
