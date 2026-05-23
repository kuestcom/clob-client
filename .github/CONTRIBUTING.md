# Contribution Guide

Contributions to `@kuestcom/clob-client` are welcome. This document outlines the basic workflow for local development and pull requests.

## Getting Started

1. Fork `kuestcom/clob-client`.
2. Clone your fork.
3. Use Node.js 24 when possible. The package supports Node.js `>=22.22.1`, and CI runs on Node.js 24.
4. Enable Corepack if needed, then install dependencies with pnpm:

```sh
corepack enable
pnpm install --frozen-lockfile
```

Open pull requests against the `main` branch and fill out the PR template.

## Local Checks

Before submitting a PR for review, run the same checks used by CI:

```sh
pnpm lint
pnpm build
pnpm test
```

You can also run the combined script:

```sh
pnpm ci
```

## Branch Structure & Naming

The `main` branch represents the current development state of the codebase. All pull requests should target `main`.

Use clear branch names and follow the [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) style for PR titles and commit subjects, such as `fix:`, `feat:`, `docs:`, `test:`, `refactor:`, and `chore:`.

## Change Guidelines

- Keep PRs focused on one feature, bugfix, or maintenance change.
- Add or update tests for behavior changes whenever feasible.
- Update `README.md`, examples, and TypeScript types when public SDK behavior changes.
- Commit `pnpm-lock.yaml` when dependencies change.
- Do not include secrets, private keys, or real API credentials in examples, tests, logs, or PR descriptions.
- Review your own diff before requesting review.
