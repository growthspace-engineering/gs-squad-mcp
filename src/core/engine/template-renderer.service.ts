import { Injectable } from '@nestjs/common';
import { render } from 'ejs';

@Injectable()
export class TemplateRendererService {
  render(
    templateContent: string,
    context: Record<string, unknown>
  ): string[] {
    try {
      const rendered = render(templateContent, context);
      return this.splitIntoArgs(rendered);
    } catch (error) {
      throw new Error(
        `Template rendering failed: ${
          error instanceof Error ? error.message : String(error)
        }. Template: ${templateContent.substring(0, 100)}...`
      );
    }
  }

  private splitIntoArgs(rendered: string): string[] {
    const args: string[] = [];
    let currentArg = '';
    let inQuotes = false;
    let quoteChar = '';
    let i = 0;

    while (i < rendered.length) {
      const char = rendered[i];
      const isWhitespace = /\s/.test(char);

      if (!inQuotes && isWhitespace) {
        if (currentArg.trim()) {
          args.push(currentArg.trim());
          currentArg = '';
        }
      } else if (!inQuotes && (char === '"' || char === '\'')) {
        inQuotes = true;
        quoteChar = char;
      } else if (inQuotes && char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
        // Don't include the closing quote in the arg
      } else {
        currentArg += char;
      }

      i++;
    }

    if (currentArg.trim()) {
      args.push(currentArg.trim());
    }

    return args
      .filter((arg) => arg.length > 0)
      .map((arg) => {
        // Remove surrounding quotes if present
        if (
          (arg.startsWith('"') && arg.endsWith('"')) ||
          (arg.startsWith('\'') && arg.endsWith('\''))
        ) {
          return arg.slice(1, -1);
        }
        return arg;
      });
  }
}

