import { Injectable } from '@nestjs/common';

export interface IProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

@Injectable()
export class ProcessRunnerService {
  async runProcess(
    _command: string,
    _args: string[],
    _cwd: string,
    _timeoutMs: number
  ): Promise<IProcessResult> {
    // TODO: Implement process spawning with timeout
    return {
      exitCode: null,
      stdout: '',
      stderr: '',
      timedOut: false
    };
  }
}

