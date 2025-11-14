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
      // With shell: true, pass the full command as a single string
      // If args are provided, join them; otherwise use command as-is
      const shellCommand = args.length > 0
        ? `${command} ${args.join(' ')}`
        : command;

      // Explicitly wrap in sh -c to ensure shell interpretation
      // This ensures pipes and other shell operators are properly interpreted
      const process: ChildProcess = spawn('sh', [ '-c', shellCommand ], {
        cwd,
        // We're explicitly invoking sh, so no need for shell: true
        shell: false,
        detached: false
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
        // Kill the process group to ensure all children are terminated
        try {
          if (process.pid) {
            process.kill('SIGTERM');
            // Give it a moment, then force kill
            setTimeout(() => {
              if (!process.killed) {
                process.kill('SIGKILL');
              }
            }, 1000);
          }
        } catch {
          // Ignore kill errors
        }
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

