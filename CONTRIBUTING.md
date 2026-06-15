# Contributing to jsoncurrent

Thanks for your interest in contributing.

This guide covers how to propose changes, run checks locally, and submit high-quality pull requests.

## Ways to contribute

- Report bugs and edge cases
- Propose API and documentation improvements
- Improve tests and implementation details
- Help with examples and DX improvements

## Ground rules

- Be respectful and constructive in all discussions
- Keep PRs focused and small when possible
- Include tests for behavior changes
- Keep public API changes deliberate and documented

## Prerequisites

- Node.js 18+
- pnpm 8+

Install dependencies:

```bash
pnpm install
```

## Development workflow

Run in watch mode while developing:

```bash
pnpm dev
```

Build package output:

```bash
pnpm build
```

Run tests:

```bash
pnpm test
```

Run tests with coverage:

```bash
pnpm test:coverage
```

Run type checking:

```bash
pnpm typecheck
```

Optional formatting/lint check with Biome:

```bash
pnpm exec biome check .
```

## Tests and quality expectations

Before opening a PR, run at least:

```bash
pnpm test && pnpm test:coverage && pnpm typecheck && pnpm build
```

If you change behavior, add or update tests in `src/__tests__`.

## Commit and pull request guidelines

### Commit messages

Use clear, imperative commit titles.

Examples:

- `fix: handle append on missing path`
- `feat: add path completion event coverage`
- `docs: clarify middleware fan-out behavior`

### Pull requests

Include the following in your PR description:

- What changed
- Why it changed
- Any API or behavior impact
- How it was tested

Link related issues when applicable.

## Versioning and releases

This project uses Changesets.

For user-facing changes, add a changeset:

```bash
pnpm changeset
```

When maintainers cut a release, versioning can be applied with:

```bash
pnpm version-packages
```

Publishing is done by maintainers.

## Reporting security issues

Do not open public issues for security vulnerabilities.

Instead, contact the maintainers privately through the repository owner channels.

## Questions

If anything is unclear, open a discussion or issue with context and a minimal reproducible example.
