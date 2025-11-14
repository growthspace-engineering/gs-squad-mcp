import { Test, TestingModule } from '@nestjs/testing';
import { ProcessRunnerService } from './process-runner.service';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm } from 'fs/promises';

describe('ProcessRunnerService', () => {
  let service: ProcessRunnerService;
  let testCwd: string;

  beforeEach(async () => {
    testCwd = join(tmpdir(), `test-process-${Date.now()}`);
    await mkdir(testCwd, { recursive: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [ ProcessRunnerService ]
    }).compile();

    service = module.get<ProcessRunnerService>(ProcessRunnerService);
  });

  afterEach(async () => {
    try {
      await rm(testCwd, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('successful command returns exitCode 0', async () => {
    const command = process.platform === 'win32' ? 'cmd' : 'sh';
    const args =
      process.platform === 'win32'
        ? [ '/c', 'echo test && exit 0' ]
        : [ '-c', 'echo test' ];

    const result = await service.runProcess(command, args, testCwd, 5000);

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toContain('test');
    expect(result.stderr).toBe('');
  });

  it('failing command returns non-zero exitCode', async () => {
    const command = process.platform === 'win32' ? 'cmd' : 'sh';
    const args =
      process.platform === 'win32'
        ? [ '/c', 'exit 1' ]
        : [ '-c', 'exit 1' ];

    const result = await service.runProcess(command, args, testCwd, 5000);

    expect(result.exitCode).not.toBe(0);
    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
  });

  it('long-running command times out', async () => {
    const command = process.platform === 'win32' ? 'cmd' : 'sh';
    const args =
      process.platform === 'win32'
        ? [ '/c', 'timeout /t 10 /nobreak' ]
        : [ '-c', 'sleep 10' ];

    const result = await service.runProcess(command, args, testCwd, 500);

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  }, 10000);

  it('should capture stdout correctly', async () => {
    const command = process.platform === 'win32' ? 'cmd' : 'sh';
    const args =
      process.platform === 'win32'
        ? [ '/c', 'echo "output line 1" && echo "output line 2"' ]
        : [ '-c', 'echo "output line 1"; echo "output line 2"' ];

    const result = await service.runProcess(command, args, testCwd, 5000);

    expect(result.stdout).toContain('output line 1');
    expect(result.stdout).toContain('output line 2');
  });

  it('should capture stderr correctly', async () => {
    const command = process.platform === 'win32' ? 'cmd' : 'sh';
    const args =
      process.platform === 'win32'
        ? [ '/c', 'echo error >&2' ]
        : [ '-c', 'echo error >&2' ];

    const result = await service.runProcess(command, args, testCwd, 5000);

    expect(result.stderr).toContain('error');
  });

  it('should use correct cwd', async () => {
    const command = process.platform === 'win32' ? 'cmd' : 'sh';
    const args =
      process.platform === 'win32'
        ? [ '/c', 'cd' ]
        : [ '-c', 'pwd' ];

    const result = await service.runProcess(command, args, testCwd, 5000);

    expect(result.stdout).toContain(testCwd);
  });

  it('should handle process spawn errors', async () => {
    const result = await service.runProcess(
      'nonexistent-command-that-does-not-exist',
      [],
      testCwd,
      5000
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.timedOut).toBe(false);
  });
});
