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
      const childProcess: ChildProcess = spawn(
        'sh',
        [ '-c', shellCommand ],
        {
        cwd,
        // We're explicitly invoking sh, so no need for shell: true
        shell: false,
        detached: false
        }
      );

      if (process.env.PROCESS_RUNNER_DEBUG === 'true') {
        // eslint-disable-next-line no-console
        console.log(
          `[ProcessRunner] spawn command="${shellCommand}" cwd="${cwd}"`
        );
      }

      // Close stdin so commands expecting EOF when run without a TTY
      // (like cursor-agent in non-interactive mode) can exit gracefully.
      if (childProcess.stdin) {
        childProcess.stdin.end();
      }

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      if (childProcess.stdout) {
        childProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }

      if (childProcess.stderr) {
        childProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      const timeout = setTimeout(() => {
        timedOut = true;
        // Kill the process group to ensure all children are terminated
        try {
          if (childProcess.pid) {
            childProcess.kill('SIGTERM');
            // Give it a moment, then force kill
            setTimeout(() => {
              if (!childProcess.killed) {
                childProcess.kill('SIGKILL');
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

      childProcess.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          exitCode: code,
          stdout,
          stderr,
          timedOut
        });
      });

      childProcess.on('error', () => {
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

