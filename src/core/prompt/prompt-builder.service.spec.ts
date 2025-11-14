import { Test, TestingModule } from '@nestjs/testing';
import { PromptBuilderService } from './prompt-builder.service';
import { IRoleDefinition } from '@gs-squad-mcp/core/roles';

describe('PromptBuilderService', () => {
  let service: PromptBuilderService;

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
  });
});
