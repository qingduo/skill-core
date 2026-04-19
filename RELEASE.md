# Release Boundary

This document records the current release boundary for `@openclaw/skill-core`.

## Current State

- The package builds and verifies independently as a standalone repository.
- The package is still marked `private`, so release readiness does not yet imply
  public publishability.
- Consumers should import `@openclaw/skill-core` from built package artifacts.

## Release Gate

Before any versioned release candidate, run:

```sh
pnpm release:check
```

This gate currently requires:

- package build
- package typecheck
- forbidden-import boundary check
- package unit tests
- host-free package e2e
- pack dry run

## Compatibility Statement

The package release boundary covers:

- exported package APIs
- the six core tool contracts
- package-owned session message conversion shapes
- standalone and host-backed runtime assemblers

The release boundary does not promise stability for:

- internal helper filenames
- test-only helpers
- temporary monorepo compatibility shells outside `packages/skill-core`

## Publish Readiness Gap

Before dropping `private: true`, confirm:

1. the package can be consumed from a fresh clone without source-path aliases
2. CI runs `pnpm release:check`
3. versioning policy and changelog flow are agreed
4. host-free verification remains green outside the main repo runtime
