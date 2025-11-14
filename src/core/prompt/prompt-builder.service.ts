import { Injectable } from '@nestjs/common';
import { IRoleDefinition } from '../roles/role-definition.interface';

@Injectable()
export class PromptBuilderService {
  private readonly setupReportingFooter = `---

# Setup & Reporting Rules

If you notice any setup or environment problems that prevent you from ` +
    `completing your task,
you MUST clearly report them as SETUP / ENVIRONMENT ISSUES.

Explain what you observed and suggest specific steps for the human to fix.
Do not pretend the task succeeded if the environment blocks you.`;

  buildPromptStateless(
    role: IRoleDefinition,
    task: string
  ): string {
    return `# Role

${role.body}

---

# Task

${task}

${this.setupReportingFooter}`;
  }

  buildPromptStatefulNewChat(
    role: IRoleDefinition,
    task: string
  ): string {
    return `# Role

${role.body}

---

# Initial Task

${task}

${this.setupReportingFooter}`;
  }

  buildPromptStatefulExistingChat(task: string): string {
    return `# Task

${task}

${this.setupReportingFooter}`;
  }
}

