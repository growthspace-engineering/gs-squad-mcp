import { Test, TestingModule } from '@nestjs/testing';
import { ProcessRunnerService } from './process-runner.service';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';

jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

type MockChildProcess = ChildProcess & {
  stdout: Readable | null;
  stderr: Readable | null;
  stdin: Writable | null;
  stdinEndSpy?: jest.SpyInstance;
  kill: jest.MockedFunction<ChildProcess['kill']>;
};

const createMockChildProcess = (
  options: {
    includeStdout?: boolean;
    includeStderr?: boolean;
    includeStdin?: boolean;
    markKilledOnTerminate?: boolean;
    hasPid?: boolean;
  } = {}
): MockChildProcess => {
  const {
    includeStdout = true,
    includeStderr = true,
    includeStdin = true,
    markKilledOnTerminate = true,
    hasPid = true
  } = options;

  const stdout = includeStdout
    ? new Readable({
      read() {
        // no-op
      }
    }) as Readable
    : null;

  const stderr = includeStderr
    ? new Readable({
      read() {
        // no-op
      }
    }) as Readable
    : null;

  let stdin: Writable | null = null;
  let stdinEndSpy: jest.SpyInstance | undefined;

  if (includeStdin) {
    stdin = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      }
    });
    stdinEndSpy = jest.spyOn(stdin, 'end');
  }

  const child = new EventEmitter() as MockChildProcess;

  child.stdout = stdout;
  child.stderr = stderr;
  child.stdin = stdin;
  child.stdinEndSpy = stdinEndSpy;

  const pidValue = hasPid ? Math.floor(Math.random() * 1000) + 1 : undefined;
  Object.defineProperty(child, 'pid', {
    value: pidValue
  });

  let killedFlag = false;
  Object.defineProperty(child, 'killed', {
    get: () => killedFlag
  });

  child.kill = jest.fn((signal?: NodeJS.Signals | number) => {
    if (signal === 'SIGTERM' && markKilledOnTerminate) {
      killedFlag = true;
    }
    if (signal === 'SIGKILL') {
      killedFlag = true;
    }
    return true;
  });

  return child;
};

describe('ProcessRunnerService', () => {
  let service: ProcessRunnerService;
  const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

  beforeEach(async () => {
    jest.useRealTimers();
    mockSpawn.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ ProcessRunnerService ]
    }).compile();

    service = module.get<ProcessRunnerService>(ProcessRunnerService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should spawn shell command with args and capture IO', async () => {
    const mockProcess = createMockChildProcess();
    mockSpawn.mockReturnValue(mockProcess);

    const runPromise = service.runProcess(
      'echo',
      [ 'hello', 'world' ],
      '/tmp/project',
      5000
    );

    (mockProcess.stdout as Readable).emit('data', Buffer.from('hello '));
    mockProcess.stderr.emit('data', 'warning');
    (mockProcess.stdout as Readable).emit('data', 'world');
    mockProcess.emit('close', 0);

    const result = await runPromise;

    expect(mockSpawn).toHaveBeenCalledWith(
      'sh',
      [ '-c', 'echo hello world' ],
      {
        cwd: '/tmp/project',
        shell: false,
        detached: false
      }
    );
    expect(mockProcess.stdinEndSpy).toHaveBeenCalled();
    expect(result).toEqual({
      exitCode: 0,
      stdout: 'hello world',
      stderr: 'warning',
      timedOut: false
    });
  });

  it(
    'should resolve with collected stderr when process emits an error',
    async () => {
      const mockProcess = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const runPromise = service.runProcess(
        'broken-command',
        [],
        '/tmp/project',
        5000
      );

      mockProcess.stderr.emit('data', 'pre-error');
      mockProcess.emit('error', new Error('spawn failed'));

      const result = await runPromise;

      expect(result).toEqual({
        exitCode: null,
        stdout: '',
        stderr: 'pre-error',
        timedOut: false
      });
    }
  );

  it(
    'should mark execution as timed out and send termination signals',
    async () => {
      jest.useFakeTimers();
      const mockProcess = createMockChildProcess({
        markKilledOnTerminate: false
      });
      mockSpawn.mockReturnValue(mockProcess);

      const runPromise = service.runProcess(
        'sleep',
        [],
        '/tmp/project',
        1000
      );

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      const result = await runPromise;

      expect(result).toEqual({
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: true
      });
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');

      jest.advanceTimersByTime(1000);
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
    }
  );

  it(
    'should clear the timeout when the process closes before the deadline',
    async () => {
      jest.useFakeTimers();
      const mockProcess = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const runPromise = service.runProcess(
        'echo',
        [],
        '/tmp/project',
        500
      );

      mockProcess.emit('close', 0);

      const result = await runPromise;
      jest.advanceTimersByTime(500);

      expect(result).toEqual({
        exitCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false
      });
      expect(mockProcess.kill).not.toHaveBeenCalled();
    }
  );

  it(
    'should run multiple processes concurrently without leaking output',
    async () => {
      const firstProcess = createMockChildProcess();
      const secondProcess = createMockChildProcess();
      mockSpawn.mockReturnValueOnce(firstProcess).mockReturnValueOnce(
        secondProcess
      );

      const firstPromise = service.runProcess(
        'cmd-one',
        [ '--flag' ],
        '/tmp/one',
        2000
      );
      const secondPromise = service.runProcess(
        'cmd-two',
        [ 'arg' ],
        '/tmp/two',
        2000
      );

      (firstProcess.stdout as Readable).emit('data', 'first-output');
      (secondProcess.stdout as Readable).emit('data', 'second-output');
      firstProcess.emit('close', 0);
      secondProcess.emit('close', 1);

      const [ firstResult, secondResult ] = await Promise.all([
        firstPromise,
        secondPromise
      ]);

      expect(firstResult).toEqual({
        exitCode: 0,
        stdout: 'first-output',
        stderr: '',
        timedOut: false
      });
      expect(secondResult).toEqual({
        exitCode: 1,
        stdout: 'second-output',
        stderr: '',
        timedOut: false
      });
      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockSpawn).toHaveBeenNthCalledWith(
        1,
        'sh',
        [ '-c', 'cmd-one --flag' ],
        expect.objectContaining({ cwd: '/tmp/one' })
      );
      expect(mockSpawn).toHaveBeenNthCalledWith(
        2,
        'sh',
        [ '-c', 'cmd-two arg' ],
        expect.objectContaining({ cwd: '/tmp/two' })
      );
    }
  );

  it('should log spawn details when debug flag is enabled', async () => {
    const mockProcess = createMockChildProcess();
    mockSpawn.mockReturnValue(mockProcess);

    const originalDebug = process.env.PROCESS_RUNNER_DEBUG;
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);

    process.env.PROCESS_RUNNER_DEBUG = 'true';

    try {
      const runPromise = service.runProcess(
        'echo',
        [],
        '/tmp/debug',
        5000
      );

      mockProcess.emit('close', 0);
      await runPromise;

      expect(logSpy).toHaveBeenCalledWith(
        '[ProcessRunner] spawn command="echo" cwd="/tmp/debug"'
      );
    } finally {
      process.env.PROCESS_RUNNER_DEBUG = originalDebug;
      logSpy.mockRestore();
    }
  });

  it('should skip stdin closing when a stream is not provided', async () => {
    const mockProcess = createMockChildProcess({ includeStdin: false });
    mockSpawn.mockReturnValue(mockProcess);

    const runPromise = service.runProcess(
      'echo',
      [],
      '/tmp/no-stdin',
      5000
    );

    mockProcess.emit('close', 0);
    const result = await runPromise;

    expect(result.exitCode).toBe(0);
    expect(mockProcess.stdin).toBeNull();
    expect(mockProcess.stdinEndSpy).toBeUndefined();
  });

  it('should tolerate processes without stdout or stderr streams', async () => {
    const mockProcess = createMockChildProcess({
      includeStdout: false,
      includeStderr: false
    });
    mockSpawn.mockReturnValue(mockProcess);

    const runPromise = service.runProcess(
      'echo',
      [],
      '/tmp/no-stdio',
      5000
    );

    mockProcess.emit('close', 0);
    const result = await runPromise;

    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it(
    'should not attempt to send signals when the child lacks a pid',
    async () => {
      jest.useFakeTimers();
      const mockProcess = createMockChildProcess({
        hasPid: false
      });
      mockSpawn.mockReturnValue(mockProcess);

      const runPromise = service.runProcess(
        'sleep',
        [],
        '/tmp/no-pid',
        1000
      );

      jest.advanceTimersByTime(1000);
      await runPromise;

      expect(mockProcess.kill).not.toHaveBeenCalled();
    }
  );
});
