import { Injectable } from '@nestjs/common';

@Injectable()
export class TemplateRendererService {
  render(
    _templateContent: string,
    _context: Record<string, unknown>
  ): string[] {
    // TODO: Implement template rendering (EJS/Eta-like syntax)
    // Returns array of args for spawn (without engineCommand)
    return [];
  }
}

