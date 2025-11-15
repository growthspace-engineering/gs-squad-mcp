import { Test, TestingModule } from '@nestjs/testing';
import { PromptBuilderService } from './prompt-builder.service';
import { IRoleDefinition } from '@gs-squad-mcp/core/roles';

describe('PromptBuilderService', () => {
  let service: PromptBuilderService;
  const getFooter = (): string => (
    service as unknown as { setupReportingFooter: string }
  ).setupReportingFooter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ PromptBuilderService ]
    }).compile();

    service = module.get<PromptBuilderService>(PromptBuilderService);
  });

  describe('buildPromptStateless', () => {
    it('should contain role body, task, and footer', () => {
      const role: IRoleDefinition = {
        id: 'test-role',
        name: 'Test Role',
        description: 'Test description',
        body: 'You are a test role.\nDo your best.'
      };
      const task = 'Complete this task';

      const prompt = service.buildPromptStateless(role, task);

      expect(prompt).toContain('# Role');
      expect(prompt).toContain(role.body);
      expect(prompt).toContain('# Task');
      expect(prompt).toContain(task);
      expect(prompt).toContain('# Setup & Reporting Rules');
      expect(prompt).toContain('SETUP / ENVIRONMENT ISSUES');
    });

    it('should format prompt correctly with separators', () => {
      const role: IRoleDefinition = {
        id: 'frontend',
        name: 'Frontend Developer',
        description: 'Frontend specialist',
        body: 'Build UI components'
      };
      const task = 'Create a button component';

      const prompt = service.buildPromptStateless(role, task);

      const lines = prompt.split('\n');
      expect(lines[0]).toBe('# Role');
      expect(lines[2]).toBe('Build UI components');
      expect(prompt).toContain('---');
      expect(prompt.indexOf('# Task')).toBeGreaterThan(
        prompt.indexOf('# Role')
      );
    });
  });

  describe('buildPromptStatefulNewChat', () => {
    it('should contain role body, initial task, and footer', () => {
      const role: IRoleDefinition = {
        id: 'backend',
        name: 'Backend Developer',
        description: 'Backend specialist',
        body: 'Build APIs'
      };
      const task = 'Create user endpoint';

      const prompt = service.buildPromptStatefulNewChat(role, task);

      expect(prompt).toContain('# Role');
      expect(prompt).toContain(role.body);
      expect(prompt).toContain('# Initial Task');
      expect(prompt).toContain(task);
      expect(prompt).toContain('# Setup & Reporting Rules');
      expect(prompt).not.toContain('# Task');
    });

    it('should use "Initial Task" instead of "Task"', () => {
      const role: IRoleDefinition = {
        id: 'qa',
        name: 'QA Engineer',
        description: 'QA specialist',
        body: 'Test software'
      };
      const task = 'Write test cases';

      const prompt = service.buildPromptStatefulNewChat(role, task);

      expect(prompt).toContain('# Initial Task');
      expect(prompt).not.toContain('# Task');
    });
  });

  describe('edge cases and formatting', () => {
    it(
      'should keep formatting separators even with surrounding whitespace',
      () => {
        const role: IRoleDefinition = {
          id: 'format',
          name: 'Formatting Role',
          description: 'Ensures formatting',
          body: 'Line one   \n\nLine two with spaces  '
        };
        const task = '   Task line  \nAnother line   ';

        const prompt = service.buildPromptStateless(role, task);
        const expectedPrefix = `# Role\n\n${role.body}\n\n---\n\n# Task\n\n`;

        expect(prompt.startsWith(expectedPrefix)).toBe(true);
        expect(prompt).toContain(role.body);
        expect(prompt).toContain(task);
      }
    );

    it('should preserve special characters in role body and task', () => {
      const role: IRoleDefinition = {
        id: 'special',
        name: 'Specialist',
        description: 'Handles special characters',
        body: 'Special chars ~!@#$%^&*()_+[]{}|;:\'",.<>/?'
      };
      const task = 'Task needs to keep symbols ~!@#$%^&*()_+[]{}|;:\'",.<>/?';

      const prompt = service.buildPromptStateless(role, task);

      expect(prompt).toContain(role.body);
      expect(prompt).toContain(task);
    });

    it('should handle empty role body and task inputs', () => {
      const emptyRole: IRoleDefinition = {
        id: 'empty',
        name: 'Empty Role',
        description: 'No body',
        body: ''
      };
      const emptyTask = '';

      const statelessPrompt = service.buildPromptStateless(
        emptyRole,
        emptyTask
      );
      expect(statelessPrompt).toContain('# Role');
      expect(statelessPrompt).toContain('# Task');
      expect(statelessPrompt).toContain('\n\n---\n\n');

      const newChatPrompt = service.buildPromptStatefulNewChat(
        emptyRole,
        emptyTask
      );
      expect(newChatPrompt).toContain('# Initial Task');
      expect(newChatPrompt.split('# Initial Task').length).toBe(2);

      const existingPrompt =
        service.buildPromptStatefulExistingChat(emptyTask);
      expect(existingPrompt.startsWith('# Task')).toBe(true);
    });

    it(
      'should include very long role and task values without truncation',
      () => {
        const longBody = 'Role detail '.repeat(500);
        const longTask = 'Task detail '.repeat(600);
        const role: IRoleDefinition = {
          id: 'long',
          name: 'Long Role',
          description: 'Handles long text',
          body: longBody
        };

        const prompt = service.buildPromptStateless(role, longTask);

        expect(prompt).toContain(longBody);
        expect(prompt).toContain(longTask);
        expect(prompt.length)
          .toBeGreaterThan(longBody.length + longTask.length);
      }
    );

    it(
      'should preserve explicit newlines within tasks for existing chats',
      () => {
        const task = 'Line 1\n- bullet\n\nLine 3';

        const prompt = service.buildPromptStatefulExistingChat(task);
        const footer = getFooter();

        expect(prompt).toBe(`# Task\n\n${task}\n\n${footer}`);
      });
    }
  );

  describe('buildPromptStatefulExistingChat', () => {
    it('should contain task only and footer', () => {
      const task = 'Update the previous implementation';

      const prompt = service.buildPromptStatefulExistingChat(task);

      expect(prompt).toContain('# Task');
      expect(prompt).toContain(task);
      expect(prompt).toContain('# Setup & Reporting Rules');
      expect(prompt).not.toContain('# Role');
      expect(prompt).not.toContain('# Initial Task');
    });

    it('should not include role information', () => {
      const task = 'Fix the bug';

      const prompt = service.buildPromptStatefulExistingChat(task);

      expect(prompt).not.toContain('# Role');
      expect(prompt).not.toContain('# Initial Task');
      expect(prompt.indexOf('# Task')).toBe(0);
    });
  });

  describe('setupReportingFooter', () => {
    it('should append footer to all prompt types', () => {
      const role: IRoleDefinition = {
        id: 'architect',
        name: 'Architect',
        description: 'System architect',
        body: 'Design systems'
      };
      const task = 'Design the architecture';

      const statelessPrompt = service.buildPromptStateless(role, task);
      const newChatPrompt = service.buildPromptStatefulNewChat(role, task);
      const existingChatPrompt =
        service.buildPromptStatefulExistingChat(task);

      const footerText = 'SETUP / ENVIRONMENT ISSUES';
      expect(statelessPrompt).toContain(footerText);
      expect(newChatPrompt).toContain(footerText);
      expect(existingChatPrompt).toContain(footerText);
    });

    it('should include instructions about reporting issues', () => {
      const task = 'Any task';
      const prompt = service.buildPromptStatefulExistingChat(task);

      expect(prompt).toContain('clearly report them');
      expect(prompt).toContain('suggest specific steps');
      expect(prompt).toContain('Do not pretend the task succeeded');
    });

    it(
      'should append identical footer text exactly once to every prompt',
      () => {
        const role: IRoleDefinition = {
          id: 'consistency',
          name: 'Consistency Role',
          description: 'Ensures footer consistency',
          body: 'Remain consistent'
        };
        const task = 'Check footer';
        const footer = getFooter();
        const footerPattern = new RegExp(
          footer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'g'
        );

        const prompts = [
          service.buildPromptStateless(role, task),
          service.buildPromptStatefulNewChat(role, task),
          service.buildPromptStatefulExistingChat(task)
        ];

        prompts.forEach((prompt) => {
          expect(prompt.endsWith(footer)).toBe(true);
          expect((prompt.match(footerPattern) ?? []).length).toBe(1);
        });
      }
    );
  });
});
