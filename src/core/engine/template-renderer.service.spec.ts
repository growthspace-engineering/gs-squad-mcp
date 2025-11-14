import { Test, TestingModule } from '@nestjs/testing';
import { TemplateRendererService } from './template-renderer.service';

describe('TemplateRendererService', () => {
  let service: TemplateRendererService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ TemplateRendererService ]
    }).compile();

    service = module.get<TemplateRendererService>(
      TemplateRendererService
    ); // eslint-disable-line max-len
  });

  describe('render', () => {
    it('should handle template without chatId', () => {
      const template =
        '--approve-mcps --model composer-1 agent "<%= prompt %>"';
      const context = {
        prompt: 'Test prompt',
        cwd: '/workspace',
        roleId: 'frontend-developer',
        task: 'Build UI'
      };

      const args = service.render(template, context);

      expect(args).toContain('--approve-mcps');
      expect(args).toContain('--model');
      expect(args).toContain('composer-1');
      expect(args).toContain('agent');
      expect(args).toContain('Test prompt');
      expect(args).not.toContain('--resume');
    });

    it('should handle template with chatId', () => {
      const template =
        '--approve-mcps --model composer-1 ' +
        '<% if (chatId) { %> --resume <%= chatId %> <% } %> ' +
        'agent "<%= prompt %>"';
      const context = {
        prompt: 'Continue task',
        chatId: 'chat-123',
        cwd: '/workspace',
        roleId: 'backend-developer',
        task: 'Update API'
      };

      const args = service.render(template, context);

      expect(args).toContain('--resume');
      expect(args).toContain('chat-123');
      expect(args).toContain('Continue task');
    });

    it('should trim and split args correctly', () => {
      const template = 'arg1   arg2  "quoted arg"  arg3';
      const context = {};

      const args = service.render(template, context);

      expect(args).toEqual([ 'arg1', 'arg2', 'quoted arg', 'arg3' ]);
    });

    it('should handle single quotes in template', () => {
      const template = 'arg1 \'single quoted\' arg2';
      const context = {};

      const args = service.render(template, context);

      expect(args).toEqual([ 'arg1', 'single quoted', 'arg2' ]);
    });

    it('should handle complex template with multiple variables', () => {
      const template =
        '--cwd <%= cwd %> --role <%= roleId %> ' +
        '--task "<%= task %>" --prompt "<%= prompt %>"';
      const context = {
        cwd: '/workspace/client',
        roleId: 'frontend-developer',
        task: 'Build component',
        prompt: 'Full prompt text'
      };

      const args = service.render(template, context);

      expect(args).toContain('--cwd');
      expect(args).toContain('/workspace/client');
      expect(args).toContain('--role');
      expect(args).toContain('frontend-developer');
      expect(args).toContain('--task');
      expect(args).toContain('Build component');
      expect(args).toContain('--prompt');
      expect(args).toContain('Full prompt text');
    });

    it('should filter out empty args', () => {
      const template = 'arg1    arg2';
      const context = {};

      const args = service.render(template, context);

      expect(args).toEqual([ 'arg1', 'arg2' ]);
      expect(args.every((arg) => arg.length > 0)).toBe(true);
    });
  });
});
