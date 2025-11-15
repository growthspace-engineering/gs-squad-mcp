import { SquadConfigService } from './squad-config.service';

describe('SquadConfigService', () => {
  let service: SquadConfigService;
  const originalEnv = process.env;
  const originalArgv = process.argv;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.argv = [ ...originalArgv ];
  });

  afterEach(() => {
    process.env = originalEnv;
    process.argv = originalArgv;
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

  it(
    'should resolve create-chat template based on engine when stateful',
    () => {
      process.env.STATE_MODE = 'stateful';
      process.env.ENGINE = 'claude';
      delete process.env.CREATE_CHAT_TEMPLATE_PATH;

      service = new SquadConfigService();
      const config = service.getConfig();
      expect(config.createChatTemplatePath)
        .toBe('templates/create-chat-claude.template');
    }
  );

  it('should return a copy of config', () => {
    service = new SquadConfigService();
    const config1 = service.getConfig();
    const config2 = service.getConfig();

    expect(config1).toEqual(config2);
    expect(config1).not.toBe(config2);
  });

  it('should throw error for invalid ENGINE values', () => {
    process.env.ENGINE = 'bad-engine' as any;

    expect(() => {
      service = new SquadConfigService();
    }).toThrow(
      'Invalid ENGINE: bad-engine. ' +
      'Must be \'cursor-agent\', \'claude\', or \'codex\''
    );
  });

  it('should throw error for invalid execution modes provided via CLI', () => {
    process.argv = [
      process.argv[0],
      process.argv[1],
      '--execution-mode',
      'invalid-mode'
    ];

    expect(() => {
      service = new SquadConfigService();
    }).toThrow(
      'Invalid EXECUTION_MODE: invalid-mode. ' +
      'Must be \'sequential\' or \'parallel\''
    );
  });

  it(
    [
      'should prioritize CLI args over env vars for',
      'state mode, engine, and execution mode'
    ].join(' '),
    () => {
      process.env.STATE_MODE = 'stateless';
      process.env.ENGINE = 'claude';
      process.env.EXECUTION_MODE = 'parallel';
      process.argv = [
        process.argv[0],
        process.argv[1],
        '--state-mode',
        'stateful',
        '--engine=codex',
        '--execution-mode',
        'sequential'
      ];

      service = new SquadConfigService();
      const config = service.getConfig();

      expect(config.stateMode).toBe('stateful');
      expect(config.engine).toBe('codex');
      expect(config.executionMode).toBe('sequential');
    }
  );

  it('should respect --sequential flag and override env execution mode', () => {
    process.env.EXECUTION_MODE = 'parallel';
    process.argv = [
      process.argv[0],
      process.argv[1],
      '--sequential'
    ];

    service = new SquadConfigService();
    const config = service.getConfig();

    expect(config.executionMode).toBe('sequential');
  });

  it(
    'should throw when RUN_TEMPLATE_PATH is provided without execution mode',
    () => {
      process.env.RUN_TEMPLATE_PATH = 'custom/path.template';
      delete process.env.EXECUTION_MODE;

      expect(() => {
        service = new SquadConfigService();
      }).toThrow(
        'EXECUTION_MODE is required when providing RUN_TEMPLATE_PATH. ' +
        'Set EXECUTION_MODE=sequential|parallel or pass --execution-mode.'
      );
    }
  );

  it('should clamp negative sequential delay values to zero', () => {
    process.env.SEQUENTIAL_DELAY_MS = '-50';

    service = new SquadConfigService();
    const config = service.getConfig();

    expect(config.sequentialDelayMs).toBe(0);
  });

  it(
    'should fallback to 1000ms when sequential delay env var is not a number',
    () => {
      process.env.SEQUENTIAL_DELAY_MS = 'abc';

      service = new SquadConfigService();
      const config = service.getConfig();

      expect(config.sequentialDelayMs).toBe(1000);
    }
  );

  it('should throw for invalid engine specified via CLI', () => {
    process.argv = [
      process.argv[0],
      process.argv[1],
      '--engine',
      'bad-engine'
    ];

    expect(() => {
      service = new SquadConfigService();
    }).toThrow(
      'Invalid ENGINE: bad-engine. ' +
      'Must be \'cursor-agent\', \'claude\', or \'codex\''
    );
  });

  it('should parse CLI equals syntax for state mode and engine', () => {
    process.argv = [
      process.argv[0],
      process.argv[1],
      '--state-mode=stateful',
      '--engine=claude'
    ];

    service = new SquadConfigService();
    const config = service.getConfig();

    expect(config.stateMode).toBe('stateful');
    expect(config.engine).toBe('claude');
  });
});
