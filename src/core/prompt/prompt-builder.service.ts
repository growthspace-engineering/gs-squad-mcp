import { Injectable } from '@nestjs/common';
import { IRoleDefinition } from '../roles/role-definition.interface';

@Injectable()
export class PromptBuilderService {
  buildPromptStateless(
    _role: IRoleDefinition,
    _task: string
  ): string {
    // TODO: Implement stateless prompt construction
    return '';
  }

  buildPromptStatefulNewChat(
    _role: IRoleDefinition,
    _task: string
  ): string {
    // TODO: Implement stateful new chat prompt construction
    return '';
  }

  buildPromptStatefulExistingChat(_task: string): string {
    // TODO: Implement stateful existing chat prompt construction
    return '';
  }
}

