# Contributing to Gs Squad MCP

Thank you for your interest in contributing to Gs Squad MCP! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 18+
- npm
- Git

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/growthspace-engineering/gs-squad-mcp.git
cd gs-squad-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

### Development Workflow

```bash
# Start development mode (watches for changes)
npm run start:dev

# Run tests
npm test

# Run E2E tests
npm run test:e2e

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

## Code Style

### TypeScript Conventions

- **File names**: kebab-case + type suffix (e.g., `squad.service.ts`, `role-repository.service.ts`)
- **Class names**: PascalCase
- **Interface names**: `I` + PascalCase (e.g., `IRoleDefinition`)
- **Variables**: Descriptive names, no single-letter or cryptic abbreviations
- **Comments**: Code is its own documentation; only comment genuinely non-obvious logic

### Import Organization

- Use path aliases for cleaner imports:
  - `@gs-squad-mcp/core/*` - Core services
  - `@gs-squad-mcp/nest` - NestJS module
  - `@gs-squad-mcp/cli` - CLI entry point
- NestJS entry points (`app.module.ts`, `main-stdio.ts`, `mcp-cli.command.ts`) use relative imports for runtime compatibility

### Example

```typescript
// Good
import { SquadService } from '@gs-squad-mcp/core/mcp';
import { IRoleDefinition } from '@gs-squad-mcp/core/roles';

// NestJS entry points use relative imports
import { AppModule } from '../nest/app.module';
```

## Commit Conventions

We follow [Angular's Conventional Commits](https://www.conventionalcommits.org/) specification with **mandatory scope**.

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependency updates
- `ci`: CI/CD changes

### Scope

**Scope is mandatory** and should be lowercase. Examples:

- `core`: Core functionality
- `roles`: Role definitions
- `config`: Configuration
- `test`: Testing
- `ci`: CI/CD
- `docs`: Documentation
- `blueprint`: Implementation blueprint updates

### Examples

```bash
# Good
feat(roles): add academic-researcher role from adk-samples
fix(core): handle missing chatId in stateful mode
docs(readme): add installation instructions
chore(deps): update nestjs to latest version

# Bad (missing scope)
feat: add new role
fix: bug fix
```

### Interactive Commit

Use the provided commit script for guided commit messages:

```bash
npm run commit
```

This uses Commitizen to help craft properly formatted commit messages.

## Testing

### Unit Tests

- Located in `*.spec.ts` files alongside source files
- Run with: `npm test`
- Aim for high coverage of business logic
- Module files and barrel exports are excluded from coverage

### E2E Tests

- Located in `test/e2e/`
- Run with: `npm run test:e2e`
- Test full MCP workflow including stdio communication

### Writing Tests

```typescript
describe('SquadService', () => {
  it('should spawn agents in stateless mode', async () => {
    // Test implementation
  });
});
```

## Pull Request Process

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes** following the code style guidelines

3. **Write/update tests** for your changes

4. **Run tests and linting**:
   ```bash
   npm test
   npm run lint
   ```

5. **Commit your changes** using conventional commits:
   ```bash
   npm run commit
   ```

6. **Push to your fork** and create a Pull Request

7. **Ensure CI passes** - GitHub Actions will run:
   - Linting
   - Unit tests
   - E2E tests
   - Build verification

### PR Guidelines

- Keep PRs focused on a single feature or fix
- Update documentation if needed
- Ensure all tests pass
- Follow commit message conventions
- Request review from maintainers

## Adding New Roles

To add a new role definition:

1. **Create a markdown file** in `agents/` directory:
   ```bash
   agents/my-new-role.md
   ```

2. **Include frontmatter**:
   ```markdown
   ---
   name: my-new-role
   description: Description of what this role does
   ---
   
   You are a [role description]...
   ```

3. **Write the role prompt** in the body of the markdown file

4. **Test the role loads**:
   ```bash
   npm test -- --testPathPatterns=role-repository
   ```

5. **Commit**:
   ```bash
   git add agents/my-new-role.md
   npm run commit
   # Select: feat(roles): add my-new-role role
   ```

## Git Hooks

The project uses Husky for git hooks:

- **pre-commit**: Runs lint-staged (auto-fixes staged files) and tests
- **commit-msg**: Validates commit message format
- **pre-push**: Runs E2E tests

These hooks ensure code quality and commit message consistency.

## Project Structure

```
src/
├── core/                    # Framework-agnostic core
│   ├── config/             # Configuration service
│   ├── roles/               # Role repository
│   ├── prompt/             # Prompt building
│   ├── engine/              # Template rendering & process execution
│   └── mcp/                 # MCP contracts & squad service
│       └── contracts/       # MCP request/response types
├── nest/                    # NestJS module wiring
└── cli/                     # CLI entry point

test/
└── e2e/                    # E2E tests

agents/                     # Role definitions (markdown)
templates/                  # Command templates
```

## Release Process

Releases are automated using `semantic-release`:

- **Triggered by**: Push to `main` or `beta` branches
- **Versioning**: Based on conventional commits
- **Publishing**: To GitHub Packages (not npmjs.org)
- **Changelog**: Automatically generated from commits

No manual version bumping needed—just merge PRs with conventional commits!

## Questions?

- **Issues**: [GitHub Issues](https://github.com/growthspace-engineering/gs-squad-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/growthspace-engineering/gs-squad-mcp/discussions)

Thank you for contributing! 🎉

