<!-- 5c90159a-25d8-4b9c-b2f1-281d7b4bea07 b1f6fa0d-47df-4b77-994c-53171dcdaf50 -->
# Engine Selection and Template System Refactor

## Overview

Replace the `ENGINE_COMMAND` configuration with an `--engine` flag/env var system that accepts `cursor-agent`, `claude`, or `codex`. Each engine will have a default template (run-cursor-agent.template, run-claude.template, run-codex.template), and users can override with custom templates (requiring explicit sequential/parallel control via CLI flag or env var).

## Changes Required

### 1. Configuration Interface & Service

- **File**: `src/core/config/squad-config.interface.ts`
- Remove `engineCommand: string`
- Add `engine: 'cursor-agent' | 'claude' | 'codex'`
- Add `executionMode?: 'sequential' | 'parallel'` (optional, only used when custom template provided)
- Keep `runTemplatePath` (can be user-provided or auto-selected based on engine)

- **File**: `src/core/config/squad-config.service.ts`
- Parse `--engine` CLI flag (via nest-commander) or `ENGINE` env var
- Validate engine value is one of: `cursor-agent`, `claude`, `codex`
- Parse `--execution-mode` or `--sequential` CLI flag or `EXECUTION_MODE` env var
- If `RUN_TEMPLATE_PATH` is provided, require `EXECUTION_MODE`/`--execution-mode` (throw error if missing)
- If `RUN_TEMPLATE_PATH` is not provided, auto-select template based on engine:
  - `cursor-agent` → `templates/run-cursor-agent.template`
  - `claude` → `templates/run-claude.template`
  - `codex` → `templates/run-codex.template`
- Remove `ENGINE_COMMAND` env var handling

### 2. CLI Command Updates

- **File**: `src/cli/mcp-cli.command.ts`
- Add `@Option` decorator for `--engine` flag
- Add `@Option` decorator for `--execution-mode` flag (optional, required when custom template provided)
- Pass options to config service constructor or update config after parsing

- **File**: `src/cli/main-stdio.ts`
- Parse CLI arguments before creating NestJS context
- Pass parsed arguments to config service (may need to refactor config service to accept options)

### 3. Squad Service Updates

- **File**: `src/core/mcp/squad.service.ts`
- Replace `requiresSerialExecution(config.engineCommand)` with logic that:
  - If `config.executionMode` is set, use that
  - Otherwise, determine from engine: `cursor-agent` → sequential, others → parallel
- Update all references from `config.engineCommand` to `config.engine`

### 4. Default Templates

- **Files**: Create three new template files in `templates/`:
- `run-cursor-agent.template` (copy current `run-agent.template`)
- `run-claude.template` (new, needs content)
- `run-codex.template` (new, needs content)

### 5. Tests & Documentation

- **File**: `src/core/config/squad-config.service.spec.ts`
- Update tests to use `ENGINE` instead of `ENGINE_COMMAND`
- Add tests for template auto-selection based on engine
- Add tests for execution mode requirement when custom template provided

- **File**: `README.md`
- Update configuration section to show `ENGINE` instead of `ENGINE_COMMAND`
- Document engine options and default template behavior
- Document `EXECUTION_MODE` requirement for custom templates

- **File**: `src/core/mcp/squad.service.spec.ts`
- Update mocks to use `engine` instead of `engineCommand`

## Implementation Notes

- The config service may need to be refactored to accept CLI options, or we parse CLI args in `main-stdio.ts` and set env vars before creating the NestJS context
- Default sequential/parallel behavior: `cursor-agent` → sequential, `claude`/`codex` → parallel (unless overridden)
- When custom template is provided without execution mode, throw error requiring the flag/env var
- Execution mode can be `sequential` or `parallel` (or boolean flag `--sequential` that sets it to sequential)
- Template naming: `run-cursor-agent.template`, `run-claude.template`, `run-codex.template`

### To-dos

- [ ] Update ISquadConfig interface: replace engineCommand with engine, add executionMode
- [ ] Refactor SquadConfigService to parse --engine flag/env var, auto-select templates, handle execution mode
- [ ] Add @Option decorators to McpCliCommand for --engine and --execution-mode flags
- [ ] Update SquadService to use config.engine and config.executionMode instead of engineCommand
- [ ] Create run-agent-claude.template and run-agent-codex.template files
- [ ] Update all tests to use new engine/executionMode config structure
- [ ] Update README.md and other docs to reflect ENGINE instead of ENGINE_COMMAND