import { Injectable } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';

export interface IProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

@Injectable()
export class ProcessRunnerService {
  async runProcess(
    command: string,
    args: string[],
    cwd: string,
    timeoutMs: number
  ): Promise<IProcessResult> {
    return new Promise((resolve) => {
      const process: ChildProcess = spawn(command, args, {
        cwd,
        shell: false
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      if (process.stdout) {
        process.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }

      if (process.stderr) {
        process.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      const timeout = setTimeout(() => {
        timedOut = true;
        process.kill('SIGTERM');
        resolve({
          exitCode: null,
          stdout,
          stderr,
          timedOut: true
        });
      }, timeoutMs);

      process.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          exitCode: code,
          stdout,
          stderr,
          timedOut
        });
      });

      process.on('error', () => {
        clearTimeout(timeout);
        resolve({
          exitCode: null,
          stdout,
          stderr,
          timedOut
        });
      });
    });
  }
}

