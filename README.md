# @openclaw/skill-core

`@openclaw/skill-core` is the extracted minimal agent runtime for script-oriented
skills.

## Scope

This package owns:

- skill discovery from workspace `SKILL.md`
- skill command parsing and dispatch
- the six core tools: `read`, `write`, `edit`, `apply_patch`, `exec`, `process`
- minimal agent loop and an OpenAI-compatible provider path
- package-local verification gates

This package does not own:

- gateway and channel integrations
- plugin runtime
- UI or app layers
- non-core host messaging surfaces

## Public Surface

The package exports its public API from `dist/index.js` and `dist/index.d.ts`.
Main-repo consumers should import `@openclaw/skill-core` and should not import
package source files directly.

## Versioning Boundary

The intended compatibility boundary is:

- semver-major: breaking changes to public exports, tool contracts, runtime
  contracts, or persisted package-owned message shapes
- semver-minor: backward-compatible API additions and new optional behaviors
- semver-patch: fixes, internal refactors, and test-only changes

The package remains `private` while the monorepo integration and release process
are being finalized.

## Verification

Run the package-local release gate with:

```sh
pnpm verify
pnpm pack:dry-run
```

## External Consumption

The package can be validated from a packaged tarball without any OpenClaw
adapter or source-path aliases.

Minimal flow:

```sh
cd packages/skill-core
pnpm release:check

mkdir -p /tmp/skill-core-external-consumer
cd /tmp/skill-core-external-consumer
corepack pnpm add /path/to/openclaw-skill-core-0.1.0.tgz
node --input-type=module -e "import { createStandaloneSkillCoreRuntime } from '@openclaw/skill-core'; console.log(typeof createStandaloneSkillCoreRuntime)"
```

For the full host-free validation sequence, see [validate-log.md](./validate-log.md).
