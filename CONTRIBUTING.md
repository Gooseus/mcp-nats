# Contributing to mcp-nats

Thank you for your interest in contributing to the NATS MCP server!

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) runtime (latest version)
- [Docker](https://www.docker.com/) for running tests
- A NATS server with JetStream enabled (Docker Compose provided)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/Gooseus/mcp-nats.git
cd mcp-nats

# Install dependencies
bun install

# Start the development server
bun run dev
```

## Running Tests

Tests require a NATS server with JetStream. We provide a Docker Compose setup:

```bash
# Start NATS server
bun run test:up

# Run tests
bun test

# Run tests in watch mode
bun run test:watch

# Stop NATS server
bun run test:down

# Or run everything at once
bun run test:ci
```

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automated versioning and changelog generation.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description | Version Bump |
|------|-------------|--------------|
| `feat` | New features | Minor |
| `fix` | Bug fixes | Patch |
| `docs` | Documentation only | None |
| `style` | Code style (formatting, etc.) | None |
| `refactor` | Code changes without behavior change | None |
| `perf` | Performance improvements | Patch |
| `test` | Adding or updating tests | None |
| `chore` | Maintenance tasks | None |

### Breaking Changes

For breaking changes, add `!` after the type or include `BREAKING CHANGE:` in the footer:

```
feat!: remove deprecated API endpoint

BREAKING CHANGE: The /v1/old endpoint has been removed.
```

### Examples

```bash
feat: add nats_stream_create tool
fix: handle connection timeout gracefully
docs: update README with new examples
refactor: simplify consumer creation logic
test: add tests for KV watch functionality
```

## Pull Request Process

1. **Fork** the repository and create a feature branch from `main`
2. **Make changes** following the coding style of the project
3. **Write tests** for new functionality
4. **Use conventional commits** for your commit messages
5. **Ensure tests pass** locally before pushing
6. **Submit a PR** against the `main` branch

### PR Guidelines

- Keep PRs focused on a single feature or fix
- Update documentation if needed
- Add tests for new functionality
- Ensure all tests pass in CI

## Code Style

- TypeScript with strict mode enabled
- Use Zod schemas for input validation
- Follow existing patterns for tool/resource registration
- Keep error messages helpful and actionable

## Questions?

- Open an [issue](https://github.com/Gooseus/mcp-nats/issues) for bugs or feature requests
- Start a [discussion](https://github.com/Gooseus/mcp-nats/discussions) for questions
